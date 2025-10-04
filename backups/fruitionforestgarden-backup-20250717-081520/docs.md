# Fruition Forest Garden - Project Documentation

## Project Setup

- Express.js web application
- Handlebars templating
- SQLite database
- Shoelace UI components

## Dependencies

### Core Dependencies

- express: Web framework
- express-handlebars: Templating engine
- better-sqlite3: Database
- sharp: Image processing
- multer: File upload handling
- express-session: Session management
- dotenv: Environment variables
- morgan: Request logging
- helmet: Security headers
- slugify: URL-friendly strings

### Development Dependencies

- nodemon: Hot reloading

## Project Structure

```
fruitionforestgarden/
├── src/
│   ├── controllers/    # Route controllers
│   ├── models/         # Database models
│   ├── routes/         # Route definitions
│   ├── views/          # Handlebars templates
│   │   ├── layouts/    # Layout templates
│   │   └── partials/   # Reusable components
│   ├── public/         # Static assets
│   │   ├── css/        # Stylesheets
│   │   ├── js/         # Client-side scripts
│   │   ├── images/     # Sitewide images (logo, favicon, etc.)
│   │   └── uploads/    # Uploaded images
│   └── middleware/     # Custom middleware
├── docs.md             # This documentation
└── package.json        # Project configuration
```

## Database Schema

See prompt.txt for complete schema definition.

## Next Steps

1. Set up Express server with basic configuration
2. Configure Handlebars templating
3. Initialize database with schema
4. Create basic routes and controllers
5. Set up authentication system
6. Implement image upload and processing
7. Create admin interface
8. Build public-facing pages
