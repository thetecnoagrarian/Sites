#!/usr/bin/env node

/**
 * Database Schema Migration Script
 * 
 * This script fixes the database schema mismatch by adding missing columns
 * to the posts table that the new blog code expects.
 * 
 * Usage: node migrate-db-schema.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database paths for both sites
const DB_PATHS = [
    path.join(__dirname, 'fruitionforestgarden/src/database/blog.db'),
    path.join(__dirname, 'thetecnoagrarian/src/database/blog.db')
];

function checkColumnExists(db, tableName, columnName) {
    try {
        const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
        const columns = stmt.all();
        return columns.some(col => col.name === columnName);
    } catch (error) {
        console.error(`Error checking column ${columnName} in table ${tableName}:`, error);
        return false;
    }
}

function addColumnIfNotExists(db, tableName, columnName, columnDefinition) {
    if (!checkColumnExists(db, tableName, columnName)) {
        try {
            const stmt = db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
            stmt.run();
            console.log(`✅ Added column ${columnName} to table ${tableName}`);
            return true;
        } catch (error) {
            console.error(`❌ Error adding column ${columnName} to table ${tableName}:`, error);
            return false;
        }
    } else {
        console.log(`ℹ️  Column ${columnName} already exists in table ${tableName}`);
        return false;
    }
}

function migrateDatabase(dbPath) {
    console.log(`\n🔧 Migrating database: ${dbPath}`);
    
    if (!fs.existsSync(dbPath)) {
        console.log(`⚠️  Database file not found: ${dbPath}`);
        return false;
    }
    
    const db = new Database(dbPath);
    let changesMade = false;
    
    try {
        // Check current schema
        console.log('\n📋 Current posts table schema:');
        const stmt = db.prepare('PRAGMA table_info(posts)');
        const columns = stmt.all();
        columns.forEach(col => {
            console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
        });
        
        // Add missing columns
        console.log('\n🔨 Adding missing columns...');
        
        // Add description column (for SEO and social media)
        if (addColumnIfNotExists(db, 'posts', 'description', 'TEXT')) {
            changesMade = true;
        }
        
        // Add images column (JSON array of image paths)
        if (addColumnIfNotExists(db, 'posts', 'images', 'TEXT')) {
            changesMade = true;
        }
        
        // Add captions column (JSON array of image captions)
        if (addColumnIfNotExists(db, 'posts', 'captions', 'TEXT')) {
            changesMade = true;
        }
        
        // Check if content column exists (should replace 'body' if it exists)
        if (!checkColumnExists(db, 'posts', 'content')) {
            if (checkColumnExists(db, 'posts', 'body')) {
                console.log('🔄 Found body column, adding content column...');
                console.log('   Note: You may need to copy data from body to content column manually if needed.');
            }
            
            if (addColumnIfNotExists(db, 'posts', 'content', 'TEXT')) {
                changesMade = true;
            }
        }
        
        // Show final schema
        console.log('\n📋 Final posts table schema:');
        const finalStmt = db.prepare('PRAGMA table_info(posts)');
        const finalColumns = finalStmt.all();
        finalColumns.forEach(col => {
            console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
        });
        
        if (changesMade) {
            console.log('\n✅ Database migration completed successfully!');
        } else {
            console.log('\n✅ Database schema is already up to date!');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error during migration:', error);
        return false;
    } finally {
        db.close();
    }
}

// Main execution
console.log('🚀 Starting database schema migration...');
console.log('This script will add missing columns to fix the "table posts has no column named description" error.\n');

let allSuccessful = true;

for (const dbPath of DB_PATHS) {
    const success = migrateDatabase(dbPath);
    if (!success) {
        allSuccessful = false;
    }
}

console.log('\n' + '='.repeat(60));

if (allSuccessful) {
    console.log('🎉 All database migrations completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Restart your Docker containers to pick up the schema changes');
    console.log('2. Test creating a new post to verify the fix');
    console.log('3. Check that posts appear on the homepage');
} else {
    console.log('⚠️  Some migrations had issues. Please check the output above.');
}

console.log('\n🔄 To restart containers:');
console.log('docker-compose -f docker-compose.prod.yml down');
console.log('docker-compose -f docker-compose.prod.yml up --build -d');
