# Local Production Setup - Quick Start

**Goal**: Match your local Docker environment with production for testing.

> **Note**: For historical background on the pure-local directory fix, see [the archived directory auto-creation note](./DIRECTORY_AUTO_CREATION_FIX.md).
> Use `npm run dev:all` for quick local testing without Docker.

---

## 🚀 Quick Setup

### Step 1: Create `.env.local` file

```bash
# Create .env.local file
cat > .env.local << 'EOF'
# Local Production Environment Variables
DATABASE_PATH=/app/data/blog.db
UPLOADS_PATH=/app/data/uploads

# Security (use different secrets for local)
SESSION_SECRET=local-dev-session-secret-change-me
CSRF_SECRET=local-dev-csrf-secret-change-me

# Application Settings
NODE_ENV=production
LOG_LEVEL=info
MAX_FILE_SIZE=52428800

# Rate Limiting (higher for local testing)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Trusted IPs (optional)
TRUSTED_IPS=
EOF
```

### Step 2: Run sync script

```bash
./scripts/sync-local-prod.sh
```

This will:
- ✅ Stop old containers
- ✅ Build with production Dockerfile
- ✅ Start containers on production ports (4000, 4002)
- ✅ Use bind mounts for live code editing

### Step 3: Test locally

```bash
# Visit in browser
http://localhost:4000  # Fruition Forest Garden
http://localhost:4002  # The Tecnoagrarian

# View logs
docker-compose -f docker-compose.local-prod.yml logs -f
```

---

## 📊 Differences from Production

| Feature | Production | Local Production |
|---------|-----------|------------------|
| Dockerfile | `docker/Dockerfile.prod.site` | ✅ Same |
| Ports | 4000, 4002 | ✅ Same |
| Environment | Production | ✅ Same |
| Volumes | Named volumes | Bind mounts (live editing) |
| Log Level | `warn` | `info` (more verbose) |
| Rate Limit | 100 req/15min | 1000 req/15min (testing) |

---

## 🔄 Development Workflow

1. **Make changes locally**
2. **Test on local production setup**:
   ```bash
   docker-compose -f docker-compose.local-prod.yml restart fruitionforestgarden
   ```
3. **Verify everything works**
4. **Push to GitHub** (CI/CD runs)
5. **Deploy to production** (only after local testing passes)

---

## 📋 Common Commands

```bash
# Start
docker-compose -f docker-compose.local-prod.yml up -d

# Stop
docker-compose -f docker-compose.local-prod.yml down

# View logs
docker-compose -f docker-compose.local-prod.yml logs -f fruitionforestgarden

# Restart after code changes
docker-compose -f docker-compose.local-prod.yml restart fruitionforestgarden

# Rebuild (after Dockerfile changes)
docker-compose -f docker-compose.local-prod.yml up --build -d
```

---

## ✅ Benefits

- ✅ **Test production-like environment locally**
- ✅ **Catch issues before deploying**
- ✅ **Faster development cycle**
- ✅ **Same ports and configuration as production**

---

**Last Updated**: November 18, 2025
