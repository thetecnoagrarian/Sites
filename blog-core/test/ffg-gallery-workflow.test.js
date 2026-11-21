import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createBlogApp } from '../src/app.js';
import { getDatabase, setDatabase } from '../src/models/db.js';
import User from '../src/models/user.js';
import Post from '../src/models/post.js';
import PublicPerson from '../src/models/public-person.js';
import { preparePostCandidate } from '../src/utils/private-media.js';
import logger from '../src/utils/logger.js';
import { galleryPlacement, GALLERY_MARKER } from '../../fruitionforestgarden/src/utils/bodyGalleryView.js';
import home from '../../fruitionforestgarden/src/routes/home.js';
import auth from '../../fruitionforestgarden/src/routes/auth.js';

test('FFG placement accepts one standalone marker and preserves surrounding source', () => {
    const before = '<p>A &amp; B.</p>\n<img src="/images/old.webp">\n';
    const after = '\n<p>After {{ordinary text}}.</p>';
    assert.deepEqual(galleryPlacement(before + GALLERY_MARKER + after, [{}], { required: true }),
        { before, after, items: [{}] });
    for (const body of ['<p>no marker</p>', GALLERY_MARKER + '\n' + GALLERY_MARKER,
        `<div>\n${GALLERY_MARKER}\n</div>`, `<!--\n${GALLERY_MARKER}\n-->`,
        `<textarea>\n${GALLERY_MARKER}\n</textarea>`, `<script>\n${GALLERY_MARKER}\n</script>`,
        `<!--\n${GALLERY_MARKER}\n-->\n<DIV data-body-gallery=""></DIV>`]) {
        assert.throws(() => galleryPlacement(body, [{}], { required: true }), /gallery marker/);
        assert.equal(galleryPlacement(body, [{}]), null);
    }
    assert.equal(galleryPlacement('<p>no gallery</p>', [], { required: true }), null);
    assert.throws(() => galleryPlacement(GALLERY_MARKER, [], { required: true }), /gallery marker/);
});

async function fixture(t, { multipartFileLimit, editorRequestLimit } = {}) {
    const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'ffg-doc-gallery-')));
    const site = path.resolve('fruitionforestgarden/src');
    const publicPath = path.join(root, 'public'), uploadsPath = path.join(root, 'volume', 'uploads');
    await fs.mkdir(publicPath);
    for (const folder of ['css', 'js', 'images']) await fs.cp(path.join(site, 'public', folder), path.join(publicPath, folder), { recursive: true });
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'synthetic-doc-gallery-test-session';
    delete process.env.TRUSTED_IPS;
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    if (editorRequestLimit) process.env.RATE_LIMIT_MAX_REQUESTS = String(editorRequestLimit);
    for (const level of ['info', 'warn', 'error']) t.mock.method(logger, level, () => {});
    t.mock.method(console, 'log', () => {});
    const timers = [], interval = globalThis.setInterval;
    let app, db, server, browser;
    async function start(port = 0) {
        const adminModule = new URL('../../fruitionforestgarden/src/routes/admin.js', import.meta.url);
        adminModule.searchParams.set('fixture', randomUUID());
        const { default: admin } = await import(adminModule);
        const oldFileLimit = process.env.MAX_FILE_SIZE;
        if (multipartFileLimit) process.env.MAX_FILE_SIZE = String(multipartFileLimit);
        globalThis.setInterval = (...args) => { const timer = interval(...args); timer.unref(); timers.push(timer); return timer; };
        let application;
        try {
            application = createBlogApp({
                siteName: 'Fruition Forest Garden', databasePath: path.join(root, 'synthetic.db'),
                publicPath, uploadsPath, viewsPath: path.join(site, 'views'), galleryAdminTraffic: true,
                baseUrl: 'https://example.invalid'
            });
        } finally {
            globalThis.setInterval = interval;
            if (oldFileLimit === undefined) delete process.env.MAX_FILE_SIZE;
            else process.env.MAX_FILE_SIZE = oldFileLimit;
        }
        app = application.app;
        db = getDatabase();
        app.use('/', home); app.use('/', auth); app.use('/admin', admin);
        application.setupFinalHandlers();
        server = app.listen(port, '127.0.0.1');
        await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    }
    async function stop() {
        if (server?.listening) await new Promise(resolve => server.close(resolve));
        timers.splice(0).forEach(clearInterval);
        if (db?.open) db.close();
        setDatabase(null);
    }
    t.after(async () => {
        await browser?.close();
        await stop();
        await fs.rm(root, { recursive: true, force: true });
    });
    await start();
    User.create('synthetic-editor', 'synthetic-test-pass', 'admin');
    User.create('synthetic-other-editor', 'synthetic-test-pass', 'admin');
    const person = PublicPerson.create({ publicKey: 'synthetic-writer', displayName: 'Synthetic Writer' });
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    browser = await chromium.launch();
    async function session(user = 'synthetic-editor', clientIp = '192.0.2.10') {
        const context = await browser.newContext({ extraHTTPHeaders: {
            'x-forwarded-proto': 'https', 'x-forwarded-for': clientIp
        } });
        await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        const page = await context.newPage();
        if (user) {
            assert.equal((await page.goto(base + '/login')).status(), 200);
            await page.locator('input[name="username"]').fill(user);
            await page.locator('input[name="password"]').fill('synthetic-test-pass');
            await Promise.all([
                page.waitForURL('**/admin/dashboard'),
                page.locator('form[action="/login"]').evaluate(form => form.requestSubmit())
            ]);
        }
        const cookie = (await context.cookies()).map(({ name, value }) => `${name}=${value}`).join('; ');
        const get = (route, opts = {}) => context.request.get(base + route, {
            ...opts, headers: { cookie, ...opts.headers }
        });
        return { context, page, get, cookie };
    }
    return { session, base, person, uploadsPath, get db() { return db; }, get app() { return app; },
        async restart() { await stop(); await start(port); } };
}

const list = page => page.locator('[data-gallery-items] > li');
const waitForPhotos = (page, count) => page.waitForFunction(expected =>
    document.querySelector('[data-gallery-items]')?.children.length === expected, count);
const selectPhotos = async (page, photos, count) => {
    await page.locator('[data-gallery-files]').setInputFiles(photos);
    await page.waitForFunction(() => !document.querySelector('[data-gallery-files]').disabled);
    const failed = await page.locator('[data-gallery-uploads] li:has(button:not([hidden]))').allTextContents();
    assert.equal(await list(page).count(), count, failed.slice(0, 4).join('\n'));
};
const save = async page => {
    const [saved] = await Promise.all([
        page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/dashboard/posts/')),
        page.getByRole('button', { name: 'Save draft' }).click()
    ]);
    assert.equal(saved.status(), 200);
    await page.waitForFunction(() => document.querySelector('[data-gallery-status]').textContent === 'Private draft saved.');
    return saved.json();
};
const describePhotos = async (page, start, stop) => {
    for (let i = start; i < stop; i++) await list(page).nth(i).locator('[data-gallery-alt]').fill(`Documentary photo ${i + 1}`);
};

const postResponse = page => page.waitForResponse(response =>
    response.request().method() === 'POST' && response.url().includes('/dashboard/posts/'));
const editorRevision = page => page.locator('[name="galleryDraftRevision"]').inputValue();
const photo = async () => ({ name: 'synthetic.png', mimeType: 'image/png',
    buffer: await sharp({ create: { width: 75, height: 100, channels: 3, background: '#55773a' } }).png().toBuffer() });
const prose = text => '<p>' + text + '</p>\n' + GALLERY_MARKER;
const defer = () => Promise.withResolvers();
const draftRow = (db, id) => db.prepare('SELECT * FROM gallery_drafts WHERE id = ?').get(id);
const receiptRow = (db, id) => db.prepare('SELECT state, data FROM media_publications WHERE id = ?').get(id);
const grantCount = db => db.prepare("SELECT count(*) n FROM media_publications WHERE record_type = 'asset'").get().n;

async function compose(page, f, title, body) {
    assert.equal((await page.goto(f.base + '/admin/posts/new')).status(), 200);
    await page.locator('#title').fill(title);
    await page.locator('#created_at').fill('2026-10-02');
    await page.locator('#public-author-1').selectOption(String(f.person.id));
    await page.locator('#publisherId').selectOption(String(f.person.id));
    await page.locator('#body').fill(body);
    const id = await page.locator('[name="galleryDraftId"]').inputValue();
    return { id, edit: `/admin/posts/new?draft=${id}`,
        op: await page.locator('[name="mediaOperationId"]').inputValue() };
}

async function editorPost(page, intent, overrides = {}) {
    return page.evaluate(async ({ intent, overrides }) => {
        const form = document.querySelector('.post-form');
        const data = new FormData(form);
        if (intent === 'draft') {
            data.delete('image');
            data.set('submitIntent', intent);
        }
        for (const [key, value] of Object.entries(overrides)) data.set(key, value);
        const response = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: data });
        return { status: response.status, result: await response.json() };
    }, { intent, overrides });
}

test('FFG authenticated browser workflow supports 65 and 100 private gallery photos and retains published URLs', { timeout: 180000 }, async t => {
    const f = await fixture(t), { page, get, cookie } = await f.session();
    const title = 'Synthetic Documentary Article';
    const prose = '<p>Before the photographs.</p>\n' + GALLERY_MARKER + '\n<p>After the photographs.</p>';
    const photos = await Promise.all(Array.from({ length: 100 }, async (_, index) => {
        const image = sharp({ create: { width: index % 2 ? 720 : 480, height: index % 2 ? 480 : 720,
            channels: 3, background: { r: index * 2, g: 120, b: 50 } } });
        return index === 1
            ? { name: 'photo-2.jpg', mimeType: 'image/jpeg', buffer: await image.jpeg().withMetadata({ orientation: 6 }).toBuffer() }
            : { name: `photo-${index + 1}.png`, mimeType: 'image/png', buffer: await image.png().toBuffer() };
    }));
    assert.equal((await page.goto(f.base + '/admin/posts/new')).status(), 200);
    await page.locator('#title').fill(title);
    await page.locator('#created_at').fill('2026-10-02');
    await page.locator('#body').fill('<p>Before the photographs.</p>');
    await page.locator('#public-author-1').selectOption(String(f.person.id));
    await page.locator('#publisherId').selectOption(String(f.person.id));
    const empty = await save(page);
    assert.equal(f.db.prepare('SELECT count(*) n FROM posts').get().n, 0);
    const noGallery = await get(empty.previewUrl);
    assert.equal(noGallery.status(), 200); assert.doesNotMatch(await noGallery.text(), /class="documentary-gallery"/);
    const noCsrf = await page.evaluate(() => {
        const draft = document.getElementById('gallery-editor').dataset.draft;
        return fetch(`/admin/gallery-drafts/${draft}/images`, { method: 'POST', body: new FormData() }).then(res => res.status);
    });
    assert.equal(noCsrf, 403);

    // Drop the browser response after the real route persists its receipt.
    await page.route('**/gallery-drafts/*/images', async route => {
        const response = await route.fetch({ maxRedirects: 0, headers: { ...await route.request().allHeaders(), cookie } });
        assert.equal(response.status(), 200, await response.text());
        await route.abort();
    }, { times: 1 });
    await page.locator('[data-gallery-files]').setInputFiles(photos[0]);
    const [retry] = await Promise.all([
        page.waitForResponse(response => response.url().endsWith('/images') && response.request().method() === 'POST'),
        page.getByRole('button', { name: 'Retry photo-1.png' }).click()
    ]);
    const retryBody = await retry.json();
    assert.equal(retry.status(), 200, retryBody.error);
    assert.ok(retryBody.id);
    await page.waitForFunction(() => document.querySelector('[data-gallery-items]').children.length === 1);
    assert.equal(f.db.prepare('SELECT count(*) n FROM gallery_drafts, json_each(staged)').get().n, 1);
    await describePhotos(page, 0, 1);
    await page.locator('#body').fill(prose);
    const one = await save(page);
    assert.match(await (await get(one.previewUrl)).text(), /alt="Documentary photo 1"/);

    await selectPhotos(page, photos.slice(1, 65), 65);
    const ids = await list(page).evaluateAll(nodes => nodes.map(node => node.dataset.id));
    await describePhotos(page, 1, 65);
    await list(page).nth(1).locator('[data-gallery-caption]').fill('First caption & context');
    await list(page).nth(1).getByRole('button', { name: /Move up/ }).click();
    const position = list(page).first().locator('[data-gallery-position]');
    await position.fill('65');
    await position.press('Tab');
    assert.equal(await list(page).last().getAttribute('data-id'), ids[1]);
    await list(page).last().locator('[data-gallery-position]').fill('1');
    await list(page).last().locator('[data-gallery-position]').press('Tab');
    await page.locator('#body').fill(prose);
    const saved = await save(page);
    await page.goto(f.base + '/admin/gallery-drafts');
    await page.getByRole('link', { name: title }).click();
    await waitForPhotos(page, 65);
    assert.equal(await list(page).first().getAttribute('data-id'), ids[1]);
    assert.equal(await list(page).first().locator('[data-gallery-caption]').inputValue(), 'First caption & context');
    const privateImage = await list(page).first().locator('img').getAttribute('src');
    const ownedPreview = await get(privateImage);
    assert.equal(ownedPreview.status(), 200);
    assert.equal(ownedPreview.headers()['cache-control'], 'private, no-store');
    assert.match(ownedPreview.headers()['content-type'], /^image\/webp/);
    const publicMedium = id => `/uploads/m1-${id}-medium.webp`;
    assert.equal((await get(publicMedium(ids[1]))).status(), 404);
    const other = await f.session('synthetic-other-editor', '192.0.2.11');
    assert.equal((await other.get(privateImage)).status(), 404);
    assert.equal((await other.get(saved.previewUrl)).status(), 404);
    const guest = await f.session(null, '192.0.2.12');
    assert.equal((await guest.get(privateImage, { maxRedirects: 0 })).status(), 302);

    await Promise.all([page.waitForURL('**/preview'), page.getByRole('button', { name: 'Preview article' }).click()]);
    assert.equal(await page.locator('.documentary-gallery figure').count(), 65);
    assert.equal(await page.locator('.documentary-gallery figcaption').first().textContent(), 'First caption & context');
    assert.equal(await page.locator('.documentary-gallery img').first().getAttribute('alt'), 'Documentary photo 2');
    assert.match(await page.locator('.documentary-gallery img').first().getAttribute('src'), /\/admin\/gallery-drafts\//);
    await page.getByRole('link', { name: 'Return to editor' }).click();

    f.db.exec(`CREATE TEMP TRIGGER synthetic_rollback_gallery BEFORE INSERT ON media_publications
        WHEN NEW.record_type = 'asset' BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END`);
    await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: 'Publish post' }).click()]);
    assert.equal(f.db.prepare('SELECT count(*) n FROM posts').get().n, 0);
    assert.equal((await get(publicMedium(ids[1]))).status(), 404);
    await waitForPhotos(page, 65);
    f.db.exec('DROP TRIGGER synthetic_rollback_gallery');
    await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: 'Resume editing draft' }).click()]);
    await waitForPhotos(page, 65);

    await page.locator('#image-input').setInputFiles([photos[0], photos[1]]);
    await Promise.all([page.waitForURL('**/admin/dashboard'), page.getByRole('button', { name: 'Publish post' }).click()]);
    let post = Post.findAll(1, 0)[0];
    assert.equal(post.body_gallery.items.length, 65);
    assert.equal(post.images.length, 2);
    assert.deepEqual(post.body_gallery.items.slice(0, 2).map(item => item.id), [ids[1], ids[0]]);
    assert.equal(post.body_gallery.items[0].caption, 'First caption & context');
    const docPath = `/post/${post.slug}`;
    const loaded = new Set();
    guest.page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (ids.some(id => pathname.startsWith(`/uploads/m1-${id}-`))) loaded.add(pathname);
    });
    assert.equal((await guest.page.goto(f.base + docPath)).status(), 200);
    assert.equal(await guest.page.locator('.documentary-gallery figure').count(), 65);
    assert.equal(await guest.page.locator('.post-carousel sl-carousel-item').count(), 2);
    assert.equal(post.body_gallery.items[0].asset.originalWidth, 480);
    assert.equal(post.body_gallery.items[0].asset.originalHeight, 720);
    assert.equal(await guest.page.locator('.post-content > p').first().textContent(), 'Before the photographs.');
    assert.equal(await guest.page.locator('.post-content > p').last().textContent(), 'After the photographs.');
    assert.ok(loaded.size > 0 && loaded.size < 65);
    assert.ok([...loaded].every(name => name.endsWith('-medium.webp')));
    await guest.page.setViewportSize({ width: 390, height: 780 });
    assert.ok(await guest.page.locator('.documentary-gallery').evaluate(node =>
        node.getBoundingClientRect().right <= window.innerWidth && node.scrollWidth <= node.clientWidth + 1));
    await guest.page.waitForFunction(() => document.querySelector('.documentary-gallery img').naturalWidth > 0);
    assert.ok(await guest.page.locator('.documentary-gallery img').first().evaluate(img =>
        Math.abs(img.width / img.height - img.naturalWidth / img.naturalHeight) < 0.02));
    const link = guest.page.getByRole('link', { name: 'Documentary photo 2', exact: true });
    await link.focus();
    await Promise.all([guest.page.waitForURL(`**/m1-${ids[1]}-large.webp`), link.press('Enter')]);

    // Use a fresh authenticated client for the boundary/edit pass to keep the
    // ordinary dynamic-route allowance independent of the tested gallery bucket.
    const edit = await f.session('synthetic-editor', '192.0.2.13');
    const editPath = `/admin/posts/${post.id}/edit`;
    assert.equal((await edit.page.goto(f.base + editPath)).status(), 200);
    await selectPhotos(edit.page, photos.slice(65), 100);
    await describePhotos(edit.page, 65, 100);
    const tooMany = await edit.page.evaluate(async () => {
        const form = document.querySelector('.post-form'), data = new FormData(form);
        const items = JSON.parse(data.get('bodyGalleryItems'));
        data.set('bodyGalleryItems', JSON.stringify([...items, items[0]]));
        data.set('submitIntent', 'draft');
        return (await fetch(form.action, { method: 'POST', body: data })).status;
    });
    assert.equal(tooMany, 400);
    const unowned = await edit.page.evaluate(async () => {
        const form = document.querySelector('.post-form'), data = new FormData(form);
        const [first, ...items] = JSON.parse(data.get('bodyGalleryItems'));
        data.set('bodyGalleryItems', JSON.stringify([{ ...first, id: crypto.randomUUID() }, ...items]));
        data.set('submitIntent', 'draft');
        return (await fetch(form.action, { method: 'POST', body: data })).status;
    });
    assert.equal(unowned, 403);
    await save(edit.page);
    await Promise.all([edit.page.waitForURL('**/admin/dashboard'), edit.page.getByRole('button', { name: 'Publish update' }).click()]);
    post = Post.findById(post.id);
    assert.equal(post.body_gallery.items.length, 100);
    assert.equal(post.images.length, 2);
    assert.equal(f.db.prepare("SELECT count(*) n FROM media_publications WHERE record_type = 'asset'").get().n, 102);
    assert.equal((await guest.page.goto(f.base + docPath)).status(), 200);
    assert.equal(await guest.page.locator('.documentary-gallery figure').count(), 100);

    const removedUrl = post.body_gallery.items[0].asset.medium;
    const original = await (await edit.get(removedUrl)).body();
    await edit.page.goto(f.base + editPath);
    await list(edit.page).first().getByRole('button', { name: /Remove photo/ }).click();
    await list(edit.page).first().locator('[data-gallery-caption]').fill('Updated caption after publication');
    await Promise.all([edit.page.waitForURL('**/admin/dashboard'), edit.page.getByRole('button', { name: 'Publish update' }).click()]);
    post = Post.findById(post.id);
    assert.equal(post.body_gallery.items.length, 99);
    assert.equal(post.body_gallery.items[0].caption, 'Updated caption after publication');
    assert.deepEqual(await (await edit.get(removedUrl)).body(), original);
    assert.equal(f.db.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(f.db.pragma('foreign_key_check'), []);
});

test('FFG draft revisions protect prose, captions, ordering and staged uploads across tabs', { timeout: 45000 }, async t => {
    const f = await fixture(t, { editorRequestLimit: 100 }), a = await f.session();
    const { page, context } = a;
    const draft = await compose(page, f, 'Synthetic concurrent draft', '<p>First version</p>');
    const old = await context.newPage();
    await old.goto(f.base + draft.edit);
    assert.equal(await editorRevision(page), '1');
    assert.equal(await editorRevision(old), '1');
    await old.locator('#title').fill('Older tab title');
    await old.locator('#created_at').fill('2026-10-02');
    await old.locator('#public-author-1').selectOption(String(f.person.id));
    await old.locator('#publisherId').selectOption(String(f.person.id));
    await old.locator('#body').fill('<p>Other racing version</p>');
    const simultaneous = defer();
    let waiting = 0;
    const releaseBoth = async route => {
        if (++waiting === 2) simultaneous.resolve();
        await simultaneous.promise;
        await route.continue();
    };
    for (const tab of [page, old]) await tab.route('**/dashboard/posts/create', releaseBoth, { times: 1 });
    const raced = await Promise.all([editorPost(page, 'draft'), editorPost(old, 'draft')]);
    assert.deepEqual(raced.map(attempt => attempt.status).sort(), [200, 409]);
    const winner = raced[0].status === 200 ? page : old;
    assert.equal(draftRow(f.db, draft.id).revision, 2);
    assert.equal(JSON.parse(draftRow(f.db, draft.id).fields).form.title, await winner.locator('#title').inputValue());
    const replay = await editorPost(winner, 'draft');
    assert.equal(replay.status, 200);
    assert.equal(replay.result.revision, 2);
    assert.equal(draftRow(f.db, draft.id).revision, 2);

    await page.goto(f.base + draft.edit);
    const image = await photo();
    await selectPhotos(page, [image, { ...image, name: 'second.png' }], 2);
    await describePhotos(page, 0, 2);
    await page.locator('#body').fill(prose('Saved starting prose'));
    await save(page);
    const revision = await editorRevision(page);
    await old.goto(f.base + draft.edit);
    assert.equal(await editorRevision(old), revision);
    const olderPublish = await context.newPage();
    await olderPublish.goto(f.base + draft.edit);

    await page.locator('#body').fill(prose('Newer current prose'));
    await list(page).first().locator('[data-gallery-caption]').fill('Newer caption');
    await list(page).first().getByRole('button', { name: /Move down/ }).click();
    await save(page);
    const newest = draftRow(f.db, draft.id);
    const expected = JSON.parse(JSON.parse(newest.fields).form.bodyGalleryItems);
    assert.equal(expected[1].caption, 'Newer caption');
    await old.locator('#body').fill(prose('Unsaved conflicting prose'));
    await list(old).first().locator('[data-gallery-caption]').fill('Unsaved conflicting caption');
    await list(old).last().getByRole('button', { name: /Remove photo/ }).click();
    const [staleSave] = await Promise.all([postResponse(old), old.getByRole('button', { name: 'Save draft' }).click()]);
    assert.equal(staleSave.status(), 409);
    await old.waitForFunction(() => document.querySelector('[data-gallery-status]').textContent.includes('unsaved edits'));
    assert.match(await old.locator('#body').inputValue(), /Unsaved conflicting prose/);
    assert.equal(await list(old).first().locator('[data-gallery-caption]').inputValue(), 'Unsaved conflicting caption');
    assert.equal(await list(old).count(), 1);
    const [latestTab] = await Promise.all([context.waitForEvent('page'),
        old.getByRole('link', { name: 'Open current draft in a new tab' }).click()]);
    await waitForPhotos(latestTab, 2);
    assert.equal(await list(old).count(), 1);
    assert.deepEqual(await list(latestTab).evaluateAll(rows => rows.map(row => row.dataset.id)), expected.map(item => item.id));

    await olderPublish.locator('#image-input').setInputFiles(image);
    const [stalePublish] = await Promise.all([postResponse(olderPublish),
        olderPublish.getByRole('button', { name: 'Publish post' }).click()]);
    assert.equal(stalePublish.status(), 409);
    await olderPublish.getByRole('link', { name: 'Open current draft in a new tab' }).waitFor();
    assert.match(await olderPublish.locator('#body').inputValue(), /Saved starting/);
    assert.equal(await olderPublish.locator('#image-input').evaluate(input => input.files.length), 1);
    assert.deepEqual(draftRow(f.db, draft.id), newest);
    assert.equal(Post.findAll(1, 0).length, 0);
    assert.equal(grantCount(f.db), 0);

    await selectPhotos(latestTab, [{ ...image, name: 'another-tab.png' }], 3);
    const newPhoto = await list(latestTab).last().getAttribute('data-id');
    const afterUpload = draftRow(f.db, draft.id);
    assert.equal((await editorPost(page, 'draft')).status, 409);
    assert.equal((await editorPost(page, 'publish')).status, 409);
    assert.deepEqual(draftRow(f.db, draft.id), afterUpload);
    assert.equal(grantCount(f.db), 0);
    await page.goto(f.base + draft.edit);
    await waitForPhotos(page, 3);
    assert.equal(await list(page).last().getAttribute('data-id'), newPhoto);
    const invalidKnown = await editorPost(page, 'draft', { galleryKnownPhotos: JSON.stringify([randomUUID()]) });
    assert.equal(invalidKnown.status, 403);
    await list(page).last().getByRole('button', { name: /Remove photo/ }).click();
    await save(page);
    await page.reload();
    await waitForPhotos(page, 2);
    assert.equal(Object.keys(JSON.parse(draftRow(f.db, draft.id).staged)).length, 3);

    // Let the real route commit, then drop the client response and replay the same form.
    const accepted = defer();
    await page.route('**/dashboard/posts/create', async route => {
        const response = await route.fetch({ headers: { ...await route.request().allHeaders(), cookie: a.cookie } });
        accepted.resolve({ status: response.status(), result: await response.json() });
        await route.abort();
    }, { times: 1 });
    await page.getByRole('button', { name: 'Publish post' }).click();
    assert.equal((await accepted.promise).status, 200);
    await page.waitForFunction(() => !document.querySelector('.post-form button[type="submit"]').disabled);
    const repeated = await editorPost(page, 'publish');
    assert.equal(repeated.status, 200);
    assert.equal(repeated.result.redirect, '/admin/dashboard');
    const post = Post.findAll(1, 0)[0];
    assert.match(post.body, /Newer current prose/);
    assert.deepEqual(post.body_gallery.items.map(item => item.id), expected.map(item => item.id));
    assert.equal(grantCount(f.db), 2);
    assert.equal(receiptRow(f.db, draft.op).state, 'published');

    await page.goto(f.base + `/admin/posts/${post.id}/edit`);
    await save(page);
    await old.goto(page.url());
    await page.locator('#body').fill(prose('Current updated article'));
    await save(page);
    await old.locator('#body').fill(prose('Stale updated article'));
    assert.equal((await editorPost(old, 'publish')).status, 409);
    assert.equal((await editorPost(page, 'publish')).status, 200);
    const updated = Post.findById(post.id);
    assert.match(updated.body, /Current updated article/);
    assert.deepEqual(updated.body_gallery, post.body_gallery);
    assert.equal(updated.created_at, post.created_at);
    assert.equal(grantCount(f.db), 2);
});

test('FFG saves and publication prepare are fenced, and reopening a live attempt changes nothing', { timeout: 35000 }, async t => {
    const f = await fixture(t, { editorRequestLimit: 100 }), a = await f.session();
    const { page, context, get } = a;
    const draft = await compose(page, f, 'Synthetic publication overlap', prose('Original prose'));
    const image = await photo();
    await selectPhotos(page, [image], 1);
    await describePhotos(page, 0, 1);
    await save(page);
    const other = await context.newPage();
    await other.goto(f.base + draft.edit);
    await page.locator('#image-input').setInputFiles(image);

    const preparation = defer(), finishPreparation = defer();
    f.app.locals.preparePostCandidate = async options => {
        preparation.resolve();
        await finishPreparation.promise;
        return preparePostCandidate(options);
    };
    try {
        const publishing = editorPost(page, 'publish');
        await preparation.promise;
        await other.locator('#body').fill(prose('Saved during highlight preparation'));
        await save(other);
        finishPreparation.resolve();
        assert.equal((await publishing).status, 409);
        assert.equal(receiptRow(f.db, draft.op).state, 'allocated');
        assert.equal(grantCount(f.db), 0);
        assert.match(JSON.parse(draftRow(f.db, draft.id).fields).form.body, /Saved during/);
    } finally {
        finishPreparation.resolve();
        delete f.app.locals.preparePostCandidate;
    }

    const verifying = defer(), finishVerification = defer();
    const candidateId = await list(other).first().getAttribute('data-id');
    const open = fs.open;
    const barrier = t.mock.method(fs, 'open', async (name, ...args) => {
        if (String(name).startsWith(f.uploadsPath) && String(name).includes('/' + candidateId + '/')
            && receiptRow(f.db, draft.op).state === 'prepared') {
            verifying.resolve();
            await finishVerification.promise;
        }
        return open(name, ...args);
    });
    try {
        const publishing = editorPost(other, 'publish');
        await verifying.promise;
        const before = draftRow(f.db, draft.id);
        const currentReceipt = receiptRow(f.db, draft.op);
        const reopened = await get(draft.edit);
        assert.equal(reopened.status(), 200);
        assert.match(await reopened.text(), /Publication is in progress/);
        assert.equal((await editorPost(page, 'draft')).status, 409);
        const csrf = await page.locator('[name="_csrf"]').inputValue();
        const retire = await context.request.post(f.base + `/admin/gallery-drafts/${draft.id}/resume`, {
            form: { _csrf: csrf, mediaOperationId: draft.op }, headers: { cookie: a.cookie }
        });
        assert.equal(retire.status(), 409);
        assert.deepEqual(draftRow(f.db, draft.id), before);
        assert.deepEqual(receiptRow(f.db, draft.op), currentReceipt);
        finishVerification.resolve();
        assert.equal((await publishing).status, 200);
        assert.equal(receiptRow(f.db, draft.op).state, 'published');
        assert.equal(grantCount(f.db), 1);
        assert.match(Post.findAll(1, 0)[0].body, /Saved during/);
        assert.equal((await get(draft.edit, { maxRedirects: 0 })).headers().location, '/admin/dashboard');
    } finally {
        finishVerification.resolve();
        barrier.mock.restore();
    }
});

test('FFG keeps prepared attempts and duplicate-title confirmation across local app restart', { timeout: 40000 }, async t => {
    const f = await fixture(t, { editorRequestLimit: 100 }), a = await f.session();
    const { page, get, context } = a;
    const title = 'Synthetic durable gallery';
    const draft = await compose(page, f, title, prose('First article'));
    const image = await photo();
    await selectPhotos(page, [image], 1);
    await describePhotos(page, 0, 1);
    const id = await list(page).first().getAttribute('data-id');
    const originalUrl = `/uploads/m1-${id}-medium.webp`;
    f.db.exec(`CREATE TEMP TRIGGER fail_synthetic_draft_once BEFORE INSERT ON media_publications
        WHEN NEW.record_type = 'asset' BEGIN SELECT RAISE(ABORT, 'Synthetic preparation interruption'); END`);
    assert.equal((await editorPost(page, 'publish')).status, 200);
    const prepared = receiptRow(f.db, draft.op);
    assert.equal(prepared.state, 'prepared');
    assert.equal(grantCount(f.db), 0);
    assert.equal((await get(originalUrl)).status(), 404);

    await f.restart();
    const reopened = await get(draft.edit);
    assert.equal(reopened.status(), 200);
    assert.match(await reopened.text(), /Resume editing draft/);
    assert.equal(draftRow(f.db, draft.id).operation_id, draft.op);
    assert.deepEqual(receiptRow(f.db, draft.op), prepared);
    const retried = await editorPost(page, 'publish');
    assert.equal(retried.result.redirect, '/admin/dashboard');
    const first = Post.findAll(1, 0)[0];
    assert.match(first.body, /First article/);
    assert.equal(grantCount(f.db), 1);
    const firstBytes = await (await get(originalUrl)).body();
    assert.equal((await get(`/admin/media-operations/${draft.op}`).then(response => response.json())).state, 'published');

    const duplicate = await compose(page, f, title, prose('Replacement article'));
    await selectPhotos(page, [image], 1);
    await list(page).first().locator('[data-gallery-alt]').fill('Replacement photo');
    const newId = await list(page).first().getAttribute('data-id');
    const newUrl = `/uploads/m1-${newId}-large.webp`;
    const pending = await editorPost(page, 'publish');
    assert.match(pending.result.redirect, /confirm-overwrite/);
    assert.equal((await get(newUrl)).status(), 404);
    assert.equal(grantCount(f.db), 1);
    await f.restart();
    assert.equal((await get(duplicate.edit, { maxRedirects: 0 })).headers().location, pending.result.redirect);
    assert.equal((await page.goto(f.base + pending.result.redirect)).status(), 200);
    const form = page.locator('form').filter({ has: page.locator('[name="mediaOperationId"]') });
    const csrf = await form.locator('[name="_csrf"]').inputValue();
    const confirmed = await context.request.post(f.base + '/admin/posts/confirm-overwrite', { maxRedirects: 0,
        headers: { cookie: a.cookie }, form: { _csrf: csrf, mediaOperationId: duplicate.op, action: 'overwrite' } });
    assert.equal(confirmed.status(), 302);
    assert.equal(receiptRow(f.db, duplicate.op).state, 'published');
    const updated = Post.findById(first.id);
    assert.match(updated.body, /Replacement article/);
    assert.equal(updated.body_gallery.items[0].id, newId);
    assert.equal(updated.body_gallery.items[0].alt, 'Replacement photo');
    assert.equal((await get(newUrl)).status(), 200);
    assert.deepEqual(await (await get(originalUrl)).body(), firstBytes);
    assert.equal(grantCount(f.db), 2);
});

test('FFG photo admission bounds real multipart streams and cleans up interrupted uploads', { timeout: 30000 }, async t => {
    const fileLimit = 8 * 1024;
    const f = await fixture(t, { multipartFileLimit: fileLimit }), a = await f.session();
    const draft = await compose(a.page, f, 'Synthetic multipart', '<p>Private multipart test</p>');
    const image = await photo(), csrf = await a.page.locator('[name="_csrf"]').inputValue();
    const route = f.base + `/admin/gallery-drafts/${draft.id}/images`;
    const boundary = 'synthetic-gallery-boundary';
    const headers = { cookie: a.cookie, 'x-csrf-token': csrf, 'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'x-forwarded-proto': 'https', 'x-forwarded-for': '192.0.2.10' };
    const field = (name, value) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    const fileStart = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n`);
    const file = (bytes = image.buffer) => Buffer.concat([fileStart, bytes, Buffer.from('\r\n')]);
    const fields = () => [field('_csrf', csrf), field('uploadId', randomUUID())];
    const finish = Buffer.from(`--${boundary}--\r\n`);
    const upload = (parts, overrides = {}) => a.context.request.post(route, {
        data: Buffer.concat([...parts, finish]), headers: { ...headers, ...overrides }, maxRedirects: 0
    });
    const accepted = await upload([...fields(), file()]);
    assert.equal(accepted.status(), 200, await accepted.text());
    const item = await accepted.json();
    const stable = draftRow(f.db, draft.id);
    const failures = [
        ['unexpected field', [field('_csrf', csrf), field('unexpected', 'synthetic'), file()], 400],
        ['too many fields', [...fields(), field('third', 'synthetic'), file()], 413],
        ['too many parts', [...fields(), file(), file(), field('fifth', 'synthetic')], 413],
        ['too many total bytes', [...fields(), file(), Buffer.alloc(32 * 1024, 32)], 413],
        ['oversized file', [...fields(), file(Buffer.alloc(fileLimit + 1))], 413],
        ['oversized field', [field('_csrf', csrf), field('uploadId', 'x'.repeat(513)), file()], 413],
        ['repeated file', [...fields(), file(), file()], 413],
        ['no file', fields(), 400],
        ['invalid decoded bytes', [...fields(), file(Buffer.from('synthetic invalid PNG'))], 400],
        ['invalid form CSRF', [field('_csrf', 'invalid'), field('uploadId', randomUUID()), file()], 403]
    ];
    for (const [label, parts, status] of failures) {
        assert.equal((await upload(parts)).status(), status, label);
        assert.deepEqual(draftRow(f.db, draft.id), stable, label);
    }
    assert.equal((await upload([...fields(), file()], { 'x-csrf-token': '' })).status(), 403);
    assert.equal((await upload([...fields(), file()], { cookie: '' })).status(), 302);

    // Omit Content-Length to exercise the live byte cap even with a completed valid file.
    const chunked = await new Promise((resolve, reject) => {
        const request = httpRequest(route, { method: 'POST', headers }, response => {
            let payload = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { payload += chunk; });
            response.on('end', () => resolve({ status: response.statusCode, payload }));
            response.on('error', reject);
        });
        request.setTimeout(5000, () => request.destroy(new Error('Chunked request timed out')));
        request.on('error', reject);
        request.write(Buffer.concat([...fields(), file(), finish]));
        request.end(Buffer.alloc(32 * 1024, 32));
    });
    assert.equal(chunked.status, 413);
    assert.match(chunked.payload, /total request limit/);
    const temp = path.join(f.uploadsPath, 'temp');
    const waitForTemp = async predicate => {
        for (let i = 0; i < 100; i++) {
            if (predicate(await fs.readdir(temp))) return;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.fail('Temporary upload did not reach the expected state');
    };
    await waitForTemp(entries => entries.length === 0);
    const interrupted = httpRequest(route, { method: 'POST', headers });
    interrupted.on('error', () => {});
    const closed = new Promise(resolve => interrupted.on('close', resolve));
    try {
        interrupted.write(Buffer.concat([...fields(), fileStart, image.buffer]));
        await waitForTemp(entries => entries.length === 1);
        assert.equal((await upload([...fields(), file()])).status(), 409);
    } finally {
        interrupted.destroy();
        await closed;
    }
    await waitForTemp(entries => entries.length === 0);
    assert.deepEqual(draftRow(f.db, draft.id), stable);
    assert.equal((await upload([...fields(), file()])).status(), 200);
    assert.equal(grantCount(f.db), 0);
    assert.equal((await a.get(`/uploads/m1-${item.id}-medium.webp`)).status(), 404);
});
