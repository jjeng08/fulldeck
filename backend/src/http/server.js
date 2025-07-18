const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

const JWT_SECRET = process.env.JWT_SECRET || 'fulldeck-secret-key'

class HttpServer {
  constructor(port = 3001, corsOrigin = '*') {
    this.app = express()
    this.port = port
    this.corsOrigin = corsOrigin
    this.prisma = new PrismaClient()
    this.setupMiddleware()
    this.setupRoutes()
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
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'fulldeck-backend'
      })
    })


    // Protected routes - require authentication
    this.app.use('/api/*', this.authenticateToken.bind(this))

    // Account management endpoints
    this.app.post('/api/credit-account', this.creditAccount.bind(this))
    this.app.post('/api/debit-account', this.debitAccount.bind(this))
    this.app.get('/api/balance/:playerId', this.getBalance.bind(this))
    this.app.get('/api/player/:playerId', this.getPlayer.bind(this))

    // Error handling
    this.app.use((err, req, res, next) => {
      console.error('HTTP server error:', err)
      res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      })
    })

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      })
    })
  }

  async authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({ error: 'Access token required' })
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
      return res.status(403).json({ error: 'Invalid or expired token' })
    }
  }

  async creditAccount(req, res) {
    try {
      const { playerId, amount, source } = req.body

      if (!playerId || !amount || amount <= 0) {
        return res.status(400).json({
          error: 'Invalid request: playerId and positive amount required'
        })
      }

      const updatedPlayer = await this.prisma.player.update({
        where: { id: playerId },
        data: { 
          balance: { increment: amount },
          winnings: { increment: amount }
        }
      })

      console.log(`Credited $${amount/100} to player ${playerId} from ${source || 'external'}`)

      res.json({
        success: true,
        playerId: updatedPlayer.id,
        newBalance: updatedPlayer.balance,
        creditAmount: amount,
        source: source || 'external',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Credit account error:', error)
      res.status(500).json({
        error: 'Failed to credit account',
        message: error.message
      })
    }
  }

  async debitAccount(req, res) {
    try {
      const { playerId, amount, source } = req.body

      if (!playerId || !amount || amount <= 0) {
        return res.status(400).json({
          error: 'Invalid request: playerId and positive amount required'
        })
      }

      // Check current balance first
      const player = await this.prisma.player.findUnique({
        where: { id: playerId }
      })

      if (!player) {
        return res.status(404).json({ error: 'Player not found' })
      }

      if (player.balance < amount) {
        return res.status(400).json({
          error: 'Insufficient balance',
          currentBalance: player.balance,
          requestedAmount: amount
        })
      }

      const updatedPlayer = await this.prisma.player.update({
        where: { id: playerId },
        data: { balance: { decrement: amount } }
      })

      console.log(`Debited $${amount/100} from player ${playerId} for ${source || 'external'}`)

      res.json({
        success: true,
        playerId: updatedPlayer.id,
        newBalance: updatedPlayer.balance,
        debitAmount: amount,
        source: source || 'external',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Debit account error:', error)
      res.status(500).json({
        error: 'Failed to debit account',
        message: error.message
      })
    }
  }

  async getBalance(req, res) {
    try {
      const { playerId } = req.params

      const player = await this.prisma.player.findUnique({
        where: { id: playerId },
        select: { id: true, balance: true, username: true, winnings: true }
      })

      if (!player) {
        return res.status(404).json({ error: 'Player not found' })
      }

      res.json({
        playerId: player.id,
        username: player.username,
        balance: player.balance,
        winnings: player.winnings,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Get balance error:', error)
      res.status(500).json({
        error: 'Failed to get balance',
        message: error.message
      })
    }
  }

  async getPlayer(req, res) {
    try {
      const { playerId } = req.params

      const player = await this.prisma.player.findUnique({
        where: { id: playerId },
        select: {
          id: true,
          username: true,
          balance: true,
          winnings: true,
          createdOn: true,
          lastSeen: true
        }
      })

      if (!player) {
        return res.status(404).json({ error: 'Player not found' })
      }

      res.json({
        player,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Get player error:', error)
      res.status(500).json({
        error: 'Failed to get player',
        message: error.message
      })
    }
  }

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
    await this.prisma.$disconnect()
    console.log('HTTP server closed')
  }
}

module.exports = HttpServer