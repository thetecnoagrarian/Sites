const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const BACKUP_DIR = path.join(__dirname, '..', 'backups', 'with-samples');
const DB_PATH = path.join(__dirname, '..', 'src', 'database', 'blog.db');
const UPLOADS_PATH = path.join(__dirname, '..', 'src', 'public', 'uploads');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');

console.log('🚀 Starting backup with sample posts and images...');

// Create backup directory
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Create timestamped backup directory
const timestampedBackupDir = path.join(BACKUP_DIR, TIMESTAMP);
fs.mkdirSync(timestampedBackupDir, { recursive: true });

console.log(`📁 Created backup directory: ${timestampedBackupDir}`);

// Backup database
console.log('💾 Backing up database...');
const dbBackupPath = path.join(timestampedBackupDir, 'blog.db');
fs.copyFileSync(DB_PATH, dbBackupPath);
console.log(`✅ Database backed up to: ${dbBackupPath}`);

// Backup uploads folder
console.log('📸 Backing up uploads folder...');
const uploadsBackupPath = path.join(timestampedBackupDir, 'uploads');
fs.mkdirSync(uploadsBackupPath, { recursive: true });

// Copy all files from uploads directory
function copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    
    items.forEach(item => {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        
        const stat = fs.statSync(srcPath);
        
        if (stat.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

copyDirectory(UPLOADS_PATH, uploadsBackupPath);
console.log(`✅ Uploads backed up to: ${uploadsBackupPath}`);

// Create a restore script
const restoreScript = `#!/bin/bash
# Restore script for sample posts and images
# Generated on: ${new Date().toISOString()}

echo "🔄 Restoring sample posts and images..."

# Restore database
echo "💾 Restoring database..."
cp "${path.relative(path.join(__dirname, '..'), dbBackupPath)}" "src/database/blog.db"
echo "✅ Database restored"

# Restore uploads
echo "📸 Restoring uploads..."
rm -rf src/public/uploads/*
cp -r "${path.relative(path.join(__dirname, '..'), uploadsBackupPath)}"/* src/public/uploads/
echo "✅ Uploads restored"

echo "🎉 Restore completed successfully!"
echo "📝 Note: You may need to restart your application for changes to take effect."
`;

const restoreScriptPath = path.join(timestampedBackupDir, 'restore.sh');
fs.writeFileSync(restoreScriptPath, restoreScript);
fs.chmodSync(restoreScriptPath, '755');

// Create a README file with instructions
const readmeContent = `# Backup with Sample Posts - ${TIMESTAMP}

This backup contains the complete database state and uploads folder with sample posts and images.

## Contents:
- \`blog.db\`: Complete database with sample posts, categories, and users
- \`uploads/\`: All uploaded images including sample post images
- \`restore.sh\`: Script to restore this backup

## How to use this backup:

### For Linode deployment:
1. Upload this entire folder to your Linode server
2. Run the restore script: \`bash restore.sh\`
3. Restart your application

### Manual restore:
1. Copy \`blog.db\` to \`src/database/blog.db\`
2. Copy contents of \`uploads/\` to \`src/public/uploads/\`
3. Restart your application

## Database contents:
- Sample posts about forest gardening
- Test categories: Gardening, Sustainability, Food Forest
- Admin user (username: admin, password: admin123)
- All associated images and media

## Backup created: ${new Date().toISOString()}
`;

const readmePath = path.join(timestampedBackupDir, 'README.md');
fs.writeFileSync(readmePath, readmeContent);

// Create a summary file
const summaryContent = `Backup Summary - ${TIMESTAMP}

Database size: ${(fs.statSync(dbBackupPath).size / 1024).toFixed(2)} KB
Uploads count: ${fs.readdirSync(uploadsBackupPath).length} files
Total backup size: ${(getDirectorySize(timestampedBackupDir) / 1024 / 1024).toFixed(2)} MB

This backup is ready for Linode deployment.
`;

const summaryPath = path.join(timestampedBackupDir, 'summary.txt');
fs.writeFileSync(summaryPath, summaryContent);

function getDirectorySize(dirPath) {
    let size = 0;
    const items = fs.readdirSync(dirPath);
    
    items.forEach(item => {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            size += getDirectorySize(itemPath);
        } else {
            size += stat.size;
        }
    });
    
    return size;
}

console.log('\n🎉 Backup completed successfully!');
console.log(`📁 Backup location: ${timestampedBackupDir}`);
console.log(`📊 Total size: ${(getDirectorySize(timestampedBackupDir) / 1024 / 1024).toFixed(2)} MB`);
console.log('\n📝 Next steps:');
console.log('1. This backup is ready for Linode deployment');
console.log('2. Use the restore.sh script on your Linode server');
console.log('3. The backup includes all sample posts and images');
console.log('\n💡 To clean your current database for thetecnoagrarian.com:');
console.log('   - Run: node scripts/fix-database.js');
console.log('   - Delete contents of src/public/uploads/');

