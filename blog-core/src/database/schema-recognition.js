import Database from 'better-sqlite3';

export const BASELINE_VARIANTS = Object.freeze({
    CANONICAL: 'canonical_0000',
    TTA: 'tta_legacy_production',
    FFG: 'ffg_legacy_production'
});

const analyticsTables = new Set([
    'page_views', 'unique_visitors', 'all_time_stats', 'all_time_top_pages'
]);
const metadataTables = new Set(['schema_migrations', 'schema_baseline']);
const unsupportedTableSyntax = new Set([
    'CHECK', 'COLLATE', 'GENERATED', 'STRICT', 'WITHOUT', 'DEFERRABLE', 'CONFLICT'
]);
const ffgUserOrder = [
    'id', 'username', 'password_hash', 'isAdmin', 'created_at', 'updated_at', 'role'
];

// Tokenization is limited to comparing trigger SQL and detecting table features
// that the PRAGMA representation below cannot yet prove equivalent. It is not
// a general SQL parser. Quoted content is preserved; comments are discarded.
function sqlTokens(sql) {
    const tokens = [];
    for (let index = 0; index < sql.length;) {
        const char = sql[index];
        if (/\s/.test(char)) {
            index += 1;
        } else if (sql.slice(index, index + 2) === '--') {
            index = sql.indexOf('\n', index + 2);
            if (index === -1) break;
        } else if (sql.slice(index, index + 2) === '/*') {
            const end = sql.indexOf('*/', index + 2);
            if (end === -1) throw new Error('Unterminated SQL comment');
            index = end + 2;
        } else if ("'\"`[".includes(char)) {
            const closing = char === '[' ? ']' : char;
            let end = index + 1;
            while (end < sql.length) {
                if (sql[end] === closing) {
                    if (sql[end + 1] === closing) {
                        end += 2;
                        continue;
                    }
                    break;
                }
                end += 1;
            }
            if (end === sql.length) throw new Error('Unterminated quoted SQL token');
            tokens.push(sql.slice(index, end + 1));
            index = end + 1;
        } else if (/[A-Za-z_]/.test(char)) {
            let end = index + 1;
            while (end < sql.length && /[A-Za-z_0-9$]/.test(sql[end])) end += 1;
            tokens.push(sql.slice(index, end).toUpperCase());
            index = end;
        } else {
            tokens.push(char);
            index += 1;
        }
    }
    return tokens;
}

const normalizedSql = sql => sqlTokens(sql).join(' ');
const normalizedType = type => type.trim().replace(/\s+/g, ' ').toUpperCase();
const sorted = values => values.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

function foreignKeys(db, table) {
    const groups = new Map();
    for (const row of db.prepare('SELECT * FROM pragma_foreign_key_list(?)').all(table)) {
        if (!groups.has(row.id)) groups.set(row.id, []);
        groups.get(row.id).push(row);
    }
    return sorted([...groups.values()].map(rows => {
        rows.sort((left, right) => left.seq - right.seq);
        return {
            table: rows[0].table,
            onUpdate: rows[0].on_update,
            onDelete: rows[0].on_delete,
            match: rows[0].match,
            columns: rows.map(row => ({ from: row.from, to: row.to }))
        };
    }));
}

function indexes(db, table, objects) {
    return sorted(db.prepare('SELECT * FROM pragma_index_list(?)').all(table).map(index => ({
        name: index.origin === 'c' ? index.name : null,
        unique: index.unique,
        origin: index.origin,
        partial: index.partial,
        columns: db.prepare('SELECT * FROM pragma_index_xinfo(?)').all(index.name)
            .filter(column => column.key === 1)
            .sort((left, right) => left.seqno - right.seqno)
            .map(column => ({ name: column.name, desc: column.desc, coll: column.coll })),
        sql: index.origin === 'c' ? normalizedSql(objects.get(index.name)?.sql ?? '') : null
    })));
}

export function schemaSignature(db) {
    const objects = db.prepare(`
        SELECT type, name, tbl_name AS tableName, sql FROM sqlite_schema
        WHERE sql IS NOT NULL ORDER BY type, name
    `).all().filter(object => !object.name.startsWith('sqlite_'));
    const byName = new Map(objects.map(object => [object.name, object]));
    const shared = objects.filter(object => !metadataTables.has(object.name)
        && !metadataTables.has(object.tableName)
        && !(object.type === 'table' && analyticsTables.has(object.name))
        && !analyticsTables.has(object.tableName));

    return {
        tables: shared.filter(object => object.type === 'table').map(object => {
            const tokens = sqlTokens(object.sql);
            const unsupported = tokens.filter(token => unsupportedTableSyntax.has(token));
            if (unsupported.length > 0) {
                throw new Error(`Unsupported constraint or table option on ${object.name}: ${unsupported.join(', ')}`);
            }
            return {
                name: object.name,
                columns: sorted(db.prepare('SELECT * FROM pragma_table_xinfo(?)').all(object.name)
                    .map(column => ({
                        name: column.name,
                        type: normalizedType(column.type),
                        notNull: column.notnull,
                        default: column.dflt_value === null ? null : normalizedSql(column.dflt_value),
                        primaryKey: column.pk,
                        hidden: column.hidden
                    }))),
                autoIncrement: tokens.filter(token => token === 'AUTOINCREMENT').length,
                foreignKeys: foreignKeys(db, object.name),
                indexes: indexes(db, object.name, byName)
            };
        }).sort((left, right) => left.name.localeCompare(right.name)),
        triggers: shared.filter(object => object.type === 'trigger').map(object => ({
            name: object.name,
            table: object.tableName,
            sql: normalizedSql(object.sql)
        })).sort((left, right) => left.name.localeCompare(right.name)),
        otherObjects: shared.filter(object => !['table', 'trigger', 'index'].includes(object.type))
            .map(object => ({ type: object.type, name: object.name, sql: normalizedSql(object.sql) }))
    };
}

export function expectedSignature(migrations, appliedCount, variant) {
    const reference = new Database(':memory:');
    try {
        reference.exec(migrations[0].sql);
        if (variant === BASELINE_VARIANTS.TTA) {
            // The historical description column is retained, including after
            // future migrations. Its physical position is not application data.
            reference.exec('ALTER TABLE categories ADD COLUMN description TEXT');
        } else if (![BASELINE_VARIANTS.CANONICAL, BASELINE_VARIANTS.FFG].includes(variant)) {
            throw new Error(`Unknown baseline variant: ${variant}`);
        }
        for (let index = 1; index < appliedCount; index += 1) {
            reference.prepare(migrations[index].sql).run();
        }
        return schemaSignature(reference);
    } finally {
        reference.close();
    }
}

export function recognizeUntrackedVariant(db, migrations) {
    const actual = JSON.stringify(schemaSignature(db));
    const matches = [];
    if (actual === JSON.stringify(expectedSignature(migrations, 1, BASELINE_VARIANTS.TTA))) {
        matches.push(BASELINE_VARIANTS.TTA);
    }
    if (actual === JSON.stringify(expectedSignature(migrations, 1, BASELINE_VARIANTS.CANONICAL))) {
        const userOrder = db.prepare('SELECT name FROM pragma_table_xinfo(?) ORDER BY cid')
            .all('users').map(column => column.name);
        matches.push(JSON.stringify(userOrder) === JSON.stringify(ffgUserOrder)
            ? BASELINE_VARIANTS.FFG : BASELINE_VARIANTS.CANONICAL);
    }
    if (matches.length !== 1) {
        throw new Error(matches.length === 0
            ? 'Unsupported or drifted shared database schema'
            : `Ambiguous supported baseline variants: ${matches.join(', ')}`);
    }
    return matches[0];
}
