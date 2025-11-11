#!/usr/bin/env node

/**
 * Script to convert existing JPEG/PNG images to WebP format
 * This will reduce file sizes by 25-35% without requiring re-upload
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get paths from environment or use defaults
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'src', 'database', 'blog.db');
const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '..', 'src', 'public', 'uploads');

const db = new Database(dbPath);

// Get all posts with images
const posts = db.prepare('SELECT id, title, slug, images FROM posts WHERE images IS NOT NULL AND images != ""').all();

console.log(`Found ${posts.length} posts with images\n`);

let totalConverted = 0;
let totalSpaceSaved = 0;
let errors = 0;

async function convertImageToWebp(imagePath) {
    try {
        const fullPath = path.join(uploadsPath, path.basename(imagePath));
        
        // Check if file exists
        try {
            await fs.access(fullPath);
        } catch {
            console.log(`  ⚠️  File not found: ${fullPath}`);
            return null;
        }

        // Get original file size
        const originalStats = await fs.stat(fullPath);
        const originalSize = originalStats.size;

        // Create WebP filename
        const ext = path.extname(imagePath).toLowerCase();
        if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
            console.log(`  ⏭️  Skipping (not JPEG/PNG): ${path.basename(imagePath)}`);
            return null;
        }

        const webpPath = fullPath.replace(/\.(jpg|jpeg|png)$/i, '.webp');

        // Check if WebP already exists
        try {
            await fs.access(webpPath);
            console.log(`  ✓ WebP already exists: ${path.basename(webpPath)}`);
            return webpPath.replace(uploadsPath, '/uploads');
        } catch {
            // WebP doesn't exist, create it
        }

        // Convert to WebP
        await sharp(fullPath)
            .webp({ quality: 85, effort: 4 })
            .toFile(webpPath);

        // Get new file size
        const webpStats = await fs.stat(webpPath);
        const webpSize = webpStats.size;
        const spaceSaved = originalSize - webpSize;
        const percentSaved = ((spaceSaved / originalSize) * 100).toFixed(1);

        console.log(`  ✓ Converted: ${path.basename(imagePath)} → ${path.basename(webpPath)} (${(originalSize / 1024).toFixed(1)}KB → ${(webpSize / 1024).toFixed(1)}KB, saved ${percentSaved}%)`);

        // Delete original JPEG/PNG
        await fs.unlink(fullPath);
        console.log(`  🗑️  Deleted original: ${path.basename(imagePath)}`);

        return {
            webpPath: webpPath.replace(uploadsPath, '/uploads'),
            spaceSaved,
            percentSaved
        };
    } catch (error) {
        console.error(`  ❌ Error converting ${imagePath}:`, error.message);
        return null;
    }
}

async function processPost(post) {
    try {
        const images = JSON.parse(post.images);
        if (!Array.isArray(images) || images.length === 0) {
            return;
        }

        console.log(`\n📝 Processing post: "${post.title}" (ID: ${post.id})`);
        console.log(`   Found ${images.length} image(s)`);

        const updatedImages = [];
        let postSpaceSaved = 0;

        for (const imageObj of images) {
            const updatedImage = { ...imageObj };
            let imageConverted = false;

            // Convert each size (thumbnail, medium, large)
            for (const size of ['thumbnail', 'medium', 'large']) {
                if (imageObj[size]) {
                    const result = await convertImageToWebp(imageObj[size]);
                    if (result) {
                        if (typeof result === 'string') {
                            // WebP already existed
                            updatedImage[size] = result;
                        } else {
                            // Newly converted
                            updatedImage[size] = result.webpPath;
                            postSpaceSaved += result.spaceSaved;
                            imageConverted = true;
                        }
                    } else {
                        // Keep original if conversion failed
                        updatedImage[size] = imageObj[size];
                    }
                }
            }

            if (imageConverted) {
                totalConverted++;
            }
            updatedImages.push(updatedImage);
        }

        // Update database with new WebP paths
        if (postSpaceSaved > 0) {
            db.prepare('UPDATE posts SET images = ? WHERE id = ?').run(
                JSON.stringify(updatedImages),
                post.id
            );
            totalSpaceSaved += postSpaceSaved;
            console.log(`   ✅ Updated database with WebP paths (saved ${(postSpaceSaved / 1024).toFixed(1)}KB for this post)`);
        } else {
            console.log(`   ℹ️  No conversion needed (already WebP or no changes)`);
        }
    } catch (error) {
        console.error(`❌ Error processing post "${post.title}" (ID: ${post.id}):`, error.message);
        errors++;
    }
}

// Process all posts
for (const post of posts) {
    await processPost(post);
}

db.close();

console.log(`\n📊 Conversion Summary:`);
console.log(`   Posts processed: ${posts.length}`);
console.log(`   Images converted: ${totalConverted}`);
console.log(`   Total space saved: ${(totalSpaceSaved / (1024 * 1024)).toFixed(2)}MB`);
console.log(`   Errors: ${errors}`);

if (totalSpaceSaved > 0) {
    console.log(`\n✅ Successfully converted images to WebP format!`);
    console.log(`   You saved approximately ${((totalSpaceSaved / (258 * 1024 * 1024)) * 100).toFixed(1)}% of your image storage space.`);
} else {
    console.log(`\nℹ️  No images needed conversion (may already be WebP or no images found).`);
}

