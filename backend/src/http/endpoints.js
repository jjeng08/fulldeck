const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const logger = require('../shared/logger')

const JWT_SECRET = process.env.JWT_SECRET || 'fulldeck-secret-key'

const endpoints = {
  // Health check
  'health': onHealth,
  
  // Logging
  'logs': onFrontendLogs,
  
  // Account management
  'creditAccount': onCreditAccount,
  'debitAccount': onDebitAccount,
  'getBalance': onGetBalance,
  'getPlayer': onGetPlayer
}

async function onHealth(req, res) {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'fulldeck-backend'
  })
}

async function onFrontendLogs(req, res) {
  try {
    const { level, type, message, data = {} } = req.body;

    if (!level || !message) {
      return res.status(400).json({
        error: 'Invalid log data: level and message required'
      });
    }

    // Log to backend using appropriate logger method based on level
    const logData = {
      ...data,
      frontend_origin: true,
      client_ip: req.ip,
      user_agent: req.get('User-Agent')
    };

    switch (level) {
      case 'error':
        logger.logError(new Error(message), logData);
        break;
      case 'warn':
        logger.logWarn(message, logData);
        break;
      case 'info':
        logger.logInfo(message, logData);
        break;
      case 'debug':
        logger.logDebug(message, logData);
        break;
      default:
        logger.logInfo(message, logData);
    }

    res.json({ success: true });
  } catch (error) {
    logger.logError(error, { 
      action: 'frontend_log_processing',
      original_log: req.body 
    });
    res.status(500).json({
      error: 'Failed to process frontend log'
    });
  }
}

async function onCreditAccount(req, res) {
  const prisma = new PrismaClient()
  
  try {
    const { playerId, amount, source } = req.body

    if (!playerId || !amount || amount <= 0) {
      return res.status(400).json({
        error: 'Invalid request: playerId and positive amount required'
      })
    }

    const updatedPlayer = await prisma.player.update({
      where: { id: playerId },
      data: { 
        balance: { increment: amount },
        winnings: { increment: amount }
      }
    })

    logger.logInfo('Account credited', { 
      playerId, 
      amount: amount/100, 
      source: source || 'external' 
    })

    res.json({
      success: true,
      playerId: updatedPlayer.id,
      newBalance: updatedPlayer.balance,
      creditAmount: amount,
      source: source || 'external',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.logError(error, { action: 'credit_account', playerId: req.body.playerId })
    res.status(500).json({
      error: 'Failed to credit account',
      message: error.message
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function onDebitAccount(req, res) {
  const prisma = new PrismaClient()
  
  try {
    const { playerId, amount, source } = req.body

    if (!playerId || !amount || amount <= 0) {
      return res.status(400).json({
        error: 'Invalid request: playerId and positive amount required'
      })
    }

    // Check current balance first
    const player = await prisma.player.findUnique({
      where: { id: playerId }
    })

    if (!player) {
      return res.status(404).json({ error: 'Player not found' })
    }

    if (player.balance < amount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        currentBalance: player.balance,
        requestedAmount: amount
      })
    }

    const updatedPlayer = await prisma.player.update({
      where: { id: playerId },
      data: { balance: { decrement: amount } }
    })

    logger.logInfo('Account debited', { 
      playerId, 
      amount: amount/100, 
      source: source || 'external' 
    })

    res.json({
      success: true,
      playerId: updatedPlayer.id,
      newBalance: updatedPlayer.balance,
      debitAmount: amount,
      source: source || 'external',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.logError(error, { action: 'debit_account', playerId: req.body.playerId })
    res.status(500).json({
      error: 'Failed to debit account',
      message: error.message
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function onGetBalance(req, res) {
  const prisma = new PrismaClient()
  
  try {
    const { playerId } = req.params

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, balance: true, username: true, winnings: true }
    })

    if (!player) {
      return res.status(404).json({ error: 'Player not found' })
    }

    res.json({
      playerId: player.id,
      username: player.username,
      balance: player.balance,
      winnings: player.winnings,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.logError(error, { action: 'get_balance', playerId: req.params.playerId })
    res.status(500).json({
      error: 'Failed to get balance',
      message: error.message
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function onGetPlayer(req, res) {
  const prisma = new PrismaClient()
  
  try {
    const { playerId } = req.params

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        username: true,
        balance: true,
        winnings: true,
        createdOn: true,
        lastSeen: true
      }
    })

    if (!player) {
      return res.status(404).json({ error: 'Player not found' })
    }

    res.json({
      player,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.logError(error, { action: 'get_player', playerId: req.params.playerId })
    res.status(500).json({
      error: 'Failed to get player',
      message: error.message
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type')
    }
    req.userId = decoded.userId
    req.username = decoded.username
    next()
  } catch (error) {
    logger.logError(error, { action: 'token_validation' })
    return res.status(403).json({ error: 'Invalid or expired token' })
  }
}

module.exports = {
  endpoints,
  authenticateToken
}