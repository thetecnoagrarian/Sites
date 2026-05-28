# Environment and Secrets Map

This document maps environment-variable structure, secret boundaries, and safe handling rules for the monorepo without exposing secret values.

It is based on safe inspection of approved docs, templates, package manifests, Compose files, CI configuration, nginx configuration, and non-runtime source references. Real `.env` files, `Documents/SECRETS.md`, databases, uploads, backups, private keys, certificates, and credential exports were not opened.

## 1. Purpose

This map exists to help Codex and future maintainers understand environment-variable structure without exposing secrets.

Real secrets are not required for normal documentation, architecture mapping, linting, testing, or refactoring. Future work should use variable names, purposes, paths, source references, and placeholders rather than real values.

## 2. Sensitive Files and Access Policy

Sensitive files by path only:

- `.env`
- `.env.local`
- `.env.local.backup`
- `fruitionforestgarden/.env`
- `fruitionforestgarden/.env.backup`
- `thetecnoagrarian/.env`
- `thetecnoagrarian/.env.backup`
- `Documents/SECRETS.md`

Access policy:

- Do not open these files.
- Do not summarize these files.
- Do not copy these files.
- Do not commit these files.
- Do not print or expose their contents in chat, docs, logs, diffs, screenshots, or generated examples.
- Paths may be listed for inventory and safety documentation.
- Values must remain private.

## 3. Template and Example Files

Safe template/example files inspected:

- `Documents/ENVIRONMENT_TEMPLATE.md` - general production environment template. Needs Review: it includes variables that are not all referenced by inspected source/Compose, and it omits some variables used by site examples or source.
- `fruitionforestgarden/env.example` - site-specific example for Fruition Forest Garden. Needs Review: it uses `DATABASE_URL`, while inspected source and Compose primarily use `DATABASE_PATH`.
- `thetecnoagrarian/env.example` - site-specific example for The Tecnoagrarian. Needs Review: it uses `DATABASE_URL`, while inspected source and Compose primarily use `DATABASE_PATH`.

Template handling rule: document variable names and purpose only. Do not copy literal template values into migration documentation.

## 4. Environment Variable Inventory

| Variable name | Purpose / inferred purpose | Referenced in files | Source type | Scope | Secret classification | Notes / open questions |
|---|---|---|---|---|---|---|
| `NODE_ENV` | Selects runtime mode and production behavior. | `package.json`; site package manifests; `docker-compose.yml`; `docker-compose.prod.yml`; `docker-compose.local-prod.yml`; `docker/Dockerfile.prod.site`; `blog-core/src/app.js`; site `src/app.js`; logger files; templates | compose, source, template, package | root, shared core, both sites, production, local | non-secret config | Used broadly. |
| `PORT` | HTTP port for each site process/container. | site package manifests; site `src/app.js`; Compose files; `docker/Dockerfile.prod.site`; site env examples | compose, source, template, package | both sites, production, local | non-secret config | Fruition Forest Garden source default and Compose port settings need review for canonical local behavior. |
| `APP_ROLE` | Inferred role/mode flag used by site role guard middleware. | `docker-compose.yml`; `docker-compose.prod.yml`; `docker-compose.local-prod.yml`; site env examples; site `src/middleware/roleGuard.js` | compose, source, template | both sites, production, local | non-secret config | Needs Review: clarify accepted values and whether this differs from `NODE_ENV`. |
| `SESSION_SECRET` | Express session signing secret. | `Documents/ENVIRONMENT_TEMPLATE.md`; site env examples; Compose files; `blog-core/src/app.js` | template, compose, source | shared core, both sites, production, local | secret | Must be represented only as `[SESSION_SECRET]`. Local Compose has a fallback placeholder; production expects external env. |
| `CSRF_SECRET` | Intended CSRF secret/config value. | `Documents/ENVIRONMENT_TEMPLATE.md` | template, docs | production, unknown | secret | Needs Review: inspected `blog-core/src/app.js` generates/stores CSRF secrets in session and did not show a direct `process.env.CSRF_SECRET` reference. |
| `DATABASE_PATH` | SQLite database file path used by app initialization. | `Documents/ENVIRONMENT_TEMPLATE.md`; `docker-compose.yml`; `docker-compose.prod.yml`; `docker-compose.local-prod.yml`; site `src/app.js`; site `src/models/database.js`; docs | template, compose, source, docs | shared core, both sites, production, local | operational-sensitive | It points to runtime state. Do not open the database file at this path. |
| `DATABASE_URL` | Site example variable for database location. | `fruitionforestgarden/env.example`; `thetecnoagrarian/env.example` | template | both sites, unknown | operational-sensitive | Needs Review: source/Compose inspection found `DATABASE_PATH`, not `DATABASE_URL`, as the active variable. |
| `UPLOADS_PATH` | Upload directory path used by app and admin routes. | `Documents/ENVIRONMENT_TEMPLATE.md`; `docker-compose.prod.yml`; `docker-compose.local-prod.yml`; site `src/app.js`; site admin routes; docs | template, compose, source, docs | shared core, both sites, production, local | operational-sensitive | Runtime/user-generated path. Do not inspect upload contents. |
| `UPLOAD_PATH` | Upload directory variable used in root local Compose. | `docker-compose.yml`; docs/open questions | compose, docs | local | operational-sensitive | Needs Review: inspected app code uses `UPLOADS_PATH`, not `UPLOAD_PATH`. |
| `LOG_LEVEL` | Controls logger verbosity. | `Documents/ENVIRONMENT_TEMPLATE.md`; Compose files; `blog-core/src/utils/logger.js`; site logger files; docs | template, compose, source, docs | shared core, both sites, production, local | non-secret config | Local and production differ by intended verbosity. |
| `MAX_FILE_SIZE` | Upload size limit. | `Documents/ENVIRONMENT_TEMPLATE.md`; Compose files; `blog-core/src/middleware/upload.js`; site admin routes; docs | template, compose, source, docs | shared core, both sites, production, local | non-secret config | Local/production values may differ by workflow. |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit time window. | `Documents/ENVIRONMENT_TEMPLATE.md`; Compose files; `blog-core/src/app.js`; docs | template, compose, source, docs | shared core, both sites, production, local | non-secret config | Confirm canonical defaults in a later environment pass. |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per rate-limit window. | `Documents/ENVIRONMENT_TEMPLATE.md`; Compose files; `blog-core/src/app.js`; docs | template, compose, source, docs | shared core, both sites, production, local | non-secret config | Local and production differ intentionally in Compose; confirm desired values in runbook. |
| `TRUSTED_IPS` | Trusted IP allowlist for bypass behavior. | `Documents/ENVIRONMENT_TEMPLATE.md`; `docker-compose.prod.yml`; `docker-compose.local-prod.yml`; `blog-core/src/app.js`; docs | template, compose, source, docs | shared core, production, local | operational-sensitive | Do not document real allowlist values. Needs Review: source contains defaults; move fully to env config if possible. |
| `TEST_URL` | Playwright target URL in CI/E2E testing. | `.github/workflows/ci-cd.yml`; docs | CI, docs | CI, testing | non-secret config | Public URL may be non-secret if intentionally public; still avoid overclaiming current status. |
| `BASE_URL` | Public base URL for OG/social metadata. | site env examples; `fruitionforestgarden/src/middleware/ogTags.js` | template, source | Fruition Forest Garden, site examples | non-secret config | Needs Review: The Tecnoagrarian has example variable but inspected OG source uses hardcoded public URL strings. |
| `ADMIN_EMAIL` | Inferred admin account identifier in site examples. | site env examples | template | both sites, unknown | operational-sensitive | Needs Review: not found in inspected source references. Treat account identifiers cautiously. |
| `ADMIN_PASSWORD` | Admin password seed/setup value. | `Documents/ENVIRONMENT_TEMPLATE.md`; `thetecnoagrarian/src/database/init.js`; docs | template, source, docs | The Tecnoagrarian, setup, unknown | secret | Must be represented only as `[PASSWORD]` or `[ADMIN_PASSWORD]`; never document actual value. |
| `BACKUP_RETENTION_DAYS` | Intended backup retention config. | `Documents/ENVIRONMENT_TEMPLATE.md`; docs | template, docs | backup, unknown | non-secret config | Needs Review: not found in inspected app source/Compose references. |
| `BACKUP_SCHEDULE` | Intended backup scheduling config. | `Documents/ENVIRONMENT_TEMPLATE.md`; docs | template, docs | backup, unknown | non-secret config | Needs Review: not found in inspected app source/Compose references. |
| `HEALTH_CHECK_INTERVAL` | Intended health check timing config. | `Documents/ENVIRONMENT_TEMPLATE.md`; docs | template, docs | monitoring, unknown | non-secret config | Needs Review: Compose health checks are explicit in YAML; this variable was not found in inspected source/Compose references. |
| `SITE_DIR_NAME` | Docker build argument selecting which site source to copy/build. | `docker-compose.prod.yml`; `docker-compose.local-prod.yml`; `docker/Dockerfile.prod.site`; docs | compose, Dockerfile, docs | Docker build | non-secret config | Build argument, not runtime secret. |
| `SITE_PORT` | Docker build argument / Dockerfile exposed port. | `docker-compose.prod.yml`; `docker-compose.local-prod.yml`; `docker/Dockerfile.prod.site`; docs | compose, Dockerfile, docs | Docker build | non-secret config | Build argument, not runtime secret. |

## 5. Variable Naming Mismatches

Confirmed or likely mismatches from safe inspection:

- `UPLOAD_PATH` vs `UPLOADS_PATH`: root `docker-compose.yml` uses `UPLOAD_PATH`; inspected app source and production/local-production Compose use `UPLOADS_PATH`.
- `DATABASE_URL` vs `DATABASE_PATH`: site `env.example` files use `DATABASE_URL`; inspected app source and Compose use `DATABASE_PATH`.
- `CSRF_SECRET`: present in `Documents/ENVIRONMENT_TEMPLATE.md`, but no direct `process.env.CSRF_SECRET` reference was found in inspected source.
- `ADMIN_EMAIL`: present in site examples, but no source reference was found in inspected env-name search.
- `ADMIN_PASSWORD`: present in `Documents/ENVIRONMENT_TEMPLATE.md` and referenced by The Tecnoagrarian database init source; not found in Fruition Forest Garden source references during this pass.
- `BACKUP_RETENTION_DAYS`, `BACKUP_SCHEDULE`, and `HEALTH_CHECK_INTERVAL`: present in `Documents/ENVIRONMENT_TEMPLATE.md`, but not found in inspected app source/Compose references.
- Production Compose references `.env`; local production-like Compose references `.env.local`; root local Compose embeds environment entries directly.
- Local and production Compose files differ on port mapping, log level, rate-limit settings, data mounting, and upload variable naming.

Variables referenced by source/Compose but missing or incomplete in some templates:

- `UPLOADS_PATH` appears in the general template and production/local-production Compose, but site `env.example` files do not list it.
- `DATABASE_PATH` appears in the general template and source/Compose, but site `env.example` files use `DATABASE_URL` instead.
- `TRUSTED_IPS` appears in the general template and production/local-production Compose, but site `env.example` files do not list it.
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` appear in the general template and Compose, but site `env.example` files do not list them.
- `MAX_FILE_SIZE` and `LOG_LEVEL` appear in the general template and source/Compose, but site `env.example` files do not list them.

Variables present in templates but not found in source/Compose:

- `CSRF_SECRET`
- `ADMIN_EMAIL`
- `BACKUP_RETENTION_DAYS`
- `BACKUP_SCHEDULE`
- `HEALTH_CHECK_INTERVAL`

Needs Review: validate whether these are intentionally reserved for future workflows, stale, or used by operational scripts that were outside this task's inspection scope.

## 6. Secret Classification Model

Secret:

- Passwords.
- Tokens.
- Private keys.
- Session secrets.
- CSRF secrets.
- OAuth/client secrets.
- Any credential that grants account, server, API, database, or admin access.

Operational-sensitive:

- Server IPs.
- Trusted IP allowlists.
- Deploy usernames.
- Internal hostnames.
- Account identifiers.
- Runtime paths that reveal server layout.
- Admin account identifiers.

Non-secret config:

- Ports.
- Log levels.
- Max file size.
- Environment mode.
- Rate-limit numeric settings.
- Public base URLs when intentionally public.
- Docker build arguments that do not reveal credentials.

Runtime state:

- Databases.
- Uploads.
- Logs.
- Backups.
- Session stores.
- Analytics tables.
- Generated test output.

Runtime state is not automatically secret, but it is not source and should not be inspected or committed casually.

## 7. Safe Placeholder Rules

Use placeholders instead of values:

- `[SESSION_SECRET]`
- `[CSRF_SECRET]`
- `[TRUSTED_IP]`
- `[SERVER_IP]`
- `[SSH_USER]`
- `[TOKEN]`
- `[PASSWORD]`
- `[DATABASE_PATH]`
- `[UPLOADS_PATH]`
- `[ADMIN_PASSWORD]`
- `[BASE_URL]`

Do not invent real values. Do not convert placeholders into live operational claims.

## 8. Codex Handling Rules

Future Codex sessions may:

- List sensitive paths.
- Document variable names and purposes.
- Document where variables are referenced.
- Compare templates to source references.
- Propose missing placeholders.
- Propose `.env.example` or template changes.
- Classify variables as secret, operational-sensitive, non-secret config, runtime state, or unknown.

Future Codex sessions must not:

- Open real `.env` files.
- Read `Documents/SECRETS.md`.
- Print secret values.
- Ask the user to paste secrets into chat.
- Commit secret-bearing files.
- Run deploy commands without explicit approval.
- Run destructive commands without explicit approval.
- Inspect database files, upload contents, backups, private keys, certificates, or credential exports.

## 9. Git and Docker Ignore Coverage

Needs Review: `.gitignore` and `.dockerignore` were not in the approved inspection list for this task, so their contents were not opened.

From safe documentation and inventory only, the repo appears to have generated/runtime areas that should be ignored or handled carefully:

- `.env` and `.env.*`
- SQLite database files.
- Upload directories.
- Backup directories.
- Logs.
- `node_modules/`.
- Playwright reports and test results.
- Screenshots and generated artifacts.

Do not modify ignore files during this task. A future ignore-coverage audit should inspect `.gitignore`, `.dockerignore`, and site-level ignore files only after the user explicitly approves that scope.

## 10. Open Questions

- Are `Documents/ENVIRONMENT_TEMPLATE.md` and the two site `env.example` files current?
- Should `UPLOAD_PATH` in `docker-compose.yml` be corrected to `UPLOADS_PATH`, or is the current local default behavior intentional?
- Should site `env.example` files use `DATABASE_PATH` instead of `DATABASE_URL`?
- Should trusted-IP/default-origin values move fully into environment config rather than source defaults?
- Is `CSRF_SECRET` intentionally reserved, or should it be removed/implemented consistently?
- Should `SESSION_SECRET` and CSRF handling be documented in one canonical template?
- Should local and production Compose files share a canonical env template?
- Should `ADMIN_PASSWORD` be documented only as a setup-time variable, and should it apply to both sites or only one?
- Are backup and health-check variables stale, future-facing, or used by scripts outside this task's inspected scope?
- Should a future `.env.example` consolidation happen after documentation migration?
- Should ignore coverage be audited after this map, including root and site-level `.gitignore`/`.dockerignore` files?
