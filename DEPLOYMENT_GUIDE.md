# Blog Monorepo Deployment Guide

## 🚀 Safe Side-by-Side Deployment to Linode

This guide helps you deploy the new blog monorepo alongside your existing live site for safe testing.

### Prerequisites

- Access to your Linode server
- Docker and Docker Compose installed on Linode
- SSH access to the server
- Domain/subdomain ready for testing (e.g., `ffg-new.fruitionforestgarden.com`)

### Step 1: Upload Code to Linode

```bash
# From your local machine
scp -r /Users/air/Sites/ user@your-linode-server:/opt/

# Or use git if you've pushed to a repository
# git clone <your-repo> /opt/Sites
```

### Step 2: Setup Environment

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

### Step 3: Generate Secure Session Secret

```bash
# Generate a secure session secret
openssl rand -base64 64
```

### Step 4: Deploy with Docker Compose

```bash
# Build and start the production containers
docker-compose -f docker-compose.prod.yml up --build -d

# Check container status
docker-compose -f docker-compose.prod.yml ps

# View logs if needed
docker-compose -f docker-compose.prod.yml logs fruitionforestgarden
docker-compose -f docker-compose.prod.yml logs thetecnoagrarian
```

### Step 5: Configure Nginx Proxy

Add these server blocks to your existing Nginx configuration:

```nginx
# New fruitionforestgarden (port 4000)
server {
    listen 443 ssl http2;
    server_name fruitionforestgarden-new.yourdomain.com;
    
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
    server_name thetecnoagrarian-new.yourdomain.com;
    
    # Your SSL certificates
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    
    location / {
        proxy_pass http://localhost:4002<｜tool▁calls▁end｜>        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

### Step 6: Initialize Databases

```bash
# SSH into the containers to initialize admin users
docker-compose -f docker-compose.prod.yml exec fruitionforestgarden node -e "
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

### Step 7: Test Everything

1. **Access new sites:**
   - `https://fruitionforestgarden-new.yourdomain.com`
   - `https://thetecnoagrarian-new.yourdomain.com`

2. **Test admin login:**
   - Username: `admin`
   - Password: `admin123`

3. **Verify functionality:**
   - Create posts
   - Upload images
   - Browse categories
   - View admin dashboard

### Step 8: Switch Production Traffic

Once testing is complete:

1. **Update DNS** to point the main domains to the new containers
2. **Update Nginx** to proxy main domains to ports 4000/4002
3. **Monitor** for any issues
4. **Clean up** old containers when confident

### Backup Strategy

```bash
# Create backup of databases
docker-compose -f docker-compose.prod.yml exec fruitionforestgarden sqlite3 /app/data/blog.db ".backup /app/data/backup-$(date +%Y%m%d-%H%M%S).db"
docker-compose -f docker-compose.prod.yml exec thetecnoagrarian sqlite3 /app/data/blog.db ".backup /app/data/backup-$(date +%Y%m%d-%H%M%S).db"
```

### Monitoring Commands

```bash
# Container status
docker-compose -f docker-compose.prod.yml ps

# Real-time logs
docker-compose -f docker-compose.prod.yml logs -f

# Resource usage
docker stats

# Health checks
curl http://localhost:4000/health
curl http://localhost:4002/health
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
