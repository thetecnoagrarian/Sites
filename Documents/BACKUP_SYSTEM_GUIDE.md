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

### Repository Target Architecture

The host-managed architecture applies equally to Fruition Forest Garden and The
Tecnoagrarian and is the current production model. Managed sets are retained
under `/opt/Sites/backups`:

- Container storage is temporary staging only; it is not a retention location.
- One run creates exactly one SQLite backup and one uploads archive.
- The SQLite backup uses the database backup operation and must pass an
  integrity check before transfer.
- The host copies only the two artifacts created by that run.
- An atomic host lock serializes the complete FFG/TTA run so two schedulers or
  operators cannot interleave site backups.
- The host verifies nonzero files, archive readability, and matching
  container/host checksums before promoting the set into retained storage.
- Container staging is deleted only after the host set is verified and
  finalized.
- A failed transfer or verification preserves one staging set for diagnosis,
  returns a failure, skips retention, and blocks the next run from creating
  another set at the same path.
- Retention belongs to the canonical local host location and applies only to
  the new managed backup-set layout. Legacy backups remain outside automated
  cleanup until separately reviewed and approved.
- With the 28-day default, age is evaluated from each managed set directory's
  modification time in complete 24-hour periods. `find -mtime +28` does not
  select a set until its completed age bucket exceeds 28, so a newly promoted
  set cannot be selected by the same run.

This removes retained backup data from the container writable layer without
granting the container write access to the retained host archive. A dedicated
Docker volume or bind mount for `/app/backups` is therefore not the selected
design: it would relocate the growth but would not eliminate duplicate local
retention or whole-tree transfers.

The host location remains on the production machine. That is sufficient as the
canonical local copy and survives container recreation, but it is not an
offsite backup. No implemented off-host job is established by current
repository evidence. Off-host durability remains an open requirement.
Off-host application backup remains strongly recommended. Its absence is not a
separate Migration Gate B blocker only when, at migration time, a fresh verified
quiesced host-managed recovery set exists, a full application restore has been
demonstrated, the provider backup is verified acceptably current and available,
and the owner explicitly accepts the correlated-host loss risk. Otherwise,
abort the migration window.

These creation-time integrity, archive, and checksum checks establish transfer
integrity only. They are not evidence of a completed restore test.

Legacy backup material remains preserved and outside automated cleanup. Do not
delete it without a separate, explicitly approved restore-readiness and cleanup
gate. A read-only production census on 2026-09-20 confirmed the Sunday 02:00 UTC
schedule, complete managed sets for both sites from that run, and a completion
log showing verification and retention success. This is point-in-time scheduled
validation; reverify the schedule, latest complete pair, lock, staging, and log
before relying on it for future recovery work.

Linode provider backups are enabled, and a successful provider backup was
confirmed before the 2026 storage expansion. That provider snapshot layer is
useful for host-level recovery but does not replace these application-aware
sets, a future off-host copy, or restore-test evidence.

## 10. Restore-Test Planning

Restore testing should happen in a safe target, never directly over production
without explicit approval.

On 2026-09-18, both sites completed an isolated application restore rehearsal
from the verified September 17 managed backup sets using the then-current
production application images. Copied databases passed integrity and foreign-key
checks and were recognized as their respective untracked TTA and FFG legacy
schemas. Extracted uploads served through the restored applications; health,
representative posts, media, and unauthenticated admin redirects passed. The
containers used temporary data/log mounts, an internal-only network, no host
ports, and a rehearsal-only session secret. Live containers, image IDs, health,
schema digests, and migration-metadata absence remained unchanged; all temporary
resources were removed. This proves application-level reconstruction from those
sets, not a live-volume restore or off-host recovery. Authenticated workflows
were not exercised. A standalone container needs `SITE_PORT` set for the image
health check; the production Compose file supplies its own explicit check.

On 2026-09-20, the stopped-site backup path was rehearsed without touching live
volumes. Checksum-verified managed backup copies were restored into disposable
production-shaped data layouts, then temporary named volumes modeled a stopped
application's data volume. A controlled helper used the current production image
with `/app/data` mounted read-only, no network, no ports, and a separate writable
container staging area. The unchanged `backup-host.sh` and `backup.sh` path
produced the normal `backup-set-<RUN_ID>` layout with exactly `blog.db` and
`uploads.tar.gz`; the normal lock, checksum verification, archive validation,
atomic promotion, cleanup, and retention path completed for both sites. No
backup-tool change was required.

Both generated databases retained their expected TTA/FFG legacy classification,
row counts, zero migration metadata, successful integrity checks, and zero
foreign-key violations. The generated archives were safe to extract and matched
the disposable source upload trees. Restoring each pair into a second isolated
location and starting the corresponding current production image yielded healthy
containers with successful health, home, representative post, media, and admin-
redirect checks. Because each source was quiesced for the whole run, each common
run identity is a coherent stopped-site recovery point rather than a warm
sequential snapshot.

Keep the evidence classes distinct: the normal scheduled backup is a warm backup
created while the application may be writing; the migration-day backup is a
quiesced recovery point created only after writer exclusion; and the full
application restore rehearsal proves that a verified database/uploads pair can
reconstruct a working isolated application.

The helper's data mount must remain read-only, but its ephemeral container root
and staging directory must be writable: Docker transfer from a read-only root
with tmpfs staging was not reliable in this environment. The verified design
writes only temporary staging in the helper and retained output in the existing
host-managed destination. The rehearsal used AMD64 production images under local
ARM64 emulation, did not test authenticated editor flows, did not stop a
production container, and does not establish off-host recovery.

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
