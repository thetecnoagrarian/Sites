# Deployment Guide

## 🚨 CRITICAL WARNING: Database Safety

**NEVER SYNC DATABASE FILES WITHOUT EXPLICIT BACKUP FIRST**

### What Happened (August 24, 2025)
- **Incident**: Analytics data loss during deployment
- **Cause**: rsync command accidentally overwrote live database with local database
- **Result**: Lost over 1000 page views and 3-4 days of analytics data
- **Root Cause**: rsync exclusions not working as expected

### Database Protection Rules
1. **ALWAYS backup live database before any sync operations**
2. **NEVER trust rsync exclusions for critical data**
3. **Test sync operations on non-critical files first**
4. **Verify database integrity after any deployment**

## Safe Deployment Process

### 1. Pre-Deployment Backup (REQUIRED)
```bash
# Create timestamped backup of live database
ssh deploy@172.236.119.220 "cd /home/deploy/fruitionforestgarden && \
cp src/database/blog.db src/database/blog.db.backup.$(date +%Y%m%d_%H%M%S)"
```

### 2. Safe File Sync (Exclude ALL Database Files)
```bash
# CORRECT: Exclude entire database directory
rsync -avz --exclude='node_modules' \
           --exclude='.git' \
           --exclude='src/database' \
           --exclude='src/public/uploads' \
           --exclude='*.db' \
           --exclude='*.sqlite' \
           src/ deploy@172.236.119.220:/home/deploy/fruitionforestgarden/src/
```

### 3. Verify Database Integrity
```bash
# Check that live database still has data
ssh deploy@172.236.119.220 "cd /home/deploy/fruitionforestgarden && \
sqlite3 src/database/blog.db 'SELECT COUNT(*) FROM posts; SELECT COUNT(*) FROM page_views;'"
```

### 4. Restart Application
```bash
ssh deploy@172.236.119.220 "cd /home/deploy/fruitionforestgarden && pm2 restart fruitionforestgarden"
```

## Database Backup Strategy

### Automatic Daily Backups
```bash
# Add to crontab on live server
0 2 * * * cd /home/deploy/fruitionforestgarden && \
cp src/database/blog.db backups/blog.db.$(date +%Y%m%d)
```

### Manual Backup Before Any Changes
```bash
# Always run this before deployment
ssh deploy@172.236.119.220 "cd /home/deploy/fruitionforestgarden && \
mkdir -p backups && \
cp src/database/blog.db backups/blog.db.manual.$(date +%Y%m%d_%H%M%S)"
```

## Recovery Procedures

### If Database is Lost/Corrupted
1. **Stop the application immediately**
2. **Check for backup files**
3. **Restore from most recent backup**
4. **Verify data integrity**
5. **Document the incident**

### Backup Locations
- `/home/deploy/fruitionforestgarden/backups/` - Daily backups
- `/home/deploy/fruitionforestgarden/src/database/` - Current database
- **NEVER sync from local to live without backup**

## File Sync Safety

### Safe to Sync
- ✅ Source code (JavaScript, Handlebars templates)
- ✅ CSS and static assets
- ✅ Configuration files
- ✅ Documentation

### NEVER Sync
- ❌ Database files (*.db, *.sqlite)
- ❌ Upload directories
- ❌ Log files
- ❌ Environment files (.env)

### Verification Commands
```bash
# Check what will be synced (DRY RUN)
rsync -avz --dry-run --exclude='src/database' --exclude='*.db' src/ deploy@172.236.119.220:/home/deploy/fruitionforestgarden/src/

# Verify exclusions worked
ssh deploy@172.236.119.220 "ls -la /home/deploy/fruitionforestgarden/src/database/"
```

## Emergency Contacts
- **Database Issues**: Check backups first
- **Deployment Problems**: Rollback to previous version
- **Data Loss**: Document incident and implement recovery plan

---

**Remember: It's better to be slow and safe than fast and sorry. Always backup before deployment!**
