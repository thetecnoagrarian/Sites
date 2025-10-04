import express from 'express';
import { isNotAuthenticated } from '@ffg/blog-core';

const router = express.Router();

// Login page
router.get('/login', isNotAuthenticated, (req, res) => {
    res.render('auth/login', { 
        title: 'Login',
        error: req.flash('error')
    });
});

// Login handler
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const { User } = await import('@ffg/blog-core');
        const user = User.findByUsername(username);
        console.log('User object from database:', user); // Debugging line
        if (!user) {
            req.flash('error', 'Invalid username or password');
            return res.redirect('/login');
        }

        const isValid = User.verifyPassword(password, user.password_hash);
        if (!isValid) {
            req.flash('error', 'Invalid username or password');
            return res.redirect('/login');
        }

        req.session.userId = user.id;
        res.redirect('/admin');
    } catch (error) {
        console.error('Login error:', error);
        req.flash('error', 'An error occurred during login');
        res.redirect('/login');
    }
});

// Logout handler
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// Add this route to handle logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/'); // Redirect to home on error
    }
    res.clearCookie('connect.sid'); // Clear the session cookie
    res.redirect('/'); // Redirect to home page
  });
});

export default router; 