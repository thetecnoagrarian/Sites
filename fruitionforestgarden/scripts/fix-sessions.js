const Database = require('better-sqlite3');
const path = require('path');

console.log('Fixing sessions table schema...');

try {
    // Open the database
    const dbPath = path.join(__dirname, 'src', 'database', 'blog.db');
    const db = new Database(dbPath);
    
    console.log('Database opened successfully');
    
    // Drop the existing sessions table to ensure a clean slate
    console.log('Dropping existing sessions table...');
    db.exec('DROP TABLE IF EXISTS sessions');
    
    // Recreate the table with the correct schema expected by the session store
    console.log('Creating sessions table with correct schema...');
    db.exec(`
        CREATE TABLE sessions (
            sid TEXT PRIMARY KEY,
            sess TEXT NOT NULL,
            expire INTEGER NOT NULL
        )
    `);
    
    console.log('Sessions table created successfully with correct schema.');
    
    db.close();
    console.log('Database schema fixed and connection closed.');
    
} catch (error) {
    console.error('Error fixing sessions table schema:', error);
    process.exit(1);
} 