PRAGMA foreign_keys = ON;

BEGIN;

INSERT INTO categories (name, slug)
VALUES ('Local Test Category', 'local-test-category')
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
    author_id
)
VALUES (
    'Local Test Post',
    'local-test-post',
    'Synthetic local test body containing the unique search marker isolated-harness-search-marker.',
    'Synthetic description for isolated local verification.',
    'Synthetic excerpt for isolated local verification.',
    '[]',
    '[]',
    NULL
)
ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    body = excluded.body,
    description = excluded.description,
    excerpt = excluded.excerpt,
    images = excluded.images,
    captions = excluded.captions,
    author_id = NULL;

INSERT OR IGNORE INTO post_categories (post_id, category_id)
SELECT posts.id, categories.id
FROM posts, categories
WHERE posts.slug = 'local-test-post'
  AND categories.slug = 'local-test-category';

COMMIT;
