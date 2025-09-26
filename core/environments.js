// Simplified environment configuration  
const ENVIRONMENTS = {
  development: {
    schema: 'dev',
    websocketPort: 8090,
    httpPort: 3001,
    frontendPort: 3000,
    websocketUrl: 'ws://localhost:8090',
    apiBaseUrl: 'http://localhost:3001',
    frontendUrl: 'http://localhost:3000',
    logLevel: 'debug'
  },
  qa: {
    schema: 'qa',
    websocketPort: 8090,
    httpPort: 3001,
    frontendPort: 3000,
    websocketUrl: 'ws://localhost:8090',
    apiBaseUrl: 'http://localhost:3001',
    frontendUrl: 'http://localhost:3000',
    logLevel: 'info'
  },
  production: {
    schema: 'public',
    websocketPort: 8090,
    httpPort: 3001,
    frontendPort: 3000,
    websocketUrl: 'ws://localhost:8090',
    apiBaseUrl: 'http://localhost:3001',
    frontendUrl: 'http://localhost:3000',
    logLevel: 'error'
  }
};

const getEnvironmentConfig = (env = 'development') => {
  return ENVIRONMENTS[env] || ENVIRONMENTS.development;
};

const buildDatabaseUrl = (env = 'development') => {
  const schema = ENVIRONMENTS[env]?.schema || 'dev';
  return `postgresql://postgres:postgres@localhost:5434/fulldeck_dev?schema=${schema}`;
};

module.exports = {
  getEnvironmentConfig,
  buildDatabaseUrl
};