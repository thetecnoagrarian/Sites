import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import sharp from 'sharp';
import {
  HERO_FILENAME,
  HERO_OG_FILENAME,
  getHeroImage,
  getHeroOgImage,
  processHeroImage
} from './heroImageProcessor.js';

const MANIFEST_FILENAME = '.current.json';
const GENERATION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isValidGeneration = value => typeof value === 'string'
  && GENERATION_PATTERN.test(value)
  && !value.includes('/') && !value.includes('\\') && !value.includes('..');

const heroStorePath = uploadsPath => path.join(uploadsPath, 'hero');
const manifestPath = uploadsPath => path.join(heroStorePath(uploadsPath), MANIFEST_FILENAME);
const generationPath = (uploadsPath, generation) => {
  if (!isValidGeneration(generation)) throw new Error('Invalid hero generation identifier');
  return path.join(heroStorePath(uploadsPath), generation);
};
const publicGenerationPath = (generation, filename) => `/uploads/hero/${generation}/${filename}`;

const parseManifest = text => {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 1 || !isValidGeneration(value.generation)) {
    throw new Error('Invalid hero manifest');
  }
  return value;
};

const readCurrentGeneration = async (uploadsPath) => {
  if (!uploadsPath) return null;
  try {
    return parseManifest(await fs.readFile(manifestPath(uploadsPath), 'utf8')).generation;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Hero manifest unavailable; using repository fallback:', error.message);
    return null;
  }
};

const persistentDescriptor = async (uploadsPath, generation, filename) => {
  const filePath = path.join(generationPath(uploadsPath, generation), filename);
  try {
    const [stats, metadata] = await Promise.all([fs.stat(filePath), sharp(filePath).metadata()]);
    if (!stats.isFile() || stats.size < 1 || metadata.format !== 'webp'
      || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) return null;
    if (filename === HERO_FILENAME && metadata.width > 1920) return null;
    if (filename === HERO_OG_FILENAME && (metadata.width !== 1200 || metadata.height !== 630)) return null;
    return {
      path: publicGenerationPath(generation, filename),
      width: metadata.width,
      height: metadata.height,
      persistent: true,
      generation
    };
  } catch {
    return null;
  }
};

const getPersistentHeroImage = async (uploadsPath) => {
  const generation = await readCurrentGeneration(uploadsPath);
  return generation ? persistentDescriptor(uploadsPath, generation, HERO_FILENAME) : null;
};

const resolveHeroImage = async (uploadsPath, imagesDir = null) => {
  const persistent = await getPersistentHeroImage(uploadsPath);
  if (persistent) return persistent;
  const fallback = await getHeroImage(imagesDir);
  return fallback ? { ...fallback, persistent: false } : null;
};

const resolveHeroSocialImage = async (uploadsPath, imagesDir = null) => {
  const generation = await readCurrentGeneration(uploadsPath);
  if (generation) {
    const social = await persistentDescriptor(uploadsPath, generation, HERO_OG_FILENAME);
    if (social) return social;
    const display = await persistentDescriptor(uploadsPath, generation, HERO_FILENAME);
    if (display) return display;
  }
  const fallback = await getHeroOgImage(imagesDir);
  return fallback ? { ...fallback, persistent: false } : null;
};

const removePath = async (target, { recursive = false, logger = console } = {}) => {
  try {
    await fs.rm(target, { recursive, force: true });
  } catch (error) {
    logger.error('Hero cleanup failed:', error);
  }
};

const publishHeroImage = async ({ inputPath, uploadsPath, onPhase, logger = console }) => {
  if (!uploadsPath) throw new TypeError('The runtime uploads path is required');
  const store = heroStorePath(uploadsPath);
  const generation = randomUUID();
  const staging = path.join(store, `.staging-${generation}`);
  const promoted = generationPath(uploadsPath, generation);
  const temporaryManifest = path.join(store, `.current-${generation}.tmp`);
  let wasPromoted = false;
  let wasPublished = false;
  const previousGeneration = await readCurrentGeneration(uploadsPath);

  try {
    await fs.mkdir(store, { recursive: true });
    const result = await processHeroImage(inputPath, staging, { onPhase });
    await fs.rename(staging, promoted);
    wasPromoted = true;

    const descriptor = await persistentDescriptor(uploadsPath, generation, HERO_FILENAME);
    const socialDescriptor = await persistentDescriptor(uploadsPath, generation, HERO_OG_FILENAME);
    if (!descriptor || !socialDescriptor) throw new Error('Completed hero generation could not be resolved');

    if (onPhase) await onPhase('manifest-write');
    await fs.writeFile(temporaryManifest, `${JSON.stringify({ generation })}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });
    if (onPhase) await onPhase('manifest-rename');
    await fs.rename(temporaryManifest, manifestPath(uploadsPath));
    wasPublished = true;

    if (previousGeneration && previousGeneration !== generation) {
      await removePath(generationPath(uploadsPath, previousGeneration), { recursive: true, logger });
    }
    return { ...result, generation, descriptor, socialDescriptor };
  } catch (error) {
    if (!wasPublished) {
      await removePath(staging, { recursive: true, logger });
      if (wasPromoted) await removePath(promoted, { recursive: true, logger });
      await removePath(temporaryManifest, { logger });
    }
    throw error;
  }
};

const resetHeroImage = async (uploadsPath, { logger = console } = {}) => {
  const generation = await readCurrentGeneration(uploadsPath);
  try {
    await fs.unlink(manifestPath(uploadsPath));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (generation) await removePath(generationPath(uploadsPath, generation), { recursive: true, logger });
  return { reset: Boolean(generation), generation };
};

let operationTail = Promise.resolve();
const withHeroOperationLock = async operation => {
  const preceding = operationTail;
  let release;
  const current = new Promise(resolve => { release = resolve; });
  operationTail = preceding.catch(() => {}).then(() => current);
  await preceding.catch(() => {});
  try {
    return await operation();
  } finally {
    release();
  }
};

export {
  GENERATION_PATTERN,
  MANIFEST_FILENAME,
  generationPath,
  getPersistentHeroImage,
  heroStorePath,
  isValidGeneration,
  manifestPath,
  parseManifest,
  publishHeroImage,
  readCurrentGeneration,
  resetHeroImage,
  resolveHeroImage,
  resolveHeroSocialImage,
  withHeroOperationLock
};
