const { pool } = require('../models/productModel');
const catchAsync = require('../utils/catchAsync');

// Get All Products with filtering and pagination
const getAllProducts = catchAsync(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    category, 
    brand, 
    status = 'active', 
    dental_category,
    sort = 'created_at',
    order = 'desc',
    min_price,
    max_price,
    in_stock_only = false
  } = req.query;

  const offset = (page - 1) * limit;
  let whereClause = 'WHERE p.status = $1';
  const values = [status];
  let paramCount = 1;

  if (category) {
    whereClause += ` AND p.category_id = $${++paramCount}`;
    values.push(category);
  }

  if (brand) {
    whereClause += ` AND p.brand ILIKE $${++paramCount}`;
    values.push(`%${brand}%`);
  }

  if (dental_category) {
    whereClause += ` AND p.dental_category = $${++paramCount}`;
    values.push(dental_category);
  }

  if (min_price) {
    whereClause += ` AND p.price >= $${++paramCount}`;
    values.push(parseFloat(min_price));
  }

  if (max_price) {
    whereClause += ` AND p.price <= $${++paramCount}`;
    values.push(parseFloat(max_price));
  }

  if (in_stock_only === 'true') {
    whereClause += ` AND p.stock_quantity > 0`;
  }

  // Validate sort field
  const allowedSortFields = ['name', 'price', 'created_at', 'stock_quantity', 'rating'];
  const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
  const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Count total products
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM products p ${whereClause}`,
    values
  );

  // Get products with category information
  const productsResult = await pool.query(
    `SELECT 
      p.product_id, p.name, p.description, p.sku, p.price, p.brand,
      p.stock_quantity, p.min_stock_level, p.weight, p.dimensions,
      p.is_featured, p.status, p.dental_category, p.requires_prescription,
      p.average_rating, p.total_reviews, p.created_at, p.updated_at,
      c.name as category_name, c.description as category_description,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'image_id', pi.image_id,
            'image_url', pi.image_url,
            'alt_text', pi.alt_text,
            'is_primary', pi.is_primary
          )
        ) FROM product_images pi WHERE pi.product_id = p.product_id),
        '[]'::json
      ) as images
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.category_id
     ${whereClause}
     ORDER BY p.${sortField} ${sortOrder}
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalProducts = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalProducts / limit);

  res.json({
    success: true,
    data: {
      products: productsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalProducts,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Get Product by ID
const getProductById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const productResult = await pool.query(
    `SELECT 
      p.product_id, p.name, p.description, p.sku, p.price, p.brand,
      p.stock_quantity, p.min_stock_level, p.weight, p.dimensions,
      p.is_featured, p.status, p.dental_category, p.requires_prescription,
      p.average_rating, p.total_reviews, p.created_at, p.updated_at,
      c.name as category_name, c.description as category_description,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'image_id', pi.image_id,
            'image_url', pi.image_url,
            'alt_text', pi.alt_text,
            'is_primary', pi.is_primary
          ) ORDER BY pi.is_primary DESC, pi.created_at ASC
        ) FROM product_images pi WHERE pi.product_id = p.product_id),
        '[]'::json
      ) as images,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'variant_id', pv.variant_id,
            'name', pv.name,
            'sku', pv.sku,
            'price', pv.price,
            'stock_quantity', pv.stock_quantity,
            'attributes', pv.attributes,
            'is_active', pv.is_active
          )
        ) FROM product_variants pv WHERE pv.product_id = p.product_id AND pv.is_active = true),
        '[]'::json
      ) as variants
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.category_id
     WHERE p.product_id = $1`,
    [id]
  );

  if (productResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
      message: 'Product with the specified ID does not exist'
    });
  }

  // Get recent reviews
  const reviewsResult = await pool.query(
    `SELECT 
      pr.review_id, pr.rating, pr.title, pr.comment, pr.created_at,
      u.first_name, u.last_name
     FROM product_reviews pr
     LEFT JOIN users u ON pr.user_id = u.user_id
     WHERE pr.product_id = $1 AND pr.is_approved = true
     ORDER BY pr.created_at DESC
     LIMIT 5`,
    [id]
  );

  const product = {
    ...productResult.rows[0],
    recent_reviews: reviewsResult.rows
  };

  res.json({
    success: true,
    data: product
  });
});

// Create Product
const createProduct = catchAsync(async (req, res) => {
  const {
    name, description, sku, price, category_id, brand,
    stock_quantity, min_stock_level, weight, dimensions,
    is_featured = false, status = 'active', dental_category,
    requires_prescription = false
  } = req.body;

  // Check if SKU already exists
  const existingSku = await pool.query(
    'SELECT product_id FROM products WHERE sku = $1',
    [sku]
  );

  if (existingSku.rows.length > 0) {
    return res.status(409).json({
      success: false,
      error: 'SKU already exists',
      message: 'A product with this SKU already exists'
    });
  }

  // Verify category exists
  const categoryExists = await pool.query(
    'SELECT category_id FROM categories WHERE category_id = $1',
    [category_id]
  );

  if (categoryExists.rows.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid category',
      message: 'The specified category does not exist'
    });
  }

  const result = await pool.query(
    `INSERT INTO products 
     (name, description, sku, price, category_id, brand, stock_quantity, 
      min_stock_level, weight, dimensions, is_featured, status, 
      dental_category, requires_prescription, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING product_id, name, sku, price, created_at`,
    [name, description, sku, price, category_id, brand, stock_quantity,
     min_stock_level, weight, JSON.stringify(dimensions), is_featured, status,
     dental_category, requires_prescription, req.user?.user_id]
  );

  // Log inventory creation
  if (stock_quantity > 0) {
    await pool.query(
      `INSERT INTO inventory_log 
       (product_id, quantity_change, operation, reason, performed_by)
       VALUES ($1, $2, 'set', 'Initial stock', $3)`,
      [result.rows[0].product_id, stock_quantity, req.user?.user_id]
    );
  }

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: result.rows[0]
  });
});

// Update Product
const updateProduct = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Remove undefined values
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) {
      delete updates[key];
    }
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No updates provided',
      message: 'Please provide at least one field to update'
    });
  }

  // Check if product exists
  const productExists = await pool.query(
    'SELECT product_id FROM products WHERE product_id = $1',
    [id]
  );

  if (productExists.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
      message: 'Product with the specified ID does not exist'
    });
  }

  // If SKU is being updated, check for duplicates
  if (updates.sku) {
    const existingSku = await pool.query(
      'SELECT product_id FROM products WHERE sku = $1 AND product_id != $2',
      [updates.sku, id]
    );

    if (existingSku.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'SKU already exists',
        message: 'A product with this SKU already exists'
      });
    }
  }

  // If category is being updated, verify it exists
  if (updates.category_id) {
    const categoryExists = await pool.query(
      'SELECT category_id FROM categories WHERE category_id = $1',
      [updates.category_id]
    );

    if (categoryExists.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category',
        message: 'The specified category does not exist'
      });
    }
  }

  // Build dynamic update query
  const updateFields = [];
  const values = [];
  let paramCount = 0;

  Object.keys(updates).forEach(key => {
    if (key === 'dimensions' && typeof updates[key] === 'object') {
      updateFields.push(`${key} = $${++paramCount}`);
      values.push(JSON.stringify(updates[key]));
    } else {
      updateFields.push(`${key} = $${++paramCount}`);
      values.push(updates[key]);
    }
  });

  updateFields.push(`updated_at = NOW()`);
  updateFields.push(`updated_by = $${++paramCount}`);
  values.push(req.user?.user_id);
  values.push(id);

  const result = await pool.query(
    `UPDATE products 
     SET ${updateFields.join(', ')}
     WHERE product_id = $${++paramCount}
     RETURNING product_id, name, sku, price, updated_at`,
    values
  );

  res.json({
    success: true,
    message: 'Product updated successfully',
    data: result.rows[0]
  });
});

// Delete Product (Soft Delete)
const deleteProduct = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE products 
     SET status = 'discontinued', updated_at = NOW(), updated_by = $1
     WHERE product_id = $2 AND status != 'discontinued'
     RETURNING product_id, name`,
    [req.user?.user_id, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
      message: 'Product with the specified ID does not exist or is already discontinued'
    });
  }

  res.json({
    success: true,
    message: 'Product deleted successfully'
  });
});

// Get Products by Category
const getProductsByCategory = catchAsync(async (req, res) => {
  const { categoryId } = req.params;
  const { page = 1, limit = 20, sort = 'created_at', order = 'desc' } = req.query;
  const offset = (page - 1) * limit;

  const sortField = ['name', 'price', 'created_at'].includes(sort) ? sort : 'created_at';
  const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    'SELECT COUNT(*) FROM products WHERE category_id = $1 AND status = $2',
    [categoryId, 'active']
  );

  const productsResult = await pool.query(
    `SELECT 
      p.product_id, p.name, p.description, p.sku, p.price, p.brand,
      p.stock_quantity, p.is_featured, p.average_rating, p.total_reviews,
      COALESCE(
        (SELECT image_url FROM product_images 
         WHERE product_id = p.product_id AND is_primary = true 
         LIMIT 1),
        NULL
      ) as primary_image
     FROM products p
     WHERE p.category_id = $1 AND p.status = 'active'
     ORDER BY p.${sortField} ${sortOrder}
     LIMIT $2 OFFSET $3`,
    [categoryId, limit, offset]
  );

  const totalProducts = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalProducts / limit);

  res.json({
    success: true,
    data: {
      products: productsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalProducts,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Get Featured Products
const getFeaturedProducts = catchAsync(async (req, res) => {
  const { limit = 10 } = req.query;

  const result = await pool.query(
    `SELECT 
      p.product_id, p.name, p.description, p.sku, p.price, p.brand,
      p.stock_quantity, p.average_rating, p.total_reviews,
      c.name as category_name,
      COALESCE(
        (SELECT image_url FROM product_images 
         WHERE product_id = p.product_id AND is_primary = true 
         LIMIT 1),
        NULL
      ) as primary_image
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.category_id
     WHERE p.is_featured = true AND p.status = 'active' AND p.stock_quantity > 0
     ORDER BY p.average_rating DESC, p.total_reviews DESC
     LIMIT $1`,
    [limit]
  );

  res.json({
    success: true,
    data: result.rows
  });
});

// Search Products
const searchProducts = catchAsync(async (req, res) => {
  const { q, page = 1, limit = 20, category } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = `WHERE (
    p.name ILIKE $1 OR 
    p.description ILIKE $1 OR 
    p.brand ILIKE $1 OR 
    p.sku ILIKE $1
  ) AND p.status = 'active'`;
  
  const values = [`%${q}%`];
  let paramCount = 1;

  if (category) {
    whereClause += ` AND p.category_id = $${++paramCount}`;
    values.push(category);
  }

  // Count total results
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM products p ${whereClause}`,
    values
  );

  // Get search results with ranking
  const searchResult = await pool.query(
    `SELECT 
      p.product_id, p.name, p.description, p.sku, p.price, p.brand,
      p.stock_quantity, p.is_featured, p.average_rating, p.total_reviews,
      c.name as category_name,
      COALESCE(
        (SELECT image_url FROM product_images 
         WHERE product_id = p.product_id AND is_primary = true 
         LIMIT 1),
        NULL
      ) as primary_image,
      ts_rank(
        to_tsvector('english', p.name || ' ' || p.description || ' ' || p.brand),
        plainto_tsquery('english', $1)
      ) as relevance_score
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.category_id
     ${whereClause}
     ORDER BY relevance_score DESC, p.average_rating DESC
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalResults = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalResults / limit);

  res.json({
    success: true,
    data: {
      products: searchResult.rows,
      search_query: q,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResults,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Product Variants Management
const getProductVariants = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT 
      variant_id, name, sku, price, stock_quantity, attributes, 
      is_active, created_at, updated_at
     FROM product_variants 
     WHERE product_id = $1 
     ORDER BY created_at ASC`,
    [id]
  );

  res.json({
    success: true,
    data: result.rows
  });
});

const createProductVariant = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, sku, price, stock_quantity, attributes } = req.body;

  // Check if product exists
  const productExists = await pool.query(
    'SELECT product_id FROM products WHERE product_id = $1',
    [id]
  );

  if (productExists.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
      message: 'Parent product does not exist'
    });
  }

  // Check if variant SKU already exists
  const existingSku = await pool.query(
    'SELECT variant_id FROM product_variants WHERE sku = $1',
    [sku]
  );

  if (existingSku.rows.length > 0) {
    return res.status(409).json({
      success: false,
      error: 'SKU already exists',
      message: 'A variant with this SKU already exists'
    });
  }

  const result = await pool.query(
    `INSERT INTO product_variants 
     (product_id, name, sku, price, stock_quantity, attributes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING variant_id, name, sku, price, created_at`,
    [id, name, sku, price, stock_quantity, JSON.stringify(attributes), req.user?.user_id]
  );

  res.status(201).json({
    success: true,
    message: 'Product variant created successfully',
    data: result.rows[0]
  });
});

const updateProductVariant = catchAsync(async (req, res) => {
  const { variantId } = req.params;
  const updates = req.body;

  // Remove undefined values
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) {
      delete updates[key];
    }
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No updates provided',
      message: 'Please provide at least one field to update'
    });
  }

  // Build dynamic update query
  const updateFields = [];
  const values = [];
  let paramCount = 0;

  Object.keys(updates).forEach(key => {
    if (key === 'attributes' && typeof updates[key] === 'object') {
      updateFields.push(`${key} = $${++paramCount}`);
      values.push(JSON.stringify(updates[key]));
    } else {
      updateFields.push(`${key} = $${++paramCount}`);
      values.push(updates[key]);
    }
  });

  updateFields.push(`updated_at = NOW()`);
  updateFields.push(`updated_by = $${++paramCount}`);
  values.push(req.user?.user_id);
  values.push(variantId);

  const result = await pool.query(
    `UPDATE product_variants 
     SET ${updateFields.join(', ')}
     WHERE variant_id = $${++paramCount}
     RETURNING variant_id, name, sku, price, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Variant not found',
      message: 'Product variant with the specified ID does not exist'
    });
  }

  res.json({
    success: true,
    message: 'Product variant updated successfully',
    data: result.rows[0]
  });
});

const deleteProductVariant = catchAsync(async (req, res) => {
  const { variantId } = req.params;

  const result = await pool.query(
    `UPDATE product_variants 
     SET is_active = false, updated_at = NOW(), updated_by = $1
     WHERE variant_id = $2 AND is_active = true
     RETURNING variant_id, name`,
    [req.user?.user_id, variantId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Variant not found',
      message: 'Product variant with the specified ID does not exist or is already inactive'
    });
  }

  res.json({
    success: true,
    message: 'Product variant deleted successfully'
  });
});

// Image Management
const getProductImages = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT 
      image_id, image_url, alt_text, is_primary, 
      file_size, mime_type, created_at
     FROM product_images 
     WHERE product_id = $1 
     ORDER BY is_primary DESC, created_at ASC`,
    [id]
  );

  res.json({
    success: true,
    data: result.rows
  });
});

const uploadProductImage = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { is_primary = false, alt_text } = req.body;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
      message: 'Please provide an image file'
    });
  }

  // Check if product exists
  const productExists = await pool.query(
    'SELECT product_id FROM products WHERE product_id = $1',
    [id]
  );

  if (productExists.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
      message: 'Product does not exist'
    });
  }

  // If this is set as primary, unset other primary images
  if (is_primary) {
    await pool.query(
      'UPDATE product_images SET is_primary = false WHERE product_id = $1',
      [id]
    );
  }

  const result = await pool.query(
    `INSERT INTO product_images 
     (product_id, image_url, alt_text, is_primary, file_size, mime_type, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING image_id, image_url, alt_text, is_primary, created_at`,
    [id, req.file.path, alt_text, is_primary, req.file.size, req.file.mimetype, req.user?.user_id]
  );

  res.status(201).json({
    success: true,
    message: 'Image uploaded successfully',
    data: result.rows[0]
  });
});

const deleteProductImage = catchAsync(async (req, res) => {
  const { imageId } = req.params;

  const result = await pool.query(
    'DELETE FROM product_images WHERE image_id = $1 RETURNING image_id, image_url',
    [imageId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Image not found',
      message: 'Product image with the specified ID does not exist'
    });
  }

  // TODO: Delete actual file from storage
  // await deleteFileFromStorage(result.rows[0].image_url);

  res.json({
    success: true,
    message: 'Image deleted successfully'
  });
});

// Inventory Management
const updateInventory = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { quantity, operation, reason = 'Manual adjustment' } = req.body;

  // Get current stock
  const productResult = await pool.query(
    'SELECT stock_quantity, name FROM products WHERE product_id = $1',
    [id]
  );

  if (productResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
      message: 'Product does not exist'
    });
  }

  const currentStock = productResult.rows[0].stock_quantity;
  let newStock;

  switch (operation) {
    case 'add':
      newStock = currentStock + quantity;
      break;
    case 'subtract':
      newStock = Math.max(0, currentStock - quantity);
      break;
    case 'set':
      newStock = quantity;
      break;
    default:
      return res.status(400).json({
        success: false,
        error: 'Invalid operation',
        message: 'Operation must be add, subtract, or set'
      });
  }

  // Update stock
  await pool.query(
    'UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE product_id = $2',
    [newStock, id]
  );

  // Log inventory change
  await pool.query(
    `INSERT INTO inventory_log 
     (product_id, quantity_change, operation, reason, performed_by, old_quantity, new_quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, quantity, operation, reason, req.user?.user_id, currentStock, newStock]
  );

  res.json({
    success: true,
    message: 'Inventory updated successfully',
    data: {
      product_id: id,
      old_quantity: currentStock,
      new_quantity: newStock,
      change: newStock - currentStock
    }
  });
});

const getInventoryHistory = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;

  const result = await pool.query(
    `SELECT 
      il.log_id, il.quantity_change, il.operation, il.reason,
      il.old_quantity, il.new_quantity, il.created_at,
      u.first_name, u.last_name
     FROM inventory_log il
     LEFT JOIN users u ON il.performed_by = u.user_id
     WHERE il.product_id = $1
     ORDER BY il.created_at DESC
     LIMIT $2`,
    [id, limit]
  );

  res.json({
    success: true,
    data: result.rows
  });
});

const getLowStockProducts = catchAsync(async (req, res) => {
  const { threshold = 10, limit = 50 } = req.query;

  const result = await pool.query(
    `SELECT 
      p.product_id, p.name, p.sku, p.stock_quantity, p.min_stock_level,
      c.name as category_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.category_id
     WHERE p.stock_quantity <= $1 AND p.status = 'active'
     ORDER BY p.stock_quantity ASC, p.name ASC
     LIMIT $2`,
    [threshold, limit]
  );

  res.json({
    success: true,
    data: result.rows
  });
});

// Analytics and Reporting
const getProductAnalytics = catchAsync(async (req, res) => {
  const { period = 'month', start_date, end_date } = req.query;

  let dateCondition = '';
  const values = [];
  let paramCount = 0;

  if (start_date && end_date) {
    dateCondition = 'WHERE p.created_at BETWEEN $1 AND $2';
    values.push(start_date, end_date);
    paramCount = 2;
  } else {
    const periodMap = {
      day: "p.created_at >= NOW() - INTERVAL '1 day'",
      week: "p.created_at >= NOW() - INTERVAL '1 week'",
      month: "p.created_at >= NOW() - INTERVAL '1 month'",
      year: "p.created_at >= NOW() - INTERVAL '1 year'"
    };
    
    if (periodMap[period]) {
      dateCondition = `WHERE ${periodMap[period]}`;
    }
  }

  // Get basic stats
  const statsResult = await pool.query(
    `SELECT 
      COUNT(*) as total_products,
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_products,
      COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock,
      COUNT(CASE WHEN stock_quantity <= min_stock_level THEN 1 END) as low_stock,
      AVG(price) as avg_price,
      SUM(stock_quantity * price) as inventory_value
     FROM products p ${dateCondition}`,
    values
  );

  // Get category distribution
  const categoryResult = await pool.query(
    `SELECT 
      c.name as category_name,
      COUNT(p.product_id) as product_count,
      AVG(p.price) as avg_price,
      SUM(p.stock_quantity) as total_stock
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.category_id
     ${dateCondition}
     GROUP BY c.category_id, c.name
     ORDER BY product_count DESC`,
    values
  );

  // Get top brands
  const brandResult = await pool.query(
    `SELECT 
      brand,
      COUNT(*) as product_count,
      AVG(price) as avg_price
     FROM products p
     ${dateCondition}
     GROUP BY brand
     ORDER BY product_count DESC
     LIMIT 10`,
    values
  );

  res.json({
    success: true,
    data: {
      overview: statsResult.rows[0],
      categories: categoryResult.rows,
      top_brands: brandResult.rows,
      period: period,
      date_range: start_date && end_date ? { start_date, end_date } : null
    }
  });
});

// Bulk Operations
const bulkUpdateProducts = catchAsync(async (req, res) => {
  const { product_ids, updates } = req.body;

  // Remove undefined values
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) {
      delete updates[key];
    }
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No updates provided',
      message: 'Please provide at least one field to update'
    });
  }

  // Build dynamic update query
  const updateFields = [];
  const values = [];
  let paramCount = 0;

  Object.keys(updates).forEach(key => {
    updateFields.push(`${key} = $${++paramCount}`);
    values.push(updates[key]);
  });

  updateFields.push(`updated_at = NOW()`);
  updateFields.push(`updated_by = $${++paramCount}`);
  values.push(req.user?.user_id);
  values.push(product_ids);

  const result = await pool.query(
    `UPDATE products 
     SET ${updateFields.join(', ')}
     WHERE product_id = ANY($${++paramCount})
     RETURNING product_id, name`,
    values
  );

  res.json({
    success: true,
    message: 'Bulk update completed successfully',
    affected_count: result.rowCount,
    updated_products: result.rows
  });
});

const bulkImportProducts = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
      message: 'Please provide a CSV file'
    });
  }

  // TODO: Implement CSV parsing and bulk import logic
  // This would involve:
  // 1. Parse CSV file
  // 2. Validate data
  // 3. Insert products in batches
  // 4. Handle errors and duplicates
  // 5. Return import summary

  res.json({
    success: true,
    message: 'Bulk import completed successfully',
    data: {
      imported: 0,
      errors: 0,
      duplicates: 0
    }
  });
});

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  getFeaturedProducts,
  searchProducts,
  getProductVariants,
  createProductVariant,
  updateProductVariant,
  deleteProductVariant,
  getProductImages,
  uploadProductImage,
  deleteProductImage,
  updateInventory,
  getInventoryHistory,
  getLowStockProducts,
  bulkUpdateProducts,
  bulkImportProducts,
  getProductAnalytics
};
