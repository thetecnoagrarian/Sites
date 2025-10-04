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
            const stmt = db.prepare(`
                INSERT INTO page_views (page_path, user_agent, ip_address, referrer)
                VALUES (?, ?, ?, ?)
            `);
            return stmt.run(pagePath, userAgent, ipAddress, referrer);
        } catch (error) {
            console.error('Error recording page view:', error);
            throw error;
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

    static getPageViewStats(days = 30) {
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
            `);
            return stmt.all();
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
}

module.exports = Analytics;
