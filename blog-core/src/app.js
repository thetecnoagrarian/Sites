import express from 'express';
import session from 'express-session';
import SQLiteStoreFactory from 'better-sqlite3-session-store';
import morgan from 'morgan';
import helmet from 'helmet';
import path from 'path';
import { engine } from 'express-handlebars';
import flash from 'connect-flash';
import csrf from 'csrf';
import Database from 'better-sqlite3';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import multer from 'multer';
import { mkdirSync } from 'fs';

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

    // Ensure uploads directory exists
    try {
        mkdirSync(uploadsPath, { recursive: true });
    } catch (error) {
        // If directory creation fails, provide a helpful error message
        if (error.code === 'ENOENT' || error.code === 'EACCES') {
            throw new Error(
                `Cannot create uploads directory at "${uploadsPath}". ` +
                `Parent directory may not exist or you may not have permissions. ` +
                `For local development, ensure UPLOADS_PATH points to a writable location. ` +
                `Original error: ${error.message}`
            );
        }
        throw error;
    }

    const app = express();

    // Trust proxy if behind reverse proxy
    app.set('trust proxy', true);

    // Initialize database
    const db = initializeDatabase(databasePath);
    setDatabase(db);

    // Initialize SQLite session store
    const SQLiteStore = SQLiteStoreFactory(session);
    const sessionStore = new SQLiteStore({
        client: db,
        expired: {
            clear: true,
            intervalMs: 900000 // Clean up expired sessions every 15 minutes
        }
    });

    // Security middleware
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://cdnjs.cloudflare.com",
                    "https://cdn.jsdelivr.net",
                    "https://fonts.googleapis.com"
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
                    "https://cdn.jsdelivr.net",
                    "https://fonts.googleapis.com",
                    "https://fonts.gstatic.com"
                ],
                imgSrc: ["'self'", "data:", "blob:", "https://cdn.jsdelivr.net"],
                connectSrc: ["'self'", "https://cdn.jsdelivr.net", "data:"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
                formAction: ["'self'", "http://172.236.119.220:4000", "http://172.236.119.220:4002", "https://172.236.119.220:4000", "https://172.236.119.220:4002", "https://thetecnoagrarian.com", "https://www.thetecnoagrarian.com"],
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

    // Session configuration - using SQLite-backed session store
    app.use(session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET,
        resave: false, // SQLite store handles this automatically
        saveUninitialized: true, // Save uninitialized sessions (needed for CSRF token)
        cookie: {
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
            httpOnly: true,
            sameSite: 'lax', // Change from 'strict' to 'lax' for better compatibility
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        },
        name: 'blog.sid' // Use a custom session name to avoid conflicts
    }));

    // Initialize CSRF protection
    const csrfProtection = new csrf();
    
    // CSRF protection middleware
    app.use((req, res, next) => {
        // Generate or verify CSRF token
        const secret = req.session.csrfSecret || csrfProtection.secretSync();
        if (!req.session.csrfSecret) {
            req.session.csrfSecret = secret;
            // Ensure session is saved when we set the CSRF secret
            req.session.save((err) => {
                if (err) console.error('Session save error:', err);
            });
        }
        
        // Always add CSRF token generation method
        req.csrfToken = () => csrfProtection.create(secret);
        
        // Skip CSRF validation for multipart form data (handled manually in routes)
        if (req.get('content-type') && req.get('content-type').includes('multipart/form-data')) {
            return next();
        }
        
        // Skip CSRF validation for GET, HEAD, OPTIONS
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }
        
        // Validate CSRF token for POST, PUT, DELETE
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
            const token = req.body._csrf || req.headers['x-csrf-token'];
            const sessionSecret = req.session.csrfSecret;
            
            if (!token) {
                console.error('CSRF token missing in request');
                return res.status(403).json({ error: 'Invalid CSRF token' });
            }
            
            if (!sessionSecret) {
                console.error('CSRF secret missing in session');
                return res.status(403).json({ error: 'Invalid CSRF token' });
            }
            
            if (!csrfProtection.verify(sessionSecret, token)) {
                console.error('CSRF token verification failed', { 
                    hasToken: !!token, 
                    hasSecret: !!sessionSecret,
                    tokenLength: token?.length,
                    secretLength: sessionSecret?.length
                });
                return res.status(403).json({ error: 'Invalid CSRF token' });
            }
        }
        
        next();
    });

    // Multer middleware for multipart/form-data parsing (MUST come after CSRF)
    const upload = createUploadMiddleware(path.join(uploadsPath, 'temp'));
    // Export upload middleware for routes that need it
    app.locals.upload = upload;

    // Make CSRF token available to all templates
    app.use((req, res, next) => {
        // Only set csrfToken if CSRF middleware was applied
        if (req.csrfToken) {
            res.locals.csrfToken = req.csrfToken();
        }
        next();
    });

    // Flash messages
    app.use(flash());

    // Static files with cache
    // TODO: Re-enable aggressive caching (30d, immutable) once design is finalized
    const staticPath = publicPath || path.join(process.cwd(), 'src/public');
    
    // Ensure image files are served with correct MIME type
    app.use((req, res, next) => {
        const pathLower = req.path.toLowerCase();
        if (pathLower.endsWith('.jpg') || req.path.endsWith('.JPG')) {
            res.type('image/jpeg');
        } else if (pathLower.endsWith('.png') || req.path.endsWith('.PNG')) {
            res.type('image/png');
        } else if (pathLower.endsWith('.jpeg')) {
            res.type('image/jpeg');
        } else if (pathLower.endsWith('.gif')) {
            res.type('image/gif');
        } else if (pathLower.endsWith('.webp')) {
            res.type('image/webp');
        }
        next();
    });
    
    app.use(express.static(staticPath, {
        maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, // Reduced from 30d during active development
        immutable: false // Disabled during active development to allow cache-busting
    }));

    // Serve uploads directory separately (keep longer cache for images)
    app.use('/uploads', express.static(uploadsPath, {
        maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0, // Images can cache longer
        immutable: false
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

    // Public crawler policy
    app.get('/robots.txt', (req, res) => {
        res.type('text/plain');
        res.send([
            'User-agent: *',
            'Allow: /',
            ''
        ].join('\n'));
    });

    // Request filtering middleware
    app.use((req, res, next) => {
        // Allow health check endpoint to bypass request filtering (needed for Docker health checks)
        if (req.path === '/health') {
            return next();
        }
        
        const userAgent = req.headers['user-agent'] || '';
        const clientIP = req.headers['x-forwarded-for'] || req.ip;
        const pathLower = req.path.toLowerCase();
        
        // Block requests for sensitive files
        const sensitivePaths = [
            '/.env', '/.env.local', '/.env.production',
            '/config/database.yml', '/config/secrets.yml',
            '/wp-admin', '/wp-login', '/phpmyadmin',
            '/adminer', '/.git', '/.svn', '/.htaccess',
            '/backup', '/backups', '/.backup'
        ];

        // Check for sensitive file requests
        if (sensitivePaths.some(path => pathLower.includes(path))) {
            logger.warn(`Sensitive file access attempt: ${req.path} from ${clientIP}`);
            return res.status(404).json({ error: 'Not found' });
        }

        // Log crawler/tool user agents without blocking public crawlable content.
        const botPatterns = [
            /bot/i, /crawler/i, /spider/i, /scraper/i,
            /curl/i, /wget/i, /python/i, /java/i,
            /nikto/i, /sqlmap/i, /nmap/i, /masscan/i,
            /zgrab/i, /gobuster/i, /dirb/i, /dirbuster/i
        ];

        if (botPatterns.some(pattern => pattern.test(userAgent))) {
            logger.info(`Crawler/tool user agent allowed: ${userAgent} from ${clientIP} on ${req.path}`);
        }
        
        next();
    });

    // Rate limiting for production security
    app.use(rateLimit({
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
        max: (req) => {
            // Trusted IPs that bypass rate limiting
            // Read from environment variable or use defaults
            const trustedIPsEnv = process.env.TRUSTED_IPS || '129.222.46.17,129.222.46.40';
            const trustedIPs = trustedIPsEnv.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
            
            // Get client IP (handle X-Forwarded-For which may contain multiple IPs)
            let clientIP = req.headers['x-forwarded-for'] || req.ip;
            // X-Forwarded-For can be a comma-separated list, take the first one
            if (clientIP.includes(',')) {
                clientIP = clientIP.split(',')[0].trim();
            }
            
            // Check if client IP matches any trusted IP or is in the same subnet
            const isTrusted = trustedIPs.some(trustedIP => {
                // Exact match
                if (clientIP === trustedIP) return true;
                // Subnet match (e.g., 129.222.46.* or 129.222.*.*)
                if (trustedIP.includes('*')) {
                    // Escape dots and convert * to .*
                    const pattern = trustedIP
                        .replace(/\./g, '\\.')  // Escape dots first
                        .replace(/\*/g, '.*');   // Then convert * to .*
                    const regex = new RegExp(`^${pattern}$`);
                    return regex.test(clientIP);
                }
                return false;
            });
            
            // If IP is trusted, allow unlimited requests
            if (isTrusted) {
                return 10000; // Effectively unlimited
            }
            
            // Otherwise use environment-based rate limits
            return parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (process.env.NODE_ENV === 'production' ? 25 : 1000);
        },
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

    // Debug endpoint to check IP detection (remove after testing)
    app.get('/debug-ip', (req, res) => {
        const xForwardedFor = req.headers['x-forwarded-for'];
        const reqIP = req.ip;
        const trustedIPsEnv = process.env.TRUSTED_IPS || '';
        let clientIP = xForwardedFor || reqIP;
        if (clientIP && clientIP.includes(',')) {
            clientIP = clientIP.split(',')[0].trim();
        }
        res.json({
            'x-forwarded-for': xForwardedFor,
            'req.ip': reqIP,
            'detected-client-ip': clientIP,
            'trusted-ips': trustedIPsEnv,
            'is-trusted': trustedIPsEnv.split(',').map(ip => ip.trim()).some(ip => {
                if (ip.includes('*')) {
                    const pattern = ip.replace(/\*/g, '.*');
                    return new RegExp(`^${pattern}$`).test(clientIP);
                }
                return clientIP === ip;
            })
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
