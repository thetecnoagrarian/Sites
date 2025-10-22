# Local Testing Checklist

This document outlines what to test before pushing to GitHub and deploying to the server.

## 🚀 Quick Start

```bash
# Start all three sites
./start-all-sites.sh

# Stop all sites
./stop-all-sites.sh

# Restart all sites
./restart-all-sites.sh
```

## 📋 Testing Checklist

### 1. Basic Site Functionality
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

- [ ] **Blog Template Demo** (http://localhost:3003)
  - [ ] Site loads without errors
  - [ ] Admin login works (admin/admin123)
  - [ ] Can create/edit/delete posts
  - [ ] Image uploads work
  - [ ] Categories work
  - [ ] Search functionality works

### 2. APP_ROLE Protection Testing
- [ ] **Production Sites** (Ports 3001 & 3002)
  - [ ] Destructive operations are blocked
  - [ ] Reset functionality is not available
  - [ ] Error messages show "not allowed in production mode"

- [ ] **Demo Site** (Port 3003)
  - [ ] Reset functionality is available
  - [ ] Can reset database to seed state
  - [ ] Backup is created before reset
  - [ ] Reset works without errors

### 3. Database Isolation
- [ ] Each site has its own database
- [ ] Changes on one site don't affect others
- [ ] Database files are properly git-ignored
- [ ] Seed database exists for demo site

### 4. Port Configuration
- [ ] FruitionForestGarden runs on port 3001
- [ ] TheTecnoagrarian runs on port 3002
- [ ] Blog Template runs on port 3003
- [ ] No port conflicts between sites

### 5. Docker Configuration
- [ ] All containers build successfully
- [ ] Environment variables are set correctly
- [ ] Volumes are mounted properly
- [ ] Seed database is accessible in demo container

### 6. Security Testing
- [ ] Admin routes are protected
- [ ] CSRF protection works
- [ ] Rate limiting is active
- [ ] Session management works

### 7. Performance Testing
- [ ] Sites load quickly
- [ ] Image optimization works
- [ ] No memory leaks
- [ ] Database queries are efficient

## 🧪 Specific Test Cases

### Test APP_ROLE Protection
1. Go to http://localhost:3001/admin/dashboard
2. Try to access reset functionality (should be blocked)
3. Go to http://localhost:3003/admin/dashboard  
4. Try reset functionality (should work)

### Test Database Reset (Demo Only)
1. Create some test posts on demo site
2. Go to admin dashboard
3. Use reset functionality
4. Verify site returns to seed state
5. Check that backup was created

### Test Port Isolation
1. Start all three sites
2. Verify each site is accessible on its correct port
3. Test that they don't interfere with each other

## 🚨 Issues to Watch For

- **Port conflicts**: Make sure no other services are using ports 3001, 3002, 3003
- **Docker issues**: Ensure Docker is running and has enough resources
- **Database corruption**: Check that databases are properly isolated
- **Permission issues**: Ensure Docker can access all necessary files

## ✅ Ready for Production Checklist

- [ ] All tests pass
- [ ] No errors in logs
- [ ] APP_ROLE protection works correctly
- [ ] Database isolation confirmed
- [ ] Port configuration verified
- [ ] Security features tested
- [ ] Performance is acceptable

## 📝 Notes

- Default admin credentials: admin/admin123
- Remember to change passwords in production
- Demo site resets to seed database automatically
- Production sites block destructive operations
- Each site has its own isolated environment
