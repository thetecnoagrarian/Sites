import { getDatabase } from './blog-core/src/models/db.js';

const db = getDatabase();

console.log('Adding missing columns to posts table...');

try {
    db.exec('ALTER TABLE posts ADD COLUMN description TEXT;');
    console.log('✅ Added description column');
} catch(e) {
    console.log('ℹ️  Description column already exists or error:', e.message);
}

try {
    db.exec('ALTER TABLE posts ADD COLUMN images TEXT;');
    console.log('✅ Added images column');
} catch(e) {
    console.log('ℹ️  Images column already exists or error:', e.message);
}

try {
    db.exec('ALTER TABLE posts ADD COLUMN captions TEXT;');
    console.log('✅ Added captions column');
} catch(e) {
    console.log('ℹ️  Captions column already exists or error:', e.message);
}

// Show current schema
const schema = db.prepare('PRAGMA table_info(posts)').all();
console.log('\nCurrent posts table schema:');
schema.forEach(col => console.log(`- ${col.name} (${col.type})`));

console.log('\nDatabase schema update complete!');
