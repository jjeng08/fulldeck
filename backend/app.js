const { loadEnvironmentConfig } = require('./src/environments/environment')
const WebSocketServer = require('./src/websocket/server')
const HttpServer = require('./src/http/server')

// Load environment configuration
const config = loadEnvironmentConfig()

// Start both servers
const wsServer = new WebSocketServer(config.websocketPort)
const httpServer = new HttpServer(config.httpPort, config.corsOrigin)

httpServer.start()

console.log(`FullDeck WebSocket server is running on ws://localhost:${config.websocketPort} (${config.nodeEnv})`)
console.log(`FullDeck HTTP API server is running on http://localhost:${config.httpPort} (${config.nodeEnv})`)

process.on('SIGINT', async () => {
  console.log('Shutting down servers...')
  
  // Close WebSocket server
  wsServer.wss.close(() => {
    console.log('WebSocket server closed')
  })
  
  // Close HTTP server
  await httpServer.close()
  
  process.exit(0)
})