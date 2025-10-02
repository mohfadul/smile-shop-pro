const express = require('express');
const router = express.Router();
const {
  createBankTransferPayment,
  createCashPaymentHandler,
  confirmBankTransferPayment,
  getPaymentTransaction,
  getUserPayments,
  calculatePaymentFees,
  getPaymentStats,
  getBankInstructions,
  getPaymentByReference,
} = require('../controllers/paymentController');
const { body, param, query } = require('express-validator');
const { validateRequest } = require('../middlewares/validateRequest');

// Validation middleware for payment routes
const paymentValidation = {
  createBankTransfer: [
    body('order_id')
      .isUUID()
      .withMessage('Order ID must be a valid UUID'),

    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be a positive number'),

    body('currency')
      .optional()
      .isIn(['usd', 'sdd'])
      .withMessage('Currency must be USD or SDG'),
  ],

  createCashPayment: [
    body('order_id')
      .isUUID()
      .withMessage('Order ID must be a valid UUID'),

    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be a positive number'),

    body('currency')
      .optional()
      .isIn(['usd', 'sdd'])
      .withMessage('Currency must be USD or SDG'),

    body('notes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Notes must be less than 500 characters'),
  ],

  confirmBankTransfer: [
    body('payment_reference')
      .matches(/^PAY-\d{10,13}-[A-Z0-9]{6}$/)
      .withMessage('Invalid payment reference format'),

    body('confirmation_data')
      .optional()
      .isObject()
      .withMessage('Confirmation data must be an object'),
  ],

  calculateFees: [
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be a positive number'),

    body('currency')
      .optional()
      .isIn(['usd', 'sdd'])
      .withMessage('Currency must be USD or SDG'),
  ],
};

// Query parameter validation
const queryValidation = {
  list: [
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

// GET /api/payments/health - Health check
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'payment-service' });
});

// POST /api/payments/bank-transfer - Create bank transfer payment
router.post('/bank-transfer', paymentValidation.createBankTransfer, validateRequest, createBankTransferPayment);

// POST /api/payments/cash - Create cash payment
router.post('/cash', paymentValidation.createCashPayment, validateRequest, createCashPaymentHandler);

// POST /api/payments/confirm-bank-transfer - Confirm bank transfer (Admin only)
router.post('/confirm-bank-transfer', paymentValidation.confirmBankTransfer, validateRequest, confirmBankTransferPayment);

// GET /api/payments/bank-instructions - Get bank transfer instructions
router.get('/bank-instructions', getBankInstructions);

// GET /api/payments/:transactionId - Get payment transaction
router.get('/:transactionId',
  param('transactionId').isUUID().withMessage('Transaction ID must be a valid UUID'),
  validateRequest,
  getPaymentTransaction
);

// GET /api/payments/reference/:paymentReference - Get payment by reference (public)
router.get('/reference/:paymentReference',
  param('paymentReference').matches(/^PAY-\d{10,13}-[A-Z0-9]{6}$/).withMessage('Invalid payment reference format'),
  validateRequest,
  getPaymentByReference
);

// GET /api/payments/user/history - Get user's payment history
router.get('/user/history', queryValidation.list, validateRequest, getUserPayments);

// POST /api/payments/calculate-fees - Calculate payment fees
router.post('/calculate-fees', paymentValidation.calculateFees, validateRequest, calculatePaymentFees);

// GET /api/payments/admin/stats - Get payment statistics (Admin only)
router.get('/admin/stats', getPaymentStats);

module.exports = router;
