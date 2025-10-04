const express = require('express');
const router = express.Router();
const Post = require('../models/post');
const Category = require('../models/category');

// Middleware to load categories for sidebar
router.use((req, res, next) => {
    res.locals.sidebarCategories = Category.findAll();
    next();
});

// Home page
router.get('/', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const offset = (page - 1) * limit;

        let posts = [];
        let totalCount = 0;
        try {
            posts = Post.findAll(limit, offset) || [];
            totalCount = typeof Post.count === 'number' ? Post.count : 0;
        } catch (err) {
            console.error('Error fetching posts or count:', err);
            posts = [];
            totalCount = 0;
        }

        const totalPages = Math.ceil(totalCount / limit) || 1;

        res.render('home', {
            title: 'Home',
            posts,
            currentPage: page,
            pages: Array.from({ length: totalPages }, (_, i) => i + 1)
        });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load posts'
        });
    }
});

// About page
router.get('/about', (req, res) => {
    res.render('about', {
        title: 'About'
    });
});

// Category page
router.get('/category/:slug', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const offset = (page - 1) * limit;
        const category = Category.findBySlug(req.params.slug);
        if (!category) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Category not found'
            });
        }

        const posts = Category.getPosts(category.id, limit, offset);
        res.render('category', {
            title: category.name,
            category,
            posts
        });
    } catch (error) {
        console.error('Error loading category:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load category'
        });
    }
});

// Search page
router.get('/search', (req, res) => {
    try {
        const query = req.query.q;
        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const offset = (page - 1) * limit;
        if (!query) {
            return res.render('search', {
                title: 'Search',
                posts: []
            });
        }

        const posts = Post.search(query, limit, offset);
        res.render('search', {
            title: 'Search Results',
            query,
            posts
        });
    } catch (error) {
        console.error('Error searching:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Search failed'
        });
    }
});

// Single post page
router.get('/post/:slug', (req, res) => {
    try {
        // Add cache-busting headers
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        const post = Post.findBySlug(req.params.slug);
        if (!post) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Post not found'
            });
        }

        // Map fields for template compatibility
        post.content = post.body;
        post.createdAt = post.created_at;

        // Images
        if (Array.isArray(post.images)) {
            if (post.images.length === 1) {
                post.images = { ...post.images[0], caption: (post.captions && post.captions[0]) || '' };
            } else if (post.images.length > 1) {
                post.imageList = post.images.map((img, i) => ({
                    ...img,
                    caption: (post.captions && post.captions[i]) || ''
                }));
            }
        }

        console.log('DEBUG post.images:', post.images);
        console.log('DEBUG post.imageList:', post.imageList);

        post.categories = Post.getCategories ? Post.getCategories(post.id) : [];
        post.multipleImages = Array.isArray(post.imageList) && post.imageList.length > 1;

        res.render('posts/show', {
            title: post.title,
            post
        });
    } catch (error) {
        console.error('Error loading post:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load post'
        });
    }
});

module.exports = router; 