const { PrismaClient } = require('@prisma/client');

class BaccaratPlayer {
  constructor(userId, username, balance, status = 'active') {
    this.userId = userId;
    this.username = username;
    this.balance = balance;
    this.status = status;
    this.joinedAt = new Date();
    this.playerBet = 0;
    this.bankerBet = 0;
    this.tieBet = 0;
    this.totalBet = 0;
  }

  // Set bet amount for specific bet type (called by game class)
  setBet(betType, amount) {
    switch (betType) {
      case 'player':
        this.playerBet = amount;
        break;
      case 'banker':
        this.bankerBet = amount;
        break;
      case 'tie':
        this.tieBet = amount;
        break;
      default:
        throw new Error('Invalid bet type');
    }
    this.totalBet += amount;
  }

  // Clear all bets (called by game class)
  clearBets() {
    this.playerBet = 0;
    this.bankerBet = 0;
    this.tieBet = 0;
    this.totalBet = 0;
  }

  getPublicData() {
    const baseData = super.getPublicData();
    return {
      ...baseData,
      playerBet: this.playerBet,
      bankerBet: this.bankerBet,
      tieBet: this.tieBet,
      totalBet: this.totalBet
    };
  }

  getMinimalData() {
    const baseData = super.getMinimalData();
    return {
      ...baseData,
      totalBet: this.totalBet
    };
  }
}

module.exports = BaccaratPlayer;