const jwt = require('jsonwebtoken');
const logger = require('../../shared/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fulldeck-secret-key';

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
    return await handler(ws, data, userId);
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
  return await handler(ws, data);
}

module.exports = {
  extractUserIdFromToken,
  handleAuthenticatedMessage,
  handleUnauthenticatedMessage
};