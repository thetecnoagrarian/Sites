import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import sharp from 'sharp';
import logger from '../blog-core/src/utils/logger.js';
import { mountMediaServing } from '../blog-core/src/middleware/media-serving.js';
import { ownedUploadDirectory, reserveUploadFilename, recordOwnedUpload } from '../blog-core/src/middleware/owned-upload.js';
import { allocateHeroOperation, publishHeroImage, resetHeroImage, createHeroPublicationProvider,
  managedGenerationPath, manifestPath, readCurrentGeneration, resolveHeroImage, resolveHeroSocialImage,
  readHeroIntegrityStatus, readHeroOperationReceipt, parseManifest } from '../fruitionforestgarden/src/utils/heroImageStore.js';
import { readHeroManifest } from '../fruitionforestgarden/src/utils/heroPublicationManifest.js';
import * as peer from '../fruitionforestgarden/src/utils/heroPublicationManifest.js?second-writer';

const uuid = '11111111-1111-4111-8111-111111111111';
const gate = () => Promise.withResolvers();
const unknown = { code: 'HERO_OUTCOME_UNKNOWN', heroOutcome: 'unknown' };

async function fixture(t, nested = false) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'ffg-managed-hero-')));
  let server;
  t.after(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const publicPath = path.join(root, 'public');
  const uploadsPath = nested ? path.join(publicPath, 'uploads') : path.join(root, 'volume', 'uploads');
  const images = path.join(publicPath, 'images');
  await fs.mkdir(uploadsPath, { recursive: true }); await fs.mkdir(images, { recursive: true });
  await sharp({ create: { width: 32, height: 16, channels: 3, background: '#246842' } }).webp().toFile(path.join(images, 'HeroCamp.webp'));
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#246842' } }).webp().toFile(path.join(images, 'HeroCamp-og.webp'));
  const logs = [];
  t.mock.method(logger, 'error', (record, message) => logs.push({ ...record, message }));
  const hero = createHeroPublicationProvider(uploadsPath), app = express();
  mountMediaServing(app, { publicPath, uploadsPath, production: true,
    publicationProviders: { hero: hero.authorize }, publicationIntegrityVerifiers: { hero: hero.verifyOpenedFile } });
  app.use((req, res) => res.status(418).set('X-Fell-Through', 'yes').end());
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const get = (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path: url, headers, method }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(4000, () => req.destroy(new Error('Synthetic HTTP timeout'))); req.on('error', reject); req.end();
  });
  const raw = async (color = '#246842') => {
    const bytes = await sharp({ create: { width: 120, height: 60, channels: 3, background: color } }).png().toBuffer();
    const owner = {}, dir = await ownedUploadDirectory(owner, path.join(uploadsPath, 'temp'));
    const filename = 'synthetic.png', file = path.join(dir, filename);
    await reserveUploadFilename(owner, filename); await fs.writeFile(file, bytes, { flag: 'wx' });
    await recordOwnedUpload(owner, { filename, path: file });
    return file;
  };
  const operation = async (action = 'publish', color) => ({
    operationId: await allocateHeroOperation(uploadsPath, 1, action), ownerUserId: 1,
    ...(action === 'publish' ? { inputPath: await raw(color) } : {})
  });
  const publish = (op, options = {}) => publishHeroImage({ uploadsPath, ...op, ...options });
  const reset = op => resetHeroImage(uploadsPath, op);
  const url = (id, social = false) => `/uploads/hero/m1-${id}/current-hero${social ? '-og' : ''}.webp`;
  return { root, publicPath, uploadsPath, images, logs, get, raw, operation, publish, reset, url };
}
async function denied(f, url, headers = {}, method = 'GET') {
  const result = await f.get(url, headers, method);
  assert.equal(result.status, 404); assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['x-fell-through'], undefined);
  assert.equal(result.body.toString(), method === 'HEAD' ? '' : 'Not found');
}

for (const nested of [true, false]) {
  test(`${nested ? 'public-tree' : 'volume'} actual managed authority gates GET/HEAD/304 and retains history`, async t => {
    const f = await fixture(t, nested), op = await f.operation();
    const before = await fs.readFile(manifestPath(f.uploadsPath), 'utf8');
    await denied(f, `/uploads/hero/${op.operationId}/current-hero.webp`);
    let prepared;
    const result = await f.publish(op, { onPhase: async phase => {
      if (phase !== 'manifest-write') return;
      prepared = await fs.readFile(path.join(managedGenerationPath(f.uploadsPath, op.operationId), 'current-hero.webp'));
      await denied(f, f.url(op.operationId));
      await denied(f, f.url(op.operationId), { 'If-None-Match': '*' });
      await denied(f, f.url(op.operationId), {}, 'HEAD');
      assert.equal(await fs.readFile(manifestPath(f.uploadsPath), 'utf8'), before);
    } });
    const served = await f.get(result.descriptor.path);
    assert.equal(served.status, 200); assert.match(served.headers['content-type'], /^image\/webp/);
    assert.deepEqual(served.body, prepared);
    await denied(f, `/uploads/hero/${op.operationId}/current-hero.webp`);
    const head = await f.get(result.descriptor.path, {}, 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.body.length, 0);
    assert.equal(head.headers['content-length'], String(prepared.length));
    assert.equal((await f.get(result.descriptor.path, { 'If-None-Match': served.headers.etag })).status, 304);
    const secondOp = await f.operation('publish', '#982345'), second = await f.publish(secondOp);
    assert.notEqual(second.generation, result.generation);
    const receiptBefore = await readHeroManifest(f.uploadsPath);
    assert.equal(receiptBefore.revision, 2); assert.equal(Object.keys(receiptBefore.publications).length, 2);
    const retry = await f.publish(op);
    assert.deepEqual(retry.receipt, result.receipt);
    assert.equal(await readCurrentGeneration(f.uploadsPath), second.generation, 'A stale accepted retry must not reselect');
    await f.reset(await f.operation('reset'));
    assert.equal(await readCurrentGeneration(f.uploadsPath), null);
    for (const accepted of [result, second]) assert.equal((await f.get(accepted.descriptor.path)).status, 200);
    const snapshot = await readHeroManifest(f.uploadsPath);
    assert.equal(snapshot.revision, 3); assert.equal(Object.keys(snapshot.publications).length, 2);
    await denied(f, f.url(uuid));
    for (const attempt of [
      `/uploads/.media/hero/${op.operationId}/current-hero.webp`,
      `/uploads/hero/m1-${op.operationId}/.source/current-source.png`,
      `/uploads/hero/m1-${op.operationId}/%2esource/current-source.png`,
      f.url(op.operationId).replace('/uploads/', '/%75ploads/'),
      f.url(op.operationId).replace('/hero/', '/hero%2f'), '/uploads/%zz',
      `/uploads/%2e%2e/uploads/.media/hero/${op.operationId}/current-hero.webp`
    ]) await denied(f, attempt);
    const shadow = path.join(f.publicPath, f.url(uuid).slice(1)); await fs.mkdir(path.dirname(shadow), { recursive: true });
    await fs.writeFile(shadow, 'synthetic public shadow'); await denied(f, f.url(uuid));
    const legacy = path.join(f.uploadsPath, 'legacy.webp'); await fs.writeFile(legacy, 'legacy bytes');
    assert.equal((await f.get('/uploads/legacy.webp')).body.toString(), 'legacy bytes');
  });
}

for (const phase of ['source-validation', 'display-generation', 'social-generation', 'verification',
  'file-sync', 'directory-sync', 'manifest-write', 'manifest-sync', 'manifest-rename']) {
  test(`failure at ${phase} grants no managed visibility`, async t => {
    const f = await fixture(t), op = await f.operation();
    const before = await fs.readFile(manifestPath(f.uploadsPath), 'utf8');
    await assert.rejects(f.publish(op, { onPhase: p => { if (p === phase) throw new Error('Synthetic boundary failure'); } }));
    assert.equal(await fs.readFile(manifestPath(f.uploadsPath), 'utf8'), before);
    await denied(f, f.url(op.operationId)); await denied(f, f.url(op.operationId, true));
    assert.deepEqual((await readHeroManifest(f.uploadsPath)).publications, {});
  });
}

test('strict v2 schema rejects malformed grants and v1 read/upgrade preserves legacy evidence', async t => {
  const f = await fixture(t), file = manifestPath(f.uploadsPath);
  await fs.mkdir(path.dirname(file));
  const v1 = JSON.stringify({ generation: uuid }); await fs.writeFile(file, v1);
  assert.equal(await readCurrentGeneration(f.uploadsPath), uuid);
  assert.equal(await fs.readFile(file, 'utf8'), v1);
  const op = await f.operation(); assert.equal(await fs.readFile(file, 'utf8'), v1);
  await denied(f, f.url(uuid));
  const result = await f.publish(op), state = await readHeroManifest(f.uploadsPath);
  assert.equal(state.legacySelection, uuid); assert.equal(state.current.kind, 'managed');
  assert.deepEqual(Object.keys(state.publications), [result.generation]);
  for (const mutate of [
    s => s.version = 3, s => s.revision--, s => s.publications[result.generation].variants['current-hero.webp'].bytes++,
    s => s.operations[op.operationId].ownerUserId++, s => s.current = { kind: 'managed', generation: uuid },
    s => s.publications[result.generation].unexpected = true
  ]) {
    const changed = structuredClone(state); mutate(changed);
    if (changed.publications[result.generation].variants['current-hero.webp'].bytes !== state.publications[result.generation].variants['current-hero.webp'].bytes) {
      // Structurally valid metadata changes still cannot pass byte verification.
      await fs.writeFile(file, JSON.stringify(changed)); await denied(f, result.descriptor.path);
      await fs.writeFile(file, JSON.stringify(state));
    } else assert.throws(() => parseManifest(JSON.stringify(changed)));
  }
});

test('duplicate authority keys fail closed, including escaped grant, selection and receipt keys', async t => {
  const f = await fixture(t), op = await f.operation(), accepted = await f.publish(op);
  const file = manifestPath(f.uploadsPath), original = await fs.readFile(file, 'utf8');
  const id = op.operationId;
  const escapedId = `\\u${id.charCodeAt(0).toString(16).padStart(4, '0')}${id.slice(1)}`;
  const cases = [
    original.replace('"version":2', '"version":3,"version":2'),
    original.replace('"publications":', '"publications":{},"publications":'),
    original.replace(`"publications":{"${id}":`, `"publications":{"${escapedId}":null,"${id}":`),
    original.replace('"current":', '"cu\\u0072rent":null,"current":'),
    original.replace('"ownerUserId":1', '"ownerUserId":2,"ownerUserId":1'),
    original.replace('"operations":', '"operations":{},"operations":')
  ];
  for (const duplicate of cases) {
    assert.notEqual(duplicate, original);
    // Ordinary JSON parsing collapses these contradictions to the accepted object.
    assert.deepEqual(JSON.parse(duplicate), JSON.parse(original));
    assert.throws(() => parseManifest(duplicate), { code: 'HERO_REJECTED' });
    await fs.writeFile(file, duplicate);
    await denied(f, accepted.descriptor.path, { 'If-None-Match': '*' });
    await assert.rejects(readHeroOperationReceipt(f.uploadsPath, id, 1), unknown);
  }
  assert.throws(() => parseManifest(`{"generation":null,"generation":"${uuid}"}`), { code: 'HERO_REJECTED' });
  await fs.writeFile(file, original);
  assert.deepEqual(await readHeroOperationReceipt(f.uploadsPath, id, 1), accepted.receipt);
  assert.equal((await f.get(accepted.descriptor.path)).status, 200);
});

test('changed-input and owner/action retries reject without touching accepted bytes', async t => {
  const f = await fixture(t), op = await f.operation(), accepted = await f.publish(op);
  const before = await fs.readFile(manifestPath(f.uploadsPath), 'utf8');
  await assert.rejects(f.publish({ ...op, inputPath: await f.raw('#993322') }));
  await assert.rejects(f.publish({ ...op, ownerUserId: 2 }));
  await assert.rejects(f.reset(op));
  await assert.rejects(f.publish({ ...op, operationId: uuid }));
  assert.equal(await fs.readFile(manifestPath(f.uploadsPath), 'utf8'), before);
  assert.equal((await f.get(accepted.descriptor.path)).status, 200);
});

function openFault(t, predicate, method, fail) {
  const nativeOpen = fs.open.bind(fs);
  const mocked = t.mock.method(fs, 'open', async (file, ...args) => {
    const handle = await nativeOpen(file, ...args);
    if (!predicate(file)) return handle;
    return new Proxy(handle, { get(target, key) {
      if (key === method) return (...values) => fail(target, ...values);
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  });
  return () => mocked.mock.restore();
}
const ioFailure = () => Object.assign(new Error('SYNTHETIC_PRIVATE_FILESYSTEM_FAILURE'), { code: 'EIO' });

for (const kind of ['variant-sync', 'candidate-directory-sync', 'temporary-sync', 'partial-temporary-write', 'rename']) {
  test(`actual ${kind} failure leaves authority unchanged and candidate private`, async t => {
    const f = await fixture(t), op = await f.operation(), before = await fs.readFile(manifestPath(f.uploadsPath), 'utf8');
    let restore;
    if (kind === 'rename') {
      const patched = t.mock.method(fs, 'rename', async () => { throw ioFailure(); });
      restore = () => patched.mock.restore();
    } else {
      const temporary = file => path.dirname(file) === path.join(f.uploadsPath, 'hero') && path.basename(file).startsWith('.current-');
      const match = kind === 'variant-sync' ? file => file === path.join(managedGenerationPath(f.uploadsPath, op.operationId), 'current-hero.webp')
        : kind === 'candidate-directory-sync' ? file => file === managedGenerationPath(f.uploadsPath, op.operationId) : temporary;
      restore = openFault(t, match, kind === 'partial-temporary-write' ? 'writeFile' : 'sync', async handle => {
        if (kind === 'partial-temporary-write') await handle.writeFile('{');
        throw ioFailure();
      });
    }
    await assert.rejects(f.publish(op), { code: 'EIO' }); restore();
    assert.equal(await fs.readFile(manifestPath(f.uploadsPath), 'utf8'), before);
    await denied(f, f.url(op.operationId));
    assert.equal(Object.keys((await readHeroManifest(f.uploadsPath)).publications).length, 0);
    assert.equal(await readHeroOperationReceipt(f.uploadsPath, op.operationId, 1), null);
  });
}

test('rename completed but reported failure reconciles to its durable receipt', async t => {
  const f = await fixture(t), op = await f.operation(), nativeRename = fs.rename.bind(fs);
  const patched = t.mock.method(fs, 'rename', async (...args) => { await nativeRename(...args); throw ioFailure(); });
  const accepted = await f.publish(op); patched.mock.restore();
  assert.equal(accepted.receipt.operationId, op.operationId);
  assert.equal((await f.get(accepted.descriptor.path)).status, 200);
  assert.deepEqual((await f.publish(op)).receipt, accepted.receipt);
});

test('persistent post-rename directory-sync failure is unknown, denies, then recovers without duplicate grant', async t => {
  const f = await fixture(t), op = await f.operation();
  const restore = openFault(t, file => file === path.join(f.uploadsPath, 'hero'), 'sync', async () => { throw ioFailure(); });
  await assert.rejects(f.publish(op), error => error.code === 'HERO_OUTCOME_UNKNOWN' && error.heroOutcome === 'unknown');
  const written = JSON.parse(await fs.readFile(manifestPath(f.uploadsPath), 'utf8'));
  assert.ok(written.operations[op.operationId], 'Unknown is not a rollback claim');
  await assert.rejects(f.publish(op), unknown);
  await assert.rejects(readHeroOperationReceipt(f.uploadsPath, op.operationId, 1), unknown);
  await denied(f, f.url(op.operationId)); restore();
  const recovered = await f.publish(op);
  assert.equal(recovered.receipt.revision, 1);
  assert.equal((await f.get(f.url(op.operationId))).status, 200);
  assert.equal(Object.keys((await readHeroManifest(f.uploadsPath)).publications).length, 1);
});

test('unreadable authority after possible commit stays unknown until exact authority is restored', async t => {
  const f = await fixture(t), op = await f.operation(), nativeRename = fs.rename.bind(fs); let committed;
  const patched = t.mock.method(fs, 'rename', async (...args) => {
    await nativeRename(...args); committed = await fs.readFile(manifestPath(f.uploadsPath));
    await fs.writeFile(manifestPath(f.uploadsPath), '{'); throw ioFailure();
  });
  await assert.rejects(f.publish(op), error => error.code === 'HERO_OUTCOME_UNKNOWN');
  patched.mock.restore(); await denied(f, f.url(op.operationId));
  await assert.rejects(f.publish(op), unknown);
  await assert.rejects(readHeroOperationReceipt(f.uploadsPath, op.operationId, 1), unknown);
  await fs.writeFile(manifestPath(f.uploadsPath), committed);
  assert.equal((await f.publish(op)).receipt.revision, 1);
  assert.equal((await f.get(f.url(op.operationId))).status, 200);
});

test('distinct ESM writers and alternate paths retain both grants across concurrent acceptance and restart', { timeout: 8000 }, async t => {
  const f = await fixture(t), a = await f.operation(), b = await f.operation('publish', '#883311');
  assert.notEqual(peer.readHeroManifest, readHeroManifest);
  const alias = path.join(f.root, 'volume-alias');
  await fs.symlink(path.dirname(f.uploadsPath), alias);
  const alternateRoot = path.join(alias, path.basename(f.uploadsPath));
  assert.equal(await fs.realpath(alternateRoot), f.uploadsPath);
  const ready = gate(), release = gate(); let arrivals = 0;
  const onPhase = async phase => { if (phase === 'prepared') { if (++arrivals === 2) ready.resolve(); await release.promise; } };
  const first = f.publish(a, { onPhase });
  const second = peer.publishManagedHero({ ...b, uploadsPath: alternateRoot, onPhase });
  try {
    await ready.promise;
    await denied(f, f.url(a.operationId)); await denied(f, f.url(b.operationId));
  } finally { release.resolve(); }
  const receipts = await Promise.all([first, second]);
  assert.deepEqual(receipts.map(x => x.receipt.revision).sort(), [1, 2]);
  const snapshot = await readHeroManifest(f.uploadsPath);
  assert.deepEqual(Object.keys(snapshot.publications).sort(), [a.operationId, b.operationId].sort());
  assert.equal(snapshot.revision, 2);
  for (const { generation, descriptor } of receipts) {
    const response = await f.get(descriptor.path);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, await fs.readFile(path.join(managedGenerationPath(f.uploadsPath, generation), 'current-hero.webp')));
  }
  const program = `import { readHeroManifest } from './fruitionforestgarden/src/utils/heroPublicationManifest.js';
    const snapshot = await readHeroManifest(process.argv[1]);
    process.stdout.write(JSON.stringify(snapshot));`;
  const { stdout } = await promisify(execFile)(process.execPath,
    ['--input-type=module', '-e', program, f.uploadsPath]);
  assert.deepEqual(JSON.parse(stdout), snapshot);
});

test('cross-instance retries return one receipt, reject changed input and preserve newer selection', async t => {
  const f = await fixture(t), op = await f.operation(), ready = gate(), release = gate();
  const first = f.publish(op, { onPhase: async phase => { if (phase === 'prepared') { ready.resolve(); await release.promise; } } });
  await ready.promise;
  const retry = inputPath => peer.publishManagedHero({ ...op, inputPath, uploadsPath: f.uploadsPath });
  const second = retry(op.inputPath); release.resolve();
  const [a, b] = await Promise.all([first, second]); assert.deepEqual(a.receipt, b.receipt);
  assert.equal((await readHeroManifest(f.uploadsPath)).revision, 1);
  const replacement = await f.publish(await f.operation('publish', '#883311'));
  const manifest = await fs.readFile(manifestPath(f.uploadsPath));
  assert.deepEqual((await retry(op.inputPath)).receipt, a.receipt);
  await assert.rejects(retry(await f.raw('#ff0000')), { code: 'HERO_REJECTED' });
  assert.equal(await readCurrentGeneration(f.uploadsPath), replacement.generation);
  assert.deepEqual(await fs.readFile(manifestPath(f.uploadsPath)), manifest);
});

test('reset concurrent with prepared publication retains history and stale reset retry cannot clear later selection', async t => {
  const f = await fixture(t), first = await f.publish(await f.operation());
  const replacement = await f.operation('publish', '#883311'), reset = await f.operation('reset'), ready = gate(), release = gate();
  const accepting = f.publish(replacement, { onPhase: async phase => { if (phase === 'prepared') { ready.resolve(); await release.promise; } } });
  await ready.promise; const resetReceipt = await peer.resetManagedHero(f.uploadsPath, reset); assert.equal(await readCurrentGeneration(f.uploadsPath), null);
  release.resolve(); const second = await accepting;
  assert.deepEqual((await f.reset(reset)).receipt, resetReceipt.receipt);
  assert.equal(await readCurrentGeneration(f.uploadsPath), second.generation);
  assert.equal((await f.get(first.descriptor.path)).status, 200);
  assert.equal((await readHeroManifest(f.uploadsPath)).revision, 3);
});

test('accepted corruption, missing files and hardlinks deny without changing grants or serving another image', async t => {
  const f = await fixture(t), accepted = await f.publish(await f.operation());
  const file = path.join(managedGenerationPath(f.uploadsPath, accepted.generation), 'current-hero.webp');
  const original = await fs.readFile(file), authority = await fs.readFile(manifestPath(f.uploadsPath), 'utf8');
  const served = await f.get(accepted.descriptor.path);
  await fs.writeFile(file, Buffer.alloc(original.length, 1));
  await denied(f, accepted.descriptor.path); await denied(f, accepted.descriptor.path, { 'If-None-Match': served.headers.etag });
  await denied(f, accepted.descriptor.path, {}, 'HEAD');
  assert.equal((await resolveHeroImage(f.uploadsPath, f.images)).persistent, false);
  assert.equal((await readHeroIntegrityStatus(f.uploadsPath)).state, 'degraded');
  await fs.unlink(file); await denied(f, accepted.descriptor.path);
  await fs.writeFile(file, original);
  const alias = path.join(f.root, 'synthetic-hardlink'); await fs.link(file, alias); await denied(f, accepted.descriptor.path);
  await fs.unlink(alias); assert.equal((await f.get(accepted.descriptor.path)).status, 200);
  await fs.unlink(file); await fs.symlink(path.join(f.images, 'HeroCamp.webp'), file); await denied(f, accepted.descriptor.path);
  assert.equal(await fs.readFile(manifestPath(f.uploadsPath), 'utf8'), authority);
  assert.ok(f.logs.length > 0);
  assert.equal(JSON.stringify(f.logs).includes(f.root), false);
  assert.equal(JSON.stringify(f.logs).includes('SYNTHETIC_PRIVATE_FILESYSTEM_FAILURE'), false);
});

test('reset queued behind an accepting publication retains both grants and the final selection chain', async t => {
  const f = await fixture(t), first = await f.publish(await f.operation());
  const replacement = await f.operation('publish', '#883311'), reset = await f.operation('reset');
  const ready = gate(), release = gate();
  const publishing = f.publish(replacement, { onPhase: async phase => {
    if (phase === 'manifest-write') { ready.resolve(); await release.promise; }
  } });
  await ready.promise;
  const resetting = peer.resetManagedHero(f.uploadsPath, reset); release.resolve();
  const second = await publishing, result = await resetting;
  assert.equal(second.receipt.revision, 2); assert.equal(result.receipt.revision, 3);
  assert.deepEqual(result.receipt.previousSelection, { kind: 'managed', generation: second.generation });
  const snapshot = await readHeroManifest(f.uploadsPath);
  assert.equal(snapshot.current, null); assert.equal(Object.keys(snapshot.publications).length, 2);
  for (const item of [first, second]) assert.equal((await f.get(item.descriptor.path)).status, 200);
});

test('an active writer and editor lock do not stall a different uploads root', { timeout: 8000 }, async t => {
  const first = await fixture(t), second = await fixture(t, true);
  const a = await first.operation(), b = await second.operation();
  const ready = gate(), release = gate();
  const writing = peer.withHeroOperationLock(first.uploadsPath, () => first.publish(a, {
    onPhase: async phase => {
      if (phase === 'manifest-write') { ready.resolve(); await release.promise; }
    }
  }));
  await ready.promise;
  try {
    const independent = await peer.withHeroOperationLock(second.uploadsPath, () => second.publish(b));
    assert.equal(independent.receipt.revision, 1);
    assert.equal((await second.get(independent.descriptor.path)).status, 200);
  } finally { release.resolve(); }
  assert.equal((await writing).receipt.revision, 1);
  await denied(first, first.url(b.operationId)); await denied(second, second.url(a.operationId));
});

test('observed authority downgrade or revision rollback denies until the exact snapshot is restored', async t => {
  const f = await fixture(t), first = await f.publish(await f.operation());
  const file = manifestPath(f.uploadsPath), earlier = await fs.readFile(file);
  const second = await f.publish(await f.operation('publish', '#883311')), latest = await fs.readFile(file);
  for (const stale of [earlier, JSON.stringify({ generation: first.generation })]) {
    await fs.writeFile(file, stale); await denied(f, second.descriptor.path);
    assert.equal((await readHeroIntegrityStatus(f.uploadsPath)).state, 'authority-unavailable');
  }
  await fs.writeFile(file, latest);
  for (const item of [first, second]) assert.equal((await f.get(item.descriptor.path)).status, 200);
});

test('malformed and unreadable authority deny accepted URLs and do not select private residue', async t => {
  const f = await fixture(t), accepted = await f.publish(await f.operation()), file = manifestPath(f.uploadsPath);
  const original = await fs.readFile(file); await fs.writeFile(file, '{'); await denied(f, accepted.descriptor.path);
  assert.equal((await readHeroIntegrityStatus(f.uploadsPath)).state, 'authority-unavailable');
  await fs.writeFile(file, original);
  const nativeOpen = fs.open.bind(fs), patched = t.mock.method(fs, 'open', async (filePath, ...args) => {
    if (filePath === file) throw Object.assign(new Error('Synthetic denied'), { code: 'EACCES' });
    return nativeOpen(filePath, ...args);
  });
  await denied(f, accepted.descriptor.path); patched.mock.restore();
  assert.equal((await f.get(accepted.descriptor.path)).status, 200);
});

test('v1 reset preserves its observed selection and legacy URLs without minting managed grants', async t => {
  const f = await fixture(t), legacy = path.join(f.uploadsPath, 'hero', uuid);
  await fs.mkdir(legacy, { recursive: true });
  await fs.copyFile(path.join(f.images, 'HeroCamp.webp'), path.join(legacy, 'current-hero.webp'));
  await fs.copyFile(path.join(f.images, 'HeroCamp-og.webp'), path.join(legacy, 'current-hero-og.webp'));
  const old = JSON.stringify({ generation: uuid }); await fs.writeFile(manifestPath(f.uploadsPath), old);
  const op = await f.operation('reset'); assert.equal(await fs.readFile(manifestPath(f.uploadsPath), 'utf8'), old);
  assert.equal((await resolveHeroImage(f.uploadsPath, f.images)).generation, uuid);
  await denied(f, f.url(uuid)); await f.reset(op);
  const state = await readHeroManifest(f.uploadsPath);
  assert.equal(state.current, null); assert.equal(state.legacySelection, uuid); assert.deepEqual(state.publications, {});
  assert.equal((await f.get(`/uploads/hero/${uuid}/current-hero.webp`)).status, 200);
});

for (const sabotage of ['missing', 'corrupt', 'symlink', 'hardlink']) {
  test(`real generated verification rejects ${sabotage} required output without visibility`, async t => {
    const f = await fixture(t), op = await f.operation();
    await assert.rejects(f.publish(op, { onPhase: async phase => {
      if (phase !== 'verification') return;
      const file = path.join(managedGenerationPath(f.uploadsPath, op.operationId), 'current-hero-og.webp');
      if (sabotage === 'hardlink') await fs.link(file, path.join(f.root, 'synthetic-alias'));
      else {
        await fs.unlink(file);
        if (sabotage === 'corrupt') await fs.writeFile(file, 'synthetic corrupt output');
        if (sabotage === 'symlink') await fs.symlink(path.join(f.images, 'HeroCamp-og.webp'), file);
      }
    } }));
    await denied(f, f.url(op.operationId)); assert.deepEqual((await readHeroManifest(f.uploadsPath)).publications, {});
  });
}

test('tampering after verification but before sync is rejected by exact file identity', async t => {
  const f = await fixture(t), op = await f.operation();
  await assert.rejects(f.publish(op, { onPhase: async phase => {
    if (phase === 'file-sync') await fs.writeFile(path.join(managedGenerationPath(f.uploadsPath, op.operationId), 'current-hero.webp'), 'synthetic changed file');
  } }));
  await denied(f, f.url(op.operationId));
});

test('retained source damage is diagnosable without revoking a healthy derivative', async t => {
  const f = await fixture(t), accepted = await f.publish(await f.operation());
  const before = await fs.readFile(manifestPath(f.uploadsPath), 'utf8');
  await fs.unlink(path.join(managedGenerationPath(f.uploadsPath, accepted.generation), '.source', 'current-source.png'));
  const status = await readHeroIntegrityStatus(f.uploadsPath);
  assert.equal(status.state, 'degraded'); assert.ok(status.issues.includes('retained-source-unavailable'));
  assert.equal((await f.get(accepted.descriptor.path)).status, 200);
  assert.equal(await fs.readFile(manifestPath(f.uploadsPath), 'utf8'), before);
});

test('restart with missing authority never bootstraps over managed residue', async t => {
  const f = await fixture(t), accepted = await f.publish(await f.operation());
  const bytes = await fs.readFile(manifestPath(f.uploadsPath)); await fs.unlink(manifestPath(f.uploadsPath));
  const restarted = await import('../fruitionforestgarden/src/utils/heroPublicationManifest.js?missing-authority-restart');
  assert.equal((await restarted.readHeroIntegrityStatus(f.uploadsPath)).state, 'authority-unavailable');
  await assert.rejects(restarted.allocateHeroOperation(f.uploadsPath, 1));
  await denied(f, accepted.descriptor.path);
  await fs.writeFile(manifestPath(f.uploadsPath), bytes);
  assert.equal((await f.get(accepted.descriptor.path)).status, 200);
});

test('interrupted partial preparation remains private and retries never overwrite it', async t => {
  const f = await fixture(t), op = await f.operation();
  await assert.rejects(f.publish(op, { onPhase: phase => { if (phase === 'social-generation') throw ioFailure(); } }));
  const file = path.join(managedGenerationPath(f.uploadsPath, op.operationId), 'current-hero.webp');
  const bytes = await fs.readFile(file);
  await assert.rejects(f.publish(op)); assert.deepEqual(await fs.readFile(file), bytes);
  assert.equal(await readHeroOperationReceipt(f.uploadsPath, op.operationId, 1), null);
  await denied(f, f.url(op.operationId));
  assert.equal((await f.publish(await f.operation())).receipt.revision, 1);
});

for (const boundary of ['manifest-rename', 'manifest-directory-sync', 'accepted']) {
  test(`actual process interruption at ${boundary} recovers by receipt without duplicate publication`, async t => {
    const f = await fixture(t), op = await f.operation();
    const program = `import {publishHeroImage} from './fruitionforestgarden/src/utils/heroImageStore.js';
      const options=JSON.parse(process.argv[1]);process.on('message',()=>{});
      await publishHeroImage({...options,onPhase:async phase=>{if(phase===options.boundary){process.send('barrier');await new Promise(()=>{});}}});`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', program,
      JSON.stringify({ ...op, uploadsPath: f.uploadsPath, boundary })], { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    child.stderr.resume(); t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Synthetic process barrier timeout')); }, 6000);
      child.once('message', () => { clearTimeout(deadline); resolve(); });
      child.once('error', error => { clearTimeout(deadline); reject(error); });
    });
    child.kill('SIGKILL'); assert.equal((await exited).signal, 'SIGKILL');
    if (boundary === 'manifest-rename') await denied(f, f.url(op.operationId));
    else assert.equal((await f.get(f.url(op.operationId))).status, 200);
    const first = await f.publish(op), again = await f.publish(op);
    assert.deepEqual(first.receipt, again.receipt);
    assert.equal((await readHeroManifest(f.uploadsPath)).revision, 1);
    assert.equal((await f.get(first.descriptor.path)).status, 200);
  });
}
