const express = require('express');
const router = express.Router();
const { verifyWebhookSignature, handleWebhookEvent } = require('../services/stripeService');
const { createWebhookEvent, markWebhookProcessed } = require('../models/paymentModel');
const { catchAsync } = require('../middlewares/errorHandler');

// Stripe webhook endpoint
router.post('/stripe', catchAsync(async (req, res) => {
  const signature = req.stripeSignature;
  const payload = req.body;

  try {
    // Verify webhook signature
    const event = verifyWebhookSignature(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);

    // Save webhook event to database
    const webhookData = {
      transaction_id: event.data?.object?.metadata?.transaction_id || null,
      provider: 'stripe',
      event_type: event.type,
      event_id: event.id,
      payload: event,
      signature: signature,
    };

    const webhookResult = await createWebhookEvent(webhookData);
    console.log(`Webhook received and saved: ${event.type} (${webhookResult.webhook_id})`);

    // Process the webhook event
    const processingResult = await handleWebhookEvent(event);

    // Mark webhook as processed
    await markWebhookProcessed(webhookResult.webhook_id);

    console.log(`Webhook processed successfully: ${event.type}`);

    res.status(200).json({
      received: true,
      event_type: event.type,
      processed: processingResult,
    });

  } catch (error) {
    console.error('Webhook processing error:', error);

    // Still save the webhook event for debugging
    try {
      const webhookData = {
        provider: 'stripe',
        event_type: 'unknown',
        payload: payload,
        signature: signature,
      };

      await createWebhookEvent(webhookData);
    } catch (dbError) {
      console.error('Failed to save webhook event:', dbError);
    }

    res.status(400).json({
      error: 'Webhook verification failed',
      message: error.message,
    });
  }
}));

// Generic webhook endpoint for other payment providers
router.post('/:provider', catchAsync(async (req, res) => {
  const { provider } = req.params;

  // For now, just acknowledge receipt
  // In production, you'd implement provider-specific webhook handling
  console.log(`Webhook received from ${provider}:`, req.body);

  res.status(200).json({
    received: true,
    provider: provider,
    message: 'Webhook received but not processed (provider not implemented)',
  });
}));

module.exports = router;
