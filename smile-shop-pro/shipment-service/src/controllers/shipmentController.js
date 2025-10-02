const {
  getAllShipments,
  getShipmentById,
  createShipment,
  updateShipmentStatus,
  getShipmentByTrackingNumber,
  getAvailableShippingMethods,
  getShipmentTracking,
  addTrackingUpdate,
} = require('../models/shipmentModel');
const { AppError, catchAsync } = require('../middlewares/errorHandler');
const axios = require('axios');

// Get all shipments with filtering and pagination
const getShipments = catchAsync(async (req, res) => {
  const {
    user_id,
    order_id,
    status,
    carrier_id,
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
    order_id,
    status,
    carrier_id,
    sort_by,
    sort_order,
    limit: limitNum,
    offset: offsetNum,
  };

  const shipments = await getAllShipments(options);

  // Get total count for pagination
  let countQuery = 'SELECT COUNT(*) as total FROM shipments WHERE 1=1';
  const countParams = [];

  if (user_id) {
    countQuery += ' AND user_id = $1';
    countParams.push(user_id);
  }

  if (order_id) {
    countQuery += ' AND order_id = $1';
    countParams.push(order_id);
  }

  if (status) {
    countQuery += ` AND status = '${status}'`;
  }

  if (carrier_id) {
    countQuery += ' AND carrier_id = $1';
    countParams.push(carrier_id);
  }

  const countResult = await require('../models/shipmentModel').pool.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0].total);

  res.status(200).json({
    shipments,
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

// Get single shipment by ID
const getShipment = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError('Shipment ID is required', 400);
  }

  const shipment = await getShipmentById(id);

  if (!shipment) {
    throw new AppError('Shipment not found', 404);
  }

  // Check if user can access this shipment
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && shipment.user_id !== req.user?.user_id) {
    throw new AppError('Access denied', 403);
  }

  res.status(200).json({ shipment });
});

// Create new shipment
const createNewShipment = catchAsync(async (req, res) => {
  const {
    order_id,
    method_id,
    weight_kg,
    dimensions_cm,
    package_count = 1,
    signature_required = false,
    insurance_amount = 0,
    special_instructions,
  } = req.body;

  // Validate required fields
  if (!order_id || !method_id) {
    throw new AppError('Order ID and shipping method ID are required', 400);
  }

  // Validate order exists and is in correct status
  try {
    const orderResponse = await axios.get(
      `${process.env.ORDER_SERVICE_URL}/api/orders/${order_id}`,
      {
        headers: {
          Authorization: req.headers.authorization,
        },
      }
    );

    const order = orderResponse.data.order;

    if (order.status !== 'confirmed' && order.status !== 'processing') {
      throw new AppError('Order must be confirmed or processing to create shipment', 400);
    }

  } catch (error) {
    if (error.response?.status === 404) {
      throw new AppError('Order not found', 404);
    }
    throw new AppError('Error validating order status', 500);
  }

  // Validate shipping method exists and is active
  const methods = await getAvailableShippingMethods();
  const selectedMethod = methods.find(m => m.method_id === method_id);

  if (!selectedMethod) {
    throw new AppError('Invalid or inactive shipping method', 400);
  }

  // Create shipment
  const shipmentData = {
    order_id,
    user_id: req.user.user_id,
    method_id,
    carrier_id: selectedMethod.carrier_id,
    weight_kg,
    dimensions_cm,
    package_count,
    signature_required,
    insurance_amount,
    special_instructions,
  };

  const newShipment = await createShipment(shipmentData);

  // Update order status to shipped
  try {
    await axios.put(
      `${process.env.ORDER_SERVICE_URL}/api/orders/${order_id}`,
      {
        status: 'shipped',
        notes: `Shipment created: ${newShipment.shipment_id}`,
      },
      {
        headers: {
          Authorization: req.headers.authorization,
        },
      }
    );
  } catch (error) {
    console.error('Error updating order status:', error);
    // Don't fail shipment creation if order update fails
  }

  res.status(201).json({
    shipment: newShipment,
    message: 'Shipment created successfully',
  });
});

// Update shipment status (Admin/Manager only)
const updateShipment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, tracking_number, carrier_tracking_url, notes } = req.body;

  if (!id) {
    throw new AppError('Shipment ID is required', 400);
  }

  if (!status) {
    throw new AppError('Status is required', 400);
  }

  // Validate status
  const validStatuses = ['pending', 'label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new AppError('Invalid status', 400);
  }

  // Check permissions
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    throw new AppError('Access denied', 403);
  }

  const trackingData = {
    tracking_number,
    carrier_tracking_url,
    description: notes || `Status updated to ${status}`,
  };

  const updatedShipment = await updateShipmentStatus(id, status, trackingData);

  if (!updatedShipment) {
    throw new AppError('Shipment not found', 404);
  }

  // Update order status if shipment is delivered
  if (status === 'delivered') {
    try {
      await axios.put(
        `${process.env.ORDER_SERVICE_URL}/api/orders/${updatedShipment.order_id}`,
        {
          status: 'delivered',
          notes: `Shipment delivered: ${tracking_number || 'N/A'}`,
        },
        {
          headers: {
            Authorization: req.headers.authorization,
          },
        }
      );
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  }

  res.status(200).json({
    shipment: updatedShipment,
    message: 'Shipment status updated successfully',
  });
});

// Get shipment by tracking number (public access)
const getShipmentByTracking = catchAsync(async (req, res) => {
  const { trackingNumber } = req.params;

  if (!trackingNumber) {
    throw new AppError('Tracking number is required', 400);
  }

  const shipment = await getShipmentByTrackingNumber(trackingNumber);

  if (!shipment) {
    throw new AppError('Shipment not found', 404);
  }

  // For public tracking, only return basic info
  const publicShipment = {
    shipment_id: shipment.shipment_id,
    tracking_number: shipment.tracking_number,
    status: shipment.status,
    estimated_delivery_date: shipment.estimated_delivery_date,
    actual_delivery_date: shipment.actual_delivery_date,
    carrier_name: shipment.carrier_name,
    method_name: shipment.method_name,
    tracking_history: shipment.tracking_history,
  };

  res.status(200).json({ shipment: publicShipment });
});

// Get available shipping methods
const getShippingMethods = catchAsync(async (req, res) => {
  const { address } = req.query;

  // For now, return all methods
  // In production, this would filter by address/zone
  const methods = await getAvailableShippingMethods(JSON.parse(address || '{}'));

  res.status(200).json({
    methods,
    count: methods.length,
  });
});

// Get shipment tracking history
const getShipmentTracking = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError('Shipment ID is required', 400);
  }

  // Check if user can access this shipment
  const shipment = await getShipmentById(id);
  if (!shipment) {
    throw new AppError('Shipment not found', 404);
  }

  if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && shipment.user_id !== req.user?.user_id) {
    throw new AppError('Access denied', 403);
  }

  const tracking = await getShipmentTracking(id);

  res.status(200).json({ tracking });
});

// Add tracking update (usually from carrier webhooks)
const addTrackingUpdate = catchAsync(async (req, res) => {
  const { shipment_id } = req.params;
  const {
    status,
    location,
    description,
    carrier_status,
    estimated_delivery,
    carrier_timestamp,
    raw_response,
  } = req.body;

  if (!shipment_id) {
    throw new AppError('Shipment ID is required', 400);
  }

  if (!status) {
    throw new AppError('Status is required', 400);
  }

  const trackingData = {
    status,
    location,
    description,
    carrier_status,
    estimated_delivery,
    carrier_timestamp,
    raw_response,
  };

  const trackingUpdate = await addTrackingUpdate(shipment_id, trackingData);

  res.status(201).json({
    tracking: trackingUpdate,
    message: 'Tracking update added successfully',
  });
});

// Get user's shipments
const getUserShipments = catchAsync(async (req, res) => {
  const options = {
    user_id: req.user.user_id,
    limit: 20,
    offset: 0,
  };

  const shipments = await getAllShipments(options);

  res.status(200).json({
    shipments,
    count: shipments.length,
  });
});

// Calculate shipping cost
const calculateShippingCost = catchAsync(async (req, res) => {
  const { method_id, weight_kg, address } = req.body;

  if (!method_id) {
    throw new AppError('Shipping method ID is required', 400);
  }

  if (!weight_kg || weight_kg <= 0) {
    throw new AppError('Valid weight is required', 400);
  }

  // Get shipping cost calculation
  const costQuery = await require('../models/shipmentModel').pool.query(
    'SELECT calculate_shipping_cost($1, $2) as cost',
    [method_id, weight_kg]
  );

  if (costQuery.rows.length === 0) {
    throw new AppError('Unable to calculate shipping cost', 500);
  }

  const shippingCost = costQuery.rows[0].cost;

  res.status(200).json({
    shipping_cost: shippingCost,
    weight_kg,
    method_id,
  });
});

// Get shipment statistics (Admin only)
const getShipmentStats = catchAsync(async (req, res) => {
  // Check if user is admin
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    throw new AppError('Access denied', 403);
  }

  const { period = '30d' } = req.query;

  // Parse period (e.g., '30d', '7d', '24h')
  const days = parseInt(period.replace('d', '')) || 30;

  // Get shipment statistics
  const statsQuery = `
    SELECT
      COUNT(*) as total_shipments,
      COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_shipments,
      COUNT(CASE WHEN status = 'in_transit' THEN 1 END) as in_transit_shipments,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_shipments,
      AVG(shipping_cost) as average_shipping_cost,
      SUM(shipping_cost) as total_shipping_revenue
    FROM shipments
    WHERE created_at >= NOW() - INTERVAL '${days} days'
  `;

  const statsResult = await require('../models/shipmentModel').pool.query(statsQuery);

  // Get carrier breakdown
  const carrierQuery = `
    SELECT sc.display_name as carrier, COUNT(s.shipment_id) as count, SUM(s.shipping_cost) as total
    FROM shipments s
    JOIN shipping_carriers sc ON s.carrier_id = sc.carrier_id
    WHERE s.created_at >= NOW() - INTERVAL '${days} days' AND s.status = 'delivered'
    GROUP BY sc.display_name
    ORDER BY total DESC
  `;

  const carrierResult = await require('../models/shipmentModel').pool.query(carrierQuery);

  res.status(200).json({
    period: `${days} days`,
    statistics: statsResult.rows[0],
    carriers: carrierResult.rows,
  });
});

module.exports = {
  getShipments,
  getShipment,
  createNewShipment,
  updateShipment,
  getShipmentByTracking,
  getShippingMethods,
  getShipmentTracking,
  addTrackingUpdate,
  getUserShipments,
  calculateShippingCost,
  getShipmentStats,
};
