-- Operation receipts and per-candidate grants share one bounded, site-local table.
-- No FK to posts/users: ordinary editorial deletion cannot revoke publication.
CREATE TABLE media_publications (
    id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36 AND id NOT GLOB '*[^0-9a-f-]*'),
    operation_id TEXT NOT NULL CHECK (length(operation_id) = 36),
    record_type TEXT NOT NULL CHECK (record_type IN ('operation', 'asset')),
    owner_user_id INTEGER NOT NULL CHECK (owner_user_id > 0),
    state TEXT NOT NULL CHECK (state IN ('allocated', 'prepared', 'published', 'cancelled')),
    data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
        AND length(CAST(data AS BLOB)) <= 131072),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    pending_input TEXT CHECK (pending_input IS NULL OR CASE WHEN json_valid(pending_input) THEN
        COALESCE(record_type = 'operation' AND state <> 'allocated' AND typeof(pending_input) = 'text'
            AND length(CAST(pending_input AS BLOB)) <= 8388608
            AND json_type(pending_input) = 'object'
            AND json_type(pending_input, '$.version') = 'integer'
            AND json_extract(pending_input, '$.version') = 1
            AND json_type(pending_input, '$.input') = 'object', 0)
        ELSE 0 END),
    -- Reserve SQLite's unassigned BEFORE INSERT rowid (-1); stored rows are positive.
    CHECK (rowid > 0),
    CHECK (record_type <> 'operation' OR COALESCE(
        (json_type(data, '$.pending') = 'null' AND pending_input IS NULL)
        OR (json_type(data, '$.pending') = 'object' AND pending_input IS NOT NULL), 0)),
    CHECK ((record_type = 'operation' AND id = operation_id)
        OR (record_type = 'asset' AND id <> operation_id AND state = 'published'))
);
CREATE INDEX media_publications_operation ON media_publications(operation_id);
-- REPLACE can skip DELETE triggers when recursive_triggers is OFF. IDs are
-- server-issued identities; idempotent retries read receipts, never reinsert.
CREATE TRIGGER media_publications_no_reinsert BEFORE INSERT ON media_publications
WHEN EXISTS (SELECT 1 FROM media_publications WHERE id = NEW.id OR rowid = NEW.rowid)
BEGIN SELECT RAISE(ABORT, 'Media publication identity already exists'); END;
CREATE TRIGGER media_publications_immutable_update BEFORE UPDATE ON media_publications
WHEN OLD.state IN ('published', 'cancelled') OR NEW.rowid <> OLD.rowid
    OR NEW.id <> OLD.id OR NEW.operation_id <> OLD.operation_id
    OR NEW.owner_user_id <> OLD.owner_user_id OR NEW.record_type <> OLD.record_type
    OR (OLD.pending_input IS NOT NULL AND (
        NEW.pending_input IS NOT OLD.pending_input
        OR json_extract(NEW.data, '$.context') IS NOT json_extract(OLD.data, '$.context')
        OR json_extract(NEW.data, '$.submission') IS NOT json_extract(OLD.data, '$.submission')
        OR json_extract(NEW.data, '$.inputHash') IS NOT json_extract(OLD.data, '$.inputHash')
        OR json_extract(NEW.data, '$.pending') IS NOT json_extract(OLD.data, '$.pending')
        OR json_extract(NEW.data, '$.candidates') IS NOT json_extract(OLD.data, '$.candidates')
        OR json_extract(NEW.data, '$.required') IS NOT json_extract(OLD.data, '$.required')))
BEGIN SELECT RAISE(ABORT, 'Media publication is immutable'); END;
CREATE TRIGGER media_publications_immutable_delete BEFORE DELETE ON media_publications
WHEN OLD.state IN ('published', 'cancelled') OR OLD.pending_input IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Media publication is retained'); END;
CREATE TRIGGER media_publications_asset_parent BEFORE INSERT ON media_publications
WHEN NEW.record_type = 'asset' AND NOT EXISTS (
    SELECT 1 FROM media_publications p, json_each(p.data, '$.candidates') c
    WHERE p.id = NEW.operation_id AND p.record_type = 'operation'
        AND p.state = 'published' AND p.owner_user_id = NEW.owner_user_id
        AND json_extract(c.value, '$.id') = NEW.id
        AND json(c.value) = json(NEW.data)
)
BEGIN SELECT RAISE(ABORT, 'Media asset requires accepted operation'); END;
