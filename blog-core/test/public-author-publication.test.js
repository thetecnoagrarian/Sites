import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/database/init.js';
import { createMigrationRunner, loadMigrations } from '../src/database/migrations.js';
import { expectedSignature, schemaSignature } from '../src/database/schema-recognition.js';
import {
    Category, Post, PostPublication, PublicPerson, User, setDatabase
} from '../src/models/index.js';

const migrations = loadMigrations();
const runner = createMigrationRunner(migrations);

function fixture(t) {
    const directory = mkdtempSync(join(tmpdir(), 'sites-publication-model-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    return directory;
}

function createFromSql(directory, name, sql) {
    const path = join(directory, name);
    const db = new Database(path);
    db.exec(sql);
    db.close();
    return path;
}

function seedLegacyFacts(path, includeCategoryDescription) {
    const db = new Database(path);
    try {
        db.pragma('foreign_keys = ON');
        const userId = db.prepare(`
            INSERT INTO users
                (username, password_hash, role, isAdmin, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run('private-login', 'synthetic-hash', 'admin', 1,
            '2023-01-02 03:04:05', '2023-01-03 04:05:06').lastInsertRowid;
        const categoryColumns = includeCategoryDescription
            ? '(name, slug, description, created_at, updated_at)'
            : '(name, slug, created_at, updated_at)';
        const categoryValues = includeCategoryDescription
            ? ['Legacy Category', 'legacy-category', 'Preserve this description',
                '2023-02-03 04:05:06', '2023-02-04 05:06:07']
            : ['Legacy Category', 'legacy-category',
                '2023-02-03 04:05:06', '2023-02-04 05:06:07'];
        const placeholders = categoryValues.map(() => '?').join(', ');
        const categoryId = db.prepare(`INSERT INTO categories ${categoryColumns}
            VALUES (${placeholders})`).run(...categoryValues).lastInsertRowid;
        const postId = db.prepare(`
            INSERT INTO posts
                (title, slug, body, description, excerpt, images, captions,
                 author_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('Legacy Post', 'legacy-post', 'Body', 'Description', 'Excerpt',
            '["/legacy.webp"]', '["Legacy caption"]', userId,
            '2023-03-04 05:06:07', '2023-03-05 06:07:08').lastInsertRowid;
        db.prepare('INSERT INTO post_categories (post_id, category_id) VALUES (?, ?)')
            .run(postId, categoryId);
        db.prepare('INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)')
            .run('legacy-session', '{"synthetic":true}', '2099-01-01T00:00:00.000Z');
    } finally {
        db.close();
    }
}

for (const definition of [
    {
        variant: 'canonical_0000',
        sql: migrations[0].sql,
        categoryDescription: false,
        userOrder: ['id', 'username', 'password_hash', 'role', 'isAdmin', 'created_at', 'updated_at']
    },
    {
        variant: 'tta_legacy_production',
        fixture: 'tta-legacy-schema.sql',
        categoryDescription: true,
        userOrder: ['id', 'username', 'password_hash', 'role', 'isAdmin', 'created_at', 'updated_at']
    },
    {
        variant: 'ffg_legacy_production',
        fixture: 'ffg-legacy-schema.sql',
        categoryDescription: false,
        userOrder: ['id', 'username', 'password_hash', 'isAdmin', 'created_at', 'updated_at', 'role']
    }
]) {
    test(`public Person migration preserves rich ${definition.variant} data without inference`, (t) => {
        const sql = definition.sql ?? readFileSync(
            join(import.meta.dirname, 'fixtures', definition.fixture), 'utf8');
        const path = createFromSql(fixture(t), `${definition.variant}.db`, sql);
        seedLegacyFacts(path, definition.categoryDescription);

        const before = new Database(path, { readonly: true });
        const original = {
            user: before.prepare('SELECT * FROM users').get(),
            post: before.prepare('SELECT * FROM posts').get(),
            category: before.prepare('SELECT * FROM categories').get(),
            relation: before.prepare('SELECT * FROM post_categories').get(),
            session: before.prepare('SELECT * FROM sessions').get(),
            userOrder: before.prepare(`SELECT name FROM pragma_table_xinfo('users') ORDER BY cid`)
                .all().map(row => row.name)
        };
        before.close();

        assert.equal(runner.plan(path).baselineVariant, definition.variant);
        assert.deepEqual(runner.apply(path).appliedNow,
            ['0000_existing_schema', '0001_public_author_publication_model']);
        assert.deepEqual(runner.apply(path).appliedNow, []);
        initializeDatabase(path).close();

        const db = new Database(path, { readonly: true });
        try {
            const post = db.prepare('SELECT * FROM posts').get();
            for (const key of Object.keys(original.post)) assert.deepEqual(post[key], original.post[key]);
            assert.deepEqual(db.prepare('SELECT * FROM users').get(), original.user);
            assert.deepEqual(db.prepare('SELECT * FROM categories').get(), original.category);
            assert.deepEqual(db.prepare('SELECT * FROM post_categories').get(), original.relation);
            assert.deepEqual(db.prepare('SELECT * FROM sessions').get(), original.session);
            assert.deepEqual(db.prepare(`SELECT name FROM pragma_table_xinfo('users') ORDER BY cid`)
                .all().map(row => row.name), definition.userOrder);
            assert.deepEqual(original.userOrder, definition.userOrder);
            assert.equal(post.publisher_public_person_id, null);
            assert.equal(post.published_at, null);
            assert.equal(post.published_on, null);
            assert.equal(post.modified_at, null);
            assert.equal(post.authorship_review_state, 'unreviewed');
            assert.equal(post.authorship_reviewed_at, null);
            assert.equal(post.publication_review_state, 'unreviewed');
            assert.equal(post.publication_reviewed_at, null);
            assert.equal(db.prepare('SELECT COUNT(*) AS count FROM public_people').get().count, 0);
            assert.equal(db.prepare('SELECT COUNT(*) AS count FROM post_public_authors').get().count, 0);
            assert.deepEqual(db.prepare('SELECT id FROM schema_migrations ORDER BY id').all(), [
                { id: '0000_existing_schema' },
                { id: '0001_public_author_publication_model' }
            ]);
            assert.deepEqual(db.prepare('SELECT variant FROM schema_baseline').get(),
                { variant: definition.variant });
            assert.deepEqual(schemaSignature(db),
                expectedSignature(migrations, migrations.length, definition.variant));
            assert.deepEqual(db.pragma('foreign_key_check'), []);
        } finally {
            db.close();
        }
    });
}

test('public identities, ordered authors, publisher, and publication precision are explicit', (t) => {
    const path = join(fixture(t), 'model.db');
    const db = initializeDatabase(path);
    setDatabase(db);
    try {
        const loginId = db.prepare(`
            INSERT INTO users (username, password_hash) VALUES (?, ?)
        `).run('private-mike-login', 'synthetic-hash').lastInsertRowid;
        const postId = db.prepare(`
            INSERT INTO posts (title, slug, body, author_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run('Public Model', 'public-model', 'Body', loginId,
            '2024-01-02 03:04:05', '2024-01-03 04:05:06').lastInsertRowid;

        assert.equal(PostPublication.getPostFacts(postId).authors.length, 0);
        assert.equal(PostPublication.getPostFacts(postId).published_at, null);

        const mike = PublicPerson.create({
            publicKey: 'mike',
            displayName: 'Mike',
            profileUrl: 'https://example.test/people/mike'
        });
        const lou = PublicPerson.create({ publicKey: 'lou', displayName: 'Lou' });
        assert.deepEqual(db.pragma('foreign_key_list(public_people)'), [],
            'public identities have no auth-user relationship');
        assert.equal(PublicPerson.findByKey('mike').display_name, 'Mike');
        assert.throws(() => PublicPerson.create({ publicKey: 'mike', displayName: 'Other Mike' }),
            /UNIQUE constraint/);
        assert.deepEqual(PostPublication.replaceAuthors(postId, [lou.id, mike.id])
            .map(author => [author.public_key, author.position]), [['lou', 1], ['mike', 2]]);
        PostPublication.setPublisher(postId, mike.id);
        PostPublication.setAuthorshipReview(postId, {
            state: 'owner_attested',
            reviewedAt: '2026-09-21T14:15:16Z',
            note: 'Synthetic owner attestation'
        });
        const facts = PostPublication.setPublicationHistory(postId, {
            publishedAt: '2024-02-03T10:11:12-05:00',
            state: 'verified',
            reviewedAt: '2026-09-21T14:16:17Z'
        });
        assert.equal(facts.publisher_public_key, 'mike');
        assert.equal(facts.published_at, '2024-02-03T10:11:12-05:00');
        assert.equal(facts.published_on, null);
        assert.equal(facts.modified_at, null);
        assert.deepEqual(facts.authors.map(author => author.public_key), ['lou', 'mike']);
        assert.throws(() => PostPublication.replaceAuthors(postId, [mike.id, lou.id]),
            /Reset authorship review/);
        assert.deepEqual(PostPublication.replaceAuthors(postId, [lou.id, mike.id])
            .map(author => author.public_key), ['lou', 'mike'],
            'an identical assignment is a safe no-op after review');

        db.prepare('UPDATE posts SET title = ? WHERE id = ?').run('Ordinary save', postId);
        assert.equal(PostPublication.getPostFacts(postId).modified_at, null,
            'ordinary saves do not assert a public modification time');
        db.prepare('UPDATE posts SET modified_at = ? WHERE id = ?')
            .run('2026-09-21T14:17:18Z', postId);
        assert.equal(PostPublication.getPostFacts(postId).modified_at,
            '2026-09-21T14:17:18Z', 'schema reserves explicit modification storage');

        const legacyDates = db.prepare('SELECT created_at, author_id FROM posts WHERE id = ?').get(postId);
        assert.equal(legacyDates.created_at, '2024-01-02 03:04:05');
        assert.equal(legacyDates.author_id, loginId);

        assert.equal(PublicPerson.archive(lou.id), true);
        assert.equal(PostPublication.getAuthors(postId)[0].public_key, 'lou',
            'archiving preserves historical assignments');
        assert.throws(() => PostPublication.replaceAuthors(postId, [lou.id]), /archived/);
        assert.throws(() => db.prepare('DELETE FROM public_people WHERE id = ?').run(mike.id),
            /FOREIGN KEY/);

        const cascadePostId = db.prepare(`
            INSERT INTO posts (title, slug, body) VALUES (?, ?, ?)
        `).run('Cascade Probe', 'cascade-probe', 'Body').lastInsertRowid;
        PostPublication.replaceAuthors(cascadePostId, [mike.id]);
        db.prepare('DELETE FROM posts WHERE id = ?').run(cascadePostId);
        assert.equal(db.prepare(`
            SELECT COUNT(*) AS count FROM post_public_authors WHERE post_id = ?
        `).get(cascadePostId).count, 0);
    } finally {
        db.close();
    }
});

test('date-only and unavailable history stay distinct and invalid claims fail closed', (t) => {
    const path = join(fixture(t), 'precision.db');
    const db = initializeDatabase(path);
    setDatabase(db);
    try {
        const createPost = slug => db.prepare(`
            INSERT INTO posts (title, slug, body) VALUES (?, ?, ?)
        `).run(slug, slug, 'Body').lastInsertRowid;
        const dateOnlyId = createPost('date-only');
        const unavailableId = createPost('unavailable');
        const author = PublicPerson.create({ publicKey: 'editorial-person', displayName: 'Person' });

        PostPublication.replaceAuthors(dateOnlyId, [author.id]);
        PostPublication.setAuthorshipReview(dateOnlyId, {
            state: 'verified', reviewedAt: '2026-09-21T15:00:00Z'
        });
        const dateOnly = PostPublication.setPublicationHistory(dateOnlyId, {
            publishedOn: '2024-02-29',
            state: 'owner_attested',
            reviewedAt: '2026-09-21T15:01:00Z'
        });
        assert.equal(dateOnly.published_on, '2024-02-29');
        assert.equal(dateOnly.published_at, null);

        const unavailable = PostPublication.setPublicationHistory(unavailableId, {
            state: 'reviewed_unavailable',
            reviewedAt: '2026-09-21T15:02:00Z',
            note: 'Synthetic review found no evidence'
        });
        assert.equal(unavailable.published_on, null);
        assert.equal(unavailable.publication_review_state, 'reviewed_unavailable');
        PostPublication.setAuthorshipReview(unavailableId, {
            state: 'reviewed_unavailable', reviewedAt: '2026-09-21T15:03:00Z'
        });

        assert.throws(() => PostPublication.setPublicationHistory(dateOnlyId, {
            publishedAt: '2024-01-01T00:00:00Z', publishedOn: '2024-01-01'
        }), /mutually exclusive/);
        assert.throws(() => PostPublication.setPublicationHistory(dateOnlyId, {
            publishedOn: '2023-02-29'
        }), /real calendar date/);
        assert.throws(() => PostPublication.setPublicationHistory(dateOnlyId, {
            publishedAt: '2024-01-01 00:00:00'
        }), /explicit timezone/);
        assert.throws(() => PostPublication.setPublicationHistory(dateOnlyId, {
            publishedAt: '2023-02-29T00:00:00Z'
        }), /real calendar date/);
        assert.throws(() => PostPublication.setPublicationHistory(dateOnlyId, {
            state: 'verified', reviewedAt: '2026-09-21T15:04:00Z'
        }), /requires a publication value/);
        assert.throws(() => PostPublication.replaceAuthors(unavailableId, [author.id]),
            /Reset authorship review/);
        assert.throws(() => db.prepare(`
            UPDATE posts SET published_at = ?, published_on = ? WHERE id = ?
        `).run('2024-01-01T00:00:00Z', '2024-01-01', dateOnlyId), /CHECK constraint/);
        assert.throws(() => db.prepare(`
            UPDATE posts SET publication_review_state = ? WHERE id = ?
        `).run('invented', dateOnlyId), /CHECK constraint/);
        assert.throws(() => db.prepare(`
            UPDATE posts
            SET publication_review_state = 'verified'
            WHERE id = ?
        `).run(unavailableId), /CHECK constraint/);
        const foreignKeyProbeId = createPost('foreign-key-probe');
        assert.throws(() => db.prepare(`
            INSERT INTO post_public_authors (post_id, public_person_id, position)
            VALUES (?, ?, ?)
        `).run(foreignKeyProbeId, 999999, 1), /FOREIGN KEY/);
        const secondAuthor = PublicPerson.create({
            publicKey: 'second-editorial-person', displayName: 'Second Person'
        });
        assert.throws(() => db.prepare(`
            INSERT INTO post_public_authors (post_id, public_person_id, position)
            VALUES (?, ?, ?)
        `).run(dateOnlyId, secondAuthor.id, 1), /Reset authorship review/);
        assert.throws(() => db.prepare(`
            INSERT INTO post_public_authors (post_id, public_person_id, position)
            VALUES (?, ?, ?)
        `).run(dateOnlyId, author.id, 2), /Reset authorship review/);
        assert.deepEqual(db.pragma('foreign_key_check'), []);
    } finally {
        db.close();
    }
});

test('publisher-only and archived public people retain explicit historical references', (t) => {
    const db = initializeDatabase(join(fixture(t), 'publisher-only.db'));
    setDatabase(db);
    try {
        const postId = db.prepare(`
            INSERT INTO posts (title, slug, body) VALUES ('Publisher', 'publisher', 'Body')
        `).run().lastInsertRowid;
        const publisher = PublicPerson.create({
            publicKey: 'publisher-only', displayName: 'Publisher Only'
        });

        PostPublication.setPublisher(postId, publisher.id);
        let facts = PostPublication.getPostFacts(postId);
        assert.equal(facts.publisher_public_person_id, publisher.id);
        assert.equal(facts.publisher_public_key, 'publisher-only');
        assert.deepEqual(facts.authors, [], 'publisher identity does not imply authorship');

        assert.equal(PublicPerson.archive(publisher.id), true);
        facts = PostPublication.getPostFacts(postId);
        assert.equal(facts.publisher_public_key, 'publisher-only',
            'archive status does not erase historical publisher identity');
        assert.throws(() => db.prepare('DELETE FROM public_people WHERE id = ?')
            .run(publisher.id), /FOREIGN KEY/);
    } finally {
        db.close();
    }
});

test('reviewed authorship is guarded and replacement is atomic', (t) => {
    const db = initializeDatabase(join(fixture(t), 'authorship-guard.db'));
    setDatabase(db);
    try {
        const postId = db.prepare(`
            INSERT INTO posts (title, slug, body) VALUES ('Authorship', 'authorship', 'Body')
        `).run().lastInsertRowid;
        const first = PublicPerson.create({ publicKey: 'first', displayName: 'First' });
        const second = PublicPerson.create({ publicKey: 'second', displayName: 'Second' });
        const third = PublicPerson.create({ publicKey: 'third', displayName: 'Third' });
        PostPublication.replaceAuthors(postId, [first.id, second.id]);
        assert.throws(() => PostPublication.replaceAuthors(postId, [first.id, first.id]),
            /array of unique IDs/);
        assert.throws(() => db.prepare(`
            INSERT INTO post_public_authors (post_id, public_person_id, position)
            VALUES (?, ?, 2)
        `).run(postId, third.id), /UNIQUE constraint/,
        'two authors cannot occupy the same position');
        assert.throws(() => db.prepare(`
            INSERT INTO post_public_authors (post_id, public_person_id, position)
            VALUES (?, ?, 3)
        `).run(postId, first.id), /UNIQUE constraint/,
        'one person cannot be assigned twice');
        assert.throws(() => db.prepare(`
            INSERT INTO post_public_authors (post_id, public_person_id, position)
            VALUES (?, ?, 0)
        `).run(postId, third.id), /CHECK constraint/,
        'author positions are one-based');
        PostPublication.setAuthorshipReview(postId, {
            state: 'verified', reviewedAt: '2026-09-21T16:00:00Z'
        });

        assert.throws(() => db.prepare(`
            DELETE FROM post_public_authors WHERE post_id = ? AND public_person_id = ?
        `).run(postId, first.id), /Reset authorship review/);
        assert.throws(() => db.prepare(`
            UPDATE post_public_authors SET position = 3
            WHERE post_id = ? AND public_person_id = ?
        `).run(postId, first.id), /Reset authorship review/);
        assert.throws(() => db.prepare(`
            INSERT INTO post_public_authors (post_id, public_person_id, position)
            VALUES (?, ?, 3)
        `).run(postId, third.id), /Reset authorship review/);
        assert.throws(() => db.prepare(`
            UPDATE posts
            SET authorship_review_state = 'reviewed_unavailable',
                authorship_reviewed_at = '2026-09-21T16:01:00Z'
            WHERE id = ?
        `).run(postId), /contradicts assigned authors/);

        PostPublication.setAuthorshipReview(postId, { state: 'unreviewed' });
        db.exec(`CREATE TEMP TRIGGER reject_second_author
            BEFORE INSERT ON post_public_authors WHEN NEW.position = 2
            BEGIN SELECT RAISE(ABORT, 'synthetic second author failure'); END;`);
        assert.throws(() => PostPublication.replaceAuthors(postId, [third.id, first.id]),
            /synthetic second author failure/);
        assert.deepEqual(PostPublication.getAuthors(postId)
            .map(person => [person.public_key, person.position]),
        [['first', 1], ['second', 2]], 'failed replacement rolls back delete and partial insert');
        assert.equal(PostPublication.getPostFacts(postId).authorship_review_state, 'unreviewed',
            'explicit review reset remains visible after a later replacement failure');
        db.exec('DROP TRIGGER reject_second_author');

        assert.deepEqual(PostPublication.replaceAuthors(postId, [third.id, first.id])
            .map(person => [person.public_key, person.position]),
        [['third', 1], ['first', 2]], 'author positions use a one-based convention');
        PostPublication.setAuthorshipReview(postId, {
            state: 'owner_attested', reviewedAt: '2026-09-21T16:02:00Z'
        });
        assert.equal(Post.delete(postId).changes, 1);
        assert.equal(db.prepare(`
            SELECT COUNT(*) AS count FROM post_public_authors WHERE post_id = ?
        `).get(postId).count, 0, 'post deletion cascades reviewed author assignments');
    } finally {
        db.close();
    }
});

test('database constraints enforce publication precision and review combinations', (t) => {
    const db = initializeDatabase(join(fixture(t), 'publication-constraints.db'));
    setDatabase(db);
    try {
        const postId = db.prepare(`
            INSERT INTO posts (title, slug, body) VALUES ('Precision', 'precision', 'Body')
        `).run().lastInsertRowid;

        for (const [column, value] of [
            ['published_at', '2024-01-01 00:00:00'],
            ['published_at', '2023-02-29T00:00:00Z'],
            ['published_at', '2024-01-01T25:00:00Z'],
            ['published_on', '2023-02-29'],
            ['modified_at', '2024-01-01 00:00:00'],
            ['authorship_reviewed_at', '2024-01-01 00:00:00'],
            ['publication_reviewed_at', '2024-01-01 00:00:00']
        ]) {
            assert.throws(() => db.prepare(`UPDATE posts SET ${column} = ? WHERE id = ?`)
                .run(value, postId), /CHECK constraint/, `${column} rejects malformed values`);
        }
        assert.throws(() => PostPublication.setPublicationHistory(postId, {
            publishedOn: '2024-01-01'
        }), /unreviewed publication cannot have a publication value/);
        assert.throws(() => db.prepare(`
            UPDATE posts SET published_on = '2024-01-01' WHERE id = ?
        `).run(postId), /CHECK constraint/,
        'direct SQL cannot attach a publication value to unreviewed history');

        const exact = PostPublication.setPublicationHistory(postId, {
            publishedAt: '2024-01-01T00:00:00Z',
            state: 'verified', reviewedAt: '2026-09-21T16:10:00Z'
        });
        assert.equal(exact.published_at, '2024-01-01T00:00:00Z');
        const unknown = PostPublication.setPublicationHistory(postId, {
            state: 'reviewed_unavailable', reviewedAt: '2026-09-21T16:11:00Z'
        });
        assert.equal(unknown.published_at, null);
        assert.equal(unknown.published_on, null);
    } finally {
        db.close();
    }
});

test('foreign-key enforcement preserves supported legacy write behavior', (t) => {
    const db = initializeDatabase(join(fixture(t), 'foreign-key-writes.db'));
    setDatabase(db);
    try {
        assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
        const userId = db.prepare(`
            INSERT INTO users (username, password_hash) VALUES ('legacy-login', 'hash')
        `).run().lastInsertRowid;
        const postId = db.prepare(`
            INSERT INTO posts (title, slug, body, author_id)
            VALUES ('Legacy Writes', 'legacy-writes', 'Body', ?)
        `).run(userId).lastInsertRowid;
        const categoryId = Category.create('Legacy Category').lastInsertRowid;
        Post.addCategory(postId, categoryId);

        assert.equal(User.delete(userId).changes, 1);
        assert.equal(db.prepare('SELECT author_id FROM posts WHERE id = ?').get(postId).author_id,
            null, 'legacy login deletion still uses ON DELETE SET NULL');
        assert.equal(Category.delete(categoryId).changes, 1);
        assert.equal(db.prepare(`
            SELECT COUNT(*) AS count FROM post_categories WHERE post_id = ?
        `).get(postId).count, 0);
        assert.deepEqual(db.pragma('foreign_key_check'), []);
    } finally {
        db.close();
    }
});

test('Mode B editorial fixture is repeatable under authorship review guards', (t) => {
    const db = initializeDatabase(join(fixture(t), 'repeatable-fixture.db'));
    try {
        const sql = readFileSync(join(
            import.meta.dirname, '..', '..', 'tests', 'fixtures', 'local-test-seed.sql'), 'utf8');
        db.exec(sql);
        db.exec(sql);
        const post = db.prepare(`
            SELECT authorship_review_state, publication_review_state, published_on
            FROM posts WHERE slug = 'local-test-post'
        `).get();
        assert.deepEqual(post, {
            authorship_review_state: 'owner_attested',
            publication_review_state: 'owner_attested',
            published_on: '2026-01-08'
        });
        assert.deepEqual(db.prepare(`
            SELECT position FROM post_public_authors
            WHERE post_id = (SELECT id FROM posts WHERE slug = 'local-test-post')
            ORDER BY position
        `).all(), [{ position: 1 }, { position: 2 }]);
        assert.deepEqual(db.pragma('foreign_key_check'), []);
    } finally {
        db.close();
    }
});
