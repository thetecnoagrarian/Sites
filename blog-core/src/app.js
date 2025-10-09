import express from 'express';
import session from 'express-session';
import morgan from 'morgan';
import helmet from 'helmet';
import path from 'path';
import { engine } from 'express-handlebars';
import flash from 'connect-flash';
import csurf from 'csurf';
import Database from 'better-sqlite3';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import multer from 'multer';

import { setDatabase } from './models/db.js';
import { initializeDatabase } from './database/init.js';
import { attachUser } from './middleware/auth.js';
import { createUploadMiddleware } from './middleware/upload.js';
import logger from './utils/logger.js';

/**
 * Create a blog application with the given configuration
 * @param {Object} config - Configuration object
 * @param {string} config.siteName - Name of the site
 * @param {number} config.port - Port to run on
 * @param {string} config.databasePath - Path to SQLite database
 * @param {string} config.uploadsPath - Path to uploads directory
 * @param {string} config.viewsPath - Path to views directory (optional)
 * @param {string} config.publicPath - Path to public directory (optional)
 * @param {Object} config.handlebarsHelpers - Additional Handlebars helpers (optional)
 * @returns {express.Application} - Configured Express app
 */
export function createBlogApp(config) {
    const {
        siteName = 'Blog',
        port = 3000,
        databasePath,
        uploadsPath,
        viewsPath,
        publicPath,
        handlebarsHelpers = {}
    } = config;

    if (!databasePath) {
        throw new Error('databasePath is required');
    }

    if (!uploadsPath) {
        throw new Error('uploadsPath is required');
    }

    const app = express();

    // Trust proxy if behind reverse proxy
    app.set('trust proxy', true);

    // Initialize database
    const db = initializeDatabase(databasePath);
    setDatabase(db);

    // Security middleware
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://cdnjs.cloudflare.com",
                    "https://cdn.jsdelivr.net"
                ],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://cdn.jsdelivr.net"
                ],
                scriptSrcAttr: ["'self'", "'unsafe-inline'"],
                fontSrc: [
                    "'self'",
                    "https://cdnjs.cloudflare.com",
                    "https://cdn.jsdelivr.net"
                ],
                imgSrc: ["'self'", "data:", "blob:", "https://cdn.jsdelivr.net"],
                connectSrc: ["'self'", "https://cdn.jsdelivr.net", "data:"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            }
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: "same-site" },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" }
    }));

    // Logging middleware
    app.use(morgan('combined', {
        stream: {
            write: (message) => logger.info(message.trim())
        }
    }));

    // Compression and parsing middleware
    app.use(compression());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Session configuration - using memory store for now to avoid schema issues
    app.use(session({
        secret: process.env.SESSION_SECRET || 'your-secret-key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    }));

 // CSRF protection
    app.use(csurf({ 
        cookie: false, // We're using sessions, not cookies
        ignoreMethods: ['GET', 'HEAD', 'OPTIONS'] // Don't require CSRF for read operations
    }));

    // Multer middleware for multipart/form-data parsing (MUST come after CSRF)
    const upload = createUploadMiddleware(path.join(uploadsPath, 'temp'));
    // Export upload middleware for routes that need it
    app.locals.upload = upload;

    // Make CSRF token available to all templates
    app.use((req, res, next) => {
        res.locals.csrfToken = req.csrfToken();
        next();
    });

    // Flash messages
    app.use(flash());

    // Static files with cache
    const staticPath = publicPath || path.join(process.cwd(), 'src/public');
    app.use(express.static(staticPath, {
        maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0,
        immutable: process.env.NODE_ENV === 'production'
    }));

    // Register Handlebars helpers
    const defaultHelpers = {
        formatDateInput: function(date) {
            if (!date) return '';
            const d = new Date(date);
            return d.toISOString().slice(0, 10);
        },
        formatDate: function(date) {
            if (!date) return '';
            const d = new Date(date);
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        },
        eq: function(a, b) {
            return a == b;
        },
        gt: function(a, b) {
            return a > b;
        },
        json: function(obj) {
            return JSON.stringify(obj);
        },
        block: function(name, options) {
            return options.fn(this);
        },
        truncate: function(str, len) {
            if (!str || typeof str !== 'string') return '';
            if (str.length <= len) return str;
            return str.substring(0, len) + '...';
        }
    };

    const hbs = engine({
        extname: '.hbs',
        helpers: { ...defaultHelpers, ...handlebarsHelpers }
    });

    app.engine('hbs', hbs);
    app.set('view engine', 'hbs');
    
    // Set views path with fallback to core templates
    const viewsDir = viewsPath || path.join(process.cwd(), 'src/views');
    app.set('views', viewsDir);

    // Attach user to request if logged in
    app.use(attachUser);

    // Rate limiting
    app.use(rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: process.env.NODE_ENV === 'production' ? 25 : 1000,
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests from this IP, please try again later.',
        keyGenerator: (req) => {
            // Use X-Forwarded-For if available, otherwise use IP
            return req.headers['x-forwarded-for'] || req.ip;
        }
    }));

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.status(200).json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            siteName
        });
    });

    // Global error handler
    app.use((err, req, res, next) => {
        logger.error({ 
            err,
            method: req.method,
            url: req.url,
            body: req.body,
            query: req.query,
            ip: req.ip
        }, 'Global Error Handler');
        
        // Don't leak error details in production
        if (process.env.NODE_ENV === 'production') {
            res.status(500).render('500');
        } else {
            res.status(500).render('500', { error: err.message, stack: err.stack });
        }
    });

    // Function to set up final handlers after routes are registered
    const setupFinalHandlers = () => {
        // 404 handler - must be last after all routes
        app.use((req, res) => {
            logger.warn({ url: req.url }, '404 Not Found');
            res.status(404).render('404');
        });
    };

    return { app, setupFinalHandlers };
}
