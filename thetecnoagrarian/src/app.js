import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { createBlogApp } from '@ffg/blog-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Site-specific configuration
const config = {
    siteName: 'The Tecnoagrarian',
    port: process.env.PORT || 3002,
    databasePath: path.join(__dirname, 'database/blog.db'),
    uploadsPath: path.join(__dirname, 'public/uploads'),
    viewsPath: path.join(__dirname, 'views'),
    publicPath: path.join(__dirname, 'public')
};

async function startApp() {
    // Create the blog app
    const { app, setupFinalHandlers } = createBlogApp(config);

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