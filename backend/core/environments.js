// Master environment configuration - synced to frontend and backend
const ENVIRONMENTS = {
  dev: {
    schema: 'dev',
    websocketPort: 8090,
    httpPort: 3001,
    frontendPort: 3000,
    websocketUrl: 'ws://localhost:8090',
    apiBaseUrl: 'http://localhost:3001',
    frontendUrl: 'http://localhost:3000',
    logLevel: 'debug',
    databasePort: 5433
  },
  qa: {
    schema: 'qa',
    websocketPort: 8090,
    httpPort: 3001,
    frontendPort: 3000,
    websocketUrl: 'ws://localhost:8090',
    apiBaseUrl: 'http://localhost:3001',
    frontendUrl: 'http://localhost:3000',
    logLevel: 'info',
    databasePort: 5434
  },
  stage: {
    schema: 'stage',
    websocketPort: 8090,
    httpPort: 3001,
    frontendPort: 3000,
    websocketUrl: 'ws://localhost:8090',
    apiBaseUrl: 'http://localhost:3001',
    frontendUrl: 'http://localhost:3000',
    logLevel: 'info',
    databasePort: 5435
  },
  prod: {
    schema: 'prod',
    websocketPort: 8090,
    httpPort: 3001,
    frontendPort: 3000,
    websocketUrl: 'ws://localhost:8090',
    apiBaseUrl: 'http://localhost:3001',
    frontendUrl: 'http://localhost:3000',
    logLevel: 'error',
    databasePort: 5432
  }
};

const getEnvironmentConfig = (env = 'dev') => {
  return ENVIRONMENTS[env] || ENVIRONMENTS.dev;
};

const buildDatabaseUrl = (env = 'dev') => {
  const config = ENVIRONMENTS[env] || ENVIRONMENTS.dev;
  return `file:./database/fulldeck_${config.schema}.db`;
};

function loadEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'dev';
  process.env.DATABASE_URL = buildDatabaseUrl(env);
  
  const config = getEnvironmentConfig(env);
  config.nodeEnv = env;
  config.corsOrigin = `http://localhost:3000`;
  
  console.log(`Environment: ${env}`);
  console.log(`Database: ${process.env.DATABASE_URL}`);
  
  return config;
}



module.exports = {
  getEnvironmentConfig,
  buildDatabaseUrl,
  loadEnvironmentConfig
};