import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { loadMigrations } from '../src/database/migrations.js';
import { schemaSignature } from '../src/database/schema-recognition.js';
import { allocateMediaOperation, prepareMediaOperation, markPendingOverwrite, readPendingOverwrite,
    readMediaOperation, cancelMediaOperation, createPostMediaProvider, mediaDigest } from '../src/models/media-publication.js';

const schema = readFileSync(new URL('../src/database/schema.sql', import.meta.url), 'utf8');
const columns = ['id', 'operation_id', 'record_type', 'owner_user_id', 'state', 'data', 'created_at', 'pending_input'];
const stable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const insertSql = verb => `${verb} media_publications (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
const args = row => columns.map(key => row[key]);
const allRows = db => JSON.stringify(db.prepare('SELECT rowid,* FROM media_publications ORDER BY id').all());
const allocatedData = () => ({ context: { action: 'create', postId: null }, submission: null,
    inputHash: null, candidates: [], required: [], pending: null, receipt: null });

function fixture(t, layout, recursive) {
    const db = new Database(':memory:');
    t.after(() => db.close());
    db.pragma(`recursive_triggers = ${recursive}`);
    if (layout === 'fresh') db.exec(schema);
    else for (const migration of loadMigrations()) db.exec(migration.sql);
    const candidateId = randomUUID();
    const candidate = { id: candidateId, image: { thumbnail: `/uploads/m1-${candidateId}-thumbnail.webp`,
        medium: `/uploads/m1-${candidateId}-medium.webp`, large: `/uploads/m1-${candidateId}-large.webp`,
        originalWidth: 6000, originalHeight: 4000, originalAspectRatio: 1.5 },
    files: Object.fromEntries(['thumbnail', 'medium', 'large'].map(variant =>
        [variant, { bytes: 100, width: 96, height: 64, sha256: 'a'.repeat(64) }])) };
    const input = { content: { title: 'Synthetic', body: 'Private synthetic input', description: '', excerpt: '',
        created_at: '2020-01-01', images: [candidate.image], captions: ['Synthetic caption'] },
    authorIds: [1], categoryIds: [], publisherId: 1, loginUserId: 1, revisionToken: 'b'.repeat(64) };
    const rows = {};
    for (const [name, state, pending] of [['published', 'published', false], ['cancelled', 'cancelled', true], ['pending', 'prepared', true]]) {
        const id = randomUUID();
        const data = { ...allocatedData(), submission: 'c'.repeat(64), inputHash: mediaDigest(input),
            candidates: [candidate], required: [candidate.id], pending: pending ? { postId: 1, revisionToken: input.revisionToken } : null };
        if (state === 'published') data.receipt = { action: 'create', postId: 1,
            binding: mediaDigest({ action: 'create', postId: null, inputHash: data.inputHash, reopenAuthorship: false }), acceptedAt: '2026-11-16T00:00:00.000Z' };
        const row = { id, operation_id: id, record_type: 'operation', owner_user_id: 1, state,
            data: JSON.stringify(data), created_at: '2026-11-16T00:00:00.000Z',
            pending_input: pending ? stable({ version: 1, input }) : null };
        db.prepare(insertSql('INSERT INTO')).run(...args(row)); rows[name] = row;
    }
    rows.asset = { id: candidate.id, operation_id: rows.published.id, record_type: 'asset', owner_user_id: 1,
        state: 'published', data: JSON.stringify(candidate), created_at: '2026-11-16T00:00:00.000Z', pending_input: null };
    db.prepare(insertSql('INSERT INTO')).run(...args(rows.asset));
    const provider = createPostMediaProvider(db);
    const authorized = () => provider({ kind: 'post', id: candidate.id, variant: 'large', url: candidate.image.large });
    assert.equal(authorized(), true);
    return { db, rows, input, authorized };
}

for (const layout of ['fresh', 'migrated']) for (const recursive of [0, 1]) {
    test(`${layout}, recursive_triggers=${recursive}: conflicts cannot replace identities or publication authority`, t => {
        const f = fixture(t, layout, recursive);
        assert.equal(f.db.pragma('recursive_triggers', { simple: true }), recursive);
        const original = allRows(f.db);
        const reset = row => ({ ...row, operation_id: row.id, record_type: 'operation', owner_user_id: 2,
            state: 'allocated', data: JSON.stringify(allocatedData()), pending_input: null });
        for (const verb of ['INSERT OR REPLACE INTO', 'REPLACE INTO', 'INSERT INTO']) {
            for (const row of Object.values(f.rows)) {
                assert.throws(() => f.db.prepare(insertSql(verb)).run(...args(reset(row))), /identity already exists/);
                assert.equal(allRows(f.db), original, `${verb} must leave every original byte and related row unchanged`);
                assert.equal(f.authorized(), true);
            }
        }
        for (const alias of ['rowid', '_rowid_', 'oid']) {
            for (const row of Object.values(f.rows)) {
                const rowid = f.db.prepare('SELECT rowid r FROM media_publications WHERE id=?').get(row.id).r;
                for (const verb of ['INSERT OR REPLACE INTO', 'REPLACE INTO', 'INSERT INTO']) {
                    const next = { ...reset(row), id: randomUUID() }; next.operation_id = next.id;
                    const sql = `${verb} media_publications (${alias},${columns.join(',')}) VALUES (?,${columns.map(() => '?').join(',')})`;
                    assert.throws(() => f.db.prepare(sql).run(rowid, ...args(next)), /identity already exists/);
                    assert.equal(allRows(f.db), original);
                    assert.equal(f.authorized(), true);
                    assert.throws(() => f.db.prepare(sql + ` ON CONFLICT(${alias}) DO UPDATE SET owner_user_id=excluded.owner_user_id`)
                        .run(rowid, ...args(next)), /identity already exists/);
                }
                assert.throws(() => f.db.prepare(`UPDATE media_publications SET ${alias}=1000 WHERE id=?`).run(row.id), /immutable/);
                const mutableId = allocateMediaOperation(f.db, 1, 'create');
                const withMutable = allRows(f.db);
                assert.throws(() => f.db.prepare(`UPDATE OR REPLACE media_publications SET ${alias}=? WHERE id=?`).run(rowid, mutableId), /immutable/);
                assert.throws(() => f.db.prepare(`UPDATE media_publications SET ${alias}=2000 WHERE id=?`).run(mutableId), /immutable/);
                assert.equal(allRows(f.db), withMutable);
                assert.equal(f.authorized(), true);
                // Discard only this synthetic, unbound operation; original rows remain protected.
                f.db.prepare('DELETE FROM media_publications WHERE id=?').run(mutableId);
                assert.equal(allRows(f.db), original);
            }
            // A prior valid insert in a multi-row REPLACE must roll back too.
            const newRow = { ...reset(f.rows.pending), id: randomUUID() }; newRow.operation_id = newRow.id;
            const conflict = { ...reset(f.rows.published), id: randomUUID() }; conflict.operation_id = conflict.id;
            const target = f.db.prepare('SELECT rowid r FROM media_publications WHERE id=?').get(f.rows.published.id).r;
            const tuple = `(${[alias, ...columns].map(() => '?').join(',')})`;
            const sql = `INSERT OR REPLACE INTO media_publications (${alias},${columns.join(',')}) VALUES ${tuple},${tuple}`;
            assert.throws(() => f.db.prepare(sql).run(1000, ...args(newRow), target, ...args(conflict)), /identity already exists/);
            assert.equal(allRows(f.db), original);
            assert.equal(f.authorized(), true);
        }
        // Even an identical asset reinsert is a forbidden replacement, not a retry protocol.
        assert.throws(() => f.db.prepare(insertSql('INSERT OR REPLACE INTO')).run(...args(f.rows.asset)), /identity already exists/);
        for (const row of Object.values(f.rows)) {
            assert.throws(() => f.db.prepare(insertSql('INSERT INTO') +
                ' ON CONFLICT(id) DO UPDATE SET owner_user_id=excluded.owner_user_id,state=excluded.state,data=excluded.data,pending_input=excluded.pending_input')
                .run(...args(reset(row))), /identity already exists/);
            assert.equal(allRows(f.db), original);
            assert.equal(f.authorized(), true);
        }
        assert.throws(() => f.db.prepare('UPDATE media_publications SET pending_input=NULL WHERE id=?').run(f.rows.pending.id), /immutable/);
        assert.throws(() => f.db.prepare("UPDATE media_publications SET data=json_set(data,'$.pending.postId',2) WHERE id=?").run(f.rows.pending.id), /immutable/);
        assert.equal(allRows(f.db), original);
        // ABORT rolls back earlier rows in the same failing multi-row statement.
        const newRow = { ...reset(f.rows.pending), id: randomUUID() }; newRow.operation_id = newRow.id;
        const multi = insertSql('INSERT OR REPLACE INTO') + `,(${columns.map(() => '?').join(',')})`;
        assert.throws(() => f.db.prepare(multi).run(...args(newRow), ...args(reset(f.rows.published))), /identity already exists/);
        assert.equal(allRows(f.db), original);
        assert.equal(f.authorized(), true);

        const pending = readPendingOverwrite(f.db, f.rows.pending.id, 1);
        assert.deepEqual(markPendingOverwrite(f.db, f.rows.pending.id, 1, pending.operation.data.pending, pending.input), pending);
        assert.equal(cancelMediaOperation(f.db, f.rows.published.id, 1).postId, 1);
        assert.equal(cancelMediaOperation(f.db, f.rows.cancelled.id, 1), null);
        assert.equal(allRows(f.db), original, 'Intended idempotent model operations do not reinsert records');
        const id = allocateMediaOperation(f.db, 1, 'create');
        const input = { ...f.input, content: { ...f.input.content, images: [], captions: [] } };
        delete input.revisionToken;
        const first = prepareMediaOperation(f.db, id, 1, mediaDigest(input), input, []);
        assert.deepEqual(prepareMediaOperation(f.db, id, 1, mediaDigest(input), input, []), first);
        assert.equal(readMediaOperation(f.db, id, 1).state, 'prepared');
        // Unassigned/NULL rowids auto-allocate; explicit positive rowids remain supported.
        for (const rowid of [null, 5000]) {
            const row = { ...reset(f.rows.pending), id: randomUUID() }; row.operation_id = row.id;
            f.db.prepare(`INSERT INTO media_publications(rowid,${columns.join(',')}) VALUES (?,${columns.map(() => '?').join(',')})`)
                .run(rowid, ...args(row));
            assert.ok(f.db.prepare('SELECT rowid r FROM media_publications WHERE id=?').get(row.id).r > 0);
        }
        for (const rowid of [0, -1, -20]) {
            const row = { ...reset(f.rows.pending), id: randomUUID() }; row.operation_id = row.id;
            const beforeInvalid = allRows(f.db);
            assert.throws(() => f.db.prepare(`INSERT OR REPLACE INTO media_publications(rowid,${columns.join(',')}) VALUES (?,${columns.map(() => '?').join(',')})`)
                .run(rowid, ...args(row)), /CHECK constraint/);
            assert.equal(allRows(f.db), beforeInvalid);
        }
        assert.ok(allocateMediaOperation(f.db, 1, 'create'), 'Invalid negative rowids cannot poison later automatic allocation');
    });
}

test('fresh and migrated conflict guards have the same canonical schema', t => {
    const fresh = fixture(t, 'fresh', 0), migrated = fixture(t, 'migrated', 0);
    assert.deepEqual(schemaSignature(fresh.db), schemaSignature(migrated.db));
});
