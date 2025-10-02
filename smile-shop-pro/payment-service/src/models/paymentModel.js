const { Pool } = require('pg');

// Database connection configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings for production
  ...(process.env.NODE_ENV === 'production' && {
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
  }),
  // Development settings
  ...(process.env.NODE_ENV !== 'production' && {
    max: 10,
    idleTimeoutMillis: 10000,
  }),
};

// Create connection pool
const pool = new Pool(dbConfig);

// Event handlers for connection pool
pool.on('connect', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('New client connected to the payment database');
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err);
  // Don't exit the process, just log the error
});

pool.on('remove', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Client removed from payment pool');
  }
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Payment database connected successfully');
    return true;
  } catch (err) {
    console.error('❌ Payment database connection failed:', err.message);
    return false;
  }
};

// Graceful shutdown
const closePool = async () => {
  try {
    await pool.end();
    console.log('Payment database pool closed');
  } catch (err) {
    console.error('Error closing payment database pool:', err);
  }
};

// Health check query
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT 1 as health_check');
    return result.rows[0].health_check === 1;
  } catch (err) {
    console.error('Payment health check failed:', err);
    return false;
  }
};

// Payment transaction queries
const createPaymentTransaction = async (transactionData) => {
  const {
    order_id,
    user_id,
    amount,
    currency,
    status,
    payment_method,
    provider,
    provider_transaction_id,
    provider_payment_method_id,
    gateway_response,
    metadata,
  } = transactionData;

  const query = `
    INSERT INTO payment_transactions (
      order_id, user_id, amount, currency, status, payment_method,
      provider, provider_transaction_id, provider_payment_method_id,
      gateway_response, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

  const result = await pool.query(query, [
    order_id,
    user_id,
    amount,
    currency,
    status,
    payment_method,
    provider,
    provider_transaction_id,
    provider_payment_method_id,
    JSON.stringify(gateway_response),
    JSON.stringify(metadata),
  ]);

  return result.rows[0];
};

const getPaymentTransactionById = async (transactionId) => {
  const query = `
    SELECT pt.*, pr.amount as refunded_amount
    FROM payment_transactions pt
    LEFT JOIN payment_refunds pr ON pt.transaction_id = pr.transaction_id AND pr.status = 'completed'
    WHERE pt.transaction_id = $1
  `;

  const result = await pool.query(query, [transactionId]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

const updatePaymentTransaction = async (transactionId, updates) => {
  const allowedFields = ['status', 'provider_transaction_id', 'provider_payment_method_id', 'gateway_response', 'metadata'];
  const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
  const values = fields.map(field => {
    if (field === 'gateway_response' || field === 'metadata') {
      return JSON.stringify(updates[field]);
    }
    return updates[field];
  });
  values.unshift(transactionId);

  const query = `
    UPDATE payment_transactions
    SET ${setClause}, updated_at = NOW()
    WHERE transaction_id = $1
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
};

const getUserPaymentTransactions = async (userId, options = {}) => {
  const { limit = 50, offset = 0, status } = options;

  let query = `
    SELECT pt.*, pr.amount as refunded_amount
    FROM payment_transactions pt
    LEFT JOIN payment_refunds pr ON pt.transaction_id = pr.transaction_id AND pr.status = 'completed'
    WHERE pt.user_id = $1
  `;

  const params = [userId];
  let paramCount = 1;

  if (status) {
    paramCount++;
    query += ` AND pt.status = $${paramCount}`;
    params.push(status);
  }

  query += ` ORDER BY pt.created_at DESC`;

  if (limit) {
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);
  }

  if (offset) {
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
  }

  const result = await pool.query(query, params);
  return result.rows;
};

// Payment refund queries
const createPaymentRefund = async (refundData) => {
  const {
    transaction_id,
    order_id,
    amount,
    currency,
    status,
    refund_reason,
    provider_refund_id,
    gateway_response,
    processed_by,
  } = refundData;

  const query = `
    INSERT INTO payment_refunds (
      transaction_id, order_id, amount, currency, status, refund_reason,
      provider_refund_id, gateway_response, processed_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const result = await pool.query(query, [
    transaction_id,
    order_id,
    amount,
    currency,
    status,
    refund_reason,
    provider_refund_id,
    JSON.stringify(gateway_response),
    processed_by,
  ]);

  return result.rows[0];
};

const getPaymentRefunds = async (transactionId) => {
  const query = `
    SELECT * FROM payment_refunds
    WHERE transaction_id = $1
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query, [transactionId]);
  return result.rows;
};

// Payment method queries
const createPaymentMethod = async (methodData) => {
  const {
    user_id,
    provider,
    provider_payment_method_id,
    type,
    last_four_digits,
    expiry_month,
    expiry_year,
    brand,
    is_default,
    metadata,
  } = methodData;

  // If this is default, unset other defaults for this user
  if (is_default) {
    await pool.query(
      'UPDATE payment_methods SET is_default = false WHERE user_id = $1',
      [user_id]
    );
  }

  const query = `
    INSERT INTO payment_methods (
      user_id, provider, provider_payment_method_id, type, last_four_digits,
      expiry_month, expiry_year, brand, is_default, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  const result = await pool.query(query, [
    user_id,
    provider,
    provider_payment_method_id,
    type,
    last_four_digits,
    expiry_month,
    expiry_year,
    brand,
    is_default,
    JSON.stringify(metadata),
  ]);

  return result.rows[0];
};

const getUserPaymentMethods = async (userId) => {
  const query = `
    SELECT * FROM payment_methods
    WHERE user_id = $1 AND is_active = true
    ORDER BY is_default DESC, created_at DESC
  `;

  const result = await pool.query(query, [userId]);
  return result.rows;
};

const updatePaymentMethod = async (methodId, updates) => {
  const allowedFields = ['is_default', 'is_active', 'metadata'];
  const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  // If setting as default, unset other defaults
  if (updates.is_default === true) {
    const userIdResult = await pool.query(
      'SELECT user_id FROM payment_methods WHERE payment_method_id = $1',
      [methodId]
    );

    if (userIdResult.rows.length > 0) {
      await pool.query(
        'UPDATE payment_methods SET is_default = false WHERE user_id = $1 AND payment_method_id != $2',
        [userIdResult.rows[0].user_id, methodId]
      );
    }
  }

  const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
  const values = fields.map(field => {
    if (field === 'metadata') {
      return JSON.stringify(updates[field]);
    }
    return updates[field];
  });
  values.unshift(methodId);

  const query = `
    UPDATE payment_methods
    SET ${setClause}, updated_at = NOW()
    WHERE payment_method_id = $1
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
};

// Webhook queries
const createWebhookEvent = async (webhookData) => {
  const { transaction_id, provider, event_type, event_id, payload, signature } = webhookData;

  const query = `
    INSERT INTO payment_webhooks (
      transaction_id, provider, event_type, event_id, payload, signature
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING webhook_id
  `;

  const result = await pool.query(query, [
    transaction_id,
    provider,
    event_type,
    event_id,
    JSON.stringify(payload),
    signature,
  ]);

  return result.rows[0];
};

const markWebhookProcessed = async (webhookId, errorMessage = null) => {
  const query = `
    UPDATE payment_webhooks
    SET processed = true, processed_at = NOW(), error_message = $2
    WHERE webhook_id = $1
    RETURNING *
  `;

  const result = await pool.query(query, [webhookId, errorMessage]);
  return result.rows[0];
};

const getUnprocessedWebhooks = async (limit = 10) => {
  const query = `
    SELECT * FROM payment_webhooks
    WHERE processed = false
    ORDER BY created_at ASC
    LIMIT $1
  `;

  const result = await pool.query(query, [limit]);
  return result.rows;
};

// Payment statistics queries
const getPaymentStatistics = async (days = 30) => {
  const query = `
    SELECT
      COUNT(*) as total_transactions,
      SUM(amount) as total_amount,
      AVG(amount) as average_amount,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
      COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_payments,
      SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as successful_amount,
      SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) as refunded_amount
    FROM payment_transactions
    WHERE created_at >= NOW() - INTERVAL '${days} days'
  `;

  const result = await pool.query(query);
  return result.rows[0];
};

const getPaymentMethodBreakdown = async (days = 30) => {
  const query = `
    SELECT payment_method, COUNT(*) as count, SUM(amount) as total
    FROM payment_transactions
    WHERE created_at >= NOW() - INTERVAL '${days} days' AND status = 'completed'
    GROUP BY payment_method
    ORDER BY total DESC
  `;

  const result = await pool.query(query);
  return result.rows;
};

module.exports = {
  pool,
  testConnection,
  closePool,
  healthCheck,
  createPaymentTransaction,
  getPaymentTransactionById,
  updatePaymentTransaction,
  getUserPaymentTransactions,
  createPaymentRefund,
  getPaymentRefunds,
  createPaymentMethod,
  getUserPaymentMethods,
  updatePaymentMethod,
  createWebhookEvent,
  markWebhookProcessed,
  getUnprocessedWebhooks,
  getPaymentStatistics,
  getPaymentMethodBreakdown,
};
