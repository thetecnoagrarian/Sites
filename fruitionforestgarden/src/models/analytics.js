const db = require('./db');

class Analytics {
    static init() {
        // Create analytics table if it doesn't exist
        db.exec(`
            CREATE TABLE IF NOT EXISTS page_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_path TEXT NOT NULL,
                user_agent TEXT,
                ip_address TEXT,
                referrer TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create unique visitors table
        db.exec(`
            CREATE TABLE IF NOT EXISTS unique_visitors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE,
                first_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
                visit_count INTEGER DEFAULT 1
            )
        `);
    }

    static recordPageView(pagePath, userAgent, ipAddress, referrer) {
        try {
            // Validate input data
            if (!pagePath || typeof pagePath !== 'string') {
                console.warn('Invalid page path for analytics:', pagePath);
                return null;
            }
            
            // Sanitize and truncate data to prevent database issues
            const sanitizedPath = pagePath.substring(0, 500); // Limit path length
            const sanitizedUserAgent = userAgent ? userAgent.substring(0, 500) : null;
            const sanitizedIp = ipAddress ? ipAddress.substring(0, 45) : null; // IPv6 max length
            const sanitizedReferrer = referrer ? referrer.substring(0, 500) : null;
            
            const stmt = db.prepare(`
                INSERT INTO page_views (page_path, user_agent, ip_address, referrer)
                VALUES (?, ?, ?, ?)
            `);
            const result = stmt.run(sanitizedPath, sanitizedUserAgent, sanitizedIp, sanitizedReferrer);
            
            // Verify the insert was successful
            if (result.changes === 1) {
                console.log(`✅ Page view recorded: ${sanitizedPath}`);
                return result;
            } else {
                console.warn('⚠️ Page view insert may have failed:', result);
                return result;
            }
        } catch (error) {
            console.error('❌ Error recording page view:', error);
            // Don't throw error to prevent breaking the site
            return null;
        }
    }

    static recordUniqueVisitor(sessionId) {
        try {
            // Try to update existing visitor
            let stmt = db.prepare(`
                UPDATE unique_visitors 
                SET last_visit = CURRENT_TIMESTAMP, visit_count = visit_count + 1
                WHERE session_id = ?
            `);
            let result = stmt.run(sessionId);
            
            // If no rows were updated, insert new visitor
            if (result.changes === 0) {
                stmt = db.prepare(`
                    INSERT INTO unique_visitors (session_id)
                    VALUES (?)
                `);
                result = stmt.run(sessionId);
            }
            
            return result;
        } catch (error) {
            console.error('Error recording unique visitor:', error);
            throw error;
        }
    }

    static getPageViewStats(days = 30, limit = 25) {
        try {
            const stmt = db.prepare(`
                SELECT 
                    page_path,
                    COUNT(*) as views,
                    COUNT(DISTINCT ip_address) as unique_ips
                FROM page_views 
                WHERE timestamp >= datetime('now', '-${days} days')
                GROUP BY page_path
                ORDER BY views DESC
                LIMIT ?
            `);
            return stmt.all(limit);
        } catch (error) {
            console.error('Error getting page view stats:', error);
            return [];
        }
    }

    static getTotalStats() {
        try {
            const pageViews = db.prepare('SELECT COUNT(*) as count FROM page_views').get();
            const uniqueVisitors = db.prepare('SELECT COUNT(*) as count FROM unique_visitors').get();
            const todayViews = db.prepare(`
                SELECT COUNT(*) as count 
                FROM page_views 
                WHERE date(timestamp) = date('now')
            `).get();
            
            return {
                totalPageViews: pageViews.count,
                totalUniqueVisitors: uniqueVisitors.count,
                todayPageViews: todayViews.count
            };
        } catch (error) {
            console.error('Error getting total stats:', error);
            return { totalPageViews: 0, totalUniqueVisitors: 0, todayPageViews: 0 };
        }
    }

    static getRecentActivity(limit = 10) {
        try {
            const stmt = db.prepare(`
                SELECT page_path, ip_address, timestamp
                FROM page_views 
                ORDER BY timestamp DESC 
                LIMIT ?
            `);
            return stmt.all(limit);
        } catch (error) {
            console.error('Error getting recent activity:', error);
            return [];
        }
    }

    // Check database health and table integrity
    static checkDatabaseHealth() {
        try {
            // Check if tables exist and have data
            const pageViewsCount = db.prepare('SELECT COUNT(*) as count FROM page_views').get();
            const uniqueVisitorsCount = db.prepare('SELECT COUNT(*) as count FROM unique_visitors').get();
            
            // Check table structure
            const pageViewsSchema = db.prepare("PRAGMA table_info(page_views)").all();
            const uniqueVisitorsSchema = db.prepare("PRAGMA table_info(unique_visitors)").all();
            
            return {
                healthy: true,
                tables: {
                    page_views: {
                        exists: pageViewsSchema.length > 0,
                        rowCount: pageViewsCount.count,
                        columns: pageViewsSchema.length
                    },
                    unique_visitors: {
                        exists: uniqueVisitorsSchema.length > 0,
                        rowCount: uniqueVisitorsCount.count,
                        columns: uniqueVisitorsSchema.length
                    }
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Database health check failed:', error);
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = Analytics;
