// Frontend environment configuration - now uses core environments
import { getEnvironmentConfig } from './environments';

function getEnvironment() {
  // Check if we're in Expo development
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return 'development';
  }
  
  // Check for environment variable from build process
  const buildEnv = process.env.NODE_ENV || process.env.EXPO_ENV;
  
  // Default to development if no environment specified
  return buildEnv || 'development';
}

function getConfig() {
  const env = getEnvironment();
  const config = getEnvironmentConfig(env);
  
  console.log(`Using environment config: ${env}`);
  console.log(`WebSocket: ${config.websocketUrl}, API: ${config.apiBaseUrl}`);
  
  return {
    websocketUrl: config.websocketUrl,
    apiBaseUrl: config.apiBaseUrl,
    frontendUrl: config.frontendUrl,
    logLevel: config.logLevel
  };
}

export { getConfig, getEnvironment };