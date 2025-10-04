# Deployment Safety Template for Blog Projects

**🚨 CRITICAL WARNING - NEVER USE RSYNC FOR DEPLOYMENT 🚨**

**This template should be added to ALL blog projects to prevent data loss incidents.**

## What Happened (August 19, 2025 - Fruition Forest Garden)

**The Incident:**
- Used dangerous `rsync` command to deploy hero image update
- Command: `rsync -avz --exclude='node_modules' --exclude='.git' --exclude='src/database' --exclude='src/public/uploads' src/ root@server:/path/`
- **Result: Complete loss of recent blog posts and content**
- **Root Cause: rsync overwrote live database with local database**

**What Was Lost:**
- Recent blog posts (including "lupes-story-honoring-her-life-and-the-cats-who-came-before")
- User-generated content
- Recent database changes
- **Time to Recover: Several hours recreating content**

## 🚫 NEVER USE THESE DANGEROUS METHODS

### ❌ Dangerous rsync Commands
```bash
# NEVER DO THIS - DANGEROUS!
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='src/database' --exclude='src/public/uploads' src/ root@server:/path/

# NEVER DO THIS - DANGEROUS!
rsync -avz src/ root@server:/path/
```

**Why rsync is Dangerous:**
- Can overwrite critical files even with exclusions
- Bypasses version control and rollback procedures
- High risk of data loss
- No audit trail of what was changed
- Can corrupt live database and content

### ❌ Direct File Copying
```bash
# NEVER DO THIS - DANGEROUS!
scp -r src/ root@server:/path/
cp -r local-files/ server-files/
```

## ✅ ALWAYS USE THESE SAFE METHODS

### 🚀 Git-Based Deployment (RECOMMENDED)
```bash
# 1. Commit and push locally
git add .
git commit -m "Update content"
git push origin main  # or your branch name

# 2. Deploy safely on server
ssh root@YOUR_SERVER_IP
cd /path/to/your/blog/project
git pull origin main  # or your branch name
npm install --production
pm2 restart your-app-name
```

**One-Command Deployment:**
```bash
ssh root@YOUR_SERVER_IP "cd /path/to/your/blog/project && git pull origin main && npm install --production && pm2 restart your-app-name"
```

### 🔒 Selective File Updates (For Specific Files Only)
```bash
# Only for individual files, NEVER entire directories
scp src/public/images/hero.png root@server:/path/to/images/
scp src/public/css/style.css root@server:/path/to/css/
```

## 🛡️ Safety Protocols

### Before Every Deployment
1. **Verify what you're deploying:**
   ```bash
   git status
   git diff --cached
   ```

2. **Ensure database is backed up:**
   ```bash
   # On server
   cd /path/to/your/blog/project
   npm run backup  # if available
   ```

3. **Test changes locally first:**
   ```bash
   npm run dev
   # Verify everything works locally
   ```

### During Deployment
1. **Use git pull, never rsync**
2. **Restart application cleanly**
3. **Verify deployment success**

### After Deployment
1. **Check application status:**
   ```bash
   pm2 status
   pm2 logs your-app-name
   ```

2. **Verify critical functionality:**
   - Database connectivity
   - User authentication
   - Content display
   - File uploads

## 🔄 Rollback Procedures

### If Something Goes Wrong
```bash
# 1. Stop the application
pm2 stop your-app-name

# 2. Rollback to previous git commit
cd /path/to/your/blog/project
git log --oneline -5  # Find previous commit
git reset --hard HEAD~1

# 3. Restart application
pm2 start your-app-name
```

### Database Recovery
```bash
# If database is corrupted, restore from backup
cd /path/to/your/blog/project
cp backups/latest-backup.db src/database/your-database.db
pm2 restart your-app-name
```

## 📋 Deployment Checklist

**Pre-Deployment:**
- [ ] All changes committed and pushed to GitHub
- [ ] Local testing completed successfully
- [ ] Database backup created on server
- [ ] Deployment method chosen (git pull recommended)

**During Deployment:**
- [ ] SSH into server
- [ ] Navigate to application directory
- [ ] Pull latest changes with `git pull origin main`
- [ ] Install dependencies if needed
- [ ] Restart application with PM2

**Post-Deployment:**
- [ ] Verify application is running
- [ ] Check application logs for errors
- [ ] Test critical functionality
- [ ] Verify new content is visible

## 🚨 Emergency Contacts & Procedures

**If Data Loss Occurs:**
1. **STOP all deployment activities immediately**
2. **Document what was lost and when**
3. **Check for recent backups**
4. **Attempt recovery procedures**
5. **Contact team members if applicable**

**Recovery Priority:**
1. **Database content** (posts, users, content)
2. **User uploads** (images, files)
3. **Configuration files**
4. **Application code**

## 📚 Customization for Your Project

**Replace these placeholders with your actual values:**
- `YOUR_SERVER_IP` → Your actual server IP address
- `/path/to/your/blog/project` → Your actual project path on server
- `your-app-name` → Your actual PM2 app name
- `main` → Your actual git branch name
- `your-database.db` → Your actual database filename

## 🚀 Quick Setup Commands

**Add this to your project's README.md:**
```markdown
## 🚨 CRITICAL: Read [SAFETY_TEMPLATE.md](./docs/SAFETY_TEMPLATE.md) before deploying!

**Safe Deployment Command:**
```bash
ssh root@YOUR_SERVER_IP "cd /path/to/your/blog/project && git pull origin main && npm install --production && pm2 restart your-app-name"
```
```

---

**Remember: When in doubt, use git-based deployment. It's slower but infinitely safer than rsync.**

**Template Created: August 19, 2025 (After data loss incident in Fruition Forest Garden)**
**Apply This Template To: All blog projects to prevent data loss**
