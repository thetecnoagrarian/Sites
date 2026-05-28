# Architecture Map

This architecture map is based on safe inspection of approved documentation, package manifests, Compose/Docker files, nginx configuration, CI configuration, test files, and non-runtime source files.

Sensitive files, database files, uploads, backups, credential exports, private keys, certificates, and secret values were not opened or reproduced.

## 1. High-Level Architecture

Confirmed: this repository is a two-site Node.js/Express blog platform organized as an npm workspace.

The root workspace contains:

- `blog-core/` - shared blog package, published locally as `@ffg/blog-core`.
- `fruitionforestgarden/` - Fruition Forest Garden site package.
- `thetecnoagrarian/` - The Tecnoagrarian site package.

Confirmed: both site packages depend on `@ffg/blog-core` and use `src/app.js` as their package entry point.

Confirmed: `blog-core/src/app.js` exports `createBlogApp(config)`, which builds a configured Express app from site-provided values such as site name, port, database path, upload path, views path, and public path.

Inferred: the intended architecture is a shared application shell plus site-specific routing, views, static assets, and presentation. The sites share most blog mechanics through `blog-core`, while site folders carry the brand/content-specific layer.

## 2. Top-Level Folder Map

- `blog-core/` - shared Express/blog package. Contains app factory, database initialization, shared models, middleware, and utilities.
- `fruitionforestgarden/` - Fruition Forest Garden site package. Contains site app entry point, routes, views, public assets, middleware, analytics model, scripts, and site-level Docker files.
- `thetecnoagrarian/` - The Tecnoagrarian site package. Contains parallel site app structure, routes, views, public assets, middleware, analytics model, scripts, and site-level Docker files.
- `Documents/` - project documentation and Codex migration documentation.
- `docker/` - shared Docker build assets, including `docker/Dockerfile.prod.site`.
- `nginx/` - nginx reverse-proxy/static-file configuration.
- `scripts/` - repository-level operational scripts. Contents were not inspected for this map unless explicitly allowed elsewhere.
- `tests/` - Playwright end-to-end tests.
- `.github/` - GitHub Actions workflow configuration.

Runtime/generated areas:

- `node_modules/`
- `playwright-report/`
- `test-results/`
- `tests/screenshots/`
- `backups/`
- `fruitionforestgarden/backups/`
- `thetecnoagrarian/backups/`
- `fruitionforestgarden/src/public/uploads/`
- `thetecnoagrarian/src/public/uploads/`
- log files
- SQLite database files
- Docker volumes

## 3. Root Workspace Structure

Confirmed from root `package.json`:

- Workspace name: `blog-workspace`.
- Workspace packages:
  - `blog-core`
  - `fruitionforestgarden`
  - `thetecnoagrarian`
- Runtime expectations:
  - Node.js `>=18.0.0`
  - npm `>=9.0.0`

Important root scripts:

- `build:core` - runs the `blog-core` build script.
- `test:all` - runs tests across workspaces.
- `test:e2e` and related scripts - run Playwright tests.
- `start:ffg` / `start:tta` / `start:all` - start site packages.
- `dev:ffg` / `dev:tta` / `dev:all` - run site development commands.

Operational caution: some scripts start services or run tests. Do not execute them unless the user asks.

## 4. Shared `blog-core` Architecture

Confirmed source files under `blog-core/src/`:

- `blog-core/src/app.js`
- `blog-core/src/index.js`
- `blog-core/src/database/init.js`
- `blog-core/src/database/schema.sql`
- `blog-core/src/middleware/auth.js`
- `blog-core/src/middleware/index.js`
- `blog-core/src/middleware/upload.js`
- `blog-core/src/models/category.js`
- `blog-core/src/models/db.js`
- `blog-core/src/models/index.js`
- `blog-core/src/models/post.js`
- `blog-core/src/models/user.js`
- `blog-core/src/utils/imageProcessor.js`
- `blog-core/src/utils/index.js`
- `blog-core/src/utils/logger.js`

### `blog-core/src/app.js`

Provides `createBlogApp(config)`, the shared Express application factory. Confirmed responsibilities include:

- Express app construction.
- Database initialization.
- SQLite-backed session store.
- Helmet security middleware and CSP configuration.
- Morgan/Pino-style request logging.
- Compression and request body parsing.
- Session setup using `SESSION_SECRET`.
- CSRF token creation and validation.
- Multer upload middleware.
- Static file and upload serving.
- Handlebars setup and shared helpers.
- User attachment middleware.
- Bot-protection and sensitive-path request blocking.
- Rate limiting with environment-controlled settings.
- Health check endpoint.
- Global error handling and final 404 handler setup.

Security note: safe source inspection found environment-specific origins and trusted-IP defaults in shared app code. Values are intentionally not reproduced here. This should be reviewed later as a configuration-boundary issue.

### `blog-core/src/index.js`

Exports the shared app factory, database initializer, models, middleware, and utilities for site packages.

### `blog-core/src/database/`

- `init.js` creates parent directories, opens a SQLite database through `better-sqlite3`, and executes `schema.sql`.
- `schema.sql` defines shared users, posts, categories, post-category relationships, sessions, and update triggers.

Do not inspect SQLite database files. Schema files are source; database files are runtime state.

### `blog-core/src/middleware/`

- `auth.js` provides authentication/admin checks and request-user attachment.
- `upload.js` creates Multer image-upload middleware with image-only filtering and an environment-controlled max file size.
- `index.js` re-exports middleware.

### `blog-core/src/models/`

- `db.js` stores and exposes the initialized database instance.
- `post.js` handles post creation, duplicate-title checks, slug generation, lookup, listing, updates, category links, and JSON image/caption parsing.
- `user.js` handles user lookup, password hashing/verification, updates, and deletion.
- `category.js` handles category CRUD and category-to-post retrieval.
- `index.js` re-exports models.

### `blog-core/src/utils/`

- `imageProcessor.js` processes uploaded images into thumbnail, medium, and large WebP variants.
- `logger.js` provides shared logging.
- `index.js` re-exports utilities.

### Missing or Not Present in `blog-core`

The requested map categories `blog-core/src/controllers/`, `blog-core/src/routes/`, and `blog-core/src/templates/` were not present in safe source listings. Routing, controllers, and views appear to live in the site packages.

Responsibilities that should stay shared:

- Shared Express app factory behavior.
- Shared database connection/model behavior.
- Shared authentication/session primitives.
- Shared upload/image processing primitives.
- Shared security middleware and request handling defaults.
- Shared logging/utilities.

## 5. Site Package Architecture

Both site packages use a common structure:

- `src/app.js`
- `src/admin.js`
- `src/controllers/`
- `src/database/`
- `src/middleware/`
- `src/models/`
- `src/public/`
- `src/routes/`
- `src/scripts/`
- `src/utils/`
- `src/views/`

### Common Site Entry Point: `src/app.js`

Confirmed in both sites:

- Imports `createBlogApp` from `@ffg/blog-core`.
- Loads environment configuration through `dotenv/config`.
- Defines site-specific `siteName`, `port`, `databasePath`, `uploadsPath`, `viewsPath`, and `publicPath`.
- Creates the shared blog app.
- Applies site analytics middleware after database initialization.
- Imports and mounts site routes:
  - `/` for home/public routes.
  - `/` for auth routes.
  - `/admin` for admin routes.
- Registers final 404 handler and starts the HTTP server.

### Routes

Common route files:

- `src/routes/home.js`
- `src/routes/auth.js`
- `src/routes/admin.js`

Confirmed route responsibilities:

- Home/public routes: health check, homepage, about page, category page, search page, and single-post page.
- Auth routes: login and logout.
- Admin routes: dashboard, post/category administration, image upload handling, analytics/admin views, and protected admin workflows.

### Controllers

Common controller file:

- `src/controllers/postController.js`

Confirmed responsibilities:

- Create/update post workflows.
- Required-field checks.
- Image processing through shared `processImage`.
- HTML sanitization with `sanitize-html`.
- Category assignment.
- Cleanup of uploaded files on some error paths.

### Site Database Source

Common files:

- `src/database/init.js`
- `src/database/schema.sql`

Confirmed: these are source schema/init files, not runtime database contents.

Potential mismatch: site schema files define posts with `body`, while `blog-core/src/database/schema.sql` defines posts with `content`. The active models/routes inspected appear to use `body`. This should be reviewed before relying on the shared schema as canonical.

Potential mismatch: site schema files define a user password column named `password`, while shared user model/auth code expects `password_hash`. This should be reviewed without inspecting runtime database files.

### Site Middleware

Common middleware files:

- `auth.js`
- `roleGuard.js`
- `upload.js`
- `analytics.js`
- `isAuthenticated.js`
- `ogTags.js`

Confirmed responsibilities include authentication helpers, upload handling, analytics tracking, and Open Graph/Twitter metadata generation.

### Site Models

Common model files:

- `database.js`
- `user.js`
- `db.js`
- `post.js`
- `analytics.js`
- `category.js`

Confirmed: site analytics models create/read analytics tables using the shared database instance. Fruition Forest Garden has additional all-time analytics aggregate tables compared with the inspected The Tecnoagrarian analytics model.

### Static Assets and Views

Common public source folders:

- `src/public/css/`
- `src/public/js/`
- `src/public/images/`

Common view folders:

- `src/views/layouts/`
- `src/views/posts/`
- `src/views/auth/`
- `src/views/admin/`
- top-level page templates such as home, about, search, category, error, 404, and 500 pages.

### Important Site Differences

Confirmed differences visible from safe inspection:

- Fruition Forest Garden has `src/utils/heroImageProcessor.js` and an admin hero-image view, suggesting site-specific hero image management.
- Fruition Forest Garden public images include `HeroCamp` assets and favicon subfolder assets.
- The Tecnoagrarian has `src/database/seed.js`.
- The Tecnoagrarian Open Graph logic uses hardcoded production-domain tags, while Fruition Forest Garden Open Graph logic can derive a base URL from the request and has hero-image fallback logic.
- Admin route behavior differs in details such as upload count/size messaging, layout handling, and hero-image workflows.
- `src/admin.js` files exist and use CommonJS-style imports, while the package manifests declare ES modules and the active `src/app.js` files mount `src/routes/admin.js`. Inferred: `src/admin.js` may be legacy or unused, but this needs review.

## 6. Request and Runtime Flow

Confirmed and inferred request flow:

1. External request reaches nginx or another reverse proxy.
2. nginx proxies to the relevant site service/container or serves selected static paths directly.
3. Docker Compose maps the site service to its configured port.
4. The site `src/app.js` starts an Express app through `createBlogApp(config)`.
5. Shared middleware handles security headers, sessions, CSRF, parsing, static files, uploads, bot protection, rate limiting, and user attachment.
6. Site-specific middleware adds analytics tracking.
7. Site routes handle public, auth, and admin requests.
8. Routes/controllers call shared `@ffg/blog-core` models and utilities.
9. Models use the initialized SQLite database connection.
10. Views render Handlebars templates from the site `src/views/` folder.
11. Static source assets come from `src/public/`; runtime uploads are served from the configured upload path.

Inferred: production traffic likely flows through nginx/reverse proxy to Dockerized site containers, while local flows may use direct localhost ports or local Compose networking depending on the selected workflow.

## 7. Database and Runtime State

Schema/init source files:

- `blog-core/src/database/schema.sql`
- `blog-core/src/database/init.js`
- `fruitionforestgarden/src/database/schema.sql`
- `fruitionforestgarden/src/database/init.js`
- `thetecnoagrarian/src/database/schema.sql`
- `thetecnoagrarian/src/database/init.js`
- `thetecnoagrarian/src/database/seed.js`

Runtime database files:

- Any `*.db`, `*.sqlite`, or `*.sqlite3` file is runtime state and must not be opened for documentation mapping.

Production volume concept from `docker-compose.prod.yml`:

- Fruition Forest Garden uses a named data volume mounted at `/app/data` and a named logs volume mounted at `/app/logs`.
- The Tecnoagrarian uses a named data volume mounted at `/app/data` and a named logs volume mounted at `/app/logs`.
- The app-level `DATABASE_PATH` points under `/app/data`.
- The app-level `UPLOADS_PATH` points under `/app/data/uploads`.

Runtime state:

- SQLite databases.
- Uploads.
- Logs.
- Backups.
- Session rows.
- Analytics rows.
- Docker volumes.

These are operational data, not source files.

## 8. Static Assets and Uploads

Source static assets:

- `fruitionforestgarden/src/public/css/`
- `fruitionforestgarden/src/public/js/`
- `fruitionforestgarden/src/public/images/`
- `thetecnoagrarian/src/public/css/`
- `thetecnoagrarian/src/public/js/`
- `thetecnoagrarian/src/public/images/`

Runtime/user-generated uploads:

- `fruitionforestgarden/src/public/uploads/`
- `thetecnoagrarian/src/public/uploads/`
- production `/app/data/uploads`

Treat `src/public/uploads/` as runtime/user-generated data even though it lives below `src/public/`. Do not inspect or summarize upload contents unless explicitly approved for a specific task.

## 9. Docker and Deployment Architecture

### Shared Production Dockerfile

Confirmed: `docker/Dockerfile.prod.site` is a shared, parameterized multi-stage Dockerfile.

Build arguments:

- `SITE_DIR_NAME`
- `SITE_PORT`

Confirmed behavior:

- Uses a Node Alpine builder stage.
- Installs production dependencies with workspaces.
- Rebuilds Sharp for Alpine compatibility.
- Copies `blog-core/src` and the selected site `src`.
- Creates `/app/data/database`, `/app/data/uploads`, `/app/logs`, `/app/backups`, and `/app/scripts`.
- Copies selected operational scripts into the image.
- Creates a non-root runtime user.
- Sets the working directory to the selected site.
- Starts `node src/app.js`.

### Production Compose

Confirmed: `docker-compose.prod.yml` defines two services:

- `fruitionforestgarden`
- `thetecnoagrarian`

Both services:

- Build from `docker/Dockerfile.prod.site`.
- Pass site-specific build args.
- Use production environment settings.
- Reference `.env` as an env file without exposing its contents.
- Define named data and log volumes.
- Expose site-specific ports.
- Join a production network.
- Define HTTP health checks.

### Local Development Compose

Confirmed: `docker-compose.yml` defines two development-oriented services with site-specific development Dockerfiles, bind mounts for shared/site code, local database/upload bind mounts, local log volumes, and development-oriented ports.

Open question: `docker-compose.yml` uses `UPLOAD_PATH`, while the inspected site app code reads `UPLOADS_PATH`. This may be harmless if defaults are intended, or it may be a configuration mismatch.

### Local Production-Like Compose

Confirmed: `docker-compose.local-prod.yml` builds from the shared production Dockerfile, uses production-like ports/settings, but keeps bind mounts for local code/data and uses `.env.local`.

Open question: confirm whether this is now the preferred local verification workflow.

### Nginx

Confirmed: `nginx/blog.conf` defines upstreams for both site services, redirects HTTP to HTTPS, configures SSL certificate paths, proxies application requests, and aliases static paths for CSS, JS, images, and uploads.

Do not inspect certificate files or private keys.

### Workflow Review Needed

Root-level Compose files and site-level Docker/Compose files coexist. The canonical workflow for local development, local production-like testing, and production deployment should be clarified in `Documents/DEPLOYMENT_RUNBOOK.md`.

## 10. Testing and CI

Confirmed Playwright files:

- `tests/homepage.spec.js`
- `tests/posts.spec.js`
- `tests/forms.spec.js`
- `tests/categories-modal.spec.js`
- `tests/responsive.spec.js`
- `tests/admin.spec.js`
- `tests/cross-browser.spec.js`
- `tests/README.md`
- `playwright.config.js`

Confirmed test configuration:

- Test directory is `tests/`.
- Default base URL is local The Tecnoagrarian unless overridden by `TEST_URL`.
- Projects include Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.
- Reporters include HTML, list, and JSON output.
- Screenshots/videos/traces can be generated on failures or retries.

Confirmed CI file:

- `.github/workflows/ci-cd.yml`

Visible CI behavior:

- Runs on push and pull request to `main`.
- Sets up Node.js 20.
- Installs dependencies.
- Attempts linting for `@ffg/blog-core`, tolerating missing lint script.
- Installs Chromium for Playwright.
- Attempts `blog-core` unit tests, tolerating no tests.
- Runs Chromium E2E tests against a configured test URL and continues on error.
- Runs `npm audit` for `@ffg/blog-core` and continues on error.
- Verifies production Compose YAML syntax.
- Does not perform automatic production deployment in the visible workflow.

Do not overstate coverage: CI contains test and audit steps, but several are explicitly tolerant of failure or missing scripts.

## 11. Security and Safety Architecture

Visible security concepts from safe source/docs:

- Helmet security headers and CSP in `blog-core/src/app.js`.
- Express sessions backed by SQLite.
- Session secret read from environment variable.
- CSRF token generation/validation.
- Admin route protection with authentication/admin middleware.
- Password hashing with bcrypt in shared `User` model.
- Multer image-only upload filtering.
- File-size limits controlled by environment/defaults.
- Image processing with Sharp.
- `sanitize-html` in site post controllers.
- Rate limiting through `express-rate-limit`.
- Trusted-IP bypass logic driven by environment/defaults.
- Bot-pattern and sensitive-path request blocking.
- Production cookies marked secure when `NODE_ENV=production`.
- Placeholder-based env handling in documentation.

Do not document, print, or inspect actual secret values. Environment names and placeholder examples are acceptable.

Architecture concern for later review: safe source inspection found deployment-specific origins and trusted-IP defaults in source. Replace or document these through placeholder-based configuration in a later security/environment pass; do not reproduce the values here.

## 12. Architecture Boundaries for Future Codex Work

Make shared changes in:

- `blog-core/src/app.js` for shared app/middleware behavior.
- `blog-core/src/models/` for shared post/user/category data behavior.
- `blog-core/src/database/` for shared schema/init behavior, after resolving schema mismatches.
- `blog-core/src/middleware/` for shared auth/upload middleware.
- `blog-core/src/utils/` for shared logging/image utilities.

Make site-specific changes in:

- `fruitionforestgarden/src/routes/`
- `fruitionforestgarden/src/controllers/`
- `fruitionforestgarden/src/views/`
- `fruitionforestgarden/src/public/css/`
- `fruitionforestgarden/src/public/js/`
- `fruitionforestgarden/src/public/images/`
- `fruitionforestgarden/src/middleware/` and `src/utils/` when behavior is truly site-specific.
- Equivalent `thetecnoagrarian/src/` paths for The Tecnoagrarian.

Avoid runtime state:

- SQLite database files.
- Uploads.
- Backups.
- Logs.
- Generated test artifacts.
- Docker volumes.
- `node_modules/`.

Requires explicit user approval:

- Deployment, rollback, production restart, or server modification.
- Docker commands.
- Installs, dependency remediation, or `npm audit fix`.
- Database migration or runtime database inspection.
- Deleting, moving, pruning, resetting, or overwriting files/data.
- Git staging, committing, or history rewriting.
- Reading or reproducing secret values.

## 13. Open Questions

- Which Compose file is canonical for local development, local production-like testing, and production deployment?
- Do site-level Docker/Compose files remain current, or are root-level Compose files authoritative?
- Should `docker-compose.yml` use `UPLOADS_PATH` instead of `UPLOAD_PATH`, or is the current default-path behavior intentional?
- Is `fruitionforestgarden/src/app.js` default port `3001` intentional when root local Compose maps the service to port `3000` through environment?
- Which schema is canonical: `blog-core/src/database/schema.sql` or the site-level schema files?
- Should the `posts` table use `content` or `body` across all source schema/model code?
- Should the users table use `password_hash` or `password` across all schema/model/auth code?
- Are `fruitionforestgarden/src/admin.js` and `thetecnoagrarian/src/admin.js` legacy files, or are they used by another entry point?
- How much duplicated route/controller/model/middleware code should be moved into `blog-core`?
- Should Fruition Forest Garden hero-image management stay site-specific or become a shared optional feature?
- Should The Tecnoagrarian `src/database/seed.js` be documented as source setup, historical utility, or runtime-adjacent script?
- Should dependency/security remediation wait until documentation, architecture mapping, and environment/secrets mapping are complete?
- Should generated artifacts and runtime folders be cleaned or ignored later? Do not perform cleanup without explicit approval.
- Safe source inspection found deployment-specific origins and trusted-IP defaults in source. Should those move to environment-driven configuration?
- CI currently tolerates some test/audit failures. Is that intended for migration, or should hard failure be introduced later?
