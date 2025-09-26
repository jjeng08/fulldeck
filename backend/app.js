// Load environment configuration FIRST before any other imports
const { loadEnvironmentConfig } = require('./database/environment')
const config = loadEnvironmentConfig()

// Initialize database connection
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Now import everything else after environment is loaded
const { WebSocketServer } = require('./src/websocket/server')
const HttpServer = require('./src/http/server')

// Start both servers with database connection
const wsServer = new WebSocketServer(config.websocketPort, prisma)
const httpServer = new HttpServer(config.httpPort, config.corsOrigin, prisma)

httpServer.start()

console.log(`FullDeck WebSocket server is running on ws://localhost:${config.websocketPort} (${config.nodeEnv})`)
console.log(`FullDeck HTTP API server is running on http://localhost:${config.httpPort} (${config.nodeEnv})`)

process.on('SIGINT', async () => {
  console.log('Shutting down servers...')
  
  // Close database connection
  await prisma.$disconnect()
  console.log('Database connection closed')
  
  // Close WebSocket server
  wsServer.wss.close(() => {
    console.log('WebSocket server closed')
  })
  
  // Close HTTP server
  await httpServer.close()
  
  process.exit(0)
})