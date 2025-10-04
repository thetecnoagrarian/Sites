const User = require('../models/user');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    console.log('isAuthenticated middleware:', req.session);
    if (!req.session.userId) {
        req.flash('error', 'Please log in first');
        return res.redirect('/login');
    }
    next();
};

// Middleware to check if user is not authenticated (for login/register pages)
const isNotAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        next();
    } else {
        res.redirect('/admin');
    }
};

/**
 * Middleware to attach user to request if logged in
 */
const attachUser = async (req, res, next) => {
    if (req.session.userId) {
        try {
            const user = await User.findById(req.session.userId);
            req.user = user;
            res.locals.user = user; // Make user available in templates
        } catch (error) {
            console.error('Error attaching user:', error);
        }
    }
    next();
};

module.exports = {
    isAuthenticated,
    isNotAuthenticated,
    attachUser
}; 