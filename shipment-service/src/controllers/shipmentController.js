const { pool } = require('../models/shipmentModel');
const catchAsync = require('../utils/catchAsync');
const crypto = require('crypto');

// Sudan-specific cities and regions
const SUDAN_CITIES = {
  'khartoum': { name: 'Khartoum', state: 'Khartoum', zone: 'central' },
  'omdurman': { name: 'Omdurman', state: 'Khartoum', zone: 'central' },
  'bahri': { name: 'Bahri', state: 'Khartoum', zone: 'central' },
  'kassala': { name: 'Kassala', state: 'Kassala', zone: 'eastern' },
  'gedaref': { name: 'Gedaref', state: 'Gedaref', zone: 'eastern' },
  'port_sudan': { name: 'Port Sudan', state: 'Red Sea', zone: 'eastern' },
  'el_obeid': { name: 'El Obeid', state: 'North Kordofan', zone: 'western' },
  'nyala': { name: 'Nyala', state: 'South Darfur', zone: 'western' },
  'el_fasher': { name: 'El Fasher', state: 'North Darfur', zone: 'western' },
  'wad_medani': { name: 'Wad Medani', state: 'Gezira', zone: 'central' }
};

// Generate tracking number
const generateTrackingNumber = () => {
  return `SS${Date.now().toString().substr(-8)}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
};

// Calculate shipping cost based on Sudan geography
const calculateShippingCostLogic = (pickupCity, deliveryCity, weight, dimensions, insuranceValue = 0) => {
  const pickup = SUDAN_CITIES[pickupCity.toLowerCase().replace(' ', '_')];
  const delivery = SUDAN_CITIES[deliveryCity.toLowerCase().replace(' ', '_')];

  if (!pickup || !delivery) {
    throw new Error('Unsupported city for delivery');
  }

  let baseCost = 50; // Base cost in SDG
  let weightCost = weight * 10; // 10 SDG per kg

  // Zone-based pricing
  if (pickup.zone !== delivery.zone) {
    baseCost += 100; // Inter-zone delivery
  }

  // Distance-based pricing (simplified)
  const distanceMultiplier = pickup.zone === delivery.zone ? 1 : 
                            (pickup.zone === 'central' || delivery.zone === 'central') ? 1.5 : 2;
  
  const shippingCost = (baseCost + weightCost) * distanceMultiplier;
  
  // Insurance cost (1% of insured value)
  const insuranceCost = insuranceValue * 0.01;
  
  // Delivery time estimation
  const deliveryDays = pickup.zone === delivery.zone ? 
                      (pickup.name === delivery.name ? 1 : 2) : 
                      pickup.zone === 'central' || delivery.zone === 'central' ? 3 : 5;

  return {
    base_cost: baseCost,
    weight_cost: weightCost,
    insurance_cost: insuranceCost,
    total_cost: shippingCost + insuranceCost,
    estimated_delivery_days: deliveryDays,
    zone_info: {
      pickup_zone: pickup.zone,
      delivery_zone: delivery.zone,
      is_inter_zone: pickup.zone !== delivery.zone
    }
  };
};

// Create Shipment
const createShipment = catchAsync(async (req, res) => {
  const {
    order_id,
    shipping_method_id,
    pickup_address,
    delivery_address,
    package_details,
    special_instructions,
    insurance_value = 0,
    requires_signature = false
  } = req.body;

  // Verify order exists
  const orderResult = await pool.query(
    'SELECT order_id, customer_id, total_amount FROM orders WHERE order_id = $1',
    [order_id]
  );

  if (orderResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found',
      message: 'The specified order does not exist'
    });
  }

  // Verify shipping method exists
  const methodResult = await pool.query(
    'SELECT method_id, name, base_cost FROM shipping_methods WHERE method_id = $1 AND is_active = true',
    [shipping_method_id]
  );

  if (methodResult.rows.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid shipping method',
      message: 'The specified shipping method is not available'
    });
  }

  // Calculate shipping cost
  const costCalculation = calculateShippingCostLogic(
    pickup_address.city,
    delivery_address.city,
    package_details.weight,
    package_details.dimensions,
    insurance_value
  );

  const trackingNumber = generateTrackingNumber();

  // Create shipment
  const shipmentResult = await pool.query(
    `INSERT INTO shipments 
     (order_id, tracking_number, shipping_method_id, status, pickup_address, 
      delivery_address, package_details, shipping_cost, insurance_value, 
      estimated_delivery_date, special_instructions, requires_signature, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING shipment_id, tracking_number, created_at`,
    [
      order_id,
      trackingNumber,
      shipping_method_id,
      'pending',
      JSON.stringify(pickup_address),
      JSON.stringify(delivery_address),
      JSON.stringify(package_details),
      costCalculation.total_cost,
      insurance_value,
      new Date(Date.now() + costCalculation.estimated_delivery_days * 24 * 60 * 60 * 1000),
      special_instructions,
      requires_signature,
      req.user?.user_id
    ]
  );

  // Create initial tracking entry
  await pool.query(
    `INSERT INTO shipment_tracking 
     (shipment_id, status, location, notes, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      shipmentResult.rows[0].shipment_id,
      'pending',
      pickup_address.city,
      'Shipment created and pending pickup',
      req.user?.user_id
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Shipment created successfully',
    data: {
      shipment_id: shipmentResult.rows[0].shipment_id,
      tracking_number: trackingNumber,
      estimated_delivery_days: costCalculation.estimated_delivery_days,
      shipping_cost: costCalculation.total_cost,
      created_at: shipmentResult.rows[0].created_at
    }
  });
});

// Get Shipment by ID
const getShipmentById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.user_id;
  const userRole = req.user?.role;

  // Build authorization clause
  let authClause = '';
  const values = [id];
  
  // If not admin/staff, only allow access to own shipments
  if (!userRole || !['admin', 'manager', 'staff'].includes(userRole)) {
    if (userId) {
      authClause = 'AND (o.customer_id = $2 OR s.created_by = $2)';
      values.push(userId);
    }
  }

  const result = await pool.query(
    `SELECT 
      s.shipment_id, s.tracking_number, s.status, s.pickup_address, s.delivery_address,
      s.package_details, s.shipping_cost, s.insurance_value, s.estimated_delivery_date,
      s.actual_delivery_date, s.special_instructions, s.requires_signature,
      s.created_at, s.updated_at,
      sm.name as shipping_method_name, sm.description as shipping_method_description,
      o.order_number, o.total_amount as order_total,
      u.first_name, u.last_name, u.email,
      da.name as agent_name, da.phone as agent_phone,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'tracking_id', st.tracking_id,
            'status', st.status,
            'location', st.location,
            'notes', st.notes,
            'coordinates', st.coordinates,
            'created_at', st.created_at
          ) ORDER BY st.created_at ASC
        ) FROM shipment_tracking st WHERE st.shipment_id = s.shipment_id),
        '[]'::json
      ) as tracking_history
     FROM shipments s
     LEFT JOIN orders o ON s.order_id = o.order_id
     LEFT JOIN users u ON o.customer_id = u.user_id
     LEFT JOIN shipping_methods sm ON s.shipping_method_id = sm.method_id
     LEFT JOIN delivery_agents da ON s.assigned_agent_id = da.agent_id
     WHERE s.shipment_id = $1 ${authClause}`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Shipment not found',
      message: 'Shipment with the specified ID does not exist or you do not have access to it'
    });
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
});

// Get All Shipments (Admin/Staff)
const getAllShipments = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    shipping_method,
    delivery_agent,
    city,
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
    whereClause += ` AND s.status = $${++paramCount}`;
    values.push(status);
  }

  if (shipping_method) {
    whereClause += ` AND s.shipping_method_id = $${++paramCount}`;
    values.push(shipping_method);
  }

  if (delivery_agent) {
    whereClause += ` AND s.assigned_agent_id = $${++paramCount}`;
    values.push(delivery_agent);
  }

  if (city) {
    whereClause += ` AND (s.delivery_address->>'city' ILIKE $${++paramCount} OR s.pickup_address->>'city' ILIKE $${paramCount})`;
    values.push(`%${city}%`);
  }

  if (start_date) {
    whereClause += ` AND s.created_at >= $${++paramCount}`;
    values.push(start_date);
  }

  if (end_date) {
    whereClause += ` AND s.created_at <= $${++paramCount}`;
    values.push(end_date);
  }

  // Validate sort field
  const allowedSortFields = ['created_at', 'delivery_date', 'status', 'shipping_cost'];
  const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
  const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Count total shipments
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM shipments s ${whereClause}`,
    values
  );

  // Get shipments
  const shipmentsResult = await pool.query(
    `SELECT 
      s.shipment_id, s.tracking_number, s.status, s.shipping_cost,
      s.estimated_delivery_date, s.actual_delivery_date, s.created_at,
      s.delivery_address->>'city' as delivery_city,
      s.pickup_address->>'city' as pickup_city,
      sm.name as shipping_method_name,
      o.order_number,
      u.first_name, u.last_name,
      da.name as agent_name
     FROM shipments s
     LEFT JOIN orders o ON s.order_id = o.order_id
     LEFT JOIN users u ON o.customer_id = u.user_id
     LEFT JOIN shipping_methods sm ON s.shipping_method_id = sm.method_id
     LEFT JOIN delivery_agents da ON s.assigned_agent_id = da.agent_id
     ${whereClause}
     ORDER BY s.${sortField} ${sortOrder}
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalShipments = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalShipments / limit);

  res.json({
    success: true,
    data: {
      shipments: shipmentsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalShipments,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Get User Shipments
const getUserShipments = catchAsync(async (req, res) => {
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
    whereClause += ` AND s.status = $${++paramCount}`;
    values.push(status);
  }

  if (start_date) {
    whereClause += ` AND s.created_at >= $${++paramCount}`;
    values.push(start_date);
  }

  if (end_date) {
    whereClause += ` AND s.created_at <= $${++paramCount}`;
    values.push(end_date);
  }

  // Count total shipments
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM shipments s 
     LEFT JOIN orders o ON s.order_id = o.order_id 
     ${whereClause}`,
    values
  );

  // Get shipments
  const shipmentsResult = await pool.query(
    `SELECT 
      s.shipment_id, s.tracking_number, s.status, s.shipping_cost,
      s.estimated_delivery_date, s.actual_delivery_date, s.created_at,
      s.delivery_address->>'city' as delivery_city,
      sm.name as shipping_method_name,
      o.order_number
     FROM shipments s
     LEFT JOIN orders o ON s.order_id = o.order_id
     LEFT JOIN shipping_methods sm ON s.shipping_method_id = sm.method_id
     ${whereClause}
     ORDER BY s.created_at DESC
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalShipments = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalShipments / limit);

  res.json({
    success: true,
    data: {
      shipments: shipmentsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalShipments,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Get Shipment Tracking
const getShipmentTracking = catchAsync(async (req, res) => {
  const { trackingNumber, id } = req.params;

  let whereClause;
  let values;

  if (trackingNumber) {
    whereClause = 'WHERE s.tracking_number = $1';
    values = [trackingNumber];
  } else if (id) {
    whereClause = 'WHERE s.shipment_id = $1';
    values = [id];
  } else {
    return res.status(400).json({
      success: false,
      error: 'Missing parameter',
      message: 'Either tracking number or shipment ID is required'
    });
  }

  const result = await pool.query(
    `SELECT 
      s.shipment_id, s.tracking_number, s.status, s.estimated_delivery_date,
      s.actual_delivery_date, s.delivery_address->>'city' as delivery_city,
      s.pickup_address->>'city' as pickup_city,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'status', st.status,
            'location', st.location,
            'notes', st.notes,
            'coordinates', st.coordinates,
            'created_at', st.created_at
          ) ORDER BY st.created_at ASC
        ) FROM shipment_tracking st WHERE st.shipment_id = s.shipment_id),
        '[]'::json
      ) as tracking_history
     FROM shipments s
     ${whereClause}`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Shipment not found',
      message: 'No shipment found with the provided tracking information'
    });
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
});

// Calculate Shipping Cost
const calculateShippingCost = catchAsync(async (req, res) => {
  const { pickup_city, delivery_city, weight, dimensions, insurance_value = 0 } = req.body;

  try {
    const costCalculation = calculateShippingCostLogic(
      pickup_city,
      delivery_city,
      weight,
      dimensions,
      insurance_value
    );

    res.json({
      success: true,
      data: {
        pickup_city,
        delivery_city,
        weight,
        insurance_value,
        cost_breakdown: costCalculation,
        available_methods: [
          {
            method: 'standard',
            cost: costCalculation.total_cost,
            delivery_days: costCalculation.estimated_delivery_days
          },
          {
            method: 'express',
            cost: costCalculation.total_cost * 1.5,
            delivery_days: Math.max(1, costCalculation.estimated_delivery_days - 1)
          }
        ]
      }
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Calculation error',
      message: error.message
    });
  }
});

// Get Shipping Methods
const getShippingMethods = catchAsync(async (req, res) => {
  const result = await pool.query(
    `SELECT method_id, name, description, delivery_time_min, delivery_time_max,
            base_cost, cost_per_kg, service_type, is_active
     FROM shipping_methods 
     WHERE is_active = true 
     ORDER BY sort_order ASC, name ASC`
  );

  res.json({
    success: true,
    data: result.rows
  });
});

// Get Shipping Zones
const getShippingZones = catchAsync(async (req, res) => {
  const result = await pool.query(
    `SELECT zone_id, name, description, cities, delivery_time_days, 
            shipping_cost, is_active
     FROM shipping_zones 
     WHERE is_active = true 
     ORDER BY name ASC`
  );

  res.json({
    success: true,
    data: result.rows.map(zone => ({
      ...zone,
      supported_cities: SUDAN_CITIES
    }))
  });
});

// Placeholder functions for remaining endpoints
const updateShipmentStatus = catchAsync(async (req, res) => {
  // TODO: Implement update shipment status
  res.json({
    success: true,
    message: 'Update shipment status functionality to be implemented'
  });
});

const addTrackingUpdate = catchAsync(async (req, res) => {
  // TODO: Implement add tracking update
  res.json({
    success: true,
    message: 'Add tracking update functionality to be implemented'
  });
});

const addShippingMethod = catchAsync(async (req, res) => {
  // TODO: Implement add shipping method
  res.json({
    success: true,
    message: 'Add shipping method functionality to be implemented'
  });
});

const updateShippingMethod = catchAsync(async (req, res) => {
  // TODO: Implement update shipping method
  res.json({
    success: true,
    message: 'Update shipping method functionality to be implemented'
  });
});

const deleteShippingMethod = catchAsync(async (req, res) => {
  // TODO: Implement delete shipping method
  res.json({
    success: true,
    message: 'Delete shipping method functionality to be implemented'
  });
});

const addShippingZone = catchAsync(async (req, res) => {
  // TODO: Implement add shipping zone
  res.json({
    success: true,
    message: 'Add shipping zone functionality to be implemented'
  });
});

const updateShippingZone = catchAsync(async (req, res) => {
  // TODO: Implement update shipping zone
  res.json({
    success: true,
    message: 'Update shipping zone functionality to be implemented'
  });
});

const deleteShippingZone = catchAsync(async (req, res) => {
  // TODO: Implement delete shipping zone
  res.json({
    success: true,
    message: 'Delete shipping zone functionality to be implemented'
  });
});

const getDeliveryRoutes = catchAsync(async (req, res) => {
  // TODO: Implement get delivery routes
  res.json({
    success: true,
    data: []
  });
});

const optimizeDeliveryRoute = catchAsync(async (req, res) => {
  // TODO: Implement route optimization
  res.json({
    success: true,
    message: 'Route optimization functionality to be implemented'
  });
});

const assignDeliveryAgent = catchAsync(async (req, res) => {
  // TODO: Implement assign delivery agent
  res.json({
    success: true,
    message: 'Assign delivery agent functionality to be implemented'
  });
});

const getDeliveryAgents = catchAsync(async (req, res) => {
  // TODO: Implement get delivery agents
  res.json({
    success: true,
    data: []
  });
});

const addDeliveryAgent = catchAsync(async (req, res) => {
  // TODO: Implement add delivery agent
  res.json({
    success: true,
    message: 'Add delivery agent functionality to be implemented'
  });
});

const updateDeliveryAgent = catchAsync(async (req, res) => {
  // TODO: Implement update delivery agent
  res.json({
    success: true,
    message: 'Update delivery agent functionality to be implemented'
  });
});

const getShipmentAnalytics = catchAsync(async (req, res) => {
  // TODO: Implement shipment analytics
  res.json({
    success: true,
    data: {
      message: 'Shipment analytics to be implemented'
    }
  });
});

const exportShipments = catchAsync(async (req, res) => {
  // TODO: Implement export shipments
  res.json({
    success: true,
    message: 'Export shipments functionality to be implemented'
  });
});

const bulkShipmentUpdate = catchAsync(async (req, res) => {
  // TODO: Implement bulk shipment update
  res.json({
    success: true,
    message: 'Bulk shipment update functionality to be implemented'
  });
});

const schedulePickup = catchAsync(async (req, res) => {
  // TODO: Implement schedule pickup
  res.json({
    success: true,
    message: 'Schedule pickup functionality to be implemented'
  });
});

const confirmDelivery = catchAsync(async (req, res) => {
  // TODO: Implement confirm delivery
  res.json({
    success: true,
    message: 'Confirm delivery functionality to be implemented'
  });
});

const reportDeliveryIssue = catchAsync(async (req, res) => {
  // TODO: Implement report delivery issue
  res.json({
    success: true,
    message: 'Report delivery issue functionality to be implemented'
  });
});

const getDeliveryProof = catchAsync(async (req, res) => {
  // TODO: Implement get delivery proof
  res.json({
    success: true,
    message: 'Get delivery proof functionality to be implemented'
  });
});

module.exports = {
  createShipment,
  getShipmentById,
  getAllShipments,
  getUserShipments,
  updateShipmentStatus,
  addTrackingUpdate,
  getShipmentTracking,
  calculateShippingCost,
  getShippingMethods,
  addShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
  getShippingZones,
  addShippingZone,
  updateShippingZone,
  deleteShippingZone,
  getDeliveryRoutes,
  optimizeDeliveryRoute,
  assignDeliveryAgent,
  getDeliveryAgents,
  addDeliveryAgent,
  updateDeliveryAgent,
  getShipmentAnalytics,
  exportShipments,
  bulkShipmentUpdate,
  schedulePickup,
  confirmDelivery,
  reportDeliveryIssue,
  getDeliveryProof
};
