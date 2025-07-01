const path = require('path');
const fs = require('fs');

function loadEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  // Map environment names to file suffixes
  const envFileMap = {
    'dev': '.env.dev',
    'qa': '.env.qa',
    'stage': '.env.stage',
    'production': '.env.production'
  };
  
  const envFile = envFileMap[env] || '.env.dev';
  const envPath = path.join(__dirname, '../../', envFile);
  
  // Check if environment file exists
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment config from: ${envFile}`);
    require('dotenv').config({ path: envPath });
  } else {
    console.warn(`Environment file ${envFile} not found, falling back to .env`);
    require('dotenv').config();
  }
  
  // Validate required environment variables
  const required = [
    'DATABASE_URL',
    'WEBSOCKET_PORT',
    'JWT_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL,
    websocketPort: parseInt(process.env.WEBSOCKET_PORT) || 8080,
    jwtSecret: process.env.JWT_SECRET,
    corsOrigin: process.env.CORS_ORIGIN || '*',
    logLevel: process.env.LOG_LEVEL || 'info'
  };
}

module.exports = { loadEnvironmentConfig };