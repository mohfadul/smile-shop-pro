const {
  createLocalPayment,
  confirmLocalPayment,
  createCashPayment,
  getBankTransferInstructions,
  validateBankReference,
  calculateLocalFees,
  confirmBankTransfer,
  getPaymentStatistics,
  getPaymentByReference,
} = require('../services/stripeService');
const { AppError, catchAsync } = require('../middlewares/errorHandler');
const { pool } = require('../models/paymentModel');
const axios = require('axios');

// Create payment intent
const createPaymentIntentHandler = catchAsync(async (req, res) => {
  const { amount, currency = 'usd', order_id, metadata = {} } = req.body;

  // Validate required fields
  if (!amount || amount <= 0) {
    throw new AppError('Valid amount is required', 400);
  }

  if (!order_id) {
    throw new AppError('Order ID is required', 400);
  }

  // Calculate fees
  const feeCalculation = await calculateFees(amount, currency);

  // Create payment intent with Stripe
  const paymentIntent = await createPaymentIntent(amount, currency, {
    order_id,
    user_id: req.user.user_id,
    ...metadata,
  });

  // Save payment transaction to database
  const transactionQuery = `
    INSERT INTO payment_transactions (
      order_id, user_id, amount, currency, status, payment_method,
      provider, provider_transaction_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING transaction_id
  `;

  const transactionResult = await pool.query(transactionQuery, [
    order_id,
    req.user.user_id,
    amount,
    currency,
    'pending',
    'stripe',
    'stripe',
    paymentIntent.payment_intent_id,
    JSON.stringify(metadata),
  ]);

  res.status(201).json({
    payment_intent: paymentIntent,
    fees: feeCalculation,
    transaction_id: transactionResult.rows[0].transaction_id,
  });
});

// Confirm payment intent
const confirmPayment = catchAsync(async (req, res) => {
  const { payment_intent_id, payment_method_id } = req.body;

  if (!payment_intent_id) {
    throw new AppError('Payment intent ID is required', 400);
  }

  // Confirm payment intent
  const confirmedPayment = await confirmPaymentIntent(payment_intent_id);

  // Update payment transaction status
  await pool.query(
    'UPDATE payment_transactions SET status = $1, updated_at = NOW() WHERE provider_transaction_id = $2',
    [confirmedPayment.status === 'succeeded' ? 'completed' : 'failed', payment_intent_id]
  );

  // If payment succeeded, update order status via order-service
  if (confirmedPayment.status === 'succeeded') {
    try {
      await axios.patch(
        `${process.env.ORDER_SERVICE_URL}/api/orders/${req.body.order_id}/payment`,
        {
          payment_status: 'paid',
          payment_reference: payment_intent_id,
        },
        {
          headers: {
            Authorization: req.headers.authorization,
          },
        }
      );
    } catch (error) {
      console.error('Error updating order payment status:', error);
      // Don't fail the payment if order update fails
    }
  }

  res.status(200).json({
    payment: confirmedPayment,
    message: 'Payment confirmed successfully',
  });
});

// Capture payment intent (for manual capture)
const capturePayment = catchAsync(async (req, res) => {
  const { payment_intent_id } = req.body;

  if (!payment_intent_id) {
    throw new AppError('Payment intent ID is required', 400);
  }

  const capturedPayment = await capturePaymentIntent(payment_intent_id);

  // Update payment transaction status
  await pool.query(
    'UPDATE payment_transactions SET status = $1, updated_at = NOW() WHERE provider_transaction_id = $2',
    [capturedPayment.status === 'succeeded' ? 'completed' : 'failed', payment_intent_id]
  );

  res.status(200).json({
    payment: capturedPayment,
    message: 'Payment captured successfully',
  });
});

// Create refund
const createRefundHandler = catchAsync(async (req, res) => {
  const { transaction_id, amount, reason = 'requested_by_customer' } = req.body;

  if (!transaction_id) {
    throw new AppError('Transaction ID is required', 400);
  }

  // Check if refund is possible
  const canRefundResult = await pool.query('SELECT can_refund_payment($1) as can_refund', [transaction_id]);

  if (!canRefundResult.rows[0].can_refund) {
    throw new AppError('Payment cannot be refunded', 400);
  }

  // Get refundable amount if partial refund
  let refundAmount = amount;
  if (!amount) {
    const refundableResult = await pool.query('SELECT get_refundable_amount($1) as refundable', [transaction_id]);
    refundAmount = refundableResult.rows[0].refundable;
  }

  // Get transaction details
  const transactionResult = await pool.query(
    'SELECT provider_transaction_id FROM payment_transactions WHERE transaction_id = $1',
    [transaction_id]
  );

  if (transactionResult.rows.length === 0) {
    throw new AppError('Transaction not found', 404);
  }

  const providerTransactionId = transactionResult.rows[0].provider_transaction_id;

  // Create refund with Stripe
  const refund = await createRefund(providerTransactionId, refundAmount, reason);

  // Save refund to database
  const refundQuery = `
    INSERT INTO payment_refunds (
      transaction_id, order_id, amount, currency, status, refund_reason, provider_refund_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING refund_id
  `;

  // Get order_id from transaction
  const orderIdResult = await pool.query(
    'SELECT order_id FROM payment_transactions WHERE transaction_id = $1',
    [transaction_id]
  );

  const refundResult = await pool.query(refundQuery, [
    transaction_id,
    orderIdResult.rows[0].order_id,
    refundAmount,
    'usd',
    'completed',
    reason,
    refund.id,
  ]);

  // Update order status if full refund
  if (refundAmount === amount) {
    try {
      await axios.patch(
        `${process.env.ORDER_SERVICE_URL}/api/orders/${orderIdResult.rows[0].order_id}/payment`,
        {
          payment_status: 'refunded',
        },
        {
          headers: {
            Authorization: req.headers.authorization,
          },
        }
      );
    } catch (error) {
      console.error('Error updating order refund status:', error);
    }
  }

  res.status(201).json({
    refund: {
      refund_id: refundResult.rows[0].refund_id,
      amount: refundAmount,
      status: 'completed',
      provider_refund_id: refund.id,
    },
    message: 'Refund processed successfully',
  });
});

// Get payment transaction details
const getPaymentTransaction = catchAsync(async (req, res) => {
  const { transactionId } = req.params;

  if (!transactionId) {
    throw new AppError('Transaction ID is required', 400);
  }

  // Get transaction with related data
  const query = `
    SELECT pt.*, pr.amount as refunded_amount
    FROM payment_transactions pt
    LEFT JOIN payment_refunds pr ON pt.transaction_id = pr.transaction_id AND pr.status = 'completed'
    WHERE pt.transaction_id = $1
  `;

  const result = await pool.query(query, [transactionId]);

  if (result.rows.length === 0) {
    throw new AppError('Payment transaction not found', 404);
  }

  const transaction = result.rows[0];

  // Check if user can access this transaction
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && transaction.user_id !== req.user?.user_id) {
    throw new AppError('Access denied', 403);
  }

  res.status(200).json({ transaction });
});

// Get user's payment history
const getUserPayments = catchAsync(async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;

  const query = `
    SELECT pt.*, pr.amount as refunded_amount
    FROM payment_transactions pt
    LEFT JOIN payment_refunds pr ON pt.transaction_id = pr.transaction_id AND pr.status = 'completed'
    WHERE pt.user_id = $1
    ORDER BY pt.created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query(query, [req.user.user_id, limit, offset]);

  res.status(200).json({
    payments: result.rows,
    count: result.rows.length,
  });
});

// Calculate payment fees
const calculatePaymentFees = catchAsync(async (req, res) => {
  const { amount, currency = 'usd' } = req.body;

  if (!amount || amount <= 0) {
    throw new AppError('Valid amount is required', 400);
  }

  const feeCalculation = await calculateFees(amount, currency);

  res.status(200).json({
    fees: feeCalculation,
  });
});

// Get payment statistics (Admin only)
const getPaymentStats = catchAsync(async (req, res) => {
  // Check if user is admin
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    throw new AppError('Access denied', 403);
  }

  const { period = '30d' } = req.query;

  // Parse period (e.g., '30d', '7d', '24h')
  const days = parseInt(period.replace('d', '')) || 30;

  // Get payment statistics
  const statsQuery = `
    SELECT
      COUNT(*) as total_transactions,
      SUM(amount) as total_amount,
      AVG(amount) as average_amount,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
      COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_payments
    FROM payment_transactions
    WHERE created_at >= NOW() - INTERVAL '${days} days'
  `;

  const statsResult = await pool.query(statsQuery);

  // Get payment method breakdown
  const methodQuery = `
    SELECT payment_method, COUNT(*) as count, SUM(amount) as total
    FROM payment_transactions
    WHERE created_at >= NOW() - INTERVAL '${days} days' AND status = 'completed'
    GROUP BY payment_method
    ORDER BY total DESC
  `;

  const methodResult = await pool.query(methodQuery);

  res.status(200).json({
    period: `${days} days`,
    statistics: statsResult.rows[0],
    payment_methods: methodResult.rows,
  });
});

module.exports = {
  createPaymentIntentHandler,
  confirmPayment,
  capturePayment,
  createRefundHandler,
  getPaymentTransaction,
  getUserPayments,
  calculatePaymentFees,
  getPaymentStats,
};
