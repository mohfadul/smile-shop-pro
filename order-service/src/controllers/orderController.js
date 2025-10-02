const { pool } = require('../models/orderModel');
const catchAsync = require('../utils/catchAsync');

// Create Order
const createOrder = catchAsync(async (req, res) => {
  const {
    customer_id,
    items,
    shipping_address,
    billing_address,
    payment_method,
    currency = 'USD',
    special_instructions,
    requires_prescription = false
  } = req.body;

  // Use authenticated user ID if available, otherwise allow guest orders
  const finalCustomerId = customer_id || req.user?.user_id || null;

  // Start transaction
  await pool.query('BEGIN');

  try {
    // Calculate order totals
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      // Verify product exists and get current price
      const productQuery = variant_id 
        ? 'SELECT pv.price, p.name, p.requires_prescription, p.stock_quantity FROM product_variants pv JOIN products p ON pv.product_id = p.product_id WHERE pv.variant_id = $1'
        : 'SELECT price, name, requires_prescription, stock_quantity FROM products WHERE product_id = $1 AND status = $2';
      
      const productParams = item.variant_id 
        ? [item.variant_id]
        : [item.product_id, 'active'];

      const productResult = await pool.query(productQuery, productParams);

      if (productResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Invalid product',
          message: `Product ${item.product_id} not found or inactive`
        });
      }

      const product = productResult.rows[0];

      // Check stock availability
      if (product.stock_quantity < item.quantity) {
        await pool.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Insufficient stock',
          message: `Only ${product.stock_quantity} units available for ${product.name}`
        });
      }

      // Check prescription requirement
      if (product.requires_prescription && !requires_prescription) {
        await pool.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Prescription required',
          message: `Product ${product.name} requires a valid prescription`
        });
      }

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        ...item,
        unit_price: product.price,
        line_total: itemTotal,
        product_name: product.name
      });
    }

    // Calculate shipping (basic logic - can be enhanced)
    const shipping_cost = subtotal > 100 ? 0 : 15; // Free shipping over $100
    const tax_amount = subtotal * 0.05; // 5% tax
    const total_amount = subtotal + shipping_cost + tax_amount;

    // Create order
    const orderResult = await pool.query(
      `INSERT INTO orders 
       (customer_id, order_number, status, subtotal, shipping_cost, tax_amount, total_amount, 
        currency, payment_method, shipping_address, billing_address, special_instructions, 
        requires_prescription, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING order_id, order_number, created_at`,
      [
        finalCustomerId,
        `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        'pending',
        subtotal,
        shipping_cost,
        tax_amount,
        total_amount,
        currency,
        payment_method,
        JSON.stringify(shipping_address),
        JSON.stringify(billing_address || shipping_address),
        special_instructions,
        requires_prescription,
        req.user?.user_id || null
      ]
    );

    const order = orderResult.rows[0];

    // Create order items
    for (const item of validatedItems) {
      await pool.query(
        `INSERT INTO order_items 
         (order_id, product_id, variant_id, quantity, unit_price, line_total, product_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order.order_id,
          item.product_id,
          item.variant_id || null,
          item.quantity,
          item.unit_price,
          item.line_total,
          item.product_name
        ]
      );

      // Update product stock
      if (item.variant_id) {
        await pool.query(
          'UPDATE product_variants SET stock_quantity = stock_quantity - $1 WHERE variant_id = $2',
          [item.quantity, item.variant_id]
        );
      } else {
        await pool.query(
          'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE product_id = $2',
          [item.quantity, item.product_id]
        );
      }
    }

    // Create order status history
    await pool.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [order.order_id, 'pending', 'Order created', req.user?.user_id || null]
    );

    await pool.query('COMMIT');

    // TODO: Send order confirmation notification
    // await sendOrderConfirmation(order.order_id);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order_id: order.order_id,
        order_number: order.order_number,
        total_amount,
        currency,
        created_at: order.created_at
      }
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
});

// Get Order by ID
const getOrderById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.user_id;
  const userRole = req.user?.role;

  // Build authorization clause
  let authClause = '';
  const values = [id];
  
  // If not admin/staff, only allow access to own orders or guest orders
  if (!userRole || !['admin', 'manager', 'staff'].includes(userRole)) {
    if (userId) {
      authClause = 'AND (o.customer_id = $2 OR o.customer_id IS NULL)';
      values.push(userId);
    } else {
      authClause = 'AND o.customer_id IS NULL'; // Guest orders only
    }
  }

  const orderResult = await pool.query(
    `SELECT 
      o.order_id, o.order_number, o.customer_id, o.status, o.subtotal, 
      o.shipping_cost, o.tax_amount, o.total_amount, o.currency, o.payment_method,
      o.shipping_address, o.billing_address, o.special_instructions, 
      o.requires_prescription, o.created_at, o.updated_at,
      u.first_name, u.last_name, u.email, u.phone,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'item_id', oi.item_id,
            'product_id', oi.product_id,
            'variant_id', oi.variant_id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'line_total', oi.line_total
          )
        ) FROM order_items oi WHERE oi.order_id = o.order_id),
        '[]'::json
      ) as items,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'discount_id', od.discount_id,
            'discount_type', od.discount_type,
            'discount_value', od.discount_value,
            'discount_amount', od.discount_amount,
            'description', od.description
          )
        ) FROM order_discounts od WHERE od.order_id = o.order_id),
        '[]'::json
      ) as discounts
     FROM orders o
     LEFT JOIN users u ON o.customer_id = u.user_id
     WHERE o.order_id = $1 ${authClause}`,
    values
  );

  if (orderResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found',
      message: 'Order with the specified ID does not exist or you do not have access to it'
    });
  }

  // Get order status history
  const historyResult = await pool.query(
    `SELECT 
      osh.status_id, osh.status, osh.notes, osh.created_at,
      u.first_name, u.last_name
     FROM order_status_history osh
     LEFT JOIN users u ON osh.changed_by = u.user_id
     WHERE osh.order_id = $1
     ORDER BY osh.created_at ASC`,
    [id]
  );

  const order = {
    ...orderResult.rows[0],
    status_history: historyResult.rows
  };

  res.json({
    success: true,
    data: order
  });
});

// Get All Orders (Admin/Staff)
const getAllOrders = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    customer_id,
    payment_method,
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
    whereClause += ` AND o.status = $${++paramCount}`;
    values.push(status);
  }

  if (customer_id) {
    whereClause += ` AND o.customer_id = $${++paramCount}`;
    values.push(customer_id);
  }

  if (payment_method) {
    whereClause += ` AND o.payment_method = $${++paramCount}`;
    values.push(payment_method);
  }

  if (start_date) {
    whereClause += ` AND o.created_at >= $${++paramCount}`;
    values.push(start_date);
  }

  if (end_date) {
    whereClause += ` AND o.created_at <= $${++paramCount}`;
    values.push(end_date);
  }

  // Validate sort field
  const allowedSortFields = ['created_at', 'total_amount', 'status', 'order_number'];
  const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
  const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Count total orders
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM orders o ${whereClause}`,
    values
  );

  // Get orders
  const ordersResult = await pool.query(
    `SELECT 
      o.order_id, o.order_number, o.customer_id, o.status, o.subtotal,
      o.shipping_cost, o.tax_amount, o.total_amount, o.currency, o.payment_method,
      o.created_at, o.updated_at,
      u.first_name, u.last_name, u.email,
      (o.shipping_address->>'city') as shipping_city,
      (o.shipping_address->>'country') as shipping_country,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.order_id) as item_count
     FROM orders o
     LEFT JOIN users u ON o.customer_id = u.user_id
     ${whereClause}
     ORDER BY o.${sortField} ${sortOrder}
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalOrders = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalOrders / limit);

  res.json({
    success: true,
    data: {
      orders: ordersResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalOrders,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Get User Orders
const getUserOrders = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    start_date,
    end_date
  } = req.query;

  const offset = (page - 1) * limit;
  let whereClause = 'WHERE o.customer_id = $1';
  const values = [req.user.user_id];
  let paramCount = 1;

  if (status) {
    whereClause += ` AND o.status = $${++paramCount}`;
    values.push(status);
  }

  if (start_date) {
    whereClause += ` AND o.created_at >= $${++paramCount}`;
    values.push(start_date);
  }

  if (end_date) {
    whereClause += ` AND o.created_at <= $${++paramCount}`;
    values.push(end_date);
  }

  // Count total orders
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM orders o ${whereClause}`,
    values
  );

  // Get orders
  const ordersResult = await pool.query(
    `SELECT 
      o.order_id, o.order_number, o.status, o.total_amount, o.currency,
      o.payment_method, o.created_at, o.updated_at,
      (o.shipping_address->>'city') as shipping_city,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.order_id) as item_count
     FROM orders o
     ${whereClause}
     ORDER BY o.created_at DESC
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalOrders = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalOrders / limit);

  res.json({
    success: true,
    data: {
      orders: ordersResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalOrders,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Update Order Status
const updateOrderStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  // Validate status transition
  const currentOrderResult = await pool.query(
    'SELECT status FROM orders WHERE order_id = $1',
    [id]
  );

  if (currentOrderResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found',
      message: 'Order with the specified ID does not exist'
    });
  }

  const currentStatus = currentOrderResult.rows[0].status;

  // Define valid status transitions
  const validTransitions = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: ['refunded'],
    cancelled: [],
    refunded: []
  };

  if (!validTransitions[currentStatus]?.includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid status transition',
      message: `Cannot change status from ${currentStatus} to ${status}`
    });
  }

  // Start transaction
  await pool.query('BEGIN');

  try {
    // Update order status
    const result = await pool.query(
      `UPDATE orders 
       SET status = $1, updated_at = NOW(), updated_by = $2
       WHERE order_id = $3
       RETURNING order_id, order_number, status, updated_at`,
      [status, req.user.user_id, id]
    );

    // Add status history
    await pool.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [id, status, notes, req.user.user_id]
    );

    // If cancelled, restore stock
    if (status === 'cancelled') {
      const orderItems = await pool.query(
        'SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = $1',
        [id]
      );

      for (const item of orderItems.rows) {
        if (item.variant_id) {
          await pool.query(
            'UPDATE product_variants SET stock_quantity = stock_quantity + $1 WHERE variant_id = $2',
            [item.quantity, item.variant_id]
          );
        } else {
          await pool.query(
            'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE product_id = $2',
            [item.quantity, item.product_id]
          );
        }
      }
    }

    await pool.query('COMMIT');

    // TODO: Send status update notification
    // await sendOrderStatusUpdate(id, status);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
});

// Cancel Order
const cancelOrder = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.user_id;

  // Check if user owns the order or is admin/staff
  const orderResult = await pool.query(
    `SELECT customer_id, status FROM orders WHERE order_id = $1`,
    [id]
  );

  if (orderResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found',
      message: 'Order with the specified ID does not exist'
    });
  }

  const order = orderResult.rows[0];

  // Authorization check
  if (order.customer_id !== userId && !['admin', 'manager', 'staff'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      message: 'You can only cancel your own orders'
    });
  }

  // Check if order can be cancelled
  if (!['pending', 'confirmed'].includes(order.status)) {
    return res.status(400).json({
      success: false,
      error: 'Cannot cancel order',
      message: 'Order cannot be cancelled in its current status'
    });
  }

  // Start transaction
  await pool.query('BEGIN');

  try {
    // Update order status
    await pool.query(
      `UPDATE orders 
       SET status = 'cancelled', updated_at = NOW(), updated_by = $1
       WHERE order_id = $2`,
      [userId, id]
    );

    // Add status history
    await pool.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [id, 'cancelled', reason || 'Order cancelled by customer', userId]
    );

    // Restore stock
    const orderItems = await pool.query(
      'SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = $1',
      [id]
    );

    for (const item of orderItems.rows) {
      if (item.variant_id) {
        await pool.query(
          'UPDATE product_variants SET stock_quantity = stock_quantity + $1 WHERE variant_id = $2',
          [item.quantity, item.variant_id]
        );
      } else {
        await pool.query(
          'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE product_id = $2',
          [item.quantity, item.product_id]
        );
      }
    }

    await pool.query('COMMIT');

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
});

// Get Order Items
const getOrderItems = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT 
      oi.item_id, oi.product_id, oi.variant_id, oi.product_name,
      oi.quantity, oi.unit_price, oi.line_total,
      p.name as current_product_name, p.status as product_status,
      CASE 
        WHEN oi.variant_id IS NOT NULL THEN pv.stock_quantity
        ELSE p.stock_quantity
      END as current_stock
     FROM order_items oi
     LEFT JOIN products p ON oi.product_id = p.product_id
     LEFT JOIN product_variants pv ON oi.variant_id = pv.variant_id
     WHERE oi.order_id = $1
     ORDER BY oi.created_at ASC`,
    [id]
  );

  res.json({
    success: true,
    data: result.rows
  });
});

// Placeholder functions for additional endpoints
const addOrderItem = catchAsync(async (req, res) => {
  // TODO: Implement add order item logic
  res.json({
    success: true,
    message: 'Add order item functionality to be implemented'
  });
});

const updateOrderItem = catchAsync(async (req, res) => {
  // TODO: Implement update order item logic
  res.json({
    success: true,
    message: 'Update order item functionality to be implemented'
  });
});

const removeOrderItem = catchAsync(async (req, res) => {
  // TODO: Implement remove order item logic
  res.json({
    success: true,
    message: 'Remove order item functionality to be implemented'
  });
});

const applyDiscount = catchAsync(async (req, res) => {
  // TODO: Implement apply discount logic
  res.json({
    success: true,
    message: 'Apply discount functionality to be implemented'
  });
});

const removeDiscount = catchAsync(async (req, res) => {
  // TODO: Implement remove discount logic
  res.json({
    success: true,
    message: 'Remove discount functionality to be implemented'
  });
});

const getOrderHistory = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT 
      osh.status_id, osh.status, osh.notes, osh.created_at,
      u.first_name, u.last_name
     FROM order_status_history osh
     LEFT JOIN users u ON osh.changed_by = u.user_id
     WHERE osh.order_id = $1
     ORDER BY osh.created_at DESC`,
    [id]
  );

  res.json({
    success: true,
    data: result.rows
  });
});

const getOrderAnalytics = catchAsync(async (req, res) => {
  // TODO: Implement comprehensive order analytics
  res.json({
    success: true,
    data: {
      message: 'Order analytics to be implemented'
    }
  });
});

const bulkUpdateOrders = catchAsync(async (req, res) => {
  // TODO: Implement bulk order updates
  res.json({
    success: true,
    message: 'Bulk update orders functionality to be implemented'
  });
});

const exportOrders = catchAsync(async (req, res) => {
  // TODO: Implement order export functionality
  res.json({
    success: true,
    message: 'Export orders functionality to be implemented'
  });
});

const getOrderInvoice = catchAsync(async (req, res) => {
  // TODO: Implement order invoice generation
  res.json({
    success: true,
    message: 'Order invoice functionality to be implemented'
  });
});

const processRefund = catchAsync(async (req, res) => {
  // TODO: Implement refund processing
  res.json({
    success: true,
    message: 'Process refund functionality to be implemented'
  });
});

const addOrderNote = catchAsync(async (req, res) => {
  // TODO: Implement add order note
  res.json({
    success: true,
    message: 'Add order note functionality to be implemented'
  });
});

const getOrderNotes = catchAsync(async (req, res) => {
  // TODO: Implement get order notes
  res.json({
    success: true,
    data: []
  });
});

module.exports = {
  createOrder,
  getOrderById,
  getAllOrders,
  getUserOrders,
  updateOrderStatus,
  cancelOrder,
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
  getOrderItems,
  applyDiscount,
  removeDiscount,
  getOrderHistory,
  getOrderAnalytics,
  bulkUpdateOrders,
  exportOrders,
  getOrderInvoice,
  processRefund,
  addOrderNote,
  getOrderNotes
};
