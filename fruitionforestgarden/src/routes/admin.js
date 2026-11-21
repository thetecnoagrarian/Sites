import express from 'express';
import multer from 'multer';
import { isAuthenticated, isAdmin, createEditorialAdminRouter, cleanupOwnedUploads, logSafeError, asyncHandler } from '@ffg/blog-core';
import Analytics from '../models/analytics.js';
import { galleryPlacement, safePreviewProse } from '../utils/bodyGalleryView.js';
import {
    publishHeroImage,
    resetHeroImage,
    resolveHeroImage,
    allocateHeroOperation,
    readHeroOperationReceipt,
    readHeroIntegrityStatus,
    withHeroOperationLock
} from '../utils/heroImageStore.js';

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
router.get('/dashboard', isAdmin, asyncHandler(async (req, res) => {
    try {
        const { Post } = await import('@ffg/blog-core');
        console.log('Loading admin dashboard...');
        // Get all posts with their categories
        const posts = Post.findAll(100, 0); // Fetch up to 100 posts
        console.log('Found posts:', posts.length);
        
        for (const post of posts) {
            try {
                post.categories = Post.getCategories(post.id);
                console.log('Dashboard: Post', post.id, 'categories:', post.categories);
            } catch (categoryError) {
                logSafeError(categoryError, { request: req, event: 'admin' });
                post.categories = [];
            }
        }

        // Get all categories
        const { Category } = await import('@ffg/blog-core');
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
            isAdmin: true
        });
        console.log('Dashboard rendered successfully');
    } catch (error) {
        logSafeError(error, { request: req, event: 'admin' });
        req.flash('error', 'Failed to load dashboard: ' + error.message);
        res.redirect('/');
    }
}));

// Remove the post association; committed media remains available to other references.
router.post('/dashboard/posts/:id/delete', isAdmin, asyncHandler(async (req, res) => {
    try {
        const { Post } = await import('@ffg/blog-core');
        const post = Post.findById(req.params.id);
        if (!post) {
            req.flash('error', 'Post not found');
            return res.redirect('/admin/dashboard');
        }
        Post.delete(post.id);
        req.flash('success', 'Post deleted successfully');
        res.redirect('/admin/dashboard');
    } catch (error) {
        logSafeError(error, { request: req });
        req.flash('error', 'Failed to delete post');
        res.redirect('/admin/dashboard');
    }
}));

// Categories list
router.get('/categories', isAdmin, asyncHandler(async (req, res) => {
    try {
        const { Category } = await import('@ffg/blog-core');
        const categories = Category.findAll();
        res.render('admin/categories', {
            title: 'Manage Categories',
            categories,
            success: req.flash('success'),
            error: req.flash('error'),
            user: req.user
        });
    } catch (error) {
        logSafeError(error, { request: req, event: 'admin' });
        req.flash('error', 'Failed to fetch categories');
        res.redirect('/admin');
    }
}));

// Create category
router.post('/categories', isAdmin, asyncHandler(async (req, res) => {
    try {
        const { Category } = await import('@ffg/blog-core');
        const { name } = req.body;
        if (!name) {
            req.flash('error', 'Category name is required');
            return res.redirect('/admin/dashboard');
        }

        Category.create(name);
        req.flash('success', 'Category created successfully');
        res.redirect('/admin/dashboard');
    } catch (error) {
        logSafeError(error, { request: req, event: 'admin' });
        req.flash('error', 'Failed to create category');
        res.redirect('/admin/dashboard');
    }
}));

// Update category
router.post('/categories/update', isAdmin, asyncHandler(async (req, res) => {
    try {
        const { Category } = await import('@ffg/blog-core');
        const { categoryId, name } = req.body;
        if (!categoryId || !name) {
            req.flash('error', 'Category ID and name are required');
            return res.redirect('/admin/categories');
        }

        Category.update(categoryId, name);
        req.flash('success', 'Category updated successfully');
        res.redirect('/admin/categories');
    } catch (error) {
        logSafeError(error, { request: req, event: 'admin' });
        req.flash('error', 'Failed to update category');
        res.redirect('/admin/categories');
    }
}));

// Delete category
router.post('/categories/:id/delete', isAdmin, asyncHandler(async (req, res) => {
    try {
        const { Category } = await import('@ffg/blog-core');
        const categoryId = req.params.id;
        Category.delete(categoryId);
        req.flash('success', 'Category deleted successfully');
        res.redirect('/admin/dashboard');
    } catch (error) {
        logSafeError(error, { request: req, event: 'admin' });
        req.flash('error', 'Failed to delete category');
        res.redirect('/admin/dashboard');
    }
}));

// Shared admin-only Public Person and editorial post workflow.
router.use(createEditorialAdminRouter({
    allowOverwrite: true,
    bodyGallery: {
        validatePlacement(body, items) {
            galleryPlacement(typeof body === 'string' ? body : '', items, { required: true });
        },
        renderPreview(req, res, { previous, fields, items, draftUrl }) {
            const body = typeof fields.body === 'string' ? fields.body : '';
            let gallery;
            try { gallery = galleryPlacement(body, items, { required: true, preview: true }); }
            catch (error) { return res.status(400).render('error', { title: 'Gallery placement', message: error.message }); }
            const captions = fields['captions[]'] ?? fields.captions ?? previous?.captions ?? [];
            const imageList = (previous?.images ?? []).map((image, index) => ({
                ...image, caption: (Array.isArray(captions) ? captions : [captions])[index] ?? ''
            }));
            const post = {
                title: fields.title || 'Untitled draft', body: gallery ? '' : safePreviewProse(body),
                created_at: fields.created_at, imageList, multipleImages: imageList.length > 1
            };
            res.render('posts/show', { title: post.title, post, gallery, draftUrl });
        }
    }
}));

// Analytics dashboard
router.get('/analytics', isAdmin, asyncHandler(async (req, res) => {
    try {
        // Get row limits from query parameters with defaults
        const pageViewLimit = parseInt(req.query.pageViewLimit) || 25;
        const activityLimit = parseInt(req.query.activityLimit) || 25;
        
        const totalStats = Analytics.getTotalStats();
        const pageViewStats = Analytics.getPageViewStats(30, pageViewLimit);
        const recentActivity = Analytics.getRecentActivity(activityLimit);
        const dbHealth = Analytics.checkDatabaseHealth();
        
        res.render('admin/analytics', {
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
        logSafeError(error, { request: req, event: 'admin' });
        req.flash('error', 'Failed to load analytics');
        res.redirect('/admin/dashboard');
    }
}));

// Analytics health check API
router.get('/analytics/health', isAdmin, asyncHandler(async (req, res) => {
    try {
        const health = Analytics.checkDatabaseHealth();
        res.json(health);
    } catch (error) {
        logSafeError(error, { request: req, event: 'admin' });
        res.status(500).json({ error: 'Health check failed', details: error.message });
    }
}));

// User management

// List users
router.get('/users', isAdmin, asyncHandler(async (req, res) => {
    const { User } = await import('@ffg/blog-core');
    const users = User.findAll();
    res.render('admin/users', {
        title: 'Manage Users',
        users,
        user: req.user,
        success: req.flash('success'),
        error: req.flash('error')
    });
}));

// Show new user form
router.get('/users/new', isAdmin, (req, res) => {
    res.render('admin/new-user', {
        title: 'New User',
        user: req.user,
        csrfToken: req.csrfToken(),
        success: req.flash('success'),
        error: req.flash('error')
    });
});

// Create user
router.post('/users', isAdmin, asyncHandler(async (req, res) => {
    const { User } = await import('@ffg/blog-core');
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
        logSafeError(error, { request: req, event: 'admin' });
        req.flash('error', 'Failed to create user: ' + error.message);
        res.redirect('/admin/users/new');
    }
}));

// Delete user (cannot delete self)
router.post('/users/:id/delete', isAdmin, asyncHandler(async (req, res) => {
    if (req.session.userId == req.params.id) {
        req.flash('error', 'You cannot delete your own account.');
        return res.redirect('/admin/users');
    }
    try {
        const { User } = await import('@ffg/blog-core');
        User.delete(req.params.id);
        req.flash('success', 'User deleted successfully');
        res.redirect('/admin/users');
    } catch (error) {
        logSafeError(error, { request: req, event: 'admin' });
        req.flash('error', 'Failed to delete user: ' + error.message);
        res.redirect('/admin/users');
    }
}));

// Hero Image Management Routes

// GET route for hero image management page
router.get('/hero-image', isAdmin, asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const heroImage = await resolveHeroImage(req.app.locals.uploadsPath);
        const integrity = await readHeroIntegrityStatus(req.app.locals.uploadsPath);
        const writable = integrity.state !== 'authority-unavailable';
        res.render('admin/hero-image', {
            title: 'Hero Image Management',
            heroImagePath: heroImage?.path,
            heroImagePersistent: heroImage?.persistent,
            heroOperationId: writable ? await allocateHeroOperation(req.app.locals.uploadsPath, req.user.id) : null,
            heroResetOperationId: writable && integrity.current
                ? await allocateHeroOperation(req.app.locals.uploadsPath, req.user.id, 'reset') : null,
            heroIntegrityWarning: ['degraded', 'authority-unavailable'].includes(integrity.state),
            success: req.flash('success'),
            error: req.flash('error'),
            user: req.user,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        logSafeError(error, { request: req, event: 'admin' });
        req.flash('error', 'Failed to load hero image page');
        res.redirect('/admin/dashboard');
    }
}));

router.get('/hero-image/integrity', isAdmin, asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const status = await readHeroIntegrityStatus(req.app.locals.uploadsPath);
    res.status(status.state === 'authority-unavailable' ? 503 : 200).json(status);
}));

router.get('/hero-image/operations/:id', isAdmin, asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const receipt = await readHeroOperationReceipt(req.app.locals.uploadsPath, req.params.id, req.user.id);
        res.json(receipt ? { state: 'accepted', operationId: receipt.operationId, action: receipt.action,
            generation: receipt.generation, revision: receipt.revision, acceptedAt: receipt.acceptedAt }
            : { state: 'not-accepted' });
    } catch (error) {
        logSafeError(error, { request: req, event: 'admin' });
        res.status(error.code === 'HERO_REJECTED' ? 404 : 503).json({ state: 'unknown', error: 'Hero operation status unavailable' });
    }
}));

// POST route for hero image upload
router.post('/hero-image/upload', isAdmin, (req, res, next) => {
    req.app.locals.upload.single('heroImage')(req, res, err => asyncHandler(async () => {
        if (err instanceof multer.MulterError) {
            await cleanupOwnedUploads(req);
            logSafeError(err, { request: req, event: 'admin' });
            req.flash('error', err.code === 'LIMIT_FILE_SIZE'
                ? 'File upload error: the image exceeds the 50MB limit.'
                : 'File upload error. Upload exactly one JPEG, PNG, or WebP image.');
            return res.redirect('/admin/hero-image');
        } else if (err) {
            await cleanupOwnedUploads(req);
            logSafeError(err, { request: req, event: 'admin' });
            req.flash('error', 'File upload failed. Please try again.');
            return res.redirect('/admin/hero-image');
        }

        if (!req.file) {
            await cleanupOwnedUploads(req);
            req.flash('error', 'No file uploaded. Please select an image file.');
            return res.redirect('/admin/hero-image');
        }

        if (!req.verifyCsrfToken(req.body?._csrf)) {
            await cleanupOwnedUploads(req);
            return res.status(403).json({ error: 'Invalid CSRF token' });
        }

        let acceptedReceipt;
        try {
            const result = await withHeroOperationLock(req.app.locals.uploadsPath, () => publishHeroImage({
                inputPath: req.file.path,
                uploadsPath: req.app.locals.uploadsPath,
                operationId: req.body.heroOperationId,
                ownerUserId: req.user.id
            }));
            acceptedReceipt = result.receipt;
            
            // Format file sizes for display
            const heroSizeMB = (result.heroSize / (1024 * 1024)).toFixed(2);
            const ogSizeMB = (result.ogSize / (1024 * 1024)).toFixed(2);
            
            req.flash('success', 
                `Hero image uploaded successfully! Hero: ${result.heroDimensions.width}x${result.heroDimensions.height} (${heroSizeMB}MB), OG: ${result.ogDimensions.width}x${result.ogDimensions.height} (${ogSizeMB}MB)`
            );
            res.redirect('/admin/hero-image');
        } catch (error) {
            logSafeError(error, { request: req, event: 'admin' });
            if (acceptedReceipt && (res.headersSent || res.destroyed)) return res.destroy();
            if (acceptedReceipt) return res.status(503).set('Cache-Control', 'no-store').json({
                state: 'accepted', operationId: acceptedReceipt.operationId, revision: acceptedReceipt.revision,
                error: 'Hero accepted; response handling failed. Check the operation status before retrying.' });
            if (error.code === 'HERO_OUTCOME_UNKNOWN') return res.status(503).set('Cache-Control', 'no-store').json({
                state: 'unknown', operationId: req.body.heroOperationId,
                error: 'Hero outcome unknown. Check the operation status before retrying.' });
            req.flash('error', 'Failed to process hero image. Confirm it is a JPEG, PNG, or WebP within the documented limits.');
            res.redirect('/admin/hero-image');
        } finally {
            await cleanupOwnedUploads(req);
        }
    })(req, res, next));
});

router.post('/hero-image/reset', isAdmin, asyncHandler(async (req, res) => {
    let acceptedReceipt;
    try {
        const result = await withHeroOperationLock(req.app.locals.uploadsPath, () => resetHeroImage(req.app.locals.uploadsPath, {
            operationId: req.body.heroOperationId, ownerUserId: req.user.id
        }));
        acceptedReceipt = result.receipt;
        req.flash('success', 'Hero image reset to the repository default.');
        return res.redirect('/admin/hero-image');
    } catch (error) {
        logSafeError(error, { request: req, event: 'admin' });
        if (acceptedReceipt && (res.headersSent || res.destroyed)) return res.destroy();
        if (acceptedReceipt) return res.status(503).set('Cache-Control', 'no-store').json({
            state: 'accepted', operationId: acceptedReceipt.operationId, revision: acceptedReceipt.revision,
            error: 'Hero reset accepted; response handling failed. Check the operation status before retrying.' });
        if (error.code === 'HERO_OUTCOME_UNKNOWN') return res.status(503).set('Cache-Control', 'no-store').json({
            state: 'unknown', operationId: req.body.heroOperationId,
            error: 'Hero outcome unknown. Check the operation status before retrying.' });
        req.flash('error', 'Failed to reset the hero image. Please try again.');
    }
    res.redirect('/admin/hero-image');
}));

export default router; 
