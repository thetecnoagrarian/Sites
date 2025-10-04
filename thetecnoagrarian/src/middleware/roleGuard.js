const logger = require('../utils/logger');

/**
 * Middleware to protect destructive operations based on APP_ROLE
 * Blocks bulk delete, reset, and other destructive actions in production
 */
function roleGuard(operation) {
    return (req, res, next) => {
        const appRole = process.env.APP_ROLE || 'production';
        
        if (appRole === 'production') {
            logger.warn({
                operation,
                user: req.user?.username,
                ip: req.ip,
                url: req.originalUrl
            }, `Destructive operation '${operation}' blocked in production mode`);
            
            req.flash('error', `This operation is not allowed in production mode. Contact administrator if needed.`);
            return res.redirect('/admin/dashboard');
        }
        
        // Allow operation in demo mode
        logger.info({
            operation,
            user: req.user?.username,
            ip: req.ip
        }, `Destructive operation '${operation}' allowed in demo mode`);
        
        next();
    };
}

module.exports = roleGuard;
