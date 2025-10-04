#!/bin/bash

# Apply Safety Template Script
# This script applies deployment safety documentation to any blog project
# Created after data loss incident on August 19, 2025

set -e

echo "🚨 DEPLOYMENT SAFETY TEMPLATE APPLIER 🚨"
echo "This script will add critical safety documentation to prevent data loss incidents"
echo ""

# Check if target directory is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <target-project-directory>"
    echo "Example: $0 ../blog-template"
    exit 1
fi

TARGET_DIR="$1"

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Error: Target directory '$TARGET_DIR' does not exist"
    exit 1
fi

echo "📁 Target project: $TARGET_DIR"
echo ""

# Create docs directory if it doesn't exist
if [ ! -d "$TARGET_DIR/docs" ]; then
    echo "📁 Creating docs directory..."
    mkdir -p "$TARGET_DIR/docs"
fi

# Copy safety template
echo "📋 Copying safety template..."
cp "docs/SAFETY_TEMPLATE.md" "$TARGET_DIR/docs/DEPLOYMENT_SAFETY.md"

# Copy quick deploy reference
echo "📋 Copying quick deploy reference..."
cp "docs/QUICK_DEPLOY.md" "$TARGET_DIR/docs/QUICK_DEPLOY.md"

# Create safety index
echo "📋 Creating safety index..."
cat > "$TARGET_DIR/docs/SAFETY_INDEX.md" << 'EOF'
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
git push origin main  # or your branch name

# 2. Deploy safely on server
ssh root@YOUR_SERVER_IP "cd /path/to/your/blog/project && git pull origin main && npm install --production && pm2 restart your-app-name"
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

---

**Remember: When in doubt, use git-based deployment. It's slower but infinitely safer than rsync.**

**Last Updated: August 19, 2025 (After data loss incident)**
EOF

# Update README.md if it exists
if [ -f "$TARGET_DIR/README.md" ]; then
    echo "📋 Updating README.md with safety warning..."
    
    # Check if safety warning already exists
    if ! grep -q "DEPLOYMENT_SAFETY.md" "$TARGET_DIR/README.md"; then
        # Add safety warning after the first heading
        sed -i.bak '1,/^## /{/^## /a\
\
**🚨 CRITICAL: Read [DEPLOYMENT_SAFETY.md](./docs/DEPLOYMENT_SAFETY.md) before deploying to avoid data loss!**\
' "$TARGET_DIR/README.md"
        
        # Remove backup file
        rm "$TARGET_DIR/README.md.bak"
        echo "✅ Added safety warning to README.md"
    else
        echo "ℹ️  Safety warning already exists in README.md"
    fi
else
    echo "ℹ️  README.md not found, skipping update"
fi

# Create .gitignore entry for safety
echo "📋 Updating .gitignore..."
if [ -f "$TARGET_DIR/.gitignore" ]; then
    if ! grep -q "# Safety documentation" "$TARGET_DIR/.gitignore"; then
        echo "" >> "$TARGET_DIR/.gitignore"
        echo "# Safety documentation" >> "$TARGET_DIR/.gitignore"
        echo "docs/DEPLOYMENT_SAFETY.md" >> "$TARGET_DIR/.gitignore"
        echo "docs/QUICK_DEPLOY.md" >> "$TARGET_DIR/.gitignore"
        echo "docs/SAFETY_INDEX.md" >> "$TARGET_DIR/.gitignore"
        echo "✅ Updated .gitignore"
    else
        echo "ℹ️  .gitignore already updated"
    fi
else
    echo "ℹ️  .gitignore not found, creating..."
    cat > "$TARGET_DIR/.gitignore" << 'EOF'
# Safety documentation
docs/DEPLOYMENT_SAFETY.md
docs/QUICK_DEPLOY.md
docs/SAFETY_INDEX.md
EOF
fi

echo ""
echo "✅ SAFETY TEMPLATE APPLIED SUCCESSFULLY!"
echo ""
echo "📚 What was added:"
echo "  - docs/DEPLOYMENT_SAFETY.md (critical safety information)"
echo "  - docs/QUICK_DEPLOY.md (quick reference)"
echo "  - docs/SAFETY_INDEX.md (documentation index)"
echo "  - Updated README.md with safety warning"
echo "  - Updated .gitignore for safety docs"
echo ""
echo "🚨 NEXT STEPS:"
echo "  1. Review the safety documentation"
echo "  2. Customize deployment commands for your project"
echo "  3. Test the safe deployment process"
echo "  4. Share with your team"
echo ""
echo "💡 Remember: When in doubt, use git-based deployment!"
echo "   It's slower but infinitely safer than rsync."
