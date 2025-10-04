require('dotenv').config();
const express = require('express');
const session = require('express-session');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const { engine } = require('express-handlebars');
const flash = require('connect-flash');
const { attachUser } = require('./middleware/auth');
const csurf = require('csurf');
const BetterSqlite3Store = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const logger = require('./utils/logger');

const app = express();

// Trust proxy if behind reverse proxy (always trust when X-Forwarded-For is present)
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
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

// Static files with cache
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0,
    immutable: process.env.NODE_ENV === 'production'
}));

// Session configuration
const db = new Database(path.join(__dirname, 'database/blog.db'));

// This block ensures the table exists, but the fix-sessions.js script is the primary tool for schema changes.
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire INTEGER NOT NULL
  )
`);

const sessionStore = new BetterSqlite3Store({
    client: db,
    table: 'sessions'
});

app.use(session({
    store: sessionStore,
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
app.use(csurf());
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});

// Flash messages
app.use(flash());

// Template engine setup
app.engine('hbs', engine({ extname: '.hbs' }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

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

// Routes
app.use('/', require('./routes/home'));
app.use('/admin', require('./routes/admin'));

// 404 handler
app.use((req, res) => {
    logger.warn({ url: req.url }, '404 Not Found');
    res.status(404).render('404');
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
    logger.info(`Server running on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);
}); 