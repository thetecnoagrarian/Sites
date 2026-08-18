# Dependency Remediation Log

## Pass 2: Multer 2.2.0

### Scope

This was a single-family shared-runtime remediation completed on 2026-08-18.

- Updated `multer` from `2.1.1` to `2.2.0` in `@ffg/blog-core`.
- Updated only the root workspace lockfile for the Multer resolution; npm also synchronized the already-declared Express peer metadata without changing the resolved Express version.
- Did not update Sharp, Handlebars, Express, sanitize-html, Morgan, PostCSS, Nanoid, Glob, Minimatch, Brace Expansion, body-parser, nodemon, or another dependency family.
- Did not change application authentication, CSRF, upload routes, or upload cleanup behavior.

### Audit Result

| Audit | Before | After | Multer finding |
|---|---:|---:|---|
| Full workspaces | 13: 1 low, 2 moderate, 9 high, 1 critical | 12: 1 low, 2 moderate, 8 high, 1 critical | Removed |
| Production-only | 12: 1 low, 2 moderate, 8 high, 1 critical | 11: 1 low, 2 moderate, 7 high, 1 critical | Removed |

No unrelated severity count changed.

### Targeted Authenticated Mode B Validation

- Added one idempotent synthetic admin to the disposable local-test SQL fixture.
- Used normal login, session, CSRF-bearing forms, and real protected routes; no bypass route or forged session cookie was used.
- Added one focused Chromium test file covering both sites and the FFG hero route.
- Passed three targeted tests covering:
  - one valid post image;
  - multiple valid post images;
  - invalid/non-image MIME rejection;
  - upload-size rejection using a 1 KiB Mode B-only limit and a 2 KiB in-memory payload;
  - 26-file rejection against the 25-file route cap;
  - deeply nested multipart field names;
  - malformed multipart input;
  - valid and invalid FFG hero-image uploads.
- An explicit network-abort test was not added; malformed multipart input covered the safely reproducible incomplete-request path.
- Both site images built, both app containers were healthy, and both fixture services exited `0`.
- Homepage, health, synthetic post, robots, and sitemap routes returned `200` for both sites.
- Scoped logs showed no SQLite, permission, or unhandled-exception failures.

Mode B test transport note:

- `docker-compose.test.yml` retains production defaults and exposes explicit test-only overrides. This targeted run used `MODE_B_NODE_ENV=test` so session cookies work over the harness's plain local HTTP transport, plus `MODE_B_MAX_FILE_SIZE=1024` for the oversize case.
- `APP_ROLE` remains `production`.
- This is test-only and does not change the production Dockerfile, production Compose configuration, or production authentication behavior.

### Cleanup Observation

- Rejected invalid-MIME, oversize, over-count, and malformed multipart cases added no temporary files.
- Successful post and hero uploads left their source files in the temporary upload directory: four for FFG and three for TTA during the targeted run.
- Source inspection and runtime counts show this is preexisting application success-path cleanup debt, not evidence that Multer `2.2.0` regressed cleanup.
- Cleanup debt was intentionally not fixed in this dependency batch.

### Validation Status

`MULTER_REMEDIATION_VALIDATED`

- No production access or deployment occurred.
- The isolated `sites-local-test` project and its disposable volumes were removed after validation.
- Nothing was staged, committed, or pushed during the remediation task.

## Pass 1: Express 4.x, Multer, sanitize-html

### Scope

This was a targeted production-runtime remediation pass.

- Express stayed on the 4.x line.
- `multer` was updated in `blog-core`.
- `sanitize-html` was updated in both site packages.
- The Handlebars/rendering stack was intentionally deferred.
- Sharp and `better-sqlite3` were intentionally deferred.
- Dev-only cleanup, including `nodemon` / `picomatch`, was intentionally deferred.
- No `npm audit fix` was run.
- No application source code was changed.
- No Docker, deployment, SSH, Git staging, or Git commit commands were run.
- No secret files or runtime data were inspected.

### Commands Run

| Command | Result | Notes |
|---|---|---|
| `/Users/air/.volta/bin/npm --version` | Succeeded | Reported `11.6.2`. |
| `/Users/air/.volta/bin/node --version` | Succeeded | Reported `v24.12.0`. Production/CI still use Node 20 per prior docs. |
| `/Users/air/.volta/bin/npm ls express multer sanitize-html body-parser qs path-to-regexp postcss --workspaces` | Succeeded before update | Confirmed pre-update local tree: `express@4.22.1`, `multer@2.0.2`, `sanitize-html@2.17.0`, `postcss@8.5.3`, `body-parser@1.20.4`, `qs@6.14.1`, `path-to-regexp@0.1.12`. |
| `/Users/air/.volta/bin/npm outdated express multer sanitize-html --workspaces` | Failed first due sandbox DNS; succeeded with approved registry access | Reported `express` wanted `4.22.2`, latest `5.2.1`; `multer` wanted/latest `2.1.1`; `sanitize-html` wanted/latest `2.17.4`. |
| `/Users/air/.volta/bin/npm audit --omit=dev --workspaces` | Failed first due sandbox DNS; succeeded with approved registry access | Pre-update production audit reported 10 vulnerabilities: 4 moderate, 5 high, 1 critical. |
| `/Users/air/.volta/bin/npm install express@4.22.2 multer@2.1.1 --workspace @ffg/blog-core` | Succeeded | Targeted `blog-core` only. npm reported 3 packages removed, 13 changed, and 5 vulnerabilities after this intermediate step. |
| `/Users/air/.volta/bin/npm install sanitize-html@2.17.4 --workspace fruitionforestgarden --workspace thetecnoagrarian` | Succeeded | Targeted both site packages. npm reported 20 packages added, 32 removed, and 6 vulnerabilities after this intermediate step. |
| `/Users/air/.volta/bin/npm ls express multer sanitize-html body-parser qs path-to-regexp postcss --workspaces` | Succeeded after update | Confirmed post-update tree: `express@4.22.2`, `multer@2.1.1`, `sanitize-html@2.17.4`, `postcss@8.5.15`, `body-parser@1.20.5`, `qs@6.15.2`, `path-to-regexp@0.1.12`. |
| `/Users/air/.volta/bin/npm audit --omit=dev --workspaces` | Exited nonzero because vulnerabilities remain | Post-update production audit reported 5 vulnerabilities: 1 moderate, 3 high, 1 critical. |
| `/Users/air/.volta/bin/npm audit --workspaces` | Exited nonzero because vulnerabilities remain | Post-update full audit reported 6 vulnerabilities: 1 moderate, 4 high, 1 critical. |

Syntax-only checks were skipped because no application source files were intentionally edited.

### Files Changed

Expected changed files:

- `blog-core/package.json`
- `fruitionforestgarden/package.json`
- `thetecnoagrarian/package.json`
- `package-lock.json`
- `Documents/DEPENDENCY_REMEDIATION_LOG.md`

Package manager side effects:

- `node_modules` was updated by the targeted npm install commands.
- npm reported package tree churn during the targeted installs:
  - Express/Multer update: 3 packages removed, 13 packages changed.
  - `sanitize-html` update: 20 packages added, 32 packages removed.

Notable manifest side effect review:

- npm removed the `peerDependencies.express` entry from `blog-core/package.json` while keeping `express` as a direct dependency.
- Follow-up review restored `peerDependencies.express` as `^4.18.0` because `@ffg/blog-core` is a shared package and the peer dependency documents the intended Express 4 compatibility contract without changing runtime behavior.

No Git status command was run because this task restricted Git commands. A human or follow-up audit should inspect the working tree before commit.

### Version Changes

| Package | Workspace | Before | After | Direct or transitive | Reason |
|---|---|---:|---:|---|---|
| `express` | `@ffg/blog-core` | local tree `4.22.1`; previous lockfile `4.21.2`; manifest `^4.18.2` | `4.22.2`; manifest `^4.22.2` | Direct | Keep Express on 4.x while taking the available patch line. |
| `body-parser` | transitive under `express` | local tree `1.20.4`; previous lockfile `1.20.3` | `1.20.5` | Transitive | Updated through Express 4.x patch. |
| `qs` | transitive under `express` / `body-parser` | local tree `6.14.1`; previous lockfile `6.13.0` | `6.15.2` | Transitive | Updated through Express/body-parser path. |
| `path-to-regexp` | transitive under `express` | `0.1.12` | `0.1.12` | Transitive | Remained unchanged; still vulnerable in audit. |
| `multer` | `@ffg/blog-core` | `2.0.2`; manifest `^2.0.0-rc.4` | `2.1.1`; manifest `^2.1.1` | Direct | Address Multer DoS advisories. |
| `sanitize-html` | `fruitionforestgarden` | `2.17.0`; manifest `^2.17.0` | `2.17.4`; manifest `^2.17.4` | Direct | Address site-level sanitization/PostCSS path. |
| `sanitize-html` | `thetecnoagrarian` | `2.17.0`; manifest `^2.17.0` | `2.17.4`; manifest `^2.17.4` | Direct | Address site-level sanitization/PostCSS path. |
| `postcss` | transitive through `sanitize-html` | `8.5.3` | `8.5.15` | Transitive | Updated through `sanitize-html`; no longer appears in post-update audit. |
| `htmlparser2` and related sanitize tree packages | transitive through `sanitize-html` | Older sanitize tree | Updated sanitize tree | Transitive | npm changed the sanitize-html dependency tree as part of the targeted site updates. |

### Audit Result After Pass

Before this pass:

- Production audit: 10 vulnerabilities, 4 moderate, 5 high, 1 critical.

After this pass:

- Production audit: 5 vulnerabilities, 1 moderate, 3 high, 1 critical.
- Full audit: 6 vulnerabilities, 1 moderate, 4 high, 1 critical.

Resolved or removed from the audit output:

- `multer` no longer appears in the post-update audit.
- `postcss` no longer appears in the post-update audit.
- `qs` no longer appears in the post-update audit.
- `body-parser` no longer appears in the post-update audit.
- Express itself no longer appears as an audit item, but its `path-to-regexp` transitive dependency still does.

Remaining production audit items:

- `handlebars` critical through the deferred rendering stack.
- `glob` high through the deferred rendering stack.
- `minimatch` high through the deferred rendering stack.
- `brace-expansion` moderate through the deferred rendering stack.
- `path-to-regexp` high through Express 4.x.

Remaining full-audit-only item:

- `picomatch` high through dev-only site `nodemon` paths.

### Remaining Risk

Expected remaining issues:

- The Handlebars / `express-handlebars` family remains vulnerable and was intentionally deferred.
- `glob`, root `minimatch`, and root `brace-expansion` remain connected to the rendering stack.
- `path-to-regexp@0.1.12` remains vulnerable through Express 4.x after the Express patch.
- Dev-only `picomatch`, plus dev-only site-local `minimatch` / `brace-expansion` paths, remain in the full audit.

Important follow-up:

- Do not resolve the Handlebars/rendering stack by blindly running `npm audit fix`.
- Do not jump to Express 5 just to chase `path-to-regexp` without reviewing routing compatibility.
- Do not mix dev-only cleanup into the next production-runtime fix unless deliberately scoped.

### Test Recommendations Before Commit/Deploy

Before committing:

- Inspect `blog-core/package.json`.
- Inspect `fruitionforestgarden/package.json`.
- Inspect `thetecnoagrarian/package.json`.
- Inspect `package-lock.json`.
- Inspect package-lock churn and confirm only expected dependency families changed.
- Confirm the restored `blog-core` `peerDependencies.express` entry is intentional package metadata.
- Confirm no private files are staged.
- Confirm no application source files changed unexpectedly.

Before deployment:

- Run local app/manual checks if needed.
- Verify both sites because shared `blog-core` runtime dependencies changed.
- Run local production-like Docker verification in a separate approved task before production deployment.
- Do not deploy until the user explicitly approves a deployment plan.

Manual checks to prioritize:

- public homepage for both sites
- post pages
- category pages
- search
- `/robots.txt`
- `/sitemap.xml`
- canonical tags
- admin login/logout
- dashboard
- create/edit/delete post
- category create/delete
- hero image upload/change
- analytics page
- sessions and CSRF-protected forms
- uploads through `multer`
- content sanitization behavior through `sanitize-html`

### Rollback Note

This pass should remain one small commit so rollback is simple if runtime behavior breaks.

Do not combine this dependency remediation with Handlebars/rendering fixes, SSH key cleanup, CSP cleanup, deployment changes, or content changes.

## Local Production-like Docker Verification

Commit tested:

- `2677689 Update Express multer and sanitize-html dependencies`

Docker command style used:

- Attempted `docker-compose` first.
- Attempted `docker compose` after `docker-compose` was unavailable.

Result:

- Config validation did not run.
- Fruition Forest Garden did not build.
- Fruition Forest Garden did not start.
- Fruition Forest Garden health status was not available.
- The Tecnoagrarian did not build.
- The Tecnoagrarian did not start.
- The Tecnoagrarian health status was not available.

Failure details:

- `docker-compose -f docker-compose.local-prod.yml config` failed because `docker-compose` was not found on PATH.
- `docker compose -f docker-compose.local-prod.yml config` failed because `docker` was not found on PATH.

Relevant log summary:

- No container logs were available because Docker was not available locally in this shell environment.

Local HTTP check summary:

- Local HTTP checks were not run because no containers were started.

Unexpected file changes:

- No application source, package, Docker, deployment, or runtime files were changed during this verification attempt.
- This documentation section was added to record the blocked local Docker verification.

Deployment recommendation:

- Production deployment is blocked pending local Docker availability or an alternate approved verification path.
- Do not deploy based on this verification attempt. Re-run local production-like Docker verification once Docker Compose is available.

## Local Production-like Docker Verification Retry

Commit tested:

- `01c99fb Document blocked local Docker verification`
- Dependency remediation commit in history: `2677689 Update Express multer and sanitize-html dependencies`

Docker command style used:

- `/usr/local/bin/docker-compose`

Docker Desktop/CLI availability:

- `/usr/local/bin/docker --version` succeeded.
- `/usr/local/bin/docker-compose --version` succeeded.
- `/usr/local/bin/docker ps` initially failed from the sandboxed shell due Docker socket access, then succeeded with approved Docker escalation.

Config validation:

- `/usr/local/bin/docker-compose -f docker-compose.local-prod.yml config` passed.
- Full config output was intentionally not copied into this document because it can include local environment values.

Fruition Forest Garden:

- Build did not pass.
- Start was not attempted.
- Health status was not available.

The Tecnoagrarian:

- Build was not attempted because the Fruition Forest Garden build failed first.
- Start was not attempted.
- Health status was not available.

Failure details:

- `/usr/local/bin/docker-compose -f docker-compose.local-prod.yml build fruitionforestgarden` failed while loading metadata for the `node:20-alpine` base image.
- Docker reported that the configured credential helper `docker-credential-desktop` was not found on PATH in this execution context.
- The failure happened before the application dependency remediation could be tested in a container.

Relevant log summary:

- No application startup logs were available because no site container was built or started.
- The failure was a Docker credential-helper / base-image metadata access issue, not an observed Express, Multer, or sanitize-html runtime failure.

Local HTTP check summary:

- Local HTTP checks were not run because no site containers were started.

Unexpected file changes:

- No application source, package, Docker, deployment, or runtime files were changed during this retry.
- This documentation section was added to record the blocked retry.

Deployment recommendation:

- Production deployment remains blocked pending a successful local production-like Docker build/start verification or another explicitly approved verification path.
- Do not deploy based on this retry.

## Local Production-like Docker Verification Retry 2

Commit tested:

- `01c99fb Document blocked local Docker verification`
- Dependency remediation commit in history: `2677689 Update Express multer and sanitize-html dependencies`

PATH adjustment used:

- Docker commands were run with `/usr/local/bin` and Docker Desktop's resource binary directory prepended to `PATH` so `docker-credential-desktop` was visible.

Docker command style used:

- `/usr/local/bin/docker-compose`

Docker Desktop/CLI availability:

- `/usr/local/bin/docker --version` succeeded.
- `/usr/local/bin/docker-compose --version` succeeded.
- `docker-credential-desktop` was visible on the adjusted `PATH`.
- Docker socket access required approved escalation from the Codex sandbox.

Config validation:

- `/usr/local/bin/docker-compose -f docker-compose.local-prod.yml config --quiet` passed.
- Full config output was intentionally not copied into this document because it can include local environment values.

Fruition Forest Garden:

- Build passed.
- Start passed.
- Compose status showed the container running and healthy.
- Logs showed production-mode startup and successful `/health` checks.

The Tecnoagrarian:

- Build passed.
- Start passed.
- Compose status showed the container running and healthy.
- Logs showed production-mode startup and successful `/health` checks.

Relevant build/log summary:

- Both builds completed from `docker/Dockerfile.prod.site`.
- The previous `docker-credential-desktop` failure did not recur.
- `npm ci --omit=dev` completed inside both builds and still reported the known remaining dependency audit findings from the deferred remediation families.
- npm emitted allow-scripts warnings for native/runtime packages already known to be Docker-sensitive, and the Sharp rebuild step completed successfully.
- No application startup errors were visible in the inspected container logs.
- No secret or full environment/config output was copied into this log.

Local HTTP check summary:

- Initial sandboxed `curl` checks could not connect to the published localhost ports.
- The same localhost checks succeeded with approved unsandboxed execution.
- Fruition Forest Garden returned `200 OK` for:
  - `http://localhost:4000/`
  - `http://localhost:4000/robots.txt`
  - `http://localhost:4000/sitemap.xml`
- The Tecnoagrarian returned `200 OK` for:
  - `http://localhost:4002/`
  - `http://localhost:4002/robots.txt`
  - `http://localhost:4002/sitemap.xml`

Unexpected file changes:

- No application source, package, Docker, deployment, or runtime files were intentionally changed during this retry.
- This documentation section was added to record the successful local production-like verification.

Deployment recommendation:

- The dependency remediation commit passed local production-like Docker build/start/health verification for both sites.
- Production deployment is no longer blocked by local Docker verification.
- Production deployment still requires the normal deployment operator checklist, explicit user approval, and no automatic deployment should occur from this verification alone.

Container state:

- `ffg-blog-local-prod` was left running and healthy.
- `tta-blog-local-prod` was left running and healthy.

## Post-Migration Production Verification

Date/context:

- Verification performed after the dependency remediation and a Linode emergency host migration/restart.
- This section records user-provided production verification results only; no production commands were run by Codex for this update.

Public endpoint results:

- `https://www.fruitionforestgarden.com/` returned `200 OK`.
- `https://www.fruitionforestgarden.com/robots.txt` returned `200 OK`.
- `https://www.fruitionforestgarden.com/sitemap.xml` returned `200 OK`.
- `https://www.thetecnoagrarian.com/` returned `200 OK`.
- `https://www.thetecnoagrarian.com/robots.txt` returned `200 OK`.
- `https://www.thetecnoagrarian.com/sitemap.xml` returned `200 OK`.

Container/Docker reboot-survival result:

- Linode uptime showed the server had rebooted after migration.
- Production Compose status showed both `ffg-blog-prod` and `tta-blog-prod` up and healthy.
- Docker service enablement and active-state checks showed Docker enabled and active.
- Docker container status showed both production site containers running and healthy.
- This confirms Docker and the production containers survived the Linode host restart/migration cycle.

DNS caveat:

- During verification, local router/Starlink DNS caused a false site-outage signal.
- Public DNS and cellular resolution worked correctly.
- Setting the Mac to public DNS resolvers restored normal local verification.
- Treat this as a local/router DNS verification caveat, not an application failure.

Bot/scanner log note:

- Container logs showed normal production startup and page views.
- Bot/scanner traffic was visible, including random paths and admin/plugin probes.
- This traffic should be treated as normal internet background noise unless it escalates into sustained abuse or application errors.

Session logging cleanup follow-up:

- Logs also showed session-object logging that included per-session CSRF secret material.
- No session values or secret material are copied into this document.
- Follow-up security cleanup was completed separately in commit `748fc7f` (`Redact sensitive auth and session logging`).
- This log records that the cleanup was committed and pushed; it does not claim the logging-redaction cleanup has been deployed to production.

Conclusion:

- Production is currently healthy after the Linode migration/restart.
- Public crawlability endpoints for both sites are returning `200 OK`.
- Docker and production containers survived the host migration/restart.
- Session logging cleanup has been handled in a separate code commit, with production deployment status tracked separately from this dependency-remediation log.

## Logging-Redaction Production Deployment

Date/context:

- This section records user-provided production deployment and verification results for the logging-redaction cleanup.
- The logging-redaction cleanup was committed as `748fc7f` (`Redact sensitive auth and session logging`).
- Later documentation commits were also present on `origin/main`: `c8e1fc2` (`Document copyable Codex prompt handoff rule`) and `82d7a73` (`Document post-migration production verification`).
- Production deployment was run from the server checkout at `/opt/Sites`.
- No session IDs, cookies, CSRF values, secret values, scanner source IPs, or private credential material are copied into this document.

Fruition Forest Garden deployment result:

- The server `git pull` fast-forwarded from `9461272` to `82d7a73`.
- The Fruition Forest Garden production image was rebuilt.
- `ffg-blog-prod` was recreated and started.
- Immediate public checks briefly returned `502 Bad Gateway` while the recreated container was still starting behind nginx.
- Later Compose status showed `ffg-blog-prod` up and healthy.
- Later public checks returned `200 OK`.
- The brief `502 Bad Gateway` result is treated as a transient container-startup window during recreation, not a persistent deployment failure.

The Tecnoagrarian deployment result:

- The first deployment attempt was interrupted when the SSH connection closed before The Tecnoagrarian deployed.
- A later The Tecnoagrarian-only deployment succeeded.
- The Tecnoagrarian production image was rebuilt.
- `tta-blog-prod` was recreated and started.
- Public checks returned `200 OK` for:
  - `https://www.thetecnoagrarian.com/`
  - `https://www.thetecnoagrarian.com/robots.txt`
  - `https://www.thetecnoagrarian.com/sitemap.xml`

Final public endpoint verification:

- Fruition Forest Garden returned `200 OK` for:
  - `https://www.fruitionforestgarden.com/`
  - `https://www.fruitionforestgarden.com/robots.txt`
  - `https://www.fruitionforestgarden.com/sitemap.xml`
- The Tecnoagrarian returned `200 OK` for:
  - `https://www.thetecnoagrarian.com/`
  - `https://www.thetecnoagrarian.com/robots.txt`
  - `https://www.thetecnoagrarian.com/sitemap.xml`

Container health verification:

- Final Compose status showed `ffg-blog-prod` up and healthy.
- Final Compose status showed `tta-blog-prod` up and healthy.

Log verification:

- Fresh logs showed normal production startup for both services.
- Fresh logs did not show the old full session-object logging pattern.
- Fresh logs did not show per-session CSRF secret dumps.

Bot/scanner noise note:

- Bot/scanner traffic continued to appear after deployment.
- Probes included Outlook-related paths, `.env`, `.git`, and cloud credential JSON-style paths.
- This is expected hostile internet background noise and is not evidence that the logging-redaction deployment failed.
- Continue treating scanner traffic as security-relevant noise to monitor, without copying source IPs or sensitive request details into documentation.

Conclusion:

- The logging-redaction cleanup from commit `748fc7f` is now deployed to both production sites.
- Both production containers are running and healthy after recreation.
- Public homepage, `robots.txt`, and `sitemap.xml` checks returned `200 OK` for both sites after the deployment completed.
- Fresh production logs confirm that the unsafe session-object and per-session CSRF secret logging pattern is no longer present in the inspected startup/request window.

## CSP Form-Action Production Deployment

Date/context:

- This section records user-provided production deployment and verification results for the CSP `form-action` cleanup.
- The CSP cleanup was committed as `cf3429a` (`Remove raw IP form-action CSP origins`).
- The cleanup removed hardcoded raw server IP/port and cross-site origins from the shared Helmet `form-action` directive.
- Production CSP now relies on same-origin form submission only: `form-action 'self'`.
- No session IDs, cookies, CSRF values, scanner source IPs, private key paths, internal secrets, or credential material are copied into this document.

Local verification summary:

- Local production-like Docker verification passed before the commit.
- Both local production-like containers built, started, and reported healthy.
- Local Fruition Forest Garden and The Tecnoagrarian homepage, `robots.txt`, and `sitemap.xml` endpoints returned `200 OK`.
- Local CSP headers showed `form-action 'self'`.
- Raw IP/port `form-action` origins were gone locally.
- Interactive admin form testing was not part of this verification; verification covered HTTP status, response headers, container health, and startup logs.

Fruition Forest Garden production deployment result:

- The cleanup commit was pushed to GitHub.
- The production server checkout at `/opt/Sites` pulled the update.
- Fruition Forest Garden was rebuilt and recreated first.
- Fruition Forest Garden public checks returned `200 OK` for:
  - `https://www.fruitionforestgarden.com/`
  - `https://www.fruitionforestgarden.com/robots.txt`
  - `https://www.fruitionforestgarden.com/sitemap.xml`
- The Fruition Forest Garden CSP header showed `form-action 'self'`.
- The Fruition Forest Garden CSP header no longer included raw IP/port `form-action` origins.

The Tecnoagrarian production deployment result:

- The first The Tecnoagrarian deployment attempt was interrupted by SSH connection closure before completion.
- A later The Tecnoagrarian-only deployment succeeded.
- The Tecnoagrarian production image was rebuilt.
- `tta-blog-prod` was recreated and started.
- The Tecnoagrarian public checks returned `200 OK` for:
  - `https://www.thetecnoagrarian.com/`
  - `https://www.thetecnoagrarian.com/robots.txt`
  - `https://www.thetecnoagrarian.com/sitemap.xml`
- The Tecnoagrarian CSP header showed `form-action 'self'`.
- The Tecnoagrarian CSP header no longer included raw IP/port or cross-site `form-action` origins.

Final container verification:

- `ffg-blog-prod` was up and healthy.
- `tta-blog-prod` was up and healthy.
- Fresh logs showed normal production startup.

Bot/scanner noise note:

- Bot/scanner traffic continued to appear after deployment.
- This is expected hostile internet background noise and is not evidence that the CSP cleanup failed.
- Continue avoiding scanner source IPs, cookie values, CSRF values, and other sensitive request details in documentation.

Conclusion:

- The CSP `form-action 'self'` cleanup from commit `cf3429a` is now deployed to both production sites.
- Both public sites returned `200 OK` for homepage, `robots.txt`, and `sitemap.xml` after deployment.
- Both production containers were healthy after deployment.
- Production CSP headers now rely on same-origin form submission and no longer expose the old raw IP/port `form-action` origins.
