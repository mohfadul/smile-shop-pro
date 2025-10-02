const {
  getAllCategories,
  getCategoryById,
  createCategory,
} = require('../models/productModel');
const { AppError, catchAsync } = require('../middlewares/errorHandler');

// Get all categories
const getCategories = catchAsync(async (req, res) => {
  const categories = await getAllCategories();

  // Organize categories into hierarchical structure if they have parent relationships
  const categoryMap = {};
  const rootCategories = [];

  categories.forEach(category => {
    categoryMap[category.category_id] = {
      ...category,
      subcategories: [],
    };
  });

  categories.forEach(category => {
    if (category.parent_category_id) {
      if (categoryMap[category.parent_category_id]) {
        categoryMap[category.parent_category_id].subcategories.push(
          categoryMap[category.category_id]
        );
      }
    } else {
      rootCategories.push(categoryMap[category.category_id]);
    }
  });

  res.status(200).json({
    categories: rootCategories,
    total: categories.length,
  });
});

// Get single category by ID
const getCategory = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError('Category ID is required', 400);
  }

  const category = await getCategoryById(id);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  res.status(200).json({ category });
});

// Create new category
const createNewCategory = catchAsync(async (req, res) => {
  const { name, description, parent_category_id, sort_order = 0 } = req.body;

  // Validate required fields
  if (!name || !name.trim()) {
    throw new AppError('Category name is required', 400);
  }

  // Validate name length
  if (name.length > 100) {
    throw new AppError('Category name must be less than 100 characters', 400);
  }

  // Check if category name already exists
  const existingCategory = await require('../models/productModel').pool.query(
    'SELECT category_id FROM categories WHERE name = $1 AND is_active = true',
    [name.trim()]
  );

  if (existingCategory.rows.length > 0) {
    throw new AppError('Category name already exists', 409);
  }

  // If parent_category_id is provided, validate it exists
  if (parent_category_id) {
    const parentCategory = await getCategoryById(parent_category_id);
    if (!parentCategory) {
      throw new AppError('Parent category not found', 404);
    }
  }

  const newCategory = await createCategory({
    name: name.trim(),
    description: description?.trim(),
    parent_category_id,
    sort_order: parseInt(sort_order) || 0,
  });

  res.status(201).json({
    category: newCategory,
    message: 'Category created successfully',
  });
});

// Update category
const updateCategory = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!id) {
    throw new AppError('Category ID is required', 400);
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No fields to update', 400);
  }

  // Validate category name if being updated
  if (updates.name) {
    if (!updates.name.trim()) {
      throw new AppError('Category name cannot be empty', 400);
    }

    if (updates.name.length > 100) {
      throw new AppError('Category name must be less than 100 characters', 400);
    }

    // Check if new name already exists (excluding current category)
    const existingCategory = await require('../models/productModel').pool.query(
      'SELECT category_id FROM categories WHERE name = $1 AND category_id != $2 AND is_active = true',
      [updates.name.trim(), id]
    );

    if (existingCategory.rows.length > 0) {
      throw new AppError('Category name already exists', 409);
    }
  }

  // If parent_category_id is being updated, validate it exists and isn't the same as current category
  if (updates.parent_category_id) {
    if (updates.parent_category_id === id) {
      throw new AppError('Category cannot be its own parent', 400);
    }

    if (updates.parent_category_id) {
      const parentCategory = await getCategoryById(updates.parent_category_id);
      if (!parentCategory) {
        throw new AppError('Parent category not found', 404);
      }
    }
  }

  // Build update query dynamically
  const allowedFields = ['name', 'description', 'parent_category_id', 'is_active', 'sort_order'];
  const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

  if (fields.length === 0) {
    throw new AppError('No valid fields to update', 400);
  }

  const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
  const values = fields.map(field => {
    if (field === 'name' && updates[field]) {
      return updates[field].trim();
    }
    if (field === 'description' && updates[field]) {
      return updates[field].trim();
    }
    return updates[field];
  });
  values.unshift(id);

  const query = `
    UPDATE categories
    SET ${setClause}, updated_at = NOW()
    WHERE category_id = $1
    RETURNING *
  `;

  const result = await require('../models/productModel').pool.query(query, values);

  if (result.rows.length === 0) {
    throw new AppError('Category not found', 404);
  }

  res.status(200).json({
    category: result.rows[0],
    message: 'Category updated successfully',
  });
});

// Delete category
const deleteCategory = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError('Category ID is required', 400);
  }

  // Check if category has products
  const productCount = await require('../models/productModel').pool.query(
    'SELECT COUNT(*) as count FROM products WHERE category_id = $1',
    [id]
  );

  if (parseInt(productCount.rows[0].count) > 0) {
    throw new AppError('Cannot delete category with existing products', 409);
  }

  // Check if category has subcategories
  const subcategoryCount = await require('../models/productModel').pool.query(
    'SELECT COUNT(*) as count FROM categories WHERE parent_category_id = $1',
    [id]
  );

  if (parseInt(subcategoryCount.rows[0].count) > 0) {
    throw new AppError('Cannot delete category with subcategories', 409);
  }

  // Soft delete by setting is_active to false
  const result = await require('../models/productModel').pool.query(
    'UPDATE categories SET is_active = false, updated_at = NOW() WHERE category_id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Category not found', 404);
  }

  res.status(200).json({
    message: 'Category deleted successfully',
    category: result.rows[0],
  });
});

// Get category tree (hierarchical structure)
const getCategoryTree = catchAsync(async (req, res) => {
  const categories = await getAllCategories();

  // Build hierarchical tree structure
  const buildTree = (items, parentId = null) => {
    return items
      .filter(item => item.parent_category_id === parentId)
      .map(item => ({
        ...item,
        subcategories: buildTree(items, item.category_id),
      }));
  };

  const categoryTree = buildTree(categories);

  res.status(200).json({
    categories: categoryTree,
    total: categories.length,
  });
});

module.exports = {
  getCategories,
  getCategory,
  createNewCategory,
  updateCategory,
  deleteCategory,
  getCategoryTree,
};
