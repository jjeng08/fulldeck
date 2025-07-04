const { text: t } = require('../shared/text')
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const gameManager = require('../games/GameManager');
const logger = require('../shared/utils/logger');
const { getAvailableGames, getAllGames } = require('../shared/gameConfigs');
const { updatePlayerBalance } = require('../shared/utils');

const prisma = new PrismaClient()

const JWT_SECRET = process.env.JWT_SECRET || 'fulldeck-secret-key'

// Helper function to send current balance for a user
async function sendBalanceUpdate(ws, userId) {
  try {
    const user = await prisma.player.findUnique({
      where: { id: userId }
    });
    
    if (user) {
      const balanceResponse = {
        type: 'balance',
        data: {
          balance: user.balance
        }
      };
      ws.send(JSON.stringify(balanceResponse));
    }
  } catch (error) {
    logger.logError(error, { userId, action: 'send_balance_update' });
  }
}

// Helper function to send available games
function sendAvailableGames(ws) {
  try {
    const games = getAllGames();
    const gamesResponse = {
      type: 'availableGames',
      data: {
        availableGames: games
      }
    };
    ws.send(JSON.stringify(gamesResponse));
  } catch (error) {
    logger.logError(error, { action: 'send_available_games' });
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
  
  // Game actions
  'doubleDown': onDoubleDown,
  'hit': onHit,
  'newGame': onNewGame,
  'placeBet': onPlaceBet,
  'stand': onStand,
  'startGame': onStartGame,
  'surrender': onSurrender,
  
  // Table management
  'joinBlackjackTable': onJoinBlackjackTable,
  'joinTable': onJoinTable,
  'leaveBlackjackTable': onLeaveBlackjackTable,
  'leaveTable': onLeaveTable,
  
  // User actions
  'logout': onLogout
}

async function onStartGame(ws, data, userId) {
  logger.logGameEvent('game_start_request', null, { userId, data });
  
  const response = {
    type: 'gameStarted',
    data: {
      gameId: 'game_' + Date.now(),
      playerHand: [],
      dealerHand: [],
      gameState: 'waiting_for_bet'
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function onHit(ws, data, userId) {
  logger.logGameEvent('player_hit', null, { userId, data });
  
  const response = {
    type: 'cardDealt',
    data: {
      card: { suit: 'hearts', value: 'A' },
      playerHand: [],
      handValue: 21,
      gameState: 'player_turn'
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function onStand(ws, data, userId) {
  logger.logGameEvent('player_stand', null, { userId, data });
  
  const response = {
    type: 'gameEnded',
    data: {
      result: 'win',
      dealerHand: [],
      finalPlayerValue: 20,
      finalDealerValue: 19,
      amountWon: 100
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function onNewGame(ws, data, userId) {
  logger.logGameEvent('new_game_request', null, { userId });
  
  const response = {
    type: 'gameReady',
    data: {
      balance: 1000,
      gameState: 'waiting_for_bet'
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function onPlaceBet(ws, data, userId) {
  logger.logGameEvent('place_bet_request', null, { userId, amount: data.amount });
  
  try {
    // All amounts are in cents
    
    // First, get current user balance from database
    const user = await prisma.player.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      logger.logError(new Error('User not found for bet'), { userId });
      ws.send(JSON.stringify({
        type: 'betRejected',
        data: { error: 'User not found' }
      }));
      return;
    }
    
    logger.logDebug('User balance check', { userId, balance: user.balance, betAmount: data.amount });
    
    // Check if user has enough balance
    if (user.balance < data.amount) {
      logger.logInfo('Bet rejected - insufficient balance', { userId, balance: user.balance, betAmount: data.amount });
      ws.send(JSON.stringify({
        type: 'betRejected',
        data: { error: 'Insufficient balance' }
      }));
      return;
    }
    
    // Get the table and player, then debit their account
    const table = gameManager.getPlayerTable(userId);
    let updatedBalance = user.balance - data.amount;
    
    if (table && table.players && table.players.has(userId)) {
      const player = table.players.get(userId);
      updatedBalance = await player.debitPlayer(data.amount);
      logger.logDebug('Player debited via table', { userId, updatedBalance });
    } else {
      logger.logDebug('Player not in table, using direct database update', { userId });
      await updatePlayerBalance(userId, updatedBalance, 'bet_placed', { betAmount: data.amount });
    }
    
    // Now try to place bet in game logic (game will handle validation and setBet)
    const result = gameManager.handlePlayerAction(userId, 'placeBet', { amount: data.amount });
    logger.logDebug('GameManager bet result', { userId, result: result?.success });
    
    const response = {
      type: 'betAccepted',
      data: {
        betAmount: data.amount,
        newBalance: updatedBalance,
        tableState: result?.table?.getTableState() || {}
      }
    };
    
    logger.logInfo('Bet accepted', { userId, betAmount: data.amount, newBalance: updatedBalance });
    ws.send(JSON.stringify(response));
    
  } catch (error) {
    logger.logError(error, { userId, betAmount: data.amount, action: 'place_bet' });
    const response = {
      type: 'betRejected', 
      data: { error: 'Failed to place bet: ' + error.message }
    };
    ws.send(JSON.stringify(response));
  }
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
    
    // Send auth response first
    const authResponse = {
      type: 'login',
      data: {
        success: true,
        userId: user.id,
        username: user.username,
        accessToken: accessToken,
        refreshToken: refreshToken
      }
    }
    ws.send(JSON.stringify(authResponse))
    
    // Then send balance and games using helper functions
    await sendBalanceUpdate(ws, user.id)
    sendAvailableGames(ws)
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
    
    // Send auth response first
    const authResponse = {
      type: 'register',
      data: {
        success: true,
        userId: newUser.id,
        username: newUser.username,
        accessToken: accessToken,
        refreshToken: refreshToken
      }
    }
    ws.send(JSON.stringify(authResponse))
    
    // Then send balance and games using helper functions
    await sendBalanceUpdate(ws, newUser.id)
    sendAvailableGames(ws)
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

async function onAvailableGames(ws, data, userId) {
  sendAvailableGames(ws)
}

async function onBalance(ws, data, userId) {
  await sendBalanceUpdate(ws, userId)
}

async function onGameConfigs(ws, data, userId) {
  logger.logUserAction('game_configs_request', userId, { userId });
  
  const response = {
    type: 'gameConfigs',
    data: {
      availableGames: getAllGames()
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function onGameState(ws, data, userId) {
  const response = {
    type: 'gameState',
    data: {
      gameActive: false,
      playerHand: [],
      dealerHand: [],
      gameState: 'waiting_for_bet'
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function onSurrender(ws, data, userId) {
  const response = {
    type: 'gameEnded',
    data: {
      result: 'surrender',
      amountLost: 50
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function onDoubleDown(ws, data, userId) {
  const response = {
    type: 'doubleDownResult',
    data: {
      card: { suit: 'spades', value: '10' },
      finalResult: 'win',
      amountWon: 200
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function onValidateToken(ws, data, userId) {
  logger.logAuthEvent('token_validation_request', userId, { userId });
  
  try {
    const { validateToken } = require('./tokenValidator')
    const validation = await validateToken(data.token)
    
    const response = {
      type: 'tokenValidated',
      data: validation
    }
    
    ws.send(JSON.stringify(response))
  } catch (error) {
    logger.logError(error, { userId, action: 'token_validation' });
    const response = {
      type: 'tokenValidated',
      data: {
        valid: false,
        error: 'Validation failed'
      }
    }
    ws.send(JSON.stringify(response))
  }
}

async function onRefreshToken(ws, data) {
  logger.logAuthEvent('token_refresh_request', null, { refreshTokenProvided: !!data.refreshToken });
  
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
    
    const decoded = jwt.verify(data.refreshToken, JWT_SECRET)
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token type')
    }
    
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Verify user still exists
    const user = await prisma.player.findUnique({
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
    
    // Send token refresh response first
    const tokenResponse = {
      type: 'tokenRefreshed',
      data: {
        success: true,
        accessToken: newAccessToken,
        userId: user.id,
        username: user.username
      }
    }
    ws.send(JSON.stringify(tokenResponse))
    
    // Then send balance and games using helper functions
    await sendBalanceUpdate(ws, user.id)
    sendAvailableGames(ws)
    await prisma.$disconnect()
    
  } catch (error) {
    logger.logError(error, { userId, action: 'token_refresh' });
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


async function onJoinTable(ws, data, userId) {
  logger.logUserAction('table_join_request', userId, { userId });
  
  try {
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Get user data
    const user = await prisma.player.findUnique({
      where: { id: userId }
    })
    
    if (!user) {
      const response = {
        type: 'tableJoinResult',
        data: {
          success: false,
          message: 'User not found'
        }
      }
      ws.send(JSON.stringify(response))
      await prisma.$disconnect()
      return
    }
    
    // Register player connection for broadcasting
    gameManager.registerPlayerConnection(userId, ws);
    
    // Add player to table using GameManager (defaults to blackjack multiplayer)
    const result = gameManager.addPlayerToTable(userId, user.username, user.balance, 'blackjack', 'multiplayer')
    
    if (result.success) {
      const response = {
        type: 'tableJoinResult',
        data: {
          success: true,
          tableId: result.table.getId(),
          rejoined: result.rejoined,
          tableState: result.table.getTableState()
        }
      }
      ws.send(JSON.stringify(response))
      logger.logUserAction('table_joined', userId, { userId, username: user.username, tableId: result.table.getId() });
    } else {
      const response = {
        type: 'tableJoinResult',
        data: {
          success: false,
          message: result.error
        }
      }
      ws.send(JSON.stringify(response))
    }
    
    await prisma.$disconnect()
    
  } catch (error) {
    logger.logError(error, { userId, action: 'join_table' });
    const response = {
      type: 'tableJoinResult',
      data: {
        success: false,
        message: 'Unable to join table at this time. Please try again.'
      }
    }
    ws.send(JSON.stringify(response))
  }
}

async function onLeaveTable(ws, data, userId) {
  logger.logUserAction('table_leave_request', userId, { userId });
  
  try {
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Get user data for logging
    const user = await prisma.player.findUnique({
      where: { id: userId }
    })
    
    // Remove player from table using GameManager
    const result = gameManager.removePlayerFromTable(userId)
    
    if (result.success) {
      const response = {
        type: 'tableLeaveResult',
        data: {
          success: true,
          message: 'Successfully left table'
        }
      }
      ws.send(JSON.stringify(response))
      logger.logUserAction('table_left', userId, { userId, username: user?.username });
    } else {
      const response = {
        type: 'tableLeaveResult',
        data: {
          success: false,
          message: result.error || 'Failed to leave table'
        }
      }
      ws.send(JSON.stringify(response))
    }
    
    await prisma.$disconnect()
    
  } catch (error) {
    logger.logError(error, { userId, action: 'leave_table' });
    const response = {
      type: 'tableLeaveResult',
      data: {
        success: false,
        message: 'Unable to leave table at this time. Please try again.'
      }
    }
    ws.send(JSON.stringify(response))
  }
}

function onMessage(ws, message, connectionUserId) {
  logger.logWebSocketEvent('message_received', null, { action: 'message_processing' });
  try {
    const parsed = JSON.parse(message)
    const { type, data } = parsed
    
    logger.logWebSocketEvent('message_parsed', null, { messageType: type, hasData: !!data });
    
    // Messages that don't require authentication
    const unauthenticatedMessages = ['login', 'register', 'refreshToken']
    
    let userId = connectionUserId
    
    if (!unauthenticatedMessages.includes(type)) {
      // Validate token from message data
      if (!data.token) {
        ws.send(JSON.stringify({
          type: 'errorOccurred',
          data: { message: 'Authentication required' }
        }))
        return
      }
      
      try {
        const decoded = jwt.verify(data.token, JWT_SECRET)
        if (decoded.type !== 'access') {
          throw new Error('Invalid token type')
        }
        userId = decoded.userId
        logger.logAuthEvent('message_authenticated', decoded.userId, { username: decoded.username, messageType: type });
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'errorOccurred',
          data: { message: 'Invalid or expired token' }
        }))
        return
      }
    }
    if (messages[type]) {
      logger.logWebSocketEvent('handler_called', userId, { messageType: type, handlerName: messages[type].name });
      if (unauthenticatedMessages.includes(type)) {
        messages[type](ws, data)
      } else {
        messages[type](ws, data, userId)
      }
    } else {
      logger.logWebSocketEvent('unknown_message_type', userId, { messageType: type });
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

// Blackjack-specific handlers
async function onJoinBlackjackTable(ws, data, userId) {
  logger.logUserAction('blackjack_table_join_request', userId, { userId, gameMode: data.gameMode });
  
  try {
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Get user data
    const user = await prisma.player.findUnique({
      where: { id: userId }
    })
    
    if (!user) {
      const response = {
        type: 'tableJoinResult',
        data: {
          success: false,
          message: 'User not found'
        }
      }
      ws.send(JSON.stringify(response))
      await prisma.$disconnect()
      return
    }
    
    // Register player connection for broadcasting
    gameManager.registerPlayerConnection(userId, ws);
    
    // Add player to blackjack table
    const gameMode = data.gameMode || 'single'
    const result = gameManager.addPlayerToTable(userId, user.username, user.balance, 'blackjack', gameMode)
    
    if (result.success) {
      const response = {
        type: 'tableJoinResult',
        data: {
          success: true,
          tableId: result.table.getId(),
          rejoined: result.rejoined,
          tableState: result.table.getTableState()
        }
      }
      ws.send(JSON.stringify(response))
      logger.logUserAction('blackjack_table_joined', userId, { userId, username: user.username, tableId: result.table.getId(), gameMode });
    } else {
      const response = {
        type: 'tableJoinResult',
        data: {
          success: false,
          message: result.error
        }
      }
      ws.send(JSON.stringify(response))
    }
    
    await prisma.$disconnect()
  } catch (error) {
    logger.logError(error, { userId, action: 'join_blackjack_table', gameMode: data.gameMode });
    const response = {
      type: 'errorOccurred',
      data: { message: 'Failed to join table' }
    }
    ws.send(JSON.stringify(response))
  }
}

async function onLeaveBlackjackTable(ws, data, userId) {
  logger.logUserAction('blackjack_table_leave_request', userId, { userId });
  
  try {
    // Get current user balance from database
    const user = await prisma.player.findUnique({
      where: { id: userId }
    });
    
    const result = gameManager.removePlayerFromTable(userId)
    
    if (result.success) {
      const response = {
        type: 'tableLeaveResult',
        data: {
          success: true,
          message: 'Left table successfully',
          updatedBalance: user.balance  // Include current balance
        }
      }
      ws.send(JSON.stringify(response))
      logger.logUserAction('blackjack_table_left', userId, { userId, balance: user.balance });
    } else {
      const response = {
        type: 'tableLeaveResult',
        data: {
          success: false,
          message: result.error
        }
      }
      ws.send(JSON.stringify(response))
    }
  } catch (error) {
    logger.logError(error, { userId, action: 'leave_blackjack_table' });
    const response = {
      type: 'errorOccurred',
      data: { message: 'Failed to leave table' }
    }
    ws.send(JSON.stringify(response))
  }
}

async function onLogout(ws, data, userId) {
  logger.logAuthEvent('logout_request', userId, { userId });
  
  try {
    // Clear user session (if any session management needed)
    // For now, just send success response
    const response = {
      type: 'logout',
      data: {
        success: true,
        message: 'Logged out successfully'
      }
    }
    ws.send(JSON.stringify(response))
    logger.logAuthEvent('logout_completed', userId, { userId })
  } catch (error) {
    logger.logError(error, { userId, action: 'logout' })
    const response = {
      type: 'logout',
      data: {
        success: false,
        message: 'Logout failed'
      }
    }
    ws.send(JSON.stringify(response))
  }
}

module.exports = {
  onMessage,
  messages
}