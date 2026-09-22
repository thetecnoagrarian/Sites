import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { isAdmin } from '../middleware/auth.js';
import { createEditorialService } from '../models/editorial-service.js';
import { getDatabase } from '../models/db.js';
import PublicPerson from '../models/public-person.js';
import Post from '../models/post.js';
import Category from '../models/category.js';
import { processImage } from '../utils/imageProcessor.js';

const array = value => Array.isArray(value) ? value : (value == null ? [] : [value]);
const present = value => typeof value === 'string' && value.trim() !== '';
const personId = value => {
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new TypeError('Public Person ID must be a positive integer');
    }
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1 || String(id) !== String(value)) {
        throw new TypeError('Public Person ID must be a positive integer');
    }
    return id;
};

export function parseOrderedAuthors(body) {
    const ids = array(body['authorIds[]'] ?? body.authorIds);
    const positions = array(body['authorPositions[]'] ?? body.authorPositions);
    if (ids.length !== positions.length) throw new TypeError('Author rows are incomplete');
    const selected = ids.map((id, index) => ({ id, position: positions[index] }))
        .filter(row => present(row.id));
    const used = new Set();
    for (const row of selected) {
        row.id = personId(row.id);
        row.position = Number(row.position);
        if (!Number.isSafeInteger(row.position) || row.position < 1) {
            throw new TypeError('Author positions must be positive integers');
        }
        if (used.has(row.position)) throw new TypeError('Duplicate author position');
        used.add(row.position);
    }
    selected.sort((a, b) => a.position - b.position);
    if (selected.some((row, index) => row.position !== index + 1)) {
        throw new TypeError('Author positions must be consecutive and start at 1');
    }
    return selected.map(row => row.id);
}

function formInput(body, images, captions) {
    return {
        content: {
            title: body.title, body: body.body, description: body.description,
            excerpt: body.excerpt, created_at: body.created_at, images, captions
        },
        categoryIds: array(body['categories[]'] ?? body.categories),
        authorIds: parseOrderedAuthors(body),
        publisherId: body.publisherId,
        publisherAction: body.publisherAction,
        authorshipAction: body.authorshipAction,
        authorshipReviewState: body.authorshipReviewState,
        authorshipReviewNote: body.authorshipReviewNote,
        publicationAction: body.publicationAction,
        publicationReviewState: body.publicationReviewState,
        publicationPrecision: body.publicationPrecision,
        publishedAt: body.publishedAt,
        publishedOn: body.publishedOn,
        publicationReviewNote: body.publicationReviewNote,
        revisionToken: body.revisionToken
    };
}

function authorRows(people, selectedIds = []) {
    const rows = Math.max(5, selectedIds.length + 2);
    return Array.from({ length: rows }, (_, index) => ({
        position: index + 1,
        options: people.filter(person => person.is_active || selectedIds.includes(person.id))
            .map(person => ({
                ...person, selected: person.id === selectedIds[index],
                label: `${person.display_name}${person.is_active ? '' : ' (archived)'}`
            }))
    }));
}

function personOptions(people, selectedId = null) {
    return people.filter(person => person.is_active || person.id === selectedId)
        .map(person => ({
            ...person, selected: person.id === selectedId,
            label: `${person.display_name}${person.is_active ? '' : ' (archived)'}`
        }));
}

function mediaFiles(images, uploadsPath) {
    return images.flatMap(image => ['thumbnail', 'medium', 'large']
        .map(size => image?.[size])
        .filter(value => typeof value === 'string' && /^\/uploads\/[^/]+\.webp$/.test(value))
        .map(value => ({ url: value, file: path.join(uploadsPath, path.basename(value)) })));
}

async function removePaths(paths) {
    for (const file of paths) {
        try { await fs.unlink(file); }
        catch (error) { if (error.code !== 'ENOENT') console.error('Media cleanup failed:', error); }
    }
}

// A media URL can be reused by another post. Only remove a replaced variant
// after the committed database state shows that no post still references it.
export async function removeUnreferencedMedia(images, uploadsPath) {
    const db = getDatabase();
    let referenced;
    try {
        referenced = db.prepare(`
            SELECT 1 FROM posts, json_tree(posts.images) AS media
            WHERE media.type = 'text' AND media.value = ? LIMIT 1
        `);
    } catch (error) {
        console.error('Media reference check failed:', error);
        return;
    }
    for (const { url, file } of mediaFiles(images, uploadsPath)) {
        try {
            if (!referenced.get(url)) await removePaths([file]);
        } catch (error) {
            // Cleanup is best effort after commit; a lookup failure must never
            // turn a successful save into an apparent retryable failure.
            console.error('Media reference check failed:', error);
        }
    }
}

function predictedPaths(files, uploadsPath) {
    return files.flatMap(file => ['thumbnail', 'medium', 'large'].map(size =>
        path.join(uploadsPath, `${path.parse(file.filename).name}-${size}.webp`)));
}

function captionsFor(body, count, previous = []) {
    const supplied = array(body['captions[]'] ?? body.captions);
    return Array.from({ length: count }, (_, index) => supplied[index] ?? previous[index] ?? '');
}

function flashError(req, res, error, target) {
    console.error('Editorial admin action failed:', error);
    req.flash('error', error.message);
    return res.redirect(target);
}

export function createEditorialAdminRouter({ allowOverwrite = false } = {}) {
    const router = express.Router();
    router.use(isAdmin);

    router.get('/public-people', (req, res) => {
        res.render('admin/public-people', {
            title: 'Public People', people: PublicPerson.list({ includeArchived: true }),
            user: req.user, csrfToken: req.csrfToken(), error: req.flash('error'),
            success: req.flash('success')
        });
    });
    router.post('/public-people', (req, res) => {
        try {
            PublicPerson.create({ publicKey: req.body.publicKey,
                displayName: req.body.displayName, profileUrl: req.body.profileUrl });
            req.flash('success', 'Public Person created');
            res.redirect('/admin/public-people');
        } catch (error) { flashError(req, res, error, '/admin/public-people'); }
    });
    router.post('/public-people/:id/profile', (req, res) => {
        try {
            PublicPerson.updateProfile(personId(req.params.id), {
                displayName: req.body.displayName, profileUrl: req.body.profileUrl
            });
            req.flash('success', 'Public Person updated');
            res.redirect('/admin/public-people');
        } catch (error) { flashError(req, res, error, '/admin/public-people'); }
    });
    router.post('/public-people/:id/archive', (req, res) => {
        try {
            if (!PublicPerson.archive(personId(req.params.id))) throw new Error('Person is not active');
            req.flash('success', 'Public Person archived; historical references remain');
            res.redirect('/admin/public-people');
        } catch (error) { flashError(req, res, error, '/admin/public-people'); }
    });
    router.post('/public-people/:id/unarchive', (req, res) => {
        try {
            if (!PublicPerson.unarchive(personId(req.params.id))) throw new Error('Person is not archived');
            req.flash('success', 'Public Person restored to active selections');
            res.redirect('/admin/public-people');
        } catch (error) { flashError(req, res, error, '/admin/public-people'); }
    });

    router.get('/posts/new', (req, res) => {
        const people = PublicPerson.list({ includeArchived: true });
        res.render('admin/new-post', {
            title: 'New Post', categories: Category.findAll(),
            authorRows: authorRows(people), publisherOptions: personOptions(people),
            user: req.user, csrfToken: req.csrfToken(), error: req.flash('error')
        });
    });
    router.get('/posts/:id/edit', (req, res) => {
        try {
            const snapshot = createEditorialService().snapshot(req.params.id);
            const people = PublicPerson.list({ includeArchived: true });
            const selected = snapshot.facts.authors.map(person => person.id);
            const categories = Category.findAll().map(category => ({ ...category,
                selected: snapshot.categories.includes(category.id) }));
            res.render('admin/new-post', {
                title: 'Edit Post', post: snapshot.post, categories,
                authorRows: authorRows(people, selected),
                publisherOptions: personOptions(people, snapshot.facts.publisher_public_person_id),
                facts: snapshot.facts, revisionToken: snapshot.revisionToken,
                user: req.user, csrfToken: req.csrfToken(), error: req.flash('error')
            });
        } catch (error) { flashError(req, res, error, '/admin/dashboard'); }
    });

    const upload = (req, res, next) => {
        req.app.locals.upload.array('image', 25)(req, res, async error => {
            if (error) {
                await removePaths((req.files ?? []).map(file => file.path));
                req.flash('error', error instanceof multer.MulterError
                    ? 'Image upload exceeds the configured limit' : error.message);
                return res.redirect(req.params.id
                    ? `/admin/posts/${req.params.id}/edit` : '/admin/posts/new');
            }
            if (!req.verifyCsrfToken(req.body?._csrf)) {
                await removePaths((req.files ?? []).map(file => file.path));
                return res.status(403).json({ error: 'Invalid CSRF token' });
            }
            next();
        });
    };

    router.post('/dashboard/posts/create', upload, async (req, res) => {
        const files = req.files ?? [];
        const outputDir = req.app.locals.uploadsPath;
        const generated = predictedPaths(files, outputDir);
        let retainGenerated = false;
        try {
            const images = [];
            for (const file of files) images.push(await processImage(file.path, file.filename, outputDir));
            const input = formInput(req.body, images, captionsFor(req.body, images.length));
            input.loginUserId = req.user.id;
            const service = createEditorialService();
            try {
                service.create(input);
            } catch (error) {
                if (!allowOverwrite || error.code !== 'DUPLICATE_TITLE') throw error;
                if (req.session.pendingEditorialOverwrite) {
                    await removePaths(req.session.pendingEditorialOverwrite.generated);
                }
                req.session.pendingEditorialOverwrite = {
                    input, existingPostId: error.existingPostId,
                    revisionToken: error.revisionToken, generated
                };
                retainGenerated = true;
                req.flash('warning', 'Duplicate title: review the existing post before overwriting');
                return res.redirect('/admin/posts/confirm-overwrite');
            }
            retainGenerated = true;
            req.flash('success', 'Post published');
            res.redirect('/admin/dashboard');
        } catch (error) { flashError(req, res, error, '/admin/posts/new'); }
        finally {
            await removePaths(files.map(file => file.path));
            if (!retainGenerated) await removePaths(generated);
        }
    });

    router.post('/dashboard/posts/:id/update', upload, async (req, res) => {
        const files = req.files ?? [];
        const outputDir = req.app.locals.uploadsPath;
        const generated = predictedPaths(files, outputDir);
        let committed = false;
        try {
            const previous = createEditorialService().snapshot(req.params.id);
            const images = [];
            for (const file of files) images.push(await processImage(file.path, file.filename, outputDir));
            const nextImages = files.length ? images : previous.post.images;
            const input = formInput(req.body, nextImages,
                captionsFor(req.body, nextImages.length,
                    files.length ? [] : previous.post.captions));
            createEditorialService().update(req.params.id, input);
            committed = true;
            if (files.length) await removeUnreferencedMedia(previous.post.images, outputDir);
            req.flash('success', 'Post updated');
            res.redirect('/admin/dashboard');
        } catch (error) {
            flashError(req, res, error, `/admin/posts/${req.params.id}/edit`);
        } finally {
            await removePaths(files.map(file => file.path));
            if (!committed) await removePaths(generated);
        }
    });

    if (allowOverwrite) {
        router.get('/posts/confirm-overwrite', (req, res) => {
            const pending = req.session.pendingEditorialOverwrite;
            if (!pending) return res.redirect('/admin/posts/new');
            try {
                const existing = createEditorialService().snapshot(pending.existingPostId);
                res.render('admin/confirm-overwrite', {
                    title: 'Confirm Overwrite', existingPost: existing.post,
                    facts: existing.facts, pendingPostData: pending.input.content,
                    authorNames: pending.input.authorIds.map(id => PublicPerson.findById(id)?.display_name ?? '(missing)'),
                    user: req.user, csrfToken: req.csrfToken(), error: req.flash('error')
                });
            } catch (error) { flashError(req, res, error, '/admin/posts/new'); }
        });
        router.post('/posts/confirm-overwrite', async (req, res) => {
            const pending = req.session.pendingEditorialOverwrite;
            if (!pending) return res.redirect('/admin/posts/new');
            if (req.body.action === 'cancel') {
                await removePaths(pending.generated);
                delete req.session.pendingEditorialOverwrite;
                return res.redirect('/admin/posts/new');
            }
            if (req.body.action !== 'overwrite') return res.status(400).send('Invalid action');
            try {
                const service = createEditorialService();
                const before = service.snapshot(pending.existingPostId);
                service.overwrite(pending.existingPostId, pending.input, {
                    revisionToken: pending.revisionToken,
                    reopenAuthorship: req.body.reopenAuthorship === 'yes'
                });
                delete req.session.pendingEditorialOverwrite;
                await removeUnreferencedMedia(before.post.images, req.app.locals.uploadsPath);
                req.flash('success', 'Existing post overwritten; first publication preserved');
                res.redirect('/admin/dashboard');
            } catch (error) { flashError(req, res, error, '/admin/posts/confirm-overwrite'); }
        });
    }
    return router;
}
