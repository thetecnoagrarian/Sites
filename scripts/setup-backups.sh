#!/bin/bash
# Setup automated backups for both blog sites
# This script sets up cron jobs to run backups weekly (Sundays at 2 AM)

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up automated backups...${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"

# Create backup directories on server if they don't exist
echo -e "${YELLOW}Creating backup directories...${NC}"
ssh deploy@172.236.119.220 "mkdir -p /opt/Sites/backups/tta /opt/Sites/backups/ffg"

# Create cron job entry (runs weekly on Sundays at 2 AM, keeps backups for 4 weeks)
CRON_ENTRY="0 2 * * 0 /opt/Sites/scripts/backup-host.sh >> /opt/Sites/backups/cron.log 2>&1"

echo -e "${GREEN}To set up automated backups, run these commands on the server:${NC}"
echo ""
echo "1. Copy backup script to containers:"
echo "   scp scripts/backup.sh deploy@172.236.119.220:/tmp/"
echo "   ssh deploy@172.236.119.220 'docker cp /tmp/backup.sh tta-blog-prod:/app/scripts/backup.sh'"
echo "   ssh deploy@172.236.119.220 'docker cp /tmp/backup.sh ffg-blog-prod:/app/scripts/backup.sh'"
echo ""
echo "2. Make backup script executable in containers:"
echo "   ssh deploy@172.236.119.220 'docker exec tta-blog-prod chmod +x /app/scripts/backup.sh'"
echo "   ssh deploy@172.236.119.220 'docker exec ffg-blog-prod chmod +x /app/scripts/backup.sh'"
echo ""
echo "3. Add to crontab (run 'crontab -e' on server):"
echo "   $CRON_ENTRY"
echo ""
echo "   Note: Backups run weekly (Sundays at 2 AM) and are kept for 4 weeks"
echo ""
echo -e "${YELLOW}Note: Backups will be stored in /opt/Sites/backups/ on the server${NC}"

