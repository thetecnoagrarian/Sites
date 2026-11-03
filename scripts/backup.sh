#!/bin/bash
# Create exactly one database/uploads backup set in an operator-provided staging directory.

set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-}
DATA_DIR=${DATA_DIR:-/app/data}
SQLITE_BUSY_TIMEOUT_MS=${BACKUP_SQLITE_BUSY_TIMEOUT_MS:-30000}
SQLITE_BACKUP_ATTEMPTS=${BACKUP_SQLITE_BACKUP_ATTEMPTS:-3}
SQLITE_RETRY_DELAY_SECONDS=${BACKUP_SQLITE_RETRY_DELAY_SECONDS:-2}

log() {
    printf '[backup] %s\n' "$1"
}

error() {
    printf '[backup] ERROR: %s\n' "$1" >&2
}

file_size() {
    if stat -c %s "$1" >/dev/null 2>&1; then
        stat -c %s "$1"
    else
        stat -f %z "$1"
    fi
}

if [ -z "$BACKUP_DIR" ]; then
    error "BACKUP_DIR must identify an empty, temporary staging directory"
    exit 2
fi

case "$BACKUP_DIR" in
    *"'"*|*$'\n'*)
        error "BACKUP_DIR contains unsupported characters"
        exit 2
        ;;
esac

case "$SQLITE_BUSY_TIMEOUT_MS" in
    ''|*[!0-9]*)
        error "BACKUP_SQLITE_BUSY_TIMEOUT_MS must be an integer from 1 through 30000"
        exit 2
        ;;
esac

if [ "${#SQLITE_BUSY_TIMEOUT_MS}" -gt 5 ] || \
   [ "$SQLITE_BUSY_TIMEOUT_MS" -eq 0 ] || \
   [ "$SQLITE_BUSY_TIMEOUT_MS" -gt 30000 ]; then
    error "BACKUP_SQLITE_BUSY_TIMEOUT_MS must be an integer from 1 through 30000"
    exit 2
fi

case "$SQLITE_BACKUP_ATTEMPTS" in
    1|2|3)
        ;;
    *)
        error "BACKUP_SQLITE_BACKUP_ATTEMPTS must be an integer from 1 through 3"
        exit 2
        ;;
esac

case "$SQLITE_RETRY_DELAY_SECONDS" in
    0|1|2)
        ;;
    *)
        error "BACKUP_SQLITE_RETRY_DELAY_SECONDS must be an integer from 0 through 2"
        exit 2
        ;;
esac

if [ ! -d "$DATA_DIR" ]; then
    error "Data directory is unavailable"
    exit 3
fi

if [ ! -f "$DATA_DIR/blog.db" ]; then
    error "Database source is unavailable"
    exit 3
fi

if [ ! -d "$DATA_DIR/uploads" ]; then
    error "Uploads source is unavailable"
    exit 3
fi

mkdir -p "$BACKUP_DIR"

for staged_entry in "$BACKUP_DIR"/.[!.]* "$BACKUP_DIR"/..?* "$BACKUP_DIR"/*; do
    if [ -e "$staged_entry" ]; then
        error "Backup staging directory is not empty"
        exit 4
    fi
done

database_backup="$BACKUP_DIR/blog.db"
database_error="$BACKUP_DIR/.sqlite-backup-error.log"
uploads_backup="$BACKUP_DIR/uploads.tar.gz"

attempt=1
while [ "$attempt" -le "$SQLITE_BACKUP_ATTEMPTS" ]; do
    log "Creating a consistent SQLite backup in temporary staging (attempt $attempt/$SQLITE_BACKUP_ATTEMPTS, busy timeout ${SQLITE_BUSY_TIMEOUT_MS}ms)"

    if sqlite3 -cmd ".timeout $SQLITE_BUSY_TIMEOUT_MS" \
        "$DATA_DIR/blog.db" ".backup '$database_backup'" 2>"$database_error"; then
        rm -f "$database_error"
        log "SQLite backup attempt $attempt/$SQLITE_BACKUP_ATTEMPTS succeeded"
        break
    fi

    if grep -Eiq 'database( table)? is (locked|busy)|SQLITE_(BUSY|LOCKED)' "$database_error"; then
        if [ "$attempt" -lt "$SQLITE_BACKUP_ATTEMPTS" ]; then
            error "SQLite backup attempt $attempt/$SQLITE_BACKUP_ATTEMPTS failed because the database was busy or locked; retrying after ${SQLITE_RETRY_DELAY_SECONDS}s"
            rm -f "$database_backup" "$database_error"
            if [ "$SQLITE_RETRY_DELAY_SECONDS" -gt 0 ]; then
                sleep "$SQLITE_RETRY_DELAY_SECONDS"
            fi
            attempt=$((attempt + 1))
            continue
        fi

        error "SQLite backup attempt $attempt/$SQLITE_BACKUP_ATTEMPTS failed because the database was busy or locked; retry budget exhausted and staging was preserved"
    else
        error "SQLite backup attempt $attempt/$SQLITE_BACKUP_ATTEMPTS failed with a non-retryable SQLite error; staging was preserved"
    fi

    chmod 600 "$database_error" 2>/dev/null || true
    if [ -e "$database_backup" ]; then
        chmod 600 "$database_backup" 2>/dev/null || true
    fi
    exit 5
done

integrity_result=$(sqlite3 -readonly "$database_backup" 'PRAGMA integrity_check;')
if [ "$integrity_result" != "ok" ]; then
    error "Staged database failed integrity verification"
    exit 6
fi

log "Creating an uploads archive in temporary staging"
tar -czf "$uploads_backup" -C "$DATA_DIR" uploads/
gzip -t "$uploads_backup"
tar -tzf "$uploads_backup" >/dev/null

database_bytes=$(file_size "$database_backup")
uploads_bytes=$(file_size "$uploads_backup")

if [ "$database_bytes" -le 0 ] || [ "$uploads_bytes" -le 0 ]; then
    error "One or more staged backup artifacts are empty"
    exit 7
fi

chmod 600 "$database_backup" "$uploads_backup"

printf 'BACKUP_STAGE_READY|database_bytes=%s|uploads_bytes=%s\n' \
    "$database_bytes" "$uploads_bytes"
