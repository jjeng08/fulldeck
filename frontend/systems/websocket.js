import { getConfig } from '../shared/environment';

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
    console.log('Connecting to WebSocket URL:', url);
    try {
      // Store the URL for reconnections
      this.currentUrl = url
      
      // Connect without token - auth will be per-message
      this.ws = new WebSocket(url)
      
      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.connected = true
        this.reconnectAttempts = 0
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected', { code: event.code, reason: event.reason, wasClean: event.wasClean })
        this.connected = false
        this.attemptReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

    } catch (error) {
      console.error('Failed to connect to WebSocket:', error)
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      
      setTimeout(() => {
        this.connect(this.currentUrl)
      }, this.reconnectDelay * this.reconnectAttempts)
    } else {
      console.log('Max reconnection attempts reached')
    }
  }

  sendMessage(type, data = {}) {
    if (this.connected && this.ws) {
      const message = { type, data }
      const jsonMessage = JSON.stringify(message)
      this.ws.send(jsonMessage)
      console.log('Sent message:', type, data)
    } else {
      console.error('WebSocket not connected')
    }
  }

  handleMessage(message) {
    const { type, data } = message
    console.log('Received message:', type, data)

    if (this.messageHandlers.has(type)) {
      const handler = this.messageHandlers.get(type)
      handler(data)
    } else {
      console.log('No handler for message type:', type)
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

  // Game-specific message methods
  startGame(betAmount) {
    this.sendMessage('startGame', { betAmount })
  }

  hit() {
    this.sendMessage('hit')
  }

  stand() {
    this.sendMessage('stand')
  }

  newGame() {
    this.sendMessage('newGame')
  }

  placeBet(amount) {
    this.sendMessage('placeBet', { amount })
  }

  login(username, password) {
    this.sendMessage('login', { username, password })
  }

  register(username, password) {
    this.sendMessage('register', { username, password })
  }

  getBalance() {
    this.sendMessage('getBalance')
  }

  getGameState() {
    this.sendMessage('getGameState')
  }

  surrender() {
    this.sendMessage('surrender')
  }

  doubleDown() {
    this.sendMessage('doubleDown')
  }
}

export default new WebSocketService()