const BettingUtils = require('../../shared/utils/BettingUtils');
const { updatePlayerBalance } = require('../../shared/utils');
const logger = require('../../shared/utils/logger');
const crypto = require('crypto');
const { text: t } = require('../../shared/text');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class Blackjack {
  constructor(deckConfig = { decks: 6 }) {
    this.availableCards = [];
    // Initialize deck with specified configuration
    this.buildDeck(deckConfig);
  }


  // Build deck with specified configuration
  buildDeck(config) {
    this.availableCards = [];
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const numDecks = config.decks || 1;

    // Create specified number of complete decks
    for (let deck = 0; deck < numDecks; deck++) {
      for (const suit of suits) {
        for (const value of values) {
          this.availableCards.push({ suit, value });
        }
      }
    }
    
    console.log(`Initialized ${this.availableCards.length} cards (${numDecks} deck${numDecks > 1 ? 's' : ''})`);
  }

  // Generate cryptographically secure random integer
  getSecureRandomInt(max) {
    if (max <= 0) {
      throw new Error('Max must be greater than 0');
    }
    
    // Calculate number of bytes needed
    const bytesNeeded = Math.ceil(Math.log2(max) / 8);
    const maxValidValue = Math.floor(256 ** bytesNeeded / max) * max;
    
    let randomValue;
    do {
      // Generate cryptographically secure random bytes
      const randomBytes = crypto.randomBytes(bytesNeeded);
      randomValue = 0;
      
      // Convert bytes to integer
      for (let i = 0; i < bytesNeeded; i++) {
        randomValue = randomValue * 256 + randomBytes[i];
      }
    } while (randomValue >= maxValidValue); // Reject values that would cause bias
    
    return randomValue % max;
  }

  // Deal a single card using cryptographically secure random selection
  dealCard() {
    if (this.availableCards.length === 0) {
      throw new Error('No cards available to deal');
    }

    // Use cryptographically secure random number generator to select card
    const randomIndex = this.getSecureRandomInt(this.availableCards.length);
    
    // Remove the selected card from available cards
    const selectedCard = this.availableCards.splice(randomIndex, 1)[0];
    
    console.log(`Dealt card: ${selectedCard.value} of ${selectedCard.suit} (${this.availableCards.length} cards remaining)`);
    
    return selectedCard;
  }

  // Calculate the value of a hand
  calculateHandValue(cards) {
    let value = 0;
    let aces = 0;

    for (const card of cards) {
      if (card.hidden) continue; // Skip hidden dealer cards
      
      if (card.value === 'A') {
        aces++;
        value += 11;
      } else if (['K', 'Q', 'J'].includes(card.value)) {
        value += 10;
      } else {
        value += parseInt(card.value);
      }
    }

    // Adjust for aces
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }

    return value;
  }

  // Check if hand is blackjack
  isBlackjack(cards) {
    return cards.length === 2 && this.calculateHandValue(cards) === 21;
  }

  // Deal initial cards to a player
  dealPlayerCards(userId) {
    const cards = [this.dealCard(), this.dealCard()];
    this.playerHands.set(userId, cards);
    return cards;
  }

  // Get player cards
  getPlayerCards(userId) {
    return this.playerHands.get(userId) || [];
  }

  // Dealer plays their hand
  playDealerHand() {
    // Reveal hidden card
    this.dealerCards = this.dealerCards.map(card => ({ ...card, hidden: false }));
    
    // Dealer hits on 16, stands on 17
    while (this.calculateHandValue(this.dealerCards) < 17) {
      this.dealerCards.push(this.dealCard());
    }

    return {
      cards: this.dealerCards,
      value: this.calculateHandValue(this.dealerCards)
    };
  }



  // Place bet and start new game
  async placeBet(userId, amount) {
    try {
      // Get user from database
      const user = await prisma.player.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        return { success: false, error: 'User not found' };
      }
      
      // Validate bet amount
      const validation = BettingUtils.validateBetAmount(amount, user.balance, 100, 10000); // Max $100 bet
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      
      // Start new game with bet
      const gameResult = this.startNewGame(userId, amount);
      
      logger.logInfo('Bet placed and game started', { userId, amount });
      return gameResult;
    } catch (error) {
      logger.logError(error, { userId, amount, action: 'place_bet' });
      return { success: false, error: 'Failed to process bet' };
    }
  }

  // Start new game with bet
  startNewGame(userId, betAmount) {
    // Deal initial cards (deck is already fresh from constructor)
    const dealerCards = [];
    dealerCards.push(this.dealCard()); // Face up
    dealerCards.push({ ...this.dealCard(), hidden: true }); // Face down
    
    const playerCards = [this.dealCard(), this.dealCard()];
    
    // Create dealing sequence for frontend animation
    const dealingSequence = [
      { card: playerCards[0], targetHandId: 'player-hand-0', delay: 0 },
      { card: dealerCards[0], targetHandId: 'dealer-hand', delay: 500 },
      { card: playerCards[1], targetHandId: 'player-hand-0', delay: 1000 },
      { card: dealerCards[1], targetHandId: 'dealer-hand', delay: 1500 }
    ];
    
    return {
      success: true,
      gameState: {
        dealerCards,
        playerCards,
        betAmount,
        canHit: true,
        canStand: true,
        canDoubleDown: playerCards.length === 2,
        canSurrender: playerCards.length === 2
      },
      dealingSequence
    };
  }


  // Player hits
  hit(playerCards, handId = 'player-hand-0') {
    const newCard = this.dealCard();
    const newCards = [...playerCards, newCard];
    const handValue = this.calculateHandValue(newCards);
    const busted = handValue > 21;
    
    return {
      success: true,
      newCard,
      cards: newCards,
      handValue,
      busted,
      canHit: !busted,
      canStand: !busted,
      targetHandId: handId
    };
  }


  // Player stands - finish game
  stand(userId, playerCards, dealerCards, betAmount) {
    // Reveal dealer's hidden card
    const revealedDealerCards = dealerCards.map(card => ({ ...card, hidden: false }));
    
    // Dealer hits until 17 or higher
    const dealerHitSequence = [];
    while (this.calculateHandValue(revealedDealerCards) < 17) {
      const newCard = this.dealCard();
      revealedDealerCards.push(newCard);
      dealerHitSequence.push({
        card: newCard,
        targetHandId: 'dealer-hand',
        delay: dealerHitSequence.length * 1000 // 1 second between dealer hits
      });
    }
    
    // Calculate final result
    const result = this.calculateGameResult(playerCards, revealedDealerCards, betAmount);
    
    // Update player balance
    this.updatePlayerBalanceAfterGame(userId, result.payout, result.result, betAmount);
    
    return {
      success: true,
      dealerCards: revealedDealerCards,
      result: result.result,
      payout: result.payout,
      playerValue: result.playerValue,
      dealerValue: result.dealerValue,
      dealerHitSequence // For frontend animation
    };
  }

  // Double down
  async doubleDown(userId, playerCards, dealerCards, betAmount, handId = 'player-hand-0') {
    // Validate user has enough balance
    const user = await prisma.player.findUnique({
      where: { id: userId }
    });
    
    if (!user || user.balance < betAmount) {
      return { success: false, error: 'Insufficient balance to double down' };
    }
    
    // Deal one card
    const newCard = this.dealCard();
    const newCards = [...playerCards, newCard];
    const handValue = this.calculateHandValue(newCards);
    const busted = handValue > 21;
    
    // If busted, player loses
    if (busted) {
      await this.updatePlayerBalanceAfterGame(userId, 0, 'lose', betAmount * 2);
      return {
        success: true,
        card: newCard,
        cards: newCards,
        busted: true,
        result: 'lose',
        payout: 0,
        targetHandId: handId
      };
    }
    
    // Auto-stand after double down
    const standResult = await this.stand(userId, newCards, dealerCards, betAmount * 2);
    standResult.targetHandId = handId;
    return standResult;
  }

  // Surrender
  async surrender(userId, betAmount) {
    // Return half the bet
    const halfBet = Math.floor(betAmount / 2);
    
    // Update player balance
    await this.updatePlayerBalanceAfterGame(userId, halfBet, 'surrender', betAmount);
    
    return {
      success: true,
      result: 'surrender',
      payout: halfBet,
      amountReturned: halfBet
    };
  }

  // Start game (placeholder - game starts with placeBet)
  startGame(userId) {
    return { success: true, message: 'Place a bet to start playing' };
  }



  // Calculate game result for single player
  calculateGameResult(playerCards, dealerCards, betAmount) {
    const playerValue = this.calculateHandValue(playerCards);
    const dealerValue = this.calculateHandValue(dealerCards);
    const playerBusted = playerValue > 21;
    const dealerBusted = dealerValue > 21;
    const playerBlackjack = this.isBlackjack(playerCards);
    const dealerBlackjack = this.isBlackjack(dealerCards);

    let result = 'lose';
    let payoutMultiplier = 0;

    if (playerBusted) {
      result = 'lose';
      payoutMultiplier = 0;
    } else if (playerBlackjack && !dealerBlackjack) {
      result = 'blackjack';
      payoutMultiplier = 2.5; // Bet + 1.5x bet
    } else if (dealerBusted) {
      result = 'win';
      payoutMultiplier = 2; // Bet + bet
    } else if (playerValue > dealerValue) {
      result = 'win';
      payoutMultiplier = 2;
    } else if (playerValue === dealerValue) {
      result = 'push';
      payoutMultiplier = 1; // Return bet only
    } else {
      result = 'lose';
      payoutMultiplier = 0;
    }

    return {
      result,
      playerValue,
      dealerValue,
      payout: Math.floor(betAmount * payoutMultiplier),
      payoutMultiplier
    };
  }



  // Update player balance after game
  async updatePlayerBalanceAfterGame(userId, payout, result, betAmount) {
    try {
      // Get current balance
      const user = await prisma.player.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        logger.logError(new Error('User not found for balance update'), { userId });
        return;
      }
      
      const newBalance = user.balance + payout;
      
      // Update database balance
      await updatePlayerBalance(userId, newBalance, 'game_result', { 
        result, 
        payout, 
        originalBet: betAmount 
      });
      
      // Log activity
      const { logActivity } = require('../../websocket/messages');
      await logActivity(userId, user.username, 'game_result', {
        credit: payout,
        balance: newBalance,
        winnings: payout - betAmount
      });
      
      logger.logInfo('Game result processed', { 
        userId, 
        result, 
        payout, 
        newBalance 
      });
    } catch (error) {
      logger.logError(error, { userId, action: 'update_balance_after_game' });
    }
  }
}


// WebSocket message handlers
async function onStartGame(ws, data, userId) {
  logger.logGameEvent('game_start_request', null, { userId, data });
  
  try {
    const blackjack = new Blackjack();
    const result = blackjack.startGame(userId);
    
    const response = {
      type: 'gameStarted',
      data: result
    };
    ws.send(JSON.stringify(response));
  } catch (error) {
    logger.logError(error, { userId, action: 'start_game' });
    const response = {
      type: 'gameStarted',
      data: {
        success: false,
        errorMessage: t.serverError
      }
    };
    ws.send(JSON.stringify(response));
  }
}

async function onHit(ws, data, userId) {
  logger.logGameEvent('player_hit', null, { userId, data });
  
  try {
    const blackjack = new Blackjack();
    const result = blackjack.hit(data.playerCards, data.handId);
    
    const response = {
      type: 'cardDealt',
      data: result
    };
    ws.send(JSON.stringify(response));
  } catch (error) {
    logger.logError(error, { userId, action: 'hit' });
    const response = {
      type: 'cardDealt',
      data: {
        success: false,
        errorMessage: t.serverError
      }
    };
    ws.send(JSON.stringify(response));
  }
}

async function onStand(ws, data, userId) {
  logger.logGameEvent('player_stand', null, { userId, data });
  
  try {
    const blackjack = new Blackjack();
    const result = await blackjack.stand(userId, data.playerCards, data.dealerCards, data.betAmount);
    
    const response = {
      type: 'playerStood',
      data: result
    };
    ws.send(JSON.stringify(response));
  } catch (error) {
    logger.logError(error, { userId, action: 'stand' });
    const response = {
      type: 'playerStood',
      data: {
        success: false,
        errorMessage: t.serverError
      }
    };
    ws.send(JSON.stringify(response));
  }
}

async function onNewGame(ws, data, userId) {
  logger.logGameEvent('new_game_request', null, { userId });
  
  try {
    const response = {
      type: 'gameReady',
      data: {
        success: true,
        message: 'Place a bet to start a new game'
      }
    };
    ws.send(JSON.stringify(response));
  } catch (error) {
    logger.logError(error, { userId, action: 'new_game' });
    const response = {
      type: 'gameReady',
      data: {
        success: false,
        errorMessage: t.serverError
      }
    };
    ws.send(JSON.stringify(response));
  }
}

async function onPlaceBet(ws, data, userId) {
  logger.logGameEvent('place_bet_request', null, { userId, amount: data.amount });
  
  try {
    // Get current user balance from database
    const user = await prisma.player.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      logger.logError(new Error('User not found for bet'), { userId });
      ws.send(JSON.stringify({
        type: 'betRejected',
        data: { errorMessage: t.userNotFound }
      }));
      return;
    }
    
    // Check if user has enough balance
    if (user.balance < data.amount) {
      logger.logInfo('Bet rejected - insufficient balance', { userId, balance: user.balance, betAmount: data.amount });
      ws.send(JSON.stringify({
        type: 'betRejected',
        data: { errorMessage: t.insufficientBalance }
      }));
      return;
    }
    
    // Debit user balance
    const updatedBalance = user.balance - data.amount;
    await updatePlayerBalance(userId, updatedBalance, 'bet_placed', { betAmount: data.amount });
    
    // Log activity to database
    const { logActivity } = require('../../websocket/messages');
    await logActivity(userId, user.username, 'bet_placed', {
      debit: data.amount,
      balance: updatedBalance
    });
    
    // Start new blackjack game
    const blackjack = new Blackjack();
    const gameResult = blackjack.startNewGame(userId, data.amount);
    
    const response = {
      type: 'betAccepted',
      data: {
        betAmount: data.amount,
        newBalance: updatedBalance,
        gameState: gameResult.gameState,
        dealingSequence: gameResult.dealingSequence
      }
    };
    
    logger.logInfo('Bet accepted and game started', { userId, betAmount: data.amount, newBalance: updatedBalance });
    ws.send(JSON.stringify(response));
    
  } catch (error) {
    logger.logError(error, { userId, betAmount: data.amount, action: 'place_bet' });
    const response = {
      type: 'betRejected', 
      data: { errorMessage: t.serverError }
    };
    ws.send(JSON.stringify(response));
  }
}

async function onSurrender(ws, data, userId) {
  logger.logGameEvent('player_surrender', null, { userId, data });
  
  try {
    const blackjack = new Blackjack();
    const result = await blackjack.surrender(userId, data.betAmount);
    
    const response = {
      type: 'gameEnded',
      data: result
    };
    ws.send(JSON.stringify(response));
  } catch (error) {
    logger.logError(error, { userId, action: 'surrender' });
    const response = {
      type: 'gameEnded',
      data: {
        success: false,
        errorMessage: t.serverError
      }
    };
    ws.send(JSON.stringify(response));
  }
}

async function onDoubleDown(ws, data, userId) {
  logger.logGameEvent('player_double_down', null, { userId, data });
  
  try {
    const blackjack = new Blackjack();
    const result = await blackjack.doubleDown(userId, data.playerCards, data.dealerCards, data.betAmount, data.handId);
    
    const response = {
      type: 'doubleDownResult',
      data: result
    };
    ws.send(JSON.stringify(response));
  } catch (error) {
    logger.logError(error, { userId, action: 'double_down' });
    const response = {
      type: 'doubleDownResult',
      data: {
        success: false,
        errorMessage: t.serverError
      }
    };
    ws.send(JSON.stringify(response));
  }
}


// Blackjack-specific message handlers
const blackjackMessages = {
  // Game actions
  'doubleDown': onDoubleDown,
  'hit': onHit,
  'newGame': onNewGame,
  'placeBet': onPlaceBet,
  'stand': onStand,
  'startGame': onStartGame,
  'surrender': onSurrender
};

module.exports = { Blackjack, blackjackMessages };