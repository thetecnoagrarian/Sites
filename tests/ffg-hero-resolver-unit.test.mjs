import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import {
  getHeroImage, getHeroImagePath, getHeroOgImage, heroImageExists, processHeroImage
} from '../fruitionforestgarden/src/utils/heroImageProcessor.js';
import { resolveHeroImage, resolveHeroSocialImage } from '../fruitionforestgarden/src/utils/heroImageStore.js';
import { getSiteImagePath } from '../fruitionforestgarden/src/middleware/ogTags.js';

const descriptor = { path: '/images/HeroCamp.webp', width: 32, height: 16 };
const stats = { isFile: () => true, size: 100 };
const metadata = { format: 'webp', width: 32, height: 16 };
const failure = code => Object.assign(new Error('Synthetic filesystem failure'), { code });

// Exercise the public resolver with controlled native dependencies, not a copy
// of its implementation. Each test owns/restores its mocks; no real uploads.
function inject(t, readStat, readMetadata) {
  return {
    stat: t.mock.method(fs, 'stat', async file => {
      assert.equal(file, '/synthetic/HeroCamp.webp');
      return readStat();
    }),
    metadata: t.mock.method(sharp.prototype, 'metadata', readMetadata)
  };
}

for (const order of ['stat-first', 'Sharp-first']) {
  test(`missing outcomes are stable with ${order} dependency settlement`, async t => {
    const stat = Promise.withResolvers(), image = Promise.withResolvers();
    // A sequential resolver intentionally never starts Sharp for a failed stat.
    // Observe pre-settled fixture promises even when they are never consumed.
    stat.promise.catch(() => {}); image.promise.catch(() => {});
    const calls = inject(t, () => stat.promise, () => image.promise);
    const result = getHeroImage('/synthetic');
    if (order === 'stat-first') {
      stat.reject(failure('ENOENT')); await stat.promise.catch(() => {});
      image.reject(new Error('Synthetic Sharp missing input'));
    } else {
      image.reject(new Error('Synthetic Sharp missing input')); await image.promise.catch(() => {});
      stat.reject(failure('ENOENT'));
    }
    assert.equal(await result, null);
    assert.equal(calls.stat.mock.callCount(), 1);
    assert.equal(calls.metadata.mock.callCount(), 0);
  });
}

test('missing before stat never invokes metadata', async t => {
  const calls = inject(t, () => { throw failure('ENOENT'); }, () => assert.fail('Must not decode'));
  assert.equal(await getHeroImage('/synthetic'), null);
  assert.equal(calls.metadata.mock.callCount(), 0);
});

test('missing during stat does not start Sharp concurrently', async t => {
  const gate = Promise.withResolvers();
  const calls = inject(t, () => gate.promise, () => assert.fail('Must not decode'));
  const result = getHeroImage('/synthetic');
  assert.equal(calls.stat.mock.callCount(), 1);
  assert.equal(calls.metadata.mock.callCount(), 0);
  gate.reject(failure('ENOENT'));
  assert.equal(await result, null);
});

test('disappearance before Sharp is confirmed by one final stat', async t => {
  let present = true;
  const calls = inject(t, () => {
    if (!present) throw failure('ENOENT');
    present = false;
    return stats;
  }, async () => { throw new Error('Synthetic Sharp missing input'); });
  assert.equal(await getHeroImage('/synthetic'), null);
  assert.equal(calls.stat.mock.callCount(), 2);
  assert.equal(calls.metadata.mock.callCount(), 1);
});

test('disappearance during Sharp is confirmed without timing or error-code guesses', async t => {
  let present = true;
  const started = Promise.withResolvers(), decoded = Promise.withResolvers();
  const calls = inject(t, () => {
    if (!present) throw failure('ENOENT');
    return stats;
  }, () => { started.resolve(); return decoded.promise; });
  const result = getHeroImage('/synthetic');
  await started.promise;
  present = false;
  decoded.reject(new Error('Synthetic metadata rejection without a code'));
  assert.equal(await result, null);
  assert.equal(calls.stat.mock.callCount(), 2);
  assert.equal(calls.metadata.mock.callCount(), 1);
});

test('Sharp and final stat may both report missing', async t => {
  let count = 0;
  inject(t, () => { if (++count === 1) return stats; throw failure('ENOENT'); },
    async () => { throw failure('ENOENT'); });
  assert.equal(await getHeroImage('/synthetic'), null);
  assert.equal(count, 2);
});

for (const code of ['EACCES', 'EPERM', 'EIO', 'ENOTDIR']) {
  test(`initial stat ${code} remains an error`, async t => {
    const error = failure(code);
    const calls = inject(t, () => { throw error; }, () => assert.fail('Must not decode'));
    await assert.rejects(getHeroImage('/synthetic'), reason => reason === error);
    assert.equal(calls.metadata.mock.callCount(), 0);
  });
}

for (const code of [undefined, 'ENOENT', 'EISDIR', 'EACCES']) {
  test(`existing-file metadata failure (${code ?? 'no code'}) is not missing`, async t => {
    const error = failure(code);
    const calls = inject(t, () => stats, async () => { throw error; });
    await assert.rejects(getHeroImage('/synthetic'), reason => reason === error);
    assert.equal(calls.stat.mock.callCount(), code === 'EACCES' ? 1 : 2);
  });
}

for (const code of ['EACCES', 'EPERM', 'EIO', 'SYNTHETIC_PROCESSING_FAILURE']) {
  test(`explicit metadata ${code} cannot be hidden by a later disappearance`, async t => {
    const error = failure(code); let count = 0;
    inject(t, () => { if (++count === 1) return stats; throw failure('ENOENT'); },
      async () => { throw error; });
    await assert.rejects(getHeroImage('/synthetic'), reason => reason === error);
    assert.equal(count, 1);
  });
}

for (const code of ['EACCES', 'EIO', 'ENOTDIR']) {
  test(`final stat ${code} is not silently treated as disappearance`, async t => {
    const error = failure(code); let count = 0;
    inject(t, () => { if (++count === 1) return stats; throw error; },
      async () => { throw new Error('Synthetic metadata failure'); });
    await assert.rejects(getHeroImage('/synthetic'), reason => reason === error);
    assert.equal(count, 2);
  });
}

for (const [name, value] of [['empty', { ...stats, size: 0 }], ['non-file', { ...stats, isFile: () => false }]]) {
  test(`${name} keeps the established null fallback without decoding`, async t => {
    inject(t, () => value, () => assert.fail('Must not decode'));
    assert.equal(await getHeroImage('/synthetic'), null);
  });
}

test('initial EISDIR keeps the established null fallback', async t => {
  inject(t, () => { throw failure('EISDIR'); }, () => assert.fail('Must not decode'));
  assert.equal(await getHeroImage('/synthetic'), null);
});

test('normal metadata returns factual dimensions with no retry', async t => {
  const calls = inject(t, () => stats, async () => metadata);
  assert.deepEqual(await getHeroImage('/synthetic'), descriptor);
  assert.equal(calls.stat.mock.callCount(), 1);
  assert.equal(calls.metadata.mock.callCount(), 1);
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'ffg-hero-resolver-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function image(file, width = 32, height = 16) {
  await sharp({ create: { width, height, channels: 3, background: '#246842' } }).webp().toFile(file);
}

async function snapshot(root) {
  const result = [];
  async function walk(dir) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      result.push([path.relative(root, file), entry.isDirectory() ? 'directory'
        : createHash('sha256').update(await fs.readFile(file)).digest('hex')]);
      if (entry.isDirectory()) await walk(file);
    }
  }
  await walk(root);
  return result;
}

test('actual missing optional variants fall through to display, then logo/null without writes', async t => {
  const root = await fixture(t);
  assert.equal(await getHeroImage(root), null);
  assert.equal(await getHeroOgImage(root), null);
  assert.equal(await getHeroImagePath(root), null);
  assert.equal(await heroImageExists(root), false);
  assert.equal(await getSiteImagePath(null, root), '/images/FFGnewLogo.PNG');
  assert.deepEqual(await fs.readdir(root), []);
  await image(path.join(root, 'HeroCamp.webp'));
  const before = await snapshot(root);
  assert.deepEqual(await getHeroOgImage(root), descriptor);
  assert.equal(await getSiteImagePath(null, root), descriptor.path);
  assert.equal(await heroImageExists(root), true);
  assert.equal(await getHeroImagePath(root), descriptor.path);
  assert.deepEqual(await snapshot(root), before);
});

test('actual corrupt defaults and social variants propagate rather than select fallback', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'HeroCamp.webp'), 'synthetic corrupt image');
  const corrupt = await snapshot(root);
  await assert.rejects(getHeroImage(root));
  assert.deepEqual(await snapshot(root), corrupt);
  await image(path.join(root, 'HeroCamp.webp'));
  await fs.writeFile(path.join(root, 'HeroCamp-og.webp'), 'synthetic corrupt social image');
  const before = await snapshot(root);
  await assert.rejects(getHeroOgImage(root));
  await assert.rejects(getSiteImagePath(null, root));
  assert.deepEqual(await snapshot(root), before);
});

test('repeated and concurrent independent store fallbacks preserve all files', async t => {
  const root = await fixture(t);
  const a = path.join(root, 'a'), b = path.join(root, 'b');
  await Promise.all([fs.mkdir(a), fs.mkdir(b)]);
  await Promise.all([image(path.join(a, 'HeroCamp.webp')), image(path.join(b, 'HeroCamp.webp'), 10, 30)]);
  const before = await snapshot(root);
  for (let i = 0; i < 3; i++) {
    const [first, second, social] = await Promise.all([
      resolveHeroImage(null, a), resolveHeroImage(null, b), resolveHeroSocialImage(null, a)
    ]);
    assert.deepEqual(first, { ...descriptor, persistent: false });
    assert.deepEqual(second, { ...descriptor, width: 10, height: 30, persistent: false });
    assert.deepEqual(social, first);
  }
  assert.deepEqual(await snapshot(root), before);
});

test('generated verification turns confirmed missing output into a hard failure', async t => {
  const root = await fixture(t), input = path.join(root, 'input.webp'), output = path.join(root, 'generation');
  await image(input);
  await assert.rejects(processHeroImage(input, output, { onPhase: async phase => {
    if (phase === 'verification') await fs.unlink(path.join(output, 'current-hero.webp'));
  } }), /Generated hero image is missing or empty/);
});
