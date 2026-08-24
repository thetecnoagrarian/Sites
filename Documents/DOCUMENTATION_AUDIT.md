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

## 2. Current Documentation Landscape

| File path | Apparent role | Current status | Recommended future role | Risk level | Notes |
|---|---|---|---|---|---|
| `AGENTS.md` | Active source of truth | Active | Highest-priority repo instruction file | High importance, low content risk | Read first for every task. Contains safety, secret, Git, testing, deployment, and migration rules. |
| `Documents/REPO_INVENTORY.md` | Inventory / orientation | Active | Keep as repo map and safe path inventory | Low | Useful for quick orientation and sensitive path-only listings. |
| `Documents/MONOREPO_CONTEXT.md` | Orientation / context | Active | Keep as high-level project context | Low | Explains why both sites live together and how `blog-core` fits. Some site status claims may drift. |
| `Documents/ARCHITECTURE_MAP.md` | Architecture map | Active | Keep as architecture source for future edits | Medium | Captures code/config structure and known mismatches. Should be refreshed after architecture changes. |
| `Documents/ENVIRONMENT_AND_SECRETS_MAP.md` | Environment and secrets map | Active | Keep as secret-boundary source | High importance, medium content risk | Correctly avoids values and documents variable mismatches. Needs refresh after env template changes. |
| `Documents/DEPLOYMENT_RUNBOOK.md` | Operational runbook | Active but cautious | Keep as active deployment planning doc | High | Safe placeholder-first runbook. Production actions still require explicit approval. |
| `Documents/CODEX_WORKFLOW.md` | Codex workflow | Active | Keep as active Codex operating procedure | Medium | Defines startup, scope, audit, commit, dependency, and deployment boundaries. |
| `Documents/archive/migration/CURSOR_TO_CODEX_MIGRATION.md` | Migration/workflow history | Archived | Preserve as historical context; current workflow lives in active Codex guidance | Low | The migration foundation and documentation audit are complete. |
| `Documents/AGENT_ORCHESTRATION_WORKFLOW.md` | Reusable workflow template | Active | Keep as project-local copy and possible template seed | Low | Captures human + ChatGPT + Codex + Git + docs operating model. |
| `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md` | Broad project history | Archived | Preserve as historical context only | High | Current guidance is distributed across focused docs; sensitive-adjacent and stale operational detail must not control current work. |
| `Documents/archive/troubleshooting/LOCAL_SETUP_QUICKSTART.md` | Local production-like setup history | Archived | Preserve as historical setup context | Medium | Current local production-like and isolated testing guidance lives in the runbook. |
| `Documents/archive/troubleshooting/LOCAL_DOCKER_SYNC_GUIDE.md` | Local Docker workflow history | Archived | Preserve as historical setup context | High | Contains superseded direct Docker/deployment instructions and is not current authority. |
| `Documents/BACKUP_SYSTEM_GUIDE.md` | Backup planning guide | Active but cautious | Keep as placeholder-only planning reference | High | Tracked architecture still supports database-and-upload backup concepts. The guide does not establish live schedules or authorize backup/restore actions. |
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
| `Documents/BACKUP_SYSTEM_GUIDE.md` | `KEEP_ACTIVE` | It is now placeholder-only planning, and tracked backup architecture still covers database and upload state; live execution details remain unverified. |
| `Documents/ANALYTICS_CLEANUP_GUIDE.md` | `KEEP_ACTIVE` | It is now placeholder-only planning, and the tracked analytics models, middleware, routes, and cleanup script still exist. |
| `Documents/DEPENDENCY_SECURITY_REMEDIATION_PLAN.md` | `KEEP_ACTIVE` | Its staged model still covers unresolved dependency families; the current-use note points to the remediation log for present status. |
| `Documents/archive/dependencies/TARGETED_DEPENDENCY_UPDATE_PLAN.md` | `ARCHIVE_NOW` | The first targeted pass is complete and its current evidence and remaining risks are recorded in active dependency docs. |

| Archived document | Current canonical replacement |
|---|---|
| `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md` | Current focused docs; its CSS maintenance rule now lives in `Documents/ARCHITECTURE_MAP.md` |
| `Documents/archive/dependencies/TARGETED_DEPENDENCY_UPDATE_PLAN.md` | `Documents/DEPENDENCY_REMEDIATION_LOG.md` for completed work and remaining risk, plus `Documents/DEPENDENCY_SECURITY_REMEDIATION_PLAN.md` for the unresolved workstream |

Tracked Markdown under `Documents/` changed from 20 active and 7 archived files to 18 active and 9 archived files. This is a 33.3% reduction from the original 27-document active baseline. `Documents/BACKUP_SYSTEM_GUIDE.md` and `Documents/ANALYTICS_CLEANUP_GUIDE.md` remain active as placeholder-only planning references; neither authorizes production operations. Unresolved dependency evidence also remains active.

### 2D. Current Cleanup Classification Update - 2026-06-12

This update reflects later dependency remediation, logging redaction, CSP cleanup, Search Console fixes, `/index.html` redirect work, and live nginx non-www-to-www canonical redirects.

Current confirmed context from recent documentation and operator-provided state:

- `origin/main` is synchronized at `ec9d67f Redirect index.html to homepage`.
- `/index.html` now redirects to `/` on both public sites.
- Non-www HTTP and HTTPS now redirect to HTTPS `www` at the nginx edge for both sites.
- `Search Console` "Page with redirect" for `http://www.thetecnoagrarian.com/` is expected and should not be treated as a failure.
- CSP `form-action` cleanup is deployed and documented.
- Logging redaction cleanup is deployed and documented.
- Some live nginx changes happened directly on the server and should be documented only in sanitized, public-safe form.

This section supersedes older status notes in this audit where they conflict with the current state.

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
| `Documents/BACKUP_SYSTEM_GUIDE.md` | Placeholder-only backup planning reference | Keep active; live schedules, paths, and restore readiness still require operator verification. |
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

#### Sanitized nginx Documentation Gap

Current gap: live nginx non-www-to-www canonical redirects are part of current production behavior, but the public tracked docs should not contain private server details, exact private paths, credential material, or certificate/key contents.

Recommendation:

- Add a sanitized nginx canonical redirect template later.
- Preferred path: `nginx/templates/canonical-host-redirects.example.conf`.
- Acceptable docs-only alternative: `Documents/NGINX_CANONICAL_REDIRECT_TEMPLATE.md`.
- Use placeholders such as `[DOMAIN]`, `[WWW_DOMAIN]`, and `[CERT_PATH]`.
- Redact or omit live server IPs, private usernames, private key paths, certificate contents, cookie values, session values, CSRF values, and private operator commands.

## 3. Proposed Source-of-Truth Hierarchy

This hierarchy is proposed, not final.

### Highest Priority Safety / Instruction Layer

- `AGENTS.md`
- `Documents/CODEX_WORKFLOW.md`
- `Documents/AGENT_ORCHESTRATION_WORKFLOW.md`

Use for task boundaries, secret policy, Codex behavior, audit expectations, Git control, and approval requirements.

### Orientation / Context Layer

- `Documents/REPO_INVENTORY.md`
- `Documents/MONOREPO_CONTEXT.md`
- `Documents/ARCHITECTURE_MAP.md`

Use for repo structure, package relationships, shared versus site-specific boundaries, runtime state, and architecture mapping.

### Environment / Deployment Layer

- `Documents/ENVIRONMENT_AND_SECRETS_MAP.md`
- `Documents/PRODUCTION_DEPLOYMENT_MODEL.md`
- `Documents/DEPLOYMENT_RUNBOOK.md`
- private/local-only `Documents/LINODE_DEPLOYMENT_RUNBOOK.md`, path-only
- `Documents/ENVIRONMENT_TEMPLATE.md` if validated

Use for environment-variable names, secret classification, placeholder handling, deployment planning, production model, and high-risk operational boundaries.

Current interpretation:

- `Documents/PRODUCTION_DEPLOYMENT_MODEL.md` should be the public-safe production model.
- `Documents/DEPLOYMENT_RUNBOOK.md` should remain the agent-safety and placeholder-oriented deployment planning doc.
- `Documents/LINODE_DEPLOYMENT_RUNBOOK.md` is ignored/private and may be the exact operator runbook, but it must stay path-only in public docs unless sanitized.
- `Documents/archive/deployment/DEPLOYMENT_DISCOVERY.md` is historical/transitional rather than active deployment authority.
- Local Docker docs are local testing references, not production deployment authority.

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

Use cautiously. The active backup and analytics guides are placeholder-only planning references; they do not authorize production operations. Credential-adjacent documents still require human safety review.

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

## 7. Known Conflicts and Mismatches

Known issues from safe docs/config inspection:

- `UPLOAD_PATH` vs `UPLOADS_PATH`: root `docker-compose.yml` uses `UPLOAD_PATH`, while production/local-production Compose and app docs point to `UPLOADS_PATH`.
- `DATABASE_URL` vs `DATABASE_PATH`: site examples documented in the environment map use `DATABASE_URL`, while active source/Compose references use `DATABASE_PATH`.
- Node baseline is now aligned: active package manifests require Node `>=24.0.0 <25`, while Docker and CI use exact Node `24.19.0` on Alpine 3.23 for Docker.
- Root Compose files versus site-level Docker/Compose files: both exist; canonical workflow remains Needs Review.
- Local development workflow versus local production-like workflow: `docker-compose.yml`, `docker-compose.local-prod.yml`, local npm scripts, and older local docs describe different paths.
- `nginx/blog.conf`: checked-in nginx config may be source of truth or reference only. Needs Review against actual deployment without inspecting private server state.
- CI tolerance: workflow tolerates some missing/failing lint, unit, E2E, and audit steps, so CI passing should not be overstated.
- Deployment/runbook uncertainty: exact production deploy path, service names, command style, and nginx relationship remain Needs Review.
- Environment template variables: some variables appear stale, future-facing, or not directly referenced by inspected source/Compose.
- Schema mismatch: `body` versus `content` is recorded in `ARCHITECTURE_MAP.md` and needs source/schema review before database-related changes.
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

The runbook controls safety boundaries. The backup guide supports placeholder-only planning, while live scheduling, restore, and cleanup actions remain high-risk and separately approval-gated.

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

## 13. Documentation Cleanup Plan

Proposed staged plan:

1. Update this documentation audit with the latest cleanup classification.
2. Update `Documents/PRODUCTION_DEPLOYMENT_MODEL.md` with public-safe current production facts: `/index.html` redirect, nginx non-www-to-www redirects, and Search Console redirect interpretation.
3. Update `Documents/SEO_CRAWLABILITY_NOTES.md` so sitemap/canonical, `/index.html`, and non-www redirect status are current.
4. Add a sanitized nginx canonical redirect template or placeholder-only documentation.
5. Review tracked credential-adjacent docs with the human operator before any archive, rename, or public consolidation.
6. Resolve source-of-truth conflicts in active docs.
7. Consolidate historical docs into `Documents/PROJECT_HISTORY.md`, `Documents/HISTORICAL_NOTES.md`, or an archive folder.
8. Update `AGENTS.md` only if cleanup reveals a durable rule that belongs in the highest-priority instruction layer.
9. Continue dependency/security remediation as a separate full-audit workflow.
10. Create a deployment operator checklist only when repeated deployments make it worth the extra artifact.

This plan does not authorize cleanup. Each stage should be a separate scoped task.

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

1. Commit this `Documents/DOCUMENTATION_AUDIT.md` update after light audit.
2. Update `Documents/PRODUCTION_DEPLOYMENT_MODEL.md` with the current public-safe production deployment and nginx canonical redirect state.
3. Update `Documents/SEO_CRAWLABILITY_NOTES.md` with current Search Console/crawlability status.
4. Create a sanitized nginx canonical redirect template under `nginx/templates/` or a docs-only equivalent.
5. Human-review tracked credential-adjacent docs before any public cleanup.
6. Resolve the highest-value documentation conflicts.
7. Archive or consolidate historical docs only after active docs are current.
8. Continue dependency/security remediation as a separate full-audit workflow.

## 16. Open Questions

- Which docs are truly active source-of-truth?
- Which operational docs are current versus historical?
- Which Compose workflow is canonical?
- Should generated/runtime cleanup happen before or after dependency remediation?
- How should actual website review findings be folded into docs?
- Should older operational docs be redacted before being kept long-term?
- Should `Documents/ENVIRONMENT_TEMPLATE.md` be replaced by per-site examples or one canonical template?
- Should tracked credential-adjacent docs be sanitized, made private-only, or archived?
- Should the sanitized nginx canonical redirect template live under `nginx/templates/` or `Documents/`?
- Should private operator runbooks remain only in `.git/info/exclude`, or should there be a documented private-doc convention?
