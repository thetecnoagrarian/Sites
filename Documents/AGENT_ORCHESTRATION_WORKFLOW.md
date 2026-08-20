# Agent Orchestration Workflow

This document captures a reusable human + ChatGPT + Codex workflow for Codex-native project work.

It is intended to be copied into future project repos as a practical template, then adapted to each project's files, risks, tools, and deployment model.

## 1. Purpose

This workflow is not about "using two AI tools." It is about creating a disciplined division of labor among:

- the human operator
- ChatGPT
- Codex
- Git
- project documentation

The goal is to preserve project memory, avoid task drift, protect secrets, keep commits reviewable, and make agent-assisted work transferable across projects.

Confirmed from this monorepo's migration docs: project-specific `AGENTS.md` files, durable repo documentation, scoped Codex prompts, manual Git control, and explicit safety boundaries make Codex work more predictable.

Inferred from the user's cross-project direction: this pattern also applies to the workbench project, the rabbit hutch project, and future Codex-native repos where project files should become the source of truth rather than hidden chat or IDE state.

## 2. Core Operating Model

### Human Operator / Project Owner

The human operator:

- sets goals
- owns final judgment
- approves risk
- reviews diffs
- controls commits
- controls secrets
- decides when to deploy or run destructive commands
- decides what becomes source of truth

The human is the final authority. Agents can advise, inspect, draft, and edit under scope, but they do not own project risk.

### ChatGPT

ChatGPT acts as:

- prompt architect
- workflow strategist
- safety reviewer
- audit partner
- scope controller
- interpreter of Codex output
- reviewer of terminal output
- helper for turning messy intent into precise Codex tasks
- challenger when task drift, security risk, dependency risk, or deployment risk appears

ChatGPT's main job is to shape intent into a bounded task contract and help the human decide whether the result is clean enough to commit.

### Codex

Codex acts as:

- repo-local execution agent
- safe file inspector
- documentation creator
- bounded editor
- code assistant when explicitly approved

Codex is not:

- a deployment operator
- a secret reader
- an autonomous committer
- the final authority
- a substitute for human judgment

Codex should read the project-specific `AGENTS.md` first, inspect only approved files, make only scoped changes, and summarize what it inspected, avoided, changed, and recommends.

### Git

Git is:

- the source of truth for code and committed documentation
- a checkpoint system
- a rollback boundary
- an audit trail
- a commit grouping mechanism

A clean commit history is part of the operating system for the project. Commits should be small, reviewable, and grouped by purpose.

### Project Documentation

Project documentation is:

- durable project memory
- agent-readable source of context
- replacement for hidden IDE/chat state
- preferred source of operating knowledge
- eventual place to separate active guidance from historical record

Documentation should make future work easier without exposing secrets or treating stale history as current instructions.

## 3. Why This Workflow Works

ChatGPT is strong at strategy, scope, prompts, interpretation, and cross-step reasoning.

Codex is strong at local repo inspection, file creation, bounded edits, and implementation inside the repo.

The human keeps authority over judgment, risk, secrets, commits, and production.

Git provides checkpoints and reversibility.

Documentation makes context durable, inspectable, transferable, and less dependent on any one chat or IDE.

The workflow reduces agent drift because each participant has a defined job. ChatGPT frames the task, Codex executes the scoped repo work, Git records clean checkpoints, docs preserve durable knowledge, and the human decides what is accepted.

## 4. Division of Labor Table

| Work type | Human role | ChatGPT role | Codex role | Git/docs role | Risk level | Audit type |
|---|---|---|---|---|---|---|
| New documentation file | Define topic and scope | Draft precise prompt and review result | Inspect approved files and create one file | Docs gain durable context | Safe | Light |
| Architecture map | Confirm scope and allowed source areas | Structure map and call out uncertainty | Inspect safe source/docs and document architecture | Docs become source for future edits | Safe to caution | Light or full if source conflicts matter |
| Environment/secrets map | Control real secrets | Enforce placeholder policy | Document names, paths, purposes, classifications only | Docs clarify secret boundary | Caution | Light plus sensitive-term review |
| Deployment runbook | Approve any production action separately | Separate planning from execution | Document concepts and placeholder-only examples | Runbook preserves safe operator context | High-risk context | Full if commands/config change |
| Documentation consolidation/history archive | Decide active versus historical truth | Classify docs and flag conflicts | Move or draft only approved docs | Docs become cleaner and less stale | Caution | Light or full depending on edits |
| Code review | Ask for review scope | Interpret findings and prioritize risk | Inspect code and report issues | Findings may become issues/docs | Caution | Full review posture |
| Small code fix | Approve exact fix | Define patch boundaries and test plan | Edit scoped files only | Commit isolates fix | Approval-required | Full |
| Dependency/security remediation | Approve remediation plan | Separate direct/transitive risk and audit plan | Inspect manifests/lockfiles, then patch only approved updates | Commit by dependency/risk category | High-risk | Full |
| Docker/config changes | Approve exact config scope | Identify runtime/deploy impact | Edit approved config only | Docs/runbooks updated if assumptions change | High-risk | Full |
| Deployment planning | Confirm target and risk | Build checklist and stop conditions | Inspect safe runbooks/config only | Runbook/checklist captures plan | High-risk planning | Full planning audit |
| Actual deployment | Explicitly approve exact command | Challenge assumptions before execution | Does not deploy unless specifically approved | Git marks deployed version | High-risk | Operator checklist required |
| Backup/restore planning | Decide recovery goal | Separate backup concept from restore execution | Document plan with placeholders | Runbook captures risk boundary | High-risk planning | Full |
| Destructive cleanup | Explicitly approve or reject | Require inventory and rollback concept | Does not delete without approval | Git may not cover runtime deletion | High-risk | Full |
| Prompt generation | State goal | Produce task contract | None until prompt is run | Prompt may become reusable docs | Safe | Light |
| Commit planning | Decide commit grouping | Interpret status/diff and suggest boundary | Does not stage/commit by default | Git records checkpoint | Caution | Light or full by change type |

## 5. Standard Workflow Loop

1. Human describes goal or problem.
2. ChatGPT clarifies scope and risk.
3. ChatGPT writes a precise Codex prompt.
4. Codex executes only the scoped task.
5. Codex summarizes what it inspected, avoided, changed, and recommends.
6. Human runs `git status` and targeted diffs, or shares the output.
7. ChatGPT interprets output and recommends light or full audit.
8. Human commits manually if clean.
9. Documentation is updated when the workflow reveals durable knowledge.
10. Historical or informational material is marked for consolidation instead of being treated as current operating truth forever.

This loop keeps planning, execution, audit, and commit control separate.

## 6. Prompt Architecture Pattern

Strong Codex prompts should include:

- Read `AGENTS.md` first.
- State active permission mode.
- Define exact task.
- Define exactly what file(s) may be created or edited.
- Define what must not be touched.
- Define safe files Codex may inspect.
- Define forbidden files and folders.
- Define whether reviewed-safe operational docs may be used.
- Define whether this is documentation, code, dependency, Docker, deployment, security, or audit work.
- Define output structure.
- Define stop conditions.
- Define post-task summary requirements.

### Copyable Handoff Format

When ChatGPT writes a prompt for the human to paste into Codex, the prompt should be delivered as one complete copyable text block.

Do not split one Codex prompt across multiple code boxes or prose sections. Any commands, constraints, allowed files, forbidden files, output requirements, final reporting requirements, audit requirements, and stop conditions that Codex needs must be inside the same copyable prompt block.

Explanatory notes for the human may appear before or after the prompt, but they must not contain required instructions that Codex needs to execute the task. If the prompt contains shell commands, keep them inside the same prompt block rather than creating separate command boxes that could be mistaken for user-run commands.

The human should be able to copy the block once and paste it into Codex without losing context.

### Reusable Prompt Skeleton

```text
Read AGENTS.md first and follow it strictly.

Active permission mode: [PERMISSION_MODE].

Task: [TASK_NAME]

Create or edit only:
- [NEW_FILE_PATH]

Do not modify application code.
Do not edit existing files unless explicitly listed above.
Do not run installs, tests, Docker commands, deployment commands, npm audit fix,
git add, git commit, git reset, delete, move, SSH, SCP, rsync, or network commands
unless this prompt explicitly approves them.

This task type is:
- [TASK_TYPE]

You may inspect these safe files:
- [ALLOWED_FILES]

You must not open or inspect:
- [FORBIDDEN_FILES]

Reviewed-safe operational docs:
- [REVIEWED_SAFE_DOC_POLICY]

Output document sections:
- [OUTPUT_SECTIONS]

Stop conditions:
- [STOP_CONDITIONS]

Post-task summary:
- [POST_TASK_SUMMARY]

Audit expectation:
- [AUDIT_TYPE]

Use placeholders for any sensitive values. Do not include actual secrets.
```

Template placeholders:

- `[TASK_NAME]`
- `[NEW_FILE_PATH]`
- `[ALLOWED_FILES]`
- `[FORBIDDEN_FILES]`
- `[OUTPUT_SECTIONS]`
- `[POST_TASK_SUMMARY]`
- `[AUDIT_TYPE]`
- `[STOP_CONDITIONS]`

## 7. Audit Model

### Light Audit

Use for new documentation files and narrow documentation edits.

Checks:

- Confirm only the intended file changed.
- Confirm no application code changed.
- Grep or scan for sensitive terms.
- Scan for real values where placeholders should be used.
- Review unsupported claims.
- Review whether Codex stayed in scope.
- Commit manually if clean.

### Full Audit

Use for code, dependency, Docker, deployment, security, auth, database, backup, CI, or destructive changes.

Checks:

- Inspect `git status`.
- Inspect `git diff --stat`.
- Inspect targeted diffs.
- Review sensitive paths.
- Check generated files.
- Review test/build plan.
- Review rollback impact.
- Review commit boundaries.
- Decide whether documentation must be updated.

New documentation gets a light audit. System-changing work requires full audit.

## 8. Commit Model

Codex should not run `git add` or `git commit` unless explicitly approved.

The human commits manually.

Commit rules:

- Commit after clean checkpoints.
- Keep commits small and grouped by purpose.
- Avoid mixing documentation, dependency updates, Docker changes, and application code in one commit.
- Review status and diffs before committing.
- Never commit `.env`, secret files, databases, uploads, backups, private keys, certificates, credential exports, or local-only credential notes.

Git is the rollback boundary for source and docs. Runtime state may not be recoverable through Git, which is why deployment, backup, restore, cleanup, and database work need stricter controls.

## 9. Secrets and Safety Model

Secrets should be structurally hard to touch, easy to detect, and unnecessary for normal work.

Normal documentation, refactoring, linting, testing, and architecture mapping should not require real secret values.

Codex may document:

- environment variable names
- file paths where variables are referenced
- inferred purposes
- source/template/local/production/CI scope
- secret classification
- placeholders

Codex must not open or reproduce:

- real `.env` files
- `Documents/SECRETS.md`
- private keys
- databases
- uploads
- backups
- credential exports
- passwords
- tokens
- real IP allowlists
- private operational values

ChatGPT should challenge any task that appears to require secrets. The human controls all real secret values outside chat and repo docs.

Use placeholders:

- `[SESSION_SECRET]`
- `[CSRF_SECRET]`
- `[TOKEN]`
- `[PASSWORD]`
- `[SERVER_IP]`
- `[SSH_USER]`
- `[DATABASE_PATH]`
- `[UPLOADS_PATH]`
- `[TRUSTED_IPS]`

## 10. Task Boundary Model

### Safe

- documentation
- inventory
- architecture mapping
- prompt drafting
- read-only planning

### Caution

- code review
- config review
- CI review
- source inspection
- documentation consolidation where old docs may contain operational-sensitive history

### Approval-Required

- code edits
- dependency updates
- test runs that generate files
- Docker commands
- Git staging/committing
- cleanup commands

### High-Risk / Explicit Approval Only

- deployment
- SSH/SCP/rsync
- backup restore
- database migration
- Docker prune/volume manipulation
- production restart
- secret handling

## 11. Dependency/Security Remediation Workflow

Dependency/security remediation belongs inside this orchestration workflow as a high-risk task class.

Rules:

- Do not run `npm audit fix` blindly.
- Inspect package manifests and lockfiles first.
- Determine the affected workspace.
- Separate direct dependencies from transitive dependencies.
- Consider Node version alignment with Docker and CI.
- Avoid mixing dependency changes with documentation commits.
- Avoid mixing dependency remediation with deployment work.
- Require full audit before committing dependency changes.
- Require a rollback/testing plan for dependency updates.
- Use small commits grouped by dependency or risk category.
- Update documentation if dependency remediation changes runtime assumptions.

For this monorepo, active package engines require Node `>=24.0.0 <25`, while active Docker and CI paths use exact Node `24.19.0`; Docker remains on Alpine 3.23. Local ARM64 and emulated AMD64 gates passed, but an agent must keep final native Linux musl AMD64 validation as an explicit pre-deployment gate.

## 12. Deployment Operator Checklist Policy

Deployment tasks should require a deliberate operator checklist.

Advantages:

- Creates a deliberate pause before production-affecting actions.
- Separates deployment planning from deployment execution.
- Forces confirmation of branch, clean status, target service, backup status, env file presence, rollback concept, exact command, and explicit user approval.
- Reduces "planning slid into doing" risk.
- Keeps the human operator in charge.

Disadvantages:

- Can create checklist sprawl.
- Can feel bureaucratic for rare deployments.
- Can create false confidence if assumptions are stale.
- Must be treated as a gate, not a guarantee.

Recommendation:

- Deployment tasks should require a separate operator checklist section or appendix inside `Documents/DEPLOYMENT_RUNBOOK.md`.
- Do not create a separate `Documents/DEPLOYMENT_OPERATOR_CHECKLIST.md` yet unless deployments become frequent.
- A future standalone checklist may be useful once the deployment workflow is proven and repeated.

## 13. Documentation Consolidation and History Model

The current documentation set is useful, but it may eventually need consolidation.

Documentation categories:

- Active source-of-truth docs.
- Operational runbooks.
- Migration/workflow docs.
- Historical/context docs.
- Deprecated or superseded docs.
- Future cleanup candidates.

Active source-of-truth docs should guide current work. Historical/context docs should preserve useful history without being treated as current instructions.

Some older docs preserve decisions, troubleshooting, and workflow context but may contain stale status, old operational assumptions, or sensitive-adjacent history. They should be classified rather than blindly trusted or prematurely deleted.

Historical material should eventually be consolidated into something like:

- `Documents/PROJECT_HISTORY.md`
- `Documents/HISTORICAL_NOTES.md`

Consolidation rules:

- Do not delete useful context prematurely.
- Do not copy secrets into history docs.
- Mark conflicts as Needs Review.
- Prefer active docs for current operating rules.
- Preserve why decisions were made when that knowledge remains useful.
- Let a documentation audit decide what remains active, what becomes reference/history, and what should be merged.

Codex should not guess that older docs are wrong. If current source and older docs conflict, record the conflict and ask for review.

## 14. How This Applies Across Projects

This model applies to:

- this monorepo
- the workbench project
- the rabbit hutch project
- future Codex-native projects

Inferred from the user's stated cross-project pattern:

- Each project should have its own project-specific `AGENTS.md`.
- Each project can copy this orchestration workflow as a template.
- Each project should adapt the workflow to its own risks, files, tools, and deployment model.
- A main template can be updated when a project matures or when the user decides an `AGENTS.md` update should be generalized.
- Project files become source of truth.
- Prompts become task contracts.
- Codex handles local execution.
- ChatGPT handles strategy and review.
- Git captures checkpoints.
- The human stays in control.

For a non-deployment build/documentation project, the high-risk sections may focus on generated files, print/export artifacts, source-of-truth planning files, and not inventing unsupported details.

For a deployed web/service project, the high-risk sections must include secrets, runtime data, Docker, CI, backups, and production operations.

## 15. Signs the Workflow Is Healthy

- Prompts are precise.
- Codex changes only expected files.
- `git status` is understandable.
- Commits are small.
- Docs improve over time.
- Secrets are never needed.
- Open questions are captured.
- Task drift is caught early.
- Dependency/security/deployment work is not mixed into unrelated commits.
- Historical docs are being classified rather than blindly trusted.
- The human can explain the current state without relying on hidden chat history.

## 16. Signs the Workflow Is Drifting

- Codex edits extra files.
- Prompts become broad or vague.
- Secrets are requested.
- Dependency fixes happen during documentation work.
- Docker/deployment commands appear casually.
- Commits mix many unrelated concerns.
- Source and docs conflict without being recorded.
- Generated files appear unexpectedly.
- Historical docs are treated as current without review.
- The human is no longer sure what changed.

## 17. Recovery Procedure

If the workflow drifts:

1. Stop Codex.
2. Run or request `git status`.
3. Inspect changed files.
4. Avoid committing.
5. Classify changes as intended, unintended but useful, generated/runtime, sensitive-risk, or unsafe.
6. Restore unintended files only if appropriate and approved.
7. Ask ChatGPT to interpret the change set.
8. Return to one-file or small-task mode.
9. Update docs if the drift revealed a useful boundary.

Do not run destructive restore/reset/delete commands unless explicitly approved. If a command is needed, it should be placeholder-only in planning and clearly labeled approval-required.

## 18. Relationship to Cursor Migration

Cursor context was useful but hidden.

Codex plus repo docs makes context more durable.

ChatGPT helps preserve continuity and prompt quality.

The goal is not to replace judgment with agents. The goal is to improve leverage while keeping ownership.

The migration is not complete until hidden Cursor-only rules, prompts, or critical decisions have either been extracted into repo documentation or declared nonessential by the human operator.

## 19. Recommended Reusable Prompt Checklist

Before giving the human a Codex prompt, ChatGPT should check:

- Is the task type clear?
- Is the output file named?
- Are allowed files listed?
- Are forbidden files listed?
- Are secrets excluded?
- Are commands restricted?
- Is scope one task?
- Is audit method clear?
- Is commit boundary clear?
- Is the next step defined?
- Is this active workflow, historical consolidation, dependency remediation, deployment planning, or code work?
- Does the prompt tell Codex when to stop?

## 20. Recommended Future Template Strategy

This workflow should be copied into future Codex-native repos.

Each project should keep its own project-specific `AGENTS.md`.

A main reusable template should exist and be updated when a project matures enough to generalize lessons.

The template should stay practical and operator-focused, not generic or abstract.

Updates to the shared template should be deliberate, not automatic. A lesson from one project should be promoted into the main template only when it is broadly useful and does not weaken project-specific safety boundaries.

## 21. Open Questions

- Where should the main reusable template live outside this monorepo?
- Should the reusable template be tracked in a separate repo, a personal knowledgebase, or a project template folder?
- When should improvements from one project be promoted back into the template?
- Should deployment operator checklists remain inside `Documents/DEPLOYMENT_RUNBOOK.md` until deployment becomes frequent?
- Should a future documentation audit create `Documents/PROJECT_HISTORY.md` or `Documents/HISTORICAL_NOTES.md`?
- Which current docs are active source-of-truth versus historical record?
- Should dependency/security remediation get a dedicated checklist section inside this workflow?
- Should this workflow eventually be split into a project-local version and a separate global template version?
