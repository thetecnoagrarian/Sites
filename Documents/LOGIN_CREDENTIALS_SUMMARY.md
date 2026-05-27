# Login Credentials Summary

**Important**: Each environment (live/local) has separate databases and credentials.

---

## 🌐 Live Production Sites

### Fruition Forest Garden (fruitionforestgarden.com)
- **URL**: `https://fruitionforestgarden.com/admin/login`
- **Username**: Check with `ssh deploy@172.236.119.220 "docker exec ffg-blog-prod sqlite3 /app/data/blog.db \"SELECT username FROM users WHERE isAdmin=1;\""`
- **Password**: Stored in 1Password (see `Documents/SECRETS.md`)

### The Tecnoagrarian (thetecnoagrarian.com)
- **URL**: `https://thetecnoagrarian.com/admin/login`
- **Username**: `MDC`
- **Password**: **NEEDS TO BE RESET** (see reset instructions below)

---

## 💻 Local Development Sites

### Fruition Forest Garden (localhost:4000)
- **URL**: `http://localhost:4000/admin/login`
- **Username**: `admin`
- **Password**: `local123`

### The Tecnoagrarian (localhost:4002)
- **URL**: `http://localhost:4002/admin/login`
- **Username**: `admin`
- **Password**: `local123`

---

## 🔧 Resetting Passwords

### Live TTA (MDC user)

```bash
# Reset password for MDC on live TTA
ssh deploy@172.236.119.220 "docker exec tta-blog-prod sh -c 'cd /app/thetecnoagrarian && DATABASE_PATH=/app/data/blog.db node scripts/change-password.js MDC YOUR_NEW_PASSWORD'"

# Then restart container to invalidate sessions
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml restart thetecnoagrarian"
```

### Local Sites

```bash
# Reset local TTA admin password
docker exec tta-blog-local-prod sh -c "cd /app/thetecnoagrarian && DATABASE_PATH=/app/data/database/blog.db node scripts/change-password.js admin YOUR_NEW_PASSWORD"

# Reset local FFG admin password
docker exec ffg-blog-local-prod sh -c "cd /app/fruitionforestgarden && DATABASE_PATH=/app/data/database/blog.db node scripts/change-password.js admin YOUR_NEW_PASSWORD"
```

---

## ⚠️ Common Issues

### "admin/admin123 doesn't work on live sites"
- **Reason**: Live sites use different usernames (e.g., `MDC`, not `admin`)
- **Solution**: Use the correct username for each site (check database)

### "Saved password not working"
- **Reason**: Password may have been changed or session expired
- **Solution**: Reset password using commands above

### "Can't login to local sites"
- **Reason**: Local database might not have users
- **Solution**: Run setup script: `node scripts/setup-local-admin.js [site] admin local123`

---

## 📋 Quick Check Commands

### Check live users:
```bash
# TTA
ssh deploy@172.236.119.220 "docker exec tta-blog-prod sqlite3 /app/data/blog.db \"SELECT username, isAdmin FROM users;\""

# FFG
ssh deploy@172.236.119.220 "docker exec ffg-blog-prod sqlite3 /app/data/blog.db \"SELECT username, isAdmin FROM users;\""
```

### Check local users:
```bash
# TTA
docker exec tta-blog-local-prod sqlite3 /app/data/database/blog.db "SELECT username, isAdmin FROM users;"

# FFG
docker exec ffg-blog-local-prod sqlite3 /app/data/database/blog.db "SELECT username, isAdmin FROM users;"
```

---

**Last Updated**: November 18, 2025

