import { randomUUID, createHash } from 'node:crypto';
import { getDatabase } from './db.js';
import { BODY_GALLERY_LIMITS, normalizeBodyGallery } from './body-gallery.js';
import { MEDIA_ID, managedMediaUrl, verifyStoredPostCandidate, hashPrivateRawUpload } from '../utils/private-media.js';

const idPattern = new RegExp(`^${MEDIA_ID}$`);
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const capabilities = new WeakMap();
const variants = ['thumbnail', 'medium', 'large'];
const maxCandidates = 25 + BODY_GALLERY_LIMITS.items;
export const PENDING_INPUT_MAX_BYTES = 8 * 1024 * 1024;
const inputFields = ['content', 'categoryIds', 'authorIds', 'publisherId', 'loginUserId',
    'publisherAction', 'authorshipAction', 'authorshipReviewState', 'authorshipReviewNote',
    'publicationAction', 'publicationReviewState', 'publicationPrecision', 'publishedAt',
    'publishedOn', 'publicationReviewNote', 'revisionToken'];
const stable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
export const mediaDigest = value => createHash('sha256').update(stable(value)).digest('hex');
const fail = message => { const error = new Error(message); error.code = 'MEDIA_REJECTED'; throw error; };
const inputDigest = input => { const { mediaAcceptance, ...value } = input; return mediaDigest(value); };
const mediaImages = input => [...input.content.images, ...(input.content.body_gallery?.items ?? []).map(item => item.asset)];
const requiredImages = input => [...new Set(mediaImages(input).flatMap(image => variants.map(v =>
    /^\/uploads\/m1-([0-9a-f-]{36})-[a-z]+\.webp$/.exec(image[v] ?? '')?.[1]).filter(Boolean)))];
const candidateMatchesAsset = (candidate, asset) => variants.every(key => candidate.image[key] === asset[key])
    && candidate.image.originalWidth === asset.originalWidth && candidate.image.originalHeight === asset.originalHeight;
function assertCandidateAssociations(input, candidates) {
    const gallery = input.content.body_gallery?.items ?? [];
    const highlights = candidates.filter(candidate => !gallery.some(item => candidateMatchesAsset(candidate, item.asset)));
    if (highlights.length > 25) fail('Too many highlights');
    if (highlights.length && stable(input.content.images) !== stable(highlights.map(item => item.image))) fail('Candidate association changed');
}
function keys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== expected.length || Object.keys(value).some(key => !expected.includes(key))) fail('Malformed media record');
}
function pendingInputRecord(input) {
    const allowed = (value, fields) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)
            || Object.keys(value).some(key => !fields.includes(key))) fail('Invalid pending editorial fields');
    };
    allowed(input, inputFields);
    allowed(input.content, ['title', 'body', 'description', 'excerpt', 'created_at', 'images', 'captions', 'body_gallery']);
    if (Object.hasOwn(input.content, 'body_gallery')) normalizeBodyGallery(input.content.body_gallery);
    if (inputFields.filter(key => !['content', 'categoryIds', 'authorIds', 'publisherId', 'loginUserId'].includes(key))
        .some(key => input[key] != null && typeof input[key] !== 'string')
        || !['string', 'number'].includes(typeof input.publisherId)
        || !positive(input.loginUserId)) fail('Invalid pending editorial fields');
    if (!['title', 'body', 'created_at'].every(key => typeof input.content[key] === 'string')
        || !['description', 'excerpt'].every(key => input.content[key] == null || typeof input.content[key] === 'string')
        || !Array.isArray(input.content.images) || input.content.images.length > 25
        || !Array.isArray(input.content.captions) || input.content.images.length !== input.content.captions.length
        || input.content.captions.some(value => typeof value !== 'string')
        || !Array.isArray(input.authorIds) || !Array.isArray(input.categoryIds)
        || [...input.authorIds, ...input.categoryIds].some(value => !['string', 'number'].includes(typeof value))
        || !sha(input.revisionToken)) fail('Invalid pending editorial input');
    for (const image of input.content.images) {
        allowed(image, [...variants, 'originalWidth', 'originalHeight', 'originalAspectRatio']);
        if (variants.some(variant => typeof image[variant] !== 'string'
            || !image[variant].startsWith('/uploads/'))) fail('Invalid pending image reference');
    }
    return input;
}
function encodePendingInput(input) {
    pendingInputRecord(input);
    const serialized = stable({ version: 1, input });
    const actualBytes = Buffer.byteLength(serialized, 'utf8');
    if (actualBytes > PENDING_INPUT_MAX_BYTES) {
        const error = new Error(`Pending snapshot is ${actualBytes} bytes; maximum is ${PENDING_INPUT_MAX_BYTES} bytes`);
        Object.assign(error, { code: 'PENDING_INPUT_TOO_LARGE', actualBytes, maxBytes: PENDING_INPUT_MAX_BYTES });
        throw error;
    }
    return serialized;
}
function candidateRecord(value) {
    keys(value, ['id', 'image', 'files']);
    if (typeof value.id !== 'string' || !idPattern.test(value.id)) fail('Malformed candidate identity');
    keys(value.image, [...variants, 'originalWidth', 'originalHeight', 'originalAspectRatio']);
    if (!positive(value.image.originalWidth) || !positive(value.image.originalHeight)
        || value.image.originalAspectRatio !== value.image.originalWidth / value.image.originalHeight) fail('Malformed candidate dimensions');
    keys(value.files, variants);
    for (const variant of variants) {
        if (value.image[variant] !== managedMediaUrl('post', value.id, variant)) fail('Unsafe candidate URL');
        const file = value.files[variant];
        keys(file, ['bytes', 'sha256', 'width', 'height']);
        if (!positive(file.bytes) || !positive(file.width) || !positive(file.height) || !sha(file.sha256)) fail('Malformed candidate integrity');
    }
    return value;
}
function receiptRecord(value) {
    keys(value, ['action', 'postId', 'binding', 'acceptedAt']);
    if (!['create', 'update', 'overwrite'].includes(value.action) || !positive(value.postId)
        || !sha(value.binding) || typeof value.acceptedAt !== 'string' || !Number.isFinite(Date.parse(value.acceptedAt))
        || new Date(value.acceptedAt).toISOString() !== value.acceptedAt) fail('Malformed media receipt');
    return value;
}
function operationRecord(row) {
    if (!row || row.record_type !== 'operation' || row.id !== row.operation_id || !idPattern.test(row.id)
        || !positive(row.owner_user_id)) fail('Unknown media operation');
    const data = JSON.parse(row.data);
    keys(data, ['context', 'submission', 'inputHash', 'candidates', 'required', 'pending', 'receipt']);
    keys(data.context, ['action', 'postId']);
    if (!['create', 'update'].includes(data.context.action)
        || (data.context.action === 'create' ? data.context.postId !== null : !positive(data.context.postId))
        || !Array.isArray(data.candidates) || data.candidates.length > maxCandidates) fail('Malformed operation context');
    data.candidates.forEach(candidateRecord);
    if (!Array.isArray(data.required) || data.required.length > maxCandidates
        || data.required.some(id => typeof id !== 'string' || !idPattern.test(id))
        || new Set(data.required).size !== data.required.length
        || data.candidates.some(item => !data.required.includes(item.id))) fail('Malformed required media');
    if (new Set(data.candidates.map(item => item.id)).size !== data.candidates.length) fail('Duplicate candidate');
    if (data.pending !== null) {
        keys(data.pending, ['postId', 'revisionToken']);
        if (!positive(data.pending.postId) || !sha(data.pending.revisionToken)) fail('Malformed pending overwrite');
    }
    if (row.state === 'allocated') {
        if (data.submission !== null || data.inputHash !== null || data.candidates.length || data.required.length || data.receipt !== null || data.pending !== null) fail('Malformed allocated operation');
    } else if (!['prepared', 'published', 'cancelled'].includes(row.state)
        || (row.state !== 'cancelled' && (!sha(data.submission) || !sha(data.inputHash)))) fail('Malformed operation state');
    if (row.state === 'published') {
        const receipt = receiptRecord(data.receipt);
        const target = receipt.action === 'create' ? null : receipt.postId;
        if ((receipt.action === 'overwrite' ? data.context.action !== 'create' || data.pending?.postId !== target
            : data.context.action !== receipt.action || data.context.postId !== target || data.pending !== null)
            || ![false, ...(receipt.action === 'overwrite' ? [true] : [])].some(reopenAuthorship =>
                mediaDigest({ action: receipt.action, postId: target, inputHash: data.inputHash, reopenAuthorship }) === receipt.binding)) fail('Malformed receipt context');
    }
    else if (data.receipt !== null) fail('Unaccepted media receipt');
    return { ...row, data };
}

export function readMediaOperation(db, id, ownerId) {
    if (typeof id !== 'string' || !idPattern.test(id)) fail('Reload the editor: invalid media operation');
    // Keep large private snapshots out of ordinary receipt/status reads.
    const raw = db.prepare(`SELECT id, operation_id, record_type, owner_user_id, state, data, created_at
        FROM media_publications WHERE id = ?`).get(id);
    let row;
    try { row = operationRecord(raw); }
    catch (error) { if (raw) error.mediaOutcome = 'unknown'; throw error; }
    if (row.owner_user_id !== ownerId) fail('Media operation belongs to another editor');
    return row;
}
export function allocateMediaOperation(db, ownerId, action, postId = null) {
    if (!positive(ownerId) || !['create', 'update'].includes(action)
        || (action === 'create' ? postId !== null : !positive(postId))) fail('Invalid operation context');
    const id = randomUUID();
    const data = { context: { action, postId }, submission: null, inputHash: null, candidates: [], required: [], pending: null, receipt: null };
    db.prepare(`INSERT INTO media_publications (id, operation_id, record_type, owner_user_id, state, data)
        VALUES (?, ?, 'operation', ?, 'allocated', ?)`).run(id, id, ownerId, JSON.stringify(data));
    return id;
}
export async function submissionDigest(input, files, uploadsPath) {
    const hashes = [];
    for (const file of files) {
        hashes.push(await hashPrivateRawUpload(uploadsPath, file.path));
    }
    return mediaDigest({ input, files: hashes });
}
function updateOperation(db, row, state, data) {
    const result = db.prepare(`UPDATE media_publications SET state = ?, data = ?
        WHERE id = ? AND state = ? AND data = ?`).run(state, JSON.stringify(data), row.id, row.state, JSON.stringify(row.data));
    if (result.changes !== 1) fail('Media operation changed; check its status before retrying');
}
export function prepareMediaOperation(db, id, ownerId, submission, input, candidates) {
    return db.transaction(() => {
        const row = readMediaOperation(db, id, ownerId);
        if (['prepared', 'published'].includes(row.state) && row.data.submission === submission) return row;
        if (row.state !== 'allocated' || !sha(submission)) fail('Media operation cannot be prepared again');
        candidates.forEach(candidateRecord);
        if (candidates.length > maxCandidates) fail('Too many candidates');
        assertCandidateAssociations(input, candidates);
        const required = requiredImages(input);
        updateOperation(db, row, 'prepared', { ...row.data, submission, inputHash: inputDigest(input), candidates, required });
        return readMediaOperation(db, id, ownerId);
    }).immediate();
}
export function markPendingOverwrite(db, id, ownerId, pending, input) {
    if (db.inTransaction) fail('Pending binding requires its own outer transaction');
    const serialized = encodePendingInput(input);
    keys(pending, ['postId', 'revisionToken']);
    if (!positive(pending.postId) || !sha(pending.revisionToken)
        || input.revisionToken !== pending.revisionToken || input.loginUserId !== ownerId) fail('Overwrite binding changed');
    return db.transaction(() => {
        const row = readMediaOperation(db, id, ownerId);
        if (row.state !== 'prepared' || row.data.context.action !== 'create') fail('Media operation is not pending');
        if (row.data.pending) {
            const bound = readPendingOverwrite(db, id, ownerId);
            if (stable(row.data.pending) !== stable(pending) || encodePendingInput(bound.input) !== serialized) fail('Overwrite binding changed');
            return bound;
        }
        // Only the server-supplied target revision may differ from prepared input.
        if (inputDigest({ ...input, revisionToken: undefined }) !== row.data.inputHash) fail('Prepared editorial input changed');
        if (stable(row.data.required) !== stable(requiredImages(input))) fail('Candidate association changed');
        assertCandidateAssociations(input, row.data.candidates);
        const data = { ...row.data, pending, inputHash: inputDigest(input) };
        const result = db.prepare(`UPDATE media_publications SET data = ?, pending_input = ?
            WHERE id = ? AND owner_user_id = ? AND state = 'prepared' AND data = ? AND pending_input IS NULL`)
            .run(JSON.stringify(data), serialized, id, ownerId, JSON.stringify(row.data));
        if (result.changes !== 1) fail('Media operation changed; check its status before retrying');
        return readPendingOverwrite(db, id, ownerId);
    }).immediate();
}
export function readPendingOverwrite(db, id, ownerId) {
    const operation = readMediaOperation(db, id, ownerId);
    if (!operation.data.pending || operation.data.context.action !== 'create') fail('Overwrite operation unavailable');
    const raw = db.prepare('SELECT pending_input FROM media_publications WHERE id = ? AND owner_user_id = ?').get(id, ownerId);
    let snapshot;
    try {
        snapshot = JSON.parse(raw?.pending_input);
        keys(snapshot, ['version', 'input']);
        if (snapshot.version !== 1 || encodePendingInput(snapshot.input) !== raw.pending_input
            || inputDigest(snapshot.input) !== operation.data.inputHash
            || snapshot.input.loginUserId !== ownerId
            || snapshot.input.revisionToken !== operation.data.pending.revisionToken
            || stable(requiredImages(snapshot.input)) !== stable(operation.data.required)) fail('Pending snapshot binding changed');
        assertCandidateAssociations(snapshot.input, operation.data.candidates);
    } catch {
        const error = new Error('Pending snapshot could not be verified');
        error.code = 'MEDIA_REJECTED';
        throw error;
    }
    return { operation, input: snapshot.input, ...operation.data.pending };
}
export function cancelMediaOperation(db, id, ownerId) {
    return db.transaction(() => {
        const row = readMediaOperation(db, id, ownerId);
        if (row.state === 'published') return row.data.receipt;
        if (row.state !== 'cancelled') updateOperation(db, row, 'cancelled', row.data);
        return null;
    }).immediate();
}
export async function verifyMediaAcceptance({ db, uploadsPath, id, ownerId, input, action, postId = null, reopenAuthorship = false }) {
    if (db.inTransaction || db.pragma('read_uncommitted', { simple: true })) fail('Media verification requires committed isolated database state');
    if (db.pragma('synchronous', { simple: true }) < 2) fail('Media acceptance requires SQLite FULL or EXTRA synchronous durability');
    const row = readMediaOperation(db, id, ownerId);
    if (stable(row.data.required) !== stable(requiredImages(input))) fail('Required media binding changed');
    assertCandidateAssociations(input, row.data.candidates);
    const binding = mediaDigest({ action, postId, inputHash: inputDigest(input), reopenAuthorship });
    if (row.state === 'published') {
        if (row.data.receipt.binding !== binding) fail('Changed submission cannot reuse an accepted operation');
    } else {
        if (row.state !== 'prepared' || row.data.inputHash !== inputDigest(input)) fail('Media operation is not prepared for this submission');
        if (action === 'overwrite') {
            if (row.data.context.action !== 'create' || row.data.pending?.postId !== postId
                || row.data.pending.revisionToken !== input.revisionToken) fail('Overwrite binding changed');
        } else if (row.data.context.action !== action || row.data.context.postId !== postId
            || row.data.pending !== null) fail('Media operation target changed or awaits overwrite confirmation');
    }
    for (const candidate of row.data.candidates) await verifyStoredPostCandidate(uploadsPath, candidate);
    const newUrls = new Set(row.data.candidates.flatMap(item => variants.map(v => item.image[v])));
    const existingUrls = new Set();
    const verifiedExisting = new Set();
    const provider = createPostMediaProvider(db);
    for (const image of mediaImages(input)) for (const variant of variants) {
        const url = image[variant] ?? '';
        if (!/^\/uploads\/m1-/i.test(url) || newUrls.has(url)) continue;
        const match = /^\/uploads\/m1-([0-9a-f-]{36})-[a-z]+\.webp$/.exec(url);
        if (!match || !provider({ kind: 'post', id: match[1], variant, url })) fail('Existing managed media is not published');
        if (!verifiedExisting.has(match[1])) {
            const asset = publishedMediaCandidate(db, match[1]);
            await verifyStoredPostCandidate(uploadsPath, asset);
            verifiedExisting.add(match[1]);
        }
        existingUrls.add(url);
    }
    const token = Object.freeze({});
    capabilities.set(token, { db, id, ownerId, binding, inputHash: inputDigest(input), action, postId, reopenAuthorship,
        existingUrls, serialized: JSON.stringify(row.data) });
    return token;
}
function capability(db, token, input, action, postId) {
    const cap = capabilities.get(token);
    if (!cap || cap.db !== db || cap.action !== action || cap.postId !== postId
        || cap.inputHash !== inputDigest(input)) fail('Verified media acceptance is required');
    return cap;
}
export function mediaReceipt(db, token, input, action, postId = null) {
    if (!token) return null;
    const cap = capability(db, token, input, action, postId);
    const row = readMediaOperation(db, cap.id, cap.ownerId);
    if (row.state === 'published') {
        if (row.data.receipt.binding !== cap.binding) fail('Media receipt binding changed');
        return row.data.receipt;
    }
    if (row.state !== 'prepared' || JSON.stringify(row.data) !== cap.serialized) fail('Media operation was cancelled or changed');
    return null;
}
export function assertMediaOverwrite(db, token, input, revisionToken, reopenAuthorship) {
    if (!token) return;
    const cap = capabilities.get(token);
    if (!cap || cap.db !== db || cap.action !== 'overwrite' || cap.reopenAuthorship !== reopenAuthorship
        || input.revisionToken !== revisionToken) fail('Overwrite confirmation binding changed');
}
export function acceptMediaPublication(db, token, input, action, targetId, resultId) {
    const validateExisting = allowed => {
        for (const image of mediaImages(input)) for (const variant of variants) {
            if (/^\/uploads\/m1-/i.test(image[variant] ?? '') && !allowed?.has(image[variant])) fail('Managed media requires verified acceptance');
        }
    };
    if (!token) return validateExisting();
    if (!db.inTransaction) fail('Publication requires the editorial transaction');
    const cap = capability(db, token, input, action, targetId);
    const row = readMediaOperation(db, cap.id, cap.ownerId);
    mediaReceipt(db, token, input, action, targetId);
    assertCandidateAssociations(input, row.data.candidates);
    validateExisting(new Set([...cap.existingUrls, ...row.data.candidates.flatMap(item => variants.map(v => item.image[v]))]));
    const receipt = { action, postId: resultId, binding: cap.binding, acceptedAt: new Date().toISOString() };
    updateOperation(db, row, 'published', { ...row.data, receipt });
    readMediaOperation(db, row.id, row.owner_user_id); // Validate the final receipt before any commit.
    const insert = db.prepare(`INSERT INTO media_publications (id, operation_id, record_type, owner_user_id, state, data)
        VALUES (?, ?, 'asset', ?, 'published', ?)`);
    for (const candidate of row.data.candidates) insert.run(candidate.id, row.id, row.owner_user_id, JSON.stringify(candidate));
}
export function recoverMediaOutcome(db, token, input, action, postId, originalError) {
    if (!token) throw originalError;
    const cap = capability(db, token, input, action, postId);
    let row;
    try {
        if (!db.open || db.inTransaction) throw new Error('No committed outcome available');
        row = readMediaOperation(db, cap.id, cap.ownerId);
    } catch {
        const unknown = new Error('Editorial outcome unknown. Check the operation status before retrying.');
        unknown.code = 'MEDIA_OUTCOME_UNKNOWN';
        throw unknown;
    }
    if (row.state === 'published') {
        if (row.data.receipt.binding !== cap.binding) fail('Media receipt binding changed');
        return row.data.receipt.postId;
    }
    if (Object.isExtensible(originalError)) originalError.mediaOutcome = row.state === 'cancelled' ? 'cancelled' : 'rolled_back';
    throw originalError;
}
export function createPostMediaGrantProvider(db = getDatabase()) {
    const query = db.prepare(`SELECT a.id, a.data, a.owner_user_id, p.owner_user_id AS operation_owner,
        p.id AS parent_id, p.operation_id AS parent_operation, p.data AS operation_data
        FROM media_publications a JOIN media_publications p ON p.id = a.operation_id
        WHERE a.id = ? AND a.record_type = 'asset' AND a.state = 'published'
            AND p.record_type = 'operation' AND p.state = 'published'`);
    return descriptor => {
        try {
            if (!db.open || db.inTransaction) return null;
            const { kind, id, variant, url } = descriptor;
            if (kind !== 'post' || !idPattern.test(id) || !variants.includes(variant)) return null;
            const row = query.get(id);
            if (!row || !positive(row.owner_user_id) || row.owner_user_id !== row.operation_owner) return null;
            const parent = operationRecord({ id: row.parent_id, operation_id: row.parent_operation,
                owner_user_id: row.operation_owner, record_type: 'operation', state: 'published', data: row.operation_data });
            const candidate = candidateRecord(JSON.parse(row.data));
            if (candidate.id !== id || candidate.image[variant] !== url
                || !parent.data.candidates.some(item => stable(item) === stable(candidate))) return null;
            const { bytes, sha256 } = candidate.files[variant];
            return { bytes, sha256 };
        } catch { return null; }
    };
}

export function createPostMediaProvider(db = getDatabase()) {
    const getGrant = createPostMediaGrantProvider(db);
    return descriptor => getGrant(descriptor) !== null;
}

export function publishedMediaCandidate(db, id) {
    const row = db.prepare("SELECT data FROM media_publications WHERE id = ? AND record_type = 'asset'").get(id);
    const candidate = candidateRecord(JSON.parse(row?.data ?? 'null'));
    if (!createPostMediaProvider(db)({ kind: 'post', id, variant: 'large', url: candidate.image.large })) fail('Published media cannot be verified');
    return candidate;
}
