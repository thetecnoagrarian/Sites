import path from 'node:path';
import { logSafeError } from '@ffg/blog-core';
import { getHeroImage, getHeroOgImage, HERO_FILENAME, HERO_OG_FILENAME } from './heroImageProcessor.js';
import { GENERATION_PATTERN, MANIFEST_FILENAME, isValidGeneration, heroStorePath, manifestPath,
  parseHeroManifest, currentSelection, readHeroManifest, publishManagedHero, resetManagedHero,
  inspectPublishedHero, inspectLegacyHero } from './heroPublicationManifest.js';
export { allocateHeroOperation, createHeroPublicationProvider, readHeroIntegrityStatus,
  readHeroOperationReceipt, managedGenerationPath, withHeroOperationLock } from './heroPublicationManifest.js';

const generationPath = (uploadsPath, generation) => {
  if (!isValidGeneration(generation)) throw new Error('Invalid hero generation identifier');
  return path.join(heroStorePath(uploadsPath), generation);
};
const parseManifest = parseHeroManifest;
const readCurrentGeneration = async uploadsPath => {
  if (!uploadsPath) return null;
  try { return currentSelection(await readHeroManifest(uploadsPath))?.generation ?? null; }
  catch (error) { logSafeError(error, { event: 'hero' }); return null; }
};

async function selectedDescriptor(uploadsPath, filename) {
  if (!uploadsPath) return null;
  try {
    const current = currentSelection(await readHeroManifest(uploadsPath));
    if (!current) return null;
    return current.kind === 'managed'
      ? await inspectPublishedHero(uploadsPath, current.generation, filename)
      : await inspectLegacyHero(uploadsPath, current.generation, filename);
  } catch (error) {
    // Visual fallback is not a manifest mutation or a publication revocation.
    logSafeError(error, { event: 'hero' });
    return null;
  }
}
const getPersistentHeroImage = uploadsPath => selectedDescriptor(uploadsPath, HERO_FILENAME);
const resolveHeroImage = async (uploadsPath, imagesDir = null) => {
  const persistent = await getPersistentHeroImage(uploadsPath);
  if (persistent) return persistent;
  const fallback = await getHeroImage(imagesDir);
  return fallback ? { ...fallback, persistent: false } : null;
};
const resolveHeroSocialImage = async (uploadsPath, imagesDir = null) => {
  const social = await selectedDescriptor(uploadsPath, HERO_OG_FILENAME);
  if (social) return social;
  const display = await selectedDescriptor(uploadsPath, HERO_FILENAME);
  if (display) return display;
  const fallback = await getHeroOgImage(imagesDir);
  return fallback ? { ...fallback, persistent: false } : null;
};
const publishHeroImage = options => publishManagedHero(options);
const resetHeroImage = (uploadsPath, options) => resetManagedHero(uploadsPath, options);

export {
  GENERATION_PATTERN, MANIFEST_FILENAME, generationPath, getPersistentHeroImage,
  heroStorePath, isValidGeneration, manifestPath, parseManifest, publishHeroImage,
  readCurrentGeneration, resetHeroImage, resolveHeroImage, resolveHeroSocialImage
};
