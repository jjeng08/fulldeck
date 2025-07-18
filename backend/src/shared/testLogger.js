const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../../test-session.log');

class TestLogger {
  constructor() {
    this.sessionStartTime = new Date().toISOString();
    this.enabled = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'qa';
    this.isLogging = false; // Prevent infinite loops
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };
    
    if (this.enabled) {
      this.initializeLog();
      this.interceptConsole();
    }
  }
  
  interceptConsole() {
    // Replace console methods to route through test logger
    console.log = (...args) => {
      this.logConsole('LOG', args);
      this.originalConsole.log(...args); // Still show in terminal
    };
    
    console.error = (...args) => {
      this.logConsole('ERROR', args);
      this.originalConsole.error(...args); // Still show in terminal
    };
    
    console.warn = (...args) => {
      this.logConsole('WARN', args);
      this.originalConsole.warn(...args); // Still show in terminal
    };
    
    console.info = (...args) => {
      this.logConsole('INFO', args);
      this.originalConsole.info(...args); // Still show in terminal
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

  initializeLog() {
    const header = `
=== NEW SESSION STARTED: ${this.sessionStartTime} ===
Frontend/Backend Test Log - Auto-generated, not committed
========================================================

`;
    fs.writeFileSync(LOG_FILE, header);
  }

  testLog(source, event, data) {
    if (!this.enabled) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = `
[${timestamp}] ${source.toUpperCase()} - ${event}
${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}
----------------------------------------
`;
    fs.appendFileSync(LOG_FILE, logEntry);
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
const testLogger = new TestLogger();
module.exports = testLogger;