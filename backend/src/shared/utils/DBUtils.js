const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

const prisma = new PrismaClient();

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

const updatePlayerBalance = async (userId, newBalance, reason, metadata = {}) => {
  try {
    logger.logInfo('updatePlayerBalance called', { userId, newBalance, reason, metadata });
    
    if (newBalance === undefined || newBalance === null) {
      throw new Error('newBalance cannot be undefined or null');
    }
    
    const updatedPlayer = await prisma.player.update({
      where: { id: userId },
      data: { balance: newBalance }
    });
    
    logger.logUserAction('balance_updated', userId, { newBalance, reason, metadata });
    
    // Send balance update through centralized message system
    const WebSocketServer = require('../../websocket/server');
    const wsServer = WebSocketServer.getInstance();
    if (wsServer) {
      wsServer.sendMessage(userId, 'balance', { balance: updatedPlayer.balance });
    }
    
    return updatedPlayer;
  } catch (error) {
    logger.logError(error, { userId, newBalance, reason, metadata, action: 'update_player_balance' });
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
    const updatedPlayer = await updatePlayerBalance(userId, newBalance, reason, { ...metadata, debitAmount: amount });
    
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
    const updatedPlayer = await updatePlayerBalance(userId, newBalance, reason, { ...metadata, creditAmount: amount });
    
    return updatedPlayer;
  } catch (error) {
    logger.logError(error, { userId, amount, reason, metadata, action: 'credit_player_account' });
    throw error;
  }
};

// Activity logging
const logPlayerActivity = async (userId, username, activityType, metadata = {}) => {
  try {
    const activity = await prisma.activityLog.create({
      data: {
        playerId: userId,
        username,
        activityType,
        credit: metadata.credit || null,
        debit: metadata.debit || null,
        balance: metadata.balance,
        winnings: metadata.winnings || null
      }
    });
    
    logger.logInfo('Activity logged to database', { 
      playerId: userId, 
      username, 
      activityType,
      ...metadata
    });
    
    return activity;
  } catch (error) {
    logger.logError(error, { userId, username, activityType, metadata, action: 'log_player_activity' });
    throw error;
  }
};

// Game result logging
const logGameResult = async (gameId, playerId, result, amountWonLost, playerHand, dealerHand) => {
  try {
    const gameResult = await prisma.gameResult.create({
      data: {
        gameId,
        playerId,
        result,
        amountWonLost,
        playerHand,
        dealerHand
      }
    });
    
    logger.logInfo('Game result logged to database', { 
      gameId, 
      playerId, 
      result, 
      amountWonLost 
    });
    
    return gameResult;
  } catch (error) {
    logger.logError(error, { gameId, playerId, result, amountWonLost, action: 'log_game_result' });
    throw error;
  }
};

// Game management
const createGame = async (gameType = 'blackjack') => {
  try {
    const game = await prisma.game.create({
      data: { gameType }
    });
    
    logger.logInfo('Game created', { gameId: game.id, gameType });
    
    return game;
  } catch (error) {
    logger.logError(error, { gameType, action: 'create_game' });
    throw error;
  }
};

const completeGame = async (gameId) => {
  try {
    const game = await prisma.game.update({
      where: { id: gameId },
      data: { completedAt: new Date() }
    });
    
    logger.logInfo('Game completed', { gameId });
    
    return game;
  } catch (error) {
    logger.logError(error, { gameId, action: 'complete_game' });
    throw error;
  }
};

// Cleanup function
const disconnect = async () => {
  try {
    await prisma.$disconnect();
    logger.logInfo('Database connection closed');
  } catch (error) {
    logger.logError(error, { action: 'database_disconnect' });
  }
};

module.exports = {
  completeGame,
  createGame,
  creditPlayerAccount,
  debitPlayerAccount,
  disconnect,
  getPlayerById,
  getPlayerByUsername,
  logGameResult,
  logPlayerActivity,
  updatePlayerBalance
};