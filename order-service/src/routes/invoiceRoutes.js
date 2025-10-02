const express = require('express');
const { param, query } = require('express-validator');
const {
  generateOrderInvoice,
  downloadOrderInvoice,
  getInvoiceSignedUrl,
  listOrderInvoices,
  deleteOrderInvoice
} = require('../controllers/invoiceController');
const { validateRequest } = require('../middlewares/validateRequest');
const { authenticateToken, authorizeRoles, optionalAuth } = require('../middlewares/auth');

const router = express.Router();

// Generate invoice for order (staff/admin only)
router.post('/orders/:id/invoice', 
  authenticateToken,
  authorizeRoles(['admin', 'manager', 'staff']),
  [param('id').isUUID().withMessage('Valid order ID required')],
  validateRequest,
  generateOrderInvoice
);

// Download invoice (customer can download their own, staff can download any)
router.get('/orders/:id/invoice/download', 
  optionalAuth,
  [param('id').isUUID().withMessage('Valid order ID required')],
  validateRequest,
  downloadOrderInvoice
);

// Get invoice signed URL (customer can get their own, staff can get any)
router.get('/orders/:id/invoice/signed-url', 
  optionalAuth,
  [
    param('id').isUUID().withMessage('Valid order ID required'),
    query('expiresIn').optional().isInt({ min: 60, max: 86400 }).withMessage('Expires in must be between 60 seconds and 24 hours')
  ],
  validateRequest,
  getInvoiceSignedUrl
);

// List order invoices (staff/admin only)
router.get('/orders/:id/invoices', 
  authenticateToken,
  authorizeRoles(['admin', 'manager', 'staff']),
  [param('id').isUUID().withMessage('Valid order ID required')],
  validateRequest,
  listOrderInvoices
);

// Delete invoice (admin only)
router.delete('/invoices/:invoiceId', 
  authenticateToken,
  authorizeRoles(['admin', 'manager']),
  [param('invoiceId').isUUID().withMessage('Valid invoice ID required')],
  validateRequest,
  deleteOrderInvoice
);

module.exports = router;
