const logger = require('./utils/logger');

// Game configurations - centrally managed on backend
const gameConfigs = {
  blackjack: {
    id: 'blackjack',
    name: 'Blackjack',
    available: true,
    description: 'Classic 21 card game',
    route: 'Blackjack',
    maxMulti: 5,
    tiers: [
      [25, 50, 100],
      [100, 200, 500],
      [500, 1000, 2500]
    ], 
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
    tiers: [200, 500, 1000, 2500, 5000, 10000, 25000, 50000],    // in cents ($2, $5, $10, $25, $50, $100, $250, $500)
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
    tiers: [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000],
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
    const allowedUpdates = ['available', 'tiers', 'description'];
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
  
  if (!game.tiers || !game.tiers.includes(amount)) {
    const availableTiers = game.tiers.map(tier => `$${tier / 100}`).join(', ');
    return { valid: false, error: `Available bet tiers: ${availableTiers}` };
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