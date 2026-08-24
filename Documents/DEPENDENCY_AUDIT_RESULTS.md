# Dependency Audit Results

> **Current-use note (2026-08-24):** The Node 24 follow-up below is the current runtime and audit baseline, now complete through native AMD64 and production verification. better-sqlite3 is validated at `12.11.1`, sanitize-html at `2.17.5`, Morgan at `1.11.0`, Sharp at `0.35.3`, and Multer at `2.2.0`; earlier captures remain below as historical evidence.

## 2026-08-20 Node 24 Runtime Follow-up

- Active production and development Docker paths now use the immutable official Node `24.19.0` Alpine 3.23 multi-architecture image, CI uses exact Node `24.19.0`, and all active package engines require `>=24.0.0 <25`.
- Fresh no-cache Linux ARM64 Mode B builds completed for both sites with Node `24.19.0`, ABI `137`, Alpine `3.23.5`, musl `1.2.5-r23`, and builder npm `11.19.0`.
- `better-sqlite3@12.11.1` used the published Node 24 ABI 137 prebuilt on local Darwin ARM64 and Linux musl ARM64, loaded successfully, and reported bundled SQLite `3.53.2`. Sharp `0.35.3` used its expected ARM64 optional packages, reported libvips `8.18.3`, and completed real image transformations.
- Both ARM64 applications became healthy, fixture jobs exited `0`, home and health routes returned `200`, normal login and CSRF-bearing flows passed, sessions survived service restart, synthetic post CRUD passed, and post-activity integrity and foreign-key checks were clean.
- Unchanged focused suites passed: shared-core 5/5, better-sqlite 3/3, Morgan 1/1, sanitize-html 3/3, authenticated Multer 3/3, authenticated Sharp 3/3, and targeted Chromium lifecycle 2/2.
- Preliminary QEMU/emulated Linux musl AMD64 builds completed for both sites. Both images used ABI `137`, selected the better-sqlite x64 prebuilt and expected Sharp `linuxmusl-x64` packages, loaded native addons, completed database read/write and Sharp transformation, started successfully, and returned `200` for home and health routes.
- The permanent native Linux AMD64 deployment-candidate workflow passed after the preliminary emulated checks. Both sites subsequently completed production deployment and live Node, native-addon, health, database, rendering, and sanitized-log verification.
- Fresh full audit is unchanged at 9 vulnerabilities: 1 low, 0 moderate, 7 high, 1 critical. Fresh production audit is unchanged at 8: 1 low, 0 moderate, 6 high, 1 critical.
- `sanitize-html` remains at `2.17.5`. Node 24 removes the prior engine obstacle to a separate `2.17.7` remediation batch, but no sanitizer dependency or source-level route wiring changed here.
- No schema migration was required. Production closure completed at Git SHA `c4fdb37e3762e3f4835b155a68e0fd0ca319e6bf`, followed by successful automated verification and owner-reported authenticated CRUD verification.

## 2026-08-19 better-sqlite3 Follow-up

- `better-sqlite3` changed from `11.10.0` to `12.11.1` in shared `blog-core`; bundled SQLite changed from `3.49.2` to `3.53.2`, while `better-sqlite3-session-store@0.1.0` remained unchanged.
- `12.11.1` was selected as the newest published stable candidate found after the proposed `12.12.0` target proved unpublished. The selected release explicitly supports Node 20 in its engine declaration.
- The pre-better-sqlite snapshot supplied for this batch was 9 full-audit vulnerabilities: 1 low, 0 moderate, 7 high, 1 critical.
- Fresh full-workspace audit: 9 vulnerabilities — 1 low, 0 moderate, 7 high, 1 critical.
- The pre-better-sqlite production-only snapshot was 8 vulnerabilities: 1 low, 0 moderate, 6 high, 1 critical.
- Fresh production-only audit: 8 vulnerabilities — 1 low, 0 moderate, 6 high, 1 critical.
- `better-sqlite3` appears in neither fresh audit, and both severity totals are unchanged. An audit without the repository workflow's explicit `--workspaces` scope also sees root dev-tool findings; that broader count is not the full-workspace comparison used for this batch.
- The focused compatibility suite passed 3 of 3 tests, including database lifecycle, intentional rollback, and complete `better-sqlite3-session-store` lifecycle coverage. The shared-core suite passed 5 of 5, Morgan passed 1 of 1, and sanitize-html passed 3 of 3.
- A disposable database created and written with `11.10.0` / SQLite `3.49.2` opened and accepted writes under `12.11.1` / SQLite `3.53.2`, then reopened and accepted reads/writes under `11.10.0`. Sessions and triggers remained functional, journal mode remained `delete`, integrity was `ok`, and no foreign-key violations were found.
- Both no-cache production-style site builds completed with Node `20.20.2`, ABI `115`, Linux ARM64, Alpine `3.23.4`, musl, and source-compiled `better-sqlite3@12.11.1`. Both final images loaded the native addon and reported SQLite `3.53.2`.
- The separately validated builder pin is npm `11.19.0`; the final multi-stage runtime image retains npm `10.8.2` from the Node base image and does not use npm during application runtime.
- Both Mode B applications became healthy and both fixture jobs exited `0`. Normal authenticated and CSRF-bearing flows passed session reuse, synthetic post create/read/update/delete, container restart/database reopen, and session persistence after restart on both sites.
- Post-activity integrity checks returned `ok`, zero foreign-key violations, and `delete` journal mode for both site databases.
- The unchanged authenticated Chromium Multer and Sharp suites each passed 3 of 3 tests. Scoped logs contained no SQLite, native-addon, database-locking, session-store, permission, startup, unhandled, or fatal errors.
- Historical note: This better-sqlite3 follow-up predates the Node 24 migration, which has since completed through native AMD64 and production verification.
- Remaining full-workspace audit families are `body-parser`, `brace-expansion`, `glob`, `handlebars`, `minimatch`, `nanoid`, `path-to-regexp`, `picomatch`, and `postcss`.

## 2026-08-19 sanitize-html Follow-up

- `sanitize-html` changed from `2.17.4` to `2.17.5` in both site packages, with only the authoritative root lockfile updated.
- An uncommitted `2.17.7` candidate was rejected because it declares Node `>=22.12.0`, which does not satisfy the current production-style Node `20.20.2` runtime contract. Version `2.17.5` declares no `engines` field and passed actual sanitizer execution under Node `20.20.2`.
- Pre-change full audit: 12 vulnerabilities — 1 low, 1 moderate, 8 high, 2 critical.
- Current full audit: 11 vulnerabilities — 1 low, 0 moderate, 8 high, 2 critical.
- Pre-change production-only audit: 9 vulnerabilities — 1 low, 1 moderate, 6 high, 1 critical.
- Current production-only audit: 8 vulnerabilities — 1 low, 0 moderate, 6 high, 1 critical.
- The one-family reduction is exactly the removed direct sanitize-html advisory. `postcss@8.5.15` and `nanoid@3.3.12` remain reported in both audits and were not changed.
- The final parser graph is unchanged from the original `2.17.4` baseline: `htmlparser2@10.1.0`, `dom-serializer@2.0.0`, `domelementtype@2.3.0`, `domhandler@5.0.3`, `domutils@3.2.2`, root `entities@7.0.1`, and serializer-local `entities@4.5.0`.
- The focused sanitizer regression passed 3 of 3 tests locally under Node `24.12.0` and 3 of 3 tests in the built image under Node `20.20.2`, covering preserved rich markup, removal of dangerous markup, and advisory-related URL attributes.
- The complete shared-core suite passed 2 of 2 tests.
- Isolated Mode B built both sites; both containers became healthy, both fixture jobs exited `0`, and both homepages and health routes returned `200`. Both services reported Node `20.20.2` and `sanitize-html@2.17.5`; scoped logs contained no dependency-loading, startup, SQLite, permission, or fatal errors.
- The isolated Mode B containers, network, and disposable volumes were removed afterward. No production access or deployment occurred.
- Source-level stored XSS remains unresolved because active create/update routes still do not call `sanitize-html`. Caption script-context XSS and multipart CSRF verification remain separate workstreams.

## 2026-08-18 Morgan Follow-up

- `morgan` changed from `1.10.1` to `1.11.0` in shared `blog-core` with no application or production configuration change.
- Morgan's nested `on-finished@2.3.0` copy was removed; Morgan now deduplicates to the existing root `on-finished@2.4.1` resolution allowed by its updated `~2.4.1` range.
- Pre-change full audit: 13 vulnerabilities — 1 low, 2 moderate, 8 high, 2 critical.
- Current full audit: 12 vulnerabilities — 1 low, 1 moderate, 8 high, 2 critical.
- Pre-change production-only audit: 10 vulnerabilities — 1 low, 2 moderate, 6 high, 1 critical.
- Current production-only audit: 9 vulnerabilities — 1 low, 1 moderate, 6 high, 1 critical.
- The one-family reduction is exactly the removed Morgan log-forging advisory; no other dependency family was intentionally remediated or changed.
- Morgan was selected despite higher-severity installed findings because shared `morgan('combined')` logging runs before route authentication and its `:remote-user` token receives request-derived Basic Authorization username data. The compatible direct update had a small blast radius. Installed, production-present, reachable, and exploitable remain distinct classifications for the unresolved families.
- A focused actual-HTTP shared-core regression passed. An ordinary request and a synthetic control-character Basic username produced one Morgan event each; the malicious event remained one physical log line, contained safe visible escapes, and preserved normal `combined` logging behavior.
- The complete shared-core suite passed 2 of 2 tests.
- Isolated Mode B built both sites with `morgan@1.11.0`; both standard containers became healthy, both fixture jobs exited `0`, and both homepages and health routes returned `200`.
- Disposable info-level probes using the already-built FFG and TTA images confirmed that ordinary and malicious health requests each produced one filtered Morgan event, control bytes were escaped, and the forged marker remained on one physical log line. No production or Compose configuration was changed.
- Scoped Mode B logs contained no SQLite, permission, unhandled, fatal, or startup failures. Containers, the network, and disposable volumes were removed afterward.
- Remaining full-audit families are `body-parser`, `brace-expansion`, `glob`, `handlebars`, `lodash`, `minimatch`, `nanoid`, `path-to-regexp`, `picomatch`, `postcss`, `sanitize-html`, and `shell-quote`.
- Separate non-dependency work remains unchanged: successful-upload temporary-file cleanup, sanitize-html route-wiring review, stale site-local lockfiles, Docker/npm reproducibility work, and Linux musl amd64 Sharp validation before production deployment.

## 2026-08-18 Sharp Follow-up

- `sharp` changed from `0.32.6` to `0.35.3` in shared `blog-core`; the root and all runtime package engine declarations now require Node `>=20.9.0`.
- The inherited libvips advisory family no longer appears in either audit.
- Fresh pre-change full audit: 14 vulnerabilities — 1 low, 2 moderate, 9 high, 2 critical.
- Current full audit: 13 vulnerabilities — 1 low, 2 moderate, 8 high, 2 critical.
- Fresh pre-change production-only audit: 11 vulnerabilities — 1 low, 2 moderate, 7 high, 1 critical.
- Current production-only audit: 10 vulnerabilities — 1 low, 2 moderate, 6 high, 1 critical.
- The one-family reduction is exactly the removed Sharp finding. Counts that differ from the prior Multer snapshot reflect newly published unrelated advisories, not changes made by this batch.
- Docker now installs production dependencies with optional packages enabled and relies on npm's platform selection. The obsolete hard-coded linuxmusl-x64 Sharp rebuild step was removed.
- Native Mode B validation passed on Linux ARM64 with Alpine `3.23.4`, Node `20.20.2`, Sharp `0.35.3`, libvips `8.18.3`, and the expected `linuxmusl-arm64` packages. An amd64 Docker build was not performed locally and remains a pre-production validation requirement.
- A separate authenticated Sharp suite passed for both sites and the FFG hero route: JPEG and PNG inputs, large non-square dimensions, three bounded WebP post variants, FFG hero and `1200x630` Open Graph output, corrupt image bytes, invalid MIME, public output serving, and post-processing health.
- The unchanged authenticated Multer suite and the shared `blog-core` unit test also passed.
- Successful-upload and corrupt-input source-file retention remains inconsistent by route. This is preexisting cleanup debt and was not changed.
- Remaining full-audit families are `body-parser`, `brace-expansion`, `glob`, `handlebars`, `lodash`, `minimatch`, `morgan`, `nanoid`, `path-to-regexp`, `picomatch`, `postcss`, `sanitize-html`, and `shell-quote`; none was remediated in this batch.

## 2026-08-18 Multer Follow-up

- `multer` changed from `2.1.1` to `2.2.0` in shared `blog-core`.
- The Multer nested-field denial-of-service and aborted-upload cleanup advisories no longer appear in either audit.
- Current full audit: 12 vulnerabilities — 1 low, 2 moderate, 8 high, 1 critical.
- Current production-only audit: 11 vulnerabilities — 1 low, 2 moderate, 7 high, 1 critical.
- The one-family reduction from the pre-change baseline is exactly the removed Multer finding; unrelated severity counts did not change.
- Targeted authenticated Mode B tests passed for both sites: one and multiple valid images, invalid MIME, the test-only size limit, 26-file rejection against the 25-file route cap, deeply nested multipart field names, and malformed multipart input.
- The FFG hero route passed valid-image and invalid-MIME tests.
- Multer rejection and malformed-input cases added no temporary files. Successful processing still leaves uploaded source files in the temporary directory; that is preexisting application cleanup debt and was not changed in this dependency batch.
- Mode B used a synthetic disposable admin and normal login/CSRF flow. The targeted run set test-only `MODE_B_NODE_ENV=test` and `MODE_B_MAX_FILE_SIZE=1024` overrides; ordinary Mode B retains production defaults, `APP_ROLE` remains `production`, and production configuration was not changed.

## Safety Boundary

This is a read-only dependency audit capture.

- No installs were run.
- No dependency updates were run.
- No `npm audit fix` was run.
- No `package.json` or `package-lock.json` edits were made.
- No Docker commands were run.
- No deployment commands were run.
- No application code was changed.
- No secret files, runtime databases, uploads, backups, private keys, certificates, credential exports, server-only files, private deployment notes, private SSH/key maps, or 1Password contents were inspected.

The default shell did not find `npm` on `PATH`, so the audit commands were rerun through the local Volta npm binary at `/Users/air/.volta/bin/npm`. The command intent remained the approved read-only npm audit/listing/outdated workflow.

## Command Summary

| Command | Result | High-level result | Important warnings | Appeared to change files? |
|---|---|---|---|---|
| `npm audit --workspaces` | Initial plain `npm` attempt failed with `command not found`; rerun through Volta exited nonzero because vulnerabilities were found. | Reported 11 vulnerabilities: 4 moderate, 6 high, 1 critical. | Sandbox registry access was unavailable on the first Volta attempt; rerun with approved registry access succeeded. Audit output recommends `npm audit fix`, but this task did not run it. | No package or lockfile changes were requested or reported. npm also reported it could not write logs to `/Users/air/.npm/_logs` on the failed sandboxed attempt. |
| `npm audit --omit=dev --workspaces` | Exited nonzero because vulnerabilities were found. | Reported 10 production-install vulnerabilities: 4 moderate, 5 high, 1 critical. | `picomatch` dropped out when dev dependencies were omitted. Audit output recommends `npm audit fix`, but this task did not run it. | No package or lockfile changes were requested or reported. |
| `npm ls brace-expansion handlebars lodash minimatch multer path-to-regexp picomatch postcss qs body-parser express --workspaces` | Succeeded. | Showed direct and transitive ownership paths across `blog-core`, `fruitionforestgarden`, and `thetecnoagrarian`. | `npm ls` showed some installed versions newer than package-lock root entries, so lockfile/runtime consistency needs review before remediation. | No package or lockfile changes were requested or reported. |
| `npm outdated --workspaces` | Exited nonzero because outdated packages exist. | Showed available updates for runtime and dev packages including `express`, `express-handlebars`, `multer`, `sanitize-html`, `nodemon`, `sharp`, `better-sqlite3`, and others. | `express` current was reported as `4.22.1`, wanted `4.22.2`, latest `5.2.1`; `multer` current `2.0.2`, wanted/latest `2.1.1`; `sanitize-html` current `2.17.0`, wanted/latest `2.17.4`. | No package or lockfile changes were requested or reported. |

No `git status` check was run because this task explicitly prohibited Git commands.

## Vulnerability Inventory

| Package | Severity | Advisory theme | Direct or transitive | Parent path / dependency chain | Present in full audit? | Present in production audit with `--omit=dev`? | Runtime relevance | Initial remediation idea | Risk level |
|---|---|---|---|---|---|---|---|---|---|
| `handlebars` | Critical | JavaScript injection, prototype pollution/XSS, template compilation DoS, precompiler injection | Transitive | `blog-core` -> `express-handlebars` -> `handlebars` | Yes | Yes | High. Server-side rendering path for both sites. | Review `express-handlebars` upgrade path first; avoid standalone transitive forcing unless needed. | Critical |
| `multer` | High | Denial of service via cleanup/resource exhaustion/recursion issues | Direct | `blog-core` direct dependency | Yes | Yes | High. Runtime upload handling, admin media flows, image upload/change flows. | Review patch/minor update to `multer`; `npm outdated` reports `2.1.1` as wanted/latest. | High |
| `path-to-regexp` | High | Regular expression denial of service in route matching | Transitive | `blog-core` -> `express` -> `path-to-regexp` | Yes | Yes | High. Express routing is shared runtime behavior. | Review Express 4 patch path first; avoid Express 5 unless deliberately planned. | High |
| `express` | High through vulnerable transitives | Depends on vulnerable `body-parser`, `path-to-regexp`, and `qs` | Direct | `blog-core` direct dependency | Yes | Yes | High. Core shared server framework for both sites. | Review Express 4 patch update. `npm outdated` reports current `4.22.1`, wanted `4.22.2`, latest `5.2.1`. | High |
| `glob` | High | CLI command injection through `-c/--cmd` with shell execution | Transitive | `blog-core` -> `express-handlebars` -> `glob` | Yes | Yes | Medium to high. Present in production dependency tree, but exploitability depends on whether app-controlled input reaches glob CLI behavior. | Review parent `express-handlebars`/`glob` resolution; avoid assuming CLI advisory is exploitable in app runtime. | High |
| `minimatch` | High | ReDoS via repeated wildcards, GLOBSTAR, and extglob patterns | Transitive | Runtime root path: `blog-core` -> `express-handlebars` -> `glob` -> `minimatch`; dev site paths: site `nodemon` -> `minimatch` | Yes | Yes for root runtime path; site `nodemon` copies are dev-only | Medium to high. Root copy is production-relevant through `express-handlebars`; site-local copies are dev-only. | Review `glob`/`express-handlebars` update path; site `nodemon` update can be lower priority. | High |
| `brace-expansion` | Moderate | ReDoS / process hang / memory exhaustion | Transitive | Runtime root path: `minimatch` -> `brace-expansion`; dev site paths: site `nodemon` -> `minimatch` -> `brace-expansion` | Yes | Yes for root runtime path; site `nodemon` copies excluded by `--omit=dev` | Medium. Production-relevant root copy plus dev-only site copies. | Review `minimatch`/`glob` update path; site `nodemon` update can be separate. | Moderate |
| `qs` | Moderate | DoS through parsing/stringify edge cases | Transitive | `blog-core` -> `express` / `body-parser` -> `qs` | Yes | Yes | High. Request query/body parsing path. | Review Express/body-parser patch path; test forms, search, admin post operations, CSRF flows. | Moderate |
| `body-parser` | Moderate through vulnerable `qs` | Depends on vulnerable `qs` | Transitive | `blog-core` -> `express` -> `body-parser` -> `qs` | Yes | Yes | High. Request body parsing path for public and admin routes. | Review Express 4 patch path; validate form submission and CSRF behavior. | Moderate |
| `postcss` | Moderate | XSS via unescaped `</style>` in CSS stringify output | Transitive | Site package -> `sanitize-html` -> `postcss` | Yes | Yes | Medium. Present in production install through both site packages. Runtime exploitability depends on sanitize/CSS processing path. | Review `sanitize-html` patch update. `npm outdated` reports current `2.17.0`, wanted/latest `2.17.4`. | Moderate |
| `picomatch` | High | Glob matching method injection / ReDoS | Transitive | Site package -> `nodemon` -> `chokidar` -> `anymatch` / `readdirp` -> `picomatch` | Yes | No | Low for production. Appears dev-only through site `nodemon` paths. | Update `nodemon` later for dev/CI hygiene. `npm outdated` reports `3.1.14` wanted/latest. | Dev-only high |
| `lodash` | None in current audit output | Not reported by current audit | Transitive dev package | Root dev tooling path from `concurrently`; lockfile marks `node_modules/lodash` as `dev: true` | No | No | Low for production based on current output. | No immediate security action from current audit; keep in dev/tooling review bucket. | Low |

## Production Versus Dev-only Split

### Production-relevant Issues

The following appeared in `npm audit --omit=dev --workspaces` and should be treated as production-relevant until a later remediation verifies otherwise:

- `handlebars` through `express-handlebars`.
- `multer` as a direct `blog-core` runtime dependency.
- `path-to-regexp` through `express`.
- `express` due vulnerable transitive dependencies.
- `glob` through `express-handlebars`.
- `minimatch` through `glob`.
- `brace-expansion` through `minimatch`.
- `qs` through `express` / `body-parser`.
- `body-parser` through `express`.
- `postcss` through site-level `sanitize-html`.

### Dev/build/test-only Issues

- `picomatch` appeared in the full audit but not in the production audit. `npm ls` ties it to each site package's `nodemon` -> `chokidar` -> `anymatch` / `readdirp` chain.
- Site-local `nodemon` copies of `minimatch` and `brace-expansion` are marked `dev: true` in `package-lock.json`, but root runtime copies also exist and remain production-relevant.
- `lodash` is marked `dev: true` in `package-lock.json` and did not appear in the current audit output.

### Unclear Classification

- `glob` is present in the production audit through `express-handlebars`, but the advisory is CLI-specific. It should remain in the production-relevant bucket because it is installed in production, while exploitability needs package-use review.
- `postcss` is installed through `sanitize-html` in each site package without a `dev: true` marker. Its runtime risk depends on whether the sites use sanitize-html features that process style/CSS content.
- `npm ls` reported some installed versions newer than lockfile entries. Before making update decisions, verify whether `node_modules` and `package-lock.json` are aligned.

## Dependency Ownership Paths

- `express` is direct in `blog-core`; vulnerable transitive `body-parser`, `qs`, and `path-to-regexp` come through Express.
- `body-parser` comes through `express`.
- `qs` comes through both `express` and `body-parser`.
- `path-to-regexp` comes through `express`.
- `multer` is direct in `blog-core`.
- `express-handlebars` is direct in `blog-core`.
- `handlebars` comes through `express-handlebars`.
- `glob` comes through `express-handlebars`.
- Runtime `minimatch` comes through `express-handlebars` -> `glob`; site-local dev `minimatch` comes through `nodemon`.
- Runtime `brace-expansion` comes through runtime `minimatch`; site-local dev `brace-expansion` comes through `nodemon` -> `minimatch`.
- `postcss` comes through `sanitize-html` in both `fruitionforestgarden` and `thetecnoagrarian`.
- `picomatch` comes through site-local `nodemon` -> `chokidar` -> `anymatch` / `readdirp`.
- `lodash` is a dev-only lockfile entry and did not appear in the audit vulnerability output.

## Lockfile Observations

- Multiple versions of some packages exist:
  - `brace-expansion`: root `node_modules/brace-expansion` at `2.0.2`; site-local `nodemon` copies at `1.1.11` and marked `dev: true`.
  - `minimatch`: root `node_modules/minimatch` at `9.0.5`; site-local `nodemon` copies at `3.1.2` and marked `dev: true`.
  - `picomatch`: site-local copies at `2.3.1`, marked `dev: true`.
  - `postcss`: site-local copies at `8.5.3`, not marked `dev: true`.
- Root runtime lockfile entries include:
  - `node_modules/express` at `4.21.2`.
  - `node_modules/body-parser` at `1.20.3`.
  - `node_modules/qs` at `6.13.0`.
  - `node_modules/path-to-regexp` at `0.1.12`.
  - `node_modules/multer` at `2.0.2`.
  - `node_modules/handlebars` at `4.7.8`.
  - `node_modules/glob` at `10.4.5`.
  - `node_modules/minimatch` at `9.0.5`.
  - `node_modules/brace-expansion` at `2.0.2`.
- `npm ls` reported installed versions for some root packages that are newer than the lockfile slices inspected:
  - `express` as `4.22.1`.
  - `body-parser` as `1.20.4`.
  - `qs` as `6.14.1`.
  - `glob` as `10.5.0`.
- This mismatch is a remediation risk. A later dependency update task should reconcile package-lock and installed dependency state intentionally, probably with a clean lockfile update rather than ad hoc changes.

## Remediation Priority

### Priority 1: Production Runtime Critical/High Issues

1. `handlebars` through `express-handlebars`.
2. `multer` direct in `blog-core`.
3. `express` / `path-to-regexp` shared routing path.
4. `glob` / `minimatch` production-installed path through `express-handlebars`.

### Priority 2: Production Runtime Moderate Issues

1. `qs` / `body-parser` through `express`.
2. `brace-expansion` through runtime `minimatch`.
3. `postcss` through site-level `sanitize-html`.

### Priority 3: Dev/build/test-only Issues

1. `picomatch` through site-local `nodemon`.
2. Site-local `nodemon` copies of `minimatch` and `brace-expansion`.
3. Root `lodash` dev entry if future audits flag it.

### Priority 4: Cleanup/Modernization After Security Work

1. Review major upgrades separately, especially Express 5, `express-handlebars` 9, Sharp 0.34, Helmet 8, and `better-sqlite3` 12.
2. Decide whether CI audit should eventually fail on high/critical findings instead of using `continue-on-error`.

## Update Strategy

- Commit this audit result document separately from dependency changes.
- In a later approved task, make one focused dependency remediation commit.
- Do not run `npm audit fix` blindly.
- Prefer patch/minor updates when they resolve the audit without major framework changes.
- Treat shared `blog-core` runtime dependency updates as changes that can affect both sites.
- Update `package-lock.json` intentionally in the later remediation task.
- Review the lockfile/node_modules mismatch before choosing exact updates.
- Run targeted local tests and manual checks before deployment.
- If shared dependencies change, assume both sites need validation even if deployment is staged.
- Deploy only after an explicit deployment plan and user approval.

## Test Impact Checklist

Use this checklist after a future approved dependency remediation:

- Public homepage for Fruition Forest Garden.
- Public homepage for The Tecnoagrarian.
- Public post pages.
- Category pages.
- Search pages.
- `/sitemap.xml`.
- `/robots.txt`.
- Canonical tags.
- Admin login.
- Admin dashboard.
- Create, edit, and delete post flows.
- Category create/delete flows.
- Hero image upload/change.
- Analytics dashboard.
- File uploads via `multer`.
- Image processing via `sharp`.
- SQLite/database access via `better-sqlite3`.
- Sessions and CSRF behavior.
- Production-like Docker build only after explicit approval.

## Open Questions

- Which audit items are actually present in the final production image after a clean `npm ci --omit=dev`?
- Why do some `npm ls` installed versions differ from inspected `package-lock.json` entries?
- Which updates can be patch/minor without major framework changes?
- Which updates require Express/Handlebars compatibility review?
- Should CI fail on high/critical audit findings later instead of tolerating audit failures?
- Should dependency remediation be split into runtime versus dev-only commits?
- Does `sanitize-html` require attention because it brings production-installed `postcss`?
- Is `express-handlebars` pulling the vulnerable Handlebars version, and what is the safest upgrade path?
- Should Express stay on the 4.x line for the first remediation rather than moving to Express 5?

## Recommended Next Task

Prepare a targeted dependency update prompt based on this audit.

Do not run fixes until the user approves the exact package update scope, including whether the first remediation focuses only on production runtime dependencies or also includes dev-only cleanup.
