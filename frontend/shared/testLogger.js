import { getEnvironment } from './environment';

// Frontend test logger that syncs with backend via WebSocket
class FrontendTestLogger {
  constructor() {
    this.sessionStartTime = new Date().toISOString();
    this.logs = [];
    this.sendMessage = null; // Will be set by setSendMessage
    this.enabled = ['development', 'qa'].includes(getEnvironment());
    this.isLogging = false; // Prevent infinite loops
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };
    
    // Don't intercept console until WebSocket is ready
    // if (this.enabled) {
    //   this.interceptConsole();
    // }
  }
  
  setSendMessage(sendMessageFunc) {
    if (!this.enabled) return;
    
    this.sendMessage = sendMessageFunc;
    // Don't start logging yet - wait for WebSocket connection
  }
  
  onWebSocketConnected() {
    if (!this.enabled || !this.sendMessage) return;
    
    // Only start logging after WebSocket is successfully connected
    this.interceptConsole();
    this.sendLogToBackend('WEBSOCKET_CONNECTED', {
      sessionStartTime: this.sessionStartTime,
      userAgent: navigator.userAgent,
      url: window.location.href
    });
  }
  
  interceptConsole() {
    // Replace console methods to route through test logger
    console.log = (...args) => {
      this.logConsole('LOG', args);
      this.originalConsole.log(...args); // Still show in browser console
    };
    
    console.error = (...args) => {
      this.logConsole('ERROR', args);
      this.originalConsole.error(...args); // Still show in browser console
    };
    
    console.warn = (...args) => {
      this.logConsole('WARN', args);
      this.originalConsole.warn(...args); // Still show in browser console
    };
    
    console.info = (...args) => {
      this.logConsole('INFO', args);
      this.originalConsole.info(...args); // Still show in browser console
    };
  }
  
  logConsole(level, args) {
    // Prevent infinite loops
    if (this.isLogging) return;
    
    try {
      this.isLogging = true;
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      this.testLog('CONSOLE', `${level}: ${message}`);
    } catch (error) {
      // Use original console to break the loop
      this.originalConsole.error('Test logger error:', error);
    } finally {
      this.isLogging = false;
    }
  }


  sendLogToBackend(event, logData) {
    if (!this.enabled || !this.sendMessage || this.isLogging) return;
    
    try {
      this.sendMessage('testLog', {
        source: 'FRONTEND',
        event,
        logData
      });
    } catch (error) {
      // Silently fail if WebSocket is not connected - don't log this error
      // to avoid infinite loops during connection issues
      if (error.message && error.message.includes('WebSocket not connected')) {
        return; // Silently ignore WebSocket connection issues
      }
      // Only log non-WebSocket errors using original console
      this.originalConsole.warn('Failed to send log to backend:', error);
    }
  }

  testLog(event, data) {
    if (!this.enabled) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      data
    };
    this.logs.push(logEntry);
    this.sendLogToBackend(event, data);
  }
  
  restoreConsole() {
    // Restore original console methods if needed
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
  }
}

// Export singleton instance
const testLogger = new FrontendTestLogger();
export default testLogger;