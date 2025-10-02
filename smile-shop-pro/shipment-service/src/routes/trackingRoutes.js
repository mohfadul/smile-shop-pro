const express = require('express');
const router = express.Router();
const {
  getShipmentByTracking,
} = require('../controllers/shipmentController');
const { param } = require('express-validator');
const { validateRequest } = require('../middlewares/validateRequest');

// Validation middleware for tracking routes
const trackingValidation = {
  trackingNumber: [
    param('trackingNumber')
      .isLength({ min: 3, max: 100 })
      .withMessage('Tracking number must be between 3 and 100 characters'),
  ],
};

// Routes

// GET /api/tracking/:trackingNumber - Get shipment by tracking number (public)
router.get('/:trackingNumber',
  param('trackingNumber').isLength({ min: 3, max: 100 }).withMessage('Tracking number must be between 3 and 100 characters'),
  validateRequest,
  getShipmentByTracking
);

// POST /api/tracking/webhook - Webhook endpoint for carrier updates
router.post('/webhook', (req, res) => {
  // This would handle webhooks from shipping carriers
  // For now, just acknowledge receipt
  console.log('Tracking webhook received:', req.body);

  res.status(200).json({
    received: true,
    message: 'Webhook received but not processed (carriers not implemented)',
  });
});

module.exports = router;
