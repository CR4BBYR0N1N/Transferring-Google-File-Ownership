// src/auth/auth.js
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline-sync');
const config = require('../../config/config');

class GoogleAuth {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  /**
   * Generates an authorization URL for the user to visit
   * This is the first step in the OAuth 2.0 flow
   */
  getAuthUrl() {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // This ensures we get a refresh token
      scope: config.google.scopes,
      prompt: 'consent' // Forces consent screen to show, ensuring refresh token
    });
    return authUrl;
  }

  /**
   * Exchanges the authorization code for access and refresh tokens
   * This completes the OAuth 2.0 flow
   */
  async getTokens(code) {
    try {
      const { tokens } = await this.oauth2Client.getAccessToken(code);
      this.oauth2Client.setCredentials(tokens);
      return tokens;
    } catch (error) {
      throw new Error(`Error retrieving access token: ${error.message}`);
    }
  }

  /**
   * Authenticates a user and returns an authenticated client
   * This method handles the entire authentication flow
   */
  async authenticate(userEmail) {
    const tokenPath = path.join(config.paths.tokens, `${userEmail}.json`);

    try {
      // Try to load existing tokens first
      const tokens = await this.loadTokens(tokenPath);
      this.oauth2Client.setCredentials(tokens);
      
      // Test if the tokens are still valid
      await this.testTokenValidity();
      console.log(`✅ Successfully authenticated ${userEmail} using saved tokens`);
      
      return this.oauth2Client;
    } catch (error) {
      console.log(`🔄 Need to get new tokens for ${userEmail}`);
      return await this.performNewAuthentication(userEmail, tokenPath);
    }
  }

  /**
   * Performs a fresh authentication flow
   */
  async performNewAuthentication(userEmail, tokenPath) {
    const authUrl = this.getAuthUrl();
    
    console.log('\n📱 Please visit this URL to authorize the application:');
    console.log(authUrl);
    console.log('\nAfter authorization, you will get a code. Copy and paste it here.');
    
    const code = readline.question('Enter the authorization code: ');
    
    try {
      const tokens = await this.getTokens(code);
      await this.saveTokens(tokenPath, tokens);
      console.log(`✅ Successfully authenticated and saved tokens for ${userEmail}`);
      
      return this.oauth2Client;
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Tests if the current tokens are valid by making a simple API call
   */
  async testTokenValidity() {
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    await drive.about.get({ fields: 'user' });
  }

  /**
   * Loads tokens from a file
   */
  async loadTokens(tokenPath) {
    try {
      const data = await fs.readFile(tokenPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Cannot load tokens from ${tokenPath}`);
    }
  }

  /**
   * Saves tokens to a file
   */
  async saveTokens(tokenPath, tokens) {
    try {
      // Ensure the tokens directory exists
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
    } catch (error) {
      throw new Error(`Cannot save tokens to ${tokenPath}: ${error.message}`);
    }
  }

  /**
   * Creates a new OAuth2 client instance
   * This is useful when you need multiple authentication contexts
   */
  createNewClient() {
    return new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }
}

module.exports = GoogleAuth;