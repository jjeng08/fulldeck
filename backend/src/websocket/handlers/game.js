const logger = require('../../shared/logger');
const { getAllGames } = require('../../shared/gameConfigs');
const { sendMessage } = require('../server');

// Helper function to send available games - use direct WebSocket to avoid circular dependency
function sendAvailableGames(ws, userId) {
  try {
    const games = getAllGames();
    
    // Send directly through WebSocket to avoid circular dependency
    const response = {
      type: 'availableGames',
      data: {
        availableGames: games
      }
    };
    ws.send(JSON.stringify(response));
  } catch (error) {
    logger.logError(error, { action: 'send_available_games' });
  }
}

// Helper function to send current balance for a user
async function sendBalanceUpdate(userId) {
  try {
    const { PrismaClient } = require('@prisma/client');
    const { prisma } = require('../../shared/DBUtils');
    
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
    
    await prisma.$disconnect();
  } catch (error) {
    logger.logError(error, { userId, action: 'send_balance_update' });
  }
}

async function onAvailableGames(ws, data, userId) {
  // Associate this connection with the user (in case it's not already associated)
  const { WebSocketServer } = require('../server');
  const wsServer = WebSocketServer.getInstance();
  if (wsServer) {
    wsServer.updateConnectionUserId(ws, userId);
  }
  
  sendAvailableGames(ws, userId);
  await sendBalanceUpdate(userId);
}

async function onGameConfigs(ws, data, userId) {
  logger.logUserAction('game_configs_request', userId, { userId });
  
  sendMessage(userId, 'gameConfigs', {
    availableGames: getAllGames()
  });
}

async function onGameState(ws, data, userId) {
  sendMessage(userId, 'gameState', {
    gameActive: false,
    playerHand: [],
    dealerHand: [],
    gameState: 'waiting_for_bet'
  });
}

module.exports = {
  onAvailableGames,
  onGameConfigs,
  onGameState
};