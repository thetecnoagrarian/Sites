#!/bin/bash
# Safe disk space cleanup script for server
# This script checks what's using space and cleans up safely

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🧹 Disk Space Cleanup Script${NC}"
echo ""

# Get server details
read -p "SSH User (e.g., deploy): " SSH_USER
read -p "Server IP (e.g., 172.236.119.220): " SERVER_IP

echo ""
echo -e "${BLUE}Step 1: Checking current disk usage...${NC}"
ssh ${SSH_USER}@${SERVER_IP} << 'EOF'
    echo "Overall disk usage:"
    df -h / | tail -1
    echo ""
    echo "Docker disk usage:"
    docker system df
    echo ""
    echo "Backup directory size:"
    du -sh /opt/Sites/backups 2>/dev/null || echo "No backups directory"
    echo ""
    echo "Home directory size (if old files exist):"
    du -sh ~/fruitionforestgarden ~/backups ~/fruitionforestgarden-livesync.tar.gz 2>/dev/null | head -5 || echo "No old files found"
EOF

echo ""
read -p "Review the output above. Press Enter to proceed with cleanup..."

echo ""
echo -e "${YELLOW}Step 2: Cleaning up Docker (safe - removes unused images and build cache)...${NC}"
ssh ${SSH_USER}@${SERVER_IP} << 'EOF'
    echo "Removing unused Docker images..."
    docker image prune -a -f
    
    echo ""
    echo "Removing Docker build cache..."
    docker builder prune -a -f
    
    echo ""
    echo "Docker cleanup complete. New usage:"
    docker system df
EOF

echo ""
echo -e "${YELLOW}Step 3: Cleaning up old backups (keeping last 7 days)...${NC}"
ssh ${SSH_USER}@${SERVER_IP} << 'EOF'
    echo "Finding backups older than 7 days..."
    find /opt/Sites/backups -type f -mtime +7 -ls 2>/dev/null | head -10 || echo "No old backups found"
    
    echo ""
    read -p "Delete backups older than 7 days? (y/n): " confirm
    if [ "$confirm" = "y" ]; then
        find /opt/Sites/backups -type f -mtime +7 -delete
        echo "✓ Old backups deleted"
    else
        echo "Skipped backup cleanup"
    fi
    
    echo ""
    echo "Backup directory size after cleanup:"
    du -sh /opt/Sites/backups 2>/dev/null || echo "No backups directory"
EOF

echo ""
echo -e "${YELLOW}Step 4: Checking for old files in home directory...${NC}"
ssh ${SSH_USER}@${SERVER_IP} << 'EOF'
    echo "Checking for old fruitionforestgarden folder..."
    if [ -d ~/fruitionforestgarden ]; then
        echo "Found: ~/fruitionforestgarden ($(du -sh ~/fruitionforestgarden | cut -f1))"
        echo "⚠️  This is the OLD version - safe to delete AFTER migration is complete"
    else
        echo "No old fruitionforestgarden folder found"
    fi
    
    if [ -f ~/fruitionforestgarden-livesync.tar.gz ]; then
        echo "Found: ~/fruitionforestgarden-livesync.tar.gz ($(du -sh ~/fruitionforestgarden-livesync.tar.gz | cut -f1))"
        echo "⚠️  This is an old backup - safe to delete AFTER migration is complete"
    fi
EOF

echo ""
echo -e "${GREEN}Step 5: Final disk usage check...${NC}"
ssh ${SSH_USER}@${SERVER_IP} << 'EOF'
    echo "Overall disk usage:"
    df -h / | tail -1
    echo ""
    echo "Docker disk usage:"
    docker system df
EOF

echo ""
echo -e "${GREEN}✅ Cleanup complete!${NC}"
echo ""
echo "If disk usage is still high (>90%), you may need to:"
echo "1. Wait until after migration to delete old files in ~/fruitionforestgarden"
echo "2. Check for other large files: ssh ${SSH_USER}@${SERVER_IP} 'du -sh /* 2>/dev/null | sort -h | tail -10'"
echo ""

