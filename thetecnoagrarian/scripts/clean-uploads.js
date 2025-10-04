const fs = require('fs');
const path = require('path');

console.log('🗑️  Cleaning uploads folder for thetecnoagrarian.com...');

const uploadsPath = path.join(__dirname, '..', 'src', 'public', 'uploads');

// Function to safely remove directory contents
function cleanDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        console.log('   📁 Uploads directory does not exist, creating...');
        fs.mkdirSync(dirPath, { recursive: true });
        return;
    }
    
    const items = fs.readdirSync(dirPath);
    console.log(`   📁 Found ${items.length} items in uploads folder`);
    
    items.forEach(item => {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            // Remove directory and its contents
            fs.rmSync(itemPath, { recursive: true, force: true });
            console.log(`   🗑️  Removed directory: ${item}`);
        } else {
            // Remove file
            fs.unlinkSync(itemPath);
            console.log(`   🗑️  Removed file: ${item}`);
        }
    });
    
    // Keep .gitkeep file if it exists
    const gitkeepPath = path.join(dirPath, '.gitkeep');
    if (!fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, '');
        console.log('   📝 Created .gitkeep file');
    }
}

try {
    cleanDirectory(uploadsPath);
    console.log('\n✅ Uploads folder cleaned successfully!');
    console.log('📝 Next steps:');
    console.log('1. Run: node scripts/clean-database.js');
    console.log('2. Restart your application');
    console.log('3. Start creating new content for thetecnoagrarian.com');
} catch (error) {
    console.error('❌ Error cleaning uploads folder:', error);
}

