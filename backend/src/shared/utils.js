const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const logger = require('./utils/logger')

const JWT_SECRET = process.env.JWT_SECRET || 'blackjack-secret-key'

const validateToken = async (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const prisma = new PrismaClient()
    
    // Check if user still exists in database
    const user = await prisma.player.findUnique({
      where: { id: decoded.userId }
    })
    
    await prisma.$disconnect()
    
    if (!user) {
      return { valid: false, error: 'User not found' }
    }
    
    return {
      valid: true,
      userId: user.id,
      username: user.username,
      balance: user.balance
    }
  } catch (error) {
    return { valid: false, error: error.message }
  }
}

const updatePlayerBalance = async (userId, newBalance, reason, metadata = {}) => {
  try {
    const prisma = new PrismaClient()
    
    const updatedUser = await prisma.player.update({
      where: { id: userId },
      data: { balance: newBalance }
    })
    
    logger.logBalanceChange(userId, newBalance, reason, metadata)
    await prisma.$disconnect()
    
    return updatedUser.balance
  } catch (error) {
    logger.logError(error, { userId, newBalance, reason, metadata, action: 'update_player_balance' })
    throw error
  }
}

const validateBetAmount = (amount, balance, minBet = 100, maxBet = Infinity) => {
  if (typeof amount !== 'number' || amount <= 0) {
    return { valid: false, error: 'Invalid bet amount' };
  }
  
  if (amount < minBet) {
    return { valid: false, error: `Minimum bet is ${minBet}` };
  }
  
  if (amount > maxBet) {
    return { valid: false, error: `Maximum bet is ${maxBet}` };
  }
  
  if (amount > balance) {
    return { valid: false, error: 'Insufficient balance' };
  }
  
  return { valid: true };
}

const processBet = (player, amount) => {
  const validation = validateBetAmount(amount, player.balance);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  player.balance -= amount;
  return amount;
}

const processAllInBet = (player) => {
  const amount = player.balance;
  player.balance = 0;
  return amount;
}

const formatCurrency = (amount) => {
  return `$${amount.toLocaleString()}`;
}

const calculatePayout = (betAmount, multiplier) => {
  return Math.floor(betAmount * multiplier);
}

module.exports = { 
  calculatePayout,
  formatCurrency,
  processAllInBet,
  processBet,
  updatePlayerBalance,
  validateBetAmount,
  validateToken 
}