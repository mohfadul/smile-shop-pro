const express = require('express');
const { param, body } = require('express-validator');
const multer = require('multer');
const {
  uploadProductImage,
  uploadMultipleProductImages,
  deleteProductImage,
  getProductImages,
  generateProductImageSignedUrl,
  bulkDeleteProductImages
} = require('../controllers/fileController');
const { validateRequest } = require('../middlewares/validateRequest');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10 // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Product Image Routes

// Get product images (public)
router.get('/products/:id/images', [
  param('id').isUUID().withMessage('Valid product ID required')
], validateRequest, getProductImages);

// Upload single product image (staff/admin only)
router.post('/products/:id/images', 
  authenticateToken,
  authorizeRoles(['admin', 'manager', 'staff']),
  upload.single('image'),
  [
    param('id').isUUID().withMessage('Valid product ID required'),
    body('alt_text').optional().isLength({ max: 200 }).withMessage('Alt text too long'),
    body('is_primary').optional().isBoolean().withMessage('is_primary must be boolean')
  ],
  validateRequest,
  uploadProductImage
);

// Upload multiple product images (staff/admin only)
router.post('/products/:id/images/bulk', 
  authenticateToken,
  authorizeRoles(['admin', 'manager', 'staff']),
  upload.array('images', 10),
  [param('id').isUUID().withMessage('Valid product ID required')],
  validateRequest,
  uploadMultipleProductImages
);

// Delete product image (staff/admin only)
router.delete('/products/images/:imageId', 
  authenticateToken,
  authorizeRoles(['admin', 'manager', 'staff']),
  [param('imageId').isUUID().withMessage('Valid image ID required')],
  validateRequest,
  deleteProductImage
);

// Generate signed URL for product image (staff/admin only)
router.get('/products/images/:imageId/signed-url', 
  authenticateToken,
  authorizeRoles(['admin', 'manager', 'staff']),
  [
    param('imageId').isUUID().withMessage('Valid image ID required'),
    // query('expiresIn').optional().isInt({ min: 60, max: 86400 }).withMessage('Expires in must be between 60 seconds and 24 hours')
  ],
  validateRequest,
  generateProductImageSignedUrl
);

// Bulk delete product images (admin only)
router.delete('/products/images/bulk', 
  authenticateToken,
  authorizeRoles(['admin', 'manager']),
  [
    body('image_ids').isArray({ min: 1 }).withMessage('Image IDs array required'),
    body('image_ids.*').isUUID().withMessage('Invalid image ID format')
  ],
  validateRequest,
  bulkDeleteProductImages
);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'File size exceeds 5MB limit'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files',
        message: 'Maximum 10 files allowed'
      });
    }
  }
  
  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type',
      message: 'Only image files (JPEG, PNG, GIF, WebP) are allowed'
    });
  }
  
  next(error);
});

module.exports = router;
