const logger = require('./logger');

// Game configurations - centrally managed on backend
const gameConfigs = {
  blackjack: {
    id: 'blackjack',
    name: 'Blackjack',
    available: true,
    description: 'Classic 21 card game',
    route: 'Blackjack',
    minBet: 100,      // in cents ($1.00)
    maxBet: 10000,    // in cents ($100.00)
    maxPlayers: 6,
    variants: ['classic'],
    rules: {
      dealerStandsOn: 17,
      blackjackPayout: 1.5,
      allowDoubleDown: true,
      allowSurrender: true,
      allowSplit: true,
      maxSplitHands: 4
    }
  },
  poker: {
    id: 'poker',
    name: 'Texas Hold\'em Poker',
    available: false,
    description: 'Coming Soon',
    route: 'Poker',
    minBet: 200,      // in cents ($2.00)
    maxBet: 50000,    // in cents ($500.00)
    maxPlayers: 9,
    variants: ['holdem'],
    rules: {
      blindStructure: 'standard',
      allowAllIn: true,
      tournamentMode: false
    }
  },
  baccarat: {
    id: 'baccarat',
    name: 'Baccarat',
    available: false,
    description: 'Coming Soon',
    route: 'Baccarat',
    minBet: 500,      // in cents ($5.00)
    maxBet: 100000,   // in cents ($1000.00)
    maxPlayers: 14,
    variants: ['punto_banco'],
    rules: {
      commissionRate: 0.05,
      allowTieBets: true,
      allowSideBets: false
    }
  }
};

// Helper functions
const getAvailableGames = () => {
  const available = Object.values(gameConfigs).filter(game => game.available);
  logger.logDebug('Available games requested', { count: available.length });
  return available;
};

const getAllGames = () => {
  const all = Object.values(gameConfigs);
  logger.logDebug('All games requested', { count: all.length });
  return all;
};

const getGameById = (gameId) => {
  const game = gameConfigs[gameId];
  if (!game) {
    logger.logWarn('Game not found', { gameId });
    return null;
  }
  logger.logDebug('Game retrieved', { gameId, available: game.available });
  return game;
};

const isGameAvailable = (gameId) => {
  const game = gameConfigs[gameId];
  return game && game.available;
};

// Game management functions (for admin use)
const setGameAvailability = (gameId, available) => {
  if (gameConfigs[gameId]) {
    gameConfigs[gameId].available = available;
    logger.logInfo('Game availability changed', { gameId, available });
    return true;
  }
  logger.logWarn('Cannot set availability for unknown game', { gameId });
  return false;
};

const updateGameConfig = (gameId, updates) => {
  if (gameConfigs[gameId]) {
    // Only allow certain fields to be updated
    const allowedUpdates = ['available', 'minBet', 'maxBet', 'description'];
    const filteredUpdates = {};
    
    for (const key of allowedUpdates) {
      if (updates.hasOwnProperty(key)) {
        filteredUpdates[key] = updates[key];
      }
    }
    
    Object.assign(gameConfigs[gameId], filteredUpdates);
    logger.logInfo('Game config updated', { gameId, updates: filteredUpdates });
    return gameConfigs[gameId];
  }
  logger.logWarn('Cannot update unknown game', { gameId });
  return null;
};

// Validation functions
const validateBetAmount = (gameId, amount) => {
  const game = gameConfigs[gameId];
  if (!game) {
    return { valid: false, error: 'Unknown game' };
  }
  
  if (!game.available) {
    return { valid: false, error: 'Game not available' };
  }
  
  if (amount < game.minBet) {
    return { valid: false, error: `Minimum bet is $${game.minBet / 100}` };
  }
  
  if (amount > game.maxBet) {
    return { valid: false, error: `Maximum bet is $${game.maxBet / 100}` };
  }
  
  return { valid: true };
};

module.exports = {
  gameConfigs,
  getAvailableGames,
  getAllGames,
  getGameById,
  isGameAvailable,
  setGameAvailability,
  updateGameConfig,
  validateBetAmount
};