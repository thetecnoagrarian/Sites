import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { create } from 'express-handlebars';

import { initializeDatabase } from '../src/database/init.js';
import {
    Post,
    PostPublication,
    PublicPerson,
    setDatabase
} from '../src/models/index.js';
import { buildPublicByline } from '../src/utils/publicByline.js';

function setup(t) {
    const directory = mkdtempSync(join(tmpdir(), 'sites-public-byline-'));
    const db = initializeDatabase(join(directory, 'blog.db'));
    setDatabase(db);
    t.after(() => {
        setDatabase(null);
        db.close();
        rmSync(directory, { recursive: true, force: true });
    });
    const userId = Number(db.prepare(`
        INSERT INTO users (username, password_hash, role)
        VALUES ('legacy-login-name', 'synthetic', 'admin')
    `).run().lastInsertRowid);
    const createPost = (slug) => Number(db.prepare(`
        INSERT INTO posts (title, slug, body, author_id, created_at, updated_at)
        VALUES (?, ?, 'Body', ?, '2020-01-02', '2020-01-03 04:05:06')
    `).run(slug, slug, userId).lastInsertRowid);
    return { db, userId, createPost };
}

test('public byline formatter preserves order, grammar, links, and archived identity', () => {
    const one = buildPublicByline([
        { display_name: 'Alex', profile_url: '', is_active: 1, position: 1 }
    ]);
    assert.deepEqual(one.authors, [{
        displayName: 'Alex', profileUrl: null, isArchived: false, prefix: ''
    }]);

    const two = buildPublicByline([
        { display_name: 'Alex', profile_url: 'https://example.test/alex', is_active: 1, position: 1 },
        { display_name: 'Blair', profile_url: null, is_active: 0, position: 2 }
    ]);
    assert.deepEqual(two.authors.map(author => [author.prefix, author.displayName]),
        [['', 'Alex'], [' and ', 'Blair']]);
    assert.equal(two.authors[0].profileUrl, 'https://example.test/alex');
    assert.equal(two.authors[1].isArchived, true);

    const three = buildPublicByline([
        { display_name: 'Alex', profile_url: null, is_active: 1, position: 1 },
        { display_name: 'Blair', profile_url: 'https://example.test/blair', is_active: 1, position: 2 },
        { display_name: 'Casey', profile_url: null, is_active: 1, position: 3 }
    ]);
    assert.deepEqual(three.authors.map(author => `${author.prefix}${author.displayName}`),
        ['Alex', ', Blair', ', and Casey']);
    assert.equal(buildPublicByline([]), null);
    assert.equal(buildPublicByline(null), null);
    assert.equal(buildPublicByline([
        { display_name: 'Gap', profile_url: null, is_active: 1, position: 2 }
    ]), null);
    assert.equal(buildPublicByline([
        { display_name: 'Alex', profile_url: null, is_active: 1, position: 1 },
        { display_name: 'Blair', profile_url: null, is_active: 1, position: 1 }
    ]), null);

    const unsafeProfiles = buildPublicByline([
        { display_name: 'Script', profile_url: 'javascript:alert(1)', is_active: 1, position: 1 },
        { display_name: 'Data', profile_url: 'data:text/html,unsafe', is_active: 1, position: 2 },
        { display_name: 'Malformed', profile_url: 'https://[', is_active: 1, position: 3 }
    ]);
    assert.deepEqual(unsafeProfiles.authors.map(author => author.profileUrl), [null, null, null]);
});

test('reviewed author reads exclude unresolved states and retain archived authors', (t) => {
    const { db, userId, createPost } = setup(t);
    const alex = PublicPerson.create({
        publicKey: 'alex', displayName: 'Alex', profileUrl: 'https://example.test/alex'
    });
    const blair = PublicPerson.create({ publicKey: 'blair', displayName: 'Blair' });
    const casey = PublicPerson.create({ publicKey: 'casey', displayName: 'Casey' });
    const ownerPost = createPost('owner-post');
    const verifiedPost = createPost('verified-post');
    const unreviewedPost = createPost('unreviewed-post');
    const unavailablePost = createPost('unavailable-post');
    const legacyOnlyPost = createPost('legacy-only-post');

    PostPublication.replaceAuthors(ownerPost, [blair.id, alex.id]);
    PostPublication.setAuthorshipReview(ownerPost, {
        state: 'owner_attested', reviewedAt: '2026-09-25T07:34:42Z'
    });
    PostPublication.replaceAuthors(verifiedPost, [casey.id]);
    PostPublication.setAuthorshipReview(verifiedPost, {
        state: 'verified', reviewedAt: '2026-09-25T08:00:00Z'
    });
    PostPublication.replaceAuthors(unreviewedPost, [alex.id]);
    PostPublication.setAuthorshipReview(unavailablePost, {
        state: 'reviewed_unavailable', reviewedAt: '2026-09-25T08:01:00Z'
    });
    PublicPerson.archive(blair.id);

    const byPost = PostPublication.getReviewedAuthorsForPosts([
        ownerPost, verifiedPost, unreviewedPost, unavailablePost, legacyOnlyPost
    ]);
    assert.deepEqual(byPost.get(ownerPost).map(author => author.display_name), ['Blair', 'Alex']);
    assert.deepEqual(byPost.get(ownerPost).map(author => author.position), [1, 2]);
    assert.equal(byPost.get(ownerPost)[0].is_active, 0,
        'archived historical author remains readable');
    assert.deepEqual(byPost.get(verifiedPost).map(author => author.display_name), ['Casey']);
    assert.deepEqual(byPost.get(unreviewedPost), []);
    assert.deepEqual(byPost.get(unavailablePost), []);
    assert.deepEqual(byPost.get(legacyOnlyPost), []);
    assert.equal(Post.findById(legacyOnlyPost).author, 'legacy-login-name');
    assert.equal(Post.findById(legacyOnlyPost).author_id, userId);
    assert.equal(buildPublicByline(byPost.get(legacyOnlyPost)), null,
        'legacy username is never a public fallback');
    assert.equal(db.prepare('SELECT publication_review_state FROM posts WHERE id = ?')
        .get(ownerPost).publication_review_state, 'unreviewed');
    assert.ok(buildPublicByline(byPost.get(ownerPost)),
        'reviewed authorship renders independently of publication review');
});

test('missing and malformed reviewed assignments omit byline without crashing', (t) => {
    const { db, createPost } = setup(t);
    const person = PublicPerson.create({ publicKey: 'person', displayName: 'Person' });
    const malformedPost = createPost('malformed-position');
    db.prepare(`
        INSERT INTO post_public_authors (post_id, public_person_id, position)
        VALUES (?, ?, 2)
    `).run(malformedPost, person.id);
    PostPublication.setAuthorshipReview(malformedPost, {
        state: 'verified', reviewedAt: '2026-09-25T08:02:00Z'
    });
    assert.doesNotThrow(() => buildPublicByline(
        PostPublication.getReviewedAuthors(malformedPost)));
    assert.equal(buildPublicByline(PostPublication.getReviewedAuthors(malformedPost)), null);

    const missingPost = createPost('missing-assignment');
    db.exec('DROP TRIGGER posts_authorship_review_assignments_update');
    db.prepare(`
        UPDATE posts
        SET authorship_review_state = 'owner_attested',
            authorship_reviewed_at = '2026-09-25T08:03:00Z'
        WHERE id = ?
    `).run(missingPost);
    assert.deepEqual(PostPublication.getReviewedAuthors(missingPost), []);
    assert.equal(buildPublicByline(PostPublication.getReviewedAuthors(missingPost)), null);
});

test('both site partials escape names and links and public templates avoid legacy author fields', () => {
    const hbs = create();
    const viewModel = buildPublicByline([
        {
            display_name: '<Alex & Co>',
            profile_url: 'https://example.test/alex?a=1&b=2',
            is_active: 1,
            position: 1
        },
        { display_name: 'Blair', profile_url: null, is_active: 1, position: 2 }
    ]);

    for (const site of ['thetecnoagrarian', 'fruitionforestgarden']) {
        const views = join(import.meta.dirname, '..', '..', site, 'src', 'views');
        const partial = readFileSync(join(views, 'partials', 'public-byline.hbs'), 'utf8');
        const rendered = hbs.handlebars.compile(partial)({ publicByline: viewModel });
        assert.match(rendered, /By: <a href="https:\/\/example\.test\/alex\?a&#x3D;1&amp;b&#x3D;2">&lt;Alex &amp; Co&gt;<\/a> and Blair/);
        assert.doesNotMatch(rendered, /<Alex & Co>/);

        for (const template of ['home.hbs', join('posts', 'show.hbs')]) {
            const source = readFileSync(join(views, template), 'utf8');
            assert.match(source, /public-byline/);
            assert.doesNotMatch(source, /(?:this|post)\.author\b/);
            assert.doesNotMatch(source, /application\/ld\+json/i);
        }
        for (const template of ['search.hbs', 'category.hbs']) {
            assert.doesNotMatch(readFileSync(join(views, template), 'utf8'), /By:/);
        }

        const home = readFileSync(join(views, 'home.hbs'), 'utf8');
        assert.match(home, /slot="image" class="card-link post-image-link"/);
        assert.match(home, /class="card-link post-summary-link"/);
        assert.doesNotMatch(home, /<a[^>]*class="card-link"[^>]*>\s*<sl-card>/);
    }
});
