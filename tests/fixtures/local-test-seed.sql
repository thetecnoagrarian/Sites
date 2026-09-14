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
