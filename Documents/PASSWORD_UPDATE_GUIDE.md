# Secure Password Update Guide
**Date**: October 29, 2025

## 🔐 Current Situation

Your sites are using simple passwords that need to be updated to secure, complex passwords.

## 🎯 Password Requirements

- **Minimum**: 16 characters
- **Mix of**: Uppercase, lowercase, numbers, special characters
- **Avoid**: Dictionary words, common patterns, personal information

## 🔑 Generate Secure Passwords

### Option 1: Using Node.js (Recommended)
```bash
node -e "const crypto = require('crypto'); console.log('Secure password:', crypto.randomBytes(24).toString('base64'));"
```

This generates something like: `h1AH5GP4XTL1QkyIWojyWe9DSOeUb3CQ`

### Option 2: Using 1Password
1. Open 1Password
2. Use Password Generator
3. Set length to 20-24 characters
4. Include symbols: Yes
5. Generate and save

### Option 3: Online Generator
Use a trusted source like: https://passwordsgenerator.net/
- Length: 20-24 characters
- Include symbols: Yes
- Save securely!

## 🛠️ How to Update Passwords on Server

### For The Tecnoagrarian

**Step 1**: Generate a secure password (use one of the methods above)

**Step 2**: SSH to server and run:
```bash
ssh deploy@172.236.119.220
cd /opt/Sites/thetecnoagrarian
docker exec tta-blog-prod node /app/scripts/change-password.js tta_admin YOUR_NEW_PASSWORD_HERE
```

**Step 3**: Verify it worked:
```bash
docker exec tta-blog-prod sqlite3 /app/data/blog.db "SELECT username, isAdmin FROM users WHERE username = 'tta_admin';"
```

**Step 4**: Test login at https://thetecnoagrarian.com/admin

---

### For Fruition Forest Garden

**Step 1**: Generate a secure password

**Step 2**: SSH to server and run:
```bash
ssh deploy@172.236.119.220
cd /opt/Sites/fruitionforestgarden
docker exec ffg-blog-prod node /app/scripts/change-password.js fruitionforestgarden@protonmail.com YOUR_NEW_PASSWORD_HERE
```

**Note**: Check what the username actually is:
```bash
docker exec ffg-blog-prod sqlite3 /app/data/blog.db "SELECT username FROM users WHERE isAdmin = 1;"
```

**Step 3**: Test login

---

## 📝 Store Passwords Securely

After updating passwords:

1. **Save in 1Password**:
   - Create entries for:
     - "The Tecnoagrarian - Admin Login"
     - "Fruition Forest Garden - Admin Login"
   - Store: URL, username, password

2. **Never commit passwords to git**
3. **Never share in plain text**
4. **Update team members** if applicable (securely)

---

## ✅ Verification Checklist

After updating passwords:

- [ ] Generated secure password (20+ chars)
- [ ] Updated password on The Tecnoagrarian
- [ ] Updated password on Fruition Forest Garden
- [ ] Tested login on both sites
- [ ] Saved passwords in 1Password
- [ ] Verified old passwords no longer work
- [ ] Documented any password complexity requirements

---

## 🚨 If Password Update Fails

If the script doesn't work, try direct database update:

```bash
# First, generate password hash locally:
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('YOUR_PASSWORD', 10));"

# Then update in database:
docker exec tta-blog-prod sqlite3 /app/data/blog.db "UPDATE users SET password_hash = 'GENERATED_HASH_HERE' WHERE username = 'tta_admin';"
```

---

**Security Note**: After updating, invalidate any existing sessions by restarting the container:
```bash
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml restart thetecnoagrarian fruitionforestgarden"
```

