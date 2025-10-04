console.log('ADMIN ROUTER LOADED:', __filename);
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Post = require('../models/post');
const Category = require('../models/category');
const { isAuthenticated } = require('../middleware/auth');
const path = require('path');
const fs = require('fs').promises;
const upload = require('../middleware/upload');
const postController = require('../controllers/postController');
const multer = require('multer');
const csurf = require('csurf');

// Top-level logger for all admin requests
router.use((req, res, next) => {
  console.log('ADMIN ROUTER REQUEST:', req.method, req.originalUrl);
  next();
});

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

// Protect all admin routes
router.use(isAuthenticated);

// Root admin route - redirect to dashboard
router.get('/', isAdmin, (req, res) => {
    res.redirect('/admin/dashboard');
});

// Admin dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        // Get all posts with their categories
        const posts = Post.findAll(100, 0); // Fetch up to 100 posts
        for (const post of posts) {
            post.categories = Post.getCategories(post.id);
            console.log('Dashboard: Post', post.id, 'categories:', post.categories);
        }

        // Get all categories
        const categories = Category.findAll();
        
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            posts,
            categories,
            success: req.flash('success'),
            error: req.flash('error'),
            user: req.user
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        req.flash('error', 'Failed to load dashboard');
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
            user: req.user
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
router.get('/posts/new', isAdmin, csurf(), async (req, res) => {
    try {
        const categories = Category.findAll();
        res.render('admin/new-post', {
            title: 'New Post',
            categories,
            user: req.user,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        console.error('Error loading new post form:', error);
        req.flash('error', 'Failed to load new post form');
        res.redirect('/admin/dashboard');
    }
});

// Add a POST route for creating a new post
router.post('/dashboard/posts/create', isAdmin, (req, res, next) => {
    upload.array('image', 25)(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        req.flash('error', 'One or more files are too large. Max size is 20MB.');
        return res.redirect('/admin/posts/new');
      } else if (err) {
        req.flash('error', 'An error occurred during file upload.');
        return res.redirect('/admin/posts/new');
      }
      next();
    });
}, csurf(), async (req, res) => {
    try {
        const { title, body, description, excerpt, categories, created_at } = req.body;
        if (!title || !body) {
            req.flash('error', 'Title and content are required');
            return res.redirect('/admin/posts/new');
        }
        // Handle images and captions as indexed pairs
        let imagesArray = [];
        let captionsArray = [];
        if (req.body.images && typeof req.body.images === 'object') {
            // If only one image, req.body.images is a string, not an object
            if (Array.isArray(req.body.images)) {
                imagesArray = req.body.images;
            } else {
                imagesArray = Object.values(req.body.images);
            }
        }
        if (req.body.captions && typeof req.body.captions === 'object') {
            if (Array.isArray(req.body.captions)) {
                captionsArray = req.body.captions;
            } else {
                captionsArray = Object.values(req.body.captions);
            }
        }
        // If images were uploaded, process them
        if (req.files && req.files.length > 0) {
            const { processImage } = require('../utils/imageProcessor');
            imagesArray = [];
            for (const file of req.files) {
                try {
                    const imageUrls = await processImage(file.path, file.filename);
                    imagesArray.push(imageUrls);
                } catch (imgErr) {
                    console.error('Error processing image:', imgErr);
                }
            }
        }
        // Pad or trim captions to match images
        if (captionsArray.length < imagesArray.length) {
            while (captionsArray.length < imagesArray.length) captionsArray.push('');
        } else if (captionsArray.length > imagesArray.length) {
            captionsArray = captionsArray.slice(0, imagesArray.length);
        }
        const Post = require('../models/post');
        let result = Post.create({
            title,
            body,
            description: description || '',
            excerpt: excerpt || '',
            images: imagesArray,
            captions: captionsArray,
            created_at: created_at || undefined,
            author_id: req.session.userId
        });
        if (!result.changes || result.changes === 0) {
            req.flash('error', 'Failed to create post');
            return res.redirect('/admin/posts/new');
        }
        let post = Post.findById(result.lastInsertRowid);
        // Assign categories to the post
        const categoryIds = Array.isArray(categories) ? categories : (categories ? [categories] : []);
        if (categoryIds.length && post && post.id) {
            for (const categoryId of categoryIds) {
                Post.addCategory(post.id, categoryId);
            }
        }
        req.flash('success', 'Post created successfully');
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Error creating post:', error);
        req.flash('error', 'Error creating post');
        res.redirect('/admin/posts/new');
    }
});

// Add a GET route for editing a post
router.get('/posts/:id/edit', isAdmin, async (req, res) => {
    try {
        const Post = require('../models/post');
        const Category = require('../models/category');
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
        res.render('admin/new-post', {
            title: 'Edit Post',
            post,
            categories,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading post for edit:', error);
        req.flash('error', 'Failed to load post for editing');
        res.redirect('/admin/dashboard');
    }
});

// Add a POST route for updating a post
router.post('/dashboard/posts/:id/update', isAdmin, upload.array('image', 25), async (req, res) => {
    try {
        const Post = require('../models/post');
        const { processImage } = require('../utils/imageProcessor');
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
        // Always treat images and captions as arrays
        let imagesArray = [];
        let captionsArray = [];
        if (req.body.images !== undefined) {
            if (Array.isArray(req.body.images)) {
                imagesArray = req.body.images;
            } else {
                imagesArray = [req.body.images];
            }
        } else {
            imagesArray = imageUrls;
        }
        if (req.body.captions !== undefined) {
            if (Array.isArray(req.body.captions)) {
                captionsArray = req.body.captions;
            } else {
                captionsArray = [req.body.captions];
            }
        }
        // If no new images were uploaded, reconstruct image objects from original post data
        if (!req.files || req.files.length === 0) {
            const reconstructedImages = [];
            function getFilename(path) {
                if (!path) return '';
                return path.split('/').pop();
            }
            for (let i = 0; i < imagesArray.length; i++) {
                const imagePath = imagesArray[i];
                const imageFilename = getFilename(imagePath);
                // Find the original image object that matches this filename in any property
                const originalImage = post.images.find(img =>
                    getFilename(img.thumbnail) === imageFilename ||
                    getFilename(img.medium) === imageFilename ||
                    getFilename(img.large) === imageFilename
                );
                if (originalImage) {
                    reconstructedImages.push(originalImage);
                } else {
                    // Fallback: create a basic object if original not found
                    reconstructedImages.push({
                        thumbnail: imagePath,
                        medium: imagePath,
                        large: imagePath
                    });
                }
            }
            imagesArray = reconstructedImages;
        }
        // Pad or trim captions to match images
        if (captionsArray.length < imagesArray.length) {
            while (captionsArray.length < imagesArray.length) captionsArray.push('');
        } else if (captionsArray.length > imagesArray.length) {
            captionsArray = captionsArray.slice(0, imagesArray.length);
        }
        // Debug: log the reconstructed arrays before saving
        console.log('DEBUG: imagesArray to be saved:', JSON.stringify(imagesArray, null, 2));
        console.log('DEBUG: captionsArray to be saved:', JSON.stringify(captionsArray, null, 2));
        // Pair images and captions by index
        // (imagesArray[i] is paired with captionsArray[i])
        await Post.update(req.params.id, {
            title: req.body.title,
            body: req.body.body,
            description: req.body.description || '',
            excerpt: req.body.excerpt || '',
            images: imagesArray,
            captions: captionsArray,
            created_at: req.body.created_at || undefined
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

// User management

// List users
router.get('/users', isAdmin, (req, res) => {
    const users = User.findAll();
    res.render('admin/users', {
        title: 'Manage Users',
        users,
        user: req.user,
        success: req.flash('success'),
        error: req.flash('error')
    });
});

// Show new user form
router.get('/users/new', isAdmin, (req, res) => {
    res.render('admin/new-user', {
        title: 'New User',
        user: req.user,
        success: req.flash('success'),
        error: req.flash('error')
    });
});

// Create user
router.post('/users', isAdmin, (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password || !role) {
        req.flash('error', 'All fields are required');
        return res.redirect('/admin/users/new');
    }
    try {
        User.create(username, password, email, role);
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

module.exports = router; 