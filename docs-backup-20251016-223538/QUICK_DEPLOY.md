# Quick Deployment Reference

**🚨 ALWAYS USE GIT-BASED DEPLOYMENT - NEVER RSYNC! 🚨**

## ✅ Safe Deployment (One Command)

```bash
ssh deploy@172.236.119.220 "cd /home/deploy/fruitionforestgarden && git pull origin dynamic-version && npm install --production && pm2 restart fruitionforestgarden"
```

## ✅ Safe Deployment (Step by Step)

```bash
# 1. SSH into server
ssh deploy@172.236.119.220

# 2. Navigate to app directory
cd /home/deploy/fruitionforestgarden

# 3. Pull latest changes
git pull origin dynamic-version

# 4. Install dependencies
npm install --production

# 5. Restart application
pm2 restart fruitionforestgarden
```

## ❌ NEVER USE THESE (DANGEROUS!)

```bash
# DANGEROUS - Can cause data loss!
rsync -avz src/ root@server:/path/
scp -r src/ root@server:/path/
```

## 🔍 Verify Deployment

```bash
# Check if app is running
pm2 status

# Check logs for errors
pm2 logs fruitionforestgarden

# Test the website
curl http://localhost:3000
```

## 🚨 If Something Goes Wrong

```bash
# Stop the app
pm2 stop fruitionforestgarden

# Rollback to previous commit
git reset --hard HEAD~1

# Restart
pm2 start fruitionforestgarden
```

---

**Remember: Git-based deployment is slower but infinitely safer than rsync!**
