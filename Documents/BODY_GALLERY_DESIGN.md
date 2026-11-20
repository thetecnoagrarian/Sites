# Documentary body gallery contract

## Scope and selection

Phase 1 implements shared backend metadata, normalization, persistence and
editorial change detection. It adds no HTTP gallery writes, editor controls,
uploads, placement parser, public rendering or media deletion. The existing
Shoelace highlights slideshow and its `images`/`captions` fields are unchanged.
Passing synthetic tests does not establish deployment readiness.

Structured `posts.body_gallery` storage separates ordered media metadata from
raw article HTML. Encoding the canonical collection in HTML would require
parsing and lossless editor round trips for validation, revisions and reference
checks. Overloading the highlights arrays would change their existing consumers.
One nullable JSON column and a small shared module avoid those coupled changes;
no additional dependency is needed. Native browser rendering remains a future
decision under `CODEX_WORKFLOW.md`, not part of this persistence contract.

## Version 1

The initial documentary collection is approximately **65 images**. The maximum
is **100 items**, including future validation, serialized-payload planning,
synthetic fixtures, editor planning and image-loading tests. Future rendering
must not interpret 100 metadata items as permission to eagerly load 100 display
images.

```json
{
  "version": 1,
  "items": [
    {
      "id": "abcdefab-1234-4234-8234-123456789abc",
      "asset": {
        "thumbnail": "/uploads/historical-thumb.webp",
        "medium": "/uploads/process-photo.webp",
        "large": "/uploads/documentary-detail.webp",
        "originalWidth": 4000,
        "originalHeight": 3000
      },
      "alt": "Framing joints visible before wall sheathing",
      "caption": "Assembly stage before enclosing the wall."
    }
  ]
}
```

- SQL NULL represents no gallery. `{ "version": 1, "items": [] }` normalizes
  to NULL; one item is valid. Creation without the field stores NULL.
- Item order in the array is authoritative. There is no numeric position.
  IDs, alt text and captions stay together when reordered.
- IDs must be UUIDs with a recognized version (1–8) and standard variant;
  nil/nonstandard IDs are rejected. Case canonicalizes to lowercase. The
  normalizer never generates or reassigns IDs.
- Objects have exactly the documented keys. Unknown versions/properties,
  malformed shapes, duplicate IDs and repeated derivative URLs are rejected.
- Asset references retain the three explicit existing URLs; suffixes are never
  reconstructed. Each variant is required and distinct. Any shared derivative
  URL across items is considered a repeated asset. Reuse across collections or
  posts is permitted by the contract, subject to the future safety gate below.
- URLs are at most 1,024 JavaScript UTF-16 code units and must be flat,
  site-relative `/uploads/<filename>.webp` references. No external URLs,
  filesystem paths, nested/protected directories, dotfiles, `..`, percent
  escapes, query/fragment delimiters, backslashes, schemes, control characters
  or HTML delimiters are accepted. Historical spaces/Unicode in otherwise safe
  flat filenames are preserved, not renamed. This is deliberately narrower
  than a general URL or media registry; an incompatible historical reference
  requires review rather than guessed rewriting.
- Original dimensions are optional together, and must be positive safe
  integers. Derived display dimensions/aspect ratios are not stored.
- Alt text is required, nonblank plain text, at most 500 UTF-16 code units.
  Caption is required as a string but may be empty, at most 2,000 code units.
  HTML delimiters and control characters are rejected, except tabs/newlines;
  CR/CRLF normalize to LF. Text is NFC-normalized and trimmed. Future renderers
  must still escape text; validation is not an HTML sanitizer.
- Canonical serialized JSON is limited to **262,144 UTF-8 bytes (256 KiB)**.
  This accommodates 100 ordinary documentary entries while bounding storage
  and parsing. Maximum individual lengths cannot necessarily all be used at
  once, especially with multibyte text. Key ordering is fixed; array order and
  exact asset URLs are preserved. Equivalent valid input serializes identically.
  Stored JSON is also bounded to 256 KiB before parsing; oversized raw storage
  is diagnosed as invalid rather than parsed without a limit.

## Persistence and editorial behavior

`blog-core/src/models/body-gallery.js` owns pure normalization/serialization and
safe stored-data decoding. Inputs are objects or explicit null, not JSON strings.
No filesystem access occurs in the module. Persistence stores canonical JSON;
Post reads hydrate objects and expose `body_gallery_error` (normally null).

On update or duplicate-title overwrite, **omitting** the property preserves the
existing stored value, including malformed data. An explicit null or valid empty
collection clears it. Explicit undefined and malformed supplied values reject
the operation. The shared editorial transaction prevents partial post,
category, authorship or publication writes on failure. Existing HTTP form
mapping omits this field, so it cannot accept gallery writes in Phase 1.

Gallery changes participate in revision fingerprints, stale-save rejection,
no-op comparison and meaningful internal `modified_at` detection. Reordering,
asset, alt and caption changes count. Equivalent normalized input is a no-op;
review-only changes retain their existing behavior. FFG overwrite uses the same
transactional update path and preserves first publication. No public modification
date is introduced.

Malformed stored JSON or invalid contract data yields `body_gallery: null` plus
`body_gallery_error: "invalid_stored_body_gallery"`. Public post reads can
continue; the error distinguishes corruption from valid absence without exposing
raw data in diagnostics. Nothing is rewritten on read. Internal fingerprints
retain a distinction between each invalid stored value, so concurrent corruption
changes also invalidate stale saves. Older callers omitting the field preserve
the raw value during other edits. Explicit repair/clear is possible through the
backend API; future admin UI must surface the diagnostic, not silently save null.

## Migration and compatibility

`0002_body_gallery.sql` adds nullable TEXT with
`CHECK (body_gallery IS NULL OR json_valid(body_gallery))`. Single-argument
SQLite `json_valid` uses the JSON support already exercised by this project;
the SQL guard checks JSON syntax, while the shared normalizer checks the full
contract. Existing rows gain NULL without backfill. The fresh canonical schema
matches all migrations. Frozen `0000`/`0001`, the ledger and runner are unchanged.

Existing databases require separately authorized explicit migration before code
that writes the new column is started. Startup does not apply pending migrations.
An old application/runner rejects the unknown `0002` ledger/schema: **additive
does not mean old-image rollback compatible**. Preserve a verified pre-migration
database/uploads pair and application anchor. Any eventual rollback/forward
recovery plan must account for writes after migration; restoring an older
database discards later writes. No real content database was migrated in this
local implementation task.

Historical test isolation was verified locally on 2026-11-12: supported fixtures
and operation/CLI contexts use only frozen `0000`/`0001`, with unchanged copies
of the real runtime sources. Separate fixed `0002` contexts verify rejection of
pending and applied gallery migrations; runtime historical-operation guards
remain unchanged. The application schema includes `0002`; older application
images cannot automatically roll back against a migrated database, so production
rollout still requires a schema-compatible rollback/recovery gate. Do not rerun
completed historical operations as part of gallery deployment.

## Phase 2: media retention and temporary cleanup

Removing an association does not delete previously committed physical media.
Highlight replacement/removal, FFG overwrite/cancellation, and both active
post-delete routes retain files even if no structured reference is found.
Post/category deletion is transactional. This also protects body galleries,
other posts, raw-HTML links and unsaved/concurrent edits without attempting to
enumerate every reference. Body-gallery association removal remains backend-only.
No automatic garbage collection or reference counter is introduced.

The retention audit found that older FFG hero replacement/reset deleted previous
generations, including their retained sources. The legacy reset removes the
selection manifest. The local v2 reset commits a null selection in the manifest
and retains all accepted grants and receipts. Both return to the repository
defaults. Local v2 also retains failed or unpublished candidate artifacts.

Raw uploads use exclusively created hidden request directories beneath the
configured `uploads/temp` root. The shared media-serving boundary denies that
URL namespace before either static handler, alongside Express dotfile handling.
The shared upload layer records server-reserved names and device/inode identity
after writing. Multer error cleanup, editorial request finalization and hero
request finalization use that ownership record, never public URLs or session
path lists. Cleanup validates canonical root/directory identity and regular,
single-link file identity, rejects traversal/symlinks/unknown entries, and uses
non-recursive directory removal. Cleanup is idempotent per request; unrelated
operations have separate directories. Uncertain files are retained with a warning,
and cleanup failure does not turn a committed save into an apparent failure.
This assumes the configured uploads filesystem is operated by trusted processes;
it is not a sandbox against a privileged actor rewriting paths between syscalls.

Managed post derivatives are prepared privately before the editorial transaction
and require the SQLite authority below. Failed saves, pending overwrites,
cancellations and abandoned operations retain candidates privately. Legacy files
are not reclassified or deleted. Only proven request-owned private raw inputs
are automatically cleaned; incomplete inputs and interrupted processing can
leave private residue for review. The local FFG hero writer uses the separate
filesystem authority described below. Production cutover and review of legacy
media remain open. No historical filenames or publication facts are inferred.

Retention can grow without a fixed bound as uploads, replacements and failed
operations accumulate; backups also grow. Existing host disk-capacity preflights
and per-site backup size receipts provide a non-destructive observation basis.
Compare those over time and include read-only live uploads usage in separately
authorized disk audits. No new job or monitor is needed in this slice; these
checks do not constitute continuous capacity alerting or identify all orphans.
Any physical-media cleanup needs a separate owner-authorized design and review
covering all references, pending/concurrent work, recovery and uncertainty.

Technology selection followed the native-first process: the problem is unsafe
deletion authority, not missing media-management features. Retention avoids the
incomplete reference graph and races of counters or scan-then-delete. Existing
Multer storage hooks and native Node filesystem identities provide the small
private-input cleanup boundary; no new dependency, registry or scheduled sweeper
is warranted. The ownership helper is limited to raw inputs, while uncertain
generated outputs are retained. The managed post authority below adds only the
durable receipt and exact candidate grants needed for editorial acceptance.

### Managed post publication (local implementation)

`private-media.js` allocates private candidate directories beneath
`uploads/.media/post/<UUID>` and `uploads/.media/hero/<UUID>`. Raw inputs remain
separate beneath `uploads/temp/.operation-*`; no existing files are moved.
Candidate preparation reuses the existing image processor and profiles, verifies
all three WebP variants/dimensions/hashes, and rejects malformed metadata or
changed directory identities. Partial/failed preparations stay private, with no
automatic deletion. Hero candidates can use the existing hero processor without
changing its selection manifest. The shared editorial router now uses private
post preparation. The November 19, 2026 local FFG hero implementation uses a
separate filesystem authority described below, without changing post acceptance.

`media-serving.js` owns both static registrations in their existing order. It
denies `.media`, `.source`, temporary uploads, ambiguous encodings/traversal and
symlink traversal before static serving. New reserved URL families are flat
`/uploads/m1-<UUID>-<thumbnail|medium|large>.webp` for posts and
`/uploads/hero/m1-<UUID>/current-hero.webp` or `current-hero-og.webp` for heroes.
Each request must receive literal `true` from its configured post/hero publication
callback before private bytes or conditional/304 responses are served.
`createBlogApp` installs the SQLite-backed post provider on its existing database
connection. FFG supplies its filesystem-backed hero provider and an optional
opened-file integrity verifier; TTA and post authorization remain independent.
Missing/error/malformed grants deny; no speculative cache is used.

Migration `0003_media_publications.sql` and the matching fresh schema add one
table. An operation row is keyed by its server-generated UUID; each accepted
candidate has a separate row keyed by candidate UUID, sharing the operation ID.
The operation index supports grouping; image authorization performs one SQL
statement with primary-key lookups for candidate and parent receipt. Rows record
site-local owner identity, type, lifecycle state, bounded metadata JSON (128 KiB), and
creation time. Operation data contains create/update context, submission/input
hashes, up to 25 verified candidates, required managed-image IDs (including
retained images), optional overwrite binding and receipt.
Candidate rows hold exact variant URLs, dimensions, byte counts and SHA-256s.
Only duplicate-title confirmations add a private body snapshot in the separate
`pending_input` column described below; public authorization reads metadata only.
No reference counter, general asset catalogue or historical backfill is added.
No post/user FK can cascade away a published grant. Database guards
make published/cancelled rows immutable, retain published records, and require
candidate membership in an accepted parent manifest when grants are inserted.

Editor GETs allocate operation IDs, carried by hidden fields in both editors and
FFG confirmation. Old forms lacking an ID must reload. Multipart submission binds
allowed editorial fields and ordered raw-file hashes, excluding CSRF/session
transport fields. Preparation records may persist independently, but grant rows
never do: private file integrity/type/proportions are verified, files and parent
directories are synced, then the existing immediate editorial transaction writes
the article, acceptance receipt and all grants together. There is no post-commit
file promotion. Acceptance refuses a connection below SQLite FULL synchronous
durability. Filesystem readiness and SQLite acceptance remain separate steps,
not a shared atomic transaction.

Accepted retries return their durable receipt without repeating article writes;
changed payloads cannot reuse it. Confirmation also binds target/revision and
explicit authorship reopening. Cancellation uses a conditional transaction:
cancel-first prevents acceptance; accept-first returns the existing receipt.
The owner-only operation status endpoint reports authoritative state. A lost
response can be recovered by identical resubmission/status lookup; an unreadable
database outcome returns unknown/503 rather than declaring rollback. An accepted
operation with missing/damaged media returns accepted-needs-repair/409; its grant
and article are retained. Ordinary replacement, gallery association removal,
overwrite and post deletion cannot revoke published media.

#### Operation-keyed FFG pending confirmation

The November 16, 2026 local implementation revised the then-uncommitted,
undeployed `0003` and matching fresh schema to include a nullable
`pending_input TEXT` column on the existing operation row. It holds
a version-1 JSON envelope of the existing allowlisted editorial input, including
the exact body, ordered authors/categories, captions, server-generated image
references and target revision. JSON round-trip preserves submitted text; the
existing stable input digest binds its meaning. CSRF/session fields, filesystem
authority and runtime acceptance capabilities are excluded. The existing 25-image
request limit is separate from the body gallery's 100-item collection contract.

The snapshot is limited to **8,388,608 serialized UTF-8 bytes (8 MiB)** in both
application validation and SQLite. Oversize binding returns HTTP 413 with actual
bytes and the ceiling; it never truncates, raises limits automatically or accepts
an overwrite. Existing parser limits are unchanged. Any already prepared
derivatives remain private under the existing retention policy.

A conditional `BEGIN IMMEDIATE` transaction binds the snapshot, original
submission fingerprint, target/revision and prepared image references together.
Identical rebinding is idempotent; changed content, target, revision or candidate
binding is rejected. SQL guards prohibit replacing/clearing a bound snapshot or
changing its metadata binding. Published/cancelled immutability remains intact.
A BEFORE INSERT collision guard rejects UUID and hidden-rowid reuse through
REPLACE/UPSERT, independently of SQLite recursive-trigger settings. A positive
rowid CHECK reserves the unassigned BEFORE INSERT marker; UPDATE guards prohibit
rowid reassignment, including moves from unbound rows onto protected records.
Direct SQL tests cover all rowid aliases, automatic/explicit allocation and
statement rollback in fresh/migrated schemas with recursive triggers off/on.
Idempotent retries read existing operations/receipts rather than reinserting
records. Overwrite target comparison uses the existing title trim rule without
changing snapshot input,
case sensitivity or Unicode semantics.
Pending binding alone creates no article update or public grant.

Confirmation uses `/admin/posts/confirm-overwrite?mediaOperationId=<UUID>` and the
form's operation ID. GET/POST load owner-authorized SQLite state; no active route
reads, restores, writes or clears `session.pendingEditorialOverwrite`. Obsolete
session data is ignored. Authentication, administrator checks and CSRF still use
the existing session middleware. Its independent, whole-session snapshots can
still overwrite flash/session data, but cannot change pending editorial authority.
Confirmation/status responses are `no-store` and status never returns the body.

Confirm/cancel affects only its identified operation. Concurrent tabs remain
independent; a revision-changing acceptance makes another operation on that old
revision stale. There is no silent revision refresh. Same-operation retries use
the immutable receipt. Session loss requires reauthentication, not resubmitting
pending content. Final overwrite and grants still share the existing immediate
editorial transaction after complete private derivative verification; filesystem
readiness and SQLite acceptance are not one atomic transaction.

Terminal snapshots are retained for this non-destructive slice. One thousand
maximum-size snapshots approach 7.8 GiB before database overhead and media.
Future read-only diagnostics should expose counts, ages and byte totals; no
diagnostic UI, expiry, draft system, quota or deletion job is implemented here.
Keeping the payload separate avoids copying/parsing article bodies in public
media authorization; it still increases database/backup size. A dedicated table
would be preferable if independent snapshot disposal becomes a requirement.

Synthetic tests use the actual Express session middleware and installed SQLite
store, with barriers before the real persistence write, plus disposable database
and upload roots. Reversed session writes, stale tabs, confirmation/cancellation,
owner/CSRF binding, UTF-8/size limits, response loss and crash recovery are covered.
This does not establish Linux volume/power-loss or production recovery readiness.

The shared `error-diagnostics.js` policy is reused by global and caught editorial
errors, nested Post/image-processing failures and site post-deletion catches.
It emits bounded names/codes/categories, method, fixed route family and a
server-generated error ID; exception objects/messages/stacks and submitted data
are excluded. Image-processing progress reports counts rather than raw upload
paths/names. HTTP error responses and cleanup/retention behavior are unchanged.
Diagnostic property reads are guarded and performed once, including inherited
or throwing getters; arbitrary thrown objects are never serialized. Active
authentication, administrative/public routes, hero, sitemap, analytics exceptions
and session callbacks use the same policy. The session-store adapter preserves
the installed expiry query/schedule while replacing its internal raw-error dump.
This does not change analytics storage or request/access-log policy.

Both site entrypoints finalize after shared middleware and site routes.
`setupFinalHandlers()` registers the existing 404 renderer followed by the bounded
error handler exactly once, then rejects late application route registration.
The small native-Promise `asyncHandler` forwards Express 4 route/callback
rejections to that boundary. Error-template failures use a bounded text fallback;
an already-started failed response is closed without forwarding a private stack.
This diagnostic boundary does not change request/access logging: Morgan and site
request loggers still retain raw query values. A separate narrow access-log
privacy correction remains required before production release.

Synthetic HTTP tests cover confidentiality before acceptance, rejected/stale
saves, cancellation, multi-file failure, actual response loss, duplicate/concurrent
requests and grant-insertion rollback. Disposable child processes are killed
immediately before/after commit, then reopened to verify prepared/private versus
published/available state. Restart never publishes a prepared row or deletes
abandoned files. These tests do not prove power-loss behavior, Linux volume
durability, multi-container contention or the production backup/restore pair.

`0003` is additive and does not alter frozen `0000`/`0001`/`0002` or gallery
storage. Startup does not migrate databases. The new application requires an
explicit authorized upgrade before startup. Frozen older runners/images reject
the newer ledger/schema, so an older-image rollback requires a compatible
database/uploads recovery plan; restoring an earlier pair discards later writes.

Unversioned legacy URLs retain static serving, public-tree precedence, MIME,
ETags and existing cache periods. This compatibility branch is not a historical
publication classification or a managed-candidate fallback. Reserved managed
requests never fall through, even if a matching public-tree file exists. No
historical media inventory or migration is performed; reserved-name collisions,
legacy leftovers and hero publication history require an explicit cutover review
before rollout. URL spelling containing ambiguous encodings and filesystem
symlinks are intentionally unsupported. Filesystem checks assume trusted local
writers; they do not sandbox a privileged process replacing paths between calls.

**Phase 2 requires independent review and production gates.** The local FFG hero
implementation below keeps new candidates private until manifest acceptance.
Legacy directories retain compatibility serving; their historical publication
facts and confidentiality cutover still require a separate inventory. Retention grows
without bound. The existing 25-file/50 MiB-per-file defaults permit about 1.22 GiB
of raw inputs per request, without aggregate/in-flight admission budgets. Setting
those budgets is a separate pre-deployment gate, not an arbitrary limit change
in this slice. No cleanup job, gallery HTTP upload/editor/rendering, dependency,
nginx or Docker change is introduced. Private storage stays in uploads for
recursive backup coverage. Release also requires final post-authority review,
hero-authority review, legacy cutover checks, isolated Docker and restore verification,
and separately authorized migration/deployment with compatible rollback anchors.

### Managed FFG hero publication (November 19, 2026 local implementation)

The native-first choice is one project-owned filesystem snapshot using existing
Node filesystem primitives, private-media helpers, Sharp profiles and serving
middleware. A second SQLite authority would split selection from grants and
introduce cross-store commit ambiguity. No dependency, SQLite migration, image
profile change, garbage collector or gallery feature is added here.

`uploads/hero/.current.json` is the sole authority. Strict v2 has exactly six
top-level keys: `version: 2`, `revision`, `current`, `legacySelection`,
`publications` and `operations`. `current` is null or `{kind, generation}` with
kind `legacy` or `managed`. V1 `{generation}` remains readable without a write
or a managed grant. The first accepted managed publication or reset preserves
that observed UUID in `legacySelection`; no earlier selection history is inferred.

Each publication is keyed by its server-issued UUID and contains `operationId`,
`ownerUserId`, raw `inputSha256`, a retained-source record and the two canonical
variant records. Source records contain decoded format/extension, dimensions,
byte count and SHA-256; variants contain dimensions, byte count and SHA-256.
Display dimensions follow the unchanged 1920-pixel maximum-width/no-enlargement
profile; social remains 1200 x 630. Future profile changes require a deliberate
version/validation decision. Persistent identity is content-based so restoring
the exact files onto different inodes remains possible. During verification,
device/inode, size, mtime/ctime and single-link checks detect replacement or change.

Accepted receipts contain `operationId`, `action`, `ownerUserId`, `inputSha256`,
`generation`, `previousSelection`, `revision` and `acceptedAt`. Revisions are
contiguous and the previous-selection chain must reconstruct the current value.
Reset uses a fixed action digest and null generation. Receipt, grant and current
selection commit together. Owner/action/input-bound retries return the existing
receipt without appending history or reselecting a superseded generation.

Allocation creates private `.media/hero/<UUID>` candidates. Ownership, input
binding and prepared-record sidecars there support retries but never authorize
serving. Upload inputs must satisfy the existing owned raw-input checks.
Preparation hashes and checks the source and both WebPs, rejects symlinks and
hardlink aliases, syncs the exact files and relevant directories, and retains
failed/ambiguous candidates. An interrupted partial preparation is not overwritten
on retry; it stays private and requires a fresh operation or separate recovery.

A shared coordinator identifies each canonical uploads root by filesystem
identity. It serializes authority reads and writes across ESM instances in the
application process. Per-operation queues prevent duplicate preparation and
release completed operation references. Distinct roots have separate queues.
The deployment requires one writer process. Acceptance exclusively writes a fresh
same-directory temporary file, syncs it, atomically renames it over the authority
and syncs the parent. No later media move is necessary. Managed requests during
that write fail closed with no-store rather than observing an unresolved snapshot.

Every authorization rereads/strictly validates the canonical manifest; there is
no cross-request grant cache. A newly observed or recovered v2 manifest is
file/parent-synced before it can authorize serving. Only that durability identity
is remembered. An attempted rename is reconciled through the canonical receipt;
unreadable, invalid or unsynced authority returns an explicit recovery-required
outcome on publish, reset, retry and receipt lookup. A confirmed receipt resolves
the retry without rewriting authority. An ambiguous rename is a definite failure
only if a verified reread confirms the exact predecessor. Candidates are retained.
Explicit allocation can initialize an empty authority only when no managed residue
exists. Missing authority with residue, corruption, observed v2 downgrade or
revision regression fails closed; recovery must not fabricate an empty history.

Application snapshots use `JSON.stringify` on validated objects, so they never
emit duplicate keys. The canonical reader also rejects duplicate object members,
including escaped spellings of the same key, so a malformed snapshot cannot
silently choose among conflicting grants, selections or receipts.

Exact managed URLs require grant membership even for historical generations.
The shared boundary securely opens the file, then FFG's verifier hashes that
same descriptor and checks recorded bytes/stable identity before GET, HEAD or
conditional 304. Denials never fall through to public-tree shadows. Private
`.media`, `.source`, temporary paths and malformed/encoded aliases stay denied.
Legacy plain-UUID URLs retain the compatibility branch; this is not a claim
that old directories contain reviewed publications. Filesystem race protection
assumes trusted local writers, not a hostile privileged process.

Home/About/social resolution may use the existing visual fallback when selected
bytes are unavailable. It never substitutes bytes at a historical managed URL
or revokes its grant. Bounded diagnostics and authenticated read-only integrity
status (`GET /admin/hero-image/integrity`, without operation allocation) distinguish
authority, display, social and retained-source problems;
owned-operation receipt lookup supports response-loss reconciliation. Source loss
is diagnosable while intact accepted derivatives can still serve. Runtime log
collection/retention must be verified separately; stdout is not itself durable storage.

Synthetic tests cover both storage layouts, real middleware/admin routes, browser
form/Home/About/reset behavior, barriers for competing operations, filesystem
fault injection and child-process interruption. SIGKILL/restart is not a power-loss
claim. Linux/container directory-sync behavior, coherent database/uploads restore,
legacy inventory, capacity/admission budgets, bounded log capture and a v2-capable
rollback floor remain pre-deployment gates. Retained generations and receipts grow
without an automatic quota, history truncation or deletion policy.

## Deferred boundaries

Future placement is one explicit, structurally validated standalone marker in
the article. Placement parsing, marker insertion and public rendering are not
implemented; do not append galleries automatically or evaluate article HTML as
Handlebars. A later rendering phase must preserve complete documentary photos
and test accessibility, loading budgets and 65/100-item collections.

Before enabling gallery uploads or asset reuse, establish server-side asset
authorization and existence checks, plus gallery draft/staging lifetime rules.
The pure URL check does not prove any of those facts or prove that differently
named files are physically distinct. Missing files must not silently remove
items/captions from persisted data.

Committed-media retention removes ordinary editorial check-then-unlink races;
it does not prove asset ownership, eliminate abandoned files or authorize
gallery HTTP writes. Garbage collection, gallery upload batching, editor UX,
HTTP payload limits and image-loading behavior remain separate work.
