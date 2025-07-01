const { text: t } = require('../shared/text')
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const gameManager = require('../core/managers/GameManager');

const prisma = new PrismaClient()

const JWT_SECRET = process.env.JWT_SECRET || 'fulldeck-secret-key'

const messageHandlers = {
  // Game Flow Messages
  'doubleDown': handleDoubleDown,
  'getBalance': handleGetBalance,
  'getGameState': handleGetGameState,
  'hit': handleHit,
  'joinBlackjackTable': handleJoinBlackjackTable,
  'joinTable': handleJoinTable,
  'leaveBlackjackTable': handleLeaveBlackjackTable,
  'leaveTable': handleLeaveTable,
  'login': handleLogin,
  'newGame': handleNewGame,
  'placeBet': handlePlaceBet,
  'refreshToken': handleRefreshToken,
  'register': handleRegister,
  'stand': handleStand,
  'startGame': handleStartGame,
  'surrender': handleSurrender,
  'updateBalance': handleUpdateBalance,
  'validateToken': handleValidateToken
}

async function handleStartGame(ws, data, userId) {
  console.log('Starting game for user:', userId, 'with data:', data)
  
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

async function handleHit(ws, data, userId) {
  console.log('Player hit:', userId, data)
  
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

async function handleStand(ws, data, userId) {
  console.log('Player stands:', userId, data)
  
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

async function handleNewGame(ws, data, userId) {
  console.log('New game requested:', userId)
  
  const response = {
    type: 'gameReady',
    data: {
      balance: 1000,
      gameState: 'waiting_for_bet'
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function handlePlaceBet(ws, data, userId) {
  console.log('=== PLACE BET ===');
  console.log('User ID:', userId);
  console.log('Bet amount:', data.amount);
  
  try {
    // All amounts are in cents
    console.log('Bet amount:', data.amount);
    
    // First, get current user balance from database
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      console.log('User not found in database');
      ws.send(JSON.stringify({
        type: 'betRejected',
        data: { error: 'User not found' }
      }));
      return;
    }
    
    console.log('Current user balance:', user.balance);
    
    // Check if user has enough balance
    if (user.balance < data.amount) {
      console.log('Insufficient balance');
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
      console.log('Player debited via table. Updated balance:', updatedBalance);
    } else {
      console.log('Player not found in table, using direct database update');
      await prisma.user.update({
        where: { id: userId },
        data: { balance: updatedBalance }
      });
    }
    
    // Now try to place bet in game logic (game will handle validation and setBet)
    const result = gameManager.handlePlayerAction(userId, 'placeBet', { amount: data.amount });
    console.log('GameManager result:', result);
    
    const response = {
      type: 'betAccepted',
      data: {
        betAmount: data.amount,
        newBalance: updatedBalance,
        tableState: result?.table?.getTableState() || {}
      }
    };
    
    console.log('Sending response:', response);
    ws.send(JSON.stringify(response));
    
  } catch (error) {
    console.error('Error handling place bet:', error);
    const response = {
      type: 'betRejected', 
      data: { error: 'Failed to place bet: ' + error.message }
    };
    ws.send(JSON.stringify(response));
  }
}

async function handleLogin(ws, data, userId) {
  console.log('Login attempt:', data.username)
  try {
    const bcrypt = require('bcryptjs')
    
    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username: data.username }
    })
    
    if (!user) {
      const response = {
        type: 'loginCompleted',
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
    await prisma.user.update({
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
    
    const response = {
      type: 'loginCompleted',
      data: {
        success: true,
        userId: user.id,
        username: user.username,
        balance: user.balance,
        accessToken: accessToken,
        refreshToken: refreshToken
      }
    }
    
    ws.send(JSON.stringify(response))
    await prisma.$disconnect()
    
  } catch (error) {
    console.error('Login error:', error)
    const response = {
      type: 'loginCompleted',
      data: {
        success: false,
        message: t.unableToLogin
      }
    }
    ws.send(JSON.stringify(response))
  }
}

async function handleRegister(ws, data, userId) {
  console.log('Registration attempt:', data.username)
  
  try {
    const { PrismaClient } = require('@prisma/client')
    const bcrypt = require('bcryptjs')
    const prisma = new PrismaClient()
    
    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: data.username }
    })
    
    if (existingUser) {
      const response = {
        type: 'registrationCompleted',
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
        type: 'registrationCompleted',
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
    const newUser = await prisma.user.create({
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
    
    const response = {
      type: 'registrationCompleted',
      data: {
        success: true,
        userId: newUser.id,
        username: newUser.username,
        balance: newUser.balance,
        accessToken: accessToken,
        refreshToken: refreshToken
      }
    }
    
    ws.send(JSON.stringify(response))
    await prisma.$disconnect()
    
  } catch (error) {
    console.error('Registration error:', error)
    const response = {
      type: 'registrationCompleted',
      data: {
        success: false,
        message: t.unableToRegister
      }
    }
    ws.send(JSON.stringify(response))
  }
}

async function handleGetBalance(ws, data, userId) {
  const response = {
    type: 'balanceReceived',
    data: {
      balance: 1000
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function handleGetGameState(ws, data, userId) {
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

async function handleSurrender(ws, data, userId) {
  const response = {
    type: 'gameEnded',
    data: {
      result: 'surrender',
      amountLost: 50
    }
  }
  
  ws.send(JSON.stringify(response))
}

async function handleDoubleDown(ws, data, userId) {
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

async function handleValidateToken(ws, data, userId) {
  console.log('Token validation request for user:', userId)
  
  try {
    const { validateToken } = require('./tokenValidator')
    const validation = await validateToken(data.token)
    
    const response = {
      type: 'tokenValidated',
      data: validation
    }
    
    ws.send(JSON.stringify(response))
  } catch (error) {
    console.error('Token validation error:', error)
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

async function handleRefreshToken(ws, data, userId) {
  console.log('Token refresh request for user:', userId)
  
  try {
    const decoded = jwt.verify(data.refreshToken, JWT_SECRET)
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token type')
    }
    
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Verify user still exists
    const user = await prisma.user.findUnique({
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
    
    const response = {
      type: 'tokenRefreshed',
      data: {
        success: true,
        accessToken: newAccessToken,
        userId: user.id,
        username: user.username,
        balance: user.balance
      }
    }
    
    ws.send(JSON.stringify(response))
    await prisma.$disconnect()
    
  } catch (error) {
    console.error('Token refresh error:', error)
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

async function handleUpdateBalance(ws, data, userId) {
  console.log('Balance update for user:', userId, 'new balance:', data.newBalance)
  
  try {
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Update user balance in database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { balance: data.newBalance }
    })
    
    // Send real-time balance update to client
    const response = {
      type: 'balanceUpdated',
      data: {
        newBalance: updatedUser.balance,
        source: data.source || 'external'
      }
    }
    
    ws.send(JSON.stringify(response))
    await prisma.$disconnect()
    
  } catch (error) {
    console.error('Balance update error:', error)
    const response = {
      type: 'errorOccurred',
      data: { message: t.databaseError }
    }
    ws.send(JSON.stringify(response))
  }
}

async function handleJoinTable(ws, data, userId) {
  console.log('Player joining table:', userId)
  
  try {
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Get user data
    const user = await prisma.user.findUnique({
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
      console.log(`Player ${user.username} joined table ${result.table.getId()}`)
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
    console.error('Join table error:', error)
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

async function handleLeaveTable(ws, data, userId) {
  console.log('Player leaving table:', userId)
  
  try {
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Get user data for logging
    const user = await prisma.user.findUnique({
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
      console.log(`Player ${user?.username || userId} left table`)
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
    console.error('Leave table error:', error)
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

function handleMessage(ws, message, connectionUserId) {
  try {
    const parsed = JSON.parse(message)
    const { type, data } = parsed
    
    console.log(`Received message: ${type}`, data)
    
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
        console.log(`Authenticated message from user: ${decoded.username}`)
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'errorOccurred',
          data: { message: 'Invalid or expired token' }
        }))
        return
      }
    }
    
    if (messageHandlers[type]) {
      messageHandlers[type](ws, data, userId)
    } else {
      console.log('Unknown message type:', type)
      ws.send(JSON.stringify({
        type: 'errorOccurred',
        data: { message: t.unknownMessageType.replace('{type}', type) }
      }))
    }
  } catch (error) {
    console.error('Error handling message:', error)
    ws.send(JSON.stringify({
      type: 'errorOccurred',
      data: { message: t.invalidMessageFormat }
    }))
  }
}

// Blackjack-specific handlers
async function handleJoinBlackjackTable(ws, data, userId) {
  console.log('Player joining blackjack table:', userId, 'mode:', data.gameMode)
  
  try {
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    // Get user data
    const user = await prisma.user.findUnique({
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
      console.log(`Player ${user.username} joined blackjack table ${result.table.getId()} (${gameMode} mode)`)
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
    console.error('Error joining blackjack table:', error)
    const response = {
      type: 'errorOccurred',
      data: { message: 'Failed to join table' }
    }
    ws.send(JSON.stringify(response))
  }
}

async function handleLeaveBlackjackTable(ws, data, userId) {
  console.log('Player leaving blackjack table:', userId)
  
  try {
    // Get current user balance from database
    const user = await prisma.user.findUnique({
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
      console.log(`Player ${userId} left blackjack table with balance: ${user.balance}`)
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
    console.error('Error leaving blackjack table:', error)
    const response = {
      type: 'errorOccurred',
      data: { message: 'Failed to leave table' }
    }
    ws.send(JSON.stringify(response))
  }
}

module.exports = {
  handleMessage,
  messageHandlers
}