# Deployment Runbook

This runbook documents deployment concepts, operator checkpoints, and safe handling rules for the Fruition Forest Garden and The Tecnoagrarian monorepo.

It does not contain secrets. Real server users, server IPs, trusted IP allowlists, private keys, certificate contents, passwords, tokens, and live credential material must stay out of this file. Use placeholders such as `[SERVER_IP]`, `[SSH_USER]`, `[DOMAIN]`, `[SERVICE_NAME]`, `[CONTAINER_NAME]`, `[SESSION_SECRET]`, `[TRUSTED_IPS]`, `[DATABASE_PATH]`, and `[UPLOADS_PATH]`.

No deployment, Docker, SSH, SCP, rsync, backup restore, prune, reset, delete, or destructive command should be run unless the user explicitly approves that specific action.

## 1. Purpose and Safety Boundary

This runbook is for:

- Understanding the deployment model.
- Choosing the right deployment-related files.
- Preparing safe preflight checks.
- Separating local development, local production-like testing, and production deployment.
- Documenting high-risk actions before anyone runs them.

This runbook is not:

- A source of secrets.
- A replacement for explicit operator approval.
- Proof that any production action is safe to run.
- A live deployment procedure with real access details.

Deployment affects live sites. Treat production commands as approval-required even when they appear in historical docs or scripts.

## 2. Deployment Model Overview

Confirmed: the repository is a two-site Node.js/Express blog monorepo using a shared `blog-core` package.

Confirmed production model from safe files:

- Two site services:
  - Fruition Forest Garden.
  - The Tecnoagrarian.
- Shared production image pattern through `docker/Dockerfile.prod.site`.
- Root production Compose file at `docker-compose.prod.yml`.
- Site services use Docker named volumes for runtime data and logs.
- Environment variables are supplied through Compose and an env file path.
- nginx is configured as a reverse proxy and static-file front end.
- Backups are intended to cover runtime database and uploads data.

Canonical change workflow:

1. ChatGPT planning.
2. Codex implementation.
3. Risk-appropriate local checks.
4. Isolated Docker verification when required.
5. Git review and commit.
6. GitHub CI.
7. Explicit manual production deployment approval and execution.
8. Live verification.

GitHub is source control plus advisory CI. Pushing to GitHub does not deploy production; deployment remains manual and operator-controlled.

Live production use was verified on 2026-08-24 at `/opt/Sites` with the root `docker-compose.prod.yml` and the standalone `docker-compose` command. Service names must still be taken from the checked-in Compose file and confirmed for each approved deployment.

## 3. Canonical Deployment Files

### `docker-compose.prod.yml`

Purpose:

- Defines production-style services for both sites.
- Builds each service from `docker/Dockerfile.prod.site`.
- Passes site-specific build args.
- Uses `.env` as an env file path.
- Sets production environment variables.
- Defines named data and log volumes.
- Defines service health checks.

Live production use:

- The root file is the verified production Compose file as of 2026-08-24.
- The standalone `docker-compose` command is installed on the production host.
- Confirm the exact target service from this file before every deployment.

### `docker-compose.local-prod.yml`

Purpose:

- Defines local production-like services.
- Uses the shared production Dockerfile.
- Uses `.env.local` by path only.
- Uses bind mounts for local code/data.
- Uses production-like ports/settings with local-friendly logging/rate limits.

Useful for:

- Testing production-like image/build behavior locally.
- Finding Dockerfile or runtime-path issues before production.

Needs Review:

- Confirm this is the preferred local production-like workflow.

### `docker-compose.yml`

Purpose:

- Defines local development-oriented services.
- Uses site-specific development Dockerfiles.
- Uses bind mounts for shared and site code.
- Maps local development ports.

Needs Review:

- `docker-compose.yml` uses `UPLOAD_PATH`, while source and production Compose use `UPLOADS_PATH`.
- Confirm whether root local Compose or site-level Compose files are canonical for local development.

### `docker/Dockerfile.prod.site`

Purpose:

- Shared parameterized multi-stage production Dockerfile.
- Uses build args `SITE_DIR_NAME` and `SITE_PORT`.
- Installs production workspace dependencies.
- Installs production dependencies with optional native packages enabled so npm selects the matching Sharp package for the build platform.
- Copies `blog-core/src` and selected site `src`.
- Creates runtime directories for data, uploads, logs, backups, and scripts.
- Runs the selected site app as a non-root user.

Runtime note:

- Docker build and runtime stages use the official immutable `node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995` multi-architecture image.
- The production-style builder pins npm to `11.19.0`, whose declared Node support includes Node 24. Do not replace the pin with `npm@latest`; reassess the exact npm pin together with future Node runtime migrations.
- Active package engines require Node `>=24.0.0 <25`.
- Local Linux musl ARM64 Mode B, emulated Linux musl AMD64, and the permanent native Linux AMD64 deployment-candidate gate passed. Both production services subsequently passed live Node 24 runtime, native-addon, database, health, rendering, and log verification.

### Native AMD64 Deployment-Candidate Gate

`.github/workflows/native-amd64-validation.yml` is the permanent native Linux AMD64 technical gate for runtime migrations and other deployment candidates that affect native dependencies. It runs only through manual `workflow_dispatch` on an explicit full 40-character application commit SHA. The workflow definition may live at a newer revision while its checkout and revision assertion validate the exact requested candidate.

The gate uses a standard GitHub-hosted Ubuntu x64 runner, read-only repository contents permission, the isolated `sites-local-test` project, and `docker-compose.test.yml`. It performs fresh production-style builds, proves native AMD64 runtime and package selection, exercises better-sqlite3 and Sharp directly, starts both Mode B sites with synthetic fixtures, runs authenticated regressions and targeted Chromium lifecycle coverage, checks database integrity, reviews native failure signatures, and always removes its disposable Compose resources.

The workflow does not use production Compose, production secrets, production data, deployment permissions, or a deployment step. A passing result is technical evidence that the selected commit cleared the native AMD64 deployment-candidate gate. It does not authorize or perform production deployment; owner approval and the normal deployment workflow remain separately required.

### Node 24 Production Migration Closure

Verified on 2026-08-24:

- Final production Git SHA: `c4fdb37e3762e3f4835b155a68e0fd0ca319e6bf`.
- Fruition Forest Garden image: `sha256:f7eb6f613bdecdbed169bed22bdc8110edae0e21027ec915297fc530a547b0d9`.
- The Tecnoagrarian image: `sha256:26303c47ffaac3881f361b582240dd7c98aba53948dc063cbe2f766a51dde883`.
- Both production services run Node `24.19.0` on Linux x64 with ABI `137` and Alpine `3.23.5`.
- The Tecnoagrarian closure audit loaded `better-sqlite3@12.11.1` with SQLite `3.53.2` and Sharp `0.35.3` with libvips `8.18.3`; real in-memory SQLite and Sharp transformation probes passed.
- Both services were healthy with zero restarts. Public health checks passed, and The Tecnoagrarian homepage, single-image detail rendering, multi-image carousel rendering, and sampled image assets returned successful results.
- The Tecnoagrarian database returned `ok` from `PRAGMA integrity_check`, no rows from `PRAGMA foreign_key_check`, `posts.body` remained `TEXT`, and the legacy `posts.content` column remained absent.
- Automated deployment verification passed. The owner subsequently confirmed authenticated create/read/update/delete behavior manually.
- The rollback images listed in Section 10 remained present. No image pruning, backup deletion, schema migration, or production-data repair was part of the rollout.

Two latent application-template defects were discovered during the staged rollout:

- Fruition Forest Garden's single-image detail branch incorrectly treated the normalized image array as a single object. Commit `fc112a478e0e0db349729fa717ff647d37a7d721` corrected the branch and added zero-, one-, and multi-image regression coverage.
- The Tecnoagrarian had the same site-local defect. Commit `c4fdb37e3762e3f4835b155a68e0fd0ca319e6bf` applied the corresponding fix and regression coverage.
- Both were application rendering defects, not Node 24 runtime regressions. Healthy containers, native dependency probes, and database checks could not detect them; the site-by-site canary rollout plus rendered-page and owner verification did.

The validated access chain is high level by design: Codex reaches the local 1Password SSH agent, connects through a non-sensitive SSH host alias with agent forwarding, and uses the forwarded GitHub identity for read-only repository authorization before an explicitly approved deployment. Real host addresses, usernames, key paths, fingerprints, passphrases, tokens, and SSH configuration contents must not be recorded here.

Deferred security, dependency, OS-maintenance, backup/restore, and cleanup work remains in its existing workstreams. None is part of the completed Node 24 migration.

### `nginx/blog.conf`

Purpose:

- Defines upstreams for both site services.
- Redirects HTTP to HTTPS.
- Proxies app requests to site services.
- Aliases static CSS, JS, images, and uploads.
- References certificate paths.

Safety:

- Do not inspect certificate files or private keys.
- Use `[DOMAIN]` and `[CERT_PATH]` placeholders in docs.

Needs Review:

- Confirm whether this checked-in nginx file matches current production nginx configuration.

### `.dockerignore`

Purpose:

- Excludes runtime and development-only files from Docker build context.

Confirmed exclusions include:

- Backups.
- Database files.
- Logs.
- SQLite files.
- `node_modules`.
- Git metadata.
- most documentation.
- tests and generated test output.
- env files.
- uploads.
- Docker/Compose files.
- IDE files.

Needs Review:

- Confirm whether site-level `.dockerignore` files differ from root `.dockerignore`.

### `.github/workflows/ci-cd.yml`

Purpose:

- Defines CI checks for push and pull request to `main`.
- Installs dependencies.
- Attempts lint/unit/E2E/audit steps.
- Verifies production Compose YAML syntax.
- Contains a placeholder manual-deploy step rather than active production deployment.

CI caution:

- Some test/audit steps tolerate failure or missing scripts.
- Do not treat CI passing as deployment approval.

### Relevant Scripts

- `scripts/backup.sh` - creates one verified database/uploads set in an explicit temporary staging directory; it does not retain or delete backup history.
- `scripts/backup-host.sh` - host-side orchestration for both containers, exact-set transfer and verification, temporary staging cleanup after successful copy, and retention of the new host-managed set layout.
- `scripts/setup-backups.sh` - legacy backup setup helper that involves SSH/SCP/cron concepts. It is not part of the new-flow rollout and must not be rerun without separate review and approval.
- `scripts/sync-local-prod.sh` - local production-like Docker sync helper. Approval required before execution because it stops/builds/starts containers.
- `scripts/cleanup-disk-space.sh` - server disk cleanup helper. High risk; approval required before execution.
- `scripts/cleanup-analytics-container.js` - analytics retention cleanup script that modifies database rows. High risk; approval required before execution.
- `start-all-sites.sh` - local Docker start helper. Approval required before execution.
- `stop-all-sites.sh` - local Docker stop helper. Approval required before execution.
- `restart-all-sites.sh` - local Docker restart helper. Approval required before execution.

## 4. Local Development Workflow

Confirmed local development concepts:

- Root `package.json` has npm scripts for starting or developing each site and both sites together.
- `docker-compose.yml` defines two development-oriented services.
- Local development Compose uses bind mounts for `blog-core/` and the site package directories.
- Runtime data is mounted into local folders and/or local Docker volumes depending on the service configuration.

Local development service shape:

- Fruition Forest Garden local service maps to a local port.
- The Tecnoagrarian local service maps to a local port.
- Each service mounts shared code and site code.
- Each service has local data/upload/log behavior.

Example only / do not run without approval:

```bash
# Local service start, stop, restart, and Docker Compose commands are approval-required.
docker compose -f docker-compose.yml up --build -d [SERVICE_NAME]
docker compose -f docker-compose.yml down
```

Needs Review:

- `UPLOAD_PATH` vs `UPLOADS_PATH`.
- Fruition Forest Garden local port differences across scripts, source defaults, and Compose.
- Whether root local Compose or site-level Compose files should be the default operator path.

## 5. Local Production-Like Workflow

Confirmed from `docker-compose.local-prod.yml`:

- Uses `docker/Dockerfile.prod.site`.
- Uses build args for each site.
- Uses `.env.local` by path only.
- Uses production-like ports.
- Uses bind mounts for local code and runtime data.
- Uses local-friendly log level and higher local rate-limit settings.
- Defines health checks.

How it differs from ordinary local development:

- It uses the shared production Dockerfile rather than site development Dockerfiles.
- It more closely matches production ports and runtime layout.
- It still uses local bind mounts and local env file path.

How it differs from real production:

- It uses `.env.local`, not `.env`.
- It uses bind mounts rather than production named data volumes for code/data.
- It is local-only and should not be treated as proof production is safe.

Useful for:

- Testing Docker build behavior.
- Testing production-like environment variables.
- Finding path, volume, and image-processing issues before deployment.

Example only / do not run without approval:

```bash
docker compose -f docker-compose.local-prod.yml up --build -d
docker compose -f docker-compose.local-prod.yml logs -f [SERVICE_NAME]
docker compose -f docker-compose.local-prod.yml down
```

### Verification Classes

Choose the smallest verification class proportionate to the change:

- **Git checks only:** documentation, non-rendered planning files, and similarly low-risk changes. Use status, focused diffs, and whitespace checks.
- **Lightweight local verification:** literal content or template copy, narrow static assets, and minor CSS or public-JavaScript changes that do not materially alter runtime behavior. Use focused lint, syntax, render, or browser checks as appropriate.
- **Isolated Docker verification:** application/runtime code, shared `blog-core`, routes, structural templates/layout, authentication or middleware, CSP/security headers, analytics, dependencies, Docker/build behavior, uploads/static serving, and significant frontend/layout changes.

### Isolated Local Test Harness

The isolated harness has two modes:

- `docker-compose.test.yml` is **Mode B**, the final local production-like gate. It builds both applications from `docker/Dockerfile.prod.site`, uses `NODE_ENV=production`, and contains no application source-code bind mounts.
- `docker-compose.test.dev.yml` is **Mode A**, the fast iteration override. Use it together with the base file. It sets `NODE_ENV=test` and mounts only `blog-core/src` plus the selected site `src` read-only. Relevant shared or application JavaScript changes may require a controlled container restart; no watch tooling is included.

Local endpoints are limited to:

- Fruition Forest Garden: `http://127.0.0.1:4000`
- The Tecnoagrarian: `http://127.0.0.1:4002`

Both modes retain dedicated Compose-managed `ffg_test_*` and `tta_test_*` data/log volumes. They must never use existing local or production databases, uploads, logs, backups, or other runtime data. The one-shot fixture services wait for each application health check, then apply `tests/fixtures/local-test-seed.sql` to that site's fresh test database. The fixture is synthetic and idempotent; successful completion is required before route/search verification.

Docker commands remain approval-required. After approval, use the base file alone for Mode B or layer the development override for Mode A:

```bash
# Mode B: final local production-like gate
docker compose -f docker-compose.test.yml up --build -d

# Mode A: fast iteration override
docker compose -f docker-compose.test.yml -f docker-compose.test.dev.yml up --build -d
```

Before route or search checks, use the same Compose file set with `ps --all`: both application services must report healthy and both one-shot fixture services must have exited successfully with status `0`.

The first isolated harness does not cover:

- nginx;
- TLS;
- HTTP-to-HTTPS redirects;
- non-www-to-www redirects;
- secure-cookie behavior over HTTPS;
- production proxy/client-IP behavior;
- edge caching.

These remain live post-deployment checks unless a separate edge-testing profile is intentionally created later.

### Permanent Downloadable Assets

Permanent site-specific public assets should normally live under the appropriate site public tree:

- `fruitionforestgarden/src/public`
- `thetecnoagrarian/src/public`

The existing `express.static()` setup serves these directories at the site URL root. For example, `src/public/downloads/example.pdf` maps to `/downloads/example.pdf` for that site. The production Docker build copies these public trees into the image, so committing or pushing an asset does not make it live by itself: Mode B can prove that the candidate production-like image contains and serves it, but production must still be rebuilt/recreated and verified live.

`/uploads` remains the writable runtime-upload path. It is appropriate for runtime uploads, but it is not the preferred location for permanent downloadable assets that should be reproducible after a fresh build from repository state.

Use this normal verification sequence for a permanent downloadable asset:

1. Place it under the appropriate site `src/public` tree.
2. Verify it locally as appropriate.
3. Use Mode B as the definitive local production-like check.
4. Confirm the expected URL returns HTTP `200`.
5. Confirm the expected MIME type.
6. Confirm byte integrity or a checksum when the file is important or duplicated across sites.
7. Commit and push the verified asset.
8. Manually deploy and rebuild/recreate the production service with explicit approval.
9. Verify the live URL and response headers.

For PDFs, normal in-browser display is acceptable when a forced `Content-Disposition: attachment` response is not required.

Shared `blog-core` participates in static-serving behavior but does not currently provide a shared public-assets directory. Using one repository copy across sites would require an intentional architecture change and should not be introduced casually for a one-off asset.

Deployment boundary: local Mode B validation proves the candidate image behaves correctly; live verification proves the currently deployed production image contains the asset. Mode B success is not evidence that production has already been updated.

## 6. Production Workflow

Confirmed from `docker-compose.prod.yml`:

- Two services are defined.
- Each service builds from `docker/Dockerfile.prod.site`.
- Each service passes:
  - `SITE_DIR_NAME`
  - `SITE_PORT`
- Each service uses `.env` by path only.
- Each service sets production-mode environment variables.
- Each service mounts a named data volume and named logs volume.
- Each service has a health check.
- Each service is attached to a production Docker network.

Confirmed runtime paths inside containers:

- Database path is represented by `[DATABASE_PATH]`.
- Uploads path is represented by `[UPLOADS_PATH]`.
- Logs live under a container log path mounted to a Docker volume.
- The currently deployed backup flow generates retained files under a container backup path. The repository target described below replaces that behavior, but it is not live until a separately approved production rollout succeeds.

nginx relationship:

- nginx proxies HTTP application traffic to site upstreams.
- nginx may serve static CSS, JS, images, and uploads through aliases.
- TLS certificate paths exist in nginx config, but certificate files/private keys must not be inspected.

Approval-required production deployment example:

```bash
# Approval required. Placeholder-only examples using the live-verified command shape.
ssh [SSH_USER]@[SERVER_IP] "cd /opt/Sites && docker-compose -f docker-compose.prod.yml build [SERVICE_NAME]"
ssh [SSH_USER]@[SERVER_IP] "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up -d --no-deps --force-recreate --no-build [SERVICE_NAME]"
```

Do not run this command unless the user explicitly approves the exact deployment action.

Live-verified operator facts:

- Production checkout: `/opt/Sites`.
- Production Compose file: root `docker-compose.prod.yml`.
- Production Compose implementation: standalone `docker-compose`.
- Build and recreation remain separate, site-specific, approval-required steps.

Needs Review: confirm whether nginx config in this repo is deployed as-is or used as a reference.

## 7. Backup and Restore Concepts

Current production finding as of 2026-08-24:

- FFG and TTA use the same scheduled container/host backup architecture.
- The weekly host job runs at 02:00 on Sunday.
- The deployed container script retains database and uploads artifacts under an unmounted `/app/backups` path.
- The deployed host script copies the entire retained container backup tree rather than only the new set.
- Host copy failure is not a reliable failure gate in the deployed script.
- FFG accumulated approximately 950 MB in its writable layer; backup artifacts accounted for 99.96% of that layer.
- No implemented off-host or secondary-copy job is established by current repository evidence. The existing host destination is durable across container recreation, but remains on the production host and is therefore only the canonical local copy.

Repository target architecture, implemented locally but not yet deployed:

- Runtime databases and uploads are the main backup targets.
- Source code is expected to live in Git and is not part of backup output.
- The host scheduler takes one atomic lock under the host backup root, streams the tracked container backup script into each container, and reserves one fixed temporary staging directory per container.
- The container script creates exactly `blog.db` and `uploads.tar.gz`, uses SQLite's backup operation, verifies database integrity, and verifies the upload archive.
- The host script copies only those two artifacts into a host staging directory, verifies nonzero output, archive readability, and matching container/host checksums, then atomically promotes one `backup-set-<RUN_ID>` directory.
- Only after host promotion succeeds does the host script delete the two temporary container artifacts and remove the empty staging directory.
- Copy, checksum, archive, or cleanup failure returns nonzero, preserves staging for review, skips retention, and prevents another set from accumulating at the same container path.
- Retention is host-owned, defaults to 28 days, and applies only to the new `backup-set-*` layout. Age uses the managed directory modification time in complete 24-hour periods; `find -mtime +28` selects a set only after its completed age bucket exceeds 28. Existing legacy backups are deliberately excluded until a separate cleanup is explicitly approved.
- A dedicated `/app/backups` volume is not part of the target. It would move bytes out of the writable layer but preserve same-host duplication, whole-tree copying, and split retention ownership.

Fail-closed operator recovery:

1. Stop or pause any scheduled invocation and confirm no backup-host process is still active.
2. Inspect the host lock at `/opt/Sites/backups/.backup-run.lock`, any per-site `.staging-backup-set-<RUN_ID>` directory, and the fixed container staging directory without deleting them.
3. Reconcile or preserve any staged artifacts before cleanup. An ordinary script failure releases the host lock but intentionally leaves staging to block the next run.
4. If an abrupt kill left only a stale, empty host lock, remove that exact lock with `rmdir /opt/Sites/backups/.backup-run.lock` only after confirming no run is active. Do not use a recursive removal command for the lock.
5. Treat removal of container or host staging artifacts as a separate backup-deletion decision. Do not resume the schedule until the failed set is understood and staging has been deliberately reconciled.

Pending production rollout gate:

1. Preserve all existing container and host backup artifacts.
2. Update the production checkout only after the exact commit and script diff are approved.
3. Do not rebuild or recreate either application solely for this change. The host orchestrator streams the tracked `scripts/backup.sh` into the existing container for each run.
4. Run one explicitly approved manual host-orchestrated backup and require success for both sites.
5. Confirm one complete host set per site, matching transfer checksums, absent temporary staging, unchanged application health/restart counts, and no writable-layer increase.
6. Allow the next scheduled run only after the manual gate passes; verify the same conditions afterward.
7. Treat existing `/app/backups` contents as preserved legacy backups until the new flow and host copies are independently verified. Their removal remains a separate destructive action requiring explicit approval.

Rollback concept:

- If the new flow fails before host promotion, keep the staged artifacts and host staging directory for diagnosis; do not run retention or delete prior backups.
- Suspend the scheduled job before reverting scripts so the old accumulating flow is not silently re-enabled.
- Restore the previously known script revision only as an operator-approved temporary fallback, then reverify backup output, container growth, and application health.
- Never delete a successfully promoted new-layout set merely because the script rollout is rolled back.

Runtime state that must not be committed:

- SQLite database files.
- Upload folders.
- Logs.
- Backup directories.
- Generated archive files.

High-risk restore boundary:

- Database restore is high-risk.
- Upload restore is high-risk.
- Volume manipulation is high-risk.
- Container restart after restore is high-risk.
- Backup deletion/retention cleanup is high-risk.

Do not execute restore, prune, delete, or cleanup commands without explicit approval.

Approval-required backup example:

```bash
# Approval required. Placeholder-only example.
ssh [SSH_USER]@[SERVER_IP] "[REPOSITORY_ROOT]/scripts/backup-host.sh"
```

Approval-required restore concept:

```text
Restore requires selecting one complete host-managed backup set, verifying it before use,
stopping or isolating affected services if needed, copying database/upload data into the
runtime volume, fixing ownership/permissions if needed, restarting affected services, and
verifying application behavior.
```

The restore source of record is the verified host-managed set, not retained `/app/backups`
contents inside a container. A production restore procedure and off-host copy remain separate
approval-required workstreams.

Database integrity, archive readability, and transfer checksum verification are not equivalent
to a completed restore test. Off-host replication and an actual isolated restore test remain
separate required workstreams.

Do not convert this concept into a live restore procedure until the user explicitly approves a restore-planning task.

## 8. Deployment Preflight Checklist

Before any deployment, confirm:

- [ ] `git status` reviewed.
- [ ] Diffs reviewed, including documentation and config changes.
- [ ] Sensitive files are not staged or included.
- [ ] Current branch confirmed.
- [ ] Target site/service confirmed.
- [ ] Exact Compose file confirmed.
- [ ] Exact Dockerfile confirmed.
- [ ] Required env files exist by path, without opening them.
- [ ] `[SESSION_SECRET]`, `[TRUSTED_IPS]`, `[DATABASE_PATH]`, and `[UPLOADS_PATH]` are expected to be supplied by env/config.
- [ ] Backup status confirmed without opening backup contents.
- [ ] Rollback concept agreed.
- [ ] CI status reviewed, with attention to tolerant failures.
- [ ] User explicitly approved the deployment command before it is run.

## 9. Safe Command Categories

### Safe Inspection Commands

These are usually safe when scoped to non-sensitive files:

- Read approved documentation.
- Read package manifests.
- Read Compose/Docker/nginx config.
- Read CI config.
- List file paths.
- Search for variable names.
- Inspect `.dockerignore`.

Still avoid `.env*`, `Documents/SECRETS.md`, databases, uploads, backups, keys, certificates, and credential exports.

### Caution Commands

Require judgment and may need approval depending on context:

- `git status`
- `git diff --stat`
- targeted `git diff` of non-sensitive files
- local lint/test commands
- local process inspection
- generated-output cleanup planning without deletion

### Approval-Required Commands

Do not run without explicit user approval:

- Docker Compose build/start/stop/restart commands.
- SSH/SCP/rsync commands.
- Production deploy commands.
- Backup commands.
- Cron setup commands.
- Analytics cleanup commands.
- Docker image/cache cleanup commands.
- Any command that changes runtime state.

Placeholder-only examples:

```bash
# Approval required.
ssh [SSH_USER]@[SERVER_IP] "cd [DEPLOY_PATH] && docker compose -f docker-compose.prod.yml ps"

# Approval required.
docker compose -f docker-compose.local-prod.yml up --build -d
```

### Never Run Without Explicit Approval

- `git reset`
- `git add`
- `git commit`
- `rm` / deletion commands
- Docker prune commands
- Docker volume deletion/manipulation
- database restore or migration commands
- backup restore commands
- production restart commands
- commands that reveal secret values

## 10. Rollback Concepts

Rollback should be planned before deployment.

Inferred rollback components:

- Revert application code to a known-good Git revision.
- Rebuild/restart the affected service only after approval.
- Restore database only if the deployment changed or corrupted runtime data.
- Restore uploads only if upload data changed or was damaged.
- Verify service health and core workflows after rollback.

Do not invent an exact rollback procedure from this file alone.

Node 24 migration image anchors verified present on 2026-08-24:

- The Tecnoagrarian Node 20 rollback image: `sha256:5d822f8ccb0e5df8934dfaa3d080b426504ccb030297d3306b69032d7c8167a7`.
- Fruition Forest Garden preserved production image: `sha256:f7eb6f613bdecdbed169bed22bdc8110edae0e21027ec915297fc530a547b0d9`.
- The Tecnoagrarian Node 24 production image: `sha256:26303c47ffaac3881f361b582240dd7c98aba53948dc063cbe2f766a51dde883`.

Image presence is point-in-time evidence, not a permanent retention guarantee. Reverify every required rollback anchor before future production work.

Explicit-approval rollback actions:

- Database restore.
- Upload restore.
- Docker volume manipulation.
- Image rollback.
- Production service restart.
- nginx reload/restart.
- Server cleanup.

## 11. CI/CD Notes

Confirmed from `.github/workflows/ci-cd.yml`:

- CI runs on push and pull request to `main`.
- CI uses exact Node `24.19.0`.
- CI installs dependencies.
- CI attempts linting for `@ffg/blog-core`, tolerating a missing lint script.
- CI installs Chromium for Playwright.
- CI attempts unit tests for `@ffg/blog-core`, tolerating no unit tests.
- CI runs Chromium E2E tests against a configured test URL and continues on error.
- CI runs `npm audit` for `@ffg/blog-core` and continues on error.
- CI verifies `docker-compose.prod.yml` as YAML.
- The visible deploy step is a manual-trigger placeholder and does not perform production deployment.

Do not overstate CI guarantees. Passing CI does not equal deployment approval, especially because some test/audit steps tolerate failure.

## 12. Known Deployment Risks and Open Questions

- Which Compose file is canonical for local development, local production-like testing, and production deployment?
- Do site-level Docker/Compose files remain current, or are root-level Compose files authoritative?
- Should `UPLOAD_PATH` in `docker-compose.yml` be changed to `UPLOADS_PATH`?
- Should site examples using `DATABASE_URL` be aligned with `DATABASE_PATH`?
- Node `24.19.0` is aligned across active Docker and CI paths, while package engines enforce `>=24.0.0 <25`.
- Dependency audit remediation should likely wait until documentation migration is complete unless a high-risk vulnerability is confirmed and approved for action.
- CI tolerates some test/audit failures; decide whether that is intentional.
- Trusted-IP/default-origin behavior should be environment-driven and placeholder-documented.
- Backup and restore need a separate verified restore procedure before use.
- Confirm whether `.dockerignore` exclusions match current deployment expectations.
- Confirm whether nginx config in this repo is source of truth or historical/reference config.

## 13. Codex Rules for Future Deployment Work

Codex may:

- Inspect safe config and docs.
- Inspect approved scripts for purpose and risk.
- Propose runbook improvements.
- Propose placeholder-only command templates.
- Document open questions.
- Compare Compose/Docker/nginx/CI intent.

Codex may not, without explicit approval:

- Run deployment commands.
- Run SSH, SCP, rsync, or network commands.
- Run Docker build/start/stop/restart/prune commands.
- Run backup restore commands.
- Run database restore/migration commands.
- Run cleanup or deletion commands.
- Run `git add`, `git commit`, or `git reset`.
- Ask the user to paste secrets into chat.
- Open `.env*`, `Documents/SECRETS.md`, databases, uploads, backups, keys, certificates, or credential exports.

Codex must:

- Use placeholders.
- Keep secrets out of docs, chat, diffs, logs, and screenshots.
- Stop and ask if a task appears to require a real secret.
