const WebSocket = require('ws')
const jwt = require('jsonwebtoken')
const url = require('url')
const { handleMessage } = require('./messageHandlers')

const JWT_SECRET = process.env.JWT_SECRET || 'blackjack-secret-key'

class WebSocketServer {
  constructor(port = 8080) {
    this.wss = new WebSocket.Server({ port })
    this.connections = new Map()
    this.setupServer()
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

      ws.on('message', (message) => {
        console.log('MESSAGE EVENT FIRED!', message.toString());
        const connection = this.connections.get(connectionId)
        if (connection) {
          handleMessage(ws, message.toString(), connection.userId)
        } else {
          console.log('NO CONNECTION FOUND FOR ID:', connectionId)
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

  broadcastToUser(userId, message) {
    for (const [connectionId, connection] of this.connections) {
      if (connection.userId === userId && connection.connected) {
        connection.ws.send(JSON.stringify(message))
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

module.exports = WebSocketServer