import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const DOCKER_BIN = process.env.DOCKER_BIN || '/usr/local/bin/docker';
const ADMIN = { username: 'mode-b-multer-admin',
  password: 'ModeB-Multer-Synthetic-Only-2026' };
const sites = [
  { key: 'ffg', service: 'fruitionforestgarden', baseURL: 'http://localhost:4000' },
  { key: 'tta', service: 'thetecnoagrarian', baseURL: 'http://localhost:4002' }
];

function query(site, sql) {
  const result = execFileSync(DOCKER_BIN, [
    'compose', '-p', 'sites-local-test', '-f', 'docker-compose.test.yml',
    'exec', '-T', site.service, 'sqlite3', '-json', '/app/data/blog.db', sql
  ], { encoding: 'utf8' }).trim();
  return result ? JSON.parse(result) : [];
}

async function login(page, site) {
  await page.goto(`${site.baseURL}/login`);
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Password').fill(ADMIN.password);
  await Promise.all([
    page.waitForURL(/\/admin(?:\/dashboard)?\/?$/),
    page.getByRole('button', { name: 'Login' }).click()
  ]);
}

async function submitSyntheticPost(page, site, title, authorLabels) {
  await page.goto(`${site.baseURL}/admin/posts/new`);
  await page.locator('input[name="title"]').fill(title);
  await page.locator('textarea[name="body"]').fill('Duplicate replacement body');
  await page.locator('input[name="created_at"]').fill('2020-01-02');
  for (let index = 0; index < authorLabels.length; index++) {
    await page.locator('select[name="authorIds[]"]').nth(index)
      .selectOption({ label: authorLabels[index] });
  }
  await page.locator('select[name="publisherId"]')
    .selectOption({ label: 'Mode B Author One' });
  await Promise.all([
    page.waitForNavigation(),
    page.locator('form.post-form').evaluate(form => form.requestSubmit())
  ]);
}

test.describe.configure({ mode: 'serial' });

for (const site of sites) {
  test(`${site.key} Public Person admin and editorial post flow`, async ({ page }) => {
    const run = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const key = `browser-person-${site.key}-${run}`;
    const title = `Browser Editorial ${site.key} ${run}`;
    const slug = title.toLowerCase().replaceAll(' ', '-');

    const anonymous = await page.request.get(`${site.baseURL}/admin/public-people`,
      { maxRedirects: 0 });
    expect(anonymous.status()).toBe(302);
    expect(anonymous.headers().location).toBe('/login');
    await login(page, site);

    await page.goto(`${site.baseURL}/admin/public-people`);
    await expect(page.getByRole('heading', { name: 'Public People', exact: true })).toBeVisible();
    const forgedPerson = await page.context().request.post(`${site.baseURL}/admin/public-people`, {
      form: { _csrf: 'forged', publicKey: `forged-${key}`, displayName: 'Forged' },
      maxRedirects: 0
    });
    expect(forgedPerson.status()).toBe(403);
    expect(query(site, `SELECT id FROM public_people WHERE public_key = 'forged-${key}'`))
      .toEqual([]);
    await page.locator('form[action="/admin/public-people"] input[name="publicKey"]').fill(key);
    await page.locator('form[action="/admin/public-people"] input[name="displayName"]').fill('Browser Person');
    await Promise.all([
      page.waitForNavigation(),
      page.locator('form[action="/admin/public-people"] button[type="submit"]').click()
    ]);
    const person = query(site, `SELECT id, is_active FROM public_people WHERE public_key = '${key}'`)[0];
    expect(person.is_active).toBe(1);
    await page.locator(`form[action="/admin/public-people/${person.id}/profile"] input[name="displayName"]`)
      .fill('Browser Person Edited');
    await Promise.all([
      page.waitForNavigation(),
      page.locator(`form[action="/admin/public-people/${person.id}/profile"] button`).click()
    ]);
    expect(query(site, `SELECT display_name FROM public_people WHERE id = ${person.id}`)[0].display_name)
      .toBe('Browser Person Edited');
    await Promise.all([
      page.waitForNavigation(),
      page.locator(`form[action="/admin/public-people/${person.id}/archive"] button`).click()
    ]);
    expect(query(site, `SELECT is_active FROM public_people WHERE id = ${person.id}`)[0].is_active)
      .toBe(0);
    await page.goto(`${site.baseURL}/admin/posts/new`);
    await expect(page.locator('select[name="authorIds[]"]').first()
      .locator(`option[value="${person.id}"]`)).toHaveCount(0);
    await page.goto(`${site.baseURL}/admin/public-people`);
    await Promise.all([
      page.waitForNavigation(),
      page.locator(`form[action="/admin/public-people/${person.id}/unarchive"] button`).click()
    ]);

    await page.goto(`${site.baseURL}/admin/posts/new`);
    await page.locator('input[name="title"]').fill(`Missing Author ${run}`);
    await page.locator('textarea[name="body"]').fill('Should not be published');
    await page.locator('input[name="created_at"]').fill('2020-01-02');
    await page.locator('select[name="publisherId"]')
      .selectOption({ label: 'Mode B Author Two' });
    await Promise.all([
      page.waitForNavigation(),
      page.locator('form.post-form').evaluate(form => form.requestSubmit())
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/posts/new`);
    expect(query(site, `SELECT id FROM posts WHERE title = 'Missing Author ${run}'`)).toEqual([]);
    await page.goto(`${site.baseURL}/admin/posts/new`);
    await page.locator('input[name="title"]').fill(title);
    await page.locator('textarea[name="body"]').fill('Browser synthetic body');
    await page.locator('input[name="created_at"]').fill('2020-01-02');
    await page.locator('select[name="authorIds[]"]').nth(0)
      .selectOption({ label: 'Mode B Author One' });
    await page.locator('select[name="authorIds[]"]').nth(1)
      .selectOption({ label: 'Browser Person Edited' });
    await page.locator('select[name="publisherId"]')
      .selectOption({ label: 'Mode B Author Two' });
    await Promise.all([
      page.waitForNavigation(),
      page.locator('form.post-form').evaluate(form => form.requestSubmit())
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/dashboard`);
    const created = query(site, `SELECT id, created_at, published_at,
      publication_review_state, publisher_public_person_id, author_id, modified_at
      FROM posts WHERE slug = '${slug}'`)[0];
    expect(created.created_at).toBe('2020-01-02');
    expect(created.published_at).toMatch(/Z$/);
    expect(created.publication_review_state).toBe('verified');
    expect(created.publisher_public_person_id).toBeGreaterThan(0);
    expect(created.author_id).toBeGreaterThan(0);
    expect(created.modified_at).toBeNull();
    expect(query(site, `SELECT position FROM post_public_authors WHERE post_id = ${created.id}
      ORDER BY position`).map(row => row.position)).toEqual([1, 2]);

    await page.goto(`${site.baseURL}/admin/posts/${created.id}/edit`);
    await expect(page.getByText('Current state:')).toHaveCount(2);
    await page.locator('textarea[name="body"]').fill('Browser synthetic body revised');
    await Promise.all([
      page.waitForNavigation(),
      page.locator('form.post-form').evaluate(form => form.requestSubmit())
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/dashboard`);
    const edited = query(site, `SELECT body, published_at, modified_at FROM posts
      WHERE id = ${created.id}`)[0];
    expect(edited.body).toBe('Browser synthetic body revised');
    expect(edited.published_at).toBe(created.published_at);
    expect(edited.modified_at).toMatch(/Z$/);

    await page.goto(`${site.baseURL}/admin/posts/new`);
    const response = await page.context().request.post(
      `${site.baseURL}/admin/dashboard/posts/create`, {
        multipart: { _csrf: 'forged', title: `CSRF Probe ${run}`, body: 'Probe',
          created_at: '2020-01-02' }, maxRedirects: 0
      });
    expect(response.status()).toBe(403);
    expect(query(site, `SELECT id FROM posts WHERE title = 'CSRF Probe ${run}'`)).toEqual([]);
    expect(query(site, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(query(site, 'PRAGMA integrity_check')[0].integrity_check).toBe('ok');

    const editorName = `synthetic-editor-${site.key}-${run}`;
    query(site, `INSERT INTO users (username, password_hash, role, isAdmin)
      SELECT '${editorName}', password_hash, 'editor', 0 FROM users
      WHERE username = 'mode-b-multer-admin'`);
    const editorContext = await page.context().browser().newContext();
    const editorPage = await editorContext.newPage();
    await editorPage.goto(`${site.baseURL}/login`);
    await editorPage.getByLabel('Username').fill(editorName);
    await editorPage.getByLabel('Password').fill(ADMIN.password);
    await editorPage.getByRole('button', { name: 'Login' }).click();
    await editorPage.goto(`${site.baseURL}/admin/public-people`);
    await expect(editorPage).toHaveURL(`${site.baseURL}/`);
    await editorContext.close();
  });
}

test('FFG overwrite preserves historical publication and requires reviewed-authorship reopening',
  async ({ page }) => {
    const site = sites[0];
    await login(page, site);
    const before = query(site, `SELECT id, body, published_on, published_at,
      authorship_review_state FROM posts WHERE slug = 'local-test-post'`)[0];
    expect(before.authorship_review_state).toBe('owner_attested');
    await submitSyntheticPost(page, site, 'Local Test Post', ['Mode B Author Two']);
    await expect(page).toHaveURL(`${site.baseURL}/admin/posts/confirm-overwrite`);
    await expect(page.getByText('First publication:')).toBeVisible();
    await Promise.all([
      page.waitForNavigation(),
      page.locator('button[name="action"][value="overwrite"]').click()
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/posts/confirm-overwrite`);
    expect(query(site, `SELECT body FROM posts WHERE id = ${before.id}`)[0].body).toBe(before.body);
    await page.locator('input[name="reopenAuthorship"]').check();
    await Promise.all([
      page.waitForNavigation(),
      page.locator('button[name="action"][value="overwrite"]').click()
    ]);
    await expect(page).toHaveURL(`${site.baseURL}/admin/dashboard`);
    const after = query(site, `SELECT body, published_on, published_at,
      authorship_review_state, modified_at FROM posts WHERE id = ${before.id}`)[0];
    expect(after.body).toBe('Duplicate replacement body');
    expect(after.published_on).toBe(before.published_on);
    expect(after.published_at).toBe(before.published_at);
    expect(after.authorship_review_state).toBe('unreviewed');
    expect(after.modified_at).toMatch(/Z$/);
    expect(query(site, `SELECT position FROM post_public_authors WHERE post_id = ${before.id}`)
      .map(row => row.position)).toEqual([1]);
  });
