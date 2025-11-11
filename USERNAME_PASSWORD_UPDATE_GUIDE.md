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
# Get server details from Documents/SECRETS.md first
# Replace [SSH_USER]@[SERVER_IP] with actual values

# 1. Change username
ssh [SSH_USER]@[SERVER_IP] "docker exec ffg-blog-prod node /app/fruitionforestgarden/scripts/change-username.js fruitionforestgarden@protonmail.com MDC"

# 2. Change password (use the password you generated)
# IMPORTANT: Use single quotes around the password to prevent bash from interpreting special characters (!, $, etc.)
ssh [SSH_USER]@[SERVER_IP] 'docker exec ffg-blog-prod node /app/fruitionforestgarden/scripts/change-password.js MDC '"'YOUR_NEW_PASSWORD_HERE'"

# 3. Verify
ssh [SSH_USER]@[SERVER_IP] "docker exec ffg-blog-prod sqlite3 /app/data/blog.db \"SELECT username, isAdmin FROM users WHERE username = 'MDC';\""
```

**For The Tecnoagrarian:**
```bash
# Get server details from Documents/SECRETS.md first
# Replace [SSH_USER]@[SERVER_IP] with actual values

# 1. Change username
ssh [SSH_USER]@[SERVER_IP] "docker exec tta-blog-prod node /app/thetecnoagrarian/scripts/change-username.js tta_admin MDC"

# 2. Change password (use the same password you used for FFG)
# IMPORTANT: Use single quotes around the password to prevent bash from interpreting special characters (!, $, etc.)
ssh [SSH_USER]@[SERVER_IP] 'docker exec tta-blog-prod node /app/thetecnoagrarian/scripts/change-password.js MDC '"'YOUR_NEW_PASSWORD_HERE'"

# 3. Verify
ssh [SSH_USER]@[SERVER_IP] "docker exec tta-blog-prod sqlite3 /app/data/blog.db \"SELECT username, isAdmin FROM users WHERE username = 'MDC';\""
```

**Alternative Method (if the above doesn't work):**
If you have issues with special characters, you can also set the password as an environment variable first:
```bash
# Set password variable (use single quotes to prevent interpretation)
PASSWORD='YOUR_NEW_PASSWORD_HERE'

# Then use it in the command (replace [SSH_USER]@[SERVER_IP] with values from Documents/SECRETS.md)
ssh [SSH_USER]@[SERVER_IP] "docker exec ffg-blog-prod node /app/fruitionforestgarden/scripts/change-password.js MDC '$PASSWORD'"
```

### Step 4: Restart Containers
This invalidates existing sessions, forcing you to log in with the new credentials:
```bash
# Replace [SSH_USER]@[SERVER_IP] with values from Documents/SECRETS.md
ssh [SSH_USER]@[SERVER_IP] "cd /opt/Sites && docker-compose -f docker-compose.prod.yml restart fruitionforestgarden thetecnoagrarian"
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
- Make sure you're using the correct server IP from `Documents/SECRETS.md`

**If password change fails:**
- Make sure you're using the NEW username (MDC) after changing it
- Check password length (minimum 16 characters recommended)
- **Special characters in password**: If your password contains `!`, `$`, `\``, or other special characters, bash may try to interpret them. Use single quotes around the password:
  ```bash
  # Wrong (bash interprets ! as history expansion):
  ssh deploy@172.236.119.220 "docker exec ffg-blog-prod node ... MDC MyPass!123"
  
  # Correct (single quotes prevent interpretation):
  ssh deploy@172.236.119.220 'docker exec ffg-blog-prod node ... MDC '"'MyPass!123'"
  ```

**If login fails after changes:**
- Make sure containers were restarted
- Clear browser cookies/cache
- Try incognito/private browsing mode

## Security Notes

- ✅ Passwords are hashed with bcrypt (industry standard)
- ✅ Scripts validate input and prevent common mistakes
- ✅ Username "admin" is blocked for security
- ✅ Sessions are invalidated on container restart

