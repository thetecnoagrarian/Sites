import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/database/init.js';
import { createMigrationRunner } from '../src/database/migrations.js';
import { setDatabase, PublicPerson, PostPublication } from '../src/models/index.js';
import { createEditorialService } from '../src/models/editorial-service.js';
import { parseOrderedAuthors, removeUnreferencedMedia } from '../src/admin/editorial-router.js';

function setup(t, variant = 'fresh') {
    const directory = mkdtempSync(join(tmpdir(), 'sites-editorial-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const databasePath = join(directory, 'blog.db');
    if (variant !== 'fresh') {
        const db = new Database(databasePath);
        db.exec(readFileSync(join(import.meta.dirname, 'fixtures',
            variant === 'tta' ? 'tta-legacy-schema.sql' : 'ffg-legacy-schema.sql'), 'utf8'));
        db.close();
        createMigrationRunner().apply(databasePath);
    }
    const db = initializeDatabase(databasePath);
    setDatabase(db);
    t.after(() => db.close());
    const loginUserId = Number(db.prepare(`
        INSERT INTO users (username, password_hash, role)
        VALUES ('private-editor', 'synthetic', 'admin')
    `).run().lastInsertRowid);
    const categoryId = Number(db.prepare(`
        INSERT INTO categories (name, slug) VALUES ('Synthetic', 'synthetic')
    `).run().lastInsertRowid);
    const alice = PublicPerson.create({ publicKey: 'alice', displayName: 'Alice' });
    const bob = PublicPerson.create({ publicKey: 'bob', displayName: 'Bob' });
    const publisher = PublicPerson.create({ publicKey: 'publisher', displayName: 'Publisher Only' });
    let clockIndex = 0;
    const ticks = ['2026-09-21T10:00:00.000Z', '2026-09-22T10:00:00.000Z',
        '2026-09-23T10:00:00.000Z', '2026-09-24T10:00:00.000Z'];
    const service = createEditorialService({ now: () => ticks[Math.min(clockIndex++, 3)] });
    const input = (overrides = {}) => ({
        content: { title: 'Synthetic New Post', body: 'Body', description: 'Description',
            excerpt: 'Excerpt', images: [], captions: [], created_at: '2020-01-02' },
        categoryIds: [categoryId], authorIds: [alice.id, bob.id],
        publisherId: publisher.id, loginUserId, ...overrides
    });
    return { db, directory, service, input, loginUserId, categoryId, alice, bob, publisher };
}

test('ordered author rows reject duplicate, gap, and invalid positions without JavaScript', () => {
    assert.deepEqual(parseOrderedAuthors({ 'authorIds[]': ['2', '1', ''],
        'authorPositions[]': ['2', '1', '3'] }), [1, 2]);
    assert.throws(() => parseOrderedAuthors({ 'authorIds[]': ['1', '2'],
        'authorPositions[]': ['1', '1'] }), /Duplicate author position/);
    assert.throws(() => parseOrderedAuthors({ 'authorIds[]': ['1', '2'],
        'authorPositions[]': ['1', '3'] }), /consecutive/);
    assert.throws(() => parseOrderedAuthors({ 'authorIds[]': ['1'],
        'authorPositions[]': [] }), /incomplete/);
});

test('Public Person profile and archive lifecycle remains separate from login users', (t) => {
    const { db, alice } = setup(t);
    assert.equal(PublicPerson.updateProfile(alice.id, {
        displayName: 'Alice Writer', profileUrl: 'https://example.test/alice'
    }).display_name, 'Alice Writer');
    assert.throws(() => PublicPerson.updateProfile(alice.id, {
        displayName: '', profileUrl: 'javascript:bad'
    }), /displayName/);
    assert.throws(() => PublicPerson.updateProfile(alice.id, {
        displayName: 'Alice', profileUrl: 'javascript:bad'
    }), /profileUrl/);
    assert.equal(PublicPerson.archive(alice.id), true);
    assert.equal(PublicPerson.list().some(person => person.id === alice.id), false);
    assert.equal(PublicPerson.list({ includeArchived: true }).some(person => person.id === alice.id), true);
    assert.equal(PublicPerson.unarchive(alice.id), true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
});

for (const variant of ['fresh', 'tta', 'ffg']) {
    test(`${variant} workflow creates explicit ordered authors, publisher, and first publication`, (t) => {
        const { db, service, input, loginUserId, alice, bob, publisher } = setup(t, variant);
        const id = service.create(input());
        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
        const facts = PostPublication.getPostFacts(id);
        assert.equal(post.author_id, loginUserId);
        assert.equal(post.created_at, '2020-01-02');
        assert.equal(post.published_at, '2026-09-21T10:00:00.000Z');
        assert.equal(post.publication_review_state, 'verified');
        assert.equal(post.publication_reviewed_at, post.published_at);
        assert.equal(post.modified_at, null);
        assert.equal(post.authorship_review_state, 'unreviewed');
        assert.equal(post.publisher_public_person_id, publisher.id);
        assert.deepEqual(facts.authors.map(person => [person.id, person.position]),
            [[alice.id, 1], [bob.id, 2]]);
        assert.deepEqual(db.pragma('foreign_key_check'), []);
        assert.equal(db.pragma('integrity_check')[0].integrity_check, 'ok');
        assert.equal(db.prepare('SELECT variant FROM schema_baseline').get().variant,
            variant === 'fresh' ? 'canonical_0000' : `${variant}_legacy_production`);
    });
}

test('invalid new-post identities and categories cannot leave partial rows', (t) => {
    const { db, service, input, alice, publisher } = setup(t);
    const initial = db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
    assert.throws(() => service.create(input({ authorIds: [] })), /At least one/);
    assert.throws(() => service.create(input({ authorIds: [alice.id, alice.id] })), /Duplicate/);
    assert.throws(() => service.create(input({ categoryIds: [999] })), /does not exist/);
    assert.throws(() => service.create(input({ publisherId: null })), /positive integer/);
    assert.throws(() => service.create(input({ publisherId: [publisher.id] })), /positive integer/);
    PublicPerson.archive(publisher.id);
    assert.throws(() => service.create(input()), /archived/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, initial);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM post_categories').get().n, 0);
});

test('historical editing preserves unknown facts until deliberate independent review', (t) => {
    const { db, service, input, alice, publisher, categoryId, loginUserId } = setup(t);
    const id = Number(db.prepare(`
        INSERT INTO posts (title, slug, body, author_id, created_at)
        VALUES ('Historical', 'historical', 'Before', ?, '2018-05-06 12:00:00')
    `).run(loginUserId).lastInsertRowid);
    let snapshot = service.snapshot(id);
    const body = input({ content: { ...input().content,
        title: 'Historical', body: 'After', created_at: '2018-05-06' },
        authorIds: [], publisherId: null, categoryIds: [],
        revisionToken: snapshot.revisionToken });
    service.update(id, body);
    let facts = PostPublication.getPostFacts(id);
    assert.equal(facts.published_at, null);
    assert.equal(facts.publisher_public_person_id, null);
    assert.deepEqual(facts.authors, []);
    assert.equal(db.prepare('SELECT created_at FROM posts WHERE id = ?').get(id).created_at,
        '2018-05-06 12:00:00');
    snapshot = service.snapshot(id);
    service.update(id, { ...body, revisionToken: snapshot.revisionToken,
        authorIds: [alice.id], categoryIds: [categoryId],
        authorshipAction: 'replace', authorshipReviewState: 'owner_attested',
        authorshipReviewNote: 'Owner identified author',
        publisherAction: 'set', publisherId: publisher.id,
        publicationAction: 'review', publicationReviewState: 'owner_attested',
        publicationPrecision: 'date', publishedOn: '2018-06-01',
        publicationReviewNote: 'Owner publication record' });
    facts = PostPublication.getPostFacts(id);
    assert.equal(facts.authorship_review_state, 'owner_attested');
    assert.equal(facts.publication_review_state, 'owner_attested');
    assert.equal(facts.published_on, '2018-06-01');
    assert.equal(facts.published_at, null);
    assert.equal(facts.authorship_review_note, 'Owner identified author');
    assert.equal(facts.publication_review_note, 'Owner publication record');
});

test('review reset, archive preservation, and rollback of late failures are atomic', (t) => {
    const { db, service, input, alice, bob, publisher } = setup(t);
    const id = service.create(input());
    let snapshot = service.snapshot(id);
    service.update(id, { ...input(), revisionToken: snapshot.revisionToken,
        authorshipAction: 'review', authorshipReviewState: 'verified' });
    PublicPerson.archive(alice.id);
    snapshot = service.snapshot(id);
    const original = JSON.stringify({ post: db.prepare('SELECT * FROM posts WHERE id = ?').get(id),
        authors: PostPublication.getAuthors(id), categories: snapshot.categories });
    const proposed = { ...input({ content: { ...input().content, body: 'Changed' },
        authorIds: [bob.id, alice.id] }), revisionToken: snapshot.revisionToken,
        authorshipAction: 'replace', authorshipReviewState: 'verified' };
    assert.throws(() => service.update(id, proposed), /Reset authorship review/);
    assert.equal(JSON.stringify({ post: db.prepare('SELECT * FROM posts WHERE id = ?').get(id),
        authors: PostPublication.getAuthors(id), categories: service.snapshot(id).categories }), original);
    assert.throws(() => service.update(id, { ...proposed, authorshipAction: 'reopen',
        publisherAction: 'set', publisherId: 999 }), /does not exist/);
    assert.equal(service.snapshot(id).facts.authorship_review_state, 'verified');
    assert.deepEqual(service.snapshot(id).authors, [alice.id, bob.id]);
    service.update(id, { ...proposed, authorshipAction: 'reopen' });
    assert.deepEqual(PostPublication.getAuthors(id).map(person => person.id), [bob.id, alice.id]);
    assert.equal(service.snapshot(id).facts.authorship_review_state, 'verified');
    assert.throws(() => db.prepare('DELETE FROM public_people WHERE id = ?').run(alice.id),
        /FOREIGN KEY/);
    assert.equal(PostPublication.getPostFacts(id).publisher_public_person_id, publisher.id);
});

test('modified_at changes only with public facts; publication time survives edits and overwrite', (t) => {
    const { db, service, input, alice, bob, publisher } = setup(t);
    const id = service.create(input());
    const firstPublication = db.prepare('SELECT published_at FROM posts WHERE id = ?').get(id).published_at;
    let snapshot = service.snapshot(id);
    service.update(id, { ...input(), revisionToken: snapshot.revisionToken });
    assert.equal(PostPublication.getPostFacts(id).modified_at, null);
    snapshot = service.snapshot(id);
    service.update(id, { ...input(), revisionToken: snapshot.revisionToken,
        authorshipAction: 'review', authorshipReviewState: 'verified',
        authorshipReviewNote: 'Evidence note' });
    assert.equal(PostPublication.getPostFacts(id).modified_at, null);
    snapshot = service.snapshot(id);
    service.update(id, { ...input(), revisionToken: snapshot.revisionToken,
        authorshipAction: 'review', authorshipReviewState: 'verified',
        authorshipReviewNote: 'Revised evidence note' });
    assert.equal(PostPublication.getPostFacts(id).modified_at, null);
    snapshot = service.snapshot(id);
    service.update(id, { ...input({ content: { ...input().content, title: 'New Title' } }),
        revisionToken: snapshot.revisionToken });
    const modified = PostPublication.getPostFacts(id).modified_at;
    assert.ok(modified);
    snapshot = service.snapshot(id);
    assert.throws(() => service.update(id, { ...input(), revisionToken: 'stale' }), /changed/);
    service.update(id, { ...input({ content: { ...input().content, title: 'New Title', body: 'Body changed' } }),
        revisionToken: snapshot.revisionToken });
    assert.ok(PostPublication.getPostFacts(id).modified_at > modified);
    snapshot = service.snapshot(id);
    assert.throws(() => service.overwrite(id, input({ content: { ...input().content,
        title: 'New Title', body: 'Overwrite' }, authorIds: [bob.id, alice.id] }),
    { revisionToken: snapshot.revisionToken }), /reopen reviewed authorship/);
    service.overwrite(id, input({ content: { ...input().content,
        title: 'New Title', body: 'Overwrite' }, authorIds: [bob.id, alice.id],
        publisherId: publisher.id }),
    { revisionToken: snapshot.revisionToken, reopenAuthorship: true });
    assert.equal(db.prepare('SELECT published_at FROM posts WHERE id = ?').get(id).published_at,
        firstPublication);
    assert.equal(PostPublication.getPostFacts(id).authorship_review_state, 'unreviewed');
});

test('publication review accepts timezone exact and reviewed unavailable, rejects contradictions', (t) => {
    const { service, input } = setup(t);
    const id = service.create(input());
    let snapshot = service.snapshot(id);
    service.update(id, { ...input(), revisionToken: snapshot.revisionToken,
        publicationAction: 'review', publicationReviewState: 'verified',
        publicationPrecision: 'exact', publishedAt: '2020-04-03T10:15:00-04:00',
        publicationReviewNote: 'Dated publishing log' });
    assert.equal(PostPublication.getPostFacts(id).published_at, '2020-04-03T10:15:00-04:00');
    snapshot = service.snapshot(id);
    assert.throws(() => service.update(id, { ...input(), revisionToken: snapshot.revisionToken,
        publicationAction: 'review', publicationReviewState: 'verified',
        publicationPrecision: 'exact', publishedAt: '2020-04-03T10:15:00',
        publishedOn: '2020-04-03' }), /conflicts/);
    assert.throws(() => service.update(id, { ...input(), revisionToken: snapshot.revisionToken,
        publicationAction: 'review', publicationReviewState: 'verified',
        publicationPrecision: 'exact', publishedAt: '2020-04-03T10:15:00' }), /timezone/);
    service.update(id, { ...input(), revisionToken: snapshot.revisionToken,
        publicationAction: 'review', publicationReviewState: 'reviewed_unavailable',
        publicationPrecision: 'unknown', publicationReviewNote: 'Records unavailable' });
    assert.equal(PostPublication.getPostFacts(id).published_at, null);
    assert.equal(PostPublication.getPostFacts(id).publication_review_state, 'reviewed_unavailable');
});

for (const field of ['description', 'excerpt', 'created_at', 'images',
    'captions', 'categories', 'authors', 'publisher', 'publication']) {
    test(`${field} public fact change advances meaningful modified_at`, (t) => {
        const { db, service, input, alice, bob } = setup(t);
        const id = service.create(input());
        const base = input();
        const change = { ...base, revisionToken: service.snapshot(id).revisionToken };
        if (field === 'description') change.content = { ...base.content, description: 'Changed' };
        if (field === 'excerpt') change.content = { ...base.content, excerpt: 'Changed' };
        if (field === 'created_at') change.content = { ...base.content, created_at: '2020-01-03' };
        if (field === 'images') change.content = { ...base.content,
            images: [{ thumbnail: '/uploads/synthetic-thumbnail.webp' }], captions: [''] };
        if (field === 'captions') {
            db.prepare('UPDATE posts SET images = ?, captions = ? WHERE id = ?')
                .run('[{"thumbnail":"/uploads/synthetic-thumbnail.webp"}]', '[""]', id);
            change.revisionToken = service.snapshot(id).revisionToken;
            change.content = { ...base.content,
                images: [{ thumbnail: '/uploads/synthetic-thumbnail.webp' }], captions: ['Changed'] };
        }
        if (field === 'categories') change.categoryIds = [];
        if (field === 'authors') {
            change.authorIds = [bob.id, alice.id];
            change.authorshipAction = 'replace';
        }
        if (field === 'publisher') {
            change.publisherId = bob.id;
            change.publisherAction = 'set';
        }
        if (field === 'publication') {
            change.publicationAction = 'review';
            change.publicationReviewState = 'verified';
            change.publicationPrecision = 'date';
            change.publishedOn = '2026-09-21';
        }
        service.update(id, change);
        assert.equal(PostPublication.getPostFacts(id).modified_at, '2026-09-22T10:00:00.000Z');
    });
}

test('review-only and publication evidence-only changes leave modified_at null', (t) => {
    const { service, input } = setup(t);
    const id = service.create(input());
    let snapshot = service.snapshot(id);
    service.update(id, { ...input(), revisionToken: snapshot.revisionToken,
        publicationAction: 'review', publicationReviewState: 'verified',
        publicationPrecision: 'exact', publishedAt: snapshot.facts.published_at,
        publicationReviewNote: 'Same observed event, new evidence' });
    assert.equal(PostPublication.getPostFacts(id).modified_at, null);
    snapshot = service.snapshot(id);
    service.update(id, { ...input(), revisionToken: snapshot.revisionToken,
        publicationAction: 'review', publicationReviewState: 'verified',
        publicationPrecision: 'exact', publishedAt: snapshot.facts.published_at,
        publicationReviewNote: 'Corrected note' });
    assert.equal(PostPublication.getPostFacts(id).modified_at, null);
});

test('late review failure rolls back changed post content and categories', (t) => {
    const { db, service, input, categoryId } = setup(t);
    const id = service.create(input());
    const before = service.snapshot(id);
    assert.throws(() => service.update(id, { ...input({
        content: { ...input().content, body: 'Must roll back' }, categoryIds: []
    }), revisionToken: before.revisionToken,
    publicationAction: 'review', publicationReviewState: 'reviewed_unavailable',
    publicationPrecision: 'date', publishedOn: '2020-01-02' }), /cannot have a publication value/);
    assert.equal(db.prepare('SELECT body FROM posts WHERE id = ?').get(id).body, 'Body');
    assert.deepEqual(service.snapshot(id).categories, [categoryId]);
    assert.equal(service.snapshot(id).revisionToken, before.revisionToken);
});

test('historical reviewed-unavailable authorship can be recorded without inventing an author', (t) => {
    const { db, service, input, loginUserId } = setup(t);
    const id = Number(db.prepare(`
        INSERT INTO posts (title, slug, body, author_id, created_at)
        VALUES ('Unknown Author', 'unknown-author', 'Body', ?, '2019-01-01')
    `).run(loginUserId).lastInsertRowid);
    const snapshot = service.snapshot(id);
    service.update(id, { ...input({ content: { ...input().content,
        title: 'Unknown Author', description: '', excerpt: '', created_at: '2019-01-01' },
        authorIds: [], categoryIds: [], publisherId: null }),
        revisionToken: snapshot.revisionToken,
        authorshipAction: 'review', authorshipReviewState: 'reviewed_unavailable',
        authorshipReviewNote: 'No reliable byline evidence' });
    const facts = PostPublication.getPostFacts(id);
    assert.deepEqual(facts.authors, []);
    assert.equal(facts.authorship_review_state, 'reviewed_unavailable');
    assert.equal(facts.published_at, null);
    assert.equal(facts.modified_at, null);
});

test('pending overwrite rechecks revision and newly archived author at confirmation', (t) => {
    const { db, service, input, alice, bob } = setup(t);
    const id = service.create(input({ authorIds: [alice.id] }));
    const pending = input({ authorIds: [bob.id] });
    const token = service.snapshot(id).revisionToken;
    PublicPerson.archive(bob.id);
    assert.throws(() => service.overwrite(id, pending, { revisionToken: token }), /archived/);
    assert.deepEqual(service.snapshot(id).authors, [alice.id]);
    PublicPerson.unarchive(bob.id);
    db.prepare('UPDATE posts SET description = ? WHERE id = ?').run('Concurrent edit', id);
    assert.throws(() => service.overwrite(id, pending, { revisionToken: token }), /changed/);
    assert.deepEqual(service.snapshot(id).authors, [alice.id]);
});

test('archived publisher may be retained but cannot be newly assigned', (t) => {
    const { service, input, publisher } = setup(t);
    const id = service.create(input());
    PublicPerson.archive(publisher.id);
    let token = service.snapshot(id).revisionToken;
    service.update(id, input({ revisionToken: token,
        publisherAction: 'set', publisherId: publisher.id }));
    token = service.snapshot(id).revisionToken;
    service.overwrite(id, input({ publisherId: publisher.id }), { revisionToken: token });
    assert.equal(PostPublication.getPostFacts(id).publisher_public_person_id, publisher.id);

    const newlyArchived = PublicPerson.create({ publicKey: 'archived-new',
        displayName: 'Archived New' });
    PublicPerson.archive(newlyArchived.id);
    token = service.snapshot(id).revisionToken;
    assert.throws(() => service.update(id, input({ revisionToken: token,
        publisherAction: 'set', publisherId: newlyArchived.id })), /archived/);
    assert.equal(PostPublication.getPostFacts(id).publisher_public_person_id, publisher.id);
});

test('ordinary edit rejects a real stale snapshot inside its write transaction', (t) => {
    const { db, service, input } = setup(t);
    const id = service.create(input());
    const stale = service.snapshot(id).revisionToken;
    service.update(id, input({ content: { ...input().content, body: 'Current body' },
        revisionToken: stale }));
    assert.throws(() => service.update(id, input({
        content: { ...input().content, body: 'Stale body' }, revisionToken: stale
    })), /changed after the form was opened/);
    assert.equal(db.prepare('SELECT body FROM posts WHERE id = ?').get(id).body, 'Current body');
});

test('replaced media cleanup retains files referenced by any post', async (t) => {
    const { db, directory, service, input } = setup(t);
    const mediaUrl = '/uploads/shared-thumbnail.webp';
    const image = { thumbnail: mediaUrl };
    const first = service.create(input({ content: { ...input().content,
        images: [image], captions: [''] } }));
    const second = service.create(input({ content: { ...input().content,
        title: 'Second Post', images: [image], captions: [''] } }));
    const file = join(directory, 'shared-thumbnail.webp');
    writeFileSync(file, 'synthetic media');

    db.prepare('UPDATE posts SET images = ? WHERE id = ?').run('[]', first);
    await removeUnreferencedMedia([image], directory);
    assert.equal(existsSync(file), true, 'another post still references the media');

    db.prepare('UPDATE posts SET images = ? WHERE id = ?').run('[]', second);
    await removeUnreferencedMedia([image], directory);
    assert.equal(existsSync(file), false, 'unreferenced replaced media is removed');
});
