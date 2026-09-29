import Database from 'better-sqlite3';

import { createMigrationRunner, loadMigrations } from './migrations.js';
import { expectedSignature, schemaSignature } from './schema-recognition.js';

const POST_ID = 3;
const SLUG = 'from-oregon-to-michigan-a-cross-country-camper-adventure';
const TITLE = 'From Oregon to Michigan: A Cross-Country Camper Adventure';
const EVENT_DATE = '2022-07-18';
const PUBLISHED_ON = '2024-09-22';
const REVIEW_STATE = 'owner_attested';
const REVIEW_NOTE = 'Owner attested 2024-09-22 as the historical publication date.';
const UPDATED_AT_TRIGGER = 'posts_updated_at';
const MIGRATIONS = Object.freeze([
    '0000_existing_schema',
    '0001_public_author_publication_model'
]);

function validUtcTimestamp(value) {
    if (typeof value !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
        return false;
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
        && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

function inspectDatabase(databasePath) {
    const inspection = createMigrationRunner().inspect(databasePath);
    const errors = [];
    if (inspection.state !== 'tracked') errors.push('database is not migration-tracked');
    if (inspection.baselineVariant !== 'ffg_legacy_production') {
        errors.push(`baseline is ${inspection.baselineVariant}; expected ffg_legacy_production`);
    }
    if (JSON.stringify(inspection.applied) !== JSON.stringify(MIGRATIONS)) {
        errors.push(`applied migrations must be exactly ${MIGRATIONS.join(', ')}`);
    }
    if (inspection.pending.length !== 0) errors.push(`pending migrations: ${inspection.pending.join(', ')}`);
    if (errors.length > 0) throw new Error(`Database identity check failed:\n- ${errors.join('\n- ')}`);
    return inspection;
}

function publicationMode(post) {
    const initial = post.publication_review_state === 'unreviewed'
        && post.publication_reviewed_at === null
        && post.publication_review_note === null
        && post.published_at === null
        && post.published_on === null;
    const applied = post.publication_review_state === REVIEW_STATE
        && validUtcTimestamp(post.publication_reviewed_at)
        && post.publication_review_note === REVIEW_NOTE
        && post.published_at === null
        && post.published_on === PUBLISHED_ON;
    return initial ? 'pending' : applied ? 'already-applied' : 'blocked';
}

function analyzeConnection(db, inspection) {
    const errors = [];
    const postCount = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count;
    if (postCount !== 20) errors.push(`database has ${postCount} posts; expected exactly 20`);
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(POST_ID);
    if (!post) {
        errors.push(`post ${POST_ID} is missing`);
    } else {
        if (post.slug !== SLUG) errors.push(`slug is ${JSON.stringify(post.slug)}; expected ${JSON.stringify(SLUG)}`);
        if (post.title !== TITLE) errors.push(`title is ${JSON.stringify(post.title)}; expected ${JSON.stringify(TITLE)}`);
        if (post.created_at !== EVENT_DATE) errors.push(`Event Date is ${JSON.stringify(post.created_at)}; expected ${JSON.stringify(EVENT_DATE)}`);
        if (post.modified_at !== null) errors.push('modified_at must be null');
        if (post.publisher_public_person_id !== null) errors.push('publisher must remain unassigned');
        if (publicationMode(post) === 'blocked') {
            errors.push('publication state is neither pristine nor the exact intended applied state');
        }
    }
    const authors = db.prepare(`
        SELECT ppa.post_id, ppa.public_person_id, ppa.position,
               pp.public_key, pp.display_name, pp.is_active
        FROM post_public_authors ppa
        JOIN public_people pp ON pp.id = ppa.public_person_id
        WHERE ppa.post_id = ? ORDER BY ppa.position
    `).all(POST_ID);
    if (!post || post.authorship_review_state !== 'owner_attested'
        || !validUtcTimestamp(post.authorship_reviewed_at)
        || post.authorship_review_note !== 'Owner-attested historical authorship'
        || authors.length !== 1 || authors[0].position !== 1
        || authors[0].public_key !== 'mdc' || authors[0].display_name !== 'MDC') {
        errors.push('reviewed authorship must remain the exact sole MDC position-1 assignment');
    }
    if (db.pragma('foreign_key_check').length > 0) errors.push('foreign_key_check is not empty');
    const integrity = db.pragma('integrity_check')[0]?.integrity_check;
    if (integrity !== 'ok') errors.push(`integrity_check is ${integrity}`);
    return {
        inspection,
        post,
        authors,
        status: errors.length > 0 ? 'blocked' : publicationMode(post) === 'already-applied'
            ? 'already-applied' : 'ready',
        errors
    };
}

function openReadonly(databasePath) {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    db.pragma('foreign_keys = ON');
    return db;
}

function buildResult(databasePath, analysis, mode, reviewedAt = null) {
    return {
        mode,
        status: analysis.status,
        site: 'ffg',
        databasePath,
        baselineVariant: analysis.inspection.baselineVariant,
        appliedMigrations: analysis.inspection.applied,
        pendingMigrations: analysis.inspection.pending,
        postId: POST_ID,
        slug: SLUG,
        title: TITLE,
        eventDate: EVENT_DATE,
        publishedOn: PUBLISHED_ON,
        publishedAt: null,
        reviewState: REVIEW_STATE,
        reviewedAt: reviewedAt ?? analysis.post?.publication_reviewed_at ?? null,
        reviewNote: REVIEW_NOTE,
        updatedAt: analysis.post?.updated_at ?? null,
        modifiedAt: analysis.post?.modified_at ?? null,
        authors: analysis.authors,
        errors: analysis.errors,
        transactionCommitted: false
    };
}

function assertReady(analysis) {
    if (analysis.errors.length > 0) {
        throw new Error(`FFG post 3 publication operation blocked:\n- ${analysis.errors.join('\n- ')}`);
    }
}

export function dryRunFfg3OwnerAttestedPublication({ databasePath }) {
    const inspection = inspectDatabase(databasePath);
    const db = openReadonly(databasePath);
    try {
        return buildResult(databasePath, analyzeConnection(db, inspection), 'dry-run');
    } finally {
        db.close();
    }
}

function assertPreserved(beforePosts, afterPosts) {
    const mutable = new Set([
        'published_on', 'publication_review_state',
        'publication_reviewed_at', 'publication_review_note'
    ]);
    for (let index = 0; index < beforePosts.length; index += 1) {
        const before = beforePosts[index];
        const after = afterPosts[index];
        for (const field of Object.keys(before)) {
            if (before.id === POST_ID && mutable.has(field)) continue;
            if (before[field] !== after[field]) {
                throw new Error(`Preservation check failed for post ${before.id}: ${field} changed`);
            }
        }
    }
}

export function applyFfg3OwnerAttestedPublication({ databasePath, reviewedAt, _testFault }) {
    if (!validUtcTimestamp(reviewedAt)) {
        throw new Error('--reviewed-at must be an explicit UTC ISO 8601 timestamp ending in Z');
    }
    let inspection = inspectDatabase(databasePath);
    const readonly = openReadonly(databasePath);
    let preliminary;
    try {
        preliminary = analyzeConnection(readonly, inspection);
    } finally {
        readonly.close();
    }
    assertReady(preliminary);
    if (preliminary.status === 'already-applied') {
        return buildResult(databasePath, preliminary, 'apply');
    }

    const db = new Database(databasePath, { fileMustExist: true });
    try {
        db.pragma('foreign_keys = ON');
        const transaction = db.transaction(() => {
            inspection = inspectDatabase(databasePath);
            const current = analyzeConnection(db, inspection);
            assertReady(current);
            if (current.status !== 'ready') throw new Error('Publication state changed before transaction');

            const beforePosts = db.prepare('SELECT * FROM posts ORDER BY id').all();
            const beforeAuthors = db.prepare(`
                SELECT * FROM post_public_authors ORDER BY post_id, position
            `).all();
            const beforeCategories = db.prepare(`
                SELECT * FROM post_categories ORDER BY post_id, category_id
            `).all();
            const trigger = db.prepare(`
                SELECT type, tbl_name AS tableName, sql FROM sqlite_schema WHERE name = ?
            `).get(UPDATED_AT_TRIGGER);
            if (!trigger || trigger.type !== 'trigger' || trigger.tableName !== 'posts' || !trigger.sql) {
                throw new Error('Required posts_updated_at trigger is missing or invalid');
            }

            db.exec(`DROP TRIGGER ${UPDATED_AT_TRIGGER}`);
            if (_testFault) _testFault({ event: 'after-trigger-drop' });
            const update = db.prepare(`
                UPDATE posts
                SET published_on = ?,
                    published_at = NULL,
                    publication_review_state = ?,
                    publication_reviewed_at = ?,
                    publication_review_note = ?
                WHERE id = ? AND slug = ?
                  AND publication_review_state = 'unreviewed'
                  AND publication_reviewed_at IS NULL
                  AND publication_review_note IS NULL
                  AND published_at IS NULL AND published_on IS NULL
                  AND modified_at IS NULL
            `).run(PUBLISHED_ON, REVIEW_STATE, reviewedAt, REVIEW_NOTE, POST_ID, SLUG);
            if (update.changes !== 1) throw new Error('Guarded one-row publication update did not change exactly one row');
            if (_testFault) _testFault({ event: 'after-update' });
            db.exec(trigger.sql);
            const restored = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?')
                .get(UPDATED_AT_TRIGGER);
            if (restored?.sql !== trigger.sql) throw new Error('posts_updated_at trigger was not restored exactly');
            if (_testFault) _testFault({ event: 'after-trigger-restore' });

            const expected = expectedSignature(loadMigrations(), MIGRATIONS.length,
                'ffg_legacy_production');
            if (JSON.stringify(schemaSignature(db)) !== JSON.stringify(expected)) {
                throw new Error('Shared schema recognition failed after trigger restoration');
            }
            const afterPosts = db.prepare('SELECT * FROM posts ORDER BY id').all();
            assertPreserved(beforePosts, afterPosts);
            if (JSON.stringify(beforeAuthors) !== JSON.stringify(db.prepare(`
                SELECT * FROM post_public_authors ORDER BY post_id, position
            `).all())) throw new Error('Authorship assignments changed');
            if (JSON.stringify(beforeCategories) !== JSON.stringify(db.prepare(`
                SELECT * FROM post_categories ORDER BY post_id, category_id
            `).all())) throw new Error('Post categories changed');
            const finished = analyzeConnection(db, inspection);
            assertReady(finished);
            if (finished.status !== 'already-applied') {
                throw new Error('Operation did not reach the exact intended state');
            }
            return finished;
        });
        const finished = transaction.immediate();
        inspectDatabase(databasePath);
        const result = buildResult(databasePath, finished, 'apply', reviewedAt);
        result.status = 'applied';
        result.transactionCommitted = true;
        result.postsChanged = 1;
        return result;
    } finally {
        db.close();
    }
}

export const ffg3OwnerAttestedPublicationPolicy = Object.freeze({
    postId: POST_ID,
    slug: SLUG,
    title: TITLE,
    eventDate: EVENT_DATE,
    publishedOn: PUBLISHED_ON,
    reviewState: REVIEW_STATE,
    reviewNote: REVIEW_NOTE
});
