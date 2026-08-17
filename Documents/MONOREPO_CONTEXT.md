# Monorepo Context

This file captures safe, high-level context for future Codex work in this repository.
It is based on `AGENTS.md`, `Documents/REPO_INVENTORY.md`, reviewed-safe operational documentation, package manifests, and Docker/Compose files. Secret values were not inspected or reproduced.

## 1. Purpose of the Monorepo

This repository exists to support two related Node.js blog platforms:

- Fruition Forest Garden
- The Tecnoagrarian

The root `package.json` describes the repository as a private npm workspace for blog sites powered by `blog-core`. `AGENTS.md` confirms that the repo contains site-specific code, shared blog-core code, Docker/deployment files, scripts, tests, and operational documentation.

Both sites live together so shared blog functionality, operational patterns, tests, Docker configuration, and documentation can be maintained in one coordinated repo rather than duplicated across separate projects.

The shared operational goal appears to be:

- Maintain two separate blog sites.
- Reuse shared application behavior through `blog-core`.
- Keep deployment, backup, testing, and documentation workflows consistent.
- Preserve enough documentation for safe Codex-assisted maintenance without relying on hidden Cursor context or secret-bearing files.

## 2. Relationship Between the Two Sites

### What Appears Shared

Confirmed shared areas:

- Root npm workspace configuration.
- `blog-core/` package.
- Docker production image pattern through `docker/Dockerfile.prod.site`.
- Production Compose pattern through `docker-compose.prod.yml`.
- Local production-like Compose pattern through `docker-compose.local-prod.yml`.
- Playwright end-to-end test infrastructure.
- Operational documentation under `Documents/`.
- Backup, deployment, and local workflow concepts.

Both site manifests depend on `@ffg/blog-core` version `0.1.0`, use Node.js `>=18.0.0`, and identify `src/app.js` as the site entry point.

### What Appears Site-Specific

Confirmed site-specific areas:

- `fruitionforestgarden/src/`
- `thetecnoagrarian/src/`
- Site package manifests.
- Site Dockerfiles for development.
- Site-level Compose files.
- Site runtime data areas such as uploads, backups, logs, and databases.
- Site identity, content, public assets, and route-level behavior.

Inferred: shared behavior such as application wiring, rendering conventions, authentication/session support, upload handling, image processing, SQLite integration, and security middleware likely belongs in `blog-core`, while brand/content-specific pages, templates, public assets, and site-specific app configuration likely belong under each site folder.

### Visible Differences in Purpose or Status

From safe documentation:

- The Tecnoagrarian is described as a blog about technology and agriculture and is documented as production live.
- Fruition Forest Garden is described as a separate blog site and is documented as preparing for launch, with a production-like/test workflow visible in the docs.

Needs review: current launch status should be refreshed before making public-facing claims, because status documentation can drift.

## 3. Shared `blog-core` Role

`blog-core` is the shared package for blog functionality. Its manifest describes it as `@ffg/blog-core`, with `src/index.js` as its main entry point and ES modules enabled.

Visible dependency themes indicate that shared code may provide or coordinate:

- Express application behavior.
- Handlebars rendering.
- Session handling.
- SQLite access.
- File uploads.
- Image processing.
- Security middleware.
- Request logging.
- CSRF protection and rate limiting.
- Slug generation and common blog utilities.

Both site packages depend on this shared package and add only a small site-specific dependency set in their manifests. This suggests future changes should first determine whether behavior is truly shared or site-specific before editing:

- Shared cross-site blog behavior belongs in `blog-core`.
- Site identity, content, assets, and per-site presentation belong in the site package.
- Deployment and runtime wiring belongs in Compose, Docker, scripts, or operational docs.

## 4. Operational Model

### Local Development Concept

The root workspace exposes development scripts for both sites individually and together. The reviewed-safe local docs describe two local approaches:

- A non-Docker development flow through npm scripts.
- A Docker-based local production-like flow using `docker-compose.local-prod.yml`.

The development Compose file `docker-compose.yml` uses site-specific development Dockerfiles, local bind mounts, development-oriented ports, and live source mounting.

### Production Deployment Concept

Production is documented as Docker Compose based. The production Compose file builds both site services with `docker/Dockerfile.prod.site`, passes the site directory and port as build arguments, uses named volumes for runtime data/logs, and defines health checks.

Deployment affects live services and must remain explicitly user-approved. Codex should not deploy, restart production services, run remote commands, alter server state, or run Docker commands unless the user asks for that specific action.

### Docker and Compose Role

The Docker model appears to have three layers:

- `docker-compose.yml` for local development.
- `docker-compose.local-prod.yml` for local production-like testing with bind mounts.
- `docker-compose.prod.yml` for production-style services with named volumes.

`docker/Dockerfile.prod.site` is a shared multi-stage production Dockerfile parameterized by site directory and site port. It installs production dependencies, copies shared and site source, creates runtime directories, configures a non-root user, and runs the selected site app.

Needs review: the canonical relationship among root-level and site-level Compose files should be documented in a future deployment runbook.

### Runtime State

Runtime/generated state should not be treated as source:

- SQLite databases.
- Upload directories.
- Backup directories.
- Logs.
- Playwright reports and test results.
- `node_modules/`.
- Docker volumes.

These areas may be important for operations and recovery, but they should not be read, summarized, modified, deleted, or committed casually.

### Documentation as Source of Truth

`AGENTS.md` identifies `Documents/` and `AGENTS.md` as the primary documentation areas. The former broad master document is archived at `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md` for historical context and is not current operational authority. For Codex migration work, documentation should be created under `Documents/`.

Documentation should preserve workflows, architectural context, and safety boundaries without exposing secrets. If docs conflict with code, record the conflict instead of guessing.

## 5. Codex Working Context

Before editing, Codex should understand:

- This is a two-site monorepo with a shared package.
- Shared behavior and site-specific behavior should not be mixed casually.
- Documentation tasks should not modify application code.
- Deployment and Docker operations affect live or runtime environments and need explicit approval.
- Secrets are unnecessary for normal documentation, architecture mapping, linting, testing, and refactoring.

Generally safe to inspect for documentation and architecture tasks:

- `AGENTS.md`
- `Documents/REPO_INVENTORY.md`
- Non-sensitive documentation under `Documents/`
- Root and workspace package manifests
- `blog-core/src/`
- Site `src/` trees, when the task calls for code inspection
- Docker and Compose files, with deployment caution
- Test specs and test configuration

Areas requiring caution or path-only treatment:

- `.env` and `.env.*`
- `Documents/SECRETS.md`
- Credential/login notes unless explicitly reviewed-safe for the exact task
- Private keys, certificates, SSH configuration, and credential exports
- Databases
- Uploads
- Backups
- Logs and generated test artifacts
- Server-specific operational details

Codex should not do without explicit approval:

- Deploy, roll back, restart production, or modify server state.
- Run Docker commands.
- Run installs, dependency remediation, or `npm audit fix`.
- Delete, move, reset, prune, or overwrite files/data.
- Commit, stage, or rewrite Git history.
- Read or reproduce real secret values.
- Convert placeholder examples into live operational claims.

## 6. Migration Relevance

This file supports the Cursor to Codex migration by turning scattered repo knowledge into a stable, inspectable context document.

It preserves:

- Why the repository is a monorepo.
- How the two sites relate.
- What `blog-core` is for.
- How local, local-production-like, and production Docker concepts differ.
- Which areas are source, runtime state, or sensitive.
- What future Codex sessions should avoid unless explicitly approved.

Future Codex sessions should read this file early, after `AGENTS.md`, when working on architecture, documentation, deployment runbooks, environment mapping, or multi-site refactors.

## 7. Open Questions

- Which Compose file is canonical for each workflow: local development, local production-like testing, production deployment, and site-specific standalone operation?
- Do the site-level Compose files remain current, or are root-level Compose files now authoritative?
- Which operational scripts are safe for routine local use, and which are deployment, backup, reset, or server-affecting commands?
- Which reviewed-safe operational docs should be treated as current source of truth versus historical notes?
- Is Fruition Forest Garden still in the documented pre-launch/test state, or has that status changed?
- Should dependency/security remediation be a later phase after documentation, architecture mapping, and workflow documentation are complete?
- Should generated artifacts and runtime folders be cleaned, ignored, or archived outside the repo? Do not perform cleanup without explicit approval.
