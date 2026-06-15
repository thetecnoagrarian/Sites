# Analytics Cleanup Guide

This guide is a public-safe, placeholder-only planning document for analytics
cleanup and privacy review work.

It must not contain live analytics exports, production endpoints, admin URLs,
server details, database paths, log paths, upload paths, cookies, sessions, CSRF
values, tokens, passwords, private command history, or credential material.

Use placeholders such as:

- `<PROJECT_NAME>`
- `<SITE_NAME>`
- `<SERVER_HOST>`
- `<DEPLOY_USER>`
- `<APP_ROOT>`
- `<ADMIN_URL>`
- `<ANALYTICS_URL>`
- `<DATABASE_PATH>`
- `<LOG_PATH>`
- `<UPLOADS_DIR>`
- `<DOCKER_SERVICE>`
- `<NGINX_SITE_CONFIG>`
- `<COOKIE_NAME>`
- `<SESSION_SECRET>`
- `<CSRF_SECRET>`
- `<PASSWORD_MANAGER>`

## 1. Purpose

The purpose of this guide is to define a safe process for reviewing and cleaning
analytics data without exposing private operational details.

Analytics cleanup can affect reporting, privacy posture, audit history, and live
admin workflows. It should be planned, reviewed, backed up, and verified before
any destructive change is made.

This file is not a production cleanup runbook. It should not include
copy/paste-ready commands for live infrastructure.

## 2. Safety Rules

Analytics and logs may contain sensitive or identifying information.

- Do not commit analytics exports, raw logs, database records, cookies,
  sessions, CSRF values, tokens, IP addresses, user-agent traces, admin URLs, or
  private endpoints.
- Do not commit real database paths, upload paths, log paths, Docker volume
  names, Nginx paths, server names, deploy users, or private local paths.
- Do not document exact cleanup command history tied to live infrastructure.
- Do not inspect live analytics data, databases, backups, logs, runtime files,
  or production systems without explicit approval for that exact task.
- Do not run destructive cleanup, database, Docker, deployment, or server
  commands without explicit approval.
- Use private ignored notes for real operational details and this tracked guide
  for public-safe planning.

## 3. Analytics Data Risk Categories

Analytics data can be useful for operations while still carrying privacy risk.

| Category | Examples | Risk | Handling |
|---|---|---|---|
| Page-view records | path, timestamp, referrer | Medium | Review retention and aggregation rules. |
| Visitor metadata | IP-derived fields, user agent, locale | High | Avoid exposing raw records in tracked docs. |
| Admin activity | admin paths, login-related paths | High | Keep access restricted and avoid public exports. |
| Bot/scanner traffic | probe paths, hostile user agents | Medium | Summarize patterns without source details. |
| Session-related data | cookie names, session identifiers | High | Do not log or export raw values. |
| Form/security data | CSRF tokens, auth failures | High | Redact values and keep only safe counts/status. |
| Test data | local or staging events | Low to Medium | Remove only after confirming source and scope. |

## 4. What Belongs in Git Versus Private Notes

Belongs in Git:

- placeholder-only analytics cleanup policy
- privacy review checklists
- non-secret retention principles
- safe summary of cleanup decisions
- generic verification steps
- sanitized examples

Belongs in private ignored notes:

- real `<ADMIN_URL>` or `<ANALYTICS_URL>` values
- real `<DATABASE_PATH>` or `<LOG_PATH>` values
- real `<DOCKER_SERVICE>` names if they reveal private operations
- raw analytics rows or exports
- real visitor metadata
- exact operator command history
- private incident details
- password manager references
- cleanup evidence containing private values

## 5. Cleanup Planning Checklist

Before analytics cleanup, define the scope and approval boundary.

- Identify `<SITE_NAME>` and affected analytics feature.
- Identify whether cleanup affects database records, logs, generated reports, or
  admin dashboard output.
- Decide whether data should be deleted, anonymized, aggregated, or retained.
- Confirm whether cleanup affects production, local development, or a test
  environment.
- Confirm whether a backup is required before cleanup.
- Confirm expected user-visible behavior after cleanup.
- Confirm how cleanup success will be verified.
- Confirm rollback or restore expectations.
- Record unresolved items as Needs Review.

## 6. Database Analytics Cleanup Placeholder Workflow

This is a planning workflow only, not a command recipe.

1. Identify the analytics storage location as `<DATABASE_PATH>` or another
   approved private reference.
2. Confirm the target dataset, date range, and cleanup criteria.
3. Confirm whether the cleanup is deletion, anonymization, or aggregation.
4. Confirm that a current backup exists before destructive work.
5. Review the cleanup plan with the human operator.
6. Run cleanup only through an approved private procedure.
7. Verify counts or summaries without exposing raw private records.
8. Record sanitized results in tracked docs only if useful.

Do not copy database rows, raw visitor metadata, or live cleanup commands into
tracked documentation.

## 7. Log Cleanup Placeholder Workflow

Logs can contain request paths, referrers, user agents, cookies, session
details, security events, and operational metadata.

1. Identify the log source as `<LOG_PATH>` or another approved private
   reference.
2. Determine whether logs are application logs, access logs, error logs, or
   generated analytics logs.
3. Confirm retention requirements before deleting or rotating logs.
4. Preserve incident-relevant logs privately if needed.
5. Redact sensitive fields before sharing any summary.
6. Verify that cleanup did not remove needed operational evidence.

Do not commit raw logs or log excerpts that contain private operational details.

## 8. Cookie, Session, and Privacy Review

Analytics work should not expose authentication or session internals.

Review whether analytics or logs include:

- `<COOKIE_NAME>`
- session identifiers
- CSRF tokens
- authorization headers
- passwords or password reset material
- admin-only paths
- raw request bodies
- uploaded file metadata
- visitor IP-derived metadata

If any of these appear in analytics output or production logs, treat it as a
privacy/security cleanup item. Redact values, reduce logging, or aggregate data
where appropriate.

## 9. Admin Analytics Exposure Review

Admin analytics should be available only to approved admin users.

Review questions:

- Is `<ANALYTICS_URL>` protected behind authentication?
- Are analytics dashboards reachable from public routes?
- Do admin analytics views reveal raw visitor metadata?
- Do exported reports contain cookies, sessions, CSRF values, tokens, or private
  request details?
- Are bot/scanner probes summarized without exposing noisy raw details?
- Are error states safe and non-revealing?

Public pages should remain crawlable and usable. Admin analytics routes should
remain protected.

## 10. Backup-Before-Cleanup Requirement

Before destructive analytics cleanup, confirm a backup or rollback plan.

Minimum planning points:

- backup scope
- backup date
- backup storage location, recorded privately
- restore target, recorded privately
- verification method
- human approval
- rollback criteria

The backup itself, real paths, archive names, and restore commands do not belong
in this tracked guide.

## 11. Verification Checklist

After approved cleanup, verify the result without exposing private data.

- Analytics dashboard still loads for approved admin users.
- Public pages remain unaffected.
- Expected stale/test records are no longer visible.
- Expected retained records remain available.
- Cleanup did not expose raw cookies, sessions, CSRF values, tokens, passwords,
  or private request details.
- Startup logs and application logs do not include sensitive analytics internals.
- Any bot/scanner traffic is summarized safely.
- Any remaining uncertainty is marked as Needs Review.

## 12. Incident/Privacy Review Checklist

Use this checklist if analytics data appears to expose sensitive information.

1. Stop sharing the affected output.
2. Preserve necessary evidence privately.
3. Identify the data category involved.
4. Identify whether the issue is logging, analytics storage, dashboard display,
   export behavior, or documentation.
5. Redact or restrict access as appropriate.
6. Confirm whether code changes are needed.
7. Confirm whether data cleanup is needed.
8. Verify that tracked docs contain only sanitized summaries.
9. Record a follow-up task with scope and approval requirements.

## 13. What Belongs in Private Ignored Notes

Private ignored notes may contain operational details needed by the human
operator but unsafe for tracked documentation.

Examples:

- real admin URLs
- real analytics endpoints
- real database or log paths
- real service names
- real hostnames or server addresses
- real deploy users
- exact cleanup command history
- raw analytics export locations
- backup archive names
- private incident notes
- password manager item names

These notes should remain ignored and should not be staged or committed.

## 14. Redaction Note

This guide has been sanitized to be public-safe and placeholder-only. Future
updates should preserve that boundary.

If exact analytics cleanup commands or live operational details are needed, keep
them in private ignored operator notes or write them with placeholders and an
explicit approval warning.
