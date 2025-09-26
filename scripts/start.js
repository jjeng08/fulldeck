#!/usr/bin/env node

const { spawn } = require('child_process');

const env = process.argv[2] || 'development';
const mode = process.argv[3]; // 'local' or undefined

const backendScript = mode === 'local' ? 'local' : 'start';

console.log(`Starting with environment: ${env}, mode: ${mode || 'production'}`);

let frontendProcess = null;

// Start backend first
const backendProcess = spawn('npm', ['run', backendScript], {
  stdio: 'pipe',
  cwd: 'backend',
  env: { ...process.env, NODE_ENV: env }
});

// Monitor backend output for readiness
backendProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
  
  // Check if both servers are running
  if (data.toString().includes('FullDeck WebSocket server is running') && 
      data.toString().includes('FullDeck HTTP API server is running')) {
    
    console.log('Backend ready, starting frontend...');
    
    // Start frontend once backend is ready
    frontendProcess = spawn('npm', ['run', 'web'], {
      stdio: 'inherit',
      cwd: 'frontend', 
      env: { ...process.env, NODE_ENV: env }
    });
    
    frontendProcess.on('exit', () => process.exit());
  }
});

backendProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

backendProcess.on('exit', (code) => {
  console.log('Backend exited, shutting down...');
  if (frontendProcess) frontendProcess.kill();
  process.exit(code);
});

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  backendProcess.kill();
  if (frontendProcess) frontendProcess.kill();
  process.exit(0);
});