/**
 * Middleware to check if user is authenticated
 * Redirects to login page if not authenticated
 */
const isAuthenticated = (req, res, next) => {
    if (!req.session.userId) {
        req.flash('error', 'Please log in first');
        return res.redirect('/login');
    }
    next();
};

module.exports = isAuthenticated; 