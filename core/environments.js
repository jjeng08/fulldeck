// Master environment configuration - synced to frontend and backend
const ENVIRONMENTS = {
  development: {
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
  staging: {
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
  production: {
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

const getEnvironmentConfig = (env = 'development') => {
  return ENVIRONMENTS[env] || ENVIRONMENTS.development;
};

const buildDatabaseUrl = (env = 'development') => {
  const config = ENVIRONMENTS[env] || ENVIRONMENTS.development;
  // Use 127.0.0.1 in Windows/WSL environments, localhost otherwise
  const host = process.platform === 'win32' || process.env.WSL_DISTRO_NAME ? '127.0.0.1' : 'localhost';
  return `postgresql://fulldeck_user:fulldeck_password@${host}:${config.databasePort}/fulldeck_${config.schema}`;
};

function loadEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  process.env.DATABASE_URL = buildDatabaseUrl(env);
  
  const config = getEnvironmentConfig(env);
  config.nodeEnv = env;
  config.corsOrigin = `http://localhost:3000`;
  
  console.log(`Environment: ${env}`);
  console.log(`Database: ${process.env.DATABASE_URL}`);
  
  return config;
}

// ES6 export for frontend
export {
  getEnvironmentConfig,
  buildDatabaseUrl,
  loadEnvironmentConfig
};

// CommonJS export for backend
module.exports = {
  getEnvironmentConfig,
  buildDatabaseUrl,
  loadEnvironmentConfig
};