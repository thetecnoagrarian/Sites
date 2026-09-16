import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMigrationRunner } from './migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize database with schema
 * @param {string} dbPath - Path to SQLite database file
 * @returns {Database} - Initialized database instance
 */
export function initializeDatabase(dbPath) {
    // Ensure parent directory exists (SQLite will create the file, not the folder)
    try {
        mkdirSync(dirname(dbPath), { recursive: true });
    } catch (error) {
        // If directory creation fails, provide a helpful error message
        if (error.code === 'ENOENT' || error.code === 'EACCES') {
            throw new Error(
                `Cannot create database directory for "${dbPath}". ` +
                `Parent directory may not exist or you may not have permissions. ` +
                `For local development, ensure DATABASE_PATH points to a writable location. ` +
                `Original error: ${error.message}`
            );
        }
        throw error;
    }
    
    const db = new Database(dbPath);
    
    try {
        // Only a genuinely empty database receives the fresh baseline. Existing
        // schemas are changed by the explicit migration runner, not app startup.
        const hasSchema = db.prepare(`
            SELECT 1 FROM sqlite_schema
            WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
            LIMIT 1
        `).get();
        if (!hasSchema) {
            const schemaPath = join(__dirname, 'schema.sql');
            const schema = readFileSync(schemaPath, 'utf8');
            db.transaction(() => db.exec(schema)).immediate();
        } else {
            // Reject unsupported existing schemas without applying migrations.
            createMigrationRunner().inspect(dbPath);
        }
        return db;
    } catch (error) {
        db.close();
        throw error;
    }
}

/**
 * Create a database connection
 * @param {string} dbPath - Path to SQLite database file
 * @returns {Database} - Database instance
 */
export function createDatabase(dbPath) {
    // Ensure parent directory exists (SQLite will create the file, not the folder)
    try {
        mkdirSync(dirname(dbPath), { recursive: true });
    } catch (error) {
        // If directory creation fails, provide a helpful error message
        if (error.code === 'ENOENT' || error.code === 'EACCES') {
            throw new Error(
                `Cannot create database directory for "${dbPath}". ` +
                `Parent directory may not exist or you may not have permissions. ` +
                `For local development, ensure DATABASE_PATH points to a writable location. ` +
                `Original error: ${error.message}`
            );
        }
        throw error;
    }
    return new Database(dbPath);
}
