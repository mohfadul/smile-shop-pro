const express = require('express');
const router = express.Router();
const {
  getCategories,
  getCategory,
  createNewCategory,
  updateCategory,
  deleteCategory,
  getCategoryTree,
} = require('../controllers/categoryController');
const { body, param } = require('express-validator');
const { validateRequest } = require('../middlewares/validateRequest');

// Validation middleware for category routes
const categoryValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Category name must be between 2 and 100 characters')
      .matches(/^[a-zA-Z0-9\s\-&()]+$/)
      .withMessage('Category name can only contain letters, numbers, spaces, hyphens, and basic punctuation'),

    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),

    body('parent_category_id')
      .optional()
      .isUUID()
      .withMessage('Parent category ID must be a valid UUID'),

    body('sort_order')
      .optional()
      .isInt({ min: 0, max: 1000 })
      .withMessage('Sort order must be between 0 and 1000'),
  ],

  update: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Category name must be between 2 and 100 characters'),

    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),

    body('parent_category_id')
      .optional()
      .isUUID()
      .withMessage('Parent category ID must be a valid UUID'),

    body('sort_order')
      .optional()
      .isInt({ min: 0, max: 1000 })
      .withMessage('Sort order must be between 0 and 1000'),

    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean'),
  ],
};

// Routes

// GET /api/categories - Get all categories (hierarchical)
router.get('/', getCategories);

// GET /api/categories/tree - Get category tree structure
router.get('/tree', getCategoryTree);

// GET /api/categories/:id - Get single category
router.get('/:id',
  param('id').isUUID().withMessage('Category ID must be a valid UUID'),
  validateRequest,
  getCategory
);

// POST /api/categories - Create new category (Admin only)
router.post('/', categoryValidation.create, validateRequest, createNewCategory);

// PUT /api/categories/:id - Update category (Admin only)
router.put('/:id',
  param('id').isUUID().withMessage('Category ID must be a valid UUID'),
  categoryValidation.update,
  validateRequest,
  updateCategory
);

// DELETE /api/categories/:id - Delete category (Admin only)
router.delete('/:id',
  param('id').isUUID().withMessage('Category ID must be a valid UUID'),
  validateRequest,
  deleteCategory
);

module.exports = router;
