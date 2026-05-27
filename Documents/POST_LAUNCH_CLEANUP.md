# Post-Launch Cleanup Guide

**Purpose**: Clean up old files and backups after successful DNS migration.

---

## ✅ Current Project Location

**The project should stay in `/opt/Sites/`** - This is the correct location for production!

### Why `/opt/Sites` is Better Than Home Directory

1. **Standard Location**: `/opt/` is the standard directory for optional/third-party software
2. **Not User-Specific**: Not tied to a specific user account
3. **Easier Permissions**: Better for Docker and system services
4. **Production Best Practice**: Common pattern for production deployments
5. **Survives User Changes**: If you change users, the project stays

**Keep the project in `/opt/Sites/`** ✅

---

## 🧹 What to Clean Up After DNS Migration

### Safe to Delete (After Migration is Complete)

**Location**: `/home/deploy/` (your home directory)

```bash
# These are old files/backups - safe to delete after migration:
/home/deploy/
├── backups/                          # Old backups (if not needed)
├── fruitionforestgarden/              # Old version (replaced by /opt/Sites/)
└── fruitionforestgarden-livesync.tar.gz  # Old backup file
```

### Keep These (Active Project)

**Location**: `/opt/Sites/` - **DO NOT DELETE!**

```bash
/opt/Sites/                           # ⭐ KEEP THIS - Active project!
├── fruitionforestgarden/            # New version (active)
├── thetecnoagrarian/                 # Active site
├── blog-core/                        # Shared code
├── docker-compose.prod.yml          # Production config
├── .env                              # Secrets
└── backups/                          # Active backups (keep)
```

---

## 📋 Post-Launch Cleanup Steps

### Step 1: Verify Migration is Complete

**Before deleting anything, verify the new site is working:**

```bash
# 1. Test production domain
curl -I https://fruitionforestgarden.com

# 2. Verify it's serving the new version (check for new features)
# 3. Test admin login
# 4. Verify all features work
# 5. Check container is running
docker ps | grep ffg-blog-prod
```

**Wait at least 24-48 hours after migration** to ensure everything is stable before cleanup.

---

### Step 2: Backup Old Files (Just in Case)

**Before deleting, create a backup:**

```bash
# Create a backup of old files (just in case)
cd ~
tar -czf ~/old-ffg-backup-$(date +%Y%m%d).tar.gz \
    fruitionforestgarden/ \
    fruitionforestgarden-livesync.tar.gz \
    backups/ 2>/dev/null

# Verify backup was created
ls -lh ~/old-ffg-backup-*.tar.gz
```

**Store this backup somewhere safe** (external drive, cloud storage) before deleting.

---

### Step 3: Delete Old Files

**After verifying migration and creating backup:**

```bash
# Navigate to home directory
cd ~

# List what you're about to delete
ls -la backups/ fruitionforestgarden/ fruitionforestgarden-livesync.tar.gz

# Delete old fruitionforestgarden folder (old version)
rm -rf ~/fruitionforestgarden/

# Delete old backup file
rm -f ~/fruitionforestgarden-livesync.tar.gz

# Delete old backups folder (if not needed)
# ⚠️ Only if you're sure you don't need these backups!
# rm -rf ~/backups/

# Verify deletion
ls -la
```

---

### Step 4: Verify Active Project is Intact

**Make sure the active project is still there:**

```bash
# Check active project
cd /opt/Sites
ls -la

# Verify both sites exist
ls -d fruitionforestgarden thetecnoagrarian

# Check containers are running
docker ps

# Test sites are accessible
curl -I http://localhost:4000  # FFG
curl -I http://localhost:4002   # TTA
```

---

## ⚠️ What NOT to Delete

### Never Delete These:

```bash
/opt/Sites/                    # ⚠️ NEVER DELETE - Active project!
├── fruitionforestgarden/      # ⚠️ Active site
├── thetecnoagrarian/          # ⚠️ Active site
├── blog-core/                 # ⚠️ Shared code
├── docker-compose.prod.yml    # ⚠️ Production config
├── .env                       # ⚠️ Secrets
└── backups/                   # ⚠️ Active backups

/etc/nginx/                    # ⚠️ Nginx configs
/var/lib/docker/volumes/       # ⚠️ Docker volumes (databases!)
```

---

## 📊 Final Clean Structure

### After Cleanup:

```
/home/deploy/                  # Your home directory
├── .ssh/                      # SSH keys (keep)
├── old-ffg-backup-*.tar.gz   # Backup of old files (optional - can delete after verifying)
└── ... (other personal files)

/opt/Sites/                    # ⭐ Active project (KEEP!)
├── fruitionforestgarden/     # New version (active)
├── thetecnoagrarian/          # Active site
├── blog-core/                 # Shared code
├── docker-compose.prod.yml    # Production config
├── .env                       # Secrets
└── backups/                   # Active backups
```

---

## ✅ Cleanup Checklist

**Before deleting old files:**

- [ ] DNS migration complete and verified
- [ ] Production site working correctly
- [ ] All features tested and working
- [ ] Admin login working
- [ ] At least 24-48 hours passed since migration
- [ ] Backup of old files created
- [ ] Verified active project in `/opt/Sites/` is intact
- [ ] Containers running correctly
- [ ] Nginx serving correctly

**After cleanup:**

- [ ] Old files deleted from home directory
- [ ] Active project in `/opt/Sites/` still intact
- [ ] Sites still accessible
- [ ] Containers still running
- [ ] No errors in logs

---

## 🔄 If Something Goes Wrong

**If you accidentally delete something important:**

```bash
# Restore from backup
cd ~
tar -xzf old-ffg-backup-YYYYMMDD.tar.gz

# Or restore from active project
# The active project in /opt/Sites/ should still be fine
```

---

## 💡 Best Practices

1. **Keep project in `/opt/Sites/`** - Don't move it to home directory
2. **Wait before cleanup** - Give it 24-48 hours after migration
3. **Create backups** - Always backup before deleting
4. **Verify first** - Test everything before cleanup
5. **Keep active backups** - Don't delete `/opt/Sites/backups/`

---

## 📝 Summary

**Answer to your question:**

1. ✅ **Yes, you can delete** the old `fruitionforestgarden/` folder in `/home/deploy/` after migration
2. ✅ **No, don't move the project** - Keep it in `/opt/Sites/` (it's the correct location)
3. ✅ **Clean up home directory** - Remove old files/backups after verifying migration
4. ✅ **Keep active project** - `/opt/Sites/` is where it should stay

---

**Last Updated**: November 13, 2025  
**Timing**: Wait 24-48 hours after DNS migration before cleanup

