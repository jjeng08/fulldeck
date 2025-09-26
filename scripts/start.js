#!/usr/bin/env node

const { spawn } = require('child_process');

const env = process.argv[2] || 'development';
const mode = process.argv[3]; // 'local' or undefined

const backendScript = mode === 'local' ? 'local' : 'start';

console.log(`Starting with environment: ${env}, mode: ${mode || 'production'}`);

// Kill any processes that might be using our ports
async function killProcessOnPort(port) {
  try {
    const { execSync } = require('child_process');
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Windows: find and kill process using port
      try {
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
        const lines = result.trim().split('\n');
        const pids = new Set();
        
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5) {
            pids.add(parts[4]);
          }
        });
        
        pids.forEach(pid => {
          if (pid && pid !== '0') {
            execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          }
        });
      } catch (e) {
        // Port not in use, that's fine
      }
    } else {
      // Linux/Mac: use lsof
      try {
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8' });
        const pids = result.trim().split('\n');
        pids.forEach(pid => {
          if (pid) {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
          }
        });
      } catch (e) {
        // Port not in use, that's fine
      }
    }
  } catch (error) {
    // Ignore errors - ports might not be in use
  }
}

// Clean up ports before starting
console.log('Cleaning up any existing processes...');
killProcessOnPort(8090); // WebSocket port
killProcessOnPort(3001); // API port
killProcessOnPort(3000); // Frontend port

let frontendProcess = null;

// Start backend first
const isWindows = process.platform === 'win32';
const backendProcess = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', backendScript], {
  stdio: 'pipe',
  cwd: 'backend',
  env: { ...process.env, NODE_ENV: env },
  shell: isWindows
});

// Track which servers are ready
let wsReady = false;
let httpReady = false;

// Monitor backend output for readiness
backendProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
  const output = data.toString();
  
  // Check if WebSocket server is ready
  if (output.includes('FullDeck WebSocket server is running')) {
    wsReady = true;
  }
  
  // Check if HTTP server is ready
  if (output.includes('FullDeck HTTP API server is running')) {
    httpReady = true;
  }
  
  // Start frontend when both are ready
  if (wsReady && httpReady && !frontendProcess) {
    console.log('Backend ready, starting frontend...');
    
    // Start frontend once backend is ready
    frontendProcess = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'web'], {
      stdio: 'inherit',
      cwd: 'frontend', 
      env: { ...process.env, NODE_ENV: env },
      shell: isWindows
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