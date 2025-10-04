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

// Middleware to check if user is authenticated and is an admin
const isAdmin = (req, res, next) => {
    console.log('isAdmin middleware called');
    console.log('Session:', req.session);
    if (!req.session.userId) {
        console.log('isAdmin: No userId in session');
        req.flash('error', 'Please log in first');
        return res.redirect('/login');
    }
    try {
        const user = User.findById(req.session.userId);
        console.log('isAdmin: User found:', user);
        if (!user || user.role !== 'admin') {
            console.log('isAdmin: User not admin or not found');
            req.flash('error', 'Unauthorized access');
            return res.redirect('/');
        }
        console.log('isAdmin: User is admin, proceeding');
        next();
    } catch (error) {
        console.error('Admin authentication error:', error);
        req.flash('error', 'An error occurred');
        res.redirect('/');
    }
};

module.exports = {
    isAuthenticated,
    isNotAuthenticated,
    attachUser,
    isAdmin
}; 