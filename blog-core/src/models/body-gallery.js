// Versioned metadata only. Asset ownership/existence is a separate boundary.
export const BODY_GALLERY_LIMITS = Object.freeze({
    items: 100,
    alt: 500,
    caption: 2000,
    url: 1024,
    serializedBytes: 256 * 1024
});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const variants = ['thumbnail', 'medium', 'large'];

function record(value, allowed, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
        || Object.keys(value).some(key => !allowed.includes(key))) {
        throw new TypeError(`Invalid ${label} properties`);
    }
}

function text(value, limit, required, label) {
    if (typeof value !== 'string' || value.length > limit
        || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
        throw new TypeError(`${label} must be plain text of at most ${limit} characters`);
    }
    const normalized = value.replace(/\r\n?/g, '\n').normalize('NFC').trim();
    if (normalized.length > limit) {
        throw new TypeError(`${label} must be plain text of at most ${limit} characters`);
    }
    if (required && !normalized) throw new TypeError(`${label} is required`);
    return normalized;
}

function assetUrl(value) {
    // Existing derivatives are flat public /uploads/*.webp references. Keep
    // their exact names; never derive one variant from another's suffix.
    if (typeof value !== 'string' || value.length > BODY_GALLERY_LIMITS.url
        || !value.startsWith('/uploads/') || !value.endsWith('.webp')) {
        throw new TypeError('Invalid gallery asset URL');
    }
    const filename = value.slice('/uploads/'.length);
    if (!filename || filename.startsWith('.') || filename.includes('..')
        || /[/\\%?#:<>"`\u0000-\u001f\u007f]/u.test(filename)
        || filename !== filename.trim()) {
        throw new TypeError('Invalid gallery asset URL');
    }
    return value;
}

export function normalizeBodyGallery(value) {
    if (value === null) return null;
    record(value, ['version', 'items'], 'body gallery');
    if (value.version !== 1) throw new TypeError('Unsupported body gallery version');
    if (!Array.isArray(value.items) || value.items.length > BODY_GALLERY_LIMITS.items) {
        throw new TypeError('Body gallery must contain at most 100 items');
    }
    const ids = new Set();
    const urls = new Set();
    const items = [];
    for (const item of value.items) {
        record(item, ['id', 'asset', 'alt', 'caption'], 'gallery item');
        if (typeof item.id !== 'string' || !uuid.test(item.id)) {
            throw new TypeError('Gallery item ID must be a UUID');
        }
        const id = item.id.toLowerCase();
        if (ids.has(id)) throw new TypeError('Duplicate gallery item ID');
        ids.add(id);
        record(item.asset, [...variants, 'originalWidth', 'originalHeight'], 'gallery asset');
        const asset = {};
        for (const variant of variants) {
            const url = assetUrl(item.asset[variant]);
            if (urls.has(url)) throw new TypeError('Duplicate gallery asset');
            urls.add(url);
            asset[variant] = url;
        }
        const hasWidth = Object.hasOwn(item.asset, 'originalWidth');
        const hasHeight = Object.hasOwn(item.asset, 'originalHeight');
        if (hasWidth !== hasHeight) throw new TypeError('Gallery dimensions must be supplied together');
        if (hasWidth) {
            for (const dimension of ['originalWidth', 'originalHeight']) {
                if (!Number.isSafeInteger(item.asset[dimension]) || item.asset[dimension] < 1) {
                    throw new TypeError('Gallery dimensions must be positive safe integers');
                }
                asset[dimension] = item.asset[dimension];
            }
        }
        items.push({ id, asset,
            alt: text(item.alt, BODY_GALLERY_LIMITS.alt, true, 'Gallery alt text'),
            caption: text(item.caption, BODY_GALLERY_LIMITS.caption, false, 'Gallery caption') });
    }
    if (!items.length) return null;
    const normalized = { version: 1, items };
    if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > BODY_GALLERY_LIMITS.serializedBytes) {
        throw new TypeError('Body gallery exceeds 262144 serialized UTF-8 bytes');
    }
    return normalized;
}

export function serializeBodyGallery(value) {
    const normalized = normalizeBodyGallery(value);
    return normalized === null ? null : JSON.stringify(normalized);
}

export function readStoredBodyGallery(stored) {
    try {
        if (stored === null || stored === undefined) return { value: null, error: null };
        if (typeof stored !== 'string'
            || Buffer.byteLength(stored, 'utf8') > BODY_GALLERY_LIMITS.serializedBytes) {
            throw new TypeError('Invalid stored gallery');
        }
        return { value: normalizeBodyGallery(JSON.parse(stored)), error: null };
    } catch {
        // Do not leak malformed content in diagnostics or rewrite it on read.
        return { value: null, error: 'invalid_stored_body_gallery' };
    }
}

// Revision/no-op comparison must distinguish corrupt storage from absence, and
// must detect a concurrent change even between two malformed stored values.
export function storedBodyGalleryKey(stored) {
    const { value, error } = readStoredBodyGallery(stored);
    return error ? { invalidStored: stored } : serializeBodyGallery(value);
}
