// Frontend environment configuration - now uses core environments
import { getEnvironmentConfig } from '../core/environments';

function getEnvironment() {
  // Check for environment variable from build process first
  const buildEnv = process.env.NODE_ENV || process.env.EXPO_ENV;
  
  // If we have a build env, use it
  if (buildEnv) {
    return buildEnv;
  }
  
  // Check if we're in Expo development and default to 'dev'
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return 'dev';
  }
  
  // Default to dev if no environment specified
  return 'dev';
}

function getConfig() {
  const env = getEnvironment();
  console.log('Detected environment:', env);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('EXPO_ENV:', process.env.EXPO_ENV);
  console.log('__DEV__:', typeof __DEV__ !== 'undefined' ? __DEV__ : 'undefined');
  
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