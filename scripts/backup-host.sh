#!/bin/bash
# Host-side orchestration for one verified backup set per site.

set -euo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CONTAINER_BACKUP_SCRIPT=${CONTAINER_BACKUP_SCRIPT:-$SCRIPT_DIR/backup.sh}
HOST_BACKUP_DIR=${HOST_BACKUP_DIR:-/opt/Sites/backups}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-28}
RUN_ID=${BACKUP_RUN_ID:-$(date -u +"%Y-%m-%d_%H-%M-%S")}
CONTAINER_STAGE_DIR=${CONTAINER_STAGE_DIR:-/tmp/blog-backup-staging}
DOCKER_BIN=${DOCKER_BIN:-docker}
BACKUP_SITES=${BACKUP_SITES:-"tta:tta-blog-prod ffg:ffg-blog-prod"}

log() {
    printf '[backup-host] %s\n' "$1"
}

error() {
    printf '[backup-host] ERROR: %s\n' "$1" >&2
}

case "$RUN_ID" in
    ''|*[!A-Za-z0-9._-]*)
        error "BACKUP_RUN_ID contains unsupported characters"
        exit 2
        ;;
esac

case "$RETENTION_DAYS" in
    ''|*[!0-9]*)
        error "BACKUP_RETENTION_DAYS must be a non-negative integer"
        exit 2
        ;;
esac

case "$CONTAINER_STAGE_DIR" in
    /tmp/*)
        stage_name=${CONTAINER_STAGE_DIR#/tmp/}
        ;;
    *)
        error "CONTAINER_STAGE_DIR must be a direct child of /tmp"
        exit 2
        ;;
esac

case "$stage_name" in
    ''|.|..|*[!A-Za-z0-9._-]*)
        error "CONTAINER_STAGE_DIR must be a direct child of /tmp"
        exit 2
        ;;
esac

if [ ! -r "$CONTAINER_BACKUP_SCRIPT" ]; then
    error "Container backup script is unavailable"
    exit 2
fi

site_count=0
for site_spec in $BACKUP_SITES; do
    site=${site_spec%%:*}
    container=${site_spec#*:}

    case "$site:$container" in
        *[!A-Za-z0-9._:-]*|:*|*:|*:*:*)
            error "Invalid BACKUP_SITES entry"
            exit 2
            ;;
    esac

    case "$site:$container" in
        .:*|..:*|*:.|*:..)
            error "BACKUP_SITES entries must not use dot path segments"
            exit 2
            ;;
    esac

    case "$site:$container" in
        [A-Za-z0-9]*:[A-Za-z0-9]*)
            ;;
        *)
            error "BACKUP_SITES names must start with an alphanumeric character"
            exit 2
            ;;
    esac

    site_count=$((site_count + 1))
done

if [ "$site_count" -eq 0 ]; then
    error "BACKUP_SITES must contain at least one site and container pair"
    exit 2
fi

case "$HOST_BACKUP_DIR" in
    /|*//*|*/../*|*/./*|*/..|*/.|*/)
        error "HOST_BACKUP_DIR must be an absolute, normalized, non-root path"
        exit 2
        ;;
    /*)
        ;;
    *)
        error "HOST_BACKUP_DIR must be an absolute path"
        exit 2
        ;;
esac

if ! mkdir -p "$HOST_BACKUP_DIR"; then
    error "Host backup root is unavailable"
    exit 2
fi

write_failure_marker() {
    site=$1
    summary=$2
    site_dir="$HOST_BACKUP_DIR/$site"
    marker="$site_dir/BACKUP_FAILURE"
    marker_temp="$site_dir/.BACKUP_FAILURE.tmp.$$"

    if [ ! -d "$site_dir" ]; then
        error "Could not write a backup failure marker because the site backup directory is unavailable for $site"
        return 1
    fi

    if ! {
        printf 'status=failed\n'
        printf 'site=%s\n' "$site"
        printf 'run_id=%s\n' "$RUN_ID"
        printf 'failed_at_utc=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
        printf 'summary=%s\n' "$summary"
        printf 'operator_action=inspect_logs_and_preserved_staging\n'
    } >"$marker_temp" || ! mv "$marker_temp" "$marker"; then
        rm -f "$marker_temp"
        error "Could not persist the backup failure marker for $site"
        return 1
    fi

    log "BACKUP_FAILURE_MARKER|site=$site|run_id=$RUN_ID|summary=$summary|path=$marker"
}

clear_failure_marker() {
    site=$1
    marker="$HOST_BACKUP_DIR/$site/BACKUP_FAILURE"

    if [ -e "$marker" ]; then
        if ! rm -f "$marker"; then
            error "Could not clear the backup failure marker for $site"
            return 1
        fi
        log "BACKUP_FAILURE_CLEARED|site=$site|run_id=$RUN_ID|path=$marker"
    fi
}

LOCK_DIR="$HOST_BACKUP_DIR/.backup-run.lock"
lock_held=0

release_lock() {
    exit_status=$?
    trap - EXIT

    if [ "$lock_held" -eq 1 ] && ! rmdir "$LOCK_DIR"; then
        error "Could not release the empty backup lock at $LOCK_DIR"
        [ "$exit_status" -ne 0 ] || exit_status=8
    fi

    exit "$exit_status"
}

exit_for_signal() {
    signal_status=$1
    error "Backup interrupted; any staging was preserved"
    if [ -n "${active_site:-}" ]; then
        write_failure_marker "$active_site" "backup_interrupted" || true
    fi
    exit "$signal_status"
}

if ! mkdir "$LOCK_DIR"; then
    error "Another backup run is active or the backup lock is stale: $LOCK_DIR"
    exit 7
fi

lock_held=1
trap release_lock EXIT
trap 'exit_for_signal 129' HUP
trap 'exit_for_signal 130' INT
trap 'exit_for_signal 143' TERM

container_signature() {
    container=$1
    path=$2
    "$DOCKER_BIN" exec "$container" cksum "$path" | awk '{print $1 ":" $2}'
}

host_signature() {
    cksum "$1" | awk '{print $1 ":" $2}'
}

is_scheduled_backup_set_name() {
    local name=$1
    local year month day hour minute second max_day

    if [[ ! $name =~ ^backup-set-([0-9]{4})-([0-9]{2})-([0-9]{2})_([0-9]{2})-([0-9]{2})-([0-9]{2})$ ]]; then
        return 1
    fi

    year=$((10#${BASH_REMATCH[1]}))
    month=$((10#${BASH_REMATCH[2]}))
    day=$((10#${BASH_REMATCH[3]}))
    hour=$((10#${BASH_REMATCH[4]}))
    minute=$((10#${BASH_REMATCH[5]}))
    second=$((10#${BASH_REMATCH[6]}))

    if (( year < 1 || month < 1 || month > 12 || day < 1 ||
          hour > 23 || minute > 59 || second > 59 )); then
        return 1
    fi

    case "$month" in
        2)
            max_day=28
            if (( year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) )); then
                max_day=29
            fi
            ;;
        4|6|9|11)
            max_day=30
            ;;
        *)
            max_day=31
            ;;
    esac

    (( day <= max_day ))
}

backup_site() {
    site=$1
    container=$2
    backup_failure_summary=backup_site_failed
    site_dir="$HOST_BACKUP_DIR/$site"
    final_set="$site_dir/backup-set-$RUN_ID"
    host_stage="$site_dir/.staging-backup-set-$RUN_ID"
    staged_database="$CONTAINER_STAGE_DIR/blog.db"
    staged_uploads="$CONTAINER_STAGE_DIR/uploads.tar.gz"

    log "Starting one backup set for $site"
    if ! mkdir -p "$site_dir"; then
        backup_failure_summary=host_site_directory_unavailable
        error "Could not prepare the host backup directory for $site"
        return 1
    fi

    if [ -e "$final_set" ] || [ -e "$host_stage" ]; then
        backup_failure_summary=host_destination_already_exists
        error "Host destination for $site already exists; refusing to overwrite"
        return 1
    fi

    if ! "$DOCKER_BIN" exec "$container" mkdir "$CONTAINER_STAGE_DIR"; then
        backup_failure_summary=container_staging_unavailable
        error "Container staging for $site is unavailable or contains a prior failed run"
        return 1
    fi

    if ! mkdir "$host_stage"; then
        "$DOCKER_BIN" exec "$container" rmdir "$CONTAINER_STAGE_DIR" >/dev/null 2>&1 || true
        backup_failure_summary=host_staging_unavailable
        error "Could not reserve host staging for $site"
        return 1
    fi

    if ! "$DOCKER_BIN" exec -i \
        -e "BACKUP_DIR=$CONTAINER_STAGE_DIR" \
        "$container" bash -s < "$CONTAINER_BACKUP_SCRIPT"; then
        backup_failure_summary=container_backup_creation_failed
        error "Container backup creation failed for $site; staging was preserved"
        return 1
    fi

    if ! "$DOCKER_BIN" cp "$container:$staged_database" "$host_stage/blog.db"; then
        backup_failure_summary=database_transfer_failed
        error "Database transfer failed for $site; staging was preserved"
        return 1
    fi

    if ! "$DOCKER_BIN" cp "$container:$staged_uploads" "$host_stage/uploads.tar.gz"; then
        backup_failure_summary=uploads_transfer_failed
        error "Uploads transfer failed for $site; staging was preserved"
        return 1
    fi

    if [ ! -s "$host_stage/blog.db" ] || [ ! -s "$host_stage/uploads.tar.gz" ]; then
        backup_failure_summary=transferred_set_incomplete
        error "Transferred backup set is incomplete for $site; staging was preserved"
        return 1
    fi

    if ! gzip -t "$host_stage/uploads.tar.gz" || \
       ! tar -tzf "$host_stage/uploads.tar.gz" >/dev/null; then
        backup_failure_summary=uploads_archive_verification_failed
        error "Transferred uploads archive failed verification for $site; staging was preserved"
        return 1
    fi

    if ! container_database_signature=$(container_signature "$container" "$staged_database"); then
        backup_failure_summary=container_database_checksum_failed
        error "Could not checksum the staged database for $site; staging was preserved"
        return 1
    fi

    if ! container_uploads_signature=$(container_signature "$container" "$staged_uploads"); then
        backup_failure_summary=container_uploads_checksum_failed
        error "Could not checksum the staged uploads archive for $site; staging was preserved"
        return 1
    fi

    if ! host_database_signature=$(host_signature "$host_stage/blog.db"); then
        backup_failure_summary=host_database_checksum_failed
        error "Could not checksum the transferred database for $site; staging was preserved"
        return 1
    fi

    if ! host_uploads_signature=$(host_signature "$host_stage/uploads.tar.gz"); then
        backup_failure_summary=host_uploads_checksum_failed
        error "Could not checksum the transferred uploads archive for $site; staging was preserved"
        return 1
    fi

    if [ "$container_database_signature" != "$host_database_signature" ] || \
       [ "$container_uploads_signature" != "$host_uploads_signature" ]; then
        backup_failure_summary=transfer_checksum_mismatch
        error "Transferred backup checksum verification failed for $site; staging was preserved"
        return 1
    fi

    if ! mv "$host_stage" "$final_set"; then
        backup_failure_summary=host_finalization_failed
        error "Could not finalize host backup set for $site; staging was preserved"
        return 1
    fi

    if ! "$DOCKER_BIN" exec "$container" rm -f "$staged_database" "$staged_uploads" || \
       ! "$DOCKER_BIN" exec "$container" rmdir "$CONTAINER_STAGE_DIR"; then
        backup_failure_summary=container_staging_cleanup_failed
        error "Host backup is durable, but container staging cleanup failed for $site"
        return 1
    fi

    log "Verified host backup set completed for $site"
}

apply_retention() {
    site=$1
    site_dir="$HOST_BACKUP_DIR/$site"

    # Only timestamp-only scheduled sets are eligible. Named/manual recovery
    # anchors and legacy layouts are deliberately untouched.
    for backup_set in "$site_dir"/backup-set-*; do
        [ -d "$backup_set" ] || continue
        [ ! -L "$backup_set" ] || continue

        backup_set_name=${backup_set##*/}
        if ! is_scheduled_backup_set_name "$backup_set_name"; then
            continue
        fi

        if ! age_match=$(find "$backup_set" -prune -mtime +"$RETENTION_DAYS" -print); then
            error "Could not evaluate retention age for $backup_set"
            return 1
        fi

        if [ -n "$age_match" ] && ! rm -rf -- "$backup_set"; then
            error "Could not remove expired managed backup set $backup_set"
            return 1
        fi
    done
}

status=0
completed_sites=""
active_site=""

for site_spec in $BACKUP_SITES; do
    site=${site_spec%%:*}
    container=${site_spec#*:}
    active_site=$site

    if backup_site "$site" "$container"; then
        completed_sites="$completed_sites $site"
        if ! clear_failure_marker "$site"; then
            status=1
        fi
    else
        status=1
        write_failure_marker "$site" "$backup_failure_summary" || true
    fi
    active_site=""
done

if [ "$status" -ne 0 ]; then
    error "At least one backup failed; host retention was skipped"
    exit "$status"
fi

for site in $completed_sites; do
    active_site=$site
    if ! apply_retention "$site"; then
        status=1
        write_failure_marker "$site" "retention_failed" || true
    fi
    active_site=""
done

if [ "$status" -ne 0 ]; then
    error "Backup sets completed, but host retention failed"
    exit "$status"
fi

log "All backup sets completed and host retention was applied"
