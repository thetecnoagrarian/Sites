# Codex Workflow

This document defines the safe operating procedure for Codex in this monorepo.

The goal is to make Codex useful without giving it unnecessary access to secrets, runtime data, or production actions.

## 1. Purpose

Codex should help with documentation, architecture mapping, focused code review, small scoped edits, and planning. It should not become an uncontrolled deployment, secrets, dependency, or runtime-data operator.

This repo contains two related blog sites, shared blog-core code, Docker/deployment files, scripts, tests, and operational documentation. That mix makes clear workflow boundaries important.

## 2. Required Startup Routine

Every Codex session should begin by:

1. Reading `AGENTS.md`.
2. Checking the active permission/sandbox mode.
3. Confirming whether the session is read-only or workspace-write.
4. Confirming network access status.
5. Identifying task type:
   - documentation
   - code
   - dependency
   - Docker
   - deployment
   - security
   - database/runtime
6. Confirming the exact allowed files/folders for the task.
7. Stopping if the task appears to require real secrets.

If sandbox/permission state does not match the user's expectation, Codex should say so and stop before further repo inspection.

## 3. Permission Model

### Read-Only Mode

Read-only mode is preferred for audits, status reports, architecture reviews, and planning. Codex should inspect only approved files and produce findings or recommendations without editing.

### Workspace-Write Mode

Workspace-write mode is acceptable only for tightly scoped creation/edit tasks. Examples:

- Create one new documentation file.
- Edit one specific existing documentation file.
- Make a small, user-approved code fix.

In workspace-write mode, Codex should still behave conservatively. Filesystem permission is not a secret boundary and should not be treated as approval to inspect or edit sensitive files.

### Restricted Network

Network access should be treated as restricted unless the user explicitly approves a network-dependent task. Do not run network commands for normal documentation, architecture mapping, linting, or refactoring.

### Approvals

Explicit approval is required before actions that affect runtime state, production systems, dependencies, Git history, Docker, backups, databases, or secrets.

### Writable Roots

Writable roots define what Codex technically can edit. They do not define what Codex should edit. The user task scope and `AGENTS.md` safety rules are stricter than filesystem access.

## 4. Task-Size Rules

Preferred task shape:

- One task at a time.
- One new document or one small bounded edit when possible.
- Inspect first, edit second.
- Keep changes reviewable.
- Use existing repo patterns.
- Record uncertainty as Needs Review rather than guessing.

Avoid:

- Broad refactors without a plan.
- Dependency updates mixed with documentation migration.
- Deployment actions mixed with documentation or code cleanup.
- Application code changes during documentation-only tasks.
- Edits outside the explicit task scope.

## 5. Safe Task Categories

### Safe Documentation Tasks

Examples:

- Create `Documents/REPO_INVENTORY.md`.
- Create `Documents/MONOREPO_CONTEXT.md`.
- Create architecture, environment, runbook, or workflow docs.
- Summarize safe configuration structure with placeholders.

Rules:

- Use approved files only.
- Do not inspect secret/runtime paths.
- Do not modify application code.

### Safe Inspection Tasks

Examples:

- Read `AGENTS.md`.
- Read non-sensitive `Documents/` files.
- Read package manifests.
- Inspect source files when code inspection is explicitly in scope.
- Inspect `.gitignore` and `.dockerignore` when approved.

Rules:

- Prefer `rg`/safe listings.
- Avoid `.env*`, databases, uploads, backups, keys, certificates, and credential exports.

### Caution Tasks

Examples:

- Code review.
- CI review.
- Dockerfile review.
- Security architecture review.
- Comparing docs to source.
- Running local lint/test commands.

Rules:

- Confirm scope first.
- Identify smallest relevant inspection/test surface.
- Do not run commands that write, install, deploy, or mutate runtime state without approval.

### Approval-Required Tasks

Examples:

- Running tests that may write generated output.
- Running package manager commands.
- Editing application code.
- Editing Docker/Compose/nginx/CI files.
- Running Docker commands.
- Running SSH/SCP/rsync/network commands.
- Running backup scripts.

Rules:

- Explain purpose and risk.
- Get explicit approval for the exact action.
- Use placeholders for secret-bearing context.

### Forbidden Unless Explicitly Approved

Examples:

- Opening real `.env` files.
- Reading `Documents/SECRETS.md`.
- Reading databases, uploads, backups, private keys, certificates, or credential exports.
- Running deployment commands.
- Running restore/migration commands.
- Running prune/delete/reset commands.
- Running `git add`, `git commit`, or `git reset`.
- Asking the user to paste secrets into chat.

## 6. Secret Handling Rules

Off-limits paths and patterns:

- `.env`
- `.env.*`
- `**/.env`
- `**/.env.*`
- `Documents/SECRETS.md`
- `**/SECRETS.md`
- database files such as `*.db`, `*.sqlite`, `*.sqlite3`
- uploads
- backups
- private keys
- certificates
- credential exports
- login/credential docs unless explicitly reviewed-safe for the exact task

Paths may be listed when needed for inventory or safety documentation. Contents must not be opened, summarized, copied, modified, committed, or exposed.

Allowed variable documentation:

- variable name
- purpose
- file path where referenced
- whether it appears local, production, template, CI, or unknown
- placeholder examples

Never print:

- passwords
- tokens
- private keys
- session secrets
- CSRF secrets
- OAuth/client secrets
- real IP allowlists
- 1Password item contents
- deployment credentials

Placeholder policy:

- `[SESSION_SECRET]`
- `[CSRF_SECRET]`
- `[TRUSTED_IPS]`
- `[SERVER_IP]`
- `[SSH_USER]`
- `[TOKEN]`
- `[PASSWORD]`
- `[DATABASE_PATH]`
- `[UPLOADS_PATH]`

Real secrets are unnecessary for normal documentation, linting, refactoring, architecture mapping, and most code review.

## 7. File and Folder Safety Map

Generally safe areas:

- `AGENTS.md`
- non-sensitive `Documents/` files
- `package.json`
- workspace package manifests
- `blog-core/src/` when source inspection is in scope
- `fruitionforestgarden/src/` when source inspection is in scope
- `thetecnoagrarian/src/` when source inspection is in scope
- `tests/` when test inspection is in scope
- `.github/workflows/` when CI inspection is in scope
- Docker/Compose/nginx files when deployment architecture is in scope

Reviewed-safe operational docs:

- `Documents/LOCAL_LOGIN_CREDENTIALS.md`
- `Documents/LOGIN_CREDENTIALS_SUMMARY.md`
- `Documents/1PASSWORD_CURSOR_SETUP.md`
- `Documents/GITHUB_AUTHENTICATION_SETUP.md`
- `scripts/setup-1password-cli.sh`
- `scripts/setup-local-admin.js`
- `scripts/reset-tta-password.sh`

Use reviewed-safe files only for workflow context, and still avoid reproducing account identifiers, private values, real IPs, passwords, tokens, or key material.

Sensitive/off-limits:

- `.env*`
- `Documents/SECRETS.md`
- databases
- uploads
- backups
- private keys
- certificates
- credential exports

Runtime/generated areas:

- `node_modules/`
- `playwright-report/`
- `test-results/`
- `tests/screenshots/`
- logs
- backups
- uploads
- SQLite database files
- Docker volumes

Deployment-related files requiring caution:

- `docker-compose.yml`
- `docker-compose.prod.yml`
- `docker-compose.local-prod.yml`
- `docker/Dockerfile.prod.site`
- `nginx/blog.conf`
- `.github/workflows/ci-cd.yml`
- operational scripts under `scripts/`
- start/stop/restart shell scripts

## 8. Editing Workflow

Safe edit cycle:

1. User gives a scoped task.
2. Codex restates the scope and constraints.
3. Codex inspects only approved files.
4. Codex creates/edits only allowed files.
5. Codex avoids unrelated refactors.
6. Codex summarizes:
   - files changed
   - safe files inspected
   - files intentionally avoided
   - risks and uncertainties
   - recommended next step
7. User runs or requests `git status` and diffs.
8. User performs light or full audit.
9. User commits manually.

Codex should not edit existing files when the task says to create only one new file.

## 9. Audit Workflow

### Light Audit

Use for new documentation files and narrow documentation edits.

Checks:

- Confirm the intended file was created/edited.
- Confirm no application code changed.
- Confirm no secret values were included.
- Confirm placeholders are used.
- Review obvious path-only sensitive listings.
- Review final document for overclaims or unsupported claims.

### Full Audit

Required for:

- code changes
- dependency changes
- Docker changes
- deployment changes
- security/auth changes
- database changes
- backup changes
- CI changes
- secret/environment handling changes

Checks:

- `git status`
- `git diff --stat`
- targeted diff review
- sensitive-path review
- grep-style checks for secret terms and credential patterns
- generated/runtime file check
- test/build plan review
- commit boundary review

New documentation gets a light audit. Code, dependency, deploy, security, database, backup, or CI changes require full audit.

## 10. Commit Workflow

Codex should not run `git add` or `git commit` unless explicitly approved.

The user controls commits.

Commit rules:

- Prefer small commits grouped by purpose.
- Run `git status` before commit.
- Review `git diff --stat`.
- Review targeted diffs.
- Confirm sensitive files are not included.
- For deployment-sensitive commits, prefer one-line `git add` commands. A multiline `git add` command with blank lines after backslashes can stage only the first file, producing a partial commit.
- Before committing, inspect staged changes with `git diff --cached --stat` and `git diff --cached --name-only`.
- Confirm all expected files are staged before committing and pushing deployment-sensitive work.
- Remember that production deploys from GitHub. If GitHub receives an incomplete commit, the server correctly deploys that incomplete state.

Never commit:

- `.env`
- `.env.*`
- `Documents/SECRETS.md`
- databases
- uploads
- backups
- logs
- private keys
- certificates
- credential exports
- local-only login notes

## 11. Migration Workflow

Staged migration sequence:

1. `AGENTS.md`
2. `Documents/REPO_INVENTORY.md`
3. `Documents/MONOREPO_CONTEXT.md`
4. `Documents/ARCHITECTURE_MAP.md`
5. `Documents/ENVIRONMENT_AND_SECRETS_MAP.md`
6. `Documents/DEPLOYMENT_RUNBOOK.md`
7. `Documents/CODEX_WORKFLOW.md`
8. `Documents/archive/migration/CURSOR_TO_CODEX_MIGRATION.md` as the historical migration record
9. `Documents/DOCUMENTATION_AUDIT.md`
10. dependency/security remediation after the documentation foundation

Migration principle:

- Establish safe documentation and context before broad code or dependency work.
- Preserve Cursor-era knowledge without copying secrets.
- Turn unclear items into Open Questions.

## 12. Dependency Remediation Boundary

Dependency remediation is a later phase.

Rules:

- Do not run `npm audit fix` blindly.
- Inspect package manifests and lockfiles first.
- Understand which workspace is affected.
- Consider Node version alignment with Docker and CI.
- Do not mix dependency changes with documentation commits.
- Do not combine dependency remediation with deployment work.
- Require full audit before committing dependency changes.

Known context:

- Root package engines allow Node `>=18.0.0`.
- CI uses Node 20.
- Production Dockerfile uses Node 20.

Needs Review: decide whether Node 20 should become the documented baseline.

## 13. Deployment Boundary

Codex may document deployment concepts.

Codex may not run without explicit approval:

- deployment commands
- Docker commands
- SSH commands
- SCP commands
- rsync commands
- backup restore commands
- database restore/migration commands
- prune commands
- reset commands
- destructive commands

Deployment requires:

- preflight checklist
- target service/site confirmation
- rollback concept
- backup status confirmation
- user-controlled action
- placeholder-only documentation

Passing tests or CI does not imply deployment approval.

## 14. Failure and Stop Conditions

Codex should stop and ask if:

- it needs a secret
- it sees a file that appears sensitive
- it would need to run a destructive command
- it would need to run a deployment command
- it would need Docker, SSH, SCP, rsync, or network access outside approved scope
- it is asked to edit outside scope
- task scope expands unexpectedly
- sandbox/permission state does not match expectation
- source and docs conflict and the correct source of truth is unclear
- a file appears to contain real credential material even if it was previously described as reviewed-safe

When source and docs conflict, document the conflict or ask the user. Do not guess.

## 15. Recommended Next Tasks

Next safe tasks:

1. Keep `Documents/DOCUMENTATION_AUDIT.md` current as documentation is consolidated.
2. Consult `Documents/archive/migration/CURSOR_TO_CODEX_MIGRATION.md` only for migration history.
3. Keep dependency/security remediation separate from documentation consolidation.

Dependency/security remediation should remain separate from documentation migration and should start with review, not automatic fixes.

## 16. Open Questions

- Which root or site-level Compose files are canonical for each workflow?
- Should `UPLOAD_PATH` be standardized to `UPLOADS_PATH`?
- Should `DATABASE_URL` examples be replaced with `DATABASE_PATH`?
- Should Node 20 be documented as the baseline because Docker and CI use it?
- Which reviewed-safe operational docs are current versus historical?
- Should generated/runtime folders be cleaned or only ignored?
- Should CI failure tolerance be tightened after documentation migration?
