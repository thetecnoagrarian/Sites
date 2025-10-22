# Fruition Forest Garden & The Tecnoagrarian - Complete Project Plan

## 🚨 CRITICAL STATUS & IMMEDIATE ISSUES

### ⚠️ **CURRENT BLOCKING ISSUE**
- **Server Code Outdated**: Server is on commit `157bf59` (old drag-and-drop)
- **Local Code Updated**: Local is on commit `c0c44dc` (new up/down buttons)
- **SSH Key Authentication Failing**: Server cannot pull latest code from GitHub
- **Result**: Users see old drag-and-drop interface instead of new up/down buttons

### 🔧 **IMMEDIATE FIX NEEDED**
The server needs to be updated with the latest code. The SSH key authentication issue must be resolved to allow `git pull origin main` to work on the server.

## 🚨 CRITICAL WORKFLOW & CONFIGURATION

### SSH Key Management
- **CORRECT KEY**: `id_ed25519_new` (NOT `id_ed25519_tta`)
- **Server Path**: `~/.ssh/id_ed25519_new`
- **GitHub Account**: `thetecnoagrarian` (NOT `fruitionforestgarian`)
- **Repository**: `thetecnoagrarian/Sites` (NOT `thetecnoagrarian/thetecnoagrarian`)
- **Fingerprint**: `SHA256:XJQiXEgpuEZX5lA8Rzm5yVcI9dWUZb4jIDp6VX/bhrQ deploy@linode-server-new`
- **IMPORTANT**: When SSH key requires passphrase, user will run the command manually and provide the response

### Database Configuration
- **Production Path**: `/app/data/blog.db` (NOT `/app/data/database/fruitionforestgarden.db`)
- **Environment Variable**: `DATABASE_PATH=/app/data/blog.db`
- **Admin User**: `fruitionforestgarden@protonmail.com` (NOT `ffg_admin`)
- **Expected Posts**: 11 posts from live site

### Server Configuration
- **Server**: `172.236.119.220` (Linode)
- **User**: `deploy`
- **Project Path**: `/opt/Sites`
- **Docker Compose**: `docker-compose.prod.yml`
- **Container Names**: `ffg-blog-prod` (port 4000), `tta-blog-prod` (port 4002)

## 🚀 DEPLOYMENT WORKFLOW (CORRECTED)

### ✅ **WORKING Deployment Process**
1. **Local Development**: Make changes locally
2. **Commit**: `git add [files]` → `git commit -m "description"`
3. **Push**: `git push origin main`
4. **Deploy**: `ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d [SERVICE_NAME]"`

### ⚠️ **CURRENT ISSUE WITH DEPLOYMENT**
- **Problem**: SSH key authentication failing on server
- **Symptom**: `git pull origin main` returns "Permission denied (publickey)"
- **Impact**: Server cannot get latest code, containers build from old code
- **Solution Needed**: Fix SSH key authentication or manually update server code

### ✅ **Working Commands (When SSH Fixed)**
```bash
# Deploy Fruition Forest Garden
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d fruitionforestgarden"

# Deploy The Tecnoagrarian  
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d thetecnoagrarian"
```

## 🎯 CURRENT STATUS

### ✅ COMPLETED
- Login working with correct credentials (`fruitionforestgarden@protonmail.com`)
- Database has 11 posts and correct schema (uses `body` column)
- Database schema fixed (body vs content)
- Sharp image processing working
- Shoelace CDN updated to v2.20.1
- Test database references cleaned up
- **NEW**: Up/down arrow buttons implemented locally (commit `c0c44dc`)

### ❌ PENDING ISSUES
- **CRITICAL**: Server code outdated (commit `157bf59` vs local `c0c44dc`)
- **CRITICAL**: SSH key authentication failing on server
- **CRITICAL**: Users see old drag-and-drop interface instead of new up/down buttons
- 18 image files missing (need re-upload)
- Rate limiting disabled (needs re-enabling after image upload)

### 🔄 IMMEDIATE NEXT STEPS
1. **Fix SSH key authentication** on server
2. **Pull latest code** to server (`git pull origin main`)
3. **Rebuild containers** with new up/down button code
4. **Test new interface** on live sites
5. **Re-upload missing images** using new interface
6. **Re-enable rate limiting** after image uploads complete

## 📋 TESTING CHECKLIST

### ✅ COMPLETED TESTS
- [x] Admin authentication and security
- [x] Post creation and editing functionality
- [x] Image upload and processing
- [x] Database schema compatibility
- [x] Drag-and-drop image reordering (old interface)
- [x] **NEW**: Up/down arrow buttons (local implementation)

### ⏳ PENDING TESTS
- [ ] **CRITICAL**: Deploy and test up/down arrow buttons on live sites
- [ ] OG tags and social sharing
- [ ] Responsive design and UI components
- [ ] Performance and load times
- [ ] Backup and recovery procedures
- [ ] SSL certificates and security headers
- [ ] Cross-browser compatibility

## 🛠️ TECHNICAL DETAILS

### Application URLs
- **Fruition Forest Garden**: `https://ffg-new.fruitionforestgarden.com` (port 4000)
- **The Tecnoagrarian**: `https://tta-new.thetecnoagrarian.com` (port 4002)

### Database Details
- **Type**: SQLite
- **Location**: `/app/data/blog.db`
- **Tables**: posts, users, categories, post_categories, sessions, page_views, unique_visitors
- **Schema**: Uses `body` column (not `content`)
- **Admin User**: `fruitionforestgarden@protonmail.com`

### Image Processing
- **Library**: Sharp
- **Sizes**: thumbnail (400x400), medium (800x800), large (1920x1920)
- **Formats**: JPEG with 85% quality
- **Path**: `/app/data/uploads/`
- **Interface**: **NEW** - Up/down arrow buttons (replaces drag-and-drop)

### Docker Configuration
- **Compose File**: `docker-compose.prod.yml`
- **Environment Variables**:
  - `DATABASE_PATH=/app/data/blog.db`
  - `UPLOADS_PATH=/app/data/uploads`
  - `SESSION_SECRET` (from .env file)
  - `RATE_LIMIT_MAX_REQUESTS=1000`

## 🚨 COMMON MISTAKES TO AVOID

1. **NEVER use `id_ed25519_tta`** - always use `id_ed25519_new`
2. **NEVER assume database path** - always use `/app/data/blog.db`
3. **NEVER use `ffg_admin`** - always use `fruitionforestgarden@protonmail.com`
4. **ALWAYS follow GitHub workflow** - commit locally, push to GitHub, then deploy
5. **ALWAYS check SSH agent** - start agent and add key before git operations
6. **NEVER use `restart`** - always use `--build` flag for code changes
7. **ALWAYS verify server has latest code** - check `git log` on server

## 📝 RECENT CHANGES

### Latest Commit: `c0c44dc` (LOCAL - NOT ON SERVER)
- **MAJOR**: Replaced drag-and-drop with simple up/down arrow buttons
- **Interface**: Each image now has "↑ Move Up" and "↓ Move Down" buttons
- **UX**: Position indicator shows "Position: 2 of 5"
- **Accessibility**: Works on all devices (mobile, tablet, desktop)
- **Applied to**: Both Fruition Forest Garden and The Tecnoagrarian sites

### Previous Commit: `fcc1b2d`
- Documented successful deployment workflow
- Added visual drop zones for drag-and-drop image reordering

### Server Status: `157bf59` (OUTDATED)
- Fix drag-and-drop JavaScript conflicts
- Server is missing the latest up/down button implementation

## 🔧 TROUBLESHOOTING

### SSH Key Issues
```bash
# Check SSH agent status
ssh-add -l

# Start SSH agent and add key
eval $(ssh-agent -s)
ssh-add ~/.ssh/id_ed25519_new

# Test GitHub connection
ssh -T git@github.com
```

### Deployment Issues
```bash
# Check container status
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml ps"

# Check server git status
ssh deploy@172.236.119.220 "cd /opt/Sites && git log --oneline -5"

# Force rebuild if needed
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml down && docker-compose -f docker-compose.prod.yml up --build -d"
```

### Code Sync Issues
- **Problem**: Server code outdated
- **Check**: `git log --oneline -5` on server vs local
- **Solution**: Fix SSH key, then `git pull origin main` on server

---

**Last Updated**: October 22, 2024
**Status**: **BLOCKED** - SSH key authentication issue preventing server code updates
**Priority**: **CRITICAL** - Fix SSH key authentication to deploy up/down button interface