import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const baselineId = '0000_existing_schema';
const ledgerSql = `CREATE TABLE schema_migrations (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

// These are site-owned analytics tables, outside the shared blog schema.
const ancillaryTables = new Set([
    'page_views', 'unique_visitors', 'all_time_stats', 'all_time_top_pages'
]);

const checksum = (sql) => createHash('sha256').update(sql).digest('hex');

export function loadMigrations() {
    const names = readdirSync(migrationDirectory)
        .filter(name => name.endsWith('.sql'))
        .sort();
    return names.map(name => ({
        id: name.slice(0, -4),
        sql: readFileSync(join(migrationDirectory, name), 'utf8')
    }));
}

function validateMigrations(migrations) {
    if (!Array.isArray(migrations) || migrations[0]?.id !== baselineId) {
        throw new Error(`Migration registry must start with ${baselineId}`);
    }
    let previous = '';
    for (const migration of migrations) {
        if (!/^\d{4}_[a-z0-9_]+$/.test(migration.id) || migration.id <= previous
            || typeof migration.sql !== 'string' || !migration.sql.trim()) {
            throw new Error(`Invalid or unordered migration: ${migration.id}`);
        }
        // The runner owns the outer transaction. A migration must not end it
        // before its checksum is recorded and the final schema is verified.
        if (migration.id !== baselineId
            && (/\b(?:COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b|\bEND\s+TRANSACTION\b/i.test(migration.sql)
                || (/\bEND\s*;/i.test(migration.sql)
                    && !/^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(migration.sql)))) {
            throw new Error(`Migration contains transaction control: ${migration.id}`);
        }
        previous = migration.id;
    }
    return migrations.map(migration => ({ ...migration, checksum: checksum(migration.sql) }));
}

function schemaObjects(db) {
    return db.prepare(`
        SELECT type, name, tbl_name AS tableName, sql
        FROM sqlite_schema
        WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
        ORDER BY type, name
    `).all().filter(object => object.name !== 'schema_migrations'
        && !(object.type === 'table' && ancillaryTables.has(object.tableName)));
}

function expectedObjects(migrations, appliedCount) {
    const reference = new Database(':memory:');
    try {
        reference.exec(migrations[0].sql);
        for (let index = 1; index < appliedCount; index += 1) {
            reference.prepare(migrations[index].sql).run();
        }
        return schemaObjects(reference);
    } finally {
        reference.close();
    }
}

function inspectConnection(db, migrations) {
    const ledgerObjects = db.prepare(`
        SELECT type, sql FROM sqlite_schema WHERE name = 'schema_migrations'
           OR tbl_name = 'schema_migrations'
    `).all().filter(object => object.sql !== null);
    if (ledgerObjects.length > 0 && (ledgerObjects.length !== 1
        || ledgerObjects[0].type !== 'table' || ledgerObjects[0].sql !== ledgerSql)) {
        throw new Error('Unsupported schema_migrations table or related schema objects');
    }

    const hasLedger = ledgerObjects.length === 1;
    const rows = hasLedger
        ? db.prepare('SELECT id, checksum FROM schema_migrations ORDER BY id').all()
        : [];
    if (hasLedger && rows.length === 0) {
        throw new Error('Migration ledger exists without a recognized baseline');
    }
    for (let index = 0; index < rows.length; index += 1) {
        if (rows[index].id !== migrations[index]?.id
            || rows[index].checksum !== migrations[index]?.checksum) {
            throw new Error(`Unknown, out-of-order, or changed migration: ${rows[index].id}`);
        }
    }

    const expected = expectedObjects(migrations, Math.max(1, rows.length));
    const actual = schemaObjects(db);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('Unsupported or drifted shared database schema');
    }
    if (db.pragma('foreign_key_check').length > 0) {
        throw new Error('Database contains foreign-key violations');
    }

    return {
        state: hasLedger ? 'tracked' : 'recognized-untracked-baseline',
        applied: rows.map(row => row.id),
        pending: migrations.slice(rows.length).map(migration => migration.id)
    };
}

export function createMigrationRunner(migrationDefinitions = loadMigrations()) {
    const migrations = validateMigrations(migrationDefinitions);

    function inspect(databasePath) {
        const db = new Database(databasePath, { readonly: true, fileMustExist: true });
        try {
            return inspectConnection(db, migrations);
        } finally {
            db.close();
        }
    }

    function apply(databasePath) {
        const preliminary = inspect(databasePath);
        if (preliminary.pending.length === 0) {
            return { ...preliminary, appliedNow: [] };
        }

        const db = new Database(databasePath, { fileMustExist: true });
        try {
            db.pragma('foreign_keys = ON');
            const run = db.transaction(() => {
                const current = inspectConnection(db, migrations);
                const appliedNow = [];
                if (current.state === 'recognized-untracked-baseline') {
                    db.exec(ledgerSql);
                    db.prepare('INSERT INTO schema_migrations (id, checksum) VALUES (?, ?)')
                        .run(migrations[0].id, migrations[0].checksum);
                    appliedNow.push(migrations[0].id);
                }
                for (const migration of migrations.slice(Math.max(1, current.applied.length))) {
                    // prepare rejects a second statement before any SQL executes.
                    db.prepare(migration.sql).run();
                    db.prepare('INSERT INTO schema_migrations (id, checksum) VALUES (?, ?)')
                        .run(migration.id, migration.checksum);
                    appliedNow.push(migration.id);
                }
                const result = inspectConnection(db, migrations);
                return { ...result, appliedNow };
            });
            return run.immediate();
        } finally {
            db.close();
        }
    }

    return { inspect, plan: inspect, apply };
}
