import sharp from 'sharp';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const HERO_IMAGE_PATH = '/images/HeroCamp.webp';
const HERO_OG_IMAGE_PATH = '/images/HeroCamp-og.webp';

const getDefaultImagesDir = () => {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../public/images');
};

const getImageDescriptor = async (imagesDir, publicPath) => {
  const filePath = path.join(imagesDir, path.basename(publicPath));
  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  const metadata = await sharp(filePath).metadata();
  if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) {
    throw new Error(`Image dimensions are unavailable for ${filePath}`);
  }

  return {
    path: publicPath,
    width: metadata.width,
    height: metadata.height
  };
};

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
    const oldHeroPath = path.join(outputDir, path.basename(HERO_IMAGE_PATH));
    const oldOgPath = path.join(outputDir, path.basename(HERO_OG_IMAGE_PATH));
    
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

    const heroOutputPath = path.join(outputDir, path.basename(HERO_IMAGE_PATH));
    
    await sharp(inputPath)
      .resize(heroWidth, heroHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 85 })
      .toFile(heroOutputPath);

    // Process OG Image: 1200x630px with center crop
    const ogOutputPath = path.join(outputDir, path.basename(HERO_OG_IMAGE_PATH));
    
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
      heroImagePath: HERO_IMAGE_PATH,
      ogImagePath: HERO_OG_IMAGE_PATH,
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
  const dir = imagesDir || getDefaultImagesDir();
  const heroPath = path.join(dir, path.basename(HERO_IMAGE_PATH));
  
  try {
    await fs.access(heroPath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Get the optimized hero image and its intrinsic dimensions.
 * The archival HeroCamp.png is deliberately not a public fallback.
 * @param {string} imagesDir - Directory to check (default: src/public/images)
 * @returns {Promise<Object|null>} Public path and dimensions, or null if missing
 */
const getHeroImage = async (imagesDir = null) => (
  getImageDescriptor(imagesDir || getDefaultImagesDir(), HERO_IMAGE_PATH)
);

const getHeroOgImage = async (imagesDir = null) => {
  const dir = imagesDir || getDefaultImagesDir();
  return (await getImageDescriptor(dir, HERO_OG_IMAGE_PATH))
    || getImageDescriptor(dir, HERO_IMAGE_PATH);
};

const getHeroImagePath = async (imagesDir = null) => (
  (await getHeroImage(imagesDir))?.path || null
);

export {
  processHeroImage,
  heroImageExists,
  getHeroImage,
  getHeroOgImage,
  getHeroImagePath
};
