// Core environment configuration - source of truth
// This file is built/copied to frontend and backend via build process
// Production values can be overridden by AWS Secrets Manager

// Common ports for all environments - only URLs change
const COMMON_PORTS = {
  httpPort: 3001,
  websocketPort: 8090,
  frontendPort: 3000,
  databasePort: 5434,
  adminerPort: 8085
};

// Build environment configurations dynamically from COMMON_PORTS
const buildEnvironmentConfig = (baseConfig) => {
  const isSecure = baseConfig.protocol === 'https';
  const wsProtocol = isSecure ? 'wss' : 'ws';
  const httpProtocol = baseConfig.protocol || 'http';
  
  return {
    ...COMMON_PORTS,
    ...baseConfig,
    // Build URLs dynamically from ports and hosts
    websocketUrl: `${wsProtocol}://${baseConfig.host}:${COMMON_PORTS.websocketPort}`,
    apiBaseUrl: `${httpProtocol}://${baseConfig.host}:${COMMON_PORTS.httpPort}`,
    frontendUrl: `${httpProtocol}://${baseConfig.host}:${COMMON_PORTS.frontendPort}`,
    corsOrigin: `${httpProtocol}://${baseConfig.host}:${COMMON_PORTS.frontendPort}`,
  };
};

const ENVIRONMENTS = {
  development: buildEnvironmentConfig({
    host: 'localhost',
    protocol: 'http',
    
    databaseHost: 'localhost',
    databaseName: 'fulldeck_dev',
    databaseUser: 'postgres',
    databasePassword: 'postgres', // Safe for dev
    
    logLevel: 'debug'
  }),
  
  qa: buildEnvironmentConfig({
    host: 'qa-backend-server',
    protocol: 'http',
    databasePort: 5432, // Override for deployed environments
    
    databaseHost: 'qa-db-server',
    databaseName: 'fulldeck_qa',
    databaseUser: 'fulldeck_user',
    databasePassword: 'OVERRIDE_WITH_SECRETS',
    
    logLevel: 'info'
  }),
  
  staging: buildEnvironmentConfig({
    host: 'stage-api.fulldeck.example.com',
    protocol: 'https',
    databasePort: 5432,
    
    databaseHost: 'stage-db-server',
    databaseName: 'fulldeck_staging',
    databaseUser: 'fulldeck_user',
    databasePassword: 'OVERRIDE_WITH_SECRETS',
    
    logLevel: 'info'
  }),
  
  production: buildEnvironmentConfig({
    host: 'api.fulldeck.example.com', 
    protocol: 'https',
    databasePort: 5432,
    
    databaseHost: 'OVERRIDE_WITH_SECRETS', // AWS RDS endpoint
    databaseName: 'fulldeck_production',
    databaseUser: 'OVERRIDE_WITH_SECRETS',
    databasePassword: 'OVERRIDE_WITH_SECRETS',
    
    logLevel: 'error'
  })
};

// Helper functions
const getEnvironmentConfig = (env = 'development') => {
  const config = ENVIRONMENTS[env];
  if (!config) {
    console.warn(`Unknown environment: ${env}, falling back to development`);
    return ENVIRONMENTS.development;
  }
  return config;
};

const getAllEnvironments = () => {
  return Object.keys(ENVIRONMENTS);
};

// Build DATABASE_URL from components (can be overridden by env vars)
const buildDatabaseUrl = (env = 'development') => {
  const config = getEnvironmentConfig(env);
  return `postgresql://${config.databaseUser}:${config.databasePassword}@${config.databaseHost}:${config.databasePort}/${config.databaseName}`;
};

module.exports = {
  ENVIRONMENTS,
  getEnvironmentConfig,
  getAllEnvironments,
  buildDatabaseUrl
};