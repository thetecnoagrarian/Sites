-- Private FFG editor state. This table grants no public media access.
CREATE TABLE gallery_drafts (
    id TEXT NOT NULL PRIMARY KEY,
    owner_user_id INTEGER NOT NULL CHECK (owner_user_id > 0),
    post_id INTEGER,
    operation_id TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    fields TEXT CHECK (fields IS NULL OR (json_valid(fields) AND length(CAST(fields AS BLOB)) <= 3145728)),
    staged TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(staged) AND length(CAST(staged AS BLOB)) <= 262144),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (operation_id) REFERENCES media_publications(id)
);
CREATE INDEX gallery_drafts_owner_updated ON gallery_drafts(owner_user_id, updated_at);
