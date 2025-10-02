const { pool } = require('../models/paymentModel');
const catchAsync = require('../utils/catchAsync');
const crypto = require('crypto');

// Sudan-specific bank codes and mobile money providers
const SUDAN_BANKS = {
  'BOK': 'Bank of Khartoum',
  'BOS': 'Bank of Sudan',
  'ANB': 'Agricultural Bank of Sudan',
  'FDB': 'Faisal Islamic Bank',
  'UAB': 'United Capital Bank',
  'ISB': 'Islamic Bank of Sudan'
};

const MOBILE_MONEY_PROVIDERS = {
  'zain_cash': 'Zain Cash',
  'mtn_mobile_money': 'MTN Mobile Money',
  'sudani_mobile_money': 'Sudani Mobile Money'
};

// Generate payment reference
const generatePaymentReference = () => {
  return `PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

// Calculate payment fees based on Sudan banking regulations
const calculatePaymentFees = (amount, currency, paymentMethod) => {
  let feeAmount = 0;
  let feePercentage = 0;

  switch (paymentMethod) {
    case 'bank_transfer':
      // Fixed fee for bank transfers
      feeAmount = currency === 'USD' ? 2 : 100; // $2 USD or 100 SDG
      break;
    case 'mobile_money':
      // Percentage-based fee for mobile money
      feePercentage = 0.02; // 2%
      feeAmount = amount * feePercentage;
      break;
    case 'cash_on_delivery':
      // Higher fee for cash on delivery due to collection costs
      feeAmount = currency === 'USD' ? 5 : 250; // $5 USD or 250 SDG
      break;
  }

  return {
    fee_amount: feeAmount,
    fee_percentage: feePercentage,
    total_amount: amount + feeAmount
  };
};

// Create Bank Transfer Payment
const createBankTransferPayment = catchAsync(async (req, res) => {
  const {
    order_id,
    amount,
    currency,
    bank_code,
    customer_info
  } = req.body;

  // Validate bank code
  if (!SUDAN_BANKS[bank_code]) {
    return res.status(400).json({
      success: false,
      error: 'Invalid bank code',
      message: 'The specified bank is not supported'
    });
  }

  // Verify order exists and get order details
  const orderResult = await pool.query(
    'SELECT order_id, total_amount, currency, customer_id, status FROM orders WHERE order_id = $1',
    [order_id]
  );

  if (orderResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found',
      message: 'The specified order does not exist'
    });
  }

  const order = orderResult.rows[0];

  // Validate payment amount matches order total
  if (parseFloat(amount) !== parseFloat(order.total_amount)) {
    return res.status(400).json({
      success: false,
      error: 'Amount mismatch',
      message: 'Payment amount must match order total'
    });
  }

  // Calculate fees
  const fees = calculatePaymentFees(amount, currency, 'bank_transfer');
  const paymentReference = generatePaymentReference();

  // Create payment record
  const paymentResult = await pool.query(
    `INSERT INTO payment_transactions 
     (order_id, customer_id, payment_reference, amount, currency, payment_method, 
      status, fee_amount, total_amount, provider_details, customer_info, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING payment_id, payment_reference, created_at`,
    [
      order_id,
      order.customer_id || req.user?.user_id,
      paymentReference,
      amount,
      currency,
      'bank_transfer',
      'pending',
      fees.fee_amount,
      fees.total_amount,
      JSON.stringify({ bank_code, bank_name: SUDAN_BANKS[bank_code] }),
      JSON.stringify(customer_info),
      req.user?.user_id
    ]
  );

  // Generate bank transfer instructions
  const instructions = {
    payment_reference: paymentReference,
    bank_details: {
      bank_name: SUDAN_BANKS[bank_code],
      account_name: 'Smile Shop Pro',
      account_number: `${bank_code}-001-${Math.random().toString().substr(2, 8)}`,
      swift_code: `${bank_code}SDKH`,
      branch: 'Main Branch - Khartoum'
    },
    amount_to_transfer: fees.total_amount,
    currency: currency,
    transfer_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    instructions: [
      'Transfer the exact amount including fees',
      'Use the payment reference as transfer description',
      'Keep the transfer receipt for confirmation',
      'Contact support if you need assistance'
    ]
  };

  res.status(201).json({
    success: true,
    message: 'Bank transfer payment initiated successfully',
    data: {
      payment_id: paymentResult.rows[0].payment_id,
      payment_reference: paymentReference,
      instructions: instructions,
      expires_at: instructions.transfer_deadline,
      created_at: paymentResult.rows[0].created_at
    }
  });
});

// Create Cash on Delivery Payment
const createCashPayment = catchAsync(async (req, res) => {
  const {
    order_id,
    amount,
    currency,
    delivery_address
  } = req.body;

  // Verify order exists
  const orderResult = await pool.query(
    'SELECT order_id, total_amount, currency, customer_id, status FROM orders WHERE order_id = $1',
    [order_id]
  );

  if (orderResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found',
      message: 'The specified order does not exist'
    });
  }

  const order = orderResult.rows[0];

  // Calculate fees
  const fees = calculatePaymentFees(amount, currency, 'cash_on_delivery');
  const paymentReference = generatePaymentReference();

  // Create payment record
  const paymentResult = await pool.query(
    `INSERT INTO payment_transactions 
     (order_id, customer_id, payment_reference, amount, currency, payment_method, 
      status, fee_amount, total_amount, provider_details, customer_info, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING payment_id, payment_reference, created_at`,
    [
      order_id,
      order.customer_id || req.user?.user_id,
      paymentReference,
      amount,
      currency,
      'cash_on_delivery',
      'pending',
      fees.fee_amount,
      fees.total_amount,
      JSON.stringify({ delivery_method: 'cash_on_delivery' }),
      JSON.stringify({ delivery_address }),
      req.user?.user_id
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Cash on delivery payment created successfully',
    data: {
      payment_id: paymentResult.rows[0].payment_id,
      payment_reference: paymentReference,
      total_amount_to_pay: fees.total_amount,
      delivery_fee: fees.fee_amount,
      currency: currency,
      instructions: [
        'Payment will be collected upon delivery',
        'Please have the exact amount ready',
        'Cash only - no cards accepted',
        'Keep this reference for your records'
      ],
      created_at: paymentResult.rows[0].created_at
    }
  });
});

// Create Mobile Money Payment
const createMobileMoneyPayment = catchAsync(async (req, res) => {
  const {
    order_id,
    amount,
    currency,
    provider,
    phone_number
  } = req.body;

  // Validate provider
  if (!MOBILE_MONEY_PROVIDERS[provider]) {
    return res.status(400).json({
      success: false,
      error: 'Invalid provider',
      message: 'The specified mobile money provider is not supported'
    });
  }

  // Verify order exists
  const orderResult = await pool.query(
    'SELECT order_id, total_amount, currency, customer_id, status FROM orders WHERE order_id = $1',
    [order_id]
  );

  if (orderResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found',
      message: 'The specified order does not exist'
    });
  }

  // Calculate fees
  const fees = calculatePaymentFees(amount, currency, 'mobile_money');
  const paymentReference = generatePaymentReference();

  // Create payment record
  const paymentResult = await pool.query(
    `INSERT INTO payment_transactions 
     (order_id, customer_id, payment_reference, amount, currency, payment_method, 
      status, fee_amount, total_amount, provider_details, customer_info, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING payment_id, payment_reference, created_at`,
    [
      order_id,
      orderResult.rows[0].customer_id || req.user?.user_id,
      paymentReference,
      amount,
      currency,
      'mobile_money',
      'pending',
      fees.fee_amount,
      fees.total_amount,
      JSON.stringify({ provider, provider_name: MOBILE_MONEY_PROVIDERS[provider] }),
      JSON.stringify({ phone_number }),
      req.user?.user_id
    ]
  );

  // Generate mobile money instructions
  const instructions = {
    provider: MOBILE_MONEY_PROVIDERS[provider],
    payment_code: paymentReference.substr(-8),
    amount_to_pay: fees.total_amount,
    currency: currency,
    steps: [
      `Dial the ${MOBILE_MONEY_PROVIDERS[provider]} payment code`,
      `Enter merchant code: SMILE001`,
      `Enter payment code: ${paymentReference.substr(-8)}`,
      `Confirm amount: ${fees.total_amount} ${currency}`,
      `Enter your PIN to complete payment`
    ]
  };

  res.status(201).json({
    success: true,
    message: 'Mobile money payment initiated successfully',
    data: {
      payment_id: paymentResult.rows[0].payment_id,
      payment_reference: paymentReference,
      instructions: instructions,
      expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      created_at: paymentResult.rows[0].created_at
    }
  });
});

// Confirm Bank Transfer Payment
const confirmBankTransferPayment = catchAsync(async (req, res) => {
  const {
    payment_reference,
    bank_transaction_id,
    transfer_date,
    amount_transferred
  } = req.body;

  // Find payment by reference
  const paymentResult = await pool.query(
    'SELECT payment_id, amount, total_amount, status FROM payment_transactions WHERE payment_reference = $1',
    [payment_reference]
  );

  if (paymentResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Payment not found',
      message: 'Invalid payment reference'
    });
  }

  const payment = paymentResult.rows[0];

  if (payment.status !== 'pending') {
    return res.status(400).json({
      success: false,
      error: 'Payment already processed',
      message: 'This payment has already been confirmed or cancelled'
    });
  }

  // Validate transfer amount
  if (parseFloat(amount_transferred) !== parseFloat(payment.total_amount)) {
    return res.status(400).json({
      success: false,
      error: 'Amount mismatch',
      message: 'Transferred amount does not match required payment amount'
    });
  }

  // Update payment status
  const updateResult = await pool.query(
    `UPDATE payment_transactions 
     SET status = 'confirmed', confirmed_at = NOW(), 
         provider_transaction_id = $1, provider_response = $2,
         updated_at = NOW()
     WHERE payment_id = $3
     RETURNING payment_id, status, confirmed_at`,
    [
      bank_transaction_id,
      JSON.stringify({ transfer_date, amount_transferred, bank_transaction_id }),
      payment.payment_id
    ]
  );

  // TODO: Update order status to paid
  // TODO: Send payment confirmation notification

  res.json({
    success: true,
    message: 'Bank transfer payment confirmed successfully',
    data: updateResult.rows[0]
  });
});

// Get Bank Transfer Instructions
const getBankInstructions = catchAsync(async (req, res) => {
  const { paymentReference } = req.params;

  const paymentResult = await pool.query(
    `SELECT payment_id, amount, currency, total_amount, status, provider_details, created_at
     FROM payment_transactions 
     WHERE payment_reference = $1 AND payment_method = 'bank_transfer'`,
    [paymentReference]
  );

  if (paymentResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Payment not found',
      message: 'Invalid payment reference or payment method'
    });
  }

  const payment = paymentResult.rows[0];
  const providerDetails = JSON.parse(payment.provider_details);

  const instructions = {
    payment_reference: paymentReference,
    status: payment.status,
    bank_details: {
      bank_name: providerDetails.bank_name,
      account_name: 'Smile Shop Pro',
      account_number: `${providerDetails.bank_code}-001-${Math.random().toString().substr(2, 8)}`,
      swift_code: `${providerDetails.bank_code}SDKH`,
      branch: 'Main Branch - Khartoum'
    },
    amount_to_transfer: payment.total_amount,
    currency: payment.currency,
    transfer_deadline: new Date(payment.created_at.getTime() + 24 * 60 * 60 * 1000),
    instructions: [
      'Transfer the exact amount including fees',
      'Use the payment reference as transfer description',
      'Keep the transfer receipt for confirmation',
      'Contact support if you need assistance'
    ]
  };

  res.json({
    success: true,
    data: instructions
  });
});

// Get Payment by ID
const getPaymentById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.user_id;
  const userRole = req.user?.role;

  // Build authorization clause
  let authClause = '';
  const values = [id];
  
  // If not admin/staff, only allow access to own payments
  if (!userRole || !['admin', 'manager', 'staff'].includes(userRole)) {
    if (userId) {
      authClause = 'AND pt.customer_id = $2';
      values.push(userId);
    } else {
      authClause = 'AND pt.customer_id IS NULL'; // Guest payments only
    }
  }

  const result = await pool.query(
    `SELECT 
      pt.payment_id, pt.order_id, pt.payment_reference, pt.amount, pt.currency,
      pt.payment_method, pt.status, pt.fee_amount, pt.total_amount,
      pt.provider_details, pt.customer_info, pt.created_at, pt.confirmed_at,
      pt.provider_transaction_id, pt.failure_reason,
      o.order_number, o.status as order_status,
      u.first_name, u.last_name, u.email
     FROM payment_transactions pt
     LEFT JOIN orders o ON pt.order_id = o.order_id
     LEFT JOIN users u ON pt.customer_id = u.user_id
     WHERE pt.payment_id = $1 ${authClause}`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Payment not found',
      message: 'Payment with the specified ID does not exist or you do not have access to it'
    });
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
});

// Get All Payments (Admin/Staff)
const getAllPayments = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    payment_method,
    customer_id,
    order_id,
    start_date,
    end_date,
    sort = 'created_at',
    order = 'desc'
  } = req.query;

  const offset = (page - 1) * limit;
  let whereClause = 'WHERE 1=1';
  const values = [];
  let paramCount = 0;

  if (status) {
    whereClause += ` AND pt.status = $${++paramCount}`;
    values.push(status);
  }

  if (payment_method) {
    whereClause += ` AND pt.payment_method = $${++paramCount}`;
    values.push(payment_method);
  }

  if (customer_id) {
    whereClause += ` AND pt.customer_id = $${++paramCount}`;
    values.push(customer_id);
  }

  if (order_id) {
    whereClause += ` AND pt.order_id = $${++paramCount}`;
    values.push(order_id);
  }

  if (start_date) {
    whereClause += ` AND pt.created_at >= $${++paramCount}`;
    values.push(start_date);
  }

  if (end_date) {
    whereClause += ` AND pt.created_at <= $${++paramCount}`;
    values.push(end_date);
  }

  // Validate sort field
  const allowedSortFields = ['created_at', 'amount', 'status', 'payment_method'];
  const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
  const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Count total payments
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM payment_transactions pt ${whereClause}`,
    values
  );

  // Get payments
  const paymentsResult = await pool.query(
    `SELECT 
      pt.payment_id, pt.order_id, pt.payment_reference, pt.amount, pt.currency,
      pt.payment_method, pt.status, pt.total_amount, pt.created_at, pt.confirmed_at,
      o.order_number,
      u.first_name, u.last_name, u.email
     FROM payment_transactions pt
     LEFT JOIN orders o ON pt.order_id = o.order_id
     LEFT JOIN users u ON pt.customer_id = u.user_id
     ${whereClause}
     ORDER BY pt.${sortField} ${sortOrder}
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalPayments = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalPayments / limit);

  res.json({
    success: true,
    data: {
      payments: paymentsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalPayments,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Get User Payments
const getUserPayments = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    payment_method,
    start_date,
    end_date
  } = req.query;

  const offset = (page - 1) * limit;
  let whereClause = 'WHERE pt.customer_id = $1';
  const values = [req.user.user_id];
  let paramCount = 1;

  if (status) {
    whereClause += ` AND pt.status = $${++paramCount}`;
    values.push(status);
  }

  if (payment_method) {
    whereClause += ` AND pt.payment_method = $${++paramCount}`;
    values.push(payment_method);
  }

  if (start_date) {
    whereClause += ` AND pt.created_at >= $${++paramCount}`;
    values.push(start_date);
  }

  if (end_date) {
    whereClause += ` AND pt.created_at <= $${++paramCount}`;
    values.push(end_date);
  }

  // Count total payments
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM payment_transactions pt ${whereClause}`,
    values
  );

  // Get payments
  const paymentsResult = await pool.query(
    `SELECT 
      pt.payment_id, pt.order_id, pt.payment_reference, pt.amount, pt.currency,
      pt.payment_method, pt.status, pt.total_amount, pt.created_at, pt.confirmed_at,
      o.order_number
     FROM payment_transactions pt
     LEFT JOIN orders o ON pt.order_id = o.order_id
     ${whereClause}
     ORDER BY pt.created_at DESC
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalPayments = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalPayments / limit);

  res.json({
    success: true,
    data: {
      payments: paymentsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalPayments,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Calculate Fees
const calculateFees = catchAsync(async (req, res) => {
  const { amount, currency, payment_method } = req.body;

  const fees = calculatePaymentFees(amount, currency, payment_method);

  res.json({
    success: true,
    data: {
      amount: amount,
      currency: currency,
      payment_method: payment_method,
      fee_amount: fees.fee_amount,
      fee_percentage: fees.fee_percentage,
      total_amount: fees.total_amount
    }
  });
});

// Get Payment Methods
const getPaymentMethods = catchAsync(async (req, res) => {
  const result = await pool.query(
    `SELECT method_id, name, type, description, is_active, config, sort_order
     FROM payment_methods 
     WHERE is_active = true 
     ORDER BY sort_order ASC, name ASC`
  );

  // Add Sudan-specific information
  const methods = result.rows.map(method => ({
    ...method,
    banks: method.type === 'bank_transfer' ? SUDAN_BANKS : undefined,
    providers: method.type === 'mobile_money' ? MOBILE_MONEY_PROVIDERS : undefined
  }));

  res.json({
    success: true,
    data: methods
  });
});

// Get Exchange Rates
const getExchangeRates = catchAsync(async (req, res) => {
  const result = await pool.query(
    `SELECT from_currency, to_currency, rate, effective_date, updated_at
     FROM exchange_rates 
     WHERE effective_date <= NOW() 
     ORDER BY from_currency, to_currency, effective_date DESC`
  );

  // Group by currency pair and get the latest rate
  const rates = {};
  result.rows.forEach(row => {
    const pair = `${row.from_currency}_${row.to_currency}`;
    if (!rates[pair]) {
      rates[pair] = row;
    }
  });

  res.json({
    success: true,
    data: Object.values(rates)
  });
});

// Placeholder functions for additional endpoints
const updatePaymentStatus = catchAsync(async (req, res) => {
  // TODO: Implement update payment status
  res.json({
    success: true,
    message: 'Update payment status functionality to be implemented'
  });
});

const processRefund = catchAsync(async (req, res) => {
  // TODO: Implement process refund
  res.json({
    success: true,
    message: 'Process refund functionality to be implemented'
  });
});

const addPaymentMethod = catchAsync(async (req, res) => {
  // TODO: Implement add payment method
  res.json({
    success: true,
    message: 'Add payment method functionality to be implemented'
  });
});

const updatePaymentMethod = catchAsync(async (req, res) => {
  // TODO: Implement update payment method
  res.json({
    success: true,
    message: 'Update payment method functionality to be implemented'
  });
});

const deletePaymentMethod = catchAsync(async (req, res) => {
  // TODO: Implement delete payment method
  res.json({
    success: true,
    message: 'Delete payment method functionality to be implemented'
  });
});

const getPaymentAnalytics = catchAsync(async (req, res) => {
  // TODO: Implement payment analytics
  res.json({
    success: true,
    data: {
      message: 'Payment analytics to be implemented'
    }
  });
});

const reconcilePayments = catchAsync(async (req, res) => {
  // TODO: Implement payment reconciliation
  res.json({
    success: true,
    message: 'Payment reconciliation functionality to be implemented'
  });
});

const exportPayments = catchAsync(async (req, res) => {
  // TODO: Implement payment export
  res.json({
    success: true,
    message: 'Export payments functionality to be implemented'
  });
});

const getPaymentReceipt = catchAsync(async (req, res) => {
  // TODO: Implement payment receipt generation
  res.json({
    success: true,
    message: 'Payment receipt functionality to be implemented'
  });
});

const disputePayment = catchAsync(async (req, res) => {
  // TODO: Implement payment dispute
  res.json({
    success: true,
    message: 'Payment dispute functionality to be implemented'
  });
});

const resolveDispute = catchAsync(async (req, res) => {
  // TODO: Implement dispute resolution
  res.json({
    success: true,
    message: 'Dispute resolution functionality to be implemented'
  });
});

const updateExchangeRate = catchAsync(async (req, res) => {
  // TODO: Implement exchange rate update
  res.json({
    success: true,
    message: 'Exchange rate update functionality to be implemented'
  });
});

const bulkPaymentProcessing = catchAsync(async (req, res) => {
  // TODO: Implement bulk payment processing
  res.json({
    success: true,
    message: 'Bulk payment processing functionality to be implemented'
  });
});

module.exports = {
  createBankTransferPayment,
  createCashPayment,
  createMobileMoneyPayment,
  confirmBankTransferPayment,
  getBankInstructions,
  getPaymentById,
  getAllPayments,
  getUserPayments,
  updatePaymentStatus,
  processRefund,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  getPaymentAnalytics,
  reconcilePayments,
  exportPayments,
  getPaymentReceipt,
  disputePayment,
  resolveDispute,
  getExchangeRates,
  updateExchangeRate,
  calculateFees,
  bulkPaymentProcessing
};
