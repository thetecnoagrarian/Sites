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

## Recent Features & Improvements

### Duplicate Post Detection & Overwrite System
- **Location**: `src/models/post.js`, `src/routes/admin.js`
- **How it works**: 
  - When creating a post, the system checks if a post with the same title already exists
  - If found, redirects to a confirmation page (`/admin/posts/confirm-overwrite`)
  - User can choose to overwrite the existing post or cancel
  - Overwrite updates the existing post with new content and creation date
- **Benefits**: Prevents accidental duplicates and provides clear user control

### HEIF/HEIC Image Format Handling
- **Location**: `src/utils/imageProcessor.js`
- **How it works**:
  - Detects HEIF/HEIC files by extension and Sharp library errors
  - Provides helpful error messages with conversion instructions
  - Prevents application crashes from unsupported formats
- **Error handling**: Graceful fallback with user-friendly messages

### Unique Slug Generation
- **Location**: `src/models/post.js` (`generateUniqueSlug` function)
- **How it works**:
  - Creates base slug from title using slugify
  - Checks database for existing slugs
  - Adds numeric suffix if conflict found (e.g., "my-post-1", "my-post-2")
- **Benefits**: Prevents database constraint errors and ensures unique URLs

### Handlebars Helpers
- **Location**: `src/app.js`
- **Available helpers**:
  - `truncate(str, len)`: Truncates text to specified length with ellipsis
  - `formatDate(date)`: Formats dates for display
  - `formatDateInput(date)`: Formats dates for form inputs
  - `eq(a, b)`: Equality comparison
  - `gt(a, b)`: Greater than comparison
  - `json(obj)`: JSON stringify for debugging

## Database Schema

The application uses SQLite with the following main tables:
- `users`: User accounts and authentication
- `posts`: Blog posts with title, body, images, etc.
- `categories`: Post categories
- `post_categories`: Many-to-many relationship between posts and categories

## Image Processing Pipeline

1. **Upload**: Files uploaded via multer middleware
2. **Validation**: Check file extension and attempt metadata extraction
3. **Error Handling**: Catch HEIF/HEIC errors and provide helpful messages
4. **Processing**: Generate thumbnail, medium, and large versions
5. **Storage**: Save processed images to `src/public/uploads/`
6. **Database**: Store image paths and metadata in post record

## Admin Workflow

### Creating Posts
1. Fill out post form with title, content, images
2. System checks for duplicate titles
3. If duplicate found: Show confirmation dialog
4. User chooses: Overwrite existing or cancel
5. If overwrite: Update existing post with new content
6. If new: Create post with unique slug
7. Redirect to dashboard with success message

### Error Handling
- **Image errors**: Clear messages with conversion instructions
- **Database errors**: Graceful handling with user feedback
- **Validation errors**: Form validation with helpful messages
- **Session errors**: Automatic cleanup and redirect

## Security Features

- CSRF protection on all forms
- Session-based authentication
- Admin role verification
- File upload validation
- SQL injection prevention (prepared statements)
- XSS protection via template escaping
