// Shared constants for BlackJack game
// Used by both frontend and backend to ensure consistency

const GAME_STATES = {
  BETTING: 'betting',
  DEALING: 'dealing',
  INSURANCE_OFFERED: 'insurance_offered',
  DOUBLEDOWN_PROCESSING: 'doubledown_processing',  // Can happen during initial hand
  PLAYING: 'playing',                              // General playing state
  PLAYING_HAND_1: 'playing_hand_1',               // Split hands
  PLAYING_HAND_2: 'playing_hand_2',               // Split hands
  DEALER_TURN: 'dealer_turn',
  FINISHED: 'finished'
};

module.exports = {
  GAME_STATES
};