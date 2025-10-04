# Simple Blog Analytics

A lightweight, privacy-focused analytics package for blog websites.

## Features

- 📊 Page view tracking
- 👥 Unique visitor counting
- 🌍 IP address tracking
- 🔗 Referrer tracking
- ⚡ Performance optimized
- 🛡️ Privacy conscious
- 📱 Admin dashboard

## Installation

1. Copy the package files to your project
2. Install dependencies: `npm install better-sqlite3`
3. Import and use the analytics

## Quick Start

```javascript
// In your main app.js
const analyticsMiddleware = require('./analytics-package/middleware');

// Add middleware
app.use(analyticsMiddleware);

// Add routes
app.use('/admin', require('./analytics-package/routes'));
```

## Files Structure

```
analytics-package/
├── models/
│   └── analytics.js      # Database model
├── middleware/
│   └── analytics.js      # Tracking middleware
├── routes/
│   └── admin.js          # Admin routes
├── views/
│   └── analytics.hbs     # Dashboard template
├── package.json
└── README.md
```

## Usage

The analytics will automatically track:
- All page views (excluding static assets)
- Unique visitors by session
- IP addresses and user agents
- Referrer information

Access your analytics at `/admin/analytics`

## Customization

- Modify the database schema in `models/analytics.js`
- Customize the dashboard in `views/analytics.hbs`
- Adjust tracking rules in `middleware/analytics.js`

## License

MIT
