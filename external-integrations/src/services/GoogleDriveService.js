const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'google-drive-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.isConfigured = false;
    this.rootFolderId = null;
    this.initializeService();
  }

  async initializeService() {
    try {
      // Check if we're in development mode
      const isDevelopment = process.env.NODE_ENV === 'development' || process.env.GOOGLE_DRIVE_MOCK_MODE === 'true';

      if (isDevelopment) {
        logger.info('📁 Google Drive service initialized in mock mode (development)');
        this.isConfigured = true;
        return;
      }

      // FREE ALTERNATIVE: Google Drive API with Service Account (FREE - 15GB storage)
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        // Service Account authentication (FREE - recommended for server-to-server)
        const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        
        this.auth = new google.auth.GoogleAuth({
          credentials: serviceAccountKey,
          scopes: [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive.readonly'
          ]
        });

        this.drive = google.drive({ version: 'v3', auth: this.auth });
        
        // Set up root folder for dental store files
        this.rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || await this.createRootFolder();
        
        logger.info('📁 Google Drive service initialized with Service Account (FREE - 15GB)');
        logger.info(`📁 Root folder ID: ${this.rootFolderId}`);
        logger.info('📁 FREE tier includes: 15GB storage, API access, file sharing');
        this.isConfigured = true;
        return;
      }

      // FREE ALTERNATIVE: OAuth2 authentication (FREE - user-based access)
      if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          'https://developers.google.com/oauthplayground'
        );

        oauth2Client.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        this.auth = oauth2Client;
        this.drive = google.drive({ version: 'v3', auth: oauth2Client });
        
        this.rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || await this.createRootFolder();
        
        logger.info('📁 Google Drive service initialized with OAuth2 (FREE - 15GB)');
        logger.info('📁 Using personal Google account storage (FREE tier)');
        this.isConfigured = true;
        return;
      }

      logger.warn('📁 No Google Drive configuration found, Google Drive service disabled');
      this.isConfigured = false;

    } catch (error) {
      logger.error('📁 Failed to initialize Google Drive service:', error);
      this.isConfigured = false;
    }
  }

  async createRootFolder() {
    try {
      const folderMetadata = {
        name: 'Dental Store Sudan - Documents',
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Root folder for Dental Store Sudan documents, reports, and files'
      };

      const folder = await this.drive.files.create({
        resource: folderMetadata,
        fields: 'id, name, webViewLink'
      });

      logger.info(`📁 Created root folder: ${folder.data.name} (${folder.data.id})`);
      return folder.data.id;

    } catch (error) {
      logger.error('📁 Failed to create root folder:', error);
      throw error;
    }
  }

  async uploadFile({ filePath, fileName, mimeType, folderId = null, description = '' }) {
    try {
      if (!this.isConfigured) {
        logger.warn('📁 Google Drive service not configured, simulating upload');
        return {
          success: true,
          file_id: `mock_${Date.now()}`,
          file_name: fileName,
          web_view_link: `https://drive.google.com/file/d/mock_${Date.now()}/view`,
          download_link: `https://drive.google.com/uc?id=mock_${Date.now()}`,
          size: 0
        };
      }

      // Read file
      const fileBuffer = await fs.readFile(filePath);
      
      // Prepare file metadata
      const fileMetadata = {
        name: fileName,
        description: description,
        parents: [folderId || this.rootFolderId]
      };

      // Upload file
      const media = {
        mimeType: mimeType,
        body: fileBuffer
      };

      const file = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, size, webViewLink, createdTime, mimeType'
      });

      // Make file accessible (optional - depends on your sharing requirements)
      if (process.env.GOOGLE_DRIVE_MAKE_PUBLIC === 'true') {
        await this.drive.permissions.create({
          fileId: file.data.id,
          resource: {
            role: 'reader',
            type: 'anyone'
          }
        });
      }

      logger.info(`📁 File uploaded to Google Drive: ${fileName} (${file.data.id})`);

      return {
        success: true,
        file_id: file.data.id,
        file_name: file.data.name,
        web_view_link: file.data.webViewLink,
        download_link: `https://drive.google.com/uc?id=${file.data.id}`,
        size: parseInt(file.data.size),
        created_time: file.data.createdTime,
        mime_type: file.data.mimeType
      };

    } catch (error) {
      logger.error('📁 Failed to upload file to Google Drive:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async uploadBuffer({ buffer, fileName, mimeType, folderId = null, description = '' }) {
    try {
      if (!this.isConfigured) {
        logger.warn('📁 Google Drive service not configured, simulating buffer upload');
        return {
          success: true,
          file_id: `mock_${Date.now()}`,
          file_name: fileName,
          web_view_link: `https://drive.google.com/file/d/mock_${Date.now()}/view`,
          download_link: `https://drive.google.com/uc?id=mock_${Date.now()}`,
          size: buffer.length
        };
      }

      // Prepare file metadata
      const fileMetadata = {
        name: fileName,
        description: description,
        parents: [folderId || this.rootFolderId]
      };

      // Upload buffer
      const media = {
        mimeType: mimeType,
        body: buffer
      };

      const file = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, size, webViewLink, createdTime, mimeType'
      });

      // Make file accessible if configured
      if (process.env.GOOGLE_DRIVE_MAKE_PUBLIC === 'true') {
        await this.drive.permissions.create({
          fileId: file.data.id,
          resource: {
            role: 'reader',
            type: 'anyone'
          }
        });
      }

      logger.info(`📁 Buffer uploaded to Google Drive: ${fileName} (${file.data.id})`);

      return {
        success: true,
        file_id: file.data.id,
        file_name: file.data.name,
        web_view_link: file.data.webViewLink,
        download_link: `https://drive.google.com/uc?id=${file.data.id}`,
        size: parseInt(file.data.size),
        created_time: file.data.createdTime,
        mime_type: file.data.mimeType
      };

    } catch (error) {
      logger.error('📁 Failed to upload buffer to Google Drive:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createFolder({ folderName, parentFolderId = null, description = '' }) {
    try {
      if (!this.isConfigured) {
        logger.warn('📁 Google Drive service not configured, simulating folder creation');
        return {
          success: true,
          folder_id: `mock_folder_${Date.now()}`,
          folder_name: folderName,
          web_view_link: `https://drive.google.com/drive/folders/mock_folder_${Date.now()}`
        };
      }

      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        description: description,
        parents: [parentFolderId || this.rootFolderId]
      };

      const folder = await this.drive.files.create({
        resource: folderMetadata,
        fields: 'id, name, webViewLink, createdTime'
      });

      logger.info(`📁 Folder created in Google Drive: ${folderName} (${folder.data.id})`);

      return {
        success: true,
        folder_id: folder.data.id,
        folder_name: folder.data.name,
        web_view_link: folder.data.webViewLink,
        created_time: folder.data.createdTime
      };

    } catch (error) {
      logger.error('📁 Failed to create folder in Google Drive:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async listFiles({ folderId = null, pageSize = 50, pageToken = null }) {
    try {
      if (!this.isConfigured) {
        logger.warn('📁 Google Drive service not configured, returning mock file list');
        return {
          success: true,
          files: [
            {
              id: 'mock_file_1',
              name: 'Sample Invoice.pdf',
              mimeType: 'application/pdf',
              size: '125000',
              createdTime: new Date().toISOString(),
              webViewLink: 'https://drive.google.com/file/d/mock_file_1/view'
            }
          ],
          nextPageToken: null
        };
      }

      const query = folderId ? `'${folderId}' in parents and trashed=false` : `'${this.rootFolderId}' in parents and trashed=false`;

      const response = await this.drive.files.list({
        q: query,
        pageSize: pageSize,
        pageToken: pageToken,
        fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, thumbnailLink)',
        orderBy: 'createdTime desc'
      });

      return {
        success: true,
        files: response.data.files,
        nextPageToken: response.data.nextPageToken
      };

    } catch (error) {
      logger.error('📁 Failed to list files from Google Drive:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteFile(fileId) {
    try {
      if (!this.isConfigured) {
        logger.warn('📁 Google Drive service not configured, simulating file deletion');
        return {
          success: true,
          message: 'File deleted (mock mode)'
        };
      }

      await this.drive.files.delete({
        fileId: fileId
      });

      logger.info(`📁 File deleted from Google Drive: ${fileId}`);

      return {
        success: true,
        message: 'File deleted successfully'
      };

    } catch (error) {
      logger.error('📁 Failed to delete file from Google Drive:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async shareFile(fileId, email, role = 'reader') {
    try {
      if (!this.isConfigured) {
        logger.warn('📁 Google Drive service not configured, simulating file sharing');
        return {
          success: true,
          message: 'File shared (mock mode)',
          permission_id: `mock_permission_${Date.now()}`
        };
      }

      const permission = await this.drive.permissions.create({
        fileId: fileId,
        resource: {
          role: role, // 'reader', 'writer', 'commenter'
          type: 'user',
          emailAddress: email
        },
        sendNotificationEmail: true,
        emailMessage: 'You have been granted access to a document from Dental Store Sudan.'
      });

      logger.info(`📁 File shared with ${email}: ${fileId}`);

      return {
        success: true,
        message: 'File shared successfully',
        permission_id: permission.data.id
      };

    } catch (error) {
      logger.error('📁 Failed to share file:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getFileInfo(fileId) {
    try {
      if (!this.isConfigured) {
        logger.warn('📁 Google Drive service not configured, returning mock file info');
        return {
          success: true,
          file: {
            id: fileId,
            name: 'Mock File.pdf',
            mimeType: 'application/pdf',
            size: '125000',
            createdTime: new Date().toISOString(),
            webViewLink: `https://drive.google.com/file/d/${fileId}/view`
          }
        };
      }

      const file = await this.drive.files.get({
        fileId: fileId,
        fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, thumbnailLink, description, parents'
      });

      return {
        success: true,
        file: file.data
      };

    } catch (error) {
      logger.error('📁 Failed to get file info:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async verifyConnection() {
    try {
      if (!this.isConfigured) {
        return { success: false, error: 'Google Drive service not configured' };
      }

      if (process.env.NODE_ENV === 'development' || process.env.GOOGLE_DRIVE_MOCK_MODE === 'true') {
        return { success: true, message: 'Google Drive service in mock mode' };
      }

      // Test connection by getting user info
      const about = await this.drive.about.get({
        fields: 'user, storageQuota'
      });

      return {
        success: true,
        message: 'Google Drive service connection verified',
        user: about.data.user,
        storage: about.data.storageQuota
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Utility methods for common dental store operations

  async uploadInvoice(invoiceBuffer, orderNumber, customerName) {
    const fileName = `Invoice_${orderNumber}_${customerName.replace(/\s+/g, '_')}.pdf`;
    const description = `Invoice for order ${orderNumber} - Customer: ${customerName}`;

    // Create invoices folder if it doesn't exist
    const invoicesFolder = await this.getOrCreateFolder('Invoices');

    return await this.uploadBuffer({
      buffer: invoiceBuffer,
      fileName: fileName,
      mimeType: 'application/pdf',
      folderId: invoicesFolder.folder_id,
      description: description
    });
  }

  async uploadReport(reportBuffer, reportName, reportType) {
    const fileName = `${reportType}_Report_${reportName}_${new Date().toISOString().split('T')[0]}.pdf`;
    const description = `${reportType} report: ${reportName}`;

    // Create reports folder if it doesn't exist
    const reportsFolder = await this.getOrCreateFolder('Reports');

    return await this.uploadBuffer({
      buffer: reportBuffer,
      fileName: fileName,
      mimeType: 'application/pdf',
      folderId: reportsFolder.folder_id,
      description: description
    });
  }

  async getOrCreateFolder(folderName) {
    // Check if folder exists
    const existingFolders = await this.listFiles({ folderId: this.rootFolderId });
    
    if (existingFolders.success) {
      const existingFolder = existingFolders.files.find(file => 
        file.name === folderName && file.mimeType === 'application/vnd.google-apps.folder'
      );

      if (existingFolder) {
        return {
          success: true,
          folder_id: existingFolder.id,
          folder_name: existingFolder.name,
          web_view_link: existingFolder.webViewLink
        };
      }
    }

    // Create folder if it doesn't exist
    return await this.createFolder({ folderName: folderName });
  }
}

// Export singleton instance
module.exports = new GoogleDriveService();
