import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize database with schema
 * @param {string} dbPath - Path to SQLite database file
 * @returns {Database} - Initialized database instance
 */
export function initializeDatabase(dbPath) {
    const db = new Database(dbPath);
    
    // Read and execute schema
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    
    // Execute the entire schema at once
    db.exec(schema);
    
    return db;
}

/**
 * Create a database connection
 * @param {string} dbPath - Path to SQLite database file
 * @returns {Database} - Database instance
 */
export function createDatabase(dbPath) {
    return new Database(dbPath);
}
