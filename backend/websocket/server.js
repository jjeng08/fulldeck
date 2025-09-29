const WebSocket = require('ws')
const jwt = require('jsonwebtoken')
const url = require('url')
const { getEnvironmentConfig } = require('../core/environments')

const JWT_SECRET = process.env.JWT_SECRET || 'blackjack-secret-key'
const config = getEnvironmentConfig()

class WebSocketServer {
  constructor(port = config.websocketPort) {
    this.wss = new WebSocket.Server({ port, host: '0.0.0.0' })
    this.connections = new Map()
    this.messageHandler = null
    this.setupServer()
    
    // Store singleton instance
    WebSocketServer.instance = this
  }

  static getInstance() {
    return WebSocketServer.instance
  }

  // Set handler for incoming messages
  gotMessage(handler) {
    this.messageHandler = handler
  }

  // Centralized message sending function
  sendMessage(userId, type, data = {}) {
    const userConnections = this.getUserConnections(userId)
    if (userConnections.length === 0) {
      console.log(`No active connections found for user ${userId}`)
      return
    }

    const message = {
      type,
      data
    }

    userConnections.forEach(connection => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify(message))
      }
    })
  }

  // Get all connections for a user
  getUserConnections(userId) {
    return Array.from(this.connections.values()).filter(
      connection => connection.userId === userId && connection.connected
    )
  }

  setupServer() {
    this.wss.on('connection', (ws, req) => {
      const connectionId = this.generateConnectionId()
      let userId = null
      let username = null
      
      // No token authentication at connection level - will validate per message
      console.log(`New WebSocket connection: ${connectionId}`)
      console.log(`Total connections: ${this.connections.size + 1}`)
      
      this.connections.set(connectionId, {
        ws,
        userId,
        username,
        connected: true,
        connectedAt: new Date()
      })

      // Store connection ID on the WebSocket for easy lookup
      ws.connectionId = connectionId
      
      ws.on('message', (message) => {
        const connection = this.connections.get(connectionId)
        if (connection && this.messageHandler) {
          this.messageHandler(ws, message.toString(), connection.userId)
        } else {
          console.log('NO CONNECTION OR HANDLER FOUND FOR ID:', connectionId)
        }
      })

      ws.on('close', () => {
        console.log(`WebSocket connection closed: ${connectionId}`)
        this.connections.delete(connectionId)
      })

      ws.on('error', (error) => {
        console.error(`WebSocket error for ${connectionId}:`, error)
        this.connections.delete(connectionId)
      })

      ws.send(JSON.stringify({
        type: 'connected',
        data: { connectionId, message: 'Connected to Blackjack server' }
      }))
    })

    console.log(`WebSocket server started on port ${this.wss.options.port}`)
  }

  generateConnectionId() {
    return 'conn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  }

  setUserForConnection(connectionId, userId) {
    const connection = this.connections.get(connectionId)
    if (connection) {
      connection.userId = userId
    }
  }

  // Update connection userId for a specific WebSocket
  updateConnectionUserId(ws, userId) {
    const connectionId = ws.connectionId
    const connection = this.connections.get(connectionId)
    if (connection) {
      connection.userId = userId
      return true;
    }
    return false;
  }

  broadcastToUser(userId, message) {
    for (const [connectionId, connection] of this.connections) {
      if (connection.userId === userId && connection.connected) {
        connection.ws.send(JSON.stringify(message))
      }
    }
  }

  // Broadcast message to all connected clients
  broadcastToAll(type, data = {}) {
    const message = {
      type,
      data
    };

    for (const [connectionId, connection] of this.connections) {
      if (connection.connected && connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify(message));
      }
    }
  }

  getActiveConnections() {
    return this.connections.size
  }

  getConnectionsByUser(userId) {
    return Array.from(this.connections.values())
      .filter(conn => conn.userId === userId && conn.connected)
  }
}

// Helper function for sending messages - exported for use throughout backend
const sendMessage = (userId, type, data = {}) => {
  const instance = WebSocketServer.getInstance();
  if (instance) {
    instance.sendMessage(userId, type, data);
  }
};

// Helper function for setting message handler - exported for use by dispatcher
const gotMessage = (handler) => {
  const instance = WebSocketServer.getInstance();
  if (instance) {
    instance.gotMessage(handler);
  }
};

// Helper function for updating connection userId - exported for use throughout backend
const updateConnectionUserId = (ws, userId) => {
  const instance = WebSocketServer.getInstance();
  if (instance) {
    return instance.updateConnectionUserId(ws, userId);
  }
  return false;
};

module.exports = {
  WebSocketServer,
  sendMessage,
  gotMessage,
  updateConnectionUserId
};