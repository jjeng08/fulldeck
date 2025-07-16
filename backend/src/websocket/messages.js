const jwt = require('jsonwebtoken')
const gameManager = require('../games/GameManager');
const logger = require('../shared/utils/logger');
const { PrismaClient } = require('@prisma/client')
const { text: t } = require('../shared/text')
const { getAllGames } = require('../shared/gameConfigs');
const { updatePlayerBalance } = require('../shared/utils');
const { blackjackMessages } = require('../games/blackjack/Blackjack');

const prisma = new PrismaClient()

const JWT_SECRET = process.env.JWT_SECRET || 'fulldeck-secret-key'

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

// Helper function to send centralized messages
function sendMessage(userId, type, data) {
  const WebSocketServer = require('./server');
  const wsServer = WebSocketServer.getInstance();
  if (wsServer) {
    wsServer.sendMessage(userId, type, data);
  }
}

// Helper function to complete authentication process - associates connection and sends response
function completeAuthentication(ws, user, accessToken, refreshToken, responseType) {
  // Associate this WebSocket connection with the user's ID FIRST
  const WebSocketServer = require('./server');
  const wsServer = WebSocketServer.getInstance();
  if (!wsServer) {
    throw new Error('WebSocket server not available');
  }
  
  // Ensure association is complete before proceeding
  const associationSuccess = wsServer.updateConnectionUserId(ws, user.id);
  if (!associationSuccess) {
    throw new Error('Failed to associate connection with user');
  }
  
  // Send auth response using the SAME message type as the request
  const authResponse = {
    type: responseType,
    data: {
      success: true,
      userId: user.id,
      username: user.username,
      accessToken: accessToken,
      refreshToken: refreshToken
    }
  }
  ws.send(JSON.stringify(authResponse));
  
  // Send balance message directly through this connection
  if (ws.readyState === 1) { // WebSocket.OPEN
    const balanceMessage = {
      type: 'balance',
      data: {
        balance: user.balance
      }
    };
    ws.send(JSON.stringify(balanceMessage));
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

// Helper function to send current balance for a user
async function sendBalanceUpdate(userId) {
  try {
    const user = await prisma.player.findUnique({
      where: { id: userId }
    });
    
    if (user) {
      logger.logInfo('Sending balance update', { userId, balance: user.balance });
      sendMessage(userId, 'balance', {
        balance: user.balance
      });
    } else {
      logger.logError(new Error('User not found for balance update'), { userId });
    }
  } catch (error) {
    logger.logError(error, { userId, action: 'send_balance_update' });
  }
}

// Helper function to send available games
function sendAvailableGames(ws, userId) {
  try {
    const games = getAllGames();
    
    // Use centralized sendMessage if userId is available (authenticated users)
    if (userId) {
      sendMessage(userId, 'availableGames', {
        availableGames: games
      });
    } else {
      // For unauthenticated users, use direct ws.send
      const gamesResponse = {
        type: 'availableGames',
        data: {
          availableGames: games
        }
      };
      ws.send(JSON.stringify(gamesResponse));
    }
  } catch (error) {
    logger.logError(error, { action: 'send_available_games' });
  }
}


// Helper function to log activity to database
async function logActivity(playerId, username, activityType, options = {}) {
  try {
    const { credit, debit, balance, winnings } = options;
    
    await prisma.activityLog.create({
      data: {
        playerId,
        username,
        activityType,
        credit: credit || null,
        debit: debit || null,
        balance,
        winnings: winnings || null
      }
    });
    
    logger.logInfo('Activity logged to database', { 
      playerId, 
      username, 
      activityType, 
      credit, 
      debit, 
      balance, 
      winnings 
    });
  } catch (error) {
    logger.logError(error, { 
      playerId, 
      username, 
      activityType, 
      action: 'log_activity' 
    });
  }
}

const messages = {
  // Authentication
  'login': onLogin,
  'refreshToken': onRefreshToken,
  'register': onRegister,
  'validateToken': onValidateToken,
  
  // Data requests
  'availableGames': onAvailableGames,
  'balance': onBalance,
  'gameConfigs': onGameConfigs,
  'gameState': onGameState,
  
  // General table management
  'joinTable': onJoinTable,
  'leaveTable': onLeaveTable,
  
  // User actions
  'logout': onLogout
}

async function onLogin(ws, data) {
  logger.logAuthEvent('login_attempt', null, { username: data.username });
  try {
    const bcrypt = require('bcryptjs')
    // Find user by username
    const user = await prisma.player.findUnique({
      where: { username: data.username }
    })
    
    if (!user) {
      const response = {
        type: 'login',
        data: {
          success: false,
          message: t.loginFailed
        }
      }
      ws.send(JSON.stringify(response))
      await prisma.$disconnect()
      return
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(data.password, user.password)
    if (!passwordMatch) {
      const response = {
        type: 'login',
        data: {
          success: false,
          message: t.loginFailed
        }
      }
      ws.send(JSON.stringify(response))
      await prisma.$disconnect()
      return
    }
    
    // Update last seen
    await prisma.player.update({
      where: { id: user.id },
      data: { lastSeen: new Date() }
    })
    
    // Generate JWT tokens
    const accessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    )
    
    const refreshToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        type: 'refresh'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
    
    // Complete authentication - associate connection and send response
    completeAuthentication(ws, user, accessToken, refreshToken, 'login');
    await prisma.$disconnect()
    
  } catch (error) {
    logger.logError(error, { username: data.username, action: 'login' });
    const response = {
      type: 'login',
      data: {
        success: false,
        message: t.unableToLogin
      }
    }
    ws.send(JSON.stringify(response))
  }
}

async function onRegister(ws, data) {
  logger.logAuthEvent('registration_attempt', null, { username: data.username });
  try {
    const { PrismaClient } = require('@prisma/client')
    const bcrypt = require('bcryptjs')
    const prisma = new PrismaClient()
    
    // Check if username already exists
    const existingUser = await prisma.player.findUnique({
      where: { username: data.username }
    })
    
    if (existingUser) {
      const response = {
        type: 'register',
        data: {
          success: false,
          message: t.usernameExists
        }
      }
      ws.send(JSON.stringify(response))
      await prisma.$disconnect()
      return
    }
    
    // Validate password
    if (!data.password || data.password.length < 3) {
      const response = {
        type: 'register',
        data: {
          success: false,
          message: t.passwordTooShort
        }
      }
      ws.send(JSON.stringify(response))
      await prisma.$disconnect()
      return
    }
    
    // Hash password securely
    const hashedPassword = await bcrypt.hash(data.password, 12)
    
    // Create new user
    const newUser = await prisma.player.create({
      data: {
        username: data.username,
        password: hashedPassword,
        balance: 1000,
        createdOn: new Date(),
        lastSeen: new Date()
      }
    })
    
    // Generate JWT tokens
    const accessToken = jwt.sign(
      {
        userId: newUser.id,
        username: newUser.username,
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    )
    
    const refreshToken = jwt.sign(
      {
        userId: newUser.id,
        username: newUser.username,
        type: 'refresh'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
    
    // Complete authentication - associate connection and send response
    completeAuthentication(ws, newUser, accessToken, refreshToken, 'register');
    await prisma.$disconnect()
    
  } catch (error) {
    logger.logError(error, { username: data.username, action: 'register' });
    const response = {
      type: 'register',
      data: {
        success: false,
        message: t.unableToRegister
      }
    }
    ws.send(JSON.stringify(response))
  }
}

async function onAvailableGames(ws, data) {
  return handleAuthenticatedMessage(ws, data, async (ws, data, userId) => {
    // Associate this connection with the user (in case it's not already associated)
    const WebSocketServer = require('./server');
    const wsServer = WebSocketServer.getInstance();
    if (wsServer) {
      wsServer.updateConnectionUserId(ws, userId);
    }
    
    sendAvailableGames(ws, userId);
    await sendBalanceUpdate(userId);
  });
}

async function onBalance(ws, data) {
  return handleAuthenticatedMessage(ws, data, async (ws, data, userId) => {
    await sendBalanceUpdate(userId);
  });
}

async function onGameConfigs(ws, data) {
  return handleAuthenticatedMessage(ws, data, async (ws, data, userId) => {
    logger.logUserAction('game_configs_request', userId, { userId });
    
    sendMessage(userId, 'gameConfigs', {
      availableGames: getAllGames()
    });
  });
}

async function onGameState(ws, data) {
  return handleAuthenticatedMessage(ws, data, async (ws, data, userId) => {
    sendMessage(userId, 'gameState', {
      gameActive: false,
      playerHand: [],
      dealerHand: [],
      gameState: 'waiting_for_bet'
    });
  });
}



async function onValidateToken(ws, data) {
  return handleAuthenticatedMessage(ws, data, async (ws, data, userId) => {
    logger.logAuthEvent('token_validation_request', userId, { userId });
    
    const { validateToken } = require('./tokenValidator')
    const validation = await validateToken(data.token)
    
    sendMessage(userId, 'tokenValidated', validation);
  });
}

async function onRefreshToken(ws, data) {
  logger.logAuthEvent('token_refresh_request', null, { refreshTokenProvided: !!data.refreshToken });
  
  let decoded, user;
  
  try {
    if (!data.refreshToken || data.refreshToken === 'null' || data.refreshToken === null) {
      const response = {
        type: 'tokenRefreshed',
        data: {
          success: false,
          error: 'No valid refresh token'
        }
      }
      ws.send(JSON.stringify(response))
      return
    }
    
    decoded = jwt.verify(data.refreshToken, JWT_SECRET)
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token type')
    }
    
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Verify user still exists
    user = await prisma.player.findUnique({
      where: { id: decoded.userId }
    })
    
    if (!user) {
      throw new Error('User not found')
    }
    
    // Generate new access token
    const newAccessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    )
    
    // Complete authentication - associate connection and send response
    completeAuthentication(ws, user, newAccessToken, data.refreshToken, 'tokenRefreshed');
    await prisma.$disconnect()
    
  } catch (error) {
    logger.logError(error, { userId: user?.id || decoded?.userId || 'unknown', action: 'token_refresh' });
    const response = {
      type: 'tokenRefreshed',
      data: {
        success: false,
        error: t.loginFailed
      }
    }
    ws.send(JSON.stringify(response))
  }
}


async function onJoinTable(ws, data) {
  return handleAuthenticatedMessage(ws, data, async (ws, data, userId) => {
    logger.logUserAction('table_join_request', userId, { userId });
    
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Get user data
    const user = await prisma.player.findUnique({
      where: { id: userId }
    })
    
    if (!user) {
      sendMessage(userId, 'tableJoinResult', {
        success: false,
        message: 'User not found'
      });
      await prisma.$disconnect()
      return
    }
    
    // Register player connection for broadcasting
    gameManager.registerPlayerConnection(userId, ws);
    
    // Add player to table using GameManager (defaults to blackjack multiplayer)
    const result = gameManager.addPlayerToTable(userId, user.username, user.balance, 'blackjack', 'multiplayer')
    
    if (result.success) {
      sendMessage(userId, 'tableJoinResult', {
        success: true,
        tableId: result.table.getId(),
        rejoined: result.rejoined,
        tableState: result.table.getTableState()
      });
      logger.logUserAction('table_joined', userId, { userId, username: user.username, tableId: result.table.getId() });
    } else {
      sendMessage(userId, 'tableJoinResult', {
        success: false,
        message: result.error
      });
    }
    
    await prisma.$disconnect()
  });
}

async function onLeaveTable(ws, data) {
  return handleAuthenticatedMessage(ws, data, async (ws, data, userId) => {
    logger.logUserAction('table_leave_request', userId, { userId });
    
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Get user data for logging
    const user = await prisma.player.findUnique({
      where: { id: userId }
    })
    
    // Remove player from table using GameManager
    const result = gameManager.removePlayerFromTable(userId)
    
    if (result.success) {
      sendMessage(userId, 'tableLeaveResult', {
        success: true,
        message: 'Successfully left table'
      });
      logger.logUserAction('table_left', userId, { userId, username: user?.username });
    } else {
      sendMessage(userId, 'tableLeaveResult', {
        success: false,
        message: result.error || 'Failed to leave table'
      });
    }
    
    await prisma.$disconnect()
  });
}

function onMessage(ws, message, connectionUserId) {
  logger.logWebSocketEvent('message_received', null, { action: 'message_processing' });
  try {
    const parsed = JSON.parse(message)
    const { type, data } = parsed
    
    logger.logWebSocketEvent('message_parsed', null, { messageType: type, hasData: !!data });
    
    // Messages that don't require authentication
    const unauthenticatedMessages = ['login', 'register', 'refreshToken']
    // Check for handler in main messages first
    if (messages[type]) {
      logger.logWebSocketEvent('handler_called', null, { messageType: type, handlerName: messages[type].name });
      if (unauthenticatedMessages.includes(type)) {
        handleUnauthenticatedMessage(ws, data, messages[type])
      } else {
        handleAuthenticatedMessage(ws, data, messages[type])
      }
    } 
    // Check for handler in blackjack messages
    else if (blackjackMessages[type]) {
      logger.logWebSocketEvent('blackjack_handler_called', null, { messageType: type, handlerName: blackjackMessages[type].name });
      handleAuthenticatedMessage(ws, data, blackjackMessages[type])
    }
    else {
      logger.logWebSocketEvent('unknown_message_type', null, { messageType: type });
      ws.send(JSON.stringify({
        type: 'errorOccurred',
        data: { message: t.unknownMessageType.replace('{type}', type) }
      }))
    }
  } catch (error) {
    logger.logError(error, { action: 'message_handling', messageType: parsed?.type });
    ws.send(JSON.stringify({
      type: 'errorOccurred',
      data: { message: t.invalidMessageFormat }
    }))
  }
}



async function onLogout(ws, data) {
  return handleAuthenticatedMessage(ws, data, async (ws, data, userId) => {
    logger.logAuthEvent('logout_request', userId, { userId });
    
    try {
      // Clear user session (if any session management needed)
      // For now, just send success response
      sendMessage(userId, 'logout', {
        success: true,
        message: 'Logged out successfully'
      });
      logger.logAuthEvent('logout_completed', userId, { userId })
    } catch (error) {
      logger.logError(error, { userId, action: 'logout' })
      sendMessage(userId, 'logout', {
        success: false,
        message: 'Logout failed'
      });
    }
  });
}

module.exports = {
  onMessage,
  messages,
  logActivity,
  updatePlayerBalance
}