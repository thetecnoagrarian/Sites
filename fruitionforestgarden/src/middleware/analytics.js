import Analytics from '../models/analytics.js';

// Track if analytics tables have been initialized
let initialized = false;

const analyticsMiddleware = (req, res, next) => {
    // Initialize analytics tables lazily (only once, after database is ready)
    if (!initialized) {
        try {
            Analytics.init();
            initialized = true;
            console.log('✅ Analytics tables initialized successfully');
        } catch (error) {
            // Only log error if it's not a "database not initialized" error
            if (!error.message.includes('Database not initialized')) {
                console.error('❌ Error initializing analytics tables:', error);
            }
            // Don't block requests if analytics initialization fails
        }
    }

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

export default analyticsMiddleware;
