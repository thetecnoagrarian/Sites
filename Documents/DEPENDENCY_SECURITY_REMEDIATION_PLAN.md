# Dependency Security Remediation Plan

> **Current-use note (2026-08-20):** The first targeted patch pass and the Node 24 runtime migration are complete locally. Use `Documents/DEPENDENCY_REMEDIATION_LOG.md` for completed changes and current remaining risk; this document remains the staged plan for unresolved dependency families.

## 1. Purpose

This document plans staged dependency/security remediation, including work that remains after the first targeted patch pass.

The goal is to address real dependency risk without breaking the two production sites, especially shared `blog-core` behavior that both Fruition Forest Garden and The Tecnoagrarian rely on.

This is not a fix commit. It is a sequencing, ownership, and test plan.

## 2. Safety Boundary

This is planning only.

- No dependencies were installed or updated.
- No `npm audit fix` was run.
- No `package.json` or `package-lock.json` changes were made.
- No application code was changed.
- No Docker commands were run.
- No deployment commands were run.
- No tests were run.
- Real secrets, runtime databases, uploads, backups, private keys, certificates, credential exports, and server-only files were not inspected.

Do not run `npm audit fix` blindly. Dependency remediation should be performed as a separate full-audit task with explicit approval.

## 3. Current Architecture Dependency Context

Confirmed from safe manifests and Docker/CI files:

- The repository is a private npm workspace.
- Workspace packages:
  - `blog-core`
  - `fruitionforestgarden`
  - `thetecnoagrarian`
- `blog-core` owns most shared runtime web dependencies.
- Both site packages depend on `@ffg/blog-core`.
- Both site packages also depend directly on `sanitize-html`.
- Production Docker builds use `npm ci --omit=dev --include=optional`.
- CI uses exact Node `24.19.0`.
- The production Dockerfile uses the immutable official Node `24.19.0` Alpine 3.23 multi-architecture image reference.
- Active package engines require Node `>=24.0.0 <25`.

Runtime dependencies matter more urgently than dev-only dependencies because production images omit dev dependencies.

Shared dependency changes can affect both live sites. A `blog-core` runtime dependency update should be treated as a two-site change unless deliberately deployed one site at a time.

## 4. Known Vulnerable Package Inventory

Prior user-provided audit/build output named these packages and reported a severity mix of moderate, high, and critical. This planning task did not run a fresh audit, so package-specific severity should be confirmed in Stage 1.

| Package | Severity from prior audit | Likely dependency type | Likely workspace/scope | Runtime relevance | Likely parent package if inferable from lockfile | Notes / risk |
|---|---|---|---|---|---|---|
| `brace-expansion` | Needs fresh audit; prior set includes moderate/high/critical | transitive | root and site dev paths | runtime for root transitive; dev-only under site `nodemon` paths | `minimatch` | Root lockfile has `node_modules/brace-expansion` as non-dev via `minimatch`; site-local copies appear under `nodemon` and are dev-only. |
| `handlebars` | Needs fresh audit; prior set includes moderate/high/critical | transitive | `blog-core` runtime through `express-handlebars` | runtime | `express-handlebars` | Affects server-side template rendering. Compatibility review required. |
| `lodash` | Needs fresh audit; prior set includes moderate/high/critical | transitive | root dev tooling | dev-only | `concurrently` | Likely not in production install because root `concurrently` is dev-only. Confirm with approved production audit. |
| `minimatch` | Needs fresh audit; prior set includes moderate/high/critical | transitive | root and site dev paths | runtime for root transitive; dev-only under site `nodemon` paths | `glob`, `nodemon` | Root `glob` path is non-dev and used by `express-handlebars`; site `nodemon` copies are dev-only. |
| `multer` | Needs fresh audit; prior set includes moderate/high/critical | direct | `blog-core` | runtime | direct dependency of `blog-core` | Upload handling and admin image/post workflows. High functional risk. |
| `path-to-regexp` | Needs fresh audit; prior set includes moderate/high/critical | transitive | `blog-core` runtime through `express` | runtime | `express` | Affects routing behavior. Requires Express compatibility review. |
| `picomatch` | Needs fresh audit; prior set includes moderate/high/critical | transitive | site dev tooling | dev-only based on lockfile paths | `anymatch`, `readdirp` under site `nodemon` trees | Likely dev-only. Confirm with approved audit before deprioritizing. |
| `postcss` | Needs fresh audit; prior set includes moderate/high/critical | transitive | both site packages through `sanitize-html` | runtime | `sanitize-html` | Runtime relevance because `sanitize-html` is a direct production dependency of both sites. |
| `qs` | Needs fresh audit; prior set includes moderate/high/critical | transitive | `blog-core` runtime through `express` / `body-parser` | runtime | `express`, `body-parser` | Affects query/body parsing. Requires request parsing regression checks. |
| `body-parser` | Needs fresh audit; prior set includes moderate/high/critical | transitive | `blog-core` runtime through `express` | runtime | `express` | Express body parsing path. Check form submissions, CSRF, admin workflows. |
| `express` | Needs fresh audit; prior set includes moderate/high/critical | direct | `blog-core` | runtime | direct dependency of `blog-core` | Core server framework. Any update can affect routing, middleware, sessions, static files, and body parsing. |

## 5. Direct Dependency Ownership

### Root `package.json`

Direct dev dependencies:

- `@playwright/test`
- `concurrently`

Root scripts include workspace installs, starts, dev starts, and Playwright commands. These are not production runtime dependencies, but they can affect local/CI testing.

### `blog-core/package.json`

Direct runtime dependencies:

- `express`
- `express-handlebars`
- `express-session`
- `bcryptjs`
- `multer`
- `sharp`
- `better-sqlite3`
- `better-sqlite3-session-store`
- `helmet`
- `compression`
- `morgan`
- `dotenv`
- `connect-flash`
- `csrf`
- `express-rate-limit`
- `pino`
- `slugify`

Direct dev dependencies:

- `pino-pretty`

Peer dependencies:

- `express`

Important direct packages checked:

- `express`: direct runtime dependency of `blog-core`.
- `express-handlebars`: direct runtime dependency of `blog-core`; pulls `handlebars`.
- `handlebars`: transitive through `express-handlebars`.
- `multer`: direct runtime dependency of `blog-core`.
- `better-sqlite3`: direct runtime dependency of `blog-core`.
- `sharp`: direct runtime dependency of `blog-core`.
- `helmet`: direct runtime dependency of `blog-core`.
- `express-rate-limit`: direct runtime dependency of `blog-core`.
- `express-session`: direct runtime dependency of `blog-core`.
- `connect-sqlite3`: not present in inspected package manifests or lockfile; this repo uses `better-sqlite3-session-store`.
- `body-parser`: transitive through `express`.
- `lodash`: not direct; transitive through root dev tooling.
- `postcss`: not direct; transitive through site `sanitize-html`.

### Fruition Forest Garden `package.json`

Direct runtime dependencies:

- `@ffg/blog-core`
- `sanitize-html`

Direct dev dependencies:

- `nodemon`

### The Tecnoagrarian `package.json`

Direct runtime dependencies:

- `@ffg/blog-core`
- `sanitize-html`

Direct dev dependencies:

- `nodemon`

## 6. Risk Categories

### A. Likely Safe Patch/Minor Dependency Updates

Candidate class only; confirm with a fresh approved audit:

- patch/minor updates to leaf transitive packages when parent package allows them
- dev-only tooling updates when they do not affect production install
- package-lock-only resolution updates when a parent range already permits the fixed version

Even likely-safe updates need a clean diff and targeted checks.

### B. Requires Compatibility Review

- `express`
- `express-handlebars`
- `handlebars`
- `multer`
- `sanitize-html`
- `sharp`
- `better-sqlite3`
- `better-sqlite3-session-store`

These affect app behavior, rendering, uploads, image processing, database access, or native build/runtime behavior.

### C. Runtime Security Priority

- `express`
- `body-parser`
- `qs`
- `path-to-regexp`
- `multer`
- `handlebars`
- `postcss` through `sanitize-html`

These appear in production-relevant dependency paths.

### D. Dev/Build-Only Cleanup

- `lodash` through `concurrently`
- site-local `picomatch` through `nodemon`
- site-local `brace-expansion` / `minimatch` through `nodemon`

These are likely lower production priority, but still worth resolving for local/CI hygiene.

### E. Transitive-Only Dependency Requiring Parent Package Update

- `handlebars` through `express-handlebars`
- `path-to-regexp`, `qs`, and `body-parser` through `express`
- `brace-expansion` through `minimatch`
- `picomatch` through `anymatch` / `readdirp`
- `postcss` through `sanitize-html`

Do not force transitive overrides unless the parent package cannot be updated safely and the risk justifies it.

### F. Should Not Be Changed Without Tests

- `express`
- `express-handlebars`
- `multer`
- `sharp`
- `better-sqlite3`
- `better-sqlite3-session-store`
- `sanitize-html`

These require at minimum local startup and manual workflow checks before deployment.

## 7. Package-Specific Notes

### `brace-expansion`

Transitive through `minimatch`. The lockfile shows both non-dev and dev-only copies. Inferred risk depends on which copy audit flags. Confirm whether the vulnerable instance is in the production install.

### `handlebars`

Transitive through `express-handlebars`, which is a direct `blog-core` runtime dependency. Affects server-side template rendering for both sites.

### `lodash`

Transitive through root `concurrently`, a dev dependency. Likely dev-only unless another path appears in a fresh audit.

### `minimatch`

Transitive through `glob` and `nodemon`. The `glob` path appears production-relevant through `express-handlebars`; `nodemon` paths are dev-only.

### `multer`

Direct `blog-core` runtime dependency and also referenced in site admin routes/middleware. Affects uploads, post creation/editing, image upload, and hero image workflows. Treat as runtime security priority with compatibility review.

### `path-to-regexp`

Transitive through `express`. Affects route matching. Express updates may alter this path; test public, auth, and admin routes.

### `picomatch`

Transitive through site dev tooling paths (`anymatch`, `readdirp`, likely via `nodemon`). Likely dev-only, but confirm with fresh audit output.

### `postcss`

Transitive through `sanitize-html`, which is a direct runtime dependency of both site packages. Inferred runtime relevance: sanitization dependency path may pull it into production install.

### `qs`

Transitive through `express` and `body-parser`. Affects query parsing and form/body parsing. Test search, pagination, login, admin forms, CSRF-protected forms, and post/category operations.

### `body-parser`

Transitive through `express`. Affects request parsing. This app uses Express JSON/urlencoded middleware and admin forms, so request parsing needs regression checks.

### `express`

Direct `blog-core` runtime dependency and central app framework. Affects routing, middleware, sessions, static serving, request parsing, health checks, sitemap/robots routes, and error handling.

### `sharp`

Direct `blog-core` runtime dependency and used in shared and site image processing code. Docker/native Alpine behavior is important because production installs Sharp's platform-specific optional packages for Linux musl.

### `better-sqlite3`

Direct `blog-core` runtime dependency and used in shared/site database code. Native build/runtime behavior needs extra caution in Docker.

Current validated state as of 2026-08-20:

- Upgraded from `11.10.0` to published stable `12.11.1`; the proposed `12.12.0` target was not published.
- Bundled SQLite moved from `3.49.2` to `3.53.2`; `better-sqlite3-session-store@0.1.0` did not change.
- Local lifecycle, transaction rollback, session-store lifecycle, and disposable `11.10.0` -> `12.11.1` -> `11.10.0` forward/rollback compatibility gates passed.
- Under Node `24.19.0` ABI `137`, both Linux musl ARM64 Mode B images selected the published `better-sqlite3@12.11.1` prebuilt, loaded it, passed authenticated database/session/post flows across container restart, and retained clean integrity and foreign-key checks.
- Preliminary QEMU/emulated Linux musl AMD64 builds selected the x64 prebuilt; both site images loaded the addon, completed database read/write, and started successfully. Final native AMD64 validation remains required before production deployment.
- Unchanged Multer and Sharp authenticated regressions passed. `better-sqlite3` remains absent from full and production npm audit findings.

## 8. Recommended Remediation Sequence

### Stage 0: Baseline

- Confirm clean local working tree.
- Record current working deployment version.
- Confirm both production sites are healthy.
- Capture current audit output later with approved commands.
- Keep dependency remediation separate from documentation commits, SSH key cleanup, CSP cleanup, and deployment tasks.

### Stage 1: Read-Only Audit With Commands Approved Separately

- Run approved audit commands only after user approval.
- Capture direct/transitive paths.
- Identify which findings remain after production install assumptions.
- Do not fix yet.

### Stage 2: Low-Risk Manifest / Lockfile Updates

- Update direct dependencies with clear patch/minor upgrades first.
- Avoid major upgrades unless required to fix a high-risk vulnerability.
- Update lockfile intentionally.
- Keep changes small and grouped by dependency or risk category.

### Stage 3: Runtime-Critical Packages

Handle with extra review:

- `express`, `body-parser`, `qs`, `path-to-regexp`
- `express-handlebars`, `handlebars`
- `multer`
- `sanitize-html`, `postcss`
- `sharp`, `better-sqlite3`, `better-sqlite3-session-store`

### Stage 4: Test Locally

- Run syntax checks.
- Start both apps locally if approved.
- Check public pages.
- Check admin login/logout.
- Check post creation/editing/deletion.
- Check category operations.
- Check uploads and image processing.
- Check hero image flow.
- Check sitemap/robots/canonical behavior.
- Check analytics page if applicable.

### Stage 5: Local Production-Like Docker Test

Approval required.

- Use `docker-compose.local-prod.yml`.
- Verify both sites if the dependency change affects shared `blog-core`.
- Pay special attention to native packages such as `sharp` and `better-sqlite3`.

### Stage 6: Production Deploy

Approval required.

- Deploy one service first or both intentionally.
- If the dependency change affects shared `blog-core`, plan for both sites to be rebuilt eventually.
- Verify health and crawlability after deployment.

## 9. Test Checklist

### Public Site

- homepage
- about page
- post pages
- category pages
- search
- `/sitemap.xml`
- `/robots.txt`
- canonical tags

### Admin

- login/logout
- dashboard
- create post
- edit post
- delete post
- categories
- hero image upload/change
- analytics page
- user management if present

### Runtime

- container health
- logs
- SQLite access
- upload paths
- image processing
- session persistence
- CSRF behavior

### Security

- no public `.env` exposure
- sensitive probe paths still blocked
- admin remains protected
- rate limiting still works
- CSP remains acceptable

## 10. Deployment Risk

Dependency remediation can break both sites.

Specific risks:

- Shared `blog-core` dependency changes may require both sites to be rebuilt.
- Active Docker, CI, and package-engine declarations are aligned on Node 24; native dependencies still require platform-specific validation.
- Docker/native packages may behave differently than local Node.
- `sharp` relies on npm's platform-specific optional packages in the production Dockerfile.
- `better-sqlite3` and image-processing dependencies can fail differently in Docker than on macOS.
- CI currently tolerates some audit/test failures, so CI success should not be treated as proof of safety.

Do not mix dependency remediation with:

- SSH/deploy key cleanup
- CSP cleanup
- deployment procedure cleanup
- documentation consolidation
- unrelated application features

## 11. Commands For Later Approval

Do not run these as part of this planning task.

Future approval-required examples:

```bash
npm audit --workspaces
npm outdated --workspaces
npm ls express handlebars multer qs path-to-regexp
node --check blog-core/src/app.js
```

Depending on the approved scope, additional targeted commands may be needed for workspace-specific audits or local startup checks.

## 12. Open Questions

- Which native Linux musl AMD64 environment will run the final Node 24 deployment-candidate gate?
- Which vulnerabilities remain in production install after `npm ci --omit=dev`?
- Which vulnerabilities are dev-only?
- Are current CI audit steps too tolerant?
- Should audit failures become blocking later?
- Which admin/image-upload flows need manual testing before deploy?
- Should dependency remediation be split into multiple small commits?
- Should transitive remediation use parent package updates only, or are overrides ever acceptable here?
- Should both sites be deployed together after shared dependency changes?

## 13. Recommended Next Task

Refresh the read-only dependency evidence, then prepare a narrowly scoped plan for one unresolved runtime family identified in `Documents/DEPENDENCY_REMEDIATION_LOG.md`.

Recommended next prompt:

```text
Read AGENTS.md first and follow it strictly.
Review the current dependency audit and remediation log, then run only the approved read-only dependency audit commands needed to refresh them.
Do not fix, install new packages, deploy, run Docker, or modify files.
Capture current audit paths, direct/transitive ownership, and production/dev relevance.
```

After refreshing the evidence, prepare a targeted update plan for one unresolved dependency family with specific version candidates, expected lockfile changes, and a test/deployment checklist.
