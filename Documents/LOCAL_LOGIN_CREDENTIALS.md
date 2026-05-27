# Local Development Login Credentials

**Important**: Local and production use **separate databases**, so production credentials won't work locally.

---

## 🔑 Default Local Credentials

### Fruition Forest Garden
- **URL**: `http://localhost:4000/admin/login`
- **Username**: `admin`
- **Password**: `local123`

### The Tecnoagrarian
- **URL**: `http://localhost:4002/admin/login`
- **Username**: `admin`
- **Password**: `local123`

---

## 🔧 Changing Local Passwords

### Option 1: Using the change-password script (in container)

```bash
# For Fruition Forest Garden
docker exec ffg-blog-local-prod sh -c "cd /app/fruitionforestgarden && DATABASE_PATH=/app/data/database/blog.db node scripts/change-password.js admin YOUR_NEW_PASSWORD"

# For The Tecnoagrarian
docker exec tta-blog-local-prod sh -c "cd /app/thetecnoagrarian && DATABASE_PATH=/app/data/database/blog.db node scripts/change-password.js admin YOUR_NEW_PASSWORD"
```

### Option 2: Using the setup script (local)

```bash
# Update admin password
node scripts/setup-local-admin.js fruitionforestgarden admin YOUR_NEW_PASSWORD
node scripts/setup-local-admin.js thetecnoagrarian admin YOUR_NEW_PASSWORD

# Then restart containers
docker-compose -f docker-compose.local-prod.yml restart
```

---

## 👤 Creating Additional Users

You can create additional users by modifying the setup script or using SQL directly:

```bash
# Create a new user via SQL (example)
docker exec ffg-blog-local-prod sqlite3 /app/data/database/blog.db "
INSERT INTO users (username, password_hash, isAdmin, role)
VALUES ('yourname', '$(node -e "const bcrypt=require('bcryptjs');console.log(bcrypt.hashSync('yourpassword',10))")', 1, 'admin');
"
```

---

## ⚠️ Important Notes

- **Local credentials are separate from production** - changing local password doesn't affect production
- **Never commit local credentials** - these are for development only
- **Production credentials** are stored in 1Password (see `Documents/SECRETS.md`)

---

## 🔄 If Login Fails

1. **Check container is running**:
   ```bash
   docker-compose -f docker-compose.local-prod.yml ps
   ```

2. **Check database exists**:
   ```bash
   docker exec ffg-blog-local-prod ls -la /app/data/database/blog.db
   ```

3. **Verify user exists**:
   ```bash
   docker exec ffg-blog-local-prod sqlite3 /app/data/database/blog.db "SELECT username, isAdmin FROM users;"
   ```

4. **Reset password**:
   ```bash
   docker exec ffg-blog-local-prod sh -c "cd /app/fruitionforestgarden && DATABASE_PATH=/app/data/database/blog.db node scripts/change-password.js admin local123"
   ```

5. **Restart container**:
   ```bash
   docker-compose -f docker-compose.local-prod.yml restart fruitionforestgarden
   ```

---

**Last Updated**: November 18, 2025

