# Backup System Guide

This guide is a public-safe backup and restore planning document for the project.
It intentionally uses placeholders only. Real hosts, users, paths, secrets,
archive names, credentials, certificates, and operator command history must stay
in private ignored notes or a password manager.

## 1. Purpose

The purpose of this guide is to describe what should be backed up, how backup
and restore work should be planned, and what safety checks should happen before
any recovery action.

This file is not an executable production runbook. It should not contain live
server details or copy/paste-ready production commands.

Use placeholders such as:

- `<PROJECT_NAME>`
- `<SERVER_HOST>`
- `<DEPLOY_USER>`
- `<APP_ROOT>`
- `<BACKUP_ROOT>`
- `<LOCAL_BACKUP_DIR>`
- `<REMOTE_BACKUP_DIR>`
- `<DATABASE_PATH>`
- `<UPLOADS_DIR>`
- `<CONFIG_DIR>`
- `<DOCKER_VOLUME>`
- `<BACKUP_ARCHIVE>`
- `<RESTORE_TARGET>`
- `<PASSWORD_MANAGER>`
- `<SECRET_NAME>`

## 2. Safety Rules

Backups and restores can affect live data. Treat them as high-risk operations.

- Do not commit real backup archives, database files, upload folders, logs,
  private keys, certificates, or credential exports.
- Do not commit real server names, deploy users, private paths, database URLs,
  access tokens, passwords, session secrets, CSRF secrets, or IP allowlists.
- Do not store restore commands with live targets in tracked documentation.
- Do not restore over production data without explicit human approval, a current
  backup, and a rollback plan.
- Do not ask an agent to inspect real backups, databases, uploads, runtime
  folders, or secrets unless the user explicitly approves that exact task.
- Use private ignored notes for real operational details and this tracked guide
  for safe planning.

## 3. Backup Scope

A complete backup plan should account for each category of project state.

| Category | Examples | Git status | Notes |
|---|---|---|---|
| Source code | application code, shared code, templates, scripts | Tracked in Git | Git is the source of truth for committed code. |
| Documentation | public-safe docs, templates, placeholder runbooks | Tracked in Git | Keep secret values out of tracked docs. |
| Database state | `<DATABASE_PATH>` or managed database export | Runtime data | Back up and restore with explicit approval only. |
| Uploads/media | `<UPLOADS_DIR>` | Runtime/user-generated data | Preserve permissions and ownership expectations. |
| Runtime configuration | env files, secret values, private config | Private only | Store in `<PASSWORD_MANAGER>` or ignored notes. |
| Certificates/keys | TLS material, private keys, signing keys | Private only | Never commit certificate contents or private keys. |
| Logs | application logs, access logs, error logs | Runtime data | Useful for diagnosis; may contain sensitive data. |
| Backup archives | `<BACKUP_ARCHIVE>` | Private/runtime data | Store outside the repo and verify integrity. |

## 4. What Belongs in Git Versus Private Notes

Belongs in Git:

- placeholder-only backup policy
- backup scope descriptions
- restore-test checklist
- sanitized examples
- public-safe operational assumptions
- non-secret template paths

Belongs in private ignored notes:

- real `<SERVER_HOST>` values
- real `<DEPLOY_USER>` values
- real `<APP_ROOT>` and `<BACKUP_ROOT>` values
- real database and upload paths
- real archive names and retention locations
- real scheduler configuration
- real credential storage locations
- exact operator command history
- emergency contact or account recovery details

## 5. Backup Frequency Planning

Choose backup frequency based on acceptable data loss and recovery time.

| Data type | Suggested planning question | Typical policy shape |
|---|---|---|
| Database | How much edited content can be recreated? | Frequent backups, verified regularly. |
| Uploads/media | How often are files added or changed? | Regular backups and periodic integrity checks. |
| Configuration | How often do env or service settings change? | Back up after each intentional change. |
| Documentation/source | Are changes committed and pushed? | Git history plus remote repository. |

Define these values privately:

- recovery point objective
- recovery time objective
- retention period
- offsite storage target
- restore-test cadence
- person responsible for verification

## 6. Database Backup Placeholder Workflow

This is a planning workflow only, not a command recipe.

1. Identify the database source as `<DATABASE_PATH>` or another documented
   source.
2. Confirm the target backup location as `<BACKUP_ROOT>` or
   `<REMOTE_BACKUP_DIR>`.
3. Create a dated `<BACKUP_ARCHIVE>` using an approved private procedure.
4. Verify that the archive exists and is non-empty.
5. Verify that the backup can be listed or opened in a safe non-production
   context.
6. Record the backup date, scope, and verification status in private ignored
   notes.
7. Do not copy database contents into chat, tracked docs, or commits.

If a future task needs exact commands, create a private operator runbook or use
placeholders in a public-safe template.

## 7. Upload/Media Backup Placeholder Workflow

Uploads and media are runtime/user-generated data, not source code.

1. Identify the upload source as `<UPLOADS_DIR>`.
2. Confirm whether uploads live in a bind-mounted path, a named
   `<DOCKER_VOLUME>`, or another runtime location.
3. Create a backup archive using an approved private procedure.
4. Preserve file names, directory structure, permissions, and timestamps where
   required by the application.
5. Verify a representative sample in a safe non-production location.
6. Record verification results in private ignored notes.

Do not commit upload folders or generated media backups.

## 8. Config and Secrets Boundary

Configuration and secrets require separate handling.

Tracked docs may mention variable names such as `<SECRET_NAME>`, but must not
include real values. Runtime secret material belongs in `<PASSWORD_MANAGER>`,
private ignored notes, or the approved production secret store.

Keep these out of tracked backup documentation:

- real env file contents
- database URLs
- passwords
- access tokens
- session secrets
- CSRF secrets
- private keys
- certificate contents
- credential exports
- live allowlists
- exact secret storage item names if they expose private structure

## 9. Local and Offsite Backup Concepts

A healthy backup plan should avoid a single point of failure.

Recommended concepts:

- keep at least one local backup location such as `<LOCAL_BACKUP_DIR>`
- keep at least one offsite or external backup location such as
  `<REMOTE_BACKUP_DIR>`
- protect backup archives with appropriate access controls
- verify that backups can be restored, not just created
- track retention and cleanup rules privately
- avoid storing all backups on the same host as production

Do not document real storage endpoints or account details in this file.

## 10. Restore-Test Planning

Restore testing should happen in a safe target, never directly over production
without explicit approval.

Before a restore test:

- identify `<BACKUP_ARCHIVE>`
- identify `<RESTORE_TARGET>`
- confirm that `<RESTORE_TARGET>` is not production unless explicitly approved
- confirm the expected application version
- confirm database schema compatibility
- confirm upload/media compatibility
- confirm secrets and env config are available privately
- define success criteria
- define rollback steps

After a restore test:

- verify that the application starts
- verify representative public pages
- verify representative admin workflows only if approved
- verify representative uploaded media
- document findings in private ignored notes or a sanitized tracked summary

## 11. Verification Checklist

Use this checklist after a backup or restore-related procedure.

- Backup scope was defined before work began.
- Runtime data sources were identified by placeholder or private note.
- No real secrets were copied into tracked documentation.
- Backup archive location was recorded privately.
- Backup integrity was checked.
- Restore target was confirmed before any restore action.
- Production was not modified without explicit approval.
- Verification results were recorded.
- Any failure or uncertainty was marked as Needs Review.

## 12. Incident/Recovery Checklist

During an incident, slow down and separate diagnosis from recovery.

1. Identify the affected service or data category.
2. Preserve current state where possible.
3. Confirm the latest verified backup.
4. Confirm who approved recovery work.
5. Confirm the intended `<RESTORE_TARGET>`.
6. Confirm what data may be overwritten.
7. Perform recovery only through an approved private procedure.
8. Verify the restored service or data.
9. Record a sanitized incident summary in tracked docs only if useful.
10. Keep detailed private operational notes out of Git.

## 13. What Belongs in Private Ignored Notes

Private ignored notes may contain details that are necessary for operations but
unsafe for tracked documentation.

Examples:

- real hostnames or server addresses
- real deploy users
- real backup paths
- real database paths
- real upload paths
- real scheduler details
- real archive names
- exact private command history
- password manager item names
- credential rotation notes
- restore-test evidence that includes private data

These notes should remain ignored and should not be staged or committed.

## 14. Redaction Note

This guide has been sanitized to be public-safe and placeholder-only. Future
updates should preserve that boundary.

If an exact backup or restore command is needed, keep it in private ignored
operator notes or write it with placeholders and an explicit approval warning.
