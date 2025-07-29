const BettingUtils = require('../../shared/utils/BettingUtils');
const crypto = require('crypto');
const DBUtils = require('../../shared/utils/DBUtils');
const logger = require('../../shared/utils/logger');
const testLogger = require('../../shared/testLogger');
const { text: t } = require('../../shared/text');
const { GAME_STATES, calculateHandValue, isBlackjack } = require('./blackjackCore');

// Game instance manager - stores active game instances by userId
const activeGames = new Map();

// Helper function to send centralized messages
function sendMessage(userId, type, data) {
  const WebSocketServer = require('../../websocket/server');
  const wsServer = WebSocketServer.getInstance();
  if (wsServer) {
    wsServer.sendMessage(userId, type, data);
  }
}
class Blackjack {
  constructor(deckConfig = { decks: 6 }) {
    this.availableCards = [];
    
    // Multi-hand state with backward compatibility
    this.playerHands = [[]]; // Array of hands - index 0 for single-hand mode
    this.playerValues = [0]; // Array of hand values
    this.currentBets = [0]; // Array of bets per hand
    this.activeHandIndex = 0; // Currently active hand (0 for single-hand)
    this.totalHands = 1; // Total number of hands (1 or 2)
    
    // Existing single properties
    this.dealerCards = [];
    this.dealerValue = 0;
    this.currentDealerCards = [];
    this.immediateGameResult = null;
    
    // Initialize deck with specified configuration
    this.buildDeck(deckConfig);
  }
  
  // Direct access methods for current active hand
  getCurrentPlayerHand() { return this.playerHands[this.activeHandIndex] || []; }
  setCurrentPlayerHand(cards) { 
    this.playerHands[this.activeHandIndex] = cards;
    this.playerValues[this.activeHandIndex] = calculateHandValue(cards);
  }
  
  getCurrentPlayerValue() { return this.playerValues[this.activeHandIndex] || 0; }
  setCurrentPlayerValue(value) { this.playerValues[this.activeHandIndex] = value; }
  
  getCurrentBet() { return this.currentBets[this.activeHandIndex] || 0; }
  setCurrentBet(bet) { this.currentBets[this.activeHandIndex] = bet; }
  
  // Helper functions for multi-hand state management
  updateActiveHand(cards, value) {
    this.playerHands[this.activeHandIndex] = cards;
    this.playerValues[this.activeHandIndex] = value;
  }
  
  updateActiveHandCards(cards) {
    this.playerHands[this.activeHandIndex] = cards;
    this.playerValues[this.activeHandIndex] = calculateHandValue(cards);
  }
  
  updateActiveHandValue(value) {
    this.playerValues[this.activeHandIndex] = value;
  }

  // Get next active hand index for split scenarios
  getNextActiveHandIndex() {
    // Find the next hand that hasn't been completed yet
    for (let i = 0; i < this.totalHands; i++) {
      if (i !== this.activeHandIndex) {
        return i;
      }
    }
    return this.activeHandIndex; // fallback
  }
  
  // Initialize new game state
  initializeNewGame(betAmount = 0) {
    this.playerHands = [[]];
    this.playerValues = [0];
    this.currentBets = [betAmount];
    this.activeHandIndex = 0;
    this.totalHands = 1;
    this.dealerCards = [];
    this.dealerValue = 0;
    this.currentDealerCards = [];
    this.immediateGameResult = null;
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
    
    // Add unique ID to the card
    const cardWithId = {
      ...selectedCard,
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    return cardWithId;
  }






  // Place bet and start new game
  async placeBet(userId, amount) {
    try {
      // Get user from database
      const user = await DBUtils.getPlayerById(userId);
      
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
    // Initialize new game state with bet amount
    this.initializeNewGame(betAmount);
    
    // Deal initial cards (deck is already fresh from constructor)
    const dealerFaceUp = this.dealCard();
    const dealerHoleCard = this.dealCard();
    const dealerCards = [dealerFaceUp, dealerHoleCard];
    
    // const playerCards = [this.dealCard(), this.dealCard()];
    const playerCards = [{ suit: 'spades', value: '8' }, { suit: 'hearts', value: '8' }];
    
    // Store cards in new structure
    this.dealerCards = dealerCards;
    this.currentDealerCards = dealerCards;
    this.setCurrentPlayerHand(playerCards); // Update playerHands and values
    
    // Check for insurance opportunity first (dealer shows Ace)
    const canBuyInsurance = dealerFaceUp.value === 'A';
    
    // If dealer shows Ace, always offer insurance first
    if (canBuyInsurance) {
      return {
        success: true,
        gameState: {
          dealerCards: [dealerFaceUp, { suit: null, value: null, isHoleCard: true }], // Face-up card + hole card placeholder
          playerHands: this.playerHands,
          playerValues: this.playerValues,
          betAmount,
          gameStatus: GAME_STATES.INSURANCE_OFFERED,
          canHit: false,
          canStand: false,
          canDoubleDown: false,
          canSurrender: false,
          canBuyInsurance: true,
          insuranceAmount: Math.floor(betAmount / 2)
        },
        immediateResult: false
      };
    }
    
    // No dealer Ace - check for immediate blackjack scenarios
    const playerBlackjack = isBlackjack(playerCards);
    const dealerBlackjack = isBlackjack(dealerCards);
    
    // Handle immediate blackjack scenarios (only when dealer doesn't show Ace)
    if (playerBlackjack || dealerBlackjack) {
      let result, payout, profit;
      
      if (playerBlackjack && dealerBlackjack) {
        result = 'push';
        payout = betAmount; // Return bet
        profit = 0; // No profit or loss
      } else if (playerBlackjack && !dealerBlackjack) {
        result = 'blackjack';
        payout = Math.floor(betAmount * 2.5); // 3:2 payout
        profit = Math.floor(betAmount * 1.5); // 1.5x bet profit
      } else if (!playerBlackjack && dealerBlackjack) {
        result = 'dealer_blackjack';
        payout = 0;
        profit = -betAmount; // Loss
      } else {
        result = 'unknown';
        payout = 0;
        profit = -betAmount; // Loss
      }
      
      // Store the result data for the message handler to process
      this.immediateGameResult = {
        result,
        payout,
        profit,
        betAmount,
        playerValue: calculateHandValue(playerCards),
        dealerValue: calculateHandValue(dealerCards)
      };
      
      // Test logging
      testLogger.testLog('BACKEND', 'IMMEDIATE_BLACKJACK_RESULT', {
        result,
        payout,
        betAmount,
        playerValue: calculateHandValue(playerCards),
        dealerValue: calculateHandValue(dealerCards),
        playerHands: this.playerHands,
        dealerCards
      });
      
      return {
        success: true,
        gameState: {
          dealerCards: dealerCards, // Reveal both cards
          playerHands: this.playerHands,
          playerValues: this.playerValues,
          betAmount,
          gameStatus: GAME_STATES.FINISHED,
          result,
          payout,
          profit,
          playerValue: this.getCurrentPlayerValue(),
          dealerValue: calculateHandValue(dealerCards)
        },
        immediateResult: true
      };
    }
    
    // No dealer Ace and no immediate blackjacks - normal play
    return {
      success: true,
      gameState: {
        dealerCards: [dealerFaceUp, { suit: null, value: null, isHoleCard: true }], // Face-up card + hole card placeholder
        playerHands: this.playerHands,
        playerValues: this.playerValues,
        betAmount,
        gameStatus: GAME_STATES.PLAYING,
        canHit: true,
        canStand: true,
        canDoubleDown: true,
        canSurrender: true,
        canBuyInsurance: false,
        insuranceAmount: 0
      },
      immediateResult: false
    };
  }


  // Player hits  
  hit(frontendActiveIndex, handId = 'player-hand-0', target = 'player') {
    const newCard = this.dealCard();
    const currentCards = this.playerHands[frontendActiveIndex] || []; // Use the specific hand from frontend
    const newCards = [...currentCards, newCard];
    const handValue = calculateHandValue(newCards);
    const busted = handValue > 21;
    
    // Update the specific hand
    this.playerHands[frontendActiveIndex] = newCards;
    this.playerValues[frontendActiveIndex] = handValue;
    
    // Return hit result - bust automatically ends the hand
    return {
      success: true,
      newCard,
      cards: newCards,
      busted,
      gameStatus: GAME_STATES.PLAYING,
      result: busted ? 'lose' : null,
      payout: busted ? 0 : null,
      target: target,
      handIndex: frontendActiveIndex,
      playerHands: this.playerHands,
      totalHands: this.totalHands,
      handComplete: busted === true // Signal that this hand's play is finished if busted
    };
  }


  // Player stands - finish game
  async stand(userId, frontendActiveIndex) {
    // Use frontend's activeHandIndex to determine if this is the last hand
    const isLastHand = frontendActiveIndex >= this.totalHands - 1;
    
    if (isLastHand) {
      // All hands complete - play dealer
      const completeDealerCards = this.currentDealerCards || this.dealerCards;
      const workingDealerCards = [...completeDealerCards];
      
      // Dealer hits until 17 or higher
      while (calculateHandValue(workingDealerCards) < 17) {
        const dealerCard = this.dealCard();
        workingDealerCards.push(dealerCard);
      }
      
      // Calculate final result for current hand
      const betAmount = this.currentBets[frontendActiveIndex] || this.getCurrentBet();
      const result = this.calculateGameResult(this.playerHands[frontendActiveIndex], workingDealerCards, betAmount);
      
      // Update player balance
      await this.updatePlayerBalanceAfterGame(userId, result.payout, result.result, betAmount);
      
      // Send response as game finished with dealer cards
      return {
        success: true,
        actionType: 'dealerTurn',
        gameStatus: GAME_STATES.FINISHED,
        target: 'dealer',
        handIndex: 0,
        playerHands: this.playerHands,
        dealerCards: workingDealerCards,
        result: result.result,
        payout: result.payout,
        profit: result.profit,
        playerHands: this.playerHands,
        totalHands: this.totalHands
      };
    } else {
      // More hands to play - use frontend index to determine next hand
      const nextHandIndex = frontendActiveIndex + 1;
      const nextHandState = nextHandIndex === 1 ? GAME_STATES.PLAYING_HAND_2 : GAME_STATES.PLAYING_HAND_1;
      
      // Send response as if starting the next hand
      return {
        success: true,
        actionType: 'nextHand',
        gameStatus: nextHandState,
        target: 'player',
        playerHands: this.playerHands,
        totalHands: this.totalHands
      };
    }
  }

  // Double down - deal one card and double bet (frontend will handle stand logic)
  async doubleDown(userId, frontendActiveIndex, handId = 'player-hand-0') {
    // Use stored bet amount from the game instance
    const betAmount = this.currentBets[frontendActiveIndex] || this.getCurrentBet();
    
    // Validate stored bet amount
    if (!betAmount || typeof betAmount !== 'number' || betAmount <= 0) {
      return { success: false, error: 'Invalid bet amount for double down' };
    }
    
    // Validate user has enough balance and deduct double down amount
    const user = await DBUtils.getPlayerById(userId);
    
    if (!user || user.balance < betAmount) {
      return { success: false, error: 'Insufficient balance to double down' };
    }
    
    // Deduct additional bet amount for double down
    logger.logInfo('Double down balance update', { userId, currentBalance: user.balance, betAmount, newBalance: user.balance - betAmount });
    
    const updatedPlayer = await DBUtils.debitPlayerAccount(userId, betAmount, 'double_down', { 
      doubleDownAmount: betAmount,
      originalBet: betAmount
    });
    
    // Log double down activity separately
    await DBUtils.logPlayerActivity(userId, user.username, 'double_down', {
      debit: betAmount,
      balance: updatedPlayer.balance,
      totalBetAmount: betAmount * 2
    });
    
    // Deal one card to player
    const newCard = this.dealCard();
    const currentCards = this.playerHands[frontendActiveIndex] || []; // Use the specific hand from frontend
    const newPlayerCards = [...currentCards, newCard];
    const playerHandValue = calculateHandValue(newPlayerCards);
    const playerBusted = playerHandValue > 21;
    
    // Update the specific hand with the new card and double the bet
    this.playerHands[frontendActiveIndex] = newPlayerCards;
    this.playerValues[frontendActiveIndex] = playerHandValue;
    this.currentBets[frontendActiveIndex] = betAmount * 2;
    
    // DoubleDown automatically ends the hand - return completion signal
    return {
      success: true,
      target: 'player',
      handIndex: frontendActiveIndex,
      newCard,
      cards: newPlayerCards,
      busted: playerBusted,
      gameStatus: GAME_STATES.DOUBLEDOWN_PROCESSING,
      result: playerBusted ? 'lose' : null,
      payout: playerBusted ? 0 : null,
      targetHandId: handId,
      playerHands: this.playerHands,
      totalHands: this.totalHands,
      currentBets: this.currentBets,
      betAmount: betAmount * 2,
      handComplete: true // Signal that this hand's play is finished
    };
  }


  // Handle insurance decision
  async handleInsurance(userId, buyInsurance) {
    // Get the active hand for insurance calculation
    const playerCards = this.getCurrentPlayerHand();
    // Use stored bet amount from the game instance
    const betAmount = this.getCurrentBet();
    const insuranceAmount = Math.floor(betAmount / 2);
    
    if (buyInsurance) {
      // Validate user has enough balance
      const user = await DBUtils.getPlayerById(userId);
      
      if (!user || user.balance < insuranceAmount) {
        return { success: false, error: 'Insufficient balance to buy insurance' };
      }
      
      // Deduct insurance amount
      const updatedPlayer = await DBUtils.debitPlayerAccount(userId, insuranceAmount, 'insurance', { 
        insuranceAmount,
        originalBet: betAmount
      });
      
      // Log insurance activity separately
      await DBUtils.logPlayerActivity(userId, user.username, 'insurance', {
        debit: insuranceAmount,
        balance: updatedPlayer.balance,
        insuranceAmount
      });
    }
    
    // Check if dealer has blackjack (using stored complete dealer hand)
    const completeDealerCards = this.currentDealerCards || this.dealerCards;
    const dealerBlackjack = isBlackjack(completeDealerCards);
    
    if (dealerBlackjack) {
      let insurancePayout = 0;
      let finalPlayer;
      
      if (buyInsurance) {
        // Insurance pays 2:1 - this is a WIN on insurance
        insurancePayout = insuranceAmount * 2;
        
        // Update balance with insurance WIN
        const insuranceWinPlayer = await DBUtils.creditPlayerAccount(userId, insurancePayout, 'insurance_win', {
          insuranceWin: insurancePayout,
          originalInsurance: insuranceAmount
        });
        
        // Log insurance WIN activity
        await DBUtils.logPlayerActivity(userId, user.username, 'insurance_win', {
          credit: insurancePayout,
          balance: insuranceWinPlayer.balance,
          winAmount: insurancePayout
        });
        
        finalPlayer = insuranceWinPlayer;
      } else {
        finalPlayer = await DBUtils.getPlayerById(userId);
      }
      
      // Now handle main bet separately - dealer has blackjack
      const playerBlackjack = isBlackjack(playerCards);
      const gameResult = playerBlackjack ? 'push' : 'dealer_blackjack';
      const mainBetPayout = playerBlackjack ? betAmount : 0; // Push returns bet, lose returns 0
      
      // Update balance for main bet result
      const transactionType = `hand_${gameResult === 'dealer_blackjack' ? 'lose' : gameResult}`;
      if (mainBetPayout > 0) {
        finalPlayer = await DBUtils.creditPlayerAccount(userId, mainBetPayout, transactionType, {
          result: gameResult,
          payout: mainBetPayout,
          originalBet: betAmount
        });
      }
      
      // Log main bet result activity
      await DBUtils.logPlayerActivity(userId, finalPlayer.username, transactionType, {
        credit: mainBetPayout,
        balance: finalPlayer.balance,
        winAmount: mainBetPayout
      });
      
      return {
        success: true,
        dealerBlackjack: true,
        insuranceWon: buyInsurance,
        insurancePayout,
        gameResult,
        mainBetPayout,
        dealerCards: completeDealerCards,
        gameStatus: GAME_STATES.FINISHED,
        result: gameResult,
        payout: insurancePayout + mainBetPayout,
        playerHands: this.playerHands
      };
    } else {
      // No dealer blackjack
      if (buyInsurance) {
        // Insurance lost - this is a LOSS on insurance (0 payout)
        const user = await DBUtils.getPlayerById(userId);
        await DBUtils.logPlayerActivity(userId, user.username, 'insurance_lose', {
          credit: 0,
          balance: user.balance,
          winAmount: 0
        });
      }
      
      return {
        success: true,
        dealerBlackjack: false,
        insuranceWon: false,
        insurancePayout: 0,
        gameStatus: this.totalHands === 1 ? GAME_STATES.PLAYING : GAME_STATES.PLAYING_HAND_1,
        playerHands: this.playerHands,
        dealerCards: [this.dealerCards[0], { suit: null, value: null, isHoleCard: true }]
      };
    }
  }
  
  // Surrender
  async surrender(userId) {
    // Use stored bet amount from the game instance
    const betAmount = this.getCurrentBet();
    
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

  // Split hand - create two hands from pair
  async split(userId, playerHands, activeHandIndex, currentBet) {
    // Get the active hand to split
    const playerCards = playerHands[activeHandIndex];
    
    // Validate split conditions
    if (!playerCards || playerCards.length !== 2) {
      return { success: false, error: 'Can only split with exactly 2 cards' };
    }
    
    if (playerCards[0].value !== playerCards[1].value) {
      return { success: false, error: 'Can only split cards of the same value' };
    }
    
    const betAmount = this.getCurrentBet() || currentBet;
    
    // Validate user has enough balance for second bet
    const user = await DBUtils.getPlayerById(userId);
    if (!user || user.balance < betAmount) {
      return { success: false, error: 'Insufficient balance to split hand' };
    }
    
    // Deduct additional bet amount for second hand
    const updatedPlayer = await DBUtils.debitPlayerAccount(userId, betAmount, 'split_bet', { 
      splitAmount: betAmount,
      originalBet: betAmount
    });
    
    // Log split activity
    await DBUtils.logPlayerActivity(userId, user.username, 'split_bet', {
      debit: betAmount,
      balance: updatedPlayer.balance,
      totalBetAmount: betAmount * 2
    });
    
    // Create two hands from the split - only first cards for now
    const hand1 = [playerCards[0]]; // Just first card
    const hand2 = [playerCards[1]]; // Just second card
    
    // Store the complete hands for later (with second cards)
    const completeHand1 = [playerCards[0], this.dealCard()];
    const completeHand2 = [playerCards[1], this.dealCard()];
    
    // Update multi-hand state with complete hands (for internal tracking)
    this.playerHands = [completeHand1, completeHand2];
    this.playerValues = [calculateHandValue(completeHand1), calculateHandValue(completeHand2)];
    this.currentBets = [betAmount, betAmount];
    this.totalHands = 2;
    this.activeHandIndex = 0; // Start with first hand
    
    return {
      success: true,
      gameStatus: GAME_STATES.PLAYING_HAND_1,
      target: 'player',
      handIndex: this.activeHandIndex,
      playerHands: [hand1, hand2], // Send only first cards to trigger animation
      playerValues: [calculateHandValue(hand1), calculateHandValue(hand2)],
      currentBets: this.currentBets,
      totalHands: 2,
      dealerCards: this.dealerCards // Keep existing dealer cards
    };
  }

  // Deal second cards to split hands
  async splitDeal(userId) {
    // Return the complete hands that were stored during split
    return {
      success: true,
      gameStatus: GAME_STATES.PLAYING_HAND_1,
      target: 'player',
      handIndex: this.activeHandIndex,
      playerHands: this.playerHands, // Complete hands with second cards
      playerValues: this.playerValues,
      currentBets: this.currentBets,
      totalHands: 2,
      dealerCards: this.dealerCards
    };
  }


  // Start game (placeholder - game starts with placeBet)
  startGame(userId) {
    return { success: true, message: 'Place a bet to start playing' };
  }



  // Calculate game result for single player
  calculateGameResult(playerCards, dealerCards, betAmount) {
    const playerValue = calculateHandValue(playerCards);
    const dealerValue = calculateHandValue(dealerCards);
    const playerBusted = playerValue > 21;
    const dealerBusted = dealerValue > 21;
    const playerBlackjack = isBlackjack(playerCards);
    const dealerBlackjack = isBlackjack(dealerCards);

    let result = 'lose';
    let totalPayout = 0;
    let profit = 0;

    if (playerBusted) {
      result = 'lose';
      totalPayout = 0;
      profit = -betAmount; // Loss
    } else if (playerBlackjack && !dealerBlackjack) {
      result = 'blackjack';
      totalPayout = Math.floor(betAmount * 2.5); // Bet + 1.5x bet
      profit = Math.floor(betAmount * 1.5); // 1.5x bet profit
    } else if (dealerBusted) {
      result = 'win';
      totalPayout = betAmount * 2; // Bet + bet
      profit = betAmount; // 1x bet profit
    } else if (playerValue > dealerValue) {
      result = 'win';
      totalPayout = betAmount * 2;
      profit = betAmount; // 1x bet profit
    } else if (playerValue === dealerValue) {
      result = 'push';
      totalPayout = betAmount; // Return bet only
      profit = 0; // No profit or loss
    } else {
      result = 'lose';
      totalPayout = 0;
      profit = -betAmount; // Loss
    }

    return {
      result,
      playerValue,
      dealerValue,
      payout: totalPayout, // Total amount returned (for balance updates)
      profit: profit, // Profit/loss amount (for frontend display)
      payoutMultiplier: totalPayout / betAmount
    };
  }



  // Update player balance after game
  async updatePlayerBalanceAfterGame(userId, payout, result, betAmount) {
    try {
      // Get current balance
      const user = await DBUtils.getPlayerById(userId);
      
      if (!user) {
        logger.logError(new Error('User not found for balance update'), { userId });
        return;
      }
      
      const newBalance = user.balance + payout;
      
      // Use consistent transaction type based on result
      const transactionType = `hand_${result === 'dealer_blackjack' ? 'lose' : result}`;
      
      // Update database balance
      const finalPlayer = payout > 0 ? 
        await DBUtils.creditPlayerAccount(userId, payout, transactionType, { 
          result, 
          payout, 
          originalBet: betAmount 
        }) : user;
      
      // Log activity with consistent type
      await DBUtils.logPlayerActivity(userId, user.username, transactionType, {
        credit: payout,
        balance: finalPlayer.balance,
        winAmount: payout // This will be 0 for losses, >0 for wins
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

// Unified player action handler
async function onPlayerAction(ws, data, userId) {
  logger.logGameEvent('player_action', null, { userId, actionType: data.type, data });
  
  try {
    let blackjack;
    let result;
    
    switch (data.type) {
      case 'bet':
        // Create new game instance for new game
        blackjack = new Blackjack();
        activeGames.set(userId, blackjack);
        
        // Get current user and debit balance
        const user = await DBUtils.getPlayerById(userId);
        
        if (!user) {
          result = { success: false, errorMessage: t.userNotFound };
          break;
        }
        
        // Check if user has enough balance
        if (user.balance < data.betAmount) {
          result = { success: false, errorMessage: t.insufficientBalance };
          break;
        }
        
        // Debit user balance
        const updatedPlayer = await DBUtils.debitPlayerAccount(userId, data.betAmount, 'bet_placed', { betAmount: data.betAmount });
        
        // Log activity to database
        await DBUtils.logPlayerActivity(userId, user.username, 'bet_placed', {
          debit: data.betAmount,
          balance: updatedPlayer.balance
        });
        
        // Start new blackjack game with the stored instance
        const gameResult = blackjack.startNewGame(userId, data.betAmount);
        
        if (gameResult.immediateResult) {
          // Update player balance for immediate result
          const transactionType = `hand_${gameResult.gameState.result}`;
          
          const finalPlayer = await DBUtils.creditPlayerAccount(userId, gameResult.gameState.payout, transactionType, {
            result: gameResult.gameState.result,
            payout: gameResult.gameState.payout,
            originalBet: data.betAmount
          });
          
          await DBUtils.logPlayerActivity(userId, user.username, transactionType, {
            credit: gameResult.gameState.payout,
            balance: finalPlayer.balance,
            winAmount: gameResult.gameState.payout
          });
          
          result = {
            success: true,
            immediateResult: true,
            gameStatus: GAME_STATES.FINISHED,
            playerHands: gameResult.gameState.playerHands,
            dealerCards: gameResult.gameState.dealerCards,
            playerValue: gameResult.gameState.playerValue,
            dealerValue: gameResult.gameState.dealerValue,
            result: gameResult.gameState.result,
            payout: gameResult.gameState.payout,
            profit: gameResult.gameState.profit,
            betAmount: data.betAmount,
            newBalance: finalPlayer.balance
          };
          
          // Test logging
          testLogger.testLog('BACKEND', 'BET_IMMEDIATE_RESULT', result);
        } else {
          result = {
            success: true,
            immediateResult: false,
            gameStatus: gameResult.gameState.gameStatus,
            playerHands: gameResult.gameState.playerHands,
            dealerCards: gameResult.gameState.dealerCards,
            playerValue: calculateHandValue(gameResult.gameState.playerHands[0]),
            dealerValue: calculateHandValue(gameResult.gameState.dealerCards),
            betAmount: data.betAmount,
            newBalance: updatedPlayer.balance
          };
        }
        break;
      case 'hit':
        blackjack = activeGames.get(userId);
        if (!blackjack) {
          result = { success: false, errorMessage: 'No active game found. Please start a new game.' };
          break;
        }
        if (data.target === 'player') {
          result = blackjack.hit(data.handIndex, data.handIndex, data.target);
        }
        break;
      case 'stand':
        blackjack = activeGames.get(userId);
        if (!blackjack) {
          result = { success: false, errorMessage: 'No active game found. Please start a new game.' };
          break;
        }
        if (data.target === 'player') {
          result = await blackjack.stand(userId, data.handIndex);
        }
        break;
      case 'doubleDown':
        blackjack = activeGames.get(userId);
        if (!blackjack) {
          result = { success: false, errorMessage: 'No active game found. Please start a new game.' };
          break;
        }
        logger.logInfo('Double down call params', { userId, target: data.target, handIndex: data.handIndex });
        if (data.target === 'player') {
          result = await blackjack.doubleDown(userId, data.handIndex, data.handIndex);
        }
        break;
      case 'split':
        blackjack = activeGames.get(userId);
        if (!blackjack) {
          result = { success: false, errorMessage: 'No active game found. Please start a new game.' };
          break;
        }
        result = await blackjack.split(userId, data.playerHands, data.activeHandIndex, data.currentBet);
        break;
      case 'splitDeal':
        blackjack = activeGames.get(userId);
        if (!blackjack) {
          result = { success: false, errorMessage: 'No active game found. Please start a new game.' };
          break;
        }
        result = await blackjack.splitDeal(userId);
        break;
      case 'insurance':
        blackjack = activeGames.get(userId);
        if (!blackjack) {
          result = { success: false, errorMessage: 'No active game found. Please start a new game.' };
          break;
        }
        result = await blackjack.handleInsurance(userId, data.buy);
        break;
      case 'surrender':
        blackjack = activeGames.get(userId);
        if (!blackjack) {
          result = { success: false, errorMessage: 'No active game found. Please start a new game.' };
          break;
        }
        result = await blackjack.surrender(userId);
        break;
      case 'newGame':
        activeGames.delete(userId);
        blackjack = new Blackjack();
        activeGames.set(userId, blackjack);
        result = blackjack.startGame(userId);
        break;
      default:
        result = { success: false, errorMessage: `Unknown action type: ${data.type}` };
    }
    
    // Transform result to unified format with proper card handling
    const response = {
      type: 'actionResult',
      data: {
        success: result.success,
        actionType: result.actionType || data.type,
        gameStatus: result.gameStatus,
        playerValue: result.playerValue,
        dealerValue: result.dealerValue,
        playerHands: result.playerHands,
        dealerCards: result.dealerCards,
        result: result.result,
        payout: result.profit || result.payout, // Send profit for frontend display
        betAmount: result.betAmount || data.betAmount,
        // Only send activeHandIndex when it's explicitly provided (hand transitions)
        // Handle split-specific data
        ...(result.playerHands ? { 
          playerHands: result.playerHands,
          playerValues: result.playerValues,
          currentBets: result.currentBets,
          totalHands: result.totalHands,
        } : {}),
        // Handle hand completion flag
        ...(result.handComplete ? { handComplete: true } : {})
      }
    };
    
    sendMessage(userId, 'blackJackChannel', response.data);
  } catch (error) {
    logger.logError(error, { userId, actionType: data.type, action: 'player_action' });
    sendMessage(userId, 'blackJackChannel', {
      success: false,
      actionType: data.type,
      errorMessage: t.serverError
    });
  }
}

// Blackjack-specific message handlers
const blackjackMessages = {
  // ALL game actions unified
  'playerAction': onPlayerAction
};

module.exports = { Blackjack, blackjackMessages };