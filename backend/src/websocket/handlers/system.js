const logger = require('../../shared/logger');


// Handler for frontend log messages sent via WebSocket
function onLog(ws, data, userId) {
  try {
    const { level, type, message, logData } = data;
    
    // Log with appropriate level
    switch (level) {
      case 'error':
        logger.logError(new Error(message), { 
          ...logData,
          source: 'frontend',
          userId,
          category: type || 'frontend_log'
        });
        break;
      case 'warn':
        logger.logWarn(message, {
          ...logData,
          source: 'frontend',
          userId,
          category: type || 'frontend_log'
        });
        break;
      case 'info':
        logger.logInfo(message, {
          ...logData,
          source: 'frontend',
          userId,
          category: type || 'frontend_log'
        });
        break;
      case 'debug':
        logger.logDebug(message, {
          ...logData,
          source: 'frontend',
          userId,
          category: type || 'frontend_log'
        });
        break;
      default:
        logger.logInfo(message, {
          ...logData,
          source: 'frontend',
          userId,
          category: type || 'frontend_log'
        });
    }
  } catch (error) {
    logger.logError(error, { action: 'frontend_log_handling' });
  }
}

module.exports = {
  onLog
};