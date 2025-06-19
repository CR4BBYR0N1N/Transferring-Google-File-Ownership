// src/services/driveService.js
const { google } = require('googleapis');

class DriveService {
  constructor(authClient) {
    this.drive = google.drive({ version: 'v3', auth: authClient });
    this.authClient = authClient;
  }

  /**
   * Lists files owned by the current user
   * This method supports pagination for handling large numbers of files
   */
  async listFiles(options = {}) {
    try {
      const {
        pageSize = 100,
        pageToken = null,
        query = null,
        orderBy = 'name'
      } = options;

      const params = {
        pageSize,
        fields: 'nextPageToken, files(id, name, mimeType, owners, parents, webViewLink)',
        orderBy
      };

      if (pageToken) params.pageToken = pageToken;
      if (query) params.q = query;

      const response = await this.drive.files.list(params);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Gets detailed information about a specific file
   * This includes ownership, permissions, and other metadata
   */
  async getFileDetails(fileId) {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, owners, permissions, parents, webViewLink, size, createdTime, modifiedTime'
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get file details: ${error.message}`);
    }
  }

  /**
   * Lists all permissions for a specific file
   * This is crucial for understanding who has access to a file
   */
  async getFilePermissions(fileId) {
    try {
      const response = await this.drive.permissions.list({
        fileId,
        fields: 'permissions(id, role, type, emailAddress, displayName)'
      });
      return response.data.permissions;
    } catch (error) {
      throw new Error(`Failed to get file permissions: ${error.message}`);
    }
  }

  /**
   * Searches for files using Google Drive's query syntax
   * This is more powerful than the basic list method
   */
  async searchFiles(query, options = {}) {
    try {
      const searchQuery = query;
      const listOptions = {
        ...options,
        query: searchQuery
      };
      return await this.listFiles(listOptions);
    } catch (error) {
      throw new Error(`Failed to search files: ${error.message}`);
    }
  }

  /**
   * Gets the current user's information
   * This helps us identify who owns what
   */
  async getCurrentUser() {
    try {
      const response = await this.drive.about.get({
        fields: 'user(displayName, emailAddress, photoLink)'
      });
      return response.data.user;
    } catch (error) {
      throw new Error(`Failed to get current user: ${error.message}`);
    }
  }

  /**
   * Checks if a file exists and is accessible
   */
  async fileExists(fileId) {
    try {
      await this.drive.files.get({ fileId, fields: 'id' });
      return true;
    } catch (error) {
      if (error.code === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets files by their names (useful for finding specific documents)
   */
  async getFilesByName(fileName) {
    const query = `name='${fileName}' and trashed=false`;
    return await this.searchFiles(query);
  }

  /**
   * Gets all files in a specific folder
   */
  async getFilesInFolder(folderId, options = {}) {
    const query = `'${folderId}' in parents and trashed=false`;
    return await this.searchFiles(query, options);
  }
}

module.exports = DriveService;