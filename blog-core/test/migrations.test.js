import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/database/init.js';
import { createMigrationRunner, loadMigrations } from '../src/database/migrations.js';

const runner = createMigrationRunner();
const syntheticMigration = {
    id: '0001_test_only_probe',
    sql: 'CREATE TABLE migration_probe (id INTEGER PRIMARY KEY, marker TEXT NOT NULL);'
};

function fixture(t) {
    const directory = mkdtempSync(join(tmpdir(), 'sites-migration-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    return directory;
}

function freshDatabase(directory, name) {
    const path = join(directory, name);
    const db = initializeDatabase(path);
    db.close();
    return path;
}

function digest(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function addFixtureData(path) {
    const db = new Database(path);
    try {
        const userId = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
            .run('synthetic-editor', 'synthetic-hash').lastInsertRowid;
        const categoryId = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)')
            .run('Synthetic', 'synthetic').lastInsertRowid;
        const postId = db.prepare(`
            INSERT INTO posts (title, slug, body, created_at, author_id)
            VALUES (?, ?, ?, ?, ?)
        `).run('Synthetic Post', 'synthetic-post', 'Fixture body', '2025-01-02', userId)
            .lastInsertRowid;
        db.prepare('INSERT INTO post_categories (post_id, category_id) VALUES (?, ?)')
            .run(postId, categoryId);
    } finally {
        db.close();
    }
}

function readFixtureData(path) {
    const db = new Database(path, { readonly: true });
    try {
        return {
            users: db.prepare('SELECT id, username, password_hash FROM users').all(),
            posts: db.prepare('SELECT id, title, slug, body, created_at, author_id FROM posts').all(),
            categories: db.prepare('SELECT id, name, slug FROM categories').all(),
            relations: db.prepare('SELECT post_id, category_id FROM post_categories').all()
        };
    } finally {
        db.close();
    }
}

test('recognized baseline is inspected and planned without creating or changing state', (t) => {
    const path = freshDatabase(fixture(t), 'ffg.db');
    addFixtureData(path);
    const before = digest(path);
    const planned = runner.plan(path);
    assert.deepEqual(planned, {
        state: 'recognized-untracked-baseline',
        applied: [],
        pending: ['0000_existing_schema']
    });
    assert.deepEqual(runner.inspect(path), planned);
    assert.equal(digest(path), before);
    assert.throws(() => runner.plan(join(tmpdir(), 'nonexistent-sites-migration.db')));
});

test('unrecognized and drifted schemas are rejected without recording a baseline', (t) => {
    const directory = fixture(t);
    const unknown = join(directory, 'unknown.db');
    const unknownDb = new Database(unknown);
    unknownDb.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)');
    unknownDb.close();
    const unknownBefore = digest(unknown);
    assert.throws(() => runner.plan(unknown), /Unsupported or drifted/);
    assert.throws(() => runner.apply(unknown), /Unsupported or drifted/);
    assert.equal(digest(unknown), unknownBefore);

    const drifted = freshDatabase(directory, 'drifted.db');
    const db = new Database(drifted);
    db.exec('ALTER TABLE posts ADD COLUMN unexpected TEXT');
    db.close();
    const driftedBefore = digest(drifted);
    assert.throws(() => runner.apply(drifted), /Unsupported or drifted/);
    assert.equal(digest(drifted), driftedBefore);
});

test('known site analytics tables coexist with the shared baseline', (t) => {
    const path = freshDatabase(fixture(t), 'site.db');
    const db = new Database(path);
    db.exec(`CREATE TABLE page_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_path TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.close();
    assert.equal(runner.inspect(path).state, 'recognized-untracked-baseline');
    assert.deepEqual(runner.apply(path).appliedNow, ['0000_existing_schema']);
    const reopened = new Database(path, { readonly: true });
    try {
        assert.equal(reopened.prepare(`SELECT COUNT(*) AS count FROM sqlite_schema
            WHERE name = 'page_views'`).get().count, 1);
    } finally {
        reopened.close();
    }
});

test('startup does not replay baseline schema onto an existing database', (t) => {
    const directory = fixture(t);
    const path = freshDatabase(directory, 'migrated.db');
    const dropTrigger = createMigrationRunner([...loadMigrations(), {
        id: '0001_test_only_drop_trigger',
        sql: 'DROP TRIGGER posts_updated_at;'
    }]);
    dropTrigger.apply(path);
    assert.throws(() => initializeDatabase(path), /Unknown, out-of-order, or changed migration/);
    assert.deepEqual(dropTrigger.inspect(path).pending, []);
    const db = new Database(path, { readonly: true });
    try {
        assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sqlite_schema
            WHERE name = 'posts_updated_at'`).get().count, 0);
    } finally {
        db.close();
    }

    const recognized = freshDatabase(directory, 'recognized.db');
    initializeDatabase(recognized).close();
    assert.equal(runner.inspect(recognized).state, 'recognized-untracked-baseline');

    const unknown = join(directory, 'unknown.db');
    const unknownDb = new Database(unknown);
    unknownDb.exec('CREATE TABLE unrelated (id INTEGER)');
    unknownDb.close();
    assert.throws(() => initializeDatabase(unknown), /Unsupported or drifted/);
    assert.throws(() => runner.inspect(unknown), /Unsupported or drifted/);
});

test('migration files cannot end the runner transaction', (t) => {
    const path = freshDatabase(fixture(t), 'transaction-control.db');
    const before = digest(path);
    assert.throws(() => createMigrationRunner([...loadMigrations(), {
        id: '0001_test_only_commit',
        sql: 'CREATE TABLE unsafe_probe (id INTEGER); COMMIT;'
    }]), /transaction control/);
    assert.throws(() => createMigrationRunner([...loadMigrations(), {
        id: '0001_test_only_end',
        sql: 'END;'
    }]), /transaction control/);
    const multipleStatements = createMigrationRunner([...loadMigrations(), {
        id: '0001_test_only_multiple',
        sql: 'CREATE TABLE unsafe_probe (id INTEGER); CREATE TABLE second_probe (id INTEGER);'
    }]);
    assert.throws(() => multipleStatements.apply(path), /more than one statement/);
    assert.equal(digest(path), before);
});

test('a single-statement trigger migration remains supported', (t) => {
    const path = freshDatabase(fixture(t), 'trigger.db');
    const triggerRunner = createMigrationRunner([...loadMigrations(), {
        id: '0001_test_only_trigger',
        sql: `CREATE TRIGGER test_only_user_insert AFTER INSERT ON users
            BEGIN UPDATE users SET role = 'editor' WHERE id = NEW.id; END;`
    }]);
    assert.deepEqual(triggerRunner.apply(path).appliedNow,
        ['0000_existing_schema', '0001_test_only_trigger']);
    assert.deepEqual(triggerRunner.inspect(path).pending, []);
});

test('recognized baseline is recorded once and survives reopen with fixture data intact', (t) => {
    const path = freshDatabase(fixture(t), 'tta.db');
    addFixtureData(path);
    const data = readFixtureData(path);
    const first = runner.apply(path);
    assert.deepEqual(first.appliedNow, ['0000_existing_schema']);
    assert.deepEqual(first.pending, []);
    assert.deepEqual(readFixtureData(path), data);

    const after = digest(path);
    assert.deepEqual(runner.apply(path).appliedNow, []);
    assert.equal(digest(path), after);
    assert.deepEqual(runner.inspect(path).applied, ['0000_existing_schema']);
});

test('synthetic migration applies once, persists, and is isolated between two site databases', (t) => {
    const directory = fixture(t);
    const ffg = freshDatabase(directory, 'ffg.db');
    const tta = freshDatabase(directory, 'tta.db');
    addFixtureData(ffg);
    addFixtureData(tta);
    const ffgData = readFixtureData(ffg);
    const ttaData = readFixtureData(tta);
    const testRunner = createMigrationRunner([...loadMigrations(), syntheticMigration]);

    assert.deepEqual(testRunner.plan(ffg).pending,
        ['0000_existing_schema', '0001_test_only_probe']);
    assert.deepEqual(testRunner.apply(ffg).appliedNow,
        ['0000_existing_schema', '0001_test_only_probe']);
    assert.deepEqual(runner.plan(tta).pending, ['0000_existing_schema']);
    assert.deepEqual(readFixtureData(ffg), ffgData);
    assert.deepEqual(readFixtureData(tta), ttaData);

    const after = digest(ffg);
    assert.deepEqual(testRunner.apply(ffg).appliedNow, []);
    assert.equal(digest(ffg), after);
    assert.deepEqual(testRunner.inspect(ffg).applied,
        ['0000_existing_schema', '0001_test_only_probe']);
    assert.deepEqual(testRunner.apply(tta).appliedNow,
        ['0000_existing_schema', '0001_test_only_probe']);
    assert.deepEqual(readFixtureData(tta), ttaData);
});

test('a failed migration rolls back its schema and all new migration records', (t) => {
    const directory = fixture(t);
    const testRunner = createMigrationRunner([...loadMigrations(), {
        id: '0001_test_only_probe',
        sql: 'CREATE TABLE temporary_probe (id INTEGER);'
    }, {
        id: '0002_test_only_failure',
        sql: 'INSERT INTO missing_table VALUES (1);'
    }]);

    for (const tracked of [false, true]) {
        const path = freshDatabase(directory, tracked ? 'tracked.db' : 'untracked.db');
        addFixtureData(path);
        if (tracked) runner.apply(path);
        const before = readFixtureData(path);
        assert.throws(() => testRunner.apply(path), /missing_table/);
        assert.deepEqual(readFixtureData(path), before);
        const db = new Database(path, { readonly: true });
        try {
            assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sqlite_schema
                WHERE name = 'temporary_probe'`).get().count, 0);
            assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sqlite_schema
                WHERE name = 'schema_migrations'`).get().count, tracked ? 1 : 0);
            if (tracked) {
                assert.deepEqual(db.prepare('SELECT id FROM schema_migrations').all(),
                    [{ id: '0000_existing_schema' }]);
            }
        } finally {
            db.close();
        }
    }
});

test('changed migration checksums and ledger drift are rejected', (t) => {
    const path = freshDatabase(fixture(t), 'tracked.db');
    runner.apply(path);
    const db = new Database(path);
    db.prepare('UPDATE schema_migrations SET checksum = ? WHERE id = ?')
        .run('changed', '0000_existing_schema');
    db.close();
    assert.throws(() => runner.plan(path), /changed migration/);
    assert.throws(() => runner.apply(path), /changed migration/);
});

test('fresh schema and frozen existing baseline have equivalent shared objects', (t) => {
    const directory = fixture(t);
    const fresh = freshDatabase(directory, 'fresh.db');
    const baseline = join(directory, 'baseline.db');
    const db = new Database(baseline);
    db.exec(loadMigrations()[0].sql);
    db.close();
    assert.deepEqual(runner.plan(fresh), runner.plan(baseline));
    runner.apply(fresh);
    runner.apply(baseline);
    const objects = path => {
        const connection = new Database(path, { readonly: true });
        try {
            return connection.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
                WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
                ORDER BY type, name`).all();
        } finally {
            connection.close();
        }
    };
    assert.deepEqual(objects(fresh), objects(baseline));
});

test('CLI inspect and plan are read-only; CLI apply records only the baseline', (t) => {
    const path = freshDatabase(fixture(t), 'cli.db');
    const cli = join('blog-core', 'src', 'database', 'migrate-cli.js');
    const run = command => spawnSync(process.execPath, [cli, command, '--database', path], {
        cwd: join(import.meta.dirname, '..', '..'),
        encoding: 'utf8'
    });
    const before = digest(path);
    for (const command of ['inspect', 'plan']) {
        const result = run(command);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).state, 'recognized-untracked-baseline');
        assert.equal(digest(path), before);
    }
    const applied = run('apply');
    assert.equal(applied.status, 0, applied.stderr);
    assert.deepEqual(JSON.parse(applied.stdout).appliedNow, ['0000_existing_schema']);
});
