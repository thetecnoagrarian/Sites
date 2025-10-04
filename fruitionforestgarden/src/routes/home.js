import express from 'express';
import buildOgTags from '../middleware/ogTags.js';

const router = express.Router();

// Health check endpoint for Docker/Kubernetes
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'fruitionforestgarden'
    });
});

// Middleware to load categories for sidebar
router.use(async (req, res, next) => {
    try {
        const { Category } = await import('@ffg/blog-core');
        res.locals.sidebarCategories = Category.findAll();
    } catch (error) {
        console.error('Error loading categories:', error);
        res.locals.sidebarCategories = [];
    }
    next();
});

// Home page
router.get('/', async (req, res) => {
    try {
        const { Post } = await import('@ffg/blog-core');
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
router.get('/category/:slug', async (req, res) => {
    try {
        const { Category } = await import('@ffg/blog-core');
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

        const { Post } = await import('@ffg/blog-core');
        const posts = Post.findByCategory(category.id, limit, offset) || [];
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
router.get('/search', async (req, res) => {
    try {
        const { Post } = await import('@ffg/blog-core');
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
router.get('/post/:slug', async (req, res) => {
    try {
        const { Post } = await import('@ffg/blog-core');
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
        if (post.images) {
          if (!Array.isArray(post.images)) {
            // If images is a single object or string, wrap in array
            post.images = [post.images];
          }
        } else {
          post.images = [];
        }

        // Handle imageList for template compatibility (but keep post.images as array for OG middleware)
        if (Array.isArray(post.images)) {
            if (post.images.length === 1) {
                // Create imageList for template, but don't overwrite post.images
                const caption = (post.captions && post.captions[0]) || '';
                post.imageList = [{ ...post.images[0], caption }];
            } else if (post.images.length > 1) {
                post.imageList = post.images.map((img, i) => {
                    const caption = (post.captions && post.captions[i]) || '';
                    return {
                    ...img,
                        caption
                    };
                });
            }
        }

        post.categories = Post.getCategories ? Post.getCategories(post.id) : [];
        post.multipleImages = Array.isArray(post.imageList) && post.imageList.length > 1;

        res.locals.post = post; // Make post available to template
        const ogTags = buildOgTags(post);
        res.render('posts/show', {
            title: post.title,
            post,
            ogTags
        });
    } catch (error) {
        console.error('Error loading post:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load post'
        });
    }
});

export default router; 