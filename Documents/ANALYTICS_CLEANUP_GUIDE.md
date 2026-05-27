# Analytics Cleanup Guide

**Purpose**: Clean up old analytics data (older than 30 days) while preserving all-time aggregate statistics.

---

## 📊 Current Analytics Database

**FFG Production**:
- Page views: 38,428
- Unique visitors: 21,997
- Database size: 7.59 MB

---

## 🧹 Cleanup Process

The cleanup script will:
1. ✅ **Preserve all-time stats** in `all_time_stats` and `all_time_top_pages` tables
2. ✅ **Delete detailed records** older than 30 days (configurable)
3. ✅ **Vacuum database** to reclaim disk space
4. ✅ **Maintain aggregate statistics** for historical reporting

---

## 🚀 Running the Cleanup

### On Production Server

```bash
# For Fruition Forest Garden
ssh deploy@172.236.119.220 "docker exec ffg-blog-prod node /app/scripts/cleanup-analytics-container.js 30"

# For The Tecnoagrarian
ssh deploy@172.236.119.220 "docker exec tta-blog-prod node /app/scripts/cleanup-analytics-container.js 30"
```

### Custom Retention Period

```bash
# Keep 60 days instead of 30
docker exec ffg-blog-prod node /app/scripts/cleanup-analytics-container.js 60
```

---

## 📈 All-Time Stats

After cleanup, all-time statistics are preserved in:

### `all_time_stats` Table
- `total_page_views`: Total page views (all time)
- `total_unique_visitors`: Total unique visitors (all time)

### `all_time_top_pages` Table
- Top 100 pages by views (all time)
- Includes `total_views` and `unique_ips` per page

---

## 🔍 Accessing All-Time Stats

### In Analytics Model

```javascript
// Get all-time stats
const allTimeStats = Analytics.getAllTimeStats();
console.log(allTimeStats.totalPageViews);  // All-time total
console.log(allTimeStats.topPages);        // Top pages (all time)
```

### Direct Database Query

```bash
# View all-time stats
docker exec ffg-blog-prod sqlite3 /app/data/blog.db "
SELECT stat_name, stat_value 
FROM all_time_stats;
"

# View top pages (all time)
docker exec ffg-blog-prod sqlite3 /app/data/blog.db "
SELECT page_path, total_views, unique_ips 
FROM all_time_top_pages 
ORDER BY total_views DESC 
LIMIT 25;
"
```

---

## ⏰ Automated Cleanup (Optional)

Add to cron job for automatic monthly cleanup:

```bash
# On server, add to crontab (crontab -e)
# Run cleanup on 1st of each month at 2 AM
0 2 1 * * docker exec ffg-blog-prod node /app/scripts/cleanup-analytics-container.js 30 >> /opt/Sites/backups/ffg/analytics-cleanup.log 2>&1
0 2 1 * * docker exec tta-blog-prod node /app/scripts/cleanup-analytics-container.js 30 >> /opt/Sites/backups/tta/analytics-cleanup.log 2>&1
```

---

## 📊 Expected Results

**Before Cleanup**:
- Page views: 38,428
- Database size: 7.59 MB

**After Cleanup (30 days retention)**:
- Page views: ~Recent 30 days only
- Database size: Reduced (depends on activity)
- All-time stats: Preserved ✅

---

## ✅ Verification

After running cleanup, verify:

```bash
# Check remaining records
docker exec ffg-blog-prod sqlite3 /app/data/blog.db "
SELECT COUNT(*) as remaining FROM page_views;
SELECT COUNT(*) as all_time_total FROM all_time_stats WHERE stat_name = 'total_page_views';
"

# Check database size
docker exec ffg-blog-prod sqlite3 /app/data/blog.db "
SELECT ROUND(page_count * page_size / 1024.0 / 1024.0, 2) as size_mb
FROM pragma_page_count(), pragma_page_size();
"
```

---

## 🔄 Updating Analytics Dashboard

To show all-time stats in the admin dashboard, update the analytics route:

```javascript
// In routes/admin.js
const allTimeStats = Analytics.getAllTimeStats();
res.render('admin/analytics', {
    // ... existing stats ...
    allTimeStats: allTimeStats
});
```

---

## ⚠️ Important Notes

- **Backup First**: Always backup database before cleanup
- **One-Time Stats**: All-time stats are calculated before deletion
- **Irreversible**: Deleted detailed records cannot be recovered
- **Top Pages**: Only top 100 pages are preserved in all-time stats

---

**Last Updated**: November 18, 2025

