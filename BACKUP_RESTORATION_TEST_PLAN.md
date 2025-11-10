# Backup Restoration Test Plan

## Overview
Test the backup and restoration procedures for both blog sites to ensure data recovery works correctly.

## Test Environment
- **Site**: Fruition Forest Garden (FFG) - Primary test site
- **Backup Location**: `/opt/Sites/backups/ffg/` (host) and `/app/backups/` (container)
- **Data Location**: `/app/data/blog.db` and `/app/data/uploads/` (container)

## Pre-Test Checklist
- [x] Verify backup script exists in container
- [ ] Create a test backup
- [ ] Document current state (post count, image count)
- [ ] Note current database size and uploads size

## Test 1: Database Backup Restoration

### Steps:
1. **Create test backup**
   ```bash
   ssh deploy@172.236.119.220 "docker exec ffg-blog-prod /app/scripts/backup.sh"
   ```

2. **Document current state**
   - Count posts in database
   - Note database file size
   - List some post titles

3. **Create test data change**
   - Add a test post (or note an existing post to delete)
   - This will be our "loss" to recover from

4. **Restore database**
   - Stop container (or just copy file)
   - Copy backup database to `/app/data/blog.db`
   - Restart container

5. **Verify restoration**
   - Check post count matches pre-change state
   - Verify test post is gone (or deleted post is back)
   - Check database integrity

### Success Criteria:
- ✅ Database restored successfully
- ✅ Post count matches backup state
- ✅ No data corruption
- ✅ Site loads correctly

---

## Test 2: Uploads Backup Restoration

### Steps:
1. **Create test backup**
   ```bash
   ssh deploy@172.236.119.220 "docker exec ffg-blog-prod /app/scripts/backup.sh"
   ```

2. **Document current state**
   - Count files in uploads directory
   - Note total size
   - List some file names

3. **Create test data change**
   - Delete a test image file
   - This will be our "loss" to recover from

4. **Restore uploads**
   - Extract backup tar.gz to `/app/data/uploads/`
   - Verify file permissions
   - Restart container if needed

5. **Verify restoration**
   - Check file count matches pre-change state
   - Verify deleted file is restored
   - Check file permissions (should be readable)

### Success Criteria:
- ✅ Uploads restored successfully
- ✅ File count matches backup state
- ✅ All files accessible
- ✅ Images display correctly on site

---

## Test 3: Full System Recovery

### Steps:
1. **Create full backup**
   ```bash
   ssh deploy@172.236.119.220 "/opt/Sites/scripts/backup-host.sh"
   ```

2. **Simulate disaster**
   - Stop container
   - Delete database file
   - Delete uploads directory
   - (In real scenario, might rebuild container)

3. **Restore from backup**
   - Restore database
   - Restore uploads
   - Restart container

4. **Verify full recovery**
   - Site loads correctly
   - All posts visible
   - All images display
   - Admin login works

### Success Criteria:
- ✅ Full system recovered
- ✅ All data restored
- ✅ Site fully functional
- ✅ No errors in logs

---

## Test 4: Backup Cleanup (14-day retention)

### Steps:
1. **Check backup retention**
   - List all backups
   - Verify backups older than 14 days are deleted
   - Verify recent backups are kept

2. **Test cleanup manually**
   - Create a test backup with old timestamp
   - Run cleanup
   - Verify old backup is deleted

### Success Criteria:
- ✅ Old backups cleaned up
- ✅ Recent backups preserved
- ✅ Cleanup runs automatically

---

## Safety Measures

1. **Before each test:**
   - Create a fresh backup
   - Document current state
   - Have rollback plan ready

2. **During tests:**
   - Work on test site (FFG) first
   - Keep production site (TTA) untouched
   - Test during low-traffic period

3. **After tests:**
   - Verify site is fully functional
   - Document any issues found
   - Update recovery procedures if needed

---

## Expected Results

All tests should complete successfully with:
- ✅ Data integrity maintained
- ✅ No data loss
- ✅ Site functionality restored
- ✅ Performance not degraded

---

## Documentation Updates

After successful testing:
- [ ] Update MASTER_PROJECT_DOCUMENTATION.md with test results
- [ ] Document any issues found and fixes
- [ ] Update recovery procedures if needed
- [ ] Mark backup restoration as complete

