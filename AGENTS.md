# AGENTS.md

## Project summary

This repository is a monorepo for two related blog platforms:

- Fruition Forest Garden
- The Tecnoagrarian

The repo includes site-specific code, shared blog-core code, Docker/deployment files, scripts, tests, and operational documentation.

Primary documentation lives in:

- `Documents/MASTER_PROJECT_DOCUMENTATION.md`
- `Documents/`
- `AGENTS.md`

## Highest-priority safety rules

These rules override normal convenience.

- Do not read, print, summarize, copy, modify, or commit actual secret values.
- Treat `.env`, `.env.*`, `SECRETS.md`, credential notes, private keys, passwords, tokens, IP allowlists, deployment credentials, SSH configuration details, 1Password references, and login documents as sensitive.
- Do not include secret values in documentation, chat output, commits, diffs, logs, screenshots, summaries, generated examples, or test output.
- It is acceptable to document environment variable names and their purposes.
- Use placeholders such as `[SERVER_IP]`, `[SSH_USER]`, `[SESSION_SECRET]`, `[CSRF_SECRET]`, `[TRUSTED_IP]`, `[TOKEN]`, `[PASSWORD]`, and `[PRIVATE_KEY]`.
- If a task seems to require reading secrets, stop and ask the user first.

## Files and patterns to avoid unless explicitly approved

Do not open, inspect, summarize, or modify these files/patterns unless the user gives explicit approval for that exact task:

- `.env`
- `.env.*`
- `**/.env`
- `**/.env.*`
- `**/SECRETS.md`
- `**/*SECRET*`
- `**/*secret*`
- `**/*CREDENTIAL*`
- `**/*credential*`
- `**/*LOGIN*`
- `**/*login*`
- `~/.ssh/*`
- `*.pem`
- `*.key`
- `*.p12`
- `id_rsa`
- `id_rsa.pub`
- `id_ed25519`
- `id_ed25519.pub`

Secret-sensitive files may be listed by path only when needed for an inventory, but their contents must not be read or reproduced.

## Working rules

- Inspect before editing.
- Prefer small, focused changes.
- Do not modify application code during documentation-only tasks.
- Do not run destructive commands without explicit approval.
- Do not delete files, reset branches, overwrite databases, prune Docker volumes, or deploy without explicit approval.
- Before editing, summarize the intended change when practical.
- After editing, summarize changed files, key findings, risks, and the next recommended step.
- If repo documentation conflicts with code, document the conflict instead of guessing.
- If something is unclear, record it as “Needs review” or ask the user.

## Git and commit safety

- Never commit `.env`, secret files, private keys, credential docs, or local-only login notes.
- Before suggesting a commit, run or request:
  - `git status`
  - `git diff --stat`
  - targeted diff review for sensitive files
- Prefer small commits grouped by purpose.
- Do not rewrite Git history unless the user explicitly asks.

## Documentation expectations

When architecture, deployment, environment handling, workflows, or security assumptions change, update the relevant documentation.

Codex migration documentation should live in `Documents/`:

- `Documents/REPO_INVENTORY.md`
- `Documents/MONOREPO_CONTEXT.md`
- `Documents/ARCHITECTURE_MAP.md`
- `Documents/ENVIRONMENT_AND_SECRETS_MAP.md`
- `Documents/DEPLOYMENT_RUNBOOK.md`
- `Documents/CODEX_WORKFLOW.md`
- `Documents/CURSOR_TO_CODEX_MIGRATION.md`
- `Documents/DOCUMENTATION_AUDIT.md`

## Environment and secrets documentation rules

For environment variables:

Allowed:
- variable name
- purpose
- file path where referenced
- whether it appears local, production, template, or unknown
- placeholder examples

Not allowed:
- actual values
- passwords
- tokens
- real IP allowlists
- private keys
- session secrets
- OAuth/client secrets
- 1Password item contents

## Structural secret policy

Secrets should be unnecessary for normal documentation, refactoring, linting, testing, and architecture mapping tasks. If a task appears to require a real secret value, stop and ask whether a placeholder, example file, or variable name is sufficient instead.

## Testing expectations

When code changes occur:

- Identify the smallest relevant test/build command.
- Prefer local tests before deployment.
- If tests cannot be run, explain why.
- Do not deploy because tests passed; deployment still requires user approval.

For documentation-only work:

- Do not run deployment commands.
- Do not run destructive Docker or database commands.
- Do not inspect secret values.

## Deployment caution

Deployment affects live sites.

Do not run deployment, rollback, backup restoration, database migration, Docker prune, Docker volume deletion, or server modification commands unless the user explicitly approves that specific action.

Use placeholders in documentation:

- `[SSH_USER]`
- `[SERVER_IP]`
- `[SERVICE_NAME]`
- `[DOMAIN]`
- `[CONTAINER_NAME]`

## Preferred first migration tasks

Start with documentation and inventory, not application changes.

Recommended order:

1. Create `Documents/REPO_INVENTORY.md`
2. Create `Documents/MONOREPO_CONTEXT.md`
3. Create `Documents/ARCHITECTURE_MAP.md`
4. Create `Documents/ENVIRONMENT_AND_SECRETS_MAP.md`
5. Create `Documents/DEPLOYMENT_RUNBOOK.md`
6. Create `Documents/CODEX_WORKFLOW.md`
7. Create `Documents/CURSOR_TO_CODEX_MIGRATION.md`
8. Create `Documents/DOCUMENTATION_AUDIT.md`

## Operator preference

The user values durable, inspectable workflows. Prefer clear documentation, reversible steps, explicit tradeoffs, and conservative handling of secrets over speed.