const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Configuration
const BACKUP_DIR = path.join(__dirname, '../../backups');
const DB_PATH = path.join(__dirname, '../database/blog.db');
const UPLOADS_PATH = path.join(__dirname, '../public/uploads');
const APP_PATH = path.join(__dirname, '../..');

// Create backup directory if it doesn't exist
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Generate timestamp for backup folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

console.log(`Starting backup to: ${backupPath}`);
    
        // Create backup directory
fs.mkdirSync(backupPath, { recursive: true });
        
// 1. Backup database
console.log('Backing up database...');
const dbBackupPath = path.join(backupPath, 'database');
fs.mkdirSync(dbBackupPath, { recursive: true });

try {
    fs.copyFileSync(DB_PATH, path.join(dbBackupPath, 'blog.db'));
    console.log('✓ Database backed up successfully');
} catch (error) {
    console.error('✗ Database backup failed:', error.message);
}

// 2. Backup uploads directory
console.log('Backing up uploads...');
const uploadsBackupPath = path.join(backupPath, 'uploads');

try {
    // Copy uploads directory recursively
    function copyDir(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        
        const items = fs.readdirSync(src);
        for (const item of items) {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            
            if (fs.statSync(srcPath).isDirectory()) {
                copyDir(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
    
    if (fs.existsSync(UPLOADS_PATH)) {
        copyDir(UPLOADS_PATH, uploadsBackupPath);
        console.log('✓ Uploads backed up successfully');
    } else {
        console.log('⚠ Uploads directory does not exist, skipping');
    }
    } catch (error) {
    console.error('✗ Uploads backup failed:', error.message);
}

// 3. Create backup info file
const backupInfo = {
    timestamp: new Date().toISOString(),
    database: {
        path: DB_PATH,
        size: fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0
    },
    uploads: {
        path: UPLOADS_PATH,
        exists: fs.existsSync(UPLOADS_PATH)
    },
    app: {
        path: APP_PATH,
        version: require(path.join(APP_PATH, 'package.json')).version || 'unknown'
    }
};

fs.writeFileSync(
    path.join(backupPath, 'backup-info.json'),
    JSON.stringify(backupInfo, null, 2)
);

console.log('✓ Backup info file created');

// 4. Create compressed archive
console.log('Creating compressed archive...');
const archiveName = `backup-${timestamp}.tar.gz`;
const archivePath = path.join(BACKUP_DIR, archiveName);

exec(`tar -czf "${archivePath}" -C "${backupPath}" .`, (error, stdout, stderr) => {
    if (error) {
        console.error('✗ Archive creation failed:', error.message);
        return;
    }
    
    console.log('✓ Compressed archive created');
    
    // Clean up uncompressed backup directory
    fs.rmSync(backupPath, { recursive: true, force: true });
    console.log('✓ Cleaned up uncompressed backup directory');
    
    // Show backup size
    const archiveSize = fs.statSync(archivePath).size;
    const sizeMB = (archiveSize / (1024 * 1024)).toFixed(2);
    console.log(`\n🎉 Backup completed successfully!`);
    console.log(`📁 Archive: ${archivePath}`);
    console.log(`📊 Size: ${sizeMB} MB`);
    
    // List recent backups
    console.log('\n📋 Recent backups:');
    const backups = fs.readdirSync(BACKUP_DIR)
        .filter(file => file.endsWith('.tar.gz'))
        .sort()
        .reverse()
        .slice(0, 5);
    
    backups.forEach(backup => {
        const backupPath = path.join(BACKUP_DIR, backup);
        const stats = fs.statSync(backupPath);
        const size = (stats.size / (1024 * 1024)).toFixed(2);
        const date = stats.mtime.toISOString().split('T')[0];
        console.log(`  ${backup} (${size} MB) - ${date}`);
    });
});

// If running directly (not imported as module)
if (require.main === module) {
    // Script runs automatically when executed directly
    console.log('Backup script completed.');
} 