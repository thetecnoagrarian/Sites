# Production Deployment Model

## Purpose

This document captures the safe, committable production deployment model for the two-site monorepo.

It explains how production deployment works without exposing private operator details, live access targets, key paths, fingerprints, passphrases, tokens, environment values, or secret material.

This is the committed high-level model. Exact operator commands and private authentication details belong in local-only private notes.

## Safety Boundary

This file is intended to be safe to commit.

It uses placeholders for sensitive operational values:

- `[GITHUB_REPO]`
- `[SSH_USER]`
- `[SERVER_IP]`
- `[DEPLOY_PATH]`
- `[SERVICE_NAME]`
- `[CONTAINER_NAME]`
- `[DOMAIN]`

It does not contain:

- live server IPs
- private usernames
- private key paths
- SSH key fingerprints
- passphrases
- 1Password item details
- tokens
- real `.env` values
- secret material

Do not add those details here. Exact operator commands belong in local-only private notes or other private operator material.

## Deployment Chain

Confirmed deployment chain:

```text
Local Mac repo -> GitHub remote -> production server checkout -> Docker Compose production rebuild -> live container
```

Conceptually:

1. The operator makes and commits changes locally.
2. The operator pushes source to `[GITHUB_REPO]`.
3. The production server checkout at `[DEPLOY_PATH]` is updated from GitHub.
4. Docker Compose rebuilds or recreates the target service.
5. The live `[CONTAINER_NAME]` serves the updated site.

Production deployment is operator-controlled. It is not automatic just because source reached GitHub.

## What GitHub Does And Does Not Do

GitHub stores the pushed source and may trigger CI depending on workflow status.

GitHub push does:

- update the remote repository
- make the target commit available to the production server
- potentially run CI checks

GitHub push does not:

- update the server checkout by itself
- rebuild production containers by itself
- restart live services by itself
- prove the live site changed

Production changes appear only after the server-side checkout is updated and the relevant Docker Compose service is rebuilt or restarted.

## Local Docker Versus Production Docker

Local Docker is for testing.

`docker-compose.local-prod.yml` is useful for local production-like checks, including Dockerfile behavior, production-like runtime paths, and service startup assumptions. It does not publish an image or deploy production.

Production deployment uses the production server checkout and `docker-compose.prod.yml`. The server builds the production container after pulling the target commit from GitHub.

Older local Docker sync docs may still be useful as local testing references, but they are not the production deployment authority.

## Authentication Model

There are separate trust paths:

- Mac -> GitHub: used for pushing source.
- Mac -> production server: used for SSH access.
- Production server -> GitHub: used when the server pulls source.

These roles should be documented separately. A key that works for GitHub from the Mac is not automatically a key that works for production server login, and a key that works for server login is not automatically a key that lets the server pull from GitHub.

SSH agent forwarding can allow the production server to use the Mac's GitHub-authenticated agent for `git pull`, if the operator intentionally chooses that model and approves it for the session.

Do not rely on 1Password item names alone to infer what a key does. Do not mix environment secrets and SSH key notes in long-term documentation if avoidable.

This file intentionally omits real key paths, fingerprints, usernames, IPs, and 1Password item names.

## Generic Deployment Phases

These phases are conceptual. Any production command requires explicit operator approval before execution.

### A. Confirm Local Repo State

- Confirm the intended branch.
- Confirm the intended changes.
- Confirm no sensitive/runtime files are included.

### B. Confirm Changes Are Committed Locally

- Confirm the target commit exists locally.
- Confirm the commit contains only intended changes.

### C. Push To GitHub

- Push the target commit to `[GITHUB_REPO]`.
- Do not treat this as production deployment.

### D. Confirm GitHub Has The Target Commit

- Confirm `[GITHUB_REPO]` contains the target commit.
- Review CI status if applicable.
- Treat tolerant CI steps as warnings, not proof of safety.

### E. Confirm Server SSH Access

- Confirm the operator can access `[SERVER_IP]` as `[SSH_USER]`.
- Do not document live SSH targets in committed files.

### F. Confirm Server Can Pull From GitHub

- Confirm the server-side GitHub authentication model.
- Decide whether the server uses a deploy key, agent forwarding, or another approved mechanism.

### G. Update Server Checkout From GitHub

Approval-required placeholder example:

```bash
ssh [SSH_USER]@[SERVER_IP]
cd [DEPLOY_PATH]
git pull
```

### H. Rebuild/Recreate The Target Docker Compose Service

Approval-required placeholder example:

```bash
docker-compose -f docker-compose.prod.yml up --build -d [SERVICE_NAME]
```

### I. Verify Service Health

- Confirm `[CONTAINER_NAME]` is running.
- Confirm health checks pass if configured.
- Review logs for obvious startup failures.

### J. Verify Public Site Behavior

- Confirm public pages return expected HTTP statuses.
- Confirm crawler resources are reachable.
- Confirm admin/private areas remain protected.

### K. Use External Tools After Live HTTP Checks Pass

Use Google Search Console, URL Inspection, or other external tools only after live HTTP verification passes.

## One-Site Versus Both-Site Deployment

This monorepo runs two production services:

- Fruition Forest Garden.
- The Tecnoagrarian.

A shared code change may affect both sites. It is acceptable to deploy one site first when the urgent issue is site-specific, but that does not update the other live container.

If a shared code fix should apply to both sites, deploy the second site separately after verifying the first.

Rebuilding both sites may be heavier than needed and should be intentional.

Recent confirmed pattern:

- The Google indexing/crawler fix was deployed to Fruition Forest Garden first.
- The Tecnoagrarian production container was not rebuilt during that deployment.
- If the shared crawler fix is desired there too, deploy The Tecnoagrarian separately.

## Verification Checklist

Public HTTP checks can use safe public URLs and do not require secrets.

Example checks with placeholder domains:

```bash
curl -I https://www.example.com/
curl https://www.example.com/robots.txt
curl -I -A "Googlebot" https://www.example.com/
```

Verify:

- target container is healthy
- homepage returns `200`
- non-www or canonical variant behaves as intended
- `/robots.txt` is reachable
- Googlebot public request returns `200`
- admin/private areas remain protected
- no `X-Robots-Tag: noindex` header exists if indexing is intended
- no `<meta name="robots" content="noindex">` exists if indexing is intended
- canonical URL behavior is sensible

## Google Indexing Deployment Lesson

The Fruition Forest Garden indexing issue was not just a Google Search Console delay.

Before the fix:

- public homepage returned `403`
- `/robots.txt` returned `403`
- `/robots.txt` returned `{"error":"Access denied"}`
- Googlebot user-agent requests also returned `403`

The blocker was public crawl access. A shared Express middleware blocked broad bot/crawler/tool user-agent patterns before public routes could serve the homepage or `robots.txt`.

The fix allowed public crawler access while continuing to block clearly sensitive probing paths. Live HTTP verification mattered more than waiting for Search Console dashboards to update.

After deployment:

- Fruition Forest Garden homepage returned `200`
- non-www homepage returned `200`
- `/robots.txt` returned:

  ```text
  User-agent: *
  Allow: /
  ```

- Googlebot user-agent request returned `200`
- the previous `{"error":"Access denied"}` response was gone
- Fruition Forest Garden production container was healthy

## Runtime Data And Backup Boundary

Runtime state is not source code.

Treat these as runtime/private operational state:

- SQLite databases
- uploads
- logs
- backups
- Docker volumes
- `.env` files
- secret material

Deployment should not casually mutate runtime data. Backup and rollback planning should be explicit before risky deployments.

Code-only middleware fixes are lower runtime-data risk than migrations, restores, or cleanup tasks, but production deployments still require care.

## What This File Does Not Contain

This file does not contain:

- exact SSH command
- live server target
- real deploy path if considered sensitive
- private key paths
- SSH fingerprints
- 1Password item names
- passphrases
- `.env` values
- backup contents
- real certificate paths if sensitive
- emergency root or LISH procedures

Keep those details in local-only private notes or secret-management systems.

## Relationship To Other Docs

- `Documents/DEPLOYMENT_RUNBOOK.md` remains the agent-safety and placeholder-oriented deployment planning doc.
- `Documents/DEPLOYMENT_DISCOVERY.md` records the rediscovery process and is historical/context.
- `Documents/LOCAL_DOCKER_SYNC_GUIDE.md` is a local testing reference, not production deployment authority.
- `Documents/LOCAL_SETUP_QUICKSTART.md` is a local production-like testing reference.
- Private local operator notes remain outside Git.
- This document is the committed high-level production deployment model.

## Open Questions / Future Cleanup

- Should the server use a dedicated GitHub deploy key instead of forwarded local agent?
- Should SSH config aliases be standardized?
- Should 1Password items be split into separate SSH-key and environment-secret items?
- Should The Tecnoagrarian be deployed to pick up the shared crawler fix?
- Should a sitemap/canonical URL policy be added?
- Should dependency vulnerabilities found during Docker build be addressed separately?
- Should CSP source values be reviewed later for cleaner environment-driven config?
- Should a redacted operator checklist be created after the deployment process stabilizes?

## Next Recommended Tasks

1. Keep private deployment session notes local-only.
2. Create a clean private key map.
3. Later create a redacted operator checklist if useful.
4. Deploy The Tecnoagrarian separately if the shared crawler fix is needed there.
5. Use Google Search Console URL Inspection for Fruition Forest Garden.
6. Plan dependency/security remediation separately.
