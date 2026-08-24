#!/bin/bash
# Create exactly one database/uploads backup set in an operator-provided staging directory.

set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-}
DATA_DIR=${DATA_DIR:-/app/data}

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
uploads_backup="$BACKUP_DIR/uploads.tar.gz"

log "Creating a consistent SQLite backup in temporary staging"
sqlite3 "$DATA_DIR/blog.db" ".backup '$database_backup'"

integrity_result=$(sqlite3 -readonly "$database_backup" 'PRAGMA integrity_check;')
if [ "$integrity_result" != "ok" ]; then
    error "Staged database failed integrity verification"
    exit 5
fi

log "Creating an uploads archive in temporary staging"
tar -czf "$uploads_backup" -C "$DATA_DIR" uploads/
gzip -t "$uploads_backup"
tar -tzf "$uploads_backup" >/dev/null

database_bytes=$(file_size "$database_backup")
uploads_bytes=$(file_size "$uploads_backup")

if [ "$database_bytes" -le 0 ] || [ "$uploads_bytes" -le 0 ]; then
    error "One or more staged backup artifacts are empty"
    exit 6
fi

chmod 600 "$database_backup" "$uploads_backup"

printf 'BACKUP_STAGE_READY|database_bytes=%s|uploads_bytes=%s\n' \
    "$database_bytes" "$uploads_bytes"
