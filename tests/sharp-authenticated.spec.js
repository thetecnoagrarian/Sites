import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const TEST_ADMIN = {
  username: 'mode-b-multer-admin',
  password: 'ModeB-Multer-Synthetic-Only-2026'
};

const DOCKER_BIN = process.env.DOCKER_BIN || '/usr/local/bin/docker';
const MODE_B_PROJECT = process.env.MODE_B_PROJECT || 'sites-local-test';
const COMPOSE_ARGS = ['compose', '-p', MODE_B_PROJECT, '-f', 'docker-compose.test.yml'];
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

const uploadState = service => containerJson(
  service,
  `
    import { readdir } from 'node:fs/promises';
    async function files(directory) {
      try {
        return (await readdir(directory, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile());
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    }
    console.log(JSON.stringify({
      derivatives: (await files('/app/data/uploads/.media/post')).filter(entry => entry.name.endsWith('.webp')).length,
      raw: (await files('/app/data/uploads/temp')).length
    }));
  `
);

const publishedImages = (service, title) => containerJson(service, `
    import Database from 'better-sqlite3';
    const db = new Database(process.env.DATABASE_PATH, { readonly: true });
    console.log(db.prepare('SELECT images FROM posts WHERE title = ?').get(${JSON.stringify(title)}).images);
    db.close();
`);

const currentHero = service => containerJson(service, `
    import { readFile } from 'node:fs/promises';
    const manifest = JSON.parse(await readFile('/app/data/uploads/hero/.current.json', 'utf8'));
    console.log(JSON.stringify(manifest.current));
`);

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

async function submitPost(page, title, files, { expectUploadRejection = false } = {}) {
  await page.locator('input[name="title"]').fill(title);
  await page.locator('textarea[name="body"]').fill(`${title} synthetic body`);
  await page.locator('input[name="created_at"]').fill('2026-08-18');
  await page.locator('select[name="authorIds[]"]').first().selectOption({ label: 'Mode B Author One' });
  await page.locator('select[name="publisherId"]').selectOption({ label: 'Mode B Author One' });
  await page.locator('input[name="image"]').setInputFiles(files);

  if (expectUploadRejection) {
    const [response] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/admin/dashboard/posts/create'),
      page.waitForNavigation(),
      // Follow the Multer redirect as a form navigation on the HTTP test stack.
      page.locator('form.post-form').evaluate(form => {
        if (!form.reportValidity()) throw new Error('Synthetic form is invalid');
        form.submit();
      })
    ]);
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('/admin/posts/new');
    return;
  }
  await Promise.all([
    page.waitForNavigation(),
    page.locator('form.post-form').evaluate((form) => form.requestSubmit())
  ]);
}

async function verifyVariants(request, site, image, expectedRatio) {
  const id = /^\/uploads\/m1-([0-9a-f-]{36})-medium\.webp$/.exec(image.medium)?.[1];
  expect(id).toBeTruthy();
  const variants = Object.keys(VARIANT_LIMITS);
  const files = variants.map(variant => {
    expect(image[variant]).toBe(`/uploads/m1-${id}-${variant}.webp`);
    return path.basename(image[variant]);
  });

  const metadata = containerMetadata(site.service, `/app/data/uploads/.media/post/${id}`, files);
  for (const [index, output] of metadata.entries()) {
    const variant = variants[index];
    expect(output.format).toBe('webp');
    expect(output.width).toBeLessThanOrEqual(VARIANT_LIMITS[variant].width);
    expect(output.height).toBeLessThanOrEqual(VARIANT_LIMITS[variant].height);
    expect(Math.abs((output.width / output.height) - expectedRatio)).toBeLessThan(0.01);

    const response = await request.get(site.baseURL + image[variant]);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');
  }
}

async function runPostProcessingMatrix(page, request, site) {
  await loginNormally(page, site);

  const jpegBase = `sharp-${site.key}-${RUN_ID}-landscape`;
  const pngBase = `sharp-${site.key}-${RUN_ID}-portrait`;
  const validTitle = `Mode B Sharp ${site.key} Valid ${RUN_ID}`;

  await test.step('JPEG and PNG produce three bounded WebP variants each', async () => {
    const before = uploadState(site.service);
    await openPostForm(page, site);
    await submitPost(page, validTitle, [
      imageFile(`${jpegBase}.jpg`, 'image/jpeg', landscapeJpeg),
      imageFile(`${pngBase}.png`, 'image/png', portraitPng)
    ]);

    await expect(page).toHaveURL(`${site.baseURL}/admin/dashboard`);
    const images = publishedImages(site.service, validTitle);
    expect(images).toHaveLength(2);
    await verifyVariants(request, site, images[0], 2);
    await verifyVariants(request, site, images[1], 0.5);

    const publicPost = await request.get(
      `${site.baseURL}/post/mode-b-sharp-${site.key}-valid-${RUN_ID}`
    );
    expect(publicPost.status()).toBe(200);

    await expect.poll(() => uploadState(site.service)).toEqual({ ...before, derivatives: before.derivatives + 6 });
  });

  await test.step('corrupt image MIME reaches Sharp but creates no post or variants', async () => {
    const before = uploadState(site.service);
    const corruptTitle = `Mode B Sharp ${site.key} Corrupt ${RUN_ID}`;
    await openPostForm(page, site);
    await submitPost(page, corruptTitle, [corruptImage]);

    await expect.poll(() => new URL(page.url()).pathname).toBe('/admin/posts/new');
    await expect.poll(() => uploadState(site.service)).toEqual(before);

    const publicPost = await request.get(
      `${site.baseURL}/post/mode-b-sharp-${site.key}-corrupt-${RUN_ID}`
    );
    expect(publicPost.status()).toBe(404);
  });

  await test.step('invalid non-image MIME creates no processed variants', async () => {
    const before = uploadState(site.service);
    await openPostForm(page, site);
    await submitPost(page, `Mode B Sharp ${site.key} Invalid MIME ${RUN_ID}`, [invalidMimeFile], { expectUploadRejection: true });

    await expect(page).toHaveURL(`${site.baseURL}/admin/posts/new`);
    await expect.poll(() => uploadState(site.service)).toEqual(before);
  });

  const health = await request.get(`${site.baseURL}/health`);
  expect(health.status()).toBe(200);
}

test.describe.configure({ mode: 'serial' });

for (const site of TEST_SITES) {
  test(`${site.name} authenticated Sharp post processing`, async ({ page, request }) => {
    await runPostProcessingMatrix(page, request, site);
  });
}

test('Fruition Forest Garden authenticated Sharp hero processing', async ({ page, request }) => {
  const site = TEST_SITES[0];
  const heroInput = imageFile(`sharp-ffg-${RUN_ID}-hero.jpg`, 'image/jpeg', landscapeJpeg);
  await loginNormally(page, site);
  let acceptedHero;

  await test.step('hero and Open Graph outputs are valid WebP images', async () => {
    await page.goto(`${site.baseURL}/admin/hero-image`);
    await expect(page.locator('form.hero-upload-form input[name="_csrf"]')).toHaveValue(/.+/);
    await page.locator('input[name="heroImage"]').setInputFiles(heroInput);
    await Promise.all([
      page.waitForNavigation(),
      page.locator('form.hero-upload-form').evaluate((form) => form.requestSubmit())
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/hero-image`);

    acceptedHero = currentHero(site.service);
    expect(acceptedHero.kind).toBe('managed');
    const { generation } = acceptedHero;
    const generationDir = `/app/data/uploads/.media/hero/${generation}`;
    const metadata = containerMetadata(site.service, generationDir, ['current-hero.webp', 'current-hero-og.webp']);
    expect(metadata).toEqual([
      { filename: 'current-hero.webp', format: 'webp', width: 1920, height: 960 },
      { filename: 'current-hero-og.webp', format: 'webp', width: 1200, height: 630 }
    ]);

    for (const filename of ['current-hero.webp', 'current-hero-og.webp']) {
      const response = await request.get(`${site.baseURL}/uploads/hero/m1-${generation}/${filename}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/webp');
    }
    const source = await request.get(
      `${site.baseURL}/uploads/hero/m1-${generation}/.source/current-source.jpg`
    );
    expect(source.status()).toBe(404);
  });

  await test.step('corrupt hero input leaves valid outputs in place', async () => {
    const before = uploadState(site.service);
    await page.goto(`${site.baseURL}/admin/hero-image`);
    await page.locator('input[name="heroImage"]').setInputFiles(corruptImage);
    await Promise.all([
      page.waitForNavigation(),
      page.locator('form.hero-upload-form').evaluate((form) => form.requestSubmit())
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/hero-image`);

    expect(currentHero(site.service)).toEqual(acceptedHero);
    const metadata = containerMetadata(
      site.service,
      `/app/data/uploads/.media/hero/${acceptedHero.generation}`,
      ['current-hero.webp', 'current-hero-og.webp']
    );
    expect(metadata.every((output) => output.format === 'webp')).toBe(true);

    await expect.poll(() => uploadState(site.service)).toEqual(before);
  });

  const health = await request.get(`${site.baseURL}/health`);
  expect(health.status()).toBe(200);
});
