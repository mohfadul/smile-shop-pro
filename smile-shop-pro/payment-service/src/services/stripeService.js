const { pool } = require('../models/paymentModel');
const { AppError } = require('../middlewares/errorHandler');
const crypto = require('crypto');

// Local payment service - no external payment gateways
// Supports local bank transfers and cash payments for Sudan market

// Generate unique payment reference
const generatePaymentReference = () => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8);
  return `PAY-${timestamp}-${random}`.toUpperCase();
};

// Create local payment record
const createLocalPayment = async (paymentData) => {
  const {
    order_id,
    user_id,
    amount,
    currency,
    payment_method,
    payment_details = {},
  } = paymentData;

  const paymentReference = generatePaymentReference();

  const query = `
    INSERT INTO payment_transactions (
      order_id, user_id, amount, currency, status, payment_method,
      provider, provider_transaction_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const result = await pool.query(query, [
    order_id,
    user_id,
    amount,
    currency,
    'pending', // Local payments start as pending
    payment_method,
    'local',
    paymentReference,
    JSON.stringify({
      payment_details,
      created_via: 'local_payment',
    }),
  ]);

  return {
    ...result.rows[0],
    payment_reference: paymentReference,
  };
};

// Confirm local payment (bank transfer verification)
const confirmLocalPayment = async (paymentReference, confirmationData = {}) => {
  try {
    // Get payment transaction
    const paymentResult = await pool.query(
      'SELECT * FROM payment_transactions WHERE provider_transaction_id = $1',
      [paymentReference]
    );

    if (paymentResult.rows.length === 0) {
      throw new AppError('Payment reference not found', 404);
    }

    const payment = paymentResult.rows[0];

    if (payment.status !== 'pending') {
      throw new AppError(`Payment already ${payment.status}`, 400);
    }

    // Update payment status to completed
    const updateResult = await pool.query(
      'UPDATE payment_transactions SET status = $1, updated_at = NOW() WHERE provider_transaction_id = $2 RETURNING *',
      ['completed', paymentReference]
    );

    // Log payment confirmation
    await pool.query(
      'INSERT INTO payment_activity_log (transaction_id, action, details) VALUES ($1, $2, $3)',
      [payment.transaction_id, 'payment_confirmed', JSON.stringify(confirmationData)]
    );

    return updateResult.rows[0];
  } catch (error) {
    console.error('Error confirming local payment:', error);
    throw new AppError(`Payment confirmation failed: ${error.message}`, 500);
  }
};

// Create cash payment record
const createCashPayment = async (paymentData) => {
  const {
    order_id,
    user_id,
    amount,
    currency,
    notes = '',
  } = paymentData;

  const paymentReference = generatePaymentReference();

  const query = `
    INSERT INTO payment_transactions (
      order_id, user_id, amount, currency, status, payment_method,
      provider, provider_transaction_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const result = await pool.query(query, [
    order_id,
    user_id,
    amount,
    currency,
    'completed', // Cash payments are immediately completed
    'cash_on_delivery',
    'local',
    paymentReference,
    JSON.stringify({
      payment_type: 'cash',
      notes,
      created_via: 'cash_payment',
    }),
  ]);

  return {
    ...result.rows[0],
    payment_reference: paymentReference,
  };
};

// Get bank transfer instructions for Sudan
const getBankTransferInstructions = () => {
  return {
    bank_name: 'Bank of Khartoum',
    account_name: 'Khalid Dqash Medical Company',
    account_number: '1234567890',
    iban: 'SD123456789012345678901234567890',
    swift_code: 'BKSDSD',
    instructions: [
      'Transfer the exact amount to the account above',
      'Include the payment reference in the transfer description',
      'Send proof of payment to payments@medicalstore.com.sd',
      'Payment will be confirmed within 1-2 business days',
      'Contact +249-123-456789 for payment assistance',
    ],
    processing_time: '1-2 business days',
    currency: 'SDG/USD',
  };
};

// Validate bank transfer reference
const validateBankReference = (reference) => {
  // Basic validation - should be in format PAY-TIMESTAMP-RANDOM
  const referenceRegex = /^PAY-\d{10,13}-[A-Z0-9]{6}$/;
  return referenceRegex.test(reference);
};

// Calculate local payment fees (minimal for Sudan market)
const calculateLocalFees = async (amount, currency = 'usd') => {
  try {
    // Local bank transfers have minimal fees
    const bankFee = amount * 0.005; // 0.5% bank fee
    const processingFee = 1.00; // Fixed processing fee

    const total = amount + bankFee + processingFee;

    return {
      subtotal: amount,
      bank_fee: bankFee,
      processing_fee: processingFee,
      total: total,
      currency,
      breakdown: {
        description: 'Local bank transfer fees',
        items: [
          { name: 'Bank transfer fee', amount: bankFee },
          { name: 'Processing fee', amount: processingFee },
        ],
      },
    };
  } catch (error) {
    throw new AppError(`Fee calculation failed: ${error.message}`, 500);
  }
};

// Handle local payment confirmation (admin function)
const confirmBankTransfer = async (paymentReference, adminUserId, confirmationData = {}) => {
  try {
    const paymentResult = await pool.query(
      'SELECT * FROM payment_transactions WHERE provider_transaction_id = $1',
      [paymentReference]
    );

    if (paymentResult.rows.length === 0) {
      throw new AppError('Payment reference not found', 404);
    }

    const payment = paymentResult.rows[0];

    if (payment.status !== 'pending') {
      throw new AppError(`Payment already ${payment.status}`, 400);
    }

    // Update payment status
    const updateResult = await pool.query(
      'UPDATE payment_transactions SET status = $1, updated_at = NOW() WHERE provider_transaction_id = $2 RETURNING *',
      ['completed', paymentReference]
    );

    // Log admin confirmation
    await pool.query(
      'INSERT INTO payment_activity_log (transaction_id, action, details, performed_by) VALUES ($1, $2, $3, $4)',
      [payment.transaction_id, 'admin_confirmed', JSON.stringify(confirmationData), adminUserId]
    );

    return updateResult.rows[0];
  } catch (error) {
    console.error('Error confirming bank transfer:', error);
    throw new AppError(`Payment confirmation failed: ${error.message}`, 500);
  }
};

// Get payment statistics
const getPaymentStatistics = async (days = 30) => {
  try {
    const query = `
      SELECT
        payment_method,
        status,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount
      FROM payment_transactions
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY payment_method, status
      ORDER BY payment_method, status
    `;

    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error getting payment statistics:', error);
    throw new AppError(`Payment statistics failed: ${error.message}`, 500);
  }
};

// Get payment by reference
const getPaymentByReference = async (paymentReference) => {
  try {
    const result = await pool.query(
      'SELECT * FROM payment_transactions WHERE provider_transaction_id = $1',
      [paymentReference]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error getting payment by reference:', error);
    throw new AppError(`Payment lookup failed: ${error.message}`, 500);
  }
};

module.exports = {
  createLocalPayment,
  confirmLocalPayment,
  createCashPayment,
  getBankTransferInstructions,
  validateBankReference,
  calculateLocalFees,
  confirmBankTransfer,
  getPaymentStatistics,
  getPaymentByReference,
  generatePaymentReference,
};
