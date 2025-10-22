# Blog Monorepo Deployment - Current Status

## 🎯 Project Overview
Deploying a monorepo containing two blog sites (Fruition Forest Garden and The Tecnoagrarian) to Linode server using Docker Compose for side-by-side testing before full migration.

## ✅ What's Working
- **Deployment**: Both sites successfully deployed to Linode server
- **Docker**: Containers built and running (`ffg-blog-prod`, `tta-blog-prod`)
- **Admin Access**: Login working on both sites
- **Image Processing**: File upload and image processing working
- **Security**: CSRF protection implemented and working
- **Dependencies**: NPM updated to latest version, deprecation warnings addressed

## ❌ Current Issue
**Post Creation Failing**: `SqliteError: table posts has no column named description`

### Root Cause
Database schema mismatch between:
- **Code expects**: `content`, `description`, `images`, `captions` columns
- **Live database has**: Old schema missing these columns

### Error Details
```
Error creating post: SqliteError: table posts has no column named description
```

## 🔧 Recent Fixes Applied
1. **Database Schema Alignment**: Updated code to use `content` instead of `body`
2. **OG Tags**: Now use `post.description` field for social sharing
3. **Form Templates**: Use `name="content"` consistently
4. **Admin Routes**: Handle `req.body.content` instead of `req.body.body`
5. **CSRF Protection**: Fixed for multipart form uploads
6. **NPM Update**: Updated to latest version

## 📁 Key Files Modified
- `blog-core/src/database/schema.sql` - Updated to use `content` column
- `blog-core/src/models/post.js` - Uses `content` column consistently
- `fruitionforestgarden/src/routes/admin.js` - Handles `req.body.content`
- `thetecnoagrarian/src/routes/admin.js` - Handles `req.body.content`
- `fruitionforestgarden/src/views/admin/new-post.hbs` - Uses `name="content"`
- `thetecnoagrarian/src/views/admin/new-post.hbs` - Uses `name="content"`
- `fruitionforestgarden/src/middleware/ogTags.js` - Uses `post.description`
- `thetecnoagrarian/src/middleware/ogTags.js` - Uses `post.description`

## 🎯 Next Steps Required
1. **Fix Database Schema**: Add missing columns to existing database
   - Add `description TEXT` column
   - Add `images TEXT` column (for JSON array)
   - Add `captions TEXT` column (for JSON array)
   - Ensure `content` column exists (instead of `body`)

2. **Test Post Creation**: Verify posts can be created successfully

3. **Test OG Tags**: Verify `og:description` uses the Description field

4. **Test Edit Form**: Verify Description and Content fields load correctly

## 🖥️ Server Details
- **Server**: Linode at `172.236.119.220`
- **SSH User**: `deploy`
- **Project Path**: `/opt/Sites`
- **Docker Compose**: `docker-compose.prod.yml`
- **Sites**: 
  - `ffg-new.fruitionforestgarden.com` (port 4000)
  - `tta-new.thetecnoagrarian.com` (port 4002)

## 🔍 Database Schema Expected
```sql
CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,        -- Changed from 'body'
    description TEXT,             -- Missing in live DB
    excerpt TEXT,
    images TEXT,                  -- Missing in live DB (JSON array)
    captions TEXT,                -- Missing in live DB (JSON array)
    author_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🚀 Deployment Commands
```bash
# Deploy changes
ssh deploy@172.236.119.220 "eval \$(ssh-agent -s) && ssh-add ~/.ssh/id_ed25519_new && cd /opt/Sites && git pull origin main && docker-compose -f docker-compose.prod.yml down && docker-compose -f docker-compose.prod.yml up --build -d"

# Check logs
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml logs fruitionforestgarden"

# Check container status
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml ps"
```

## 🎯 Immediate Action Needed
**Database Migration**: The live database needs to be updated to match the expected schema. The containers are running but post creation fails due to missing columns.

## 📝 Form Field Mapping
- **Title** → `title` ✅
- **Description** → `description` ❌ (column missing)
- **Content** → `content` ❌ (column mismatch)
- **Excerpt** → `excerpt` ✅
- **Event Date** → `created_at` ✅

## 🔗 Test URLs
- Admin: `https://ffg-new.fruitionforestgarden.com/admin`
- Admin: `https://tta-new.thetecnoagrarian.com/admin`
- Home: `https://ffg-new.fruitionforestgarden.com`
- Home: `https://tta-new.thetecnoagrarian.com`

---
**Status**: Ready for database schema migration to complete post creation functionality.
