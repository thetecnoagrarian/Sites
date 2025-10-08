# Blog Monorepo Deployment Guide

## 🚀 Safe Side-by-Side Deployment to Linode

This guide helps you deploy the new blog monorepo alongside your existing live site for safe testing.

### Prerequisites

- Access to your Linode server
- Docker and Docker Compose installed on Linode
- SSH access to the server
- All commands below are intended to run **on your Linode server (via SSH)**, not on macOS/Docker Desktop.

### Current Environment Status

**Live Sites:**
- ✅ `fruitionforestgarden.com` - Live site with real content (needs migration)
- ❌ `thetecnoagrarian.com` - Not yet live (will start with empty database)

**DNS Setup Needed:**
- ✅ `fruitionforestgarden.com` - Already configured
- ✅ `ffg-new.fruitionforestgarden.com` - **Working via wildcard DNS**
- ❌ `tta-new.thetecnoagrarian.com` - **Need to create DNS record**

**SSL Certificates:**
- ✅ `fruitionforestgarden.com` - Already has SSL
- ❌ `ffg-new.fruitionforestgarden.com` - **Need Let's Encrypt certificate**
- ❌ `tta-new.thetecnoagrarian.com` - **Need Let's Encrypt certificate**

**Current Server Setup (to verify):**
- Current live site: `fruitionforestgarden.com` (Node.js/PM2 - **needs verification**)
- Current ports: **TBD** (need to check for conflicts with 4000/4002)
- SSH access: **TBD** (need to verify and document)

**GitHub Setup:**
- ❌ SSH keys for `thetecnoagrarian` GitHub account on Linode server - **Need to set up**
- ✅ Local machine already has access to `thetecnoagrarian` GitHub account
- Plan: Delete `fruitionforestgarden` GitHub account after successful migration

## 🔍 Pre-Deployment Verification

**Before proceeding, verify these on your Linode server:**

### 1. Check Current Live Site Setup
```bash
# SSH into your Linode server
ssh user@your-linode-server

# Check what's currently running
ps aux | grep node
pm2 list  # if using PM2
netstat -tulpn | grep :80
netstat -tulpn | grep :443
netstat -tulpn | grep :3000

# Check current directory structure
ls -la /opt/
ls -la /home/user/
find / -name "*fruitionforestgarden*" -type d 2>/dev/null
```

### 2. Verify Docker Installation
```bash
docker --version
docker-compose --version
# Note: deploy user is already in docker group, so no sudo needed
```

### 3. Set Up GitHub SSH Authentication
```bash
# Check existing SSH keys
ls -la ~/.ssh/

# Generate new SSH key for thetecnoagrarian GitHub account (if needed)
ssh-keygen -t ed25519 -C "deploy@linode-server" -f ~/.ssh/id_ed25519_tta

# Add SSH key to ssh-agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519_tta

# Display public key to add to GitHub
cat ~/.ssh/id_ed25519_tta.pub

# Test GitHub SSH access
ssh -T git@github.com
```

### 4. Document Current Setup
**Record these findings:**
- Current live site directory: `________________`
- Current live site port: `________________`
- Current process manager: `________________` (PM2/Node.js/Other)
- SSH keys status: `________________` (Exists/Needs setup)

## 🌐 DNS Setup (Required Before Deployment)

**Set up DNS records for test subdomains:**

1. **Log into your domain registrar** (where you manage `thetecnoagrarian.com`)
2. **Add this DNS A record:**
   - `tta-new.thetecnoagrarian.com` → `[YOUR_LINODE_IP]`
   - **Note**: `ffg-new.fruitionforestgarden.com` already works via wildcard DNS

3. **Wait for DNS propagation** (usually 5-15 minutes, can take up to 24 hours)
4. **Test DNS resolution:**
   ```bash
   nslookup ffg-new.fruitionforestgarden.com  # Should already work
   nslookup tta-new.thetecnoagrarian.com     # Should work after DNS propagation
   ```

### Step 1: Set Up GitHub SSH Key on Linode

**First, add the SSH key to your thetecnoagrarian GitHub account:**

1. **Copy the public key from Linode server:**
   ```bash
   # On Linode server
   cat ~/.ssh/id_ed25519_tta.pub
   ```

2. **Add to GitHub:**
   - Go to GitHub.com → Settings → SSH and GPG keys
   - Click "New SSH key"
   - Title: `Linode Server Deploy`
   - Key: Paste the public key from step 1
   - Click "Add SSH key"

3. **Test the connection:**
   ```bash
   # On Linode server
   ssh -T git@github.com
   # Should show: "Hi thetecnoagrarian! You've successfully authenticated..."
   ```

### Step 2: Upload Code to Linode

```bash
# On your Linode server - clone from GitHub
cd /opt
git clone git@github.com:thetecnoagrarian/thetecnoagrarian.git Sites
cd Sites

# Alternative: Upload via SCP (if GitHub auth not ready)
# scp -r /Users/air/Sites/ deploy@your-linode-server:/opt/Sites
```

### Step 3: Setup Environment

```bash
# On your Linode server
cd /opt/Sites

# Copy and configure production environment
cp env.prod.example .env

# Edit the .env file with secure values
nano .env
```

**Required changes in .env:**
- `SESSION_SECRET`: Generate a secure random string
- Consider adding SSL certificates and other production configs

### Step 4: Generate Secure Session Secret

```bash
# Generate a secure session secret
openssl rand -base64 64
```

### Step 5: Deploy with Docker Compose

```bash
# Build and start the production containers
docker-compose -f docker-compose.prod.yml up --build -d

# Check container status
docker-compose -f docker-compose.prod.yml ps

# View logs if needed
docker-compose -f docker-compose.prod.yml logs fruitionforestgarden
docker-compose -f docker-compose.prod.yml logs thetecnoagrarian
```

### Step 6: Configure Nginx Proxy

```nginx
# Optional HTTP→HTTPS redirect for test subdomains
server {
    listen 80;
    server_name ffg-new.fruitionforestgarden.com tta-new.thetecnoagrarian.com;
    return 301 https://$host$request_uri;
}

# New fruitionforestgarden (port 4000)
server {
    listen 443 ssl http2;
    server_name ffg-new.fruitionforestgarden.com;
    
    # Your SSL certificates
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}

# New thetecnoagrarian (port 4002)
server {
    listen 443 ssl http2;
    server_name tta-new.thetecnoagrarian.com;
    
    # Your SSL certificates
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    
    location / {
        proxy_pass http://localhost:4002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```
> Tip: If you don't have certs yet, you can obtain and install them with one command (on Ubuntu): `sudo certbot --nginx -d ffg-new.fruitionforestgarden.com -d tta-new.thetecnoagrarian.com`

### Step 7: Initialize Databases

**For fruitionforestgarden (migrate existing data):**
```bash
# First, backup the existing live database
# Find the current database location (from Step 1 verification)
cp /path/to/current/fruitionforestgarden/database/blog.db /opt/backups/fruitionforestgarden-live-backup-$(date +%Y%m%d-%H%M%S).db

# Copy the live database to the new container
docker cp /path/to/current/fruitionforestgarden/database/blog.db $(docker-compose -f docker-compose.prod.yml ps -q fruitionforestgarden):/app/data/blog.db

# Verify the migration worked
docker-compose -f docker-compose.prod.yml exec fruitionforestgarden sqlite3 /app/data/blog.db "SELECT COUNT(*) FROM posts;"
docker-compose -f docker-compose.prod.yml exec fruitionforestgarden sqlite3 /app/data/blog.db "SELECT username FROM users;"
```

**For thetecnoagrarian (start with empty database):**
```bash
# Initialize empty database with admin user
docker-compose -f docker-compose.prod.yml exec thetecnoagrarian node -e "
import bcrypt from 'bcryptjs';
const Database = (await import('better-sqlite3')).default;

const password = 'admin123';
const hash = bcrypt.hashSync(password, 10);

const db = new Database('/app/data/blog.db');
db.prepare('DELETE FROM users').run();
db.prepare(\`
  INSERT INTO users (username, password_hash, role, isAdmin, created_at, updated_at) 
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
\`).run('admin', hash, 'admin', 1);

console.log('Admin user created');
db.close();
"
```

### Step 7a: Immediately Change Admin Credentials (CLI-first)

> ⚠️ The seeding in **Step 6** creates a default `admin` user with password `admin123` for convenience. Change the **username and password immediately** on the server before exposing the site publicly.

**Primary — via CLI (works even if the UI doesn't expose user editing):**

_Fruition Forest Garden_
```bash
# Open a Node REPL inside the container
docker-compose -f docker-compose.prod.yml exec fruitionforestgarden node
```
In the Node REPL, paste the following (edit the username/password first), then press Enter after each line:
```js
import bcrypt from 'bcryptjs';
const Database = (await import('better-sqlite3')).default;
const db = new Database('/app/data/blog.db');
const NEW_USER = 'your_new_admin';
const NEW_PASS = 'use-a-strong-random-password-here';
const hash = bcrypt.hashSync(NEW_PASS, 12);
db.prepare("UPDATE users SET username=?, password_hash=?, updated_at=datetime('now') WHERE username='admin'").run(NEW_USER, hash);
console.log('Updated admin to', NEW_USER);
db.close();
process.exit(0);
```
_The TechnoAgrarian_
```bash
# Open a Node REPL inside the container
docker-compose -f docker-compose.prod.yml exec thetecnoagrarian node
```
Then paste the same JavaScript block (updating `NEW_USER`/`NEW_PASS` as desired).

**Optional — via the web UI (only if available in your build):**
- Log in as `admin` / `admin123`.
- If the UI exposes editing users, go to **Admin → Users** and change the username and password for the admin account.
- If you don't see user-edit controls, use the CLI method above.

_Tip:_ Save the new password in your password manager. Rotate again after initial verification if you pasted it in a shell.

### Step 8: Test Everything

1. **Access new sites:**
   - `https://ffg-new.fruitionforestgarden.com`
   - `https://tta-new.thetecnoagrarian.com`

2. **Test admin login:**
   - Use the credentials you set in **Step 6a** (your new admin username and password).

3. **Verify functionality:**
   - Create posts
   - Upload images
   - Browse categories
   - View admin dashboard

### Step 9: Switch Production Traffic

Once testing is complete:

1. **Update DNS** to point the main domains to the new containers
2. **Update Nginx** to proxy main domains to ports 4000/4002
3. **Monitor** for any issues
4. **Clean up** old containers when confident

**Rollback Timeline:**
- **Week 1-2:** Keep old containers running alongside new ones for testing
- **After successful testing:** Switch traffic to new monorepo
- **Week 3-4:** Monitor new setup, keep old containers as backup
- **Month 2:** Archive old containers (don't delete yet)
- **Month 3+:** Safe to remove old containers/images

**Rollback Commands:**
```bash
# Pause old containers (don't delete)
docker stop <old_container_ids>

# Quick rollback if needed
docker start <old_container_ids>
# Then update Nginx/DNS to point back to old containers
```

### Backup Strategy

```bash
# Create backup of databases
docker-compose -f docker-compose.prod.yml exec fruitionforestgarden sqlite3 /app/data/blog.db ".backup /app/data/backup-$(date +%Y%m%d-%H%M%S).db"
docker-compose -f docker-compose.prod.yml exec thetecnoagrarian sqlite3 /app/data/blog.db ".backup /app/data/backup-$(date +%Y%m%d-%H%M%S).db"
```

To externalize the backups (recommended), copy them off the container to the host and then to off-server storage:
```bash
# Copy latest backup from container to host
docker cp $(docker-compose -f docker-compose.prod.yml ps -q fruitionforestgarden):/app/data/backup-$(date +%Y%m%d)*.db /opt/backups/
docker cp $(docker-compose -f docker-compose.prod.yml ps -q thetecnoagrarian):/app/data/backup-$(date +%Y%m%d)*.db /opt/backups/
# (Optional) Sync to object storage
# rclone copy /opt/backups/ remote:linode-object-storage/site-db-backups
```

### Monitoring Commands

```bash
# Container status
docker-compose -f docker-compose.prod.yml ps

# Real-time logs
docker-compose -f docker-compose.prod.yml logs -f

# Resource usage
docker stats

# Health checks (these endpoints are implemented in our apps)
curl http://localhost:4000/health
curl http://localhost:4002/health
```

### Makefile Helpers

```Makefile
# Makefile Helpers

backup:
	# Backup both databases and copy to host backups folder
	docker-compose -f docker-compose.prod.yml exec fruitionforestgarden sqlite3 /app/data/blog.db ".backup /app/data/backup-$$(date +%Y%m%d-%H%M%S).db"
	docker-compose -f docker-compose.prod.yml exec thetecnoagrarian sqlite3 /app/data/blog.db ".backup /app/data/backup-$$(date +%Y%m%d-%H%M%S).db"
	docker cp $$(docker-compose -f docker-compose.prod.yml ps -q fruitionforestgarden):/app/data/backup-* /opt/backups/ || true
	docker cp $$(docker-compose -f docker-compose.prod.yml ps -q thetecnoagrarian):/app/data/backup-* /opt/backups/ || true

rollback:
	# Roll back by starting old containers (adjust IDs as needed)
	@echo "To roll back, run: docker start <old_container_ids> and update Nginx/DNS if needed."

status:
	docker-compose -f docker-compose.prod.yml ps

logs:
	docker-compose -f docker-compose.prod.yml logs -f
```

## 🔧 Troubleshooting

### Container won't start:
- Check logs: `docker-compose -f docker-compose.prod.yml logs <service-name>`
- Verify environment variables in `.env`
- Check port conflicts: `netstat -tulpn | grep :400`

### Database issues:
- Check volume mounts: `docker volume ls`
- Verify database file creation: `docker-compose -f docker-compose.prod.yml exec <service> ls -la /app/data/`

### SSL/Proxy issues:
- Test containers directly: `curl http://localhost:4000`
- Check Nginx config: `nginx -t`
- Reload Nginx: `systemctl reload nginx`


🚀 Next Steps
Now we're ready to proceed! The logical order is:
🔍 Pre-Deployment Verification - SSH into Linode and run the verification commands
🔑 GitHub SSH Setup - Generate SSH key and add to thetecnoagrarian GitHub account
🌐 DNS Setup - Create the test subdomain records (only tta-new.thetecnoagrarian.com needed)
📤 Upload Code - Clone from GitHub using SSH
🐳 Deploy & Test - Run the Docker containers
🔒 SSL Setup - Get Let's Encrypt certificates
✅ Final Testing - Verify everything works