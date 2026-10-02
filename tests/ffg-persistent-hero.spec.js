import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

import sharp from 'sharp';

const TEST_ADMIN = {
  username: 'mode-b-multer-admin',
  password: 'ModeB-Multer-Synthetic-Only-2026'
};
const DOCKER_BIN = process.env.DOCKER_BIN || '/usr/local/bin/docker';
const PROJECT = process.env.MODE_B_PROJECT || 'sites-local-test';
const BASE_URL = process.env.FFG_TEST_URL || 'http://127.0.0.1:4000';
const COMPOSE_ARGS = ['compose', '-p', PROJECT, '-f', 'docker-compose.test.yml'];

const containerJson = script => JSON.parse(execFileSync(DOCKER_BIN, [
  ...COMPOSE_ARGS, 'exec', '-T', 'fruitionforestgarden',
  'node', '--input-type=module', '-e', script
], { encoding: 'utf8' }));

const currentState = () => containerJson(`
  import { createHash } from 'node:crypto';
  import { readFile, readdir } from 'node:fs/promises';
  const manifest = JSON.parse(await readFile('/app/data/uploads/hero/.current.json', 'utf8'));
  const base = '/app/data/uploads/hero/' + manifest.generation;
  const sourceNames = (await readdir(base + '/.source')).sort();
  if (sourceNames.length !== 1) throw new Error('Expected exactly one retained hero source');
  const sourceName = sourceNames[0];
  const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');
  console.log(JSON.stringify({
    generation: manifest.generation,
    sourceName,
    sourceUrl: '/uploads/hero/' + manifest.generation + '/.source/' + sourceName,
    displayUrl: '/uploads/hero/' + manifest.generation + '/current-hero.webp',
    socialUrl: '/uploads/hero/' + manifest.generation + '/current-hero-og.webp',
    sourceHash: await digest(base + '/.source/' + sourceName),
    displayHash: await digest(base + '/current-hero.webp'),
    socialHash: await digest(base + '/current-hero-og.webp')
  }));
`);

const ogImage = html => html.match(/<meta property="og:image" content="([^"]+)" \/>/)?.[1];
const twitterImage = html => html.match(/<meta name="twitter:image" content="([^"]+)" \/>/)?.[1];

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Username').fill(TEST_ADMIN.username);
  await page.getByLabel('Password').fill(TEST_ADMIN.password);
  await Promise.all([
    page.waitForURL(/\/admin(?:\/dashboard)?\/?$/),
    page.getByRole('button', { name: 'Login' }).click()
  ]);
}

async function upload(page, name, buffer, mimeType) {
  await page.goto(`${BASE_URL}/admin/hero-image`);
  await page.locator('input[name="heroImage"]').setInputFiles({ name, buffer, mimeType });
  await Promise.all([
    page.waitForNavigation(),
    page.locator('form.hero-upload-form').evaluate(form => form.requestSubmit())
  ]);
  await expect(page).toHaveURL(`${BASE_URL}/admin/hero-image`);
}

async function verifyPublicState(page, expected) {
  for (const [path, selector] of [['/', '.hero-image'], ['/about', '.about-image']]) {
    const response = await page.goto(`${BASE_URL}${path}`);
    expect(response.status()).toBe(200);
    const hero = page.locator(selector);
    await expect(hero).toHaveAttribute('src', expected.displayUrl);
    await expect(hero).toHaveAttribute('width', '1920');
    await expect(hero).toHaveAttribute('height', '960');
    await expect(hero).toHaveAttribute('loading', 'eager');
    await expect(hero).toHaveAttribute('fetchpriority', 'high');
    const html = await response.text();
    expect(ogImage(html)).toBe(`${BASE_URL}${expected.socialUrl}`);
    expect(twitterImage(html)).toBe(`${BASE_URL}${expected.socialUrl}`);
    expect(html).not.toContain('HeroCamp.png');
  }
  for (const publicImageUrl of [expected.displayUrl, expected.socialUrl]) {
    const image = await page.request.get(`${BASE_URL}${publicImageUrl}`);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/webp');
  }

  const deniedSourceUrls = [
    expected.sourceUrl,
    expected.sourceUrl.replace('/.source/', '/%2esource/'),
    expected.sourceUrl.replace('/.source/', '/%252esource/'),
    `/uploads/hero%2F${expected.generation}%2F.source%2F${expected.sourceName}`
  ];
  for (const sourceUrl of deniedSourceUrls) {
    const source = await page.request.get(`${BASE_URL}${sourceUrl}`);
    expect(source.status()).toBe(404);
  }
}

test.describe.configure({ mode: 'serial' });

test('FFG persistent seasonal hero browser lifecycle', async ({ page }) => {
  const imageA = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: { r: 30, g: 120, b: 60 } }
  }).jpeg().toBuffer();
  const imageB = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: { r: 140, g: 50, b: 90 } }
  }).png().toBuffer();

  await login(page);
  let first;
  if (process.env.HERO_USE_CURRENT_AS_FIRST === '1') {
    first = currentState();
    await verifyPublicState(page, first);
  } else {
    await page.goto(`${BASE_URL}/admin/hero-image`);
    const reset = page.locator('form.hero-reset-form');
    if (await reset.count()) {
      await Promise.all([page.waitForNavigation(), reset.evaluate(form => form.requestSubmit())]);
    }

    for (const [path, selector] of [['/', '.hero-image'], ['/about', '.about-image']]) {
      const response = await page.goto(`${BASE_URL}${path}`);
      await expect(page.locator(selector)).toHaveAttribute('src', '/images/HeroCamp.webp');
      const html = await response.text();
      expect(ogImage(html)).toBe(`${BASE_URL}/images/HeroCamp-og.webp`);
      expect(html).not.toContain('HeroCamp.png');
    }

    await upload(page, 'seasonal-a.jpg', imageA, 'image/jpeg');
    await expect(page.getByText('persistent seasonal hero is active')).toBeVisible();
    first = currentState();
    await verifyPublicState(page, first);
  }

  if (process.env.HERO_STOP_AFTER_FIRST === '1' || process.env.HERO_VERIFY_ONLY === '1') return;

  await upload(page, 'seasonal-b.png', imageB, 'image/png');
  const second = currentState();
  expect(second.generation).not.toBe(first.generation);
  expect(second.displayUrl).not.toBe(first.displayUrl);
  expect(second.socialUrl).not.toBe(first.socialUrl);
  await verifyPublicState(page, second);

  await upload(page, 'failed-replacement.png', Buffer.from('not an image'), 'image/png');
  expect(currentState()).toEqual(second);
  await verifyPublicState(page, second);

  await page.goto(`${BASE_URL}/admin/hero-image`);
  await Promise.all([
    page.waitForNavigation(),
    page.locator('form.hero-reset-form').evaluate(form => form.requestSubmit())
  ]);
  await expect(page.getByText('immutable repository default is active')).toBeVisible();
  const response = await page.goto(`${BASE_URL}/`);
  await expect(page.locator('.hero-image')).toHaveAttribute('src', '/images/HeroCamp.webp');
  expect(ogImage(await response.text())).toBe(`${BASE_URL}/images/HeroCamp-og.webp`);
});
