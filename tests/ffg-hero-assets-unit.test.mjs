import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import sharp from 'sharp';
import {
  getHeroImage,
  getHeroOgImage
} from '../fruitionforestgarden/src/utils/heroImageProcessor.js';
import buildOgTags, {
  getSiteImagePath
} from '../fruitionforestgarden/src/middleware/ogTags.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFile = promisify(execFileCallback);
const imagesDir = path.join(repositoryRoot, 'fruitionforestgarden/src/public/images');

const sourcePath = path.join(imagesDir, 'HeroCamp.png');
const heroPath = path.join(imagesDir, 'HeroCamp.webp');
const socialPath = path.join(imagesDir, 'HeroCamp-og.webp');

test('FFG preserves the source PNG and tracks optimized hero assets', async () => {
  const [source, hero, social] = await Promise.all([
    sharp(sourcePath).metadata(),
    sharp(heroPath).metadata(),
    sharp(socialPath).metadata()
  ]);
  const [sourceStats, heroStats, socialStats] = await Promise.all([
    stat(sourcePath),
    stat(heroPath),
    stat(socialPath)
  ]);

  assert.equal(source.format, 'png');
  assert.deepEqual([source.width, source.height], [4000, 3000]);
  assert.equal(sourceStats.size, 19_449_966);
  const trackedSource = await execFile(
    'git',
    ['ls-files', '--error-unmatch', 'fruitionforestgarden/src/public/images/HeroCamp.png'],
    { cwd: repositoryRoot }
  );
  assert.equal(
    trackedSource.stdout.trim(),
    'fruitionforestgarden/src/public/images/HeroCamp.png'
  );

  assert.equal(hero.format, 'webp');
  assert.deepEqual([hero.width, hero.height], [1920, 1440]);
  assert.ok(heroStats.size < 1_000_000);

  assert.equal(social.format, 'webp');
  assert.deepEqual([social.width, social.height], [1200, 630]);
  assert.ok(socialStats.size < 300_000);
});

test('FFG hero descriptors expose factual public paths and dimensions', async () => {
  assert.deepEqual(await getHeroImage(imagesDir), {
    path: '/images/HeroCamp.webp',
    width: 1920,
    height: 1440
  });
  assert.deepEqual(await getHeroOgImage(imagesDir), {
    path: '/images/HeroCamp-og.webp',
    width: 1200,
    height: 630
  });
});

test('FFG site metadata falls back from social WebP to display WebP to logo, never source PNG', async (t) => {
  const fallbackDir = await mkdtemp(path.join(repositoryRoot, 'tests/.tmp-ffg-hero-fallback-'));
  t.after(() => rm(fallbackDir, { recursive: true, force: true }));

  await copyFile(sourcePath, path.join(fallbackDir, 'HeroCamp.png'));
  assert.equal(await getSiteImagePath(null, fallbackDir), '/images/FFGnewLogo.PNG');

  await copyFile(heroPath, path.join(fallbackDir, 'HeroCamp.webp'));
  assert.equal(await getSiteImagePath(null, fallbackDir), '/images/HeroCamp.webp');

  await copyFile(socialPath, path.join(fallbackDir, 'HeroCamp-og.webp'));
  assert.equal(await getSiteImagePath(null, fallbackDir), '/images/HeroCamp-og.webp');
});

test('FFG social metadata keeps absolute production URLs and post-specific images', async () => {
  const productionRequest = {
    protocol: 'https',
    get: (name) => name === 'host' ? 'www.fruitionforestgarden.com' : null,
    hostname: 'www.fruitionforestgarden.com'
  };

  const siteTags = await buildOgTags(null, productionRequest);
  assert.match(siteTags, /property="og:image" content="https:\/\/www\.fruitionforestgarden\.com\/images\/HeroCamp-og\.webp"/);
  assert.match(siteTags, /name="twitter:image" content="https:\/\/www\.fruitionforestgarden\.com\/images\/HeroCamp-og\.webp"/);

  const postTags = await buildOgTags({
    title: 'Synthetic post',
    slug: 'synthetic-post',
    description: 'Synthetic description',
    imageList: [{ medium: '/uploads/synthetic-medium.webp', caption: 'Synthetic caption' }]
  }, productionRequest);
  assert.match(postTags, /property="og:image" content="https:\/\/www\.fruitionforestgarden\.com\/uploads\/synthetic-medium\.webp"/);
  assert.match(postTags, /name="twitter:image" content="https:\/\/www\.fruitionforestgarden\.com\/uploads\/synthetic-medium\.webp"/);
});
