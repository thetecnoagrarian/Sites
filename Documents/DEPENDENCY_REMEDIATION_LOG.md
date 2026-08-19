# Dependency Remediation Log

## Pass 6: better-sqlite3 12.11.1

### Scope

This was a single-family shared-runtime remediation validated on 2026-08-19.

- Updated the direct `@ffg/blog-core` dependency from `better-sqlite3@11.10.0` to `12.11.1` and regenerated only the authoritative root workspace lockfile.
- The bundled SQLite library moved from `3.49.2` to `3.53.2`; `better-sqlite3-session-store@0.1.0` remained unchanged.
- `12.11.1` was selected as the newest published stable release found for this batch after the proposed `12.12.0` target proved unpublished. Its declared engine range includes Node 20.
- No other dependency family, database schema, session-store package, application route, authentication behavior, CSRF behavior, Node baseline, or site-local lockfile changed.

### Compatibility and Rollback Validation

- The focused compatibility suite passed 3 tests with 0 failures and 0 skips. It covered schema initialization, prepared statements and positional bindings, representative user/category/post/relationship CRUD, image/caption metadata, transaction changes and `lastInsertRowid`, close/reopen, `integrity_check`, `foreign_key_check`, intentional rollback, and the complete session-store lifecycle.
- Session coverage included set, get, touch, destroy, length, expiry, persistence across database reopen, and deterministic expired-session cleanup.
- A disposable database created by `better-sqlite3@11.10.0` / SQLite `3.49.2` opened and accepted representative reads and writes under `12.11.1` / SQLite `3.53.2`.
- The database then reopened under `11.10.0`; representative reads, writes, posts, sessions, and triggers remained functional. Journal mode remained `delete`, `integrity_check` returned `ok`, and `foreign_key_check` found no violations. The tested rollback path is viable.
- The complete shared-core suite passed 5 tests with 0 failures and 0 skips. The unchanged focused Morgan regression passed 1 test, and the unchanged sanitize-html regression passed 3 tests.

### Mode B and Native Runtime Validation

- Previously completed no-cache builds of both site images used Node `20.20.2`, ABI `115`, Linux ARM64, Alpine `3.23.4`, and musl. `better-sqlite3@12.11.1` compiled successfully from source in both builder stages and loaded in both final images.
- The Docker builder uses the separately validated exact npm `11.19.0` pin for `npm ci`. Because the Dockerfile is multi-stage, the final runtime stage retains the Node base image's npm `10.8.2`; npm is not used by the running applications.
- Both running applications reported `better-sqlite3@12.11.1` and SQLite `3.53.2`, became healthy, and their fixture services exited `0`.
- The local plain-HTTP authentication checks used the existing test-only `MODE_B_NODE_ENV=test` override while retaining `APP_ROLE=production`. Authentication and CSRF protections were not bypassed.
- Normal authenticated flows on both sites established and reused sessions; created, read, updated, verified, and deleted synthetic posts; restarted each application container with its disposable data volume preserved; reopened each database; and retained authenticated sessions across restart.
- After runtime activity, both databases returned `ok` from `integrity_check`, zero rows from `foreign_key_check`, and unchanged `delete` journal mode.
- The unchanged authenticated Chromium Multer suite passed 3 tests. The unchanged authenticated Chromium Sharp suite passed 3 tests and produced valid image outputs. Known successful-upload source-file retention remains separate cleanup debt.
- Scoped logs showed no SQLite, native-addon, node-gyp load, database-locking, session-store, permission, startup, unhandled, or fatal errors. Expected corrupt-image rejection messages remained nonfatal.

### Audit Result

| Audit | Pre-better-sqlite snapshot supplied for this batch | Fresh validation result | better-sqlite finding |
|---|---:|---:|---|
| Full workspaces | 9: 1 low, 0 moderate, 7 high, 1 critical | 9: 1 low, 0 moderate, 7 high, 1 critical | Absent |
| Production-only | 8: 1 low, 0 moderate, 6 high, 1 critical | 8: 1 low, 0 moderate, 6 high, 1 critical | Absent |

`better-sqlite3` appears in neither fresh audit, and both severity totals are unchanged. Remaining full-workspace audit families are `body-parser`, `brace-expansion`, `glob`, `handlebars`, `minimatch`, `nanoid`, `path-to-regexp`, `picomatch`, and `postcss`.

### Remaining Runtime Work

Node 24 migration remains a separate future workstream. It still requires Linux musl ARM64 prebuilt validation and Linux musl AMD64 native/prebuilt validation before the runtime baseline changes. The npm `allowScripts` policy warning also remains a separate reproducibility and supply-chain follow-up.

### Validation Status

`BETTER_SQLITE3_REMEDIATION_VALIDATED`

- No production access or deployment occurred.
- Nothing was staged, committed, or pushed.

## Pass 5: sanitize-html 2.17.5

### Scope

This was a two-site, single-family dependency remediation completed on 2026-08-19.

- Updated the direct `sanitize-html` dependency in both site packages from `2.17.4` to `2.17.5` and regenerated only the authoritative root workspace lockfile.
- An initial uncommitted attempt at `2.17.7` was rejected during validation because that release declares Node `>=22.12.0`, while the production-style images currently run Node `20.20.2`.
- `sanitize-html@2.17.5` declares no `engines` field. Its actual sanitizer behavior was therefore exercised under Node `20.20.2` rather than treating metadata absence as sufficient compatibility evidence.
- The final parser graph remains `htmlparser2@10.1.0`, `dom-serializer@2.0.0`, `domelementtype@2.3.0`, `domhandler@5.0.3`, `domutils@3.2.2`, root `entities@7.0.1`, and serializer-local `entities@4.5.0`, unchanged from the original `2.17.4` baseline.
- `postcss@8.5.15` and `nanoid@3.3.12` did not move. No other dependency family, Node baseline, Docker configuration, site-local lockfile, application source, route, authentication, or CSRF behavior changed.

### Audit Result

| Audit | Before | After | sanitize-html finding |
|---|---:|---:|---|
| Full workspaces | 12: 1 low, 1 moderate, 8 high, 2 critical | 11: 1 low, 0 moderate, 8 high, 2 critical | Removed |
| Production-only | 9: 1 low, 1 moderate, 6 high, 1 critical | 8: 1 low, 0 moderate, 6 high, 1 critical | Removed |

The direct `sanitize-html` advisory no longer appears. The installed transitive `postcss@8.5.15` and `nanoid@3.3.12` findings remain in both audits and were not remediated in this batch.

### Sanitizer and Shared-Core Validation

- The focused sanitizer regression passed locally under Node `24.12.0`: 3 passed, 0 failed, 0 skipped.
- The same focused regression executed actual `sanitize-html@2.17.5` behavior in the built production-style image under Node `20.20.2`: 3 passed, 0 failed, 0 skipped.
- Coverage preserved representative headings, paragraphs, links, lists, blockquotes, emphasis, underline, images, figure/figcaption, tables, and code/pre markup.
- Coverage removed script, event handlers, JavaScript URLs, SVG, iframe, object, embed, style tags, and JavaScript schemes in `action`, `formaction`, `data`, `poster`, and `background` attributes.
- The complete shared-core suite passed: 2 passed, 0 failed, 0 skipped.

### Mode B Validation

- Built both site images in the isolated `sites-local-test` project.
- Both application containers became healthy, and both one-shot fixture services exited successfully with status `0`.
- Both homepages and both health routes returned `200`.
- Both running services reported Node `20.20.2` and `sanitize-html@2.17.5`.
- Scoped logs contained no dependency-loading, startup, SQLite, permission, or fatal errors.
- The isolated containers, network, and all disposable test volumes were removed after validation.

### Remaining Application Security Work

This dependency update does not resolve the source-level stored-XSS design gap because active post create/update routes still do not apply `sanitize-html`. Caption script-context XSS and the multipart CSRF verification gap also remain separate workstreams. The dependency regression policy documents and tests intended sanitizer behavior only; it is not an authentication, CSRF, or route-wiring bypass.

### Validation Status

`SANITIZE_HTML_DEPENDENCY_VALIDATED`

- No production access or deployment occurred.
- Nothing was staged, committed, or pushed.

## Pass 4: Morgan 1.11.0

### Scope

This was a single-family shared-runtime remediation completed on 2026-08-18.

- Updated direct `@ffg/blog-core` dependency `morgan` from `1.10.1` to `1.11.0` and regenerated only the authoritative root workspace lockfile.
- Morgan's `on-finished` range changed from `~2.3.0` to `~2.4.1`; the obsolete nested `on-finished@2.3.0` copy was removed and Morgan now deduplicates to the existing root `on-finished@2.4.1` resolution.
- No application source, production configuration, Dockerfile, Compose file, site-local lockfile, authentication, CSRF, or logging-format change was required.
- Did not remediate another dependency family or work on the separate sanitize-html route-wiring concern.

Morgan was prioritized over higher-severity installed findings because the current shared `morgan('combined')` middleware runs before route authentication and its `:remote-user` token receives request-derived Basic Authorization username data. The fix was also a contained compatible update. Higher-severity remaining families are still installed and, where shown by the production audit, production-present, but current source review did not establish equivalent request control over their vulnerable behaviors. Installed, production-present, reachable, and exploitable remain separate conclusions.

### Audit Result

| Audit | Before | After | Morgan finding |
|---|---:|---:|---|
| Full workspaces | 13: 1 low, 2 moderate, 8 high, 2 critical | 12: 1 low, 1 moderate, 8 high, 2 critical | Removed |
| Production-only | 10: 1 low, 2 moderate, 6 high, 1 critical | 9: 1 low, 1 moderate, 6 high, 1 critical | Removed |

The count change is exactly the removed Morgan family. No unrelated package version changed. Remaining full-audit families are `body-parser`, `brace-expansion`, `glob`, `handlebars`, `lodash`, `minimatch`, `nanoid`, `path-to-regexp`, `picomatch`, `postcss`, `sanitize-html`, and `shell-quote`.

### Focused HTTP and Shared-Core Validation

- Added a focused `blog-core` regression that starts an actual loopback HTTP server with the unchanged production `combined` Morgan format and an isolated in-memory stream.
- Sent an ordinary request and a synthetic Basic Authorization request whose username contained representative line-breaking and control bytes.
- Morgan emitted exactly one event per request. The malicious event retained one physical line terminator, contained no literal request-controlled control bytes, and represented the dangerous bytes and backslash with visible escapes.
- Normal `combined` request method, path, protocol, and status logging remained present.
- The complete shared-core suite passed: 2 tests, 2 passed, 0 failed.

### Mode B Validation

- Built both site images from `docker/Dockerfile.prod.site` in the isolated `sites-local-test` project; both images contained `morgan@1.11.0`.
- Both standard application containers became healthy, and both one-shot fixture services exited successfully with status `0`.
- Both homepages and both health routes returned `200`.
- Because the standard Mode B services intentionally use warning-level logging, each already-built site image was also started briefly as a disposable service-local probe with only `LOG_LEVEL=info` overridden. Production files and the standard Compose definition were not changed.
- For each site, ordinary and malicious synthetic `/health` probes returned `200`, produced exactly two filtered Morgan events, preserved one physical line for the malicious marker, and showed the request-controlled control bytes as escapes rather than literal bytes.
- Scoped logs contained no SQLite, permission, unhandled, fatal, or startup failures.
- The isolated containers, network, and all disposable test volumes were removed after validation.

### Validation Status

`MORGAN_REMEDIATION_VALIDATED`

- No production access or deployment occurred.
- Nothing was staged, committed, or pushed.

## Pass 3: Sharp 0.35.3

### Scope

This was a single-family shared-runtime remediation completed on 2026-08-18.

- Updated `sharp` from `0.32.6` to `0.35.3` in `@ffg/blog-core` and regenerated only the authoritative root workspace lockfile.
- Raised the root, shared-core, and both site Node engine declarations to `>=20.9.0`, the minimum supported by Sharp 0.35.
- Replaced the obsolete post-install `npm rebuild sharp --platform=linuxmusl --arch=x64` step with `npm ci --omit=dev --include=optional`, allowing npm to select Sharp's native optional packages for the actual build platform.
- Kept existing npm lifecycle-script protections; no broad script enablement was added.
- Did not update the stale site-local lockfiles, remove the runtime `vips` package, change application image-processing code, fix upload cleanup, or remediate another dependency family.

### Audit Result

The fresh pre-change audit had moved since the Multer snapshot because new unrelated advisories were published. The table compares the same checkout immediately before and after only the Sharp change.

| Audit | Before | After | Sharp finding |
|---|---:|---:|---|
| Full workspaces | 14: 1 low, 2 moderate, 9 high, 2 critical | 13: 1 low, 2 moderate, 8 high, 2 critical | Removed |
| Production-only | 11: 1 low, 2 moderate, 7 high, 1 critical | 10: 1 low, 2 moderate, 6 high, 1 critical | Removed |

No unrelated advisory family was remediated. Remaining full-audit families are `body-parser`, `brace-expansion`, `glob`, `handlebars`, `lodash`, `minimatch`, `morgan`, `nanoid`, `path-to-regexp`, `picomatch`, `postcss`, `sanitize-html`, and `shell-quote`.

### Dependency and Native Runtime Validation

- Local macOS ARM64 validation used Node `24.12.0`, Sharp `0.35.3`, libvips `8.18.3`, `@img/sharp-darwin-arm64@0.35.3`, and `@img/sharp-libvips-darwin-arm64@1.3.2`.
- The authoritative lockfile now records Sharp's platform-specific optional packages and removes the obsolete Sharp 0.32 prebuild-download dependency chain.
- Both Mode B images built from the canonical `docker/Dockerfile.prod.site` without the removed rebuild command or its unsupported flag warning.
- Both running containers reported Linux ARM64, Alpine `3.23.4`, Node `20.20.2`, Sharp `0.35.3`, libvips `8.18.3`, and the expected `linuxmusl-arm64` Sharp and libvips packages.
- An amd64 image was not built locally. CI declares Node 20 but does not build Docker images, so linuxmusl-x64 remains a deployment-candidate validation requirement before production use.

### Targeted Authenticated Mode B Validation

- Added a separate three-test Chromium Sharp suite without modifying the existing Multer regression.
- Used the disposable synthetic admin, normal login, browser session, CSRF-bearing forms, and real protected routes.
- FFG and TTA post routes each processed synthetic large non-square JPEG and PNG inputs.
- Each input produced decodable `thumbnail`, `medium`, and `large` WebP variants within the configured bounds while preserving aspect ratio; public upload URLs returned `200` with WebP content types.
- Corrupt bytes declared as `image/png` reached Sharp but created no post and no processed variants on either site.
- Invalid non-image MIME inputs created no processed variants.
- FFG hero processing produced a decodable `1920x960` hero WebP and `1200x630` Open Graph WebP; corrupt hero input left valid outputs in place.
- Both application containers remained healthy, both fixture services exited `0`, both health routes returned `200`, and the scoped logs contained no SQLite, permission, unhandled, or fatal errors.
- The unchanged authenticated Multer suite passed all three tests after the Sharp upgrade.
- The shared `blog-core` unit test passed.

### Cleanup Observation

- Successful two-image post processing retained two source files for each site.
- FFG removed its corrupt post source file; TTA retained one corrupt post source file; FFG retained one corrupt hero source file.
- These differences confirm existing route-level cleanup behavior. Cleanup was intentionally not changed in this dependency batch.

### Validation Status

`SHARP_REMEDIATION_VALIDATED`

- No production access or deployment occurred.
- The isolated `sites-local-test` project and its disposable volumes were removed after validation.
- Nothing was staged, committed, or pushed.

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
