import { createHash } from 'node:crypto';
import Post from './post.js';
import PostPublication, { REVIEW_STATES } from './post-publication.js';
import { getDatabase } from './db.js';

const asArray = value => Array.isArray(value) ? value : (value == null ? [] : [value]);
const integerId = (value, label) => {
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new TypeError(`${label} must be a positive integer`);
    }
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1 || String(id) !== String(value)) {
        throw new TypeError(`${label} must be a positive integer`);
    }
    return id;
};
const requiredText = (value, label) => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new TypeError(`${label} is required`);
    }
    return value.trim();
};
const optionalText = (value, label) => {
    if (value == null || value === '') return '';
    if (typeof value !== 'string') throw new TypeError(`${label} must be text`);
    return value.trim();
};
const evidenceNote = (value, label) => {
    const note = optionalText(value, label);
    if (note.length > 2000) throw new TypeError(`${label} must be 2000 characters or fewer`);
    return note || null;
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function normalizeContent(content, previous = null) {
    if (!content || typeof content !== 'object') throw new TypeError('Post content is required');
    const title = requiredText(content.title, 'Title');
    const body = requiredText(content.body, 'Content');
    const description = optionalText(content.description, 'Description');
    const excerpt = optionalText(content.excerpt, 'Excerpt');
    const date = requiredText(content.created_at, 'Event Date');
    const parsedDate = Date.parse(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
        || Number.isNaN(parsedDate)
        || new Date(parsedDate).toISOString().slice(0, 10) !== date) {
        throw new TypeError('Event Date must be a real YYYY-MM-DD date');
    }
    if (!Array.isArray(content.images) || !Array.isArray(content.captions)
        || content.images.length !== content.captions.length) {
        throw new TypeError('Images and captions must be matching arrays');
    }
    const created_at = previous?.created_at?.slice(0, 10) === date
        ? previous.created_at : date;
    return {
        title, body, description, excerpt, images: content.images,
        captions: content.captions, created_at
    };
}

function normalizeIds(values, label) {
    const ids = asArray(values).map(value => integerId(value, label));
    if (new Set(ids).size !== ids.length) throw new TypeError(`Duplicate ${label}`);
    return ids;
}

function validateReferences(db, ids, table, label, { allowArchived = [] } = {}) {
    const allowed = new Set(allowArchived);
    for (const id of ids) {
        const columns = table === 'public_people' ? 'id, is_active' : 'id';
        const row = db.prepare(`SELECT ${columns} FROM ${table} WHERE id = ?`).get(id);
        if (!row) throw new Error(`${label} ${id} does not exist`);
        if (table === 'public_people' && row.is_active !== 1 && !allowed.has(id)) {
            throw new Error(`${label} ${id} is archived`);
        }
    }
}

function currentState(db, postId) {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    if (!post) throw new Error(`Post ${postId} does not exist`);
    const categories = db.prepare(`
        SELECT category_id FROM post_categories WHERE post_id = ? ORDER BY category_id
    `).all(postId).map(row => row.category_id);
    const authors = db.prepare(`
        SELECT public_person_id FROM post_public_authors WHERE post_id = ? ORDER BY position
    `).all(postId).map(row => row.public_person_id);
    return { post, categories, authors };
}

function publicFacts(state) {
    const { post, categories, authors } = state;
    return {
        title: post.title, body: post.body, description: post.description ?? '',
        excerpt: post.excerpt ?? '', images: JSON.parse(post.images || '[]'),
        captions: JSON.parse(post.captions || '[]'), created_at: post.created_at,
        categories, authors, publisher: post.publisher_public_person_id,
        published_at: post.published_at, published_on: post.published_on
    };
}

function revision(state) {
    const { post } = state;
    return createHash('sha256').update(JSON.stringify({
        ...publicFacts(state),
        updated_at: post.updated_at,
        modified_at: post.modified_at,
        authorship_review_state: post.authorship_review_state,
        authorship_reviewed_at: post.authorship_reviewed_at,
        authorship_review_note: post.authorship_review_note,
        publication_review_state: post.publication_review_state,
        publication_reviewed_at: post.publication_reviewed_at,
        publication_review_note: post.publication_review_note
    })).digest('hex');
}

function requireRevision(state, token) {
    if (typeof token !== 'string' || !token || token !== revision(state)) {
        throw new Error('This post changed after the form was opened. Reload before saving.');
    }
}

function replaceCategories(db, postId, ids) {
    const current = currentState(db, postId).categories;
    const sorted = [...ids].sort((a, b) => a - b);
    if (same(current, sorted)) return;
    db.prepare('DELETE FROM post_categories WHERE post_id = ?').run(postId);
    const insert = db.prepare('INSERT INTO post_categories (post_id, category_id) VALUES (?, ?)');
    for (const id of sorted) insert.run(postId, id);
}

function validateReviewState(state, label) {
    if (!REVIEW_STATES.includes(state)) throw new TypeError(`Invalid ${label} review state`);
}

function updateAuthorship(db, postId, input, before, observedAt) {
    const action = input.authorshipAction ?? 'preserve';
    if (!['preserve', 'review', 'replace', 'reopen'].includes(action)) {
        throw new TypeError('Invalid authorship action');
    }
    const authors = normalizeIds(input.authorIds ?? before.authors, 'public Person author');
    if (action === 'preserve' || action === 'review') {
        if (!same(authors, before.authors)) {
            throw new Error('Changing authors requires an explicit replacement or review reset');
        }
    } else {
        if (action === 'replace' && before.post.authorship_review_state !== 'unreviewed') {
            throw new Error('Reset authorship review before changing assigned authors');
        }
        if (action === 'reopen' && before.post.authorship_review_state === 'unreviewed') {
            throw new Error('Authorship is already unreviewed');
        }
        validateReferences(db, authors, 'public_people', 'Public Person', {
            allowArchived: before.authors
        });
        if (action === 'reopen') {
            PostPublication.setAuthorshipReview(postId, { state: 'unreviewed' });
        }
        PostPublication.replaceAuthors(postId, authors);
    }
    if (action !== 'preserve') {
        const state = input.authorshipReviewState ?? 'unreviewed';
        validateReviewState(state, 'authorship');
        PostPublication.setAuthorshipReview(postId, {
            state,
            reviewedAt: state === 'unreviewed' ? null : observedAt,
            note: evidenceNote(input.authorshipReviewNote, 'Authorship evidence note')
        });
    }
}

function updatePublisher(db, postId, input, before) {
    const action = input.publisherAction ?? 'preserve';
    if (!['preserve', 'set'].includes(action)) throw new TypeError('Invalid publisher action');
    const id = input.publisherId == null || input.publisherId === ''
        ? null : integerId(input.publisherId, 'Publisher');
    if (action === 'preserve') {
        if (id !== null && id !== before.post.publisher_public_person_id) {
            throw new Error('Changing publisher requires an explicit publisher action');
        }
        return;
    }
    // Re-selecting an existing archived publisher preserves history; only a
    // newly assigned Person must still be active.
    if (id === before.post.publisher_public_person_id) return;
    if (id !== null) {
        validateReferences(db, [id], 'public_people', 'Publisher');
    }
    PostPublication.setPublisher(postId, id);
}

function updatePublication(postId, input, observedAt) {
    const action = input.publicationAction ?? 'preserve';
    if (!['preserve', 'review'].includes(action)) {
        throw new TypeError('Invalid publication action');
    }
    if (action === 'preserve') return;
    const state = input.publicationReviewState;
    validateReviewState(state, 'publication');
    const precision = input.publicationPrecision ?? 'unknown';
    if (!['unknown', 'exact', 'date'].includes(precision)) {
        throw new TypeError('Invalid publication precision');
    }
    if (precision !== 'exact' && input.publishedAt) {
        throw new TypeError('Exact publication time conflicts with selected precision');
    }
    if (precision !== 'date' && input.publishedOn) {
        throw new TypeError('Publication date conflicts with selected precision');
    }
    PostPublication.setPublicationHistory(postId, {
        state,
        reviewedAt: state === 'unreviewed' ? null : observedAt,
        note: evidenceNote(input.publicationReviewNote, 'Publication evidence note'),
        publishedAt: precision === 'exact' ? input.publishedAt : null,
        publishedOn: precision === 'date' ? input.publishedOn : null
    });
}

function nextModifiedAt(previous, observedAt) {
    if (!previous || observedAt > previous) return observedAt;
    return new Date(Date.parse(previous) + 1).toISOString();
}

export function createEditorialService({ now = () => new Date().toISOString() } = {}) {
    const db = getDatabase();
    const observedAt = () => {
        const value = now();
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value)
            || Number.isNaN(Date.parse(value))) {
            throw new TypeError('Editorial clock must return a UTC ISO timestamp');
        }
        return value;
    };

    return {
        snapshot(postId) {
            const id = integerId(postId, 'Post ID');
            const state = currentState(db, id);
            return {
                post: Post.findById(id),
                facts: PostPublication.getPostFacts(id),
                categories: state.categories,
                authors: state.authors,
                revisionToken: revision(state)
            };
        },

        create(input) {
            const run = db.transaction(() => {
                const content = normalizeContent(input.content);
                const categories = normalizeIds(input.categoryIds, 'category');
                const authors = normalizeIds(input.authorIds, 'public Person author');
                if (authors.length === 0) throw new Error('At least one public author is required');
                const publisher = integerId(input.publisherId, 'Publisher');
                validateReferences(db, categories, 'categories', 'Category');
                validateReferences(db, authors, 'public_people', 'Public Person');
                validateReferences(db, [publisher], 'public_people', 'Publisher');
                const duplicate = Post.checkForDuplicateTitle(content.title);
                if (duplicate) {
                    const error = new Error('A post with this title already exists');
                    error.code = 'DUPLICATE_TITLE';
                    error.existingPostId = duplicate.id;
                    error.revisionToken = revision(currentState(db, duplicate.id));
                    throw error;
                }
                const result = Post.create({
                    ...content, author_id: integerId(input.loginUserId, 'Login user')
                });
                const postId = Number(result.lastInsertRowid);
                replaceCategories(db, postId, categories);
                PostPublication.replaceAuthors(postId, authors);
                PostPublication.setPublisher(postId, publisher);
                const publishedAt = observedAt();
                // The application observed the first public insert itself. This
                // is verified provenance, not owner attestation or Event Date.
                PostPublication.setPublicationHistory(postId, {
                    publishedAt, state: 'verified', reviewedAt: publishedAt,
                    note: 'Server-observed first publication'
                });
                return postId;
            });
            return run.immediate();
        },

        update(postId, input) {
            const id = integerId(postId, 'Post ID');
            const run = db.transaction(() => {
                const before = currentState(db, id);
                requireRevision(before, input.revisionToken);
                const content = normalizeContent(input.content, before.post);
                const duplicate = Post.checkForDuplicateTitle(content.title, id);
                if (duplicate) throw new Error(`Another post already uses this title (ID: ${duplicate.id})`);
                const categories = normalizeIds(input.categoryIds, 'category');
                validateReferences(db, categories, 'categories', 'Category');
                const instant = observedAt();
                const oldContent = publicFacts(before);
                if (!same({
                    title: content.title, body: content.body, description: content.description,
                    excerpt: content.excerpt, images: content.images,
                    captions: content.captions, created_at: content.created_at
                }, {
                    title: oldContent.title, body: oldContent.body,
                    description: oldContent.description, excerpt: oldContent.excerpt,
                    images: oldContent.images, captions: oldContent.captions,
                    created_at: oldContent.created_at
                })) {
                    Post.update(id, { ...content, author_id: before.post.author_id });
                }
                replaceCategories(db, id, categories);
                updateAuthorship(db, id, input, before, instant);
                updatePublisher(db, id, input, before);
                updatePublication(id, input, instant);
                const after = currentState(db, id);
                if (!same(publicFacts(before), publicFacts(after))) {
                    db.prepare('UPDATE posts SET modified_at = ? WHERE id = ?')
                        .run(nextModifiedAt(before.post.modified_at, instant), id);
                }
                return id;
            });
            return run.immediate();
        },

        overwrite(postId, input, { revisionToken, reopenAuthorship = false } = {}) {
            const id = integerId(postId, 'Post ID');
            const before = currentState(db, id);
            requireRevision(before, revisionToken);
            if (before.post.title !== input.content?.title) {
                throw new Error('Duplicate title target changed; reload before overwriting');
            }
            const authors = normalizeIds(input.authorIds, 'public Person author');
            const changed = !same(authors, before.authors);
            if (changed && before.post.authorship_review_state !== 'unreviewed'
                && !reopenAuthorship) {
                throw new Error('Explicitly reopen reviewed authorship before overwriting');
            }
            return this.update(id, {
                ...input, revisionToken,
                authorshipAction: changed
                    ? (before.post.authorship_review_state === 'unreviewed' ? 'replace' : 'reopen')
                    : 'preserve',
                authorshipReviewState: 'unreviewed',
                publisherAction: 'set',
                publicationAction: 'preserve'
            });
        }
    };
}
