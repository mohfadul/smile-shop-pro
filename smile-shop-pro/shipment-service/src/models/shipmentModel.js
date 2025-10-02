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
    console.log('New client connected to the shipment database');
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err);
  // Don't exit the process, just log the error
});

pool.on('remove', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Client removed from shipment pool');
  }
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Shipment database connected successfully');
    return true;
  } catch (err) {
    console.error('❌ Shipment database connection failed:', err.message);
    return false;
  }
};

// Graceful shutdown
const closePool = async () => {
  try {
    await pool.end();
    console.log('Shipment database pool closed');
  } catch (err) {
    console.error('Error closing shipment database pool:', err);
  }
};

// Health check query
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT 1 as health_check');
    return result.rows[0].health_check === 1;
  } catch (err) {
    console.error('Shipment health check failed:', err);
    return false;
  }
};

// Shipment queries
const getAllShipments = async (options = {}) => {
  const {
    user_id,
    order_id,
    status,
    carrier_id,
    sort_by = 'created_at',
    sort_order = 'desc',
    limit = 50,
    offset = 0
  } = options;

  let query = `
    SELECT s.*, sm.display_name as method_name, sc.display_name as carrier_name
    FROM shipments s
    LEFT JOIN shipping_methods sm ON s.method_id = sm.method_id
    LEFT JOIN shipping_carriers sc ON s.carrier_id = sc.carrier_id
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 0;

  // Add filters
  if (user_id) {
    paramCount++;
    query += ` AND s.user_id = $${paramCount}`;
    params.push(user_id);
  }

  if (order_id) {
    paramCount++;
    query += ` AND s.order_id = $${paramCount}`;
    params.push(order_id);
  }

  if (status) {
    paramCount++;
    query += ` AND s.status = $${paramCount}`;
    params.push(status);
  }

  if (carrier_id) {
    paramCount++;
    query += ` AND s.carrier_id = $${paramCount}`;
    params.push(carrier_id);
  }

  // Add sorting
  const validSortFields = ['created_at', 'updated_at', 'estimated_delivery_date', 'total_cost'];
  const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
  const order = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  query += ` ORDER BY s.${sortField} ${order}`;

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

const getShipmentById = async (shipmentId) => {
  const query = `
    SELECT s.*, sm.display_name as method_name, sc.display_name as carrier_name,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'tracking_id', st.tracking_id,
                 'status', st.status,
                 'location', st.location,
                 'description', st.description,
                 'carrier_timestamp', st.carrier_timestamp,
                 'created_at', st.created_at
               ) ORDER BY st.created_at DESC
             ) FILTER (WHERE st.tracking_id IS NOT NULL),
             '[]'::json
           ) as tracking_history
    FROM shipments s
    LEFT JOIN shipping_methods sm ON s.method_id = sm.method_id
    LEFT JOIN shipping_carriers sc ON s.carrier_id = sc.carrier_id
    LEFT JOIN shipment_tracking st ON s.shipment_id = st.shipment_id
    WHERE s.shipment_id = $1
    GROUP BY s.shipment_id, sm.display_name, sc.display_name
  `;

  const result = await pool.query(query, [shipmentId]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

const createShipment = async (shipmentData) => {
  const {
    order_id,
    user_id,
    method_id,
    carrier_id,
    weight_kg,
    dimensions_cm,
    package_count = 1,
    signature_required = false,
    insurance_amount = 0,
    special_instructions,
    estimated_delivery_date,
  } = shipmentData;

  // Calculate shipping cost
  const costQuery = await pool.query('SELECT calculate_shipping_cost($1, $2) as cost', [method_id, weight_kg]);

  if (costQuery.rows.length === 0) {
    throw new Error('Unable to calculate shipping cost');
  }

  const shippingCost = costQuery.rows[0].cost;
  const insuranceCost = insurance_amount > 0 ? insurance_amount * 0.01 : 0; // 1% insurance fee
  const totalCost = shippingCost + insuranceCost;

  // Estimate delivery date
  const deliveryQuery = await pool.query('SELECT estimate_delivery_date($1) as delivery_date', [method_id]);
  const estimatedDelivery = deliveryQuery.rows[0].delivery_date;

  const query = `
    INSERT INTO shipments (
      order_id, user_id, method_id, carrier_id, weight_kg, dimensions_cm,
      package_count, signature_required, insurance_amount, special_instructions,
      shipping_cost, insurance_cost, total_cost, estimated_delivery_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `;

  const result = await pool.query(query, [
    order_id,
    user_id,
    method_id,
    carrier_id,
    weight_kg,
    dimensions_cm,
    package_count,
    signature_required,
    insurance_amount,
    special_instructions,
    shippingCost,
    insuranceCost,
    totalCost,
    estimatedDelivery,
  ]);

  return result.rows[0];
};

const updateShipmentStatus = async (shipmentId, newStatus, trackingData = null) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update shipment status
    const updateQuery = `
      UPDATE shipments
      SET status = $1, updated_at = NOW(),
          ${newStatus === 'delivered' ? 'delivered_at = NOW(),' : ''}
          ${newStatus === 'shipped' ? 'shipped_at = NOW(),' : ''}
          ${trackingData?.tracking_number ? 'tracking_number = $3,' : ''}
          ${trackingData?.carrier_tracking_url ? 'carrier_tracking_url = $4,' : ''}
          ${trackingData?.actual_delivery_date ? 'actual_delivery_date = $5,' : ''}
      WHERE shipment_id = $2
      RETURNING *
    `;

    const updateParams = [newStatus, shipmentId];
    let paramCount = 2;

    if (trackingData?.tracking_number) {
      paramCount++;
      updateParams.push(trackingData.tracking_number);
    }

    if (trackingData?.carrier_tracking_url) {
      paramCount++;
      updateParams.push(trackingData.carrier_tracking_url);
    }

    if (trackingData?.actual_delivery_date) {
      paramCount++;
      updateParams.push(trackingData.actual_delivery_date);
    }

    const result = await client.query(updateQuery, updateParams);

    if (result.rows.length === 0) {
      throw new Error('Shipment not found');
    }

    // Add tracking record
    if (trackingData) {
      const trackingQuery = `
        INSERT INTO shipment_tracking (
          shipment_id, status, location, description, carrier_status,
          estimated_delivery, carrier_timestamp, raw_response
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await client.query(trackingQuery, [
        shipmentId,
        newStatus,
        trackingData.location,
        trackingData.description,
        trackingData.carrier_status,
        trackingData.estimated_delivery,
        trackingData.carrier_timestamp,
        JSON.stringify(trackingData.raw_response || {}),
      ]);
    }

    await client.query('COMMIT');
    return result.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getShipmentByTrackingNumber = async (trackingNumber) => {
  const query = `
    SELECT s.*, sm.display_name as method_name, sc.display_name as carrier_name,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'tracking_id', st.tracking_id,
                 'status', st.status,
                 'location', st.location,
                 'description', st.description,
                 'carrier_timestamp', st.carrier_timestamp,
                 'created_at', st.created_at
               ) ORDER BY st.created_at DESC
             ) FILTER (WHERE st.tracking_id IS NOT NULL),
             '[]'::json
           ) as tracking_history
    FROM shipments s
    LEFT JOIN shipping_methods sm ON s.method_id = sm.method_id
    LEFT JOIN shipping_carriers sc ON s.carrier_id = sc.carrier_id
    LEFT JOIN shipment_tracking st ON s.shipment_id = st.shipment_id
    WHERE s.tracking_number = $1
    GROUP BY s.shipment_id, sm.display_name, sc.display_name
  `;

  const result = await pool.query(query, [trackingNumber]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

const getAvailableShippingMethods = async (address = null) => {
  // For now, return all active methods
  // In production, this would filter by address/zone
  const query = `
    SELECT sm.*, sc.display_name as carrier_name, sc.name as carrier_code
    FROM shipping_methods sm
    JOIN shipping_carriers sc ON sm.carrier_id = sc.carrier_id
    WHERE sm.is_active = true AND sc.is_active = true
    ORDER BY sm.sort_order, sm.estimated_days
  `;

  const result = await pool.query(query);
  return result.rows;
};

const getShipmentTracking = async (shipmentId) => {
  const query = `
    SELECT * FROM shipment_tracking
    WHERE shipment_id = $1
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query, [shipmentId]);
  return result.rows;
};

const addTrackingUpdate = async (shipmentId, trackingData) => {
  const { status, location, description, carrier_status, estimated_delivery, carrier_timestamp, raw_response } = trackingData;

  const query = `
    INSERT INTO shipment_tracking (
      shipment_id, status, location, description, carrier_status,
      estimated_delivery, carrier_timestamp, raw_response
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const result = await pool.query(query, [
    shipmentId,
    status,
    location,
    description,
    carrier_status,
    estimated_delivery,
    carrier_timestamp,
    JSON.stringify(raw_response || {}),
  ]);

  return result.rows[0];
};

const getShippingCarriers = async () => {
  const query = `
    SELECT * FROM shipping_carriers
    WHERE is_active = true
    ORDER BY display_name
  `;

  const result = await pool.query(query);
  return result.rows;
};

const getShippingMethods = async (carrierId = null) => {
  let query = `
    SELECT sm.*, sc.display_name as carrier_name, sc.name as carrier_code
    FROM shipping_methods sm
    JOIN shipping_carriers sc ON sm.carrier_id = sc.carrier_id
    WHERE sm.is_active = true AND sc.is_active = true
  `;

  const params = [];

  if (carrierId) {
    query += ` AND sm.carrier_id = $1`;
    params.push(carrierId);
  }

  query += ` ORDER BY sc.display_name, sm.sort_order, sm.estimated_days`;

  const result = await pool.query(query, params);
  return result.rows;
};

module.exports = {
  pool,
  testConnection,
  closePool,
  healthCheck,
  getAllShipments,
  getShipmentById,
  createShipment,
  updateShipmentStatus,
  getShipmentByTrackingNumber,
  getAvailableShippingMethods,
  getShipmentTracking,
  addTrackingUpdate,
  getShippingCarriers,
  getShippingMethods,
};
