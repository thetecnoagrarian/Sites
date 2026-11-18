import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import sharp from 'sharp';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/database/init.js';
import { setDatabase } from '../src/models/db.js';
import PublicPerson from '../src/models/public-person.js';
import Post from '../src/models/post.js';
import { createEditorialService } from '../src/models/editorial-service.js';
import { allocateMediaOperation, readMediaOperation, prepareMediaOperation, markPendingOverwrite,
    verifyMediaAcceptance, cancelMediaOperation, createPostMediaProvider, mediaDigest } from '../src/models/media-publication.js';
import { preparePostCandidate, createPrivateCandidate, managedMediaUrl } from '../src/utils/private-media.js';
import { createUploadMiddleware } from '../src/middleware/upload.js';
import { ownedUploadDirectory, reserveUploadFilename, recordOwnedUpload } from '../src/middleware/owned-upload.js';
import { mountMediaServing } from '../src/middleware/media-serving.js';
import { processImage } from '../src/utils/imageProcessor.js';
import ffgAdmin from '../../fruitionforestgarden/src/routes/admin.js';
import ttaAdmin from '../../thetecnoagrarian/src/routes/admin.js';

const variants = ['thumbnail', 'medium', 'large'];
async function fixture(t, site = 'ffg') {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'sites-publication-'));
    let db;
    let server;
    t.after(async () => {
        try { if (server?.listening) await new Promise(resolve => server.close(resolve)); }
        finally { if (db?.open) db.close(); setDatabase(null); await fs.rm(root, { recursive: true, force: true }); }
    });
    const dbPath = path.join(root, 'synthetic.db');
    db = initializeDatabase(dbPath);
    setDatabase(db);
    const owner = Number(db.prepare(`INSERT INTO users(username,password_hash,role) VALUES ('synthetic-admin','synthetic','admin')`).run().lastInsertRowid);
    const other = Number(db.prepare(`INSERT INTO users(username,password_hash,role) VALUES ('synthetic-reader','synthetic','user')`).run().lastInsertRowid);
    const person = PublicPerson.create({ publicKey: 'synthetic-writer', displayName: 'Synthetic Writer' });
    const uploadsPath = path.join(root, 'public', 'uploads');
    const publicPath = path.dirname(uploadsPath);
    await fs.mkdir(uploadsPath, { recursive: true });
    const png = await sharp({ create: { width: 80, height: 120, channels: 3, background: '#34724f' } }).png().toBuffer();
    const rawReq = {};
    const raw = await ownedUploadDirectory(rawReq, path.join(uploadsPath, 'temp'));
    const inputPath = path.join(raw, 'synthetic.png');
    await reserveUploadFilename(rawReq, 'synthetic.png');
    await fs.writeFile(inputPath, png);
    await recordOwnedUpload(rawReq, { filename: 'synthetic.png', path: inputPath });
    const session = { userId: owner };
    const messages = [];
    const requests = new Map();
    const providers = { post: createPostMediaProvider(db) };
    const app = express();
    app.locals.uploadsPath = uploadsPath;
    app.locals.upload = createUploadMiddleware(path.join(uploadsPath, 'temp'));
    app.use(express.urlencoded({ extended: true }));
    mountMediaServing(app, { publicPath, uploadsPath, publicationProviders: providers, production: true });
    app.use((req, res, next) => {
        if (req.get('x-test-id')) requests.set(req.get('x-test-id'), req);
        req.session = req.get('x-anonymous') ? {} : req.get('x-reader') ? { userId: other } : session;
        req.user = { id: req.session.userId };
        req.flash = (type, message) => { if (message) messages.push({ type, message }); return []; };
        req.verifyCsrfToken = token => token === 'synthetic-csrf';
        req.csrfToken = () => 'synthetic-csrf';
        if (req.get('x-drop-response')) res.redirect = () => { res.destroy(); return res; };
        // Actual app's urlencoded CSRF check; multipart is checked by the real upload route.
        if (req.method === 'POST' && req.is('application/x-www-form-urlencoded') && !req.verifyCsrfToken(req.body._csrf)) return res.sendStatus(403);
        next();
    });
    app.use('/admin', site === 'ffg' ? ffgAdmin : ttaAdmin);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = (url, headers = {}) => new Promise((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port: server.address().port, path: url, headers }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => resolve({ status: res.statusCode, headers: new Headers(res.headers), body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.end();
    });
    const allocate = (action = 'create', postId = null) => allocateMediaOperation(db, owner, action, postId);
    const fields = (postId = null) => ({ _csrf: 'synthetic-csrf', mediaOperationId: allocate(postId ? 'update' : 'create', postId),
        title: 'Synthetic Post', body: 'Synthetic Body', created_at: '2020-01-01', description: '', excerpt: '',
        'authorIds[]': String(person.id), 'authorPositions[]': '1', publisherId: String(person.id),
        ...(postId ? { revisionToken: createEditorialService().snapshot(postId).revisionToken } : {}) });
    const post = async (url, values, count = 1, headers = {}) => {
        const id = randomUUID();
        let body = new URLSearchParams(values);
        if (count) {
            body = new FormData();
            for (const [key, value] of Object.entries(values)) body.append(key, value);
            for (let index = 0; index < count; index++) body.append('image', new Blob([png], { type: 'image/png' }), `synthetic-${index}.png`);
        }
        try {
            const response = await fetch(base + '/admin' + url, { method: 'POST', body,
                headers: { ...headers, 'x-test-id': id }, redirect: 'manual' });
            const text = await response.text();
            return { status: response.status, headers: response.headers, text };
        } finally {
            const req = requests.get(id);
            // Observe only. Never invoke cleanup on behalf of an application route.
            const directories = [...new Set((req?.files ?? []).filter(file => file.path).map(file => path.dirname(file.path)))];
            const deadline = performance.now() + 2000;
            for (const directory of directories) while (true) {
                try { await fs.stat(directory); }
                catch (error) { if (error.code === 'ENOENT') break; throw error; }
                assert.ok(performance.now() < deadline, `Route cleanup did not remove ${directory}`);
                await delay(10);
            }
            requests.delete(id);
        }
    };
    const input = (content = {}) => ({ content: { title: 'Synthetic Post', body: 'Synthetic Body', description: '', excerpt: '',
        created_at: '2020-01-01', images: [], captions: [], ...content }, authorIds: [person.id], publisherId: person.id,
        loginUserId: owner, categoryIds: [] });
    const prepare = async ({ action = 'create', postId = null, title = 'Synthetic Post' } = {}) => {
        const id = allocate(action, postId);
        const prepared = await preparePostCandidate({ uploadsPath, inputPath });
        const candidates = [{ id: prepared.candidate.id, image: prepared.image, files: prepared.files }];
        const value = input({ title, images: [prepared.image], captions: ['Synthetic caption'] });
        if (postId) value.revisionToken = createEditorialService().snapshot(postId).revisionToken;
        prepareMediaOperation(db, id, owner, mediaDigest(value), value, candidates);
        const token = await verifyMediaAcceptance({ db, uploadsPath, id, ownerId: owner, input: value, action, postId });
        return { id, input: { ...value, mediaAcceptance: token }, candidates };
    };
    const reopen = (options = {}) => {
        if (db.open) db.close();
        db = new Database(dbPath, options);
        db.pragma('foreign_keys = ON');
        setDatabase(db);
        providers.post = createPostMediaProvider(db);
    };
    return { root, dbPath, get db() { return db; }, uploadsPath, inputPath, png, app, owner, other, providers,
        messages, session, get, post, fields, input, allocate, prepare, reopen };
}
function operation(f, id) { return readMediaOperation(f.db, id, f.owner); }
async function privateCandidates(f, candidates) {
    for (const candidate of candidates) for (const variant of variants) {
        const denied = await f.get(candidate.image[variant]);
        assert.equal(denied.status, 404);
        assert.equal(denied.headers.get('cache-control'), 'no-store');
    }
}

for (const site of ['ffg', 'tta']) {
    test(`${site} active HTTP uploads publish only after acceptance and survive replacement/deletion`, async t => {
        const f = await fixture(t, site);
        let paused;
        let resume;
        const ready = new Promise(resolve => { paused = resolve; });
        const gate = new Promise(resolve => { resume = resolve; });
        f.app.locals.preparePostCandidate = options => preparePostCandidate({ ...options, onPhase: async (phase, candidate) => {
            if (phase === 'processed') { paused(candidate); await gate; }
        } });
        const values = f.fields();
        const response = f.post('/dashboard/posts/create', values);
        const candidate = await ready;
        try {
            await privateCandidates(f, [{ image: Object.fromEntries(variants.map(v => [v, managedMediaUrl('post', candidate.id, v)])) }]);
            assert.equal(Post.count, 0);
        } finally { resume(); }
        assert.equal((await response).status, 302);
        const accepted = operation(f, values.mediaOperationId);
        assert.equal(accepted.state, 'published');
        const publishedUrl = accepted.data.candidates[0].image.large;
        const served = await f.get(publishedUrl);
        assert.equal(served.status, 200);
        assert.match(served.headers.get('content-type'), /^image\/webp/);
        assert.equal((await f.get(publishedUrl, { 'If-None-Match': served.headers.get('etag') })).status, 304);
        const articleId = accepted.data.receipt.postId;
        delete f.app.locals.preparePostCandidate;
        const bodyOnly = { ...f.fields(articleId), body: 'Edited without another upload' };
        assert.equal((await f.post(`/dashboard/posts/${articleId}/update`, bodyOnly, 0)).status, 302);
        assert.equal(operation(f, bodyOnly.mediaOperationId).state, 'published');
        assert.equal(Post.findById(articleId).body, bodyOnly.body);
        assert.equal(Post.findById(articleId).images[0].large, publishedUrl);
        assert.equal((await f.post(`/dashboard/posts/${articleId}/update`, { ...f.fields(articleId), title: values.title })).status, 302);
        assert.equal((await f.get(publishedUrl)).status, 200);
        assert.equal((await f.post(`/dashboard/posts/${articleId}/delete`, { _csrf: 'synthetic-csrf' }, 0)).status, 302);
        assert.equal(Post.findById(articleId), undefined);
        assert.equal((await f.get(publishedUrl)).status, 200);
        assert.throws(() => f.db.prepare('DELETE FROM media_publications WHERE id = ?').run(accepted.id), /retained/);
        assert.throws(() => f.db.prepare("UPDATE media_publications SET data = '{}' WHERE id = ?").run(candidate.id), /immutable/);
    });
}

test('validation, stale revisions, CSRF and upload limits cannot create grants', async t => {
    const f = await fixture(t);
    const articleId = createEditorialService().create(f.input());
    for (const change of [{ title: '' }, { revisionToken: 'stale' }]) {
        const values = { ...f.fields(articleId), ...change };
        assert.equal((await f.post(`/dashboard/posts/${articleId}/update`, values)).status, 302);
        const rejected = operation(f, values.mediaOperationId);
        assert.equal(rejected.state, 'prepared');
        await privateCandidates(f, rejected.data.candidates);
    }
    const csrf = { ...f.fields(), _csrf: 'invalid' };
    assert.equal((await f.post('/dashboard/posts/create', csrf)).status, 403);
    assert.equal(operation(f, csrf.mediaOperationId).state, 'allocated');
    const limited = f.fields();
    f.app.locals.upload.limits.fileSize = 1;
    assert.equal((await f.post('/dashboard/posts/create', limited)).status, 302);
    assert.equal(operation(f, limited.mediaOperationId).state, 'allocated');
    assert.equal(f.db.prepare("SELECT count(*) n FROM media_publications WHERE record_type = 'asset'").get().n, 0);
    assert.equal(Post.count, 1);
});

test('anonymous/non-admin uploads cannot process candidates or acquire another owner operation', async t => {
    const f = await fixture(t);
    for (const headers of [{ 'x-anonymous': 'yes' }, { 'x-reader': 'yes' }]) {
        const values = f.fields();
        const result = await f.post('/dashboard/posts/create', values, 1, headers);
        assert.ok([302, 403].includes(result.status));
        assert.equal(operation(f, values.mediaOperationId).state, 'allocated');
    }
    await assert.rejects(fs.stat(path.join(f.uploadsPath, '.media')), { code: 'ENOENT' });
    const id = f.allocate();
    assert.throws(() => readMediaOperation(f.db, id, f.other), /another editor/);
});

test('partial multi-file processing retains only private residue with no partial grant', async t => {
    const f = await fixture(t);
    let count = 0;
    f.app.locals.preparePostCandidate = options => preparePostCandidate({ ...options, processor: async (...args) => {
        const image = await processImage(...args);
        if (++count === 2) throw new Error('Synthetic second-image failure');
        return image;
    } });
    const values = f.fields();
    await f.post('/dashboard/posts/create', values, 2);
    assert.equal(operation(f, values.mediaOperationId).state, 'allocated');
    const ids = await fs.readdir(path.join(f.uploadsPath, '.media', 'post'));
    assert.equal(ids.length, 2);
    await privateCandidates(f, ids.map(id => ({ image: Object.fromEntries(variants.map(v => [v, managedMediaUrl('post', id, v)])) })));
    assert.equal(Post.count, 0);
});

test('FFG cancellation and stale overwrite confirmations never publish prepared candidates', async t => {
    const f = await fixture(t);
    const postId = createEditorialService().create(f.input());
    const values = f.fields();
    await f.post('/dashboard/posts/create', values);
    assert.ok(operation(f, values.mediaOperationId).data.pending);
    const pending = operation(f, values.mediaOperationId).data.candidates;
    delete f.session.pendingEditorialOverwrite;
    assert.equal((await f.post('/dashboard/posts/create', values)).headers.get('location'),
        `/admin/posts/confirm-overwrite?mediaOperationId=${values.mediaOperationId}`);
    assert.equal(operation(f, values.mediaOperationId).data.pending.postId, postId);
    assert.equal(f.session.pendingEditorialOverwrite, undefined);
    const cancellation = { _csrf: 'synthetic-csrf', action: 'cancel', mediaOperationId: values.mediaOperationId };
    await f.post('/posts/confirm-overwrite', cancellation, 0);
    assert.equal(operation(f, values.mediaOperationId).state, 'cancelled');
    await f.post('/posts/confirm-overwrite', { ...cancellation, action: 'overwrite' }, 0);
    await privateCandidates(f, pending);
    const stale = f.fields();
    await f.post('/dashboard/posts/create', stale);
    createEditorialService().update(postId, { ...f.input({ title: 'Synthetic Post', body: 'Changed concurrently' }),
        revisionToken: createEditorialService().snapshot(postId).revisionToken });
    await f.post('/posts/confirm-overwrite', { _csrf: 'synthetic-csrf', action: 'overwrite', mediaOperationId: stale.mediaOperationId }, 0);
    assert.equal(operation(f, stale.mediaOperationId).state, 'prepared');
    await privateCandidates(f, operation(f, stale.mediaOperationId).data.candidates);
});

test('FFG accepted overwrite receipts survive session removal and preserve first publication', async t => {
    const f = await fixture(t);
    const postId = createEditorialService().create(f.input());
    const firstPublication = Post.findById(postId).published_at;
    const values = f.fields();
    await f.post('/dashboard/posts/create', values);
    const confirm = { _csrf: 'synthetic-csrf', mediaOperationId: values.mediaOperationId, action: 'overwrite' };
    assert.equal((await f.post('/posts/confirm-overwrite', confirm, 0)).status, 302);
    const receipt = operation(f, values.mediaOperationId);
    assert.equal(receipt.state, 'published');
    const revision = createEditorialService().snapshot(postId).revisionToken;
    assert.equal(f.session.pendingEditorialOverwrite, undefined);
    assert.equal((await f.post('/posts/confirm-overwrite', confirm, 0)).status, 302);
    await f.post('/posts/confirm-overwrite', { ...confirm, reopenAuthorship: 'yes' }, 0);
    await f.post('/posts/confirm-overwrite', { ...confirm, action: 'cancel' }, 0);
    assert.deepEqual(operation(f, values.mediaOperationId), receipt);
    assert.equal(createEditorialService().snapshot(postId).revisionToken, revision);
    assert.equal(Post.findById(postId).published_at, firstPublication);
    assert.equal((await f.get(receipt.data.candidates[0].image.large)).status, 200);
});

test('verified overwrite cannot change its revision or authorship-reopening confirmation', async t => {
    const f = await fixture(t);
    const postId = createEditorialService().create(f.input());
    const prepared = await f.prepare();
    delete prepared.input.mediaAcceptance;
    const revisionToken = createEditorialService().snapshot(postId).revisionToken;
    prepared.input.revisionToken = revisionToken;
    markPendingOverwrite(f.db, prepared.id, f.owner, { postId, revisionToken }, prepared.input);
    prepared.input.mediaAcceptance = await verifyMediaAcceptance({ db: f.db, uploadsPath: f.uploadsPath, id: prepared.id,
        ownerId: f.owner, input: prepared.input, action: 'overwrite', postId });
    assert.throws(() => createEditorialService().overwrite(postId, prepared.input,
        { revisionToken, reopenAuthorship: true }), /confirmation binding changed/);
    assert.throws(() => createEditorialService().overwrite(postId, prepared.input,
        { revisionToken: 'different' }), /confirmation binding changed/);
    assert.equal(operation(f, prepared.id).state, 'prepared');
    await privateCandidates(f, prepared.candidates);
});

for (const site of ['ffg', 'tta']) {
    test(`${site} exported update binds the persisted payload and cannot substitute publication input`, async t => {
        const f = await fixture(t, site);
        const service = createEditorialService();
        const postId = service.create(f.input());
        const before = service.snapshot(postId);
        const prepared = await f.prepare({ action: 'update', postId });
        const changed = { ...prepared.input, content: { ...prepared.input.content, body: 'Unverified B' } };
        const receiptBefore = operation(f, prepared.id);
        assert.throws(() => service.update(postId, changed, { publicationInput: prepared.input }),
            /Verified media acceptance/);
        assert.throws(() => service.update(postId, changed,
            { operationAction: 'overwrite', publicationInput: prepared.input }), /Verified media acceptance/);
        assert.deepEqual(service.snapshot(postId), before);
        assert.deepEqual(operation(f, prepared.id), receiptBefore);
        assert.equal(f.db.prepare("SELECT count(*) n FROM media_publications WHERE record_type = 'asset'").get().n, 0);
        await privateCandidates(f, prepared.candidates);
        await assert.rejects(verifyMediaAcceptance({ db: f.db, uploadsPath: f.uploadsPath, id: prepared.id,
            ownerId: f.other, input: prepared.input, action: 'update', postId }), /another editor/);
        const otherPost = service.create(f.input({ title: 'Different target' }));
        assert.throws(() => service.update(otherPost, prepared.input), /Verified media acceptance/);

        assert.equal(service.update(postId, prepared.input), postId);
        const accepted = operation(f, prepared.id);
        assert.equal(accepted.state, 'published');
        assert.equal(accepted.data.receipt.action, 'update');
        assert.equal(Post.findById(postId).body, prepared.input.content.body);
        const { modified_at, ...preservedFacts } = service.snapshot(postId).facts;
        const { modified_at: previousModifiedAt, ...previousFacts } = before.facts;
        assert.notEqual(modified_at, previousModifiedAt, 'Accepted image changes advance modified_at');
        assert.deepEqual(preservedFacts, previousFacts);
        assert.deepEqual(service.snapshot(postId).authors, before.authors);
        assert.equal(f.db.prepare("SELECT count(*) n FROM media_publications WHERE record_type = 'asset'").get().n, 1);
        assert.equal((await f.get(prepared.candidates[0].image.large)).status, 200);

        const later = await f.prepare({ action: 'update', postId });
        service.update(postId, later.input);
        const afterLater = service.snapshot(postId);
        assert.equal(service.update(postId, prepared.input), postId);
        assert.deepEqual(service.snapshot(postId), afterLater, 'An old receipt must not replay its edits');
        assert.throws(() => service.update(postId, changed, { publicationInput: prepared.input }),
            /Verified media acceptance/);
        assert.deepEqual(operation(f, prepared.id), accepted);
        assert.deepEqual(service.snapshot(postId), afterLater);
    });
}

test('only the internal overwrite path can transform verified FFG create input', async t => {
    const f = await fixture(t);
    const service = createEditorialService();
    const postId = service.create(f.input());
    const before = service.snapshot(postId);
    const prepared = await f.prepare();
    delete prepared.input.mediaAcceptance;
    const revisionToken = before.revisionToken;
    prepared.input.revisionToken = revisionToken;
    markPendingOverwrite(f.db, prepared.id, f.owner, { postId, revisionToken }, prepared.input);
    prepared.input.mediaAcceptance = await verifyMediaAcceptance({ db: f.db, uploadsPath: f.uploadsPath,
        id: prepared.id, ownerId: f.owner, input: prepared.input, action: 'overwrite', postId });
    assert.throws(() => service.update(postId, prepared.input,
        { operationAction: 'overwrite', publicationInput: prepared.input }), /Verified media acceptance/);
    assert.deepEqual(service.snapshot(postId), before);
    assert.equal(operation(f, prepared.id).state, 'prepared');
    await privateCandidates(f, prepared.candidates);
    assert.equal(service.overwrite(postId, prepared.input, { revisionToken }), postId);
    const accepted = operation(f, prepared.id);
    assert.equal(accepted.data.receipt.action, 'overwrite');
    const { modified_at, ...preservedFacts } = service.snapshot(postId).facts;
    const { modified_at: previousModifiedAt, ...previousFacts } = before.facts;
    assert.notEqual(modified_at, previousModifiedAt, 'Accepted overwrite advances modified_at');
    assert.deepEqual(preservedFacts, previousFacts);
    assert.deepEqual(service.snapshot(postId).authors, before.authors);
    const after = service.snapshot(postId);
    assert.equal(service.overwrite(postId, prepared.input, { revisionToken }), postId);
    assert.deepEqual(service.snapshot(postId), after);
    assert.deepEqual(operation(f, prepared.id), accepted);
    assert.equal((await f.get(prepared.candidates[0].image.large)).status, 200);
});

test('atomic rollback removes article and grant writes; an incomplete candidate cannot be accepted', async t => {
    const f = await fixture(t);
    const prepared = await f.prepare();
    const provider = createPostMediaProvider(f.db);
    assert.throws(() => createEditorialService({ onTransactionPhase: phase => {
        if (phase === 'before-commit') {
            assert.equal(provider({ kind: 'post', id: prepared.candidates[0].id,
                variant: 'large', url: prepared.candidates[0].image.large }), false, 'Own uncommitted grant must not authorize');
            throw new Error('Synthetic rollback');
        }
    } }).create(prepared.input), /Synthetic rollback/);
    assert.equal(Post.count, 0);
    assert.equal(operation(f, prepared.id).state, 'prepared');
    assert.equal(f.db.prepare("SELECT count(*) n FROM media_publications WHERE record_type = 'asset'").get().n, 0);
    await privateCandidates(f, prepared.candidates);
    const file = path.join(f.uploadsPath, '.media', 'post', prepared.candidates[0].id,
        path.basename(prepared.candidates[0].image.large));
    await fs.unlink(file);
    await assert.rejects(verifyMediaAcceptance({ db: f.db, uploadsPath: f.uploadsPath, id: prepared.id,
        ownerId: f.owner, input: prepared.input, action: 'create' }));
});

test('SQL grant insertion failure rolls back the real HTTP article transaction', async t => {
    const f = await fixture(t);
    f.db.exec(`CREATE TRIGGER synthetic_grant_failure BEFORE INSERT ON media_publications
        WHEN NEW.record_type = 'asset' BEGIN SELECT RAISE(ABORT, 'synthetic grant failure'); END;`);
    const values = f.fields();
    await f.post('/dashboard/posts/create', values);
    assert.equal(Post.count, 0);
    assert.equal(operation(f, values.mediaOperationId).state, 'prepared');
    await privateCandidates(f, operation(f, values.mediaOperationId).data.candidates);
});

test('accepted HTTP retries are idempotent; changed payloads cannot reuse the receipt', async t => {
    const f = await fixture(t);
    const values = f.fields();
    assert.equal((await f.post('/dashboard/posts/create', values)).status, 302);
    const before = operation(f, values.mediaOperationId);
    assert.equal((await f.post('/dashboard/posts/create', values)).status, 302);
    await f.post('/dashboard/posts/create', { ...values, body: 'Different request' });
    assert.equal(Post.count, 1);
    assert.equal(Post.findById(before.data.receipt.postId).body, values.body);
    assert.deepEqual(operation(f, values.mediaOperationId), before);
    assert.equal(f.db.prepare("SELECT count(*) n FROM media_publications WHERE record_type = 'asset'").get().n, 1);
});

test('an actual lost HTTP response is recovered by the same operation receipt', async t => {
    const f = await fixture(t);
    const values = f.fields();
    await assert.rejects(f.post('/dashboard/posts/create', values, 1, { 'x-drop-response': 'yes' }), /fetch failed|socket/i);
    assert.equal(operation(f, values.mediaOperationId).state, 'published');
    assert.equal((await f.post('/dashboard/posts/create', values)).status, 302);
    assert.equal(Post.count, 1);
});

test('SQLite provider denies exact-variant mismatches and malformed published records', async t => {
    const f = await fixture(t);
    const prepared = await f.prepare();
    createEditorialService().create(prepared.input);
    const candidate = prepared.candidates[0];
    const provider = createPostMediaProvider(f.db);
    assert.equal(provider({ kind: 'post', id: candidate.id, variant: 'large', url: candidate.image.thumbnail }), false);
    // Synthetic corruption only: normal published writes/deletes are blocked.
    f.db.exec('DROP TRIGGER media_publications_immutable_update');
    f.db.prepare("UPDATE media_publications SET data = '{}' WHERE id = ?").run(candidate.id);
    assert.equal((await f.get(candidate.image.large)).status, 404);
    assert.equal((await f.get(candidate.image.large, { 'If-None-Match': '*' })).status, 404);
});

test('lost-response recovery and unknown SQLite outcomes remain distinct', async t => {
    const f = await fixture(t);
    const prepared = await f.prepare();
    const id = createEditorialService({ onTransactionPhase: phase => {
        if (phase === 'after-commit') throw new Error('Synthetic response lost');
    } }).create(prepared.input);
    assert.equal(createEditorialService().create(prepared.input), id);
    const changed = { ...prepared.input, content: { ...prepared.input.content, body: 'Changed intent' } };
    assert.throws(() => createEditorialService().create(changed), /Verified media acceptance/);
    const second = await f.prepare({ title: 'Unknown Outcome' });
    assert.throws(() => createEditorialService({ onTransactionPhase: phase => {
        if (phase === 'after-commit') { f.db.close(); throw new Error('Synthetic connection lost'); }
    } }).create(second.input), error => error.code === 'MEDIA_OUTCOME_UNKNOWN');
    f.reopen();
    assert.equal(operation(f, second.id).state, 'published');
    assert.equal(Post.count, 2);
    assert.equal((await f.get(second.candidates[0].image.thumbnail)).status, 200);
    assert.equal((await f.get(`/admin/media-operations/${second.id}`)).status, 200);
});

test('a cancellation winning before acceptance invalidates the verification capability', async t => {
    const f = await fixture(t);
    const prepared = await f.prepare();
    cancelMediaOperation(f.db, prepared.id, f.owner);
    assert.throws(() => createEditorialService().create(prepared.input), /cancelled or changed/);
    assert.equal(Post.count, 0);
    await privateCandidates(f, prepared.candidates);
    const winner = await f.prepare({ title: 'Accepted first' });
    createEditorialService().create(winner.input);
    assert.equal(cancelMediaOperation(f.db, winner.id, f.owner).postId, operation(f, winner.id).data.receipt.postId);
    assert.equal((await f.get(winner.candidates[0].image.large)).status, 200);
});

test('concurrent HTTP edits select one revision; identical operation retries select one receipt', async t => {
    const f = await fixture(t);
    const postId = createEditorialService().create(f.input());
    const first = f.fields(postId);
    const second = { ...f.fields(postId), body: 'Second writer' };
    await Promise.all([f.post(`/dashboard/posts/${postId}/update`, first), f.post(`/dashboard/posts/${postId}/update`, second)]);
    const states = [operation(f, first.mediaOperationId), operation(f, second.mediaOperationId)];
    assert.deepEqual(states.map(item => item.state).sort(), ['prepared', 'published']);
    await privateCandidates(f, states.find(item => item.state === 'prepared').data.candidates);
    const identical = { ...f.fields(), title: 'Concurrent same operation' };
    await Promise.all([f.post('/dashboard/posts/create', identical), f.post('/dashboard/posts/create', identical)]);
    assert.equal(operation(f, identical.mediaOperationId).state, 'published');
    assert.equal(Post.count, 2);
});

test('missing published files report accepted-needs-repair; database errors deny serving', async t => {
    const f = await fixture(t);
    const values = f.fields();
    await f.post('/dashboard/posts/create', values);
    const published = operation(f, values.mediaOperationId);
    const candidate = published.data.candidates[0];
    const bodyOnly = f.fields(published.data.receipt.postId);
    await f.post(`/dashboard/posts/${published.data.receipt.postId}/update`, bodyOnly, 0);
    assert.deepEqual(operation(f, bodyOnly.mediaOperationId).data.required, [candidate.id]);
    await fs.unlink(path.join(f.uploadsPath, '.media', 'post', candidate.id, path.basename(candidate.image.large)));
    assert.equal((await f.get(candidate.image.large)).status, 404);
    const retry = await f.post('/dashboard/posts/create', values);
    assert.equal(retry.status, 409);
    assert.equal(JSON.parse(retry.text).state, 'published');
    const retainedRetry = await f.post(`/dashboard/posts/${published.data.receipt.postId}/update`, bodyOnly, 0);
    assert.equal(retainedRetry.status, 409);
    assert.equal(JSON.parse(retainedRetry.text).state, 'published');
    const provider = createPostMediaProvider(f.db);
    f.db.close();
    assert.equal(provider({ kind: 'post', id: candidate.id, variant: 'thumbnail', url: candidate.image.thumbnail }), false);
    f.reopen();
    assert.equal(operation(f, values.mediaOperationId).state, 'published');
});

for (const phase of ['before-commit', 'after-commit']) {
    test(`abrupt child-process crash ${phase} recovers from durable state`, async t => {
        const f = await fixture(t);
        const prepared = await f.prepare();
        const value = { ...prepared.input };
        delete value.mediaAcceptance;
        f.db.close();
        const script = `
            import { initializeDatabase } from './blog-core/src/database/init.js';
            import { setDatabase } from './blog-core/src/models/db.js';
            import { verifyMediaAcceptance } from './blog-core/src/models/media-publication.js';
            import { createEditorialService } from './blog-core/src/models/editorial-service.js';
            const p = JSON.parse(process.argv[1]);
            const db = initializeDatabase(p.dbPath); setDatabase(db);
            p.input.mediaAcceptance = await verifyMediaAcceptance({ db, uploadsPath: p.uploadsPath,
                id:p.id, ownerId:p.owner, input:p.input, action:'create' });
            createEditorialService({ onTransactionPhase: phase => {
                if(phase === p.phase) process.kill(process.pid, 'SIGKILL');
            }}).create(p.input);
        `;
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify({
            dbPath: f.dbPath, uploadsPath: f.uploadsPath, id: prepared.id, owner: f.owner, input: value, phase })],
        { cwd: path.join(import.meta.dirname, '../..'), encoding: 'utf8' });
        assert.equal(child.signal, 'SIGKILL', child.stderr);
        f.reopen();
        assert.equal(operation(f, prepared.id).state, phase === 'before-commit' ? 'prepared' : 'published');
        assert.equal(Post.count, phase === 'before-commit' ? 0 : 1);
        assert.equal((await f.get(prepared.candidates[0].image.large)).status, phase === 'before-commit' ? 404 : 200);
        assert.ok((await fs.readdir(path.join(f.uploadsPath, '.media', 'post'))).length, 'Restart must not delete abandoned candidates');
    });
}

test('65/100-thumbnail patterns use one indexed SQLite statement per request without a cache', async t => {
    const f = await fixture(t);
    const sample = await preparePostCandidate({ uploadsPath: f.uploadsPath, inputPath: f.inputPath });
    const pageBytes = () => f.db.pragma('page_count', { simple: true }) * f.db.pragma('page_size', { simple: true });
    const beforeBytes = pageBytes();
    const candidates = [];
    for (let index = 0; index < 100; index++) {
        const candidate = await createPrivateCandidate(f.uploadsPath, 'post');
        const image = { ...sample.image };
        for (const variant of variants) {
            image[variant] = managedMediaUrl('post', candidate.id, variant);
            await fs.copyFile(path.join(sample.candidate.directory, path.basename(sample.image[variant])),
                path.join(candidate.directory, path.basename(image[variant])));
        }
        candidates.push({ id: candidate.id, image, files: sample.files });
    }
    for (let batch = 0; batch < 4; batch++) {
        const group = candidates.slice(batch * 25, (batch + 1) * 25);
        const id = f.allocate();
        const input = f.input({ title: `Synthetic workload batch ${batch}`, images: group.map(item => item.image), captions: group.map(() => '') });
        prepareMediaOperation(f.db, id, f.owner, mediaDigest(input), input, group);
        input.mediaAcceptance = await verifyMediaAcceptance({ db: f.db, uploadsPath: f.uploadsPath,
            id, ownerId: f.owner, input, action: 'create' });
        createEditorialService().create(input);
    }
    const metadataBytes = f.db.prepare('SELECT sum(length(CAST(data AS BLOB))) n FROM media_publications').get().n;
    t.diagnostic(`metadata JSON bytes=${metadataBytes}; database page growth including four articles=${pageBytes() - beforeBytes}; records=104`);
    let queries = 0;
    f.reopen({ verbose: sql => { if (sql.startsWith('SELECT a.id, a.data')) queries++; } });
    for (const count of [65, 100]) for (const authorized of [true, false]) {
        const beforeQueries = queries;
        const start = performance.now();
        const timings = await Promise.all(candidates.slice(0, count).map(async candidate => {
            const begin = performance.now();
            const url = authorized ? candidate.image.thumbnail : managedMediaUrl('post', randomUUID(), 'thumbnail');
            const result = await f.get(url);
            assert.equal(result.status, authorized ? 200 : 404);
            return performance.now() - begin;
        }));
        assert.equal(queries - beforeQueries, count);
        timings.sort((a, b) => a - b);
        t.diagnostic(`workload ${count} ${authorized ? 'authorized' : 'denied'} thumbnails: wall=${(performance.now() - start).toFixed(2)}ms mean=${(timings.reduce((a,b)=>a+b,0)/count).toFixed(2)}ms p95=${timings[Math.ceil(count*.95)-1].toFixed(2)}ms SQL=${queries-beforeQueries}`);
    }
    // Statement uses PK lookups for both the candidate and its operation.
    const plan = f.db.prepare(`EXPLAIN QUERY PLAN SELECT a.data FROM media_publications a
        JOIN media_publications p ON p.id = a.operation_id WHERE a.id = ?`).all(candidates[0].id);
    assert.ok(plan.filter(row => /SEARCH/.test(row.detail)).length >= 2);
});
