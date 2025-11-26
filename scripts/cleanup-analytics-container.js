#!/usr/bin/env node
/**
 * Analytics Cleanup Script (Container Version)
 * Run this inside the Docker container
 * 
 * Usage in container:
 *   docker exec ffg-blog-prod node /app/scripts/cleanup-analytics-container.js 30
 *   docker exec tta-blog-prod node /app/scripts/cleanup-analytics-container.js 30
 */

import Database from 'better-sqlite3';
import path from 'path';

const retentionDays = parseInt(process.argv[2]) || 30;
const dbPath = process.env.DATABASE_PATH || '/app/data/blog.db';

async function cleanupAnalytics() {
    try {
        const db = new Database(dbPath);
        
        console.log(`\n🧹 Cleaning up analytics`);
        console.log(`📅 Retention period: ${retentionDays} days`);
        console.log(`📁 Database: ${dbPath}\n`);
        
        // Step 1: Create all-time stats tables if they don't exist
        console.log('📊 Creating all-time stats tables...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS all_time_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stat_name TEXT UNIQUE NOT NULL,
                stat_value INTEGER NOT NULL,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        db.exec(`
            CREATE TABLE IF NOT EXISTS all_time_top_pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_path TEXT NOT NULL,
                total_views INTEGER NOT NULL,
                unique_ips INTEGER NOT NULL,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(page_path)
            )
        `);
        
        // Step 2: Calculate and store all-time aggregate stats BEFORE cleanup
        console.log('📈 Calculating all-time stats...');
        
        const totalPageViews = db.prepare('SELECT COUNT(*) as count FROM page_views').get();
        const totalUniqueVisitors = db.prepare('SELECT COUNT(*) as count FROM unique_visitors').get();
        
        const topPages = db.prepare(`
            SELECT 
                page_path,
                COUNT(*) as views,
                COUNT(DISTINCT ip_address) as unique_ips
            FROM page_views 
            GROUP BY page_path
            ORDER BY views DESC
            LIMIT 100
        `).all();
        
        // Store aggregate stats
        const upsertStat = db.prepare(`
            INSERT INTO all_time_stats (stat_name, stat_value, last_updated)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(stat_name) DO UPDATE SET
                stat_value = excluded.stat_value,
                last_updated = excluded.last_updated
        `);
        
        upsertStat.run('total_page_views', totalPageViews.count);
        upsertStat.run('total_unique_visitors', totalUniqueVisitors.count);
        
        // Clear and repopulate top pages
        db.prepare('DELETE FROM all_time_top_pages').run();
        const upsertTopPage = db.prepare(`
            INSERT INTO all_time_top_pages (page_path, total_views, unique_ips, last_updated)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(page_path) DO UPDATE SET
                total_views = excluded.total_views,
                unique_ips = excluded.unique_ips,
                last_updated = excluded.last_updated
        `);
        
        for (const page of topPages) {
            upsertTopPage.run(page.page_path, page.views, page.unique_ips);
        }
        
        console.log(`✅ All-time stats saved:`);
        console.log(`   - Total page views: ${totalPageViews.count.toLocaleString()}`);
        console.log(`   - Total unique visitors: ${totalUniqueVisitors.count.toLocaleString()}`);
        console.log(`   - Top pages tracked: ${topPages.length}`);
        
        // Step 3: Count records to be deleted
        const oldPageViews = db.prepare(`
            SELECT COUNT(*) as count 
            FROM page_views 
            WHERE timestamp < datetime('now', '-' || ? || ' days')
        `).get(retentionDays);
        
        const oldUniqueVisitors = db.prepare(`
            SELECT COUNT(*) as count 
            FROM unique_visitors 
            WHERE last_visit < datetime('now', '-' || ? || ' days')
            AND first_visit < datetime('now', '-' || ? || ' days')
        `).get(retentionDays, retentionDays);
        
        console.log(`\n🗑️  Records to delete:`);
        console.log(`   - Page views: ${oldPageViews.count.toLocaleString()}`);
        console.log(`   - Unique visitors: ${oldUniqueVisitors.count.toLocaleString()}`);
        
        if (oldPageViews.count === 0 && oldUniqueVisitors.count === 0) {
            console.log('\n✅ No old records to clean up!');
            db.close();
            return;
        }
        
        // Step 4: Delete old records
        console.log('\n🗑️  Deleting old records...');
        
        const deletePageViews = db.prepare(`
            DELETE FROM page_views 
            WHERE timestamp < datetime('now', '-' || ? || ' days')
        `);
        const pageViewsResult = deletePageViews.run(retentionDays);
        
        const deleteUniqueVisitors = db.prepare(`
            DELETE FROM unique_visitors 
            WHERE last_visit < datetime('now', '-' || ? || ' days')
            AND first_visit < datetime('now', '-' || ? || ' days')
        `);
        const uniqueVisitorsResult = deleteUniqueVisitors.run(retentionDays, retentionDays);
        
        console.log(`✅ Cleanup complete:`);
        console.log(`   - Deleted ${pageViewsResult.changes.toLocaleString()} page views`);
        console.log(`   - Deleted ${uniqueVisitorsResult.changes.toLocaleString()} unique visitor records`);
        
        // Step 5: Vacuum database to reclaim space
        console.log('\n💾 Vacuuming database to reclaim space...');
        db.exec('VACUUM');
        
        // Step 6: Show final stats
        const finalPageViews = db.prepare('SELECT COUNT(*) as count FROM page_views').get();
        const finalUniqueVisitors = db.prepare('SELECT COUNT(*) as count FROM unique_visitors').get();
        
        const dbSize = db.prepare(`
            SELECT ROUND(page_count * page_size / 1024.0 / 1024.0, 2) as size_mb
            FROM pragma_page_count(), pragma_page_size()
        `).get();
        
        console.log(`\n📊 Final database state:`);
        console.log(`   - Page views remaining: ${finalPageViews.count.toLocaleString()}`);
        console.log(`   - Unique visitors remaining: ${finalUniqueVisitors.count.toLocaleString()}`);
        console.log(`   - Database size: ${dbSize.size_mb} MB`);
        console.log(`   - All-time stats preserved: ✅`);
        console.log('\n✅ Analytics cleanup complete!\n');
        
        db.close();
        
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        process.exit(1);
    }
}

cleanupAnalytics();

