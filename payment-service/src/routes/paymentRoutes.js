const express = require('express');
const { body, param, query } = require('express-validator');
const { 
  createBankTransferPayment,
  createCashPayment,
  createMobileMoneyPayment,
  confirmBankTransferPayment,
  getBankInstructions,
  getPaymentById,
  getAllPayments,
  getUserPayments,
  updatePaymentStatus,
  processRefund,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  getPaymentAnalytics,
  reconcilePayments,
  exportPayments,
  getPaymentReceipt,
  disputePayment,
  resolveDispute,
  getExchangeRates,
  updateExchangeRate,
  calculateFees,
  bulkPaymentProcessing
} = require('../controllers/paymentController');

const { validateRequest } = require('../middlewares/validateRequest');
const { authenticateToken, authorizeRoles, optionalAuth } = require('../middlewares/auth');

const router = express.Router();

// Payment validation schemas
const createBankTransferValidation = [
  body('order_id')
    .isUUID()
    .withMessage('Valid order ID required'),
  
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  
  body('currency')
    .isIn(['USD', 'SDG'])
    .withMessage('Currency must be USD or SDG'),
  
  body('bank_code')
    .isIn(['BOK', 'BOS', 'ANB', 'FDB', 'UAB', 'ISB'])
    .withMessage('Invalid bank code'),
  
  body('customer_info')
    .isObject()
    .withMessage('Customer information is required'),
  
  body('customer_info.name')
    .notEmpty()
    .withMessage('Customer name is required'),
  
  body('customer_info.phone')
    .matches(/^(\+249|0)[0-9]{9}$/)
    .withMessage('Valid Sudanese phone number required')
];

const createCashPaymentValidation = [
  body('order_id')
    .isUUID()
    .withMessage('Valid order ID required'),
  
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  
  body('currency')
    .isIn(['USD', 'SDG'])
    .withMessage('Currency must be USD or SDG'),
  
  body('delivery_address')
    .isObject()
    .withMessage('Delivery address is required'),
  
  body('delivery_address.street')
    .notEmpty()
    .withMessage('Street address is required'),
  
  body('delivery_address.city')
    .notEmpty()
    .withMessage('City is required'),
  
  body('delivery_address.phone')
    .matches(/^(\+249|0)[0-9]{9}$/)
    .withMessage('Valid phone number required')
];

const createMobileMoneyValidation = [
  body('order_id')
    .isUUID()
    .withMessage('Valid order ID required'),
  
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  
  body('currency')
    .isIn(['USD', 'SDG'])
    .withMessage('Currency must be USD or SDG'),
  
  body('provider')
    .isIn(['zain_cash', 'mtn_mobile_money', 'sudani_mobile_money'])
    .withMessage('Invalid mobile money provider'),
  
  body('phone_number')
    .matches(/^(\+249|0)[0-9]{9}$/)
    .withMessage('Valid phone number required')
];

const confirmBankTransferValidation = [
  body('payment_reference')
    .notEmpty()
    .withMessage('Payment reference is required'),
  
  body('bank_transaction_id')
    .notEmpty()
    .withMessage('Bank transaction ID is required'),
  
  body('transfer_date')
    .isISO8601()
    .withMessage('Valid transfer date required'),
  
  body('amount_transferred')
    .isFloat({ min: 0.01 })
    .withMessage('Transfer amount must be greater than 0')
];

const processRefundValidation = [
  body('payment_id')
    .isUUID()
    .withMessage('Valid payment ID required'),
  
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Refund amount must be greater than 0'),
  
  body('reason')
    .notEmpty()
    .withMessage('Refund reason is required'),
  
  body('refund_method')
    .isIn(['bank_transfer', 'cash', 'mobile_money', 'store_credit'])
    .withMessage('Invalid refund method')
];

// Public Routes
router.get('/methods', getPaymentMethods);
router.get('/exchange-rates', getExchangeRates);
router.post('/calculate-fees', [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('currency').isIn(['USD', 'SDG']).withMessage('Invalid currency'),
  body('payment_method').isIn(['bank_transfer', 'cash_on_delivery', 'mobile_money']).withMessage('Invalid payment method')
], validateRequest, calculateFees);

// Payment Creation Routes
router.post('/bank-transfer', 
  optionalAuth, 
  createBankTransferValidation, 
  validateRequest, 
  createBankTransferPayment
);

router.post('/cash', 
  optionalAuth, 
  createCashPaymentValidation, 
  validateRequest, 
  createCashPayment
);

router.post('/mobile-money', 
  optionalAuth, 
  createMobileMoneyValidation, 
  validateRequest, 
  createMobileMoneyPayment
);

// Payment Confirmation Routes
router.post('/confirm-bank-transfer', 
  confirmBankTransferValidation, 
  validateRequest, 
  confirmBankTransferPayment
);

router.get('/bank-instructions/:paymentReference', [
  param('paymentReference').notEmpty().withMessage('Payment reference required')
], validateRequest, getBankInstructions);

// Payment Information Routes
router.get('/:id', [
  param('id').isUUID().withMessage('Valid payment ID required')
], validateRequest, optionalAuth, getPaymentById);

router.get('/:id/receipt', [
  param('id').isUUID().withMessage('Valid payment ID required')
], validateRequest, optionalAuth, getPaymentReceipt);

// Customer Routes (Authentication required)
router.get('/my-payments', authenticateToken, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1-50'),
  query('status').optional().isIn(['pending', 'confirmed', 'failed', 'refunded']),
  query('payment_method').optional().isIn(['bank_transfer', 'cash_on_delivery', 'mobile_money']),
  query('start_date').optional().isISO8601().withMessage('Invalid start date'),
  query('end_date').optional().isISO8601().withMessage('Invalid end date')
], validateRequest, getUserPayments);

router.post('/:id/dispute', authenticateToken, [
  param('id').isUUID().withMessage('Valid payment ID required'),
  body('reason').notEmpty().withMessage('Dispute reason is required'),
  body('description').isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10-1000 characters'),
  body('evidence').optional().isArray().withMessage('Evidence must be an array')
], validateRequest, disputePayment);

// Staff/Admin Routes
router.get('/', authenticateToken, authorizeRoles(['admin', 'manager', 'staff']), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('status').optional().isIn(['pending', 'confirmed', 'failed', 'refunded']),
  query('payment_method').optional().isIn(['bank_transfer', 'cash_on_delivery', 'mobile_money']),
  query('customer_id').optional().isUUID().withMessage('Valid customer ID required'),
  query('order_id').optional().isUUID().withMessage('Valid order ID required'),
  query('start_date').optional().isISO8601().withMessage('Invalid start date'),
  query('end_date').optional().isISO8601().withMessage('Invalid end date'),
  query('sort').optional().isIn(['created_at', 'amount', 'status']),
  query('order').optional().isIn(['asc', 'desc'])
], validateRequest, getAllPayments);

router.put('/:id/status', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('id').isUUID().withMessage('Valid payment ID required'),
    body('status').isIn(['pending', 'confirmed', 'failed', 'refunded']).withMessage('Invalid status'),
    body('notes').optional().isLength({ max: 500 }).withMessage('Notes too long')
  ], 
  validateRequest, 
  updatePaymentStatus
);

router.post('/refund', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  processRefundValidation, 
  validateRequest, 
  processRefund
);

router.post('/reconcile', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    body('bank_statements').isArray().withMessage('Bank statements array required'),
    body('reconciliation_date').isISO8601().withMessage('Valid reconciliation date required')
  ], 
  validateRequest, 
  reconcilePayments
);

router.put('/:id/dispute/resolve', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    param('id').isUUID().withMessage('Valid payment ID required'),
    body('resolution').notEmpty().withMessage('Resolution is required'),
    body('resolution_notes').optional().isLength({ max: 1000 }).withMessage('Resolution notes too long')
  ], 
  validateRequest, 
  resolveDispute
);

// Payment Methods Management
router.post('/methods', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    body('name').notEmpty().withMessage('Payment method name required'),
    body('type').isIn(['bank_transfer', 'cash_on_delivery', 'mobile_money']).withMessage('Invalid payment method type'),
    body('is_active').optional().isBoolean().withMessage('is_active must be boolean'),
    body('config').optional().isObject().withMessage('Config must be an object')
  ], 
  validateRequest, 
  addPaymentMethod
);

router.put('/methods/:id', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    param('id').isUUID().withMessage('Valid payment method ID required'),
    body('name').optional().notEmpty().withMessage('Payment method name required'),
    body('is_active').optional().isBoolean().withMessage('is_active must be boolean'),
    body('config').optional().isObject().withMessage('Config must be an object')
  ], 
  validateRequest, 
  updatePaymentMethod
);

router.delete('/methods/:id', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [param('id').isUUID().withMessage('Valid payment method ID required')], 
  validateRequest, 
  deletePaymentMethod
);

// Exchange Rate Management
router.put('/exchange-rates', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    body('from_currency').isIn(['USD', 'SDG']).withMessage('Invalid from currency'),
    body('to_currency').isIn(['USD', 'SDG']).withMessage('Invalid to currency'),
    body('rate').isFloat({ min: 0.01 }).withMessage('Rate must be greater than 0'),
    body('effective_date').optional().isISO8601().withMessage('Invalid effective date')
  ], 
  validateRequest, 
  updateExchangeRate
);

// Admin Only Routes
router.get('/admin/analytics', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    query('period').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Invalid period'),
    query('start_date').optional().isISO8601().withMessage('Invalid start date'),
    query('end_date').optional().isISO8601().withMessage('Invalid end date'),
    query('group_by').optional().isIn(['status', 'payment_method', 'currency', 'day', 'week', 'month']).withMessage('Invalid group_by')
  ], 
  validateRequest, 
  getPaymentAnalytics
);

router.get('/admin/export', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    query('format').optional().isIn(['csv', 'excel', 'pdf']).withMessage('Invalid export format'),
    query('start_date').optional().isISO8601().withMessage('Invalid start date'),
    query('end_date').optional().isISO8601().withMessage('Invalid end date'),
    query('status').optional().isIn(['pending', 'confirmed', 'failed', 'refunded'])
  ], 
  validateRequest, 
  exportPayments
);

router.post('/admin/bulk-process', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    body('payment_ids').isArray({ min: 1 }).withMessage('Payment IDs array required'),
    body('payment_ids.*').isUUID().withMessage('Invalid payment ID format'),
    body('action').isIn(['confirm', 'reject', 'refund']).withMessage('Invalid bulk action'),
    body('notes').optional().isLength({ max: 500 }).withMessage('Notes too long')
  ], 
  validateRequest, 
  bulkPaymentProcessing
);

module.exports = router;
