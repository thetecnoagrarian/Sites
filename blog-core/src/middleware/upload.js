import multer from 'multer';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { ownedUploadDirectory, reserveUploadFilename, recordOwnedUpload,
    removeOwnedUpload } from './owned-upload.js';
export { cleanupOwnedUploads } from './owned-upload.js';

// Configure multer for file uploads
export const createUploadMiddleware = (uploadsPath) => {
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

    const handleFile = storage._handleFile.bind(storage);
    storage._handleFile = (req, file, cb) => handleFile(req, file, (error, info) => {
        if (error) return cb(error);
        recordOwnedUpload(req, info).then(() => cb(null, info), cb);
    });
    storage._removeFile = (req, file, cb) => {
        removeOwnedUpload(req, file).then(() => {
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

    // Get file size limit from environment variable, default to 50MB for images
    const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || (50 * 1024 * 1024);
    
    return multer({
        storage,
        fileFilter,
        limits: {
            fileSize: maxFileSize
        }
    });
};

// Default upload middleware for backward compatibility
export const upload = createUploadMiddleware('./uploads/temp/');
