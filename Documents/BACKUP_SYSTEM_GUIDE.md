# Backup System Guide

This guide is the public-safe authority for application-backup architecture,
disposable restore rehearsals, and recovery planning for the project. It uses
placeholders for private operational details. Real hosts, users, paths, secrets,
credentials, certificates, and private operator command history must stay in
ignored notes or a password manager. Dated backup-set and rehearsal identifiers
may appear only as sanitized historical evidence.

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

- The host scheduler invokes the tracked host orchestration path weekly, Sunday
  at 02:00 UTC. Treat that as the intended schedule and re-discover the live
  scheduler before relying on it during recovery.
- Container storage is temporary staging only; it is not a retention location.
- One run creates exactly one SQLite backup and one uploads archive.
- The recursive uploads archive includes FFG seasonal hero state under
  `uploads/hero`: `.current.json`, the selected UUID generation, its non-public
  retained source, and both display/social WebP derivatives. Restore must keep
  the manifest and its selected generation together.
- The SQLite backup uses the database backup operation and must pass an
  integrity check before transfer.
- Implementation commit `88bc59e` gives each SQLite backup attempt a
  30-second busy timeout and permits at most three attempts with two seconds of
  backoff. Only SQLite busy/locked failures are retried. A non-lock SQLite
  failure stops immediately. Configuration validation caps the timeout at
  30 seconds and backoff at two seconds, so the complete lock-wait/retry budget
  is at most 94 seconds (three timeouts plus two backoffs), excluding ordinary
  backup and verification work. At the 2026-11-03 production preflight, this
  implementation was committed and pushed while production remained at
  `5ddd651`; rollout still required separate authorization at that preflight.
  The hardening was subsequently deployed, and the bounded behavior described
  here is the current production model.
- Before a retry, the helper removes only that attempt's incomplete staged
  database and error file; it never removes the outer staging directory. If the
  final attempt fails, the last staged database (if SQLite created one) and
  `.sqlite-backup-error.log` remain as diagnostic evidence.
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
- A site failure creates or refreshes `<BACKUP_ROOT>/<SITE>/BACKUP_FAILURE` and
  emits a searchable `BACKUP_FAILURE_MARKER` log record. The marker contains a
  non-secret site, run identity, UTC failure time, summary, and operator-action
  hint. It is cleared only after that site later completes the verified backup
  path; a retention failure recreates it. A failure before any site becomes
  active, including global-lock acquisition failure, cannot create a
  site-specific marker and remains visible through the nonzero exit and log.
- A failure for one configured site does not prevent the host script from
  attempting the other configured site. The overall run still returns nonzero,
  and retention is skipped for the run when any site fails.
- Retention belongs to the canonical local host location. The hardened matcher
  accepts only calendar-valid timestamp-only scheduled names in the exact shape
  `backup-set-YYYY-MM-DD_HH-MM-SS`. It rejects impossible dates/times as well as
  suffixes. Named migration, authorship, publication, recovery, and arbitrary
  operation sets are excluded by default, as are legacy layouts. No existing
  set is renamed.
- With the 28-day default, age is evaluated from each managed set directory's
  modification time in complete 24-hour periods. `find -mtime +28` does not
  select a set until its completed age bucket exceeds 28, so a newly promoted
  set cannot be selected by the same run.

This removes retained backup data from the container writable layer without
granting the container write access to the retained host archive. A dedicated
Docker volume or bind mount for `/app/backups` is therefore not the selected
design: it would relocate the growth but would not eliminate duplicate local
retention or whole-tree transfers.

The host script continues to support a deliberately scoped one-site operation
through `BACKUP_SITES=<SITE>:<CONTAINER>`. It uses the same global lock,
container helper, transfer checks, atomic promotion, cleanup, marker lifecycle,
and site-specific retention path as a scheduled multi-site run. One-site use is
still a production mutation and requires explicit authorization.

### Preserved-staging recovery procedure

The persistent marker is an alert surface, not permission to clean up. When a
site has `BACKUP_FAILURE` or preserved staging:

1. Confirm the affected site, run identity, application health, latest verified
   set, free disk, scheduler state, and absence of an active backup process.
2. Inspect the global host lock, the run-specific host staging directory, and
   the fixed container staging directory read-only. Record paths, ownership,
   modes, timestamps, sizes, and meaningful checksums.
3. Classify each artifact as recoverable data, diagnostic evidence, or reviewed
   disposable residue. Unexpected content is a stop condition.
4. With separate destructive authorization, remove only the exact reviewed
   blocking files/directories. Do not use a broad backup-root glob.
5. Run one site through the normal host pipeline when that is the smallest
   recovery scope. The deployed matcher protects named/manual/recovery anchors
   by selecting only exact timestamp-named scheduled sets; still inventory the
   affected site's sets before any separately authorized retention or cleanup
   action.
6. If SQLite exhausts its bounded retries, preserve the new evidence and stop;
   do not repeatedly clear staging or automatically stop the application.
7. On success, verify nonzero artifacts, database integrity and foreign keys,
   schema/migrations where applicable, archive readability, transfer checksums,
   atomic finalization, absent staging/lock, and marker clearance.
8. Confirm the scheduler and scripts remain unchanged, and record a sanitized
   result. Any code or documentation rollout remains a separate gate.

On 2026-10-25, one transient zero-timeout SQLite lock left diagnostic-only TTA
staging. That preserved staging correctly blocked the 2026-11-01 weekly run.
On 2026-11-03, a separately authorized recovery recorded the evidence, removed
only the reviewed blockers, used the normal TTA-only pipeline with a one-run
retention safeguard, and produced the verified
`backup-set-2026-11-03_11-36-tta-recovery` set. Staging and the host lock were
clear afterward; FFG, cron, existing recovery anchors, and application restart
state were unchanged. TTA backup continuity was restored. This operational
milestone did not itself deploy the repository hardening. At the later
2026-11-03 production preflight, commit `88bc59e` was still awaiting a
separately authorized rollout while production remained at `5ddd651`. This is a
dated preflight record. The hardening was subsequently deployed; its timeout,
retry, evidence-preservation, failure-marker, and scheduled-set retention
behavior is the current production model described above.

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
integrity only. By themselves, they are not evidence of a completed restore
test; the dated application-aware evidence is recorded in Section 10.

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

## 10. Canonical Disposable Restore Procedure and Evidence

Restore testing should happen in a safe target, never directly over production
without explicit approval.

### Canonical disposable application-aware restore rehearsal

This procedure validates recoverability without authorizing a live restore or
cutover. Original backup artifacts remain read-only, and the rehearsal must not
mount production volumes, production environment files, or a production
network. Never use Docker prune or broad cleanup globs; record exact disposable
resource names and remove only those resources after a successful test.

1. Select one complete, known-good site backup set containing `blog.db` and
   `uploads.tar.gz`.
2. Record and verify the source artifacts' SHA-256 values before any copy or
   extraction.
3. Create one deterministic, filesystem-safe run identifier.
4. Derive unique, run-specific application/helper names, data and log volumes,
   and temporary evidence paths.
5. Mount the selected backup directory read-only in a disposable helper.
6. Copy `blog.db` into the unique data volume.
7. Extract `uploads.tar.gz` into that volume without preserving archive
   ownership, after confirming that the archive contains no unsafe paths.
8. Assign only the disposable restored data to application UID/GID `1001` and
   apply private file/directory modes.
9. Before application boot, require the restored database SHA-256 to equal the
   selected source database SHA-256.
10. Before boot, record database integrity and foreign-key results, migration
    IDs/checksums and pending state, baseline/schema recognition, relevant
    tables, post/user counts, authentication-column presence, nonempty password
    hashes, expected content identity, and restored upload count/size.
11. Resolve and record an exact known-good immutable application image that is
    compatible with the restored schema and backup format; do not rebuild or
    retag it as part of the rehearsal.
12. Start the disposable application with unique data/log volumes and without
    production volumes, environment, or network membership.
13. Use `--network none` and publish no host ports. All application checks must
    run through internal loopback with `docker exec` or an equivalent isolated
    mechanism.
14. Provide only test values for required settings, including `PORT`,
    `SITE_PORT`, `DATABASE_PATH=/app/data/blog.db`,
    `UPLOADS_PATH=/app/data/uploads`, `NODE_ENV=production`, a random test-only
    session secret, and `BASE_URL=https://restore.invalid`. Do not enable
    external integrations.
15. Keep the application root read-only where practical. If startup requires
    the relative temporary upload path `./uploads/temp/`, provide an isolated
    tmpfs at that runtime path or its required parent; do not weaken volume,
    network, or secret isolation.
16. Inspect the running container and require the exact image ID, network mode
    `none`, no port bindings, and only the intended run-specific persistent
    volumes. Confirm that host listeners did not change.
17. Verify health, homepage, representative post/content, representative
    restored media, unauthenticated admin behavior, and absence of fatal
    startup, schema, permission, or native-addon errors.
18. Perform the site-specific checks below.
19. On success, remove only the exact disposable containers, volumes, and
    temporary evidence/env files. On failure, stop and preserve evidence until
    cleanup is separately reviewed and authorized.
20. Recompute the original backup-artifact hashes and require them to match the
    pre-test values.
21. Reconfirm production container/image/start identities, health/restarts,
    listeners, Git, scheduler, backup lock/staging/markers, and other relevant
    isolation evidence are unchanged.

The pre-boot database hash is the artifact-integrity checkpoint. After the
application starts, health/content requests can legitimately write disposable
session and analytics rows, so post-boot byte identity is not expected. After
boot, use integrity/foreign-key checks, migration/schema state, logical content
comparison, and working application behavior as recovery evidence. Do not
misclassify expected disposable session/analytics writes as source-backup
mutation.

### Site-specific recovery checks

TTA recovery requires its SQLite database and recursive uploads archive.
Repository-backed public files are supplied by the selected application image,
not the runtime backup, so absence of a repository-baked PDF or other static
asset from `uploads.tar.gz` is expected. Verify at least one representative
baked asset through the isolated application in addition to restored content
and media.

FFG recovery requires its SQLite database, recursive uploads, and a coherent
seasonal-hero state. Require a valid `uploads/hero/.current.json`, a valid UUIDv4
selected generation, its retained source beneath `.source`, a decodable display
WebP no wider than 1920 pixels, and a 1200-by-630 social WebP. Verify the
display/social URLs and homepage/social metadata references through the
isolated application, and require the corresponding retained `.source` URL to
remain denied by Express.

### November 6, 2026 disposable restore evidence

Run `restore-20261106-41ec8a8` restored both sites sequentially into fresh
disposable data/log volumes using the immutable production application images
that were current for that dated test. TTA restored from
`backup-set-2026-11-03_11-36-tta-recovery`; FFG restored from
`backup-set-2026-11-01_02-00-01`. Both pre-boot database hashes matched their
source artifacts, integrity and foreign-key checks passed, migrations `0000`
and `0001` were recognized with none pending, authentication records survived,
uploads restored, and both applications booted healthy. Representative pages,
posts, uploads, and unauthenticated admin redirects passed.

TTA also served its repository/image-baked PDF successfully, confirming that
the backup correctly reconstructs runtime state while the selected image
supplies permanent repository assets. FFG restored hero generation
`a9c55e6b-374d-407d-bf48-df4fe340cff1`; its retained source decoded at
4000-by-3000, display WebP at 1920-by-1440, and social WebP at 1200-by-630.
Metadata referenced that generation, display/social URLs succeeded, and the
retained source URL remained denied. Original backup hashes and all production
container/image/start identities remained unchanged, and exact disposable
cleanup completed before the next site and after the run. TTA: **PASS**. FFG:
**PASS**.

This dated result establishes same-host, application-aware reconstruction with
known-good images. It is not a timeless claim about current images, containers,
hero selection, or latest backup sets.

### Earlier restore evidence

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

In that September stopped-site backup-helper rehearsal, the helper's data mount
had to remain read-only while its ephemeral container root and staging directory
remained writable: Docker transfer from a read-only root with tmpfs staging was
not reliable in that environment. That distinct helper design wrote only
temporary staging in the helper and retained output in the existing host-managed
destination. The rehearsal used AMD64 production images under local ARM64
emulation, did not test authenticated editor flows, did not stop a production
container, and did not establish off-host recovery.

### Established proof, remaining gaps, and future hardening

The November 6 result, together with the creation-time controls, establishes
that the current two-artifact backup format can reconstruct both application
states with a compatible known-good image: databases and uploads restore,
authentication records survive, applications boot, representative content and
media work, TTA baked assets remain image-sourced, FFG hero state remains
coherent, and the production-isolation procedure works.

It does **not** establish off-host durability, recovery on a different server,
recovery when a compatible image is missing, DNS/TLS/nginx reconstruction, live
production cutover, authenticated administrator-login recovery, or recovery of
data newer than the selected dated backups. Keep the status explicit:

- Backup creation: proven.
- Same-host application-aware restore: proven.
- Off-host survival and recovery: not yet proven.

As future hardening, each backup set could carry a durable manifest containing
artifact SHA-256 values, creation timestamp/run ID, migration/schema metadata,
backup format/version, and compatible application/image metadata. Current
backup sets do **not** persist such a manifest; this is a design option, not
implemented behavior, and changing backup output remains a separate task.

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
