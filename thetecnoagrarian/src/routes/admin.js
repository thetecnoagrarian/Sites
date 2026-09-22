import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { isAuthenticated, isAdmin, Post, Category, User, createEditorialAdminRouter } from '@ffg/blog-core';
import Analytics from '../models/analytics.js';

const router = express.Router();

// Top-level logger for all admin requests
router.use((req, res, next) => {
  console.log('ADMIN ROUTER REQUEST:', req.method, req.originalUrl);
  next();
});

// Note: isAdmin middleware is imported from ../middleware/auth

// Protect all admin routes
router.use(isAuthenticated);

// Root admin route - redirect to dashboard
router.get('/', isAdmin, (req, res) => {
    res.redirect('/admin/dashboard');
});

// Admin dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        console.log('Loading admin dashboard...');
        // Get all posts with their categories
        const posts = Post.findAll(100, 0); // Fetch up to 100 posts
        console.log('Found posts:', posts.length);
        
        for (const post of posts) {
            try {
                post.categories = Post.getCategories(post.id);
                console.log('Dashboard: Post', post.id, 'categories:', post.categories);
            } catch (categoryError) {
                console.error('Error loading categories for post', post.id, ':', categoryError);
                post.categories = [];
            }
        }

        // Get all categories
        const categories = Category.findAll();
        console.log('Found categories:', categories.length);
        
        console.log('Rendering dashboard template...');
        res.render('admin/dashboard', {
            layout: 'admin',
            title: 'Admin Dashboard',
            posts,
            categories,
            success: req.flash('success'),
            error: req.flash('error'),
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            },
            user: req.user,
            csrfToken: req.csrfToken()
        });
        console.log('Dashboard rendered successfully');
    } catch (error) {
        console.error('Dashboard error:', error);
        req.flash('error', 'Failed to load dashboard: ' + error.message);
        res.redirect('/');
    }
});

// Update the delete post route to delete all image sizes for each image
router.post('/dashboard/posts/:id/delete', isAdmin, async (req, res) => {
    try {
        const post = Post.findById(req.params.id);
        if (!post) {
            req.flash('error', 'Post not found');
            return res.redirect('/admin/dashboard');
        }
        // Delete associated images (all sizes)
        if (post.images && Array.isArray(post.images)) {
            for (const imageObj of post.images) {
                for (const size of ['thumbnail', 'medium', 'large']) {
                    if (imageObj && imageObj[size]) {
                        try {
                            await fs.unlink(path.join(process.cwd(), 'src/public', imageObj[size]));
                        } catch (err) {
                            if (err.code !== 'ENOENT') {
                                console.error('Error deleting image file:', err);
                            }
                        }
                    }
                }
            }
        }
        Post.delete(post.id);
        req.flash('success', 'Post deleted successfully');
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Error deleting post:', error);
        req.flash('error', 'Failed to delete post');
        res.redirect('/admin/dashboard');
    }
});

// Categories list
router.get('/categories', isAdmin, async (req, res) => {
    try {
        const categories = Category.findAll();
        res.render('admin/categories', {
            title: 'Manage Categories',
            categories,
            success: req.flash('success'),
            error: req.flash('error'),
            user: req.user,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        req.flash('error', 'Failed to fetch categories');
        res.redirect('/admin');
    }
});

// Create category
router.post('/categories', isAdmin, (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            req.flash('error', 'Category name is required');
            return res.redirect('/admin/dashboard');
        }

        Category.create(name);
        req.flash('success', 'Category created successfully');
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Error creating category:', error);
        req.flash('error', 'Failed to create category');
        res.redirect('/admin/dashboard');
    }
});

// Update category
router.post('/categories/update', isAdmin, (req, res) => {
    try {
        const { categoryId, name } = req.body;
        if (!categoryId || !name) {
            req.flash('error', 'Category ID and name are required');
            return res.redirect('/admin/categories');
        }

        Category.update(categoryId, name);
        req.flash('success', 'Category updated successfully');
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Error updating category:', error);
        req.flash('error', 'Failed to update category');
        res.redirect('/admin/dashboard');
    }
});

// Delete category
router.post('/categories/:id/delete', isAdmin, (req, res) => {
    try {
        const categoryId = req.params.id;
        Category.delete(categoryId);
        req.flash('success', 'Category deleted successfully');
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Error deleting category:', error);
        req.flash('error', 'Failed to delete category');
        res.redirect('/admin/dashboard');
    }
});

// Shared admin-only Public Person and editorial post workflow.
router.use(createEditorialAdminRouter({ allowOverwrite: false }));

// Analytics dashboard
router.get('/analytics', isAdmin, async (req, res) => {
    try {
        // Get row limits from query parameters with defaults
        const pageViewLimit = parseInt(req.query.pageViewLimit) || 25;
        const activityLimit = parseInt(req.query.activityLimit) || 25;
        
        const totalStats = Analytics.getTotalStats();
        const pageViewStats = Analytics.getPageViewStats(30, pageViewLimit);
        const recentActivity = Analytics.getRecentActivity(activityLimit);
        const dbHealth = Analytics.checkDatabaseHealth();
        
        res.render('admin/analytics', {
            layout: 'admin',
            title: 'Analytics Dashboard',
            user: req.user,
            totalStats,
            pageViewStats,
            recentActivity,
            dbHealth,
            pageViewLimit,
            activityLimit,
            isAdmin: true,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        console.error('Error loading analytics:', error);
        req.flash('error', 'Failed to load analytics');
        res.redirect('/admin/dashboard');
    }
});

// Analytics health check API
router.get('/analytics/health', isAdmin, async (req, res) => {
    try {
        const health = Analytics.checkDatabaseHealth();
        res.json(health);
    } catch (error) {
        res.status(500).json({ error: 'Health check failed', details: error.message });
    }
});

// User management

// List users
router.get('/users', isAdmin, (req, res) => {
    const users = User.findAll();
    res.render('admin/users', {
        title: 'Manage Users',
        users,
        user: req.user,
        success: req.flash('success'),
        error: req.flash('error'),
        csrfToken: req.csrfToken()
    });
});

// Show new user form
router.get('/users/new', isAdmin, (req, res) => {
    res.render('admin/new-user', {
        title: 'New User',
        user: req.user,
        success: req.flash('success'),
        error: req.flash('error'),
        csrfToken: req.csrfToken()
    });
});

// Create user
router.post('/users', isAdmin, (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        req.flash('error', 'Username, password, and role are required');
        return res.redirect('/admin/users/new');
    }
    try {
        User.create(username, password, role);
        req.flash('success', 'User created successfully');
        res.redirect('/admin/users');
    } catch (error) {
        req.flash('error', 'Failed to create user: ' + error.message);
        res.redirect('/admin/users/new');
    }
});

// Delete user (cannot delete self)
router.post('/users/:id/delete', isAdmin, (req, res) => {
    if (req.session.userId == req.params.id) {
        req.flash('error', 'You cannot delete your own account.');
        return res.redirect('/admin/users');
    }
    try {
        User.delete(req.params.id);
        req.flash('success', 'User deleted successfully');
        res.redirect('/admin/users');
    } catch (error) {
        req.flash('error', 'Failed to delete user: ' + error.message);
        res.redirect('/admin/users');
    }
});

export default router; 
