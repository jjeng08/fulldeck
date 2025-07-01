const BaseGame = require('../../shared/base/BaseGame');
const BlackjackEngine = require('./BlackjackEngine');
const BlackjackPlayer = require('./BlackjackPlayer');
const BettingUtils = require('../../shared/utils/BettingUtils');

class Blackjack extends BaseGame {
  constructor(tableId, betLevel = 1, gameMode = 'multiplayer') {
    super(tableId, 'blackjack');
    this.gameEngine = new BlackjackEngine();
    this.dealerCards = [];
    this.betLevel = betLevel; // 1, 2, or 5 dollar base bets
    this.betAmounts = this.calculateBetAmounts(betLevel);
    this.gameMode = gameMode; // 'multiplayer' or 'single'
    this.bettingTimer = null;
    this.bettingTimeLeft = 0;
    
    // Adjust settings based on game mode
    if (gameMode === 'single') {
      this.maxPlayers = 1;
      this.useTimers = false;
    } else {
      this.maxPlayers = 5;
      this.useTimers = true;
    }
  }

  getBetLevel() {
    return this.betLevel;
  }

  getBetAmounts() {
    return this.betAmounts;
  }

  calculateBetAmounts(betLevel) {
    const baseAmounts = {
      1: { low: 100, medium: 500, high: 1000, maxBet: 2000 },    // $1, $5, $10, max $20
      2: { low: 200, medium: 1000, high: 2000, maxBet: 5000 },   // $2, $10, $20, max $50
      5: { low: 500, medium: 2500, high: 5000, maxBet: 10000 }   // $5, $25, $50, max $100
    };
    return baseAmounts[betLevel] || baseAmounts[100];
  }

  // Add player to table
  addPlayer(userId, username, balance) {
    if (this.players.size >= this.maxPlayers) {
      return { success: false, error: 'Table is full' };
    }

    if (this.players.has(userId)) {
      return { success: false, error: 'Player already at table' };
    }

    // Determine player status based on game state
    const status = this.roundInProgress ? 'observer' : 'active';
    console.log(`DEBUG: Adding player ${username} - roundInProgress: ${this.roundInProgress}, status: ${status}`);
    
    const player = new BlackjackPlayer(userId, username, balance, status);
    
    this.players.set(userId, player);

    // If this is the first player and no round in progress, start welcome sequence
    if (this.players.size === 1 && !this.roundInProgress && !this.welcomeSequenceActive) {
      if (this.gameMode === 'single') {
        this.startSinglePlayerMode();
      } else {
        this.startWelcomeSequence();
      }
    }

    console.log(`DEBUG: Table state after adding player - gameStatus: ${this.gameStatus}, players: ${this.players.size}`);

    return { 
      success: true, 
      player: player,
      tableState: this.getTableState()
    };
  }

  // Remove player from table
  removePlayer(userId) {
    if (!this.players.has(userId)) {
      return { success: false, error: 'Player not at table' };
    }

    const player = this.players.get(userId);
    this.players.delete(userId);

    // If it was this player's turn, advance to next player
    if (this.currentTurn === userId) {
      this.advanceToNextPlayer();
    }

    // If no players left, reset table
    if (this.players.size === 0) {
      this.resetTable();
    }

    return { 
      success: true,
      removedPlayer: player,
      tableState: this.getTableState()
    };
  }

  // Place bet for player
  placeBet(userId, amount) {
    const player = this.players.get(userId);
    if (!player) {
      return { success: false, error: 'Player not at table' };
    }

    if (player.status === 'observer') {
      return { success: false, error: 'Observers cannot bet. Wait for next round.' };
    }

    if (this.gameStatus !== 'waiting' && this.gameStatus !== 'betting') {
      return { success: false, error: 'Cannot bet during active game' };
    }

    // Validate bet using BettingUtils
    const validation = BettingUtils.validateBetAmount(amount, player.balance, 100, this.betAmounts.maxBet);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Process the bet
    const betAmount = BettingUtils.processBet(player, amount);
    player.setBet(betAmount);
    
    // Change status to betting if this is the first bet
    if (this.gameStatus === 'waiting') {
      this.gameStatus = 'betting';
    }

    // Handle game flow based on mode
    if (this.gameMode === 'single') {
      // In single player mode, immediately start dealing after bet is placed
      this.startDealing();
    } else {
      // In multiplayer mode, check if all active players have bet
      const activePlayers = Array.from(this.players.values()).filter(p => p.status === 'active');
      const playersWithBets = activePlayers.filter(p => p.currentBet > 0);
      
      if (playersWithBets.length === activePlayers.length && activePlayers.length > 0) {
        // All active players have bet, start dealing
        this.startDealing();
      }
    }

    return { 
      success: true,
      tableState: this.getTableState()
    };
  }

  // Start dealing cards
  startDealing() {
    this.gameStatus = 'dealing';
    this.roundInProgress = true;
    
    // Deal initial cards using game engine
    this.gameEngine.startNewRound();
    this.dealerCards = this.gameEngine.getDealerCards();
    
    // Deal cards to all players with bets
    for (const [userId, player] of this.players) {
      if (player.currentBet > 0) {
        const cards = this.gameEngine.dealPlayerCards(userId);
        player.setCards(cards);
        player.status = 'playing';
      }
    }

    // Start with first player who has bet
    this.currentTurn = this.getNextPlayerWithBet();
    this.gameStatus = 'playing';

    // Broadcast the new game state with dealt cards
    this.broadcastMessage('gameStateUpdate', this.getTableState());

    return this.getTableState();
  }

  // Player hits
  hit(userId) {
    if (this.currentTurn !== userId) {
      return { success: false, error: 'Not your turn' };
    }

    const player = this.players.get(userId);
    if (!player || player.status !== 'playing') {
      return { success: false, error: 'Cannot hit in current state' };
    }

    const result = this.gameEngine.hit(userId);
    player.setCards(result.cards);

    // Check if player busted
    if (result.busted) {
      this.handlePlayerBusted(userId);
    }

    return { 
      success: true,
      card: result.newCard,
      busted: result.busted,
      tableState: this.getTableState()
    };
  }

  // Player stands
  stand(userId) {
    if (this.currentTurn !== userId) {
      return { success: false, error: 'Not your turn' };
    }

    const player = this.players.get(userId);
    if (!player || player.status !== 'playing') {
      return { success: false, error: 'Cannot stand in current state' };
    }

    this.handlePlayerStand(userId);

    return { 
      success: true,
      tableState: this.getTableState()
    };
  }

  // Handle player busted
  handlePlayerBusted(userId) {
    const player = this.players.get(userId);
    if (player) {
      player.status = 'finished';
    }
    this.advanceToNextPlayer();
  }

  // Handle player stand
  handlePlayerStand(userId) {
    const player = this.players.get(userId);
    if (player) {
      player.status = 'finished';
    }
    this.advanceToNextPlayer();
  }

  // Advance to next player or finish round
  advanceToNextPlayer() {
    this.currentTurn = this.getNextPlayerWithBet();
    
    if (!this.currentTurn) {
      // No more players, finish the round
      this.finishRound();
    }
  }

  // Get next player who needs to play
  getNextPlayerWithBet() {
    for (const [userId, player] of this.players) {
      if (player.currentBet > 0 && player.status === 'playing') {
        return userId;
      }
    }
    return null;
  }

  // Finish the round
  finishRound() {
    this.gameStatus = 'finished';
    this.currentTurn = null;
    
    // Calculate results for all players
    const results = this.gameEngine.finishRound();
    
    // Update player balances and reset for next round
    for (const [userId, player] of this.players) {
      if (player.currentBet > 0) {
        const result = results[userId];
        if (result) {
          player.updateBalance(result.payout);
        }
        player.resetForNextRound();
        
        // Observers become active players for next round
        if (player.status === 'observer') {
          player.status = 'active';
        }
      }
    }

    this.dealerCards = this.gameEngine.getDealerCards();
    this.roundInProgress = false;
    
    // Auto-start next round after delay
    setTimeout(() => {
      this.startNextRound();
    }, 5000); // 5 second delay to show results

    return this.getTableState();
  }

  // Start next round
  startNextRound() {
    this.gameStatus = 'waiting';
    this.dealerCards = [];
    this.gameEngine.reset();
    
    // All players become active (including former observers)
    for (const [userId, player] of this.players) {
      player.status = 'active';
    }
  }

  // Reset table completely
  resetTable() {
    this.gameStatus = 'waiting';
    this.currentTurn = null;
    this.roundInProgress = false;
    this.dealerCards = [];
    this.welcomeSequenceActive = false;
    this.clearMasterTimer();
    this.clearBettingTimer();
    this.gameEngine.reset();
  }

  // Start welcome sequence when first player joins (multiplayer mode)
  startWelcomeSequence() {
    this.welcomeSequenceActive = true;
    this.gameStatus = 'welcome_sequence';
    
    console.log('Starting multiplayer welcome sequence...');
    if (this.useTimers) {
      this.startMasterTimer('welcome');
    }
  }

  // Start single player mode (no timers, immediate betting)
  startSinglePlayerMode() {
    console.log('Starting single player mode...');
    this.gameStatus = 'betting';
    this.broadcastMessage('pillMessage', { message: 'Welcome! Place your bet to start.' });
    this.broadcastMessage('bettingStarted', { 
      timeLeft: 0, // No timer in single player
      canBet: true 
    });
  }

  // Handle timer steps for blackjack game
  handleTimerStep(sequence) {
    console.log(`DEBUG: Blackjack timer step ${this.sequenceStep}, players: ${this.players.size}`);
    
    if (sequence === 'welcome') {
      if (this.sequenceStep === 0) {
        this.broadcastMessage('pillMessage', { message: 'Welcome to the table!' });
      } else if (this.sequenceStep === 2) {
        this.broadcastMessage('pillMessage', { message: 'Ready?' });
      } else if (this.sequenceStep === 4) {
        this.broadcastMessage('pillMessage', { message: "Let's play!" });
        this.gameStatus = 'betting';
        this.welcomeSequenceActive = false;
        this.bettingTimeLeft = 10;
        this.broadcastMessage('pillMessage', { message: 'Place your bets!' });
        this.broadcastMessage('bettingStarted', { timeLeft: this.bettingTimeLeft });
      }
    } else if (sequence === 'newGame') {
      if (this.sequenceStep === 0) {
        this.broadcastMessage('pillMessage', { message: 'New Game!' });
      } else if (this.sequenceStep === 2) {
        this.broadcastMessage('pillMessage', { message: 'Ready?' });
      } else if (this.sequenceStep === 4) {
        this.broadcastMessage('pillMessage', { message: "Let's play!" });
        this.gameStatus = 'betting';
        this.welcomeSequenceActive = false;
        this.bettingTimeLeft = 10;
        this.broadcastMessage('pillMessage', { message: 'Place your bets!' });
        this.broadcastMessage('bettingStarted', { timeLeft: this.bettingTimeLeft });
      }
    }
    
    // Handle betting countdown
    if (this.gameStatus === 'betting' && this.bettingTimeLeft > 0) {
      this.bettingTimeLeft--;
      if (this.bettingTimeLeft > 0) {
        this.broadcastMessage('bettingTimer', { 
          timeLeft: this.bettingTimeLeft
        });
      } else {
        this.endBettingPeriod();
      }
    }
  }

  // Start master timer system
  startMasterTimer() {
    this.sequenceStep = 0;
    this.clearMasterTimer();
    
    this.masterTimer = setInterval(() => {
      console.log(`DEBUG: Master timer step ${this.sequenceStep}, players: ${this.players.size}`);
      
      // Handle welcome sequence
      if (this.sequenceStep === 0) {
        this.broadcastMessage('pillMessage', { message: 'Welcome to the table!' });
      } else if (this.sequenceStep === 2) {
        this.broadcastMessage('pillMessage', { message: 'Ready?' });
      } else if (this.sequenceStep === 4) {
        this.broadcastMessage('pillMessage', { message: "Let's play!" });
        this.gameStatus = 'betting';
        this.welcomeSequenceActive = false;
        this.bettingTimeLeft = 10;
        this.broadcastMessage('pillMessage', { message: 'Place your bets!' });
        this.broadcastMessage('bettingStarted', { timeLeft: this.bettingTimeLeft });
      }
      
      // Handle betting countdown
      if (this.gameStatus === 'betting' && this.bettingTimeLeft > 0) {
        this.bettingTimeLeft--;
        if (this.bettingTimeLeft > 0) {
          this.broadcastMessage('bettingTimer', { 
            timeLeft: this.bettingTimeLeft
          });
        } else {
          this.endBettingPeriod();
        }
      }
      
      this.sequenceStep++;
    }, 1000);
  }


  // End betting period
  endBettingPeriod() {
    this.clearMasterTimer();
    this.clearBettingTimer();
    
    // Broadcast timer ended to hide timer circle
    this.broadcastMessage('bettingTimer', { timeLeft: 0 });
    
    // Auto-submit all current bets and debit accounts
    this.submitAllBets();
  }

  // Submit all pending bets and debit player accounts
  async submitAllBets() {
    console.log('Auto-submitting bets from frontend state...');
    
    // Broadcast to all players to submit their current frontend bets
    this.broadcastMessage('autoSubmitBets', {});
    
    // Give frontend time to process auto-submission
    setTimeout(() => {
      this.checkForBetsAndContinue();
    }, 1000);
  }
  
  // Check if players have bets after auto-submission
  checkForBetsAndContinue() {
    const playersWithBets = Array.from(this.players.values()).filter(p => p.currentBet > 0);
    
    if (playersWithBets.length > 0) {
      this.broadcastMessage('pillMessage', { message: 'Betting closed! Starting game...' });
      this.startDealing();
    } else {
      this.broadcastMessage('pillMessage', { message: 'No bets made. Starting a new game!' });
      this.gameStatus = 'waiting';
      // Start new welcome sequence after 5 seconds if players still at table
      setTimeout(() => {
        if (this.players.size > 0 && this.gameStatus === 'waiting') {
          this.startNewGameSequence();
        }
      }, 5000);
    }
  }

  // Start new game sequence (for returning players)
  startNewGameSequence() {
    if (this.gameMode === 'single') {
      // In single player mode, immediately go to betting
      this.gameStatus = 'betting';
      this.broadcastMessage('pillMessage', { message: 'New Game! Place your bet.' });
      this.broadcastMessage('bettingStarted', { 
        timeLeft: 0,
        canBet: true 
      });
    } else {
      // In multiplayer mode, use timer sequence
      this.welcomeSequenceActive = true;
      this.gameStatus = 'welcome_sequence';
      
      console.log('Starting multiplayer new game sequence...');
      if (this.useTimers) {
        this.startMasterTimer('newGame');
      }
    }
  }
  
  // Start master timer for new game sequence
  startNewGameMasterTimer() {
    this.sequenceStep = 0;
    this.clearMasterTimer();
    
    this.masterTimer = setInterval(() => {
      console.log(`DEBUG: New game timer step ${this.sequenceStep}, players: ${this.players.size}`);
      
      // Handle new game sequence
      if (this.sequenceStep === 0) {
        this.broadcastMessage('pillMessage', { message: 'New Game!' });
      } else if (this.sequenceStep === 2) {
        this.broadcastMessage('pillMessage', { message: 'Ready?' });
      } else if (this.sequenceStep === 4) {
        this.broadcastMessage('pillMessage', { message: "Let's play!" });
        this.gameStatus = 'betting';
        this.welcomeSequenceActive = false;
        this.bettingTimeLeft = 10;
        this.broadcastMessage('pillMessage', { message: 'Place your bets!' });
        this.broadcastMessage('bettingStarted', { timeLeft: this.bettingTimeLeft });
      }
      
      // Handle betting countdown
      if (this.gameStatus === 'betting' && this.bettingTimeLeft > 0) {
        this.bettingTimeLeft--;
        if (this.bettingTimeLeft > 0) {
          this.broadcastMessage('bettingTimer', { 
            timeLeft: this.bettingTimeLeft
          });
        } else {
          this.endBettingPeriod();
        }
      }
      
      this.sequenceStep++;
    }, 1000);
  }

  // Clear master timer
  clearMasterTimer() {
    if (this.masterTimer) {
      clearInterval(this.masterTimer);
      this.masterTimer = null;
    }
    this.timerSequence = null;
    this.sequenceStep = 0;
  }

  // Clear betting timer
  clearBettingTimer() {
    this.bettingTimeLeft = 0;
  }

  // Clear welcome sequence timers
  clearWelcomeTimers() {
    this.clearMasterTimer();
    this.welcomeSequenceActive = false;
  }

  // Broadcast message to all players at table
  broadcastMessage(type, data) {
    console.log(`Broadcasting to table ${this.id}: ${type}`, data);
    if (this.gameManager) {
      this.gameManager.broadcastToTable(this.id, type, data);
    }
  }

  // Get current table state for broadcasting
  getTableState() {
    const playersData = [];
    for (const [userId, player] of this.players) {
      playersData.push({
        userId: userId,
        username: player.username,
        status: player.status,
        balance: player.balance,
        currentBet: player.currentBet,
        cards: player.cards,
        isCurrentTurn: this.currentTurn === userId
      });
    }

    const tableState = {
      tableId: this.id,
      gameType: this.gameType,
      gameMode: this.gameMode,
      gameStatus: this.gameStatus,
      players: playersData,
      dealerCards: this.dealerCards,
      currentTurn: this.currentTurn,
      roundInProgress: this.roundInProgress,
      betLevel: this.betLevel,
      betAmounts: this.betAmounts,
      maxBet: this.betAmounts.maxBet,
      bettingTimeLeft: this.bettingTimeLeft,
      canBet: this.gameStatus === 'betting',
      useTimers: this.useTimers
    };

    console.log(`DEBUG: getTableState result:`, JSON.stringify(tableState, null, 2));
    return tableState;
  }

  // Get all players
  getPlayers() {
    return Array.from(this.players.values());
  }
}

module.exports = Blackjack;