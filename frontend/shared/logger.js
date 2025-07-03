import { getConfig } from './environment';

let config = null;
let isDevelopment = true; // Default to development mode

const initializeConfig = () => {
  if (!config) {
    try {
      config = getConfig();
      isDevelopment = config.logLevel === 'debug';
    } catch (error) {
      console.warn('Failed to load config, defaulting to development mode:', error);
      isDevelopment = true;
    }
  }
};

// Critical actions that should be sent to backend for persistence
const criticalActions = [
  'login_attempt',
  'login_success',
  'login_failure',
  'registration_attempt',
  'registration_success',
  'registration_failure',
  'game_start',
  'bet_placed',
  'game_error',
  'websocket_disconnect',
  'websocket_error',
  'payment_error',
  'balance_sync_error'
];

// Critical error types that should be sent to backend
const criticalErrors = [
  'network_error',
  'websocket_error',
  'game_logic_error',
  'payment_error',
  'authentication_error',
  'data_sync_error'
];

class FrontendLogger {
  constructor() {
    this.apiBaseUrl = null;
    this.sessionId = this.generateSessionId();
  }

  initializeIfNeeded() {
    if (!this.apiBaseUrl) {
      initializeConfig();
      this.apiBaseUrl = config?.apiBaseUrl || 'http://localhost:3001';
    }
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async sendToBackend(level, type, message, data = {}) {
    try {
      this.initializeIfNeeded();
      
      const logData = {
        level,
        type,
        message,
        data: {
          ...data,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href
        }
      };

      // Use fetch to send to backend logging endpoint
      await fetch(`${this.apiBaseUrl}/api/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logData)
      });
    } catch (error) {
      // Silently fail - don't break app if logging fails
      console.warn('Failed to send log to backend:', error);
    }
  }

  // General logging methods
  logInfo(message, data = {}) {
    initializeConfig();
    if (isDevelopment) {
      console.log(`[INFO] ${message}`, data);
    }
  }

  logDebug(message, data = {}) {
    initializeConfig();
    if (isDevelopment) {
      console.log(`[DEBUG] ${message}`, data);
    }
  }

  logWarn(message, data = {}) {
    initializeConfig();
    if (isDevelopment) {
      console.warn(`[WARN] ${message}`, data);
    }
  }

  logError(error, context = {}) {
    // Always show errors in console
    console.error('[ERROR]', error, context);
    
    // Send critical errors to backend
    if (context.type && criticalErrors.includes(context.type)) {
      this.sendToBackend('error', context.type, error.message || error, {
        ...context,
        stack: error.stack,
        category: 'frontend_error'
      });
    }
  }

  // User action logging
  logUserAction(action, data = {}) {
    if (isDevelopment) {
      console.log(`[USER_ACTION] ${action}`, data);
    }

    // Send critical user actions to backend
    if (criticalActions.includes(action)) {
      this.sendToBackend('info', 'user_action', action, {
        ...data,
        category: 'user_action'
      });
    }
  }

  // Authentication event logging
  logAuthEvent(event, data = {}) {
    if (isDevelopment) {
      console.log(`[AUTH] ${event}`, data);
    }

    // All auth events are critical
    this.sendToBackend('info', 'auth_event', event, {
      ...data,
      category: 'auth_event'
    });
  }

  // Game event logging
  logGameEvent(event, data = {}) {
    if (isDevelopment) {
      console.log(`[GAME] ${event}`, data);
    }

    // Send important game events to backend
    const importantGameEvents = ['game_start', 'bet_placed', 'game_end', 'game_error'];
    if (importantGameEvents.includes(event)) {
      this.sendToBackend('info', 'game_event', event, {
        ...data,
        category: 'game_event'
      });
    }
  }

  // WebSocket event logging
  logWebSocketEvent(event, data = {}) {
    if (isDevelopment) {
      console.log(`[WEBSOCKET] ${event}`, data);
    }

    // Send connection issues to backend
    const criticalWebSocketEvents = ['disconnect', 'error', 'connection_failed'];
    if (criticalWebSocketEvents.includes(event)) {
      this.sendToBackend('warn', 'websocket_event', event, {
        ...data,
        category: 'websocket_event'
      });
    }
  }

  // Performance logging
  logPerformance(metric, value, data = {}) {
    if (isDevelopment) {
      console.log(`[PERFORMANCE] ${metric}: ${value}ms`, data);
    }

    // Send slow operations to backend
    if (value > 1000) { // Operations slower than 1 second
      this.sendToBackend('warn', 'performance', `${metric} slow: ${value}ms`, {
        ...data,
        metric,
        value,
        category: 'performance'
      });
    }
  }

  // Network request logging
  logNetworkRequest(url, method, duration, status, data = {}) {
    if (isDevelopment) {
      console.log(`[NETWORK] ${method} ${url} - ${status} (${duration}ms)`, data);
    }

    // Send failed requests to backend
    if (status >= 400) {
      this.sendToBackend('error', 'network_error', `${method} ${url} failed with ${status}`, {
        ...data,
        url,
        method,
        duration,
        status,
        category: 'network_error'
      });
    }
  }
}

// Create singleton instance
const logger = new FrontendLogger();

export default logger;