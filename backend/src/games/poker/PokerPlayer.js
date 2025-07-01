const BasePlayer = require('../../shared/base/BasePlayer');
const BettingUtils = require('../../shared/utils/BettingUtils');

class PokerPlayer extends BasePlayer {
  constructor(userId, username, balance, status = 'active') {
    super(userId, username, balance, status);
    this.holeCards = [];
    this.currentBet = 0;
    this.totalBetThisRound = 0;
    this.isFolded = false;
    this.isAllIn = false;
  }

  // Set fold status (called by game class)
  setFolded() {
    this.isFolded = true;
    this.status = 'folded';
  }

  // Set bet amount (called by game class)
  setBet(amount) {
    this.currentBet = amount;
    this.totalBetThisRound += amount;
  }

  // Set all-in status (called by game class)
  setAllIn() {
    this.isAllIn = true;
  }

  // Set hole cards (called by game class)
  setHoleCards(cards) {
    this.holeCards = cards;
  }

  // Reset for new round (called by game class)
  resetForNewRound() {
    this.currentBet = 0;
    this.totalBetThisRound = 0;
    this.isFolded = false;
    this.isAllIn = false;
    this.holeCards = [];
    if (this.status === 'folded' || this.status === 'finished') {
      this.status = 'active';
    }
  }

  getPublicData() {
    const baseData = super.getPublicData();
    return {
      ...baseData,
      holeCards: this.holeCards,
      currentBet: this.currentBet,
      totalBetThisRound: this.totalBetThisRound,
      isFolded: this.isFolded,
      isAllIn: this.isAllIn
    };
  }

  getMinimalData() {
    const baseData = super.getMinimalData();
    return {
      ...baseData,
      currentBet: this.currentBet,
      isFolded: this.isFolded,
      isAllIn: this.isAllIn,
      cardCount: this.holeCards.length
    };
  }
}

module.exports = PokerPlayer;