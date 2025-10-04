# Blog Core Package

Shared core package for blog functionality across multiple sites.

## Installation

This package is designed to be used within the blog workspace:

```bash
npm install @ffg/blog-core@0.1.0
```

## Usage

```javascript
import { createBlogApp } from '@ffg/blog-core';

const app = createBlogApp({
  // Site-specific configuration
  siteName: 'My Blog',
  port: 3001,
  databasePath: './database/blog.db',
  uploadsPath: '/var/lib/sites/myblog/uploads'
});
```

## Features

- Database models and schema
- Authentication middleware
- File upload handling
- Image processing
- Admin routes and controllers
- Default Handlebars templates
- Security middleware

## Template Override System

Sites can override individual template files by placing them in their `src/views/` directory. The core package provides fallback templates for all views.

## Versioning

This package follows semantic versioning. Sites should pin specific versions in their `package.json`:

```json
{
  "dependencies": {
    "@ffg/blog-core": "0.1.0"
  }
}
```

## Development

This package is part of the blog workspace. To develop:

```bash
# Install workspace dependencies
npm install

# Run tests
npm test

# Build (if needed)
npm run build
```

