import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const TEST_ADMIN = {
  username: 'mode-b-multer-admin',
  password: 'ModeB-Multer-Synthetic-Only-2026'
};

const DOCKER_BIN = process.env.DOCKER_BIN || '/usr/local/bin/docker';
const COMPOSE_ARGS = ['compose', '-p', 'sites-local-test', '-f', 'docker-compose.test.yml'];
const RUN_ID = Date.now();

const TEST_SITES = [
  {
    key: 'ffg',
    name: 'Fruition Forest Garden',
    baseURL: 'http://localhost:4000',
    service: 'fruitionforestgarden'
  },
  {
    key: 'tta',
    name: 'The Tecnoagrarian',
    baseURL: 'http://localhost:4002',
    service: 'thetecnoagrarian'
  }
];

const VARIANT_LIMITS = {
  thumbnail: { width: 400, height: 400 },
  medium: { width: 800, height: 800 },
  large: { width: 1920, height: 1920 }
};

const corruptImage = {
  name: `sharp-corrupt-${RUN_ID}.png`,
  mimeType: 'image/png',
  buffer: Buffer.from('synthetic corrupt image bytes')
};

const invalidMimeFile = {
  name: `sharp-invalid-mime-${RUN_ID}.txt`,
  mimeType: 'text/plain',
  buffer: Buffer.from('synthetic non-image upload')
};

let landscapeJpeg;
let portraitPng;

test.beforeAll(async () => {
  landscapeJpeg = await sharp({
    create: {
      width: 2400,
      height: 1200,
      channels: 3,
      background: { r: 42, g: 116, b: 76 }
    }
  }).jpeg({ quality: 90 }).toBuffer();

  portraitPng = await sharp({
    create: {
      width: 1200,
      height: 2400,
      channels: 4,
      background: { r: 73, g: 112, b: 168, alpha: 1 }
    }
  }).png().toBuffer();
});

const imageFile = (name, mimeType, buffer) => ({ name, mimeType, buffer });

const containerJson = (service, script) => JSON.parse(execFileSync(
  DOCKER_BIN,
  [
    ...COMPOSE_ARGS,
    'exec', '-T', service,
    'node', '--input-type=module', '-e', script
  ],
  { encoding: 'utf8' }
));

const containerFiles = (service, directory, prefix, suffix = '') => containerJson(
  service,
  `
    import { readdir } from 'node:fs/promises';
    let files = [];
    try {
      files = (await readdir(${JSON.stringify(directory)}))
        .filter((name) => name.startsWith(${JSON.stringify(prefix)}) && name.endsWith(${JSON.stringify(suffix)}))
        .sort();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    console.log(JSON.stringify(files));
  `
);

const containerMetadata = (service, directory, filenames) => containerJson(
  service,
  `
    import path from 'node:path';
    import sharp from 'sharp';
    const directory = ${JSON.stringify(directory)};
    const filenames = ${JSON.stringify(filenames)};
    const results = [];
    for (const filename of filenames) {
      const metadata = await sharp(path.join(directory, filename)).metadata();
      results.push({ filename, format: metadata.format, width: metadata.width, height: metadata.height });
    }
    console.log(JSON.stringify(results));
  `
);

async function loginNormally(page, site) {
  await page.goto(`${site.baseURL}/login`);
  await expect(page.locator('input[name="_csrf"]')).toHaveValue(/.+/);
  await page.getByLabel('Username').fill(TEST_ADMIN.username);
  await page.getByLabel('Password').fill(TEST_ADMIN.password);

  await Promise.all([
    page.waitForURL(/\/admin(?:\/dashboard)?\/?$/),
    page.getByRole('button', { name: 'Login' }).click()
  ]);
}

async function openPostForm(page, site) {
  await page.goto(`${site.baseURL}/admin/posts/new`);
  await expect(page).toHaveURL(`${site.baseURL}/admin/posts/new`);
  await expect(page.locator('input[name="_csrf"]')).toHaveValue(/.+/);
}

async function submitPost(page, title, files) {
  await page.locator('input[name="title"]').fill(title);
  await page.locator('textarea[name="body"]').fill(`${title} synthetic body`);
  await page.locator('input[name="created_at"]').fill('2026-08-18');
  await page.locator('input[name="image"]').setInputFiles(files);

  await Promise.all([
    page.waitForNavigation(),
    page.locator('form.post-form').evaluate((form) => form.requestSubmit())
  ]);
}

async function verifyVariants(page, site, inputBase, expectedRatio) {
  const files = containerFiles(site.service, '/app/data/uploads', inputBase, '.webp');
  expect(files).toHaveLength(3);

  const metadata = containerMetadata(site.service, '/app/data/uploads', files);
  for (const output of metadata) {
    const variant = output.filename.match(/-(thumbnail|medium|large)\.webp$/)?.[1];
    expect(variant).toBeTruthy();
    expect(output.format).toBe('webp');
    expect(output.width).toBeLessThanOrEqual(VARIANT_LIMITS[variant].width);
    expect(output.height).toBeLessThanOrEqual(VARIANT_LIMITS[variant].height);
    expect(Math.abs((output.width / output.height) - expectedRatio)).toBeLessThan(0.01);

    const response = await page.request.get(`${site.baseURL}/uploads/${output.filename}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');
  }
}

async function runPostProcessingMatrix(page, site) {
  await loginNormally(page, site);

  const jpegBase = `sharp-${site.key}-${RUN_ID}-landscape`;
  const pngBase = `sharp-${site.key}-${RUN_ID}-portrait`;
  const validTitle = `Mode B Sharp ${site.key} Valid ${RUN_ID}`;

  await test.step('JPEG and PNG produce three bounded WebP variants each', async () => {
    await openPostForm(page, site);
    await submitPost(page, validTitle, [
      imageFile(`${jpegBase}.jpg`, 'image/jpeg', landscapeJpeg),
      imageFile(`${pngBase}.png`, 'image/png', portraitPng)
    ]);

    await expect(page).toHaveURL(`${site.baseURL}/admin/dashboard`);
    await verifyVariants(page, site, jpegBase, 2);
    await verifyVariants(page, site, pngBase, 0.5);

    const publicPost = await page.request.get(
      `${site.baseURL}/post/mode-b-sharp-${site.key}-valid-${RUN_ID}`
    );
    expect(publicPost.status()).toBe(200);

    const retainedSources = [
      ...containerFiles(site.service, '/app/data/uploads/temp', jpegBase),
      ...containerFiles(site.service, '/app/data/uploads/temp', pngBase)
    ];
    console.log(`[sharp cleanup observation] ${site.key} successful source files retained: ${retainedSources.length}`);
  });

  await test.step('corrupt image MIME reaches Sharp but creates no post or variants', async () => {
    const corruptBase = path.parse(corruptImage.name).name;
    const corruptTitle = `Mode B Sharp ${site.key} Corrupt ${RUN_ID}`;
    await openPostForm(page, site);
    await submitPost(page, corruptTitle, [corruptImage]);

    await expect(page).toHaveURL(`${site.baseURL}/admin/posts/new`);
    expect(containerFiles(site.service, '/app/data/uploads', corruptBase, '.webp')).toEqual([]);

    const publicPost = await page.request.get(
      `${site.baseURL}/post/mode-b-sharp-${site.key}-corrupt-${RUN_ID}`
    );
    expect(publicPost.status()).toBe(404);

    const retainedSources = containerFiles(site.service, '/app/data/uploads/temp', corruptBase);
    console.log(`[sharp cleanup observation] ${site.key} corrupt source files retained: ${retainedSources.length}`);
  });

  await test.step('invalid non-image MIME creates no processed variants', async () => {
    const invalidBase = path.parse(invalidMimeFile.name).name;
    await openPostForm(page, site);
    await submitPost(page, `Mode B Sharp ${site.key} Invalid MIME ${RUN_ID}`, [invalidMimeFile]);

    await expect(page).toHaveURL(`${site.baseURL}/admin/posts/new`);
    expect(containerFiles(site.service, '/app/data/uploads', invalidBase, '.webp')).toEqual([]);
  });

  const health = await page.request.get(`${site.baseURL}/health`);
  expect(health.status()).toBe(200);
}

test.describe.configure({ mode: 'serial' });

for (const site of TEST_SITES) {
  test(`${site.name} authenticated Sharp post processing`, async ({ page }) => {
    await runPostProcessingMatrix(page, site);
  });
}

test('Fruition Forest Garden authenticated Sharp hero processing', async ({ page }) => {
  const site = TEST_SITES[0];
  const heroInput = imageFile(`sharp-ffg-${RUN_ID}-hero.jpg`, 'image/jpeg', landscapeJpeg);
  await loginNormally(page, site);

  await test.step('hero and Open Graph outputs are valid WebP images', async () => {
    await page.goto(`${site.baseURL}/admin/hero-image`);
    await expect(page.locator('input[name="_csrf"]')).toHaveValue(/.+/);
    await page.locator('input[name="heroImage"]').setInputFiles(heroInput);
    await Promise.all([
      page.waitForNavigation(),
      page.locator('form.hero-upload-form').evaluate((form) => form.requestSubmit())
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/hero-image`);

    const metadata = containerMetadata(
      site.service,
      '/app/fruitionforestgarden/src/public/images',
      ['HeroCamp.webp', 'HeroCamp-og.webp']
    );
    expect(metadata).toEqual([
      { filename: 'HeroCamp.webp', format: 'webp', width: 1920, height: 960 },
      { filename: 'HeroCamp-og.webp', format: 'webp', width: 1200, height: 630 }
    ]);

    for (const filename of ['HeroCamp.webp', 'HeroCamp-og.webp']) {
      const response = await page.request.get(`${site.baseURL}/images/${filename}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/webp');
    }
  });

  await test.step('corrupt hero input leaves valid outputs in place', async () => {
    await page.goto(`${site.baseURL}/admin/hero-image`);
    await page.locator('input[name="heroImage"]').setInputFiles(corruptImage);
    await Promise.all([
      page.waitForNavigation(),
      page.locator('form.hero-upload-form').evaluate((form) => form.requestSubmit())
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/hero-image`);

    const metadata = containerMetadata(
      site.service,
      '/app/fruitionforestgarden/src/public/images',
      ['HeroCamp.webp', 'HeroCamp-og.webp']
    );
    expect(metadata.every((output) => output.format === 'webp')).toBe(true);

    const corruptBase = path.parse(corruptImage.name).name;
    const retainedSources = containerFiles(site.service, '/app/data/uploads/temp', corruptBase);
    console.log(`[sharp cleanup observation] ffg corrupt hero source files retained: ${retainedSources.length}`);
  });

  const health = await page.request.get(`${site.baseURL}/health`);
  expect(health.status()).toBe(200);
});
