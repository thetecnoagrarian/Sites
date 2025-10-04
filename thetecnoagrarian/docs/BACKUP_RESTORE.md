# Database Backup and Restore Guide

This guide explains how to manage your blog's database and content for different deployments.

## Current Setup

You have successfully created a backup of your current database state with sample posts and images. This backup is perfect for when you deploy your blog-template to Linode.

## Backup Location

Your backup is stored in: `backups/with-samples/2025-09-01T23-33-36-446Z/`

### Backup Contents:
- `blog.db` - Complete database with sample posts
- `uploads/` - All uploaded images and media
- `restore.sh` - Script to restore this backup
- `README.md` - Detailed instructions
- `summary.txt` - Backup summary

## Workflow for Different Deployments

### For thetecnoagrarian.com (Current)
You want a clean slate without sample posts:

1. **Clean everything:**
   ```bash
   ./scripts/cleanup-for-production.sh
   ```

2. **Or clean individually:**
   ```bash
   node scripts/clean-uploads.js
   node scripts/clean-database.js
   ```

3. **Restart your application**

### For Linode Deployment (Future)
When you deploy your blog-template to Linode:

1. **Upload the backup folder** to your Linode server
2. **Run the restore script:**
   ```bash
   bash restore.sh
   ```
3. **Restart your application**

## Available Scripts

### Backup Scripts
- `scripts/backup-with-samples.js` - Creates backup with sample posts
- `scripts/backup.js` - Creates regular backup (existing)

### Cleanup Scripts
- `scripts/cleanup-for-production.sh` - Complete cleanup (recommended)
- `scripts/clean-database.js` - Cleans database only
- `scripts/clean-uploads.js` - Cleans uploads folder only

### Restore Scripts
- `backups/with-samples/[timestamp]/restore.sh` - Restores sample posts backup

## Database States

### Sample Posts Database (Backed up)
- 3 sample posts about forest gardening
- 3 categories: Gardening, Sustainability, Food Forest
- Admin user (admin/admin123)
- All associated images

### Clean Database (After cleanup)
- No posts
- No categories
- Admin user (admin/admin123)
- No images

## Best Practices

1. **Always backup before major changes**
2. **Use the cleanup script for production deployments**
3. **Keep your backup safe for future use**
4. **Test restore process before actual deployment**

## Troubleshooting

### If restore fails:
1. Check file permissions on restore.sh
2. Ensure paths are correct for your server
3. Verify database file integrity

### If cleanup fails:
1. Check if application is running
2. Ensure you have write permissions
3. Manually delete files if needed

## Next Steps

1. **For thetecnoagrarian.com:** Run the cleanup script and start creating new content
2. **For Linode:** Keep the backup safe and use it when deploying
3. **Regular backups:** Use the backup script periodically to save your work

