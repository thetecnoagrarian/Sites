# Blog Monorepo - Consolidated Documentation

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Current Status](#current-status)
3. [Architecture](#architecture)
4. [Deployment Guide](#deployment-guide)
5. [Safety & Security](#safety--security)
6. [Development Workflow](#development-workflow)
7. [Testing & Validation](#testing--validation)
8. [Troubleshooting](#troubleshooting)
9. [Future Enhancements](#future-enhancements)

---

## 🎯 Project Overview

### What This Is
A monorepo containing two blog sites deployed to Linode server using Docker Compose for side-by-side testing before full migration:

- **Fruition Forest Garden** (`ffg-new.fruitionforestgarden.com`) - Port 4000
- **The Tecnoagrarian** (`tta-new.thetecnoagrarian.com`) - Port 4002

### Technology Stack
- **Backend**: Node.js + Express.js
- **Database**: SQLite3 with better-sqlite3
- **Templating**: Handlebars
- **Image Processing**: Sharp
- **UI Components**: Shoelace v2.20.1
- **Deployment**: Docker Compose + Nginx
- **Process Management**: PM2 (production)

---

## ✅ Current Status

### What's Working
- ✅ **Deployment**: Both sites successfully deployed to Linode server
- ✅ **Docker**: Containers built and running (`ffg-blog-prod`, `tta-blog-prod`)
- ✅ **Admin Access**: Login working on both sites
- ✅ **Image Processing**: File upload and image processing working
- ✅ **Security**: CSRF protection implemented and working
- ✅ **Dependencies**: NPM updated to latest version, deprecation warnings addressed
- ✅ **Shoelace**: Updated to v2.20.1, CDN issues resolved

### Recent Fixes Applied
1. **Database Schema Alignment**: Updated code to use `body` instead of `content` to match live database
2. **OG Tags**: Now use `post.description` field for social sharing
3. **Form Templates**: Use `name="body"` consistently
4. **Admin Routes**: Handle `req.body.body` instead of `req.body.content`
5. **CSRF Protection**: Fixed for multipart form uploads
6. **Image Processing**: Restored Sharp-based image processing functionality
7. **Shoelace CDN**: Updated to v2.20.1 and removed deprecated icons.css references

### Server Details
- **Server**: Linode at `172.236.119.220`
- **SSH User**: `deploy`
- **Project Path**: `/opt/Sites`
- **Docker Compose**: `docker-compose.prod.yml`
- **SSH Key**: `id_ed25519_new` (standardized)

---

## 🏗️ Architecture

### Directory Structure
```
/Users/air/Sites/
├── blog-core/                    # Shared core package
│   ├── src/
│   │   ├── models/              # Database models
│   │   ├── utils/               # Image processing, utilities
│   │   ├── middleware/          # Auth, security, upload
│   │   ├── routes/              # Admin routes, API routes
│   │   ├── controllers/         # Route controllers
│   │   ├── database/            # Database schema & migrations
│   │   └── templates/           # Default Handlebars templates
│   └── package.json
│
├── fruitionforestgarden/         # Site-specific
│   ├── src/
│   │   ├── app.js               # Site entry point
│   │   ├── public/              # Static assets
│   │   └── views/               # Site-specific templates
│   └── package.json
│
├── thetecnoagrarian/            # Site-specific
│   └── src/                     # Same structure as above
│
└── docker/                      # Docker configuration
    ├── Dockerfile.prod.site
    └── docker-compose.prod.yml
```

### Database Schema
```sql
CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    body TEXT NOT NULL,           -- Main content
    description TEXT,             -- SEO description
    excerpt TEXT,
    images TEXT,                  -- JSON array of image paths
    captions TEXT,                -- JSON array of captions
    author_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
);
```

---

## 🚀 Deployment Guide

### Safe Deployment Commands

**⚠️ CRITICAL: Always use git-based deployment - NEVER use rsync!**

#### One-Command Deployment
```bash
ssh deploy@172.236.119.220 "eval \$(ssh-agent -s) && ssh-add ~/.ssh/id_ed25519_new && cd /opt/Sites && git pull origin main && docker-compose -f docker-compose.prod.yml down && docker-compose -f docker-compose.prod.yml up --build -d"
```

#### Step-by-Step Deployment
```bash
# 1. SSH into server
ssh deploy@172.236.119.220

# 2. Load SSH key
eval $(ssh-agent -s)
ssh-add ~/.ssh/id_ed25519_new

# 3. Navigate to project
cd /opt/Sites

# 4. Pull latest changes
git pull origin main

# 5. Rebuild and restart containers
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up --build -d

# 6. Check status
docker-compose -f docker-compose.prod.yml ps
```

### Container Management
```bash
# Check container status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs fruitionforestgarden
docker-compose -f docker-compose.prod.yml logs thetecnoagrarian

# Restart individual container
docker-compose -f docker-compose.prod.yml restart fruitionforestgarden

# Full rebuild
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up --build -d
```

---

## 🛡️ Safety & Security

### 🚨 CRITICAL WARNING - Data Loss Prevention

**NEVER USE THESE DANGEROUS COMMANDS:**
```bash
# ❌ DANGEROUS - Can cause complete data loss!
rsync -avz src/ root@server:/path/
scp -r src/ root@server:/path/
```

**Why rsync is Dangerous:**
- Can overwrite critical files even with exclusions
- Bypasses version control and rollback procedures
- High risk of data loss
- No audit trail of what was changed
- Can corrupt live database and content

### Security Checklist

#### Environment Variables
- [ ] `SESSION_SECRET` - Use a strong, random string (32+ characters)
- [ ] `CSRF_SECRET` - Use a strong, random string (32+ characters)
- [ ] `ADMIN_PASSWORD` - Change from default `admin123`
- [ ] `NODE_ENV=production` - Set in production

#### File Permissions
```bash
# Database file
chmod 600 src/database/*.db

# Upload directory
chmod 755 src/public/uploads
chmod 644 src/public/uploads/*

# Environment file
chmod 600 .env
```

#### Security Features
- ✅ CSRF protection on all forms
- ✅ Session-based authentication
- ✅ Admin role verification
- ✅ File upload validation
- ✅ SQL injection prevention (prepared statements)
- ✅ XSS protection via template escaping

### Default Admin Credentials
- **Username**: `admin`
- **Password**: `admin123` (**CHANGE THIS IMMEDIATELY!**)

---

## 🔧 Development Workflow

### Local Development Setup
```bash
# 1. Clone repository
git clone git@github.com:thetecnoagrarian/Sites.git
cd Sites

# 2. Install dependencies
npm install

# 3. Set up environment
cp env.prod.example .env
# Edit .env with secure values

# 4. Start development
npm run dev
```

### Git Workflow
```bash
# 1. Make changes locally
# 2. Test changes
# 3. Commit and push
git add .
git commit -m "Describe your change"
git push origin main

# 4. Deploy to server (see deployment section)
```

### Code Organization
- **Core Package**: Shared functionality in `blog-core/`
- **Site-Specific**: Customizations in individual site directories
- **Templates**: Sites can override individual template files
- **Assets**: Complete styling customization per site
- **Database**: Separate SQLite database file per site

---

## 🧪 Testing & Validation

### Local Testing Checklist

#### Basic Functionality
- [ ] **FruitionForestGarden** (http://localhost:3001)
  - [ ] Site loads without errors
  - [ ] Admin login works (admin/admin123)
  - [ ] Can create/edit/delete posts
  - [ ] Image uploads work
  - [ ] Categories work
  - [ ] Search functionality works

- [ ] **TheTecnoagrarian** (http://localhost:3002)
  - [ ] Site loads without errors
  - [ ] Admin login works (admin/admin123)
  - [ ] Can create/edit/delete posts
  - [ ] Image uploads work
  - [ ] Categories work
  - [ ] Search functionality works

#### Security Testing
- [ ] Admin routes are protected
- [ ] CSRF protection works
- [ ] Rate limiting is active
- [ ] Session management works

#### Performance Testing
- [ ] Sites load quickly
- [ ] Image optimization works
- [ ] No memory leaks
- [ ] Database queries are efficient

### Production Testing
```bash
# Test URLs
https://ffg-new.fruitionforestgarden.com
https://tta-new.thetecnoagrarian.com

# Health checks
curl http://localhost:4000/health
curl http://localhost:4002/health
```

---

## 🐛 Troubleshooting

### Common Issues

#### Container Issues
```bash
# Container won't start
docker-compose -f docker-compose.prod.yml logs <service-name>

# Check container status
docker-compose -f docker-compose.prod.yml ps

# Rebuild containers
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up --build -d
```

#### Database Issues
```bash
# Check database file
ls -la /opt/Sites/fruitionforestgarden/src/database/
ls -la /opt/Sites/thetecnoagrarian/src/database/

# Verify database schema
sqlite3 /path/to/database.db ".schema posts"
```

#### Image Processing Issues
```bash
# Check Sharp installation
docker-compose -f docker-compose.prod.yml exec fruitionforestgarden node -e "console.log(require('sharp'))"

# Check uploads directory
ls -la /opt/Sites/fruitionforestgarden/src/public/uploads/
```

#### SSH Issues
```bash
# Test SSH connection
ssh -T git@github.com

# Check SSH agent
ssh-add -l

# Load SSH key
eval $(ssh-agent -s)
ssh-add ~/.ssh/id_ed25519_new
```

### Error Messages & Solutions

#### "Post with this title already exists"
- **Solution**: Use the overwrite feature or change the title
- **Prevention**: Check existing posts before creating new ones

#### "HEIF/HEIC files not supported"
- **Solution**: Convert the image to JPEG or PNG
- **Prevention**: Check image format before uploading

#### "Images not displaying"
- **Check**: File format and size
- **Solution**: Re-upload in supported format

#### "Post not appearing on dashboard"
- **Check**: Creation date - posts are ordered by date
- **Solution**: Look further down the list if using an older date

---

## 🚀 Future Enhancements

### Phase 1 (High Priority)
1. **Image Pipeline Improvements**
   - WebP and AVIF support
   - Responsive image generation
   - Enhanced error handling
   - CDN integration

2. **Core System Enhancements**
   - Advanced search functionality
   - Content management features
   - User management system
   - API development

3. **Performance & Scalability**
   - Caching system (Redis)
   - Database optimization
   - Monitoring & logging
   - Backup automation

### Phase 2 (Medium Priority)
1. **Security Enhancements**
   - Advanced security measures
   - Backup & recovery system
   - Audit logging

2. **User Experience**
   - Mobile optimization
   - Accessibility improvements
   - Internationalization

### Phase 3 (Future)
1. **Advanced Features**
   - Analytics & reporting
   - Content scheduling
   - Version history
   - Bulk operations

---

## 📚 Additional Resources

### Key Files
- **Main Deployment**: `DEPLOYMENT_GUIDE.md`
- **Safety Guidelines**: `docs/DEPLOYMENT_SAFETY.md`
- **Quick Reference**: `docs/QUICK_DEPLOY.md`
- **Admin Guide**: `docs/ADMIN_GUIDE.md`
- **Docker Setup**: `docs/DOCKER.md`

### GitHub Accounts
- **FruitionForestGarden**: `fruitionforestgarden` GitHub account
- **TheTecnoagrarian**: `thetecnoagrarian` GitHub account
- **Blog Template**: `thetecnoagrarian` GitHub account

### Server Information
- **Provider**: Linode
- **Location**: Chicago, IL
- **IP Address**: 172.236.119.220
- **SSH User**: `deploy`
- **SSH Key**: `id_ed25519_new`

---

## 📝 Notes

- **Default Admin Credentials**: admin/admin123 (change immediately!)
- **SSH Key**: Always use `id_ed25519_new` for consistency
- **Deployment Method**: Always use git-based deployment, never rsync
- **Database**: Each site has its own isolated SQLite database
- **Ports**: FruitionForestGarden (4000), TheTecnoagrarian (4002)
- **Shoelace**: Updated to v2.20.1 with proper CDN configuration

---

**Last Updated**: October 17, 2025  
**Status**: Production Ready  
**Next Steps**: Monitor deployment and plan Phase 1 enhancements
