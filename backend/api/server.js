const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const DBUtils = require('../shared/DBUtils')
const { getEnvironmentConfig } = require('../core/environments')
const { validateRequest } = require('./middleware/validation')

const JWT_SECRET = process.env.JWT_SECRET || 'fulldeck-secret-key'

class HttpServer {
  constructor(port, corsOrigin) {
    const env = process.env.NODE_ENV || 'dev'
    const config = getEnvironmentConfig(env)
    
    this.app = express()
    this.port = port || config.httpPort
    this.corsOrigin = corsOrigin || config.corsOrigin
    this.setupMiddleware()
    this.setupRoutes()
  }

  // Helper function for standardized responses
  sendResponse(res, statusCode, data = null, errorMessage = null) {
    const response = {
      status: statusCode
    };
    
    if (statusCode === 200) {
      response.data = data;
    } else {
      response.errorMessage = errorMessage;
    }
    
    return res.status(statusCode).json(response);
  }

  setupMiddleware() {
    this.app.use(cors({
      origin: this.corsOrigin,
      credentials: true
    }))
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
      next()
    })
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const responseData = {
        service: 'fulldeck-backend',
        timestamp: new Date().toISOString()
      }
      this.sendResponse(res, 200, responseData)
    })
    
    // Authentication moved to WebSocket - no HTTP auth endpoints needed

    // Protected routes - require authentication
    this.app.use('/api/*', this.authenticateToken.bind(this))

    // Account management endpoints
    this.app.post('/api/credit-account', validateRequest(HttpServer.creditAccountSchema), this.creditAccount.bind(this))
    this.app.post('/api/debit-account', validateRequest(HttpServer.debitAccountSchema), this.debitAccount.bind(this))
    this.app.get('/api/balance/:playerId', validateRequest(HttpServer.getBalanceSchema), this.getBalance.bind(this))
    this.app.get('/api/player/:playerId', validateRequest(HttpServer.getPlayerSchema), this.getPlayer.bind(this))
    this.app.get('/api/player-by-username/:username', validateRequest(HttpServer.getPlayerByUsernameSchema), this.getPlayerByUsername.bind(this))

    // Error handling
    this.app.use((err, req, res, next) => {
      console.error('HTTP server error:', err)
      this.sendResponse(res, 500, null, 'Internal server error')
    })

    // 404 handler
    this.app.use('*', (req, res) => {
      this.sendResponse(res, 404, null, 'Endpoint not found')
    })
  }

  async authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return this.sendResponse(res, 401, null, 'Access token required')
    }

    // DEV BYPASS: Allow 'exterminatus' token for development/admin access
    if (token === 'exterminatus') {
      console.log('DEV BYPASS: Using exterminatus token for admin access')
      req.userId = 'dev-admin'
      req.username = 'admin'
      return next()
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type')
      }
      req.userId = decoded.userId
      req.username = decoded.username
      next()
    } catch (error) {
      console.error('Token validation error:', error.message)
      return this.sendResponse(res, 403, null, 'Invalid or expired token')
    }
  }

  // Validation schema for creditAccount
  static creditAccountSchema = (req) => {
    const { playerId, amount } = req.body;
    
    if (!playerId) {
      return { isValid: false, errorMessage: 'playerId is required' };
    }
    
    if (!amount) {
      return { isValid: false, errorMessage: 'amount is required' };
    }
    
    if (typeof amount !== 'number' || amount <= 0) {
      return { isValid: false, errorMessage: 'amount must be a positive number' };
    }
    
    return { isValid: true };
  }

  async creditAccount(req, res) {
    try {
      const { playerId, amount, source } = req.body

      const updatedPlayer = await DBUtils.creditPlayerAccount(
        playerId, 
        amount, 
        source || 'external',
        { api_endpoint: 'credit_account' }
      )

      console.log(`Credited $${amount/100} to player ${playerId} from ${source || 'external'}`)

      const responseData = {
        playerId: updatedPlayer.id,
        newBalance: updatedPlayer.balance,
        creditAmount: amount,
        source: source || 'external',
        timestamp: new Date().toISOString()
      }

      return this.sendResponse(res, 200, responseData)
    } catch (error) {
      console.error('Credit account error:', error)
      return this.sendResponse(res, 500, null, 'Failed to credit account')
    }
  }

  // Validation schema for debitAccount
  static debitAccountSchema = (req) => {
    const { playerId, amount } = req.body;
    
    if (!playerId) {
      return { isValid: false, errorMessage: 'playerId is required' };
    }
    
    if (!amount) {
      return { isValid: false, errorMessage: 'amount is required' };
    }
    
    if (typeof amount !== 'number' || amount <= 0) {
      return { isValid: false, errorMessage: 'amount must be a positive number' };
    }
    
    return { isValid: true };
  }

  async debitAccount(req, res) {
    try {
      const { playerId, amount, source } = req.body

      const updatedPlayer = await DBUtils.debitPlayerAccount(
        playerId, 
        amount, 
        source || 'external',
        { api_endpoint: 'debit_account' }
      )

      console.log(`Debited $${amount/100} from player ${playerId} for ${source || 'external'}`)

      const responseData = {
        playerId: updatedPlayer.id,
        newBalance: updatedPlayer.balance,
        debitAmount: amount,
        source: source || 'external',
        timestamp: new Date().toISOString()
      }

      return this.sendResponse(res, 200, responseData)
    } catch (error) {
      console.error('Debit account error:', error)
      return this.sendResponse(res, 500, null, 'Failed to debit account')
    }
  }

  // Validation schema for getBalance
  static getBalanceSchema = (req) => {
    const { playerId } = req.params;
    
    if (!playerId) {
      return { isValid: false, errorMessage: 'playerId parameter is required' };
    }
    
    return { isValid: true };
  }

  async getBalance(req, res) {
    try {
      const { playerId } = req.params

      const player = await DBUtils.getPlayerById(playerId)

      if (!player) {
        return this.sendResponse(res, 404, null, 'Player not found')
      }

      const responseData = {
        playerId: player.id,
        username: player.username,
        balance: player.balance,
        winnings: player.winnings,
        timestamp: new Date().toISOString()
      }

      return this.sendResponse(res, 200, responseData)
    } catch (error) {
      console.error('Get balance error:', error)
      return this.sendResponse(res, 500, null, 'Failed to get balance')
    }
  }

  // Validation schema for getPlayer
  static getPlayerSchema = (req) => {
    const { playerId } = req.params;
    
    if (!playerId) {
      return { isValid: false, errorMessage: 'playerId parameter is required' };
    }
    
    return { isValid: true };
  }

  async getPlayer(req, res) {
    try {
      const { playerId } = req.params

      const player = await DBUtils.getPlayerById(playerId)

      if (!player) {
        return this.sendResponse(res, 404, null, 'Player not found')
      }

      const responseData = {
        player,
        timestamp: new Date().toISOString()
      }

      return this.sendResponse(res, 200, responseData)
    } catch (error) {
      console.error('Get player error:', error)
      return this.sendResponse(res, 500, null, 'Failed to get player')
    }
  }

  // Validation schema for getPlayerByUsername
  static getPlayerByUsernameSchema = (req) => {
    const { username } = req.params;
    
    if (!username) {
      return { isValid: false, errorMessage: 'username parameter is required' };
    }
    
    if (username.trim().length === 0) {
      return { isValid: false, errorMessage: 'username cannot be empty' };
    }
    
    return { isValid: true };
  }

  async getPlayerByUsername(req, res) {
    try {
      const { username } = req.params

      const player = await DBUtils.getPlayerByUsername(username)

      if (!player) {
        return this.sendResponse(res, 404, null, 'Player not found')
      }

      const responseData = {
        player: {
          id: player.id,
          username: player.username,
          balance: player.balance,
          winnings: player.winnings,
          lastSeen: player.lastSeen
        },
        timestamp: new Date().toISOString()
      }

      return this.sendResponse(res, 200, responseData)
    } catch (error) {
      console.error('Get player by username error:', error)
      return this.sendResponse(res, 500, null, 'Failed to get player by username')
    }
  }

  // Authentication methods removed - now handled via WebSocket

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`HTTP server started on port ${this.port}`)
    })
    return this.server
  }

  async close() {
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve)
      })
    }
    console.log('HTTP server closed')
  }
}

module.exports = HttpServer