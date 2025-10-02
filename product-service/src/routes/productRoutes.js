const express = require('express');
const { body, param, query } = require('express-validator');
const { 
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  getFeaturedProducts,
  searchProducts,
  getProductVariants,
  createProductVariant,
  updateProductVariant,
  deleteProductVariant,
  getProductImages,
  uploadProductImage,
  deleteProductImage,
  updateInventory,
  getInventoryHistory,
  getLowStockProducts,
  bulkUpdateProducts,
  bulkImportProducts,
  getProductAnalytics
} = require('../controllers/productController');

const { validateRequest } = require('../middlewares/validateRequest');
const { authenticateToken, authorizeRoles, optionalAuth } = require('../middlewares/auth');
const { uploadMiddleware } = require('../middlewares/upload');

const router = express.Router();

// Product validation schemas
const createProductValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Product name must be between 2 and 200 characters'),
  
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Product description must be between 10 and 2000 characters'),
  
  body('sku')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('SKU must be between 3 and 50 characters')
    .matches(/^[A-Z0-9-]+$/)
    .withMessage('SKU can only contain uppercase letters, numbers, and hyphens'),
  
  body('price')
    .isFloat({ min: 0.01 })
    .withMessage('Price must be greater than 0'),
  
  body('category_id')
    .isUUID()
    .withMessage('Valid category ID required'),
  
  body('brand')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Brand name must be between 1 and 100 characters'),
  
  body('stock_quantity')
    .isInt({ min: 0 })
    .withMessage('Stock quantity must be a non-negative integer'),
  
  body('min_stock_level')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum stock level must be a non-negative integer'),
  
  body('weight')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Weight must be non-negative'),
  
  body('dimensions')
    .optional()
    .isObject()
    .withMessage('Dimensions must be an object'),
  
  body('is_featured')
    .optional()
    .isBoolean()
    .withMessage('is_featured must be a boolean'),
  
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'discontinued'])
    .withMessage('Status must be active, inactive, or discontinued'),
  
  body('dental_category')
    .optional()
    .isIn(['equipment', 'instruments', 'supplies', 'consumables', 'pharmaceuticals', 'prosthetics', 'orthodontics', 'implants'])
    .withMessage('Invalid dental category'),
  
  body('requires_prescription')
    .optional()
    .isBoolean()
    .withMessage('requires_prescription must be a boolean')
];

const updateProductValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Product name must be between 2 and 200 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Product description must be between 10 and 2000 characters'),
  
  body('price')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Price must be greater than 0'),
  
  body('category_id')
    .optional()
    .isUUID()
    .withMessage('Valid category ID required'),
  
  body('brand')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Brand name must be between 1 and 100 characters'),
  
  body('stock_quantity')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Stock quantity must be a non-negative integer'),
  
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'discontinued'])
    .withMessage('Status must be active, inactive, or discontinued'),
  
  body('is_featured')
    .optional()
    .isBoolean()
    .withMessage('is_featured must be a boolean')
];

const createVariantValidation = [
  body('product_id')
    .isUUID()
    .withMessage('Valid product ID required'),
  
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Variant name must be between 1 and 100 characters'),
  
  body('sku')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('SKU must be between 3 and 50 characters'),
  
  body('price')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Price must be greater than 0'),
  
  body('stock_quantity')
    .isInt({ min: 0 })
    .withMessage('Stock quantity must be a non-negative integer'),
  
  body('attributes')
    .optional()
    .isObject()
    .withMessage('Attributes must be an object')
];

// Public Routes (no authentication required)
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('category').optional().isUUID().withMessage('Valid category ID required'),
  query('brand').optional().trim().isLength({ min: 1 }),
  query('status').optional().isIn(['active', 'inactive', 'discontinued']),
  query('dental_category').optional().isIn(['equipment', 'instruments', 'supplies', 'consumables', 'pharmaceuticals', 'prosthetics', 'orthodontics', 'implants']),
  query('sort').optional().isIn(['name', 'price', 'created_at', 'stock_quantity', 'rating']),
  query('order').optional().isIn(['asc', 'desc'])
], validateRequest, optionalAuth, getAllProducts);

router.get('/search', [
  query('q').notEmpty().withMessage('Search query required'),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category').optional().isUUID()
], validateRequest, optionalAuth, searchProducts);

router.get('/featured', [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1-50')
], validateRequest, optionalAuth, getFeaturedProducts);

router.get('/category/:categoryId', [
  param('categoryId').isUUID().withMessage('Valid category ID required'),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], validateRequest, optionalAuth, getProductsByCategory);

router.get('/:id', [
  param('id').isUUID().withMessage('Valid product ID required')
], validateRequest, optionalAuth, getProductById);

// Product Variants Routes
router.get('/:id/variants', [
  param('id').isUUID().withMessage('Valid product ID required')
], validateRequest, optionalAuth, getProductVariants);

// Product Images Routes
router.get('/:id/images', [
  param('id').isUUID().withMessage('Valid product ID required')
], validateRequest, optionalAuth, getProductImages);

// Staff/Admin Routes (authentication required)
router.post('/', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  createProductValidation, 
  validateRequest, 
  createProduct
);

router.put('/:id', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [param('id').isUUID().withMessage('Valid product ID required'), ...updateProductValidation], 
  validateRequest, 
  updateProduct
);

router.delete('/:id', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [param('id').isUUID().withMessage('Valid product ID required')], 
  validateRequest, 
  deleteProduct
);

// Inventory Management Routes
router.put('/:id/inventory', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('id').isUUID().withMessage('Valid product ID required'),
    body('quantity').isInt().withMessage('Quantity must be an integer'),
    body('operation').isIn(['add', 'subtract', 'set']).withMessage('Operation must be add, subtract, or set'),
    body('reason').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Reason must be between 1 and 200 characters')
  ], 
  validateRequest, 
  updateInventory
);

router.get('/:id/inventory/history', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('id').isUUID().withMessage('Valid product ID required'),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ], 
  validateRequest, 
  getInventoryHistory
);

// Product Variants Management
router.post('/:id/variants', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [param('id').isUUID().withMessage('Valid product ID required'), ...createVariantValidation], 
  validateRequest, 
  createProductVariant
);

router.put('/variants/:variantId', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('variantId').isUUID().withMessage('Valid variant ID required'),
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('price').optional().isFloat({ min: 0.01 }),
    body('stock_quantity').optional().isInt({ min: 0 })
  ], 
  validateRequest, 
  updateProductVariant
);

router.delete('/variants/:variantId', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [param('variantId').isUUID().withMessage('Valid variant ID required')], 
  validateRequest, 
  deleteProductVariant
);

// Image Management Routes
router.post('/:id/images', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  uploadMiddleware.single('image'),
  [param('id').isUUID().withMessage('Valid product ID required')], 
  validateRequest, 
  uploadProductImage
);

router.delete('/images/:imageId', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [param('imageId').isUUID().withMessage('Valid image ID required')], 
  validateRequest, 
  deleteProductImage
);

// Admin Only Routes
router.get('/admin/low-stock', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    query('threshold').optional().isInt({ min: 0 }).withMessage('Threshold must be non-negative integer'),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ], 
  validateRequest, 
  getLowStockProducts
);

router.get('/admin/analytics', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    query('period').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Invalid period'),
    query('start_date').optional().isISO8601().withMessage('Invalid start date'),
    query('end_date').optional().isISO8601().withMessage('Invalid end date')
  ], 
  validateRequest, 
  getProductAnalytics
);

router.post('/admin/bulk-update', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    body('product_ids').isArray({ min: 1 }).withMessage('Product IDs array required'),
    body('product_ids.*').isUUID().withMessage('Invalid product ID format'),
    body('updates').isObject().withMessage('Updates object required')
  ], 
  validateRequest, 
  bulkUpdateProducts
);

router.post('/admin/bulk-import', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  uploadMiddleware.single('csv'),
  bulkImportProducts
);

module.exports = router;
