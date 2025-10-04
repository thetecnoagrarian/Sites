import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, '../../backups');
const LOG_FILE = path.join(__dirname, '../../backup-reminder.log');

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    console.log(message);
    fs.appendFileSync(LOG_FILE, logMessage);
}

function checkBackups() {
    log('Checking backup status...');
    
    if (!fs.existsSync(BACKUP_DIR)) {
        log('⚠ Backup directory does not exist. Creating...');
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        log('✓ Backup directory created');
        return { needsBackup: true, reason: 'No backup directory found' };
    }
    
    // Get all backup files
    const backupFiles = fs.readdirSync(BACKUP_DIR)
        .filter(file => file.endsWith('.tar.gz'))
        .map(file => {
            const filePath = path.join(BACKUP_DIR, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                path: filePath,
                date: stats.mtime,
                size: stats.size
            };
        })
        .sort((a, b) => b.date - a.date); // Sort by date, newest first
    
    if (backupFiles.length === 0) {
        log('⚠ No backups found');
        return { needsBackup: true, reason: 'No backups exist' };
    }

    const latestBackup = backupFiles[0];
    const now = new Date();
    const daysSinceBackup = (now - latestBackup.date) / (1000 * 60 * 60 * 24);
    
    log(`📅 Latest backup: ${latestBackup.name} (${daysSinceBackup.toFixed(1)} days ago)`);

    // Check if backup is older than 7 days
    if (daysSinceBackup > 7) {
        log('⚠ Backup is older than 7 days');
        return { 
            needsBackup: true, 
            reason: `Last backup was ${daysSinceBackup.toFixed(1)} days ago`,
            latestBackup: latestBackup.name
        };
    }
    
    log('✓ Backup is recent');
    return { needsBackup: false, latestBackup: latestBackup.name };
}

function showBackupStats() {
    if (!fs.existsSync(BACKUP_DIR)) {
        log('No backup directory found');
        return;
    }

    const backupFiles = fs.readdirSync(BACKUP_DIR)
        .filter(file => file.endsWith('.tar.gz'))
        .map(file => {
            const filePath = path.join(BACKUP_DIR, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                date: stats.mtime,
                size: stats.size
            };
        })
        .sort((a, b) => b.date - a.date);
    
    if (backupFiles.length === 0) {
        log('No backups found');
        return;
    }
    
    log(`📊 Backup Statistics:`);
    log(`   Total backups: ${backupFiles.length}`);
    
    const totalSize = backupFiles.reduce((sum, backup) => sum + backup.size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    log(`   Total size: ${totalSizeMB} MB`);
    
    const avgSize = totalSize / backupFiles.length;
    const avgSizeMB = (avgSize / (1024 * 1024)).toFixed(2);
    log(`   Average size: ${avgSizeMB} MB`);
    
    log(`\n📋 Recent backups:`);
    backupFiles.slice(0, 5).forEach((backup, index) => {
        const sizeMB = (backup.size / (1024 * 1024)).toFixed(2);
        const date = backup.date.toISOString().split('T')[0];
        log(`   ${index + 1}. ${backup.name} (${sizeMB} MB) - ${date}`);
    });
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const result = checkBackups();
    
    if (result.needsBackup) {
        log(`\n🚨 BACKUP NEEDED: ${result.reason}`);
        log(`💡 Run: node src/scripts/backup.js`);
        
        // Optionally run backup automatically (uncomment to enable)
        // log('🔄 Running backup automatically...');
        // require('./backup.js');
    } else {
        log(`\n✅ Backup status: OK`);
    }
    
    log('\n' + '='.repeat(50));
    showBackupStats();
}

export { checkBackups, showBackupStats }; 