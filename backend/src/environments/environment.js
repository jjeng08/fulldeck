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
  const envPath = path.join(__dirname, envFile);
  
  // Check if environment file exists
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment config from: ${envFile}`);
    require('dotenv').config({ path: envPath });
  } else {
    console.warn(`Environment file ${envFile} not found, falling back to .env`);
    const fallbackPath = path.join(__dirname, '.env');
    require('dotenv').config({ path: fallbackPath });
  }
  
  // Validate required environment variables
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'WEBSOCKET_PORT'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    databaseUrl: process.env.DATABASE_URL,
    httpPort: parseInt(process.env.HTTP_PORT) || 3001,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development',
    websocketPort: parseInt(process.env.WEBSOCKET_PORT) || 8080
  };
}

module.exports = { loadEnvironmentConfig };