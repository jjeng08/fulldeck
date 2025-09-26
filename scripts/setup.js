#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const env = process.argv[2] || 'development';

// Map environment to container service name
const containerMap = {
  development: 'postgres-dev',
  dev: 'postgres-dev',
  qa: 'postgres-qa',
  staging: 'postgres-stage',
  stage: 'postgres-stage',
  production: 'postgres-prod',
  prod: 'postgres-prod'
};

const serviceName = containerMap[env];
if (!serviceName) {
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
    
    // Start specific Docker container (skip if already exists)
    const containerName = `fulldeck-postgres-${env}`;
    try {
      // Check if container exists
      await runCommand('docker', ['inspect', containerName]);
      console.log(`Container ${containerName} already exists, skipping creation`);
    } catch (error) {
      // Container doesn't exist, create it
      console.log(`Creating container ${containerName}`);
      
      // Create container with exact name using docker run
      const ports = {
        'postgres-dev': '5433',
        'postgres-qa': '5434', 
        'postgres-stage': '5435',
        'postgres-prod': '5432'
      };
      const databases = {
        'postgres-dev': 'fulldeck_dev',
        'postgres-qa': 'fulldeck_qa',
        'postgres-stage': 'fulldeck_stage', 
        'postgres-prod': 'fulldeck_prod'
      };
      
      await runCommand('docker', [
        'run', '-d',
        '--name', containerName,
        '-p', `${ports[serviceName]}:5432`,
        '-e', `POSTGRES_DB=${databases[serviceName]}`,
        '-e', 'POSTGRES_USER=fulldeck_user',
        '-e', 'POSTGRES_PASSWORD=fulldeck_password',
        '-v', `fulldeck_postgres_${env}_data:/var/lib/postgresql/data`,
        'postgres:15-alpine'
      ]);
      
      // Wait for new container to initialize
      console.log('Waiting for database to initialize...');
      await new Promise(resolve => setTimeout(resolve, 15000));
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