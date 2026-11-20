import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import sharp from 'sharp';
import {
  MAX_HERO_INPUT_DIMENSION,
  MAX_HERO_INPUT_PIXELS,
  validateHeroSourceMetadata
} from '../fruitionforestgarden/src/utils/heroImageProcessor.js';
import {
  managedGenerationPath as generationPath,
  allocateHeroOperation,
  manifestPath,
  parseManifest,
  publishHeroImage as publish,
  readCurrentGeneration,
  resetHeroImage as reset,
  resolveHeroImage,
  resolveHeroSocialImage,
  withHeroOperationLock
} from '../fruitionforestgarden/src/utils/heroImageStore.js';
import { ownedUploadDirectory, reserveUploadFilename, recordOwnedUpload } from '../blog-core/src/middleware/owned-upload.js';

// Existing lifecycle assertions now enter through the real private raw-upload
// ownership and server-issued operation contract, not arbitrary input paths.
async function publishHeroImage(options) {
  const req = {}, filename = path.basename(options.inputPath);
  const directory = await ownedUploadDirectory(req, path.join(options.uploadsPath, 'temp'));
  const inputPath = path.join(directory, filename);
  await reserveUploadFilename(req, filename);
  await copyFile(options.inputPath, inputPath);
  await recordOwnedUpload(req, { filename, path: inputPath });
  const operationId = await allocateHeroOperation(options.uploadsPath, 1);
  return publish({ ...options, inputPath, operationId, ownerUserId: 1 });
}
async function resetHeroImage(uploadsPath) {
  const operationId = await allocateHeroOperation(uploadsPath, 1, 'reset');
  return reset(uploadsPath, { operationId, ownerUserId: 1 });
}

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve('.');
const repoImages = path.join(repositoryRoot, 'fruitionforestgarden/src/public/images');

async function fixture(t) {
  const root = await mkdtemp(path.join(repositoryRoot, 'tests/.tmp-ffg-hero-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const uploads = path.join(root, 'uploads');
  const images = path.join(root, 'images');
  await Promise.all([mkdir(uploads), mkdir(images)]);
  await Promise.all([
    copyFile(path.join(repoImages, 'HeroCamp.webp'), path.join(images, 'HeroCamp.webp')),
    copyFile(path.join(repoImages, 'HeroCamp-og.webp'), path.join(images, 'HeroCamp-og.webp')),
    copyFile(path.join(repoImages, 'FFGnewLogo.PNG'), path.join(images, 'FFGnewLogo.PNG'))
  ]);
  return { root, uploads, images };
}

async function synthetic(root, name, format, color = { r: 30, g: 120, b: 60 }) {
  const target = path.join(root, name);
  const image = sharp({ create: { width: 2400, height: 1200, channels: 3, background: color } });
  await image.toFormat(format).toFile(target);
  return target;
}

async function hash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function activeSnapshot(uploads) {
  const generation = await readCurrentGeneration(uploads);
  const dir = generationPath(uploads, generation);
  return {
    manifest: await readFile(manifestPath(uploads), 'utf8'),
    generation,
    displayHash: await hash(path.join(dir, 'current-hero.webp')),
    socialHash: await hash(path.join(dir, 'current-hero-og.webp')),
    display: await resolveHeroImage(uploads),
    social: await resolveHeroSocialImage(uploads)
  };
}

test('manifest validation rejects malformed and path-bearing generation content', () => {
  for (const text of [
    '{}',
    '{bad',
    JSON.stringify({ generation: '../../escape' }),
    JSON.stringify({ generation: '00000000-0000-4000-8000-000000000000/child' }),
    JSON.stringify({ generation: '00000000-0000-4000-8000-000000000000\\child' }),
    JSON.stringify({ generation: '00000000-0000-4000-8000-000000000000', extra: true })
  ]) assert.throws(() => parseManifest(text));
});

test('resolver fails closed to repository assets and never archival PNG', async (t) => {
  const { uploads, images } = await fixture(t);
  assert.deepEqual(await resolveHeroImage(uploads, images), {
    path: '/images/HeroCamp.webp', width: 1920, height: 1440, persistent: false
  });

  await mkdir(path.dirname(manifestPath(uploads)), { recursive: true });
  await writeFile(manifestPath(uploads), '{bad');
  assert.equal((await resolveHeroImage(uploads, images)).path, '/images/HeroCamp.webp');

  await writeFile(manifestPath(uploads), JSON.stringify({ generation: '00000000-0000-4000-8000-000000000000' }));
  assert.equal((await resolveHeroImage(uploads, images)).path, '/images/HeroCamp.webp');

  await rm(path.join(images, 'HeroCamp-og.webp'));
  assert.equal((await resolveHeroSocialImage(uploads, images)).path, '/images/HeroCamp.webp');
  await rm(path.join(images, 'HeroCamp.webp'));
  assert.equal(await resolveHeroSocialImage(uploads, images), null);
});

test('JPEG, PNG, and WebP publish with canonical retained-source extensions', async (t) => {
  const { root, uploads } = await fixture(t);
  const generations = [];
  for (const [format, extension] of [['jpeg', 'jpg'], ['png', 'png'], ['webp', 'webp']]) {
    const input = await synthetic(root, `source-${format}.${extension}`, format);
    const result = await publishHeroImage({ inputPath: input, uploadsPath: uploads });
    generations.push(result.generation);
    const dir = generationPath(uploads, result.generation);
    const retainedSource = path.join(dir, '.source', `current-source.${extension}`);
    assert.equal(await hash(retainedSource), await hash(input));
    assert.deepEqual(
      (await readdir(path.join(uploads, '.media', 'hero'))).sort(),
      [...generations].sort()
    );
    assert.deepEqual(await readdir(path.join(uploads, 'hero')), ['.current.json']);
    assert.equal(result.descriptor.path, `/uploads/hero/m1-${result.generation}/current-hero.webp`);
    assert.deepEqual(result.heroDimensions, { width: 1920, height: 960 });
    assert.deepEqual(result.ogDimensions, { width: 1200, height: 630 });
  }
});

test('decoded GIF, fake image, and corrupt image are rejected', async (t) => {
  const { root, uploads } = await fixture(t);
  const gif = await synthetic(root, 'source.gif', 'gif');
  const fake = path.join(root, 'fake.png');
  const corrupt = path.join(root, 'corrupt.webp');
  await writeFile(fake, 'not an image');
  await writeFile(corrupt, Buffer.from([0x52, 0x49, 0x46]));
  await assert.rejects(publishHeroImage({ inputPath: gif, uploadsPath: uploads }), /JPEG, PNG, or WebP/);
  await assert.rejects(publishHeroImage({ inputPath: fake, uploadsPath: uploads }), /could not be decoded/);
  await assert.rejects(publishHeroImage({ inputPath: corrupt, uploadsPath: uploads }), /could not be decoded/);
  assert.equal(await readCurrentGeneration(uploads), null);
});

test('decoded pixel and per-axis ceilings have exact boundaries', () => {
  assert.doesNotThrow(() => validateHeroSourceMetadata({ format: 'jpeg', width: 15_000, height: 10_000 }));
  assert.throws(() => validateHeroSourceMetadata({ format: 'jpeg', width: 15_001, height: 10_000 }), /decoded limit/);
  assert.throws(() => validateHeroSourceMetadata({ format: 'png', width: MAX_HERO_INPUT_DIMENSION + 1, height: 1 }), /decoded limit/);
  assert.equal(MAX_HERO_INPUT_PIXELS, 150_000_000);
});

test('persistent display/social resolution, corrupt fallback, replacement URL, and reset', async (t) => {
  const { root, uploads, images } = await fixture(t);
  const first = await publishHeroImage({
    inputPath: await synthetic(root, 'first.jpg', 'jpeg'), uploadsPath: uploads
  });
  assert.equal((await resolveHeroImage(uploads, images)).path, first.descriptor.path);
  assert.equal((await resolveHeroSocialImage(uploads, images)).path, first.socialDescriptor.path);

  await unlink(path.join(generationPath(uploads, first.generation), 'current-hero-og.webp'));
  assert.equal((await resolveHeroSocialImage(uploads, images)).path, first.descriptor.path);

  const second = await publishHeroImage({
    inputPath: await synthetic(root, 'second.png', 'png', { r: 130, g: 40, b: 80 }), uploadsPath: uploads
  });
  assert.notEqual(second.descriptor.path, first.descriptor.path);
  assert.equal(await hash(path.join(generationPath(uploads, first.generation), '.source/current-source.jpg')),
    await hash(path.join(root, 'first.jpg')), 'replacement retains the previous source');
  await writeFile(path.join(generationPath(uploads, second.generation), 'current-hero.webp'), 'corrupt');
  assert.equal((await resolveHeroImage(uploads, images)).path, '/images/HeroCamp.webp');

  await resetHeroImage(uploads);
  await readFile(path.join(generationPath(uploads, first.generation), 'current-hero.webp'));
  await readFile(path.join(generationPath(uploads, second.generation), '.source/current-source.png'));
  assert.equal((await resolveHeroImage(uploads, images)).path, '/images/HeroCamp.webp');
  const repeated = await resetHeroImage(uploads);
  assert.equal(repeated.reset, false); assert.equal(repeated.generation, null);
  assert.equal(repeated.receipt.action, 'reset');
});

test('every injected pre-publication failure preserves manifest, URLs, and hashes', async (t) => {
  const { root, uploads } = await fixture(t);
  await publishHeroImage({ inputPath: await synthetic(root, 'active.jpg', 'jpeg'), uploadsPath: uploads });
  const before = await activeSnapshot(uploads);

  for (const phase of [
    'source-validation', 'display-generation', 'social-generation',
    'verification', 'manifest-write', 'manifest-rename'
  ]) {
    const replacement = await synthetic(root, `failure-${phase}.png`, 'png', { r: 180, g: 20, b: 30 });
    await assert.rejects(publishHeroImage({
      inputPath: replacement,
      uploadsPath: uploads,
      onPhase: current => { if (current === phase) throw new Error(`injected ${phase}`); }
    }), new RegExp(`injected ${phase}`));
    assert.deepEqual(await activeSnapshot(uploads), before);
  }
});

test('hero operation lock serializes upload/reset critical sections', async t => {
  const { uploads } = await fixture(t);
  const events = [];
  const firstGate = Promise.withResolvers(), started = Promise.withResolvers();
  const first = withHeroOperationLock(uploads, async () => {
    events.push('first-start');
    started.resolve();
    await firstGate.promise;
    events.push('first-end');
  });
  await started.promise;
  const second = withHeroOperationLock(uploads, async () => { events.push('second'); });
  assert.deepEqual(events, ['first-start']);
  firstGate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first-start', 'first-end', 'second']);
});

test('hero operation lock preserves queue order after a rejected operation', async t => {
  const { uploads } = await fixture(t);
  const events = [];
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const first = withHeroOperationLock(uploads, async () => {
    events.push('first');
    started.resolve();
    await release.promise;
    throw new Error('expected failure');
  });
  await started.promise;
  const secondStarted = Promise.withResolvers(), releaseSecond = Promise.withResolvers();
  const second = withHeroOperationLock(uploads, async () => {
    events.push('second');
    secondStarted.resolve();
    await releaseSecond.promise;
  });
  release.resolve();
  await assert.rejects(first, /expected failure/);
  await secondStarted.promise;
  const third = withHeroOperationLock(uploads, async () => { events.push('third'); });
  releaseSecond.resolve();
  await Promise.all([second, third]);
  assert.deepEqual(events, ['first', 'second', 'third']);
});

test('recursive uploads archive restores manifest, source, display, and social', async (t) => {
  const { root, uploads } = await fixture(t);
  const result = await publishHeroImage({
    inputPath: await synthetic(root, 'backup.webp', 'webp'), uploadsPath: uploads
  });
  const archive = path.join(root, 'uploads.tar.gz');
  const restoreRoot = path.join(root, 'restore');
  await mkdir(restoreRoot);
  await execFile('tar', ['-czf', archive, '-C', root, 'uploads']);
  await execFile('tar', ['-xzf', archive, '-C', restoreRoot]);
  const restoredUploads = path.join(restoreRoot, 'uploads');
  assert.equal(await readCurrentGeneration(restoredUploads), result.generation);
  const dir = generationPath(restoredUploads, result.generation);
  await Promise.all([
    readFile(manifestPath(restoredUploads)),
    readFile(path.join(dir, '.source', 'current-source.webp')),
    readFile(path.join(dir, 'current-hero.webp')),
    readFile(path.join(dir, 'current-hero-og.webp'))
  ]);
  assert.equal((await resolveHeroImage(restoredUploads)).generation, result.generation);
});
