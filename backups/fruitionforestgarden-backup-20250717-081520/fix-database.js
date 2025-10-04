const Database = require('better-sqlite3');
const path = require('path');

console.log('Fixing SQLite database schema...');

try {
    // Open the database
    const dbPath = path.join(__dirname, 'src', 'database', 'blog.db');
    const db = new Database(dbPath);
    
    console.log('Database opened successfully');
    
    // Check if sessions table exists
    const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='sessions'
    `).get();
    
    if (!tableExists) {
        console.log('Creating sessions table...');
        db.exec(`
            CREATE TABLE sessions (
                sid TEXT PRIMARY KEY,
                expired INTEGER,
                sess TEXT
            )
        `);
        console.log('Sessions table created successfully');
    } else {
        console.log('Sessions table already exists');
        
        // Check if expire column exists
        const columns = db.prepare("PRAGMA table_info(sessions)").all();
        const hasExpireColumn = columns.some(col => col.name === 'expire');
        
        if (!hasExpireColumn) {
            console.log('Adding missing expire column...');
            db.exec('ALTER TABLE sessions ADD COLUMN expire INTEGER');
            console.log('Expire column added successfully');
        } else {
            console.log('Expire column already exists');
        }
    }
    
    // Check if the main blog tables exist and create them if needed
    const blogTableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='posts'
    `).get();
    
    if (!blogTableExists) {
        console.log('Creating blog tables...');
        db.exec(`
            CREATE TABLE posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                excerpt TEXT,
                slug TEXT UNIQUE NOT NULL,
                author_id INTEGER,
                status TEXT DEFAULT 'draft',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                published_at DATETIME,
                featured_image TEXT,
                meta_description TEXT,
                tags TEXT
            )
        `);
        
        db.exec(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        db.exec(`
            CREATE TABLE categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('Blog tables created successfully');
    } else {
        console.log('Blog tables already exist');

        // Check for 'role' column in 'users' table and add if it doesn't exist
        const userColumns = db.prepare("PRAGMA table_info(users)").all();
        const hasPasswordColumn = userColumns.some(col => col.name === 'password');
        const hasRoleColumn = userColumns.some(col => col.name === 'role');

        if (hasPasswordColumn) {
            console.log("Renaming 'password' column to 'password_hash'...");
            // Note: RENAME COLUMN requires SQLite 3.25.0+
            db.exec("ALTER TABLE users RENAME COLUMN password TO password_hash");
            console.log("'password' column renamed successfully.");
        }

        if (!hasRoleColumn) {
            console.log("Adding 'role' column to 'users' table...");
            db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
            console.log("'role' column added successfully.");
        } else {
            console.log("'role' column already exists.");
        }
    }
    
    db.close();
    console.log('Database schema fixed successfully!');
    
} catch (error) {
    console.error('Error fixing database schema:', error);
    process.exit(1);
} 