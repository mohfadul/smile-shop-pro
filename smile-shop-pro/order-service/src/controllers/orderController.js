const {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  cancelOrder,
  getOrderItems,
  getOrderStatusHistory,
  updateOrderPaymentStatus,
} = require('../models/orderModel');
const { AppError, catchAsync } = require('../middlewares/errorHandler');
const axios = require('axios');

// Get all orders with filtering and pagination
const getOrders = catchAsync(async (req, res) => {
  const {
    user_id,
    status,
    payment_status,
    sort_by = 'created_at',
    sort_order = 'desc',
    limit = 50,
    offset = 0,
    page,
  } = req.query;

  // Handle pagination
  const pageNum = parseInt(page) || 1;
  const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 per page
  const offsetNum = pageNum > 1 ? (pageNum - 1) * limitNum : parseInt(offset) || 0;

  const options = {
    user_id,
    status,
    payment_status,
    sort_by,
    sort_order,
    limit: limitNum,
    offset: offsetNum,
  };

  const orders = await getAllOrders(options);

  // Get total count for pagination
  let countQuery = 'SELECT COUNT(*) as total FROM orders WHERE 1=1';
  const countParams = [];

  if (user_id) {
    countQuery += ' AND user_id = $1';
    countParams.push(user_id);
  }

  if (status) {
    countQuery += ` AND status = '${status}'`;
  }

  if (payment_status) {
    countQuery += ` AND payment_status = '${payment_status}'`;
  }

  const countResult = await require('../models/orderModel').pool.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0].total);

  res.status(200).json({
    orders,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      has_next: pageNum * limitNum < total,
      has_prev: pageNum > 1,
    },
  });
});

// Get single order by ID
const getOrder = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError('Order ID is required', 400);
  }

  const order = await getOrderById(id);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  // Check if user can access this order
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && order.user_id !== req.user?.user_id) {
    throw new AppError('Access denied', 403);
  }

  res.status(200).json({ order });
});

// Create new order
const createNewOrder = catchAsync(async (req, res) => {
  const { items, shipping_address, billing_address, shipping_method, notes, coupon_code } = req.body;

  // Validate required fields
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError('Order must contain at least one item', 400);
  }

  if (!shipping_address) {
    throw new AppError('Shipping address is required', 400);
  }

  // Validate each item
  for (const item of items) {
    if (!item.product_id || !item.quantity || !item.unit_price) {
      throw new AppError('Each order item must have product_id, quantity, and unit_price', 400);
    }

    if (item.quantity <= 0) {
      throw new AppError('Item quantity must be greater than 0', 400);
    }

    if (item.unit_price < 0) {
      throw new AppError('Item price cannot be negative', 400);
    }
  }

  // Check product availability (call product-service)
  try {
    for (const item of items) {
      const productResponse = await axios.get(
        `${process.env.PRODUCT_SERVICE_URL}/api/products/${item.product_id}`
      );

      const product = productResponse.data.product;

      if (!product || product.status !== 'active') {
        throw new AppError(`Product ${item.product_id} is not available`, 400);
      }

      if (product.stock_quantity < item.quantity) {
        throw new AppError(`Insufficient stock for product ${product.name}`, 400);
      }
    }
  } catch (error) {
    if (error.response?.status === 404) {
      throw new AppError('One or more products not found', 400);
    }
    throw new AppError('Error validating product availability', 500);
  }

  // Create order
  const orderData = {
    user_id: req.user.user_id,
    items,
    shipping_address,
    billing_address,
    shipping_method,
    notes,
    coupon_code,
  };

  const newOrder = await createOrder(orderData);

  // Update product stock (call product-service)
  try {
    for (const item of items) {
      await axios.patch(
        `${process.env.PRODUCT_SERVICE_URL}/api/products/${item.product_id}/stock`,
        {
          stock_quantity: -item.quantity, // Reduce stock
          operation: 'subtract',
        }
      );
    }
  } catch (error) {
    console.error('Error updating product stock:', error);
    // Don't fail the order if stock update fails, but log it
  }

  res.status(201).json({
    order: newOrder,
    message: 'Order created successfully',
  });
});

// Update order status (Admin/Manager only)
const updateOrder = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!id) {
    throw new AppError('Order ID is required', 400);
  }

  if (!status) {
    throw new AppError('Status is required', 400);
  }

  // Validate status
  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
  if (!validStatuses.includes(status)) {
    throw new AppError('Invalid status', 400);
  }

  // Check permissions
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    throw new AppError('Access denied', 403);
  }

  const updatedOrder = await updateOrderStatus(id, status, notes);

  if (!updatedOrder) {
    throw new AppError('Order not found', 404);
  }

  res.status(200).json({
    order: updatedOrder,
    message: 'Order status updated successfully',
  });
});

// Cancel order
const cancelExistingOrder = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!id) {
    throw new AppError('Order ID is required', 400);
  }

  // Get order to check ownership
  const order = await getOrderById(id);
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  // Check if user can cancel this order
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && order.user_id !== req.user?.user_id) {
    throw new AppError('Access denied', 403);
  }

  const cancelledOrder = await cancelOrder(id, reason);

  // If order was cancelled, restore product stock
  if (cancelledOrder.status === 'cancelled') {
    const orderItems = await getOrderItems(id);

    try {
      for (const item of orderItems) {
        await axios.patch(
          `${process.env.PRODUCT_SERVICE_URL}/api/products/${item.product_id}/stock`,
          {
            stock_quantity: item.quantity, // Restore stock
            operation: 'add',
          }
        );
      }
    } catch (error) {
      console.error('Error restoring product stock:', error);
      // Don't fail the cancellation if stock restoration fails
    }
  }

  res.status(200).json({
    order: cancelledOrder,
    message: 'Order cancelled successfully',
  });
});

// Get order items
const getOrderItems = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError('Order ID is required', 400);
  }

  // Check if user can access this order
  const order = await require('../models/orderModel').getOrderById(id);
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && order.user_id !== req.user?.user_id) {
    throw new AppError('Access denied', 403);
  }

  const items = await getOrderItems(id);

  res.status(200).json({ items });
});

// Get order status history
const getOrderHistory = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError('Order ID is required', 400);
  }

  // Check if user can access this order
  const order = await require('../models/orderModel').getOrderById(id);
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && order.user_id !== req.user?.user_id) {
    throw new AppError('Access denied', 403);
  }

  const history = await getOrderStatusHistory(id);

  res.status(200).json({ history });
});

// Update payment status (usually called by payment-service)
const updatePaymentStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { payment_status, payment_reference } = req.body;

  if (!id) {
    throw new AppError('Order ID is required', 400);
  }

  if (!payment_status) {
    throw new AppError('Payment status is required', 400);
  }

  // Validate payment status
  const validStatuses = ['pending', 'paid', 'failed', 'refunded', 'cancelled'];
  if (!validStatuses.includes(payment_status)) {
    throw new AppError('Invalid payment status', 400);
  }

  const updatedOrder = await updateOrderPaymentStatus(id, payment_status, payment_reference);

  if (!updatedOrder) {
    throw new AppError('Order not found', 404);
  }

  // If payment is successful, update order status to confirmed
  if (payment_status === 'paid' && updatedOrder.status === 'pending') {
    await updateOrderStatus(id, 'confirmed', 'Payment received');
  }

  res.status(200).json({
    order: updatedOrder,
    message: 'Payment status updated successfully',
  });
});

// Get user's orders
const getUserOrders = catchAsync(async (req, res) => {
  const options = {
    user_id: req.user.user_id,
    limit: 20,
    offset: 0,
  };

  const orders = await getAllOrders(options);

  res.status(200).json({
    orders,
    count: orders.length,
  });
});

module.exports = {
  getOrders,
  getOrder,
  createNewOrder,
  updateOrder,
  cancelExistingOrder,
  getOrderItems,
  getOrderHistory,
  updatePaymentStatus,
  getUserOrders,
};
