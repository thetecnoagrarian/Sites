import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// This will be set by the site-specific app
let dbInstance = null;

/**
 * Set the database instance for the models
 * @param {Database} database - Database instance
 */
export function setDatabase(database) {
    dbInstance = database;
}

/**
 * Get the database instance
 * @returns {Database} - Database instance
 */
export function getDatabase() {
    if (!dbInstance) {
        throw new Error('Database not initialized. Call setDatabase() first.');
    }
    return dbInstance;
}

export default getDatabase;

