const express = require('express');
const { body, param, query } = require('express-validator');
const { 
  createShipment,
  getShipmentById,
  getAllShipments,
  getUserShipments,
  updateShipmentStatus,
  addTrackingUpdate,
  getShipmentTracking,
  calculateShippingCost,
  getShippingMethods,
  addShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
  getShippingZones,
  addShippingZone,
  updateShippingZone,
  deleteShippingZone,
  getDeliveryRoutes,
  optimizeDeliveryRoute,
  assignDeliveryAgent,
  getDeliveryAgents,
  addDeliveryAgent,
  updateDeliveryAgent,
  getShipmentAnalytics,
  exportShipments,
  bulkShipmentUpdate,
  schedulePickup,
  confirmDelivery,
  reportDeliveryIssue,
  getDeliveryProof
} = require('../controllers/shipmentController');

const { validateRequest } = require('../middlewares/validateRequest');
const { authenticateToken, authorizeRoles, optionalAuth } = require('../middlewares/auth');
const { uploadMiddleware } = require('../middlewares/upload');

const router = express.Router();

// Shipment validation schemas
const createShipmentValidation = [
  body('order_id')
    .isUUID()
    .withMessage('Valid order ID required'),
  
  body('shipping_method_id')
    .isUUID()
    .withMessage('Valid shipping method ID required'),
  
  body('pickup_address')
    .isObject()
    .withMessage('Pickup address is required'),
  
  body('pickup_address.street')
    .notEmpty()
    .withMessage('Pickup street address is required'),
  
  body('pickup_address.city')
    .notEmpty()
    .withMessage('Pickup city is required'),
  
  body('delivery_address')
    .isObject()
    .withMessage('Delivery address is required'),
  
  body('delivery_address.street')
    .notEmpty()
    .withMessage('Delivery street address is required'),
  
  body('delivery_address.city')
    .notEmpty()
    .withMessage('Delivery city is required'),
  
  body('delivery_address.phone')
    .matches(/^(\+249|0)[0-9]{9}$/)
    .withMessage('Valid Sudanese phone number required'),
  
  body('package_details')
    .isObject()
    .withMessage('Package details are required'),
  
  body('package_details.weight')
    .isFloat({ min: 0.1 })
    .withMessage('Package weight must be greater than 0'),
  
  body('package_details.dimensions')
    .optional()
    .isObject()
    .withMessage('Dimensions must be an object'),
  
  body('special_instructions')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Special instructions too long'),
  
  body('insurance_value')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Insurance value must be non-negative'),
  
  body('requires_signature')
    .optional()
    .isBoolean()
    .withMessage('requires_signature must be boolean')
];

const trackingUpdateValidation = [
  body('status')
    .isIn(['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned'])
    .withMessage('Invalid tracking status'),
  
  body('location')
    .notEmpty()
    .withMessage('Location is required'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes too long'),
  
  body('coordinates')
    .optional()
    .isObject()
    .withMessage('Coordinates must be an object'),
  
  body('coordinates.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  
  body('coordinates.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude')
];

const shippingMethodValidation = [
  body('name')
    .notEmpty()
    .withMessage('Shipping method name is required'),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description too long'),
  
  body('delivery_time_min')
    .isInt({ min: 1 })
    .withMessage('Minimum delivery time must be at least 1 day'),
  
  body('delivery_time_max')
    .isInt({ min: 1 })
    .withMessage('Maximum delivery time must be at least 1 day'),
  
  body('base_cost')
    .isFloat({ min: 0 })
    .withMessage('Base cost must be non-negative'),
  
  body('cost_per_kg')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Cost per kg must be non-negative'),
  
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be boolean'),
  
  body('service_type')
    .isIn(['standard', 'express', 'overnight', 'same_day'])
    .withMessage('Invalid service type')
];

const shippingZoneValidation = [
  body('name')
    .notEmpty()
    .withMessage('Zone name is required'),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description too long'),
  
  body('cities')
    .isArray({ min: 1 })
    .withMessage('At least one city is required'),
  
  body('cities.*')
    .notEmpty()
    .withMessage('City name cannot be empty'),
  
  body('delivery_time_days')
    .isInt({ min: 1, max: 30 })
    .withMessage('Delivery time must be between 1-30 days'),
  
  body('shipping_cost')
    .isFloat({ min: 0 })
    .withMessage('Shipping cost must be non-negative'),
  
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be boolean')
];

// Public Routes
router.get('/methods', getShippingMethods);
router.get('/zones', getShippingZones);
router.post('/calculate-cost', [
  body('pickup_city').notEmpty().withMessage('Pickup city required'),
  body('delivery_city').notEmpty().withMessage('Delivery city required'),
  body('weight').isFloat({ min: 0.1 }).withMessage('Weight must be greater than 0'),
  body('dimensions').optional().isObject().withMessage('Dimensions must be an object'),
  body('insurance_value').optional().isFloat({ min: 0 }).withMessage('Insurance value must be non-negative')
], validateRequest, calculateShippingCost);

// Tracking Routes (Public - no auth required)
router.get('/track/:trackingNumber', [
  param('trackingNumber').notEmpty().withMessage('Tracking number required')
], validateRequest, getShipmentTracking);

router.get('/:id/tracking', [
  param('id').isUUID().withMessage('Valid shipment ID required')
], validateRequest, optionalAuth, getShipmentTracking);

// Customer Routes (Authentication required)
router.get('/my-shipments', authenticateToken, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1-50'),
  query('status').optional().isIn(['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned']),
  query('start_date').optional().isISO8601().withMessage('Invalid start date'),
  query('end_date').optional().isISO8601().withMessage('Invalid end date')
], validateRequest, getUserShipments);

router.get('/:id', [
  param('id').isUUID().withMessage('Valid shipment ID required')
], validateRequest, optionalAuth, getShipmentById);

router.post('/:id/delivery-issue', authenticateToken, [
  param('id').isUUID().withMessage('Valid shipment ID required'),
  body('issue_type').isIn(['damaged', 'missing_items', 'wrong_address', 'delivery_delay', 'other']).withMessage('Invalid issue type'),
  body('description').isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10-1000 characters'),
  body('evidence').optional().isArray().withMessage('Evidence must be an array')
], validateRequest, reportDeliveryIssue);

router.get('/:id/delivery-proof', [
  param('id').isUUID().withMessage('Valid shipment ID required')
], validateRequest, optionalAuth, getDeliveryProof);

// Staff/Admin Routes
router.get('/', authenticateToken, authorizeRoles(['admin', 'manager', 'staff']), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('status').optional().isIn(['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned']),
  query('shipping_method').optional().isUUID().withMessage('Valid shipping method ID required'),
  query('delivery_agent').optional().isUUID().withMessage('Valid delivery agent ID required'),
  query('city').optional().notEmpty().withMessage('City cannot be empty'),
  query('start_date').optional().isISO8601().withMessage('Invalid start date'),
  query('end_date').optional().isISO8601().withMessage('Invalid end date'),
  query('sort').optional().isIn(['created_at', 'delivery_date', 'status']),
  query('order').optional().isIn(['asc', 'desc'])
], validateRequest, getAllShipments);

router.post('/', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  createShipmentValidation, 
  validateRequest, 
  createShipment
);

router.put('/:id/status', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('id').isUUID().withMessage('Valid shipment ID required'),
    body('status').isIn(['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned']).withMessage('Invalid status'),
    body('notes').optional().isLength({ max: 500 }).withMessage('Notes too long')
  ], 
  validateRequest, 
  updateShipmentStatus
);

router.post('/:id/tracking', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [param('id').isUUID().withMessage('Valid shipment ID required'), ...trackingUpdateValidation], 
  validateRequest, 
  addTrackingUpdate
);

router.put('/:id/assign-agent', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('id').isUUID().withMessage('Valid shipment ID required'),
    body('agent_id').isUUID().withMessage('Valid agent ID required'),
    body('notes').optional().isLength({ max: 500 }).withMessage('Notes too long')
  ], 
  validateRequest, 
  assignDeliveryAgent
);

router.post('/:id/schedule-pickup', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    param('id').isUUID().withMessage('Valid shipment ID required'),
    body('pickup_date').isISO8601().withMessage('Valid pickup date required'),
    body('pickup_time_slot').isIn(['morning', 'afternoon', 'evening']).withMessage('Invalid time slot'),
    body('agent_id').optional().isUUID().withMessage('Valid agent ID required')
  ], 
  validateRequest, 
  schedulePickup
);

router.post('/:id/confirm-delivery', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  uploadMiddleware.fields([
    { name: 'signature', maxCount: 1 },
    { name: 'photo', maxCount: 3 }
  ]),
  [
    param('id').isUUID().withMessage('Valid shipment ID required'),
    body('recipient_name').notEmpty().withMessage('Recipient name required'),
    body('delivery_notes').optional().isLength({ max: 500 }).withMessage('Delivery notes too long')
  ], 
  validateRequest, 
  confirmDelivery
);

// Shipping Methods Management
router.post('/methods', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  shippingMethodValidation, 
  validateRequest, 
  addShippingMethod
);

router.put('/methods/:id', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [param('id').isUUID().withMessage('Valid method ID required'), ...shippingMethodValidation.map(rule => ({ ...rule, optional: true }))], 
  validateRequest, 
  updateShippingMethod
);

router.delete('/methods/:id', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [param('id').isUUID().withMessage('Valid method ID required')], 
  validateRequest, 
  deleteShippingMethod
);

// Shipping Zones Management
router.post('/zones', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  shippingZoneValidation, 
  validateRequest, 
  addShippingZone
);

router.put('/zones/:id', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [param('id').isUUID().withMessage('Valid zone ID required'), ...shippingZoneValidation.map(rule => ({ ...rule, optional: true }))], 
  validateRequest, 
  updateShippingZone
);

router.delete('/zones/:id', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [param('id').isUUID().withMessage('Valid zone ID required')], 
  validateRequest, 
  deleteShippingZone
);

// Delivery Agent Management
router.get('/agents', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    query('status').optional().isIn(['active', 'inactive', 'busy']).withMessage('Invalid agent status'),
    query('zone').optional().isUUID().withMessage('Valid zone ID required')
  ], 
  validateRequest, 
  getDeliveryAgents
);

router.post('/agents', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    body('name').notEmpty().withMessage('Agent name required'),
    body('phone').matches(/^(\+249|0)[0-9]{9}$/).withMessage('Valid phone number required'),
    body('email').optional().isEmail().withMessage('Valid email required'),
    body('vehicle_type').isIn(['motorcycle', 'car', 'van', 'truck']).withMessage('Invalid vehicle type'),
    body('license_number').notEmpty().withMessage('License number required'),
    body('zones').isArray({ min: 1 }).withMessage('At least one zone required'),
    body('zones.*').isUUID().withMessage('Valid zone ID required')
  ], 
  validateRequest, 
  addDeliveryAgent
);

router.put('/agents/:id', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    param('id').isUUID().withMessage('Valid agent ID required'),
    body('name').optional().notEmpty().withMessage('Agent name required'),
    body('phone').optional().matches(/^(\+249|0)[0-9]{9}$/).withMessage('Valid phone number required'),
    body('status').optional().isIn(['active', 'inactive', 'busy']).withMessage('Invalid status'),
    body('zones').optional().isArray({ min: 1 }).withMessage('At least one zone required')
  ], 
  validateRequest, 
  updateDeliveryAgent
);

// Route Optimization
router.get('/routes', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager', 'staff']), 
  [
    query('date').optional().isISO8601().withMessage('Invalid date'),
    query('agent_id').optional().isUUID().withMessage('Valid agent ID required'),
    query('zone_id').optional().isUUID().withMessage('Valid zone ID required')
  ], 
  validateRequest, 
  getDeliveryRoutes
);

router.post('/routes/optimize', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    body('shipment_ids').isArray({ min: 1 }).withMessage('Shipment IDs array required'),
    body('shipment_ids.*').isUUID().withMessage('Valid shipment ID required'),
    body('agent_id').optional().isUUID().withMessage('Valid agent ID required'),
    body('optimization_type').optional().isIn(['distance', 'time', 'cost']).withMessage('Invalid optimization type')
  ], 
  validateRequest, 
  optimizeDeliveryRoute
);

// Admin Only Routes
router.get('/admin/analytics', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    query('period').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Invalid period'),
    query('start_date').optional().isISO8601().withMessage('Invalid start date'),
    query('end_date').optional().isISO8601().withMessage('Invalid end date'),
    query('group_by').optional().isIn(['status', 'method', 'zone', 'agent', 'day', 'week', 'month']).withMessage('Invalid group_by')
  ], 
  validateRequest, 
  getShipmentAnalytics
);

router.get('/admin/export', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    query('format').optional().isIn(['csv', 'excel', 'pdf']).withMessage('Invalid export format'),
    query('start_date').optional().isISO8601().withMessage('Invalid start date'),
    query('end_date').optional().isISO8601().withMessage('Invalid end date'),
    query('status').optional().isIn(['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned'])
  ], 
  validateRequest, 
  exportShipments
);

router.post('/admin/bulk-update', 
  authenticateToken, 
  authorizeRoles(['admin', 'manager']), 
  [
    body('shipment_ids').isArray({ min: 1 }).withMessage('Shipment IDs array required'),
    body('shipment_ids.*').isUUID().withMessage('Invalid shipment ID format'),
    body('updates').isObject().withMessage('Updates object required')
  ], 
  validateRequest, 
  bulkShipmentUpdate
);

module.exports = router;
