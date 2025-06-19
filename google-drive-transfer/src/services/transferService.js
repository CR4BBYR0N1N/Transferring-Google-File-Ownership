// src/services/transferService.js
const { google } = require('googleapis');

class TransferService {
  constructor(sourceAuthClient, targetAuthClient) {
    this.sourceDrive = google.drive({ version: 'v3', auth: sourceAuthClient });
    this.targetDrive = google.drive({ version: 'v3', auth: targetAuthClient });
    this.sourceAuth = sourceAuthClient;
    this.targetAuth = targetAuthClient;
  }

  /**
   * Transfers ownership of a single file
   * This is the core functionality of our application
   */
  async transferFileOwnership(fileId, newOwnerEmail, options = {}) {
    try {
      const {
        transferOwnership = true,
        sendNotificationEmail = false,
        moveToNewOwnerDrive = false
      } = options;

      console.log(`🔄 Starting ownership transfer for file ${fileId} to ${newOwnerEmail}`);

      // Step 1: Verify the file exists and get its current state
      const fileDetails = await this.getFileDetails(fileId);
      console.log(`📄 File: ${fileDetails.name}`);

      // Step 2: Check if the new owner already has access
      const existingPermissions = await this.getFilePermissions(fileId);
      const existingPermission = existingPermissions.find(
        perm => perm.emailAddress === newOwnerEmail
      );

      if (existingPermission && existingPermission.role === 'owner') {
        console.log(`✅ ${newOwnerEmail} is already the owner of this file`);
        return { success: true, message: 'Already owner', fileId, fileName: fileDetails.name };
      }

      // Step 3: Add the new owner with 'writer' permissions first
      // Google requires this step before transferring ownership
      if (!existingPermission) {
        await this.addPermission(fileId, newOwnerEmail, 'writer');
        console.log(`📝 Added writer permission for ${newOwnerEmail}`);
      }

      // Step 4: Transfer ownership
      if (transferOwnership) {
        await this.promoteToOwner(fileId, newOwnerEmail, sendNotificationEmail);
        console.log(`👑 Transferred ownership to ${newOwnerEmail}`);
      }

      return {
        success: true,
        message: 'Ownership transferred successfully',
        fileId,
        fileName: fileDetails.name,
        newOwner: newOwnerEmail
      };

    } catch (error) {
      console.error(`❌ Failed to transfer ownership: ${error.message}`);
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }

  /**
   * Transfers ownership of multiple files in batch
   * This method includes error handling for individual file failures
   */
  async batchTransferOwnership(fileIds, newOwnerEmail, options = {}) {
    const results = [];
    const { 
      delayBetweenTransfers = 1000,
      continueOnError = true 
    } = options;

    console.log(`🚀 Starting batch transfer of ${fileIds.length} files to ${newOwnerEmail}`);

    for (let i = 0; i < fileIds.length; i++) {
      const fileId = fileIds[i];
      
      try {
        console.log(`\n📂 Processing file ${i + 1} of ${fileIds.length}`);
        const result = await this.transferFileOwnership(fileId, newOwnerEmail, options);
        results.push(result);
        
        // Add delay to respect API rate limits
        if (i < fileIds.length - 1) {
          await this.delay(delayBetweenTransfers);
        }
        
      } catch (error) {
        const errorResult = {
          success: false,
          error: error.message,
          fileId
        };
        
        results.push(errorResult);
        
        if (!continueOnError) {
          console.log(`🛑 Stopping batch transfer due to error: ${error.message}`);
          break;
        } else {
          console.log(`⚠️ Error with file ${fileId}, continuing: ${error.message}`);
        }
      }
    }

    // Provide summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n📊 Batch transfer completed:`);
    console.log(`   ✅ Successful: ${successful}`);
    console.log(`   ❌ Failed: ${failed}`);

    return {
      results,
      summary: { successful, failed, total: fileIds.length }
    };
  }

  /**
   * Adds a permission to a file
   * This is a helper method used in the ownership transfer process
   */
  async addPermission(fileId, emailAddress, role, type = 'user') {
    try {
      const permission = {
        role,
        type,
        emailAddress
      };

      const response = await this.sourceDrive.permissions.create({
        fileId,
        resource: permission,
        fields: 'id'
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to add permission: ${error.message}`);
    }
  }

  /**
   * Promotes a user to owner of a file
   * This is where the actual ownership transfer happens
   */
  async promoteToOwner(fileId, emailAddress, sendNotificationEmail = false) {
    try {
      // First, find the permission ID for the user
      const permissions = await this.getFilePermissions(fileId);
      const userPermission = permissions.find(perm => perm.emailAddress === emailAddress);
      
      if (!userPermission) {
        throw new Error(`User ${emailAddress} does not have permission to this file`);
      }

      // Update the permission to owner role
      await this.sourceDrive.permissions.update({
        fileId,
        permissionId: userPermission.id,
        resource: {
          role: 'owner'
        },
        transferOwnership: true,
        sendNotificationEmail
      });

    } catch (error) {
      throw new Error(`Failed to promote to owner: ${error.message}`);
    }
  }

  /**
   * Gets detailed information about a file (using source drive context)
   */
  async getFileDetails(fileId) {
    try {
      const response = await this.sourceDrive.files.get({
        fileId,
        fields: 'id, name, mimeType, owners, parents, webViewLink, size'
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get file details: ${error.message}`);
    }
  }

  /**
   * Gets permissions for a file (using source drive context)
   */
  async getFilePermissions(fileId) {
    try {
      const response = await this.sourceDrive.permissions.list({
        fileId,
        fields: 'permissions(id, role, type, emailAddress, displayName)'
      });
      return response.data.permissions;
    } catch (error) {
      throw new Error(`Failed to get permissions: ${error.message}`);
    }
  }

  /**
   * Utility method to add delays between API calls
   * This helps prevent rate limiting issues
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validates that both users can access the file before transfer
   */
  async validateTransferPreconditions(fileId, newOwnerEmail) {
    try {
      // Check if source user owns the file
      const fileDetails = await this.getFileDetails(fileId);
      const currentOwner = fileDetails.owners && fileDetails.owners[0];
      
      if (!currentOwner) {
        throw new Error('Could not determine current file owner');
      }

      // Verify the new owner email is valid (basic validation)
      if (!this.isValidEmail(newOwnerEmail)) {
        throw new Error('Invalid new owner email address');
      }

      return {
        valid: true,
        currentOwner: currentOwner.emailAddress,
        fileName: fileDetails.name
      };

    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Basic email validation
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

module.exports = TransferService;