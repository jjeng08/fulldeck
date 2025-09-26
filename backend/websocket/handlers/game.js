const logger = require('../../shared/logger');
const { getAllGames } = require('../../shared/gameConfigs');
const { sendMessage } = require('../server');
const DBUtils = require('../../shared/DBUtils');

// Helper function to send available games using sendMessage
function sendAvailableGames(userId) {
  try {
    const games = getAllGames();
    
    sendMessage(userId, 'availableGames', {
      availableGames: games
    });
  } catch (error) {
    logger.logError(error, { action: 'send_available_games' });
  }
}

// Helper function to send current balance for a user
async function sendBalanceUpdate(userId) {
  try {
    const user = await DBUtils.getPlayerById(userId);
    
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

async function onAvailableGames(data, userId) {
  sendAvailableGames(userId);
  await sendBalanceUpdate(userId);
}

async function onGameConfigs(data, userId) {
  logger.logUserAction('game_configs_request', userId, { userId });
  
  sendMessage(userId, 'gameConfigs', {
    availableGames: getAllGames()
  });
}

async function onGameState(data, userId) {
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