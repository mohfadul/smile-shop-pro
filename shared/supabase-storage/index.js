const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// FREE ALTERNATIVE: Supabase Configuration (FREE - 1GB storage, 2GB bandwidth)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://piplzeixrpiwoqbgpvzp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key-here';

// Security check
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  SECURITY WARNING: Supabase credentials should be in environment variables');
  console.warn('⚠️  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
}

// Initialize Supabase client with service role
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Storage buckets configuration
const STORAGE_BUCKETS = {
  PRODUCTS: 'product-images',
  INVOICES: 'order-invoices', 
  REPORTS: 'analytics-reports',
  DOCUMENTS: 'user-documents',
  TEMP: 'temp-files'
};

// File type validation
const ALLOWED_FILE_TYPES = {
  images: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  spreadsheets: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
  all: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']
};

// File size limits (in bytes)
const FILE_SIZE_LIMITS = {
  image: 5 * 1024 * 1024,      // 5MB for images
  document: 10 * 1024 * 1024,   // 10MB for documents
  report: 50 * 1024 * 1024      // 50MB for reports
};

/**
 * Verify Supabase connection and service role key
 */
const verifySupabaseConnection = async () => {
  try {
    // Test connection by listing buckets
    const { data, error } = await supabase.storage.listBuckets();
    
    if (error) {
      throw new Error(`Supabase connection failed: ${error.message}`);
    }
    
    console.log('✅ Supabase connection verified successfully');
    console.log('📦 Available buckets:', data.map(bucket => bucket.name));
    
    return { success: true, buckets: data };
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    throw error;
  }
};

/**
 * Initialize storage buckets
 */
const initializeStorageBuckets = async () => {
  try {
    const bucketsToCreate = Object.values(STORAGE_BUCKETS);
    
    for (const bucketName of bucketsToCreate) {
      const { data: existingBucket } = await supabase.storage.getBucket(bucketName);
      
      if (!existingBucket) {
        const { data, error } = await supabase.storage.createBucket(bucketName, {
          public: bucketName === STORAGE_BUCKETS.PRODUCTS, // Only product images are public
          allowedMimeTypes: ALLOWED_FILE_TYPES.all,
          fileSizeLimit: FILE_SIZE_LIMITS.report
        });
        
        if (error && !error.message.includes('already exists')) {
          console.error(`Failed to create bucket ${bucketName}:`, error.message);
        } else {
          console.log(`✅ Bucket ${bucketName} created successfully`);
        }
      } else {
        console.log(`📦 Bucket ${bucketName} already exists`);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to initialize storage buckets:', error.message);
    throw error;
  }
};

/**
 * Generate unique filename with timestamp and random string
 */
const generateUniqueFilename = (originalName, prefix = '') => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension);
  
  return `${prefix}${prefix ? '_' : ''}${timestamp}_${randomString}_${baseName}${extension}`;
};

/**
 * Validate file type and size
 */
const validateFile = (file, allowedTypes, maxSize) => {
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
  }
  
  if (file.size > maxSize) {
    throw new Error(`File size exceeds limit. Maximum size: ${Math.round(maxSize / 1024 / 1024)}MB`);
  }
  
  return true;
};

/**
 * Upload file to Supabase Storage
 */
const uploadFile = async (file, bucketName, folder = '', options = {}) => {
  try {
    const {
      allowedTypes = ALLOWED_FILE_TYPES.all,
      maxSize = FILE_SIZE_LIMITS.document,
      makePublic = false,
      prefix = ''
    } = options;
    
    // Validate file
    validateFile(file, allowedTypes, maxSize);
    
    // Generate unique filename
    const filename = generateUniqueFilename(file.originalname, prefix);
    const filePath = folder ? `${folder}/${filename}` : filename;
    
    // Read file buffer
    const fileBuffer = file.buffer || await fs.readFile(file.path);
    
    // Upload to Supabase
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, fileBuffer, {
        contentType: file.mimetype,
        duplex: 'half'
      });
    
    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
    
    // Get public URL if bucket is public or makePublic is true
    let publicUrl = null;
    if (makePublic) {
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);
      publicUrl = urlData.publicUrl;
    }
    
    return {
      success: true,
      data: {
        path: data.path,
        fullPath: data.fullPath,
        id: data.id,
        publicUrl,
        filename,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        bucket: bucketName
      }
    };
    
  } catch (error) {
    console.error('Upload error:', error.message);
    throw error;
  }
};

/**
 * Download file from Supabase Storage
 */
const downloadFile = async (bucketName, filePath) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath);
    
    if (error) {
      throw new Error(`Download failed: ${error.message}`);
    }
    
    return {
      success: true,
      data: data,
      mimeType: data.type
    };
    
  } catch (error) {
    console.error('Download error:', error.message);
    throw error;
  }
};

/**
 * Delete file from Supabase Storage
 */
const deleteFile = async (bucketName, filePath) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .remove([filePath]);
    
    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
    
    return {
      success: true,
      data: data
    };
    
  } catch (error) {
    console.error('Delete error:', error.message);
    throw error;
  }
};

/**
 * Generate signed URL for private file access
 */
const generateSignedUrl = async (bucketName, filePath, expiresIn = 3600) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, expiresIn);
    
    if (error) {
      throw new Error(`Signed URL generation failed: ${error.message}`);
    }
    
    return {
      success: true,
      signedUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000)
    };
    
  } catch (error) {
    console.error('Signed URL error:', error.message);
    throw error;
  }
};

/**
 * List files in a bucket/folder
 */
const listFiles = async (bucketName, folder = '', options = {}) => {
  try {
    const { limit = 100, offset = 0, sortBy = { column: 'created_at', order: 'desc' } } = options;
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(folder, {
        limit,
        offset,
        sortBy
      });
    
    if (error) {
      throw new Error(`List files failed: ${error.message}`);
    }
    
    return {
      success: true,
      files: data
    };
    
  } catch (error) {
    console.error('List files error:', error.message);
    throw error;
  }
};

/**
 * Get file info
 */
const getFileInfo = async (bucketName, filePath) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list('', {
        search: path.basename(filePath)
      });
    
    if (error) {
      throw new Error(`Get file info failed: ${error.message}`);
    }
    
    const fileInfo = data.find(file => file.name === path.basename(filePath));
    
    if (!fileInfo) {
      throw new Error('File not found');
    }
    
    return {
      success: true,
      fileInfo
    };
    
  } catch (error) {
    console.error('Get file info error:', error.message);
    throw error;
  }
};

/**
 * Multer configuration for file uploads
 */
const createMulterConfig = (options = {}) => {
  const {
    allowedTypes = ALLOWED_FILE_TYPES.all,
    maxSize = FILE_SIZE_LIMITS.document,
    fieldName = 'file'
  } = options;
  
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxSize
    },
    fileFilter: (req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`), false);
      }
    }
  });
};

/**
 * Express middleware for file upload handling
 */
const createUploadMiddleware = (bucketName, options = {}) => {
  const multerConfig = createMulterConfig(options);
  
  return async (req, res, next) => {
    multerConfig.single(options.fieldName || 'file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: 'Upload error',
          message: err.message
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file provided',
          message: 'Please select a file to upload'
        });
      }
      
      try {
        const uploadResult = await uploadFile(req.file, bucketName, options.folder, options);
        req.uploadResult = uploadResult;
        next();
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          error: 'Upload failed',
          message: uploadError.message
        });
      }
    });
  };
};

module.exports = {
  supabase,
  STORAGE_BUCKETS,
  ALLOWED_FILE_TYPES,
  FILE_SIZE_LIMITS,
  verifySupabaseConnection,
  initializeStorageBuckets,
  uploadFile,
  downloadFile,
  deleteFile,
  generateSignedUrl,
  listFiles,
  getFileInfo,
  generateUniqueFilename,
  validateFile,
  createMulterConfig,
  createUploadMiddleware
};
