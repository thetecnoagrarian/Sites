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

## Deferred boundaries

Future placement is one explicit, structurally validated standalone marker in
the article. Placement parsing, marker insertion and public rendering are not
implemented; do not append galleries automatically or evaluate article HTML as
Handlebars. A later rendering phase must preserve complete documentary photos
and test accessibility, loading budgets and 65/100-item collections.

Before enabling actual uploads or asset reuse, establish server-side asset
authorization, existence checks and temporary-file ownership/lifetime rules.
The pure URL check does not prove any of those facts or prove that differently
named files are physically distinct. Missing files must not silently remove
items/captions from persisted data.

Existing replacement cleanup only checks highlight references; existing post
deletion paths also need review. They do not protect gallery references or all
raw-HTML/cross-post reuse, and check-then-unlink races remain possible. **Do not
enable real gallery writes/uploads/reuse until media-reference safety is
addressed.** Retaining committed derivatives while only cleaning provably owned
temporary outputs is the proposed first safety policy; it is not implemented
here. Garbage collection, upload batching, editor UX, HTTP payload limits and
image-loading behavior remain separate work.
