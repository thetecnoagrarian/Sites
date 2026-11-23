import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logSafeError } from '../utils/error-diagnostics.js';

// Ownership never comes from a public URL, session payload or req.file.path.
const owners = new WeakMap();
const workByRequest = new WeakMap();
const identity = stat => ({ dev: stat.dev, ino: stat.ino });
const same = (stat, expected) => stat.dev === expected.dev && stat.ino === expected.ino;
const report = (logger, error) => logSafeError(error, { event: 'upload-cleanup' }, {
    error: (record, message) => logger.warn(record, message)
});

export async function ownedUploadDirectory(req, temporaryPath) {
    if (!owners.has(req)) {
        owners.set(req, (async () => {
            const configuredTemp = path.resolve(temporaryPath);
            if (path.basename(configuredTemp) !== 'temp') throw new Error('Expected the configured uploads/temp directory');
            const configuredRoot = path.dirname(configuredTemp);
            await fs.mkdir(configuredRoot, { recursive: true });
            const root = await fs.realpath(configuredRoot);
            await fs.mkdir(configuredTemp, { recursive: true });
            const tempStat = await fs.lstat(configuredTemp, { bigint: true });
            if (!tempStat.isDirectory() || tempStat.isSymbolicLink()
                || await fs.realpath(configuredTemp) !== path.join(root, 'temp')) {
                throw new Error('Unsafe temporary upload root');
            }
            // Hidden children remain private under Express's existing dotfile policy.
            const directory = await fs.mkdtemp(path.join(root, 'temp', '.operation-'));
            return { configuredRoot, configuredTemp, root, directory,
                directoryIdentity: identity(await fs.lstat(directory, { bigint: true })),
                names: new Set(), files: new Map(), cleanup: null };
        })());
    }
    const owner = await owners.get(req);
    if (owner.configuredTemp !== path.resolve(temporaryPath)) throw new Error('Upload request root changed');
    if (owner.cleanup) throw new Error('Temporary upload operation is closed');
    return owner.directory;
}

export async function reserveUploadFilename(req, filename) {
    const owner = await owners.get(req);
    if (!owner || owner.cleanup || typeof filename !== 'string'
        || filename !== path.basename(filename) || /[/\\\u0000]/u.test(filename)
        || owner.names.has(filename)) throw new Error('Unsafe temporary upload filename');
    owner.names.add(filename);
}

async function verifyDirectory(owner) {
    if (await fs.realpath(owner.configuredRoot) !== owner.root
        || await fs.realpath(owner.configuredTemp) !== path.join(owner.root, 'temp')
        || (await fs.lstat(owner.configuredTemp, { bigint: true })).isSymbolicLink()) throw new Error('Upload root changed');
    const stat = await fs.lstat(owner.directory, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || !same(stat, owner.directoryIdentity)
        || await fs.realpath(owner.directory) !== owner.directory) throw new Error('Upload directory identity changed');
}

export async function recordOwnedUpload(req, file) {
    const owner = await owners.get(req);
    if (!owner || !owner.names.has(file.filename)
        || file.path !== path.join(owner.directory, file.filename)) throw new Error('Upload ownership is unavailable');
    await verifyDirectory(owner);
    const stat = await fs.lstat(file.path, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) throw new Error('Unsafe temporary upload file');
    owner.files.set(file.filename, identity(stat));
}

export async function removeOwnedUpload(req, file, { logger = console } = {}) {
    try {
        const owner = await owners.get(req);
        const expected = owner?.files.get(file?.filename);
        if (!expected || file.path !== path.join(owner.directory, file.filename)) throw new Error('No owned file identity');
        await verifyDirectory(owner);
        let stat;
        try { stat = await fs.lstat(file.path, { bigint: true }); }
        catch (error) { if (error.code === 'ENOENT') return true; throw error; }
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || !same(stat, expected)) {
            throw new Error('Temporary file identity changed');
        }
        await fs.unlink(file.path);
        return true;
    } catch (error) {
        report(logger, error);
        return false;
    }
}

export function trackOwnedUploadWork(req, work) {
    const pending = workByRequest.get(req) ?? new Set();
    workByRequest.set(req, pending);
    pending.add(work);
    const settled = () => pending.delete(work);
    work.then(settled, settled);
}

export async function cleanupOwnedUploads(req, { logger = console } = {}) {
    if (!owners.has(req)) {
        if (req.file || req.files?.length) report(logger, 'No request ownership record');
        return false;
    }
    try {
        // Multer can report an abort before writes settle and queue removals as they finish.
        const pending = workByRequest.get(req);
        while (pending?.size) await Promise.allSettled(pending);
        const owner = await owners.get(req);
        if (!owner.cleanup) owner.cleanup = (async () => {
            await verifyDirectory(owner);
            const entries = await fs.readdir(owner.directory, { withFileTypes: true });
            // Unknown entries, nested directories and symlinks retain the whole tree.
            if (entries.some(entry => !entry.isFile() || !owner.files.has(entry.name))) {
                throw new Error('Unrecognized temporary upload contents');
            }
            for (const entry of entries) {
                if (!await removeOwnedUpload(req, { filename: entry.name,
                    path: path.join(owner.directory, entry.name) }, { logger })) return false;
            }
            await verifyDirectory(owner);
            await fs.rmdir(owner.directory); // Never recursive; cannot sweep unknown files.
            return true;
        })();
        return await owner.cleanup;
    } catch (error) {
        report(logger, error);
        return false;
    }
}
