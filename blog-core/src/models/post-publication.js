import { getDatabase } from './db.js';

export const REVIEW_STATES = Object.freeze([
    'unreviewed',
    'verified',
    'owner_attested',
    'reviewed_unavailable'
]);

const exactTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function normalizeNullableText(value, field) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${field} must be a non-empty string or null`);
    }
    return value.trim();
}

function normalizeExactTimestamp(value, field, { nullable = true } = {}) {
    const normalized = normalizeNullableText(value, field);
    if (normalized === null) {
        if (nullable) return null;
        throw new TypeError(`${field} is required`);
    }
    if (!exactTimestampPattern.test(normalized) || Number.isNaN(Date.parse(normalized))) {
        throw new TypeError(`${field} must be an RFC 3339 timestamp with an explicit timezone`);
    }
    const [year, month, day] = normalized.slice(0, 10).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day) {
        throw new TypeError(`${field} must contain a real calendar date`);
    }
    return normalized;
}

function normalizeDateOnly(value) {
    const normalized = normalizeNullableText(value, 'publishedOn');
    if (normalized === null) return null;
    if (!dateOnlyPattern.test(normalized)) {
        throw new TypeError('publishedOn must use YYYY-MM-DD');
    }
    const [year, month, day] = normalized.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day) {
        throw new TypeError('publishedOn must be a real calendar date');
    }
    return normalized;
}

function normalizeReview(state, reviewedAt, note) {
    if (!REVIEW_STATES.includes(state)) {
        throw new TypeError(`review state must be one of: ${REVIEW_STATES.join(', ')}`);
    }
    const normalizedReviewedAt = normalizeExactTimestamp(reviewedAt, 'reviewedAt');
    if (state === 'unreviewed' && normalizedReviewedAt !== null) {
        throw new TypeError('unreviewed facts cannot have reviewedAt');
    }
    if (state !== 'unreviewed' && normalizedReviewedAt === null) {
        throw new TypeError(`${state} facts require reviewedAt`);
    }
    return {
        state,
        reviewedAt: normalizedReviewedAt,
        note: normalizeNullableText(note, 'note')
    };
}

function requireActivePublicPerson(db, id) {
    if (!Number.isInteger(id) || id < 1) {
        throw new TypeError('public person IDs must be positive integers');
    }
    const author = db.prepare('SELECT id, is_active FROM public_people WHERE id = ?').get(id);
    if (!author) throw new Error(`Public person ${id} does not exist`);
    if (author.is_active !== 1) throw new Error(`Public person ${id} is archived`);
}

class PostPublication {
    static getAuthors(postId) {
        return getDatabase().prepare(`
            SELECT a.*, pa.position
            FROM post_public_authors pa
            JOIN public_people a ON a.id = pa.public_person_id
            WHERE pa.post_id = ?
            ORDER BY pa.position
        `).all(postId);
    }

    static replaceAuthors(postId, publicPersonIds) {
        if (!Array.isArray(publicPersonIds)
            || new Set(publicPersonIds).size !== publicPersonIds.length) {
            throw new TypeError('publicPersonIds must be an array of unique IDs');
        }
        const db = getDatabase();
        const replace = db.transaction(() => {
            const post = db.prepare(`
                SELECT authorship_review_state FROM posts WHERE id = ?
            `).get(postId);
            if (!post) throw new Error(`Post ${postId} does not exist`);
            const currentIds = db.prepare(`
                SELECT public_person_id
                FROM post_public_authors
                WHERE post_id = ?
                ORDER BY position
            `).all(postId).map(row => row.public_person_id);
            // An archived person may remain on an existing post, including a
            // deliberate reorder. Only a genuinely new assignment needs an
            // active identity.
            for (const id of publicPersonIds) {
                if (!currentIds.includes(id)) requireActivePublicPerson(db, id);
            }
            if (currentIds.length === publicPersonIds.length
                && currentIds.every((id, index) => id === publicPersonIds[index])) {
                return;
            }
            if (post.authorship_review_state !== 'unreviewed') {
                throw new Error('Reset authorship review before changing assigned authors');
            }
            db.prepare('DELETE FROM post_public_authors WHERE post_id = ?').run(postId);
            const insert = db.prepare(`
                INSERT INTO post_public_authors (post_id, public_person_id, position)
                VALUES (?, ?, ?)
            `);
            publicPersonIds.forEach((id, index) => insert.run(postId, id, index + 1));
        });
        replace.immediate();
        return PostPublication.getAuthors(postId);
    }

    static setPublisher(postId, publicPersonId) {
        const db = getDatabase();
        if (publicPersonId !== null) requireActivePublicPerson(db, publicPersonId);
        const result = db.prepare(`
            UPDATE posts SET publisher_public_person_id = ? WHERE id = ?
        `).run(publicPersonId, postId);
        if (result.changes !== 1) throw new Error(`Post ${postId} does not exist`);
        return PostPublication.getPostFacts(postId);
    }

    static setAuthorshipReview(postId, { state, reviewedAt = null, note = null }) {
        const review = normalizeReview(state, reviewedAt, note);
        const db = getDatabase();
        const authorCount = db.prepare(`
            SELECT COUNT(*) AS count FROM post_public_authors WHERE post_id = ?
        `).get(postId).count;
        if (review.state === 'reviewed_unavailable' && authorCount !== 0) {
            throw new Error('reviewed_unavailable authorship cannot have assigned authors');
        }
        if (['verified', 'owner_attested'].includes(review.state) && authorCount === 0) {
            throw new Error(`${review.state} authorship requires an assigned author`);
        }
        const result = db.prepare(`
            UPDATE posts
            SET authorship_review_state = ?, authorship_reviewed_at = ?, authorship_review_note = ?
            WHERE id = ?
        `).run(review.state, review.reviewedAt, review.note, postId);
        if (result.changes !== 1) throw new Error(`Post ${postId} does not exist`);
        return PostPublication.getPostFacts(postId);
    }

    static setPublicationHistory(postId, {
        publishedAt = null,
        publishedOn = null,
        state = 'unreviewed',
        reviewedAt = null,
        note = null
    }) {
        const exact = normalizeExactTimestamp(publishedAt, 'publishedAt');
        const dateOnly = normalizeDateOnly(publishedOn);
        if (exact !== null && dateOnly !== null) {
            throw new TypeError('publishedAt and publishedOn are mutually exclusive');
        }
        const review = normalizeReview(state, reviewedAt, note);
        if (['unreviewed', 'reviewed_unavailable'].includes(review.state)
            && (exact !== null || dateOnly !== null)) {
            throw new Error(`${review.state} publication cannot have a publication value`);
        }
        if (['verified', 'owner_attested'].includes(review.state)
            && exact === null && dateOnly === null) {
            throw new Error(`${review.state} publication requires a publication value`);
        }
        const result = getDatabase().prepare(`
            UPDATE posts
            SET published_at = ?, published_on = ?, publication_review_state = ?,
                publication_reviewed_at = ?, publication_review_note = ?
            WHERE id = ?
        `).run(exact, dateOnly, review.state, review.reviewedAt, review.note, postId);
        if (result.changes !== 1) throw new Error(`Post ${postId} does not exist`);
        return PostPublication.getPostFacts(postId);
    }

    static getPostFacts(postId) {
        const db = getDatabase();
        const post = db.prepare(`
            SELECT p.id, p.publisher_public_person_id, p.published_at, p.published_on,
                   p.modified_at, p.authorship_review_state, p.authorship_reviewed_at,
                   p.authorship_review_note, p.publication_review_state,
                   p.publication_reviewed_at, p.publication_review_note,
                   publisher.public_key AS publisher_public_key,
                   publisher.display_name AS publisher_display_name,
                   publisher.profile_url AS publisher_profile_url
            FROM posts p
            LEFT JOIN public_people publisher ON publisher.id = p.publisher_public_person_id
            WHERE p.id = ?
        `).get(postId);
        if (!post) return undefined;
        return { ...post, authors: PostPublication.getAuthors(postId) };
    }
}

export default PostPublication;
