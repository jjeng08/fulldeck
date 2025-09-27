#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const env = process.argv[2] || 'development';

// Map environment to database names
const databaseMap = {
  development: 'fulldeck_dev',
  dev: 'fulldeck_dev',
  qa: 'fulldeck_qa',
  staging: 'fulldeck_stage',
  stage: 'fulldeck_stage',
  production: 'fulldeck_prod',
  prod: 'fulldeck_prod'
};

const databaseName = databaseMap[env];
if (!databaseName) {
  console.error(`Unknown environment: ${env}`);
  process.exit(1);
}

console.log(`Setting up environment: ${env}`);

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    // Fix for Windows - use .cmd extension for npm/npx
    const isWindows = process.platform === 'win32';
    const actualCommand = (isWindows && (command === 'npm' || command === 'npx')) ? `${command}.cmd` : command;
    
    const childProcess = spawn(actualCommand, args, { stdio: 'inherit', shell: isWindows, ...options });
    childProcess.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

async function setup() {
  try {
    // Log session start
    console.log('=== NEW SESSION STARTED:', new Date().toISOString(), '===');
    
    // Sync core
    await runCommand('npm', ['run', 'sync-core']);
    
    // Install dependencies
    await runCommand('npm', ['install']);
    
    // Backend setup
    await runCommand('npm', ['install'], { cwd: 'backend' });
    
    // Create database for environment if it doesn't exist
    console.log(`Setting up database: ${databaseName}`);
    
    try {
      // Check if database exists using full path to psql
      const psqlPath = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
      await runCommand(psqlPath, [
        '-U', 'postgres',
        '-h', 'localhost',
        '-p', '5432',
        '-lqt'
      ]);
      
      // Check if our specific database exists
      const { spawn } = require('child_process');
      const checkDb = spawn(psqlPath, [
        '-U', 'postgres',
        '-h', 'localhost', 
        '-p', '5432',
        '-lqt'
      ]);
      
      let dbExists = false;
      checkDb.stdout.on('data', (data) => {
        if (data.toString().includes(databaseName)) {
          dbExists = true;
        }
      });
      
      await new Promise((resolve) => {
        checkDb.on('close', resolve);
      });
      
      if (!dbExists) {
        console.log(`Creating database ${databaseName}...`);
        await runCommand(psqlPath, [
          '-U', 'postgres',
          '-h', 'localhost',
          '-p', '5432',
          '-c', `CREATE DATABASE ${databaseName};`
        ]);
        
        console.log('Creating fulldeck_user...');
        await runCommand(psqlPath, [
          '-U', 'postgres', 
          '-h', 'localhost',
          '-p', '5432',
          '-c', "CREATE USER fulldeck_user WITH PASSWORD 'fulldeck_password';"
        ]);
        
        console.log('Granting privileges...');
        await runCommand(psqlPath, [
          '-U', 'postgres',
          '-h', 'localhost', 
          '-p', '5432',
          '-c', `GRANT ALL PRIVILEGES ON DATABASE ${databaseName} TO fulldeck_user;`
        ]);
      } else {
        console.log(`Database ${databaseName} already exists`);
      }
      
    } catch (error) {
      console.error('Failed to connect to Postgres. Make sure PostgreSQL is installed and running on port 5432.');
      console.error('Error:', error.message);
      process.exit(1);
    }
    
    // Generate Prisma client
    await runCommand('npx', ['prisma', 'generate', '--schema=database/schema.prisma'], {
      cwd: 'backend'
    });
    
    // Push schema to database (using same approach as working manual command)
    const nodeEnv = env === 'dev' ? 'development' : env;
    const envConfig = require('../backend/core/environments');
    const databaseUrl = envConfig.buildDatabaseUrl(nodeEnv);
    
    await runCommand('npx', ['prisma', 'db', 'push', '--schema=database/schema.prisma'], {
      cwd: 'backend',
      env: { ...process.env, NODE_ENV: nodeEnv, DATABASE_URL: databaseUrl }
    });
    
    // Frontend setup  
    await runCommand('npm', ['install'], { cwd: 'frontend' });
    
    console.log(`Setup complete for ${env} environment`);
  } catch (error) {
    console.error('Setup failed:', error.message);
    process.exit(1);
  }
}

setup();