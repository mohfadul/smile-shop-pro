const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../models/productModel');
const { AppError, catchAsync } = require('../middlewares/errorHandler');

// Get all products with filtering and pagination
const getProducts = catchAsync(async (req, res) => {
  const {
    category_id,
    status = 'active',
    featured,
    search,
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
    category_id,
    status,
    featured: featured === 'true' ? true : featured === 'false' ? false : undefined,
    search,
    sort_by,
    sort_order,
    limit: limitNum,
    offset: offsetNum,
  };

  const products = await getAllProducts(options);

  // Get total count for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM products p
    WHERE 1=1
    ${category_id ? 'AND p.category_id = $1' : ''}
    ${status ? `AND p.status = '${status}'` : ''}
    ${featured !== undefined ? `AND p.is_featured = ${featured}` : ''}
    ${search ? 'AND (p.name ILIKE $2 OR p.description ILIKE $2 OR p.sku ILIKE $2)' : ''}
  `;

  const countParams = [];
  if (category_id) countParams.push(category_id);
  if (search) countParams.push(`%${search}%`);

  const countResult = await require('../models/productModel').pool.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0].total);

  res.status(200).json({
    products,
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

// Get single product by ID
const getProduct = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError('Product ID is required', 400);
  }

  const product = await getProductById(id);

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  res.status(200).json({ product });
});

// Create new product
const createNewProduct = catchAsync(async (req, res) => {
  const productData = req.body;

  // Validate required fields
  if (!productData.name || !productData.sku || !productData.price) {
    throw new AppError('Name, SKU, and price are required', 400);
  }

  // Validate price is a positive number
  if (productData.price <= 0) {
    throw new AppError('Price must be greater than 0', 400);
  }

  // Check if SKU already exists
  const existingProduct = await require('../models/productModel').pool.query(
    'SELECT product_id FROM products WHERE sku = $1',
    [productData.sku]
  );

  if (existingProduct.rows.length > 0) {
    throw new AppError('SKU already exists', 409);
  }

  const newProduct = await createProduct(productData);

  res.status(201).json({
    product: newProduct,
    message: 'Product created successfully',
  });
});

// Update product
const updateExistingProduct = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!id) {
    throw new AppError('Product ID is required', 400);
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No fields to update', 400);
  }

  // Validate price if being updated
  if (updates.price !== undefined && updates.price <= 0) {
    throw new AppError('Price must be greater than 0', 400);
  }

  // Check if SKU is being updated and if it already exists
  if (updates.sku) {
    const existingProduct = await require('../models/productModel').pool.query(
      'SELECT product_id FROM products WHERE sku = $1 AND product_id != $2',
      [updates.sku, id]
    );

    if (existingProduct.rows.length > 0) {
      throw new AppError('SKU already exists', 409);
    }
  }

  const updatedProduct = await updateProduct(id, updates);

  if (!updatedProduct) {
    throw new AppError('Product not found', 404);
  }

  res.status(200).json({
    product: updatedProduct,
    message: 'Product updated successfully',
  });
});

// Delete product
const deleteExistingProduct = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError('Product ID is required', 400);
  }

  const deletedProduct = await deleteProduct(id);

  if (!deletedProduct) {
    throw new AppError('Product not found', 404);
  }

  res.status(200).json({
    message: 'Product deleted successfully',
    product: deletedProduct,
  });
});

// Search products
const searchProducts = catchAsync(async (req, res) => {
  const { q, category_id, limit = 20 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(200).json({ products: [], message: 'Search query must be at least 2 characters' });
  }

  const options = {
    search: q.trim(),
    category_id,
    status: 'active',
    limit: Math.min(parseInt(limit), 50),
  };

  const products = await getAllProducts(options);

  res.status(200).json({
    products,
    search: {
      query: q,
      count: products.length,
    },
  });
});

// Get featured products
const getFeaturedProducts = catchAsync(async (req, res) => {
  const options = {
    featured: true,
    status: 'active',
    limit: 12,
    sort_by: 'created_at',
    sort_order: 'desc',
  };

  const products = await getAllProducts(options);

  res.status(200).json({
    products,
    featured: true,
  });
});

// Get products by category
const getProductsByCategory = catchAsync(async (req, res) => {
  const { categoryId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  if (!categoryId) {
    throw new AppError('Category ID is required', 400);
  }

  const options = {
    category_id: categoryId,
    status: 'active',
    limit: parseInt(limit),
    offset: parseInt(offset),
  };

  const products = await getAllProducts(options);

  res.status(200).json({
    products,
    category_id: categoryId,
  });
});

// Update product stock
const updateProductStock = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { stock_quantity, operation = 'set' } = req.body;

  if (!id) {
    throw new AppError('Product ID is required', 400);
  }

  if (stock_quantity === undefined || stock_quantity === null) {
    throw new AppError('Stock quantity is required', 400);
  }

  let newQuantity;
  let operationText;

  switch (operation) {
    case 'set':
      newQuantity = stock_quantity;
      operationText = 'set to';
      break;
    case 'add':
      // Get current stock and add to it
      const currentProduct = await getProductById(id);
      if (!currentProduct) {
        throw new AppError('Product not found', 404);
      }
      newQuantity = currentProduct.stock_quantity + stock_quantity;
      operationText = 'added';
      break;
    case 'subtract':
      // Get current stock and subtract from it
      const currentProduct2 = await getProductById(id);
      if (!currentProduct2) {
        throw new AppError('Product not found', 404);
      }
      newQuantity = Math.max(0, currentProduct2.stock_quantity - stock_quantity);
      operationText = 'subtracted';
      break;
    default:
      throw new AppError('Invalid operation. Use "set", "add", or "subtract"', 400);
  }

  // Validate new quantity
  if (newQuantity < 0) {
    throw new AppError('Stock quantity cannot be negative', 400);
  }

  const updatedProduct = await updateProduct(id, { stock_quantity: newQuantity });

  // Log inventory change
  await require('../models/productModel').pool.query(
    'INSERT INTO inventory_log (product_id, action, quantity_change, previous_quantity, new_quantity, performed_by) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, `stock_${operation}`, stock_quantity, updatedProduct.stock_quantity - stock_quantity, newQuantity, req.user?.user_id || null]
  );

  res.status(200).json({
    product: updatedProduct,
    message: `Stock ${operationText} ${stock_quantity}. New quantity: ${newQuantity}`,
  });
});

module.exports = {
  getProducts,
  getProduct,
  createNewProduct,
  updateExistingProduct,
  deleteExistingProduct,
  searchProducts,
  getFeaturedProducts,
  getProductsByCategory,
  updateProductStock,
};
