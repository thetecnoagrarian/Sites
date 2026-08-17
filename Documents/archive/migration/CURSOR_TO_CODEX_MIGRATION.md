# Cursor to Codex Migration

This document records the migration from Cursor-dependent project context to durable repository documentation usable by VS Code and Codex.

It does not contain secrets, live access details, real IP allowlists, tokens, passwords, private keys, or credential material. Secrets and runtime data remain outside the migration docs.

## 1. Purpose

The migration goal is to move project memory out of editor-specific state and into durable repo files.

This is not just an editor change. The important goal is preserving architecture, workflow, deployment, safety, and decision context in files that future maintainers and future Codex sessions can inspect without relying on hidden Cursor chat history.

Project files should carry:

- repo structure and package relationships
- shared versus site-specific architecture
- environment-variable structure without values
- deployment concepts without live credentials
- Codex operating rules
- migration status and remaining review work

## 2. Migration Status Summary

Completed or established:

- `AGENTS.md` - repo-level operating instructions, secret policy, documentation order, and task safety rules.
- `.gitignore` review/tightening - confirmed ignore coverage for env files, databases, logs, runtime output, uploads, backups, test output, private keys, certificates, and sensitive docs.
- `.dockerignore` production build context - confirmed Docker build context excludes env files, databases, logs, uploads, backups, documentation, tests, node modules, Git metadata, and Compose/Docker helper files.
- Reviewed operational documentation - safe operational docs were used for workflow context, with secret-bearing details replaced by placeholders in migration documentation.
- `Documents/REPO_INVENTORY.md` - top-level repository inventory, workspace structure, sensitive path-only listing, runtime/generated folders, and open questions.
- `Documents/MONOREPO_CONTEXT.md` - monorepo purpose, two-site relationship, `blog-core` role, operational model, and Codex context.
- `Documents/ARCHITECTURE_MAP.md` - architecture map for root workspace, shared core, site packages, request flow, runtime state, Docker/deployment structure, testing, CI, and security boundaries.
- `Documents/ENVIRONMENT_AND_SECRETS_MAP.md` - environment-variable inventory, template/source mismatches, secret classification, placeholder policy, and handling rules.
- `Documents/DEPLOYMENT_RUNBOOK.md` - safe deployment concepts, canonical file candidates, local/local-production/production workflow boundaries, backup concepts, preflight checklist, CI notes, and deployment stop rules.
- `Documents/CODEX_WORKFLOW.md` - safe operating procedure for future Codex sessions.

Secrets and runtime data remain out of scope for migration docs. Real `.env` files, `Documents/SECRETS.md`, databases, uploads, backups, private keys, certificates, and credential exports should not be opened or copied into documentation.

## 3. Why Cursor Context Needed Extraction

Cursor chat and composer context can be useful during active development, but it is not durable enough to serve as the project source of truth.

Problems with editor-held context:

- It may not be available to future agents or collaborators.
- It can disappear, become hard to search, or live outside Git.
- It may mix current facts with stale reasoning.
- It may contain assumptions that were never reviewed or committed.
- It may tempt future sessions to rely on hidden state instead of repo files.

The safer model is to keep architecture, workflows, deployment rules, environment handling, and migration knowledge in committed documentation. Future agents should learn from `AGENTS.md` and `Documents/`, not from invisible IDE state.

## 4. Repository Documentation Map

| File | Purpose | Future Codex use | Context type |
|---|---|---|---|
| `AGENTS.md` | Highest-priority repo instructions, safety rules, secret policy, and migration order. | Read first before any repo inspection or editing. | workflow context, sensitive-boundary context |
| `Documents/REPO_INVENTORY.md` | Inventory of top-level structure, packages, docs, deployment files, tests, env/template paths, sensitive paths, and runtime/generated folders. | Use to orient quickly without broad filesystem exploration. | safe context, sensitive-boundary context |
| `Documents/MONOREPO_CONTEXT.md` | Explains why the two sites live together, how `blog-core` fits, and how local/production concepts relate. | Use before architecture, planning, or multi-site changes. | safe context |
| `Documents/ARCHITECTURE_MAP.md` | Maps workspace, shared core, site packages, request flow, runtime state, Docker/deployment architecture, tests, CI, and boundaries. | Use before code review, refactoring, or architectural edits. | safe context, workflow context |
| `Documents/ENVIRONMENT_AND_SECRETS_MAP.md` | Documents variable names, purposes, references, mismatches, classification, placeholders, and secret-handling rules. | Use before env/template work or secret-boundary review. | sensitive-boundary context |
| `Documents/DEPLOYMENT_RUNBOOK.md` | Documents deployment concepts, local/local-production/production flows, backup concepts, preflight checks, rollback concepts, and high-risk commands. | Use for deployment planning only, not as deployment approval. | deployment context, sensitive-boundary context |
| `Documents/CODEX_WORKFLOW.md` | Defines how Codex should operate safely in this repo. | Use at session startup and before edits, audits, commits, dependency work, or deployment-related work. | workflow context |
| `Documents/CURSOR_TO_CODEX_MIGRATION.md` | Tracks what has been extracted from Cursor-era context and what remains to review before cancelling Cursor. | Use to finish the migration and assess cancellation risk. | workflow context |
| `Documents/DOCUMENTATION_AUDIT.md` | Planned future audit of documentation consistency, staleness, and conflicts. | Use after creation to decide what docs need cleanup. | workflow context |
| `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md` | Archived master project notes. | Historical context only. Prefer current focused docs for Codex safety boundaries and operations. | safe context with review needed |

## 5. Safe Codex Setup Now Established

Confirmed setup and rules:

- `AGENTS.md` defines repo-specific instructions and must be read first.
- Structural secret policy says real secrets are unnecessary for normal documentation, refactoring, linting, testing, and architecture mapping.
- `.gitignore` is intended to exclude env files, databases, logs, runtime output, test output, uploads, backups, sensitive docs, private keys, and certificates.
- `.dockerignore` is intended to keep Docker build context free of env files, runtime data, uploads, backups, docs, tests, node modules, Git metadata, and local development artifacts.
- `Documents/CODEX_WORKFLOW.md` defines the startup routine, task categories, edit cycle, audit workflow, commit rules, stop conditions, and migration order.
- Future sessions should check permission/sandbox mode and network status before repo work.
- Workspace-write is acceptable only for tightly scoped creation/edit tasks.
- Filesystem write permission is not approval to inspect secrets or modify unrelated files.
- The user controls commits. Codex should not run `git add` or `git commit` without explicit approval.
- New documentation files get a light audit; code, dependency, Docker, deployment, security, auth, database, backup, or CI changes require full audit.
- Dependency remediation is a later phase and must not be mixed with documentation migration.
- Deployment remains explicit-approval only.

## 6. Remaining Cursor Extraction Checklist

Check for these items before fully cancelling or downgrading Cursor. Do not assume they exist unless verified:

- Cursor project rules or workspace instructions not already represented in `AGENTS.md`.
- Cursor composer/chat summaries that contain important project decisions.
- Saved prompts, notepads, scratchpads, or reusable instructions.
- Workflow assumptions that are only present in Cursor history.
- Local Cursor settings that affect repo work, formatting, commands, or agent behavior.
- Any notes about this monorepo that are not in Git and not yet represented under `Documents/`.
- Any decision history explaining why root-level versus site-level Docker/Compose files exist.
- Any unresolved deployment or backup assumptions that were discussed in Cursor but never committed.
- Any dependency/security remediation notes that should become a future plan rather than disappearing with Cursor.

Extraction rule: summarize durable decisions and workflows into repo docs. Do not export or paste secrets, private access details, real allowlists, tokens, passwords, private keys, or credential material.

## 7. Cancel Cursor Risk Assessment

Low-risk to lose:

- Generated suggestions already committed to Git.
- Documentation already captured in `AGENTS.md` and `Documents/`.
- Code changes already present in the repository.
- General advice that can be regenerated from source and docs.

Medium-risk to lose:

- Hidden chat reasoning.
- Old decisions that explain why some files or workflows exist.
- Unresolved project memory not yet represented in documentation.
- Historical troubleshooting context that may help interpret stale docs.

High-risk to lose:

- Unexported Cursor-only rules.
- Important saved prompts or notepads.
- Decision history not moved into repo docs.
- Any Cursor-only workflow assumptions about deployment, backups, secrets, or production operations.

GitHub and repo commits are the real source of code truth. Cursor may contain helpful explanation, but committed source and documentation should remain authoritative.

Cancelling Cursor should wait until:

- `Documents/DOCUMENTATION_AUDIT.md` exists.
- The documentation audit identifies stale or conflicting guidance.
- Important Cursor-only rules/settings have been checked.
- The user is satisfied that Codex can explain the repo using only `AGENTS.md` and `Documents/`.

## 8. VS Code and Codex Operating Model

Intended workflow:

- VS Code is the editor.
- Codex is a scoped repo agent.
- Repository docs are the source of truth.
- The user controls commits and production actions.
- ChatGPT can help craft prompts, review outputs, and reason about task boundaries.
- Codex creates or edits repo artifacts only under explicit task scope.
- Codex starts from `AGENTS.md`, then relevant `Documents/` files, then approved source/config files.

Codex should treat every task as bounded by:

- the user request
- `AGENTS.md`
- `Documents/CODEX_WORKFLOW.md`
- explicit allowed file lists
- secret/runtime/deployment boundaries

## 9. What Codex Should Not Inherit from Cursor

Codex should not inherit:

- blind trust in old generated docs
- hidden implicit assumptions
- stale deployment claims without verification
- automatic dependency fixes
- secret access
- deployment authority
- broad refactor authority
- permission to inspect runtime data
- permission to run Docker, SSH, SCP, rsync, backup, restore, prune, reset, or destructive commands

Future Codex sessions should inspect source and safe docs directly, document conflicts, and ask for approval when scope crosses into code, dependencies, Docker, deployment, security, secrets, databases, backups, or runtime data.

## 10. Next Migration Steps

Recommended sequence:

1. Create `Documents/DOCUMENTATION_AUDIT.md`.
2. Audit existing docs for stale, duplicated, or conflicting guidance.
3. Identify which operational docs are current versus historical.
4. Confirm canonical Docker/Compose workflows.
5. Create a dependency/security remediation plan.
6. Decide whether Cursor can be cancelled, downgraded, or kept temporarily for historical reference.

Dependency/security remediation should begin after the documentation foundation is complete and should start with review, not automatic fixes.

## 11. Open Questions

- What Cursor-specific rules/settings remain outside Git?
- Are there important Cursor conversations that should be exported or summarized into repo documentation?
- Are there saved prompts, notepads, or composer summaries that contain durable project decisions?
- Do current docs fully capture the monorepo's production workflow?
- Which operational docs are current and which are historical?
- Which root or site-level Docker/Compose files are canonical?
- Should dependency remediation begin immediately after the documentation audit, or should it wait for a separate planning task?
- The former master document is archived at `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md`; current focused docs are the practical source of truth for Codex work.
- Should Cursor be cancelled only after Codex successfully completes a full documentation audit using repo files alone?
