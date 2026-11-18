-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    isAdmin BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Public people are editorial identities, independent of authentication users.
CREATE TABLE IF NOT EXISTS public_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT NOT NULL UNIQUE
        CHECK (length(trim(public_key)) > 0),
    display_name TEXT NOT NULL
        CHECK (length(trim(display_name)) > 0),
    profile_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    body TEXT NOT NULL,
    description TEXT,
    excerpt TEXT,
    images TEXT,          -- JSON array of image paths
    captions TEXT,        -- JSON array of captions
    author_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    publisher_public_person_id INTEGER,
    published_at TEXT
        CHECK (
            published_at IS NULL OR (
                length(published_at) >= 20
                AND substr(published_at, 11, 1) = 'T'
                AND date(substr(published_at, 1, 10), '+0 days') = substr(published_at, 1, 10)
                AND julianday(published_at) IS NOT NULL
                AND (
                    substr(published_at, -1, 1) = 'Z'
                    OR (
                        substr(published_at, -6, 1) IN ('+', '-')
                        AND substr(published_at, -3, 1) = ':'
                    )
                )
            )
        ),
    published_on TEXT
        CHECK (
            published_on IS NULL OR (
                length(published_on) = 10
                AND published_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                AND date(published_on, '+0 days') = published_on
            )
        )
        CHECK (published_at IS NULL OR published_on IS NULL),
    modified_at TEXT
        CHECK (
            modified_at IS NULL OR (
                length(modified_at) >= 20
                AND substr(modified_at, 11, 1) = 'T'
                AND date(substr(modified_at, 1, 10), '+0 days') = substr(modified_at, 1, 10)
                AND julianday(modified_at) IS NOT NULL
                AND (
                    substr(modified_at, -1, 1) = 'Z'
                    OR (
                        substr(modified_at, -6, 1) IN ('+', '-')
                        AND substr(modified_at, -3, 1) = ':'
                    )
                )
            )
        ),
    authorship_reviewed_at TEXT
        CHECK (
            authorship_reviewed_at IS NULL OR (
                length(authorship_reviewed_at) >= 20
                AND substr(authorship_reviewed_at, 11, 1) = 'T'
                AND date(substr(authorship_reviewed_at, 1, 10), '+0 days') = substr(authorship_reviewed_at, 1, 10)
                AND julianday(authorship_reviewed_at) IS NOT NULL
                AND (
                    substr(authorship_reviewed_at, -1, 1) = 'Z'
                    OR (
                        substr(authorship_reviewed_at, -6, 1) IN ('+', '-')
                        AND substr(authorship_reviewed_at, -3, 1) = ':'
                    )
                )
            )
        ),
    authorship_review_state TEXT NOT NULL DEFAULT 'unreviewed'
        CHECK (authorship_review_state IN (
            'unreviewed', 'verified', 'owner_attested', 'reviewed_unavailable'
        ))
        CHECK (
            (authorship_review_state = 'unreviewed' AND authorship_reviewed_at IS NULL)
            OR
            (authorship_review_state <> 'unreviewed' AND authorship_reviewed_at IS NOT NULL)
        ),
    authorship_review_note TEXT,
    publication_reviewed_at TEXT
        CHECK (
            publication_reviewed_at IS NULL OR (
                length(publication_reviewed_at) >= 20
                AND substr(publication_reviewed_at, 11, 1) = 'T'
                AND date(substr(publication_reviewed_at, 1, 10), '+0 days') = substr(publication_reviewed_at, 1, 10)
                AND julianday(publication_reviewed_at) IS NOT NULL
                AND (
                    substr(publication_reviewed_at, -1, 1) = 'Z'
                    OR (
                        substr(publication_reviewed_at, -6, 1) IN ('+', '-')
                        AND substr(publication_reviewed_at, -3, 1) = ':'
                    )
                )
            )
        ),
    publication_review_state TEXT NOT NULL DEFAULT 'unreviewed'
        CHECK (publication_review_state IN (
            'unreviewed', 'verified', 'owner_attested', 'reviewed_unavailable'
        ))
        CHECK (
            (publication_review_state = 'unreviewed' AND publication_reviewed_at IS NULL)
            OR
            (publication_review_state <> 'unreviewed' AND publication_reviewed_at IS NOT NULL)
        )
        CHECK (
            publication_review_state NOT IN ('unreviewed', 'reviewed_unavailable')
            OR (published_at IS NULL AND published_on IS NULL)
        )
        CHECK (
            publication_review_state NOT IN ('verified', 'owner_attested')
            OR published_at IS NOT NULL
            OR published_on IS NOT NULL
        ),
    publication_review_note TEXT,
    body_gallery TEXT
        CHECK (body_gallery IS NULL OR json_valid(body_gallery)),
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (publisher_public_person_id) REFERENCES public_people(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_posts_publisher_public_person_id
    ON posts(publisher_public_person_id);

-- A post can have multiple explicitly ordered public authors. Positions are one-based.
CREATE TABLE IF NOT EXISTS post_public_authors (
    post_id INTEGER NOT NULL,
    public_person_id INTEGER NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 1),
    PRIMARY KEY (post_id, public_person_id),
    UNIQUE (post_id, position),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (public_person_id) REFERENCES public_people(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_post_public_authors_public_person_id
    ON post_public_authors(public_person_id);

-- Reviewed authorship describes the whole ordered assignment set. Reset the
-- review before changing that set, including through low-level SQL callers.
CREATE TRIGGER IF NOT EXISTS post_public_authors_insert_unreviewed
    BEFORE INSERT ON post_public_authors
    WHEN EXISTS (
        SELECT 1 FROM posts
        WHERE id = NEW.post_id AND authorship_review_state <> 'unreviewed'
    )
BEGIN
    SELECT RAISE(ABORT, 'Reset authorship review before changing assigned authors');
END;

CREATE TRIGGER IF NOT EXISTS post_public_authors_delete_unreviewed
    BEFORE DELETE ON post_public_authors
    WHEN EXISTS (
        SELECT 1 FROM posts
        WHERE id = OLD.post_id AND authorship_review_state <> 'unreviewed'
    )
BEGIN
    SELECT RAISE(ABORT, 'Reset authorship review before changing assigned authors');
END;

CREATE TRIGGER IF NOT EXISTS post_public_authors_update_unreviewed
    BEFORE UPDATE ON post_public_authors
    WHEN EXISTS (
        SELECT 1 FROM posts
        WHERE id IN (OLD.post_id, NEW.post_id)
          AND authorship_review_state <> 'unreviewed'
    )
BEGIN
    SELECT RAISE(ABORT, 'Reset authorship review before changing assigned authors');
END;

CREATE TRIGGER IF NOT EXISTS posts_authorship_review_assignments_insert
    BEFORE INSERT ON posts
    WHEN (
        NEW.authorship_review_state = 'reviewed_unavailable'
        AND EXISTS (SELECT 1 FROM post_public_authors WHERE post_id = NEW.id)
    ) OR (
        NEW.authorship_review_state IN ('verified', 'owner_attested')
        AND NOT EXISTS (SELECT 1 FROM post_public_authors WHERE post_id = NEW.id)
    )
BEGIN
    SELECT RAISE(ABORT, 'Authorship review state contradicts assigned authors');
END;

CREATE TRIGGER IF NOT EXISTS posts_authorship_review_assignments_update
    BEFORE UPDATE OF authorship_review_state ON posts
    WHEN (
        NEW.authorship_review_state = 'reviewed_unavailable'
        AND EXISTS (SELECT 1 FROM post_public_authors WHERE post_id = NEW.id)
    ) OR (
        NEW.authorship_review_state IN ('verified', 'owner_attested')
        AND NOT EXISTS (SELECT 1 FROM post_public_authors WHERE post_id = NEW.id)
    )
BEGIN
    SELECT RAISE(ABORT, 'Authorship review state contradicts assigned authors');
END;

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Post-Category relationship table
CREATE TABLE IF NOT EXISTS post_categories (
    post_id INTEGER,
    category_id INTEGER,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, category_id)
);

-- Sessions table for express-session (better-sqlite3-session-store format)
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT NOT NULL PRIMARY KEY,
    sess JSON NOT NULL,
    expire TEXT NOT NULL
);

-- Create triggers to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS users_updated_at 
    AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS posts_updated_at 
    AFTER UPDATE ON posts
BEGIN
    UPDATE posts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS categories_updated_at 
    AFTER UPDATE ON categories
BEGIN
    UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

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
