class BettingUtils {
  static validateBetAmount(amount, balance, minBet = 100, maxBet = Infinity) {
    if (typeof amount !== 'number' || amount <= 0) {
      return { valid: false, error: 'Invalid bet amount' };
    }
    
    if (amount < minBet) {
      return { valid: false, error: `Minimum bet is ${minBet}` };
    }
    
    if (amount > maxBet) {
      return { valid: false, error: `Maximum bet is ${maxBet}` };
    }
    
    if (amount > balance) {
      return { valid: false, error: 'Insufficient balance' };
    }
    
    return { valid: true };
  }

  static processBet(player, amount) {
    const validation = this.validateBetAmount(amount, player.balance);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    
    player.balance -= amount;
    return amount;
  }

  static processAllInBet(player) {
    const amount = player.balance;
    player.balance = 0;
    return amount;
  }

  static formatCurrency(amount) {
    const numericAmount = Number(amount) || 0;
    const dollarsAmount = numericAmount / 100;
    return `$${dollarsAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  static calculatePayout(betAmount, multiplier) {
    return Math.floor(betAmount * multiplier);
  }
}

module.exports = BettingUtils;