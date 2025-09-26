// Load environment configuration FIRST before any other imports
const { loadEnvironmentConfig } = require('./database/environment')
const config = loadEnvironmentConfig()

// Initialize database connection via DBUtils
const DBUtils = require('./shared/DBUtils')
DBUtils.initialize()

// Now import everything else after environment is loaded
const { WebSocketServer } = require('./websocket/server')
const HttpServer = require('./http/server')

// Start both servers (no database parameters needed)
const wsServer = new WebSocketServer(config.websocketPort)
const httpServer = new HttpServer(config.httpPort, config.corsOrigin)

httpServer.start()

console.log(`FullDeck WebSocket server is running on ws://localhost:${config.websocketPort} (${config.nodeEnv})`)
console.log(`FullDeck HTTP API server is running on http://localhost:${config.httpPort} (${config.nodeEnv})`)

process.on('SIGINT', async () => {
  console.log('Shutting down servers...')
  
  // Close database connection
  await DBUtils.disconnect()
  console.log('Database connection closed')
  
  // Close WebSocket server
  wsServer.wss.close(() => {
    console.log('WebSocket server closed')
  })
  
  // Close HTTP server
  await httpServer.close()
  
  process.exit(0)
})