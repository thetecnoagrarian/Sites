# Documentation Audit

This document audits the project documentation after the Cursor-to-Codex migration foundation.

It identifies active guidance, historical context, stale or conflicting information, and consolidation candidates. It does not rewrite, delete, move, rename, or consolidate any existing documentation.

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

This audit is classification and conflict-finding only. It should not be treated as a cleanup commit or documentation rewrite.

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
| `Documents/CURSOR_TO_CODEX_MIGRATION.md` | Migration/workflow doc | Active for migration | Keep until migration is complete, then move to history/context | Low | Tracks Cursor extraction and cancellation risk. |
| `Documents/AGENT_ORCHESTRATION_WORKFLOW.md` | Reusable workflow template | Active | Keep as project-local copy and possible template seed | Low | Captures human + ChatGPT + Codex + Git + docs operating model. |
| `Documents/MASTER_PROJECT_DOCUMENTATION.md` | Master historical/context doc | Needs Review | Reclassify as historical/context unless refreshed | High | Contains useful history and some live-looking operational/account/access details. Newer focused docs should be trusted first for safety boundaries. |
| `Documents/LOCAL_SETUP_QUICKSTART.md` | Local production-like setup | Needs Review | Operational reference or consolidation candidate | Medium | Useful local-prod concept, but includes commands that start Docker and sample env content. Prefer runbook for approval boundaries. |
| `Documents/LOCAL_DOCKER_SYNC_GUIDE.md` | Local Docker workflow history | Needs Review | Historical/context or local workflow reference | High | Contains older setup steps, Docker commands, copying `.env`, cleanup commands, and live-looking deployment examples. |
| `Documents/BACKUP_SYSTEM_GUIDE.md` | Backup operational guide | Needs Review | Operational reference, likely superseded by runbook for safety | High | Contains backup/cron/restore/check commands and live-looking server/container details. Keep for history; do not use as direct execution guide without approval. |
| `Documents/GITHUB_AUTHENTICATION_SETUP.md` | GitHub auth reference | Needs Review | Sensitive-adjacent reference or historical setup note | High | Contains account, SSH, key path, and auth workflow details. Do not reproduce private details in future docs. |
| `Documents/POST_LAUNCH_CLEANUP.md` | Cleanup/troubleshooting guide | Needs Review | Historical cleanup candidate | High | Contains deletion, backup, Docker, and production path guidance. Cleanup commands require explicit approval. |
| `Documents/ANALYTICS_CLEANUP_GUIDE.md` | Analytics cleanup guide | Needs Review | High-risk operational reference | High | Contains database cleanup concepts and production command patterns. Treat as approval-required and probably historical until verified. |
| `Documents/DIRECTORY_AUTO_CREATION_FIX.md` | Troubleshooting / change history | Contextual | Keep as historical technical note or consolidate | Medium | Useful explanation of a past local-dev fix. Mentions `.env` edits by path and should not be used to inspect real env files. |
| `Documents/ENVIRONMENT_TEMPLATE.md` | Reference/template doc | Needs Review | Validate or replace with canonical env example | High importance, medium content risk | Contains placeholder-style values, but migration docs found variables that appear stale, missing, or mismatched. |
| `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md` | Credential/admin workflow guide | Needs Review | Sensitive-adjacent historical/reference doc | High | Contains admin identifier workflow and password-change command patterns. Do not treat as active without review and explicit approval. |

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
- `Documents/DEPLOYMENT_RUNBOOK.md`
- `Documents/ENVIRONMENT_TEMPLATE.md` if validated

Use for environment-variable names, secret classification, placeholder handling, deployment planning, and high-risk operational boundaries.

### Migration / History Layer

- `Documents/CURSOR_TO_CODEX_MIGRATION.md`
- `Documents/MASTER_PROJECT_DOCUMENTATION.md`
- future `Documents/PROJECT_HISTORY.md` or `Documents/HISTORICAL_NOTES.md`

Use to preserve why things changed, not necessarily to control current operations.

### Operational / Troubleshooting Layer

- `Documents/BACKUP_SYSTEM_GUIDE.md`
- `Documents/LOCAL_SETUP_QUICKSTART.md`
- `Documents/LOCAL_DOCKER_SYNC_GUIDE.md`
- `Documents/GITHUB_AUTHENTICATION_SETUP.md`
- `Documents/POST_LAUNCH_CLEANUP.md`
- `Documents/ANALYTICS_CLEANUP_GUIDE.md`
- `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md`
- `Documents/DIRECTORY_AUTO_CREATION_FIX.md`

Use cautiously. Many of these should become historical/reference docs or be consolidated after review.

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

- `Documents/MASTER_PROJECT_DOCUMENTATION.md`
- `Documents/LOCAL_DOCKER_SYNC_GUIDE.md`
- `Documents/BACKUP_SYSTEM_GUIDE.md`
- `Documents/POST_LAUNCH_CLEANUP.md`
- `Documents/ANALYTICS_CLEANUP_GUIDE.md`
- `Documents/DIRECTORY_AUTO_CREATION_FIX.md`
- `Documents/GITHUB_AUTHENTICATION_SETUP.md`
- `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md`

Reasons:

- Some contain older operational assumptions.
- Some contain direct command sequences for Docker, SSH, backup, cleanup, database, or deployment actions.
- Some include sensitive-adjacent account, key, path, host, or admin details.
- Some overlap with newer focused docs that now define safer boundaries.

These files should be summarized or consolidated later, not blindly deleted. They may explain why the repo is in its current shape.

## 6. Consolidation Candidates

| Candidate | Value preserved | Why stale or redundant | Retain | Review before consolidation |
|---|---|---|---|---|
| `Documents/MASTER_PROJECT_DOCUMENTATION.md` | Broad history, status notes, architecture and operational milestones | Newer focused docs supersede many safety, environment, deployment, and workflow sections | High-level timeline, major decisions, CSS rule if still desired | Remove or redact sensitive-adjacent details; verify current status |
| `Documents/LOCAL_SETUP_QUICKSTART.md` | Local production-like setup concept | Overlaps `DEPLOYMENT_RUNBOOK.md` and includes Docker commands | Conceptual local-prod workflow | Confirm canonical local setup and env handling |
| `Documents/LOCAL_DOCKER_SYNC_GUIDE.md` | History of Docker sync workflow | May describe old creation steps and direct production examples | Rationale for local-prod workflow | Redact live-looking access details; confirm if commands are still current |
| `Documents/BACKUP_SYSTEM_GUIDE.md` | Backup model, retention concept, restore awareness | Contains direct operational commands and server/container assumptions | Backup concepts and unresolved automation status | Verify scripts, schedule, restore procedure, and current host layout |
| `Documents/POST_LAUNCH_CLEANUP.md` | Cleanup history and production path rationale | Cleanup is destructive and time-sensitive | Cleanup decision history and "do not delete active project" warnings | Verify whether migration/cleanup is complete |
| `Documents/ANALYTICS_CLEANUP_GUIDE.md` | Analytics cleanup concept and retention idea | Contains database mutation commands and point-in-time stats | Retention concept and all-time stats idea | Verify current analytics schema and backup-before-cleanup workflow |
| `Documents/DIRECTORY_AUTO_CREATION_FIX.md` | Technical explanation of a local-dev fix | Already implemented according to docs; may be historical | Root cause, files changed, local-vs-Docker path lesson | Confirm source still matches described fix |
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
- Node baseline: package manifests allow Node `>=18.0.0`, while Docker and CI use Node 20.
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

- `Documents/MASTER_PROJECT_DOCUMENTATION.md` contains sensitive-adjacent account/access details and direct deployment guidance. Treat as historical/context until cleaned.
- `Documents/LOCAL_DOCKER_SYNC_GUIDE.md` includes copying real env files and live-looking production command examples. Treat as historical/context.
- `Documents/BACKUP_SYSTEM_GUIDE.md` includes direct SSH/Docker/backup/delete patterns. Treat as high-risk operational reference only.
- `Documents/ANALYTICS_CLEANUP_GUIDE.md` includes database mutation and cleanup commands. Treat as high-risk.
- `Documents/GITHUB_AUTHENTICATION_SETUP.md` includes account and SSH key configuration details. Treat as sensitive-adjacent.
- `Documents/USERNAME_PASSWORD_UPDATE_GUIDE.md` includes admin identifier and password rotation workflow details. Treat as sensitive-adjacent and approval-required.
- `Documents/ENVIRONMENT_TEMPLATE.md` contains placeholder values but needs validation against active source and Compose references.

No secret values are reproduced in this audit.

## 9. Deployment Documentation Audit

### Active Deployment Guidance

- `Documents/DEPLOYMENT_RUNBOOK.md`

Use for deployment concepts, preflight checklist, rollback concepts, and approval boundaries.

### Historical Deployment Notes

- `Documents/MASTER_PROJECT_DOCUMENTATION.md`
- `Documents/LOCAL_DOCKER_SYNC_GUIDE.md`
- `Documents/POST_LAUNCH_CLEANUP.md`

These contain useful context but should not override the runbook.

### Local Development Notes

- root `package.json`
- `docker-compose.yml`
- `Documents/LOCAL_SETUP_QUICKSTART.md`
- `Documents/DIRECTORY_AUTO_CREATION_FIX.md`

Needs Review: choose canonical "ordinary local dev" path.

### Local Production-Like Notes

- `docker-compose.local-prod.yml`
- `Documents/DEPLOYMENT_RUNBOOK.md`
- `Documents/LOCAL_SETUP_QUICKSTART.md`
- `Documents/LOCAL_DOCKER_SYNC_GUIDE.md`

Needs Review: confirm whether `docker-compose.local-prod.yml` is the preferred production-like local workflow.

### Backup / Restore Notes

- `Documents/DEPLOYMENT_RUNBOOK.md`
- `Documents/BACKUP_SYSTEM_GUIDE.md`

The runbook should control safety boundaries. The backup guide may preserve workflow history, but restore and cleanup actions are high-risk.

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

- Should Node 20 become the documented baseline because Docker and CI use it?
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

1. Finish this documentation audit.
2. Review actual websites/admin flows with the user.
3. Resolve source-of-truth conflicts.
4. Consolidate historical docs into history/archive docs.
5. Update active docs and `AGENTS.md` if needed.
6. Begin dependency/security remediation.
7. Create a deployment checklist or operator checklist only when needed.

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

1. Commit `Documents/DOCUMENTATION_AUDIT.md` after light audit.
2. Review the actual websites/admin flows with the user.
3. Create scoped notes from website review.
4. Resolve the highest-value documentation conflicts.
5. Create dependency/security remediation plan.
6. Start dependency/security remediation only after full-audit workflow is ready.

## 16. Open Questions

- Which docs are truly active source-of-truth?
- Should `Documents/MASTER_PROJECT_DOCUMENTATION.md` become historical/context rather than master?
- Should `Documents/PROJECT_HISTORY.md` or `Documents/HISTORICAL_NOTES.md` be created?
- Which operational docs are current versus historical?
- Which Compose workflow is canonical?
- Should Node 20 become the documented baseline?
- Should generated/runtime cleanup happen before or after dependency remediation?
- How should actual website review findings be folded into docs?
- Should older operational docs be redacted before being kept long-term?
- Should `Documents/ENVIRONMENT_TEMPLATE.md` be replaced by per-site examples or one canonical template?
