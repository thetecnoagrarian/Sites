# Docker Setup Guide for Fruition Forest Garden

This guide covers setting up and running the Fruition Forest Garden application using Docker for both local development and production deployment.

## 🚀 Quick Start (Local Development)

### Prerequisites
- Docker Desktop installed and running
- Docker Compose installed

### Option 1: Automated Setup (Recommended)
```bash
# Run the automated setup script
./setup.sh
```

This script will:
- Create a `.env` file with development settings
- Initialize the database
- Build and start the Docker containers
- Verify the application is running

### Option 2: Manual Setup
```bash
# 1. Create .env file
cp .env.example .env

# 2. Initialize database
node src/database/init.js

# 3. Build and start containers
docker-compose up --build -d

# 4. Check logs
docker-compose logs -f app
```

## 🐳 Docker Files Overview

### Development Files
- `Dockerfile.dev` - Development container with nodemon and hot reload
- `docker-compose.yml` - Development environment with volume mounts
- `setup.sh` - Automated setup script

### Production Files
- `Dockerfile` - Production-optimized container
- `docker-compose.prod.yml` - Production environment
- `.dockerignore` - Excludes unnecessary files from build

## 🔧 Development Commands

```bash
# Start development environment
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop containers
docker-compose down

# Rebuild after dependency changes
docker-compose up --build -d

# Access container shell
docker-compose exec app sh

# Restart application
docker-compose restart app
```

## 🏭 Production Deployment

### Using Docker Compose
```bash
# Set production environment variables
export SESSION_SECRET="your-production-session-secret"
export CSRF_SECRET="your-production-csrf-secret"

# Start production environment
docker-compose -f docker-compose.prod.yml up -d

# Check health
curl http://localhost:3000/health
```

### Using Docker directly
```bash
# Build production image
docker build -t fruitionforestgarden:latest .

# Run production container
docker run -d \
  --name fruitionforestgarden \
  -p 3000:3000 \
  -v $(pwd)/src/database:/app/src/database \
  -v $(pwd)/src/public/uploads:/app/src/public/uploads \
  -v $(pwd)/src/public/images:/app/src/public/images \
  -e NODE_ENV=production \
  -e SESSION_SECRET="your-production-session-secret" \
  -e CSRF_SECRET="your-production-csrf-secret" \
  fruitionforestgarden:latest
```

## 📁 Volume Mounts

The Docker setup uses volume mounts to persist data:

- `./src/database` → `/app/src/database` - SQLite database files
- `./src/public/uploads` → `/app/src/public/uploads` - User uploaded files
- `./src/public/images` → `/app/src/public/images` - Static images

## 🔒 Security Features

### Production Dockerfile
- Uses Alpine Linux for smaller attack surface
- Runs as non-root user (nodejs:1001)
- Includes health checks
- Minimal dependencies

### Environment Variables
- Session secrets for production
- CSRF protection
- Rate limiting
- Secure cookie settings

## 🐛 Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Check what's using port 3000
   lsof -i :3000
   
   # Change port in docker-compose.yml
   ports:
     - "3001:3000"
   ```

2. **Database permissions**
   ```bash
   # Fix database permissions
   sudo chown -R $USER:$USER src/database/
   chmod 644 src/database/*.db
   ```

3. **Container won't start**
   ```bash
   # Check container logs
   docker-compose logs app
   
   # Check container status
   docker-compose ps
   ```

4. **Health check failing**
   ```bash
   # Test health endpoint manually
   curl http://localhost:3000/health
   
   # Check if app is responding
   curl http://localhost:3000/
   ```

### Debug Commands
```bash
# Inspect running containers
docker ps

# View container details
docker inspect fruitionforestgarden_app_1

# Access container filesystem
docker-compose exec app ls -la /app

# Check environment variables
docker-compose exec app env
```

## 🔄 Database Management

### Backup Database
```bash
# Copy database from container
docker-compose exec app sqlite3 /app/src/database/fruitionforestgarden.db ".backup /app/src/database/backup.db"

# Copy to host
docker cp fruitionforestgarden_app_1:/app/src/database/backup.db ./backup.db
```

### Restore Database
```bash
# Copy backup to container
docker cp ./backup.db fruitionforestgarden_app_1:/app/src/database/

# Restore in container
docker-compose exec app sqlite3 /app/src/database/fruitionforestgarden.db ".restore /app/src/database/backup.db"
```

## 📊 Monitoring

### Health Check
The application includes a health check endpoint:
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "environment": "development"
}
```

### Logs
```bash
# View application logs
docker-compose logs -f app

# View logs with timestamps
docker-compose logs -f -t app

# View last 100 lines
docker-compose logs --tail=100 app
```

## 🚀 Performance Optimization

### Development
- Volume mounts for hot reload
- Debug logging enabled
- Higher rate limits

### Production
- Multi-stage builds
- Optimized dependencies
- Health checks
- Proper error handling
- Security hardening

## 📝 Environment Variables

| Variable | Development | Production | Description |
|----------|-------------|------------|-------------|
| `NODE_ENV` | development | production | Environment mode |
| `PORT` | 3000 | 3000 | Application port |
| `SESSION_SECRET` | dev-secret | secure-secret | Session encryption |
| `DATABASE_PATH` | ./src/database/fruitionforestgarden.db | /app/src/database/fruitionforestgarden.db | Database location |
| `LOG_LEVEL` | debug | info | Logging level |
| `CSRF_SECRET` | dev-csrf | secure-csrf | CSRF protection |
| `RATE_LIMIT_MAX_REQUESTS` | 1000 | 25 | Rate limiting |

## 🔗 Useful Links

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Alpine Linux](https://alpinelinux.org/) 