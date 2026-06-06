# Dependency Remediation Log

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
