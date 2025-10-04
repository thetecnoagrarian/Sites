const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

console.log('🧹 Cleaning database for thetecnoagrarian.com deployment...');

const dbPath = path.join(__dirname, '..', 'src', 'database', 'blog.db');
const db = new sqlite3.Database(dbPath);

// Function to run SQL queries
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

// Function to get query results
function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

async function cleanDatabase() {
    try {
        console.log('📊 Current database state:');
        
        // Check current posts
        const posts = await getQuery('SELECT id, title FROM posts');
        console.log(`   Posts: ${posts.length}`);
        posts.forEach(post => console.log(`     - ${post.id}: ${post.title}`));
        
        // Check current categories
        const categories = await getQuery('SELECT id, name FROM categories');
        console.log(`   Categories: ${categories.length}`);
        categories.forEach(cat => console.log(`     - ${cat.id}: ${cat.name}`));
        
        // Check current users
        const users = await getQuery('SELECT id, username FROM users');
        console.log(`   Users: ${users.length}`);
        users.forEach(user => console.log(`     - ${user.id}: ${user.username}`));
        
        console.log('\n🗑️  Cleaning sample data...');
        
        // Delete all posts (this will cascade to post_categories)
        await runQuery('DELETE FROM posts');
        console.log('   ✅ Deleted all posts');
        
        // Delete all categories
        await runQuery('DELETE FROM categories');
        console.log('   ✅ Deleted all categories');
        
        // Keep admin user but reset password to default
        await runQuery('UPDATE users SET password = ? WHERE username = ?', ['admin123', 'admin']);
        console.log('   ✅ Reset admin password to default');
        
        // Reset auto-increment counters
        await runQuery('DELETE FROM sqlite_sequence WHERE name IN ("posts", "categories")');
        console.log('   ✅ Reset auto-increment counters');
        
        console.log('\n📊 Database after cleaning:');
        
        // Check final state
        const finalPosts = await getQuery('SELECT COUNT(*) as count FROM posts');
        const finalCategories = await getQuery('SELECT COUNT(*) as count FROM categories');
        const finalUsers = await getQuery('SELECT COUNT(*) as count FROM users');
        
        console.log(`   Posts: ${finalPosts[0].count}`);
        console.log(`   Categories: ${finalCategories[0].count}`);
        console.log(`   Users: ${finalUsers[0].count}`);
        
        console.log('\n✅ Database cleaned successfully!');
        console.log('📝 Next steps:');
        console.log('1. Delete contents of src/public/uploads/');
        console.log('2. Restart your application');
        console.log('3. Create new posts for thetecnoagrarian.com');
        
    } catch (error) {
        console.error('❌ Error cleaning database:', error);
    } finally {
        db.close();
    }
}

cleanDatabase();

