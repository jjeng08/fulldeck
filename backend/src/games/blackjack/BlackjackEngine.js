const crypto = require('crypto');

class BlackjackEngine {
  constructor() {
    this.dealerCards = [];
    this.playerHands = new Map(); // userId -> cards[]
    this.initializeSixDecks();
  }

  // Initialize six standard 52-card decks (312 cards total)
  initializeSixDecks() {
    this.availableCards = [];
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    // Create 6 complete decks
    for (let deck = 0; deck < 6; deck++) {
      for (const suit of suits) {
        for (const value of values) {
          this.availableCards.push({ suit, value });
        }
      }
    }
    
    console.log(`Initialized ${this.availableCards.length} cards (6 decks)`);
  }

  // Reshuffle all six decks
  reshuffleAllDecks() {
    this.initializeSixDecks();
    console.log('Reshuffled all 6 decks for new round');
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

  // Start a new round
  startNewRound() {
    // Reshuffle all 6 decks for every new round
    this.reshuffleAllDecks();
    
    this.dealerCards = [];
    this.playerHands.clear();
    
    // Deal initial dealer cards (1 face up, 1 face down)
    this.dealerCards.push(this.dealCard()); // Face up
    this.dealerCards.push({ ...this.dealCard(), hidden: true }); // Face down
  }

  // Deal initial cards to a player
  dealPlayerCards(userId) {
    const cards = [this.dealCard(), this.dealCard()];
    this.playerHands.set(userId, cards);
    return cards;
  }

  // Player hits - deal one more card
  hit(userId) {
    const playerCards = this.playerHands.get(userId) || [];
    const newCard = this.dealCard();
    playerCards.push(newCard);
    this.playerHands.set(userId, playerCards);

    const handValue = this.calculateHandValue(playerCards);
    
    return {
      cards: playerCards,
      newCard: newCard,
      handValue: handValue,
      busted: handValue > 21
    };
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

  // Finish the round and calculate results for all players
  finishRound() {
    // Dealer plays
    const dealerResult = this.playDealerHand();
    const dealerValue = dealerResult.value;
    const dealerBusted = dealerValue > 21;
    const dealerBlackjack = this.isBlackjack(this.dealerCards);

    const results = {};

    // Calculate results for each player
    for (const [userId, cards] of this.playerHands) {
      const playerValue = this.calculateHandValue(cards);
      const playerBusted = playerValue > 21;
      const playerBlackjack = this.isBlackjack(cards);

      let result = 'lose';
      let payoutMultiplier = 0;

      if (playerBusted) {
        // Player busted - automatic loss
        result = 'lose';
        payoutMultiplier = 0;
      } else if (playerBlackjack && !dealerBlackjack) {
        // Player blackjack wins (unless dealer also has blackjack)
        result = 'blackjack';
        payoutMultiplier = 2.5; // Bet + 1.5x bet
      } else if (dealerBusted) {
        // Dealer busted, player wins
        result = 'win';
        payoutMultiplier = 2; // Bet + bet
      } else if (playerValue > dealerValue) {
        // Player has higher value
        result = 'win';
        payoutMultiplier = 2;
      } else if (playerValue === dealerValue) {
        // Push/tie
        result = 'push';
        payoutMultiplier = 1; // Return bet only
      } else {
        // Dealer wins
        result = 'lose';
        payoutMultiplier = 0;
      }

      results[userId] = {
        result: result,
        playerValue: playerValue,
        dealerValue: dealerValue,
        playerCards: cards,
        dealerCards: this.dealerCards,
        payout: 0, // Will be calculated by Table based on bet amount
        payoutMultiplier: payoutMultiplier
      };
    }

    return results;
  }

  // Get dealer cards (for display)
  getDealerCards() {
    return this.dealerCards;
  }

  // Get player cards
  getPlayerCards(userId) {
    return this.playerHands.get(userId) || [];
  }

  // Reset engine for new round
  reset() {
    this.dealerCards = [];
    this.playerHands.clear();
  }

  // Get remaining cards available
  getDeckSize() {
    return this.availableCards.length;
  }

  // Get deck statistics for debugging
  getDeckStats() {
    return {
      totalCards: this.availableCards.length,
      cardsUsed: 312 - this.availableCards.length,
      percentageUsed: ((312 - this.availableCards.length) / 312 * 100).toFixed(1) + '%'
    };
  }
}

module.exports = BlackjackEngine;