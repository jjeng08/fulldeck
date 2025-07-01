// Environment configuration for frontend
const environments = {
  development: {
    websocketUrl: 'ws://localhost:8080',
    apiBaseUrl: 'http://localhost:3000',
    logLevel: 'debug'
  },
  qa: {
    websocketUrl: 'ws://qa-backend-server:8080',
    apiBaseUrl: 'http://qa-backend-server:3000',
    logLevel: 'info'
  },
  stage: {
    websocketUrl: 'wss://stage-api.fulldeck.example.com',
    apiBaseUrl: 'https://stage-api.fulldeck.example.com',
    logLevel: 'info'
  },
  production: {
    websocketUrl: 'wss://api.fulldeck.example.com',
    apiBaseUrl: 'https://api.fulldeck.example.com',
    logLevel: 'error'
  }
};

function getEnvironment() {
  // Check if we're in Expo development
  if (__DEV__) {
    return 'development';
  }
  
  // Check for environment variable from build process
  const buildEnv = process.env.NODE_ENV || process.env.EXPO_ENV;
  
  // Default to development if no environment specified
  return buildEnv || 'development';
}

function getConfig() {
  const env = getEnvironment();
  const config = environments[env];
  
  if (!config) {
    console.warn(`Unknown environment: ${env}, falling back to development`);
    return environments.development;
  }
  
  console.log(`Using environment config: ${env}`);
  return config;
}

export { getConfig, getEnvironment };