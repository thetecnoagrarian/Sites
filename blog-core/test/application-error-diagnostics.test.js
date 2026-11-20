import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { engine } from 'express-handlebars';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { formatWithOptions } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createBlogApp } from '../src/app.js';
import { getDatabase, setDatabase } from '../src/models/db.js';
import { asyncHandler } from '../src/utils/asyncHandler.js';
import { attachUser } from '../src/middleware/auth.js';
import logger from '../src/utils/logger.js';
import User from '../src/models/user.js';
import Post from '../src/models/post.js';
import Category from '../src/models/category.js';
import { createHeroPublicationProvider } from '../../fruitionforestgarden/src/utils/heroImageStore.js';

const sentinels = ['ARTICLE', 'PENDING', 'CAPTION', 'PASSWORD', 'COOKIE', 'CSRF', 'TOKEN', 'QUERY', 'FILENAME', 'FILE_CONTENT'];
const privateText = sentinels.map(value => `SYNTHETIC_ERROR_${value}`).join('|');
function privateError() {
    const error = new Error(privateText);
    error.stack = privateText; error.body = privateText; error.pending_input = privateText;
    error.cookie = privateText; error.code = 'SQLITE_CONSTRAINT_TRIGGER';
    error.toJSON = () => ({ privateText });
    return error;
}

async function fixture(t, site, { trustedIPs, ordinaryLimit, authenticated = true,
    decorateRequest = () => {}, registerRoutes = () => {} } = {}) {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'sites-final-diagnostics-'));
    const publicPath = path.join(root, 'public'), uploadsPath = path.join(root, 'uploads'), viewsPath = path.join(root, 'views');
    await Promise.all([publicPath, uploadsPath, viewsPath].map(p => fs.mkdir(p, { recursive: true })));
    await Promise.all(['404', '500'].map(view => fs.writeFile(path.join(viewsPath, view + '.hbs'), view)));
    await fs.mkdir(path.join(viewsPath, 'layouts'));
    await fs.writeFile(path.join(viewsPath, 'layouts', 'main.hbs'), '{{{body}}}');
    await fs.writeFile(path.join(publicPath, 'synthetic.txt'), 'synthetic public asset');
    await fs.mkdir(path.join(uploadsPath, '.media', 'post'), { recursive: true });
    await fs.writeFile(path.join(uploadsPath, '.media', 'post', 'private.txt'), privateText);
    await fs.mkdir(path.join(uploadsPath, 'temp'), { recursive: true });
    await fs.writeFile(path.join(uploadsPath, 'temp', 'private.txt'), privateText);
    const id = 'abcdefab-1234-4234-8234-123456789abc';
    await fs.mkdir(path.join(publicPath, 'uploads'), { recursive: true });
    await fs.writeFile(path.join(publicPath, 'uploads', `m1-${id}-large.webp`), privateText);
    await fs.writeFile(path.join(uploadsPath, `m1-${id}-large.webp`), privateText);
    const previousMode = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'synthetic-fixture-only-session';
    // Every fixture owns synthetic configuration; no real environment file is read.
    if (trustedIPs === undefined) delete process.env.TRUSTED_IPS;
    else process.env.TRUSTED_IPS = trustedIPs;
    if (ordinaryLimit === undefined) delete process.env.RATE_LIMIT_MAX_REQUESTS;
    else process.env.RATE_LIMIT_MAX_REQUESTS = String(ordinaryLimit);
    const records = [], diagnostics = [], access = [], rawErrors = [];
    const original = { error: logger.error, warn: logger.warn, info: logger.info, log: console.log, consoleError: console.error };
    logger.error = (record, message) => { records.push({ ...record, message }); diagnostics.push(JSON.stringify(record)); };
    // Access logging remains separate and deliberately unchanged.
    logger.info = (...args) => access.push(formatWithOptions({ colors: false }, ...args));
    logger.warn = (...args) => access.push(formatWithOptions({ colors: false }, ...args));
    console.log = (...args) => access.push(formatWithOptions({ colors: false }, ...args));
    console.error = (...args) => {
        // Fixed library/runtime warnings are not Express's raw fallback.
        // They still must be free of the private sentinels.
        if (args[0]?.code === 'ERR_ERL_PERMISSIVE_TRUST_PROXY'
            || (typeof args[0] === 'string' && /^\(node:\d+\) \[DEP0044\] DeprecationWarning: The `util\.isArray` API is deprecated\./.test(args[0]))) {
            const warning = formatWithOptions({ colors: false }, ...args);
            assert.equal(warning.includes('SYNTHETIC_ERROR_'), false);
            access.push(warning);
            return;
        }
        diagnostics.push(formatWithOptions({ colors: false }, ...args));
        if (args[0] !== 'Diagnostic logger unavailable') rawErrors.push(args);
    };
    const intervals = [], ticks = [], nativeInterval = globalThis.setInterval;
    globalThis.setInterval = (...args) => { const handle = nativeInterval(...args); handle.unref(); intervals.push(handle); ticks.push(args[0]); return handle; };
    let application;
    const hero = site === 'ffg' ? createHeroPublicationProvider(uploadsPath) : null;
    try { application = createBlogApp({ siteName: site, databasePath: path.join(root, 'synthetic.db'),
        publicPath, uploadsPath, viewsPath, baseUrl: 'https://example.invalid',
        mediaPublicationProviders: hero ? { hero: hero.authorize } : {},
        mediaPublicationIntegrityVerifiers: hero ? { hero: hero.verifyOpenedFile } : {} }); }
    finally { globalThis.setInterval = nativeInterval; }
    const { app, setupFinalHandlers } = application, db = getDatabase();
    const owner = Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES('synthetic','synthetic','admin')").run().lastInsertRowid);
    app.set('view options', { layout: false });
    app.use((req, res, next) => {
        if (authenticated) {
            req.session.userId = owner; req.user = { id: owner, role: 'admin' };
        }
        decorateRequest(req);
        if (req.path === '/__synthetic/attach') return attachUser(req, res, () => res.sendStatus(204));
        next();
    });
    app.get('/__synthetic/csrf', (req, res) => res.json({ csrf: req.csrfToken() }));
    const siteRoot = site === 'ffg' ? 'fruitionforestgarden' : 'thetecnoagrarian';
    // The real module caches initialization for a single process/database. Each
    // test instead owns a fresh database, so initialize its unchanged tables.
    (await import(`../../${siteRoot}/src/models/analytics.js`)).default.init();
    // Match the actual entrypoints: shared middleware, site middleware, home/auth/admin, finalization.
    const analytics = (await import(`../../${siteRoot}/src/middleware/analytics.js`)).default;
    const home = (await import(`../../${siteRoot}/src/routes/home.js`)).default;
    const auth = (await import(`../../${siteRoot}/src/routes/auth.js`)).default;
    const admin = (await import(`../../${siteRoot}/src/routes/admin.js`)).default;
    app.use(analytics); app.use('/', home); app.use('/', auth); app.use('/admin', admin);
    // Test-only faults are registered before the same production finalization boundary.
    const fault = { create: privateError };
    app.get('/__synthetic/route-error', () => { throw fault.create(); });
    app.get('/__synthetic/async-error', asyncHandler(async () => { throw privateError(); }));
    registerRoutes(app);
    setupFinalHandlers();
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await delay(5);
        Object.assign(logger, { error: original.error, warn: original.warn, info: original.info });
        console.log = original.log; console.error = original.consoleError;
        intervals.forEach(clearInterval); db.close(); setDatabase(null);
        if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
        await fs.rm(root, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    const request = async (url, options = {}) => {
        const response = await fetch(base + url, { ...options, redirect: 'manual', headers: {
            'x-forwarded-proto': 'https', ...(cookie ? { cookie } : {}), ...options.headers } });
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        const text = await response.text(); await delay(5);
        return { status: response.status, text, location: response.headers.get('location'), headers: response.headers };
    };
    const bounded = () => {
        const output = diagnostics.join('\n');
        assert.equal(rawErrors.length, 0, 'Express default/raw error logging must never run: '
            + formatWithOptions({ colors: false }, rawErrors));
        for (const key of sentinels) assert.equal(output.includes(`SYNTHETIC_ERROR_${key}`), false, 'No private diagnostic output');
        for (const row of records) { assert.ok(row.errorId); assert.ok(row.errorCategory); assert.ok(row.route); }
    };
    return { app, setupFinalHandlers, db, request, records, diagnostics, bounded, uploadsPath, access,
        baseURL: base, cookie: () => cookie,
        tickSessions: () => ticks.forEach(tick => tick()), setFault: create => { fault.create = create; }, viewsPath };
}

test('real composed HTTP errors tolerate hostile getters, thrown objects and sink failure', async t => {
    const f = await fixture(t, 'ffg');
    for (const field of ['code', 'name']) {
        f.setFault(() => {
            const error = privateError();
            Object.defineProperty(error, field, { get() { throw new Error(privateText); } });
            return error;
        });
        const before = f.records.length, result = await f.request('/__synthetic/route-error');
        assert.equal(result.status, 500); assert.equal(result.text, '500');
        assert.equal(f.records.length, before + 1);
    }
    f.setFault(() => ({ message: privateText, stack: privateText, pending_input: privateText,
        toJSON() { throw new Error(privateText); } }));
    assert.equal((await f.request('/__synthetic/route-error')).status, 500);
    const sink = logger.error;
    try {
        logger.error = () => { throw privateError(); };
        assert.equal((await f.request('/__synthetic/route-error')).text, '500');
    } finally { logger.error = sink; }
    f.bounded();
});

test('error-template failure stays bounded instead of reaching Express raw fallback', async t => {
    const f = await fixture(t, 'tta');
    await fs.unlink(path.join(f.viewsPath, '500.hbs'));
    const result = await f.request('/__synthetic/route-error');
    assert.equal(result.status, 500); assert.equal(result.text, 'Internal Server Error');
    assert.equal(f.records.length, 2, 'Original and view-render failure are distinct bounded diagnostics');
    f.bounded();
});

for (const site of ['ffg', 'tta']) {
    test(`${site}: real factory finalization covers shared and site errors exactly once`, async t => {
        const f = await fixture(t, site);
        assert.throws(() => f.app.use(() => {}), /before setupFinalHandlers/);
        assert.throws(() => f.app.get('/late', () => {}), /before setupFinalHandlers/);
        assert.throws(() => f.app.all('/late', () => {}), /before setupFinalHandlers/);
        assert.throws(() => f.app.route('/late'), /before setupFinalHandlers/);
        assert.throws(() => f.setupFinalHandlers(), /already finalized/);
        assert.equal(f.app.get('view engine'), 'hbs');
        for (const url of ['/__synthetic/route-error', '/__synthetic/async-error']) {
            const before = f.records.length, result = await f.request(url);
            assert.equal(result.status, 500); assert.equal(result.text, '500');
            assert.equal(f.records.length, before + 1);
        }
        // JSON parsing occurs in shared middleware, before any site routes.
        const before = f.records.length;
        assert.equal((await f.request('/__synthetic/route-error', { method: 'POST',
            headers: { 'content-type': 'application/json' }, body: '{' + privateText })).status, 500);
        assert.equal(f.records.length, before + 1);
        // An actual site route: async in FFG and synchronous in TTA.
        const findAll = User.findAll;
        try {
            User.findAll = () => { throw privateError(); };
            const count = f.records.length, result = await f.request('/admin/users');
            assert.equal(result.status, 500); assert.equal(result.text, '500');
            assert.equal(f.records.length, count + 1);
        } finally { User.findAll = findAll; }
        assert.equal((await f.request('/health')).status, 200);
        assert.equal((await f.request('/synthetic.txt')).text, 'synthetic public asset');
        const missing = await f.request('/missing'); assert.equal(missing.status, 404); assert.equal(missing.text, '404');
        for (const url of ['/uploads/.media/post/private.txt', '/uploads/temp/private.txt',
            '/uploads/m1-abcdefab-1234-4234-8234-123456789abc-large.webp']) {
            const result = await f.request(url); assert.equal(result.status, 404); assert.equal(result.text.includes(privateText), false);
        }
        f.bounded();
    });

    test(`${site}: actual authentication, dashboard, category and sitemap catches are bounded`, async t => {
        const f = await fixture(t, site), findById = User.findById;
        try {
            User.findById = () => { throw privateError(); };
            assert.equal((await f.request('/admin/dashboard')).status, 302);
            assert.equal((await f.request('/__synthetic/attach')).status, 204);
        } finally { User.findById = findById; }
        const findPosts = Post.findAll, findCategories = Category.findAll;
        try {
            Post.findAll = () => { throw privateError(); };
            assert.equal((await f.request('/admin/dashboard')).status, 302);
            Post.findAll = findPosts;
            Category.findAll = () => { throw privateError(); };
            assert.equal((await f.request('/admin/categories')).status, 302);
            assert.equal((await f.request('/sitemap.xml')).status, 500);
        } finally { Post.findAll = findPosts; Category.findAll = findCategories; }
        assert.ok(f.records.some(row => row.message === 'Authentication action failed'));
        assert.ok(f.records.some(row => row.message === 'Administrative action failed'));
        assert.ok(f.records.some(row => row.message === 'Sitemap generation failed'));
        const csrf = JSON.parse((await f.request('/__synthetic/csrf')).text).csrf;
        f.db.exec(`CREATE TRIGGER synthetic_category_error BEFORE INSERT ON categories
            BEGIN SELECT RAISE(ABORT, '${privateText}'); END`);
        const category = await f.request('/admin/categories?draft=SYNTHETIC_ERROR_QUERY', { method: 'POST',
            body: new URLSearchParams({ _csrf: csrf, name: privateText }) });
        assert.equal(category.status, 302); assert.equal(category.location, '/admin/dashboard');
        assert.ok(f.records.some(row => row.errorCode === 'SQLITE_CONSTRAINT' && row.route === 'admin'));
        f.bounded();
    });
}

async function heroViews(f) {
    const site = path.resolve('fruitionforestgarden/src');
    await fs.mkdir(path.join(f.viewsPath, 'admin'), { recursive: true });
    await fs.mkdir(path.join(f.viewsPath, 'partials', 'layouts'), { recursive: true });
    for (const name of ['admin/hero-image', 'home', 'about']) {
        await fs.copyFile(path.join(site, 'views', name + '.hbs'), path.join(f.viewsPath, name + '.hbs'));
    }
    // Real page templates, with a local shell that avoids external scripts/CDNs.
    for (const name of ['main', 'admin']) await fs.writeFile(path.join(f.viewsPath, 'partials', 'layouts', name + '.hbs'),
        '{{> @partial-block}}');
    await fs.writeFile(path.join(f.viewsPath, 'layouts', 'main.hbs'),
        '<html><head>{{{ogTags}}}</head><body>{{{body}}}</body></html>');
    f.app.set('view options', { layout: 'main' });
    f.app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main', layoutsDir: path.join(f.viewsPath, 'layouts'),
        partialsDir: path.join(f.viewsPath, 'partials') }));
    const publicPath = path.join(path.dirname(f.viewsPath), 'public');
    await fs.mkdir(path.join(publicPath, 'images'), { recursive: true });
    for (const name of ['HeroCamp.webp', 'HeroCamp-og.webp']) await fs.copyFile(path.join(site, 'public/images', name), path.join(publicPath, 'images', name));
}
function heroForm(html, name = 'heroOperationId') {
    const value = html.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];
    assert.ok(value, `Expected real form field ${name}`);
    return value;
}
const heroBody = (id, csrf, bytes) => {
    const body = new FormData(); body.append('_csrf', csrf); body.append('heroOperationId', id);
    body.append('heroImage', new Blob([bytes], { type: 'image/png' }), 'SYNTHETIC_ERROR_FILENAME.png');
    return body;
};

test('FFG real admin upload receipts survive response failure and post deletion without leaking diagnostics', async t => {
    let failResponse = true;
    const f = await fixture(t, 'ffg', { decorateRequest(req) {
        const flash = req.flash;
        req.flash = function (type, ...args) {
            if (failResponse && req.originalUrl === '/admin/hero-image/upload' && type === 'success') throw privateError();
            return flash.call(this, type, ...args);
        };
    } });
    await heroViews(f);
    const form = await f.request('/admin/hero-image');
    assert.equal(form.status, 200);
    const id = heroForm(form.text), csrf = heroForm(form.text, '_csrf');
    const bytes = await sharp({ create: { width: 120, height: 60, channels: 3, background: '#246842' } }).png().toBuffer();
    const failedResponse = await f.request('/admin/hero-image/upload', { method: 'POST', body: heroBody(id, csrf, bytes) });
    assert.equal(failedResponse.status, 503); assert.equal(JSON.parse(failedResponse.text).state, 'accepted');
    failResponse = false;
    const status = await f.request('/admin/hero-image/operations/' + id);
    assert.equal(status.status, 200); assert.equal(JSON.parse(status.text).state, 'accepted');
    assert.equal(status.headers.get('cache-control'), 'no-store');
    const authorityPath = path.join(f.uploadsPath, 'hero', '.current.json');
    const authorityBefore = await fs.readFile(authorityPath), candidatesBefore = await fs.readdir(path.join(f.uploadsPath, '.media', 'hero'));
    const integrity = await f.request('/admin/hero-image/integrity');
    assert.equal(integrity.status, 200); assert.equal(JSON.parse(integrity.text).state, 'ok');
    assert.equal(integrity.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await fs.readFile(authorityPath), authorityBefore);
    assert.deepEqual(await fs.readdir(path.join(f.uploadsPath, '.media', 'hero')), candidatesBefore);
    const retried = await f.request('/admin/hero-image/upload', { method: 'POST', body: heroBody(id, csrf, bytes) });
    assert.equal(retried.status, 302);
    const url = `/uploads/hero/m1-${id}/current-hero.webp`;
    assert.equal((await f.request(url)).status, 200);
    const created = Post.create({ title: 'Synthetic hero association', body: `<img src="${url}">`,
        description: '', excerpt: '', images: [], captions: [], created_at: '2026-01-01', author_id: 1 });
    const deleted = await f.request(`/admin/dashboard/posts/${created.lastInsertRowid}/delete`, {
        method: 'POST', body: new URLSearchParams({ _csrf: csrf }) });
    assert.equal(deleted.status, 302); assert.equal((await f.request(url)).status, 200);
    f.bounded();
});

function failHeroDirectorySync(t, directory) {
    const native = fs.open.bind(fs);
    const patched = t.mock.method(fs, 'open', async (file, ...args) => {
        const handle = await native(file, ...args);
        if (file !== directory) return handle;
        return new Proxy(handle, { get(target, key) {
            if (key === 'sync') return async () => { throw Object.assign(privateError(), { code: 'EIO' }); };
            const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
        } });
    });
    return () => patched.mock.restore();
}

function assertHeroUnknown(result, operationId) {
    assert.equal(result.status, 503);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const body = JSON.parse(result.text);
    assert.equal(body.state, 'unknown');
    if (operationId) assert.equal(body.operationId, operationId);
    assert.doesNotMatch(result.text, /Failed to (?:process|reset)|SYNTHETIC_ERROR_|[.]current[.]json/);
}

test('FFG upload retry and receipt status stay unknown through persistent sync, read and validation faults', async t => {
    const f = await fixture(t, 'ffg'); await heroViews(f);
    const form = await f.request('/admin/hero-image'), id = heroForm(form.text), csrf = heroForm(form.text, '_csrf');
    const bytes = await sharp({ create: { width: 120, height: 60, channels: 3, background: '#246842' } }).png().toBuffer();
    const directory = await fs.realpath(path.join(f.uploadsPath, 'hero'));
    const file = path.join(directory, '.current.json');
    const lookup = '/admin/hero-image/operations/' + id;
    const url = `/uploads/hero/m1-${id}/current-hero.webp`;
    const upload = () => f.request('/admin/hero-image/upload', { method: 'POST', body: heroBody(id, csrf, bytes) });
    const before = await fs.readFile(file);
    const rename = t.mock.method(fs, 'rename', async () => { throw Object.assign(privateError(), { code: 'EIO' }); });
    const notAccepted = await upload();
    assert.equal(notAccepted.status, 302);
    assert.equal(notAccepted.location, '/admin/hero-image');
    rename.mock.restore();
    assert.deepEqual(await fs.readFile(file), before);
    assert.deepEqual(JSON.parse((await f.request(lookup)).text), { state: 'not-accepted' });
    assert.equal((await f.request(url)).status, 404);

    const restoreSync = failHeroDirectorySync(t, directory);
    assertHeroUnknown(await upload(), id);
    const accepted = await fs.readFile(file);
    assert.equal(JSON.parse(accepted).operations[id].revision, 1);
    assertHeroUnknown(await upload(), id);
    assertHeroUnknown(await f.request(lookup));
    const denied = await f.request(url, { headers: { 'If-None-Match': '*' } });
    assert.equal(denied.status, 404); assert.equal(denied.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await fs.readFile(file), accepted);
    restoreSync();

    const native = fs.open.bind(fs);
    const unreadable = t.mock.method(fs, 'open', async (filePath, ...args) => {
        if (filePath === file) throw Object.assign(privateError(), { code: 'EACCES' });
        return native(filePath, ...args);
    });
    assertHeroUnknown(await upload(), id);
    assertHeroUnknown(await f.request(lookup));
    unreadable.mock.restore();
    // A schema error previously surfaced as HERO_REJECTED, even in receipt lookup.
    await fs.writeFile(file, JSON.stringify({ ...JSON.parse(accepted), version: 3 }));
    assertHeroUnknown(await upload(), id);
    assertHeroUnknown(await f.request(lookup));
    await fs.writeFile(file, accepted);

    const recovered = await f.request(lookup);
    assert.equal(recovered.status, 200);
    assert.equal(JSON.parse(recovered.text).state, 'accepted');
    assert.equal((await upload()).status, 302);
    assert.deepEqual(await fs.readFile(file), accepted);
    assert.equal((await f.request(url)).status, 200);
    f.bounded();
});

test('FFG reset and retries report unknown until the existing reset receipt is durable', async t => {
    const f = await fixture(t, 'ffg'); await heroViews(f);
    const form = await f.request('/admin/hero-image'), id = heroForm(form.text), csrf = heroForm(form.text, '_csrf');
    const bytes = await sharp({ create: { width: 120, height: 60, channels: 3, background: '#246842' } }).png().toBuffer();
    assert.equal((await f.request('/admin/hero-image/upload', { method: 'POST', body: heroBody(id, csrf, bytes) })).status, 302);
    const selected = await f.request('/admin/hero-image');
    const resetId = heroForm(selected.text.slice(selected.text.indexOf('<form action="/admin/hero-image/reset"')));
    const reset = () => f.request('/admin/hero-image/reset', { method: 'POST', body: new URLSearchParams({ _csrf: csrf, heroOperationId: resetId }) });
    const lookup = '/admin/hero-image/operations/' + resetId;
    const directory = await fs.realpath(path.join(f.uploadsPath, 'hero'));
    const file = path.join(directory, '.current.json');
    const restore = failHeroDirectorySync(t, directory);
    assertHeroUnknown(await reset(), resetId);
    const accepted = await fs.readFile(file);
    const snapshot = JSON.parse(accepted);
    assert.equal(snapshot.current, null);
    assert.equal(snapshot.operations[resetId].revision, 2);
    assert.ok(snapshot.publications[id]);
    assertHeroUnknown(await reset(), resetId);
    assertHeroUnknown(await f.request(lookup));
    restore();
    assert.equal((await reset()).status, 302);
    const receipt = JSON.parse((await f.request(lookup)).text);
    assert.equal(receipt.state, 'accepted'); assert.equal(receipt.revision, 2);
    assert.deepEqual(await fs.readFile(file), accepted);
    assert.equal((await f.request(`/uploads/hero/m1-${id}/current-hero.webp`)).status, 200);
    f.bounded();
});

test('FFG actual lost upload response recovers its durable receipt on retry', async t => {
    let loseResponse = true;
    const f = await fixture(t, 'ffg', { decorateRequest(req) {
        if (req.originalUrl !== '/admin/hero-image/upload') return;
        const redirect = req.res.redirect;
        req.res.redirect = function (...args) {
            if (loseResponse) { this.destroy(); throw privateError(); }
            return redirect.apply(this, args);
        };
    } });
    await heroViews(f);
    const form = await f.request('/admin/hero-image'), id = heroForm(form.text), csrf = heroForm(form.text, '_csrf');
    const bytes = await sharp({ create: { width: 120, height: 60, channels: 3, background: '#246842' } }).png().toBuffer();
    await assert.rejects(f.request('/admin/hero-image/upload', { method: 'POST', body: heroBody(id, csrf, bytes) }), error => error instanceof TypeError);
    loseResponse = false;
    const status = JSON.parse((await f.request('/admin/hero-image/operations/' + id)).text);
    assert.equal(status.state, 'accepted'); assert.equal(status.revision, 1);
    const retry = await f.request('/admin/hero-image/upload', { method: 'POST', body: heroBody(id, csrf, bytes) });
    assert.equal(retry.status, 302);
    assert.equal(JSON.parse((await f.request('/admin/hero-image/operations/' + id)).text).revision, 1);
    f.bounded();
});

test('FFG reset response failure reports accepted and retries cannot reset a newer publication', async t => {
    let failReset = true;
    const f = await fixture(t, 'ffg', { decorateRequest(req) {
        if (req.originalUrl !== '/admin/hero-image/reset') return;
        const redirect = req.res.redirect;
        req.res.redirect = function (...args) {
            if (failReset) throw privateError();
            return redirect.apply(this, args);
        };
    } });
    await heroViews(f);
    const form = await f.request('/admin/hero-image'), id = heroForm(form.text), csrf = heroForm(form.text, '_csrf');
    const bytes = await sharp({ create: { width: 120, height: 60, channels: 3, background: '#246842' } }).png().toBuffer();
    assert.equal((await f.request('/admin/hero-image/upload', { method: 'POST', body: heroBody(id, csrf, bytes) })).status, 302);
    const selected = await f.request('/admin/hero-image');
    const resetId = heroForm(selected.text.slice(selected.text.indexOf('<form action="/admin/hero-image/reset"')));
    const resetBody = () => new URLSearchParams({ _csrf: csrf, heroOperationId: resetId });
    const reset = await f.request('/admin/hero-image/reset', { method: 'POST', body: resetBody() });
    assert.equal(reset.status, 503); assert.equal(JSON.parse(reset.text).state, 'accepted');
    failReset = false;
    const nextId = heroForm((await f.request('/admin/hero-image')).text);
    assert.equal((await f.request('/admin/hero-image/upload', { method: 'POST', body: heroBody(nextId, csrf, bytes) })).status, 302);
    assert.equal((await f.request('/admin/hero-image/reset', { method: 'POST', body: resetBody() })).status, 302);
    const current = JSON.parse(await fs.readFile(path.join(f.uploadsPath, 'hero', '.current.json')));
    assert.equal(current.current.generation, nextId); assert.equal(current.revision, 3);
    assert.equal((await f.request(`/uploads/hero/m1-${id}/current-hero.webp`)).status, 200);
    f.bounded();
});

test('FFG local Chromium submits the real hero form and preserves historical URLs through reset', async t => {
    const f = await fixture(t, 'ffg'); await heroViews(f);
    await f.request('/__synthetic/csrf');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ extraHTTPHeaders: { cookie: f.cookie(), 'x-forwarded-proto': 'https' } });
        await page.goto(f.baseURL + '/admin/hero-image');
        const id = await page.locator('form.hero-upload-form input[name="heroOperationId"]').inputValue();
        const bytes = await sharp({ create: { width: 120, height: 60, channels: 3, background: '#246842' } }).png().toBuffer();
        await page.locator('input[name="heroImage"]').setInputFiles({ name: 'synthetic.png', buffer: bytes, mimeType: 'image/png' });
        await Promise.all([page.waitForNavigation(), page.locator('form.hero-upload-form').evaluate(form => form.requestSubmit())]);
        assert.equal(new URL(page.url()).pathname, '/admin/hero-image');
        assert.equal(await page.locator('.hero-preview img').getAttribute('src'), `/uploads/hero/m1-${id}/current-hero.webp`);
        for (const [url, selector] of [['/', '.hero-image'], ['/about', '.about-image']]) {
            const response = await page.goto(f.baseURL + url); assert.equal(response.status(), 200);
            assert.equal(await page.locator(selector).getAttribute('src'), `/uploads/hero/m1-${id}/current-hero.webp`);
            assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'), f.baseURL.replace(/^http:/, 'https:') + `/uploads/hero/m1-${id}/current-hero-og.webp`);
        }
        await page.goto(f.baseURL + '/admin/hero-image');
        await Promise.all([page.waitForNavigation(), page.locator('form.hero-reset-form').evaluate(form => form.requestSubmit())]);
        assert.equal(await page.locator('.hero-preview img').getAttribute('src'), '/images/HeroCamp.webp');
        assert.equal((await f.request(`/uploads/hero/m1-${id}/current-hero.webp`)).status, 200);
        f.bounded();
    } finally { await browser.close(); }
});

test('FFG actual hero upload error retains redirect and bounded diagnostic', async t => {
    const f = await fixture(t, 'ffg');
    // Supply the upload callback's controlled error; do not change hero processing/selection.
    f.app.locals.upload = { single: () => (req, res, done) => done(privateError()) };
    const result = await f.request('/admin/hero-image/upload', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=synthetic' } });
    assert.equal(result.status, 302); assert.equal(result.location, '/admin/hero-image');
    assert.ok(f.records.some(row => row.message === 'Administrative action failed'));
    f.bounded();
});

test('FFG real multipart rejection cannot log an unexpected private field or filename', async t => {
    const f = await fixture(t, 'ffg');
    const csrf = JSON.parse((await f.request('/__synthetic/csrf')).text).csrf;
    const body = new FormData(); body.append('_csrf', csrf);
    body.append('SYNTHETIC_ERROR_TOKEN', new Blob([privateText]), 'SYNTHETIC_ERROR_FILENAME.png');
    const result = await f.request('/admin/hero-image/upload', { method: 'POST', body });
    assert.equal(result.status, 302); assert.equal(result.location, '/admin/hero-image');
    assert.ok(f.records.some(row => row.errorName === 'MulterError' && row.errorCode === 'LIMIT_UNEXPECTED_FILE'));
    f.bounded();
});

test('session-save callback error is bounded without changing the response', async t => {
    const f = await fixture(t, 'tta');
    // Fail one real session INSERT while leaving reads and the response path available.
    f.db.exec(`CREATE TABLE synthetic_session_failure_once(flag INTEGER);
        CREATE TRIGGER synthetic_session_failure BEFORE INSERT ON sessions
        WHEN NOT EXISTS(SELECT 1 FROM synthetic_session_failure_once)
        BEGIN INSERT INTO synthetic_session_failure_once VALUES(1); SELECT RAISE(FAIL, '${privateText}'); END`);
    const result = await f.request('/health');
    assert.equal(result.status, 200);
    assert.ok(f.records.some(row => row.message === 'Session persistence failed'));
    f.bounded();
});

test('existing session expiry timer retains its query and bounded failure handling', async t => {
    const f = await fixture(t, 'tta');
    f.db.prepare("INSERT INTO sessions(sid,sess,expire) VALUES('synthetic-expired','{}','2000-01-01')").run();
    f.db.prepare("INSERT INTO sessions(sid,sess,expire) VALUES('synthetic-future','{}','2999-01-01')").run();
    f.tickSessions();
    assert.equal(f.db.prepare("SELECT count(*) n FROM sessions WHERE sid='synthetic-expired'").get().n, 0);
    assert.equal(f.db.prepare("SELECT count(*) n FROM sessions WHERE sid='synthetic-future'").get().n, 1);
    f.db.prepare("INSERT INTO sessions(sid,sess,expire) VALUES('synthetic-expired','{}','2000-01-01')").run();
    f.db.exec(`CREATE TRIGGER synthetic_expiry_error BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, '${privateText}'); END`);
    f.tickSessions();
    assert.ok(f.records.some(row => row.message === 'Session persistence failed'));
    f.bounded();
});

for (const site of ['ffg', 'tta']) for (const [name, trustedIPs, elevated] of [
    ['missing', undefined, false], ['empty', '', false], ['whitespace', '  ', false],
    ['explicit valid', '192.0.2.22', true],
    ['matching entry before malformed entry', '192.0.2.22,SYNTHETIC_ERROR_TOKEN*[', false]
]) {
    test(`${site}: rate-limit startup and requests with ${name} trusted configuration`, async t => {
        const f = await fixture(t, site, { trustedIPs, ordinaryLimit: 3 });
        const initialDiagnostics = f.records.length;
        assert.equal(initialDiagnostics, name.includes('malformed') ? 1 : 0);
        for (let i = 0; i < 4; i++) {
            const result = await f.request('/health', { headers: { 'x-forwarded-for': '192.0.2.22' } });
            assert.equal(result.headers.get('ratelimit-limit'), elevated ? '10000' : '3');
            assert.equal(result.status, elevated || i < 3 ? 200 : 429);
        }
        // A distinct nonmatching synthetic client always receives ordinary limits.
        const other = await f.request('/health', { headers: { 'x-forwarded-for': '198.51.100.22' } });
        assert.equal(other.status, 200); assert.equal(other.headers.get('ratelimit-limit'), '3');
        const diagnostic = await f.request('/debug-ip', { headers: {
            'x-forwarded-for': elevated ? '192.0.2.22' : '192.0.2.24' } });
        assert.equal(diagnostic.status, 200);
        const data = JSON.parse(diagnostic.text);
        assert.equal(data['is-trusted'], elevated);
        assert.equal(Object.hasOwn(data, 'trusted-ips'), false, 'The diagnostic endpoint must not disclose the configured list');
        assert.equal(diagnostic.text.includes('SYNTHETIC_ERROR_TOKEN'), false);
        // Startup compilation is a deliberate snapshot; request-time environment
        // mutation cannot activate a partially compiled or newly supplied list.
        process.env.TRUSTED_IPS = '198.51.100.22';
        const after = await f.request('/health', { headers: { 'x-forwarded-for': '198.51.100.22' } });
        assert.equal(after.headers.get('ratelimit-limit'), '3');
        assert.equal(f.records.length, initialDiagnostics, 'Requests never recompile or repeat configuration diagnostics');
        f.bounded();
    });
}

for (const site of ['ffg', 'tta']) {
    test(`${site}: actual login, session authentication and CSRF remain intact`, async t => {
        const f = await fixture(t, site, { authenticated: false, registerRoutes(app) {
            app.get('/__synthetic/identity', (req, res) => res.json({ id: req.user?.id ?? null }));
        } });
        const username = 'synthetic-login', password = 'SYNTHETIC_ERROR_PASSWORD';
        const userId = Number(User.create(username, password, 'admin').lastInsertRowid);
        const unauthenticated = await f.request('/admin');
        assert.equal(unauthenticated.status, 302); assert.equal(unauthenticated.location, '/login');
        const csrf = JSON.parse((await f.request('/__synthetic/csrf')).text).csrf;
        const login = await f.request('/login', { method: 'POST',
            body: new URLSearchParams({ _csrf: csrf, username, password }) });
        assert.equal(login.status, 302); assert.equal(login.location, '/admin');
        assert.equal(JSON.parse((await f.request('/__synthetic/identity')).text).id, userId);
        const admin = await f.request('/admin');
        assert.equal(admin.status, 302); assert.equal(admin.location, '/admin/dashboard');
        f.bounded();
        // Existing fixed CSRF warnings are outside the exception diagnostic sink.
        const forbidden = await f.request('/logout', { method: 'POST', body: new URLSearchParams() });
        assert.equal(forbidden.status, 403);
        assert.equal(JSON.parse((await f.request('/__synthetic/identity')).text).id, userId);
        assert.equal(f.records.length, 0);
        assert.equal(f.diagnostics.join('\n').includes(password), false);
        const logout = await f.request('/logout', { method: 'POST', body: new URLSearchParams({ _csrf: csrf }) });
        assert.equal(logout.status, 302); assert.equal(logout.location, '/');
        assert.equal(JSON.parse((await f.request('/__synthetic/identity')).text).id, null);
    });

    test(`${site}: rejected values reach the real final handler while explicit routing remains intact`, async t => {
        let rejection = privateError;
        const forwarded = [], unhandled = [];
        const onUnhandled = value => unhandled.push(value);
        process.on('unhandledRejection', onUnhandled);
        t.after(() => process.off('unhandledRejection', onUnhandled));
        const f = await fixture(t, site, { ordinaryLimit: 1000, registerRoutes(app) {
            const track = handler => (req, res, next) => asyncHandler(handler)(req, res, (...args) => {
                forwarded.push(args); return next(...args);
            });
            app.get('/__synthetic/rejection', track(async () => { throw rejection(); }));
            app.get('/__synthetic/sync-throw', track(() => { throw privateError(); }));
            app.get('/__synthetic/resolved', track(async (req, res) => { res.send('resolved'); }));
            app.get('/__synthetic/headers-error', track(async (req, res) => {
                res.write('partial response'); res.flushHeaders();
                await delay(10);
                throw rejection();
            }));
            const router = express.Router();
            router.get('/route', track(async (req, res, next) => next('route')),
                () => assert.fail('Explicit route control must skip this handler'));
            router.get('/route', (req, res) => res.send('next route'));
            router.get('/router', track(async (req, res, next) => next('router')));
            router.use(() => assert.fail('Explicit router control must leave this router'));
            app.use('/__synthetic/control', router);
            app.get('/__synthetic/control/router', (req, res) => res.send('outside router'));
            app.get('/__synthetic/callback-race', track(async (req, res, next) => {
                next(privateError()); await delay(5); throw privateError();
            }));
        } });
        const cases = [
            ['undefined', () => undefined], ['null', () => null], ['false', () => false],
            ['zero', () => 0], ['empty string', () => ''], ['route', () => 'route'],
            ['router', () => 'router'], ['ordinary Error', privateError],
            ['truthy private object', () => ({ message: privateText, stack: privateText, body: privateText })],
            ['throwing getters', () => Object.defineProperties({}, Object.fromEntries(
                ['name', 'code', 'message', 'stack', 'toString', 'toJSON'].map(key =>
                    [key, { get() { throw new Error(privateText); } }])))],
            ['revoked proxy', () => { const p = Proxy.revocable({}, {}); p.revoke(); return p.proxy; }]
        ];
        for (const [name, create] of cases) await t.test(name, async () => {
            rejection = create;
            const before = f.records.length, calls = forwarded.length;
            const response = await f.request('/__synthetic/rejection', { signal: AbortSignal.timeout(3000) });
            assert.equal(response.status, 500); assert.equal(response.text, '500');
            assert.equal(forwarded.length, calls + 1);
            assert.equal(f.records.length, before + 1);
            assert.equal(f.records.at(-1).message, 'Global Error Handler');
            f.bounded();
        });
        await t.test('synchronous Error and callback/rejection race each log once', async () => {
            for (const path of ['/__synthetic/sync-throw', '/__synthetic/callback-race']) {
                const before = f.records.length, calls = forwarded.length;
                assert.equal((await f.request(path, { signal: AbortSignal.timeout(3000) })).status, 500);
                await delay(10);
                assert.equal(forwarded.length, calls + 1);
                assert.equal(f.records.length, before + 1);
                f.bounded();
            }
        });
        await t.test('resolved handlers and explicit routing preserve successful HTTP behavior', async () => {
            const before = f.records.length;
            for (const [path, text] of [['resolved', 'resolved'], ['control/route', 'next route'],
                ['control/router', 'outside router']]) {
                const response = await f.request('/__synthetic/' + path, { signal: AbortSignal.timeout(3000) });
                assert.equal(response.status, 200); assert.equal(response.text, text);
            }
            assert.equal((await f.request('/health')).status, 200);
            assert.equal((await f.request('/missing')).status, 404);
            assert.equal(f.records.length, before);
            assert.throws(() => f.setupFinalHandlers(), /already finalized/);
        });
        await t.test('failure after headers closes HTTP response with one bounded diagnostic', async () => {
            rejection = () => 'route';
            const before = f.records.length, calls = forwarded.length;
            await assert.rejects(f.request('/__synthetic/headers-error', { signal: AbortSignal.timeout(3000) }),
                error => error instanceof TypeError);
            assert.equal(forwarded.length, calls + 1);
            assert.equal(f.records.length, before + 1);
            f.bounded();
        });
        await delay(10);
        assert.equal(unhandled.length, 0);
    });
}
