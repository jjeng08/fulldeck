const { loadEnvironmentConfig } = require('./src/config/environment')
const WebSocketServer = require('./src/websocket/server')

// Load environment configuration
const config = loadEnvironmentConfig()

const wsServer = new WebSocketServer(config.websocketPort)

console.log(`FullDeck WebSocket server is running on ws://localhost:${config.websocketPort} (${config.nodeEnv})`)

process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server...')
  wsServer.wss.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
})