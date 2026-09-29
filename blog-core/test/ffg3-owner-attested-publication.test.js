import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

import {
    applyFfg3OwnerAttestedPublication,
    dryRunFfg3OwnerAttestedPublication,
    ffg3OwnerAttestedPublicationPolicy
} from '../src/database/ffg3-owner-attested-publication.js';
import {
    applyHistoricalAuthorshipBackfill,
    historicalAuthorshipBackfillPolicy
} from '../src/database/historical-authorship-backfill.js';
import { createMigrationRunner } from '../src/database/migrations.js';

const reviewedAt = '2026-09-29T18:30:00Z';
const authorshipReviewedAt = '2026-09-25T07:45:03Z';
const manifestPath = join(import.meta.dirname, '..', 'src', 'database', 'manifests',
    'historical-authorship-owner-attestation-v1.json');
const cliPath = join(import.meta.dirname, '..', 'src', 'database',
    'ffg3-owner-attested-publication-cli.js');

function fixture(t) {
    const directory = mkdtempSync(join(import.meta.dirname, '.ffg3-publication-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const databasePath = join(directory, 'blog.db');
    const db = new Database(databasePath);
    db.exec(readFileSync(join(import.meta.dirname, 'fixtures', 'ffg-legacy-schema.sql'), 'utf8'));
    const userId = Number(db.prepare(`
        INSERT INTO users (username, password_hash, role, isAdmin, created_at, updated_at)
        VALUES ('legacy-login', 'synthetic', 'admin', 1, '2020-01-01', '2020-01-02')
    `).run().lastInsertRowid);
    const insert = db.prepare(`
        INSERT INTO posts
            (id, title, slug, body, description, excerpt, images, captions,
             author_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [id, slug] of historicalAuthorshipBackfillPolicy.ffg.posts) {
        insert.run(id,
            id === 3 ? ffg3OwnerAttestedPublicationPolicy.title : `Historical ${id}`,
            slug, `Body ${id}`, `Description ${id}`, `Excerpt ${id}`,
            `["/uploads/${id}.webp"]`, `["Caption ${id}"]`, userId,
            id === 3 ? '2022-07-18' : `2020-02-${String((id % 20) + 1).padStart(2, '0')} 01:02:03`,
            id === 3 ? '2024-11-03 12:34:56' : `2020-03-${String((id % 20) + 1).padStart(2, '0')} 04:05:06`);
    }
    const categoryId = Number(db.prepare(`
        INSERT INTO categories (name, slug) VALUES ('Historical', 'historical')
    `).run().lastInsertRowid);
    db.prepare('INSERT INTO post_categories (post_id, category_id) VALUES (3, ?)').run(categoryId);
    db.close();
    createMigrationRunner().apply(databasePath);
    const migrated = new Database(databasePath);
    migrated.prepare(`
        INSERT INTO public_people (public_key, display_name, is_active)
        VALUES ('mdc', 'MDC', 1)
    `).run();
    migrated.close();
    applyHistoricalAuthorshipBackfill({
        manifestPath, databasePath, site: 'ffg', reviewedAt: authorshipReviewedAt
    });
    return databasePath;
}

function state(databasePath) {
    const db = new Database(databasePath, { readonly: true });
    try {
        return {
            posts: db.prepare('SELECT * FROM posts ORDER BY id').all(),
            authors: db.prepare('SELECT * FROM post_public_authors ORDER BY post_id, position').all(),
            categories: db.prepare('SELECT * FROM post_categories ORDER BY post_id, category_id').all(),
            trigger: db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'posts_updated_at'").get().sql
        };
    } finally {
        db.close();
    }
}

function digest(databasePath) {
    return createHash('sha256').update(readFileSync(databasePath)).digest('hex');
}

test('dry run is byte-stable and identifies the exact ready FFG post', (t) => {
    const databasePath = fixture(t);
    const before = digest(databasePath);
    const result = dryRunFfg3OwnerAttestedPublication({ databasePath });
    assert.equal(result.status, 'ready');
    assert.equal(result.postId, 3);
    assert.equal(result.slug, ffg3OwnerAttestedPublicationPolicy.slug);
    assert.equal(result.eventDate, '2022-07-18');
    assert.equal(result.updatedAt, '2024-11-03 12:34:56');
    assert.deepEqual(result.authors.map(author => [author.public_key, author.position]), [['mdc', 1]]);
    assert.equal(digest(databasePath), before);
});

test('CLI defaults to dry run and refuses incomplete apply authorization', (t) => {
    const databasePath = fixture(t);
    const before = digest(databasePath);
    const dryRun = spawnSync(process.execPath, [cliPath,
        '--database', databasePath, '--site', 'ffg'], { encoding: 'utf8' });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /DRY RUN PASS — NO CHANGES MADE/);
    assert.equal(digest(databasePath), before);
    const incomplete = spawnSync(process.execPath, [cliPath,
        '--database', databasePath, '--site', 'ffg', '--apply'], { encoding: 'utf8' });
    assert.equal(incomplete.status, 1);
    assert.match(incomplete.stderr, /--apply requires --reviewed-at/);
    assert.match(incomplete.stderr, /APPLY BLOCKED — NO CHANGES MADE/);
    assert.equal(digest(databasePath), before);
});

test('apply records only the owner-attested date and preserves every other row fact', (t) => {
    const databasePath = fixture(t);
    const before = state(databasePath);
    const result = applyFfg3OwnerAttestedPublication({ databasePath, reviewedAt });
    assert.equal(result.status, 'applied');
    assert.equal(result.postsChanged, 1);
    assert.equal(result.transactionCommitted, true);
    const after = state(databasePath);
    assert.deepEqual(after.authors, before.authors);
    assert.deepEqual(after.categories, before.categories);
    assert.equal(after.trigger, before.trigger);
    for (let index = 0; index < before.posts.length; index += 1) {
        const original = before.posts[index];
        const changed = after.posts[index];
        if (original.id !== 3) {
            assert.deepEqual(changed, original, `post ${original.id} changed`);
            continue;
        }
        for (const field of Object.keys(original)) {
            if (field === 'published_on') assert.equal(changed[field], '2024-09-22');
            else if (field === 'publication_review_state') assert.equal(changed[field], 'owner_attested');
            else if (field === 'publication_reviewed_at') assert.equal(changed[field], reviewedAt);
            else if (field === 'publication_review_note') {
                assert.equal(changed[field], ffg3OwnerAttestedPublicationPolicy.reviewNote);
            } else assert.deepEqual(changed[field], original[field], `post 3 ${field}`);
        }
    }
    const db = new Database(databasePath, { readonly: true });
    try {
        assert.deepEqual(db.pragma('foreign_key_check'), []);
        assert.equal(db.pragma('integrity_check')[0].integrity_check, 'ok');
        assert.deepEqual(createMigrationRunner().inspect(databasePath).applied,
            ['0000_existing_schema', '0001_public_author_publication_model']);
    } finally {
        db.close();
    }
});

test('an exact repeat is a no-op and preserves the first controlled review time', (t) => {
    const databasePath = fixture(t);
    applyFfg3OwnerAttestedPublication({ databasePath, reviewedAt });
    const before = digest(databasePath);
    const repeat = applyFfg3OwnerAttestedPublication({
        databasePath, reviewedAt: '2026-09-29T19:00:00Z'
    });
    assert.equal(repeat.status, 'already-applied');
    assert.equal(repeat.reviewedAt, reviewedAt);
    assert.equal(repeat.transactionCommitted, false);
    assert.equal(digest(databasePath), before);
});

test('unexpected publication or identity state blocks before mutation', (t) => {
    for (const sql of [
        "UPDATE posts SET published_on = '2024-09-21', publication_review_state = 'owner_attested', publication_reviewed_at = '2026-09-29T18:00:00Z' WHERE id = 3",
        "UPDATE posts SET slug = 'changed' WHERE id = 3",
        "UPDATE posts SET modified_at = '2026-09-29T18:00:00Z' WHERE id = 3"
    ]) {
        const databasePath = fixture(t);
        const db = new Database(databasePath);
        db.exec(sql);
        db.close();
        const before = digest(databasePath);
        assert.throws(() => applyFfg3OwnerAttestedPublication({ databasePath, reviewedAt }),
            /blocked|expected|must be null/);
        assert.equal(digest(databasePath), before);
    }
});

test('a failure after the guarded update rolls back data and exact trigger SQL', (t) => {
    const databasePath = fixture(t);
    const before = state(databasePath);
    assert.throws(() => applyFfg3OwnerAttestedPublication({
        databasePath,
        reviewedAt,
        _testFault: ({ event }) => {
            if (event === 'after-update') throw new Error('synthetic publication failure');
        }
    }), /synthetic publication failure/);
    assert.deepEqual(state(databasePath), before);
    assert.equal(dryRunFfg3OwnerAttestedPublication({ databasePath }).status, 'ready');
});
