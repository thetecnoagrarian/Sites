# Targeted Dependency Update Plan

> **Archived historical record:** The first targeted remediation pass is complete. Use `Documents/DEPENDENCY_REMEDIATION_LOG.md` for completed work and remaining risk, and `Documents/DEPENDENCY_SECURITY_REMEDIATION_PLAN.md` for the active unresolved workstream.

## Safety Boundary

This is a dependency remediation planning document only.

- No installs were run.
- No package updates were run.
- No `npm audit fix` was run.
- No `npm update` was run.
- No `npm dedupe` was run.
- No `package.json` or `package-lock.json` edits were made.
- No Docker commands were run.
- No deployment commands were run.
- No application code was changed.
- No secret files, runtime databases, uploads, backups, private keys, certificates, credential exports, server-only files, private deployment notes, private SSH/key maps, or 1Password contents were inspected.

## Source Documents Used

Safe sources inspected:

- `Documents/DEPENDENCY_SECURITY_REMEDIATION_PLAN.md`
- `Documents/DEPENDENCY_AUDIT_RESULTS.md`
- `package.json`
- `package-lock.json`
- `blog-core/package.json`
- `fruitionforestgarden/package.json`
- `thetecnoagrarian/package.json`
- `docker/Dockerfile.prod.site`
- `.github/workflows/ci-cd.yml`

Safe read-only npm commands run:

- `/Users/air/.volta/bin/npm --version`
- `/Users/air/.volta/bin/node --version`
- `/Users/air/.volta/bin/npm ls express body-parser qs path-to-regexp express-handlebars handlebars glob minimatch brace-expansion multer sanitize-html postcss sharp better-sqlite3 --workspaces`
- `/Users/air/.volta/bin/npm explain express`
- `/Users/air/.volta/bin/npm explain express-handlebars`
- `/Users/air/.volta/bin/npm explain handlebars`
- `/Users/air/.volta/bin/npm explain multer`
- `/Users/air/.volta/bin/npm explain sanitize-html`
- `/Users/air/.volta/bin/npm explain postcss`
- `/Users/air/.volta/bin/npm outdated --workspaces`

The `npm outdated --workspaces` command exited nonzero because outdated packages exist. That is expected behavior for this command and was not treated as a remediation failure.

## Runtime Baseline

Observed local tool versions:

- Local Volta Node: `v24.12.0`
- Local Volta npm: `11.6.2`

Manifest expectations:

- Root `package.json` engines allow Node `>=18.0.0` and npm `>=9.0.0`.
- `fruitionforestgarden/package.json` allows Node `>=18.0.0`.
- `thetecnoagrarian/package.json` allows Node `>=18.0.0`.

Production and CI context:

- `docker/Dockerfile.prod.site` uses `node:20-alpine`.
- The production Docker build runs `npm ci --omit=dev`.
- The production Docker build rebuilds Sharp for Linux musl.
- `.github/workflows/ci-cd.yml` uses Node `20`.
- CI currently runs `npm install`, not `npm ci`.
- CI audit is currently tolerant because the security audit step uses `continue-on-error: true`.

Recommendation: treat Node 20 as the practical dependency remediation baseline because production Docker and CI both use Node 20, even though manifests currently allow Node `>=18`. The local Volta Node 24 result should not become the production baseline without an explicit runtime-alignment decision.

## Lockfile Versus Installed-version Mismatch Analysis

The mismatch noted in `Documents/DEPENDENCY_AUDIT_RESULTS.md` appears real for the local workspace.

`npm ls` and `npm explain` read the installed `node_modules` tree and reported:

- `express@4.22.1`
- `body-parser@1.20.4`
- `qs@6.14.1`
- `glob@10.5.0`
- `multer@2.0.2`
- `express-handlebars@7.1.3`
- `handlebars@4.7.8`
- `sanitize-html@2.17.0`
- `postcss@8.5.3`

The inspected `package-lock.json` entries still record:

- `node_modules/express` at `4.21.2`
- `node_modules/body-parser` at `1.20.3`
- `node_modules/qs` at `6.13.0`
- `node_modules/glob` at `10.4.5`
- `node_modules/multer` at `2.0.2`
- `node_modules/express-handlebars` at `7.1.3`
- `node_modules/handlebars` at `4.7.8`
- site-local `sanitize-html` at `2.17.0`
- site-local `postcss` at `8.5.3`

Likely explanation: local `node_modules` has been changed or refreshed since the committed lockfile state, without the lockfile being updated to match. This task did not inspect Git status and did not run clean install commands, so the exact cause remains unconfirmed.

Why this matters:

- Production Docker uses `npm ci --omit=dev`, so production should be expected to follow `package-lock.json`, not the current local `node_modules` tree.
- Local `npm ls` is still useful for dependency ownership paths, but the exact installed versions should not be treated as the production build result until a clean install or lockfile refresh is performed in a later approved task.
- This should not block selecting update targets, but it should block relying on current local `node_modules` as evidence that production is already partially remediated.

Future remediation should intentionally refresh or update the lockfile, then re-run audit/list checks against the resulting dependency tree.

## Proposed First Remediation Scope

The first remediation should focus on production runtime vulnerabilities and avoid major framework jumps where possible.

Recommended first scope:

1. Express 4.x patch path for `express`, `body-parser`, `qs`, and possibly `path-to-regexp`.
2. `multer` patch/minor update.
3. `sanitize-html` patch update for both site packages.
4. Investigate `express-handlebars` and its transitive `handlebars` / `glob` / `minimatch` / `brace-expansion` path, but do not force a major rendering-stack jump until compatibility is understood.

Avoid in the first pass unless required:

- Express 5 migration.
- Sharp major update.
- `better-sqlite3` major update.
- broad modernization of logging, helmet, sessions, or database packages.
- dev-only cleanup mixed with runtime remediation.

| Package to update | Current observed version | Wanted/latest if known | Direct owner | Vulnerability addressed | Production relevance | Update type | Compatibility risk | Recommendation |
|---|---:|---:|---|---|---|---|---|---|
| `express` | installed `4.22.1`; lockfile `4.21.2` | wanted `4.22.2`; latest `5.2.1` | `blog-core` | Express audit chain: `body-parser`, `qs`, `path-to-regexp` | High | Patch within 4.x available; major latest exists | Medium for 4.x patch; high for Express 5 | First-pass candidate: target Express 4.x patch only. Avoid Express 5. |
| `body-parser` | installed `1.20.4`; lockfile `1.20.3` | not separately shown by `npm outdated` | transitive through `express` | `qs` dependency path | High | Unknown; likely parent-driven | Medium | Prefer Express parent update; verify resulting `body-parser` path with `npm ls`. |
| `qs` | installed `6.14.1`; lockfile `6.13.0` | not separately shown by `npm outdated` | transitive through `express` / `body-parser` | DoS advisories | High | Unknown; likely parent-driven | Medium | Prefer Express/body-parser parent update; avoid direct override unless needed. |
| `path-to-regexp` | `0.1.12` | not separately shown by `npm outdated` | transitive through `express` | ReDoS advisory | High | Unknown; likely Express-driven | Medium to high | Verify whether Express 4 patch resolves this. If not, decide whether override or Express 5 review is justified. |
| `multer` | `2.0.2` | wanted/latest `2.1.1` | `blog-core` | Upload DoS advisories | High | Minor | Medium | First-pass candidate. Test admin upload and image workflows. |
| `sanitize-html` | `2.17.0` | wanted/latest `2.17.4` | both site packages | `postcss` advisory path | High for install presence; exploitability needs review | Patch | Medium | First-pass candidate. Update both site manifests/lockfile together. |
| `postcss` | `8.5.3` | not separately shown by `npm outdated` | transitive through `sanitize-html` | CSS stringify XSS advisory | Medium | Parent-driven | Medium | Prefer `sanitize-html` patch update; verify resulting `postcss` version. |
| `express-handlebars` | `7.1.3` | wanted `7.1.3`; latest `9.0.1` | `blog-core` | Parent path for `handlebars`, `glob`, `minimatch`, `brace-expansion` | High | Latest is major; no wanted patch shown | High | Needs compatibility review before update. Do not combine a major rendering change with Express/upload changes unless necessary. |
| `handlebars` | `4.7.8` | not separately shown by `npm outdated` | transitive through `express-handlebars` | Critical template advisories | High | Unknown | High | Investigate whether parent update, lockfile resolution, or override is viable. Treat as top security priority but high compatibility risk. |
| `glob` | installed `10.5.0`; lockfile `10.4.5` | not separately shown by `npm outdated` | transitive through `express-handlebars` | CLI command injection advisory | Production-installed, exploitability unclear | Unknown | Medium | Prefer parent-path resolution; verify whether current lockfile refresh resolves it. |
| `minimatch` | `9.0.5` root; `3.1.2` site dev copies | not separately shown by `npm outdated` | transitive through `glob`; dev path through `nodemon` | ReDoS advisories | Root copy production-relevant; site copies dev-only | Unknown | Medium | Resolve root via rendering/glob path; handle dev copies separately. |
| `brace-expansion` | `2.0.2` root; `1.1.11/1.1.12` site dev copies | not separately shown by `npm outdated` | transitive through `minimatch`; dev path through `nodemon` | ReDoS / resource exhaustion | Root copy production-relevant; site copies dev-only | Unknown | Medium | Resolve root via rendering/glob path; handle dev copies separately. |
| `sharp` | `0.32.6` | wanted `0.32.6`; latest `0.34.5` | `blog-core` | Not a current audit target from captured output | Runtime critical but not current target | Major latest | High | Do not include in first remediation unless a separate security reason appears. |
| `better-sqlite3` | `11.10.0` | wanted `11.10.0`; latest `12.10.0` | `blog-core` | Not a current audit target from captured output | Runtime critical but not current target | Major latest | High | Do not include in first remediation unless a separate security reason appears. |

## Package-by-package Remediation Notes

## Express Family

Packages:

- `express`
- `body-parser`
- `qs`
- `path-to-regexp`

`express` is a direct `blog-core` runtime dependency. `npm explain express` confirms it is shared through `@ffg/blog-core` and therefore affects both Fruition Forest Garden and The Tecnoagrarian.

The safest first path is to stay on Express 4.x and target the available patch line. `npm outdated` reports `express` current `4.22.1`, wanted `4.22.2`, latest `5.2.1`. Express 5 should be treated as a separate migration, not a routine security patch, because it can change routing and middleware behavior.

Tests to emphasize:

- public routes
- static assets
- route parameters
- search query handling
- admin forms
- CSRF-protected POST routes
- sessions
- error handling

## Handlebars/rendering Family

Packages:

- `express-handlebars`
- `handlebars`
- `glob`
- `minimatch`
- `brace-expansion`

`express-handlebars` is a direct `blog-core` runtime dependency. `handlebars`, `glob`, `minimatch`, and root `brace-expansion` come through that rendering stack.

This family has the highest security severity because the audit reports `handlebars` as critical. It also has high compatibility risk because `npm outdated` shows no wanted update for `express-handlebars` under the current range and a latest major version of `9.0.1`.

The next remediation prompt should first determine whether the lockfile can resolve fixed transitive versions under current parent ranges. If not, prefer a reviewed parent-package update over broad overrides. Overrides may be necessary later, but they should not be the first assumption.

Tests to emphasize:

- homepage rendering
- post pages
- category pages
- about pages
- admin dashboard rendering
- post editor rendering
- helper/partial behavior
- error pages

## Upload/image Family

Packages:

- `multer`
- `sharp`

`multer` is a direct `blog-core` runtime dependency and is security-relevant from the audit. `npm outdated` reports `multer` current `2.0.2`, wanted/latest `2.1.1`, so this looks like a focused minor update candidate.

`sharp` is runtime critical but was not identified as a current audit vulnerability in the captured output. It also has native binary and Docker/musl sensitivity. The production Dockerfile explicitly rebuilds Sharp for Linux musl. Do not upgrade Sharp casually during the first security remediation unless a separate advisory or compatibility reason requires it.

Tests to emphasize:

- hero image upload/change
- file size limits
- upload rejection behavior
- image processing
- public image rendering
- production-like Docker build after explicit approval

## Sanitization/CSS Family

Packages:

- `sanitize-html`
- `postcss`

Both site packages depend directly on `sanitize-html`. `postcss` is pulled through `sanitize-html` in each site package and is present in the production audit.

`npm outdated` reports `sanitize-html` current `2.17.0`, wanted/latest `2.17.4`, making this a good first-pass patch candidate. The later update should verify whether `postcss` moves to a non-vulnerable version and whether sanitized content behavior remains stable.

Tests to emphasize:

- create/edit post flows
- content with headings, links, lists, images, and embedded-safe HTML if supported
- category pages
- public post rendering
- admin preview/editor behavior

## Database/session Family

Packages:

- `better-sqlite3`
- `express-session`
- `better-sqlite3-session-store`

These packages are runtime critical, but they were not the primary captured audit targets in `Documents/DEPENDENCY_AUDIT_RESULTS.md`.

`npm outdated` reports:

- `better-sqlite3` current/wanted `11.10.0`, latest `12.10.0`.
- `express-session` current `1.18.2`, wanted/latest `1.19.0`.

Do not mix database/native module changes into the first security remediation unless an advisory requires it. `express-session` may be a reasonable later patch/minor cleanup, but it should still be tested carefully because login/session behavior is core admin functionality.

Tests to emphasize:

- admin login/logout
- session persistence
- CSRF-protected forms
- SQLite reads/writes
- post/category CRUD

## Dev-only Family

Packages:

- `nodemon`
- `picomatch`
- site-local `minimatch`
- site-local `brace-expansion`
- `lodash` if future audit output flags it

`picomatch` dropped out of the production audit with `--omit=dev` and appears tied to site-local `nodemon` chains. Site-local `minimatch` and `brace-expansion` copies are also dev-only, while root runtime copies remain production-relevant through the rendering stack.

Recommendation: handle dev-only cleanup in a separate commit after runtime vulnerabilities are addressed, unless the first remediation can update `nodemon` cleanly without broad lockfile churn.

## Recommended Commit Strategy

Recommended approach: Option B, split by risk family.

Suggested order:

1. Express/middleware family: `express` 4.x patch and resulting transitive changes.
2. Upload/sanitize family: `multer` and site-level `sanitize-html` patch updates.
3. Rendering/Handlebars family: `express-handlebars` / `handlebars` / `glob` / `minimatch` / `brace-expansion`, after compatibility review.
4. Dev-only cleanup: `nodemon` and dev-only transitive cleanup.

Why not one broad commit:

- Express routing/body parsing, rendering, uploads, and sanitization each have different failure modes.
- `express-handlebars` may require a major update or override decision.
- Smaller commits make rollback and manual testing clearer.

Why not too many micro-commits:

- Some transitive updates are parent-driven and need a coherent lockfile update.
- Express/body-parser/qs/path-to-regexp should probably be reviewed as one middleware family.
- `multer` and `sanitize-html` may be grouped if their updates are patch/minor and test results are clean.

## Required Checks Before Committing a Future Update

Before committing future dependency changes:

- Inspect `git diff package.json package-lock.json`.
- Inspect the full diff stat.
- Confirm no application code changed unexpectedly.
- Confirm no private files are staged.
- Run `npm audit --omit=dev --workspaces`.
- Run `npm audit --workspaces`.
- Run `npm ls` for updated ownership paths.
- Confirm package-lock and `npm ls` agree after the update.
- If source files are touched in the future, run `node --check` only on touched JavaScript files.
- Review whether CI still tolerates audit failures and whether that remains acceptable after remediation.

## Manual App Test Checklist After Future Updates

### Public

- Homepage for both sites.
- About page for both sites.
- Public post pages.
- Category pages.
- Search.
- `/sitemap.xml`.
- `/robots.txt`.
- Canonical tags.

### Admin

- Login/logout.
- Dashboard.
- Create/edit/delete post.
- Category create/delete.
- Hero image upload/change.
- Analytics page.
- User management if present.

### Runtime

- Sessions persist.
- CSRF-protected forms work.
- Uploads work.
- Image processing works.
- SQLite/database access works.
- Logs show no startup/runtime errors.

## Local Production-like Docker Test Requirement

Any runtime dependency update should eventually be tested with local production-like Docker before production deployment.

Docker commands are approval-required and were not run in this task.

Because `blog-core` is shared, runtime dependency updates in `blog-core` imply both sites should be tested. A production-like build is especially important for native or platform-sensitive packages such as Sharp and `better-sqlite3`, even if those packages are not included in the first remediation.

## Deployment Implications

- Dependency updates affect production image builds.
- Shared `blog-core` updates can affect both live services.
- Both services may need rebuild/deploy if shared runtime dependencies change.
- Do not mix dependency remediation with SSH key cleanup, CSP cleanup, SEO/content changes, or deployment documentation cleanup.
- Do not deploy because package updates appear successful locally.
- Deployment requires an explicit operator plan and explicit user approval.

## Open Questions

- Does a clean `npm ci` produce the same versions shown by current `npm ls`?
- Which exact versions should be targeted for `express`, `express-handlebars`, `multer`, and `sanitize-html`?
- Does updating `express-handlebars` resolve `handlebars`, `glob`, `minimatch`, and `brace-expansion` without overrides?
- Are npm overrides needed, or should parent package updates be preferred?
- Should Node 20 become the documented baseline?
- Should CI audit become blocking after remediation?
- Should dev-only vulnerabilities be handled in a separate commit?
- Should the first actual update reconcile the lockfile before or as part of the package update?
- Is Express 4.x sufficient to resolve the `path-to-regexp` advisory, or does that require an override or larger routing-stack decision?

## Recommended Next Task

Perform a controlled dependency update for the selected first scope.

Recommended prompt boundaries for that task:

- Allow edits only to relevant package manifests and `package-lock.json`.
- Do not modify application code unless the dependency update breaks compatibility and the user approves expanding scope.
- Do not run `npm audit fix`.
- Prefer parent package updates over overrides unless evidence shows parent updates cannot resolve the advisory.
- Run read-only audit/list commands after the update.
- Do not run Docker or deployment commands without explicit approval.
- Do not deploy until tests and review pass.
