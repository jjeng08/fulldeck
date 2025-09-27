const jwt = require('jsonwebtoken');
const logger = require('../shared/logger');
const { text: t } = require('../core/text');
const { gotMessage } = require('./server');

// Import handlers
const authHandlers = require('./handlers/auth');
const gameHandlers = require('./handlers/game');
const userHandlers = require('./handlers/user');
const systemHandlers = require('./handlers/system');

// Import blackjack handlers
const { blackjackMessages } = require('../games/blackjack/Blackjack');

const JWT_SECRET = process.env.JWT_SECRET || 'fulldeck-secret-key';

// Message routing table
const messageRoutes = {
  // Authentication handlers (unauthenticated)
  'refreshToken': authHandlers.onRefreshToken,
  'validateToken': authHandlers.onValidateToken,
  
  // Authentication handlers (authenticated)
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
  'refreshToken',
  'validateToken'
];

// Define handlers that need direct WebSocket access (currently none for authenticated handlers)
const WS_REQUIRED_HANDLERS = new Set([
  // Currently none - all authenticated handlers should use sendMessage
]);

// Helper function to extract userId from JWT token
function extractUserIdFromToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return decoded.userId;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

// Helper function for authenticated messages - extracts userId from JWT and calls handler
async function handleAuthenticatedMessage(ws, data, handler) {
  try {
    const userId = extractUserIdFromToken(data.token);
    
    // Check if handler explicitly needs ws parameter
    if (WS_REQUIRED_HANDLERS.has(handler.name)) {
      // Handler expects (ws, data, userId) - legacy pattern
      return await handler(ws, data, userId);
    } else {
      // Handler expects (data, userId) - standard pattern for authenticated handlers
      return await handler(data, userId);
    }
  } catch (error) {
    logger.logError(error, { action: 'authenticated_message' });
    ws.send(JSON.stringify({
      type: 'errorOccurred',
      data: { message: 'Authentication required' }
    }));
  }
}

// Helper function for unauthenticated messages - just calls handler directly
async function handleUnauthenticatedMessage(ws, data, handler) {
  const result = await handler(ws, data);
  
  // If handler returned user info (successful auth), associate the connection
  if (result && result.userId) {
    const { updateConnectionUserId } = require('./server');
    updateConnectionUserId(ws, result.userId);
  }
  
  return result;
}

// Main message dispatching function
function dispatchMessage(ws, message, connectionUserId) {
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

// Initialize function to register the dispatcher with the WebSocket server
function initialize() {
  gotMessage(dispatchMessage);
}

module.exports = {
  dispatchMessage,
  initialize
};