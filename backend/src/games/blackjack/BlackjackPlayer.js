const BasePlayer = require('../../shared/base/BasePlayer');
const BettingUtils = require('../../shared/utils/BettingUtils');

class BlackjackPlayer extends BasePlayer {
  constructor(userId, username, balance, status = 'active') {
    super(userId, username, balance, status);
    this.currentBet = 0;
    this.cards = [];
  }

  // Set bet amount (called by game class)
  setBet(amount) {
    this.currentBet = amount;
    this.status = 'playing';
  }

  // Update balance after round (called by game class)
  updateBalance(payout) {
    this.balance += payout;
  }

  // Set player cards (called by game class)
  setCards(cards) {
    this.cards = cards;
  }

  // Add a card to player's hand (called by game class)
  addCard(card) {
    this.cards.push(card);
  }

  // Get hand value (for blackjack calculation)
  getHandValue() {
    let value = 0;
    let aces = 0;

    for (const card of this.cards) {
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

  // Check if player has blackjack
  hasBlackjack() {
    return this.cards.length === 2 && this.getHandValue() === 21;
  }

  // Check if player is busted
  isBusted() {
    return this.getHandValue() > 21;
  }

  // Reset player for next round
  resetForNextRound() {
    this.currentBet = 0;
    this.cards = [];
    if (this.status === 'finished' || this.status === 'playing') {
      this.status = 'active';
    }
  }

  // Get player data for broadcasting (blackjack-specific)
  getPublicData() {
    const baseData = super.getPublicData();
    return {
      ...baseData,
      currentBet: this.currentBet,
      cards: this.cards,
      handValue: this.getHandValue(),
      hasBlackjack: this.hasBlackjack(),
      isBusted: this.isBusted()
    };
  }

  // Get minimal player data (for other players' view)
  getMinimalData() {
    const baseData = super.getMinimalData();
    return {
      ...baseData,
      currentBet: this.currentBet,
      cardCount: this.cards.length
    };
  }
}

module.exports = BlackjackPlayer;