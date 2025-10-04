const Analytics = require('../models/analytics');

// Initialize analytics tables - ensure they exist
try {
    Analytics.init();
    console.log('✅ Analytics tables initialized successfully');
} catch (error) {
    console.error('❌ Error initializing analytics tables:', error);
}

const analyticsMiddleware = (req, res, next) => {
    // Skip tracking for static assets and admin routes
    if (req.path.startsWith('/css') || 
        req.path.startsWith('/js') || 
        req.path.startsWith('/images') || 
        req.path.startsWith('/uploads') ||
        req.path.startsWith('/admin') ||
        req.path === '/favicon.ico') {
        return next();
    }

    // Record page view asynchronously (don't block the request)
    setImmediate(() => {
        try {
            Analytics.recordPageView(
                req.path,
                req.get('User-Agent'),
                req.ip,
                req.get('Referrer')
            );

            // Record unique visitor if session exists
            if (req.session && req.session.id) {
                Analytics.recordUniqueVisitor(req.session.id);
            }
        } catch (error) {
            console.error('Analytics error:', error);
            // Don't let analytics errors break the site
        }
    });

    next();
};

module.exports = analyticsMiddleware;
