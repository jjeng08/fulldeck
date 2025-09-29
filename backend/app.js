async function startServer() {
  // Load environment configuration FIRST before any other imports
  const { loadEnvironmentConfig } = require('./core/environments')
  const config = loadEnvironmentConfig()

  // Initialize database connection via DBUtils
  const DBUtils = require('./shared/DBUtils')
  await DBUtils.initialize()

  // Now import everything else after environment is loaded
  const { WebSocketServer } = require('./websocket/server')
  const HttpServer = require('./api/server')
  const dispatcher = require('./websocket/dispatcher')

  // Start both servers (no database parameters needed)
  const wsServer = new WebSocketServer(config.websocketPort)
  const httpServer = new HttpServer(config.httpPort, config.corsOrigin)

  // Initialize message dispatcher after server is created
  dispatcher.initialize()

  // Start leaderboard service
  const { startLeaderboardService } = require('./services/leaderboardService')
  startLeaderboardService()

  // Start the HTTP server
  httpServer.start()

  console.log(`FullDeck WebSocket server is running on ws://localhost:${config.websocketPort} (${config.nodeEnv})`)
  console.log(`FullDeck HTTP API server is running on http://localhost:${config.httpPort} (${config.nodeEnv})`)

  return { wsServer, httpServer, DBUtils, config }
}

startServer().catch(err => {
  console.error('❌ FATAL: Server startup failed!');
  console.error(err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('Shutting down servers...')
  
  // Stop leaderboard service
  const { stopLeaderboardService } = require('./services/leaderboardService')
  stopLeaderboardService()
  
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