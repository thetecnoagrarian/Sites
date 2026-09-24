import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import Database from 'better-sqlite3';

import { createMigrationRunner, loadMigrations } from './migrations.js';
import { expectedSignature, schemaSignature } from './schema-recognition.js';

const MANIFEST_TYPE = 'historical-authorship-owner-attestation';
const MANIFEST_VERSION = 1;
const MIGRATIONS = Object.freeze([
    '0000_existing_schema',
    '0001_public_author_publication_model'
]);
const EVIDENCE_NOTE = 'Owner-attested historical authorship';
const UPDATED_AT_TRIGGER = 'posts_updated_at';
const freezePosts = posts => Object.freeze(posts.map(post => Object.freeze(post)));

const SITE_POLICIES = Object.freeze({
    tta: Object.freeze({
        baselineVariant: 'tta_legacy_production',
        postCount: 6,
        posts: freezePosts([
            [4, 'the-rebuild-you-cant-see-or-whats-new-under-the-hood'],
            [5, 'launching-the-tecnoagrarian-or-rebuilding-the-stack'],
            [6, 'self-custody-as-regenerative-practice'],
            [7, 'why-bitcoin-makes-sense-to-me'],
            [8, 'using-chatgpt-to-create-a-custom-curriculum'],
            [9, 'what-a-rabbit-hutch-taught-me-about-using-ai-for-design']
        ])
    }),
    ffg: Object.freeze({
        baselineVariant: 'ffg_legacy_production',
        postCount: 20,
        posts: freezePosts([
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
        ])
    })
});

function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function calculateHistoricalAuthorshipManifestDigest(manifest) {
    const unsigned = { ...manifest };
    delete unsigned.approvedDigest;
    return `sha256:${createHash('sha256').update(canonicalJson(unsigned)).digest('hex')}`;
}

function requireExact(object, expected, context, errors) {
    const expectedKeys = new Set(Object.keys(expected));
    for (const field of Object.keys(object)) {
        if (!expectedKeys.has(field)) errors.push(`${context}: unexpected field ${field}`);
    }
    for (const [field, value] of Object.entries(expected)) {
        if (object[field] !== value) {
            errors.push(`${context}: ${field} must be ${JSON.stringify(value)}`);
        }
    }
}

function validateManifest(manifest, site) {
    const errors = [];
    const policy = SITE_POLICIES[site];
    if (!policy) throw new Error(`Unsupported site: ${site}`);
    requireExact(manifest, {
        manifestType: MANIFEST_TYPE,
        manifestVersion: MANIFEST_VERSION,
        approvedDigest: manifest.approvedDigest,
        evidenceBasis: 'owner_attestation',
        sites: manifest.sites
    }, 'manifest', errors);
    const digest = calculateHistoricalAuthorshipManifestDigest(manifest);
    if (manifest.approvedDigest !== digest) errors.push('manifest: approvedDigest does not match content');
    if (!Array.isArray(manifest.sites) || manifest.sites.length !== 2) {
        errors.push('manifest: sites must contain exactly the TTA and FFG partitions');
    }
    const partitions = Array.isArray(manifest.sites) ? manifest.sites : [];
    const siteNames = partitions.map(partition => partition?.site);
    if (new Set(siteNames).size !== siteNames.length
        || !siteNames.includes('tta') || !siteNames.includes('ffg')) {
        errors.push('manifest: site partitions must be unique and include tta and ffg');
    }
    for (const partitionToValidate of partitions) {
        const partitionSite = partitionToValidate?.site;
        const partitionPolicy = SITE_POLICIES[partitionSite];
        if (!partitionPolicy) {
            errors.push(`manifest: unsupported site partition ${JSON.stringify(partitionSite)}`);
            continue;
        }
        requireExact(partitionToValidate, {
            site: partitionSite,
            expectedBaselineVariant: partitionPolicy.baselineVariant,
            expectedDatabasePostCount: partitionPolicy.postCount,
            publicPerson: partitionToValidate.publicPerson,
            entries: partitionToValidate.entries
        }, partitionSite, errors);
        requireExact(partitionToValidate.publicPerson ?? {}, {
            expectedPublicKey: 'mdc',
            expectedDisplayName: 'MDC',
            expectedIsActive: 1
        }, `${partitionSite}.publicPerson`, errors);
        if (!Array.isArray(partitionToValidate.entries)
            || partitionToValidate.entries.length !== partitionPolicy.postCount) {
            errors.push(`${partitionSite}: entries must contain exactly ${partitionPolicy.postCount} posts`);
        } else {
            const ids = partitionToValidate.entries.map(entry => entry.postId);
            const slugs = partitionToValidate.entries.map(entry => entry.expectedSlug);
            if (new Set(ids).size !== ids.length) errors.push(`${partitionSite}: duplicate post ID`);
            if (new Set(slugs).size !== slugs.length) errors.push(`${partitionSite}: duplicate post slug`);
            partitionToValidate.entries.forEach((entry, index) => {
                const [postId, expectedSlug] = partitionPolicy.posts[index];
                requireExact(entry, {
                    site: partitionSite,
                    postId,
                    expectedSlug,
                    expectedAuthorshipReviewState: 'unreviewed',
                    expectedAuthorshipReviewedAt: null,
                    expectedAuthorshipReviewNote: null,
                    expectedAuthorAssignmentCount: 0,
                    intendedPublicPersonKey: 'mdc',
                    intendedPosition: 1,
                    intendedAuthorshipReviewState: 'owner_attested',
                    evidenceNote: EVIDENCE_NOTE,
                    expectedPublisherPublicPersonId: null,
                    expectedPublishedAt: null,
                    expectedPublishedOn: null,
                    expectedPublicationReviewState: 'unreviewed',
                    expectedPublicationReviewedAt: null,
                    expectedPublicationReviewNote: null,
                    expectedModifiedAt: null,
                    preservePublication: true,
                    preservePublisher: true,
                    preserveModifiedAt: true
                }, `${partitionSite}.entries[${index}]`, errors);
            });
        }
    }
    const partition = partitions.find(candidate => candidate?.site === site);
    if (!partition) errors.push(`manifest: missing ${site} partition`);
    if (errors.length > 0) throw new Error(`Invalid historical authorship manifest:\n- ${errors.join('\n- ')}`);
    return { manifest, partition, digest, policy };
}

export function loadHistoricalAuthorshipManifest(manifestPath, site) {
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
        throw new Error(`Cannot read historical authorship manifest: ${error.message}`);
    }
    return validateManifest(manifest, site);
}

function validUtcTimestamp(value) {
    if (typeof value !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
        return false;
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
        && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

function inspectDatabase(databasePath, policy) {
    const inspection = createMigrationRunner().inspect(databasePath);
    const errors = [];
    if (inspection.state !== 'tracked') errors.push('database is not migration-tracked');
    if (inspection.baselineVariant !== policy.baselineVariant) {
        errors.push(`baseline is ${inspection.baselineVariant}; expected ${policy.baselineVariant}`);
    }
    if (JSON.stringify(inspection.applied) !== JSON.stringify(MIGRATIONS)) {
        errors.push(`applied migrations must be exactly ${MIGRATIONS.join(', ')}`);
    }
    if (inspection.pending.length !== 0) errors.push(`pending migrations: ${inspection.pending.join(', ')}`);
    if (errors.length > 0) throw new Error(`Database identity check failed:\n- ${errors.join('\n- ')}`);
    return inspection;
}

const protectedPublication = Object.freeze({
    publisher_public_person_id: null,
    published_at: null,
    published_on: null,
    publication_review_state: 'unreviewed',
    publication_reviewed_at: null,
    publication_review_note: null,
    modified_at: null
});

function analyzeConnection(db, validated, inspection) {
    const { partition, policy } = validated;
    const errors = [];
    const postCount = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count;
    if (postCount !== policy.postCount) {
        errors.push(`database has ${postCount} posts; expected exactly ${policy.postCount}`);
    }
    const people = db.prepare('SELECT id, public_key, display_name, is_active FROM public_people ORDER BY id').all();
    const person = people.find(candidate => candidate.public_key === 'mdc');
    if (people.length !== 1) errors.push(`database must contain exactly one Public Person; found ${people.length}`);
    if (!person) {
        errors.push('Public Person key mdc does not exist');
    } else {
        if (person.public_key !== partition.publicPerson.expectedPublicKey) errors.push('Public Person key mismatch');
        if (person.display_name !== partition.publicPerson.expectedDisplayName) errors.push('MDC display name mismatch');
        if (person.is_active !== partition.publicPerson.expectedIsActive) errors.push('MDC must be active');
    }

    const entryResults = [];
    for (const entry of partition.entries) {
        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(entry.postId);
        const assignments = db.prepare(`
            SELECT ppa.post_id, ppa.public_person_id, ppa.position, pp.public_key
            FROM post_public_authors ppa
            JOIN public_people pp ON pp.id = ppa.public_person_id
            WHERE ppa.post_id = ? ORDER BY ppa.position
        `).all(entry.postId);
        const entryErrors = [];
        if (!post) {
            entryErrors.push('post is missing');
        } else {
            if (post.slug !== entry.expectedSlug) {
                entryErrors.push(`slug is ${JSON.stringify(post.slug)}; expected ${JSON.stringify(entry.expectedSlug)}`);
            }
            for (const [field, value] of Object.entries(protectedPublication)) {
                if (post[field] !== value) entryErrors.push(`${field} is not ${JSON.stringify(value)}`);
            }
        }
        const isInitial = post
            && post.authorship_review_state === entry.expectedAuthorshipReviewState
            && post.authorship_reviewed_at === entry.expectedAuthorshipReviewedAt
            && post.authorship_review_note === entry.expectedAuthorshipReviewNote
            && assignments.length === entry.expectedAuthorAssignmentCount;
        const isApplied = post && person
            && post.authorship_review_state === entry.intendedAuthorshipReviewState
            && validUtcTimestamp(post.authorship_reviewed_at)
            && post.authorship_review_note === entry.evidenceNote
            && assignments.length === 1
            && assignments[0].public_person_id === person.id
            && assignments[0].public_key === entry.intendedPublicPersonKey
            && assignments[0].position === entry.intendedPosition;
        if (!isInitial && !isApplied && post) {
            entryErrors.push(`authorship is neither pristine nor the exact intended resolved state (state=${post.authorship_review_state}, assignments=${assignments.length})`);
        }
        errors.push(...entryErrors.map(error => `post ${entry.postId}/${entry.expectedSlug}: ${error}`));
        entryResults.push({ entry, post, assignments, mode: isInitial ? 'pending' : isApplied ? 'already-applied' : 'blocked' });
    }
    const modes = new Set(entryResults.map(result => result.mode));
    if (modes.has('pending') && modes.has('already-applied')) {
        errors.push('site is partially applied; mixed pending and resolved rows are not allowed');
    }
    if (modes.size === 1 && modes.has('already-applied')) {
        const timestamps = new Set(entryResults.map(result => result.post.authorship_reviewed_at));
        if (timestamps.size !== 1) errors.push('resolved rows do not share one controlled review timestamp');
    }
    if (db.pragma('foreign_key_check').length > 0) errors.push('foreign_key_check is not empty');
    const integrity = db.pragma('integrity_check')[0]?.integrity_check;
    if (integrity !== 'ok') errors.push(`integrity_check is ${integrity}`);
    return {
        inspection,
        person,
        postCount,
        entryResults,
        status: errors.length > 0 ? 'blocked'
            : modes.has('already-applied') ? 'already-applied' : 'ready',
        errors
    };
}

function openReadonly(databasePath) {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    db.pragma('foreign_keys = ON');
    return db;
}

function buildResult(validated, databasePath, analysis, mode, reviewedAt = null) {
    return {
        mode,
        status: analysis.status,
        manifestType: validated.manifest.manifestType,
        manifestVersion: validated.manifest.manifestVersion,
        manifestDigest: validated.digest,
        site: validated.partition.site,
        databasePath,
        baselineVariant: analysis.inspection.baselineVariant,
        appliedMigrations: analysis.inspection.applied,
        pendingMigrations: analysis.inspection.pending,
        expectedEntryCount: validated.partition.entries.length,
        publicPerson: analysis.person ?? null,
        reviewedAt,
        reviewState: 'owner_attested',
        evidenceNote: EVIDENCE_NOTE,
        entries: analysis.entryResults.map(({ entry, mode: currentMode }) => ({
            postId: entry.postId,
            slug: entry.expectedSlug,
            current: currentMode,
            intended: 'mdc position 1 / owner_attested'
        })),
        preservation: {
            publication: true,
            publisher: true,
            modifiedAt: true,
            eventDate: true,
            updatedAt: true,
            legacyAuthorId: true
        },
        errors: analysis.errors,
        transactionCommitted: false
    };
}

export function dryRunHistoricalAuthorshipBackfill({ manifestPath, databasePath, site }) {
    const validated = loadHistoricalAuthorshipManifest(manifestPath, site);
    const inspection = inspectDatabase(databasePath, validated.policy);
    const db = openReadonly(databasePath);
    try {
        const analysis = analyzeConnection(db, validated, inspection);
        return buildResult(validated, databasePath, analysis, 'dry-run',
            analysis.status === 'already-applied'
                ? analysis.entryResults[0].post.authorship_reviewed_at : null);
    } finally {
        db.close();
    }
}

function assertReady(analysis) {
    if (analysis.errors.length > 0) {
        throw new Error(`Historical authorship backfill blocked:\n- ${analysis.errors.join('\n- ')}`);
    }
}

function assertPostsPreserved(beforeRows, afterRows) {
    const mutable = new Set([
        'authorship_review_state', 'authorship_reviewed_at', 'authorship_review_note'
    ]);
    for (let index = 0; index < beforeRows.length; index += 1) {
        for (const field of Object.keys(beforeRows[index])) {
            if (!mutable.has(field) && beforeRows[index][field] !== afterRows[index][field]) {
                throw new Error(`Preservation check failed for post ${beforeRows[index].id}: ${field} changed`);
            }
        }
    }
}

export function applyHistoricalAuthorshipBackfill({
    manifestPath,
    databasePath,
    site,
    reviewedAt,
    _testFault
}) {
    if (!validUtcTimestamp(reviewedAt)) {
        throw new Error('--reviewed-at must be an explicit UTC ISO 8601 timestamp ending in Z');
    }
    const validated = loadHistoricalAuthorshipManifest(manifestPath, site);
    let inspection = inspectDatabase(databasePath, validated.policy);
    let preliminary;
    const readonly = openReadonly(databasePath);
    try {
        preliminary = analyzeConnection(readonly, validated, inspection);
    } finally {
        readonly.close();
    }
    assertReady(preliminary);
    if (preliminary.status === 'already-applied') {
        return buildResult(validated, databasePath, preliminary, 'apply',
            preliminary.entryResults[0].post.authorship_reviewed_at);
    }

    const db = new Database(databasePath, { fileMustExist: true });
    try {
        db.pragma('foreign_keys = ON');
        const transaction = db.transaction(() => {
            inspection = inspectDatabase(databasePath, validated.policy);
            const current = analyzeConnection(db, validated, inspection);
            assertReady(current);
            if (current.status !== 'ready') {
                throw new Error('Historical authorship backfill changed state before transaction');
            }
            const beforeRows = validated.partition.entries.map(entry =>
                db.prepare('SELECT * FROM posts WHERE id = ?').get(entry.postId));
            const trigger = db.prepare(`
                SELECT type, tbl_name AS tableName, sql FROM sqlite_schema WHERE name = ?
            `).get(UPDATED_AT_TRIGGER);
            if (!trigger || trigger.type !== 'trigger' || trigger.tableName !== 'posts' || !trigger.sql) {
                throw new Error('Required posts_updated_at trigger is missing or invalid');
            }

            // This one controlled operation establishes previously unmodeled history.
            // Temporarily suppress the legacy technical-save timestamp trigger inside
            // the all-or-nothing transaction, then restore its exact SQL before commit.
            db.exec(`DROP TRIGGER ${UPDATED_AT_TRIGGER}`);
            const insert = db.prepare(`
                INSERT INTO post_public_authors (post_id, public_person_id, position)
                VALUES (?, ?, 1)
            `);
            const review = db.prepare(`
                UPDATE posts
                SET authorship_review_state = 'owner_attested',
                    authorship_reviewed_at = ?,
                    authorship_review_note = ?
                WHERE id = ?
            `);
            validated.partition.entries.forEach((entry, index) => {
                if (_testFault) _testFault({ event: 'before-assignment', index, entry });
                insert.run(entry.postId, current.person.id);
                if (_testFault) _testFault({ event: 'after-assignment', index, entry });
                const update = review.run(reviewedAt, entry.evidenceNote, entry.postId);
                if (update.changes !== 1) throw new Error(`Post ${entry.postId} review update failed`);
                if (_testFault) _testFault({ event: 'after-review', index, entry });
            });
            if (_testFault) _testFault({ event: 'before-trigger-restore' });
            db.exec(trigger.sql);
            const restored = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?')
                .get(UPDATED_AT_TRIGGER);
            if (restored?.sql !== trigger.sql) throw new Error('posts_updated_at trigger was not restored exactly');
            if (_testFault) _testFault({ event: 'after-trigger-restore' });

            const expected = expectedSignature(
                loadMigrations(), MIGRATIONS.length, validated.policy.baselineVariant);
            if (JSON.stringify(schemaSignature(db)) !== JSON.stringify(expected)) {
                throw new Error('Shared schema recognition failed after trigger restoration');
            }

            const afterRows = validated.partition.entries.map(entry =>
                db.prepare('SELECT * FROM posts WHERE id = ?').get(entry.postId));
            assertPostsPreserved(beforeRows, afterRows);
            const finished = analyzeConnection(db, validated, inspection);
            assertReady(finished);
            if (finished.status !== 'already-applied') {
                throw new Error('Backfill did not reach the exact intended state');
            }
            if (db.pragma('foreign_key_check').length > 0) {
                throw new Error('Backfill created a foreign-key violation');
            }
            return finished;
        });
        const finished = transaction.immediate();
        inspectDatabase(databasePath, validated.policy);
        const result = buildResult(validated, databasePath, finished, 'apply', reviewedAt);
        result.status = 'applied';
        result.transactionCommitted = true;
        result.postsChanged = validated.partition.entries.length;
        return result;
    } finally {
        db.close();
    }
}

export const historicalAuthorshipBackfillPolicy = SITE_POLICIES;
