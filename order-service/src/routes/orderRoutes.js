const express = require('express');
const { body, param, query } = require('express-validator');
const { 
  createOrder,
  getOrderById,
  getAllOrders,
  getUserOrders,
  updateOrderStatus,
  cancelOrder,
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
  getOrderItems,
  applyDiscount,
  removeDiscount,
  getOrderHistory,
  getOrderAnalytics,
  bulkUpdateOrders,
  exportOrders,
  getOrderInvoice,
  processRefund,
  addOrderNote,
  getOrderNotes
} = require('../controllers/orderController');

const { validateRequest } = require('../middlewares/validateRequest');
const { authenticateToken, authorizeRoles, optionalAuth } = require('../middlewares/auth');

const router = express.Router();

// Order validation schemas
const createOrderValidation = [
  body('customer_id')
    .optional()
    .isUUID()
    .withMessage('Valid customer ID required'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('Order must contain at least one item'),
  
  body('items.*.product_id')
    .isUUID()
    .withMessage('Valid product ID required'),
  
  body('items.*.variant_id')
    .optional()
    .isUUID()
    .withMessage('Valid variant ID required'),
  
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  
  body('items.*.unit_price')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be non-negative'),
  
  body('shipping_address')
    .isObject()
    .withMessage('Shipping address is required'),
  
  body('shipping_address.street')
    .notEmpty()
    .withMessage('Street address is required'),
  
  body('shipping_address.city')
    .notEmpty()
    .withMessage('City is required'),
  
  body('shipping_address.state')
    .notEmpty()
    .withMessage('State is required'),
  
  body('shipping_address.postal_code')
    .optional()
    .isLength({ min: 3, max: 10 })
    .withMessage('Invalid postal code'),
  
  body('shipping_address.country')
    .notEmpty()
    .withMessage('Country is required'),
  
  body('shipping_address.phone')
    .matches(/^(\+249|0)[0-9]{9}$/)
    .withMessage('Valid Sudanese phone number required'),
  
  body('billing_address')
    .optional()
    .isObject()
    .withMessage('Billing address must be an object'),
  
  body('payment_method')
    .isIn(['cash_on_delivery', 'bank_transfer', 'mobile_money'])
    .withMessage('Invalid payment method'),
  
  body('currency')
    .optional()
    .isIn(['USD', 'SDG'])
    .withMessage('Currency must be USD or SDG'),
  
  body('special_instructions')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Special instructions too long'),
  
  body('requires_prescription')
    .optional()
    .isBoolean()
    .withMessage('requires_prescription must be boolean')
];

const updateOrderStatusValidation = [
  body('status')
    .isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
    .withMessage('Invalid order status'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes too long')
];

const addOrderItemValidation = [
  body('product_id')
    .isUUID()
    .withMessage('Valid product ID required'),
  
  body('variant_id')
    .optional()
    .isUUID()
    .withMessage('Valid variant ID required'),
  
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  
  body('unit_price')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be non-negative')
];

const applyDiscountValidation = [
  body('discount_type')
    .isIn(['percentage', 'fixed_amount', 'coupon'])
    .withMessage('Invalid discount type'),
  
  body('discount_value')
    .isFloat({ min: 0 })
    .withMessage('Discount value must be non-negative'),
  
  body('coupon_code')
    .optional()
    .isLength({ min: 3, max: 20 })
    .withMessage('Invalid coupon code'),
  
  body('description')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Description too long')
];

// Public Routes (Guest orders)
router.post('/guest', createOrderValidation, validateRequest, createOrder);

// Customer Routes (Authentication required)
router.post('/', authenticateToken, createOrderValidation, validateRequest, createOrder);

router.get('/my-orders', authenticateToken, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1-50'),
  query('status').optional().isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
  query('start_date').optional().isISO8601().withMessage('Invalid start date'),
  query('end_date').optional().isISO8601().withMessage('Invalid end date')
], validateRequest, getUserOrders);

router.get('/:id', [
  param('id').isUUID().withMessage('Valid order ID required')
], validateRequest, optionalAuth, getOrderById);

router.put('/:id/cancel', authenticateToken, [
  param('id').isUUID().withMessage('Valid order ID required'),
  body('reason').optional().isLength({ max: 500 }).withMessage('Reason too long')
], validateRequest, cancelOrder);

router.get('/:id/items', [
  param('id').isUUID().withMessage('Valid order ID required')
], validateRequest, optionalAuth, getOrderItems);

router.get('/:id/history', [
  param('id').isUUID().withMessage('Valid order ID required')
], validateRequest, optionalAuth, getOrderHistory);

router.get('/:id/invoice', [
  param('id').isUUID().withMessage('Valid order ID required')
], validateRequest, optionalAuth, getOrderInvoice);

// Staff/Admin Routes
router.get('/', authenticateToken, authorizeRoles(['admin', 'manager', 'staff']), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('status').optional().isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
  query('customer_id').optional().isUUID().withMessage('Valid customer ID required'),
  query('payment_method').optional().isIn(['cash_on_delivery', 'bank_transfer', 'mobile_money']),
  query('start_date').optional().isISO8601().withMessage('Invalid start date'),
  query('end_date').optional().isISO8601().withMessage('Invalid end date'),
  query('sort').optional().isIn(['created_at', 'total_amount', 'status']),
  query('order').optional().isIn(['asc', 'desc'])
], validateRequest, getAllOrders);

router.put('/:id/status', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [param('id').isUUID().withMessage('Valid order ID required'), ...updateOrderStatusValidation], 
  validateRequest, 
  updateOrderStatus
);

router.post('/:id/items', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [param('id').isUUID().withMessage('Valid order ID required'), ...addOrderItemValidation], 
  validateRequest, 
  addOrderItem
);

router.put('/:id/items/:itemId', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('id').isUUID().withMessage('Valid order ID required'),
    param('itemId').isUUID().withMessage('Valid item ID required'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('unit_price').optional().isFloat({ min: 0 }).withMessage('Unit price must be non-negative')
  ], 
  validateRequest, 
  updateOrderItem
);

router.delete('/:id/items/:itemId', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('id').isUUID().withMessage('Valid order ID required'),
    param('itemId').isUUID().withMessage('Valid item ID required')
  ], 
  validateRequest, 
  removeOrderItem
);

router.post('/:id/discount', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [param('id').isUUID().withMessage('Valid order ID required'), ...applyDiscountValidation], 
  validateRequest, 
  applyDiscount
);

router.delete('/:id/discount/:discountId', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('id').isUUID().withMessage('Valid order ID required'),
    param('discountId').isUUID().withMessage('Valid discount ID required')
  ], 
  validateRequest, 
  removeDiscount
);

router.post('/:id/refund', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    param('id').isUUID().withMessage('Valid order ID required'),
    body('amount').isFloat({ min: 0 }).withMessage('Refund amount must be non-negative'),
    body('reason').notEmpty().withMessage('Refund reason is required'),
    body('refund_method').isIn(['bank_transfer', 'cash', 'store_credit']).withMessage('Invalid refund method')
  ], 
  validateRequest, 
  processRefund
);

router.post('/:id/notes', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('id').isUUID().withMessage('Valid order ID required'),
    body('note').isLength({ min: 1, max: 1000 }).withMessage('Note must be between 1-1000 characters'),
    body('is_internal').optional().isBoolean().withMessage('is_internal must be boolean')
  ], 
  validateRequest, 
  addOrderNote
);

router.get('/:id/notes', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [param('id').isUUID().withMessage('Valid order ID required')], 
  validateRequest, 
  getOrderNotes
);

// Admin Only Routes
router.get('/admin/analytics', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    query('period').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Invalid period'),
    query('start_date').optional().isISO8601().withMessage('Invalid start date'),
    query('end_date').optional().isISO8601().withMessage('Invalid end date'),
    query('group_by').optional().isIn(['status', 'payment_method', 'city', 'day', 'week', 'month']).withMessage('Invalid group_by')
  ], 
  validateRequest, 
  getOrderAnalytics
);

router.post('/admin/bulk-update', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    body('order_ids').isArray({ min: 1 }).withMessage('Order IDs array required'),
    body('order_ids.*').isUUID().withMessage('Invalid order ID format'),
    body('updates').isObject().withMessage('Updates object required')
  ], 
  validateRequest, 
  bulkUpdateOrders
);

router.get('/admin/export', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    query('format').optional().isIn(['csv', 'excel', 'pdf']).withMessage('Invalid export format'),
    query('start_date').optional().isISO8601().withMessage('Invalid start date'),
    query('end_date').optional().isISO8601().withMessage('Invalid end date'),
    query('status').optional().isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
  ], 
  validateRequest, 
  exportOrders
);

module.exports = router;
