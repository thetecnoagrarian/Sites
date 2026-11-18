import { constants, promises as fs } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { processImage, IMAGE_SIZES } from './imageProcessor.js';

export const MEDIA_ID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const validId = new RegExp(`^${MEDIA_ID}$`);
const owners = new WeakMap();

// Resolve only beneath an explicitly configured root. Never follow a relative
// symlink, including a symlink to another location inside that root.
export async function checkedMediaPath(root, segments, { singleLink = false } = {}) {
    if (!Array.isArray(segments) || segments.some(segment => typeof segment !== 'string'
        || !segment || segment === '.' || segment === '..' || /[/\\\u0000-\u001f\u007f]/u.test(segment))) {
        throw new Error('Invalid media path');
    }
    const rootStat = await fs.lstat(root, { bigint: true });
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Unsafe media root');
    let resolved = await fs.realpath(root);
    let stat = rootStat;
    for (const [index, segment] of segments.entries()) {
        if (!stat.isDirectory()) throw new Error('Invalid media parent');
        resolved = path.join(resolved, segment);
        stat = await fs.lstat(resolved, { bigint: true });
        if (stat.isSymbolicLink() || (index < segments.length - 1 && !stat.isDirectory())) {
            throw new Error('Unsafe media path');
        }
    }
    if (singleLink && (!stat.isFile() || stat.nlink !== 1n)) throw new Error('Unsafe media file');
    return { path: resolved, stat };
}

export function managedMediaUrl(kind, id, variant) {
    if (typeof id !== 'string' || !validId.test(id)) throw new Error('Invalid media identifier');
    if (kind === 'post' && Object.hasOwn(IMAGE_SIZES, variant)) return `/uploads/m1-${id}-${variant}.webp`;
    if (kind === 'hero' && ['current-hero.webp', 'current-hero-og.webp'].includes(variant)) {
        return `/uploads/hero/m1-${id}/${variant}`;
    }
    throw new Error('Invalid media variant');
}

export function managedMediaSegments({ kind, id, variant }) {
    const url = managedMediaUrl(kind, id, variant);
    return ['.media', kind, id, path.posix.basename(url)];
}

export async function createPrivateCandidate(uploadsPath, kind) {
    if (!['post', 'hero'].includes(kind)) throw new Error('Invalid candidate kind');
    const root = (await checkedMediaPath(uploadsPath, [])).path;
    for (const segments of [['.media'], ['.media', kind]]) {
        const target = path.join(root, ...segments);
        try { await fs.mkdir(target, { mode: 0o700 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        const checked = await checkedMediaPath(root, segments);
        if (!checked.stat.isDirectory()) throw new Error('Invalid candidate root');
    }
    const id = randomUUID();
    await fs.mkdir(path.join(root, '.media', kind, id), { mode: 0o700 });
    const checked = await checkedMediaPath(root, ['.media', kind, id]);
    const candidate = Object.freeze({ kind, id, directory: checked.path });
    owners.set(candidate, { root, configuredRoot: uploadsPath, dev: checked.stat.dev, ino: checked.stat.ino });
    return candidate;
}

export async function verifyPrivateCandidate(candidate) {
    const owner = owners.get(candidate);
    if (!owner) throw new Error('Unrecognized candidate metadata');
    if (await fs.realpath(owner.configuredRoot) !== owner.root) throw new Error('Candidate root changed');
    const checked = await checkedMediaPath(owner.configuredRoot, ['.media', candidate.kind, candidate.id]);
    if (!checked.stat.isDirectory() || checked.stat.dev !== owner.dev || checked.stat.ino !== owner.ino
        || checked.path !== candidate.directory) throw new Error('Candidate directory changed');
    return owner;
}

export async function inspectPostCandidate(candidate, image) {
    const { root } = await verifyPrivateCandidate(candidate);
    const keys = [...Object.keys(IMAGE_SIZES), 'originalWidth', 'originalHeight', 'originalAspectRatio'];
    if (candidate.kind !== 'post' || !image || typeof image !== 'object' || Array.isArray(image)
        || Object.keys(image).length !== keys.length || Object.keys(image).some(key => !keys.includes(key))
        || !Number.isSafeInteger(image.originalWidth) || image.originalWidth < 1
        || !Number.isSafeInteger(image.originalHeight) || image.originalHeight < 1
        || image.originalAspectRatio !== image.originalWidth / image.originalHeight) throw new Error('Invalid candidate metadata');
    const files = {};
    for (const [variant, bounds] of Object.entries(IMAGE_SIZES)) {
        if (image[variant] !== managedMediaUrl('post', candidate.id, variant)) throw new Error('Invalid candidate variant');
        const checked = await checkedMediaPath(root, managedMediaSegments({ ...candidate, variant }), { singleLink: true });
        const handle = await fs.open(checked.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const stat = await handle.stat({ bigint: true });
            if (!stat.isFile() || stat.nlink !== 1n || stat.dev !== checked.stat.dev || stat.ino !== checked.stat.ino
                || !stat.size || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Candidate file changed');
            const bytes = await handle.readFile();
            const metadata = await sharp(bytes).metadata();
            const ratio = Math.min(1, bounds.maxWidth / image.originalWidth, bounds.maxHeight / image.originalHeight);
            if (metadata.format !== 'webp' || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)
                || Math.abs(metadata.width - image.originalWidth * ratio) > 1
                || Math.abs(metadata.height - image.originalHeight * ratio) > 1) throw new Error('Invalid candidate derivative');
            files[variant] = Object.freeze({ bytes: Number(stat.size), sha256: createHash('sha256').update(bytes).digest('hex'),
                width: metadata.width, height: metadata.height });
        } finally { await handle.close(); }
    }
    await verifyPrivateCandidate(candidate);
    return Object.freeze(files);
}

// Not connected to live editorial routes. Input paths must be server-owned raw
// uploads, not arbitrary paths received in a form. No failure grants publication
// or deletion authority; partial candidates remain private for later review.
async function checkedRawInput(uploadsPath, inputPath) {
    const root = (await checkedMediaPath(uploadsPath, [])).path;
    const relative = path.relative(root, path.resolve(inputPath));
    const segments = relative.split(path.sep);
    if (segments.length !== 3 || segments[0] !== 'temp' || !segments[1].startsWith('.operation-')) {
        throw new Error('Expected a private raw upload');
    }
    const input = await checkedMediaPath(root, segments, { singleLink: true });
    return { root, segments, input };
}

export async function hashPrivateRawUpload(uploadsPath, inputPath) {
    const { input } = await checkedRawInput(uploadsPath, inputPath);
    const handle = await fs.open(input.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const stat = await handle.stat({ bigint: true });
        if (stat.dev !== input.stat.dev || stat.ino !== input.stat.ino || !stat.isFile() || stat.nlink !== 1n) throw new Error('Raw input changed');
        const hash = createHash('sha256');
        for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
        return hash.digest('hex');
    } finally { await handle.close(); }
}

export async function preparePostCandidate({ uploadsPath, inputPath, processor = processImage, onPhase = async () => {} }) {
    const { root, segments, input } = await checkedRawInput(uploadsPath, inputPath);
    const candidate = await createPrivateCandidate(uploadsPath, 'post');
    await onPhase('before-process', candidate);
    await verifyPrivateCandidate(candidate);
    const currentInput = await checkedMediaPath(root, segments, { singleLink: true });
    if (currentInput.stat.dev !== input.stat.dev || currentInput.stat.ino !== input.stat.ino) throw new Error('Raw input changed');
    const image = await processor(input.path, `m1-${candidate.id}.input`, candidate.directory);
    await onPhase('processed', candidate);
    const files = await inspectPostCandidate(candidate, image);
    return Object.freeze({ candidate, image: Object.freeze(image), files });
}

// Reopen a durable prepared descriptor after a confirmation/restart. This
// creates verification authority only, never temporary-file deletion authority.
export async function verifyStoredPostCandidate(uploadsPath, record) {
    managedMediaUrl('post', record.id, 'large');
    const root = (await checkedMediaPath(uploadsPath, [])).path;
    const checked = await checkedMediaPath(root, ['.media', 'post', record.id]);
    const candidate = Object.freeze({ kind: 'post', id: record.id, directory: checked.path });
    owners.set(candidate, { root, configuredRoot: uploadsPath, dev: checked.stat.dev, ino: checked.stat.ino });
    const files = await inspectPostCandidate(candidate, record.image);
    if (JSON.stringify(files) !== JSON.stringify(record.files)) throw new Error('Candidate integrity changed');
    for (const variant of Object.keys(IMAGE_SIZES)) {
        const file = await checkedMediaPath(root, managedMediaSegments({ ...candidate, variant }), { singleLink: true });
        const handle = await fs.open(file.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try { await handle.sync(); } finally { await handle.close(); }
    }
    // Files and their names precede the later SQLite grant. This is not a
    // filesystem/SQLite transaction; an interrupted preparation stays private.
    for (const segments of [['.media', 'post', record.id], ['.media', 'post'], ['.media'], []]) {
        const directory = await checkedMediaPath(root, segments);
        const handle = await fs.open(directory.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try { await handle.sync(); } finally { await handle.close(); }
    }
}
