const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure the database directory exists
const dbDir = path.dirname(process.env.DATABASE_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db = new Database(process.env.DATABASE_PATH);

// Create tables if they don't exist
// Updated users table: remove created_at, add email and role
// Note: Migration for existing DBs should be handled separately

// Drop old users table if exists (for dev only, not for production!)
// db.exec('DROP TABLE IF EXISTS users');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT UNIQUE,
        role TEXT DEFAULT 'admin'
    );

    CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        body TEXT NOT NULL,
        description TEXT,
        excerpt TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        images TEXT,          -- JSON array of image paths
        captions TEXT         -- JSON array of captions
    );

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS post_categories (
        post_id INTEGER,
        category_id INTEGER,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (post_id, category_id)
    );
`);

// Add indexes for better performance
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
`);

// Create default admin user if none exists
const adminExists = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (adminExists.count === 0) {
    // Default admin credentials (should be changed after first login)
    const defaultUsername = 'admin';
    const defaultPassword = 'admin123'; // This should be hashed in production
    const defaultEmail = 'admin@example.com';
    db.prepare('INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)')
        .run(defaultUsername, defaultPassword, defaultEmail, 'admin');
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)')
        .run(defaultUsername, defaultPassword);
    console.log('Default admin user created');
}

module.exports = db; 