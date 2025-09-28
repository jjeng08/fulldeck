const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const logger = require('./logger');
const { GAME_TYPES, getGameTypeByName, getGameTypeById } = require('../core/core');

// Singleton Prisma client
let prisma = null;

// Initialize database connection
const initialize = async () => {
  if (!prisma) {
    console.log('ACTUAL DATABASE_URL AT INIT TIME:', process.env.DATABASE_URL);
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable not set');
    }
    console.log('Creating PrismaClient with URL:', process.env.DATABASE_URL);
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      },
      log: [
        { emit: 'stdout', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' }
      ]
    });
    
    // Test the connection immediately and fail fast
    console.log('PrismaClient created, testing connection...');
    try {
      await prisma.$connect();
      console.log('✅ Database connection successful!');
    } catch (err) {
      console.error('❌ CRITICAL: Database connection failed!');
      console.error('CONNECTION ERROR:', err.message);
      console.error('DATABASE_URL:', process.env.DATABASE_URL);
      console.error('This is a fatal error. Exiting...');
      process.exit(1);
    }
    logger.logInfo('Database connection initialized via DBUtils', { 
      databaseUrl: process.env.DATABASE_URL 
    });
  }
  return prisma;
};

// Game ID generation - abstracted for all game types
const generateGameId = (gameType) => {
  // Accept either string name or game type object
  const gameObj = typeof gameType === 'string' ? getGameTypeByName(gameType) : gameType;
  const prefix = gameObj?.prefix || 'gm';
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
};

// Player-related database operations
const getPlayerById = async (userId) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: userId }
    });
    
    if (!player) {
      logger.logError(new Error('Player not found'), { userId, action: 'get_player_by_id' });
      return null;
    }
    
    return player;
  } catch (error) {
    logger.logError(error, { userId, action: 'get_player_by_id' });
    throw error;
  }
};

const getPlayerByUsername = async (username) => {
  try {
    const player = await prisma.player.findUnique({
      where: { username }
    });
    
    if (!player) {
      logger.logError(new Error('Player not found'), { username, action: 'get_player_by_username' });
      return null;
    }
    
    return player;
  } catch (error) {
    logger.logError(error, { username, action: 'get_player_by_username' });
    throw error;
  }
};

const updatePlayer = async (userId, updates, reason, metadata = {}) => {
  try {
    logger.logInfo('updatePlayer called', { userId, updates, reason, metadata });
    
    if (updates.balance !== undefined && (updates.balance === null || updates.balance < 0)) {
      throw new Error('balance cannot be null or negative');
    }
    
    // Build the update object
    const updateData = {};
    if (updates.balance !== undefined) {
      updateData.balance = updates.balance;
    }
    if (updates.winningsIncrement !== undefined && updates.winningsIncrement !== 0) {
      updateData.winnings = { increment: updates.winningsIncrement };
    }
    
    const updatedPlayer = await prisma.player.update({
      where: { id: userId },
      data: updateData
    });
    
    logger.logUserAction('player_updated', userId, { updates, reason, metadata, newBalance: updatedPlayer.balance, newWinnings: updatedPlayer.winnings });
    
    return updatedPlayer;
  } catch (error) {
    logger.logError(error, { userId, updates, reason, metadata, action: 'update_player' });
    throw error;
  }
};

// Update player's last seen timestamp
const updatePlayerLastSeen = async (userId) => {
  try {
    const updatedPlayer = await prisma.player.update({
      where: { id: userId },
      data: { lastSeen: new Date() }
    });
    
    logger.logUserAction('last_seen_updated', userId, { lastSeen: updatedPlayer.lastSeen });
    return updatedPlayer;
  } catch (error) {
    logger.logError(error, { userId, action: 'update_player_last_seen' });
    throw error;
  }
};

// Create new player account
const createPlayer = async (playerData) => {
  try {
    const newPlayer = await prisma.player.create({
      data: {
        username: playerData.username,
        passwordHash: playerData.passwordHash,
        createdOn: new Date(),
        lastSeen: new Date()
      }
    });
    
    logger.logUserAction('player_created', newPlayer.id, { username: newPlayer.username });
    return newPlayer;
  } catch (error) {
    logger.logError(error, { playerData: { username: playerData.username }, action: 'create_player' });
    throw error;
  }
};

const debitPlayerAccount = async (userId, amount, reason, metadata = {}) => {
  try {
    const player = await getPlayerById(userId);
    if (!player) {
      throw new Error('Player not found');
    }
    
    if (player.balance < amount) {
      throw new Error('Insufficient balance');
    }
    
    const newBalance = player.balance - amount;
    const updatedPlayer = await updatePlayer(userId, { 
      balance: newBalance 
    }, reason, { ...metadata, debitAmount: amount });
    
    return updatedPlayer;
  } catch (error) {
    logger.logError(error, { userId, amount, reason, metadata, action: 'debit_player_account' });
    throw error;
  }
};

const creditPlayerAccount = async (userId, amount, reason, metadata = {}) => {
  try {
    const player = await getPlayerById(userId);
    if (!player) {
      throw new Error('Player not found');
    }
    
    const newBalance = player.balance + amount;
    const winningsIncrement = metadata.winningsIncrement || 0;
    const updatedPlayer = await updatePlayer(userId, { 
      balance: newBalance, 
      winningsIncrement: winningsIncrement 
    }, reason, { ...metadata, creditAmount: amount });
    
    return updatedPlayer;
  } catch (error) {
    logger.logError(error, { userId, amount, reason, metadata, action: 'credit_player_account' });
    throw error;
  }
};

// Accounts logging (updated to support gameType, gameId, and actionId linking)
const logToAccountsLogs = async (userId, metadata = {}) => {
  try {
    await initialize();
    
    // Convert gameType string to ID if provided
    let gameTypeId = null;
    if (metadata.gameType) {
      if (typeof metadata.gameType === 'string') {
        const gameObj = getGameTypeByName(metadata.gameType);
        gameTypeId = gameObj ? gameObj.id : null;
      } else if (typeof metadata.gameType === 'number') {
        gameTypeId = metadata.gameType;
      }
    }
    
    // Auto-fetch current winnings if not provided
    let winnings = metadata.winnings;
    if (winnings === undefined || winnings === null) {
      const player = await getPlayerById(userId);
      winnings = player ? player.winnings : null;
    }
    
    const activity = await prisma.accountsLogs.create({
      data: {
        playerId: userId,
        gameType: gameTypeId,
        gameId: metadata.gameId || null,
        actionId: metadata.actionId || null,
        credit: metadata.credit || null,
        debit: metadata.debit || null,
        balance: metadata.balance,
        winnings: winnings
      }
    });
    
    logger.logInfo('Accounts activity logged to database', { 
      playerId: userId, 
      gameType: gameTypeId,
      gameId: metadata.gameId,
      actionId: metadata.actionId,
      ...metadata
    });
    
    return activity;
  } catch (error) {
    logger.logError(error, { userId, metadata, action: 'log_to_accounts_logs' });
    throw error;
  }
};

// Blackjack-specific game action logging with options object
const logToBlackjackLogs = async (options) => {
  const {
    actionId,
    gameId,
    userId,
    action,
    result,
    handIndex = 0,
    handValue = 0,
    betAmount = 0,
    cards = '',
    dealerShowing = null,
    totalHands = 1,
    gameState = null
  } = options;

  try {
    const blackjackLog = await prisma.blackjackLogs.create({
      data: {
        id: actionId,
        gameId,
        playerId: userId,
        action,
        result,
        handIndex,
        handValue,
        betAmount,
        cards,
        dealerShowing: dealerShowing || null,
        totalHands,
        gameState: gameState ? JSON.stringify(gameState) : null
      }
    });
    
    logger.logInfo('Blackjack action logged to database', { 
      actionId,
      gameId,
      playerId: userId,
      action,
      result,
      handIndex,
      handValue,
      betAmount,
      hasFullGameState: !!gameState
    });
    
    return blackjackLog;
  } catch (error) {
    logger.logError(error, { 
      actionId,
      gameId, 
      userId, 
      action, 
      result, 
      handIndex, 
      action: 'log_to_blackjack_logs' 
    });
    throw error;
  }
};

// Get account logs by username
const getAccountLogsByUsername = async (username) => {
  try {
    await initialize();
    
    // First get the player by username
    const player = await prisma.player.findFirst({
      where: { username }
    });
    
    if (!player) {
      throw new Error('Player not found');
    }
    
    // Get account logs for this player with action labels from game-specific logs
    const accountLogs = await prisma.accountsLogs.findMany({
      where: { playerId: player.id },
      orderBy: { createdOn: 'desc' },
      select: {
        gameType: true,
        gameId: true,
        actionId: true,
        credit: true,
        debit: true,
        balance: true,
        winnings: true
      }
    });

    // Join with BlackjackLogs to get readable action labels
    const logsWithActions = await Promise.all(
      accountLogs.map(async (log) => {
        let actionLabel = log.actionId; // Fallback to actionId if no match found
        
        if (log.actionId && log.gameType === GAME_TYPES.BLACKJACK.id) {
          // Look up action from BlackjackLogs
          const blackjackLog = await prisma.blackjackLogs.findFirst({
            where: { id: log.actionId },
            select: { action: true }
          });
          
          if (blackjackLog) {
            actionLabel = blackjackLog.action;
          }
        }
        // TODO: Add similar lookups for other game types (Poker, Baccarat) when implemented
        
        return {
          ...log,
          actionLabel
        };
      })
    );
    
    // Map gameType IDs to display names
    const mappedLogs = logsWithActions.map(log => ({
      ...log,
      gameType: log.gameType ? (getGameTypeById(log.gameType)?.displayName || `Unknown (${log.gameType})`) : null
    }));
    
    return mappedLogs;
  } catch (error) {
    logger.logError(error, { username, action: 'get_account_logs_by_username' });
    throw error;
  }
};


// Cleanup function
const disconnect = async () => {
  try {
    if (prisma) {
      await prisma.$disconnect();
      logger.logInfo('Database connection closed');
    } else {
      logger.logInfo('No database connection to close');
    }
  } catch (error) {
    logger.logError(error, { action: 'database_disconnect' });
  }
};

module.exports = {
  initialize,
  // prisma, // ❌ REMOVED - No direct database access allowed
  createPlayer,
  creditPlayerAccount,
  debitPlayerAccount,
  disconnect,
  generateGameId,
  getAccountLogsByUsername,
  getPlayerById,
  getPlayerByUsername,
  logToAccountsLogs,
  logToBlackjackLogs,
  updatePlayer,
  updatePlayerLastSeen
};