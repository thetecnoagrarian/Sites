import { createHash, randomUUID } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import { getDatabase } from '../models/db.js';
import Post from '../models/post.js';
import { allocateMediaOperation, cancelMediaOperation, readMediaOperation } from '../models/media-publication.js';
import { BODY_GALLERY_LIMITS, normalizeBodyGallery } from '../models/body-gallery.js';
import { checkedMediaPath, hashPrivateRawUpload, managedMediaSegments, MEDIA_ID,
    preparePostCandidate, verifyStoredPostCandidate } from '../utils/private-media.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logSafeError } from '../utils/error-diagnostics.js';
import { processImage } from '../utils/imageProcessor.js';
import rateLimit from 'express-rate-limit';

const uuid = new RegExp(`^${MEDIA_ID}$`);
const variants = ['thumbnail', 'medium', 'large'];
const maxStaged = 200;
const galleryRequestPrefix = `/admin/gallery-drafts/${MEDIA_ID}`;
const uploadRequest = new RegExp(`^${galleryRequestPrefix}/images$`);
const imageRequest = new RegExp(`^${galleryRequestPrefix}/media/${MEDIA_ID}/(?:thumbnail|medium|large)$`);
export function isGalleryMediaRequest(method, pathname) {
    if (method === 'POST') return uploadRequest.test(pathname);
    return ['GET', 'HEAD'].includes(method) && imageRequest.test(pathname);
}
const fieldNames = new Set(['title', 'body', 'description', 'excerpt', 'created_at', 'categories[]', 'categories',
    'authorIds[]', 'authorIds', 'authorPositions[]', 'authorPositions', 'publisherId', 'publisherAction', 'authorshipAction',
    'authorshipReviewState', 'authorshipReviewNote', 'publicationAction', 'publicationReviewState',
    'publicationPrecision', 'publishedAt', 'publishedOn', 'publicationReviewNote', 'captions[]', 'captions',
    'bodyGalleryItems', 'revisionToken']);

function fail(message, status = 400) {
    throw Object.assign(new Error(message), { galleryStatus: status });
}
function readDraft(id, owner) {
    if (typeof id !== 'string' || !uuid.test(id)) fail('Draft not found.', 404);
    const row = getDatabase().prepare('SELECT * FROM gallery_drafts WHERE id = ? AND owner_user_id = ?').get(id, owner);
    if (!row) fail('Draft not found.', 404);
    return { ...row, staged: JSON.parse(row.staged), saved: row.fields ? JSON.parse(row.fields) : null };
}
function editable(draft) {
    if (readMediaOperation(getDatabase(), draft.operation_id, draft.owner_user_id).state !== 'allocated') {
        throw conflict(draft, 'A publication attempt is pending. Open the current draft to check its status.');
    }
}
const editUrl = draft => `/admin/posts/${draft.post_id === null ? 'new' : `${draft.post_id}/edit`}?draft=${draft.id}`;
const previewUrl = draft => `/admin/gallery-drafts/${draft.id}/preview`;
const privateUrl = (draft, id, variant) => `/admin/gallery-drafts/${draft.id}/media/${id}/${variant}`;

function conflict(draft, message = 'This draft changed in another tab. Your unsaved edits are still in this tab.') {
    return Object.assign(new Error(message), { galleryStatus: 409, editUrl: editUrl(draft) });
}

function knownPhotos(draft, value) {
    if (typeof value !== 'string' || Buffer.byteLength(value) > maxStaged * 39 + 2) fail('Known photos are invalid.');
    let ids;
    try { ids = JSON.parse(value); } catch { fail('Known photos are invalid.'); }
    if (!Array.isArray(ids) || ids.length > maxStaged || new Set(ids).size !== ids.length
        || ids.some(id => typeof id !== 'string' || !uuid.test(id))) fail('Known photos are invalid.');
    const staged = new Set(Object.values(draft.staged).map(entry => entry.candidate.id));
    if (ids.some(id => !staged.has(id))) fail('That photograph does not belong to this draft.', 403);
    return ids;
}

function selectedItems(value) {
    if (typeof value !== 'string' || Buffer.byteLength(value) > BODY_GALLERY_LIMITS.serializedBytes) fail('Gallery selection exceeds its size limit.');
    let items;
    try { items = JSON.parse(value); } catch { fail('Gallery selection is invalid.'); }
    if (!Array.isArray(items) || items.length > BODY_GALLERY_LIMITS.items) fail('Select at most 100 documentary photographs.');
    if (items.some(item => !item || typeof item.id !== 'string' || typeof item.alt !== 'string'
        || typeof item.caption !== 'string' || Object.keys(item).length !== 3)) fail('Gallery selection is invalid.');
    return items;
}
function galleryAsset(candidate) {
    const { thumbnail, medium, large, originalWidth, originalHeight } = candidate.image;
    return { thumbnail, medium, large, originalWidth, originalHeight };
}
function gallerySelection(draft, selection, previous, { final = false } = {}) {
    if (previous?.body_gallery_error) fail('The stored gallery needs repair before it can be edited.', 409);
    const current = new Map((previous?.body_gallery?.items ?? []).map(item => [item.id, item.asset]));
    const staged = new Map(Object.values(draft.staged).map(({ candidate }) => [candidate.id, candidate]));
    const candidates = [];
    const items = selectedItems(selection).map(({ id, alt, caption }) => {
        const candidate = staged.get(id);
        const asset = current.get(id) ?? (candidate && galleryAsset(candidate));
        if (!asset) fail('That photograph does not belong to this draft or post.', 403);
        if (candidate && !current.has(id)) candidates.push(candidate);
        return { id, asset, alt: final ? alt : alt.trim() ? alt : 'Documentary photograph', caption };
    });
    try { return { gallery: normalizeBodyGallery({ version: 1, items }), candidates }; }
    catch (error) { fail(error.message); }
}
function withPrivateImages(draft, gallery) {
    const privateIds = new Set(Object.values(draft.staged).map(({ candidate }) => candidate.id));
    return (gallery?.items ?? []).map(item => ({
        ...item,
        src: privateIds.has(item.id) ? privateUrl(draft, item.id, 'medium') : item.asset.medium,
        href: privateIds.has(item.id) ? privateUrl(draft, item.id, 'large') : item.asset.large
    }));
}

export function mountGalleryDrafts(router, { validatePlacement, renderPreview }) {
    const activeUploads = new Map();
    const activePublications = new Map();
    const galleryTrafficLimit = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: req => req.method === 'POST' ? 130 : 400,
        keyGenerator: req => `${req.method === 'POST' ? 'upload' : 'preview'}:${req.user.id}`,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Gallery request limit reached. Wait before retrying.' }
    });
    function owner(req) { return req.user.id; }
    function report(req, res, error) {
        logSafeError(error, { request: req });
        res.status(error.galleryStatus ?? 503).set('Cache-Control', 'private, no-store').json({
            error: error.galleryStatus ? error.message : 'Draft operation could not be confirmed. Reopen the draft before retrying.',
            ...(error.editUrl ? { editUrl: error.editUrl, conflict: true } : {})
        });
    }
    router.use('/gallery-drafts', (req, res, next) => {
        res.set('Cache-Control', 'private, no-store');
        res.set('X-Robots-Tag', 'noindex, nofollow');
        if (req.method !== 'POST' && isGalleryMediaRequest(req.method, `/admin/gallery-drafts${req.path}`)) return galleryTrafficLimit(req, res, next);
        return next();
    });
    router.get('/gallery-drafts', (req, res) => {
        const drafts = getDatabase().prepare(`SELECT d.id, d.post_id, d.updated_at,
            json_extract(d.fields, '$.form.title') AS title FROM gallery_drafts d
            JOIN media_publications m ON m.id = d.operation_id
            WHERE d.owner_user_id = ? AND m.state <> 'published' AND (d.fields IS NOT NULL OR d.staged <> '{}')
            ORDER BY d.updated_at DESC, d.id LIMIT 100`).all(owner(req));
        res.render('admin/gallery-drafts', { title: 'Gallery drafts', drafts: drafts.map(draft => ({
            ...draft, editUrl: editUrl(draft)
        })) });
    });
    router.post('/gallery-drafts/:id/images', galleryTrafficLimit, asyncHandler(async (req, res) => {
        if (!req.verifyCsrfToken(req.get('x-csrf-token'))) return res.status(403).json({ error: 'Invalid CSRF token.' });
        const editor = owner(req);
        if (activeUploads.has(editor)) return res.status(409).json({ error: 'Wait for the current photo to finish.' });
        activeUploads.set(editor, true);
        let parsed, result, failure;
        try {
            editable(readDraft(req.params.id, editor));
            parsed = await req.app.locals.galleryPhotoUpload(req, res);
            const { fields, file, error } = parsed;
            if (error?.galleryStatus) throw error;
            if (error?.code?.startsWith('LIMIT_')) fail('Photo upload exceeds a multipart limit.', 413);
            if (error || !file) fail('Upload one supported image within the site file size limit.');
            if (Object.keys(fields).some(name => name !== '_csrf' && name !== 'uploadId')) fail('Unexpected photo upload field.');
            if (!req.verifyCsrfToken(fields._csrf)) fail('Invalid CSRF token.', 403);
            const key = fields.uploadId;
            if (typeof key !== 'string' || !uuid.test(key)) fail('Upload identity is invalid.');
            const draft = readDraft(req.params.id, editor);
            editable(draft);
            const root = req.app.locals.uploadsPath;
            const digest = await hashPrivateRawUpload(root, file.path);
            let recorded = draft.staged[key];
            if (!recorded) {
                if (Object.keys(draft.staged).length >= maxStaged) fail('This draft has reached its private upload limit.', 409);
                let candidate;
                try {
                    const prepared = await preparePostCandidate({
                        uploadsPath: root, inputPath: file.path,
                        processor: (input, name, output) => processImage(input, name, output, { orient: true })
                    });
                    candidate = { id: prepared.candidate.id, image: prepared.image, files: prepared.files };
                    await verifyStoredPostCandidate(root, candidate);
                } catch (error) {
                    logSafeError(error, { request: req });
                    fail('The photo could not be opened or prepared. Check its format and retry.');
                }
                const db = getDatabase();
                recorded = db.transaction(() => {
                    const latest = readDraft(draft.id, owner(req));
                    editable(latest);
                    if (latest.staged[key]) return latest.staged[key];
                    if (Object.keys(latest.staged).length >= maxStaged) fail('This draft has reached its private upload limit.', 409);
                    const entry = { digest, candidate, revision: latest.revision + 1 };
                    latest.staged[key] = entry;
                    db.prepare(`UPDATE gallery_drafts SET staged = ?, revision = revision + 1,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
                        .run(JSON.stringify(latest.staged), draft.id);
                    return entry;
                }).immediate();
            }
            if (recorded.digest !== digest) fail('This upload identity belongs to different bytes.', 409);
            result = { id: recorded.candidate.id, src: privateUrl(draft, recorded.candidate.id, 'thumbnail'), revision: recorded.revision };
        } catch (error) { failure = error; }
        finally {
            try { await parsed?.cleanup?.(); } finally { activeUploads.delete(editor); }
        }
        if (res.destroyed) return;
        return failure ? report(req, res, failure) : res.json(result);
    }));

    router.post('/gallery-drafts/:id/resume', (req, res) => {
        try {
            if (!req.verifyCsrfToken(req.body?._csrf)) fail('Invalid CSRF token.', 403);
            const db = getDatabase();
            const draft = db.transaction(() => {
                const current = readDraft(req.params.id, owner(req));
                const { operation_id: id, post_id: postId } = current;
                if (req.body.mediaOperationId !== id) throw conflict(current);
                if (activePublications.has(`${owner(req)}:${id}`)) throw conflict(current, 'Publication is still in progress. Check the current draft again shortly.');
                const operation = readMediaOperation(db, id, owner(req));
                if (operation.state === 'cancelled' || (operation.state === 'prepared' && !operation.data.pending)) {
                    cancelMediaOperation(db, id, owner(req));
                    const replacement = allocateMediaOperation(db, owner(req), postId === null ? 'create' : 'update', postId);
                    db.prepare('UPDATE gallery_drafts SET operation_id = ?, revision = revision + 1 WHERE id = ?').run(replacement, current.id);
                }
                return current;
            }).immediate();
            return res.redirect(editUrl(draft));
        } catch (error) { return report(req, res, error); }
    });
    router.get('/gallery-drafts/:id/media/:candidate/:variant', asyncHandler(async (req, res) => {
        let handle;
        try {
            const draft = readDraft(req.params.id, owner(req));
            const { candidate: id, variant } = req.params;
            const record = Object.values(draft.staged).find(entry => entry.candidate.id === id)?.candidate;
            if (!record || !variants.includes(variant)) return res.sendStatus(404);
            const segments = managedMediaSegments({ kind: 'post', id, variant });
            const checked = await checkedMediaPath(req.app.locals.uploadsPath, segments, { singleLink: true });
            handle = await fs.open(checked.path, constants.O_RDONLY | constants.O_NOFOLLOW);
            const stat = await handle.stat({ bigint: true });
            if (!stat.isFile() || stat.nlink !== 1n || stat.ino !== checked.stat.ino || stat.dev !== checked.stat.dev
                || stat.size !== BigInt(record.files[variant].bytes)) return res.sendStatus(404);
            const data = await handle.readFile();
            if (createHash('sha256').update(data).digest('hex') !== record.files[variant].sha256) return res.sendStatus(404);
            return res.type('image/webp').send(data);
        } catch (error) {
            if (error.galleryStatus !== 404) logSafeError(error, { request: req });
            return res.sendStatus(404);
        } finally { await handle?.close(); }
    }));
    router.get('/gallery-drafts/:id/preview', (req, res) => {
        try {
            const draft = readDraft(req.params.id, owner(req));
            const fields = draft.saved?.form;
            if (!fields) fail('Save the draft before previewing.', 404);
            const previous = draft.post_id === null ? null : Post.findById(draft.post_id);
            const selection = fields.bodyGalleryItems
                ? gallerySelection(draft, fields.bodyGalleryItems, previous).gallery : previous?.body_gallery;
            return renderPreview(req, res, {
                draftUrl: editUrl(draft), previous, fields, items: withPrivateImages(draft, selection)
            });
        } catch (error) { return report(req, res, error); }
    });

    return {
        beginPublication(req) {
            const id = req.body.mediaOperationId;
            if (typeof id !== 'string' || !uuid.test(id)) return;
            const key = `${owner(req)}:${id}`;
            activePublications.set(key, (activePublications.get(key) ?? 0) + 1);
            return () => {
                const remaining = activePublications.get(key) - 1;
                if (remaining) activePublications.set(key, remaining);
                else activePublications.delete(key);
            };
        },
        open(req, postId, previous) {
            const db = getDatabase();
            const draft = req.query.draft === undefined ? db.transaction(() => {
                const id = randomUUID();
                const operation = allocateMediaOperation(db, owner(req), postId === null ? 'create' : 'update', postId);
                db.prepare('INSERT INTO gallery_drafts (id, owner_user_id, post_id, operation_id) VALUES (?, ?, ?, ?)')
                    .run(id, owner(req), postId, operation);
                return readDraft(id, owner(req));
            }).immediate() : readDraft(req.query.draft, owner(req));
            if (draft.post_id !== postId) fail('Draft not found for this post.', 404);
            const operation = readMediaOperation(db, draft.operation_id, owner(req));
            if (operation.state === 'published') return { redirect: '/admin/dashboard' };
            if (operation.state === 'prepared' && operation.data.pending) {
                return { redirect: `/admin/posts/confirm-overwrite?mediaOperationId=${operation.id}` };
            }
            const form = draft.saved?.form ?? {};
            const staged = new Map(Object.values(draft.staged).map(({ candidate }) => [candidate.id, candidate]));
            const saved = form.bodyGalleryItems ? selectedItems(form.bodyGalleryItems) : previous?.body_gallery?.items ?? [];
            const items = saved.map(({ id, alt, caption }) => ({
                id, alt, caption, staged: staged.has(id), src: staged.has(id) ? privateUrl(draft, id, 'thumbnail')
                    : previous?.body_gallery?.items.find(item => item.id === id)?.asset.thumbnail
            }));
            const seen = new Set(draft.saved?.seen ?? []);
            for (const id of staged.keys()) {
                if (items.length === BODY_GALLERY_LIMITS.items) break;
                if (!seen.has(id) && !items.some(item => item.id === id)) {
                    items.push({ id, alt: '', caption: '', staged: true, src: privateUrl(draft, id, 'thumbnail') });
                }
            }
            return {
                mediaOperationId: draft.operation_id, galleryDraftId: draft.id, galleryPreviewUrl: previewUrl(draft),
                galleryDraftRevision: draft.revision, galleryPublicationPending: operation.state !== 'allocated',
                galleryPublicationInProgress: activePublications.has(`${owner(req)}:${draft.operation_id}`),
                galleryEditorData: JSON.stringify({ form, items }), galleryEditDisabled: Boolean(previous?.body_gallery_error)
            };
        },
        bind(req, operation, postId) {
            if (req.body.galleryDraftId === undefined) {
                if (req.body.bodyGalleryItems !== undefined || req.body.submitIntent === 'draft') fail('Reload the gallery editor.');
                return null;
            }
            const draft = readDraft(req.body.galleryDraftId, owner(req));
            if (draft.post_id !== postId) fail('Draft does not belong to this post.', 404);
            if (draft.operation_id !== operation.id) throw conflict(draft);
            return draft;
        },
        assertCurrent(req, draft) {
            if (String(draft.revision) !== req.body.galleryDraftRevision) throw conflict(draft);
        },
        conflict,
        save(req, draft) {
            const db = getDatabase();
            return db.transaction(() => {
                const latest = readDraft(draft.id, owner(req));
                if (latest.operation_id !== draft.operation_id) throw conflict(latest);
                editable(latest);
                const submitted = req.body.galleryDraftRevision;
                const replay = submitted === String(latest.saved?.baseRevision)
                    && latest.revision === latest.saved?.baseRevision + 1;
                if (submitted !== String(latest.revision) && !replay) throw conflict(latest);
                const previous = latest.post_id === null ? null : Post.findById(latest.post_id);
                const selected = req.body.bodyGalleryItems === undefined ? []
                    : gallerySelection(latest, req.body.bodyGalleryItems, previous).candidates.map(candidate => candidate.id);
                const form = Object.fromEntries([...fieldNames].filter(name => Object.hasOwn(req.body, name))
                    .map(name => [name, req.body[name]]));
                if (Object.values(form).some(value => typeof value !== 'string'
                    && (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')))) fail('Invalid draft fields.');
                const seen = [...new Set([...(latest.saved?.seen ?? []), ...selected,
                    ...knownPhotos(latest, req.body.galleryKnownPhotos)])].sort();
                const same = JSON.stringify({ form, seen }) === JSON.stringify({ form: latest.saved?.form, seen: latest.saved?.seen });
                if (!same) {
                    if (replay) throw conflict(latest);
                    const saved = JSON.stringify({ form, seen, baseRevision: latest.revision });
                    if (Buffer.byteLength(saved) > 3145728) fail('Draft exceeds the saved text size limit.');
                    const changed = db.prepare(`UPDATE gallery_drafts SET fields = ?, revision = revision + 1,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND revision = ?`)
                        .run(saved, latest.id, latest.revision);
                    if (changed.changes !== 1) throw conflict(latest);
                    latest.revision++;
                }
                return { editUrl: editUrl(latest), previewUrl: previewUrl(latest), revision: latest.revision };
            }).immediate();
        },
        publish(req, draft, previous) {
            if (req.body.bodyGalleryItems === undefined) return null;
            if (!draft) fail('Reload the gallery editor.');
            const selection = gallerySelection(draft, req.body.bodyGalleryItems, previous, { final: true });
            validatePlacement(req.body.body, selection.gallery?.items);
            return selection;
        },
        error: report
    };
}
