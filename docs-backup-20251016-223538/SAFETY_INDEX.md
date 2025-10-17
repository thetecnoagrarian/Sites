# Safety Documentation Index

**🚨 CRITICAL: Read these documents before any deployment to prevent data loss! 🚨**

## 📚 Essential Safety Documents

### 1. [DEPLOYMENT_SAFETY.md](./DEPLOYMENT_SAFETY.md) - **MUST READ FIRST**
- **What happened on August 19, 2025** (data loss incident)
- **Why rsync is dangerous** and caused complete loss of recent posts
- **Safe deployment methods** to use instead
- **Recovery procedures** if something goes wrong
- **Emergency protocols** for data loss incidents

### 2. [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) - **Quick Reference**
- **One-command safe deployment**
- **Step-by-step safe deployment**
- **What NEVER to do** (dangerous commands)
- **Verification steps** after deployment
- **Emergency rollback** procedures

### 3. [DEPLOYMENT.md](./DEPLOYMENT.md) - **Complete Deployment Guide**
- **Updated with safety warnings** at the top
- **Safe git-based deployment** workflow
- **Server setup and configuration**
- **Monitoring and maintenance**

## 🚫 What NOT to Do (Causes Data Loss)

```bash
# ❌ NEVER USE THESE COMMANDS - THEY CAN CAUSE COMPLETE DATA LOSS!

# Dangerous rsync (what caused the August 19 incident)
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='src/database' --exclude='src/public/uploads' src/ root@server:/path/

# Dangerous file copying
scp -r src/ root@server:/path/
cp -r local-files/ server-files/
```

## ✅ What TO Do (Safe Deployment)

```bash
# ✅ ALWAYS USE THIS SAFE METHOD

# 1. Commit and push locally
git add .
git commit -m "Describe your change"
git push origin dynamic-version

# 2. Deploy safely on server
ssh deploy@172.236.119.220 "cd /home/deploy/fruitionforestgarden && git pull origin dynamic-version && npm install --production && pm2 restart fruitionforestgarden"
```

## 🚨 Emergency Response

**If data loss occurs:**
1. **STOP all deployment activities immediately**
2. **Read [DEPLOYMENT_SAFETY.md](./DEPLOYMENT_SAFETY.md) recovery section**
3. **Follow emergency procedures**
4. **Document what was lost**

## 📋 Pre-Deployment Checklist

- [ ] Read [DEPLOYMENT_SAFETY.md](./DEPLOYMENT_SAFETY.md)
- [ ] Test changes locally
- [ ] Commit and push to GitHub
- [ ] Use git-based deployment (never rsync)
- [ ] Verify deployment success
- [ ] Test critical functionality

## 🔗 Related Documentation

- [Main README](../README.md) - Project overview
- [Server Setup](./SERVER_SETUP.md) - Server configuration
- [Backup Procedures](./BACKUP.md) - Database backup
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues

---

**Remember: When in doubt, use git-based deployment. It's slower but infinitely safer than rsync.**

**Last Updated: August 19, 2025 (After data loss incident)**
