const BettingUtils = require('../../shared/utils/BettingUtils');
const DBUtils = require('../../shared/utils/DBUtils');
const logger = require('../../shared/utils/logger');
const testLogger = require('../../shared/testLogger');
const crypto = require('crypto');
const { text: t } = require('../../shared/text');

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
  
  // Compatibility layer - maintains existing API for single-hand access
  get playerCards() { return this.playerHands[this.activeHandIndex] || []; }
  set playerCards(cards) { 
    this.playerHands[this.activeHandIndex] = cards;
    this.playerValues[this.activeHandIndex] = this.calculateHandValue(cards);
  }
  
  get playerValue() { return this.playerValues[this.activeHandIndex] || 0; }
  set playerValue(value) { this.playerValues[this.activeHandIndex] = value; }
  
  get currentBet() { return this.currentBets[this.activeHandIndex] || 0; }
  set currentBet(bet) { this.currentBets[this.activeHandIndex] = bet; }
  
  // Helper functions for multi-hand state management
  updateActiveHand(cards, value) {
    this.playerHands[this.activeHandIndex] = cards;
    this.playerValues[this.activeHandIndex] = value;
  }
  
  updateActiveHandCards(cards) {
    this.playerHands[this.activeHandIndex] = cards;
    this.playerValues[this.activeHandIndex] = this.calculateHandValue(cards);
  }
  
  updateActiveHandValue(value) {
    this.playerValues[this.activeHandIndex] = value;
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
    
    
    return selectedCard;
  }

  // Calculate the value of a hand
  calculateHandValue(cards) {
    let value = 0;
    let aces = 0;

    for (const card of cards) {
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

  // Calculate visible hand value (for display purposes)
  calculateVisibleHandValue(cards) {
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

  // Check if initial 2-card hand is blackjack (only for initial deal)
  isBlackjack(cards) {
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
    
    const playerCards = [this.dealCard(), this.dealCard()];
    
    // Store cards in new structure
    this.dealerCards = dealerCards;
    this.currentDealerCards = dealerCards;
    this.playerCards = playerCards; // Uses setter to update both hands and values
    
    // Check for insurance opportunity first (dealer shows Ace)
    const canBuyInsurance = dealerFaceUp.value === 'A';
    
    // If dealer shows Ace, always offer insurance first
    if (canBuyInsurance) {
      return {
        success: true,
        gameState: {
          dealerCards: [dealerFaceUp, { suit: null, value: null, isHoleCard: true }], // Face-up card + hole card placeholder
          playerCards: this.playerCards,
          playerHands: this.playerHands,
          playerValues: this.playerValues,
          betAmount,
          gameStatus: 'insurance_offered',
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
    const playerBlackjack = this.isBlackjack(playerCards);
    const dealerBlackjack = this.isBlackjack(dealerCards);
    
    // Handle immediate blackjack scenarios (only when dealer doesn't show Ace)
    if (playerBlackjack || dealerBlackjack) {
      let result, payout;
      
      if (playerBlackjack && dealerBlackjack) {
        result = 'push';
        payout = betAmount; // Return bet
      } else if (playerBlackjack && !dealerBlackjack) {
        result = 'blackjack';
        payout = Math.floor(betAmount * 2.5); // 3:2 payout
      } else if (!playerBlackjack && dealerBlackjack) {
        result = 'dealer_blackjack';
        payout = 0;
      } else {
        result = 'unknown';
        payout = 0;
      }
      
      // Store the result data for the message handler to process
      this.immediateGameResult = {
        result,
        payout,
        betAmount,
        playerValue: this.calculateHandValue(playerCards),
        dealerValue: this.calculateHandValue(dealerCards)
      };
      
      // Test logging
      testLogger.testLog('BACKEND', 'IMMEDIATE_BLACKJACK_RESULT', {
        result,
        payout,
        betAmount,
        playerValue: this.calculateHandValue(playerCards),
        dealerValue: this.calculateHandValue(dealerCards),
        playerCards,
        dealerCards
      });
      
      return {
        success: true,
        gameState: {
          dealerCards: dealerCards, // Reveal both cards
          playerCards: this.playerCards,
          playerHands: this.playerHands,
          playerValues: this.playerValues,
          betAmount,
          gameStatus: 'finished',
          result,
          payout,
          playerValue: this.playerValue,
          dealerValue: this.calculateHandValue(dealerCards)
        },
        immediateResult: true
      };
    }
    
    // No dealer Ace and no immediate blackjacks - normal play
    return {
      success: true,
      gameState: {
        dealerCards: [dealerFaceUp, { suit: null, value: null, isHoleCard: true }], // Face-up card + hole card placeholder
        playerCards: this.playerCards,
        playerHands: this.playerHands,
        playerValues: this.playerValues,
        betAmount,
        gameStatus: 'playing',
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
  hit(playerCards, handId = 'player-hand-0') {
    const newCard = this.dealCard();
    const newCards = [...playerCards, newCard];
    const handValue = this.calculateHandValue(newCards);
    const busted = handValue > 21;
    
    // Update the active hand state
    this.updateActiveHandCards(newCards);
    
    return {
      success: true,
      newCard,
      cards: newCards,
      busted,
      gameStatus: busted ? 'finished' : 'playing',
      result: busted ? 'lose' : null,
      payout: busted ? 0 : null,
      targetHandId: handId
    };
  }


  // Player stands - finish game
  async stand(userId, playerCards, dealerCards) {
    // Use stored bet amount from the game instance
    const betAmount = this.currentBet;
    
    // Update the active hand state
    this.updateActiveHandCards(playerCards);
    // Use the complete dealer hand stored during initial deal
    const completeDealerCards = this.currentDealerCards || dealerCards;
    
    // Continue with dealer hits until 17 or higher
    const workingDealerCards = [...completeDealerCards];
    while (this.calculateHandValue(workingDealerCards) < 17) {
      const newCard = this.dealCard();
      workingDealerCards.push(newCard);
    }
    
    // Calculate final result
    const result = this.calculateGameResult(playerCards, workingDealerCards, betAmount);
    
    // Update player balance
    await this.updatePlayerBalanceAfterGame(userId, result.payout, result.result, betAmount);
    
    return {
      success: true,
      gameStatus: 'finished',
      playerCards: playerCards,
      dealerCards: workingDealerCards,
      result: result.result,
      payout: result.payout,
    };
  }

  // Double down - deal one card to player, then immediately play dealer hand
  async doubleDown(userId, playerCards, dealerCards, handId = 'player-hand-0') {
    // Use stored bet amount from the game instance
    const betAmount = this.currentBet;
    
    // Update the active hand state
    this.updateActiveHandCards(playerCards);
    
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
    const newPlayerCards = [...playerCards, newCard];
    const playerHandValue = this.calculateHandValue(newPlayerCards);
    const playerBusted = playerHandValue > 21;
    
    // If player busted, game ends immediately
    if (playerBusted) {
      await this.updatePlayerBalanceAfterGame(userId, 0, 'lose', betAmount * 2);
      return {
        success: true,
        gameStatus: 'finished',
        playerCards: newPlayerCards,
        dealerCards: this.currentDealerCards || dealerCards,
        result: 'lose',
        payout: 0,
        betAmount: betAmount * 2
      };
    }
    
    // Player didn't bust - play dealer hand immediately
    const completeDealerCards = this.currentDealerCards || dealerCards;
    const workingDealerCards = [...completeDealerCards];
    
    // Dealer hits until 17 or higher
    while (this.calculateHandValue(workingDealerCards) < 17) {
      const dealerCard = this.dealCard();
      workingDealerCards.push(dealerCard);
    }
    
    // Calculate final result with doubled bet
    const result = this.calculateGameResult(newPlayerCards, workingDealerCards, betAmount * 2);
    
    // Update player balance with final result
    await this.updatePlayerBalanceAfterGame(userId, result.payout, result.result, betAmount * 2);
    
    return {
      success: true,
      gameStatus: 'finished',
      playerCards: newPlayerCards,
      dealerCards: workingDealerCards,
      result: result.result,
      payout: result.payout,
      betAmount: betAmount * 2
    };
  }


  // Buy insurance
  async buyInsurance(userId, playerCards, dealerCards, insuranceAmount) {
    // Use stored bet amount from the game instance
    const betAmount = this.currentBet;
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
    
    // Check if dealer has blackjack (using stored complete dealer hand)
    const completeDealerCards = this.currentDealerCards || dealerCards;
    const dealerBlackjack = this.isBlackjack(completeDealerCards);
    
    if (dealerBlackjack) {
      // Insurance pays 2:1 - this is a WIN on insurance
      const insurancePayout = insuranceAmount * 2;
      const balanceAfterInsuranceWin = newBalance + insurancePayout;
      
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
      
      // Now handle main bet separately - dealer has blackjack
      const playerBlackjack = this.isBlackjack(playerCards);
      const gameResult = playerBlackjack ? 'push' : 'dealer_blackjack';
      const mainBetPayout = playerBlackjack ? betAmount : 0; // Push returns bet, lose returns 0
      
      // Update balance for main bet result
      const transactionType = `hand_${gameResult === 'dealer_blackjack' ? 'lose' : gameResult}`;
      const finalPlayer = mainBetPayout > 0 ? 
        await DBUtils.creditPlayerAccount(userId, mainBetPayout, transactionType, {
          result: gameResult,
          payout: mainBetPayout,
          originalBet: betAmount
        }) : insuranceWinPlayer;
      
      // Log main bet result activity
      await DBUtils.logPlayerActivity(userId, user.username, transactionType, {
        credit: mainBetPayout,
        balance: finalPlayer.balance,
        winAmount: mainBetPayout
      });
      
      return {
        success: true,
        dealerBlackjack: true,
        insuranceWon: true,
        insurancePayout,
        gameResult,
        mainBetPayout,
        dealerCards: completeDealerCards,
        gameStatus: 'finished',
        result: gameResult,
        totalPayout: insurancePayout + mainBetPayout
      };
    } else {
      // Insurance lost - this is a LOSS on insurance (0 payout)
      // Log insurance LOSS activity with 0 win amount
      await DBUtils.logPlayerActivity(userId, user.username, 'insurance_lose', {
        credit: 0,
        balance: updatedPlayer.balance,
        winAmount: 0
      });
      
      return {
        success: true,
        dealerBlackjack: false,
        insuranceWon: false,
        insurancePayout: 0,
        gameStatus: 'playing'
      };
    }
  }
  
  // Surrender
  async surrender(userId) {
    // Use stored bet amount from the game instance
    const betAmount = this.currentBet;
    
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

  // Skip insurance
  async skipInsurance(userId, playerCards, dealerCards) {
    // Use stored bet amount from the game instance
    const betAmount = this.currentBet;
    // Use the stored complete dealer hand to check for blackjack
    const completeDealerCards = this.currentDealerCards || dealerCards;
    const dealerBlackjack = this.isBlackjack(completeDealerCards);
    
    if (dealerBlackjack) {
      const playerBlackjack = this.isBlackjack(playerCards);
      const gameResult = playerBlackjack ? 'push' : 'dealer_blackjack';
      const mainBetPayout = playerBlackjack ? betAmount : 0;
      
      // Update player balance for main bet result
      if (mainBetPayout > 0) {
        const transactionType = `hand_${gameResult === 'dealer_blackjack' ? 'lose' : gameResult}`;
        await DBUtils.creditPlayerAccount(userId, mainBetPayout, transactionType, {
          result: gameResult,
          payout: mainBetPayout,
          originalBet: betAmount
        });
        
        // Log activity
        await DBUtils.logPlayerActivity(userId, user.username, transactionType, {
          credit: mainBetPayout,
          balance: finalPlayer.balance,
          winAmount: mainBetPayout
        });
      } else {
        // Log loss with 0 payout
        const user = await DBUtils.getPlayerById(userId);
        const transactionType = `hand_${gameResult === 'dealer_blackjack' ? 'lose' : gameResult}`;
        await DBUtils.logPlayerActivity(userId, user.username, transactionType, {
          credit: 0,
          balance: user.balance,
          winAmount: 0
        });
      }
      
      return {
        success: true,
        dealerBlackjack: true,
        gameStatus: 'finished',
        result: gameResult,
        payout: mainBetPayout,
        dealerCards: completeDealerCards,
        playerCards: playerCards
      };
    } else {
      return {
        success: true,
        dealerBlackjack: false,
        gameStatus: 'playing',
        playerCards: playerCards,
        dealerCards: dealerCards
      };
    }
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
            gameStatus: 'finished',
            playerCards: gameResult.gameState.playerCards,
            dealerCards: gameResult.gameState.dealerCards,
            playerValue: gameResult.gameState.playerValue,
            dealerValue: gameResult.gameState.dealerValue,
            result: gameResult.gameState.result,
            payout: gameResult.gameState.payout,
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
            playerCards: gameResult.gameState.playerCards,
            dealerCards: gameResult.gameState.dealerCards,
            playerValue: blackjack.calculateHandValue(gameResult.gameState.playerCards),
            dealerValue: blackjack.calculateHandValue(gameResult.gameState.dealerCards),
            betAmount: data.betAmount,
            newBalance: updatedPlayer.balance
          };
        }
        break;
      case 'hit':
      case 'stand':
      case 'doubleDown':
      case 'buyInsurance':
      case 'surrender':
      case 'newGame':
      case 'skipInsurance':
        // Get existing game instance for all other actions
        blackjack = activeGames.get(userId);
        if (!blackjack) {
          result = { success: false, errorMessage: 'No active game found. Please start a new game.' };
          break;
        }
        
        // Execute the action
        switch (data.type) {
          case 'hit':
            result = blackjack.hit(data.playerCards, data.handId);
            break;
          case 'stand':
            result = await blackjack.stand(userId, data.playerCards, data.dealerCards);
            break;
          case 'doubleDown':
            logger.logInfo('Double down call params', { userId, playerCards: data.playerCards, dealerCards: data.dealerCards, handId: data.handId });
            result = await blackjack.doubleDown(userId, data.playerCards, data.dealerCards, data.handId);
            break;
          case 'buyInsurance':
            result = await blackjack.buyInsurance(userId, data.playerCards, data.dealerCards, data.insuranceAmount);
            break;
          case 'surrender':
            result = await blackjack.surrender(userId);
            break;
          case 'newGame':
            // Clear current game and create new one
            activeGames.delete(userId);
            blackjack = new Blackjack();
            activeGames.set(userId, blackjack);
            result = blackjack.startGame(userId);
            break;
          case 'skipInsurance':
            result = await blackjack.skipInsurance(userId, data.playerCards, data.dealerCards);
            break;
        }
        break;
      default:
        result = { success: false, errorMessage: `Unknown action type: ${data.type}` };
    }
    
    // Transform result to unified format with proper card handling
    const response = {
      type: 'actionResult',
      data: {
        success: result.success,
        actionType: data.type,
        gameStatus: result.gameStatus,
        playerValue: result.playerValue,
        dealerValue: result.dealerValue,
        playerCards: result.playerCards || result.cards,
        dealerCards: result.dealerCards,
        result: result.result,
        payout: result.payout,
        betAmount: result.betAmount || data.betAmount,
        // Handle double down completion flag
        ...(result.doubleDownComplete ? { doubleDownComplete: true } : {})
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