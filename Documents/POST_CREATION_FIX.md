# Post Creation Bug Fix & Password Update
**Date**: October 29, 2025

## 🐛 Issue Found

### Problem
**Error**: `SqliteError: NOT NULL constraint failed: posts.body`

**Root Cause**: In `thetecnoagrarian/src/routes/admin.js` line 283, the code was using:
```javascript
content: req.body.body,  // ❌ Wrong field name
```

But `Post.create()` from `blog-core` expects:
```javascript
body: req.body.body,  // ✅ Correct field name
```

The database schema requires a `body` column (NOT NULL), but the code was passing `content` instead of `body`, causing the insert to fail.

### Status
- ✅ **Fixed**: Changed `content` to `body` in thetecnoagrarian route
- ⏳ **Verifying**: Checking fruitionforestgarden for same issue

---

## 🔒 Password Security Update

### Current Passwords
Based on code inspection, default passwords are:
- **The Tecnoagrarian**: Likely using simple password or default
- **Fruition Forest Garden**: Likely using simple password or default

### Secure Password Requirements
- Minimum 16 characters
- Mix of uppercase, lowercase, numbers, special characters
- Not dictionary words or common patterns

### Generated Secure Passwords
Use these or generate your own:

**Option 1** (Base64 random):
```
h1AH5GP4XTL1QkyIWojyWe9DSOeUb3CQ
```

**Option 2** (Generate with Node.js):
```bash
node -e "const crypto = require('crypto'); console.log(crypto.randomBytes(24).toString('base64'));"
```

**Option 3** (Use a password manager like 1Password to generate)

---

## 🛠️ How to Update Passwords

### Method 1: Using Change Password Script (Server)
```bash
# SSH to server
ssh deploy@172.236.119.220

# For The Tecnoagrarian
cd /opt/Sites/thetecnoagrarian
docker exec tta-blog-prod node /app/scripts/change-password.js tta_admin YOUR_NEW_PASSWORD

# For Fruition Forest Garden  
cd /opt/Sites/fruitionforestgarden
docker exec ffg-blog-prod node /app/scripts/change-password.js YOUR_USERNAME YOUR_NEW_PASSWORD
```

### Method 2: Direct Database Update (Server)
```bash
# SSH to server
ssh deploy@172.236.119.220

# Generate hash locally or on server
# Then update:
docker exec tta-blog-prod sqlite3 /app/data/blog.db "UPDATE users SET password_hash = 'GENERATED_HASH' WHERE username = 'tta_admin';"
```

### Method 3: Using Node.js Script (Local - then sync)
The script exists at `thetecnoagrarian/scripts/change-password.js` but needs to be run inside the Docker container or have access to the database.

---

## 📋 Action Items

1. ✅ Fix post creation bug (content → body)
2. ⏳ Deploy fix to server
3. ⏳ Test post creation after fix
4. ⏳ Update admin passwords to secure ones
5. ⏳ Verify database connection is working

---

## 🔍 Database Status Check

**The Tecnoagrarian Database**:
- ✅ Database exists: `/app/data/blog.db`
- ✅ Users table exists with admin user: `tta_admin`
- ⚠️ Posts table empty (0 posts) - likely due to bug
- ✅ Permissions look correct (blog user owns files)

**Next Steps**:
1. Deploy the fix
2. Try creating a post again
3. Verify it appears in database

