#!/usr/bin/env node
/**
 * Setup Local Admin Users
 * Creates admin users for local development
 * 
 * Usage:
 *   node scripts/setup-local-admin.js [site] [username] [password]
 *   node scripts/setup-local-admin.js fruitionforestgarden admin local123
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const siteName = process.argv[2] || 'fruitionforestgarden';
const username = process.argv[3] || 'admin';
const password = process.argv[4] || 'local123';

// Determine database path based on site
// Note: Containers use /app/data/database/blog.db, local uses src/database/blog.db
let dbPath;
if (siteName === 'fruitionforestgarden') {
    // Try container path first, then local path
    const containerPath = '/app/data/database/blog.db';
    const localPath = path.join(__dirname, '..', 'fruitionforestgarden', 'src', 'database', 'blog.db');
    // Check if running in container or locally
    if (process.env.DATABASE_PATH) {
        dbPath = process.env.DATABASE_PATH;
    } else {
        // Use local path (will work with bind mounts)
        dbPath = localPath;
    }
} else if (siteName === 'thetecnoagrarian') {
    const containerPath = '/app/data/database/blog.db';
    const localPath = path.join(__dirname, '..', 'thetecnoagrarian', 'src', 'database', 'blog.db');
    if (process.env.DATABASE_PATH) {
        dbPath = process.env.DATABASE_PATH;
    } else {
        dbPath = localPath;
    }
} else {
    console.error(`❌ Unknown site: ${siteName}`);
    console.error('Usage: node scripts/setup-local-admin.js [fruitionforestgarden|thetecnoagrarian] [username] [password]');
    process.exit(1);
}

console.log(`\n🔧 Setting up local admin user for ${siteName}`);
console.log(`📁 Database: ${dbPath}`);
console.log(`👤 Username: ${username}\n`);

try {
    const db = new Database(dbPath);
    
    // Check if users table exists
    const tableCheck = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='users'
    `).get();
    
    if (!tableCheck) {
        console.error('❌ Users table does not exist. Database may need initialization.');
        console.error('💡 Try accessing the site in browser first to initialize the database.');
        process.exit(1);
    }
    
    // Check if user already exists
    const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (existingUser) {
        // Update existing user
        console.log(`⚠️  User '${username}' already exists. Updating password and admin status...`);
        const hashedPassword = bcrypt.hashSync(password, 10);
        
        // Check what columns exist
        const columns = db.prepare("PRAGMA table_info(users)").all();
        const columnNames = columns.map(c => c.name);
        
        let updateStmt;
        if (columnNames.includes('password_hash')) {
            updateStmt = db.prepare(`
                UPDATE users 
                SET password_hash = ?, isAdmin = 1 
                WHERE username = ?
            `);
            updateStmt.run(hashedPassword, username);
        } else if (columnNames.includes('password')) {
            updateStmt = db.prepare(`
                UPDATE users 
                SET password = ?, isAdmin = 1 
                WHERE username = ?
            `);
            updateStmt.run(hashedPassword, username);
        } else {
            console.error('❌ Could not find password column in users table');
            process.exit(1);
        }
        
        console.log(`✅ Updated user '${username}' with admin privileges`);
    } else {
        // Create new user
        console.log(`➕ Creating new admin user '${username}'...`);
        const hashedPassword = bcrypt.hashSync(password, 10);
        
        // Check what columns exist
        const columns = db.prepare("PRAGMA table_info(users)").all();
        const columnNames = columns.map(c => c.name);
        
        let insertStmt;
        if (columnNames.includes('password_hash')) {
            insertStmt = db.prepare(`
                INSERT INTO users (username, password_hash, isAdmin)
                VALUES (?, ?, 1)
            `);
            insertStmt.run(username, hashedPassword);
        } else if (columnNames.includes('password')) {
            insertStmt = db.prepare(`
                INSERT INTO users (username, password, isAdmin)
                VALUES (?, ?, 1)
            `);
            insertStmt.run(username, hashedPassword);
        } else {
            console.error('❌ Could not find password column in users table');
            process.exit(1);
        }
        
        console.log(`✅ Created admin user '${username}'`);
    }
    
    // Verify the user
    const user = db.prepare('SELECT username, isAdmin FROM users WHERE username = ?').get(username);
    console.log(`\n✅ Setup complete!`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Admin: ${user.isAdmin ? 'Yes' : 'No'}`);
    console.log(`   Password: ${password}`);
    console.log(`\n🌐 Login at: http://localhost:${siteName === 'fruitionforestgarden' ? '4000' : '4002'}/admin/login\n`);
    
    db.close();
    
} catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'SQLITE_CANTOPEN') {
        console.error(`💡 Database file not found. Make sure the container is running and database is initialized.`);
        console.error(`💡 Try accessing the site in browser first to initialize the database.`);
    }
    process.exit(1);
}

