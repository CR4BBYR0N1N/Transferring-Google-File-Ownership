// src/auth/tokenManager.js
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config/config');

class TokenManager {
  constructor() {
    this.tokensDir = config.paths.tokens;
  }

  /**
   * Ensures the tokens directory exists
   */
  async ensureTokensDirectory() {
    try {
      await fs.mkdir(this.tokensDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Gets the path for a user's token file
   */
  getTokenPath(userEmail) {
    return path.join(this.tokensDir, `${userEmail}.json`);
  }

  /**
   * Checks if tokens exist for a user
   */
  async hasTokens(userEmail) {
    try {
      const tokenPath = this.getTokenPath(userEmail);
      await fs.access(tokenPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Lists all users who have saved tokens
   */
  async listAuthenticatedUsers() {
    try {
      const files = await fs.readdir(this.tokensDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Removes tokens for a specific user
   */
  async removeTokens(userEmail) {
    const tokenPath = this.getTokenPath(userEmail);
    try {
      await fs.unlink(tokenPath);
      console.log(`🗑️ Removed tokens for ${userEmail}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

module.exports = TokenManager;