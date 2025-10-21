# Fruition Forest Garden & The Tecnoagrarian - Complete Project Plan

## 🚨 CRITICAL WORKFLOW & CONFIGURATION

### SSH Key Management
- **CORRECT KEY**: `id_ed25519_new` (NOT `id_ed25519_tta`)
- **Server Path**: `~/.ssh/id_ed25519_new`
- **Workflow**: `eval $(ssh-agent -s) && ssh-add ~/.ssh/id_ed25519_new && git pull origin main`
- **Fingerprint**: `SHA256:XJQiXEgpuEZX5lA8Rzm5yVcI9dWUZb4jIDp6VX/bhrQ deploy@linode-server-new`

### Database Configuration
- **Production Path**: `/app/data/blog.db` (NOT `/app/data/database/fruitionforestgarden.db`)
- **Environment Variable**: `DATABASE_PATH=/app/data/blog.db`
- **Admin User**: `fruitionforestgarden@protonmail.com` (NOT `ffg_admin`)
- **Expected Posts**: 11 posts from live site

### Image Issues Status
- **Missing Files**: 18 image files missing from uploads directory
- **Solution**: Re-upload images with new drag-and-drop reordering interface
- **Rate Limiting**: Temporarily disabled for bulk operations

### ✅ **WORKING Deployment Workflow** (Just Tested Successfully)
1. **Local Development**: Make changes locally
2. **Commit**: `git add [files]` → `git commit -m "description"`
3. **Push**: `git push origin main`
4. **Deploy**: `ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d [SERVICE_NAME]"`

### ✅ **Key Success Factors**
- **SSH key properly configured** - No password prompts needed
- **Use `--build` flag** - Ensures latest code is used
- **Target specific services** - Only rebuild what changed
- **Clean git workflow** - Proper commit and push process

### ✅ **Working Commands**
```bash
# Deploy Fruition Forest Garden
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d fruitionforestgarden"

# Deploy The Tecnoagrarian  
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d thetecnoagrarian"
```

### ✅ **Why This Works**
- SSH key is already loaded on server
- `--build` flag forces fresh image with latest code
- Targeted deployment is faster and more reliable
- No authentication issues

## 🎯 CURRENT STATUS

### ✅ COMPLETED
- Login working with correct credentials
- Database has 11 posts and correct schema
- Drag-and-drop image reordering interface deployed
- Database schema fixed (body vs content)
- Sharp image processing working
- Shoelace CDN updated to v2.20.1
- Test database references cleaned up

### ❌ PENDING ISSUES
- 18 image files missing (need re-upload)
- Rate limiting disabled (needs re-enabling after image upload)

### 🔄 NEXT STEPS
1. **Deploy drag-and-drop interface** to server
2. **Re-upload missing images** using new interface
3. **Re-enable rate limiting** after image uploads complete
4. **Test image display** on live site
5. **Complete remaining testing checklist**

## 📋 TESTING CHECKLIST

### ✅ COMPLETED TESTS
- [x] Admin authentication and security
- [x] Post creation and editing functionality
- [x] Image upload and processing
- [x] Database schema compatibility

### ⏳ PENDING TESTS
- [ ] OG tags and social sharing
- [ ] Responsive design and UI components
- [ ] Performance and load times
- [ ] Backup and recovery procedures
- [ ] SSL certificates and security headers
- [ ] Cross-browser compatibility

## 🛠️ TECHNICAL DETAILS

### Server Configuration
- **Server**: `172.236.119.220`
- **User**: `deploy`
- **Project Path**: `/opt/Sites`
- **Docker Compose**: `docker-compose.prod.yml`

### Application URLs
- **Fruition Forest Garden**: `https://ffg-new.fruitionforestgarden.com`
- **The Tecnoagrarian**: `https://tta-new.thetecnoagrarian.com`

### Database Details
- **Type**: SQLite
- **Location**: `/app/data/blog.db`
- **Tables**: posts, users, categories, post_categories, sessions, page_views, unique_visitors
- **Schema**: Uses `body` column (not `content`)

### Image Processing
- **Library**: Sharp
- **Sizes**: thumbnail (400x400), medium (800x800), large (1920x1920)
- **Formats**: JPEG with 85% quality
- **Path**: `/app/data/uploads/`

## 🚨 COMMON MISTAKES TO AVOID

1. **NEVER use `id_ed25519_tta`** - always use `id_ed25519_new`
2. **NEVER assume database path** - always use `/app/data/blog.db`
3. **NEVER use `ffg_admin`** - always use `fruitionforestgarden@protonmail.com`
4. **ALWAYS follow GitHub workflow** - commit locally, push to GitHub, then deploy
5. **ALWAYS check SSH agent** - start agent and add key before git operations

## 📝 RECENT CHANGES

### Latest Commit: `fa35fb7`
- Added drag-and-drop image reordering to admin interface
- Enhanced image upload preview with drag-and-drop reordering
- Users can now reorder images after selection to maintain correct sequence
- Added visual drag handles and remove buttons for better UX
- Applied to both Fruition Forest Garden and The Tecnoagrarian admin interfaces

---

**Last Updated**: October 21, 2024
**Status**: Ready for image re-upload with new interface

