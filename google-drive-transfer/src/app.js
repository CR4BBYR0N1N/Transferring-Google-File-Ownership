// src/app.js
const readline = require('readline-sync');
const GoogleAuth = require('./auth/auth');
const TokenManager = require('./auth/tokenManager');
const { DriveService, TransferService } = require('./services/transferService');
const ValidationUtils = require('./utils/validation');
const logger = require('./utils/logger');
const config = require('../config/config');

class GoogleDriveTransferApp {
  constructor() {
    this.tokenManager = new TokenManager();
    this.sourceAuth = null;
    this.targetAuth = null;
    this.sourceEmail = null;
    this.targetEmail = null;
  }

  /**
   * Main application entry point
   * This orchestrates the entire transfer process
   */
  async run() {
    try {
      console.log('\n🚀 Google Drive Ownership Transfer Application');
      console.log('===============================================\n');

      // Validate configuration first
      await this.validateConfiguration();

      // Ensure tokens directory exists
      await this.tokenManager.ensureTokensDirectory();

      // Show main menu
      await this.showMainMenu();

    } catch (error) {
      logger.error('Application error', error);
      console.error('❌ Application error:', error.message);
      process.exit(1);
    }
  }

  /**
   * Validates that the application is properly configured
   */
  async validateConfiguration() {
    const validation = ValidationUtils.validateConfig(config);
    
    if (!validation.valid) {
      console.error('❌ Configuration Error:');
      validation.missingFields.forEach(field => {
        console.error(`   - Missing: ${field}`);
      });
      console.error('\nPlease check your .env file and credentials.json');
      process.exit(1);
    }

    logger.info('Configuration validated successfully');
  }

  /**
   * Displays the main menu and handles user choices
   */
  async showMainMenu() {
    while (true) {
      console.log('\n📋 Main Menu:');
      console.log('1. Transfer single file ownership');
      console.log('2. Transfer multiple files ownership');
      console.log('3. List files owned by user');
      console.log('4. Manage authentication tokens');
      console.log('5. Exit');

      const choice = readline.question('\nSelect an option (1-5): ');

      switch (choice) {
        case '1':
          await this.handleSingleFileTransfer();
          break;
        case '2':
          await this.handleMultipleFileTransfer();
          break;
        case '3':
          await this.handleListFiles();
          break;
        case '4':
          await this.handleTokenManagement();
          break;
        case '5':
          console.log('\n👋 Goodbye!');
          process.exit(0);
        default:
          console.log('❌ Invalid option. Please try again.');
      }
    }
  }

  /**
   * Handles single file ownership transfer
   */
  async handleSingleFileTransfer() {
    try {
      console.log('\n📄 Single File Transfer');
      console.log('========================');

      // Get user inputs
      const sourceEmail = this.getUserInput('Enter source account email: ');
      const targetEmail = this.getUserInput('Enter target account email: ');
      const fileId = this.getUserInput('Enter Google Drive file ID: ');

      // Validate inputs
      const validation = ValidationUtils.validateTransferParams(sourceEmail, targetEmail, [fileId]);
      if (!validation.valid) {
        console.error('❌ Validation errors:');
        validation.errors.forEach(error => console.error(`   - ${error}`));
        return;
      }

      // Authenticate both accounts
      console.log('\n🔐 Authenticating accounts...');
      const { sourceAuth, targetAuth } = await this.authenticateAccounts(sourceEmail, targetEmail);

      // Create transfer service and execute transfer
      const transferService = new TransferService(sourceAuth, targetAuth);
      
      // Validate preconditions
      const preconditions = await transferService.validateTransferPreconditions(fileId, targetEmail);
      if (!preconditions.valid) {
        console.error(`❌ Transfer validation failed: ${preconditions.error}`);
        return;
      }

      console.log(`\n📋 Transfer Details:`);
      console.log(`   Source: ${preconditions.currentOwner}`);
      console.log(`   Target: ${targetEmail}`);
      console.log(`   File: ${preconditions.fileName}`);

      const confirm = readline.question('\nProceed with transfer? (y/N): ');
      if (confirm.toLowerCase() !== 'y') {
        console.log('Transfer cancelled.');
        return;
      }

      // Execute transfer
      logger.logTransferStart(sourceEmail, targetEmail, 1);
      const result = await transferService.transferFileOwnership(fileId, targetEmail, {
        sendNotificationEmail: true
      });

      if (result.success) {
        console.log('\n✅ Transfer completed successfully!');
        logger.logTransferComplete({ successful: 1, failed: 0, total: 1 });
      }

    } catch (error) {
      logger.error('Single file transfer failed', error);
      console.error(`❌ Transfer failed: ${error.message}`);
    }
  }

  /**
   * Handles multiple file ownership transfer
   */
  async handleMultipleFileTransfer() {
    try {
      console.log('\n📁 Multiple File Transfer');
      console.log('==========================');

      // Get user inputs
      const sourceEmail = this.getUserInput('Enter source account email: ');
      const targetEmail = this.getUserInput('Enter target account email: ');
      
      console.log('\nEnter file IDs (one per line, empty line to finish):');
      const fileIds = this.getMultipleFileIds();

      if (fileIds.length === 0) {
        console.log('No file IDs provided.');
        return;
      }

      // Validate inputs
      const validation = ValidationUtils.validateTransferParams(sourceEmail, targetEmail, fileIds);
      if (!validation.valid) {
        console.error('❌ Validation errors:');
        validation.errors.forEach(error => console.error(`   - ${error}`));
        return;
      }

      // Authenticate accounts
      console.log('\n🔐 Authenticating accounts...');
      const { sourceAuth, targetAuth } = await this.authenticateAccounts(sourceEmail, targetEmail);

      // Show transfer summary
      console.log(`\n📋 Transfer Summary:`);
      console.log(`   Source: ${sourceEmail}`);
      console.log(`   Target: ${targetEmail}`);
      console.log(`   Files: ${fileIds.length}`);

      const confirm = readline.question('\nProceed with batch transfer? (y/N): ');
      if (confirm.toLowerCase() !== 'y') {
        console.log('Transfer cancelled.');
        return;
      }

      // Execute batch transfer
      const transferService = new TransferService(sourceAuth, targetAuth);
      logger.logTransferStart(sourceEmail, targetEmail, fileIds.length);

      const batchResult = await transferService.batchTransferOwnership(fileIds, targetEmail, {
        delayBetweenTransfers: 1500, // 1.5 seconds between transfers
        continueOnError: true,
        sendNotificationEmail: true
      });

      // Display results
      console.log('\n📊 Transfer Results:');
      console.log(`   ✅ Successful: ${batchResult.summary.successful}`);
      console.log(`   ❌ Failed: ${batchResult.summary.failed}`);
      console.log(`   📁 Total: ${batchResult.summary.total}`);

      // Show failed transfers if any
      const failedTransfers = batchResult.results.filter(r => !r.success);
      if (failedTransfers.length > 0) {
        console.log('\n❌ Failed transfers:');
        failedTransfers.forEach(transfer => {
          console.log(`   - ${transfer.fileId}: ${transfer.error}`);
        });
      }

      logger.logTransferComplete(batchResult.summary);

    } catch (error) {
      logger.error('Multiple file transfer failed', error);
      console.error(`❌ Batch transfer failed: ${error.message}`);
    }
  }

  /**
   * Handles listing files owned by a user
   */
  async handleListFiles() {
    try {
      console.log('\n📋 List User Files');
      console.log('==================');

      const userEmail = this.getUserInput('Enter user email: ');
      
      if (!ValidationUtils.isValidEmail(userEmail)) {
        console.error('❌ Invalid email address');
        return;
      }

      // Authenticate user
      const googleAuth = new GoogleAuth();
      const authClient = await googleAuth.authenticate(userEmail);
      const driveService = new DriveService(authClient);

      console.log('\n🔍 Fetching files...');
      
      // Get user info
      const userInfo = await driveService.getCurrentUser();
      console.log(`📧 User: ${userInfo.displayName} (${userInfo.emailAddress})`);

      // List files
      const filesResponse = await driveService.listFiles({
        pageSize: 50,
        query: `'${userInfo.emailAddress}' in owners and trashed=false`
      });

      const files = filesResponse.files;
      
      if (files.length === 0) {
        console.log('\n📭 No files found.');
        return;
      }

      console.log(`\n📂 Found ${files.length} files:`);
      console.log(''.padEnd(80, '-'));
      
      files.forEach((file, index) => {
        console.log(`${(index + 1).toString().padStart(3)}. ${file.name}`);
        console.log(`     ID: ${file.id}`);
        console.log(`     Type: ${file.mimeType.split('/').pop()}`);
        if (file.webViewLink) {
          console.log(`     Link: ${file.webViewLink}`);
        }
        console.log('');
      });

    } catch (error) {
      logger.error('List files failed', error);
      console.error(`❌ Failed to list files: ${error.message}`);
    }
  }

  /**
   * Handles token management operations
   */
  async handleTokenManagement() {
    try {
      console.log('\n🔑 Token Management');
      console.log('===================');

      const authenticatedUsers = await this.tokenManager.listAuthenticatedUsers();
      
      if (authenticatedUsers.length === 0) {
        console.log('📭 No saved authentication tokens found.');
        return;
      }

      console.log('\n👥 Users with saved tokens:');
      authenticatedUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user}`);
      });

      console.log('\nOptions:');
      console.log('1. Remove tokens for a user');
      console.log('2. Back to main menu');

      const choice = readline.question('\nSelect an option (1-2): ');

      if (choice === '1') {
        const userIndex = parseInt(readline.question('Enter user number to remove: ')) - 1;
        
        if (userIndex >= 0 && userIndex < authenticatedUsers.length) {
          const userEmail = authenticatedUsers[userIndex];
          const confirm = readline.question(`Remove tokens for ${userEmail}? (y/N): `);
          
          if (confirm.toLowerCase() === 'y') {
            await this.tokenManager.removeTokens(userEmail);
            console.log(`✅ Tokens removed for ${userEmail}`);
          }
        } else {
          console.log('❌ Invalid user number');
        }
      }

    } catch (error) {
      logger.error('Token management failed', error);
      console.error(`❌ Token management failed: ${error.message}`);
    }
  }

  /**
   * Authenticates both source and target accounts
   */
  async authenticateAccounts(sourceEmail, targetEmail) {
    const googleAuth = new GoogleAuth();
    
    console.log(`🔐 Authenticating source account: ${sourceEmail}`);
    const sourceAuth = await googleAuth.authenticate(sourceEmail);
    
    console.log(`🔐 Authenticating target account: ${targetEmail}`);
    const targetAuth = await googleAuth.authenticate(targetEmail);
    
    return { sourceAuth, targetAuth };
  }

  /**
   * Gets user input with validation and sanitization
   */
  getUserInput(prompt) {
    const input = readline.question(prompt);
    return ValidationUtils.sanitizeInput(input);
  }

  /**
   * Gets multiple file IDs from user input
   */
  getMultipleFileIds() {
    const fileIds = [];
    
    while (true) {
      const fileId = readline.question('File ID: ').trim();
      
      if (fileId === '') {
        break;
      }
      
      if (ValidationUtils.isValidFileId(fileId)) {
        fileIds.push(fileId);
        console.log(`✅ Added file ID: ${fileId}`);
      } else {
        console.log(`❌ Invalid file ID: ${fileId}`);
      }
    }
    
    return fileIds;
  }
}

// Main execution
if (require.main === module) {
  const app = new GoogleDriveTransferApp();
  app.run().catch(error => {
    logger.error('Unhandled application error', error);
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = GoogleDriveTransferApp;