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
