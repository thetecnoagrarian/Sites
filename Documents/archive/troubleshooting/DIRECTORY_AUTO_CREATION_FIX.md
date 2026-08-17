# Directory Auto-Creation Fix

**Date**: January 2026  
**Issue**: Local development failing due to missing database and uploads directories  
**Status**: ✅ Fixed

---

## Problem

When running `npm run dev:all` locally, both sites were crashing with:

```
Error: ENOENT: no such file or directory, mkdir '/app/data/uploads'
TypeError: Cannot open database because the directory does not exist
```

### Root Cause

1. **SQLite limitation**: SQLite can create database files but **cannot create parent directories**
2. **Docker paths in local dev**: Environment variables were setting Docker container paths (`/app/data/...`) that don't exist on macOS
3. **Missing directories**: After cleanup, database and uploads directories were deleted, causing crashes

---

## Solution

### 1. Code Changes (blog-core)

#### Database Directory Auto-Creation

**File**: `blog-core/src/database/init.js`

- Added `mkdirSync` import from `fs`
- Added directory creation before opening database in both `initializeDatabase()` and `createDatabase()`
- Added error handling with helpful error messages

```javascript
// Before opening database
mkdirSync(dirname(dbPath), { recursive: true });
```

#### Uploads Directory Auto-Creation

**File**: `blog-core/src/app.js`

- Added `mkdirSync` import from `fs`
- Added directory creation for uploads path after validation
- Added error handling with helpful error messages

```javascript
// Ensure uploads directory exists
mkdirSync(uploadsPath, { recursive: true });
```

### 2. Configuration Changes

#### Fixed TTA Defaults

**File**: `thetecnoagrarian/src/app.js`

Changed defaults from Docker paths to local paths (matching FFG):

```javascript
// Before
databasePath: process.env.DATABASE_PATH || '/app/data/blog.db',
uploadsPath: process.env.UPLOADS_PATH || '/app/data/uploads',

// After
databasePath: process.env.DATABASE_PATH || path.join(__dirname, 'database/blog.db'),
uploadsPath: process.env.UPLOADS_PATH || path.join(__dirname, 'public/uploads'),
```

#### Environment File Updates

Commented out Docker paths in `.env` files for local development:

- `.env.local` - Commented out `DATABASE_PATH` and `UPLOADS_PATH`
- `thetecnoagrarian/.env` - Commented out Docker paths
- `fruitionforestgarden/.env` - Commented out Docker paths

**Note**: Docker Compose will still set these via environment variables, so Docker behavior is unchanged.

---

## How It Works Now

### Local Development

1. **Default paths**: Sites use local paths by default (`src/database/blog.db`, `src/public/uploads`)
2. **Auto-creation**: Directories are created automatically if missing
3. **No manual setup**: No need to create directories before running `npm run dev:all`

### Docker/Production

1. **Environment variables**: Docker Compose sets `DATABASE_PATH` and `UPLOADS_PATH` via environment variables
2. **Override defaults**: Environment variables override the local defaults
3. **Auto-creation**: Directories are still created if missing (useful for new volumes)

---

## Benefits

✅ **Local dev "just works"** - No manual directory setup needed  
✅ **Docker unchanged** - Production/Docker behavior remains the same  
✅ **Defensive coding** - Handles missing directories gracefully  
✅ **Better errors** - Clear error messages if directory creation fails  
✅ **Minimal changes** - One fix in blog-core benefits all sites  

---

## Testing

### Verify Local Development

```bash
# Start both sites
npm run dev:all

# Expected output:
# - TTA running on port 3002
# - FFG running on port 3000
# - No directory errors
```

### Verify Docker Still Works

```bash
# Test Docker Compose
docker-compose -f docker-compose.local-prod.yml up

# Should use Docker paths from environment variables
# Directories will be created if volumes don't exist
```

---

## Restoring Docker Paths (If Needed)

If you need to restore the Docker paths in `.env` files for testing:

```bash
# Restore from backups
cp .env.local.backup .env.local
cp thetecnoagrarian/.env.backup thetecnoagrarian/.env
cp fruitionforestgarden/.env.backup fruitionforestgarden/.env
```

Or manually uncomment the lines:

```bash
# In .env.local
DATABASE_PATH=/app/data/database/blog.db
UPLOADS_PATH=/app/data/uploads
```

---

## Error Handling

The code now provides helpful error messages if directory creation fails:

```
Cannot create uploads directory at "/app/data/uploads".
Parent directory may not exist or you may not have permissions.
For local development, ensure UPLOADS_PATH points to a writable location.
```

This helps diagnose:
- Permission issues
- Invalid paths
- Missing parent directories

---

## Files Modified

### Core Changes
- `blog-core/src/database/init.js` - Database directory auto-creation
- `blog-core/src/app.js` - Uploads directory auto-creation
- `thetecnoagrarian/src/app.js` - Fixed defaults to use local paths

### Configuration (backed up)
- `.env.local` → `.env.local.backup`
- `thetecnoagrarian/.env` → `thetecnoagrarian/.env.backup`
- `fruitionforestgarden/.env` → `fruitionforestgarden/.env.backup`

---

## Related Documentation

- [LOCAL_SETUP_QUICKSTART.md](../../LOCAL_SETUP_QUICKSTART.md) - Local development setup
- [ENVIRONMENT_TEMPLATE.md](../../ENVIRONMENT_TEMPLATE.md) - Environment variable reference
- [MASTER_PROJECT_DOCUMENTATION.md](../../MASTER_PROJECT_DOCUMENTATION.md) - Overall project docs

---

## Notes

- `mkdirSync` with `{ recursive: true }` is idempotent - safe to call if directory already exists
- Directory creation happens before database/file operations, preventing race conditions
- Error handling ensures clear feedback if something goes wrong
- Docker paths are preserved via environment variables, maintaining production compatibility
