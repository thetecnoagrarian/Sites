# Docker Build Cache & Disk Space Optimization Plan

## Current Issues

### 1. **Docker Images Are Too Large (3GB each!)**
- **Current**: `sites-fruitionforestgarden:latest` = 3.02GB
- **Current**: `sites-thetecnoagrarian:latest` = 2.9GB
- **Expected**: Should be 200-500MB for a Node.js app

### 2. **Build Cache Fills Up Fast**
- Build cache accumulates 8-9GB after each rebuild
- The Dockerfile does `COPY . .` which copies the entire monorepo
- Includes unnecessary files: node_modules, backups, test files, docs

### 3. **Deprecated Builder Warning**
- **Not causing the issue**, but buildx would be more efficient
- Legacy builder is less efficient at managing cache
- Buildx provides better layer caching and parallel builds

## Root Causes

1. **Line 27 in `docker/Dockerfile.prod.site`**: `COPY . .` copies everything
2. **`.dockerignore` exists but may not be working properly** (it's in .gitignore)
3. **No multi-stage build** to reduce final image size
4. **Build context is huge** - copying entire monorepo structure

## Space Usage Breakdown

```
Total Disk: 25GB
- Docker Images: ~6GB (2 images × 3GB each) ⚠️ TOO LARGE
- Build Cache: 8-9GB (accumulates after each rebuild) ⚠️
- node_modules: 137MB
- Site code: ~75MB
- Backups: ~50MB (after cleanup)
- Other: ~1GB
```

## Solutions

### Immediate Fixes (Already Done)
1. ✅ Updated `.dockerignore` to exclude more files
2. ✅ Cleaned up build cache (freed 8.7GB)
3. ✅ Cleaned old backups

### Recommended Optimizations

#### 1. **Use Multi-Stage Build** (Reduces image size by 60-70%)
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY blog-core/package*.json ./blog-core/
COPY ${SITE_DIR_NAME}/package*.json ./${SITE_DIR_NAME}/
RUN npm ci --omit=dev

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY blog-core ./blog-core
COPY ${SITE_DIR_NAME} ./${SITE_DIR_NAME}
# ... rest of config
```

#### 2. **Install buildx** (Better cache management)
```bash
# On server
docker buildx install
# Then use: docker buildx build instead of docker build
```

#### 3. **Optimize Dockerfile** (Copy only what's needed)
- Copy package.json files first (better caching)
- Copy source code separately
- Don't copy node_modules, backups, tests, docs

#### 4. **Set Up Automated Cleanup**
```bash
# Add to cron or systemd timer
docker system prune -a -f --filter "until=168h"  # Clean images older than 7 days
docker builder prune -a -f  # Clean build cache weekly
```

## Expected Results After Optimization

- **Image size**: 3GB → ~300MB (90% reduction)
- **Build cache**: 8GB → ~1-2GB (75% reduction)
- **Total Docker space**: 14GB → ~4GB (70% reduction)
- **Build time**: Faster (better caching)

## Next Steps

1. ✅ Update `.dockerignore` (done)
2. ⏳ Optimize Dockerfile with multi-stage build
3. ⏳ Install buildx on server
4. ⏳ Set up automated cleanup cron job
5. ⏳ Rebuild images to test size reduction

