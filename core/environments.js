// Core environment configuration - source of truth
// This file is built/copied to frontend and backend via build process
// Production values can be overridden by AWS Secrets Manager

// Common ports for all environments - only URLs change
const COMMON_PORTS = {
  httpPort: 3001,        // Backend API - Safe range: 3000-3999, 8000-8999. Avoid: 3000 (common frontend), 8080 (common alt-http)
  websocketPort: 8090,   // WebSocket server - Safe range: 8000-8999, 9000-9999. Avoid: 8080 (http-alt), 8443 (https-alt)
  frontendPort: 3000,    // Frontend dev server - Safe range: 3000-3999. Alternatives: 3001, 3002, 4000, 5000, 8000
  databasePort: 5434,    // Local PostgreSQL - Safe range: 5430-5439. Standard: 5432, Avoid: 5432 (conflicts with system postgres)
  adminerPort: 8085      // Database viewer - Safe range: 8080-8099. Alternatives: 8080, 8081, 8082 (if not conflicting)
};

const ENVIRONMENTS = {
  development: {
    ...COMMON_PORTS,
    
    websocketUrl: `ws://localhost:${COMMON_PORTS.websocketPort}`,
    apiBaseUrl: `http://localhost:${COMMON_PORTS.httpPort}`,
    frontendUrl: `http://localhost:${COMMON_PORTS.frontendPort}`,
    corsOrigin: `http://localhost:${COMMON_PORTS.frontendPort}`,
    
    databaseHost: 'localhost',
    databaseName: 'fulldeck_dev',
    databaseUser: 'postgres',
    databasePassword: 'postgres', // Safe for dev
    
    logLevel: 'debug'
  },
  
  qa: {
    ...COMMON_PORTS,
    databasePort: 5432, // Standard postgres port for deployed environments
    
    websocketUrl: `ws://qa-backend-server:${COMMON_PORTS.websocketPort}`,
    apiBaseUrl: `http://qa-backend-server:${COMMON_PORTS.httpPort}`,
    frontendUrl: `http://qa-frontend-server:${COMMON_PORTS.frontendPort}`,
    corsOrigin: `http://qa-frontend-server:${COMMON_PORTS.frontendPort}`,
    
    databaseHost: 'qa-db-server',
    databaseName: 'fulldeck_qa',
    databaseUser: 'fulldeck_user',
    databasePassword: 'OVERRIDE_WITH_SECRETS',
    
    logLevel: 'info'
  },
  
  staging: {
    ...COMMON_PORTS,
    databasePort: 5432,
    
    websocketUrl: `wss://stage-api.fulldeck.example.com:${COMMON_PORTS.websocketPort}`,
    apiBaseUrl: `https://stage-api.fulldeck.example.com:${COMMON_PORTS.httpPort}`,
    frontendUrl: `https://stage.fulldeck.example.com:${COMMON_PORTS.frontendPort}`,
    corsOrigin: `https://stage.fulldeck.example.com:${COMMON_PORTS.frontendPort}`,
    
    databaseHost: 'stage-db-server',
    databaseName: 'fulldeck_staging',
    databaseUser: 'fulldeck_user',
    databasePassword: 'OVERRIDE_WITH_SECRETS',
    
    logLevel: 'info'
  },
  
  production: {
    ...COMMON_PORTS,
    databasePort: 5432,
    
    websocketUrl: `wss://api.fulldeck.example.com:${COMMON_PORTS.websocketPort}`,
    apiBaseUrl: `https://api.fulldeck.example.com:${COMMON_PORTS.httpPort}`,
    frontendUrl: `https://fulldeck.example.com:${COMMON_PORTS.frontendPort}`,
    corsOrigin: `https://fulldeck.example.com:${COMMON_PORTS.frontendPort}`,
    
    databaseHost: 'OVERRIDE_WITH_SECRETS', // AWS RDS endpoint
    databaseName: 'fulldeck_production',
    databaseUser: 'OVERRIDE_WITH_SECRETS',
    databasePassword: 'OVERRIDE_WITH_SECRETS',
    
    logLevel: 'error'
  }
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