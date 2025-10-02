const express = require('express');
const router = express.Router();
const {
  getOrders,
  getOrder,
  createNewOrder,
  updateOrder,
  cancelExistingOrder,
  getOrderItems,
  getOrderHistory,
  updatePaymentStatus,
  getUserOrders,
} = require('../controllers/orderController');
const { body, param, query } = require('express-validator');
const { validateRequest } = require('../middlewares/validateRequest');

// Validation middleware for order routes
const orderValidation = {
  create: [
    body('items')
      .isArray({ min: 1 })
      .withMessage('Order must contain at least one item'),

    body('items.*.product_id')
      .isUUID()
      .withMessage('Product ID must be a valid UUID'),

    body('items.*.quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be a positive integer'),

    body('items.*.unit_price')
      .isFloat({ min: 0 })
      .withMessage('Unit price must be a non-negative number'),

    body('shipping_address')
      .isObject()
      .withMessage('Shipping address is required'),

    body('shipping_address.street')
      .trim()
      .isLength({ min: 5, max: 255 })
      .withMessage('Street address must be between 5 and 255 characters'),

    body('shipping_address.city')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('City must be between 2 and 100 characters'),

    body('shipping_address.state')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('State must be between 2 and 100 characters'),

    body('shipping_address.zip')
      .trim()
      .isLength({ min: 5, max: 20 })
      .withMessage('ZIP code must be between 5 and 20 characters'),

    body('shipping_address.country')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Country must be between 2 and 100 characters'),

    body('shipping_method')
      .optional()
      .isIn(['standard', 'express', 'overnight', 'pickup'])
      .withMessage('Invalid shipping method'),

    body('notes')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Notes must be less than 1000 characters'),

    body('coupon_code')
      .optional()
      .isLength({ max: 50 })
      .withMessage('Coupon code must be less than 50 characters'),
  ],

  update: [
    body('status')
      .isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
      .withMessage('Invalid order status'),

    body('notes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Notes must be less than 500 characters'),
  ],

  cancel: [
    body('reason')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Cancellation reason must be less than 500 characters'),
  ],

  payment: [
    body('payment_status')
      .isIn(['pending', 'paid', 'failed', 'refunded', 'cancelled'])
      .withMessage('Invalid payment status'),

    body('payment_reference')
      .optional()
      .isLength({ max: 255 })
      .withMessage('Payment reference must be less than 255 characters'),
  ],
};

// Query parameter validation
const queryValidation = {
  list: [
    query('status')
      .optional()
      .isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
      .withMessage('Invalid status filter'),

    query('payment_status')
      .optional()
      .isIn(['pending', 'paid', 'failed', 'refunded', 'cancelled'])
      .withMessage('Invalid payment status filter'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),

    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative'),
  ],
};

// Routes

// GET /api/orders - Get all orders (Admin/Manager) or user's orders
router.get('/', queryValidation.list, validateRequest, getOrders);

// GET /api/orders/my - Get current user's orders
router.get('/my', getUserOrders);

// GET /api/orders/:id - Get single order
router.get('/:id',
  param('id').isUUID().withMessage('Order ID must be a valid UUID'),
  validateRequest,
  getOrder
);

// GET /api/orders/:id/items - Get order items
router.get('/:id/items',
  param('id').isUUID().withMessage('Order ID must be a valid UUID'),
  validateRequest,
  getOrderItems
);

// GET /api/orders/:id/history - Get order status history
router.get('/:id/history',
  param('id').isUUID().withMessage('Order ID must be a valid UUID'),
  validateRequest,
  getOrderHistory
);

// POST /api/orders - Create new order
router.post('/', orderValidation.create, validateRequest, createNewOrder);

// PUT /api/orders/:id - Update order status (Admin/Manager only)
router.put('/:id',
  param('id').isUUID().withMessage('Order ID must be a valid UUID'),
  orderValidation.update,
  validateRequest,
  updateOrder
);

// POST /api/orders/:id/cancel - Cancel order
router.post('/:id/cancel',
  param('id').isUUID().withMessage('Order ID must be a valid UUID'),
  orderValidation.cancel,
  validateRequest,
  cancelExistingOrder
);

// PATCH /api/orders/:id/payment - Update payment status (usually called by payment-service)
router.patch('/:id/payment',
  param('id').isUUID().withMessage('Order ID must be a valid UUID'),
  orderValidation.payment,
  validateRequest,
  updatePaymentStatus
);

module.exports = router;
