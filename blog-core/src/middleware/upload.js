import multer from 'multer';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { ownedUploadDirectory, reserveUploadFilename, recordOwnedUpload,
    removeOwnedUpload, cleanupOwnedUploads, trackOwnedUploadWork } from './owned-upload.js';
export { cleanupOwnedUploads };

const defaultFileSize = 50 * 1024 * 1024;
const configuredFileSize = () => parseInt(process.env.MAX_FILE_SIZE) || defaultFileSize;

// Configure multer for file uploads
export const createUploadMiddleware = (uploadsPath, { limits } = {}) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            ownedUploadDirectory(req, uploadsPath).then(directory => cb(null, directory), cb);
        },
        filename: (req, file, cb) => {
            // Generate unique filename with timestamp
            const timestamp = Date.now();
            const ext = path.extname(file.originalname);
            const basename = path.basename(file.originalname, ext);
            const filename = `${basename}-${timestamp}-${randomUUID()}${ext}`;
            reserveUploadFilename(req, filename).then(() => cb(null, filename), cb);
        }
    });

    const destination = promisify(storage.getDestination);
    const filename = promisify(storage.getFilename);
    storage._handleFile = (req, file, cb) => {
        const write = (async () => {
            const directory = await destination(req, file);
            const name = await filename(req, file);
            const info = { destination: directory, filename: name, path: path.join(directory, name) };
            const handle = await fs.open(info.path, 'wx', 0o600);
            const output = handle.createWriteStream({ autoClose: false });
            try {
                // Record the inode before streaming so cancellation can clean up partial files.
                await recordOwnedUpload(req, info);
                await pipeline(file.stream, output);
                return { ...info, size: output.bytesWritten };
            } finally {
                output.destroy();
                await handle.close();
            }
        })();
        trackOwnedUploadWork(req, write);
        write.then(info => cb(null, info), cb);
    };
    storage._removeFile = (req, file, cb) => {
        const removal = removeOwnedUpload(req, file);
        trackOwnedUploadWork(req, removal);
        removal.then(() => {
            delete file.destination;
            delete file.filename;
            delete file.path;
            cb(null);
        }, cb);
    };

    const fileFilter = (req, file, cb) => {
        // Allow images only
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    };

    return multer({
        storage,
        fileFilter,
        limits: {
            fileSize: configuredFileSize(),
            ...limits
        }
    });
};

export function createGalleryPhotoUpload(uploadsPath) {
    const configured = configuredFileSize();
    const fileSize = configured > 0 ? Math.min(configured, defaultFileSize) : defaultFileSize;
    const maxBytes = fileSize + 16 * 1024;
    const parse = createUploadMiddleware(uploadsPath, {
        limits: { fileSize, files: 1, fields: 2, parts: 3, fieldSize: 512, fieldNameSize: 32, fieldNestingDepth: 0 }
    }).single('photo');

    return async (req, res) => {
        if (!req.is('multipart/form-data')) return {};
        const tooLarge = Object.assign(new Error('Photo upload exceeds the total request limit.'), { galleryStatus: 413 });
        if (Number(req.headers['content-length']) > maxBytes) {
            res.set('Connection', 'close');
            return { error: tooLarge };
        }
        let bytes = 0;
        const body = new Transform({
            transform(chunk, encoding, callback) {
                bytes += chunk.length;
                if (bytes <= maxBytes) return callback(null, chunk);
                res.set('Connection', 'close');
                req.unpipe(body);
                callback(tooLarge);
            }
        });
        body.headers = req.headers;
        const abort = () => {
            if (!req.complete) body.destroy(new Error('Photo upload interrupted.'));
        };
        return new Promise(resolve => {
            let done = false;
            req.once('close', abort);
            // Multer may report a stream failure before its disk writer has finished.
            parse(body, res, error => {
                done = true;
                req.removeListener('close', abort);
                req.unpipe(body);
                resolve({ error, fields: body.body, file: body.file, cleanup: () => cleanupOwnedUploads(body) });
            });
            if (!done) {
                if (!req.destroyed) req.pipe(body);
                else abort();
            }
        });
    };
}

// Default upload middleware for backward compatibility
export const upload = createUploadMiddleware('./uploads/temp/');
