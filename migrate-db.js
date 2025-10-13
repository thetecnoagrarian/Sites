import Database from 'better-sqlite3';

const db = new Database('/app/data/blog.db');

console.log('Migrating database schema...');

// Check current schema
const schema = db.prepare('PRAGMA table_info(posts)').all();
console.log('Current posts table schema:');
schema.forEach(col => console.log(`- ${col.name} (${col.type})`));

// Add missing columns if they don't exist
const columnNames = schema.map(col => col.name);

if (!columnNames.includes('description')) {
    try {
        db.exec('ALTER TABLE posts ADD COLUMN description TEXT;');
        console.log('✅ Added description column');
    } catch(e) {
        console.log('❌ Error adding description column:', e.message);
    }
}

if (!columnNames.includes('images')) {
    try {
        db.exec('ALTER TABLE posts ADD COLUMN images TEXT;');
        console.log('✅ Added images column');
    } catch(e) {
        console.log('❌ Error adding images column:', e.message);
    }
}

if (!columnNames.includes('captions')) {
    try {
        db.exec('ALTER TABLE posts ADD COLUMN captions TEXT;');
        console.log('✅ Added captions column');
    } catch(e) {
        console.log('❌ Error adding captions column:', e.message);
    }
}

// Show final schema
const finalSchema = db.prepare('PRAGMA table_info(posts)').all();
console.log('\nFinal posts table schema:');
finalSchema.forEach(col => console.log(`- ${col.name} (${col.type})`));

db.close();
console.log('\nDatabase migration complete!');
