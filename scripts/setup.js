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
    const process = spawn(command, args, { stdio: 'inherit', ...options });
    process.on('close', (code) => {
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
    
    // Start specific Docker container
    await runCommand('docker-compose', ['up', '-d', serviceName], { 
      cwd: 'backend/database' 
    });
    
    // Generate Prisma client
    await runCommand('npx', ['prisma', 'generate', '--schema=database/schema.prisma'], {
      cwd: 'backend'
    });
    
    // Run migrations
    await runCommand('npx', ['prisma', 'migrate', 'dev', '--schema=database/schema.prisma'], {
      cwd: 'backend',
      env: { ...process.env, NODE_ENV: env }
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