import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { formatWithOptions } from 'node:util';
import express from 'express';
import sharp from 'sharp';
import { initializeDatabase } from '../src/database/init.js';
import { setDatabase } from '../src/models/db.js';
import PublicPerson from '../src/models/public-person.js';
import Post from '../src/models/post.js';
import { createEditorialService } from '../src/models/editorial-service.js';
import { allocateMediaOperation, createPostMediaGrantProvider, readPendingOverwrite } from '../src/models/media-publication.js';
import { mountMediaServing } from '../src/middleware/media-serving.js';
import { createUploadMiddleware, cleanupOwnedUploads } from '../src/middleware/upload.js';
import { ownedUploadDirectory, reserveUploadFilename, recordOwnedUpload,
    removeOwnedUpload } from '../src/middleware/owned-upload.js';
import ffgAdmin from '../../fruitionforestgarden/src/routes/admin.js';
import ttaAdmin from '../../thetecnoagrarian/src/routes/admin.js';
import logger from '../src/utils/logger.js';
import { allocateHeroOperation, createHeroPublicationProvider, managedGenerationPath } from '../../fruitionforestgarden/src/utils/heroImageStore.js';

const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const image = { thumbnail: '/uploads/old-thumbnail.webp', medium: '/uploads/old-medium.webp',
    large: '/uploads/old-large.webp' };
const gallery = { version: 1, items: [{ id: 'abcdefab-1234-4234-8234-123456789abc',
    asset: image, alt: 'Synthetic documentary detail', caption: 'Context' }] };

async function observeRouteCleanup(req, { timeoutMs = 2000 } = {}) {
    const files = req.files ?? (req.file ? [req.file] : []);
    const directories = [...new Set(files.filter(file => file.path)
        .map(file => path.dirname(file.path)))];
    const deadline = performance.now() + timeoutMs;
    while (true) {
        const remaining = [];
        for (const directory of directories) {
            try { remaining.push(`${directory}: ${JSON.stringify(await fs.readdir(directory))}`); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        if (!remaining.length) return;
        const timeLeft = deadline - performance.now();
        assert.ok(timeLeft > 0, `Route cleanup timed out after ${timeoutMs}ms for ${req.method} ${req.originalUrl}; remaining ${remaining.join('; ')}`);
        await delay(Math.min(10, timeLeft));
    }
}

async function fixture(t, site = 'ffg', { beforeVerify, fileSize, omitCleanupRoute = false } = {}) {
    const directory = mkdtempSync(path.join(tmpdir(), 'sites-media-'));
    let db;
    let server;
    t.after(async () => {
        try {
            if (server?.listening) await new Promise(resolve => server.close(resolve));
        } finally {
            try { db?.close(); }
            finally {
                setDatabase(null);
                rmSync(directory, { recursive: true, force: true });
                await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
            }
        }
    });
    const uploads = path.join(directory, 'uploads');
    mkdirSync(uploads);
    db = initializeDatabase(path.join(directory, 'synthetic.db'));
    setDatabase(db);
    const userId = Number(db.prepare(`INSERT INTO users (username, password_hash, role)
        VALUES ('synthetic-admin', 'synthetic', 'admin')`).run().lastInsertRowid);
    const person = PublicPerson.create({ publicKey: 'synthetic', displayName: 'Synthetic Writer' });
    const service = createEditorialService();
    const input = (content = {}) => ({ content: { title: 'Synthetic Post', body: 'Body',
        description: '', excerpt: '', images: [], captions: [], created_at: '2020-01-01', ...content },
    authorIds: [person.id], publisherId: person.id, loginUserId: userId, categoryIds: [] });
    const session = { userId };
    const messages = [];
    const requests = new Map();
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.locals.uploadsPath = uploads;
    app.locals.upload = createUploadMiddleware(path.join(uploads, 'temp'));
    if (fileSize) app.locals.upload.limits.fileSize = fileSize;
    app.use((req, res, next) => {
        const requestId = req.get('x-test-request-id');
        if (requests.has(requestId)) {
            assert.equal(requests.get(requestId), null, 'Test request ID was reused');
            requests.set(requestId, req);
        }
        req.session = req.headers['x-no-session'] ? {} : session;
        req.user = { id: userId, role: 'admin' };
        req.flash = (type, message) => { if (message) messages.push({ type, message }); return []; };
        req.verifyCsrfToken = token => { beforeVerify?.(req); return token === 'synthetic-csrf'; };
        next();
    });
    if (omitCleanupRoute) {
        // Negative control only: real Multer upload, deliberately no route cleanup.
        app.post('/admin/__test__/without-cleanup', app.locals.upload.single('image'),
            (req, res) => res.sendStatus(204));
    }
    app.use('/admin', site === 'ffg' ? ffgAdmin : ttaAdmin);
    const publicPath = path.join(directory, 'public');
    mkdirSync(publicPath);
    const hero = site === 'ffg' ? createHeroPublicationProvider(uploads) : null;
    mountMediaServing(app, { publicPath, uploadsPath: uploads,
        publicationProviders: { post: createPostMediaGrantProvider(db), ...(hero ? { hero: hero.authorize } : {}) },
        publicationIntegrityVerifiers: hero ? { hero: hero.verifyOpenedFile } : {} });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const png = await sharp({ create: { width: 64, height: 48, channels: 3,
        background: { r: 30, g: 120, b: 60 } } }).png().toBuffer();
    const fields = postId => ({ _csrf: 'synthetic-csrf', title: 'Synthetic Post', body: 'Body',
        mediaOperationId: allocateMediaOperation(db, userId, postId ? 'update' : 'create', postId ?? null),
        description: '', excerpt: '', created_at: '2020-01-01',
        'authorIds[]': String(person.id), 'authorPositions[]': '1',
        publisherId: String(person.id), ...(postId ? { revisionToken: service.snapshot(postId).revisionToken } : {}) });
    const post = async (route, values, withImage = false, headers = {}) => {
        let body;
        if (withImage) {
            body = new FormData();
            for (const [key, value] of Object.entries(values)) body.append(key, value);
            body.append(typeof withImage === 'string' ? withImage : 'image',
                new Blob([png], { type: 'image/png' }), 'new-photo.png');
        } else body = new URLSearchParams(values);
        const requestId = randomUUID();
        const requestHeaders = new Headers(headers);
        requestHeaders.set('x-test-request-id', requestId);
        requests.set(requestId, null);
        try {
            const response = await fetch(`${baseUrl}/admin${route}`, { method: 'POST', body,
                redirect: 'manual', headers: requestHeaders });
            await response.text();
            const req = requests.get(requestId);
            assert.ok(req, `Request ${requestId} was not captured for POST ${route}`);
            return { response, req, waitForCleanup: options => observeRouteCleanup(req, options) };
        } finally { requests.delete(requestId); }
    };
    const oldFiles = Object.values(image).map(url => path.join(uploads, path.basename(url)));
    for (const file of oldFiles) writeFileSync(file, 'synthetic committed media');
    const oldHashes = oldFiles.map(hash);
    const assertRetained = () => assert.deepEqual(oldFiles.map(hash), oldHashes);
    const fixtureFile = url => {
        const match = /^\/uploads\/m1-([0-9a-f-]{36})-(thumbnail|medium|large)\.webp$/.exec(url);
        return match ? path.join(uploads, '.media', 'post', match[1], path.basename(url)) : path.join(uploads, path.basename(url));
    };
    return { directory, uploads, db, service, input, session, messages, fields, post,
        oldFiles, assertRetained, baseUrl, png, fixtureFile };
}

test('cleanup observer detects omitted route cleanup without removing fixture uploads', async t => {
    const f = await fixture(t, 'ffg', { omitCleanupRoute: true });
    const result = await f.post('/__test__/without-cleanup', {}, true);
    assert.equal(result.response.status, 204);
    const { path: rawPath } = result.req.file;
    assert.deepEqual(await fs.readFile(rawPath), f.png);
    await assert.rejects(result.waitForCleanup({ timeoutMs: 50 }), error => {
        assert.equal(error.code, 'ERR_ASSERTION');
        assert.match(error.message, /Route cleanup timed out.*POST \/admin\/__test__\/without-cleanup/);
        assert.ok(error.message.includes(path.dirname(rawPath)));
        assert.ok(error.message.includes(path.basename(rawPath)));
        return true;
    });
    // The timeout assertion must not repair the deliberately omitted cleanup.
    assert.deepEqual(await fs.readFile(rawPath), f.png);
    assert.deepEqual(await fs.readdir(path.dirname(rawPath)), [path.basename(rawPath)]);
});

test('concurrent HTTP uploads correlate each response with its own request and cleanup', async t => {
    const f = await fixture(t);
    const titles = ['Concurrent first', 'Concurrent second'];
    const results = await Promise.all(titles.map(title => f.post('/dashboard/posts/create',
        { ...f.fields(), title }, true)));
    assert.notEqual(results[0].req, results[1].req);
    assert.notEqual(results[0].req.get('x-test-request-id'), results[1].req.get('x-test-request-id'));
    assert.notEqual(path.dirname(results[0].req.files[0].path), path.dirname(results[1].req.files[0].path));
    for (const [index, result] of results.entries()) {
        assert.equal(result.response.status, 302);
        assert.equal(result.req.body.title, titles[index]);
        await result.waitForCleanup();
    }
    assert.equal(Post.count, 2);
    assert.deepEqual(await fs.readdir(path.join(f.uploads, 'temp')), []);
});

for (const reference of ['none', 'another post', 'gallery', 'raw HTML', 'unsaved draft']) {
    test(`actual highlight replacement retains committed media with reference: ${reference}`, async t => {
        const f = await fixture(t);
        const content = { images: [image], captions: ['Old'] };
        if (reference === 'gallery') content.body_gallery = gallery;
        if (reference === 'raw HTML') content.body = `<img src="${image.large}">`;
        const id = f.service.create(f.input(content));
        if (reference === 'another post') f.service.create(f.input({ title: 'Other Post', images: [image], captions: ['Shared'] }));
        const draft = reference === 'unsaved draft' ? structuredClone(image) : null;
        const result = await f.post(`/dashboard/posts/${id}/update`, {
            ...f.fields(id), body: content.body || 'Body' }, true);
        assert.equal(result.response.status, 302);
        assert.ok(f.messages.some(message => message.type === 'success'));
        f.assertRetained();
        assert.notDeepEqual(Post.findById(id).images, [image]);
        if (reference === 'gallery') assert.deepEqual(Post.findById(id).body_gallery, gallery);
        if (draft) assert.equal(draft.large, image.large);
        for (const url of Object.values(Post.findById(id).images[0]).filter(value => typeof value === 'string')) {
            assert.ok(readFileSync(f.fixtureFile(url)).length > 0);
        }
        await result.waitForCleanup();
        assert.deepEqual(await fs.readdir(path.join(f.uploads, 'temp')), []);
    });
}

test('removing the last highlights/gallery associations retains committed media', async t => {
    const f = await fixture(t);
    const id = f.service.create(f.input({ images: [image], captions: ['Old'], body_gallery: gallery }));
    f.service.update(id, { ...f.input({ images: [], captions: [], body_gallery: null }),
        revisionToken: f.service.snapshot(id).revisionToken });
    assert.deepEqual(Post.findById(id).images, []);
    assert.equal(Post.findById(id).body_gallery, null);
    f.assertRetained();
});

for (const site of ['ffg', 'tta']) {
    test(`${site} actual post deletion retains media and preserves authorization`, async t => {
        const f = await fixture(t, site);
        const id = f.service.create(f.input({ images: [image], captions: ['Old'], body_gallery: gallery }));
        f.service.update(id, { ...f.input({ images: [image], captions: ['Old'], body_gallery: gallery }),
            revisionToken: f.service.snapshot(id).revisionToken,
            authorshipAction: 'review', authorshipReviewState: 'verified' });
        const refused = await f.post(`/dashboard/posts/${id}/delete`, {}, false, { 'x-no-session': '1' });
        assert.equal(refused.response.headers.get('location'), '/login');
        assert.ok(Post.findById(id));
        f.assertRetained();
        const result = await f.post(`/dashboard/posts/${id}/delete`, {});
        assert.equal(result.response.status, 302);
        assert.equal(Post.findById(id), undefined);
        f.assertRetained();
    });
}

test('failed post deletion rolls back category removal and retains media', async t => {
    const f = await fixture(t);
    const id = f.service.create(f.input({ images: [image], captions: ['Old'] }));
    const category = f.db.prepare(`INSERT INTO categories (name, slug) VALUES ('Synthetic', 'synthetic')`).run();
    Post.addCategory(id, Number(category.lastInsertRowid));
    f.db.exec(`CREATE TRIGGER synthetic_delete_failure BEFORE DELETE ON posts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;`);
    await f.post(`/dashboard/posts/${id}/delete`, {});
    assert.ok(Post.findById(id));
    assert.equal(Post.getCategories(id).length, 1);
    f.assertRetained();
});

test('FFG overwrite, pending replacement and cancellation retain old and pending derivatives', async t => {
    const f = await fixture(t);
    const id = f.service.create(f.input({ images: [image], captions: ['Old'] }));
    const first = await f.post('/dashboard/posts/create', f.fields(), true);
    const pendingId = new URL(first.response.headers.get('location'), f.baseUrl).searchParams.get('mediaOperationId');
    assert.ok(pendingId);
    await first.waitForCleanup();
    const pendingFiles = Object.values(readPendingOverwrite(f.db, pendingId, f.session.userId).input.content.images[0])
        .filter(value => typeof value === 'string').map(f.fixtureFile);
    const replacement = await f.post('/dashboard/posts/create', f.fields(), true);
    await replacement.waitForCleanup();
    for (const file of pendingFiles) assert.ok(readFileSync(file).length);
    // Legacy session cleanup paths must never confer deletion authority.
    f.session.pendingEditorialOverwrite = { operationId: pendingId, generated: f.oldFiles };
    await f.post('/posts/confirm-overwrite', { action: 'cancel', mediaOperationId: pendingId });
    f.assertRetained();
    for (const file of pendingFiles) assert.ok(readFileSync(file).length);
    const accepted = await f.post('/dashboard/posts/create', f.fields(), true);
    await accepted.waitForCleanup();
    const acceptedId = new URL(accepted.response.headers.get('location'), f.baseUrl).searchParams.get('mediaOperationId');
    await f.post('/posts/confirm-overwrite', { action: 'overwrite', mediaOperationId: acceptedId });
    assert.notDeepEqual(Post.findById(id).images, [image]);
    f.assertRetained();
});

for (const site of ['ffg', 'tta']) {
    test(`${site} active post-deletion catch emits safe diagnostics and retains the post/media`, async t => {
        const f = await fixture(t, site);
        const id = f.service.create(f.input({ body: 'SYNTHETIC_DELETE_ARTICLE', images: [image], captions: ['SYNTHETIC_DELETE_CAPTION'] }));
        const before = f.service.snapshot(id);
        f.db.exec(`CREATE TRIGGER synthetic_private_delete BEFORE DELETE ON posts
            BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_DELETE_PRIVATE_ERROR'); END`);
        const records = [], raw = [];
        const original = { error: logger.error, consoleError: console.error };
        logger.error = (data, message) => { records.push(data); raw.push(formatWithOptions({ colors: false }, data, message)); };
        console.error = (...args) => raw.push(formatWithOptions({ colors: false }, ...args));
        try {
            const result = await f.post(`/dashboard/posts/${id}/delete`, { _csrf: 'synthetic-csrf' });
            assert.equal(result.response.status, 302);
            assert.equal(result.response.headers.get('location'), '/admin/dashboard');
            assert.ok(records.some(row => row.route === 'editorial-delete' && row.errorCode === 'SQLITE_CONSTRAINT'));
            assert.doesNotMatch(raw.join('\n'), /SYNTHETIC_DELETE_(?:ARTICLE|CAPTION|PRIVATE_ERROR)/);
            assert.deepEqual(f.service.snapshot(id), before);
            f.assertRetained();
        } finally { logger.error = original.error; console.error = original.consoleError; }
    });
}

test('failed save and CSRF rejection clean owned raw input, retain uncertain outputs and leave committed files unchanged', async t => {
    const f = await fixture(t);
    const id = f.service.create(f.input({ images: [image], captions: ['Old'] }));
    const before = f.service.snapshot(id).revisionToken;
    const stale = await f.post(`/dashboard/posts/${id}/update`, { ...f.fields(id), revisionToken: 'stale' }, true);
    assert.equal(f.service.snapshot(id).revisionToken, before);
    await stale.waitForCleanup();
    assert.deepEqual(await fs.readdir(path.join(f.uploads, 'temp')), []);
    const csrf = await f.post(`/dashboard/posts/${id}/update`, { ...f.fields(id), _csrf: 'invalid' }, true);
    assert.equal(csrf.response.status, 403);
    f.assertRetained();
    await csrf.waitForCleanup();
    assert.deepEqual(await fs.readdir(path.join(f.uploads, 'temp')), []);
});

test('cleanup uncertainty does not convert a successful editorial save into failure', async t => {
    const f = await fixture(t, 'ffg', { beforeVerify: req => {
        if (req.files?.length) writeFileSync(path.join(path.dirname(req.files[0].path), 'unrecognized'), 'retain me');
    } });
    const id = f.service.create(f.input());
    const result = await f.post(`/dashboard/posts/${id}/update`, f.fields(id), true);
    assert.equal(result.response.status, 302);
    assert.equal(Post.findById(id).images.length, 1);
    assert.ok(f.messages.some(message => message.type === 'success'));
    assert.equal(readFileSync(path.join(path.dirname(result.req.files[0].path), 'unrecognized'), 'utf8'), 'retain me');
    await assert.rejects(result.waitForCleanup({ timeoutMs: 50 }), /Route cleanup timed out/);
});

test('existing upload MIME and byte-limit rejection safely clean any owned raw files', async t => {
    const f = await fixture(t, 'ffg', { fileSize: 1 });
    const result = await f.post('/dashboard/posts/create', f.fields(), true);
    assert.equal(result.response.status, 302);
    assert.equal(Post.count, 0);
    assert.ok(f.messages.some(message => message.type === 'error' && /limit/.test(message.message)));
    await result.waitForCleanup();
    assert.deepEqual(await fs.readdir(path.join(f.uploads, 'temp')), []);
    const form = new FormData();
    for (const [key, value] of Object.entries(f.fields())) form.append(key, value);
    form.append('image', new Blob(['synthetic'], { type: 'application/pdf' }), 'not-an-image.pdf');
    const response = await fetch(`${f.baseUrl}/admin/dashboard/posts/create`, {
        method: 'POST', body: form, redirect: 'manual' });
    await response.text();
    assert.equal(response.status, 302);
    assert.equal(Post.count, 0);
    assert.ok(f.messages.some(message => /Only image files/.test(message.message)));
});

test('TTA new-post upload remains functional and cleans only its private raw input', async t => {
    const f = await fixture(t, 'tta');
    const result = await f.post('/dashboard/posts/create', f.fields(), true);
    assert.equal(result.response.status, 302);
    assert.equal(Post.count, 1);
    const post = Post.findAll()[0];
    assert.equal(post.images.length, 1);
    assert.equal(post.body_gallery, null);
    assert.equal(post.publication_review_state, 'verified');
    for (const variant of ['thumbnail', 'medium', 'large']) {
        assert.ok(readFileSync(f.fixtureFile(post.images[0][variant])).length);
    }
    await result.waitForCleanup();
    assert.deepEqual(await fs.readdir(path.join(f.uploads, 'temp')), []);
    f.assertRetained();
});

test('actual FFG hero upload/reset retains generated media and source, cleaning only raw input', async t => {
    const f = await fixture(t);
    const operationId = await allocateHeroOperation(f.uploads, f.session.userId);
    const result = await f.post('/hero-image/upload', { _csrf: 'synthetic-csrf', heroOperationId: operationId }, 'heroImage');
    assert.equal(result.response.status, 302);
    const manifest = path.join(f.uploads, 'hero', '.current.json');
    const { current } = JSON.parse(await fs.readFile(manifest, 'utf8'));
    const generation = current.generation;
    const source = path.join(managedGenerationPath(f.uploads, generation), '.source', 'current-source.png');
    assert.deepEqual(await fs.readFile(source), f.png);
    await result.waitForCleanup();
    assert.deepEqual(await fs.readdir(path.join(f.uploads, 'temp')), []);
    const resetId = await allocateHeroOperation(f.uploads, f.session.userId, 'reset');
    await f.post('/hero-image/reset', { heroOperationId: resetId });
    const reset = JSON.parse(await fs.readFile(manifest, 'utf8'));
    assert.equal(reset.current, null); assert.ok(reset.publications[generation]);
    assert.deepEqual(await fs.readFile(source), f.png);
    assert.ok(await fs.readFile(path.join(managedGenerationPath(f.uploads, generation), 'current-hero.webp')));
    const historical = await fetch(`${f.baseUrl}/uploads/hero/m1-${generation}/current-hero.webp`);
    assert.equal(historical.status, 200); await historical.arrayBuffer();
    f.assertRetained();
});

test('request-owned raw files are private under the unchanged static serving policy', async t => {
    const f = await fixture(t);
    const req = {};
    const directory = await ownedUploadDirectory(req, path.join(f.uploads, 'temp'));
    const file = { filename: 'private.png', path: path.join(directory, 'private.png') };
    await reserveUploadFilename(req, file.filename);
    await fs.writeFile(file.path, f.png, { flag: 'wx' });
    await recordOwnedUpload(req, file);
    const relative = path.relative(f.uploads, file.path).split(path.sep).join('/');
    const response = await fetch(`${f.baseUrl}/uploads/${relative}`);
    await response.text();
    assert.equal(response.status, 404);
    assert.ok(await fs.readFile(file.path), 'privacy must not be explained by prior cleanup');
    assert.equal(await cleanupOwnedUploads(req), true);
});

async function ownedFixture(t) {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'sites-owned-upload-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const uploads = path.join(root, 'uploads');
    await fs.mkdir(uploads);
    const warnings = [];
    const logger = { warn: (...args) => warnings.push(args) };
    const make = async (req = {}) => {
        const directory = await ownedUploadDirectory(req, path.join(uploads, 'temp'));
        const file = { filename: 'input.png', path: path.join(directory, 'input.png') };
        await reserveUploadFilename(req, file.filename);
        await fs.writeFile(file.path, 'synthetic raw input', { flag: 'wx' });
        await recordOwnedUpload(req, file);
        return { req, directory, file };
    };
    return { root, uploads, warnings, logger, make };
}

test('concurrent request cleanup is isolated, idempotent and does not accept another operation path', async t => {
    const f = await ownedFixture(t);
    const first = await f.make();
    const second = await f.make();
    await assert.rejects(ownedUploadDirectory(first.req, path.join(f.root, 'different', 'temp')), /root changed/);
    assert.equal(await removeOwnedUpload(first.req, second.file, { logger: f.logger }), false);
    assert.ok(await fs.readFile(second.file.path));
    assert.deepEqual(await Promise.all([cleanupOwnedUploads(first.req), cleanupOwnedUploads(first.req)]), [true, true]);
    assert.ok(await fs.readFile(second.file.path));
    assert.equal(await cleanupOwnedUploads(second.req), true);
    assert.deepEqual(await fs.readdir(path.join(f.uploads, 'temp')), []);
});

test('uncertain paths, traversal and protected hero/source references never grant cleanup authority', async t => {
    const f = await ownedFixture(t);
    const protectedFile = path.join(f.uploads, 'hero', 'generation', '.source', 'source.jpg');
    await fs.mkdir(path.dirname(protectedFile), { recursive: true });
    await fs.writeFile(protectedFile, 'protected');
    const outside = path.join(f.root, 'outside.png');
    await fs.writeFile(outside, 'outside');
    for (const file of [protectedFile, outside, '../outside.png', '/uploads/old.webp']) {
        assert.equal(await cleanupOwnedUploads({ file: { path: file } }, { logger: f.logger }), false);
    }
    const own = await f.make();
    await assert.rejects(reserveUploadFilename(own.req, '../escape.png'), /Unsafe/);
    await assert.rejects(recordOwnedUpload(own.req, { filename: 'input.png', path: protectedFile }), /ownership/);
    assert.equal(await removeOwnedUpload(own.req, { filename: 'input.png', path: protectedFile }, { logger: f.logger }), false);
    assert.equal(await fs.readFile(protectedFile, 'utf8'), 'protected');
    assert.equal(await fs.readFile(outside, 'utf8'), 'outside');
    assert.ok(f.warnings.length);
});

for (const substitution of ['symlink', 'different inode', 'hardlink', 'directory symlink']) {
    test(`cleanup retains uncertain ${substitution} and preserves unrelated files`, async t => {
        const f = await ownedFixture(t);
        const own = await f.make();
        const protectedFile = path.join(f.root, 'protected.png');
        await fs.writeFile(protectedFile, 'protected');
        if (substitution === 'directory symlink') {
            await fs.rename(own.directory, `${own.directory}-preserved`);
            await fs.symlink(f.root, own.directory);
        } else {
            await fs.rename(own.file.path, path.join(f.root, 'original-input.png'));
            if (substitution === 'symlink') await fs.symlink(protectedFile, own.file.path);
            if (substitution === 'different inode') await fs.writeFile(own.file.path, 'unrelated replacement');
            if (substitution === 'hardlink') await fs.link(protectedFile, own.file.path);
        }
        assert.equal(await cleanupOwnedUploads(own.req, { logger: f.logger }), false);
        assert.equal(await fs.readFile(protectedFile, 'utf8'), 'protected');
        assert.ok(f.warnings.length);
    });
}

test('symlinked temporary root is rejected before uploading outside the intended root', async t => {
    const f = await ownedFixture(t);
    const outside = path.join(f.root, 'outside');
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(f.uploads, 'temp'));
    await assert.rejects(ownedUploadDirectory({}, path.join(f.uploads, 'temp')), /Unsafe temporary/);
    assert.deepEqual(await fs.readdir(outside), []);
});
