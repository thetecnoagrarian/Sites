# Blog Core Implementation Plan v2

## 🎯 Project Overview

This document outlines the refined step-by-step implementation plan for creating a shared `blog-core` package that powers multiple websites with identical functionality while allowing site-specific customization.

## 📋 Current Status

- ✅ **Backup Created**: Local files backed up to `/Users/air/Sites/backups/fruitionforestgarden-local-backup-20250913-094413/`
- ✅ **Requirements Gathered**: 5 clarifying questions answered and resolved
- ✅ **Design Phase**: Core package structure designed and finalized
- ✅ **Phase 1 Complete**: Workspace structure created with npm workspaces
- ✅ **Phase 2 Complete**: Core package extracted, sites converted to ES modules
- ✅ **Phase 3 Complete**: Both sites refactored to use core package
- ⏳ **Phase 4**: Ready for local testing and validation

## 🏗️ Target Architecture

### Directory Structure
```
/Users/air/Sites/
├── blog-core/                    # Shared core package
│   ├── package.json
│   ├── src/
│   │   ├── models/              # Database models (shared schema owned by core)
│   │   ├── utils/               # Image processing, slug generation (shared)
│   │   ├── middleware/          # Auth, role guards, upload (shared)
│   │   ├── routes/              # Admin routes, API routes (shared)
│   │   ├── controllers/         # Route controllers (shared)
│   │   ├── database/            # Database schema & migrations (shared)
│   │   └── templates/           # Default Handlebars templates (customizable, fallback)
│   └── README.md
│
├── fruitionforestgarden/         # Site-specific (most developed)
│   ├── package.json             # Depends on blog-core (version pinned)
│   ├── .env                     # Site-specific config
│   ├── src/
│   │   ├── app.js               # Site entry point
│   │   ├── public/
│   │   │   ├── css/             # Site-specific styles
│   │   │   └── images/          # Site-specific assets
│   │   └── views/               # Site-specific templates (overrides core, individual files only)
│   │       ├── layouts/         # Custom layouts
│   │       └── partials/        # Custom partials
│   └── database/                # Site-specific SQLite DB file
│
│
└── thetecnoagrarian/            # Site-specific
    ├── package.json             # Depends on blog-core (version pinned)
    ├── .env                     # Site-specific config
    └── src/                     # Same structure as above
```

## 📦 Core Package Contents

### What Goes in `blog-core`:
- ✅ **Database Schema & Models**: Core owns schema definitions; each site maintains its own SQLite DB file
- ✅ **Utilities**: Image processing, slug generation, validation
- ✅ **Middleware**: Authentication, role guards, file upload, security
- ✅ **Routes**: Admin routes, API routes, post management
- ✅ **Controllers**: Route controllers and business logic
- ✅ **Database**: Schema definitions, migrations, initialization scripts
- ✅ **Templates**: Default Handlebars templates (fallbacks)
- ✅ **Configuration**: Default settings, constants, and shared dependencies centralized here
- ✅ **Storage Utility**: Adapters for local disk and S3-compatible storage

### What Stays Site-Specific:
- ✅ **CSS Files**: Complete styling customization
- ✅ **Templates**: Sites can override any individual template file (layouts, partials, views)
- ✅ **Database Files**: Separate SQLite database file per site
- ✅ **Uploads Directory**: External directory per site (e.g., `/var/lib/sites/<site>/uploads/`)
- ✅ **Environment Config**: `.env` files with site-specific settings (never committed)
- ✅ **Assets**: Logos, favicons, site-specific images
- ✅ **Entry Point**: `app.js` with site-specific configuration

## 🔧 Implementation Requirements

### 1. Site-Specific Content & Branding
- **CSS**: Each site has its own `.css` files
- **Templates**: Sites override individual core templates only (no directory-wide overrides)
- **Assets**: Complete visual customization per site

### 2. Database Structure
- **Separate Databases**: Each site has its own SQLite DB file
- **Shared Schema**: Core package owns schema and migrations
- **Data Isolation**: No shared content between sites

### 3. Configuration & Environment
- **Individual .env Files**: Each site has its own environment configuration
- **Security**: No shared secrets or configuration between sites
- **Port Management**: Each site runs on a distinct port (3001, 3002, 3003)

### 4. Deployment Strategy
- **PM2 Management**: Used for production deployments; can start all or individual sites
- **Docker Support**: Used for local development with consistent port mapping
- **Independent Control**: Start/stop sites individually or together

### 5. Functionality & Customization
- **Identical Core Features**: All sites share the same functionality via core package
- **Template Override**: Sites override individual `.hbs` or HTML template files only
- **CSS Customization**: Complete styling freedom per site

## 🚀 Deployment Options

### Docker Compose (Local Development)
```yaml
version: '3.8'
services:
  fruitionforestgarden:
    build: ./fruitionforestgarden
    ports:
      - "3001:3001"
  thetecnoagrarian:
    build: ./thetecnoagrarian
    ports:
      - "3002:3002"
  blog-template:
    build: ./blog-template
    ports:
      - "3003:3003"
```

### PM2 Process Management (Production)
```bash
# Start all sites
pm2 start ecosystem.config.js

# Start individual sites
pm2 start fruitionforestgarden
pm2 start thetecnoagrarian
pm2 start blog-template
```

## 🛡️ Safety-First Implementation Approach

**CRITICAL**: This is a complex architectural change that will affect your live site. We will:

1. **Test at every step** - No step proceeds without verification
2. **Make small, incremental changes** - Each phase builds on the previous
3. **Keep live site stable** - No changes to production until local testing is complete
4. **Maintain rollback capability** - Each phase can be reverted if issues arise
5. **Validate functionality** - Every feature must work identically to current version, verified by smoke tests and admin workflows

## 📋 Implementation Steps (Reordered & Clarified)

### Phase 1: Workspace Skeleton Setup (FIRST PRIORITY)
1. **Create npm workspaces structure**
   - Root `package.json` with workspaces configuration
   - Each site depends on `@ffg/blog-core` with pinned semver version (e.g., `0.1.0`)
   - Shared dependencies centralized in `blog-core`
   - **TEST**: Verify workspace setup works locally

### Phase 2: Extract Shared Code into `blog-core`
1. **Extract shared code from `fruitionforestgarden`**
   - Create `blog-core` directory structure
   - Core `package.json` with dependencies and versioning
   - Set up database schema and models owned by core
   - Create default templates and middleware
   - **TEST**: Core package builds and exports correctly

2. **Convert sites to ES modules**
   - Add `"type": "module"` to site `package.json` files
   - Convert all `require()`/`module.exports` to `import`/`export`
   - Update file extensions and import paths
   - **REASON**: Core package uses ES modules, sites must match for compatibility
   - **TEST**: Sites start without module system errors

### Phase 3: Site Refactoring One-by-One
1. **Update `fruitionforestgarden` to use core package**
   - Configure Express + Handlebars with fallback system
   - Site-specific overrides in `src/views/` (individual files only)
   - Public assets: `src/public/css`, `src/public/images`
   - SQLite database file in `/database/`
   - Uploads stored locally at `src/public/uploads/`
   - **TEST**: Site works identically to current version

2. **Refactor `thetecnoagrarian` similarly**
   - Follow same structure and overrides
   - **TEST**: Site works locally with core package

### Phase 4: Local Testing & Validation with Docker
1. **Local Development Setup**
   - Docker Compose with two services on ports 3001-3002
   - Volume mounts for external uploads and database directories
   - Hot reload with nodemon
   - **TEST**: All sites run locally without issues

2. **Comprehensive Local Testing**
   - Test all core functionality across all sites
   - Verify template fallback and override system works correctly
   - Test image upload and processing
   - Test post creation, management, and admin workflows
   - **TEST**: No regressions; smoke tests pass

### Phase 5: Production Deployment with PM2 and Nginx
1. **Production Setup**
   - PM2 with `ecosystem.config.cjs` managing two apps on ports 3001, 3002
   - Reverse proxy with Nginx configured for apex domains only (redirect www → apex)
   - Force HTTP → HTTPS redirects with 301 status
   - Enable HSTS headers
   - Serve `/uploads` directories with long cache headers
   - **TEST**: Production deployment works correctly

2. **Backup System**
   - Nightly cron jobs on Linode
   - Tarball SQLite DBs into `/var/backups/<site>/`
   - Sync uploads directories to Linode Object Storage with `rclone`
   - Rotation: keep 7 daily, 4 weekly, 3 monthly backups
   - Monthly restore test
   - **TEST**: Backup and restore procedures work

### Phase 6: CI/CD Pipeline Implementation
1. **GitHub Actions Workflow**
   - Install & build workspace on PR
   - Run `blog-core` unit tests
   - Run `site:render-test` for each site
   - Run migrations dry-run against throwaway SQLite DBs
   - Run `scripts/check-template-drift.mjs`
   - Fail fast if contracts or tests are broken
   - **TEST**: CI pipeline catches issues before deployment

### Phase 7: Documentation (Simplified & Centralized)
1. **`blog-core/README.md`**
   - Installation & workspace usage
   - Template contracts and required context per template
   - Override & fallback rules (individual file overrides only)
   - Storage adapter configuration
   - Migration workflow
   - Upgrade guide with semver expectations

2. **`DEPLOYMENT.md` at root**
   - Docker local development instructions
   - Linode PM2 + Nginx production setup
   - Backup and restore process
   - **TEST**: Documentation is accurate and helpful

## ❓ Resolved Decisions

### 1. Template Override Strategy
- Sites override individual template files only (layouts, partials, views)
- No directory-wide overrides allowed to maintain clarity and fallback consistency

### 2. Core Versioning
- Core package version pinned with semver in each site's `package.json`
- Allows controlled upgrades and rollback

### 3. Shared Dependencies
- Common dependencies centralized in `blog-core` package
- Avoid duplication and version conflicts

### 4. Migration Path
- Migrate sites one at a time, starting with `fruitionforestgarden`
- Ensures stability and rollback capability

### 5. Testing Strategy
- Combination of smoke tests, CI pipeline, and staging environment validations
- Ensures regressions are caught early and admin workflows remain intact

## 🎯 Success Criteria

### Local Development
- [ ] Both sites run independently using shared core package
- [ ] Each site maintains its unique styling and branding
- [ ] Core functionality works identically across all sites
- [ ] Sites can be started/stopped individually or together via Docker Compose
- [ ] Smoke tests and admin workflows pass consistently

### Live Deployment
- [ ] All sites deploy successfully to production servers
- [ ] PM2 manages all sites correctly on ports 3001, 3002
- [ ] No regressions detected in smoke tests or admin workflows
- [ ] Core package updates propagate safely with pinned versions

### Maintenance
- [ ] Bug fixes in core automatically benefit all sites after version upgrades
- [ ] New features can be added to core and shared seamlessly
- [ ] Individual sites can customize without affecting others
- [ ] Clear, centralized documentation for adding new sites and upgrading core

## 📚 Documentation Updates Needed

- [ ] Update root and core README.md files with new architecture and workflow
- [ ] Document template override system (individual file overrides only)
- [ ] Create core package usage and upgrade guides
- [ ] Update deployment guides for Docker (local) and PM2/Nginx (production)
- [ ] Write migration instructions for site refactoring

## 🔄 Next Steps

1. **Begin Phase 1**: Create workspace skeleton with pinned core dependency
2. **Extract shared code** from `fruitionforestgarden` into `blog-core`
3. **Refactor `fruitionforestgarden`** to use core package with overrides
4. **Test thoroughly** locally with Docker Compose
5. **Proceed with thetecnoagrarian** following the same process
6. **Implement CI/CD pipeline** to maintain quality
7. **Deploy to production** with PM2 and Nginx reverse proxy

---

**Last Updated**: October 2, 2025  
**Status**: Phases 1-3 Complete, Ready for Testing  
**Backup Available**: `/Users/air/Sites/backups/fruitionforestgarden-local-backup-20250913-094413/`
