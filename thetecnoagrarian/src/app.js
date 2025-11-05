import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { createBlogApp } from '@ffg/blog-core';
import analyticsMiddleware from './middleware/analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Site-specific configuration
const config = {
    siteName: 'The Tecnoagrarian',
    port: process.env.PORT || 3002,
    // Prefer container data volume by default to avoid read-only src paths
    databasePath: process.env.DATABASE_PATH || '/app/data/blog.db',
    uploadsPath: process.env.UPLOADS_PATH || '/app/data/uploads',
    viewsPath: path.join(__dirname, 'views'),
    publicPath: path.join(__dirname, 'public')
};

async function startApp() {
    // Create the blog app
    const { app, setupFinalHandlers } = createBlogApp(config);

    // Log effective paths to help diagnose environment issues
    console.log('[TTA] Effective config:', {
        databasePath: config.databasePath,
        uploadsPath: config.uploadsPath,
        nodeEnv: process.env.NODE_ENV,
    });

    // Apply analytics middleware (must be after database initialization)
    app.use(analyticsMiddleware);

    // Import and use site-specific routes (after database initialization)
    const homeRoutes = await import('./routes/home.js');
    const authRoutes = await import('./routes/auth.js');
    const adminRoutes = await import('./routes/admin.js');

    // Apply routes
    app.use('/', homeRoutes.default);
    app.use('/', authRoutes.default);
    app.use('/admin', adminRoutes.default);

    // Set up 404 handler after routes are registered
    setupFinalHandlers();

    // Start the server
    const port = config.port;
    app.listen(port, () => {
        console.log(`The Tecnoagrarian running on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);
    });
}

startApp().catch(console.error);