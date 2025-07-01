class BasePlayer {
  constructor(userId, username, balance, status = 'active') {
    this.userId = userId;
    this.username = username;
    this.balance = balance;
    this.status = status; // 'active', 'observer', 'playing', 'finished'
    this.joinedAt = new Date();
  }

  // Get player data for broadcasting
  getPublicData() {
    return {
      userId: this.userId,
      username: this.username,
      status: this.status,
      balance: this.balance
    };
  }

  // Get minimal player data (for other players' view)
  getMinimalData() {
    return {
      userId: this.userId,
      username: this.username,
      status: this.status
    };
  }

  // Deduct amount from player's account and update database
  async debitPlayer(amount) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    try {
      const updatedUser = await prisma.user.update({
        where: { id: this.userId },
        data: { balance: { decrement: amount } }
      });
      
      this.balance = updatedUser.balance;
      await prisma.$disconnect();
      return this.balance;
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
  }

  // Add amount to player's account and update database
  async creditPlayer(amount) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    try {
      const updatedUser = await prisma.user.update({
        where: { id: this.userId },
        data: { balance: { increment: amount } }
      });
      
      this.balance = updatedUser.balance;
      await prisma.$disconnect();
      return this.balance;
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
  }
}

module.exports = BasePlayer;