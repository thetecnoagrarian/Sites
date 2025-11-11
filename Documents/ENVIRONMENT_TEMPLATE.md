# Production Environment Configuration Template
# Copy this file to .env and fill in your actual values

# Database Configuration
DATABASE_PATH=/app/data/blog.db
UPLOADS_PATH=/app/data/uploads

# Security Secrets (REQUIRED - Generate strong random strings)
SESSION_SECRET=your-super-secret-session-key-here-minimum-32-characters
CSRF_SECRET=your-csrf-secret-here-minimum-32-characters

# Admin Authentication
ADMIN_PASSWORD=your-secure-admin-password-here

# Application Settings
NODE_ENV=production
LOG_LEVEL=warn
MAX_FILE_SIZE=10485760

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=25

# Trusted IPs (comma-separated for rate limit bypass)
# See Documents/SECRETS.md for your actual trusted IP
TRUSTED_IPS=your-trusted-ip-here

# Optional: Database Backup Settings
BACKUP_RETENTION_DAYS=14
BACKUP_SCHEDULE=0 2 * * *

# Optional: Monitoring
HEALTH_CHECK_INTERVAL=30000
