# Deployment Discovery

This document collects deployment clues from safe repository files after the latest GitHub push. It does not deploy anything, run Docker, connect to a server, inspect secrets, or verify live production state.

The goal is to help choose the next safe deployment step for the live Fruition Forest Garden and The Tecnoagrarian sites.

No `.env*` files, `Documents/SECRETS.md`, database files, upload folders, backup contents, private keys, certificates, credential exports, runtime data, SSH configuration, or server-only files were inspected.

## 1. Purpose

This discovery pass looks for current and historical deployment information in approved repository documentation, Compose files, Dockerfiles, scripts, CI configuration, and nginx configuration.

It is intentionally not a deployment procedure. Any SSH, Docker Compose, backup, cleanup, restore, nginx, database, or production command requires explicit user approval before execution.

This file should help answer:

- whether a GitHub push alone deploys production
- whether deployment is probably SSH-based
- which Compose/Docker files appear involved
- which docs are current versus historical
- what must be confirmed before a production action

## 2. Current Known State

User-provided facts for this discovery task:

- Local repo is on `main`.
- Latest pushed commit is `7c3371d Allow public crawlers while blocking sensitive probes`.
- `origin` points to `[GITHUB_REPO]` under the user's GitHub account.
- The Google indexing fix is pushed to GitHub.

These facts were not re-verified in this task because Git and network commands were out of scope.

## 3. Deployment Information Sources Found

| File path | What deployment-related information it contains | Current confidence | Risk level | Safe summary | Do not reproduce details |
|---|---|---|---|---|---|
| `Documents/DEPLOYMENT_RUNBOOK.md` | Current placeholder-based deployment model, file roles, backup concepts, preflight checklist, rollback concepts, CI notes, approval boundaries | active | high | Safest current planning doc. It intentionally avoids live access details and says production actions require explicit approval. | Do not convert placeholders into real values. |
| `Documents/DOCUMENTATION_AUDIT.md` | Classifies deployment docs as active, historical, needs review, or high-risk | active | medium | Confirms `DEPLOYMENT_RUNBOOK.md` should be trusted before older operational notes. | Do not treat older docs as current without review. |
| `Documents/CODEX_WORKFLOW.md` | Codex task boundaries, deployment stop rules, approval model | active | medium | Codex must not run deployment, Docker, SSH, backup, restore, prune, reset, or destructive commands without approval. | No secret values. |
| `Documents/AGENT_ORCHESTRATION_WORKFLOW.md` | Human, ChatGPT, Codex, Git, and docs division of labor | active | low | Deployment planning is separate from deployment execution; human approves exact production actions. | No live operational details. |
| `Documents/CURSOR_TO_CODEX_MIGRATION.md` | Why deployment context moved into durable docs | active for migration | low | Treats deployment knowledge as repo documentation, not hidden IDE state. | No live operational details. |
| `Documents/REPO_INVENTORY.md` | Lists deployment-related files, scripts, env files by path, runtime/generated folders | active | medium | Good path inventory. Marks Compose/script canonical status as Needs Review. | Sensitive paths are path-only. |
| `Documents/MONOREPO_CONTEXT.md` | High-level local, local-production-like, and production model | active | low | Describes Docker Compose production concept and documentation as source of truth. | No live operational details. |
| `Documents/ARCHITECTURE_MAP.md` | Docker/Compose/nginx/CI architecture and known mismatches | active | medium | Confirms root production Compose, shared production Dockerfile, named volumes, nginx reverse proxy, and no visible automatic production deployment. | Does not confirm live server state. |
| `Documents/ENVIRONMENT_AND_SECRETS_MAP.md` | Environment-variable structure and secret boundaries | active | high | Identifies `.env` path-only handling, production/local Compose env differences, and variable mismatches. | Do not reproduce env values, trusted IPs, or secrets. |
| `Documents/archive/history/MASTER_PROJECT_DOCUMENTATION.md` | Broad historical project/deployment notes | archived history | high | Newer focused docs supersede it for current safety and deployment guidance. | Contains sensitive-adjacent and stale operational detail; use placeholders only. |
| `Documents/LOCAL_SETUP_QUICKSTART.md` | Local production-like testing workflow | likely active but needs review | medium | Describes testing with `docker-compose.local-prod.yml` before deployment. | Do not copy sample secret values into active docs. |
| `Documents/LOCAL_DOCKER_SYNC_GUIDE.md` | Older local-prod workflow and deployment example | historical / needs review | high | Supports the idea that local production-like testing should happen before production. | Contains live-looking deploy command details; use placeholders only. |
| `Documents/BACKUP_SYSTEM_GUIDE.md` | Backup flow, host/container backup concepts, cron setup, restore checks | operational reference / needs review | high | Shows backups involve database and uploads, container scripts, host scripts, retention, and cron concepts. | Contains live-looking SSH/server/container/path commands; use placeholders only. |
| `Documents/GITHUB_AUTHENTICATION_SETUP.md` | GitHub SSH authentication, deploy-key/account-key concepts, server pull/auth options | sensitive-adjacent / needs review | high | Suggests server GitHub access may use SSH agent forwarding or server deploy keys. | Do not reproduce account identifiers, key paths, public keys, or SSH config details. |
| `Documents/POST_LAUNCH_CLEANUP.md` | Production path rationale and cleanup warnings | historical / needs review | high | Points to `[DEPLOY_PATH]` as active project location historically and warns not to delete active runtime state. | Contains production paths and destructive cleanup examples; placeholder-only. |
| `Documents/ANALYTICS_CLEANUP_GUIDE.md` | Analytics database cleanup concepts | high-risk operational reference | high | Not a deployment guide. Contains database mutation and cleanup workflow that must remain approval-required. | Do not reproduce production access details or point-in-time analytics data. |
| `Documents/DIRECTORY_AUTO_CREATION_FIX.md` | Local-vs-Docker path fix history | historical / context | medium | Explains Docker path defaults and local runtime directory behavior. | Do not inspect or restore real `.env` backups. |
| `Documents/ENVIRONMENT_TEMPLATE.md` | Production env template names and placeholder-style defaults | reference / needs review | high | Useful for variable names only. Some variables may be stale or future-facing. | Do not copy real values; template values should be reviewed before use. |
| `package.json` | npm workspace scripts and Node/npm engines | active config | low | Contains local start/dev/test scripts, not deployment scripts. Node engine allows `>=18`. | Do not run scripts in this task. |
| `blog-core/package.json` | Shared package dependencies and scripts | active config | low | No deployment script; test script is placeholder-like. | Do not run scripts in this task. |
| `fruitionforestgarden/package.json` | Site start/dev/backup scripts and Node engine | active config | medium | Site package can start app and run site backup scripts locally, but not a production deploy entry point. | Do not run scripts; backup scripts are runtime-affecting. |
| `thetecnoagrarian/package.json` | Site start/dev/backup scripts and Node engine | active config | medium | Same operational shape as Fruition Forest Garden. | Do not run scripts; backup scripts are runtime-affecting. |
| `docker-compose.yml` | Local development Compose services | active config / needs review | medium | Uses site dev Dockerfiles, local bind mounts, local ports, and `UPLOAD_PATH` naming. | Do not run Docker commands. |
| `docker-compose.prod.yml` | Production Compose services | likely active | high | Defines two production services, shared Dockerfile builds, `.env` by path, named volumes, health checks, and production environment variables. | Do not inspect `.env` or runtime volumes. |
| `docker-compose.local-prod.yml` | Local production-like Compose services | likely active | high | Uses shared production Dockerfile, `.env.local` path, bind mounts, local-prod containers, production-like ports/settings. | Do not inspect `.env.local`; do not run Docker. |
| `docker/Dockerfile.prod.site` | Shared production image build | likely active | medium | Node 20 Alpine multi-stage image, production dependencies, runtime dirs, non-root user, app start command. | No secrets found. |
| `nginx/blog.conf` | Reverse proxy/static alias config | needs review | high | Defines HTTP to HTTPS redirect, site server blocks, upstreams, SSL file paths, proxy headers, static aliases. Potential port mismatch with production Compose. | Do not inspect certificates or private keys. |
| `.dockerignore` | Production build context exclusions | active config | medium | Excludes docs, env files, databases, logs, uploads, backups, tests, node_modules, Git metadata, and Compose/Docker helper files. | Do not assume `.gitignore` coverage from this file alone. |
| `.github/workflows/ci-cd.yml` | GitHub Actions CI workflow | active config | medium | Runs on push/pull request to `main`, installs dependencies, runs tolerant lint/test/audit/E2E steps, validates Compose YAML, does not deploy automatically. | Do not overstate CI guarantees. |
| `scripts/backup.sh` | Container-side backup script | production-related / approval-required | high | Backs up database and uploads inside container and cleans old backups. | Do not run; affects runtime/backups. |
| `scripts/backup-host.sh` | Host-side backup orchestration | production-related / approval-required | high | Runs container backups, copies backup output to host backup folders, performs retention cleanup. | Do not run; affects production runtime/backups. |
| `scripts/setup-backups.sh` | Backup setup helper | historical / high-risk | high | Contains SSH/SCP/cron setup concepts and live-looking details. | Do not reproduce access details; do not run. |
| `scripts/sync-local-prod.sh` | Local production-like Docker helper | local-only but high-impact | high | Stops/removes/builds/starts local containers using `docker-compose.local-prod.yml`. | Do not run without Docker approval. |
| `scripts/cleanup-disk-space.sh` | Server cleanup helper | production-related / destructive | high | Prompts for SSH details, runs remote Docker cleanup and backup cleanup concepts. | Do not run; use placeholders only. |
| `scripts/cleanup-analytics-container.js` | Analytics database cleanup script | production/runtime data | high | Deletes old analytics rows, vacuums database, preserves aggregate tables. | Do not run; mutates databases. |
| `start-all-sites.sh` | Local Docker start helper | local-only / needs review | high | Starts site-level Docker Compose services and prints credential-looking local notes. | Do not reproduce credentials; do not run. |
| `stop-all-sites.sh` | Local Docker stop helper | local-only / approval-required | medium | Stops site-level Docker Compose services. | Do not run without Docker approval. |
| `restart-all-sites.sh` | Local Docker restart helper | local-only / approval-required | medium | Restarts site-level Docker Compose services. | Do not run without Docker approval. |

## 4. Existing Deployment Runbook Status

`Documents/DEPLOYMENT_RUNBOOK.md` is the current safest deployment planning document.

It knows:

- the monorepo has two Node/Express site services
- production appears Docker Compose based
- `docker-compose.prod.yml` is the likely production Compose file
- `docker/Dockerfile.prod.site` is the shared production Dockerfile
- nginx likely fronts the app containers
- runtime data lives in databases, uploads, logs, backups, and Docker volumes
- backups and rollback must be considered before deployment
- CI does not equal deployment approval
- production commands require explicit user approval

It intentionally does not know:

- real `[SSH_USER]`
- real `[SERVER_IP]`
- real `[DEPLOY_PATH]`
- real `[ENV_FILE]` contents
- real trusted IP allowlists
- private keys, certificates, or 1Password item contents
- whether the checked-in nginx config exactly matches production
- whether the target server uses `docker-compose` or `docker compose`

Before production deployment, confirm:

- exact production repo path as `[DEPLOY_PATH]`
- exact service name as `[SERVICE_NAME]`
- exact command style on the target host
- whether the server pulls from `[GITHUB_REPO]`
- whether only Fruition Forest Garden should be rebuilt/restarted
- whether backups are current and restorable
- whether nginx config is repo-managed or server-managed

## 5. Local Production-Like Workflow

Confirmed from safe files:

- `docker-compose.local-prod.yml` is designed to test production-like behavior locally.
- It builds each site from `docker/Dockerfile.prod.site`.
- It references `.env.local` by path only.
- It uses bind mounts for local source and local runtime folders.
- It uses production-like ports and runtime settings, but local-friendly logging/rate-limit behavior.
- `Documents/LOCAL_SETUP_QUICKSTART.md` and `Documents/LOCAL_DOCKER_SYNC_GUIDE.md` both say local production-like testing should happen before production deployment.

How it differs from production:

- local-prod uses `.env.local`, not `[ENV_FILE]`
- local-prod bind-mounts local source and runtime folders
- production Compose uses named data/log volumes
- local-prod is not proof that production nginx, certificates, server disk, env files, or remote Git auth are correct

Useful before deployment:

- validating the production Dockerfile build
- catching image/runtime path problems
- checking the public crawler fix in a production-like Node environment before server deployment

Needs Review:

- Some older docs describe creating `docker-compose.local-prod.yml` from production Compose, but the file already exists.
- Local docs include command examples that start/stop containers; those remain approval-required.
- `docker-compose.yml` uses `UPLOAD_PATH`, while source and production/local-prod Compose use `UPLOADS_PATH`.

## 6. Production Deployment Clues

Inferred from safe docs and config:

- Deployment appears SSH-based.
- Production appears to use a server-side checkout at `[DEPLOY_PATH]`.
- Production likely uses `docker-compose.prod.yml`.
- Production likely rebuilds/restarts one or both services with Docker Compose.
- GitHub push alone does not appear sufficient to update production.
- CI validates some things but does not perform production deployment.
- The server may pull code from `[GITHUB_REPO]` using SSH authentication, agent forwarding, or a deploy key. Needs Review.

Production Compose clues:

- `docker-compose.prod.yml` defines two site services.
- Each service builds from `docker/Dockerfile.prod.site`.
- Each service references `.env` by path only.
- Each service sets production environment variables.
- Each service mounts named runtime data/log volumes.
- Each service has an HTTP health check.

Nginx clues:

- `nginx/blog.conf` defines reverse proxy server blocks and static aliases.
- It includes SSL certificate paths, but certificate files were not inspected.
- Needs Review: checked-in nginx upstream ports do not obviously match the production Compose container ports. This may mean the nginx file is historical/reference, meant for a different Compose file, or not deployed as-is.

Historical docs:

- Older docs contain direct SSH plus Docker Compose examples, sometimes with live-looking values. These support the SSH/manual-deploy hypothesis but should not be copied into active procedures without placeholder redaction and confirmation.

## 7. GitHub / CI Role

Confirmed from `.github/workflows/ci-cd.yml`:

- Workflow runs on push to `main`.
- Workflow runs on pull requests targeting `main`.
- CI uses Node 20.
- CI installs dependencies.
- CI attempts linting for `@ffg/blog-core`, tolerating missing lint scripts.
- CI installs Playwright Chromium dependencies.
- CI attempts unit tests for `@ffg/blog-core`, tolerating missing tests.
- CI runs E2E tests against a public test URL and continues on error.
- CI runs `npm audit` for `@ffg/blog-core` and continues on error.
- CI verifies `docker-compose.prod.yml` as YAML.
- The visible production deploy step is only a placeholder.

Important finding:

- The workflow contains a deploy step gated on `workflow_dispatch`, but the workflow `on:` section does not declare `workflow_dispatch`. Based on safe inspection, GitHub Actions does not deploy production automatically.

Conclusion:

- Pushing to GitHub likely updates the repository and triggers CI only.
- Production likely still needs a manual server-side deploy action after CI review.
- Needs Review: confirm whether any separate workflow, webhook, server cron, or external deploy automation exists outside the inspected file.

## 8. Scripts Related to Deployment

| Script | Classification | Risk | Safe summary |
|---|---|---|---|
| `scripts/backup.sh` | backup-related, production-related | high | Container-side backup of database/uploads plus retention cleanup. Approval required. |
| `scripts/backup-host.sh` | backup-related, production-related | high | Host-side orchestration for both containers and host backup copies. Approval required. |
| `scripts/setup-backups.sh` | backup setup, SSH/SCP/cron-related | high | Contains live-looking setup details. Needs placeholder rewrite before active use. Approval required. |
| `scripts/sync-local-prod.sh` | local production-like Docker helper | high | Stops/removes/builds/starts local containers. Approval required because it changes Docker state. |
| `scripts/cleanup-disk-space.sh` | server cleanup/destructive | high | Remote disk and Docker cleanup helper. Explicit approval only. |
| `scripts/cleanup-analytics-container.js` | runtime database cleanup | high | Deletes old analytics rows and vacuums database. Backup and explicit approval required. |
| `start-all-sites.sh` | local Docker helper | high | Starts site-level Docker Compose services. Needs review; prints credential-looking local notes. |
| `stop-all-sites.sh` | local Docker helper | medium | Stops site-level Docker Compose services. Approval required. |
| `restart-all-sites.sh` | local Docker helper | medium | Restarts site-level Docker Compose services. Approval required. |

Do not run any of these as part of discovery.

## 9. Backup and Rollback Implications

Backup docs/scripts imply:

- Runtime databases and uploads are the key backup targets.
- Source code is expected to be recoverable from Git.
- Container-side backups and host-side backups both exist as concepts.
- Cron-based automation may be intended, but current automation status is Needs Review.
- Backup retention cleanup exists and can delete old backup files.

Before deployment:

- Confirm whether a recent backup exists without opening backup contents.
- Confirm whether backup scripts are current and safe.
- Confirm whether backup automation is actually enabled.
- Confirm rollback scope: code-only rollback, service rebuild/restart, database restore, upload restore, or nginx change.

Rollback caution:

- Database restore, upload restore, volume manipulation, image rollback, production restart, nginx reload, backup deletion, and cleanup are high-risk and require explicit approval.
- A deployment plan should name the exact rollback concept before the deployment command is approved.

## 10. Recommended Safe Deployment Path From Current Evidence

Do not execute this plan without explicit user approval for each command category.

### Stage A: Confirm GitHub Push Complete

- Confirm the pushed commit is present in `[GITHUB_REPO]`.
- Confirm CI status for the pushed commit.
- Note any tolerated CI failures.

### Stage B: Confirm Local Working Tree Clean

- Review local status and diffs.
- Confirm no sensitive/runtime files are staged or modified unintentionally.

### Stage C: Optional Local Production-Like Test

- If the user approves Docker commands, test `docker-compose.local-prod.yml` locally.
- Verify Fruition Forest Garden public routes and `/robots.txt` locally.
- Stop local test containers only with approval.

### Stage D: Confirm Production Deployment Method

- Confirm `[DEPLOY_PATH]`.
- Confirm whether server pulls from GitHub or receives files another way.
- Confirm `docker-compose` versus `docker compose`.
- Confirm whether `docker-compose.prod.yml` is the production Compose file.
- Confirm whether checked-in `nginx/blog.conf` is active, reference-only, or superseded on the server.

### Stage E: Confirm Backup Status

- Confirm backup recency and location without opening backup contents.
- Confirm rollback concept.

### Stage F: Approve Exact Deployment Command

- User approves the exact placeholder-expanded command outside this document.
- Prefer deploying only `[SERVICE_NAME]` if the fix affects only Fruition Forest Garden and Compose/service dependencies allow it.

### Stage G: Deploy Target Service

- Approval required.
- Likely action: SSH to `[SERVER_IP]`, go to `[DEPLOY_PATH]`, update code from `[GITHUB_REPO]`, rebuild/restart `[SERVICE_NAME]` with production Compose.

### Stage H: Verify Live Site

- Approval required for network commands if Codex is asked to run them.
- Verify homepage, `/robots.txt`, and Googlebot user agent behavior for `[DOMAIN]`.
- Confirm admin/private areas remain protected.

### Stage I: Google Search Console Follow-up

- Use URL Inspection.
- Test Live URL.
- Confirm Page fetch is successful.
- Confirm Indexing allowed is Yes.
- Submit sitemap if available.
- Request indexing only after live test passes.

## 11. Exact Questions for the User Before Deployment

1. Do you want to test local production-like Docker before production deployment?
2. Do you want to deploy only Fruition Forest Garden, or both sites?
3. Is `[DEPLOY_PATH]` still the active production path?
4. Does the server use `docker-compose` or `docker compose`?
5. Is the server expected to pull from `[GITHUB_REPO]`, or receive files another way?
6. Does the server authenticate to GitHub through SSH agent forwarding, a deploy key, or another method?
7. Do backups currently run automatically, and where is backup status verified?
8. Should a fresh backup be taken before deploying the crawler fix?
9. Is `nginx/blog.conf` deployed from this repo, or is it reference-only?
10. Are the checked-in nginx upstream ports current for production?
11. Should `/robots.txt` be verified only after service deploy, or does nginx serve it separately in production?
12. Is there any external deploy automation outside `.github/workflows/ci-cd.yml`?

## 12. Approval-Required Commands

The following command categories require explicit approval before Codex runs or helps execute them:

- SSH to `[SERVER_IP]`
- SCP to or from `[SERVER_IP]`
- rsync to or from `[SERVER_IP]`
- Git operations on the production server
- Docker Compose build/start/stop/restart/log commands
- Docker image/container/cache cleanup
- Docker volume inspection or manipulation
- backup creation
- backup restore
- backup deletion or retention cleanup
- database inspection, migration, restore, or mutation
- analytics cleanup
- production nginx reload/restart/config test
- deployment commands
- cron setup or modification
- any command that expands placeholders into live access details

Placeholder-only examples must remain marked approval-required. Do not place real server/user/path/token/key values in documentation.

## 13. Immediate Next Recommendation

The next safest step is to decide between two paths:

1. Run local Git/GitHub/CI verification manually or with explicit approval, then decide whether production deploy planning can continue.
2. If Docker is approved, test `docker-compose.local-prod.yml` locally before production deployment.

Do not deploy until the exact target service, server path, backup status, Compose command style, and live verification plan are confirmed.

## 14. Open Questions

- Is `[DEPLOY_PATH]` still the active production path?
- Is production deployment definitely manual SSH plus Docker Compose?
- Does the production server pull from `[GITHUB_REPO]` after a GitHub push?
- Is there any deploy automation outside `.github/workflows/ci-cd.yml`?
- Should deployment use `docker-compose` or `docker compose`?
- Should only Fruition Forest Garden be rebuilt for the crawler fix?
- Is `docker-compose.prod.yml` the canonical production Compose file?
- Are site-level Compose files still current or historical?
- Is `nginx/blog.conf` active production config or reference-only?
- Why do checked-in nginx upstream ports appear to differ from production Compose service ports?
- Are backup scripts current and verified?
- Are backup cron jobs enabled?
- Should a backup be run immediately before deploying this code-only fix?
- Is rollback code-only, image-based, database-involved, or volume-involved?
- Should `UPLOAD_PATH` in local Compose be corrected to `UPLOADS_PATH` before more Docker testing?
- Should Node 20 become the documented runtime baseline because Docker and CI use it?
- Should older docs with live-looking access details be redacted or consolidated into historical notes?
