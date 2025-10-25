#!/bin/bash
# Automated Backup Script for Blog Platform
# This script backs up database and uploads, with automatic cleanup

# Configuration
DATE=$(date +"%Y-%m-%d_%H-%M")
BACKUP_DIR="/app/backups"
DATA_DIR="/app/data"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
    log "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
fi

# Check if data directory exists
if [ ! -d "$DATA_DIR" ]; then
    error "Data directory not found: $DATA_DIR"
    exit 1
fi

log "Starting backup process..."

# Backup database
if [ -f "$DATA_DIR/blog.db" ]; then
    log "Backing up database..."
    cp "$DATA_DIR/blog.db" "$BACKUP_DIR/blog_$DATE.db"
    if [ $? -eq 0 ]; then
        log "Database backup completed: blog_$DATE.db"
    else
        error "Database backup failed"
        exit 1
    fi
else
    warning "Database file not found: $DATA_DIR/blog.db"
fi

# Backup uploads directory
if [ -d "$DATA_DIR/uploads" ]; then
    log "Backing up uploads directory..."
    tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C "$DATA_DIR" uploads/
    if [ $? -eq 0 ]; then
        log "Uploads backup completed: uploads_$DATE.tar.gz"
    else
        error "Uploads backup failed"
        exit 1
    fi
else
    warning "Uploads directory not found: $DATA_DIR/uploads"
fi

# Clean up old backups
log "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -type f -mtime +$RETENTION_DAYS -delete
if [ $? -eq 0 ]; then
    log "Old backup cleanup completed"
else
    warning "Backup cleanup had issues"
fi

# Show backup summary
log "Backup completed successfully!"
log "Backup files created:"
ls -lh "$BACKUP_DIR" | grep "$DATE"

# Show disk usage
log "Backup directory disk usage:"
du -sh "$BACKUP_DIR"

log "Backup process finished at $(date)"
