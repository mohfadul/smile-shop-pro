const express = require('express');
const router = express.Router();
const {
  getUserPaymentMethods,
  updatePaymentMethod,
  detachPaymentMethod,
} = require('../models/paymentModel');
const { getPaymentMethod, detachPaymentMethod: stripeDetach } = require('../services/stripeService');
const { catchAsync } = require('../middlewares/errorHandler');
const { body, param } = require('express-validator');
const { validateRequest } = require('../middlewares/validateRequest');

// Validation middleware for payment method routes
const paymentMethodValidation = {
  setDefault: [
    body('payment_method_id')
      .isUUID()
      .withMessage('Payment method ID must be a valid UUID'),

    body('is_default')
      .isBoolean()
      .withMessage('is_default must be a boolean'),
  ],

  detach: [
    param('id')
      .isUUID()
      .withMessage('Payment method ID must be a valid UUID'),
  ],
};

// Routes

// GET /api/payment-methods - Get user's payment methods
router.get('/', catchAsync(async (req, res) => {
  const paymentMethods = await getUserPaymentMethods(req.user.user_id);

  // Get detailed information from Stripe for each method
  const enhancedMethods = await Promise.all(
    paymentMethods.map(async (method) => {
      try {
        const stripeMethod = await getPaymentMethod(method.provider_payment_method_id);

        return {
          ...method,
          stripe_details: stripeMethod,
        };
      } catch (error) {
        console.error(`Error fetching Stripe details for payment method ${method.payment_method_id}:`, error);
        return method;
      }
    })
  );

  res.status(200).json({
    payment_methods: enhancedMethods,
    count: enhancedMethods.length,
  });
}));

// PUT /api/payment-methods/:id/default - Set payment method as default
router.put('/:id/default',
  param('id').isUUID().withMessage('Payment method ID must be a valid UUID'),
  paymentMethodValidation.setDefault,
  validateRequest,
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const { is_default } = req.body;

    // Update in our database
    const updatedMethod = await updatePaymentMethod(id, { is_default });

    if (!updatedMethod) {
      return res.status(404).json({
        error: 'Payment method not found',
      });
    }

    res.status(200).json({
      payment_method: updatedMethod,
      message: 'Payment method updated successfully',
    });
  })
);

// DELETE /api/payment-methods/:id - Detach payment method
router.delete('/:id',
  param('id').isUUID().withMessage('Payment method ID must be a valid UUID'),
  validateRequest,
  catchAsync(async (req, res) => {
    const { id } = req.params;

    // Get payment method details
    const paymentMethods = await getUserPaymentMethods(req.user.user_id);
    const method = paymentMethods.find(m => m.payment_method_id === id);

    if (!method) {
      return res.status(404).json({
        error: 'Payment method not found',
      });
    }

    // Detach from Stripe
    try {
      await stripeDetach(method.provider_payment_method_id);
    } catch (error) {
      console.error('Error detaching payment method from Stripe:', error);
      // Continue with local deletion even if Stripe detachment fails
    }

    // Update local database to mark as inactive
    await updatePaymentMethod(id, { is_active: false });

    res.status(200).json({
      message: 'Payment method detached successfully',
    });
  })
);

module.exports = router;
