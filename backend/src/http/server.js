const express = require('express')
const cors = require('cors')
const logger = require('../shared/logger')
const { endpoints, authenticateToken } = require('./endpoints')

class HttpServer {
  constructor(port = 3001, corsOrigin = '*') {
    this.app = express()
    this.port = port
    this.corsOrigin = corsOrigin
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
      logger.logDebug('HTTP request', { 
        method: req.method, 
        path: req.path, 
        ip: req.ip,
        userAgent: req.get('User-Agent')
      })
      next()
    })
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', endpoints.health)

    // Frontend logging endpoint (no authentication required)
    this.app.post('/api/logs', endpoints.logs)

    // Protected routes - require authentication
    this.app.use('/api/*', authenticateToken)

    // Account management endpoints
    this.app.post('/api/credit-account', endpoints.creditAccount)
    this.app.post('/api/debit-account', endpoints.debitAccount)
    this.app.get('/api/balance/:playerId', endpoints.getBalance)
    this.app.get('/api/player/:playerId', endpoints.getPlayer)

    // Error handling
    this.app.use((err, req, res, next) => {
      logger.logError(err, { action: 'http_server_error' })
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


  start() {
    this.server = this.app.listen(this.port, () => {
      logger.logInfo('HTTP server started', { port: this.port })
    })
    return this.server
  }

  async close() {
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve)
      })
    }
    logger.logInfo('HTTP server closed')
  }
}

module.exports = HttpServer