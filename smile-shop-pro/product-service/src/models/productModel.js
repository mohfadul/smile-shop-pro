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
    console.log('New client connected to the product database');
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err);
  // Don't exit the process, just log the error
});

pool.on('remove', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Client removed from product pool');
  }
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Product database connected successfully');
    return true;
  } catch (err) {
    console.error('❌ Product database connection failed:', err.message);
    return false;
  }
};

// Graceful shutdown
const closePool = async () => {
  try {
    await pool.end();
    console.log('Product database pool closed');
  } catch (err) {
    console.error('Error closing product database pool:', err);
  }
};

// Health check query
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT 1 as health_check');
    return result.rows[0].health_check === 1;
  } catch (err) {
    console.error('Product health check failed:', err);
    return false;
  }
};

// Product queries
const getAllProducts = async (options = {}) => {
  const {
    category_id,
    status = 'active',
    featured,
    search,
    sort_by = 'created_at',
    sort_order = 'desc',
    limit = 50,
    offset = 0
  } = options;

  let query = `
    SELECT p.*, c.name as category_name, c.description as category_description,
           COALESCE(pi.image_url, '') as primary_image
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.category_id
    LEFT JOIN (
      SELECT product_id, url as image_url
      FROM product_images
      WHERE is_primary = true
    ) pi ON p.product_id = pi.product_id
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 0;

  // Add filters
  if (category_id) {
    paramCount++;
    query += ` AND p.category_id = $${paramCount}`;
    params.push(category_id);
  }

  if (status) {
    paramCount++;
    query += ` AND p.status = $${paramCount}`;
    params.push(status);
  }

  if (featured !== undefined) {
    paramCount++;
    query += ` AND p.is_featured = $${paramCount}`;
    params.push(featured);
  }

  if (search) {
    paramCount++;
    query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR p.sku ILIKE $${paramCount})`;
    params.push(`%${search}%`);
  }

  // Add sorting
  const validSortFields = ['name', 'price', 'created_at', 'updated_at', 'stock_quantity'];
  const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
  const order = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  query += ` ORDER BY p.${sortField} ${order}`;

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

const getProductById = async (productId) => {
  const query = `
    SELECT p.*, c.name as category_name, c.description as category_description,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'image_id', pi.image_id,
                 'url', pi.url,
                 'alt_text', pi.alt_text,
                 'sort_order', pi.sort_order,
                 'is_primary', pi.is_primary
               ) ORDER BY pi.sort_order
             ) FILTER (WHERE pi.image_id IS NOT NULL),
             '[]'::json
           ) as images
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.category_id
    LEFT JOIN product_images pi ON p.product_id = pi.product_id
    WHERE p.product_id = $1
    GROUP BY p.product_id, c.name, c.description
  `;

  const result = await pool.query(query, [productId]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

const createProduct = async (productData) => {
  const {
    name,
    description,
    short_description,
    sku,
    price,
    cost_price,
    compare_at_price,
    category_id,
    brand,
    manufacturer,
    model,
    status = 'active',
    is_featured = false,
    stock_quantity = 0,
    low_stock_threshold = 5,
    track_inventory = true,
    allow_backorders = false,
    seo_title,
    seo_description,
    seo_keywords,
    specifications,
    tags
  } = productData;

  const query = `
    INSERT INTO products (
      name, description, short_description, sku, price, cost_price, compare_at_price,
      category_id, brand, manufacturer, model, status, is_featured, stock_quantity,
      low_stock_threshold, track_inventory, allow_backorders, seo_title, seo_description,
      seo_keywords, specifications, tags
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
    ) RETURNING *
  `;

  const params = [
    name, description, short_description, sku, price, cost_price, compare_at_price,
    category_id, brand, manufacturer, model, status, is_featured, stock_quantity,
    low_stock_threshold, track_inventory, allow_backorders, seo_title, seo_description,
    seo_keywords, specifications, tags
  ];

  const result = await pool.query(query, params);
  return result.rows[0];
};

const updateProduct = async (productId, updates) => {
  const allowedFields = [
    'name', 'description', 'short_description', 'price', 'cost_price', 'compare_at_price',
    'category_id', 'brand', 'manufacturer', 'model', 'status', 'is_featured',
    'stock_quantity', 'low_stock_threshold', 'track_inventory', 'allow_backorders',
    'seo_title', 'seo_description', 'seo_keywords', 'specifications', 'tags'
  ];

  const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
  const values = fields.map(field => updates[field]);
  values.unshift(productId); // Add productId as first parameter

  const query = `
    UPDATE products
    SET ${setClause}, updated_at = NOW()
    WHERE product_id = $1
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
};

const deleteProduct = async (productId) => {
  const result = await pool.query(
    'DELETE FROM products WHERE product_id = $1 RETURNING *',
    [productId]
  );
  return result.rows[0];
};

// Category queries
const getAllCategories = async () => {
  const query = `
    SELECT c.*, COUNT(p.product_id) as product_count
    FROM categories c
    LEFT JOIN products p ON c.category_id = p.category_id AND p.status = 'active'
    WHERE c.is_active = true
    GROUP BY c.category_id, c.name, c.description, c.parent_category_id, c.is_active, c.sort_order, c.created_at, c.updated_at
    ORDER BY c.sort_order, c.name
  `;

  const result = await pool.query(query);
  return result.rows;
};

const getCategoryById = async (categoryId) => {
  const query = `
    SELECT c.*, COUNT(p.product_id) as product_count
    FROM categories c
    LEFT JOIN products p ON c.category_id = p.category_id AND p.status = 'active'
    WHERE c.category_id = $1 AND c.is_active = true
    GROUP BY c.category_id
  `;

  const result = await pool.query(query, [categoryId]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

const createCategory = async (categoryData) => {
  const { name, description, parent_category_id, sort_order = 0 } = categoryData;

  const query = `
    INSERT INTO categories (name, description, parent_category_id, sort_order)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const result = await pool.query(query, [name, description, parent_category_id, sort_order]);
  return result.rows[0];
};

module.exports = {
  pool,
  testConnection,
  closePool,
  healthCheck,
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllCategories,
  getCategoryById,
  createCategory,
};
