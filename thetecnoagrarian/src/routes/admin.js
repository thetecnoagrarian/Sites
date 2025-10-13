import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { isAuthenticated, isAdmin, Post, Category, User, processImage } from '@ffg/blog-core';
import postController from '../controllers/postController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
            title: 'Admin Dashboard',
            posts,
            categories,
            success: req.flash('success'),
            error: req.flash('error'),
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
        res.redirect('/admin/categories');
    } catch (error) {
        console.error('Error updating category:', error);
        req.flash('error', 'Failed to update category');
        res.redirect('/admin/categories');
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

// Minimal test for /admin/posts/test-create
router.post('/posts/test-create', (req, res) => {
  console.log('TEST: /posts/test-create hit');
  res.send('OK');
});

// Add a GET route for /admin/posts/new
router.get('/posts/new', isAdmin, async (req, res) => {
    try {
        const categories = Category.findAll();
        const csrfToken = req.csrfToken();
        console.log('New post route - CSRF token:', csrfToken);
        res.render('admin/new-post', {
            title: 'New Post',
            categories,
            user: req.user,
            csrfToken: csrfToken
        });
    } catch (error) {
        console.error('Error loading new post form:', error);
        req.flash('error', 'Failed to load new post form');
        res.redirect('/admin/dashboard');
    }
});

// Add a POST route for creating a new post
router.post('/dashboard/posts/create', isAdmin, (req, res, next) => {
    req.app.locals.upload.array('image', 25)(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        req.flash('error', 'One or more files are too large. Max size is 20MB.');
        return res.redirect('/admin/posts/new');
      } else if (err) {
        req.flash('error', 'An error occurred during file upload.');
        return res.redirect('/admin/posts/new');
      }
      // CSRF validation after multer processes the form
      if (!req.body._csrf) {
        console.log('Missing CSRF token in request body');
        req.flash('error', 'Invalid request. Please try again.');
        return res.redirect('/admin/posts/new');
      }
      next();
    });
}, async (req, res) => {
    console.log('POST /dashboard/posts/create - Starting post creation...');
    console.log('req.body:', req.body);
    console.log('req.files:', req.files);
    console.log('req.body._csrf:', req.body._csrf);
    
    try {
        // Validate required fields
        if (!req.body.title || !req.body.content) {
            console.log('Missing required fields - title or content');
            req.flash('error', 'Title and content are required');
            return res.redirect('/admin/posts/new');
        }

        // Process images and captions
        let images = [];
        let captions = [];
        
        // Get captions from form (handle both captions[] and captions formats)
        let formCaptions = [];
        if (req.body['captions[]']) {
            formCaptions = Array.isArray(req.body['captions[]']) ? req.body['captions[]'] : [req.body['captions[]']];
        } else if (req.body.captions) {
            formCaptions = Array.isArray(req.body.captions) ? req.body.captions : [req.body.captions];
        }
        console.log('Form captions received:', formCaptions);
        
        if (req.files && req.files.length > 0) {
            console.log('Processing uploaded files...');
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                try {
                    const processedImage = await processImage(file.path, file.filename, path.join(__dirname, '../public/uploads'));
                    images.push(processedImage);
                    // Get caption for this image (use index to match image with caption)
                    const caption = formCaptions[i] || '';
                    captions.push(caption);
                    console.log(`Processed image ${i}:`, processedImage, 'with caption:', caption);
                } catch (imageError) {
                    console.error('Error processing image:', imageError);
                    req.flash('error', `Error processing image: ${imageError.message}`);
                    return res.redirect('/admin/posts/new');
                }
            }
        }

        console.log('Final images array:', images);
        console.log('Final captions array:', captions);

        // Create post data object
        console.log('Raw created_at from form:', req.body.created_at);
        console.log('Server timezone offset:', new Date().getTimezoneOffset());
        console.log('Current server time:', new Date().toISOString());
        console.log('Current server local time:', new Date().toString());
        
        // Fix timezone issue: ensure date is treated as local time
        let created_at = req.body.created_at;
        if (created_at) {
            // Append local timezone to ensure the date is treated as local time
            const localDate = new Date(created_at + 'T00:00:00');
            created_at = localDate.toISOString().split('T')[0];
            console.log('Processed created_at:', created_at);
        }
        
        const postData = {
            title: req.body.title,
            content: req.body.content,
            description: req.body.description || '',
            excerpt: req.body.excerpt || '',
            images: images,
            captions: captions,
            created_at: created_at,
            author_id: req.user.id
        };

        console.log('Post data to create:', postData);

        // Create the post
        const result = Post.create(postData);
        console.log('Post creation result:', result);

        if (result && result.lastInsertRowid) {
            console.log('Post created successfully with ID:', result.lastInsertRowid);
            
            // Handle categories if any
            if (req.body.categories && Array.isArray(req.body.categories)) {
                console.log('Adding categories to post:', req.body.categories);
                for (const categoryId of req.body.categories) {
                    try {
                        Post.addCategory(result.lastInsertRowid, categoryId);
                        console.log('Added category', categoryId, 'to post', result.lastInsertRowid);
                    } catch (categoryError) {
                        console.error('Error adding category:', categoryError);
                    }
                }
            }

            req.flash('success', 'Post created successfully!');
            console.log('Redirecting to dashboard...');
            return res.redirect('/admin/dashboard');
        } else {
            console.log('Post creation failed - no result or lastInsertRowid');
            req.flash('error', 'Failed to create post');
            return res.redirect('/admin/posts/new');
        }

    } catch (error) {
        console.error('Error in post creation route:', error);
        req.flash('error', `Error creating post: ${error.message}`);
        return res.redirect('/admin/posts/new');
    }
});

// Add a GET route for editing a post
router.get('/posts/:id/edit', isAdmin, async (req, res) => {
    try {
        // Post and Category are already imported from @ffg/blog-core
        const post = Post.findById(req.params.id);
        if (!post) {
            req.flash('error', 'Post not found');
            return res.redirect('/admin/dashboard');
        }
        const categories = Category.findAll();
        // Mark categories as selected if they belong to the post
        const postCategories = Post.getCategories(post.id);
        for (const category of categories) {
            category.selected = postCategories.some(pc => String(pc.id) === String(category.id));
        }
        const csrfToken = req.csrfToken();
        console.log('Edit post route - CSRF token:', csrfToken);
        res.render('admin/new-post', {
            title: 'Edit Post',
            post,
            categories,
            user: req.user,
            csrfToken: csrfToken
        });
    } catch (error) {
        console.error('Error loading post for edit:', error);
        req.flash('error', 'Failed to load post for editing');
        res.redirect('/admin/dashboard');
    }
});

// Add a POST route for updating a post
router.post('/dashboard/posts/:id/update', isAdmin, async (req, res) => {
    try {
        // Post and processImage are already imported from @ffg/blog-core
        const post = Post.findById(req.params.id);
        if (!post) {
            req.flash('error', 'Post not found');
            return res.redirect('/admin/dashboard');
        }
        let imageUrls = post.images || [];
        if (!Array.isArray(imageUrls)) imageUrls = [];
        // Process new images if uploaded
        if (req.files && req.files.length > 0) {
            // Delete old images if they exist
            if (post.images && Array.isArray(post.images)) {
                for (const imageObj of post.images) {
                    for (const size of ['thumbnail', 'medium', 'large']) {
                        if (imageObj && imageObj[size]) {
                            try {
                                await fs.unlink(path.join(process.cwd(), 'src/public', imageObj[size]));
                            } catch (error) {
                                if (error.code !== 'ENOENT') {
                                    console.error('Error deleting old image:', error);
                                }
                            }
                        }
                    }
                }
            }
            // Add new images
            imageUrls = [];
            for (const file of req.files) {
                const newImageUrls = await processImage(file.path, file.filename);
                imageUrls.push(newImageUrls);
            }
        }
        // Get captions from form
        let captions = Array.isArray(req.body['captions[]']) ? req.body['captions[]'] : (req.body['captions[]'] ? [req.body['captions[]']] : []);
        if (!captions.length && req.body.captions) {
            captions = Array.isArray(req.body.captions) ? req.body.captions : [req.body.captions];
        }
        if (captions.length < imageUrls.length) {
            while (captions.length < imageUrls.length) captions.push('');
        } else if (captions.length > imageUrls.length) {
            captions = captions.slice(0, imageUrls.length);
        }
        console.log('Update route - Raw created_at from form:', req.body.created_at);
        
        // Fix timezone issue: ensure date is treated as local time
        let created_at = req.body.created_at;
        if (created_at) {
            // Append local timezone to ensure the date is treated as local time
            const localDate = new Date(created_at + 'T00:00:00');
            created_at = localDate.toISOString().split('T')[0];
            console.log('Update route - Processed created_at:', created_at);
        }
        
        await Post.update(req.params.id, {
            title: req.body.title,
            content: req.body.content,
            description: req.body.description || '',
            excerpt: req.body.excerpt || '',
            images: imageUrls,
            captions: captions,
            created_at: created_at
        });
        // Update categories for the post
        const categoryIds = Array.isArray(req.body.categories) ? req.body.categories : (req.body.categories ? [req.body.categories] : []);
        // Remove all existing categories
        const existingCategories = Post.getCategories(post.id);
        if (existingCategories && existingCategories.length) {
            for (const cat of existingCategories) {
                Post.removeCategory(post.id, cat.id);
            }
        }
        // Add new categories
        if (categoryIds.length) {
            for (const categoryId of categoryIds) {
                Post.addCategory(post.id, categoryId);
            }
        }
        req.flash('success', 'Post updated successfully');
        res.redirect('/admin/dashboard');
    } catch (error) {
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting uploaded file:', unlinkError);
            }
        }
        console.error('Error updating post:', error);
        req.flash('error', 'Error updating post');
        res.redirect('/admin/dashboard');
    }
});

// Analytics dashboard - temporarily disabled until analytics model is added to core
/*
router.get('/analytics', isAdmin, async (req, res) => {
    try {
        // Analytics model not available in core package yet
        // const Analytics = require('../models/analytics');
        const totalStats = Analytics.getTotalStats();
        const pageViewStats = Analytics.getPageViewStats(30);
        const recentActivity = Analytics.getRecentActivity(20);
        const dbHealth = Analytics.checkDatabaseHealth();
        
        res.render('admin/analytics', {
            title: 'Analytics Dashboard',
            user: req.user,
            totalStats,
            pageViewStats,
            recentActivity,
            dbHealth,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        console.error('Error loading analytics:', error);
        req.flash('error', 'Failed to load analytics');
        res.redirect('/admin/dashboard');
    }
});
*/

// Analytics health check API - temporarily disabled
/*
router.get('/analytics/health', isAdmin, async (req, res) => {
    try {
        // Analytics model not available in core package yet
        // const Analytics = require('../models/analytics');
        const health = Analytics.checkDatabaseHealth();
        res.json(health);
    } catch (error) {
        res.status(500).json({ error: 'Health check failed', details: error.message });
    }
});
*/

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