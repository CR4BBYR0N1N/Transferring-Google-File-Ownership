// src/utils/validation.js
class ValidationUtils {
  /**
   * Validates an email address using a comprehensive regex pattern
   * This is more thorough than the basic validation in TransferService
   */
  static isValidEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }

    // RFC 5322 compliant email regex (simplified but robust)
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    return emailRegex.test(email) && email.length <= 254; // RFC limits email to 254 chars
  }

  /**
   * Validates a Google Drive file ID
   * Google Drive file IDs have specific patterns we can check
   */
  static isValidFileId(fileId) {
    if (!fileId || typeof fileId !== 'string') {
      return false;
    }

    // Google Drive file IDs are typically 28-44 characters long
    // and contain alphanumeric characters, hyphens, and underscores
    const fileIdRegex = /^[a-zA-Z0-9_-]{28,44}$/;
    return fileIdRegex.test(fileId);
  }

  /**
   * Validates an array of file IDs
   * This is useful for batch operations
   */
  static validateFileIds(fileIds) {
    if (!Array.isArray(fileIds)) {
      return { valid: false, error: 'File IDs must be provided as an array' };
    }

    if (fileIds.length === 0) {
      return { valid: false, error: 'At least one file ID must be provided' };
    }

    const invalidIds = fileIds.filter(id => !this.isValidFileId(id));
    
    if (invalidIds.length > 0) {
      return { 
        valid: false, 
        error: `Invalid file IDs found: ${invalidIds.join(', ')}` 
      };
    }

    return { valid: true };
  }

  /**
   * Validates transfer operation parameters
   * This ensures all required data is present and correct before starting
   */
  static validateTransferParams(sourceEmail, targetEmail, fileIds) {
    const errors = [];

    // Validate source email
    if (!this.isValidEmail(sourceEmail)) {
      errors.push('Invalid source email address');
    }

    // Validate target email
    if (!this.isValidEmail(targetEmail)) {
      errors.push('Invalid target email address');
    }

    // Check if source and target are the same
    if (sourceEmail === targetEmail) {
      errors.push('Source and target email addresses cannot be the same');
    }

    // Validate file IDs
    const fileIdValidation = this.validateFileIds(fileIds);
    if (!fileIdValidation.valid) {
      errors.push(fileIdValidation.error);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitizes user input to prevent injection attacks
   * This is especially important for file names and email addresses
   */
  static sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return input
      .trim()
      .replace(/[<>\"']/g, '') // Remove potentially dangerous characters
      .substring(0, 500); // Limit length to prevent abuse
  }

  /**
   * Validates configuration settings
   * This ensures the application is properly configured before running
   */
  static validateConfig(config) {
    const requiredFields = [
      'google.clientId',
      'google.clientSecret',
      'google.redirectUri'
    ];

    const missingFields = [];

    requiredFields.forEach(field => {
      const value = this.getNestedProperty(config, field);
      if (!value || value.trim() === '') {
        missingFields.push(field);
      }
    });

    return {
      valid: missingFields.length === 0,
      missingFields
    };
  }

  /**
   * Helper method to get nested object properties
   * Used for configuration validation
   */
  static getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Validates rate limiting parameters
   * This helps prevent API quota exhaustion
   */
  static validateRateLimitParams(delayMs, maxRetries) {
    const errors = [];

    if (typeof delayMs !== 'number' || delayMs < 0) {
      errors.push('Delay must be a non-negative number');
    }

    if (typeof maxRetries !== 'number' || maxRetries < 0 || maxRetries > 10) {
      errors.push('Max retries must be a number between 0 and 10');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = ValidationUtils;