import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_VARIANTS, expectedSignature, recognizeUntrackedVariant, schemaSignature } from './schema-recognition.js';

const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const baselineId = '0000_existing_schema';
const ledgerSql = `CREATE TABLE schema_migrations (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const baselineMetadataSql = `CREATE TABLE schema_baseline (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    variant TEXT NOT NULL
)`;
const baselineGuards = [
    `CREATE TRIGGER schema_baseline_no_insert BEFORE INSERT ON schema_baseline
    WHEN EXISTS (SELECT 1 FROM schema_baseline)
    BEGIN SELECT RAISE(ABORT, 'Recorded baseline variant is immutable'); END`,
    `CREATE TRIGGER schema_baseline_no_update BEFORE UPDATE ON schema_baseline
    BEGIN SELECT RAISE(ABORT, 'Recorded baseline variant is immutable'); END`,
    `CREATE TRIGGER schema_baseline_no_delete BEFORE DELETE ON schema_baseline
    BEGIN SELECT RAISE(ABORT, 'Recorded baseline variant is immutable'); END`
];

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

function hasExactMetadataTable(db, name, sql, relatedSql = []) {
    const objects = db.prepare(`
        SELECT type, sql FROM sqlite_schema WHERE name = ? OR tbl_name = ?
    `).all(name, name).filter(object => object.sql !== null);
    if (objects.length === 0) return false;
    const expected = [sql, ...relatedSql];
    if (objects.length !== expected.length
        || objects.filter(object => object.type === 'table' && object.sql === sql).length !== 1
        || relatedSql.some(statement => objects.filter(object => object.type === 'trigger'
            && object.sql === statement).length !== 1)) {
        throw new Error(`Unsupported ${name} table or related schema objects`);
    }
    return true;
}

function inspectConnection(db, migrations) {
    const hasLedger = hasExactMetadataTable(db, 'schema_migrations', ledgerSql);
    const hasBaselineMetadata = hasExactMetadataTable(db, 'schema_baseline', baselineMetadataSql, baselineGuards);
    if (hasBaselineMetadata && !hasLedger) {
        throw new Error('Baseline variant metadata exists without a migration ledger');
    }
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

    let baselineVariant;
    if (hasBaselineMetadata) {
        const variants = db.prepare('SELECT singleton, variant FROM schema_baseline').all();
        if (variants.length !== 1 || variants[0].singleton !== 1
            || !Object.values(BASELINE_VARIANTS).includes(variants[0].variant)) {
            throw new Error('Invalid recorded baseline variant');
        }
        baselineVariant = variants[0].variant;
    } else {
        if (rows.length > 1) {
            throw new Error('Tracked migrations require recorded baseline variant metadata');
        }
        baselineVariant = recognizeUntrackedVariant(db, migrations);
        if (hasLedger && baselineVariant !== BASELINE_VARIANTS.CANONICAL) {
            throw new Error('Legacy migration ledger requires the canonical baseline');
        }
    }

    const expected = expectedSignature(migrations, Math.max(1, rows.length), baselineVariant);
    if (JSON.stringify(schemaSignature(db)) !== JSON.stringify(expected)) {
        throw new Error('Unsupported or drifted shared database schema');
    }
    if (hasBaselineMetadata && rows.length === 1
        && recognizeUntrackedVariant(db, migrations) !== baselineVariant) {
        throw new Error('Recorded baseline variant does not match the unmigrated schema');
    }
    if (db.pragma('foreign_key_check').length > 0) {
        throw new Error('Database contains foreign-key violations');
    }

    return {
        state: hasLedger ? 'tracked' : 'recognized-untracked-baseline',
        baselineVariant,
        variantRecorded: hasBaselineMetadata,
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
        if (preliminary.pending.length === 0 && preliminary.variantRecorded) {
            return { ...preliminary, appliedNow: [], recordedVariantNow: false };
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
                if (!current.variantRecorded) {
                    db.exec(baselineMetadataSql);
                    db.prepare('INSERT INTO schema_baseline (singleton, variant) VALUES (1, ?)')
                        .run(current.baselineVariant);
                    for (const guard of baselineGuards) db.exec(guard);
                }
                for (const migration of migrations.slice(Math.max(1, current.applied.length))) {
                    // prepare rejects a second statement before any SQL executes.
                    db.prepare(migration.sql).run();
                    db.prepare('INSERT INTO schema_migrations (id, checksum) VALUES (?, ?)')
                        .run(migration.id, migration.checksum);
                    appliedNow.push(migration.id);
                }
                const result = inspectConnection(db, migrations);
                return { ...result, appliedNow, recordedVariantNow: !current.variantRecorded };
            });
            return run.immediate();
        } finally {
            db.close();
        }
    }

    return { inspect, plan: inspect, apply };
}
