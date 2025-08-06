// Core shared constants and utilities for frontend and backend
// This file is the source of truth - modifications should be made here,
// then built/copied to frontend and backend via build process

const GAME_TYPES = {
  BLACKJACK: { id: 1, name: 'blackjack', displayName: 'BlackJack', prefix: 'bj' }
  // Future games will be added here with incremental IDs
  // POKER: { id: 2, name: 'poker', displayName: 'Poker', prefix: 'pk' },
  // BACCARAT: { id: 3, name: 'baccarat', displayName: 'Baccarat', prefix: 'bc' }
};

// Helper functions
const getGameTypeById = (id) => {
  return Object.values(GAME_TYPES).find(game => game.id === id) || null;
};

const getGameTypeByName = (name) => {
  return Object.values(GAME_TYPES).find(game => game.name === name) || null;
};

const getAllGameTypes = () => {
  return Object.values(GAME_TYPES);
};

module.exports = {
  GAME_TYPES,
  getGameTypeById,
  getGameTypeByName,
  getAllGameTypes
};