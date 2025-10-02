const {
  uploadFile,
  downloadFile,
  deleteFile,
  generateSignedUrl,
  listFiles,
  STORAGE_BUCKETS,
  ALLOWED_FILE_TYPES,
  FILE_SIZE_LIMITS
} = require('../../../shared/supabase-storage');
const { pool } = require('../models/productModel');
const catchAsync = require('../utils/catchAsync');

// Upload Product Image
const uploadProductImage = catchAsync(async (req, res) => {
  const { id: productId } = req.params;
  const { alt_text, is_primary = false } = req.body;

  // Verify product exists
  const productResult = await pool.query(
    'SELECT product_id, name FROM products WHERE product_id = $1',
    [productId]
  );

  if (productResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
      message: 'Product does not exist'
    });
  }

  const product = productResult.rows[0];

  try {
    // Upload image to Supabase
    const uploadResult = await uploadFile(req.file, STORAGE_BUCKETS.PRODUCTS, `products/${productId}`, {
      allowedTypes: ALLOWED_FILE_TYPES.images,
      maxSize: FILE_SIZE_LIMITS.image,
      makePublic: true,
      prefix: 'img'
    });

    // If this is set as primary, unset other primary images
    if (is_primary) {
      await pool.query(
        'UPDATE product_images SET is_primary = false WHERE product_id = $1',
        [productId]
      );
    }

    // Save image info to database
    const imageResult = await pool.query(
      `INSERT INTO product_images 
       (product_id, image_url, storage_path, alt_text, is_primary, file_size, mime_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING image_id, image_url, alt_text, is_primary, created_at`,
      [
        productId,
        uploadResult.data.publicUrl,
        uploadResult.data.path,
        alt_text || `${product.name} image`,
        is_primary,
        uploadResult.data.size,
        uploadResult.data.mimeType,
        req.user?.user_id
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Product image uploaded successfully',
      data: {
        ...imageResult.rows[0],
        upload_info: uploadResult.data
      }
    });

  } catch (error) {
    console.error('Product image upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Upload failed',
      message: error.message
    });
  }
});

// Upload Multiple Product Images
const uploadMultipleProductImages = catchAsync(async (req, res) => {
  const { id: productId } = req.params;
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files provided',
      message: 'Please select at least one image to upload'
    });
  }

  // Verify product exists
  const productResult = await pool.query(
    'SELECT product_id, name FROM products WHERE product_id = $1',
    [productId]
  );

  if (productResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
      message: 'Product does not exist'
    });
  }

  const product = productResult.rows[0];
  const uploadResults = [];
  const errors = [];

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      // Upload image to Supabase
      const uploadResult = await uploadFile(file, STORAGE_BUCKETS.PRODUCTS, `products/${productId}`, {
        allowedTypes: ALLOWED_FILE_TYPES.images,
        maxSize: FILE_SIZE_LIMITS.image,
        makePublic: true,
        prefix: 'img'
      });

      // Save image info to database
      const imageResult = await pool.query(
        `INSERT INTO product_images 
         (product_id, image_url, storage_path, alt_text, is_primary, file_size, mime_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING image_id, image_url, alt_text, is_primary, created_at`,
        [
          productId,
          uploadResult.data.publicUrl,
          uploadResult.data.path,
          `${product.name} image ${i + 1}`,
          i === 0, // First image is primary by default
          uploadResult.data.size,
          uploadResult.data.mimeType,
          req.user?.user_id
        ]
      );

      uploadResults.push({
        ...imageResult.rows[0],
        upload_info: uploadResult.data
      });

    } catch (error) {
      errors.push({
        filename: file.originalname,
        error: error.message
      });
    }
  }

  res.status(uploadResults.length > 0 ? 201 : 500).json({
    success: uploadResults.length > 0,
    message: `${uploadResults.length} images uploaded successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
    data: {
      uploaded: uploadResults,
      errors: errors,
      total_uploaded: uploadResults.length,
      total_errors: errors.length
    }
  });
});

// Delete Product Image
const deleteProductImage = catchAsync(async (req, res) => {
  const { imageId } = req.params;

  // Get image info from database
  const imageResult = await pool.query(
    'SELECT image_id, storage_path, image_url FROM product_images WHERE image_id = $1',
    [imageId]
  );

  if (imageResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Image not found',
      message: 'Product image does not exist'
    });
  }

  const image = imageResult.rows[0];

  try {
    // Delete from Supabase storage
    if (image.storage_path) {
      await deleteFile(STORAGE_BUCKETS.PRODUCTS, image.storage_path);
    }

    // Delete from database
    await pool.query(
      'DELETE FROM product_images WHERE image_id = $1',
      [imageId]
    );

    res.json({
      success: true,
      message: 'Product image deleted successfully'
    });

  } catch (error) {
    console.error('Product image delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Delete failed',
      message: error.message
    });
  }
});

// Get Product Images
const getProductImages = catchAsync(async (req, res) => {
  const { id: productId } = req.params;

  const result = await pool.query(
    `SELECT 
      image_id, image_url, storage_path, alt_text, is_primary, 
      file_size, mime_type, created_at
     FROM product_images 
     WHERE product_id = $1 
     ORDER BY is_primary DESC, created_at ASC`,
    [productId]
  );

  res.json({
    success: true,
    data: result.rows
  });
});

// Generate Signed URL for Product Image
const generateProductImageSignedUrl = catchAsync(async (req, res) => {
  const { imageId } = req.params;
  const { expiresIn = 3600 } = req.query;

  // Get image info from database
  const imageResult = await pool.query(
    'SELECT image_id, storage_path FROM product_images WHERE image_id = $1',
    [imageId]
  );

  if (imageResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Image not found',
      message: 'Product image does not exist'
    });
  }

  const image = imageResult.rows[0];

  try {
    const signedUrlResult = await generateSignedUrl(
      STORAGE_BUCKETS.PRODUCTS,
      image.storage_path,
      parseInt(expiresIn)
    );

    res.json({
      success: true,
      data: signedUrlResult
    });

  } catch (error) {
    console.error('Signed URL generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Signed URL generation failed',
      message: error.message
    });
  }
});

// Bulk Delete Product Images
const bulkDeleteProductImages = catchAsync(async (req, res) => {
  const { image_ids } = req.body;

  if (!Array.isArray(image_ids) || image_ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid input',
      message: 'Please provide an array of image IDs'
    });
  }

  // Get images info from database
  const imagesResult = await pool.query(
    'SELECT image_id, storage_path FROM product_images WHERE image_id = ANY($1)',
    [image_ids]
  );

  const deletedImages = [];
  const errors = [];

  // Process each image
  for (const image of imagesResult.rows) {
    try {
      // Delete from Supabase storage
      if (image.storage_path) {
        await deleteFile(STORAGE_BUCKETS.PRODUCTS, image.storage_path);
      }

      // Delete from database
      await pool.query(
        'DELETE FROM product_images WHERE image_id = $1',
        [image.image_id]
      );

      deletedImages.push(image.image_id);

    } catch (error) {
      errors.push({
        image_id: image.image_id,
        error: error.message
      });
    }
  }

  res.json({
    success: deletedImages.length > 0,
    message: `${deletedImages.length} images deleted successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
    data: {
      deleted: deletedImages,
      errors: errors,
      total_deleted: deletedImages.length,
      total_errors: errors.length
    }
  });
});

module.exports = {
  uploadProductImage,
  uploadMultipleProductImages,
  deleteProductImage,
  getProductImages,
  generateProductImageSignedUrl,
  bulkDeleteProductImages
};
