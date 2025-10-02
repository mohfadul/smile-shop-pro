const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProduct,
  createNewProduct,
  updateExistingProduct,
  deleteExistingProduct,
  searchProducts,
  getFeaturedProducts,
  getProductsByCategory,
  updateProductStock,
} = require('../controllers/productController');
const { body, param, query } = require('express-validator');
const { validateRequest } = require('../middlewares/validateRequest');

// Validation middleware for product routes
const productValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage('Product name must be between 2 and 255 characters'),

    body('sku')
      .trim()
      .isLength({ min: 3, max: 100 })
      .matches(/^[A-Za-z0-9_-]+$/)
      .withMessage('SKU must contain only letters, numbers, hyphens, and underscores'),

    body('price')
      .isFloat({ min: 0.01 })
      .withMessage('Price must be a positive number'),

    body('category_id')
      .optional()
      .isUUID()
      .withMessage('Category ID must be a valid UUID'),

    body('stock_quantity')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Stock quantity must be a non-negative integer'),

    body('status')
      .optional()
      .isIn(['active', 'inactive', 'discontinued', 'out_of_stock'])
      .withMessage('Status must be one of: active, inactive, discontinued, out_of_stock'),
  ],

  update: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage('Product name must be between 2 and 255 characters'),

    body('sku')
      .optional()
      .trim()
      .isLength({ min: 3, max: 100 })
      .matches(/^[A-Za-z0-9_-]+$/)
      .withMessage('SKU must contain only letters, numbers, hyphens, and underscores'),

    body('price')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Price must be a positive number'),

    body('stock_quantity')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Stock quantity must be a non-negative integer'),

    body('status')
      .optional()
      .isIn(['active', 'inactive', 'discontinued', 'out_of_stock'])
      .withMessage('Status must be one of: active, inactive, discontinued, out_of_stock'),
  ],

  stockUpdate: [
    body('stock_quantity')
      .isInt({ min: 0 })
      .withMessage('Stock quantity must be a non-negative integer'),

    body('operation')
      .optional()
      .isIn(['set', 'add', 'subtract'])
      .withMessage('Operation must be one of: set, add, subtract'),
  ],
};

// Query parameter validation
const queryValidation = {
  search: [
    query('q')
      .isLength({ min: 2, max: 100 })
      .withMessage('Search query must be between 2 and 100 characters'),
  ],
};

// Routes

// GET /api/products - Get all products with filtering
router.get('/', queryValidation.search, validateRequest, getProducts);

// GET /api/products/search?q=query - Search products
router.get('/search', queryValidation.search, validateRequest, searchProducts);

// GET /api/products/featured - Get featured products
router.get('/featured', getFeaturedProducts);

// GET /api/products/category/:categoryId - Get products by category
router.get('/category/:categoryId',
  param('categoryId').isUUID().withMessage('Category ID must be a valid UUID'),
  validateRequest,
  getProductsByCategory
);

// GET /api/products/:id - Get single product
router.get('/:id',
  param('id').isUUID().withMessage('Product ID must be a valid UUID'),
  validateRequest,
  getProduct
);

// POST /api/products - Create new product (Admin only)
router.post('/', productValidation.create, validateRequest, createNewProduct);

// PUT /api/products/:id - Update product (Admin only)
router.put('/:id',
  param('id').isUUID().withMessage('Product ID must be a valid UUID'),
  productValidation.update,
  validateRequest,
  updateExistingProduct
);

// PATCH /api/products/:id/stock - Update product stock
router.patch('/:id/stock',
  param('id').isUUID().withMessage('Product ID must be a valid UUID'),
  productValidation.stockUpdate,
  validateRequest,
  updateProductStock
);

// DELETE /api/products/:id - Delete product (Admin only)
router.delete('/:id',
  param('id').isUUID().withMessage('Product ID must be a valid UUID'),
  validateRequest,
  deleteExistingProduct
);

module.exports = router;
