import express from 'express';
import {
    buildPagination,
    getPagedMetaDescription,
    getPostMetaDescription,
    parsePageNumber
} from '@ffg/blog-core';
import buildOgTags, { SITE_DESCRIPTION } from '../middleware/ogTags.js';
import { getHeroImagePath } from '../utils/heroImageProcessor.js';

const router = express.Router();

const ABOUT_TITLE = 'About Fruition Forest Garden';
const ABOUT_DESCRIPTION = 'Meet Mike and Lou and follow their off-grid homestead, forest garden, DIY systems, and self-reliant life in Michigan’s Upper Peninsula.';

const getCanonicalUrl = (res, pathname) => `${res.locals.siteBaseUrl}${pathname}`;

const renderPageNotFound = (res) => res.status(404).render('error', {
    title: 'Not Found',
    message: 'Page not found'
});

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
        const page = parsePageNumber(req.query.page);
        if (page === null) {
            return renderPageNotFound(res);
        }
        const limit = 6;

        let posts = [];
        let totalCount = 0;
        try {
            const count = Post.count;
            totalCount = typeof count === 'number' ? count : 0;
        } catch (err) {
            console.error('Error fetching post count:', err);
            totalCount = 0;
        }

        const pagination = buildPagination({
            currentPage: page,
            totalItems: totalCount,
            limit,
            basePath: '/'
        });
        if (!pagination) {
            return renderPageNotFound(res);
        }

        try {
            posts = Post.findAll(limit, (page - 1) * limit) || [];
        } catch (err) {
            console.error('Error fetching posts:', err);
            posts = [];
        }

        // Get hero image path if it exists
        const heroImagePath = await getHeroImagePath();

        // Add default OG tags for home page (pass req for dynamic base URL)
        const ogTags = await buildOgTags(null, req);

        res.render('home', {
            title: 'Home',
            posts,
            pagination,
            heroImagePath,
            ogTags,
            metaDescription: getPagedMetaDescription(SITE_DESCRIPTION, page),
            canonicalUrl: getCanonicalUrl(res, pagination.currentUrl)
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
router.get('/about', async (req, res) => {
    const canonicalUrl = getCanonicalUrl(res, '/about');
    const ogTags = await buildOgTags(null, req, {
        title: ABOUT_TITLE,
        description: ABOUT_DESCRIPTION,
        url: canonicalUrl
    });
    res.render('about', {
        title: 'About',
        ogTags,
        metaDescription: ABOUT_DESCRIPTION,
        canonicalUrl
    });
});

// Category page
router.get('/category/:slug', async (req, res) => {
    try {
        const { Category } = await import('@ffg/blog-core');
        const page = parsePageNumber(req.query.page);
        if (page === null) {
            return renderPageNotFound(res);
        }
        const limit = 6;
        const category = Category.findBySlug(req.params.slug);
        if (!category) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Category not found'
            });
        }

        const postCount = Category.countPosts(category.id);
        const basePath = `/category/${category.slug}`;
        const pagination = buildPagination({
            currentPage: page,
            totalItems: postCount,
            limit,
            basePath
        });
        if (!pagination) {
            return renderPageNotFound(res);
        }

        const posts = Category.getPosts(category.id, limit, (page - 1) * limit) || [];
        res.render('category', {
            title: category.name,
            category,
            posts,
            pagination,
            robotsDirective: postCount === 0 ? 'noindex,follow' : null,
            canonicalUrl: getCanonicalUrl(res, pagination.currentUrl)
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
        const query = typeof req.query.q === 'string' ? req.query.q : '';
        const page = parsePageNumber(req.query.page);
        if (page === null) {
            return renderPageNotFound(res);
        }
        const limit = 6;
        const totalCount = query ? Post.countSearch(query) : 0;
        const pagination = buildPagination({
            currentPage: page,
            totalItems: totalCount,
            limit,
            basePath: '/search',
            query: query ? { q: query } : {}
        });
        if (!pagination) {
            return renderPageNotFound(res);
        }

        if (!query) {
            return res.render('search', {
                title: 'Search',
                posts: [],
                pagination,
                robotsDirective: 'noindex,follow',
                canonicalUrl: getCanonicalUrl(res, pagination.currentUrl)
            });
        }

        const posts = Post.search(query, limit, (page - 1) * limit);
        res.render('search', {
            title: 'Search Results',
            query,
            posts,
            pagination,
            robotsDirective: 'noindex,follow',
            canonicalUrl: getCanonicalUrl(res, pagination.currentUrl)
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
        // post.content is already correct from database
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
        const ogTags = await buildOgTags(post, req);
        res.render('posts/show', {
            title: post.title,
            post,
            ogTags,
            metaDescription: getPostMetaDescription(post),
            canonicalUrl: getCanonicalUrl(res, `/post/${post.slug}`)
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
