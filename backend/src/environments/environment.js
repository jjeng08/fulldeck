const path = require('path');
const fs = require('fs');
const { getEnvironmentConfig, buildDatabaseUrl } = require('../core/environments');

function loadEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  // Load core environment configuration
  const coreConfig = getEnvironmentConfig(env);
  
  // Map environment names to file suffixes for .env files (for secrets/overrides)
  const envFileMap = {
    'dev': '.env.dev',
    'development': '.env.dev',
    'qa': '.env.qa',
    'stage': '.env.stage',
    'production': '.env.production'
  };
  
  const envFile = envFileMap[env] || '.env.dev';
  const envPath = path.join(__dirname, envFile);
  
  // Load .env file if it exists (for development or secret overrides)
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment overrides from: ${envFile}`);
    require('dotenv').config({ path: envPath });
  }
  
  // Build configuration with core config as base, process.env as overrides
  const config = {
    corsOrigin: process.env.CORS_ORIGIN || coreConfig.corsOrigin,
    databaseUrl: process.env.DATABASE_URL || buildDatabaseUrl(env),
    httpPort: parseInt(process.env.HTTP_PORT) || coreConfig.httpPort,
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-override-in-production',
    logLevel: process.env.LOG_LEVEL || coreConfig.logLevel,
    nodeEnv: env,
    websocketPort: parseInt(process.env.WEBSOCKET_PORT) || coreConfig.websocketPort
  };
  
  // Validate required environment variables
  const required = [
    'jwtSecret'
  ];
  
  const missing = required.filter(key => !config[key] || config[key] === 'OVERRIDE_WITH_SECRETS');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  console.log(`Using environment: ${env}`);
  console.log(`WebSocket: ${config.websocketPort}, HTTP: ${config.httpPort}`);
  
  return config;
}

module.exports = { loadEnvironmentConfig };