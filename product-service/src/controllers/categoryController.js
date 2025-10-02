const { pool } = require('../models/productModel');
const catchAsync = require('../utils/catchAsync');

// Get All Categories
const getAllCategories = catchAsync(async (req, res) => {
  const { include_inactive = false, parent_only = false } = req.query;

  let whereClause = '';
  const values = [];

  if (!include_inactive) {
    whereClause = 'WHERE is_active = true';
  }

  if (parent_only) {
    whereClause += whereClause ? ' AND parent_id IS NULL' : 'WHERE parent_id IS NULL';
  }

  const result = await pool.query(
    `SELECT 
      c.category_id, c.name, c.description, c.parent_id, c.is_active,
      c.sort_order, c.created_at, c.updated_at,
      pc.name as parent_name,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.category_id AND p.status = 'active') as product_count,
      (SELECT COUNT(*) FROM categories sc WHERE sc.parent_id = c.category_id AND sc.is_active = true) as subcategory_count
     FROM categories c
     LEFT JOIN categories pc ON c.parent_id = pc.category_id
     ${whereClause}
     ORDER BY c.sort_order ASC, c.name ASC`,
    values
  );

  res.json({
    success: true,
    data: result.rows
  });
});

// Get Category Tree (Hierarchical)
const getCategoryTree = catchAsync(async (req, res) => {
  const result = await pool.query(`
    WITH RECURSIVE category_tree AS (
      -- Base case: root categories
      SELECT 
        category_id, name, description, parent_id, is_active, sort_order,
        0 as level, 
        ARRAY[sort_order, category_id::text] as path,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = categories.category_id AND p.status = 'active') as product_count
      FROM categories 
      WHERE parent_id IS NULL AND is_active = true
      
      UNION ALL
      
      -- Recursive case: child categories
      SELECT 
        c.category_id, c.name, c.description, c.parent_id, c.is_active, c.sort_order,
        ct.level + 1,
        ct.path || ARRAY[c.sort_order, c.category_id::text],
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.category_id AND p.status = 'active') as product_count
      FROM categories c
      INNER JOIN category_tree ct ON c.parent_id = ct.category_id
      WHERE c.is_active = true
    )
    SELECT 
      category_id, name, description, parent_id, level, product_count
    FROM category_tree
    ORDER BY path
  `);

  res.json({
    success: true,
    data: result.rows
  });
});

// Get Category by ID
const getCategoryById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT 
      c.category_id, c.name, c.description, c.parent_id, c.is_active,
      c.sort_order, c.created_at, c.updated_at,
      pc.name as parent_name,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.category_id AND p.status = 'active') as product_count,
      (SELECT json_agg(
        json_build_object(
          'category_id', sc.category_id,
          'name', sc.name,
          'description', sc.description,
          'product_count', (SELECT COUNT(*) FROM products p WHERE p.category_id = sc.category_id AND p.status = 'active')
        )
      ) FROM categories sc WHERE sc.parent_id = c.category_id AND sc.is_active = true) as subcategories
     FROM categories c
     LEFT JOIN categories pc ON c.parent_id = pc.category_id
     WHERE c.category_id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Category not found',
      message: 'Category with the specified ID does not exist'
    });
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
});

// Create Category
const createCategory = catchAsync(async (req, res) => {
  const { name, description, parent_id, sort_order = 0, is_active = true } = req.body;

  // Check if parent category exists (if provided)
  if (parent_id) {
    const parentExists = await pool.query(
      'SELECT category_id FROM categories WHERE category_id = $1 AND is_active = true',
      [parent_id]
    );

    if (parentExists.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parent category',
        message: 'The specified parent category does not exist or is inactive'
      });
    }
  }

  // Check if category name already exists at the same level
  const existingCategory = await pool.query(
    `SELECT category_id FROM categories 
     WHERE name = $1 AND 
     (parent_id = $2 OR (parent_id IS NULL AND $2 IS NULL))`,
    [name, parent_id]
  );

  if (existingCategory.rows.length > 0) {
    return res.status(409).json({
      success: false,
      error: 'Category already exists',
      message: 'A category with this name already exists at this level'
    });
  }

  const result = await pool.query(
    `INSERT INTO categories (name, description, parent_id, sort_order, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING category_id, name, description, parent_id, sort_order, is_active, created_at`,
    [name, description, parent_id, sort_order, is_active, req.user?.user_id]
  );

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    data: result.rows[0]
  });
});

// Update Category
const updateCategory = catchAsync(async (req, res) => {
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

  // Check if category exists
  const categoryExists = await pool.query(
    'SELECT category_id, parent_id FROM categories WHERE category_id = $1',
    [id]
  );

  if (categoryExists.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Category not found',
      message: 'Category with the specified ID does not exist'
    });
  }

  // Prevent setting category as its own parent
  if (updates.parent_id === id) {
    return res.status(400).json({
      success: false,
      error: 'Invalid parent',
      message: 'A category cannot be its own parent'
    });
  }

  // Check if new parent category exists (if provided)
  if (updates.parent_id) {
    const parentExists = await pool.query(
      'SELECT category_id FROM categories WHERE category_id = $1 AND is_active = true',
      [updates.parent_id]
    );

    if (parentExists.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parent category',
        message: 'The specified parent category does not exist or is inactive'
      });
    }

    // Prevent circular references (check if new parent is a descendant)
    const isDescendant = await pool.query(`
      WITH RECURSIVE descendant_check AS (
        SELECT category_id, parent_id FROM categories WHERE category_id = $1
        UNION ALL
        SELECT c.category_id, c.parent_id 
        FROM categories c
        INNER JOIN descendant_check dc ON c.parent_id = dc.category_id
      )
      SELECT 1 FROM descendant_check WHERE category_id = $2
    `, [id, updates.parent_id]);

    if (isDescendant.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Circular reference',
        message: 'Cannot set a descendant category as parent'
      });
    }
  }

  // Check for name conflicts (if name is being updated)
  if (updates.name) {
    const conflictCheck = await pool.query(
      `SELECT category_id FROM categories 
       WHERE name = $1 AND category_id != $2 AND 
       (parent_id = $3 OR (parent_id IS NULL AND $3 IS NULL))`,
      [updates.name, id, updates.parent_id || categoryExists.rows[0].parent_id]
    );

    if (conflictCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Category name conflict',
        message: 'A category with this name already exists at this level'
      });
    }
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
  values.push(id);

  const result = await pool.query(
    `UPDATE categories 
     SET ${updateFields.join(', ')}
     WHERE category_id = $${++paramCount}
     RETURNING category_id, name, description, parent_id, sort_order, is_active, updated_at`,
    values
  );

  res.json({
    success: true,
    message: 'Category updated successfully',
    data: result.rows[0]
  });
});

// Delete Category (Soft Delete)
const deleteCategory = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { force = false } = req.query;

  // Check if category exists
  const categoryExists = await pool.query(
    'SELECT category_id, name FROM categories WHERE category_id = $1',
    [id]
  );

  if (categoryExists.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Category not found',
      message: 'Category with the specified ID does not exist'
    });
  }

  // Check for products in this category
  const productsInCategory = await pool.query(
    'SELECT COUNT(*) FROM products WHERE category_id = $1 AND status != $2',
    [id, 'discontinued']
  );

  if (parseInt(productsInCategory.rows[0].count) > 0 && !force) {
    return res.status(400).json({
      success: false,
      error: 'Category has products',
      message: 'Cannot delete category with active products. Use force=true to override.',
      product_count: parseInt(productsInCategory.rows[0].count)
    });
  }

  // Check for subcategories
  const subcategoriesCount = await pool.query(
    'SELECT COUNT(*) FROM categories WHERE parent_id = $1 AND is_active = true',
    [id]
  );

  if (parseInt(subcategoriesCount.rows[0].count) > 0 && !force) {
    return res.status(400).json({
      success: false,
      error: 'Category has subcategories',
      message: 'Cannot delete category with active subcategories. Use force=true to override.',
      subcategory_count: parseInt(subcategoriesCount.rows[0].count)
    });
  }

  // Soft delete category
  const result = await pool.query(
    `UPDATE categories 
     SET is_active = false, updated_at = NOW(), updated_by = $1
     WHERE category_id = $2
     RETURNING category_id, name`,
    [req.user?.user_id, id]
  );

  // If force delete, also deactivate subcategories and discontinue products
  if (force) {
    // Deactivate all subcategories recursively
    await pool.query(`
      WITH RECURSIVE subcategory_tree AS (
        SELECT category_id FROM categories WHERE parent_id = $1
        UNION ALL
        SELECT c.category_id 
        FROM categories c
        INNER JOIN subcategory_tree st ON c.parent_id = st.category_id
      )
      UPDATE categories 
      SET is_active = false, updated_at = NOW(), updated_by = $2
      WHERE category_id IN (SELECT category_id FROM subcategory_tree)
    `, [id, req.user?.user_id]);

    // Discontinue all products in this category and subcategories
    await pool.query(`
      WITH RECURSIVE category_tree AS (
        SELECT category_id FROM categories WHERE category_id = $1
        UNION ALL
        SELECT c.category_id 
        FROM categories c
        INNER JOIN category_tree ct ON c.parent_id = ct.category_id
      )
      UPDATE products 
      SET status = 'discontinued', updated_at = NOW(), updated_by = $2
      WHERE category_id IN (SELECT category_id FROM category_tree)
    `, [id, req.user?.user_id]);
  }

  res.json({
    success: true,
    message: 'Category deleted successfully',
    force_applied: force
  });
});

// Get Category Statistics
const getCategoryStats = catchAsync(async (req, res) => {
  const { id } = req.params;

  const stats = await pool.query(`
    WITH RECURSIVE category_tree AS (
      SELECT category_id FROM categories WHERE category_id = $1
      UNION ALL
      SELECT c.category_id 
      FROM categories c
      INNER JOIN category_tree ct ON c.parent_id = ct.category_id
      WHERE c.is_active = true
    )
    SELECT 
      COUNT(DISTINCT p.product_id) as total_products,
      COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.product_id END) as active_products,
      COUNT(DISTINCT CASE WHEN p.stock_quantity = 0 THEN p.product_id END) as out_of_stock_products,
      COUNT(DISTINCT CASE WHEN p.stock_quantity <= p.min_stock_level THEN p.product_id END) as low_stock_products,
      COALESCE(AVG(p.price), 0) as avg_price,
      COALESCE(MIN(p.price), 0) as min_price,
      COALESCE(MAX(p.price), 0) as max_price,
      COALESCE(SUM(p.stock_quantity * p.price), 0) as inventory_value,
      COUNT(DISTINCT p.brand) as unique_brands
    FROM category_tree ct
    LEFT JOIN products p ON ct.category_id = p.category_id
  `, [id]);

  const recentProducts = await pool.query(`
    SELECT 
      p.product_id, p.name, p.sku, p.price, p.stock_quantity, p.created_at
    FROM products p
    WHERE p.category_id = $1 AND p.status = 'active'
    ORDER BY p.created_at DESC
    LIMIT 5
  `, [id]);

  res.json({
    success: true,
    data: {
      statistics: stats.rows[0],
      recent_products: recentProducts.rows
    }
  });
});

// Reorder Categories
const reorderCategories = catchAsync(async (req, res) => {
  const { category_orders } = req.body; // Array of {category_id, sort_order}

  if (!Array.isArray(category_orders) || category_orders.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid data',
      message: 'category_orders must be a non-empty array'
    });
  }

  // Validate all category IDs exist
  const categoryIds = category_orders.map(item => item.category_id);
  const existingCategories = await pool.query(
    'SELECT category_id FROM categories WHERE category_id = ANY($1)',
    [categoryIds]
  );

  if (existingCategories.rows.length !== categoryIds.length) {
    return res.status(400).json({
      success: false,
      error: 'Invalid categories',
      message: 'One or more category IDs do not exist'
    });
  }

  // Update sort orders in a transaction
  await pool.query('BEGIN');

  try {
    for (const item of category_orders) {
      await pool.query(
        'UPDATE categories SET sort_order = $1, updated_at = NOW(), updated_by = $2 WHERE category_id = $3',
        [item.sort_order, req.user?.user_id, item.category_id]
      );
    }

    await pool.query('COMMIT');

    res.json({
      success: true,
      message: 'Categories reordered successfully',
      updated_count: category_orders.length
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
});

module.exports = {
  getAllCategories,
  getCategoryTree,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryStats,
  reorderCategories
};
