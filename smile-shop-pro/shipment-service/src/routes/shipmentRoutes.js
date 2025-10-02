const express = require('express');
const router = express.Router();
const {
  getShipments,
  getShipment,
  createNewShipment,
  updateShipment,
  getShipmentByTracking,
  getShippingMethods,
  getShipmentTracking,
  addTrackingUpdate,
  getUserShipments,
  calculateShippingCost,
  getShipmentStats,
} = require('../controllers/shipmentController');
const { body, param, query } = require('express-validator');
const { validateRequest } = require('../middlewares/validateRequest');

// Validation middleware for shipment routes
const shipmentValidation = {
  create: [
    body('order_id')
      .isUUID()
      .withMessage('Order ID must be a valid UUID'),

    body('method_id')
      .isUUID()
      .withMessage('Shipping method ID must be a valid UUID'),

    body('weight_kg')
      .optional()
      .isFloat({ min: 0.01, max: 1000 })
      .withMessage('Weight must be between 0.01kg and 1000kg'),

    body('dimensions_cm')
      .optional()
      .isLength({ max: 50 })
      .withMessage('Dimensions must be less than 50 characters'),

    body('package_count')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Package count must be between 1 and 100'),

    body('signature_required')
      .optional()
      .isBoolean()
      .withMessage('Signature required must be a boolean'),

    body('insurance_amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Insurance amount must be non-negative'),

    body('special_instructions')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Special instructions must be less than 1000 characters'),
  ],

  update: [
    body('status')
      .isIn(['pending', 'label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned', 'cancelled'])
      .withMessage('Invalid shipment status'),

    body('tracking_number')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Tracking number must be less than 100 characters'),

    body('carrier_tracking_url')
      .optional()
      .isURL()
      .withMessage('Carrier tracking URL must be a valid URL'),

    body('notes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Notes must be less than 500 characters'),
  ],

  trackingUpdate: [
    body('status')
      .isIn(['pending', 'label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned', 'cancelled'])
      .withMessage('Invalid tracking status'),

    body('location')
      .optional()
      .isLength({ max: 255 })
      .withMessage('Location must be less than 255 characters'),

    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),

    body('carrier_status')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Carrier status must be less than 100 characters'),

    body('estimated_delivery')
      .optional()
      .isISO8601()
      .withMessage('Estimated delivery must be a valid date'),

    body('carrier_timestamp')
      .optional()
      .isISO8601()
      .withMessage('Carrier timestamp must be a valid date'),
  ],

  calculateCost: [
    body('method_id')
      .isUUID()
      .withMessage('Shipping method ID must be a valid UUID'),

    body('weight_kg')
      .isFloat({ min: 0.01, max: 1000 })
      .withMessage('Weight must be between 0.01kg and 1000kg'),

    body('address')
      .optional()
      .isObject()
      .withMessage('Address must be an object'),
  ],
};

// Query parameter validation
const queryValidation = {
  list: [
    query('status')
      .optional()
      .isIn(['pending', 'label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned', 'cancelled'])
      .withMessage('Invalid status filter'),

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

// GET /api/shipments - Get all shipments (Admin/Manager) or user's shipments
router.get('/', queryValidation.list, validateRequest, getShipments);

// GET /api/shipments/my - Get current user's shipments
router.get('/my', getUserShipments);

// GET /api/shipments/methods - Get available shipping methods
router.get('/methods', getShippingMethods);

// GET /api/shipments/calculate-cost - Calculate shipping cost
router.post('/calculate-cost', shipmentValidation.calculateCost, validateRequest, calculateShippingCost);

// GET /api/shipments/:id - Get single shipment
router.get('/:id',
  param('id').isUUID().withMessage('Shipment ID must be a valid UUID'),
  validateRequest,
  getShipment
);

// GET /api/shipments/:id/tracking - Get shipment tracking history
router.get('/:id/tracking',
  param('id').isUUID().withMessage('Shipment ID must be a valid UUID'),
  validateRequest,
  getShipmentTracking
);

// POST /api/shipments - Create new shipment
router.post('/', shipmentValidation.create, validateRequest, createNewShipment);

// PUT /api/shipments/:id - Update shipment status (Admin/Manager only)
router.put('/:id',
  param('id').isUUID().withMessage('Shipment ID must be a valid UUID'),
  shipmentValidation.update,
  validateRequest,
  updateShipment
);

// POST /api/shipments/:id/tracking - Add tracking update (Admin/Manager only)
router.post('/:id/tracking',
  param('id').isUUID().withMessage('Shipment ID must be a valid UUID'),
  shipmentValidation.trackingUpdate,
  validateRequest,
  addTrackingUpdate
);

// GET /api/shipments/admin/stats - Get shipment statistics (Admin only)
router.get('/admin/stats', getShipmentStats);

module.exports = router;
