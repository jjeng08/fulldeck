import { getConfig } from '../shared/environment';
import logger from '../shared/logger';

class WebSocketService {
  constructor() {
    this.ws = null
    this.connected = false
    this.messageHandlers = new Map()
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
    this.currentUrl = null
  }

  connect(url) {
    // Use environment config if no URL provided
    if (!url) {
      const config = getConfig()
      url = config.websocketUrl
    }
    logger.logWebSocketEvent('connection_attempt', { url });
    try {
      // Store the URL for reconnections
      this.currentUrl = url
      
      // Connect without token - auth will be per-message
      this.ws = new WebSocket(url)
      
      this.ws.onopen = () => {
        logger.logWebSocketEvent('connected', { url: this.currentUrl })
        this.connected = true
        this.reconnectAttempts = 0
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          logger.logError(error, { type: 'websocket_error', action: 'message_parsing' })
        }
      }

      this.ws.onclose = () => {
        logger.logWebSocketEvent('disconnect', { reconnectAttempts: this.reconnectAttempts })
        this.connected = false
        this.attemptReconnect()
      }

      this.ws.onerror = (error) => {
        logger.logError(error, { type: 'websocket_error', action: 'connection' })
      }

    } catch (error) {
      logger.logError(error, { type: 'websocket_error', action: 'connection_failed', url })
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      logger.logWebSocketEvent('reconnection_attempt', { 
        attempt: this.reconnectAttempts, 
        maxAttempts: this.maxReconnectAttempts 
      })
      
      setTimeout(() => {
        this.connect(this.currentUrl)
      }, this.reconnectDelay * this.reconnectAttempts)
    } else {
      logger.logWebSocketEvent('max_reconnections_reached', { 
        maxAttempts: this.maxReconnectAttempts 
      })
    }
  }

  sendMessage(type, data = {}) {
    if (this.connected && this.ws) {
      const message = { type, data }
      const jsonMessage = JSON.stringify(message)
      logger.logDebug('WebSocket message sending', { type, dataKeys: Object.keys(data) })
      this.ws.send(jsonMessage)
      logger.logDebug('WebSocket message sent', { type })
    } else {
      logger.logError(new Error('WebSocket not connected'), { 
        type: 'websocket_error', 
        action: 'send_message_failed', 
        messageType: type 
      })
    }
  }

  handleMessage(message) {
    const { type, data } = message
    logger.logDebug('WebSocket message received', { type, hasData: !!data })

    if (this.messageHandlers.has(type)) {
      const handler = this.messageHandlers.get(type)
      handler(data)
    } else {
      logger.logWarn('No WebSocket message handler', { messageType: type })
    }
  }

  onMessage(type, handler) {
    this.messageHandlers.set(type, handler)
  }

  removeMessageHandler(type) {
    this.messageHandlers.delete(type)
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this.connected = false
    }
  }

}

export default new WebSocketService()