# Documentation Audit

This document audits the project documentation after the Cursor-to-Codex migration foundation.

It identifies active guidance, historical context, stale or conflicting information, and consolidation candidates, and records approved archive batches.

No real `.env` files, `Documents/SECRETS.md`, runtime databases, uploads, backups, private keys, certificates, credential exports, or secret values were inspected.

## 1. Purpose

This audit exists so future Codex work can know which docs to trust first.

The goals are:

- identify active source-of-truth guidance
- identify historical/contextual documentation
- identify stale, conflicting, or sensitive-adjacent guidance
- identify consolidation candidates
- preserve useful history without treating every older instruction as current
- prepare for later dependency/security remediation

This audit is the current classification record and archive log. It does not authorize future cleanup or operational changes beyond an explicitly approved task.

> Documentation-health checkpoint (2026-11-06): use `AGENTS.md` for safety and
> authorization, `Documents/MONOREPO_CONTEXT.md` for orientation,
> `Documents/ARCHITECTURE_MAP.md` for topology and trust boundaries,
> `Documents/PRODUCTION_DEPLOYMENT_MODEL.md` for deployment concepts,
> `Documents/DEPLOYMENT_RUNBOOK.md` for executable gates and rollback,
> `Documents/BACKUP_SYSTEM_GUIDE.md` for backup/restore architecture, and
> `Documents/SEO_CRAWLABILITY_NOTES.md` for SEO-specific behavior. This audit is
> a dated documentation-health record, not runtime authority.
> The date-policy implementation is deployed: public `Posted` is
> gone, Event remains, conditional Published support is live, and post sitemap
> entries omit `lastmod`. Corpus-wide publication recovery is abandoned; only
> FFG post ID 3 currently has owner-supported reader value for a historical
> publication date. Its controlled operation completed on 2026-09-29 with the
> owner-attested date-only value `2024-09-22`; other historical publication
> facts remain unestablished. The factual partial `BlogPosting` implementation
> for detail pages is deployed and verified at `6be6ce9`. It uses
> reviewed Public Person authors, explicit Person publisher facts, and reviewed
> publication facts without Event/legacy timestamp fallbacks or `dateModified`.
> Fruition Forest Garden's repository-local WebP display/social defaults omit
> the archival PNG at runtime. Its deployed persistent seasonal-hero store uses
> the existing uploads volume, atomic generation selection, Express-protected
> retained source, backup coverage, and explicit reset-to-default behavior.
> Backup hardening commit `88bc59e` is also deployed; the November 3 preflight
> passages remain dated evidence of its then-pending rollout, not current status.
> Production ingress is host nginx to loopback-only application ports, with
> application static files and uploads served through Express. Tracked nginx
> material is reference/example material only.
> Dated audit batches below remain historical classification records.

## 2. Current Documentation Landscape

| File path | Apparent role | Current status | Recommended future role | Risk level | Notes |
|---|---|---|---|---|---|
| `AGENTS.md` | Active source of truth | Active | Highest-priority repo instruction file | High importance, low content risk | Read first for every task. Contains safety, secret, Git, testing, deployment, and migration rules. |
| `Documents/REPO_INVENTORY.md` | Inventory / orientation | Active | Keep as repo map and safe path inventory | Low | Useful for quick orientation and sensitive path-only listings. |
| `Documents/MONOREPO_CONTEXT.md` | Orientation / context | Active | Keep as high-level project context | Low | Explains why both live sites share the monorepo, how `blog-core` fits, and the current next-work checkpoint. |
| `Documents/ARCHITECTURE_MAP.md` | Architecture map | Active | Keep as topology, persistence, and trust-boundary authority | Medium | Captures code/config structure and known mismatches. Should be refreshed after architecture changes. |
| `Documents/ENVIRONMENT_AND_SECRETS_MAP.md` | Environment and secrets map | Active | Keep as secret-boundary source | High importance, medium content risk | Correctly avoids values and documents variable mismatches. Needs refresh after env template changes. |
| `Documents/DEPLOYMENT_RUNBOOK.md` | Operational runbook | Active but cautious | Keep as active deployment planning doc | High | Safe placeholder-first runbook. Production actions still require explicit approval. |
| `Documents/CODEX_WORKFLOW.md` | Codex workflow | Active | Keep as active Codex operating procedure | Medium | Defines startup, scope, audit, commit, dependency, and deployment boundaries. |
| `Documents/archive/migration/CURSOR_TO_CODEX_MIGRATION.md` | Migration/workflow history | Archived | Preserve as historical context; current workflow lives in active Codex guidance | Low | The migration foundation and documentation audit are complete. |
| `Documents/AGENT_ORCHESTRATION_WORKFLOW.md` | Reusable workflow template | Active | Keep as project-local copy and possible template seed | Low | Captures human + ChatGPT + Codex + Git + docs operating model. |
| `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md` | Broad project history | Archived | Preserve as historical context only | High | Current guidance is distributed across focused docs; sensitive-adjacent and stale operational detail must not control current work. |
| `Documents/archive/troubleshooting/LOCAL_SETUP_QUICKSTART.md` | Local production-like setup history | Archived | Preserve as historical setup context | Medium | Current local production-like and isolated testing guidance lives in the runbook. |
| `Documents/archive/troubleshooting/LOCAL_DOCKER_SYNC_GUIDE.md` | Local Docker workflow history | Archived | Preserve as historical setup context | High | Contains superseded direct Docker/deployment instructions and is not current authority. |
| `Documents/BACKUP_SYSTEM_GUIDE.md` | Backup architecture and planning guide | Active but cautious | Keep as the application-backup architecture reference | High | Records the deployed host-managed hardening and future off-host/restore gates; it does not authorize backup, restore, or deletion actions. |
| `Documents/GITHUB_AUTHENTICATION_SETUP.md` | GitHub auth reference | Needs Review | Sensitive-adjacent reference or historical setup note | High | Contains account, SSH, key path, and auth workflow details. Do not reproduce private details in future docs. |
| `Documents/archive/deployment/POST_LAUNCH_CLEANUP.md` | Cleanup/troubleshooting history | Archived | Preserve as migration-era cleanup context | High | Destructive cleanup instructions must not be treated as current operational guidance. |
| `Documents/ANALYTICS_CLEANUP_GUIDE.md` | Analytics cleanup planning guide | Active but cautious | Keep as placeholder-only planning reference | High | Tracked analytics models, middleware, routes, and cleanup script still exist. The guide does not authorize database mutation or claim live state. |
| `Documents/archive/troubleshooting/DIRECTORY_AUTO_CREATION_FIX.md` | Troubleshooting / change history | Archived | Preserve as historical technical context | Medium | Current source still implements the fix; the archived note must not be used to inspect real env files. |
| `Documents/ENVIRONMENT_TEMPLATE.md` | Reference/template doc | Needs Review | Validate or replace with canonical env example | High importance, medium content risk | Contains placeholder-style values, but migration docs found variables that appear stale, missing, or mismatched. |
| `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md` | Credential/admin workflow guide | Needs Review | Sensitive-adjacent historical/reference doc | High | Contains admin identifier workflow and password-change command patterns. Do not treat as active without review and explicit approval. |

### 2A. Documentation Archive Batch 1 - 2026-08-17

Batch 1 moved four historical documents into categorized archive folders without deleting their content:

| Archived document | Current canonical replacement |
|---|---|
| `Documents/archive/migration/CURSOR_TO_CODEX_MIGRATION.md` | `AGENTS.md`, `Documents/CODEX_WORKFLOW.md`, and this audit |
| `Documents/archive/deployment/DEPLOYMENT_DISCOVERY.md` | `Documents/DEPLOYMENT_RUNBOOK.md` and `Documents/PRODUCTION_DEPLOYMENT_MODEL.md` |
| `Documents/archive/troubleshooting/DIRECTORY_AUTO_CREATION_FIX.md` | Current source plus the local workflow in `Documents/DEPLOYMENT_RUNBOOK.md` |
| `Documents/archive/seo/GOOGLE_INDEXING_DIAGNOSTIC.md` | `Documents/SEO_CRAWLABILITY_NOTES.md` |

Tracked Markdown under `Documents/` changed from 27 active and 0 archived files to 23 active and 4 archived files. This is a 14.8% reduction from the original active-doc baseline. The archive remains historical context, not current operational authority.

### 2B. Documentation Archive Batch 2 - 2026-08-17

Batch 2 moved three completed setup and cleanup records into existing archive categories:

| Archived document | Current canonical replacement |
|---|---|
| `Documents/archive/troubleshooting/LOCAL_SETUP_QUICKSTART.md` | Local and isolated test guidance in `Documents/DEPLOYMENT_RUNBOOK.md` |
| `Documents/archive/troubleshooting/LOCAL_DOCKER_SYNC_GUIDE.md` | Mode A, Mode B, and production-like workflow in `Documents/DEPLOYMENT_RUNBOOK.md` |
| `Documents/archive/deployment/POST_LAUNCH_CLEANUP.md` | Deployment, rollback, and destructive-action boundaries in `Documents/DEPLOYMENT_RUNBOOK.md` |

Tracked Markdown under `Documents/` changed from 23 active and 4 archived files to 20 active and 7 archived files. This is a 25.9% reduction from the original 27-document active baseline. The remaining dependency workstream was not archived because unresolved runtime risk remains documented there.

### 2C. Documentation Archive Batch 3 - 2026-08-17

Batch 3 moved two superseded documents into new archive categories after transferring the only durable current rule that was not already represented in focused documentation:

| Reviewed document | Classification | Basis |
|---|---|---|
| `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md` | `CONSOLIDATE_THEN_ARCHIVE` | Focused docs supersede its broad operational role; its unique CSS maintenance rule moved to the architecture map. |
| `Documents/BACKUP_SYSTEM_GUIDE.md` | `KEEP_ACTIVE` | Active public-safe backup architecture and recovery guidance. Live production behavior was audited and TTA continuity was restored on 2026-11-03. At the later 2026-11-03 preflight, hardening commit `88bc59e` had been implemented, committed, and pushed; production remained at `5ddd651` and rollout still required separate authorization. |
| `Documents/ANALYTICS_CLEANUP_GUIDE.md` | `KEEP_ACTIVE` | It is now placeholder-only planning, and the tracked analytics models, middleware, routes, and cleanup script still exist. |
| `Documents/DEPENDENCY_SECURITY_REMEDIATION_PLAN.md` | `KEEP_ACTIVE` | Its staged model still covers unresolved dependency families; the current-use note points to the remediation log for present status. |
| `Documents/archive/dependencies/TARGETED_DEPENDENCY_UPDATE_PLAN.md` | `ARCHIVE_NOW` | The first targeted pass is complete and its current evidence and remaining risks are recorded in active dependency docs. |

| Archived document | Current canonical replacement |
|---|---|
| `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md` | Current focused docs; its CSS maintenance rule now lives in `Documents/ARCHITECTURE_MAP.md` |
| `Documents/archive/dependencies/TARGETED_DEPENDENCY_UPDATE_PLAN.md` | `Documents/DEPENDENCY_REMEDIATION_LOG.md` for completed work and remaining risk, plus `Documents/DEPENDENCY_SECURITY_REMEDIATION_PLAN.md` for the unresolved workstream |

Tracked Markdown under `Documents/` changed from 20 active and 7 archived files to 18 active and 9 archived files. This is a 33.3% reduction from the original 27-document active baseline. `Documents/BACKUP_SYSTEM_GUIDE.md` and `Documents/ANALYTICS_CLEANUP_GUIDE.md` remain active as placeholder-only planning references; neither authorizes production operations. Unresolved dependency evidence also remains active.

### 2D. Historical Cleanup Classification Update - 2026-06-12

This update reflects later dependency remediation, logging redaction, CSP cleanup, Search Console fixes, `/index.html` redirect work, and live nginx non-www-to-www canonical redirects.

Context confirmed for that dated update:

- `origin/main` is synchronized at `ec9d67f Redirect index.html to homepage`.
- `/index.html` now redirects to `/` on both public sites.
- Non-www HTTP and HTTPS now redirect to HTTPS `www` at the nginx edge for both sites.
- `Search Console` "Page with redirect" for `http://www.thetecnoagrarian.com/` is expected and should not be treated as a failure.
- CSP `form-action` cleanup is deployed and documented.
- Logging redaction cleanup is deployed and documented.
- Some live nginx changes happened directly on the server and should be documented only in sanitized, public-safe form.

This section is preserved as historical classification evidence. The newer
documentation-health checkpoint at the top of this file controls when facts
conflict.

#### Public Tracked Docs To Keep Active

| File path | Current role | Cleanup recommendation |
|---|---|---|
| `AGENTS.md` | Highest-priority safety and task instruction source | Keep active. |
| `Documents/CODEX_WORKFLOW.md` | Codex operating procedure | Keep active. |
| `Documents/AGENT_ORCHESTRATION_WORKFLOW.md` | Human + ChatGPT + Codex + Git workflow template | Keep active. |
| `Documents/REPO_INVENTORY.md` | Safe repo and path inventory | Keep active; refresh when files are archived or renamed. |
| `Documents/MONOREPO_CONTEXT.md` | High-level monorepo context | Keep active. |
| `Documents/ARCHITECTURE_MAP.md` | Architecture map | Keep active; refresh after architecture-level source/config changes. |
| `Documents/ENVIRONMENT_AND_SECRETS_MAP.md` | Environment and secret-boundary map | Keep active. |
| `Documents/PRODUCTION_DEPLOYMENT_MODEL.md` | Public-safe production deployment model | Keep active; update for `/index.html`, non-www-to-www nginx redirects, and latest Search Console interpretation. |
| `Documents/DEPLOYMENT_RUNBOOK.md` | Agent-safety deployment boundary and placeholder-first planning doc | Keep active, but not as the exact private operator runbook. |
| `Documents/SEO_CRAWLABILITY_NOTES.md` | Active SEO/crawlability state | Keep active; update to mark sitemap/canonical, `/index.html`, and non-www redirects as deployed/current. |
| `Documents/DEPENDENCY_REMEDIATION_LOG.md` | Chronological remediation and production verification log | Keep tracked as a log, but do not treat as the single current-status source. |
| `Documents/DEPENDENCY_AUDIT_RESULTS.md` | Dependency evidence/reference | Keep as evidence. |
| `Documents/DEPENDENCY_SECURITY_REMEDIATION_PLAN.md` | Dependency remediation plan | Keep as plan/reference. |
| `Documents/BACKUP_SYSTEM_GUIDE.md` | Active public-safe backup architecture and recovery guide | Keep active; live behavior was audited and TTA continuity was restored on 2026-11-03. The later same-day preflight recorded hardening commit `88bc59e` awaiting separately authorized rollout while production remained at `5ddd651`; that hardening was subsequently deployed. |
| `Documents/ANALYTICS_CLEANUP_GUIDE.md` | Placeholder-only analytics retention and cleanup planning reference | Keep active; any data mutation requires separate approval and live-state verification. |
| `Documents/DOCUMENTATION_AUDIT.md` | Documentation classification and cleanup plan | Keep active and refresh during cleanup. |

#### Public Tracked Docs That Are Mostly Historical Or Troubleshooting

| File path | Current role | Cleanup recommendation |
|---|---|---|
| `Documents/archive/deployment/DEPLOYMENT_DISCOVERY.md` | Historical/transitional deployment rediscovery note | Archived in Batch 1; use the active deployment docs for current guidance. |
| `Documents/archive/seo/GOOGLE_INDEXING_DIAGNOSTIC.md` | Historical public-403/Search Console diagnostic | Archived in Batch 1; use `SEO_CRAWLABILITY_NOTES.md` for current state. |
| `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md` | Broad historical/context doc | Archived in Batch 3; use current focused docs for operational authority. |
| `Documents/archive/dependencies/TARGETED_DEPENDENCY_UPDATE_PLAN.md` | Completed first-pass dependency plan | Archived in Batch 3; use the remediation log and active security plan for current dependency work. |
| `Documents/archive/troubleshooting/LOCAL_DOCKER_SYNC_GUIDE.md` | Local testing/history reference | Archived in Batch 2; use the runbook for current local workflows. |
| `Documents/archive/troubleshooting/LOCAL_SETUP_QUICKSTART.md` | Local setup reference | Archived in Batch 2; use the runbook for current local workflows. |
| `Documents/archive/troubleshooting/DIRECTORY_AUTO_CREATION_FIX.md` | Historical troubleshooting note | Archived in Batch 1 after confirming the source still implements the fix. |
| `Documents/archive/deployment/POST_LAUNCH_CLEANUP.md` | Historical cleanup guide | Archived in Batch 2; destructive cleanup guidance is no longer active by default. |

#### Public Tracked Credential-Adjacent Docs Requiring Human Safety Review

These files are tracked, but their names and roles are credential-adjacent. They should be reviewed by the human operator before any broad cleanup, archive, or public-doc consolidation task. Do not reproduce values from them in future docs.

| File path | Reason for caution | Recommendation |
|---|---|---|
| `Documents/1PASSWORD_CURSOR_SETUP.md` | 1Password/account-adjacent | Human safety review; consider private-only or sanitized replacement. |
| `Documents/GITHUB_AUTHENTICATION_SETUP.md` | GitHub/SSH auth-adjacent | Human safety review; keep only placeholder-safe workflow if tracked. |
| `Documents/LOCAL_LOGIN_CREDENTIALS.md` | Login/credential-adjacent | Human safety review; likely private-only or sanitized. |
| `Documents/LOGIN_CREDENTIALS_SUMMARY.md` | Login/credential-adjacent | Human safety review; likely private-only or sanitized. |
| `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md` | Password/admin-account workflow | Human safety review; keep only placeholder-safe rotation guidance if tracked. |

#### Private / Ignored Docs Confirmed Path-Only

These files were identified by path and ignore metadata only. They were not opened or summarized in this update.

| File path | Ignore source | Recommendation |
|---|---|---|
| `Documents/LINODE_DEPLOYMENT_RUNBOOK.md` | `.git/info/exclude` | Keep private operator source of truth unless a sanitized public version is created. |
| `Documents/PRIVATE_DEPLOYMENT_SESSION_NOTES.md` | `.git/info/exclude` | Keep private/local-only. |
| `Documents/PRIVATE_SSH_AND_SECRETS_MAP.md` | `.git/info/exclude` | Keep private/local-only. |
| `Documents/_MDC_NOTES.md` | `.git/info/exclude` | Keep private/local notes only. |
| `Documents/SECRETS.md` | `.gitignore` | Keep ignored and off-limits. |

#### Sanitized nginx Documentation Gap — Closed 2026-11-06

`nginx/templates/canonical-host-redirects.example.conf` now provides the
sanitized example. `nginx/README.md` records that production nginx is
host-managed, repository material is reference/example-only, applications are
loopback-bound, and static/upload requests pass through Express. The retired
`nginx/blog.conf` was dead and inconsistent with that model.

Private server details, live certificate paths, credential material,
certificate/key contents, and operator access data remain intentionally outside
tracked source.

## 3. Source-of-Truth Hierarchy

The primary authority map is maintained in `Documents/CODEX_WORKFLOW.md`:

| Responsibility | Primary authority |
|---|---|
| Safety and authorization | `AGENTS.md` |
| Project orientation | `Documents/MONOREPO_CONTEXT.md` |
| Topology and trust boundaries | `Documents/ARCHITECTURE_MAP.md` |
| Deployment concepts | `Documents/PRODUCTION_DEPLOYMENT_MODEL.md` |
| Executable deployment gates and rollback | `Documents/DEPLOYMENT_RUNBOOK.md` |
| Backup and restore | `Documents/BACKUP_SYSTEM_GUIDE.md` |
| SEO-specific behavior | `Documents/SEO_CRAWLABILITY_NOTES.md` |
| Dated documentation health | `Documents/DOCUMENTATION_AUDIT.md` |
| Repository path map | `Documents/REPO_INVENTORY.md` |

`Documents/ENVIRONMENT_AND_SECRETS_MAP.md` remains the structural environment
and secret-boundary reference. Private operator material stays path-only in
public documentation. Archived and dated records preserve history but do not
override the current primary authority.

### Migration / History Layer

- `Documents/archive/migration/CURSOR_TO_CODEX_MIGRATION.md`
- `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md`
- `Documents/archive/dependencies/TARGETED_DEPENDENCY_UPDATE_PLAN.md`
- `Documents/archive/deployment/DEPLOYMENT_DISCOVERY.md`
- `Documents/archive/seo/GOOGLE_INDEXING_DIAGNOSTIC.md`
- future `Documents/PROJECT_HISTORY.md` or `Documents/HISTORICAL_NOTES.md`

Use to preserve why things changed, not necessarily to control current operations.

### Operational / Troubleshooting Layer

- `Documents/BACKUP_SYSTEM_GUIDE.md`
- `Documents/archive/troubleshooting/LOCAL_SETUP_QUICKSTART.md`
- `Documents/archive/troubleshooting/LOCAL_DOCKER_SYNC_GUIDE.md`
- `Documents/GITHUB_AUTHENTICATION_SETUP.md`
- `Documents/archive/deployment/POST_LAUNCH_CLEANUP.md`
- `Documents/ANALYTICS_CLEANUP_GUIDE.md`
- `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md`
- `Documents/archive/troubleshooting/DIRECTORY_AUTO_CREATION_FIX.md`

Use cautiously. The active backup guide records public-safe architecture, audited
behavior, and recovery guidance but does not authorize production operations.
The analytics guide remains placeholder-only planning. Credential-adjacent
documents still require human safety review.

## 4. Active Source-of-Truth Recommendations

### `AGENTS.md`

Keep active because it defines the highest-priority repo rules.

Reference it for every task. Its limitation is that it is policy-level, not a detailed architecture or deployment map.

### `Documents/CODEX_WORKFLOW.md`

Keep active because it translates repo policy into practical Codex behavior.

Reference it for Codex startup, permission checks, task types, audit rules, and commit boundaries. Its limitation is that it does not classify all older docs by currency.

### `Documents/AGENT_ORCHESTRATION_WORKFLOW.md`

Keep active because it captures the human + ChatGPT + Codex + Git + documentation workflow.

Reference it when drafting prompts, deciding audit level, or porting the workflow to other projects. Its limitation is that it is a workflow template, not repo-specific architecture.

### `Documents/REPO_INVENTORY.md`

Keep active as the safe map of repo areas, sensitive paths, runtime/generated folders, and documentation inventory.

Reference it before broad exploration. Its limitation is that it is inventory, not an up-to-date source audit.

### `Documents/MONOREPO_CONTEXT.md`

Keep active for high-level monorepo purpose and shared/site-specific context.

Reference it before planning multi-site or shared-code work. Its limitation is that visible site status can drift.

### `Documents/ARCHITECTURE_MAP.md`

Keep active for architecture and code/config boundaries.

Reference it before code review, refactoring, or structural docs. Its limitation is that it records known mismatches rather than resolving them.

### `Documents/ENVIRONMENT_AND_SECRETS_MAP.md`

Keep active for environment variable structure and secret handling.

Reference it before env/template/config/security work. Its limitation is that `.gitignore` and `.dockerignore` were not inspected during that specific task, though they were inspected during later workflow/audit tasks.

### `Documents/DEPLOYMENT_RUNBOOK.md`

Keep active for deployment planning and operator safety.

Reference it for local, local-production-like, production, backup, and rollback concepts. Its limitation is that it intentionally does not confirm exact production access details or execute deployment.

## 5. Historical / Context Recommendations

The following docs preserve useful history but should not automatically control future work:

- `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md`
- `Documents/archive/dependencies/TARGETED_DEPENDENCY_UPDATE_PLAN.md`
- `Documents/archive/troubleshooting/LOCAL_DOCKER_SYNC_GUIDE.md`
- `Documents/archive/deployment/POST_LAUNCH_CLEANUP.md`
- `Documents/archive/troubleshooting/DIRECTORY_AUTO_CREATION_FIX.md`
- `Documents/GITHUB_AUTHENTICATION_SETUP.md`
- `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md`

Reasons:

- Some contain older operational assumptions.
- Some contain direct command sequences for Docker, SSH, backup, cleanup, database, or deployment actions.
- Some include sensitive-adjacent account, key, path, host, or admin details.
- Some overlap with newer focused docs that now define safer boundaries.

Archived files preserve context and must not be treated as current authority. Credential-adjacent files remain unchanged pending human safety review.

## 6. Consolidation Candidates

| Candidate | Value preserved | Why stale or redundant | Retain | Review before consolidation |
|---|---|---|---|---|
| `Documents/GITHUB_AUTHENTICATION_SETUP.md` | GitHub auth troubleshooting | Sensitive-adjacent and account/key oriented | Generic GitHub auth lessons with placeholders | Redact account/key specifics if moved into active docs |
| `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md` | Admin credential update workflow | Sensitive-adjacent and production-affecting | High-level account-rotation concept | Replace identifiers with placeholders and require explicit approval |

Possible consolidation targets:

- `Documents/PROJECT_HISTORY.md`
- `Documents/HISTORICAL_NOTES.md`
- `Documents/OPERATIONAL_HISTORY.md`
- a future archive folder
- a cleaned-up master index

Do not consolidate anything until the user approves a separate cleanup task.

## 7. Known Conflicts, Resolutions, and Mismatches

Known issues from safe docs/config inspection:

- `UPLOAD_PATH` vs `UPLOADS_PATH`: root `docker-compose.yml` uses `UPLOAD_PATH`, while production/local-production Compose and app docs point to `UPLOADS_PATH`.
- `DATABASE_URL` vs `DATABASE_PATH`: site examples documented in the environment map use `DATABASE_URL`, while active source/Compose references use `DATABASE_PATH`.
- Node baseline is now aligned: active package manifests require Node `>=24.0.0 <25`, while Docker and CI use exact Node `24.19.0` on Alpine 3.23 for Docker.
- Root Compose files versus site-level Docker/Compose files: root
  `docker-compose.prod.yml` is the established production authority; canonical
  local-development, local-production-like, and site-specific standalone paths
  remain Needs Review.
- Local development workflow versus local production-like workflow: `docker-compose.yml`, `docker-compose.local-prod.yml`, local npm scripts, and older local docs describe different paths.
- Nginx provenance is resolved: active configuration is host-managed;
  `nginx/README.md` is the tracked architecture reference and the canonical-host
  template is example-only. The dead `nginx/blog.conf` was retired.
- CI tolerance: workflow tolerates some missing/failing lint, unit, E2E, and audit steps, so CI passing should not be overstated.
- The production checkout, root Compose authority, service names, manual command
  style, and host-nginx relationship are documented. Operators must still
  rediscover live state during every authorized preflight.
- Environment template variables: some variables appear stale, future-facing, or not directly referenced by inspected source/Compose.
- The active shared schema and model use `posts.body`. Older site-local schema files are not the active initialization path. A separately authorized read-only production inventory found two supported historical shared-schema variants that the original exact-DDL migration matcher rejected. The semantic-recognition revision preserves their distinct baseline identities while still rejecting material drift; production deployment remains a separate reviewed gate.
- User password schema mismatch: `password` versus `password_hash` is recorded in `ARCHITECTURE_MAP.md` and needs review without inspecting runtime database files.
- Possible legacy `src/admin.js` files: architecture docs record that these may be legacy or unused because active app entry points mount route files.
- Older docs contain direct operational command examples that conflict with newer "approval required" workflow boundaries.

Runtime databases were not inspected.

## 8. Secret and Safety Consistency Audit

Consistent safety guidance in active docs:

- Real `.env` files are path-only and off-limits.
- `Documents/SECRETS.md` is path-only and off-limits.
- Databases, uploads, backups, logs, and generated test output are runtime state.
- Deployment, Docker, backup restore, database migration, prune, reset, deletion, SSH, SCP, and rsync actions require explicit approval.
- Codex should not run `git add` or `git commit` without explicit approval.
- Environment variable names and purposes are allowed; values are not.
- Placeholders are preferred for sensitive values.

Needs Review items:

- `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md` contains sensitive-adjacent and stale operational detail. It is archived history and must not control current work.
- `Documents/archive/troubleshooting/LOCAL_DOCKER_SYNC_GUIDE.md` preserves superseded setup and deployment examples as historical context.
- `Documents/BACKUP_SYSTEM_GUIDE.md` is placeholder-only planning. Live backup schedules, exact runtime state, and restore readiness remain unverified and require operator review before action.
- `Documents/ANALYTICS_CLEANUP_GUIDE.md` is placeholder-only planning. Any analytics deletion remains a separately approved, backup-gated production action.
- `Documents/GITHUB_AUTHENTICATION_SETUP.md` includes account and SSH key configuration details. Treat as sensitive-adjacent.
- `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md` includes admin identifier and password rotation workflow details. Treat as sensitive-adjacent and approval-required.
- `Documents/ENVIRONMENT_TEMPLATE.md` contains placeholder values but needs validation against active source and Compose references.

No secret values are reproduced in this audit.

## 9. Deployment Documentation Audit

### Active Deployment Guidance

- `Documents/DEPLOYMENT_RUNBOOK.md`

Use for deployment concepts, preflight checklist, rollback concepts, and approval boundaries.

### Historical Deployment Notes

- `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md`
- `Documents/archive/troubleshooting/LOCAL_DOCKER_SYNC_GUIDE.md`
- `Documents/archive/deployment/POST_LAUNCH_CLEANUP.md`

These contain useful context but should not override the runbook.

### Local Development Notes

- root `package.json`
- `docker-compose.yml`
- `Documents/archive/troubleshooting/LOCAL_SETUP_QUICKSTART.md` (historical context)
- `Documents/archive/troubleshooting/DIRECTORY_AUTO_CREATION_FIX.md` (historical context)

Needs Review: choose canonical "ordinary local dev" path.

### Local Production-Like Notes

- `docker-compose.local-prod.yml`
- `Documents/DEPLOYMENT_RUNBOOK.md`
- `Documents/archive/troubleshooting/LOCAL_SETUP_QUICKSTART.md` (historical context)
- `Documents/archive/troubleshooting/LOCAL_DOCKER_SYNC_GUIDE.md` (historical context)

Current production-like and isolated local workflow guidance lives in `Documents/DEPLOYMENT_RUNBOOK.md`; the archived files preserve setup history only.

### Backup / Restore Notes

- `Documents/DEPLOYMENT_RUNBOOK.md`
- `Documents/BACKUP_SYSTEM_GUIDE.md`

The runbook controls safety boundaries. The backup guide is the active
public-safe architecture and preserved-staging recovery reference. It records
the 2026-11-03 TTA continuity milestone and distinguishes production behavior
observed at that day's preflight from timeout/retry, failure-marker, and
scheduled-only retention implementation commit `88bc59e`.
Live scheduling, backup creation, restore, staging removal, retention, and other
cleanup actions remain high-risk and separately approval-gated.

### High-Risk Actions Requiring Approval

- deployment
- production restart
- Docker build/start/stop/restart/prune
- SSH/SCP/rsync
- backup restore
- database migration
- analytics cleanup
- destructive filesystem cleanup
- cron setup or server modification

Recommendation: keep a deployment operator checklist as a section or appendix inside `Documents/DEPLOYMENT_RUNBOOK.md` for now. Create a standalone `Documents/DEPLOYMENT_OPERATOR_CHECKLIST.md` only if deployments become frequent and the workflow is proven.

## 10. Dependency / Security Remediation Readiness

The documentation foundation is nearly sufficient to begin a dependency/security remediation planning task after this audit.

Available guidance:

- `AGENTS.md` defines high-level safety and approval rules.
- `Documents/CODEX_WORKFLOW.md` defines dependency remediation as a later, full-audit phase.
- `Documents/AGENT_ORCHESTRATION_WORKFLOW.md` classifies dependency/security remediation as high-risk.
- `Documents/ARCHITECTURE_MAP.md` identifies package/workspace boundaries.
- `Documents/ENVIRONMENT_AND_SECRETS_MAP.md` identifies config and secret boundaries.
- `Documents/DEPLOYMENT_RUNBOOK.md` identifies Docker/CI/deployment constraints.

Unresolved questions that may affect remediation:

- Which workspace owns each dependency risk?
- Which audit warnings are direct dependency issues versus transitive dependency issues?
- Which tests are meaningful before and after dependency updates?
- Should CI tolerance be tightened before or after remediation?

Rules before the first dependency-remediation commit:

- Do not run `npm audit fix` blindly.
- Inspect package manifests and lockfiles first.
- Determine affected workspace and dependency ownership.
- Separate direct dependencies from transitive dependencies.
- Prepare rollback/testing plan.
- Keep dependency changes separate from documentation commits.
- Run full audit before commit.
- Update docs if remediation changes runtime assumptions.

No npm commands were run for this audit.

## 11. Website Review Recommendation

The recommended next direction is to review the actual websites or local pages together rather than trying to extract more hidden Cursor data.

Recommended website review goals:

- visually review public pages and admin flows
- compare live behavior against architecture/docs
- identify UI/content/admin workflows not captured in documentation
- identify stale docs based on observed behavior
- turn findings into scoped Codex prompts later

Do not browse live websites or local pages as part of this audit. This section documents the next recommended direction only.

## 12. Cursor Residue Decision

Cursor hidden data extraction is lower priority than website/repo review.

Cursor files may contain useful settings or history, but much of the local state can be cache, session storage, IndexedDB, cookies, logs, or opaque application data.

Do not dig through Cursor local storage, cookies, IndexedDB, session storage, logs, or opaque blobs without a specific reason.

Revisit Cursor residue only if a missing rule, prompt, or decision cannot be reconstructed from:

- repo docs
- safe source/config inspection
- Git history if explicitly approved
- website/admin review with the user

## 13. Remaining Documentation Work

The 2026-11-06 reconciliation closed the active nginx provenance, sanitized
template, hero rollout, backup-hardening rollout, and ingress-boundary items.
Remaining work should stay in separate scoped tasks:

1. Design off-host application-backup storage and its verification model.
2. Complete a safe environment-variable/template alignment review without
   reading or exposing secret values.
3. Run a fresh dependency audit before using dated dependency evidence for new
   remediation decisions.
4. Complete an explicitly authorized authenticated restore rehearsal; existing
   isolated evidence does not cover authenticated workflows or off-host loss.
5. Resolve the canonical local-development, local-production-like, and
   site-specific standalone Compose relationships. Root
   `docker-compose.prod.yml` is already the production authority.
6. Consider archive banners and historical-runbook extraction separately; do
   not mix them into operational corrections.

This list records gaps and does not authorize implementation or production work.

## 14. Do-Not-Touch List for Future Cleanup

Remain off-limits during consolidation unless explicitly approved for an exact task:

- `.env`
- `.env.*`
- `Documents/SECRETS.md`
- databases such as `*.db`, `*.sqlite`, and `*.sqlite3`
- uploads
- backups
- private keys
- certificates
- credential exports
- runtime/generated output
- `node_modules/`
- logs
- Playwright reports, screenshots, and generated test output

Sensitive paths may be listed when needed, but contents must not be opened or reproduced.

## 15. Recommended Next Tasks

1. Perform a documentation-only production preflight before fast-forwarding this
   reconciliation commit. No runtime-consumed file changes are expected.
2. Keep off-host backup, authenticated restore testing, environment alignment,
   dependency auditing, Compose clarification, and archive hygiene as separate
   authorized workstreams.
3. Human-review tracked credential-adjacent docs before any public cleanup.

## 16. Open Questions

- Which Compose workflow is canonical for local development,
  local-production-like testing, and site-specific standalone use?
- Should generated/runtime cleanup happen before or after dependency remediation?
- How should actual website review findings be folded into docs?
- Should older operational docs be redacted before being kept long-term?
- Should `Documents/ENVIRONMENT_TEMPLATE.md` be replaced by per-site examples or one canonical template?
- Should tracked credential-adjacent docs be sanitized, made private-only, or archived?
- Should private operator runbooks remain only in `.git/info/exclude`, or should there be a documented private-doc convention?
