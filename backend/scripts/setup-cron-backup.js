const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPT_PATH = path.join(__dirname, 'backup-database.js');
const CRON_SCHEDULE = '0 */6 * * *'; // Every 6 hours

function setupCronJob() {
  try {
    console.log('Setting up automated database backups...');

    // Create the cron job command
    const cronCommand = `${CRON_SCHEDULE} cd ${path.dirname(SCRIPT_PATH)} && node backup-database.js create`;

    // Check if cron job already exists
    let existingCron = '';
    try {
      existingCron = execSync('crontab -l', { encoding: 'utf8' });
    } catch (error) {
      // No existing crontab, which is fine
    }

    // Add the backup job if it doesn't exist
    if (!existingCron.includes('backup-database.js')) {
      const newCron = existingCron + '\n' + cronCommand + '\n';
      
      // Write to temporary file
      const tempFile = '/tmp/new_crontab';
      fs.writeFileSync(tempFile, newCron);
      
      // Install the new crontab
      execSync(`crontab ${tempFile}`);
      
      // Clean up
      fs.unlinkSync(tempFile);
      
      console.log('✓ Automated backup cron job installed');
      console.log(`✓ Database will be backed up every 6 hours`);
    } else {
      console.log('✓ Automated backup cron job already exists');
    }

    // Create initial backup
    console.log('Creating initial backup...');
    execSync(`node ${SCRIPT_PATH} create`);
    console.log('✓ Initial backup created');

    console.log('\nBackup system is now active!');
    console.log('Commands:');
    console.log(`  node ${SCRIPT_PATH} create - Manual backup`);
    console.log(`  node ${SCRIPT_PATH} list - List all backups`);
    console.log(`  node ${SCRIPT_PATH} restore <filename> - Restore from backup`);

  } catch (error) {
    console.error('Failed to setup automated backups:', error.message);
    console.log('\nFallback: You can manually run backups with:');
    console.log(`  node ${SCRIPT_PATH} create`);
  }
}

if (require.main === module) {
  setupCronJob();
}

module.exports = { setupCronJob };