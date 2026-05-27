# Automatic Backup System Guide

**Purpose**: Understand how backups work and what gets backed up.

---

## 📦 What Gets Backed Up

### For Each Site (FFG & TTA):

1. **Database** (`blog.db`)
   - All posts, categories, users, sessions
   - Analytics data (page views, unique visitors)
   - Complete SQLite database file

2. **Uploads Directory** (`/app/data/uploads/`)
   - All uploaded images (thumbnails, medium, large sizes)
   - Original image files
   - Compressed as `.tar.gz` archive

### What's NOT Backed Up:

- Source code (in Git repository)
- Docker images (can be rebuilt)
- Nginx configuration (in `/etc/nginx/`)
- SSL certificates (managed by Certbot)

---

## ⚙️ How Automatic Backups Work

### Current Status: ⚠️ **MANUAL SETUP REQUIRED**

The backup scripts exist, but **cron jobs need to be set up manually** to run automatically.

### Backup Scripts Available:

1. **Container Script** (`/app/scripts/backup.sh`)
   - Runs inside Docker containers
   - Backs up database and uploads
   - Stores backups in `/app/backups/` (inside container)

2. **Host Script** (`/opt/Sites/scripts/backup-host.sh`)
   - Runs on the server host
   - Executes container backups
   - Copies backups to `/opt/Sites/backups/` (on host)

---

## 🔄 Backup Process Flow

```
Cron Job (2 AM daily)
    ↓
Host Script: /opt/Sites/scripts/backup-host.sh
    ↓
For each site (FFG & TTA):
    ↓
1. Execute: docker exec [container] /app/scripts/backup.sh
    ↓
2. Inside container:
   - Backup database → /app/backups/blog_YYYY-MM-DD_HH-MM.db
   - Backup uploads → /app/backups/uploads_YYYY-MM-DD_HH-MM.tar.gz
   - Clean up backups older than 14 days
    ↓
3. Copy backups from container to host:
   - docker cp [container]:/app/backups → /opt/Sites/backups/[site]/
    ↓
4. Clean up old host backups (14 days retention)
```

---

## 📋 Setting Up Automatic Backups

### Step 1: Verify Backup Scripts Exist

```bash
# SSH to server
ssh deploy@172.236.119.220

# Check if scripts exist
ls -la /opt/Sites/scripts/backup*.sh

# Check if scripts exist in containers
docker exec ffg-blog-prod ls -la /app/scripts/backup.sh
docker exec tta-blog-prod ls -la /app/scripts/backup.sh
```

### Step 2: Copy Scripts to Containers (If Needed)

```bash
# Copy backup script to containers
docker cp /opt/Sites/scripts/backup.sh ffg-blog-prod:/app/scripts/backup.sh
docker cp /opt/Sites/scripts/backup.sh tta-blog-prod:/app/scripts/backup.sh

# Make scripts executable
docker exec ffg-blog-prod chmod +x /app/scripts/backup.sh
docker exec tta-blog-prod chmod +x /app/scripts/backup.sh
```

### Step 3: Test Manual Backup

```bash
# Test backup for FFG
docker exec ffg-blog-prod /app/scripts/backup.sh

# Test backup for TTA
docker exec tta-blog-prod /app/scripts/backup.sh

# Test host script (backs up both)
/opt/Sites/scripts/backup-host.sh
```

### Step 4: Set Up Cron Job

```bash
# Edit crontab
crontab -e

# Add these lines (runs daily at 2 AM):
0 2 * * * /opt/Sites/scripts/backup-host.sh >> /opt/Sites/backups/backup.log 2>&1

# Or run individual backups:
# 0 2 * * * docker exec ffg-blog-prod /app/scripts/backup.sh >> /opt/Sites/backups/ffg/backup.log 2>&1
# 0 2 * * * docker exec tta-blog-prod /app/scripts/backup.sh >> /opt/Sites/backups/tta/backup.log 2>&1
```

### Step 5: Verify Cron Job

```bash
# List cron jobs
crontab -l

# Check cron service is running
sudo systemctl status cron
# or
sudo systemctl status crond
```

---

## 📍 Backup Locations

### Inside Containers:
- **FFG**: `/app/backups/` (inside `ffg-blog-prod` container)
- **TTA**: `/app/backups/` (inside `tta-blog-prod` container)

### On Host Server:
- **Main Location**: `/opt/Sites/backups/`
  - `/opt/Sites/backups/ffg/` - FFG backups
  - `/opt/Sites/backups/tta/` - TTA backups
  - `/opt/Sites/backups/backup.log` - Backup log file

### Backup File Names:
- Database: `blog_YYYY-MM-DD_HH-MM.db`
- Uploads: `uploads_YYYY-MM-DD_HH-MM.tar.gz`
- Example: `blog_2025-11-13_02-00.db`

---

## ⏰ Backup Schedule

### Recommended Schedule:
- **Frequency**: Daily
- **Time**: 2:00 AM (low traffic time)
- **Retention**: 14 days (automatically deleted after)

### Current Status:
- ⚠️ **Not automatically scheduled** - Needs cron job setup
- ✅ **Scripts exist** - Ready to use
- ✅ **Manual backups work** - Can run anytime

---

## 🧪 Manual Backup Commands

### Run Backup for One Site:

```bash
# FFG backup
ssh deploy@172.236.119.220 "docker exec ffg-blog-prod /app/scripts/backup.sh"

# TTA backup
ssh deploy@172.236.119.220 "docker exec tta-blog-prod /app/scripts/backup.sh"
```

### Run Backup for Both Sites:

```bash
# Host script (backs up both)
ssh deploy@172.236.119.220 "/opt/Sites/scripts/backup-host.sh"
```

### Check Backup Status:

```bash
# List recent backups
ssh deploy@172.236.119.220 "ls -lht /opt/Sites/backups/ffg/ | head -10"
ssh deploy@172.236.119.220 "ls -lht /opt/Sites/backups/tta/ | head -10"

# Check backup sizes
ssh deploy@172.236.119.220 "du -sh /opt/Sites/backups/*"
```

---

## 🗑️ Automatic Cleanup

### Retention Policy:
- **Retention Period**: 14 days
- **Automatic Deletion**: Backups older than 14 days are automatically deleted
- **Cleanup Runs**: Every time backup script runs

### Manual Cleanup:

```bash
# Delete backups older than 14 days manually
find /opt/Sites/backups -type f -mtime +14 -delete

# Delete backups older than 7 days (if needed)
find /opt/Sites/backups -type f -mtime +7 -delete
```

---

## 📊 Backup Statistics

### Check Backup Status:

```bash
# Count backups
ssh deploy@172.236.119.220 "find /opt/Sites/backups -name '*.db' | wc -l"
ssh deploy@172.236.119.220 "find /opt/Sites/backups -name '*.tar.gz' | wc -l"

# Total backup size
ssh deploy@172.236.119.220 "du -sh /opt/Sites/backups"

# List recent backups with sizes
ssh deploy@172.236.119.220 "ls -lht /opt/Sites/backups/ffg/ | head -5"
```

---

## 🔍 Verify Backups Are Working

### Check Backup Logs:

```bash
# View backup log
ssh deploy@172.236.119.220 "tail -50 /opt/Sites/backups/backup.log"

# Check for errors
ssh deploy@172.236.119.220 "grep -i error /opt/Sites/backups/backup.log"
```

### Test Backup Restoration:

```bash
# Verify database backup is valid
ssh deploy@172.236.119.220 "docker exec ffg-blog-prod sqlite3 /app/backups/blog_YYYY-MM-DD_HH-MM.db 'PRAGMA integrity_check;'"

# Verify uploads backup
ssh deploy@172.236.119.220 "tar -tzf /opt/Sites/backups/ffg/uploads_YYYY-MM-DD_HH-MM.tar.gz | head -10"
```

---

## ⚠️ Important Notes

1. **Cron Jobs Not Set Up**: Automatic backups require manual cron job setup
2. **Backup Location**: Backups stored in `/opt/Sites/backups/` on host
3. **Retention**: 14 days automatic cleanup
4. **Database Only**: Backs up database and uploads, not source code
5. **Source Code**: Code is in Git repository (separate backup)

---

## ✅ Quick Setup Checklist

- [ ] Verify backup scripts exist in containers
- [ ] Test manual backup works
- [ ] Set up cron job for automatic backups
- [ ] Verify cron job is running
- [ ] Check backup location exists
- [ ] Test backup restoration
- [ ] Monitor backup logs

---

## 🚀 Next Steps

1. **Set up cron job** for automatic daily backups
2. **Test backup restoration** to verify backups work
3. **Monitor backup logs** to ensure they're running
4. **Set up off-site backup** (optional - copy to external storage)

---

**Last Updated**: November 13, 2025  
**Status**: Scripts ready, cron job setup required for automation

