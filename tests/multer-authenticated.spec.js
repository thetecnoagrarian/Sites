import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const TEST_ADMIN = {
  username: 'mode-b-multer-admin',
  password: 'ModeB-Multer-Synthetic-Only-2026'
};

const DOCKER_BIN = process.env.DOCKER_BIN || '/usr/local/bin/docker';

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

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const imageFile = (name) => ({
  name,
  mimeType: 'image/png',
  buffer: TINY_PNG
});

const oversizedImage = {
  name: 'oversized-synthetic.png',
  mimeType: 'image/png',
  buffer: Buffer.alloc(2048, 1)
};

const invalidFile = {
  name: 'invalid-synthetic.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('synthetic invalid upload')
};

const tempFileCount = (service) => Number(execFileSync(
  DOCKER_BIN,
  [
    'compose',
    '-p', 'sites-local-test',
    '-f', 'docker-compose.test.yml',
    'exec', '-T', service,
    'sh', '-c',
    'find /app/data/uploads/temp -type f 2>/dev/null | wc -l'
  ],
  { encoding: 'utf8' }
).trim());

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

async function submitPostForm(page, { title, files = [], nestedFieldName }) {
  await page.locator('input[name="title"]').fill(title);
  await page.locator('textarea[name="body"]').fill(`${title} synthetic body`);
  await page.locator('input[name="created_at"]').fill('2026-08-18');

  if (files.length > 0) {
    await page.locator('input[name="image"]').setInputFiles(files);
  }

  if (nestedFieldName) {
    await page.locator('form.post-form').evaluate((form, fieldName) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = fieldName;
      input.value = 'synthetic nested field value';
      form.appendChild(input);
    }, nestedFieldName);
  }

  await Promise.all([
    page.waitForNavigation(),
    page.locator('form.post-form').evaluate((form) => form.requestSubmit())
  ]);
}

async function runSharedUploadMatrix(page, site) {
  await loginNormally(page, site);

  await test.step('one valid image', async () => {
    await openPostForm(page, site);
    const before = tempFileCount(site.service);
    const title = `Mode B Multer ${site.key} Single`;
    await submitPostForm(page, { title, files: [imageFile(`${site.key}-single.png`)] });
    await expect(page).toHaveURL(`${site.baseURL}/admin/dashboard`);
    expect(tempFileCount(site.service)).toBe(before + 1);

    const publicPost = await page.request.get(`${site.baseURL}/post/mode-b-multer-${site.key}-single`);
    expect(publicPost.status()).toBe(200);
  });

  await test.step('multiple valid images', async () => {
    await openPostForm(page, site);
    const before = tempFileCount(site.service);
    await submitPostForm(page, {
      title: `Mode B Multer ${site.key} Multiple`,
      files: [imageFile(`${site.key}-multiple-a.png`), imageFile(`${site.key}-multiple-b.png`)]
    });
    await expect(page).toHaveURL(`${site.baseURL}/admin/dashboard`);
    expect(tempFileCount(site.service)).toBe(before + 2);
  });

  await test.step('invalid MIME rejection', async () => {
    await openPostForm(page, site);
    const before = tempFileCount(site.service);
    await submitPostForm(page, {
      title: `Mode B Multer ${site.key} Invalid MIME`,
      files: [invalidFile]
    });
    await expect(page).toHaveURL(`${site.baseURL}/admin/posts/new`);
    expect(tempFileCount(site.service)).toBe(before);
  });

  await test.step('configured size rejection', async () => {
    await openPostForm(page, site);
    const before = tempFileCount(site.service);
    await submitPostForm(page, {
      title: `Mode B Multer ${site.key} Oversized`,
      files: [oversizedImage]
    });
    await expect(page).toHaveURL(`${site.baseURL}/admin/posts/new`);
    expect(tempFileCount(site.service)).toBe(before);
  });

  await test.step('25-file limit', async () => {
    await openPostForm(page, site);
    const before = tempFileCount(site.service);
    const files = Array.from({ length: 26 }, (_, index) => imageFile(`${site.key}-limit-${index}.png`));
    await submitPostForm(page, {
      title: `Mode B Multer ${site.key} File Limit`,
      files
    });
    await expect(page).toHaveURL(`${site.baseURL}/admin/posts/new`);
    expect(tempFileCount(site.service)).toBe(before);
  });

  await test.step('deeply nested multipart field name', async () => {
    await openPostForm(page, site);
    const before = tempFileCount(site.service);
    const nestedFieldName = `modeB${'[nested]'.repeat(200)}`;
    await submitPostForm(page, {
      title: `Mode B Multer ${site.key} Nested Fields`,
      nestedFieldName
    });
    await expect(page).toHaveURL(`${site.baseURL}/admin/dashboard`);
    expect(tempFileCount(site.service)).toBe(before);
  });

  await test.step('malformed multipart request', async () => {
    await openPostForm(page, site);
    const before = tempFileCount(site.service);
    const csrfToken = await page.locator('input[name="_csrf"]').inputValue();
    const boundary = 'mode-b-malformed-boundary';
    const malformedBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="_csrf"',
      '',
      csrfToken,
      `--${boundary}`,
      'Content-Disposition: form-data; name="image"; filename="malformed.png"',
      'Content-Type: image/png',
      '',
      'incomplete synthetic multipart body'
    ].join('\r\n');

    const response = await page.context().request.post(
      `${site.baseURL}/admin/dashboard/posts/create`,
      {
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        data: malformedBody,
        maxRedirects: 0
      }
    );

    expect(response.status()).toBeLessThan(500);
    expect(tempFileCount(site.service)).toBe(before);
  });
}

test.describe.configure({ mode: 'serial' });

for (const site of TEST_SITES) {
  test(`${site.name} authenticated post-upload matrix`, async ({ page }) => {
    await runSharedUploadMatrix(page, site);
  });
}

test('Fruition Forest Garden authenticated hero upload', async ({ page }) => {
  const site = TEST_SITES[0];
  await loginNormally(page, site);

  await test.step('valid hero image', async () => {
    await page.goto(`${site.baseURL}/admin/hero-image`);
    await expect(page.locator('input[name="_csrf"]')).toHaveValue(/.+/);
    const before = tempFileCount(site.service);
    await page.locator('input[name="heroImage"]').setInputFiles(imageFile('ffg-hero-valid.png'));
    await Promise.all([
      page.waitForNavigation(),
      page.locator('form.hero-upload-form').evaluate((form) => form.requestSubmit())
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/hero-image`);
    expect(tempFileCount(site.service)).toBe(before + 1);
  });

  await test.step('invalid hero MIME rejection', async () => {
    await page.goto(`${site.baseURL}/admin/hero-image`);
    const before = tempFileCount(site.service);
    await page.locator('input[name="heroImage"]').setInputFiles(invalidFile);
    await Promise.all([
      page.waitForNavigation(),
      page.locator('form.hero-upload-form').evaluate((form) => form.requestSubmit())
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/hero-image`);
    expect(tempFileCount(site.service)).toBe(before);
  });
});
