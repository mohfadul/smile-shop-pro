const express = require('express');
const { body, param, query } = require('express-validator');
const {
  generateAndUploadReport,
  downloadReport,
  getReportSignedUrl,
  listGeneratedReports,
  deleteReport
} = require('../controllers/reportFileController');
const { validateRequest } = require('../middlewares/validateRequest');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Generate and upload report (staff/admin only)
router.post('/generate', 
  authenticateToken,
  authorizeRoles(['admin', 'manager', 'staff']),
  [
    body('reportType').isIn(['sales_report', 'product_report', 'customer_report', 'inventory_report', 'financial_report']).withMessage('Invalid report type'),
    body('format').optional().isIn(['excel', 'pdf']).withMessage('Format must be excel or pdf'),
    body('title').optional().isLength({ min: 1, max: 200 }).withMessage('Title must be between 1-200 characters'),
    body('filters').optional().isObject().withMessage('Filters must be an object')
  ],
  validateRequest,
  generateAndUploadReport
);

// List generated reports (staff/admin only)
router.get('/', 
  authenticateToken,
  authorizeRoles(['admin', 'manager', 'staff']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
    query('report_type').optional().isIn(['sales_report', 'product_report', 'customer_report', 'inventory_report', 'financial_report']).withMessage('Invalid report type'),
    query('format').optional().isIn(['excel', 'pdf']).withMessage('Invalid format'),
    query('start_date').optional().isISO8601().withMessage('Invalid start date'),
    query('end_date').optional().isISO8601().withMessage('Invalid end date')
  ],
  validateRequest,
  listGeneratedReports
);

// Download report (staff/admin only)
router.get('/:reportId/download', 
  authenticateToken,
  authorizeRoles(['admin', 'manager', 'staff']),
  [param('reportId').isUUID().withMessage('Valid report ID required')],
  validateRequest,
  downloadReport
);

// Get report signed URL (staff/admin only)
router.get('/:reportId/signed-url', 
  authenticateToken,
  authorizeRoles(['admin', 'manager', 'staff']),
  [
    param('reportId').isUUID().withMessage('Valid report ID required'),
    query('expiresIn').optional().isInt({ min: 60, max: 86400 }).withMessage('Expires in must be between 60 seconds and 24 hours')
  ],
  validateRequest,
  getReportSignedUrl
);

// Delete report (admin only)
router.delete('/:reportId', 
  authenticateToken,
  authorizeRoles(['admin', 'manager']),
  [param('reportId').isUUID().withMessage('Valid report ID required')],
  validateRequest,
  deleteReport
);

module.exports = router;
