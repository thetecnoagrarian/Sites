# Username & Password Update Guide

## Overview
This guide explains how to update usernames and passwords for both blog sites. The process is straightforward and doesn't require complex 1Password integration - you'll just store the password in 1Password for your records.

## Current Usernames
- **Fruition Forest Garden**: `fruitionforestgarden@protonmail.com`
- **The Tecnoagrarian**: `tta_admin`

## Target Username
- **Both sites**: `MDC`

## Process

### Step 1: Generate Secure Password

**Option A: Use 1Password Password Generator** (Recommended)
1. Open 1Password
2. Use the password generator
3. Settings: 20-24 characters, include symbols
4. Copy the generated password

**Option B: Use Node.js**
```bash
node -e "const crypto = require('crypto'); console.log('Secure password:', crypto.randomBytes(24).toString('base64'));"
```

### Step 2: Store Password in 1Password
- Create a new login item in 1Password
- Title: "Blog Admin - MDC"
- Username: `MDC`
- Password: (paste the generated password)
- Notes: "Admin credentials for both fruitionforestgarden.com and thetecnoagrarian.com"

### Step 3: Update Usernames and Passwords

**For Fruition Forest Garden:**
```bash
# 1. Change username
ssh deploy@172.236.119.220 "docker exec ffg-blog-prod node /app/scripts/change-username.js fruitionforestgarden@protonmail.com MDC"

# 2. Change password (use the password you generated)
ssh deploy@172.236.119.220 "docker exec ffg-blog-prod node /app/scripts/change-password.js MDC YOUR_NEW_PASSWORD_HERE"

# 3. Verify
ssh deploy@172.236.119.220 "docker exec ffg-blog-prod sqlite3 /app/data/blog.db \"SELECT username, isAdmin FROM users WHERE username = 'MDC';\""
```

**For The Tecnoagrarian:**
```bash
# 1. Change username
ssh deploy@172.236.119.220 "docker exec tta-blog-prod node /app/scripts/change-username.js tta_admin MDC"

# 2. Change password (use the same password you used for FFG)
ssh deploy@172.236.119.220 "docker exec tta-blog-prod node /app/scripts/change-password.js MDC YOUR_NEW_PASSWORD_HERE"

# 3. Verify
ssh deploy@172.236.119.220 "docker exec tta-blog-prod sqlite3 /app/data/blog.db \"SELECT username, isAdmin FROM users WHERE username = 'MDC';\""
```

### Step 4: Restart Containers
This invalidates existing sessions, forcing you to log in with the new credentials:
```bash
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml restart fruitionforestgarden thetecnoagrarian"
```

### Step 5: Test Login
1. Visit both admin pages:
   - `https://ffg-new.fruitionforestgarden.com/admin/login`
   - `https://thetecnoagrarian.com/admin/login`
2. Log in with:
   - Username: `MDC`
   - Password: (the password you generated and stored in 1Password)

## Why Not Full 1Password Integration?

Full 1Password integration would require:
- 1Password CLI installation on the server
- API keys and authentication setup
- Additional complexity for minimal benefit

**Current approach is simpler:**
- ✅ Generate password once
- ✅ Store in 1Password for your records
- ✅ Use standard scripts (already working)
- ✅ No additional server dependencies

## Troubleshooting

**If username change fails:**
- Check that the old username is correct
- Verify the user exists: `docker exec [container] sqlite3 /app/data/blog.db "SELECT * FROM users;"`

**If password change fails:**
- Make sure you're using the NEW username (MDC) after changing it
- Check password length (minimum 16 characters recommended)

**If login fails after changes:**
- Make sure containers were restarted
- Clear browser cookies/cache
- Try incognito/private browsing mode

## Security Notes

- ✅ Passwords are hashed with bcrypt (industry standard)
- ✅ Scripts validate input and prevent common mistakes
- ✅ Username "admin" is blocked for security
- ✅ Sessions are invalidated on container restart

