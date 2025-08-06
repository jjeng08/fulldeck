#!/usr/bin/env node

// Helper script to get ports from core environments config
const { getEnvironmentConfig } = require('../core/environments');

const portType = process.argv[2];
const env = process.argv[3] || 'development';

if (!portType) {
  console.error('Usage: node get-port.js <portType> [environment]');
  console.error('Example: node get-port.js frontendPort development');
  process.exit(1);
}

const config = getEnvironmentConfig(env);
const port = config[portType];

if (!port) {
  console.error(`Port type '${portType}' not found in environment '${env}'`);
  process.exit(1);
}

console.log(port);