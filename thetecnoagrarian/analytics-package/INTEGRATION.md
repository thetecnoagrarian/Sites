# Integration Guide

## Quick Installation

### Option 1: Automated Install
```bash
# Copy the analytics-package folder to your project
cp -r analytics-package /path/to/your/project/

# Run the installer
cd /path/to/your/project
node analytics-package/install.js
```

### Option 2: Manual Installation
1. Copy these files to your project:
   - `models/analytics.js` → `src/models/analytics.js`
   - `middleware/analytics.js` → `src/middleware/analytics.js`
   - `views/analytics.hbs` → `src/views/admin/analytics.hbs`

2. Install dependency:
   ```bash
   npm install better-sqlite3
   ```

## Integration Steps

### 1. Add Middleware to app.js
```javascript
const analyticsMiddleware = require('./src/middleware/analytics');

// Add after other middleware, before routes
app.use(analyticsMiddleware);
```

### 2. Add Route to Admin Routes
```javascript
// In your admin routes file
const analyticsRoutes = require('./src/middleware/analytics');
app.use('/admin', analyticsRoutes);
```

### 3. Add Navigation Link
```handlebars
<!-- In your admin layout -->
<sl-button href="/admin/analytics" variant="text">Analytics</sl-button>
```

### 4. Restart Server
```bash
npm run dev
```

## Customization

### Database Location
The analytics data is stored in your existing SQLite database. You can modify the database path in `models/analytics.js`.

### Tracking Rules
Modify `middleware/analytics.js` to change what gets tracked:
- Skip specific routes
- Add custom tracking logic
- Modify data collection

### Dashboard Styling
Customize the analytics dashboard in `views/analytics.hbs` to match your site's design.

## API Endpoints

- `GET /admin/analytics` - Analytics dashboard
- `GET /admin/api/stats` - JSON API for stats

## Troubleshooting

### Common Issues:
1. **"better-sqlite3 not found"** - Run `npm install better-sqlite3`
2. **Database errors** - Check file permissions and database path
3. **Routes not working** - Ensure middleware is added before routes

### Support:
- Check console logs for errors
- Verify file paths are correct
- Ensure database is writable
