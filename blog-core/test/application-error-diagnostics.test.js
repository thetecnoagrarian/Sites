import assert from 'node:assert/strict';
import test from 'node:test';
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

const sentinels = ['ARTICLE', 'PENDING', 'CAPTION', 'PASSWORD', 'COOKIE', 'CSRF', 'TOKEN', 'QUERY', 'FILENAME', 'FILE_CONTENT'];
const privateText = sentinels.map(value => `SYNTHETIC_ERROR_${value}`).join('|');
function privateError() {
    const error = new Error(privateText);
    error.stack = privateText; error.body = privateText; error.pending_input = privateText;
    error.cookie = privateText; error.code = 'SQLITE_CONSTRAINT_TRIGGER';
    error.toJSON = () => ({ privateText });
    return error;
}

async function fixture(t, site, { trustedIPs, ordinaryLimit } = {}) {
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
    try { application = createBlogApp({ siteName: site, databasePath: path.join(root, 'synthetic.db'),
        publicPath, uploadsPath, viewsPath, baseUrl: 'https://example.invalid' }); }
    finally { globalThis.setInterval = nativeInterval; }
    const { app, setupFinalHandlers } = application, db = getDatabase();
    const owner = Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES('synthetic','synthetic','admin')").run().lastInsertRowid);
    app.set('view options', { layout: false });
    app.use((req, res, next) => {
        req.session.userId = owner; req.user = { id: owner, role: 'admin' };
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
