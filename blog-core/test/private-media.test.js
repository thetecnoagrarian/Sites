import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import sharp from 'sharp';
import { mountMediaServing } from '../src/middleware/media-serving.js';
import { createPrivateCandidate, verifyPrivateCandidate, inspectPostCandidate,
    preparePostCandidate, managedMediaUrl } from '../src/utils/private-media.js';
import { processImage } from '../src/utils/imageProcessor.js';
import { ownedUploadDirectory, reserveUploadFilename, recordOwnedUpload } from '../src/middleware/owned-upload.js';
import { processHeroImage } from '../../fruitionforestgarden/src/utils/heroImageProcessor.js';

const unknownId = '11111111-1111-4111-8111-111111111111';

async function fixture(t, nested = true) {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'sites-private-media-'));
    let server;
    t.after(async () => {
        try { if (server?.listening) await new Promise(resolve => server.close(resolve)); }
        finally { await fs.rm(directory, { recursive: true, force: true }); }
    });
    const publicPath = path.join(directory, 'public');
    const uploadsPath = nested ? path.join(publicPath, 'uploads') : path.join(directory, 'volume', 'uploads');
    await fs.mkdir(publicPath, { recursive: true });
    await fs.mkdir(uploadsPath, { recursive: true });
    await fs.writeFile(path.join(publicPath, 'ordinary.txt'), 'ordinary public asset');
    await fs.writeFile(path.join(uploadsPath, 'legacy.webp'), 'existing legacy image');
    const png = await sharp({ create: { width: 1200, height: 600, channels: 3,
        background: { r: 50, g: 100, b: 150 } } }).png().toBuffer();
    const rawReq = {};
    const rawDirectory = await ownedUploadDirectory(rawReq, path.join(uploadsPath, 'temp'));
    const inputPath = path.join(rawDirectory, 'input.png');
    await reserveUploadFilename(rawReq, 'input.png');
    await fs.writeFile(inputPath, png, { flag: 'wx' });
    await recordOwnedUpload(rawReq, { filename: 'input.png', path: inputPath });
    const grants = new Map();
    const calls = [];
    const provider = async descriptor => { calls.push(descriptor); return grants.get(descriptor.url); };
    const providers = { post: provider, hero: provider };
    const app = express();
    mountMediaServing(app, { publicPath, uploadsPath, publicationProviders: providers, production: true,
        privateUploadPathPatterns: [/^\/hero\/[0-9a-f-]+\/\.source(?:\/|$)/] });
    app.use((req, res) => res.set('X-Fell-Through', 'yes').status(418).send('fallthrough'));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    // Raw http.request preserves dot segments and encodings that fetch/URL
    // would normalize before sending, so these are actual ingress attempts.
    const get = (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port: server.address().port, path: url, method, headers }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.end();
    });
    const prepare = options => preparePostCandidate({ uploadsPath, inputPath, ...options });
    return { directory, publicPath, uploadsPath, inputPath, png, grants, calls, providers, get, prepare };
}

async function denied(f, url, headers, method) {
    const result = await f.get(url, headers, method);
    assert.equal(result.status, 404, url);
    assert.equal(result.headers['cache-control'], 'no-store', url);
    assert.equal(result.headers['x-fell-through'], undefined, url);
    assert.equal(result.body.toString(), method === 'HEAD' ? '' : 'Not found', url);
    assert.ok(!result.body.toString().includes(f.directory));
    return result;
}

for (const nested of [true, false]) {
    test(`${nested ? 'public-tree' : 'external-volume'} storage: private paths and aliases cannot reach either static handler`, async t => {
        const f = await fixture(t, nested);
        const prepared = await f.prepare();
        const id = prepared.candidate.id;
        const file = `m1-${id}-large.webp`;
        const privatePath = `/uploads/.media/post/${id}/${file}`;
        const raw = `/uploads/${path.relative(await fs.realpath(f.uploadsPath), f.inputPath).split(path.sep).join('/')}`;
        await fs.mkdir(path.join(f.uploadsPath, 'hero', unknownId, '.source'), { recursive: true });
        await fs.writeFile(path.join(f.uploadsPath, 'hero', unknownId, '.source', 'original.png'), f.png);
        await fs.symlink(prepared.candidate.directory, path.join(f.publicPath, 'candidate-alias'));
        await fs.symlink(await fs.realpath(f.uploadsPath), path.join(f.publicPath, 'upload-alias'));
        await fs.mkdir(path.join(f.publicPath, 'index-alias'));
        await fs.symlink(path.join(prepared.candidate.directory, file), path.join(f.publicPath, 'index-alias', 'index.html'));
        await fs.mkdir(path.join(f.uploadsPath, 'index-alias'));
        await fs.symlink(path.join(prepared.candidate.directory, file), path.join(f.uploadsPath, 'index-alias', 'index.html'));
        const attempts = [privatePath, raw, '/uploads/temp/not-present.png',
            `/uploads/hero/${unknownId}/.source/original.png`,
            `/uploads/hero/${unknownId}/%2esource/original.png`,
            privatePath.replace('.media', '%2emedia'), privatePath.replace('uploads', '%75ploads'),
            privatePath.replace('/.media/', '%2f.media%2f'), privatePath.replace('.media', '%252emedia'),
            `/uploads/../uploads/.media/post/${id}/${file}`, `/uploads/%2e%2e/uploads/.media/post/${id}/${file}`,
            privatePath.replace('/uploads/', '/uploads%5c'), privatePath.replace('/uploads/', '/uploads//'),
            privatePath.replace('/uploads/', '/UPLOADS/'), `/candidate-alias/${file}`,
            `/upload-alias/.media/post/${id}/${file}`, '/uploads/%zz', '/uploads/%00.webp',
            '/uploads/%2574emp/input.png', '/uploads/%ff', `/uploads/.MEDIA/post/${id}/${file}`,
            '/index-alias', '/index-alias/', '/uploads/index-alias/'];
        for (const url of attempts) await denied(f, url);
        await denied(f, privatePath, {}, 'POST');
        await denied(f, raw, {}, 'HEAD');
        assert.deepEqual(await fs.readFile(f.inputPath), f.png);
        assert.equal(f.calls.length, 0, 'Private paths must be rejected before provider lookup');
    });

    test(`${nested ? 'public-tree' : 'external-volume'} legacy URLs preserve bytes, MIME, caching and conditional GET`, async t => {
        const f = await fixture(t, nested);
        const legacy = await f.get('/uploads/legacy.webp');
        assert.equal(legacy.status, 200);
        assert.equal(legacy.body.toString(), 'existing legacy image');
        assert.match(legacy.headers['content-type'], /^image\/webp/);
        assert.equal(legacy.headers['cache-control'], `public, max-age=${nested ? 3600 : 604800}`);
        assert.equal((await f.get('/uploads/legacy.webp', { 'If-None-Match': legacy.headers.etag })).status, 304);
        await fs.writeFile(path.join(f.uploadsPath, 'legacy #?.webp'), 'encoded legacy filename');
        assert.equal((await f.get('/uploads/legacy%20%23%3F.webp')).body.toString(), 'encoded legacy filename');
        const hero = path.join(f.uploadsPath, 'hero', unknownId);
        await fs.mkdir(hero, { recursive: true });
        await fs.writeFile(path.join(hero, 'current-hero.webp'), 'legacy hero');
        assert.equal((await f.get(`/uploads/hero/${unknownId}/current-hero.webp`)).body.toString(), 'legacy hero');
        assert.equal((await f.get('/ordinary.txt')).body.toString(), 'ordinary public asset');
        assert.equal(f.calls.length, 0, 'Legacy compatibility must not invent publication grants');
    });
}

test('public-tree legacy precedence remains intact when uploads use an external volume', async t => {
    const f = await fixture(t, false);
    await fs.mkdir(path.join(f.publicPath, 'uploads'));
    await fs.writeFile(path.join(f.publicPath, 'uploads', 'legacy.webp'), 'public-tree original');
    const result = await f.get('/uploads/legacy.webp');
    assert.equal(result.body.toString(), 'public-tree original');
    assert.equal(result.headers['cache-control'], 'public, max-age=3600');
});

test('managed serving is deny-by-default, never falls through, and authorizes before GET/HEAD/304', async t => {
    const f = await fixture(t);
    const prepared = await f.prepare();
    const url = prepared.image.large;
    // A public-tree decoy must not bypass the provider.
    await fs.writeFile(path.join(f.uploadsPath, path.basename(url)), 'unsafe static decoy');
    await denied(f, url);
    await denied(f, `/uploads/m1-${unknownId}-large.webp`);
    for (const invalid of ['/uploads/m1-invalid-large.webp', `/uploads/m1-${unknownId}-source.webp`,
        url.replace('m1-', 'M1-'), url.replace('/uploads/', '/%75ploads/'),
        url.replace('m1-', '%6d1-'), `${url}/extra`]) await denied(f, invalid);
    const provider = f.providers.post;
    delete f.providers.post;
    await denied(f, url);
    f.providers.post = () => ({ path: f.inputPath });
    await denied(f, url);
    f.providers.post = () => true;
    await denied(f, url);
    f.providers.post = () => { throw new Error('Synthetic private database detail'); };
    await denied(f, url);
    f.providers.post = provider;
    f.grants.set(url, prepared.files.large);
    const result = await f.get(url);
    assert.equal(result.status, 200);
    assert.match(result.headers['content-type'], /^image\/webp/);
    assert.deepEqual(result.body, await fs.readFile(path.join(prepared.candidate.directory, path.basename(url))));
    assert.equal(result.headers['cache-control'], 'public, max-age=604800');
    const calls = f.calls.length;
    assert.equal((await f.get(url, { 'If-None-Match': result.headers.etag })).status, 304);
    assert.equal(f.calls.length, calls + 1);
    const head = await f.get(url, {}, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    f.grants.delete(url);
    await denied(f, url, { 'If-None-Match': result.headers.etag });
    await denied(f, url, { 'If-Modified-Since': result.headers['last-modified'] });
    await denied(f, url, { 'If-None-Match': '*' }, 'HEAD');
    const missing = await denied(f, `/uploads/m1-${unknownId}-medium.webp`);
    const existing = await denied(f, url);
    assert.deepEqual(existing.body, missing.body);
    assert.equal(existing.headers['content-type'], missing.headers['content-type']);
    assert.equal((await f.get('/not-a-static-file')).headers['x-fell-through'], 'yes');
});

test('post preparation uses unchanged profiles and proportions, verifies all variants, and never publishes', async t => {
    const f = await fixture(t);
    const prepared = await f.prepare();
    for (const [variant, dimensions] of Object.entries({ thumbnail: [400, 200], medium: [800, 400], large: [1200, 600] })) {
        const metadata = prepared.files[variant];
        assert.deepEqual([metadata.width, metadata.height], dimensions);
        assert.ok(metadata.bytes > 0);
        assert.match(metadata.sha256, /^[0-9a-f]{64}$/);
        await denied(f, prepared.image[variant]);
    }
    assert.deepEqual(await fs.readFile(f.inputPath), f.png);
    assert.deepEqual((await fs.readdir(f.uploadsPath)).sort(), ['.media', 'legacy.webp', 'temp']);
    await assert.rejects(verifyPrivateCandidate({ ...prepared.candidate }), /Unrecognized/);
    await assert.rejects(inspectPostCandidate(prepared.candidate, { ...prepared.image, medium: '/uploads/other.webp' }), /Invalid candidate variant/);
    await assert.rejects(inspectPostCandidate(prepared.candidate, { ...prepared.image, originalWidth: 0 }), /Invalid candidate metadata/);
    await assert.rejects(inspectPostCandidate(prepared.candidate, { ...prepared.image, unexpected: true }), /Invalid candidate metadata/);
    await fs.writeFile(path.join(prepared.candidate.directory, path.basename(prepared.image.medium)), 'not an image');
    await assert.rejects(inspectPostCandidate(prepared.candidate, prepared.image));
    await denied(f, prepared.image.medium);
});

test('hero candidates use the existing processor but remain private, including retained source', async t => {
    const f = await fixture(t);
    const candidate = await createPrivateCandidate(f.uploadsPath, 'hero');
    const result = await processHeroImage(f.inputPath, candidate.directory);
    await verifyPrivateCandidate(candidate);
    assert.deepEqual(result.heroDimensions, { width: 1200, height: 600 });
    assert.deepEqual(result.ogDimensions, { width: 1200, height: 630 });
    for (const filename of ['current-hero.webp', 'current-hero-og.webp']) {
        const url = managedMediaUrl('hero', candidate.id, filename);
        await denied(f, url);
        f.grants.set(url, true);
        const served = await f.get(url);
        assert.equal(served.status, 200);
        assert.deepEqual(served.body, await fs.readFile(path.join(candidate.directory, filename)));
    }
    await denied(f, `/uploads/hero/m1-${candidate.id}/.source/current-source.png`);
    await denied(f, `/uploads/.media/hero/${candidate.id}/.source/current-source.png`);
    assert.deepEqual(await fs.readFile(path.join(candidate.directory, '.source', 'current-source.png')), f.png);
    await assert.rejects(fs.stat(path.join(f.uploadsPath, 'hero', '.current.json')), { code: 'ENOENT' });
});

test('portrait post candidates keep the full photograph and unchanged size profiles', async t => {
    const f = await fixture(t);
    const portrait = await sharp({ create: { width: 600, height: 1200, channels: 3,
        background: { r: 20, g: 80, b: 40 } } }).png().toBuffer();
    await fs.writeFile(f.inputPath, portrait);
    const prepared = await f.prepare();
    for (const [variant, dimensions] of Object.entries({ thumbnail: [200, 400], medium: [400, 800], large: [600, 1200] })) {
        assert.deepEqual([prepared.files[variant].width, prepared.files[variant].height], dimensions);
    }
    assert.deepEqual(await fs.readFile(f.inputPath), portrait);
});

test('interrupted hero processing retains source/display privately without changing selection', async t => {
    const f = await fixture(t);
    const candidate = await createPrivateCandidate(f.uploadsPath, 'hero');
    await assert.rejects(processHeroImage(f.inputPath, candidate.directory, { onPhase: async phase => {
        if (phase === 'social-generation') throw new Error('Synthetic hero interruption');
    } }), /Synthetic hero interruption/);
    assert.ok((await fs.readFile(path.join(candidate.directory, 'current-hero.webp'))).length);
    assert.deepEqual(await fs.readFile(path.join(candidate.directory, '.source', 'current-source.png')), f.png);
    for (const variant of ['current-hero.webp', 'current-hero-og.webp']) {
        await denied(f, managedMediaUrl('hero', candidate.id, variant));
    }
    await assert.rejects(fs.stat(path.join(f.uploadsPath, 'hero', '.current.json')), { code: 'ENOENT' });
});

for (const phase of ['partial', 'missing', 'interrupted']) {
    test(`${phase} preparation rejects and retains bytes only in private storage`, async t => {
        const f = await fixture(t);
        let candidate;
        await assert.rejects(f.prepare({ onPhase: async (name, current) => {
            candidate = current;
            if (name === 'before-process' && phase === 'interrupted') throw new Error('Synthetic interruption');
        }, processor: async (input, filename, output) => {
            if (phase === 'partial') {
                await sharp(input).resize(400, 400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85, effort: 4 })
                    .toFile(path.join(output, `${path.parse(filename).name}-thumbnail.webp`));
                throw new Error('Synthetic processing interruption');
            }
            const image = await processImage(input, filename, output);
            await fs.unlink(path.join(output, path.basename(image.large)));
            return image;
        } }));
        await verifyPrivateCandidate(candidate);
        for (const variant of ['thumbnail', 'medium', 'large']) await denied(f, managedMediaUrl('post', candidate.id, variant));
        assert.deepEqual((await fs.readdir(f.uploadsPath)).sort(), ['.media', 'legacy.webp', 'temp']);
        if (phase === 'partial') assert.equal((await fs.readdir(candidate.directory)).length, 1);
    });
}

for (const replacement of ['symlink', 'directory']) {
    test(`candidate ${replacement} replacement is rejected before the processor writes`, async t => {
        const f = await fixture(t);
        const target = path.join(f.directory, 'unrelated');
        await fs.mkdir(target);
        await assert.rejects(f.prepare({ onPhase: async (phase, candidate) => {
            if (phase !== 'before-process') return;
            await fs.rename(candidate.directory, `${candidate.directory}-retained`);
            if (replacement === 'symlink') await fs.symlink(target, candidate.directory);
            else await fs.mkdir(candidate.directory);
        } }), /Unsafe media path|Candidate directory changed/);
        assert.deepEqual(await fs.readdir(target), []);
    });
}

test('symlinked private root and arbitrary or symlinked raw input are rejected', async t => {
    const f = await fixture(t);
    const target = path.join(f.directory, 'outside');
    await fs.mkdir(target);
    await fs.symlink(target, path.join(f.uploadsPath, '.media'));
    await assert.rejects(f.prepare(), /Unsafe media path/);
    assert.deepEqual(await fs.readdir(target), []);
    await assert.rejects(f.prepare({ inputPath: path.join(f.publicPath, 'ordinary.txt') }), /Expected a private raw upload/);
    await fs.rename(f.inputPath, `${f.inputPath}-retained`);
    await fs.symlink(`${f.inputPath}-retained`, f.inputPath);
    await assert.rejects(f.prepare(), /Unsafe media path/);
});

test('authorized requests still reject missing, symlinked and hardlinked private files', async t => {
    const f = await fixture(t);
    const prepared = await f.prepare();
    const url = prepared.image.large;
    f.grants.set(url, prepared.files.large);
    const file = path.join(prepared.candidate.directory, path.basename(url));
    await fs.rename(file, `${file}-retained`);
    await denied(f, url);
    await fs.symlink(path.join(f.uploadsPath, 'legacy.webp'), file);
    await denied(f, url);
    await fs.unlink(file);
    await fs.link(path.join(f.uploadsPath, 'legacy.webp'), file);
    await denied(f, url);
    assert.equal(await fs.readFile(path.join(f.uploadsPath, 'legacy.webp'), 'utf8'), 'existing legacy image');
});

test('private-root permission failure rejects preparation and public access', async t => {
    const f = await fixture(t);
    const prepared = await f.prepare();
    const media = path.join(f.uploadsPath, '.media');
    await fs.chmod(media, 0o000);
    try {
        await assert.rejects(f.prepare());
        f.grants.set(prepared.image.large, prepared.files.large);
        await denied(f, prepared.image.large);
    } finally { await fs.chmod(media, 0o700); }
});

test('synthetic authorization overhead is observable without a new cache', async t => {
    const f = await fixture(t);
    const prepared = await f.prepare();
    f.grants.set(prepared.image.medium, prepared.files.medium);
    const timings = {};
    for (const [label, url] of [['legacy', '/uploads/legacy.webp'], ['authorized', prepared.image.medium], ['denied', prepared.image.large]]) {
        const start = performance.now();
        for (let index = 0; index < 30; index++) assert.equal((await f.get(url)).status, label === 'denied' ? 404 : 200);
        timings[label] = (performance.now() - start) / 30;
        t.diagnostic(`${label}: 30 sequential loopback requests, ${timings[label].toFixed(3)}ms/request; in-memory synthetic provider only`);
    }
    t.diagnostic(`Observed managed-minus-legacy difference: ${(timings.authorized - timings.legacy).toFixed(3)}ms/request; small local sample, not a production capacity result`);
});
