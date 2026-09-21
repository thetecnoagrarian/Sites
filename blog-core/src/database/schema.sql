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
