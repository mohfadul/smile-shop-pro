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
    console.log('New client connected to the order database');
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err);
  // Don't exit the process, just log the error
});

pool.on('remove', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Client removed from order pool');
  }
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Order database connected successfully');
    return true;
  } catch (err) {
    console.error('❌ Order database connection failed:', err.message);
    return false;
  }
};

// Graceful shutdown
const closePool = async () => {
  try {
    await pool.end();
    console.log('Order database pool closed');
  } catch (err) {
    console.error('Error closing order database pool:', err);
  }
};

// Health check query
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT 1 as health_check');
    return result.rows[0].health_check === 1;
  } catch (err) {
    console.error('Order health check failed:', err);
    return false;
  }
};

// Order queries
const getAllOrders = async (options = {}) => {
  const {
    user_id,
    status,
    payment_status,
    sort_by = 'created_at',
    sort_order = 'desc',
    limit = 50,
    offset = 0
  } = options;

  let query = `
    SELECT o.*, COUNT(oi.order_item_id) as item_count
    FROM orders o
    LEFT JOIN order_items oi ON o.order_id = oi.order_id
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 0;

  // Add filters
  if (user_id) {
    paramCount++;
    query += ` AND o.user_id = $${paramCount}`;
    params.push(user_id);
  }

  if (status) {
    paramCount++;
    query += ` AND o.status = $${paramCount}`;
    params.push(status);
  }

  if (payment_status) {
    paramCount++;
    query += ` AND o.payment_status = $${paramCount}`;
    params.push(payment_status);
  }

  // Group by order_id
  query += ` GROUP BY o.order_id`;

  // Add sorting
  const validSortFields = ['created_at', 'updated_at', 'total_amount', 'status'];
  const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
  const order = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  query += ` ORDER BY o.${sortField} ${order}`;

  // Add pagination
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

const getOrderById = async (orderId) => {
  // Get order with items and related data
  const query = `
    SELECT o.*,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'order_item_id', oi.order_item_id,
                 'product_id', oi.product_id,
                 'product_name', oi.product_name,
                 'product_sku', oi.product_sku,
                 'quantity', oi.quantity,
                 'unit_price', oi.unit_price,
                 'total_price', oi.total_price,
                 'specifications', oi.specifications
               )
             ) FILTER (WHERE oi.order_item_id IS NOT NULL),
             '[]'::json
           ) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.order_id = oi.order_id
    WHERE o.order_id = $1
    GROUP BY o.order_id
  `;

  const result = await pool.query(query, [orderId]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

const createOrder = async (orderData) => {
  const {
    user_id,
    items,
    shipping_address,
    billing_address,
    shipping_method = 'standard',
    notes,
    coupon_code
  } = orderData;

  // Start transaction
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Generate order number
    const orderNumberResult = await client.query('SELECT generate_order_number() as order_number');
    const orderNumber = orderNumberResult.rows[0].order_number;

    // Create order
    const orderQuery = `
      INSERT INTO orders (
        user_id, order_number, shipping_address, billing_address,
        shipping_method, notes, subtotal, total_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const orderResult = await client.query(orderQuery, [
      user_id,
      orderNumber,
      JSON.stringify(shipping_address),
      billing_address ? JSON.stringify(billing_address) : null,
      shipping_method,
      notes,
      0, // Will be calculated
      0  // Will be calculated
    ]);

    const order = orderResult.rows[0];

    // Add order items
    let subtotal = 0;
    for (const item of items) {
      const itemQuery = `
        INSERT INTO order_items (
          order_id, product_id, product_name, product_sku,
          quantity, unit_price, total_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await client.query(itemQuery, [
        order.order_id,
        item.product_id,
        item.product_name,
        item.product_sku,
        item.quantity,
        item.unit_price,
        item.quantity * item.unit_price
      ]);

      subtotal += item.quantity * item.unit_price;
    }

    // Apply coupon if provided
    let discountAmount = 0;
    if (coupon_code) {
      // TODO: Implement coupon logic
      discountAmount = 0; // Placeholder
    }

    // Calculate tax (8% for now)
    const taxAmount = (subtotal - discountAmount) * 0.08;
    const totalAmount = subtotal + taxAmount - discountAmount;

    // Update order with calculated amounts
    await client.query(
      'UPDATE orders SET subtotal = $1, tax_amount = $2, discount_amount = $3, total_amount = $4 WHERE order_id = $5',
      [subtotal, taxAmount, discountAmount, totalAmount, order.order_id]
    );

    await client.query('COMMIT');

    return { ...order, subtotal, tax_amount: taxAmount, discount_amount: discountAmount, total_amount: totalAmount };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const updateOrderStatus = async (orderId, newStatus, notes = null) => {
  const query = `
    UPDATE orders
    SET status = $1, updated_at = NOW()
    WHERE order_id = $2
    RETURNING *
  `;

  const result = await pool.query(query, [newStatus, orderId]);

  if (result.rows.length === 0) {
    return null;
  }

  // Log status change
  if (notes) {
    await pool.query(
      'INSERT INTO order_status_history (order_id, new_status, notes) VALUES ($1, $2, $3)',
      [orderId, newStatus, notes]
    );
  }

  return result.rows[0];
};

const cancelOrder = async (orderId, reason = null) => {
  // Check if order can be cancelled
  const canCancelResult = await pool.query('SELECT can_cancel_order($1) as can_cancel', [orderId]);

  if (!canCancelResult.rows[0].can_cancel) {
    throw new Error('Order cannot be cancelled');
  }

  const updatedOrder = await updateOrderStatus(orderId, 'cancelled', reason);

  if (!updatedOrder) {
    throw new Error('Order not found');
  }

  return updatedOrder;
};

const getOrderItems = async (orderId) => {
  const query = `
    SELECT * FROM order_items
    WHERE order_id = $1
    ORDER BY created_at
  `;

  const result = await pool.query(query, [orderId]);
  return result.rows;
};

const getOrderStatusHistory = async (orderId) => {
  const query = `
    SELECT * FROM order_status_history
    WHERE order_id = $1
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query, [orderId]);
  return result.rows;
};

const addOrderItem = async (orderId, itemData) => {
  const { product_id, product_name, product_sku, quantity, unit_price } = itemData;

  const query = `
    INSERT INTO order_items (
      order_id, product_id, product_name, product_sku, quantity, unit_price, total_price
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await pool.query(query, [
    orderId,
    product_id,
    product_name,
    product_sku,
    quantity,
    unit_price,
    quantity * unit_price
  ]);

  // Recalculate order totals
  await pool.query('SELECT calculate_order_totals($1)', [orderId]);

  return result.rows[0];
};

const updateOrderPaymentStatus = async (orderId, paymentStatus, paymentReference = null) => {
  const query = `
    UPDATE orders
    SET payment_status = $1, payment_reference = $2, updated_at = NOW()
    WHERE order_id = $3
    RETURNING *
  `;

  const result = await pool.query(query, [paymentStatus, paymentReference, orderId]);
  return result.rows[0];
};

module.exports = {
  pool,
  testConnection,
  closePool,
  healthCheck,
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  cancelOrder,
  getOrderItems,
  getOrderStatusHistory,
  addOrderItem,
  updateOrderPaymentStatus,
};
