#!/usr/bin/env node

/**
 * Database Schema Fix Script
 * Updates the database schema to match the live fruitionforestgarden.com site exactly
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database paths
const ffgDbPath = path.join(__dirname, 'fruitionforestgarden', 'src', 'database', 'blog.db');
const ttaDbPath = path.join(__dirname, 'thetecnoagrarian', 'src', 'database', 'blog.db');

console.log('🔧 Fixing database schemas to match live site...');

// Function to fix a database schema
function fixDatabaseSchema(dbPath, siteName) {
    console.log(`\n📊 Fixing ${siteName} database: ${dbPath}`);
    
    const db = new Database(dbPath);
    
    try {
        // Check current schema
        const currentSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='posts'").get();
        console.log(`Current posts schema: ${currentSchema?.sql || 'No posts table found'}`);
        
        // Drop the existing posts table
        console.log('🗑️  Dropping existing posts table...');
        db.exec('DROP TABLE IF EXISTS posts');
        
        // Create the posts table with the exact schema from live site
        console.log('🏗️  Creating posts table with live site schema...');
        db.exec(`
            CREATE TABLE posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                body TEXT NOT NULL,
                description TEXT,
                excerpt TEXT,
                images TEXT,          -- JSON array of image paths
                captions TEXT,        -- JSON array of captions
                author_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
        
        // Create the posts_updated_at trigger
        console.log('⚡ Creating posts_updated_at trigger...');
        db.exec(`
            CREATE TRIGGER posts_updated_at 
                AFTER UPDATE ON posts
            BEGIN
                UPDATE posts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
        `);
        
        // Verify the new schema
        const newSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='posts'").get();
        console.log(`✅ New posts schema: ${newSchema?.sql}`);
        
        console.log(`✅ ${siteName} database schema fixed successfully!`);
        
    } catch (error) {
        console.error(`❌ Error fixing ${siteName} database:`, error);
        throw error;
    } finally {
        db.close();
    }
}

// Fix both databases
try {
    fixDatabaseSchema(ffgDbPath, 'Fruition Forest Garden');
    fixDatabaseSchema(ttaDbPath, 'The Tecnoagrarian');
    
    console.log('\n🎉 All database schemas have been updated to match the live site!');
    console.log('\n📋 Schema changes made:');
    console.log('   • Changed "content" column to "body"');
    console.log('   • Added "description" column');
    console.log('   • Added "images" column for JSON array');
    console.log('   • Added "captions" column for JSON array');
    console.log('   • Removed extra columns that don\'t exist in live site');
    console.log('   • Added proper foreign key constraint');
    console.log('   • Added posts_updated_at trigger');
    
} catch (error) {
    console.error('❌ Failed to fix database schemas:', error);
    process.exit(1);
}