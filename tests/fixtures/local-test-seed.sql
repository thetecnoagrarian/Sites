PRAGMA foreign_keys = ON;

BEGIN;

-- Synthetic Mode B-only admin for authenticated regression tests.
-- The matching deterministic password exists only in the targeted test file.
INSERT INTO users (username, password_hash, role, isAdmin)
VALUES (
    'mode-b-multer-admin',
    '$2a$10$riTWDti8/y7SXVHX.rWsqea1g/P.UXA3L0PxCelxvGn7z6BrRtnOC',
    'admin',
    1
)
ON CONFLICT(username) DO UPDATE SET
    password_hash = excluded.password_hash,
    role = excluded.role,
    isAdmin = excluded.isAdmin;

INSERT INTO categories (name, slug)
VALUES ('Local Test Category', 'local-test-category')
ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name;

INSERT INTO categories (name, slug)
VALUES ('Local Empty Category', 'local-empty-category')
ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name;

INSERT INTO posts (
    title,
    slug,
    body,
    description,
    excerpt,
    images,
    captions,
    created_at,
    author_id
)
VALUES (
    'Local Test Post',
    'local-test-post',
    'Synthetic local test body containing the unique search marker isolated-harness-search-marker.',
    '',
    'A "quoted" & <em>HTML-like</em> summary for safe metadata.',
    '[]',
    '[]',
    '2026-01-08 12:00:00',
    NULL
)
ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    body = excluded.body,
    description = excluded.description,
    excerpt = excluded.excerpt,
    images = excluded.images,
    captions = excluded.captions,
    created_at = excluded.created_at,
    author_id = NULL;

-- Explicit synthetic editorial facts exercise the current public identity and
-- date-only publication model without deriving either fact from legacy fields.
INSERT INTO public_people (public_key, display_name, profile_url)
VALUES
    ('mode-b-author-one', 'Mode B Author One', NULL),
    ('mode-b-author-two', 'Mode B Author Two', NULL)
ON CONFLICT(public_key) DO UPDATE SET
    display_name = excluded.display_name,
    profile_url = excluded.profile_url,
    is_active = 1;

-- Reset the review before replacing the complete ordered assignment set. This
-- keeps repeated fixture runs compatible with the database review guards.
UPDATE posts
SET authorship_review_state = 'unreviewed',
    authorship_reviewed_at = NULL,
    authorship_review_note = NULL
WHERE slug = 'local-test-post';

DELETE FROM post_public_authors
WHERE post_id = (SELECT id FROM posts WHERE slug = 'local-test-post');

INSERT INTO post_public_authors (post_id, public_person_id, position)
SELECT posts.id, public_people.id, 1
FROM posts, public_people
WHERE posts.slug = 'local-test-post'
  AND public_people.public_key = 'mode-b-author-one';

INSERT INTO post_public_authors (post_id, public_person_id, position)
SELECT posts.id, public_people.id, 2
FROM posts, public_people
WHERE posts.slug = 'local-test-post'
  AND public_people.public_key = 'mode-b-author-two';

UPDATE posts
SET publisher_public_person_id = (
        SELECT id FROM public_people WHERE public_key = 'mode-b-author-one'
    ),
    published_at = NULL,
    published_on = '2026-01-08',
    authorship_review_state = 'owner_attested',
    authorship_reviewed_at = '2026-09-21T12:00:00Z',
    authorship_review_note = 'Synthetic Mode B fixture',
    publication_review_state = 'owner_attested',
    publication_reviewed_at = '2026-09-21T12:00:00Z',
    publication_review_note = 'Synthetic Mode B fixture'
WHERE slug = 'local-test-post';

INSERT INTO posts (
    title,
    slug,
    body,
    description,
    excerpt,
    images,
    captions,
    created_at,
    author_id
)
VALUES
    ('Local Pagination Post 1', 'local-pagination-post-1', 'Synthetic pagination body isolated-harness-search-marker.', 'Synthetic pagination description.', 'Synthetic pagination excerpt 1.', '[]', '[]', '2026-01-01 12:00:00', NULL),
    ('Local Pagination Post 2', 'local-pagination-post-2', 'Synthetic pagination body isolated-harness-search-marker.', 'Synthetic pagination description.', 'Synthetic pagination excerpt 2.', '[]', '[]', '2026-01-02 12:00:00', NULL),
    ('Local Pagination Post 3', 'local-pagination-post-3', 'Synthetic pagination body isolated-harness-search-marker.', 'Synthetic pagination description.', 'Synthetic pagination excerpt 3.', '[]', '[]', '2026-01-03 12:00:00', NULL),
    ('Local Pagination Post 4', 'local-pagination-post-4', 'Synthetic pagination body isolated-harness-search-marker.', 'Synthetic pagination description.', 'Synthetic pagination excerpt 4.', '[]', '[]', '2026-01-04 12:00:00', NULL),
    ('Local Pagination Post 5', 'local-pagination-post-5', 'Synthetic pagination body isolated-harness-search-marker.', 'Synthetic pagination description.', 'Synthetic pagination excerpt 5.', '[]', '[]', '2026-01-05 12:00:00', NULL),
    ('Local Pagination Post 6', 'local-pagination-post-6', 'Synthetic pagination body isolated-harness-search-marker.', 'Synthetic pagination description.', 'Synthetic pagination excerpt 6.', '[]', '[]', '2026-01-06 12:00:00', NULL),
    ('Local Pagination Post 7', 'local-pagination-post-7', 'Synthetic pagination body isolated-harness-search-marker.', 'Synthetic pagination description.', 'Synthetic pagination excerpt 7.', '[]', '[]', '2026-01-07 12:00:00', NULL)
ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    body = excluded.body,
    description = excluded.description,
    excerpt = excluded.excerpt,
    images = excluded.images,
    captions = excluded.captions,
    created_at = excluded.created_at,
    author_id = NULL;

INSERT OR IGNORE INTO post_categories (post_id, category_id)
SELECT posts.id, categories.id
FROM posts, categories
WHERE posts.slug = 'local-test-post'
  AND categories.slug = 'local-test-category';

INSERT OR IGNORE INTO post_categories (post_id, category_id)
SELECT posts.id, categories.id
FROM posts, categories
WHERE posts.slug LIKE 'local-pagination-post-%'
  AND categories.slug = 'local-test-category';

COMMIT;
