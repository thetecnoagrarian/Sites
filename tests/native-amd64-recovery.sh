#!/usr/bin/env bash
set -euo pipefail
umask 077

historical_sha=b50a41f02aeda58d36798997ff8bd2f9fe56a018
here=$(cd -- "$(dirname -- "$0")" && pwd -P)
fixture="$here/fixtures/native-recovery-site.mjs"
host_check="$here/fixtures/native-recovery-host.py"

fail() { printf 'Recovery rehearsal: %s\n' "$*" >&2; exit 1; }

verify_database() (
    local capture
    capture=$(mktemp -d "${TMPDIR:-/tmp}/recovery-sqlite-output.XXXXXX") || return 1
    trap 'rm -rf -- "$capture"' EXIT
    printf 'ok\n' > "$capture/expected" || return 1

    if ! sqlite3 -batch -bail -init /dev/null -readonly "$1" 'PRAGMA integrity_check;' \
        > "$capture/stdout" 2> "$capture/stderr"; then
        printf 'SQLite integrity command failed.\n' >&2
        head -c 4096 "$capture/stderr" >&2
        return 21
    fi
    if ! cmp -s "$capture/stdout" "$capture/expected"; then
        printf 'SQLite integrity output was not exactly ok.\n' >&2
        return 22
    fi
    if ! sqlite3 -batch -bail -init /dev/null -readonly "$1" 'PRAGMA foreign_key_check;' \
        > "$capture/stdout" 2> "$capture/stderr"; then
        printf 'SQLite foreign-key command failed.\n' >&2
        head -c 4096 "$capture/stderr" >&2
        return 23
    fi
    if ! cmp -s "$capture/stdout" /dev/null; then
        printf 'SQLite foreign-key check returned rows or unexpected output.\n' >&2
        return 24
    fi
)

database_self_test() (
    set -e
    local directory actual
    directory=$(mktemp -d "${TMPDIR:-/tmp}/recovery-fk.XXXXXX")
    trap 'rm -rf -- "$directory"' EXIT
    local schema='CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id REFERENCES parent(id));'
    sqlite3 -batch -bail -init /dev/null "$directory/valid.db" "$schema"
    sqlite3 -batch -bail -init /dev/null "$directory/violations.db" "PRAGMA foreign_keys=OFF; $schema INSERT INTO child VALUES(42);"
    sqlite3 -batch -bail -init /dev/null "$directory/fk-error.db" 'CREATE TABLE parent(id INTEGER); CREATE TABLE child(parent_id REFERENCES parent(id));'
    printf '%s\n' 'synthetic corrupt database' > "$directory/corrupt.db"

    expect_database() {
        local expected=$1
        actual=0
        verify_database "$directory/$2" || actual=$?
        [[ "$actual" == "$expected" ]] || {
            printf 'Synthetic database control %s expected %s, got %s.\n' "$2" "$expected" "$actual" >&2
            return 1
        }
    }
    expect_database 0 valid.db
    expect_database 24 violations.db
    expect_database 23 fk-error.db
    expect_database 21 missing.db
    expect_database 21 corrupt.db
    # Exercise the real output/status assertions with deterministic fake output.
    (
        sqlite3() { printf '%s\n' unexpected; }
        expect_database 22 valid.db
    )
    (
        sqlite3() {
            if [[ "$*" == *integrity_check* ]]; then printf '%s\n' ok
            else printf '%s\n' unexpected; fi
        }
        expect_database 24 valid.db
    )
    (
        sqlite3() {
            if [[ "$*" == *integrity_check* ]]; then printf '%s\n' ok
            else printf '\n'; fi
        }
        expect_database 24 valid.db
    )
    (
        sqlite3() { printf 'ok\n\n'; }
        expect_database 22 valid.db
    )
    (
        sqlite3() { printf 'ok\n\000'; }
        expect_database 22 valid.db
    )
    (
        sqlite3() {
            if [[ "$*" == *integrity_check* ]]; then printf '%s\n' ok
            else printf '\000'; fi
        }
        expect_database 24 valid.db
    )
    printf 'SQLite controls passed: 1 clean database and 10 expected rejections.\n'
)

if [[ "${1:-}" == --database-self-test ]]; then
    database_self_test
    exit
fi

[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_EVENT_NAME:-}" == workflow_dispatch &&
   "${RUNNER_ENVIRONMENT:-}" == github-hosted &&
   "${RUNNER_OS:-}" == Linux && "${RUNNER_ARCH:-}" == X64 && "$(uname -m)" == x86_64 ]] ||
    fail "requires a GitHub-hosted native Linux AMD64 runner"
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]] ||
    fail "invalid run identity"
[[ -d "${RUNNER_TEMP:?}" && -n "${GITHUB_STEP_SUMMARY:?}" ]] || fail "missing runner paths"

tag="sites-recovery-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
label="org.sites.native-recovery=$tag"
scratch="$RUNNER_TEMP/$tag"
unset DOCKER_CONTEXT
export DOCKER_HOST=unix:///var/run/docker.sock

cleanup() {
    local status=0 ids name other listing
    ids=$(docker ps -aq --filter "label=$label") || return 1
    for name in $ids; do docker rm -f "$name" >/dev/null || status=1; done
    ids=$(docker volume ls -q --filter "label=$label") || return 1
    for name in $ids; do docker volume rm "$name" >/dev/null || status=1; done
    for name in ffg tta; do
        for other in candidate historical; do
            local image="$tag-$name:$other"
            if [[ "$(docker image inspect --format '{{index .Config.Labels "org.sites.native-recovery"}}' "$image" 2>/dev/null)" == "$tag" ]]; then
                docker image rm "$image" >/dev/null || status=1
            fi
        done
    done

    if [[ "$status" == 0 ]]; then
        for listing in 'ps -aq' 'volume ls -q' 'image ls -q'; do
            # Fixed subcommands above. The filter only matches this workflow run.
            local args=()
            read -r -a args <<< "$listing"
            ids=$(docker "${args[@]}" --filter "label=$label") || return 1
            [[ -z "$ids" ]] || status=1
        done
    fi
    if [[ "$status" == 0 && -f "$scratch/.recovery-run" && "$(cat "$scratch/.recovery-run")" == "$tag" ]]; then
        sudo -n rm -rf -- "$scratch" || status=1
    fi
    return "$status"
}

if [[ "${1:-}" == --cleanup ]]; then
    # A failed checkout or an unavailable daemon before provisioning owns nothing.
    [[ ! -f "$scratch/.recovery-run" ]] || cleanup
    exit
fi

[[ $# == 2 ]] || fail "supply candidate and historical checkout paths"
[[ -n "${TARGET_REVISION:-}" ]] || fail "missing candidate revision"
[[ "$TARGET_REVISION" =~ ^[0-9a-fA-F]{40}$ ]] || fail "candidate revision must be a full 40-character commit SHA"
candidate_sha=$(printf '%s' "$TARGET_REVISION" | tr '[:upper:]' '[:lower:]')
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail "invalid workflow revision"
[[ "$(git -C "$here/.." rev-parse --verify 'HEAD^{commit}')" == "$GITHUB_SHA" ]] || fail "harness SHA mismatch"
candidate=$(cd -- "$1" && pwd -P)
historical=$(cd -- "$2" && pwd -P)
[[ "$candidate" != "$historical" ]] || fail "candidate and historical must use separate build contexts"
[[ "$(git -C "$candidate" rev-parse --verify 'HEAD^{commit}')" == "$candidate_sha" ]] || fail "candidate SHA mismatch"
[[ "$(git -C "$historical" rev-parse --verify 'HEAD^{commit}')" == "$historical_sha" ]] || fail "historical SHA mismatch"
for source in "$candidate" "$historical"; do
    [[ "$(git -C "$source" rev-parse --show-toplevel)" == "$source" ]] || fail "build context must be a checkout root"
    source_status=$(git -C "$source" status --porcelain --untracked-files=all) || fail "cannot inspect build context"
    [[ -z "$source_status" ]] || fail "dirty build context"
done
architecture=$(docker version --format '{{.Server.Arch}}')
[[ "$architecture" == amd64 || "$architecture" == x86_64 ]] || fail "Docker daemon is not native AMD64"
mkdir -- "$scratch"
printf '%s\n' "$tag" > "$scratch/.recovery-run"
monitor=
finish() {
    local status=$?
    trap - EXIT
    if [[ -n "$monitor" ]]; then
        kill "$monitor" 2>/dev/null || true
        wait "$monitor" 2>/dev/null || true
    fi
    if [[ -e "$scratch/usage-incomplete" ]]; then
        printf "Runner filesystem sampling failed.\n" >&2
        status=1
    fi
    if [[ -s "$scratch/usage" ]]; then
        awk '
            NF == 5 {
                if (!seen[$1]++) { blocks[$1] = $2; inodes[$1] = $4 }
                peak_blocks[$1] = ($2 > peak_blocks[$1] ? $2 : peak_blocks[$1])
                peak_inodes[$1] = ($4 > peak_inodes[$1] ? $4 : peak_inodes[$1])
                if (!($1 in free) || $3 < free[$1]) free[$1] = $3
                if (!($1 in ifree) || $5 < ifree[$1]) ifree[$1] = $5
            }
            END {
                print "\n## Runner filesystem high-water observations\n"
                for (fs in seen)
                    printf "- %s: peak increase %.0f allocated bytes and %.0f inodes; minimum free %.0f bytes and %.0f inodes.\n", fs, (peak_blocks[fs]-blocks[fs]), (peak_inodes[fs]-inodes[fs]), free[fs], ifree[fs]
            }
        ' "$scratch/usage" | tee -a "$GITHUB_STEP_SUMMARY" || status=1
    fi
    if ! cleanup; then status=1; fi
    exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export RECOVERY_PASSWORD SESSION_SECRET
RECOVERY_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 32)
printf '# Isolated native AMD64 recovery\n\n- Candidate: `%s`\n- Historical: `%s`\n- Harness: `%s`\n' \
    "$candidate_sha" "$historical_sha" "$GITHUB_SHA" >> "$GITHUB_STEP_SUMMARY"

docker_root=$(docker info --format '{{.DockerRootDir}}')
sample_usage() {
    local filesystem=$1 location=$2 used free inodes ifree
    read -r used free < <(sudo -n df -P -B1 "$location" | awk 'NR == 2 { print $3, $4 }') || return 1
    read -r inodes ifree < <(sudo -n df -Pi "$location" | awk 'NR == 2 { print $3, $4 }') || return 1
    printf '%s %s %s %s %s\n' "$filesystem" "$used" "$free" "$inodes" "$ifree"
}
sample_usage docker "$docker_root" > "$scratch/usage"
sample_usage artifacts "$scratch" >> "$scratch/usage"
(
    trap - EXIT INT TERM
    while sleep 1; do
        if ! sample_usage docker "$docker_root" || ! sample_usage artifacts "$scratch"; then
            touch "$scratch/usage-incomplete"
            exit 1
        fi
    done
) >> "$scratch/usage" &
monitor=$!

# The only build inputs are the clean pinned source checkouts, not the harness.
declare -A images
for release in candidate historical; do
    source=$candidate
    if [[ "$release" == historical ]]; then source=$historical; fi
    for site in ffg tta; do
        site_dir=fruitionforestgarden
        if [[ "$site" == tta ]]; then site_dir=thetecnoagrarian; fi
        image="$tag-$site:$release"
        if docker image inspect "$image" >/dev/null 2>&1; then fail "image tag collision"; fi
        docker build --no-cache --pull --platform linux/amd64 --label "$label" \
            -f "$source/docker/Dockerfile.prod.site" --build-arg "SITE_DIR_NAME=$site_dir" \
            --build-arg SITE_PORT=4000 --tag "$image" "$source"
        read -r id os arch size < <(docker image inspect --format '{{.Id}} {{.Os}} {{.Architecture}} {{.Size}}' "$image")
        [[ "$id" =~ ^sha256:[0-9a-f]{64}$ && "$os/$arch" == linux/amd64 ]] || fail "unexpected image identity"
        images["$site-$release"]=$id
        printf -- '- %s %s: `%s`, %s image bytes (shared layers may overlap).\n' \
            "$site" "$release" "$id" "$size" >> "$GITHUB_STEP_SUMMARY"
    done
done

TMPDIR="$scratch" python3 "$host_check" self-test
sudo -n env TMPDIR="$scratch" python3 "$host_check" census-self-test
docker run --rm --network none --label "$label" --read-only --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
    --entrypoint bash "${images[ffg-candidate]}" -euc "$(declare -f verify_database database_self_test)
database_self_test"
common=(--network none --label "$label" --mount "type=bind,src=$fixture,dst=/recovery.mjs,readonly")
data_mount() { printf 'type=volume,src=%s,dst=/app/data,volume-nocopy%s' "$1" "${2:+,$2}"; }
new_volume() {
    if docker volume inspect "$1" >/dev/null 2>&1; then fail "volume name collision"; fi
    docker volume create --label "$label" "$1" >/dev/null
}
job() {
    local image=$1 volume=$2 access=$3 mode=$4 site=$5
    docker run --rm "${common[@]}" --read-only --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
        --mount "$(data_mount "$volume" "$access")" -e RECOVERY_PASSWORD \
        --entrypoint node "$image" /recovery.mjs "$mode" "$site"
}
volume_path() {
    local directory
    directory=$(docker volume inspect --format '{{.Mountpoint}}' "$1") || return 1
    [[ "$directory" == "$docker_root"/volumes/"$1"/_data ]] || fail "unexpected data mountpoint"
    printf '%s\n' "$directory"
}
census() {
    local directory
    directory=$(volume_path "$1") || return 1
    sudo -n python3 "$host_check" census "$directory"
}
containers_using() { docker ps -q --no-trunc --filter "volume=$1"; }
one_writer() {
    local pid
    pid=$(docker inspect --format '{{.State.Pid}}' "$1")
    [[ "$pid" =~ ^[1-9][0-9]*$ && "$(census "$2")" == "[[$pid, 2]]" ]] ||
        fail "expected one read/write SQLite handle from the application process"
}
quiescent() {
    local mounted holders
    mounted=$(containers_using "$1") || return 2
    [[ -z "$mounted" ]] || return 1
    holders=$(census "$1") || return 2
    [[ "$holders" == '[]' ]]
}
measure() {
    local result
    result=$(sudo -n python3 "$host_check" tree "$(volume_path "$1")")
    printf -- '- %s data volume: `%s`\n' "$2" "$result" | tee -a "$GITHUB_STEP_SUMMARY"
}
assert_mount() {
    local identity network ports mount expected id volumes
    read -r identity network ports < <(docker inspect --format '{{.Image}} {{.HostConfig.NetworkMode}} {{len .HostConfig.PortBindings}}' "$1")
    [[ "$identity" == "$2" && "$network" == none && "$ports" == 0 ]] || fail "container isolation mismatch"
    mount=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}} {{.RW}}{{end}}{{end}}' "$1")
    expected="$3 $4"
    volumes=$(docker inspect --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{" "}}{{end}}{{end}}' "$1")
    [[ "$mount" == "$expected" && "$volumes" == "$3 " ]] || fail "unexpected data mount: $mount"
    id=$(docker inspect --format '{{.Id}}' "$1")
    [[ "$(containers_using "$3")" == "$id" ]] || fail "unexpected concurrent volume mount"
    printf -- '- Container `%s` used image `%s` and data volume `%s` (writable: %s).\n' \
        "$id" "$identity" "$3" "$4" >> "$GITHUB_STEP_SUMMARY"
}
start_app() {
    local container=$1 image=$2 volume=$3 site=$4 ready=false site_dir=fruitionforestgarden
    if [[ "$site" == tta ]]; then site_dir=thetecnoagrarian; fi
    docker run -d "${common[@]}" --name "$container" --restart=no --read-only \
        --tmpfs "/app/$site_dir/uploads:rw,nosuid,nodev,uid=1001,gid=1001,mode=0700" \
        --tmpfs /app/logs:rw,nosuid,nodev,uid=1001,gid=1001,mode=0700 \
        --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
        --mount "$(data_mount "$volume")" \
        -e NODE_ENV=production -e PORT=4000 -e SITE_PORT=4000 -e SESSION_SECRET -e RECOVERY_PASSWORD \
        -e DATABASE_PATH=/app/data/blog.db -e UPLOADS_PATH=/app/data/uploads \
        -e BASE_URL=https://restore.invalid -e TRUSTED_INGRESS_PEERS=127.0.0.1 \
        -e RATE_LIMIT_MAX_REQUESTS=1000 --entrypoint bash "$image" -c 'umask 077; exec node src/app.js' >/dev/null
    assert_mount "$container" "$image" "$volume" true
    for _ in {1..30}; do
        if docker exec "$container" node /recovery.mjs http-health "$site" >/dev/null 2>&1; then
            ready=true
            break
        fi
        [[ "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]] || break
        sleep 1
    done
    [[ "$ready" == true ]] || fail "$site failed to become healthy"
    one_writer "$container" "$volume"
}
stop_app() {
    docker stop -t 10 "$1" >/dev/null
    [[ "$(docker inspect --format '{{.State.Running}} {{.State.Pid}}' "$1")" == 'false 0' ]] ||
        fail "application did not quiesce"
    quiescent "$2" || fail "unexpected volume attachment or SQLite handle after stopping app"
    docker rm "$1" >/dev/null
}
require_closed_source() {
    local helper_id=$1 volume=$2 mounted holders
    mounted=$(containers_using "$volume") || return 2
    [[ "$mounted" == "$helper_id" ]] || return 1
    holders=$(census "$volume") || return 2
    [[ "$holders" == '[]' ]]
}

checkpoint() {
    local site=$1 image=$2 volume=$3 phase=$4 helper_id
    quiescent "$volume" || return "$?"
    helper_id=$(docker run -d --network none --label "$label" --name "$tag-$site-backup-$phase" --restart=no --no-healthcheck \
        --mount "$(data_mount "$volume" readonly)" --entrypoint bash "$image" -c 'while :; do sleep 300; done')
    [[ "$helper_id" =~ ^[0-9a-f]{64}$ ]] || fail "unexpected backup helper identity"
    assert_mount "$helper_id" "$image" "$volume" false
    sudo -n python3 "$host_check" private "$(volume_path "$volume")"
    sudo -n python3 "$host_check" db-digest "$(volume_path "$volume")" > "$scratch/$site-$phase.source-db"
    sudo -n python3 "$host_check" uploads "$(volume_path "$volume")" > "$scratch/$site-$phase.uploads"
    # The sole application container was removed, with restart disabled. This
    # synchronous job is the only actor allowed to start or mount these volumes.
    # The idle helper has only a read-only data mount and writable staging.
    require_closed_source "$helper_id" "$volume" || fail "source not closed immediately before capture"
    # Keep the helper root writable for the existing docker cp staging path.
    HOST_BACKUP_DIR="$scratch/sets" BACKUP_RUN_ID="$phase" BACKUP_SITES="$site:$helper_id" \
        CONTAINER_STAGE_DIR="/tmp/$tag-backup" CONTAINER_BACKUP_SCRIPT="$candidate/scripts/backup.sh" \
        DOCKER_BIN=docker bash "$candidate/scripts/backup-host.sh"
    require_closed_source "$helper_id" "$volume" || fail "unexpected mount or publication handle after capture"
    sudo -n python3 "$host_check" db-digest "$(volume_path "$volume")" | cmp "$scratch/$site-$phase.source-db"
    sudo -n python3 "$host_check" uploads "$(volume_path "$volume")" | cmp "$scratch/$site-$phase.uploads"
    docker rm -f "$helper_id" >/dev/null
    quiescent "$volume" || fail "source failed the closed-checkpoint census"
    local archive_dir="$scratch/sets/$site/backup-set-$phase"
    python3 "$host_check" archive "$archive_dir/uploads.tar.gz"
    (cd -- "$archive_dir" && sha256sum blog.db uploads.tar.gz) > "$scratch/$site-$phase.sha256"
    {
        printf '\n## %s %s checkpoint\n\n' "$site" "$phase"
        wc -c "$archive_dir/blog.db" "$archive_dir/uploads.tar.gz" | awk '{print "- " $1 " bytes: " $2}'
        sed 's/^/- SHA-256 /' "$scratch/$site-$phase.sha256"
    } >> "$GITHUB_STEP_SUMMARY"
    measure "$volume" "$site $phase source"
}
verify_backup() {
    local directory=$1 checksums=$2 file expected
    for file in blog.db uploads.tar.gz; do
        expected=$(awk -v file="$file" '$2 == file { print $1 }' "$checksums")
        python3 "$host_check" verify-digest "$directory/$file" "$expected" "Backup artifact"
    done
}

restore() {
    local site=$1 image=$2 phase=$3 volume=$4
    local directory="$scratch/sets/$site/backup-set-$phase"
    verify_backup "$directory" "$scratch/$site-$phase.sha256"
    python3 "$host_check" archive "$directory/uploads.tar.gz"
    new_volume "$volume"
    docker run --rm --network none --label "$label" --user 0:0 --read-only \
        --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
        --mount "$(data_mount "$volume")" --mount "type=bind,src=$directory,dst=/backup,readonly" \
        --entrypoint bash "$image" -euc "$(declare -f verify_database)"'
            umask 077
            cp /backup/blog.db /app/data/blog.db
            tar --no-same-owner --no-same-permissions -xzf /backup/uploads.tar.gz -C /app/data
            chown -R 1001:1001 /app/data
            find /app/data -type d -exec chmod 700 {} +
            find /app/data -type f -exec chmod 600 {} +
            verify_database /app/data/blog.db
        '
    local expected
    expected=$(awk '$2 == "blog.db" { print $1 }' "$scratch/$site-$phase.sha256")
    sudo -n python3 "$host_check" verify-digest "$(volume_path "$volume")/blog.db" "$expected" "Restored database"
    sudo -n python3 "$host_check" uploads "$(volume_path "$volume")" | cmp "$scratch/$site-$phase.uploads"
    sudo -n python3 "$host_check" private "$(volume_path "$volume")"
    quiescent "$volume" || fail "restore target is not closed before boot"
    measure "$volume" "$site $phase restored"
}

for site in ffg tta; do
    old=${images["$site-historical"]}
    new=${images["$site-candidate"]}
    app="$tag-$site-app"
    source="$tag-$site-source"
    migrated="$tag-$site-migrated"
    restored="$tag-$site-restored"
    rollback="$tag-$site-rollback"

    new_volume "$source"
    docker run --rm --network none --label "$label" --user 0:0 \
        --mount "$(data_mount "$source")" --entrypoint sh "$old" \
        -ec 'chown 1001:1001 /app/data; chmod 700 /app/data'
    job "$old" "$source" '' seed "$site"
    start_app "$app" "$old" "$source" "$site"
    docker exec "$app" node /recovery.mjs http-pre "$site"
    stop_app "$app" "$source"
    checkpoint "$site" "$old" "$source" pre

    restore "$site" "$new" pre "$migrated"
    job "$new" "$migrated" '' fs-probe "$site" | tee -a "$GITHUB_STEP_SUMMARY"
    job "$new" "$migrated" '' migrate "$site" | tee -a "$GITHUB_STEP_SUMMARY"
    start_app "$app" "$new" "$migrated" "$site"
    docker exec "$app" node /recovery.mjs publish "$site"
    one_writer "$app" "$migrated"
    if checkpoint "$site" "$new" "$migrated" active; then
        fail "checkpoint proceeded with an admitted publication writer"
    else
        [[ $? == 1 && ! -e "$scratch/sets/$site/backup-set-active" &&
           ! -e "$scratch/sets/$site/.staging-backup-set-active" ]] || fail "checkpoint refusal was inconclusive"
        printf -- '- %s: checkpoint refused while its one publication writer was active.\n' "$site" >> "$GITHUB_STEP_SUMMARY"
    fi
    stop_app "$app" "$migrated"
    job "$new" "$migrated" readonly fingerprint "$site" | tee "$scratch/$site.fingerprint"
    checkpoint "$site" "$new" "$migrated" post

    restore "$site" "$old" pre "$rollback"
    start_app "$app" "$old" "$rollback" "$site"
    docker exec "$app" node /recovery.mjs http-pre "$site"
    stop_app "$app" "$rollback"
    printf -- '- %s Case B booted with its historical image and pre-migration checkpoint; later writes were absent.\n' \
        "$site" >> "$GITHUB_STEP_SUMMARY"

    restore "$site" "$new" post "$restored"
    job "$new" "$restored" readonly fingerprint "$site" | cmp "$scratch/$site.fingerprint"
    start_app "$app" "$new" "$restored" "$site"
    docker exec "$app" node /recovery.mjs http-post "$site" | tee -a "$GITHUB_STEP_SUMMARY"
    stop_app "$app" "$restored"
    job "$new" "$restored" readonly fingerprint "$site" | cmp "$scratch/$site.fingerprint"

    if [[ "$site" == ffg ]]; then
        fault_volume="$tag-ffg-faults"
        restore "$site" "$new" post "$fault_volume"
        job "$new" "$fault_volume" '' faults "$site" | tee -a "$GITHUB_STEP_SUMMARY"
        TMPDIR="$scratch" python3 "$host_check" archive-truncation "$scratch/sets/ffg/backup-set-post/uploads.tar.gz" |
            tee -a "$GITHUB_STEP_SUMMARY"
        job "$new" "$restored" readonly capacity "$site" | tee -a "$GITHUB_STEP_SUMMARY"
    fi
    for phase in pre post; do
        verify_backup "$scratch/sets/$site/backup-set-$phase" "$scratch/$site-$phase.sha256"
    done
done

printf '\n## Native technical result\n\n- Forward recovery and Case B passed for both sites.\n- Case A remains unverified until an independent immutable rollback image supports the 0004 ledger, managed media grants and the v2 hero authority with safe read and write behavior.\n- File and directory synchronization calls succeeded. Power-loss durability was outside the rehearsal.\n- Prior production free-space observation (21.14 GB) is historical. Production was outside this workflow.\n' \
    >> "$GITHUB_STEP_SUMMARY"
