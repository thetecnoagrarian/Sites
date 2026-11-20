import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { logSafeError } from '@ffg/blog-core';
import { checkedMediaPath, createPrivateCandidate, verifyPrivateCandidate,
  hashPrivateRawUpload, managedMediaUrl } from '../../../blog-core/src/utils/private-media.js';
import { processHeroImage, validateHeroSourceMetadata, MAX_HERO_INPUT_PIXELS, HERO_FILENAME, HERO_OG_FILENAME } from './heroImageProcessor.js';

export const MANIFEST_FILENAME = '.current.json';
export const GENERATION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isValidGeneration = value => typeof value === 'string' && GENERATION_PATTERN.test(value);
export const heroStorePath = root => path.join(root, 'hero');
export const manifestPath = root => path.join(heroStorePath(root), MANIFEST_FILENAME);
export const managedGenerationPath = (root, id) => {
  if (!isValidGeneration(id)) throw rejected();
  return path.join(root, '.media', 'hero', id);
};
const variants = [HERO_FILENAME, HERO_OG_FILENAME];
const resetDigest = createHash('sha256').update('hero-reset-v2').digest('hex');
// Distinct ESM URLs can evaluate this module more than once in the same app.
// Share active work and durability state across those instances, per uploads root.
const coordinatorKey = Symbol.for('fruitionforestgarden.hero-publication.coordinator.v2');
const contexts = process[coordinatorKey] ??= { paths: new Map(), identities: new Map() };
const positive = value => Number.isSafeInteger(value) && value > 0;
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rejected = () => Object.assign(new Error('Hero operation rejected; reload the editor or inspect its receipt'), { code: 'HERO_REJECTED' });
const unavailable = cause => Object.assign(new Error('Hero publication authority requires recovery', { cause }), { code: 'HERO_OUTCOME_UNKNOWN', heroOutcome: 'unknown' });
const report = error => logSafeError(error, { event: 'hero' });
function shape(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw rejected();
}
const selection = value => {
  if (value === null) return;
  shape(value, ['kind', 'generation']);
  if (!['legacy', 'managed'].includes(value.kind) || !isValidGeneration(value.generation)) throw rejected();
};
function sourceRecord(source) {
  shape(source, ['format', 'extension', 'width', 'height', 'bytes', 'sha256']);
  const validated = validateHeroSourceMetadata(source);
  if (source.extension !== validated.extension || !positive(source.bytes) || !digest(source.sha256)) throw rejected();
}
function publicationRecord(value, id) {
  shape(value, ['operationId', 'ownerUserId', 'inputSha256', 'source', 'variants']);
  if (value.operationId !== id || !positive(value.ownerUserId) || !digest(value.inputSha256)) throw rejected();
  sourceRecord(value.source);
  if (value.source.sha256 !== value.inputSha256) throw rejected();
  shape(value.variants, variants);
  for (const name of variants) {
    const file = value.variants[name];
    shape(file, ['bytes', 'sha256', 'width', 'height']);
    if (!positive(file.bytes) || !digest(file.sha256) || !positive(file.width) || !positive(file.height)) throw rejected();
    const ratio = Math.min(1, 1920 / value.source.width);
    const expected = name === HERO_FILENAME
      ? [Math.round(value.source.width * ratio), Math.round(value.source.height * ratio)] : [1200, 630];
    if (file.width !== expected[0] || file.height !== expected[1]) throw rejected();
  }
}

// JSON.parse validates syntax but discards duplicate members. Walk only object
// boundaries and key tokens in valid JSON, decoding escapes before comparing keys.
function rejectDuplicateManifestKeys(text) {
  const objects = [];
  for (const [token, key, colon] of text.matchAll(/("(?:[^"\\]|\\.)*")(\s*:)?|[{}]/g)) {
    if (token === '{') objects.push(new Set());
    else if (token === '}') objects.pop();
    else if (colon) {
      const keys = objects.at(-1), decoded = JSON.parse(key);
      if (keys.has(decoded)) throw rejected();
      keys.add(decoded);
    }
  }
}

// This is the only publication authority. Private sidecars below .media record
// preparation/ownership only; neither sidecars nor directory scans grant access.
export function parseHeroManifest(text) {
  const value = JSON.parse(text);
  rejectDuplicateManifestKeys(text);
  if (value && Object.hasOwn(value, 'generation')) {
    shape(value, ['generation']);
    if (!isValidGeneration(value.generation)) throw rejected();
    return value;
  }
  shape(value, ['version', 'revision', 'current', 'legacySelection', 'publications', 'operations']);
  if (value.version !== 2 || !Number.isSafeInteger(value.revision) || value.revision < 0) throw rejected();
  selection(value.current);
  if (value.legacySelection !== null && !isValidGeneration(value.legacySelection)) throw rejected();
  for (const map of [value.publications, value.operations]) {
    if (!map || typeof map !== 'object' || Array.isArray(map) || Object.keys(map).some(id => !isValidGeneration(id))) throw rejected();
  }
  const revisions = new Set();
  for (const [id, receipt] of Object.entries(value.operations)) {
    shape(receipt, ['operationId', 'action', 'ownerUserId', 'inputSha256', 'generation', 'previousSelection', 'revision', 'acceptedAt']);
    selection(receipt.previousSelection);
    if (receipt.operationId !== id || !['publish', 'reset'].includes(receipt.action)
      || !positive(receipt.ownerUserId) || !digest(receipt.inputSha256)
      || !positive(receipt.revision) || receipt.revision > value.revision || revisions.has(receipt.revision)
      || typeof receipt.acceptedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(receipt.acceptedAt)
      || !Number.isFinite(Date.parse(receipt.acceptedAt)) || new Date(receipt.acceptedAt).toISOString() !== receipt.acceptedAt) throw rejected();
    revisions.add(receipt.revision);
    if (receipt.action === 'publish') {
      if (receipt.generation !== id || !Object.hasOwn(value.publications, id)) throw rejected();
    } else if (receipt.generation !== null || receipt.inputSha256 !== resetDigest) throw rejected();
  }
  if (Object.keys(value.operations).length !== value.revision) throw rejected();
  for (const [id, record] of Object.entries(value.publications)) {
    publicationRecord(record, id);
    const receipt = value.operations[id];
    if (!receipt || receipt.action !== 'publish' || receipt.ownerUserId !== record.ownerUserId
      || receipt.inputSha256 !== record.inputSha256) throw rejected();
  }
  if (value.current?.kind === 'managed' && !Object.hasOwn(value.publications, value.current.generation)) throw rejected();
  if (value.current?.kind === 'legacy' && value.current.generation !== value.legacySelection) throw rejected();
  const byRevision = new Map(Object.values(value.operations).map(receipt => [receipt.revision, receipt]));
  let previous = value.legacySelection ? { kind: 'legacy', generation: value.legacySelection } : null;
  const sameSelection = (a, b) => a === null ? b === null : b !== null && a.kind === b.kind && a.generation === b.generation;
  for (let revision = 1; revision <= value.revision; revision++) {
    const receipt = byRevision.get(revision);
    if (!sameSelection(receipt.previousSelection, previous)) throw rejected();
    previous = receipt.action === 'publish' ? { kind: 'managed', generation: receipt.generation } : null;
  }
  if (!sameSelection(value.current, previous)) throw rejected();
  return value;
}

export const currentSelection = state => state?.version === 2 ? state.current
  : state?.generation ? { kind: 'legacy', generation: state.generation } : null;
const v2 = state => state?.version === 2 ? state : {
  version: 2, revision: 0, current: currentSelection(state), legacySelection: state?.generation ?? null,
  publications: {}, operations: {}
};

async function context(root) {
  try {
    const { path: canonical, stat } = await checkedMediaPath(root, []);
    const identity = `${stat.dev}:${stat.ino}`;
    const pinned = contexts.paths.get(canonical);
    if (pinned !== undefined && pinned !== identity) throw unavailable();
    let state = contexts.identities.get(identity);
    if (!state) {
      state = { root: canonical, tail: Promise.resolve(), editor: { tail: Promise.resolve() },
        operations: new Map(), durableToken: null, seen: false, revision: 0 };
      contexts.identities.set(identity, state);
    } else if (state.root !== canonical) {
      // Use one physical root even if another valid spelling reaches its inode.
      const original = await checkedMediaPath(state.root, []);
      if (original.stat.dev !== stat.dev || original.stat.ino !== stat.ino) throw unavailable();
    }
    contexts.paths.set(canonical, identity);
    return state;
  } catch (error) {
    if (error.code === 'HERO_OUTCOME_UNKNOWN') throw error;
    throw unavailable(error);
  }
}
async function serialized(state, action) {
  const before = state.tail; let release;
  state.tail = new Promise(resolve => { release = resolve; });
  await before;
  try { return await action(); } finally { release(); }
}
// Keep editor processing serialized without taking the inner manifest lock.
export async function withHeroOperationLock(root, action) {
  const state = await context(root);
  return serialized(state.editor, action);
}
async function operationQueue(state, id, action) {
  const before = state.operations.get(id) ?? Promise.resolve(); let release;
  const tail = new Promise(resolve => { release = resolve; }); state.operations.set(id, tail);
  await before;
  try { return await action(); }
  finally { release(); if (state.operations.get(id) === tail) state.operations.delete(id); }
}
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size
  && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && b.nlink === 1n;
async function opened(root, segments) {
  const checked = await checkedMediaPath(root, segments, { singleLink: true });
  const handle = await fs.open(checked.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n || stat.dev !== checked.stat.dev || stat.ino !== checked.stat.ino) throw rejected();
    return { handle, stat };
  } catch (error) { await handle.close(); throw error; }
}
async function syncDirectory(root, segments) {
  const checked = await checkedMediaPath(root, segments);
  if (!checked.stat.isDirectory()) throw rejected();
  const handle = await fs.open(checked.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat({ bigint: true });
    if (stat.dev !== checked.stat.dev || stat.ino !== checked.stat.ino) throw rejected();
    await handle.sync();
  } finally { await handle.close(); }
}
async function readJson(root, segments) {
  const { handle, stat } = await opened(root, segments);
  try {
    const text = await handle.readFile('utf8');
    if (!sameFile(stat, await handle.stat({ bigint: true }))) throw rejected();
    return JSON.parse(text);
  } finally { await handle.close(); }
}
async function inspectCanonical(state) {
  let file;
  try { file = await opened(state.root, ['hero', MANIFEST_FILENAME]); }
  catch (error) {
    if (error.code !== 'ENOENT' || state.seen) throw error;
    try {
      const candidates = await checkedMediaPath(state.root, ['.media', 'hero']);
      if (!candidates.stat.isDirectory() || (await fs.readdir(candidates.path)).length) throw unavailable();
    } catch (candidateError) { if (candidateError.code !== 'ENOENT') throw candidateError; }
    return null;
  }
  const { handle, stat } = file;
  try {
    const parsed = parseHeroManifest(await handle.readFile('utf8'));
    if (!sameFile(stat, await handle.stat({ bigint: true }))) throw rejected();
    if ((state.seen && parsed.version !== 2) || (parsed.version === 2 && parsed.revision < state.revision)) throw unavailable();
    if (parsed.version === 2) {
      state.seen = true;
      state.revision = parsed.revision;
      const token = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
      // Only durability state is remembered. Every request rereads/validates the
      // authority. New/recovered snapshots cannot authorize before directory sync.
      if (token !== state.durableToken) {
        await handle.sync(); await syncDirectory(state.root, ['hero']);
        state.durableToken = token;
      }
    }
    return parsed;
  } finally { await handle.close(); }
}
async function readCanonical(state) {
  try {
    return await inspectCanonical(state);
  } catch (error) {
    // A read, validation or sync error cannot establish that a receipt is absent.
    if (error.code === 'HERO_OUTCOME_UNKNOWN') throw error;
    throw unavailable(error);
  }
}
export async function readHeroManifest(root) {
  const state = await context(root);
  return serialized(state, () => readCanonical(state));
}
async function ensureHeroDirectory(root) {
  let created = false;
  try { await fs.mkdir(heroStorePath(root), { mode: 0o700 }); created = true; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const checked = await checkedMediaPath(root, ['hero']);
  if (!checked.stat.isDirectory()) throw rejected();
  if (created) await syncDirectory(root, []);
}
async function writeSnapshot(state, previous, next, operationId, onPhase) {
  const expected = JSON.stringify(next);
  parseHeroManifest(expected);
  const temporary = path.join(heroStorePath(state.root), `.current-${randomUUID()}.tmp`);
  let attemptedRename = false;
  state.writing = true;
  try {
    await onPhase('manifest-write');
    const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await handle.writeFile(`${expected}\n`);
      await onPhase('manifest-sync'); await handle.sync();
    } finally { await handle.close(); }
    await onPhase('manifest-rename');
    attemptedRename = true; state.durableToken = null;
    await fs.rename(temporary, manifestPath(state.root));
    await onPhase('manifest-directory-sync');
    await syncDirectory(state.root, ['hero']);
    const accepted = await readCanonical(state);
    if (JSON.stringify(accepted) !== expected) throw unavailable();
    await onPhase('accepted');
    return operationId ? accepted.operations[operationId] : null;
  } catch (error) {
    if (!attemptedRename) throw error;
    state.durableToken = null;
    const observed = await readCanonical(state);
    const observedText = JSON.stringify(observed);
    if (observedText === expected) return operationId ? observed.operations[operationId] : null;
    // Only the exact, verified predecessor confirms that the attempted write
    // did not take effect. Any other authority requires recovery.
    if (observedText !== JSON.stringify(previous)) throw unavailable(error);
    throw error;
  } finally {
    state.writing = false;
  }
}

async function writePrivateJson(root, segments, value) {
  const parent = await checkedMediaPath(root, segments.slice(0, -1));
  if (!parent.stat.isDirectory()) throw rejected();
  const handle = await fs.open(path.join(parent.path, segments.at(-1)),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  await syncDirectory(root, segments.slice(0, -1));
}
const operationSegments = id => ['.media', 'hero', id];
function requireActor(id, ownerUserId) {
  if (!isValidGeneration(id) || !positive(ownerUserId)) throw rejected();
}
async function ownedOperation(state, id, ownerUserId, action) {
  requireActor(id, ownerUserId);
  const value = await readJson(state.root, [...operationSegments(id), '.operation.json']);
  shape(value, ['version', 'id', 'ownerUserId', 'action']);
  if (value.version !== 1 || value.id !== id || value.ownerUserId !== ownerUserId || value.action !== action) throw rejected();
  return value;
}
export async function allocateHeroOperation(root, ownerUserId, action = 'publish') {
  if (!positive(ownerUserId) || !['publish', 'reset'].includes(action)) throw rejected();
  const state = await context(root);
  await serialized(state, async () => {
    await ensureHeroDirectory(state.root);
    const previous = await readCanonical(state);
    if (!previous) {
      // Fresh-root bootstrap is explicit operation allocation, never a public
      // read. Existing managed residue plus lost authority requires recovery.
      try {
        if ((await fs.readdir(path.join(state.root, '.media', 'hero'))).length) throw unavailable();
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await writeSnapshot(state, null, v2(null), null, async () => {});
    }
  });
  const candidate = await createPrivateCandidate(state.root, 'hero');
  await verifyPrivateCandidate(candidate);
  await writePrivateJson(state.root, [...operationSegments(candidate.id), '.operation.json'],
    { version: 1, id: candidate.id, ownerUserId, action });
  return candidate.id;
}

async function inspectFile(root, segments, expected) {
  const { handle, stat } = await opened(root, segments);
  try {
    if (!stat.size || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw rejected();
    const bytes = await handle.readFile();
    const metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: MAX_HERO_INPUT_PIXELS }).metadata();
    const result = { bytes: bytes.length, sha256: hash(bytes), width: metadata.width, height: metadata.height };
    if (!sameFile(stat, await handle.stat({ bigint: true }))
      || expected && ['bytes', 'sha256', 'width', 'height'].some(key => result[key] !== expected[key])) throw rejected();
    return { result, metadata, identity: stat };
  } finally { await handle.close(); }
}
async function inspectGeneration(state, id, ownerUserId, inputSha256, expected = null, onPhase = async () => {}) {
  const base = operationSegments(id);
  const names = await fs.readdir(path.join(state.root, ...base, '.source'));
  if (names.length !== 1 || !/^current-source\.(jpg|png|webp)$/.test(names[0])) throw rejected();
  const sourceFile = await inspectFile(state.root, [...base, '.source', names[0]]);
  const source = { ...validateHeroSourceMetadata(sourceFile.metadata), bytes: sourceFile.result.bytes, sha256: sourceFile.result.sha256 };
  if (names[0] !== `current-source.${source.extension}` || source.sha256 !== inputSha256) throw rejected();
  const files = {};
  const identities = [[ [...base, '.source', names[0]], sourceFile.identity ]];
  for (const name of variants) {
    const item = await inspectFile(state.root, [...base, name]);
    if (item.metadata.format !== 'webp') throw rejected();
    files[name] = item.result;
    identities.push([[...base, name], item.identity]);
  }
  const record = { operationId: id, ownerUserId, inputSha256, source, variants: files };
  publicationRecord(record, id);
  if (expected && JSON.stringify(record) !== JSON.stringify(expected)) throw rejected();
  await onPhase('file-sync');
  for (const [segments, identity] of identities) {
    const { handle, stat } = await opened(state.root, segments);
    try {
      if (!sameFile(identity, stat)) throw rejected();
      await handle.sync();
      if (!sameFile(stat, await handle.stat({ bigint: true }))) throw rejected();
    } finally { await handle.close(); }
  }
  await onPhase('directory-sync');
  for (const segments of [[...base, '.source'], base, ['.media', 'hero'], ['.media'], []]) await syncDirectory(state.root, segments);
  for (const [segments, identity] of identities) {
    const checked = await checkedMediaPath(state.root, segments, { singleLink: true });
    if (!sameFile(identity, checked.stat)) throw rejected();
  }
  return record;
}
function existingReceipt(snapshot, id, ownerUserId, action, inputSha256) {
  if (snapshot?.version !== 2 || !Object.hasOwn(snapshot.operations, id)) return null;
  const receipt = snapshot.operations[id];
  if (receipt.ownerUserId !== ownerUserId || receipt.action !== action || receipt.inputSha256 !== inputSha256) throw rejected();
  return receipt;
}
function publicationResult(record, receipt) {
  const descriptor = name => ({ path: managedMediaUrl('hero', receipt.generation, name),
    width: record.variants[name].width, height: record.variants[name].height, persistent: true, generation: receipt.generation });
  return { source: record.source, generation: receipt.generation, heroSize: record.variants[HERO_FILENAME].bytes,
    ogSize: record.variants[HERO_OG_FILENAME].bytes,
    heroDimensions: { width: record.variants[HERO_FILENAME].width, height: record.variants[HERO_FILENAME].height },
    ogDimensions: { width: 1200, height: 630 }, descriptor: descriptor(HERO_FILENAME), socialDescriptor: descriptor(HERO_OG_FILENAME), receipt };
}
function nextSnapshot(previous, id, ownerUserId, action, inputSha256, record) {
  const snapshot = v2(previous);
  const next = { ...snapshot, publications: { ...snapshot.publications }, operations: { ...snapshot.operations } };
  if (next.revision === Number.MAX_SAFE_INTEGER) throw rejected();
  const receipt = { operationId: id, action, ownerUserId, inputSha256, generation: action === 'publish' ? id : null,
    previousSelection: next.current, revision: next.revision + 1, acceptedAt: new Date().toISOString() };
  next.revision = receipt.revision;
  if (record) next.publications[id] = record;
  next.operations[id] = receipt;
  next.current = action === 'publish' ? { kind: 'managed', generation: id } : null;
  return next;
}
export async function publishManagedHero({ uploadsPath, inputPath, operationId, ownerUserId, onPhase = async () => {} }) {
  requireActor(operationId, ownerUserId);
  const state = await context(uploadsPath);
  return operationQueue(state, operationId, async () => {
    let snapshot = await readHeroManifest(state.root);
    if (!snapshot) throw unavailable();
    const inputSha256 = await hashPrivateRawUpload(state.root, inputPath);
    const accepted = existingReceipt(snapshot, operationId, ownerUserId, 'publish', inputSha256);
    if (accepted) return publicationResult(snapshot.publications[operationId], accepted);
    await ownedOperation(state, operationId, ownerUserId, 'publish');
    const base = operationSegments(operationId);
    let binding;
    try { binding = await readJson(state.root, [...base, '.input.json']); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      binding = { inputSha256 };
      await writePrivateJson(state.root, [...base, '.input.json'], binding);
    }
    shape(binding, ['inputSha256']);
    if (binding.inputSha256 !== inputSha256) throw rejected();
    let prepared;
    try { prepared = await readJson(state.root, [...base, '.prepared.json']); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Never overwrite a partial/ambiguous generation on retry.
      const entries = await fs.readdir(managedGenerationPath(state.root, operationId));
      if (entries.some(name => !['.operation.json', '.input.json'].includes(name))) throw rejected();
      await processHeroImage(inputPath, managedGenerationPath(state.root, operationId), { onPhase });
      prepared = await inspectGeneration(state, operationId, ownerUserId, inputSha256, null, onPhase);
      await writePrivateJson(state.root, [...base, '.prepared.json'], prepared);
    }
    if (prepared.ownerUserId !== ownerUserId) throw rejected();
    await inspectGeneration(state, operationId, ownerUserId, inputSha256, prepared, onPhase);
    await onPhase('prepared');
    return serialized(state, async () => {
      snapshot = await readCanonical(state);
      if (!snapshot) throw unavailable();
      const prior = existingReceipt(snapshot, operationId, ownerUserId, 'publish', inputSha256);
      if (prior) return publicationResult(snapshot.publications[operationId], prior);
      const next = nextSnapshot(snapshot, operationId, ownerUserId, 'publish', inputSha256, prepared);
      const receipt = await writeSnapshot(state, snapshot, next, operationId, onPhase);
      return publicationResult(prepared, receipt);
    });
  });
}
export async function resetManagedHero(root, { operationId, ownerUserId, onPhase = async () => {} }) {
  requireActor(operationId, ownerUserId);
  const state = await context(root);
  return operationQueue(state, operationId, () => serialized(state, async () => {
    const snapshot = await readCanonical(state);
    if (!snapshot) throw unavailable();
    let receipt = existingReceipt(snapshot, operationId, ownerUserId, 'reset', resetDigest);
    if (!receipt) {
      await ownedOperation(state, operationId, ownerUserId, 'reset');
      const next = nextSnapshot(snapshot, operationId, ownerUserId, 'reset', resetDigest);
      receipt = await writeSnapshot(state, snapshot, next, operationId, onPhase);
    }
    return { reset: receipt.previousSelection !== null, generation: receipt.previousSelection?.generation ?? null, receipt };
  }));
}

export async function inspectPublishedHero(root, id, name) {
  if (!isValidGeneration(id) || !variants.includes(name)) throw rejected();
  const snapshot = await readHeroManifest(root);
  if (snapshot?.version !== 2 || !Object.hasOwn(snapshot.publications, id)) throw rejected();
  const expected = snapshot.publications[id].variants[name];
  await inspectFile(root, [...operationSegments(id), name], expected);
  return { path: managedMediaUrl('hero', id, name), width: expected.width, height: expected.height, persistent: true, generation: id };
}
export async function inspectLegacyHero(root, id, name) {
  if (!isValidGeneration(id) || !variants.includes(name)) throw rejected();
  const { result, metadata } = await inspectFile(root, ['hero', id, name]);
  if (metadata.format !== 'webp' || !positive(result.width) || !positive(result.height)
    || name === HERO_FILENAME && result.width > 1920
    || name === HERO_OG_FILENAME && (result.width !== 1200 || result.height !== 630)) throw rejected();
  return { path: `/uploads/hero/${id}/${name}`, width: result.width, height: result.height, persistent: true, generation: id };
}
export function createHeroPublicationProvider(root) {
  const proofs = new WeakMap();
  const authorize = async descriptor => {
    try {
      if (descriptor.kind !== 'hero' || !variants.includes(descriptor.variant)
        || descriptor.url !== managedMediaUrl('hero', descriptor.id, descriptor.variant)) return false;
      // Do not wait indefinitely behind a publisher/barrier or expose a renamed
      // snapshot before its durability outcome is resolved. Denials are no-store.
      if ((await context(root)).writing) return false;
      const snapshot = await readHeroManifest(root);
      if (snapshot?.version !== 2 || !Object.hasOwn(snapshot.publications, descriptor.id)) return false;
      const expected = snapshot.publications[descriptor.id].variants[descriptor.variant];
      await checkedMediaPath(root, [...operationSegments(descriptor.id), descriptor.variant], { singleLink: true });
      proofs.set(descriptor, expected);
      return true;
    } catch (error) { report(error); return false; }
  };
  const verifyOpenedFile = async (descriptor, handle, stat) => {
    try {
      const expected = proofs.get(descriptor); proofs.delete(descriptor);
      if (!expected || stat.size !== BigInt(expected.bytes)) throw rejected();
      const computed = createHash('sha256');
      for await (const chunk of handle.createReadStream({ start: 0, autoClose: false })) computed.update(chunk);
      if (computed.digest('hex') !== expected.sha256 || !sameFile(stat, await handle.stat({ bigint: true }))) throw rejected();
      return true;
    } catch (error) { report(error); return false; }
  };
  return Object.freeze({ authorize, verifyOpenedFile });
}
export async function readHeroOperationReceipt(root, id, ownerUserId) {
  requireActor(id, ownerUserId);
  const snapshot = await readHeroManifest(root);
  const receipt = snapshot?.version === 2 && Object.hasOwn(snapshot.operations, id) ? snapshot.operations[id] : null;
  if (receipt && receipt.ownerUserId !== ownerUserId) throw rejected();
  return receipt;
}
export async function readHeroIntegrityStatus(root) {
  try {
    const snapshot = await readHeroManifest(root), current = currentSelection(snapshot);
    if (!current) return { state: 'default', current: null, issues: [] };
    const issues = [];
    for (const name of variants) {
      try {
        if (current.kind === 'legacy') await inspectLegacyHero(root, current.generation, name);
        else await inspectPublishedHero(root, current.generation, name);
      }
      catch (error) { report(error); issues.push(name === HERO_FILENAME ? 'display-unavailable' : 'social-unavailable'); }
    }
    if (current.kind === 'managed') {
      const source = snapshot.publications[current.generation].source;
      try {
        const file = await inspectFile(root, [...operationSegments(current.generation), '.source', `current-source.${source.extension}`], source);
        if (file.metadata.format !== source.format) throw rejected();
      } catch (error) { report(error); issues.push('retained-source-unavailable'); }
    }
    return { state: issues.length ? 'degraded' : current.kind === 'legacy' ? 'legacy' : 'ok', current, issues };
  } catch (error) { report(error); return { state: 'authority-unavailable', current: null, issues: ['authority-unavailable'] }; }
}
