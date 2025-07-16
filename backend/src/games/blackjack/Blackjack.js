const BettingUtils = require('../../shared/utils/BettingUtils');
const { updatePlayerBalance } = require('../../shared/utils');
const logger = require('../../shared/utils/logger');
const crypto = require('crypto');
const { text: t } = require('../../shared/text');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Game instance manager - stores active game instances by userId
const activeGames = new Map();
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
    const dealerFaceUp = this.dealCard();
    const dealerHoleCard = this.dealCard();
    const dealerCards = [dealerFaceUp, dealerHoleCard];
    
    const playerCards = [this.dealCard(), this.dealCard()];
    
    // Check for blackjacks
    const playerBlackjack = this.isBlackjack(playerCards);
    const dealerBlackjack = this.isBlackjack(dealerCards);
    
    // Store complete dealer hand for later use
    this.currentDealerCards = dealerCards;
    
    // Handle immediate blackjack scenarios
    if (playerBlackjack || dealerBlackjack) {
      let result, payout;
      
      if (playerBlackjack && dealerBlackjack) {
        result = 'push';
        payout = betAmount; // Return bet
      } else if (playerBlackjack && !dealerBlackjack) {
        result = 'blackjack';
        payout = Math.floor(betAmount * 2.5); // 3:2 payout
      } else if (!playerBlackjack && dealerBlackjack) {
        result = 'lose';
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
      
      return {
        success: true,
        gameState: {
          dealerCards: dealerCards, // Reveal both cards
          playerCards,
          betAmount,
          gameStatus: 'finished',
          result,
          payout,
          playerValue: this.calculateHandValue(playerCards),
          dealerValue: this.calculateHandValue(dealerCards)
        },
        immediateResult: true
      };
    }
    
    // No blackjacks - check for insurance opportunity
    const canBuyInsurance = dealerFaceUp.value === 'A';
    
    return {
      success: true,
      gameState: {
        dealerCards: [dealerFaceUp], // Only show face-up card
        playerCards,
        betAmount,
        gameStatus: canBuyInsurance ? 'insurance_offered' : 'playing',
        canHit: !canBuyInsurance,
        canStand: !canBuyInsurance,
        canDoubleDown: !canBuyInsurance,
        canSurrender: !canBuyInsurance,
        canBuyInsurance,
        insuranceAmount: Math.floor(betAmount / 2)
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
    
    return {
      success: true,
      newCard,
      cards: newCards,
      handValue,
      busted,
      gameStatus: busted ? 'finished' : 'playing',
      result: busted ? 'lose' : null,
      targetHandId: handId
    };
  }


  // Player stands - finish game
  async stand(userId, playerCards, dealerCards, betAmount) {
    // Use the complete dealer hand stored during initial deal
    const completeDealerCards = this.currentDealerCards || dealerCards;
    
    // Build dealer hit sequence - dealer hits until 17 or higher
    const dealerHitSequence = [];
    
    // First card in sequence is the hole card reveal
    dealerHitSequence.push({
      card: completeDealerCards[1], // The pre-drawn hole card
      action: 'reveal',
      targetHandId: 'dealer-hand'
    });
    
    // Continue with dealer hits until 17 or higher
    const workingDealerCards = [...completeDealerCards];
    while (this.calculateHandValue(workingDealerCards) < 17) {
      const newCard = this.dealCard();
      workingDealerCards.push(newCard);
      dealerHitSequence.push({
        card: newCard,
        action: 'deal',
        targetHandId: 'dealer-hand'
      });
    }
    
    // Calculate final result
    const result = this.calculateGameResult(playerCards, workingDealerCards, betAmount);
    
    // Update player balance
    await this.updatePlayerBalanceAfterGame(userId, result.payout, result.result, betAmount);
    
    return {
      success: true,
      gameStatus: 'finished',
      finalDealerCards: workingDealerCards,
      dealerHitSequence,
      playerCards: playerCards,
      dealerCards: workingDealerCards,
      playerValue: result.playerValue,
      dealerValue: result.dealerValue,
      result: result.result,
      payout: result.payout
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
    
    // Deduct additional bet amount for double down
    const newBalance = user.balance - betAmount;
    await updatePlayerBalance(userId, newBalance, 'double_down', { 
      doubleDownAmount: betAmount,
      originalBet: betAmount
    });
    
    // Log double down activity separately
    const { logActivity } = require('../../websocket/messages');
    await logActivity(userId, user.username, 'double_down', {
      debit: betAmount,
      balance: newBalance,
      totalBetAmount: betAmount * 2
    });
    
    // Deal one card to player
    const newCard = this.dealCard();
    const newCards = [...playerCards, newCard];
    const handValue = this.calculateHandValue(newCards);
    const busted = handValue > 21;
    
    // If player busted, game ends immediately
    if (busted) {
      await this.updatePlayerBalanceAfterGame(userId, 0, 'lose', betAmount * 2);
      return {
        success: true,
        newCard,
        cards: newCards,
        handValue,
        busted: true,
        gameStatus: 'finished',
        targetHandId: handId,
        gameResult: {
          result: 'lose',
          payout: 0,
          playerValue: handValue,
          dealerValue: this.calculateHandValue(this.currentDealerCards || dealerCards)
        }
      };
    }
    
    // Player didn't bust - now dealer plays
    // Use the complete dealer hand stored during initial deal
    const completeDealerCards = this.currentDealerCards || dealerCards;
    const dealerHitSequence = [];
    
    // First card in sequence is the hole card reveal
    dealerHitSequence.push({
      card: completeDealerCards[1], // The pre-drawn hole card
      action: 'reveal',
      targetHandId: 'dealer-hand'
    });
    
    // Continue with dealer hits until 17 or higher
    const workingDealerCards = [...completeDealerCards];
    while (this.calculateHandValue(workingDealerCards) < 17) {
      const dealerCard = this.dealCard();
      workingDealerCards.push(dealerCard);
      dealerHitSequence.push({
        card: dealerCard,
        action: 'deal',
        targetHandId: 'dealer-hand'
      });
    }
    
    // Calculate final result with doubled bet
    const result = this.calculateGameResult(newCards, workingDealerCards, betAmount * 2);
    
    // Update player balance with final result
    await this.updatePlayerBalanceAfterGame(userId, result.payout, result.result, betAmount * 2);
    
    return {
      success: true,
      newCard,
      cards: newCards,
      handValue,
      busted: false,
      targetHandId: handId,
      finalDealerCards: workingDealerCards,
      dealerHitSequence,
      gameResult: {
        result: result.result,
        payout: result.payout,
        playerValue: result.playerValue,
        dealerValue: result.dealerValue
      }
    };
  }

  // Buy insurance
  async buyInsurance(userId, playerCards, dealerCards, betAmount, insuranceAmount) {
    // Validate user has enough balance
    const user = await prisma.player.findUnique({
      where: { id: userId }
    });
    
    if (!user || user.balance < insuranceAmount) {
      return { success: false, error: 'Insufficient balance to buy insurance' };
    }
    
    // Deduct insurance amount
    const newBalance = user.balance - insuranceAmount;
    await updatePlayerBalance(userId, newBalance, 'insurance', { 
      insuranceAmount,
      originalBet: betAmount
    });
    
    // Log insurance activity separately
    const { logActivity } = require('../../websocket/messages');
    await logActivity(userId, user.username, 'insurance', {
      debit: insuranceAmount,
      balance: newBalance,
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
      await updatePlayerBalance(userId, balanceAfterInsuranceWin, 'insurance_win', {
        insuranceWin: insurancePayout,
        originalInsurance: insuranceAmount
      });
      
      // Log insurance WIN activity
      await logActivity(userId, user.username, 'insurance_win', {
        credit: insurancePayout,
        balance: balanceAfterInsuranceWin,
        winAmount: insurancePayout
      });
      
      // Now handle main bet separately - dealer has blackjack
      const playerBlackjack = this.isBlackjack(playerCards);
      const gameResult = playerBlackjack ? 'push' : 'lose';
      const mainBetPayout = playerBlackjack ? betAmount : 0; // Push returns bet, lose returns 0
      
      // Update balance for main bet result
      const absoluteFinalBalance = balanceAfterInsuranceWin + mainBetPayout;
      await updatePlayerBalance(userId, absoluteFinalBalance, `hand_${gameResult}`, {
        result: gameResult,
        payout: mainBetPayout,
        originalBet: betAmount
      });
      
      // Log main bet result activity
      await logActivity(userId, user.username, `hand_${gameResult}`, {
        credit: mainBetPayout,
        balance: absoluteFinalBalance,
        winAmount: mainBetPayout
      });
      
      return {
        success: true,
        dealerBlackjack: true,
        insuranceWon: true,
        insurancePayout,
        gameResult,
        mainBetPayout,
        finalDealerCards: completeDealerCards,
        gameStatus: 'finished',
        result: gameResult,
        totalPayout: insurancePayout + mainBetPayout
      };
    } else {
      // Insurance lost - this is a LOSS on insurance (0 payout)
      // Log insurance LOSS activity with 0 win amount
      await logActivity(userId, user.username, 'insurance_lose', {
        credit: 0,
        balance: newBalance,
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

  // Skip insurance
  async skipInsurance(userId, playerCards, dealerCards, betAmount) {
    // Use the stored complete dealer hand to check for blackjack
    const completeDealerCards = this.currentDealerCards || dealerCards;
    const dealerBlackjack = this.isBlackjack(completeDealerCards);
    
    if (dealerBlackjack) {
      const playerBlackjack = this.isBlackjack(playerCards);
      const gameResult = playerBlackjack ? 'push' : 'lose';
      const mainBetPayout = playerBlackjack ? betAmount : 0;
      
      // Update player balance for main bet result
      if (mainBetPayout > 0) {
        const user = await prisma.player.findUnique({ where: { id: userId } });
        const finalBalance = user.balance + mainBetPayout;
        await updatePlayerBalance(userId, finalBalance, `hand_${gameResult}`, {
          result: gameResult,
          payout: mainBetPayout,
          originalBet: betAmount
        });
        
        // Log activity
        const { logActivity } = require('../../websocket/messages');
        await logActivity(userId, user.username, `hand_${gameResult}`, {
          credit: mainBetPayout,
          balance: finalBalance,
          winAmount: mainBetPayout
        });
      } else {
        // Log loss with 0 payout
        const user = await prisma.player.findUnique({ where: { id: userId } });
        const { logActivity } = require('../../websocket/messages');
        await logActivity(userId, user.username, `hand_${gameResult}`, {
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
        playerCards: playerCards,
        playerValue: this.calculateHandValue(playerCards),
        dealerValue: this.calculateHandValue(completeDealerCards)
      };
    } else {
      return {
        success: true,
        dealerBlackjack: false,
        gameStatus: 'playing',
        playerCards: playerCards,
        dealerCards: dealerCards,
        playerValue: this.calculateHandValue(playerCards),
        dealerValue: this.calculateHandValue(dealerCards)
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
      const user = await prisma.player.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        logger.logError(new Error('User not found for balance update'), { userId });
        return;
      }
      
      const newBalance = user.balance + payout;
      
      // Use consistent transaction type based on result
      const transactionType = `hand_${result}`;
      
      // Update database balance
      await updatePlayerBalance(userId, newBalance, transactionType, { 
        result, 
        payout, 
        originalBet: betAmount 
      });
      
      // Log activity with consistent type
      const { logActivity } = require('../../websocket/messages');
      await logActivity(userId, user.username, transactionType, {
        credit: payout,
        balance: newBalance,
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




async function onStartBlackjackGame(ws, data, userId) {
  logger.logGameEvent('start_blackjack_game', null, { userId, betAmount: data.betAmount });
  
  try {
    // Get current user balance from database
    const user = await prisma.player.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      logger.logError(new Error('User not found for blackjack game'), { userId });
      ws.send(JSON.stringify({
        type: 'blackjackGameStarted',
        data: { 
          success: false, 
          errorMessage: t.userNotFound 
        }
      }));
      return;
    }
    
    // Check if user has enough balance
    if (user.balance < data.betAmount) {
      logger.logInfo('Blackjack game rejected - insufficient balance', { 
        userId, 
        balance: user.balance, 
        betAmount: data.betAmount 
      });
      ws.send(JSON.stringify({
        type: 'blackjackGameStarted',
        data: { 
          success: false, 
          errorMessage: t.insufficientBalance 
        }
      }));
      return;
    }
    
    // Debit user balance
    const updatedBalance = user.balance - data.betAmount;
    await updatePlayerBalance(userId, updatedBalance, 'bet_placed', { betAmount: data.betAmount });
    
    // Log activity to database
    const { logActivity } = require('../../websocket/messages');
    await logActivity(userId, user.username, 'bet_placed', {
      debit: data.betAmount,
      balance: updatedBalance
    });
    
    // Create new blackjack game instance
    const blackjack = new Blackjack();
    const gameResult = blackjack.startNewGame(userId, data.betAmount);
    
    // Handle immediate blackjack results
    if (gameResult.immediateResult) {
      // Update player balance for immediate result using consistent transaction type
      const finalBalance = updatedBalance + gameResult.gameState.payout;
      const transactionType = `hand_${gameResult.gameState.result}`;
      
      await updatePlayerBalance(userId, finalBalance, transactionType, {
        result: gameResult.gameState.result,
        payout: gameResult.gameState.payout,
        originalBet: data.betAmount
      });
      
      // Log activity with consistent type
      const { logActivity } = require('../../websocket/messages');
      await logActivity(userId, user.username, transactionType, {
        credit: gameResult.gameState.payout,
        balance: finalBalance,
        winAmount: gameResult.gameState.payout // This will be 0 for losses, >0 for wins
      });
      
      // Send response with immediate result
      const response = {
        type: 'blackjackGameStarted',
        data: {
          success: true,
          immediateResult: true,
          gameState: {
            ...gameResult.gameState,
            playerValue: gameResult.gameState.playerValue,
            dealerValue: gameResult.gameState.dealerValue
          },
          betAmount: data.betAmount,
          newBalance: finalBalance
        }
      };
      
      logger.logInfo('Blackjack game ended immediately', { 
        userId, 
        result: gameResult.gameState.result,
        payout: gameResult.gameState.payout,
        newBalance: finalBalance
      });
      ws.send(JSON.stringify(response));
    } else {
      // Normal game flow
      const response = {
        type: 'blackjackGameStarted',
        data: {
          success: true,
          immediateResult: false,
          gameState: {
            ...gameResult.gameState,
            playerValue: blackjack.calculateHandValue(gameResult.gameState.playerCards),
            dealerValue: blackjack.calculateHandValue(gameResult.gameState.dealerCards)
          },
          betAmount: data.betAmount,
          newBalance: updatedBalance
        }
      };
      
      logger.logInfo('Blackjack game started successfully', { 
        userId, 
        betAmount: data.betAmount, 
        newBalance: updatedBalance 
      });
      ws.send(JSON.stringify(response));
    }
    
  } catch (error) {
    logger.logError(error, { userId, betAmount: data.betAmount, action: 'start_blackjack_game' });
    const response = {
      type: 'blackjackGameStarted',
      data: { 
        success: false, 
        errorMessage: t.serverError 
      }
    };
    ws.send(JSON.stringify(response));
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
        
        // Get current user balance from database
        const user = await prisma.player.findUnique({
          where: { id: userId }
        });
        
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
        const updatedBalance = user.balance - data.betAmount;
        await updatePlayerBalance(userId, updatedBalance, 'bet_placed', { betAmount: data.betAmount });
        
        // Log activity to database
        const { logActivity } = require('../../websocket/messages');
        await logActivity(userId, user.username, 'bet_placed', {
          debit: data.betAmount,
          balance: updatedBalance
        });
        
        // Start new blackjack game with the stored instance
        const gameResult = blackjack.startNewGame(userId, data.betAmount);
        
        if (gameResult.immediateResult) {
          // Update player balance for immediate result
          const finalBalance = updatedBalance + gameResult.gameState.payout;
          const transactionType = `hand_${gameResult.gameState.result}`;
          
          await updatePlayerBalance(userId, finalBalance, transactionType, {
            result: gameResult.gameState.result,
            payout: gameResult.gameState.payout,
            originalBet: data.betAmount
          });
          
          await logActivity(userId, user.username, transactionType, {
            credit: gameResult.gameState.payout,
            balance: finalBalance,
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
            newBalance: finalBalance,
            cardsToShow: [
              { card: gameResult.gameState.playerCards[0], target: 'player', action: 'deal' },
              { card: gameResult.gameState.playerCards[1], target: 'player', action: 'deal' },
              { card: gameResult.gameState.dealerCards[0], target: 'dealer', action: 'deal' },
              { card: gameResult.gameState.dealerCards[1], target: 'dealer', action: 'deal' }
            ]
          };
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
            newBalance: updatedBalance,
            cardsToShow: [
              { card: gameResult.gameState.playerCards[0], target: 'player', action: 'deal' },
              { card: gameResult.gameState.playerCards[1], target: 'player', action: 'deal' },
              { card: gameResult.gameState.dealerCards[0], target: 'dealer', action: 'deal' },
              { card: { suit: null, value: null, isHoleCard: true }, target: 'dealer', action: 'deal' }
            ]
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
            result = await blackjack.stand(userId, data.playerCards, data.dealerCards, data.betAmount);
            break;
          case 'doubleDown':
            result = await blackjack.doubleDown(userId, data.playerCards, data.dealerCards, data.betAmount, data.handId);
            break;
          case 'buyInsurance':
            result = await blackjack.buyInsurance(userId, data.playerCards, data.dealerCards, data.betAmount, data.insuranceAmount);
            break;
          case 'surrender':
            result = await blackjack.surrender(userId, data.betAmount);
            break;
          case 'newGame':
            // Clear current game and create new one
            activeGames.delete(userId);
            blackjack = new Blackjack();
            activeGames.set(userId, blackjack);
            result = blackjack.startGame(userId);
            break;
          case 'skipInsurance':
            result = await blackjack.skipInsurance(userId, data.playerCards, data.dealerCards, data.betAmount);
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
        dealerCards: result.dealerCards || result.finalDealerCards,
        result: result.result,
        payout: result.payout,
        // Handle all card dealing scenarios - check for cardsToShow in result first
        ...(result.cardsToShow ? { cardsToShow: result.cardsToShow } : {}),
        
        // Handle legacy card dealing scenarios if no cardsToShow in result
        ...(() => {
          if (result.cardsToShow) return {}; // Skip if already handled above
          
          const cardsToShow = [];
          
          // Dealer hit sequence (stand/doubleDown)
          if (result.dealerHitSequence) {
            cardsToShow.push(...result.dealerHitSequence.map(hit => ({
              card: hit.card,
              target: 'dealer',
              action: hit.action
            })));
          }
          
          // New card for player (hit)
          if (result.newCard) {
            cardsToShow.push({
              card: result.newCard,
              target: 'player',
              action: 'deal'
            });
          }
          
          // Insurance hole card reveal
          if (result.dealerCards && data.type === 'skipInsurance' && result.dealerBlackjack) {
            cardsToShow.push({
              card: result.dealerCards[1], // Hole card
              target: 'dealer',
              action: 'reveal'
            });
          }
          
          return cardsToShow.length > 0 ? { cardsToShow } : {};
        })()
      }
    };
    
    ws.send(JSON.stringify(response));
  } catch (error) {
    logger.logError(error, { userId, actionType: data.type, action: 'player_action' });
    const response = {
      type: 'actionResult',
      data: {
        success: false,
        actionType: data.type,
        errorMessage: t.serverError
      }
    };
    ws.send(JSON.stringify(response));
  }
}

// Blackjack-specific message handlers
const blackjackMessages = {
  // ALL game actions unified
  'playerAction': onPlayerAction
};

module.exports = { Blackjack, blackjackMessages };