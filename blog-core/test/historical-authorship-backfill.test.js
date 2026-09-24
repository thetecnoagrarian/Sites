import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    mkdtempSync, readFileSync, rmSync, writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

import {
    applyHistoricalAuthorshipBackfill,
    calculateHistoricalAuthorshipManifestDigest,
    dryRunHistoricalAuthorshipBackfill,
    historicalAuthorshipBackfillPolicy,
    loadHistoricalAuthorshipManifest
} from '../src/database/historical-authorship-backfill.js';
import { createMigrationRunner } from '../src/database/migrations.js';

const manifestPath = join(import.meta.dirname, '..', 'src', 'database', 'manifests',
    'historical-authorship-owner-attestation-v1.json');
const reviewedAt = '2026-09-24T12:34:56.000Z';
const cliPath = join(import.meta.dirname, '..', 'src', 'database',
    'historical-authorship-backfill-cli.js');

const approvedCorpus = Object.freeze({
    tta: [
        [4, 'the-rebuild-you-cant-see-or-whats-new-under-the-hood'],
        [5, 'launching-the-tecnoagrarian-or-rebuilding-the-stack'],
        [6, 'self-custody-as-regenerative-practice'],
        [7, 'why-bitcoin-makes-sense-to-me'],
        [8, 'using-chatgpt-to-create-a-custom-curriculum'],
        [9, 'what-a-rabbit-hutch-taught-me-about-using-ai-for-design']
    ],
    ffg: [
        [2, 'relocating-and-upgrading-our-off-grid-cabin'],
        [3, 'from-oregon-to-michigan-a-cross-country-camper-adventure'],
        [4, 'bear-tracks-and-nose-print-at-our-campsite'],
        [5, 'raising-chickens-again-in-cornell-michigan'],
        [6, 'portable-power-to-off-grid-solar'],
        [7, 'chatgpt-and-my-blog-development-journey'],
        [8, 'caring-for-lupe-one-day-at-a-time'],
        [9, 'lupes-story-honoring-her-life-and-the-cats-who-came-before'],
        [10, 'two-homesteads-or-lessons-from-cascade-rainforest-to-the-ups-banana-belt'],
        [11, 'lessons-from-the-land-a-three-year-homestead-qanda'],
        [12, 'inside-our-cabin-power-system-a-complete-look-at-our-off-grid-solar-and-battery-bank'],
        [18, 'the-rebuild-you-cant-see-or-whats-new-under-the-hood'],
        [19, 'kittens-growing-up-fast-in-a-small-space'],
        [20, 'self-custody-as-regenerative-practice'],
        [21, 'naming-animals-doesnt-make-harvest-harder-for-us'],
        [22, 'the-march-26-blizzard-on-the-homestead'],
        [23, 'turning-drone-photos-into-a-working-land-design-map'],
        [24, 'first-trees-make-the-place-feel-like-home'],
        [25, 'how-i-used-ai-to-plan-a-rabbit-hutch-build'],
        [27, 'rabbits-are-the-foundation-for-raising-animals-again']
    ]
});

function fixture(t, site = 'tta') {
    const directory = mkdtempSync(join(import.meta.dirname, `.historical-authorship-${site}-`));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const databasePath = join(directory, 'blog.db');
    const db = new Database(databasePath);
    db.exec(readFileSync(join(import.meta.dirname, 'fixtures',
        site === 'tta' ? 'tta-legacy-schema.sql' : 'ffg-legacy-schema.sql'), 'utf8'));
    const userId = Number(db.prepare(`
        INSERT INTO users (username, password_hash, role, isAdmin, created_at, updated_at)
        VALUES ('legacy-login', 'synthetic', 'admin', 1, '2020-01-01', '2020-01-02')
    `).run().lastInsertRowid);
    const insertPost = db.prepare(`
        INSERT INTO posts
            (id, title, slug, body, description, excerpt, images, captions,
             author_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [id, slug] of approvedCorpus[site]) {
        insertPost.run(id, `Historical ${id}`, slug, `Body ${id}`, `Description ${id}`,
            `Excerpt ${id}`, `["/uploads/${id}.webp"]`, `["Caption ${id}"]`, userId,
            `2020-02-${String((id % 20) + 1).padStart(2, '0')} 01:02:03`,
            `2020-03-${String((id % 20) + 1).padStart(2, '0')} 04:05:06`);
    }
    const categoryId = Number(db.prepare(`
        INSERT INTO categories (name, slug) VALUES ('Historical', 'historical')
    `).run().lastInsertRowid);
    db.prepare('INSERT INTO post_categories (post_id, category_id) VALUES (?, ?)')
        .run(approvedCorpus[site][0][0], categoryId);
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`)
        .run('preserved-session', '{"synthetic":true}', '2099-01-01T00:00:00.000Z');
    db.exec(`CREATE TABLE page_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_path TEXT NOT NULL
    )`);
    db.prepare('INSERT INTO page_views (page_path) VALUES (?)').run('/preserved');
    db.close();
    createMigrationRunner().apply(databasePath);
    const migrated = new Database(databasePath);
    migrated.pragma('foreign_keys = ON');
    migrated.prepare(`
        INSERT INTO public_people (public_key, display_name, is_active)
        VALUES ('mdc', 'MDC', 1)
    `).run();
    migrated.close();
    return { directory, databasePath, site };
}

function fileDigest(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function databaseState(path) {
    const db = new Database(path, { readonly: true });
    try {
        const tables = db.prepare(`
            SELECT name FROM sqlite_schema
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `).all().map(row => row.name);
        return {
            tables: Object.fromEntries(tables.map(name => [name,
                db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()])),
            schema: db.prepare(`
                SELECT type, name, tbl_name, sql FROM sqlite_schema
                WHERE sql IS NOT NULL ORDER BY type, name
            `).all()
        };
    } finally {
        db.close();
    }
}

function protectedSnapshot(path) {
    const db = new Database(path, { readonly: true });
    try {
        return {
            posts: db.prepare('SELECT * FROM posts ORDER BY id').all(),
            users: db.prepare('SELECT * FROM users ORDER BY id').all(),
            categories: db.prepare('SELECT * FROM categories ORDER BY id').all(),
            postCategories: db.prepare('SELECT * FROM post_categories ORDER BY post_id, category_id').all(),
            sessions: db.prepare('SELECT * FROM sessions ORDER BY sid').all(),
            pageViews: db.prepare('SELECT * FROM page_views ORDER BY id').all(),
            trigger: db.prepare(`SELECT sql FROM sqlite_schema WHERE name = 'posts_updated_at'`).get().sql
        };
    } finally {
        db.close();
    }
}

function mutate(path, sql, ...parameters) {
    const db = new Database(path);
    try {
        db.pragma('foreign_keys = ON');
        db.prepare(sql).run(...parameters);
    } finally {
        db.close();
    }
}

function executeSql(path, sql, { foreignKeys = true } = {}) {
    const db = new Database(path);
    try {
        db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
        db.exec(sql);
    } finally {
        db.close();
    }
}

function writeManifestCopy(directory, change, recompute = false) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    change(manifest);
    if (recompute) manifest.approvedDigest = calculateHistoricalAuthorshipManifestDigest(manifest);
    const path = join(directory, 'changed-manifest.json');
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    return path;
}

test('manifest contains the exact approved 6 TTA and 20 FFG post corpus', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.approvedDigest, calculateHistoricalAuthorshipManifestDigest(manifest));
    for (const site of ['tta', 'ffg']) {
        const partition = manifest.sites.find(candidate => candidate.site === site);
        assert.deepEqual(partition.entries.map(entry => [entry.postId, entry.expectedSlug]),
            approvedCorpus[site]);
        assert.deepEqual(historicalAuthorshipBackfillPolicy[site].posts, approvedCorpus[site]);
        loadHistoricalAuthorshipManifest(manifestPath, site);
    }
});

test('manifest hashing ignores formatting and object-key order but detects semantic and site-order changes', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const reverseObjectKeys = value => {
        if (Array.isArray(value)) return value.map(reverseObjectKeys);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).reverse()
            .map(([key, nested]) => [key, reverseObjectKeys(nested)]));
    };
    const expected = calculateHistoricalAuthorshipManifestDigest(manifest);
    const reformatted = JSON.parse(JSON.stringify(manifest));
    assert.equal(calculateHistoricalAuthorshipManifestDigest(reformatted), expected);
    assert.equal(calculateHistoricalAuthorshipManifestDigest(reverseObjectKeys(manifest)), expected);
    const semanticChange = structuredClone(manifest);
    semanticChange.sites[0].entries[0].expectedSlug = 'changed';
    assert.notEqual(calculateHistoricalAuthorshipManifestDigest(semanticChange), expected);
    const siteOrderChange = structuredClone(manifest);
    siteOrderChange.sites.reverse();
    assert.notEqual(calculateHistoricalAuthorshipManifestDigest(siteOrderChange), expected);
});

for (const site of ['tta', 'ffg']) {
    test(`${site.toUpperCase()} dry run is byte-stable and reports the approved manifest`, (t) => {
        const { databasePath } = fixture(t, site);
        const before = fileDigest(databasePath);
        const result = dryRunHistoricalAuthorshipBackfill({ manifestPath, databasePath, site });
        assert.equal(result.status, 'ready');
        assert.equal(result.expectedEntryCount, approvedCorpus[site].length);
        assert.equal(result.publicPerson.public_key, 'mdc');
        assert.equal(result.manifestDigest,
            'sha256:ff913c28fafca98416fad69fa3578d415ad992b12d6b8729fc405ff83283e017');
        assert.equal(result.reviewedAt, null);
        assert.equal(fileDigest(databasePath), before);
    });

    test(`${site.toUpperCase()} apply records exact sole authorship and preserves every legacy fact`, (t) => {
        const { databasePath } = fixture(t, site);
        const before = protectedSnapshot(databasePath);
        const result = applyHistoricalAuthorshipBackfill({
            manifestPath, databasePath, site, reviewedAt
        });
        assert.equal(result.status, 'applied');
        assert.equal(result.transactionCommitted, true);
        assert.equal(result.postsChanged, approvedCorpus[site].length);
        assert.equal(result.manifestVersion, 1);
        assert.equal(result.site, site);
        assert.equal(result.reviewedAt, reviewedAt);
        assert.equal(result.publicPerson.public_key, 'mdc');
        assert.equal(result.reviewState, 'owner_attested');
        assert.equal(result.entries.length, approvedCorpus[site].length);
        assert.deepEqual(result.preservation, {
            publication: true,
            publisher: true,
            modifiedAt: true,
            eventDate: true,
            updatedAt: true,
            legacyAuthorId: true
        });
        const after = protectedSnapshot(databasePath);
        assert.deepEqual(after.users, before.users);
        assert.deepEqual(after.categories, before.categories);
        assert.deepEqual(after.postCategories, before.postCategories);
        assert.deepEqual(after.sessions, before.sessions);
        assert.deepEqual(after.pageViews, before.pageViews);
        assert.equal(after.trigger, before.trigger);
        for (let index = 0; index < before.posts.length; index += 1) {
            const original = before.posts[index];
            const changed = after.posts[index];
            for (const field of Object.keys(original)) {
                if (field === 'authorship_review_state') assert.equal(changed[field], 'owner_attested');
                else if (field === 'authorship_reviewed_at') assert.equal(changed[field], reviewedAt);
                else if (field === 'authorship_review_note') {
                    assert.equal(changed[field], 'Owner-attested historical authorship');
                } else assert.deepEqual(changed[field], original[field], `${site} post ${original.id} ${field}`);
            }
        }
        const db = new Database(databasePath, { readonly: true });
        try {
            assert.deepEqual(db.prepare(`
                SELECT ppa.post_id, pp.public_key, ppa.position
                FROM post_public_authors ppa JOIN public_people pp ON pp.id = ppa.public_person_id
                ORDER BY ppa.post_id
            `).all(), approvedCorpus[site].map(([postId]) => ({ post_id: postId, public_key: 'mdc', position: 1 })));
            assert.deepEqual(db.pragma('foreign_key_check'), []);
            assert.equal(db.pragma('integrity_check')[0].integrity_check, 'ok');
            assert.equal(createMigrationRunner().inspect(databasePath).pending.length, 0);
        } finally {
            db.close();
        }
    });
}

for (const [label, failingIndex] of [['first', 0], ['middle', 3], ['final', 5]]) {
    test(`transaction failure on ${label} TTA row rolls back the entire site and trigger`, (t) => {
        const { databasePath } = fixture(t);
        const before = databaseState(databasePath);
        assert.throws(() => applyHistoricalAuthorshipBackfill({
            manifestPath,
            databasePath,
            site: 'tta',
            reviewedAt,
            _testFault: ({ event, index }) => {
                if (event === 'after-review' && index === failingIndex) {
                    throw new Error(`synthetic ${label} failure`);
                }
            }
        }), new RegExp(`synthetic ${label} failure`));
        assert.deepEqual(databaseState(databasePath), before);
        assert.equal(dryRunHistoricalAuthorshipBackfill({
            manifestPath, databasePath, site: 'tta'
        }).status, 'ready');
    });
}

for (const [label, event, failingIndex] of [
    ['assignment failure after prior rows', 'before-assignment', 3],
    ['review-state failure after assignment', 'after-assignment', 3],
    ['trigger restoration failure', 'before-trigger-restore', undefined],
    ['exception after trigger restoration', 'after-trigger-restore', undefined]
]) {
    test(`${label} rolls back all data and schema changes`, (t) => {
        const { databasePath } = fixture(t);
        const before = databaseState(databasePath);
        assert.throws(() => applyHistoricalAuthorshipBackfill({
            manifestPath,
            databasePath,
            site: 'tta',
            reviewedAt,
            _testFault: ({ event: actualEvent, index }) => {
                if (actualEvent === event && (failingIndex === undefined || index === failingIndex)) {
                    throw new Error(`synthetic ${label}`);
                }
            }
        }), new RegExp(`synthetic ${label}`));
        assert.deepEqual(databaseState(databasePath), before);
        assert.equal(createMigrationRunner().inspect(databasePath).pending.length, 0);
    });
}

const staleCases = [
    ['wrong slug', (path) => mutate(path, `UPDATE posts SET slug = 'changed' WHERE id = 4`)],
    ['missing post', (path) => mutate(path, 'DELETE FROM posts WHERE id = 4')],
    ['existing author assignment', (path) => mutate(path, `
        INSERT INTO post_public_authors (post_id, public_person_id, position)
        VALUES (4, (SELECT id FROM public_people WHERE public_key = 'mdc'), 1)
    `)],
    ['reviewed post', (path) => mutate(path, `
        UPDATE posts SET authorship_review_state = 'reviewed_unavailable',
            authorship_reviewed_at = '2026-09-24T00:00:00Z' WHERE id = 4
    `)],
    ['missing MDC', (path) => mutate(path, `DELETE FROM public_people WHERE public_key = 'mdc'`)],
    ['archived MDC', (path) => mutate(path, `UPDATE public_people SET is_active = 0 WHERE public_key = 'mdc'`)],
    ['wrong Public Person', (path) => mutate(path, `UPDATE public_people SET public_key = 'other' WHERE public_key = 'mdc'`)],
    ['post count mismatch', (path) => mutate(path, `
        INSERT INTO posts (id, title, slug, body) VALUES (99, 'Extra', 'extra', 'Extra')
    `)],
    ['unexpected publisher state', (path) => mutate(path, `
        UPDATE posts SET publisher_public_person_id =
            (SELECT id FROM public_people WHERE public_key = 'mdc') WHERE id = 4
    `)],
    ['unexpected publication state', (path) => mutate(path, `
        UPDATE posts SET published_on = '2020-02-04',
            publication_review_state = 'owner_attested',
            publication_reviewed_at = '2026-09-24T00:00:00Z' WHERE id = 4
    `)],
    ['unexpected modified_at', (path) => mutate(path, `
        UPDATE posts SET modified_at = '2026-09-24T00:00:00Z' WHERE id = 4
    `)]
];

for (const [label, change] of staleCases) {
    test(`${label} blocks the whole site before mutation`, (t) => {
        const { databasePath } = fixture(t);
        change(databasePath);
        const before = databaseState(databasePath);
        const dryRun = dryRunHistoricalAuthorshipBackfill({
            manifestPath, databasePath, site: 'tta'
        });
        assert.equal(dryRun.status, 'blocked');
        assert.throws(() => applyHistoricalAuthorshipBackfill({
            manifestPath, databasePath, site: 'tta', reviewedAt
        }), /blocked/i);
        assert.deepEqual(databaseState(databasePath), before);
    });
}

test('duplicate manifest row is rejected even with a recomputed digest', (t) => {
    const { directory, databasePath } = fixture(t);
    const changed = writeManifestCopy(directory, manifest => {
        manifest.sites[0].entries[1] = { ...manifest.sites[0].entries[0] };
    }, true);
    assert.throws(() => dryRunHistoricalAuthorshipBackfill({
        manifestPath: changed, databasePath, site: 'tta'
    }), /duplicate post ID/);
});

test('unexpected manifest content is rejected even with a recomputed digest', (t) => {
    const { directory, databasePath } = fixture(t);
    const changed = writeManifestCopy(directory, manifest => {
        manifest.sites[0].entries[0].postContent = 'Content does not belong in this manifest';
    }, true);
    assert.throws(() => dryRunHistoricalAuthorshipBackfill({
        manifestPath: changed, databasePath, site: 'tta'
    }), /unexpected field postContent/);
});

test('manifest content tampering is rejected by the approved digest', (t) => {
    const { directory, databasePath } = fixture(t);
    const changed = writeManifestCopy(directory, manifest => {
        manifest.sites[0].entries[0].evidenceNote = 'Changed without review';
    });
    assert.throws(() => dryRunHistoricalAuthorshipBackfill({
        manifestPath: changed, databasePath, site: 'tta'
    }), /approvedDigest does not match/);
});

test('a TTA partition cannot run against an FFG database', (t) => {
    const { databasePath } = fixture(t, 'ffg');
    assert.throws(() => dryRunHistoricalAuthorshipBackfill({
        manifestPath, databasePath, site: 'tta'
    }), /baseline is ffg_legacy_production/);
});

for (const [label, drift] of [
    ['missing posts_updated_at trigger', `DROP TRIGGER posts_updated_at`],
    ['materially changed posts_updated_at trigger', `
        DROP TRIGGER posts_updated_at;
        CREATE TRIGGER posts_updated_at AFTER UPDATE ON posts BEGIN SELECT 1; END;
    `]
]) {
    test(`${label} is rejected before the backfill can mutate data`, (t) => {
        const { databasePath } = fixture(t);
        executeSql(databasePath, drift);
        const before = databaseState(databasePath);
        assert.throws(() => dryRunHistoricalAuthorshipBackfill({
            manifestPath, databasePath, site: 'tta'
        }), /drifted shared database schema/);
        assert.throws(() => applyHistoricalAuthorshipBackfill({
            manifestPath, databasePath, site: 'tta', reviewedAt
        }), /drifted shared database schema/);
        assert.deepEqual(databaseState(databasePath), before);
    });
}

test('foreign-key violations are rejected before mutation', (t) => {
    const { databasePath } = fixture(t);
    executeSql(databasePath, `
        INSERT INTO post_public_authors (post_id, public_person_id, position)
        VALUES (999, 999, 1);
    `, { foreignKeys: false });
    const before = databaseState(databasePath);
    assert.throws(() => dryRunHistoricalAuthorshipBackfill({
        manifestPath, databasePath, site: 'tta'
    }), /foreign-key violations/);
    assert.throws(() => applyHistoricalAuthorshipBackfill({
        manifestPath, databasePath, site: 'tta', reviewedAt
    }), /foreign-key violations/);
    assert.deepEqual(databaseState(databasePath), before);
});

test('CLI defaults to a non-mutating dry run with an unambiguous receipt', (t) => {
    const { databasePath } = fixture(t);
    const before = fileDigest(databasePath);
    const output = execFileSync(process.execPath, [cliPath,
        '--manifest', manifestPath,
        '--database', databasePath,
        '--site', 'tta'
    ], { encoding: 'utf8' });
    assert.match(output, /Manifest: v1 sha256:ff913c28/);
    assert.match(output, /Entries: 6/);
    assert.match(output, /DRY RUN PASS — NO CHANGES MADE/);
    assert.equal(fileDigest(databasePath), before);
});

test('CLI reports a blocked dry run unambiguously without changing the database', (t) => {
    const { databasePath } = fixture(t, 'ffg');
    const before = fileDigest(databasePath);
    const child = spawnSync(process.execPath, [cliPath,
        '--manifest', manifestPath,
        '--database', databasePath,
        '--site', 'tta',
        '--dry-run'
    ], { encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /DRY RUN BLOCKED — NO CHANGES MADE/);
    assert.equal(fileDigest(databasePath), before);
});

test('apply rejects an implicit or timezone-free review timestamp', (t) => {
    const { databasePath } = fixture(t);
    assert.throws(() => applyHistoricalAuthorshipBackfill({
        manifestPath, databasePath, site: 'tta'
    }), /explicit UTC/);
    assert.throws(() => applyHistoricalAuthorshipBackfill({
        manifestPath, databasePath, site: 'tta', reviewedAt: '2026-09-24T12:34:56'
    }), /explicit UTC/);
    assert.throws(() => applyHistoricalAuthorshipBackfill({
        manifestPath, databasePath, site: 'tta', reviewedAt: '2026-02-30T12:34:56Z'
    }), /explicit UTC/);
});

test('CLI refuses incomplete or mistyped apply authorization without writes', (t) => {
    const { databasePath } = fixture(t);
    const before = fileDigest(databasePath);
    for (const extra of [
        ['--apply'],
        ['--aply', '--reviewed-at', reviewedAt],
        ['--apply', '--dry-run', '--reviewed-at', reviewedAt]
    ]) {
        const child = spawnSync(process.execPath, [cliPath,
            '--manifest', manifestPath,
            '--database', databasePath,
            '--site', 'tta',
            ...extra
        ], { encoding: 'utf8' });
        assert.equal(child.status, 1);
        assert.match(child.stderr, /NO CHANGES MADE/);
        assert.equal(fileDigest(databasePath), before);
    }
});

test('second apply is a true no-op that preserves assignments and review timestamp', (t) => {
    const { databasePath } = fixture(t);
    const first = applyHistoricalAuthorshipBackfill({ manifestPath, databasePath, site: 'tta', reviewedAt });
    const before = databaseState(databasePath);
    const beforeDigest = fileDigest(databasePath);
    const second = applyHistoricalAuthorshipBackfill({
        manifestPath, databasePath, site: 'tta', reviewedAt: '2026-09-25T00:00:00.000Z'
    });
    assert.equal(first.status, 'applied');
    assert.equal(second.status, 'already-applied');
    assert.equal(second.reviewedAt, reviewedAt);
    assert.equal(second.transactionCommitted, false);
    assert.deepEqual(databaseState(databasePath), before);
    assert.equal(fileDigest(databasePath), beforeDigest);
});

test('partially resolved site is blocked rather than completed or re-reviewed', (t) => {
    const { databasePath } = fixture(t);
    mutate(databasePath, `
        INSERT INTO post_public_authors (post_id, public_person_id, position)
        VALUES (4, (SELECT id FROM public_people WHERE public_key = 'mdc'), 1)
    `);
    mutate(databasePath, `
        UPDATE posts SET authorship_review_state = 'owner_attested',
            authorship_reviewed_at = ?, authorship_review_note = ? WHERE id = 4
    `, reviewedAt, 'Owner-attested historical authorship');
    const result = dryRunHistoricalAuthorshipBackfill({ manifestPath, databasePath, site: 'tta' });
    assert.equal(result.status, 'blocked');
    assert.match(result.errors.join('\n'), /partially applied/);
});
