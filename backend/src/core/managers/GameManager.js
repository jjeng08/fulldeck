const Blackjack = require('../../games/blackjack/Blackjack');
const Poker = require('../../games/poker/Poker');
const Baccarat = require('../../games/baccarat/Baccarat');
const { v4: uuidv4 } = require('uuid');

class GameManager {
  constructor() {
    this.tables = new Map(); // tableId -> Game instance
    this.playerToTable = new Map(); // userId -> tableId
    this.playerConnections = new Map(); // userId -> WebSocket
    this.gameTypes = {
      blackjack: Blackjack,
      poker: Poker,
      baccarat: Baccarat
    };
  }

  // Find best table for player to join
  findBestTable(gameType = 'blackjack', gameMode = 'multiplayer') {
    // Filter tables by game type and mode
    const matchingTables = Array.from(this.tables.values()).filter(
      table => table.getGameType() === gameType && table.gameMode === gameMode
    );

    // Priority 1: Tables with players but not full
    for (const table of matchingTables) {
      if (table.getPlayerCount() > 0 && table.canJoinTable()) {
        return table;
      }
    }

    // Priority 2: Empty tables  
    for (const table of matchingTables) {
      if (table.getPlayerCount() === 0) {
        return table;
      }
    }

    // Priority 3: Create new table
    return this.createNewTable(gameType, gameMode);
  }

  // Create a new table with random bet level
  createNewTable(gameType = 'blackjack', gameMode = 'multiplayer') {
    const tableId = uuidv4();
    const GameClass = this.gameTypes[gameType];
    
    if (!GameClass) {
      throw new Error(`Unknown game type: ${gameType}`);
    }
    
    const betLevels = [1, 2, 5];
    const randomBetLevel = betLevels[Math.floor(Math.random() * betLevels.length)];
    const table = new GameClass(tableId, randomBetLevel, gameMode);
    table.gameManager = this; // Pass GameManager reference
    this.tables.set(tableId, table);
    console.log(`Created new ${gameType} table: ${tableId} with bet level: $${randomBetLevel}, mode: ${gameMode}`);
    return table;
  }

  // Add player to best available table
  addPlayerToTable(userId, username, balance, gameType = 'blackjack', gameMode = 'multiplayer') {
    // Check if player is already at a table
    if (this.playerToTable.has(userId)) {
      const existingTableId = this.playerToTable.get(userId);
      const existingTable = this.tables.get(existingTableId);
      if (existingTable && existingTable.hasPlayer(userId)) {
        return {
          success: true,
          table: existingTable,
          rejoined: true
        };
      } else {
        // Clean up stale reference
        this.playerToTable.delete(userId);
      }
    }

    const table = this.findBestTable(gameType, gameMode);
    const result = table.addPlayer(userId, username, balance);
    
    if (result.success) {
      this.playerToTable.set(userId, table.getId());
      console.log(`Player ${username} joined ${gameType} table ${table.getId()}`);
    }

    return {
      ...result,
      table: table,
      rejoined: false
    };
  }

  // Remove player from table
  removePlayerFromTable(userId) {
    const tableId = this.playerToTable.get(userId);
    if (!tableId) {
      return { success: false, error: 'Player not at any table' };
    }

    const table = this.tables.get(tableId);
    if (!table) {
      this.playerToTable.delete(userId);
      return { success: false, error: 'Table not found' };
    }

    const result = table.removePlayer(userId);
    this.playerToTable.delete(userId);

    // Clean up empty tables after a delay (in case player reconnects)
    if (table.getPlayerCount() === 0) {
      setTimeout(() => {
        if (table.getPlayerCount() === 0) {
          this.tables.delete(tableId);
          console.log(`Removed empty table: ${tableId}`);
        }
      }, 30000); // 30 second grace period
    }

    return {
      ...result,
      table: table
    };
  }

  // Get table for player
  getPlayerTable(userId) {
    const tableId = this.playerToTable.get(userId);
    if (!tableId) return null;
    return this.tables.get(tableId);
  }

  // Handle player action at their table
  handlePlayerAction(userId, action, data) {
    const table = this.getPlayerTable(userId);
    if (!table) {
      return { success: false, error: 'Player not at any table' };
    }

    switch (action) {
      case 'placeBet':
        return table.placeBet(userId, data.amount);
      case 'hit':
        return table.hit(userId);
      case 'stand':
        return table.stand(userId);
      case 'doubleDown':
        return table.doubleDown(userId);
      case 'surrender':
        return table.surrender(userId);
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }

  // Get all tables (for admin/debugging)
  getAllTables() {
    const tablesData = [];
    for (const [tableId, table] of this.tables) {
      tablesData.push({
        id: tableId,
        playerCount: table.getPlayerCount(),
        gameStatus: table.getGameStatus(),
        players: table.getPlayers().map(p => ({
          username: p.username,
          status: p.status,
          bet: p.currentBet
        }))
      });
    }
    return tablesData;
  }

  // Register player connection
  registerPlayerConnection(userId, ws) {
    this.playerConnections.set(userId, ws);
  }

  // Unregister player connection
  unregisterPlayerConnection(userId) {
    this.playerConnections.delete(userId);
  }

  // Broadcast message to all players at a table
  broadcastToTable(tableId, messageType, data) {
    const table = this.tables.get(tableId);
    if (!table) return;

    for (const [userId, player] of table.players) {
      const ws = this.playerConnections.get(userId);
      if (ws && ws.readyState === 1) { // WebSocket.OPEN = 1
        const message = {
          type: messageType,
          data: data
        };
        ws.send(JSON.stringify(message));
      }
    }
  }

  // Get statistics
  getStats() {
    return {
      totalTables: this.tables.size,
      totalPlayers: this.playerToTable.size,
      activeTables: Array.from(this.tables.values()).filter(t => t.getPlayerCount() > 0).length
    };
  }
}

// Singleton instance
const gameManager = new GameManager();

module.exports = gameManager;