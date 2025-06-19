// src/utils/logger.js
const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = './logs';
    this.ensureLogDirectory();
  }

  /**
   * Ensures the logs directory exists
   * This prevents errors when trying to write log files
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Gets current timestamp for log entries
   * Format: YYYY-MM-DD HH:MM:SS
   */
  getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substr(0, 19);
  }

  /**
   * Generic logging method that handles different log levels
   * This is the foundation for all other logging methods
   */
  log(level, message, data = null) {
    const timestamp = this.getTimestamp();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(data && { data })
    };

    // Console output with color coding
    const colorCodes = {
      INFO: '\x1b[36m',    // Cyan
      SUCCESS: '\x1b[32m', // Green  
      WARN: '\x1b[33m',    // Yellow
      ERROR: '\x1b[31m',   // Red
      DEBUG: '\x1b[35m'    // Magenta
    };

    const resetColor = '\x1b[0m';
    const color = colorCodes[level.toUpperCase()] || '';
    
    console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}${resetColor}`);
    
    if (data) {
      console.log(`${color}${JSON.stringify(data, null, 2)}${resetColor}`);
    }

    // File output
    this.writeToFile(logEntry);
  }

  /**
   * Writes log entries to a file
   * This creates a permanent record of application activity
   */
  writeToFile(logEntry) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const logFile = path.join(this.logDir, `app-${today}.log`);
    const logLine = JSON.stringify(logEntry) + '\n';

    fs.appendFileSync(logFile, logLine);
  }

  /**
   * Specific logging methods for different scenarios
   * These make the code more readable and semantic
   */
  info(message, data = null) {
    this.log('INFO', message, data);
  }

  success(message, data = null) {
    this.log('SUCCESS', message, data);
  }

  warn(message, data = null) {
    this.log('WARN', message, data);
  }

  error(message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      ...(error.code && { code: error.code })
    } : null;
    
    this.log('ERROR', message, errorData);
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      this.log('DEBUG', message, data);
    }
  }

  /**
   * Logs the start of a transfer operation
   * This creates a clear audit trail
   */
  logTransferStart(sourceEmail, targetEmail, fileCount) {
    this.info('Transfer operation started', {
      sourceEmail,
      targetEmail,
      fileCount,
      operationId: this.generateOperationId()
    });
  }

  /**
   * Logs the completion of a transfer operation
   */
  logTransferComplete(summary) {
    this.success('Transfer operation completed', summary);
  }

  /**
   * Generates a unique operation ID for tracking
   */
  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Create a singleton instance that can be imported throughout the app
const logger = new Logger();
module.exports = logger;