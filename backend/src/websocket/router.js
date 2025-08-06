const logger = require('../shared/logger');
const { text: t } = require('../core/text');

// Import handlers
const authHandlers = require('./handlers/auth');
const gameHandlers = require('./handlers/game');
const userHandlers = require('./handlers/user');
const systemHandlers = require('./handlers/system');

// Import blackjack handlers
const { blackjackMessages } = require('../games/blackjack/Blackjack');

// Import middleware
const { handleAuthenticatedMessage, handleUnauthenticatedMessage } = require('./middleware/auth');

// Message routing table
const messageRoutes = {
  // Authentication handlers (unauthenticated)
  'login': authHandlers.onLogin,
  'register': authHandlers.onRegister,
  'refreshToken': authHandlers.onRefreshToken,
  
  // Authentication handlers (authenticated)
  'validateToken': authHandlers.onValidateToken,
  'logout': authHandlers.onLogout,
  
  // User handlers (authenticated)
  'balance': userHandlers.onBalance,
  
  // Game handlers (authenticated)
  'availableGames': gameHandlers.onAvailableGames,
  'gameConfigs': gameHandlers.onGameConfigs,
  'gameState': gameHandlers.onGameState,
  
  // System handlers
  'log': systemHandlers.onLog
};

// Messages that don't require authentication
const unauthenticatedMessages = [
  'login',
  'register', 
  'refreshToken'
];

function routeMessage(ws, message, connectionUserId) {
  logger.logWebSocketEvent('message_received', null, { action: 'message_processing' });
  
  try {
    const parsed = JSON.parse(message);
    const { type, data } = parsed;
    
    logger.logWebSocketEvent('message_parsed', null, { messageType: type, hasData: !!data });
    
    // Check for handler in main routes first
    if (messageRoutes[type]) {
      logger.logWebSocketEvent('handler_called', null, { 
        messageType: type, 
        handlerName: messageRoutes[type].name 
      });
      
      if (unauthenticatedMessages.includes(type)) {
        handleUnauthenticatedMessage(ws, data, messageRoutes[type]);
      } else {
        handleAuthenticatedMessage(ws, data, messageRoutes[type]);
      }
    } 
    // Check for handler in blackjack messages
    else if (blackjackMessages[type]) {
      logger.logWebSocketEvent('blackjack_handler_called', null, { 
        messageType: type, 
        handlerName: blackjackMessages[type].name 
      });
      handleAuthenticatedMessage(ws, data, blackjackMessages[type]);
    }
    else {
      logger.logWebSocketEvent('unknown_message_type', null, { messageType: type });
      ws.send(JSON.stringify({
        type: 'errorOccurred',
        data: { message: t.unknownMessageType.replace('{type}', type) }
      }));
    }
  } catch (error) {
    logger.logError(error, { action: 'message_handling', messageType: parsed?.type });
    ws.send(JSON.stringify({
      type: 'errorOccurred',
      data: { message: t.invalidMessageFormat }
    }));
  }
}

module.exports = {
  routeMessage
};