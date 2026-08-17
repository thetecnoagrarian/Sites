# Repository Inventory

Generated from safe directory/file listings and non-sensitive package manifests only.
Sensitive files are listed by path only and were not opened.

## 1. Top-Level Repo Structure

- `AGENTS.md` - repository operating instructions and safety policy.
- `package.json` / `package-lock.json` - root npm workspace manifest and lockfile.
- `blog-core/` - shared blog package used by the site workspaces.
- `fruitionforestgarden/` - Fruition Forest Garden site package.
- `thetecnoagrarian/` - The Tecnoagrarian site package.
- `Documents/` - project documentation and operational notes.
- `docker/` - shared Docker build assets.
- `nginx/` - nginx configuration.
- `scripts/` - repository-level operational scripts.
- `tests/` - Playwright end-to-end tests.
- `.github/` - GitHub workflow configuration.
- Runtime/generated folders are present and listed separately below.

## 2. Workspace and Package Structure

The root `package.json` defines a private npm workspace named `blog-workspace`.

Workspace packages:

- `blog-core`
- `fruitionforestgarden`
- `thetecnoagrarian`

Root scripts visible from the non-sensitive manifest:

- Workspace install/build/test entry points.
- Playwright end-to-end test entry points.
- Site start/dev entry points for both site packages.

Runtime requirements from the root manifest:

- Node.js `>=18.0.0`
- npm `>=9.0.0`

## 3. Shared Code Areas

- `blog-core/src/` - shared blog-core implementation.
- `blog-core/package.json` - shared package manifest.

The shared package is published locally as `@ffg/blog-core` and is referenced by both site packages.

Visible shared-package dependency themes:

- Express application stack.
- Handlebars rendering.
- Session handling.
- SQLite support.
- File upload and image processing.
- Security and request middleware.
- Logging.

## 4. Site-Specific Areas

Fruition Forest Garden:

- `fruitionforestgarden/src/` - site-specific source code.
- `fruitionforestgarden/package.json` - site package manifest.
- `fruitionforestgarden/Dockerfile`
- `fruitionforestgarden/Dockerfile.dev`
- `fruitionforestgarden/docker-compose.yml`
- `fruitionforestgarden/docker-compose.prod.yml`
- `fruitionforestgarden/ecosystem.config.js`
- `fruitionforestgarden/scripts/`

The Tecnoagrarian:

- `thetecnoagrarian/src/` - site-specific source code.
- `thetecnoagrarian/package.json` - site package manifest.
- `thetecnoagrarian/Dockerfile`
- `thetecnoagrarian/Dockerfile.dev`
- `thetecnoagrarian/docker-compose.yml`
- `thetecnoagrarian/docker-compose.prod.yml`
- `thetecnoagrarian/ecosystem.config.js`
- `thetecnoagrarian/scripts/`

Both site manifests identify `src/app.js` as the main entry point and depend on `@ffg/blog-core`.

## 5. Docker and Deployment-Related Files

Repository-level Docker/deployment files:

- `docker-compose.yml`
- `docker-compose.prod.yml`
- `docker-compose.local-prod.yml`
- `docker/Dockerfile.prod.site`
- `nginx/blog.conf`

Site-level Docker/deployment files:

- `fruitionforestgarden/Dockerfile`
- `fruitionforestgarden/Dockerfile.dev`
- `fruitionforestgarden/docker-compose.yml`
- `fruitionforestgarden/docker-compose.prod.yml`
- `fruitionforestgarden/ecosystem.config.js`
- `thetecnoagrarian/Dockerfile`
- `thetecnoagrarian/Dockerfile.dev`
- `thetecnoagrarian/docker-compose.yml`
- `thetecnoagrarian/docker-compose.prod.yml`
- `thetecnoagrarian/ecosystem.config.js`

Operational scripts visible by path:

- `start-all-sites.sh`
- `stop-all-sites.sh`
- `restart-all-sites.sh`
- `performance-test.sh`
- `scripts/backup-host.sh`
- `scripts/sync-local-prod.sh`
- `scripts/cleanup-analytics-container.js`
- `scripts/setup-local-admin.js`
- `scripts/setup-backups.sh`
- `scripts/backup.sh`
- `scripts/setup-1password-cli.sh`
- `scripts/reset-tta-password.sh`
- `scripts/cleanup-disk-space.sh`

These scripts were listed only. They were not opened during this inventory pass.

## 6. Test-Related Files

Test configuration and specs:

- `playwright.config.js`
- `tests/README.md`
- `tests/homepage.spec.js`
- `tests/posts.spec.js`
- `tests/forms.spec.js`
- `tests/categories-modal.spec.js`
- `tests/responsive.spec.js`
- `tests/admin.spec.js`
- `tests/cross-browser.spec.js`

Generated or runtime test output:

- `test-results/`
- `test-results.json`
- `playwright-report/`
- `tests/screenshots/`
- `test-run-ffg-production.log`
- `test-run-ffg-test-subdomain.log`
- `test-run-tta.log`

## 7. Documentation Files

Documentation directory entries visible by safe listing:

- `Documents/ANALYTICS_CLEANUP_GUIDE.md`
- `Documents/POST_LAUNCH_CLEANUP.md`
- `Documents/LOCAL_SETUP_QUICKSTART.md`
- `Documents/LOCAL_DOCKER_SYNC_GUIDE.md`
- `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md`
- `Documents/ENVIRONMENT_TEMPLATE.md`
- `Documents/MASTER_PROJECT_DOCUMENTATION.md`
- `Documents/GITHUB_AUTHENTICATION_SETUP.md`
- `Documents/archive/troubleshooting/DIRECTORY_AUTO_CREATION_FIX.md` (historical troubleshooting note)
- `Documents/BACKUP_SYSTEM_GUIDE.md`

Credential-sensitive documentation entries are listed in the sensitive section and were not opened.

## 8. Environment and Template Files by Path Only

Environment files and templates visible from safe listing:

- `.env`
- `.env.local`
- `.env.local.backup`
- `fruitionforestgarden/.env`
- `fruitionforestgarden/.env.backup`
- `fruitionforestgarden/env.example`
- `thetecnoagrarian/.env`
- `thetecnoagrarian/.env.backup`
- `thetecnoagrarian/env.example`
- `Documents/ENVIRONMENT_TEMPLATE.md`

No environment file contents were opened or inspected.

## 9. Sensitive Files by Path Only

Sensitive paths visible from safe listing:

- `.env`
- `.env.local`
- `.env.local.backup`
- `fruitionforestgarden/.env`
- `fruitionforestgarden/.env.backup`
- `thetecnoagrarian/.env`
- `thetecnoagrarian/.env.backup`
- `Documents/SECRETS.md`

These paths were not opened. Their contents should remain out of chat, documentation summaries, commits, diffs, logs, and screenshots unless a future task explicitly approves safe placeholder-only treatment.

## 9A. Reviewed Safe Operational Documentation

The following files were manually reviewed by the user and confirmed to contain dummy credentials, placeholders, or operational workflow notes rather than real secrets:

- `Documents/LOCAL_LOGIN_CREDENTIALS.md`
- `Documents/LOGIN_CREDENTIALS_SUMMARY.md`
- `Documents/1PASSWORD_CURSOR_SETUP.md`
- `Documents/GITHUB_AUTHENTICATION_SETUP.md`
- `scripts/setup-1password-cli.sh`
- `scripts/setup-local-admin.js`
- `scripts/reset-tta-password.sh`

These files may be used as operational context for future documentation tasks, but future summaries should still avoid inventing or exposing real credentials. If a future task finds actual secrets in these files, stop and ask before proceeding.

## 10. Runtime and Generated Folders to Ignore

Likely runtime, generated, dependency, or local-state areas:

- `node_modules/`
- `blog-core/node_modules/` if present in future
- `fruitionforestgarden/node_modules/`
- `thetecnoagrarian/node_modules/`
- `playwright-report/`
- `test-results/`
- `tests/screenshots/`
- `backups/`
- `fruitionforestgarden/backups/`
- `thetecnoagrarian/backups/`
- `fruitionforestgarden/uploads/`
- `thetecnoagrarian/uploads/`
- `.git/`
- `.DS_Store` files
- `*.log`
- `test-results.json`

These should not be treated as source-of-truth application or documentation source without a specific reason.

## 11. Open Questions and Confusing Areas

- There are root-level Docker Compose files and site-level Docker Compose files. Needs review: which files are canonical for local development, production, and local production simulation.
- There are root scripts and site scripts with operational names. Needs review: which are safe day-to-day commands versus deployment, backup, reset, or server-affecting commands.
- Both sites have `uploads/` and `backups/` folders. Needs review: confirm whether these are entirely runtime/local data and should be excluded from source-oriented documentation.
- Credential-adjacent documentation exists under `Documents/`. Needs review: future docs should reference only placeholders, variable names, and safe paths unless explicitly approved.
- Environment templates exist alongside real env files. Needs review: determine whether `env.example` and `Documents/ENVIRONMENT_TEMPLATE.md` are current and non-sensitive before using them as documentation sources.
- Test output and screenshots are present. Needs review: decide whether any generated artifacts should be cleaned, ignored, or archived outside the repo, but do not delete them without explicit approval.
