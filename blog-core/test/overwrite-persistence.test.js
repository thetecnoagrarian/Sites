import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { formatWithOptions } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import session from 'express-session';
import storeFactory from 'better-sqlite3-session-store';
import flash from 'connect-flash';
import Csrf from 'csrf';
import Handlebars from 'handlebars';
import sharp from 'sharp';
import { initializeDatabase } from '../src/database/init.js';
import { setDatabase } from '../src/models/db.js';
import User from '../src/models/user.js';
import PublicPerson from '../src/models/public-person.js';
import { createEditorialService } from '../src/models/editorial-service.js';
import { createEditorialAdminRouter } from '../src/admin/editorial-router.js';
import { allocateMediaOperation, prepareMediaOperation, markPendingOverwrite, readPendingOverwrite,
    readMediaOperation, mediaDigest, PENDING_INPUT_MAX_BYTES, createPostMediaProvider,
    verifyMediaAcceptance } from '../src/models/media-publication.js';
import { createUploadMiddleware } from '../src/middleware/upload.js';
import { mountMediaServing } from '../src/middleware/media-serving.js';
import logger from '../src/utils/logger.js';
import { preparePostCandidate } from '../src/utils/private-media.js';
import { processImage } from '../src/utils/imageProcessor.js';

const NativeStore = storeFactory(session);
// Disable only expiry polling. Actual get/set/touch SQL is unchanged.
class FixtureStore extends NativeStore { startInterval() {} }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const confirmationUrl = id => `/admin/posts/confirm-overwrite?mediaOperationId=${id}`;

async function fixture(t) {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'sites-overwrite-'));
    const dbPath = path.join(root, 'synthetic.db');
    const uploadsPath = path.join(root, 'public', 'uploads');
    await fs.mkdir(uploadsPath, { recursive: true });
    let db = initializeDatabase(dbPath);
    setDatabase(db);
    const owner = Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES('synthetic-owner','synthetic','admin')").run().lastInsertRowid);
    const other = Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES('synthetic-other','synthetic','admin')").run().lastInsertRowid);
    const reader = Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES('synthetic-reader','synthetic','user')").run().lastInsertRowid);
    const person = PublicPerson.create({ publicKey: 'synthetic', displayName: 'Synthetic Author' });
    const input = body => ({ content: { title: 'Synthetic duplicate', body, description: '', excerpt: '',
        created_at: '2020-01-01', images: [], captions: [] }, authorIds: [person.id], categoryIds: [], publisherId: person.id, loginUserId: owner });
    const postId = createEditorialService().create(input('Original'));
    const store = new FixtureStore({ client: db });
    const saveGates = new Map();
    const nativeSet = store.set.bind(store);
    store.set = (sid, snapshot, callback) => {
        const gate = saveGates.get(snapshot.testMarker);
        if (!gate) return nativeSet(sid, snapshot, callback);
        saveGates.delete(snapshot.testMarker);
        // Intercept BEFORE nativeSet serializes or writes. Do not just delay its callback.
        gate.reached.resolve();
        gate.release.promise.then(() => nativeSet(sid, snapshot, callback));
    };
    const csrf = new Csrf();
    const app = express();
    app.locals.uploadsPath = uploadsPath;
    app.locals.upload = createUploadMiddleware(path.join(uploadsPath, 'temp'));
    app.use(express.urlencoded({ extended: true }));
    app.use(session({ store, secret: 'synthetic-fixture-session-only', resave: false, saveUninitialized: true,
        cookie: { httpOnly: true, sameSite: 'lax', maxAge: 86400000 } }));
    app.use(flash());
    const requests = new Map();
    const hbs = Handlebars.create();
    hbs.registerPartial('layouts/admin', '{{> @partial-block}}');
    hbs.registerHelper('truncate', (value, size) => String(value).slice(0, size));
    hbs.registerHelper('formatDate', value => value);
    const renderConfirmation = hbs.compile(await fs.readFile(new URL('../../fruitionforestgarden/src/views/admin/confirm-overwrite.hbs', import.meta.url), 'utf8'));
    app.use((req, res, next) => {
        if (!req.session.csrfSecret) req.session.csrfSecret = csrf.secretSync();
        req.csrfToken = () => csrf.create(req.session.csrfSecret);
        req.verifyCsrfToken = value => typeof value === 'string' && csrf.verify(req.session.csrfSecret, value);
        req.user = req.session.userId ? User.findById(req.session.userId) : null;
        if (req.get('x-test-request')) requests.set(req.get('x-test-request'), req);
        if (req.get('x-session-marker')) req.session.testMarker = req.get('x-session-marker');
        if (req.get('x-drop-response')) res.redirect = () => { res.destroy(); return res; };
        if (req.get('x-fail-success-flash')) {
            const originalFlash = req.flash;
            req.flash = function (kind, ...args) {
                if (kind === 'success') throw privateError();
                return originalFlash.call(this, kind, ...args);
            };
        }
        res.render = (view, data) => view === 'admin/confirm-overwrite'
            ? res.type('html').send(renderConfirmation(data)) : res.json(data);
        if (req.method === 'POST' && !req.is('multipart/form-data') && !req.verifyCsrfToken(req.body._csrf)) return res.sendStatus(403);
        next();
    });
    app.get('/__test/session', (req, res) => res.json({ csrf: req.csrfToken(), marker: req.session.testMarker,
        legacy: req.session.pendingEditorialOverwrite }));
    app.post('/__test/login', (req, res) => { req.session.userId = Number(req.body.userId); res.sendStatus(204); });
    app.post('/__test/legacy', (req, res) => {
        req.session.pendingEditorialOverwrite = { operationId: req.body.operationId, input: { body: 'Obsolete session input' } };
        res.sendStatus(204);
    });
    app.use('/admin', createEditorialAdminRouter({ allowOverwrite: true }));
    const providers = { post: createPostMediaProvider(db) };
    mountMediaServing(app, { publicPath: path.dirname(uploadsPath), uploadsPath, publicationProviders: providers, production: true });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => {
        for (const gate of saveGates.values()) gate.release.resolve();
        try { await new Promise(resolve => server.close(resolve)); }
        finally { if (db.open) db.close(); setDatabase(null); await fs.rm(root, { recursive: true, force: true }); }
    });
    const png = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#367049' } }).png().toBuffer();
    const client = async (userId = owner) => {
        const c = { cookie: '', csrf: '' };
        c.request = async (url, { values, headers = {}, multipart } = {}) => {
            const id = randomUUID();
            const response = await fetch(base + url, { method: values || multipart ? 'POST' : 'GET', redirect: 'manual',
                headers: { ...(c.cookie ? { cookie: c.cookie } : {}), 'x-test-request': id, ...headers },
                body: multipart ?? (values ? new URLSearchParams({ _csrf: c.csrf, ...values }) : undefined) });
            if (response.headers.get('set-cookie')) c.cookie = response.headers.get('set-cookie').split(';')[0];
            const text = await response.text();
            const req = requests.get(id);
            requests.delete(id);
            // Observe route-owned cleanup; never clean on the application's behalf.
            const directories = [...new Set((req?.files ?? []).map(file => path.dirname(file.path)))];
            const deadline = performance.now() + 3000;
            for (const directory of directories) while (true) {
                try { await fs.stat(directory); }
                catch (error) { if (error.code === 'ENOENT') break; throw error; }
                assert.ok(performance.now() < deadline, 'Route did not clean its raw inputs');
                await delay(5);
            }
            return { status: response.status, location: response.headers.get('location'), headers: response.headers,
                text, data: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null };
        };
        c.csrf = (await c.request('/__test/session')).data.csrf;
        if (userId) await c.request('/__test/login', { values: { userId } });
        c.confirm = (id, action = 'overwrite', extra = {}, headers = {}) => c.request('/admin/posts/confirm-overwrite',
            { values: { mediaOperationId: id, action, ...extra }, headers });
        return c;
    };
    const submit = async (c, body = 'New body', extra = {}, images = 1, filename = null) => {
        const editor = await c.request('/admin/posts/new');
        const id = editor.data.mediaOperationId;
        const form = new FormData();
        const fields = { _csrf: c.csrf, mediaOperationId: id, title: 'Synthetic duplicate', body, description: '', excerpt: '',
            created_at: '2020-01-01', 'authorIds[]': String(person.id), 'authorPositions[]': '1', publisherId: String(person.id), ...extra };
        for (const [key, value] of Object.entries(fields)) form.append(key, value);
        for (let i = 0; i < images; i++) { form.append('image', new Blob([png], { type: 'image/png' }), filename ?? `synthetic-${i}.png`); form.append('captions[]', `Caption ${i} 🌲`); }
        return { id: fields.mediaOperationId, response: await c.request('/admin/dashboard/posts/create', { multipart: form }) };
    };
    const unbound = body => {
        const value = input(body);
        const id = allocateMediaOperation(db, owner, 'create');
        prepareMediaOperation(db, id, owner, mediaDigest(value), value, []);
        value.revisionToken = createEditorialService().snapshot(postId).revisionToken;
        return { id, input: value, pending: { postId, revisionToken: value.revisionToken } };
    };
    const bind = value => markPendingOverwrite(db, value.id, owner, value.pending, value.input);
    const operation = id => readMediaOperation(db, id, owner);
    const privateImages = async id => {
        for (const candidate of operation(id).data.candidates) for (const url of [candidate.image.thumbnail, candidate.image.medium, candidate.image.large]) {
            const result = await fetch(base + url);
            assert.equal(result.status, 404); assert.equal(result.headers.get('cache-control'), 'no-store'); await result.arrayBuffer();
        }
    };
    const reopen = () => {
        if (db.open) db.close();
        db = initializeDatabase(dbPath); setDatabase(db); store.client = db; providers.post = createPostMediaProvider(db);
    };
    return { get db() { return db; }, app, dbPath, uploadsPath, postId, owner, other, reader, client, submit, unbound, bind, input,
        operation, privateImages, reopen, base, holdSave(marker) {
            const gate = { reached: deferred(), release: deferred() }; saveGates.set(marker, gate);
            return { reached: gate.reached.promise, release: () => gate.release.resolve() };
        } };
}

for (const action of ['cancel A', 'confirm A', 'confirm B']) {
    test(`real sessions: A then B then ${action} uses only its durable operation`, async t => {
        const f = await fixture(t), c = await f.client();
        const A = await f.submit(c, 'Payload A'), B = await f.submit(c, 'Payload B');
        assert.equal(A.response.location, confirmationUrl(A.id));
        assert.equal(B.response.location, confirmationUrl(B.id));
        await f.privateImages(A.id); await f.privateImages(B.id);
        const pageA = await c.request(confirmationUrl(A.id)), pageB = await c.request(confirmationUrl(B.id));
        assert.equal(pageA.headers.get('cache-control'), 'no-store');
        assert.match(pageA.text, /Payload A/); assert.doesNotMatch(pageA.text, /Payload B/);
        assert.match(pageB.text, /Payload B/);
        await c.request('/__test/legacy', { values: { operationId: B.id } });
        const selected = action === 'confirm B' ? B : A;
        assert.equal((await c.confirm(selected.id, action === 'cancel A' ? 'cancel' : 'overwrite')).status, 302);
        assert.equal(f.operation(selected.id).state, action === 'cancel A' ? 'cancelled' : 'published');
        const untouched = selected === A ? B : A;
        assert.equal(f.operation(untouched.id).state, 'prepared');
        assert.equal(readPendingOverwrite(f.db, untouched.id, f.owner).input.content.body, selected === A ? 'Payload B' : 'Payload A');
        await f.privateImages(untouched.id);
        if (action === 'cancel A') {
            assert.equal((await c.confirm(B.id)).status, 302);
            assert.equal(f.operation(B.id).state, 'published');
        } else {
            await c.confirm(untouched.id);
            assert.equal(f.operation(untouched.id).state, 'prepared', 'A stale target cannot silently refresh its revision');
        }
    });
}

for (const action of ['cancel', 'overwrite']) for (const last of ['A', 'B']) {
    test(`real store boundary: ${action} A with ${last} session saved last cannot erase pending B`, async t => {
        const f = await fixture(t), c = await f.client();
        const A = await f.submit(c, 'Payload A'), B = await f.submit(c, 'Payload B');
        await c.request('/__test/legacy', { values: { operationId: A.id } });
        const gate = f.holdSave('stale-A');
        const older = c.confirm(A.id, action, {}, { 'x-session-marker': 'stale-A' });
        await gate.reached;
        try {
            if (last === 'A') {
                await c.request('/__test/legacy', { values: { operationId: B.id } });
                gate.release(); await older;
            } else {
                gate.release(); await older;
                await c.request('/__test/legacy', { values: { operationId: B.id } });
            }
            const actual = (await c.request('/__test/session')).data;
            assert.equal(actual.legacy.operationId, last === 'A' ? A.id : B.id, 'The real whole-session last writer wins');
            assert.equal(f.operation(B.id).state, 'prepared');
            assert.equal(readPendingOverwrite(f.db, B.id, f.owner).input.content.body, 'Payload B');
            assert.match((await c.request(confirmationUrl(B.id))).text, /Payload B/);
            await f.privateImages(B.id);
        } finally { gate.release(); await older; }
    });
}

test('real sessions: simultaneous confirmation and confirm/cancel races retain one durable result', async t => {
    const f = await fixture(t), c = await f.client();
    const A = await f.submit(c);
    await Promise.all([c.confirm(A.id), c.confirm(A.id)]);
    const receipt = f.operation(A.id);
    assert.equal(receipt.state, 'published');
    const after = createEditorialService().snapshot(f.postId);
    await c.confirm(A.id); await c.confirm(A.id, 'cancel');
    assert.deepEqual(f.operation(A.id), receipt);
    assert.deepEqual(createEditorialService().snapshot(f.postId), after);
    for (const first of ['cancel', 'overwrite']) {
        const B = await f.submit(c, `Race ${first}`);
        await Promise.all([c.confirm(B.id, first), c.confirm(B.id, first === 'cancel' ? 'overwrite' : 'cancel')]);
        const terminal = f.operation(B.id);
        assert.ok(['cancelled', 'published'].includes(terminal.state));
        await c.confirm(B.id); await c.confirm(B.id, 'cancel');
        assert.deepEqual(f.operation(B.id), terminal);
        if (terminal.state === 'cancelled') await f.privateImages(B.id);
    }
    assert.equal(f.db.prepare("SELECT count(*) n FROM media_publications WHERE record_type='asset' AND operation_id=?").get(A.id).n, 1);
});

test('reauthentication, stale tabs and an actual lost response recover by operation ID', async t => {
    const f = await fixture(t), c = await f.client();
    const A = await f.submit(c);
    const fresh = await f.client();
    assert.match((await fresh.request(confirmationUrl(A.id))).text, /New body/);
    const status = await fresh.request(`/admin/media-operations/${A.id}`);
    assert.equal(status.data.state, 'prepared'); assert.equal(status.data.input, undefined);
    await assert.rejects(fresh.confirm(A.id, 'overwrite', {}, { 'x-drop-response': 'yes' }), /fetch failed|socket/i);
    assert.equal(f.operation(A.id).state, 'published');
    const accepted = createEditorialService().snapshot(f.postId);
    assert.equal((await c.confirm(A.id)).status, 302);
    assert.deepEqual(createEditorialService().snapshot(f.postId), accepted);
    const receipt = await c.request(`/admin/media-operations/${A.id}`);
    assert.equal(receipt.data.state, 'published'); assert.doesNotMatch(receipt.text, /New body|pending_input/);
    const page = await c.request(confirmationUrl(A.id));
    assert.equal(page.data.state, 'published'); assert.equal(page.status, 409);
});

test('owner/admin/CSRF checks and confirmation allowlist reject swapped or resubmitted content', async t => {
    const f = await fixture(t), c = await f.client();
    const A = await f.submit(c, 'Private pending text');
    for (const id of [f.other, f.reader, null]) {
        const foreign = await f.client(id);
        assert.doesNotMatch((await foreign.request(confirmationUrl(A.id))).text, /Private pending text/);
        await foreign.confirm(A.id, 'cancel');
        assert.equal(f.operation(A.id).state, 'prepared');
    }
    assert.equal((await c.confirm(A.id, 'overwrite', { _csrf: 'invalid' })).status, 403);
    assert.equal((await c.confirm(A.id, 'overwrite', { body: 'Tampered' })).status, 400);
    for (const id of ['not-a-uuid', randomUUID()]) {
        assert.doesNotMatch((await c.request(confirmationUrl(id))).text, /Private pending text/);
        await c.confirm(id);
    }
    assert.equal(f.operation(A.id).state, 'prepared'); await f.privateImages(A.id);
});

test('pending binding is atomic, immutable, allowlisted and idempotent', async t => {
    const f = await fixture(t);
    const A = f.unbound('Round trip 🌲 "quoted"\n<script>text</script>');
    const original = f.operation(A.id);
    assert.throws(() => f.db.transaction(() => f.bind(A)).immediate(), /own outer transaction/);
    assert.throws(() => f.bind({ ...A, input: { ...A.input, _csrf: 'must-not-persist' } }), /Invalid pending editorial fields/);
    assert.throws(() => f.bind({ ...A, input: { ...A.input, content: { ...A.input.content, body: 'B' } } }), /Prepared editorial input changed/);
    assert.deepEqual(f.operation(A.id), original);
    f.db.exec(`CREATE TRIGGER synthetic_binding_failure BEFORE UPDATE ON media_publications
        WHEN NEW.pending_input IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic bind failure'); END`);
    assert.throws(() => f.bind(A), /synthetic bind failure/);
    assert.equal(f.db.prepare('SELECT pending_input p FROM media_publications WHERE id=?').get(A.id).p, null);
    assert.deepEqual(f.operation(A.id), original);
    f.db.exec('DROP TRIGGER synthetic_binding_failure');
    f.bind(A); f.bind(A);
    const bound = readPendingOverwrite(f.db, A.id, f.owner);
    assert.deepEqual(bound.input, A.input);
    assert.equal(mediaDigest(bound.input), f.operation(A.id).data.inputHash);
    assert.throws(() => f.bind({ ...A, pending: { ...A.pending, postId: f.postId + 1 } }), /binding changed/);
    assert.throws(() => f.bind({ ...A, input: { ...A.input, content: { ...A.input.content, body: 'Different' } } }), /binding changed/);
    assert.throws(() => f.db.prepare('UPDATE media_publications SET pending_input=NULL WHERE id=?').run(A.id), /immutable/);
    assert.throws(() => f.db.prepare('DELETE FROM media_publications WHERE id=?').run(A.id), /retained/);
    assert.equal(f.db.prepare("SELECT count(*) n FROM media_publications WHERE record_type='asset'").get().n, 0);
});

test('UTF-8 snapshots round-trip through the exact 8 MiB boundary without changing metadata limits', async t => {
    const f = await fixture(t);
    for (const body of ['Small', '<p>Large article</p>'.repeat(18000), '🌲漢字'.repeat(20000), '\u0001"\\\n'.repeat(30000)]) {
        const A = f.unbound(body); f.bind(A);
        const restored = readPendingOverwrite(f.db, A.id, f.owner).input;
        assert.equal(restored.content.body, body); assert.equal(mediaDigest(restored), mediaDigest(A.input));
    }
    for (const delta of [-1, 0, 1]) {
        const A = f.unbound('');
        const overhead = Buffer.byteLength(JSON.stringify({ version: 1, input: A.input }));
        A.input.content.body = 'x'.repeat(PENDING_INPUT_MAX_BYTES + delta - overhead);
        // Prepare the exact large submission, not a different payload under an old hash.
        const clean = { ...A.input, revisionToken: undefined };
        f.db.prepare('UPDATE media_publications SET data=json_set(data,\'$.inputHash\',?) WHERE id=?').run(mediaDigest(clean), A.id);
        if (delta > 0) {
            assert.throws(() => f.bind(A), error => error.code === 'PENDING_INPUT_TOO_LARGE'
                && error.actualBytes === PENDING_INPUT_MAX_BYTES + 1 && error.maxBytes === PENDING_INPUT_MAX_BYTES);
            assert.equal(f.operation(A.id).data.pending, null);
        } else {
            f.bind(A);
            assert.equal(f.db.prepare('SELECT length(CAST(pending_input AS BLOB)) n FROM media_publications WHERE id=?').get(A.id).n, PENDING_INPUT_MAX_BYTES + delta);
            assert.equal(readPendingOverwrite(f.db, A.id, f.owner).input.content.body, A.input.content.body);
        }
    }
    // Character-count and raw-body-count guards would incorrectly accept these.
    for (const body of ['🌲'.repeat(Math.floor(PENDING_INPUT_MAX_BYTES / 4)), '\u0001'.repeat(Math.floor(PENDING_INPUT_MAX_BYTES / 6))]) {
        const A = f.unbound(body);
        assert.ok(body.length < PENDING_INPUT_MAX_BYTES);
        const actualBytes = Buffer.byteLength(JSON.stringify({ version: 1, input: A.input }));
        assert.ok(actualBytes > PENDING_INPUT_MAX_BYTES);
        assert.throws(() => f.bind(A), error => error.code === 'PENDING_INPUT_TOO_LARGE' && error.actualBytes === actualBytes);
        assert.equal(f.operation(A.id).data.pending, null);
    }
    const A = f.unbound('Bound');
    assert.throws(() => f.db.prepare('UPDATE media_publications SET data=? WHERE id=?').run(JSON.stringify({ value: 'x'.repeat(131072) }), A.id), /CHECK constraint/);
});

test('real multipart oversize returns explicit 413 and leaves all derivatives private', async t => {
    const f = await fixture(t), c = await f.client();
    const before = createEditorialService().snapshot(f.postId);
    const A = await f.submit(c, '\u0001'.repeat(900000), { description: '\u0001'.repeat(900000) });
    assert.equal(A.response.status, 413);
    assert.equal(A.response.headers.get('cache-control'), 'no-store');
    assert.ok(A.response.data.actualBytes > PENDING_INPUT_MAX_BYTES);
    assert.equal(A.response.data.maxBytes, PENDING_INPUT_MAX_BYTES);
    assert.match(A.response.data.error, new RegExp(String(A.response.data.actualBytes)));
    assert.equal(f.operation(A.id).data.pending, null);
    assert.equal(f.operation(A.id).state, 'prepared');
    assert.deepEqual(createEditorialService().snapshot(f.postId), before);
    await f.privateImages(A.id);
});

for (const corrupt of ['snapshot', 'candidate identity', 'candidate hash']) {
    test(`modified ${corrupt} cannot pass durable confirmation verification`, async t => {
        const f = await fixture(t), c = await f.client();
        const A = await f.submit(c);
        const original = f.operation(A.id);
        const before = createEditorialService().snapshot(f.postId);
        assert.throws(() => f.db.prepare("UPDATE media_publications SET pending_input=json_set(pending_input,'$.input.content.body','Changed') WHERE id=?").run(A.id), /immutable/);
        // Simulate corruption only after proving normal SQL cannot alter the binding.
        f.db.exec('DROP TRIGGER media_publications_immutable_update');
        if (corrupt === 'snapshot') f.db.prepare("UPDATE media_publications SET pending_input=json_set(pending_input,'$.input.content.body','Changed') WHERE id=?").run(A.id);
        else {
            const data = structuredClone(original.data);
            if (corrupt === 'candidate hash') data.candidates[0].files.large.sha256 = 'f'.repeat(64);
            else {
                const id = randomUUID(), old = data.candidates[0].id;
                data.candidates[0].id = id;
                data.required[0] = id;
                for (const key of ['thumbnail', 'medium', 'large']) data.candidates[0].image[key] = data.candidates[0].image[key].replace(old, id);
            }
            f.db.prepare('UPDATE media_publications SET data=? WHERE id=?').run(JSON.stringify(data), A.id);
        }
        await c.confirm(A.id);
        assert.equal(f.operation(A.id).state, 'prepared');
        assert.deepEqual(createEditorialService().snapshot(f.postId), before);
        await f.privateImages(A.id);
        for (const candidate of original.data.candidates) {
            const result = await fetch(f.base + candidate.image.large);
            assert.equal(result.status, 404); await result.arrayBuffer();
        }
    });
}

test('failed overwrite acceptance rolls back article and grants while retaining the bound snapshot', async t => {
    const f = await fixture(t), c = await f.client();
    const A = await f.submit(c);
    const before = createEditorialService().snapshot(f.postId);
    const stored = f.db.prepare('SELECT pending_input p FROM media_publications WHERE id=?').get(A.id).p;
    f.db.exec(`CREATE TRIGGER synthetic_accept_failure BEFORE INSERT ON media_publications
        WHEN NEW.record_type='asset' BEGIN SELECT RAISE(ABORT,'synthetic accept failure'); END`);
    await c.confirm(A.id);
    assert.equal(f.operation(A.id).state, 'prepared');
    assert.deepEqual(createEditorialService().snapshot(f.postId), before);
    assert.equal(f.db.prepare('SELECT pending_input p FROM media_publications WHERE id=?').get(A.id).p, stored);
    await f.privateImages(A.id);
});

test('identical multipart resubmission reopens its snapshot; changed or cancelled submission cannot reuse it', async t => {
    const f = await fixture(t), c = await f.client();
    const A = await f.submit(c, 'Original submission');
    const stored = readPendingOverwrite(f.db, A.id, f.owner);
    const retry = await f.submit(c, 'Original submission', { mediaOperationId: A.id });
    assert.equal(retry.response.location, confirmationUrl(A.id));
    assert.deepEqual(readPendingOverwrite(f.db, A.id, f.owner), stored);
    const changed = await f.submit(c, 'Changed submission', { mediaOperationId: A.id });
    assert.equal(changed.response.location, '/admin/posts/new');
    assert.deepEqual(readPendingOverwrite(f.db, A.id, f.owner), stored);
    await c.confirm(A.id, 'cancel');
    const terminal = f.operation(A.id);
    await f.submit(c, 'Original submission', { mediaOperationId: A.id });
    await c.confirm(A.id);
    assert.deepEqual(f.operation(A.id), terminal);
    assert.equal((await c.request(confirmationUrl(A.id))).data.state, 'cancelled');
    assert.equal(readPendingOverwrite(f.db, A.id, f.owner).input.content.body, 'Original submission');
    await f.privateImages(A.id);
});

test('schema rejects malformed, unsupported, asset-owned and over-bound snapshots', async t => {
    const f = await fixture(t);
    for (const payload of ['not JSON', '[]', '{"version":2,"input":{}}', '{"input":{}}', '{"version":1,"input":[]}', Buffer.from('{"version":1,"input":{}}')]) {
        const A = f.unbound('Body');
        const data = { ...f.operation(A.id).data, pending: A.pending };
        assert.throws(() => f.db.prepare('UPDATE media_publications SET data=?,pending_input=? WHERE id=?').run(JSON.stringify(data), payload, A.id), /CHECK constraint/);
        assert.equal(f.operation(A.id).data.pending, null);
    }
    const A = f.unbound('');
    const overhead = Buffer.byteLength(JSON.stringify({ version: 1, input: A.input }));
    const input = { ...A.input, content: { ...A.input.content, body: 'x'.repeat(PENDING_INPUT_MAX_BYTES + 1 - overhead) } };
    assert.throws(() => f.db.prepare('UPDATE media_publications SET data=?,pending_input=? WHERE id=?')
        .run(JSON.stringify({ ...f.operation(A.id).data, pending: A.pending }), JSON.stringify({ version: 1, input }), A.id), /CHECK constraint/);
    const c = await f.client(), B = await f.submit(c);
    await c.confirm(B.id);
    const candidate = f.operation(B.id).data.candidates[0];
    f.db.exec('DROP TRIGGER media_publications_immutable_update');
    assert.throws(() => f.db.prepare('UPDATE media_publications SET pending_input=? WHERE id=?')
        .run(JSON.stringify({ version: 1, input: B }), candidate.id), /CHECK constraint/);
});

test('missing private derivatives prevent overwrite without granting or deleting media', async t => {
    const f = await fixture(t), c = await f.client();
    const A = await f.submit(c);
    const before = createEditorialService().snapshot(f.postId);
    const candidate = f.operation(A.id).data.candidates[0];
    const directory = path.join(f.uploadsPath, '.media', 'post', candidate.id);
    await fs.unlink(path.join(directory, path.basename(candidate.image.large)));
    await c.confirm(A.id);
    assert.equal(f.operation(A.id).state, 'prepared');
    assert.deepEqual(createEditorialService().snapshot(f.postId), before);
    assert.ok((await fs.stat(path.join(directory, path.basename(candidate.image.medium)))).size > 0);
    await f.privateImages(A.id);
});

for (const phase of ['before-commit', 'after-commit']) {
    test(`bound overwrite snapshot survives abrupt ${phase} crash and restart`, async t => {
        const f = await fixture(t), c = await f.client();
        const A = await f.submit(c, 'Crash recovery body');
        f.db.close();
        const script = `
            import {initializeDatabase} from './blog-core/src/database/init.js';
            import {setDatabase} from './blog-core/src/models/db.js';
            import {readPendingOverwrite,verifyMediaAcceptance} from './blog-core/src/models/media-publication.js';
            import {createEditorialService} from './blog-core/src/models/editorial-service.js';
            const p=JSON.parse(process.argv[1]);const db=initializeDatabase(p.dbPath);setDatabase(db);
            const bound=readPendingOverwrite(db,p.id,p.owner);const input=bound.input;
            input.mediaAcceptance=await verifyMediaAcceptance({db,uploadsPath:p.uploadsPath,id:p.id,ownerId:p.owner,input,action:'overwrite',postId:bound.postId});
            createEditorialService({onTransactionPhase:phase=>{if(phase===p.phase)process.kill(process.pid,'SIGKILL');}})
                .overwrite(bound.postId,input,{revisionToken:bound.revisionToken});
        `;
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify({
            dbPath: f.dbPath, uploadsPath: f.uploadsPath, id: A.id, owner: f.owner, phase })],
        { cwd: path.join(import.meta.dirname, '../..'), encoding: 'utf8' });
        assert.equal(child.signal, 'SIGKILL', child.stderr);
        f.reopen();
        assert.equal(readPendingOverwrite(f.db, A.id, f.owner).input.content.body, 'Crash recovery body');
        assert.equal(f.operation(A.id).state, phase === 'before-commit' ? 'prepared' : 'published');
        const url = f.operation(A.id).data.candidates[0].image.large;
        const result = await fetch(f.base + url); await result.arrayBuffer();
        assert.equal(result.status, phase === 'before-commit' ? 404 : 200);
    });
}

test('large accepted snapshots stay outside one-statement public authorization and legacy serving', async t => {
    const f = await fixture(t), c = await f.client();
    const A = await f.submit(c, 'Large body '.repeat(80000));
    await c.confirm(A.id);
    assert.equal(f.operation(A.id).state, 'published');
    const traces = [];
    f.db.close();
    // Reopen with SQLite statement tracing, preserving the real store/provider.
    const Database = (await import('better-sqlite3')).default;
    const traced = new Database(f.dbPath, { verbose: sql => traces.push(sql) });
    try {
        const provider = createPostMediaProvider(traced);
        const operation = readMediaOperation(traced, A.id, f.owner);
        const image = operation.data.candidates[0];
        traces.length = 0;
        for (let i = 0; i < 100; i++) assert.equal(provider({ kind: 'post', id: image.id, variant: 'thumbnail', url: image.image.thumbnail }), true);
        assert.equal(traces.length, 100);
        assert.ok(traces.every(sql => !sql.includes('pending_input') && !sql.includes('SELECT *')));
    } finally { traced.close(); f.reopen(); }
    await fs.writeFile(path.join(f.uploadsPath, 'legacy.webp'), 'synthetic legacy bytes');
    const legacy = await fetch(f.base + '/uploads/legacy.webp');
    assert.equal(legacy.status, 200); assert.equal(await legacy.text(), 'synthetic legacy bytes');
});

for (const [target, submitted] of [['Synthetic duplicate', 'Synthetic duplicate'],
    // Multipart normalizes line endings to CRLF before the server receives them.
    ['Synthetic duplicate', ' \tSynthetic duplicate  '], ['Café 🌲', '  Café 🌲\r\n']]) {
    test(`overwrite service uses existing title normalization for ${JSON.stringify(submitted)}`, async t => {
        const f = await fixture(t), c = await f.client(), service = createEditorialService();
        if (target !== 'Synthetic duplicate') {
            const input = f.input('Original'); input.content.title = target;
            service.update(f.postId, { ...input, revisionToken: service.snapshot(f.postId).revisionToken });
        }
        const before = service.snapshot(f.postId);
        const A = await f.submit(c, 'Replacement body', { title: submitted });
        assert.equal(A.response.location, confirmationUrl(A.id));
        const bound = readPendingOverwrite(f.db, A.id, f.owner);
        assert.equal(bound.input.content.title, submitted, 'The snapshot is never rewritten to repair comparison');
        assert.equal(mediaDigest(bound.input), f.operation(A.id).data.inputHash);
        const input = { ...bound.input, mediaAcceptance: await verifyMediaAcceptance({ db: f.db, uploadsPath: f.uploadsPath,
            id: A.id, ownerId: f.owner, input: bound.input, action: 'overwrite', postId: f.postId }) };
        assert.throws(() => service.overwrite(f.postId, { ...input, content: { ...input.content, title: 'Unrelated title' } },
            { revisionToken: bound.revisionToken }), /Verified media acceptance/);
        assert.throws(() => service.overwrite(f.postId + 1, input, { revisionToken: bound.revisionToken }), /Verified media acceptance/);
        assert.equal(service.overwrite(f.postId, input, { revisionToken: bound.revisionToken }), f.postId);
        const after = service.snapshot(f.postId);
        assert.equal(after.post.title, target);
        assert.equal(after.post.body, 'Replacement body');
        const { modified_at, ...facts } = after.facts;
        const { modified_at: previousModifiedAt, ...previousFacts } = before.facts;
        assert.notEqual(modified_at, previousModifiedAt);
        assert.deepEqual(facts, previousFacts);
        assert.deepEqual(after.authors, before.authors);
        assert.equal((await c.confirm(A.id)).status, 302);
        assert.deepEqual(service.snapshot(f.postId), after, 'An accepted HTTP retry does not replay normalized input');
    });
}

test('actual FFG confirmation accepts a padded title and still rejects a stale bound revision', async t => {
    const f = await fixture(t), c = await f.client();
    const A = await f.submit(c, 'Accepted through HTTP', { title: '  Synthetic duplicate  ' });
    assert.equal((await c.confirm(A.id)).status, 302);
    assert.equal(f.operation(A.id).state, 'published');
    const B = await f.submit(c, 'Stale padded input', { title: ' Synthetic duplicate ' });
    const service = createEditorialService();
    // Another accepted overwrite changes the target revision.
    const C = await f.submit(c, 'Concurrent winner');
    await c.confirm(C.id);
    const winner = service.snapshot(f.postId);
    await c.confirm(B.id);
    assert.equal(f.operation(B.id).state, 'prepared');
    assert.deepEqual(service.snapshot(f.postId), winner);
    await f.privateImages(B.id);
});

test('title comparison does not introduce case folding or Unicode normalization', async t => {
    const f = await fixture(t), service = createEditorialService();
    const value = f.input('Original'); value.content.title = 'Café 🌲';
    service.update(f.postId, { ...value, revisionToken: service.snapshot(f.postId).revisionToken });
    const before = service.snapshot(f.postId);
    for (const title of ['Unrelated', 'café 🌲', 'Cafe\u0301 🌲']) {
        assert.throws(() => service.overwrite(f.postId, { ...value, content: { ...value.content, title } },
            { revisionToken: before.revisionToken }), /Duplicate title target changed/);
        assert.deepEqual(service.snapshot(f.postId), before);
    }
});

const privateSentinels = {
    article: 'SYNTHETIC_DIAGNOSTIC_ARTICLE', snapshot: 'SYNTHETIC_DIAGNOSTIC_SNAPSHOT',
    caption: 'SYNTHETIC_DIAGNOSTIC_CAPTION', password: 'SYNTHETIC_DIAGNOSTIC_PASSWORD',
    cookie: 'SYNTHETIC_DIAGNOSTIC_COOKIE', csrf: 'SYNTHETIC_DIAGNOSTIC_CSRF',
    query: 'SYNTHETIC_DIAGNOSTIC_QUERY', filename: 'SYNTHETIC_DIAGNOSTIC_FILENAME.png',
    contents: 'SYNTHETIC_DIAGNOSTIC_FILE_CONTENTS', message: 'SYNTHETIC_DIAGNOSTIC_MESSAGE'
};
async function diagnosticCapture(run) {
    const records = [], diagnostic = [], access = [];
    const original = { error: logger.error, log: console.log, consoleError: console.error };
    logger.error = (data, message) => { records.push(structuredClone(data)); diagnostic.push(formatWithOptions({ colors: false }, data, message)); };
    console.error = (...args) => diagnostic.push(formatWithOptions({ colors: false }, ...args));
    console.log = (...args) => {
        // Request/access logging is deliberately unchanged and separately assessed.
        const isAccess = typeof args[0] === 'string'
            && /^(isAdmin|isAuthenticated|ADMIN ROUTER REQUEST:)/.test(args[0]);
        (isAccess ? access : diagnostic).push(formatWithOptions({ colors: false }, ...args));
    };
    try {
        const value = await run();
        for (const sentinel of Object.values(privateSentinels)) assert.equal(diagnostic.join('\n').includes(sentinel), false,
            'Active editorial diagnostics must not expose submitted content');
        for (const record of records) {
            assert.match(record.errorId, /^[0-9a-f-]{36}$/);
            assert.ok(record.errorCategory); assert.ok(record.errorCode); assert.ok(record.route);
            assert.equal(record.err, undefined); assert.equal(record.stack, undefined);
        }
        return { value, records, access };
    } finally {
        logger.error = original.error; console.log = original.log; console.error = original.consoleError;
    }
}
function privateError() {
    const error = new Error(privateSentinels.message);
    error.stack = Object.values(privateSentinels).join('\n');
    Object.assign(error, privateSentinels, { pending_input: privateSentinels.snapshot,
        body: privateSentinels.article, cause: new Error(privateSentinels.password) });
    return error;
}

test('active media preparation failure logs bounded diagnostics rather than arbitrary Error properties', async t => {
    const f = await fixture(t), c = await f.client();
    f.app.locals.preparePostCandidate = options => preparePostCandidate({ ...options, processor: async (...args) => {
        await processImage(...args);
        throw privateError();
    } });
    const captured = await diagnosticCapture(() => f.submit(c, privateSentinels.article,
        { 'captions[]': privateSentinels.caption }, 1, privateSentinels.filename));
    assert.equal(captured.value.response.location, '/admin/posts/new');
    assert.equal(f.operation(captured.value.id).state, 'allocated');
    assert.ok(captured.records.some(row => row.route === 'editorial-create' && row.errorCategory === 'application'));
    const ids = await fs.readdir(path.join(f.uploadsPath, '.media', 'post'));
    for (const id of ids) {
        const result = await fetch(f.base + `/uploads/m1-${id}-large.webp`);
        assert.equal(result.status, 404); await result.arrayBuffer();
    }
});

test('native image decoder failure cannot log uploaded filename or contents', async t => {
    const f = await fixture(t), c = await f.client();
    f.app.locals.preparePostCandidate = async options => {
        // Corrupt only the request-owned synthetic raw fixture to force a real Sharp failure.
        await fs.writeFile(options.inputPath, privateSentinels.contents);
        return preparePostCandidate(options);
    };
    const captured = await diagnosticCapture(() => f.submit(c, privateSentinels.article, {}, 1, privateSentinels.filename));
    assert.equal(captured.value.response.location, '/admin/posts/new');
    assert.ok(captured.records.some(row => row.route === 'media-processing'));
    assert.ok(captured.records.some(row => row.route === 'editorial-create'));
    assert.equal(f.operation(captured.value.id).state, 'allocated');
});

test('normal duplicate handling keeps private metadata out of diagnostic logs', async t => {
    const f = await fixture(t), c = await f.client();
    const captured = await diagnosticCapture(() => f.submit(c, privateSentinels.article,
        { 'captions[]': privateSentinels.caption }, 1, privateSentinels.filename));
    assert.equal(captured.value.response.location, confirmationUrl(captured.value.id));
    assert.equal(captured.records.length, 0, 'Expected duplicate detection is handled without an error dump');
    await f.privateImages(captured.value.id);
});

test('ordinary create SQL failure is logged safely by both Post and the active router catch', async t => {
    const f = await fixture(t), c = await f.client();
    f.db.exec(`CREATE TRIGGER synthetic_private_create BEFORE INSERT ON posts
        BEGIN SELECT RAISE(ABORT, '${privateSentinels.message}'); END`);
    const captured = await diagnosticCapture(() => f.submit(c, privateSentinels.article, { title: 'New unique title' }));
    assert.equal(captured.value.response.location, '/admin/posts/new');
    assert.ok(captured.records.some(row => row.route === 'post-model' && row.errorCode === 'SQLITE_CONSTRAINT'));
    assert.ok(captured.records.some(row => row.route === 'editorial-create' && row.errorCategory === 'database'));
    assert.equal(f.operation(captured.value.id).state, 'prepared'); await f.privateImages(captured.value.id);
});

test('ordinary update SQL failure retains content and uses bounded route diagnostics', async t => {
    const f = await fixture(t), c = await f.client();
    const service = createEditorialService(), before = service.snapshot(f.postId);
    f.db.exec(`CREATE TRIGGER synthetic_private_update BEFORE UPDATE ON posts
        BEGIN SELECT RAISE(ABORT, '${privateSentinels.message}'); END`);
    const id = allocateMediaOperation(f.db, f.owner, 'update', f.postId), input = f.input(privateSentinels.article);
    const captured = await diagnosticCapture(() => c.request(`/admin/dashboard/posts/${f.postId}/update?content=${privateSentinels.query}`, {
        values: { mediaOperationId: id, title: input.content.title, body: input.content.body, created_at: input.content.created_at,
            description: '', excerpt: '', 'authorIds[]': input.authorIds[0], 'authorPositions[]': '1', publisherId: input.publisherId,
            revisionToken: before.revisionToken } }));
    assert.equal(captured.value.location, `/admin/posts/${f.postId}/edit`);
    assert.ok(captured.records.some(row => row.route === 'editorial-update' && row.errorCode === 'SQLITE_CONSTRAINT'));
    assert.deepEqual(service.snapshot(f.postId), before);
    assert.ok(captured.access.some(line => line.includes(privateSentinels.query)), 'The separately deferred query-log gap stays visible');
});

for (const phase of ['binding', 'confirmation', 'cancellation']) {
    test(`active ${phase} SQL failure keeps private sentinels out of diagnostics`, async t => {
        const f = await fixture(t), c = await f.client();
        let A;
        if (phase !== 'binding') A = await f.submit(c, privateSentinels.article, { 'captions[]': privateSentinels.caption });
        const table = phase === 'confirmation' ? 'posts' : 'media_publications';
        const condition = phase === 'binding' ? 'WHEN OLD.pending_input IS NULL AND NEW.pending_input IS NOT NULL'
            : phase === 'cancellation' ? "WHEN NEW.state='cancelled'" : '';
        f.db.exec(`CREATE TRIGGER synthetic_private_${phase} BEFORE UPDATE ON ${table} ${condition}
            BEGIN SELECT RAISE(ABORT, '${privateSentinels.message}'); END`);
        const before = createEditorialService().snapshot(f.postId);
        const captured = await diagnosticCapture(() => phase === 'binding'
            ? f.submit(c, privateSentinels.article)
            : c.confirm(A.id, phase === 'cancellation' ? 'cancel' : 'overwrite'));
        assert.ok(captured.records.some(row => row.errorCategory === 'database'
            && row.route === (phase === 'binding' ? 'editorial-create' : 'overwrite-confirmation')));
        if (phase === 'cancellation') assert.equal(captured.value.status, 503);
        else if (phase === 'confirmation') assert.equal(captured.value.status, 302);
        else assert.equal(captured.value.response.status, 503);
        assert.deepEqual(createEditorialService().snapshot(f.postId), before);
        const id = A?.id ?? captured.value.id;
        assert.equal(f.operation(id).state, 'prepared'); await f.privateImages(id);
    });
}

test('oversized snapshot keeps HTTP 413 and reports a bounded media diagnostic', async t => {
    const f = await fixture(t), c = await f.client();
    const captured = await diagnosticCapture(() => f.submit(c,
        privateSentinels.article + '\u0001'.repeat(900000), { description: '\u0001'.repeat(900000) }));
    assert.equal(captured.value.response.status, 413);
    assert.equal(captured.value.response.data.maxBytes, PENDING_INPUT_MAX_BYTES);
    assert.ok(captured.records.some(row => row.errorCode === 'PENDING_INPUT_TOO_LARGE' && row.route === 'editorial-create'));
    await f.privateImages(captured.value.id);
});

test('operation status failure keeps HTTP 503 with a bounded diagnostic', async t => {
    const f = await fixture(t), c = await f.client();
    const captured = await diagnosticCapture(() => c.request(`/admin/media-operations/${randomUUID()}?q=${privateSentinels.query}`));
    assert.equal(captured.value.status, 503);
    assert.equal(captured.value.data.state, 'unknown');
    assert.ok(captured.records.some(row => row.route === 'admin' && row.method === 'GET'));
});

test('accepted receipt with missing required media keeps HTTP 409 and logs safely', async t => {
    const f = await fixture(t), c = await f.client(), A = await f.submit(c, privateSentinels.article);
    assert.equal((await c.confirm(A.id)).status, 302);
    const accepted = f.operation(A.id);
    const url = accepted.data.candidates[0].image.large;
    // Remove only the synthetic fixture derivative to exercise accepted-receipt verification.
    await fs.unlink(path.join(f.uploadsPath, '.media', 'post', accepted.data.candidates[0].id, path.basename(url)));
    const captured = await diagnosticCapture(() => c.confirm(A.id));
    assert.equal(captured.value.status, 409);
    assert.equal(captured.value.data.state, 'published');
    assert.deepEqual(f.operation(A.id), accepted);
    assert.ok(captured.records.some(row => row.route === 'overwrite-confirmation'));
});

test('accepted receipt response failure keeps HTTP 503 and logs safely', async t => {
    const f = await fixture(t), c = await f.client(), A = await f.submit(c, privateSentinels.article);
    const captured = await diagnosticCapture(() => c.confirm(A.id, 'overwrite', {}, { 'x-fail-success-flash': '1' }));
    assert.equal(captured.value.status, 503);
    assert.equal(captured.value.data.state, 'published');
    assert.equal(f.operation(A.id).state, 'published');
    assert.ok(captured.records.some(row => row.route === 'overwrite-confirmation'));
});
