import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const [mode, site] = process.argv.slice(2);
const appRoot = '/app';
const data = '/app/data';
const uploads = path.join(data, 'uploads');
const database = path.join(data, 'blog.db');
const base = 'http://127.0.0.1:4000';
const siteName = { ffg: 'fruitionforestgarden', tta: 'thetecnoagrarian' }[site];
const historical = 'recovery-historical-article';
const published = 'recovery-published-article';
const draftTitle = 'Recovery private follow-up';
const temporary = 'recovery-private.jpg';
const baked = '/downloads/self-rulership-through-abundance.pdf';
const baseline = ['0000_existing_schema', '0001_public_author_publication_model'];
const forward = ['0002_body_gallery', '0003_media_publications', '0004_gallery_drafts'];
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const fileDigest = async file => digest(await fs.readFile(file));
const core = file => import(appRoot + '/blog-core/src/' + file);
const hero = file => import(appRoot + '/fruitionforestgarden/src/utils/' + file);
const requireApp = createRequire(appRoot + '/package.json');
const announce = (key, value) => console.log(JSON.stringify({ key, value }));

function field(html, name) {
    const input = [...html.matchAll(/<input\b[^>]*>/g)]
        .find(([tag]) => tag.includes('name="' + name + '"'));
    const value = input?.[0].match(/\bvalue="([^"]+)"/)?.[1];
    if (!value) throw new Error('Missing required synthetic form field: ' + name);
    return value;
}

function form(values) {
    const body = new FormData();
    for (const [name, value] of Object.entries(values)) body.set(name, String(value));
    return body;
}

async function image(index = 0) {
    return requireApp('sharp')({
        create: { width: 960, height: 640, channels: 3,
            background: { r: index * 2 % 255, g: 110, b: 75 } }
    }).jpeg().toBuffer();
}

function addPhoto(body, name, bytes) {
    body.append(name, new Blob([bytes], { type: 'image/jpeg' }), 'synthetic.jpg');
}

function makeClient({ anonymous = false } = {}) {
    const cookies = new Map();
    return async (url, opts = {}) => {
        const target = new URL(url, base);
        assert.equal(target.origin, base);
        const headers = new Headers(opts.headers);
        headers.set('x-forwarded-proto', 'https');
        headers.set('x-forwarded-for', '192.0.2.10');
        if (anonymous) {
            for (const name of ['cookie', 'authorization', 'proxy-authorization', 'x-csrf-token']) {
                assert(!headers.has(name), 'Anonymous request supplied ' + name);
            }
            assert(!opts.body, 'Anonymous verification is a read-only request');
        } else if (cookies.size) {
            headers.set('cookie', [...cookies.values()].join('; '));
        }
        const response = await fetch(target, { ...opts, headers,
            redirect: 'manual', signal: AbortSignal.timeout(20000) });
        for (const value of anonymous ? [] : response.headers.getSetCookie()) {
            const entry = value.split(';', 1)[0];
            cookies.set(entry.split('=', 1)[0], entry);
        }
        return response;
    };
}

async function expectStatus(response, status, label) {
    if (response.status !== status) {
        await response.body?.cancel();
        throw new Error(label + ' returned HTTP ' + response.status + ', expected ' + status);
    }
    return response;
}

async function getText(client, url) {
    return (await expectStatus(await client(url), 200, url)).text();
}

async function login(client) {
    const token = field(await getText(client, '/login'), '_csrf');
    const response = await expectStatus(await client('/login', {
        method: 'POST',
        body: new URLSearchParams({ username: 'recovery-editor',
            password: process.env.RECOVERY_PASSWORD, _csrf: token })
    }), 302, 'login');
    assert.match(response.headers.get('location'), /^\/admin(?:\/dashboard)?$/);
    await getText(client, '/admin/dashboard');
}

function openDatabase(readonly = true) {
    const Database = requireApp('better-sqlite3');
    return new Database(database, { readonly, fileMustExist: true });
}

function inspectDb(check) {
    const db = openDatabase();
    try {
        assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
        assert.deepEqual(db.pragma('foreign_key_check'), []);
        assert.equal(db.pragma('journal_mode', { simple: true }), 'delete');
        assert(db.pragma('synchronous', { simple: true }) >= 2);
        return check(db);
    } finally {
        db.close();
    }
}

const historyRows = db => ({
    posts: db.prepare('SELECT id, slug, title, body, images FROM posts ORDER BY id').all(),
    users: db.prepare('SELECT id, username, role, password_hash FROM users ORDER BY id').all()
});

async function seed() {
    const { initializeDatabase } = await core('database/init.js');
    const { setDatabase } = await core('models/db.js');
    const { default: User } = await core('models/user.js');
    const { default: Post } = await core('models/post.js');
    const { default: PublicPerson } = await core('models/public-person.js');
    const bytes = await image();
    await fs.mkdir(uploads, { mode: 0o700, recursive: true });
    await fs.writeFile(path.join(uploads, 'historical.jpg'), bytes, { mode: 0o600 });
    await fs.mkdir(path.join(uploads, 'temp'), { mode: 0o700 });
    await fs.writeFile(path.join(uploads, 'temp', temporary), bytes, { mode: 0o600 });
    const db = initializeDatabase(database);
    setDatabase(db);
    try {
        const editor = User.create('recovery-editor', process.env.RECOVERY_PASSWORD, 'admin');
        assert.equal(Number(editor.lastInsertRowid), 1);
        assert.equal(PublicPerson.create({ publicKey: 'recovery-author', displayName: 'Recovery Author' }).id, 1);
        Post.create({ title: 'Recovery historical article',
            body: '<p>Synthetic historical post.</p><img src="/uploads/historical.jpg">',
            description: 'Historical fixture', created_at: '2020-06-05', author_id: 1 });
    } finally { db.close(); }
    if (site === 'ffg') {
        const input = path.join(data, 'seed-hero.jpg');
        await fs.writeFile(input, bytes, { mode: 0o600 });
        const { publishHeroImage } = await hero('heroImageStore.js');
        await publishHeroImage({ inputPath: input, uploadsPath: uploads });
        await fs.unlink(input);
    }
}

async function migrate() {
    const { createMigrationRunner } = await core('database/migrations.js');
    const runner = createMigrationRunner();
    const before = inspectDb(historyRows);
    assert.deepEqual(runner.inspect(database).applied, baseline);
    assert.deepEqual(runner.inspect(database).pending, forward);
    const result = runner.apply(database);
    assert.deepEqual(result.appliedNow, forward);
    assert.deepEqual(result.pending, []);
    assert.equal(digest(JSON.stringify(inspectDb(historyRows))), digest(JSON.stringify(before)),
        'historical content and account records changed');
    const stable = await fileDigest(database);
    assert.deepEqual(runner.apply(database).appliedNow, []);
    assert.equal(await fileDigest(database), stable);
    announce('migration', { applied: result.applied, pending: result.pending, journal: 'delete', integrity: 'ok' });
}

async function publish(client) {
    await login(client);
    const newPost = '/admin/posts/new';
    const create = '/admin/dashboard/posts/create';
    const current = await getText(client, newPost);
    const values = {
        _csrf: field(current, '_csrf'), mediaOperationId: field(current, 'mediaOperationId'),
        title: 'Recovery published article', body: '<p>Recovery article before photos.</p>',
        created_at: '2026-10-02', 'authorIds[]': '1', 'authorPositions[]': '1', publisherId: '1'
    };
    if (site === 'ffg') {
        const draftId = field(current, 'galleryDraftId');
        values.galleryDraftId = draftId;
        values.galleryDraftRevision = field(current, 'galleryDraftRevision');
        const items = [];
        for (let index = 0; index < 65; ++index) {
            const body = form({ _csrf: values._csrf, uploadId: randomUUID() });
            addPhoto(body, 'photo', await image(index));
            const response = await expectStatus(await client('/admin/gallery-drafts/' + draftId + '/images',
                { method: 'POST', headers: { 'x-csrf-token': values._csrf }, body }), 200, 'documentary upload ' + index);
            const staged = await response.json();
            assert.match(staged.id, /^[0-9a-f-]{36}$/);
            values.galleryDraftRevision = staged.revision;
            items.push({ id: staged.id, alt: 'Recovery photo ' + (index + 1), caption: 'Recovery caption ' + (index + 1) });
        }
        items.reverse();
        values.body += '\n<div data-body-gallery></div>\n<p>Recovery article after photos.</p>';
        values.bodyGalleryItems = JSON.stringify(items);
        values.galleryKnownPhotos = JSON.stringify(items.map(item => item.id));
        const saved = await (await expectStatus(await client(create,
            { method: 'POST', body: form({ ...values, submitIntent: 'draft' }) }), 200, 'save gallery draft')).json();
        const reopened = await getText(client, saved.editUrl);
        assert(reopened.includes('Recovery caption 65'));
        values._csrf = field(reopened, '_csrf');
        values.galleryDraftRevision = field(reopened, 'galleryDraftRevision');
        const tentative = '/uploads/m1-' + items[0].id + '-medium.webp';
        await expectStatus(await client(tentative, { method: 'HEAD' }), 404, 'unpublished media');
    }

    const body = form(values);
    addPhoto(body, 'image', await image(72));
    if (site === 'ffg') addPhoto(body, 'image', await image(73));
    const accepted = await expectStatus(await client(create, { method: 'POST', body }), 302, 'publish article');
    assert.equal(accepted.headers.get('location'), '/admin/dashboard');
    await getText(client, '/post/' + published);
    const receipt = await (await expectStatus(await client('/admin/media-operations/' + values.mediaOperationId),
        200, 'read accepted post receipt')).json();
    assert.equal(receipt.state, 'published');

    if (site === 'ffg') {
        const privateDraft = await getText(client, newPost);
        const saved = await expectStatus(await client(create, {
            method: 'POST', body: form({
                _csrf: field(privateDraft, '_csrf'), mediaOperationId: field(privateDraft, 'mediaOperationId'),
                galleryDraftId: field(privateDraft, 'galleryDraftId'),
                galleryDraftRevision: field(privateDraft, 'galleryDraftRevision'),
                submitIntent: 'draft', galleryKnownPhotos: '[]', title: draftTitle, body: '<p>Private recovery draft.</p>'
            })
        }), 200, 'save separate private draft');
        assert((await getText(client, (await saved.json()).editUrl)).includes(draftTitle));

        const page = await getText(client, '/admin/hero-image');
        const operation = field(page, 'heroOperationId');
        const upload = form({ _csrf: field(page, '_csrf'), heroOperationId: operation });
        addPhoto(upload, 'heroImage', await image(74));
        const response = await expectStatus(await client('/admin/hero-image/upload',
            { method: 'POST', body: upload }), 302, 'publish managed hero');
        assert.equal(response.headers.get('location'), '/admin/hero-image');
        const result = await (await expectStatus(await client('/admin/hero-image/operations/' + operation),
            200, 'hero receipt')).json();
        assert.equal(result.state, 'accepted');
        assert.equal(result.generation, operation);
    }
}

function assertExactGrants(gallery, highlights, grantIds) {
    const galleryIds = new Set(gallery.map(item => item.id));
    assert.equal(galleryIds.size, gallery.length, 'Duplicate gallery IDs');
    const highlightIds = highlights.map(item => {
        const match = /^\/uploads\/m1-([0-9a-f-]{36})-medium\.webp$/.exec(item.medium);
        assert(match, 'Invalid managed highlight URL');
        return match[1];
    });
    assert.equal(new Set(highlightIds).size, highlights.length, 'Duplicate highlight IDs');
    assert(highlightIds.every(id => !galleryIds.has(id)), 'Gallery and highlight grants overlap');
    assert.deepEqual(new Set(grantIds), new Set([...galleryIds, ...highlightIds]), 'Unexpected published grant membership');
}

async function acceptedState() {
    const { createPostMediaGrantProvider, readMediaOperation } = await core('models/media-publication.js');
    const { managedMediaSegments } = await core('utils/private-media.js');
    const db = openDatabase();
    try {
        const post = db.prepare('SELECT * FROM posts WHERE slug = ?').get(published);
        assert(post);
        const gallery = post.body_gallery ? JSON.parse(post.body_gallery).items : [];
        const highlights = JSON.parse(post.images);
        assert.equal(gallery.length, site === 'ffg' ? 65 : 0);
        assert.equal(highlights.length, site === 'ffg' ? 2 : 1);
        const operations = db.prepare("SELECT * FROM media_publications WHERE record_type = 'operation' AND state = 'published' ORDER BY id").all();
        assert.equal(operations.length, 1);
        const op = operations[0];
        assert.equal(readMediaOperation(db, op.id, op.owner_user_id).data.receipt.postId, post.id);
        const rows = db.prepare("SELECT id, data FROM media_publications WHERE record_type = 'asset' ORDER BY id").all();
        assert.equal(rows.length, gallery.length + highlights.length);
        const grant = createPostMediaGrantProvider(db);
        const assets = [];
        for (const row of rows) {
            const candidate = JSON.parse(row.data);
            for (const [variant, facts] of Object.entries(candidate.files)) {
                const descriptor = { kind: 'post', id: row.id, variant, url: candidate.image[variant] };
                assert.deepEqual(grant(descriptor), { bytes: facts.bytes, sha256: facts.sha256 });
                const file = path.join(uploads, ...managedMediaSegments(descriptor));
                const content = await fs.readFile(file);
                assert.equal(content.length, facts.bytes);
                assert.equal(digest(content), facts.sha256, 'Accepted media digest mismatch: ' + descriptor.url);
                assets.push({ url: descriptor.url, file, sha256: facts.sha256, bytes: facts.bytes });
            }
        }
        assertExactGrants(gallery, highlights, rows.map(row => row.id));
        const drafts = db.prepare('SELECT * FROM gallery_drafts ORDER BY id').all();
        let privateDraftId;
        if (site === 'ffg') {
            const privateDraft = drafts.find(draft => JSON.parse(draft.fields ?? '{}').form?.title === draftTitle);
            assert(privateDraft);
            assert.equal(readMediaOperation(db, privateDraft.operation_id, privateDraft.owner_user_id).state, 'allocated');
            assert(post.body.includes('<div data-body-gallery></div>'));
            privateDraftId = privateDraft.id;
        }
        return { post, gallery, highlights, assets, drafts, operations, privateDraftId };
    } finally { db.close(); }
}

async function heroState() {
    const { readHeroManifest, readHeroIntegrityStatus, readHeroOperationReceipt } = await hero('heroPublicationManifest.js');
    const manifest = await readHeroManifest(uploads);
    assert.equal(manifest.version, 2);
    assert(manifest.legacySelection);
    assert.equal(manifest.current.kind, 'managed');
    const id = manifest.current.generation;
    const selected = manifest.publications[id];
    const dir = path.join(uploads, '.media', 'hero', id);
    const receipt = await readHeroOperationReceipt(uploads, id, 1);
    assert.equal(receipt.generation, id);
    assert.deepEqual(receipt.previousSelection, { kind: 'legacy', generation: manifest.legacySelection });
    assert.equal((await readHeroIntegrityStatus(uploads)).state, 'ok');
    assert.equal(await fileDigest(path.join(dir, '.source', 'current-source.' + selected.source.extension)), selected.source.sha256);
    for (const [name, facts] of Object.entries(selected.variants)) {
        assert.equal(await fileDigest(path.join(dir, name)), facts.sha256);
    }
    return manifest;
}

async function stateFingerprint() {
    const { createMigrationRunner } = await core('database/migrations.js');
    const ledger = createMigrationRunner().inspect(database);
    assert.deepEqual(ledger.applied, [...baseline, ...forward]);
    assert.deepEqual(ledger.pending, []);
    const history = inspectDb(historyRows);
    assert.equal(history.posts.length, 2);
    const state = await acceptedState();
    const authority = site === 'ffg' ? await heroState() : null;
    announce('accepted state', { integrity: 'ok', journal: 'delete', gallery: state.gallery.length,
        derivatives: state.assets.length, heroVersion: authority?.version ?? null });
    const assets = state.assets.map(({ file, ...asset }) => ({ ...asset, file: path.relative(uploads, file) }));
    console.log(digest(JSON.stringify({ ledger, history, state: { ...state, assets }, authority })));
}

async function httpBytes(client, url, file, conditional = false) {
    const response = await expectStatus(await client(url), 200, url);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(digest(bytes), await fileDigest(file), 'HTTP digest ' + url);
    if (!conditional) return;
    const etag = response.headers.get('etag');
    assert(etag);
    const head = await expectStatus(await client(url, { method: 'HEAD' }), 200, 'HEAD ' + url);
    assert.equal(head.headers.get('etag'), etag);
    assert.equal(Number(head.headers.get('content-length')), bytes.length);
    await expectStatus(await client(url, {
        headers: { 'if-none-match': etag, 'cache-control': 'max-age=0' }
    }), 304, 'conditional ' + url);
}

async function verifyHttp(postMigration) {
    const client = makeClient({ anonymous: true });
    const editor = makeClient();
    await getText(client, '/health');
    const home = await getText(client, '/');
    await expectStatus(await client('/admin/dashboard'), 302, 'anonymous admin');
    await login(editor);
    assert((await getText(client, '/post/' + historical)).includes('Synthetic historical post.'));
    await httpBytes(client, '/uploads/historical.jpg', path.join(uploads, 'historical.jpg'));
    if (site === 'tta') await httpBytes(client, baked, path.join(appRoot, siteName, 'src', 'public', baked));
    let authority;
    if (site === 'ffg') {
        authority = postMigration ? await heroState()
            : JSON.parse(await fs.readFile(path.join(uploads, 'hero', '.current.json'), 'utf8'));
        const legacy = authority.legacySelection ?? authority.generation;
        assert(legacy);
        for (const name of ['current-hero.webp', 'current-hero-og.webp']) {
            await httpBytes(client, '/uploads/hero/' + legacy + '/' + name, path.join(uploads, 'hero', legacy, name));
        }
        await expectStatus(await client('/uploads/hero/' + legacy + '/.source/current-source.jpg'),
            404, 'historical private source');
    }
    if (!postMigration) {
        const { createMigrationRunner } = await core('database/migrations.js');
        const ledger = createMigrationRunner().inspect(database);
        assert.deepEqual(ledger.applied, baseline);
        assert.deepEqual(ledger.pending, []);
        await expectStatus(await client('/post/' + published), 404, 'post-checkpoint article');
        assert.equal(inspectDb(historyRows).posts.length, 1);
        return;
    }
    const state = await acceptedState();
    const page = await getText(client, '/post/' + published);
    if (site === 'ffg') {
        const figures = [...page.matchAll(/<figure>\s*<a href="([^"]+)">\s*<img src="([^"]+)" alt="([^"]+)"[^>]*>\s*<\/a>\s*<figcaption>([^<]+)<\/figcaption>\s*<\/figure>/g)]
            .map(match => match.slice(1));
        assert.deepEqual(figures, state.gallery.map(item => [item.asset.large, item.asset.medium, item.alt, item.caption]));
        assert.equal((page.match(/<sl-carousel-item\b/g) ?? []).length, 2);
        assert((await getText(editor, '/admin/gallery-drafts')).includes(draftTitle));
        const preview = '/admin/gallery-drafts/' + state.privateDraftId + '/preview';
        assert((await getText(editor, preview)).includes(draftTitle));
        const denied = await expectStatus(await client(preview), 302, 'anonymous draft preview');
        assert.equal(denied.headers.get('location'), '/login');
        const id = authority.current.generation;
        assert(home.includes('/uploads/hero/m1-' + id + '/current-hero.webp'), 'Managed hero missing from homepage');
        assert(home.includes('/uploads/hero/m1-' + id + '/current-hero-og.webp'), 'Managed social hero missing from homepage');
        const directory = path.join(uploads, '.media', 'hero', id);
        for (const name of Object.keys(authority.publications[id].variants)) {
            await httpBytes(client, '/uploads/hero/m1-' + id + '/' + name, path.join(directory, name), true);
        }
        const source = authority.publications[id].source.extension;
        await expectStatus(await client('/uploads/hero/m1-' + id + '/.source/current-source.' + source,
            { method: 'HEAD', headers: { 'if-none-match': '*' } }), 404, 'managed private source');
    }
    for (const [index, asset] of state.assets.entries()) {
        await httpBytes(client, asset.url, asset.file, index === 0);
    }
    const direct = '/uploads/' + path.relative(uploads, state.assets[0].file);
    const tempPath = '/uploads/temp/' + temporary;
    assert((await fs.stat(path.join(uploads, 'temp', temporary))).isFile());
    for (const url of [direct, tempPath]) {
        await expectStatus(await client(url), 404, 'private media GET');
        await expectStatus(await client(url, { method: 'HEAD', headers: { 'if-none-match': '*' } }), 404, 'private media HEAD');
    }
    announce('restored HTTP', { derivatives: state.assets.length, gallery: state.gallery.length,
        anonymousPublicRequests: true, editorLogin: true });
}

async function faults() {
    const { assets } = await acceptedState();
    const file = assets[0].file;
    const original = await fs.readFile(file);
    await fs.unlink(file);
    try {
        await assert.rejects(acceptedState, { code: 'ENOENT', path: file });
        const changed = Buffer.from(original);
        changed[changed.length - 1] ^= 1;
        await fs.writeFile(file, changed, { mode: 0o600 });
        await assert.rejects(acceptedState, error => error.code === 'ERR_ASSERTION'
            && error.message.startsWith('Accepted media digest mismatch: ' + assets[0].url));
    } finally { await fs.writeFile(file, original, { mode: 0o600 }); }
    await acceptedState();
    const manifest = await heroState();
    const authority = path.join(uploads, 'hero', '.current.json');
    const text = await fs.readFile(authority);
    await fs.writeFile(authority, '{');
    const { readHeroManifest, readHeroIntegrityStatus } = await hero('heroPublicationManifest.js');
    try {
        await assert.rejects(() => readHeroManifest(uploads), { code: 'HERO_OUTCOME_UNKNOWN' });
        assert.deepEqual((await readHeroIntegrityStatus(uploads)).issues, ['authority-unavailable']);
    } finally { await fs.writeFile(authority, text); }
    await heroState();
    const selected = path.join(uploads, '.media', 'hero', manifest.current.generation, 'current-hero.webp');
    await fs.rename(selected, selected + '.absent');
    try {
        const status = await readHeroIntegrityStatus(uploads);
        assert.equal(status.state, 'degraded');
        assert.deepEqual(status.issues, ['display-unavailable']);
    } finally { await fs.rename(selected + '.absent', selected); }
    await heroState();

    const { createMigrationRunner } = await core('database/migrations.js');
    const db = openDatabase(false);
    try { db.prepare('UPDATE schema_migrations SET checksum = ? WHERE id = ?').run('0'.repeat(64), forward[2]); }
    finally { db.close(); }
    assert.throws(() => createMigrationRunner().inspect(database), /changed migration: 0004_gallery_drafts/);
    await fs.truncate(database, 128);
    assert.throws(() => inspectDb(historyRows), { code: 'SQLITE_CORRUPT' });
    announce('negative fixtures', ['missing/changed bytes', 'invalid/missing hero', 'ledger checksum', 'damaged SQLite']);
}

async function fsProbe() {
    const directory = await fs.mkdtemp(path.join(data, 'sync-'));
    const tmp = path.join(directory, 'pending');
    try {
        const file = await fs.open(tmp, 'wx', 0o600);
        try { await file.writeFile('synthetic'); await file.sync(); }
        finally { await file.close(); }
        await fs.rename(tmp, path.join(directory, 'accepted'));
        for (const parent of [directory, data]) {
            const handle = await fs.open(parent, 'r');
            try { await handle.sync(); } finally { await handle.close(); }
        }
        assert.equal(await fs.readFile(path.join(directory, 'accepted'), 'utf8'), 'synthetic');
        announce('filesystem', 'file sync, rename and directory sync succeeded');
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

async function capacity() {
    const { processImage } = await core('utils/imageProcessor.js');
    const directory = await fs.mkdtemp('/tmp/recovery-capacity-');
    try {
        const width = 4000, height = 3000, channels = 3;
        const source = path.join(directory, 'sample.jpg');
        const sharp = requireApp('sharp');
        await sharp(randomBytes(width * height * channels), { raw: { width, height, channels } })
            .jpeg({ quality: 92 }).toFile(source);
        const derivatives = path.join(directory, 'derivatives');
        await processImage(source, 'sample.jpg', derivatives);
        const measurements = await Promise.all((await fs.readdir(derivatives))
            .map(async file => (await fs.stat(path.join(derivatives, file))).size));
        const blocks = (await fs.statfs(data)).bsize;
        const allocated = measurements.reduce((sum, size) => sum + Math.ceil(size / blocks) * blocks, blocks);
        const raw = (await fs.stat(source)).size;
        const derived = measurements.reduce((sum, size) => sum + size, 0);
        // Conservative projection with two derivative trees, one nearly incompressible archive
        // and a full incoming batch. Native checkpoints separately measure actual archive sizes.
        announce('gallery capacity', {
            rawBytesPerPhoto: raw, derivedBytesPerPhoto: derived, allocatedBytesPerPhoto: allocated,
            projections: [65, 100].map(n => ({ photos: n,
                extraBytes: n * (raw + 2 * allocated + derived + 4096), extraInodes: 8 * n + 2 }))
        });
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

if (mode === '--self-test') {
    assert.equal(field('<input value="one" name="_csrf">', '_csrf'), 'one');
    assert.throws(() => field('<input name="unrelated">', '_csrf'), /Missing required/);
    await assert.rejects(makeClient()('https://outside.invalid/'), { code: 'ERR_ASSERTION' });
    assert.equal(form({ number: 42 }).get('number'), '42');
    const galleryId = '10000000-0000-4000-8000-000000000001';
    const highlightId = '10000000-0000-4000-8000-000000000002';
    const unexpectedId = '10000000-0000-4000-8000-000000000003';
    const gallery = [{ id: galleryId }];
    const highlight = id => ({ medium: '/uploads/m1-' + id + '-medium.webp' });
    assertExactGrants(gallery, [highlight(highlightId)], [galleryId, highlightId]);
    assert.throws(() => assertExactGrants(gallery, [highlight(galleryId)], [galleryId, highlightId]), /grants overlap/);
    assert.throws(() => assertExactGrants(gallery, [highlight(highlightId), highlight(highlightId)],
        [galleryId, highlightId, unexpectedId]), /Duplicate highlight IDs/);
    assert.throws(() => assertExactGrants(gallery, [highlight(highlightId)], [galleryId, unexpectedId]), /grant membership/);
    const anonymous = makeClient({ anonymous: true });
    const originalFetch = globalThis.fetch;
    try {
        let requests = 0;
        globalThis.fetch = async (_url, { headers }) => {
            assert(!headers.has('cookie'));
            assert(!headers.has('authorization'));
            requests++;
            return new Response(null, { headers: { 'set-cookie': 'synthetic=editor' } });
        };
        await anonymous('/test');
        await anonymous('/test');
        for (const name of ['Cookie', 'Authorization', 'X-CSRF-Token']) {
            await assert.rejects(anonymous('/test', { headers: { [name]: 'synthetic' } }), /Anonymous request supplied/);
        }
        assert.equal(requests, 2);
        globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: '/login' } });
        await assert.rejects(() => getText(anonymous, '/protected'), /returned HTTP 302, expected 200/);
    } finally { globalThis.fetch = originalFetch; }
    console.log('Recovery fixture parsing, loopback, grant membership and anonymous-client controls passed');
} else {
    assert(siteName, 'Expected FFG or TTA');
    assert.equal(process.getuid(), 1001);
    assert.equal(process.getgid(), 1001);
    process.umask(0o077);
    if (mode === 'seed' || mode === 'publish' || mode.startsWith('http-')) {
        assert.match(process.env.RECOVERY_PASSWORD ?? '', /^[a-f0-9]{48}$/);
    }
    const actions = { seed, migrate, publish: () => publish(makeClient()), fingerprint: stateFingerprint,
        'http-pre': () => verifyHttp(false), 'http-post': () => verifyHttp(true),
        'http-health': () => getText(makeClient(), '/health'), faults, 'fs-probe': fsProbe, capacity };
    assert(Object.hasOwn(actions, mode), 'Unknown synthetic fixture operation');
    await actions[mode]();
}
