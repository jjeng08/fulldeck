const winston = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

const environment = process.env.NODE_ENV || 'development';

// Create base logger configuration
const loggerConfig = {
  level: environment === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'fulldeck-backend',
    environment: environment
  },
  transports: []
};

// Console transport (always enabled)
loggerConfig.transports.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  })
);

// File transports (for development and production)
loggerConfig.transports.push(
  new winston.transports.File({ 
    filename: 'logs/error.log', 
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),
  new winston.transports.File({ 
    filename: 'logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
);

// CloudWatch transport (production only)
if (environment === 'production' && process.env.AWS_REGION) {
  loggerConfig.transports.push(
    new WinstonCloudWatch({
      logGroupName: 'fulldeck-backend',
      logStreamName: `${environment}-${new Date().toISOString().split('T')[0]}`,
      awsRegion: process.env.AWS_REGION,
      jsonMessage: true
    })
  );
}

// Create the logger
const logger = winston.createLogger(loggerConfig);

// Helper functions for common logging patterns
logger.logUserAction = (action, userId, data = {}) => {
  logger.info('User action', {
    action,
    userId,
    ...data,
    category: 'user_action'
  });
};

logger.logGameEvent = (event, tableId, data = {}) => {
  logger.info('Game event', {
    event,
    tableId,
    ...data,
    category: 'game_event'
  });
};

logger.logAuthEvent = (event, userId, data = {}) => {
  logger.info('Authentication event', {
    event,
    userId,
    ...data,
    category: 'auth_event'
  });
};

logger.logDatabaseOperation = (operation, table, data = {}) => {
  logger.debug('Database operation', {
    operation,
    table,
    ...data,
    category: 'database'
  });
};

logger.logWebSocketEvent = (event, userId, data = {}) => {
  logger.debug('WebSocket event', {
    event,
    userId,
    ...data,
    category: 'websocket'
  });
};

logger.logError = (error, context = {}) => {
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    ...context,
    category: 'error'
  });
};

// Store original Winston methods to avoid recursion
const originalWinstonMethods = {
  info: logger.info.bind(logger),
  debug: logger.debug.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger)
};

// Dual logging function - Winston + console.log for development
logger.dualLog = (level, message, data = {}) => {
  // Always log to Winston using original methods
  originalWinstonMethods[level](message, data);
  
  // Also console.log in development
  if (environment === 'development') {
    if (data && Object.keys(data).length > 0) {
      console.log(`[${level.toUpperCase()}] ${message}`, data);
    } else {
      console.log(`[${level.toUpperCase()}] ${message}`);
    }
  }
};

// Convenience methods that use dual logging
logger.logInfo = (message, data = {}) => logger.dualLog('info', message, data);
logger.logDebug = (message, data = {}) => logger.dualLog('debug', message, data);
logger.logWarn = (message, data = {}) => logger.dualLog('warn', message, data);
logger.logErr = (message, data = {}) => logger.dualLog('error', message, data);

module.exports = logger;