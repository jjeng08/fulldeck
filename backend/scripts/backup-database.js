const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = path.join(__dirname, '../prisma/dev.db');
const BACKUP_DIR = path.join(__dirname, '../backups');
const MAX_BACKUPS = 30; // Keep 30 days of backups

function createBackup() {
  try {
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Create timestamp for backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `dev-${timestamp}.db`);

    // Copy database file
    fs.copyFileSync(DB_PATH, backupPath);

    console.log(`Database backed up to: ${backupPath}`);

    // Clean up old backups
    cleanupOldBackups();

    return backupPath;
  } catch (error) {
    console.error('Backup failed:', error.message);
    throw error;
  }
}

function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('dev-') && file.endsWith('.db'))
      .map(file => ({
        name: file,
        path: path.join(BACKUP_DIR, file),
        time: fs.statSync(path.join(BACKUP_DIR, file)).mtime
      }))
      .sort((a, b) => b.time - a.time);

    // Remove old backups beyond the limit
    if (files.length > MAX_BACKUPS) {
      const filesToDelete = files.slice(MAX_BACKUPS);
      filesToDelete.forEach(file => {
        fs.unlinkSync(file.path);
        console.log(`Deleted old backup: ${file.name}`);
      });
    }
  } catch (error) {
    console.error('Cleanup failed:', error.message);
  }
}

function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      console.log('No backups directory found');
      return [];
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('dev-') && file.endsWith('.db'))
      .map(file => {
        const stat = fs.statSync(path.join(BACKUP_DIR, file));
        return {
          name: file,
          path: path.join(BACKUP_DIR, file),
          size: stat.size,
          created: stat.mtime
        };
      })
      .sort((a, b) => b.created - a.created);

    return files;
  } catch (error) {
    console.error('Failed to list backups:', error.message);
    return [];
  }
}

function restoreBackup(backupFilename) {
  try {
    const backupPath = path.join(BACKUP_DIR, backupFilename);
    
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupFilename}`);
    }

    // Create a backup of current database before restoring
    const currentBackup = createBackup();
    console.log(`Current database backed up to: ${currentBackup}`);

    // Restore from backup
    fs.copyFileSync(backupPath, DB_PATH);
    console.log(`Database restored from: ${backupPath}`);

    return true;
  } catch (error) {
    console.error('Restore failed:', error.message);
    throw error;
  }
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case 'create':
      createBackup();
      break;
    case 'list':
      const backups = listBackups();
      console.log('Available backups:');
      backups.forEach(backup => {
        console.log(`  ${backup.name} - ${backup.created.toISOString()} (${backup.size} bytes)`);
      });
      break;
    case 'restore':
      const filename = process.argv[3];
      if (!filename) {
        console.error('Please specify backup filename to restore');
        process.exit(1);
      }
      restoreBackup(filename);
      break;
    default:
      console.log('Usage:');
      console.log('  node backup-database.js create   - Create a new backup');
      console.log('  node backup-database.js list     - List available backups');
      console.log('  node backup-database.js restore <filename> - Restore from backup');
  }
}

module.exports = { createBackup, listBackups, restoreBackup, cleanupOldBackups };