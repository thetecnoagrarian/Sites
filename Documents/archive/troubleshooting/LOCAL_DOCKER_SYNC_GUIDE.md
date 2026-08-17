# Local Docker Sync Guide

**Purpose**: Sync your local Docker environment with production to test changes locally before deploying.

---

## 🎯 Goal

Match your local Docker setup with production so you can:
- ✅ Test changes locally before pushing to production
- ✅ Catch issues before deployment
- ✅ Reduce deployment frequency
- ✅ Use the same Docker images and configuration

---

## 📋 Current Setup Comparison

### Production (`docker-compose.prod.yml`)
- **Dockerfile**: `docker/Dockerfile.prod.site`
- **Port**: 4000 (FFG), 4002 (TTA)
- **Environment**: Production settings
- **Build**: Multi-stage optimized build
- **Volumes**: Named volumes (`ffg_data`, `tta_data`)

### Local (`docker-compose.yml`)
- **Dockerfile**: `fruitionforestgarden/Dockerfile.dev`, `thetecnoagrarian/Dockerfile.dev`
- **Port**: 3000 (FFG), 3002 (TTA)
- **Environment**: Development settings
- **Build**: Development build with hot reload
- **Volumes**: Bind mounts (live code editing)

---

## 🔄 Option 1: Use Production Docker Compose Locally (Recommended)

**Best for**: Testing production-like environment locally

### Setup Steps

1. **Create local production config**:
```bash
# Copy production compose file
cp docker-compose.prod.yml docker-compose.local-prod.yml
```

2. **Update for local use**:
```yaml
# docker-compose.local-prod.yml
services:
  fruitionforestgarden:
    # ... existing config ...
    env_file:
      - .env.local  # Use local env file
    volumes:
      # Use bind mounts for local development
      - ./blog-core:/app/blog-core
      - ./fruitionforestgarden:/app/fruitionforestgarden
      - ./fruitionforestgarden/src/database:/app/data/database
      - ./fruitionforestgarden/src/public/uploads:/app/data/uploads
      - ffg_logs:/app/logs
```

3. **Create `.env.local`** (copy from `.env` but adjust for local):
```bash
cp .env .env.local
# Edit .env.local with local settings
```

4. **Run local production build**:
```bash
# Build and start
docker-compose -f docker-compose.local-prod.yml up --build -d

# View logs
docker-compose -f docker-compose.local-prod.yml logs -f fruitionforestgarden
```

---

## 🔄 Option 2: Match Local to Production (Alternative)

**Best for**: Keep development workflow but match production settings

### Update `docker-compose.yml`

```yaml
services:
  fruitionforestgarden:
    build:
      context: .
      dockerfile: docker/Dockerfile.prod.site  # Use production Dockerfile
      args:
        SITE_DIR_NAME: fruitionforestgarden
        SITE_PORT: 4000  # Match production port
    ports:
      - "4000:4000"  # Match production port
    environment:
      - NODE_ENV=production  # Match production
      - PORT=4000
      # ... other production settings ...
```

---

## 🧪 Testing Workflow

### 1. Local Testing
```bash
# Start local production build
docker-compose -f docker-compose.local-prod.yml up --build -d

# Test locally
curl http://localhost:4000
# Visit http://localhost:4000 in browser

# Check logs
docker-compose -f docker-compose.local-prod.yml logs -f
```

### 2. Verify Changes Work
- ✅ Test all features locally
- ✅ Check admin functions
- ✅ Verify image uploads
- ✅ Test analytics

### 3. Push to Production (Only After Local Testing)
```bash
# Commit changes
git add .
git commit -m "Description of changes"

# Push to GitHub
git push origin main

# Wait for CI/CD to pass

# Deploy to production
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d fruitionforestgarden"
```

---

## 🔧 Quick Sync Script

Create `scripts/sync-local-prod.sh`:

```bash
#!/bin/bash
# Sync local Docker with production settings

echo "🔄 Syncing local Docker with production..."

# Stop current containers
docker-compose down

# Build with production Dockerfile
docker-compose -f docker-compose.local-prod.yml build

# Start containers
docker-compose -f docker-compose.local-prod.yml up -d

echo "✅ Local Docker synced with production!"
echo "🌐 Test at: http://localhost:4000 (FFG) or http://localhost:4002 (TTA)"
```

---

## 📊 Environment Variables Comparison

### Production (`.env` on server)
```bash
NODE_ENV=production
LOG_LEVEL=warn
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=52428800
```

### Local (`.env.local`)
```bash
NODE_ENV=production  # Match production
LOG_LEVEL=info       # More verbose for debugging
RATE_LIMIT_MAX_REQUESTS=1000  # Higher for testing
MAX_FILE_SIZE=52428800
```

---

## ✅ Benefits

1. **Catch Issues Early**: Test production-like environment locally
2. **Faster Development**: No need to deploy to test
3. **Confidence**: Know changes work before pushing
4. **Cost Savings**: Fewer deployments = less server load

---

## 🚨 Important Notes

- **Database**: Local and production use separate databases
- **Uploads**: Local and production have separate upload directories
- **Secrets**: Never commit `.env` files - use `.env.local` for local
- **Ports**: Make sure local ports don't conflict with production

---

## 🔍 Troubleshooting

**Port already in use**:
```bash
# Check what's using the port
lsof -i :4000

# Stop conflicting service or change port in docker-compose.local-prod.yml
```

**Build fails**:
```bash
# Clean Docker cache
docker system prune -a

# Rebuild from scratch
docker-compose -f docker-compose.local-prod.yml build --no-cache
```

**Database issues**:
```bash
# Reset local database (if needed)
rm -f fruitionforestgarden/src/database/blog.db
# Database will be recreated on next start
```

---

**Last Updated**: November 18, 2025

