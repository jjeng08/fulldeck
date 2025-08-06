const { PrismaClient } = require('@prisma/client');
const logger = require('../../shared/logger');

const prisma = new PrismaClient();

const { sendMessage } = require('../server');

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

async function onBalance(ws, data, userId) {
  await sendBalanceUpdate(userId);
}

module.exports = {
  onBalance,
  sendBalanceUpdate
};