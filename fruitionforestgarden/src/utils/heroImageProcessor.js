import sharp from 'sharp';
import path from 'path';
import { promises as fs } from 'fs';

/**
 * Process hero image: creates both hero and OG versions
 * @param {string} inputPath - Path to uploaded image file
 * @param {string} imagesDir - Directory to save processed images (default: src/public/images)
 * @returns {Promise<Object>} Object with heroImagePath and ogImagePath
 */
const processHeroImage = async (inputPath, imagesDir = null) => {
  const outputDir = imagesDir || path.join(process.cwd(), 'src/public/images');
  
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Get image metadata
    const metadata = await sharp(inputPath).metadata();
    const { width, height } = metadata;

    // Delete old hero images before processing new ones
    const oldHeroPath = path.join(outputDir, 'HeroCamp.webp');
    const oldOgPath = path.join(outputDir, 'HeroCamp-og.webp');
    
    try {
      await fs.unlink(oldHeroPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error deleting old hero image:', err);
      }
    }
    
    try {
      await fs.unlink(oldOgPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error deleting old OG image:', err);
      }
    }

    // Process Hero Image: max 1920px width, maintain aspect ratio
    const heroMaxWidth = 1920;
    let heroWidth = width;
    let heroHeight = height;

    if (width > heroMaxWidth) {
      const aspectRatio = width / height;
      heroWidth = heroMaxWidth;
      heroHeight = Math.round(heroMaxWidth / aspectRatio);
    }

    const heroOutputPath = path.join(outputDir, 'HeroCamp.webp');
    
    await sharp(inputPath)
      .resize(heroWidth, heroHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 85 })
      .toFile(heroOutputPath);

    // Process OG Image: 1200x630px with center crop
    const ogOutputPath = path.join(outputDir, 'HeroCamp-og.webp');
    
    await sharp(inputPath)
      .resize(1200, 630, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 80 })
      .toFile(ogOutputPath);

    // Get file sizes for reporting
    const heroStats = await fs.stat(heroOutputPath);
    const ogStats = await fs.stat(ogOutputPath);

    return {
      heroImagePath: '/images/HeroCamp.webp',
      ogImagePath: '/images/HeroCamp-og.webp',
      heroSize: heroStats.size,
      ogSize: ogStats.size,
      heroDimensions: { width: heroWidth, height: heroHeight },
      ogDimensions: { width: 1200, height: 630 }
    };
  } catch (error) {
    console.error('Error processing hero image:', error);
    throw error;
  }
};

/**
 * Check if hero image exists
 * @param {string} imagesDir - Directory to check (default: src/public/images)
 * @returns {Promise<boolean>}
 */
const heroImageExists = async (imagesDir = null) => {
  const dir = imagesDir || path.join(process.cwd(), 'src/public/images');
  const heroPath = path.join(dir, 'HeroCamp.webp');
  
  try {
    await fs.access(heroPath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Get hero image path if it exists
 * Falls back to about page hero image (HeroCamp.png) if no uploaded hero image exists
 * @param {string} imagesDir - Directory to check (default: src/public/images)
 * @returns {Promise<string|null>} Path to hero image or null if doesn't exist
 */
const getHeroImagePath = async (imagesDir = null) => {
  // Use __dirname to get the actual file location, then resolve relative to it
  // This works better in Docker containers where process.cwd() might not be reliable
  const fileUrl = import.meta.url;
  const currentFile = fileURLToPath(fileUrl);
  const currentDir = path.dirname(currentFile);
  
  // Resolve images directory: go up from utils/ to src/, then to public/images
  const defaultDir = path.resolve(currentDir, '../public/images');
  const dir = imagesDir || defaultDir;
  
  // First check for uploaded hero image (HeroCamp.webp)
  const uploadedHeroPath = path.join(dir, 'HeroCamp.webp');
  try {
    await fs.access(uploadedHeroPath);
    return '/images/HeroCamp.webp';
  } catch {
    // Fallback to about page hero image (HeroCamp.png)
    const defaultHeroPath = path.join(dir, 'HeroCamp.png');
    try {
      await fs.access(defaultHeroPath);
      return '/images/HeroCamp.png';
    } catch (err) {
      console.error('Hero image not found at:', defaultHeroPath, err.message);
      return null;
    }
  }
};

export {
  processHeroImage,
  heroImageExists,
  getHeroImagePath
};

