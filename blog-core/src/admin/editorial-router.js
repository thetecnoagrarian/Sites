import { asyncHandler } from '../utils/asyncHandler.js';
import express from 'express';
import multer from 'multer';
import { isAdmin } from '../middleware/auth.js';
import { createEditorialService } from '../models/editorial-service.js';
import { cleanupOwnedUploads } from '../middleware/owned-upload.js';
import PublicPerson from '../models/public-person.js';
import Post from '../models/post.js';
import Category from '../models/category.js';
import { logSafeError, readDiagnosticProperty } from '../utils/error-diagnostics.js';
import { preparePostCandidate, verifyStoredPostCandidate } from '../utils/private-media.js';
import { getDatabase } from '../models/db.js';
import { mountGalleryDrafts } from './gallery-drafts.js';
import { allocateMediaOperation, readMediaOperation, prepareMediaOperation, markPendingOverwrite,
    cancelMediaOperation, verifyMediaAcceptance, submissionDigest, mediaDigest, publishedMediaCandidate,
    readPendingOverwrite } from '../models/media-publication.js';

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

function captionsFor(body, count, previous = []) {
    const supplied = array(body['captions[]'] ?? body.captions);
    return Array.from({ length: count }, (_, index) => supplied[index] ?? previous[index] ?? '');
}

function flashError(req, res, error, target, redirect = path => res.redirect(path)) {
    logSafeError(error, { request: req });
    const code = readDiagnosticProperty(error, 'code');
    const message = readDiagnosticProperty(error, 'message');
    const mediaOutcome = readDiagnosticProperty(error, 'mediaOutcome');
    if (code === 'PENDING_INPUT_TOO_LARGE') {
        return res.status(413).set('Cache-Control', 'no-store').json({
            error: typeof message === 'string' ? message : 'Pending snapshot too large',
            actualBytes: readDiagnosticProperty(error, 'actualBytes'), maxBytes: readDiagnosticProperty(error, 'maxBytes') });
    }
    const databaseUnavailable = /^SQLITE_/.test(typeof code === 'string' ? code : '') || /(?:database|connection).*(?:closed|not open)/i.test(typeof message === 'string' ? message : '');
    if (code === 'MEDIA_OUTCOME_UNKNOWN' || mediaOutcome === 'unknown'
        || (req.body.mediaOperationId && databaseUnavailable && !mediaOutcome)) {
        return res.status(503).set('Cache-Control', 'no-store').json({
            error: 'Editorial outcome unknown. Check the operation status before retrying.',
            operationId: req.body.mediaOperationId, state: 'unknown' });
    }
    req.flash('error', typeof message === 'string' ? message : 'Editorial action failed');
    return redirect(target);
}

export function createEditorialAdminRouter({ allowOverwrite = false, bodyGallery = null } = {}) {
    const router = express.Router();
    router.use(isAdmin);
    const drafts = bodyGallery && mountGalleryDrafts(router, bodyGallery);
    const confirmationUrl = id => `/admin/posts/confirm-overwrite?mediaOperationId=${encodeURIComponent(id)}`;
    const publishRedirect = (req, res, url) => drafts && req.body.galleryDraftId && req.get('accept') === 'application/json'
        ? res.set('Cache-Control', 'private, no-store').json({ redirect: url }) : res.redirect(url);

    const accepted = async (req, res, id) => {
        res.set('Cache-Control', 'no-store');
        let operation;
        try { operation = readMediaOperation(getDatabase(), id, req.user.id); }
        catch (error) {
            logSafeError(error, { request: req });
            const unavailable = new Error('Editorial outcome unknown. Check the operation status before retrying.');
            unavailable.code = 'MEDIA_OUTCOME_UNKNOWN';
            throw unavailable;
        }
        if (operation.state !== 'published') throw new Error('Acceptance could not be confirmed');
        try {
            for (const candidateId of operation.data.required) {
                await verifyStoredPostCandidate(req.app.locals.uploadsPath, publishedMediaCandidate(getDatabase(), candidateId));
            }
        } catch (error) {
            logSafeError(error, { request: req });
            return res.status(409).json({ operationId: id, state: 'published', receipt: operation.data.receipt,
                error: 'Article accepted; required media could not be verified. Do not submit a new operation.' });
        }
        try {
            req.flash('success', `Post accepted (ID ${operation.data.receipt.postId})`);
            return publishRedirect(req, res, '/admin/dashboard');
        } catch (error) {
            logSafeError(error, { request: req });
            return res.status(503).json({ operationId: id, state: 'published', receipt: operation.data.receipt,
                error: 'Article accepted; response handling failed. Check operation status before retrying.' });
        }
    };
    const submission = async (req, action, postId = null) => {
        const db = getDatabase();
        const id = req.body.mediaOperationId;
        let operation = readMediaOperation(db, id, req.user.id);
        if (operation.data.context.action !== action || operation.data.context.postId !== postId) throw new Error('Media operation target changed');
        const files = req.files ?? [];
        let draft = drafts?.bind(req, operation, postId);
        const fingerprintInput = formInput(req.body, [], array(req.body['captions[]'] ?? req.body.captions));
        if (draft) fingerprintInput.gallery = { draftId: draft.id, revision: req.body.galleryDraftRevision,
            selection: req.body.bodyGalleryItems, known: req.body.galleryKnownPhotos };
        const digest = await submissionDigest(fingerprintInput, files, req.app.locals.uploadsPath);
        if (draft) {
            operation = readMediaOperation(db, id, req.user.id);
            draft = drafts.bind(req, operation, postId);
            if (operation.state === 'allocated') drafts.assertCurrent(req, draft);
            else if (operation.state === 'cancelled' || operation.data.submission !== digest) throw drafts.conflict(draft);
        }
        if (operation.state === 'cancelled') throw new Error('Media operation was cancelled; reload the editor');
        if (operation.state !== 'allocated' && operation.data.submission !== digest) throw new Error('Changed submission cannot reuse a media operation');
        if (operation.state === 'published') return { id, published: true };
        const previous = action === 'update' ? createEditorialService().snapshot(postId) : null;
        const oldImages = files.length ? [] : previous?.post.images ?? [];
        let input = formInput(req.body, oldImages, captionsFor(req.body, files.length || oldImages.length,
            files.length ? [] : previous?.post.captions ?? []));
        const gallery = drafts?.publish(req, draft, previous?.post);
        if (gallery) input.content.body_gallery = gallery.gallery;
        if (action === 'create') input.loginUserId = req.user.id;
        let candidates = operation.data.candidates;
        if (operation.state === 'allocated') {
            candidates = [];
            for (const file of files) {
                const result = await (req.app.locals.preparePostCandidate ?? preparePostCandidate)({
                    uploadsPath: req.app.locals.uploadsPath, inputPath: file.path });
                candidates.push({ id: result.candidate.id, image: result.image, files: result.files });
            }
            candidates.push(...(gallery?.candidates ?? []));
        }
        if (files.length) input.content.images = candidates.slice(0, files.length).map(item => item.image);
        let stored = operation;
        const prepare = () => prepareMediaOperation(db, id, req.user.id, digest, input, candidates);
        if (operation.state === 'allocated') {
            stored = draft ? db.transaction(() => {
                const current = readMediaOperation(db, id, req.user.id);
                const latest = drafts.bind(req, current, postId);
                if (current.state === 'allocated') {
                    drafts.assertCurrent(req, latest);
                    drafts.save(req, latest);
                } else if (current.state === 'cancelled' || current.data.submission !== digest) {
                    throw drafts.conflict(latest);
                }
                return prepare();
            }).immediate() : prepare();
        }
        if (stored.state === 'published') return { id, published: true };
        if (files.length) input.content.images = stored.data.candidates.slice(0, files.length).map(item => item.image);
        if (stored.data.pending) input.revisionToken = stored.data.pending.revisionToken;
        return { id, input, pending: stored.data.pending };
    };

    router.get('/media-operations/:id', asyncHandler(async (req, res) => {
        try {
            const operation = readMediaOperation(getDatabase(), req.params.id, req.user.id);
            res.set('Cache-Control', 'no-store').json({ operationId: operation.id, state: operation.state, receipt: operation.data.receipt });
        } catch (error) {
            logSafeError(error, { request: req });
            res.status(503).set('Cache-Control', 'no-store').json({ state: 'unknown', error: 'Operation status unavailable' });
        }
    }));

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
        try {
            const people = PublicPerson.list({ includeArchived: true });
            const editor = drafts?.open(req, null) ?? { mediaOperationId: allocateMediaOperation(getDatabase(), req.user.id, 'create') };
            if (editor.redirect) return res.redirect(editor.redirect);
            if (drafts) res.set('Cache-Control', 'private, no-store');
            res.render('admin/new-post', {
                ...editor, title: 'New Post', categories: Category.findAll(),
                authorRows: authorRows(people), publisherOptions: personOptions(people),
                user: req.user, csrfToken: req.csrfToken(), error: req.flash('error')
            });
        } catch (error) { flashError(req, res, error, '/admin/dashboard'); }
    });
    router.get('/posts/:id/edit', (req, res) => {
        try {
            const snapshot = createEditorialService().snapshot(req.params.id);
            const people = PublicPerson.list({ includeArchived: true });
            const selected = snapshot.facts.authors.map(person => person.id);
            const categories = Category.findAll().map(category => ({ ...category,
                selected: snapshot.categories.includes(category.id) }));
            const postId = Number(req.params.id);
            const editor = drafts?.open(req, postId, snapshot.post) ?? { mediaOperationId: allocateMediaOperation(getDatabase(), req.user.id, 'update', postId) };
            if (editor.redirect) return res.redirect(editor.redirect);
            if (drafts) res.set('Cache-Control', 'private, no-store');
            res.render('admin/new-post', {
                ...editor,
                title: 'Edit Post', post: snapshot.post, categories,
                authorRows: authorRows(people, selected),
                publisherOptions: personOptions(people, snapshot.facts.publisher_public_person_id),
                facts: snapshot.facts, revisionToken: snapshot.revisionToken,
                user: req.user, csrfToken: req.csrfToken(), error: req.flash('error')
            });
        } catch (error) { flashError(req, res, error, '/admin/dashboard'); }
    });

    const upload = (req, res, next) => {
        req.app.locals.upload.array('image', 25)(req, res, error => asyncHandler(async () => {
            if (error) {
                logSafeError(error, { request: req });
                await cleanupOwnedUploads(req);
                req.flash('error', error instanceof multer.MulterError
                    ? 'Image upload exceeds the configured limit' : error.message);
                return res.redirect(req.params.id
                    ? `/admin/posts/${req.params.id}/edit` : '/admin/posts/new');
            }
            if (!req.verifyCsrfToken(req.body?._csrf)) {
                await cleanupOwnedUploads(req);
                return res.status(403).json({ error: 'Invalid CSRF token' });
            }
            next();
        })(req, res, next));
    };
    const draftRedirect = (req, path) => drafts && typeof req.body.galleryDraftId === 'string'
        && /^[0-9a-f-]{36}$/.test(req.body.galleryDraftId) ? `${path}?draft=${req.body.galleryDraftId}` : path;
    const saveDraft = (req, res, postId) => {
        res.set('Cache-Control', 'private, no-store');
        try {
            if (req.files?.length) return res.status(400).json({ error: 'Add new highlights when publishing. Save or preview the documentary draft separately.' });
            const operation = readMediaOperation(getDatabase(), req.body.mediaOperationId, req.user.id);
            const draft = drafts.bind(req, operation, postId);
            if (!draft) return res.status(409).json({ error: 'Reopen the draft before editing.' });
            return res.json(drafts.save(req, draft));
        } catch (error) { return drafts.error(req, res, error); }
    };
    const publishError = (req, res, error, path) => error?.editUrl && drafts
        ? drafts.error(req, res, error)
        : flashError(req, res, error, draftRedirect(req, path), url => publishRedirect(req, res, url));

    router.post('/dashboard/posts/create', upload, asyncHandler(async (req, res) => {
        let endPublication;
        try {
            if (drafts && req.body.submitIntent === 'draft') return saveDraft(req, res, null);
            endPublication = drafts?.beginPublication(req);
            const prepared = await submission(req, 'create');
            if (prepared.published) return await accepted(req, res, prepared.id);
            const { input, id } = prepared;
            if (prepared.pending) {
                readPendingOverwrite(getDatabase(), id, req.user.id);
                return publishRedirect(req, res, confirmationUrl(id));
            }
            input.mediaAcceptance = await verifyMediaAcceptance({ db: getDatabase(), uploadsPath: req.app.locals.uploadsPath,
                id, ownerId: req.user.id, input, action: 'create' });
            const service = createEditorialService();
            try {
                service.create(input);
            } catch (error) {
                if (!allowOverwrite || error.code !== 'DUPLICATE_TITLE') throw error;
                delete input.mediaAcceptance;
                input.revisionToken = error.revisionToken;
                markPendingOverwrite(getDatabase(), id, req.user.id, { postId: error.existingPostId, revisionToken: error.revisionToken }, input);
                req.flash('warning', 'Duplicate title: review the existing post before overwriting');
                return publishRedirect(req, res, confirmationUrl(id));
            }
            return await accepted(req, res, id);
        } catch (error) { publishError(req, res, error, '/admin/posts/new'); }
        finally {
            endPublication?.();
            await cleanupOwnedUploads(req);
        }
    }));

    router.post('/dashboard/posts/:id/update', upload, asyncHandler(async (req, res) => {
        let endPublication;
        try {
            if (drafts && req.body.submitIntent === 'draft') return saveDraft(req, res, Number(req.params.id));
            endPublication = drafts?.beginPublication(req);
            const prepared = await submission(req, 'update', Number(req.params.id));
            if (prepared.published) return await accepted(req, res, prepared.id);
            const { id, input } = prepared;
            input.mediaAcceptance = await verifyMediaAcceptance({ db: getDatabase(), uploadsPath: req.app.locals.uploadsPath,
                id, ownerId: req.user.id, input, action: 'update', postId: Number(req.params.id) });
            createEditorialService().update(req.params.id, input);
            return await accepted(req, res, id);
        } catch (error) {
            publishError(req, res, error, `/admin/posts/${req.params.id}/edit`);
        } finally {
            endPublication?.();
            await cleanupOwnedUploads(req);
        }
    }));

    if (allowOverwrite) {
        router.get('/posts/confirm-overwrite', (req, res) => {
            res.set('Cache-Control', 'no-store');
            try {
                const operation = readMediaOperation(getDatabase(), req.query.mediaOperationId, req.user.id);
                if (!operation.data.pending) throw new Error('Overwrite operation unavailable');
                if (operation.state !== 'prepared') return res.status(409).json({
                    operationId: operation.id, state: operation.state, receipt: operation.data.receipt });
                const pending = readPendingOverwrite(getDatabase(), operation.id, req.user.id);
                const existing = createEditorialService().snapshot(pending.postId);
                res.render('admin/confirm-overwrite', {
                    mediaOperationId: operation.id,
                    title: 'Confirm Overwrite', existingPost: existing.post,
                    facts: existing.facts, pendingPostData: pending.input.content,
                    authorNames: pending.input.authorIds.map(id => PublicPerson.findById(id)?.display_name ?? '(missing)'),
                    user: req.user, csrfToken: req.csrfToken(), error: req.flash('error')
                });
            } catch (error) { flashError(req, res, error, '/admin/posts/new'); }
        });
        router.post('/posts/confirm-overwrite', asyncHandler(async (req, res) => {
            res.set('Cache-Control', 'no-store');
            if (!['overwrite', 'cancel'].includes(req.body.action)) return res.status(400).send('Invalid action');
            if (Object.keys(req.body).some(key => !['_csrf', 'mediaOperationId', 'action', 'reopenAuthorship'].includes(key))) {
                return res.status(400).send('Confirmation cannot change editorial content');
            }
            try {
                const id = req.body.mediaOperationId;
                const operation = readMediaOperation(getDatabase(), id, req.user.id);
                if (!operation.data.pending) throw new Error('Reload the editor: overwrite operation unavailable');
                if (req.body.action === 'cancel') {
                    const receipt = cancelMediaOperation(getDatabase(), id, req.user.id);
                    return receipt ? await accepted(req, res, id) : res.redirect('/admin/posts/new');
                }
                const reopenAuthorship = req.body.reopenAuthorship === 'yes';
                if (operation.state === 'published') {
                    const binding = mediaDigest({ action: 'overwrite', postId: operation.data.pending.postId,
                        inputHash: operation.data.inputHash, reopenAuthorship });
                    if (binding !== operation.data.receipt.binding) throw new Error('Changed confirmation cannot reuse a receipt');
                    return await accepted(req, res, id);
                }
                if (operation.state !== 'prepared') throw new Error('Overwrite operation is not prepared');
                const pending = readPendingOverwrite(getDatabase(), id, req.user.id);
                const input = { ...pending.input };
                input.mediaAcceptance = await verifyMediaAcceptance({ db: getDatabase(), uploadsPath: req.app.locals.uploadsPath,
                    id, ownerId: req.user.id, input, action: 'overwrite', postId: pending.postId, reopenAuthorship });
                const service = createEditorialService();
                service.overwrite(pending.postId, input, {
                    revisionToken: pending.revisionToken,
                    reopenAuthorship
                });
                return await accepted(req, res, id);
            } catch (error) { flashError(req, res, error, confirmationUrl(req.body.mediaOperationId)); }
        }));
    }
    return router;
}
