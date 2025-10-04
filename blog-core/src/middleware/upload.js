import multer from 'multer';
import { promises as fs } from 'fs';
import path from 'path';

// Create uploads directory if it doesn't exist
const ensureUploadsDir = async (uploadsPath) => {
    try {
        await fs.mkdir(uploadsPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
};

// Configure multer for file uploads
export const createUploadMiddleware = (uploadsPath) => {
    // Ensure uploads directory exists
    ensureUploadsDir(uploadsPath);
    
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadsPath);
        },
        filename: (req, file, cb) => {
            // Generate unique filename with timestamp
            const timestamp = Date.now();
            const ext = path.extname(file.originalname);
            const basename = path.basename(file.originalname, ext);
            const filename = `${basename}-${timestamp}${ext}`;
            cb(null, filename);
        }
    });

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
            fileSize: 10 * 1024 * 1024 // 10MB limit
        }
    });
};

// Default upload middleware for backward compatibility
export const upload = createUploadMiddleware('./uploads/temp/');

