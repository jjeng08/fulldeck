class BaseGame {
  constructor(tableId, gameType) {
    this.id = tableId;
    this.gameType = gameType;
    this.players = new Map();
    this.gameStatus = 'waiting';
    this.currentTurn = null;
    this.roundInProgress = false;
    this.maxPlayers = 5;
    this.welcomeSequenceActive = false;
    this.masterTimer = null;
    this.sequenceStep = 0;
  }

  getId() {
    return this.id;
  }

  getGameType() {
    return this.gameType;
  }

  getPlayerCount() {
    return this.players.size;
  }

  getGameStatus() {
    return this.gameStatus;
  }

  canJoinTable() {
    return this.players.size < this.maxPlayers;
  }

  hasPlayer(userId) {
    return this.players.has(userId);
  }

  // Master timer system for all games
  startMasterTimer(sequence) {
    this.sequenceStep = 0;
    this.clearMasterTimer();
    
    this.masterTimer = setInterval(() => {
      this.handleTimerStep(sequence);
      this.sequenceStep++;
    }, 1000);
  }

  handleTimerStep(sequence) {
    // To be implemented by each game
    throw new Error('handleTimerStep must be implemented by game class');
  }

  clearMasterTimer() {
    if (this.masterTimer) {
      clearInterval(this.masterTimer);
      this.masterTimer = null;
    }
  }

  // Abstract methods to be implemented by each game
  addPlayer(userId, username, balance) {
    throw new Error('addPlayer must be implemented by game class');
  }

  removePlayer(userId) {
    throw new Error('removePlayer must be implemented by game class');
  }

  getTableState() {
    throw new Error('getTableState must be implemented by game class');
  }

  resetTable() {
    this.gameStatus = 'waiting';
    this.currentTurn = null;
    this.roundInProgress = false;
    this.welcomeSequenceActive = false;
    this.clearMasterTimer();
  }

  broadcastMessage(type, data) {
    console.log(`Broadcasting to ${this.gameType} table ${this.id}: ${type}`, data);
    const gameManager = require('../../core/managers/GameManager');
    gameManager.broadcastToTable(this.id, type, data);
  }

  getPlayers() {
    return Array.from(this.players.values());
  }
}

module.exports = BaseGame;