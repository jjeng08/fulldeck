// Shared BlackJack game logic and constants
// Used by both frontend and backend to ensure identical behavior

const GAME_STATES = {
  BETTING: 'betting',
  DEALING: 'dealing', 
  INSURANCE_OFFERED: 'insurance_offered',
  DOUBLEDOWN_PROCESSING: 'doubledown_processing',
  PLAYING: 'playing',
  PLAYING_HAND_1: 'playing_hand_1',
  PLAYING_HAND_2: 'playing_hand_2',
  DEALER_TURN: 'dealer_turn',
  FINISHED: 'finished'
};

const GAME_ACTIONS = {
  BET: 'bet',
  HIT: 'hit',
  STAND: 'stand',
  DOUBLE_DOWN: 'doubleDown',
  SPLIT: 'split',
  SPLIT_DEAL: 'splitDeal',
  INSURANCE: 'insurance',
  INSURANCE_WIN: 'insuranceWin',
  INSURANCE_LOSE: 'insuranceLose',
  SURRENDER: 'surrender',
  DEALER_COMPLETE: 'dealerComplete',
  NEW_GAME: 'newGame',
  GAME_WIN: 'gameWin',
  GAME_LOSE: 'gameLose',
  GAME_PUSH: 'gamePush',
  GAME_BLACKJACK: 'gameBlackjack'
};

const calculateHandValue = (cards) => {
  if (!cards || cards.length === 0) return 0;
  
  let value = 0;
  let aces = 0;
  
  for (const card of cards) {
    // Skip hole cards (cards with null value)
    if (card.value === null || card.value === undefined) {
      continue;
    }
    
    if (card.value === 'A') {
      aces++;
      value += 11;
    } else if (['K', 'Q', 'J'].includes(card.value)) {
      value += 10;
    } else {
      const numValue = parseInt(card.value);
      if (!isNaN(numValue)) {
        value += numValue;
      }
    }
  }
  
  // Adjust for soft aces to get the highest valid value
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  
  return value;
};

const isBlackjack = (cards) => {
  if (cards.length !== 2) return false;
  
  let hasAce = false;
  let hasTen = false;
  
  for (const card of cards) {
    if (card.value === 'A') {
      hasAce = true;
    } else if (['K', 'Q', 'J'].includes(card.value) || card.value === '10') {
      hasTen = true;
    }
  }
  
  return hasAce && hasTen;
};

// Dual export for both CommonJS and ES6 compatibility
module.exports = { 
  GAME_STATES, 
  GAME_ACTIONS,
  calculateHandValue, 
  isBlackjack 
};

// ES6 named exports for modern environments
if (typeof exports !== 'undefined') {
  exports.GAME_STATES = GAME_STATES;
  exports.GAME_ACTIONS = GAME_ACTIONS;
  exports.calculateHandValue = calculateHandValue;
  exports.isBlackjack = isBlackjack;
}