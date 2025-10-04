const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

// Create database directory if it doesn't exist
const dbPath = path.join(__dirname, 'blog.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Read and execute schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Create admin user if it doesn't exist
const createAdmin = () => {
    const username = 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123'; // Use ADMIN_PASSWORD env var in production!
    
    const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!existingAdmin) {
        const hashedPassword = bcrypt.hashSync(password, 10);
        db.prepare(`
            INSERT INTO users (username, password, isAdmin)
            VALUES (?, ?, 1)
        `).run(username, hashedPassword);
        console.log('Admin user created successfully');
    } else {
        console.log('Admin user already exists');
    }
};

try {
    createAdmin();
    console.log('Database initialized successfully');
} catch (error) {
    console.error('Error initializing database:', error);
}

// Close database connection
db.close(); 