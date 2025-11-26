#!/bin/bash
# Host-side backup script that runs container backups and copies to host
# This script should be run from the server host, not inside containers

# Configuration
DATE=$(date +"%Y-%m-%d_%H-%M")
HOST_BACKUP_DIR="/opt/Sites/backups"
RETENTION_DAYS=14

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

# Create host backup directories
mkdir -p "$HOST_BACKUP_DIR/tta" "$HOST_BACKUP_DIR/ffg"

log "Starting backup process for both sites..."

# Backup The Tecnoagrarian
log "Backing up The Tecnoagrarian..."
if docker exec tta-blog-prod /app/scripts/backup.sh > "$HOST_BACKUP_DIR/tta/backup_$DATE.log" 2>&1; then
    # Copy backups from container to host
    docker cp tta-blog-prod:/app/backups "$HOST_BACKUP_DIR/tta/container_backups_$DATE" 2>/dev/null || true
    log "The Tecnoagrarian backup completed"
else
    error "The Tecnoagrarian backup failed - check $HOST_BACKUP_DIR/tta/backup_$DATE.log"
fi

# Backup Fruition Forest Garden
log "Backing up Fruition Forest Garden..."
if docker exec ffg-blog-prod /app/scripts/backup.sh > "$HOST_BACKUP_DIR/ffg/backup_$DATE.log" 2>&1; then
    # Copy backups from container to host
    docker cp ffg-blog-prod:/app/backups "$HOST_BACKUP_DIR/ffg/container_backups_$DATE" 2>/dev/null || true
    log "Fruition Forest Garden backup completed"
else
    error "Fruition Forest Garden backup failed - check $HOST_BACKUP_DIR/ffg/backup_$DATE.log"
fi

# Clean up old host backups
log "Cleaning up backups older than $RETENTION_DAYS days on host..."
# Clean up individual backup files
find "$HOST_BACKUP_DIR" -type f -mtime +$RETENTION_DAYS -delete
# Clean up nested backup directories (container_backups_*)
find "$HOST_BACKUP_DIR" -type d -name "container_backups_*" -mtime +$RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true
# Clean up individual backup files inside site directories
find "$HOST_BACKUP_DIR/ffg" -type f \( -name "blog_*.db" -o -name "uploads_*.tar.gz" \) -mtime +$RETENTION_DAYS -delete
find "$HOST_BACKUP_DIR/tta" -type f \( -name "blog_*.db" -o -name "uploads_*.tar.gz" \) -mtime +$RETENTION_DAYS -delete
# Clean up empty directories
find "$HOST_BACKUP_DIR" -type d -empty -delete 2>/dev/null || true

log "Backup process completed!"
log "Backup location: $HOST_BACKUP_DIR"


