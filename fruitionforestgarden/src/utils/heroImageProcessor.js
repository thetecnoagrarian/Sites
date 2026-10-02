import sharp from 'sharp';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERO_IMAGE_PATH = '/images/HeroCamp.webp';
const HERO_OG_IMAGE_PATH = '/images/HeroCamp-og.webp';
const HERO_FILENAME = 'current-hero.webp';
const HERO_OG_FILENAME = 'current-hero-og.webp';
const HERO_MAX_WIDTH = 1920;
const HERO_OG_WIDTH = 1200;
const HERO_OG_HEIGHT = 630;

// This comfortably permits ordinary modern phone/camera photographs while
// bounding decoded inputs independently of the 50 MB encoded-byte limit.
const MAX_HERO_INPUT_PIXELS = 150_000_000;
const MAX_HERO_INPUT_DIMENSION = 20_000;
const ALLOWED_SOURCE_FORMATS = new Map([
  ['jpeg', 'jpg'],
  ['png', 'png'],
  ['webp', 'webp']
]);

const getDefaultImagesDir = () => {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../public/images');
};

const getImageDescriptor = async (imagesDir, publicPath) => {
  const filePath = path.join(imagesDir, path.basename(publicPath));
  try {
    const [stats, metadata] = await Promise.all([fs.stat(filePath), sharp(filePath).metadata()]);
    if (!stats.isFile() || stats.size < 1
      || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) return null;
    return { path: publicPath, width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return null;
    throw error;
  }
};

const validateHeroSourceMetadata = (metadata) => {
  const extension = ALLOWED_SOURCE_FORMATS.get(metadata?.format);
  if (!extension) throw new Error('Hero image must decode as JPEG, PNG, or WebP');
  const { width, height } = metadata;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Hero image dimensions are unavailable');
  }
  if (width > MAX_HERO_INPUT_DIMENSION || height > MAX_HERO_INPUT_DIMENSION
    || width * height > MAX_HERO_INPUT_PIXELS) {
    throw new Error(
      `Hero image exceeds the decoded limit of ${MAX_HERO_INPUT_PIXELS} pixels and ${MAX_HERO_INPUT_DIMENSION}px per axis`
    );
  }
  return { format: metadata.format, extension, width, height };
};

const inspectHeroSource = async (inputPath) => {
  let metadata;
  try {
    metadata = await sharp(inputPath, {
      failOn: 'error',
      limitInputPixels: MAX_HERO_INPUT_PIXELS
    }).metadata();
  } catch (error) {
    throw new Error('Hero image could not be decoded within safety limits');
  }
  return validateHeroSourceMetadata(metadata);
};

const verifyGeneratedHero = async (filePath, expected) => {
  const descriptor = await getImageDescriptor(path.dirname(filePath), `/${path.basename(filePath)}`);
  if (!descriptor) throw new Error(`Generated hero image is missing or empty: ${path.basename(filePath)}`);
  const metadata = await sharp(filePath).metadata();
  if (metadata.format !== 'webp'
    || descriptor.width !== expected.width || descriptor.height !== expected.height) {
    throw new Error(`Generated hero verification failed: ${path.basename(filePath)}`);
  }
  return descriptor;
};

// Generate a complete unpublished hero generation. The caller owns publication.
const processHeroImage = async (inputPath, outputDir, { onPhase = async () => {} } = {}) => {
  if (!outputDir) throw new TypeError('A hero generation output directory is required');

  await onPhase('source-validation');
  const source = await inspectHeroSource(inputPath);
  await fs.mkdir(path.join(outputDir, '.source'), { recursive: true });
  await fs.copyFile(inputPath, path.join(outputDir, '.source', `current-source.${source.extension}`));

  const ratio = Math.min(1, HERO_MAX_WIDTH / source.width);
  const heroDimensions = {
    width: Math.round(source.width * ratio),
    height: Math.round(source.height * ratio)
  };
  const heroOutputPath = path.join(outputDir, HERO_FILENAME);
  const ogOutputPath = path.join(outputDir, HERO_OG_FILENAME);

  await onPhase('display-generation');
  await sharp(inputPath, { failOn: 'error', limitInputPixels: MAX_HERO_INPUT_PIXELS })
    .resize(HERO_MAX_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(heroOutputPath);

  await onPhase('social-generation');
  await sharp(inputPath, { failOn: 'error', limitInputPixels: MAX_HERO_INPUT_PIXELS })
    .resize(HERO_OG_WIDTH, HERO_OG_HEIGHT, { fit: 'cover', position: 'center' })
    .webp({ quality: 80 })
    .toFile(ogOutputPath);

  await onPhase('verification');
  await Promise.all([
    verifyGeneratedHero(heroOutputPath, heroDimensions),
    verifyGeneratedHero(ogOutputPath, { width: HERO_OG_WIDTH, height: HERO_OG_HEIGHT })
  ]);
  const [heroStats, ogStats] = await Promise.all([fs.stat(heroOutputPath), fs.stat(ogOutputPath)]);

  return {
    source,
    heroSize: heroStats.size,
    ogSize: ogStats.size,
    heroDimensions,
    ogDimensions: { width: HERO_OG_WIDTH, height: HERO_OG_HEIGHT }
  };
};

const heroImageExists = async (imagesDir = null) => Boolean(await getHeroImage(imagesDir));

// Repository assets are immutable defaults; the archival PNG is never a fallback.
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
  ALLOWED_SOURCE_FORMATS,
  HERO_FILENAME,
  HERO_OG_FILENAME,
  MAX_HERO_INPUT_DIMENSION,
  MAX_HERO_INPUT_PIXELS,
  getHeroImage,
  getHeroImagePath,
  getHeroOgImage,
  heroImageExists,
  inspectHeroSource,
  processHeroImage,
  validateHeroSourceMetadata
};
