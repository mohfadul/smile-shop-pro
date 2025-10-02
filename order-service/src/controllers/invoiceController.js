const PDFDocument = require('pdfkit');
const {
  uploadFile,
  downloadFile,
  deleteFile,
  generateSignedUrl,
  STORAGE_BUCKETS,
  ALLOWED_FILE_TYPES,
  FILE_SIZE_LIMITS
} = require('../../../shared/supabase-storage');
const { pool } = require('../models/orderModel');
const catchAsync = require('../utils/catchAsync');

// Generate PDF Invoice
const generateInvoicePDF = (order, items) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // Header
      doc.fontSize(20).text('SMILE SHOP PRO', 50, 50);
      doc.fontSize(12).text('Dental Equipment & Supplies', 50, 75);
      doc.text('Khartoum, Sudan', 50, 90);
      doc.text('Phone: +249 123 456 789', 50, 105);
      doc.text('Email: info@smileshoppro.com', 50, 120);

      // Invoice Title
      doc.fontSize(18).text('INVOICE', 400, 50);
      doc.fontSize(12).text(`Invoice #: ${order.order_number}`, 400, 75);
      doc.text(`Date: ${new Date(order.created_at).toLocaleDateString()}`, 400, 90);
      doc.text(`Status: ${order.status.toUpperCase()}`, 400, 105);

      // Customer Information
      doc.text('Bill To:', 50, 160);
      const shippingAddress = JSON.parse(order.shipping_address);
      doc.text(`${order.first_name} ${order.last_name}`, 50, 175);
      if (order.email) doc.text(order.email, 50, 190);
      doc.text(shippingAddress.street, 50, 205);
      doc.text(`${shippingAddress.city}, ${shippingAddress.state}`, 50, 220);
      if (shippingAddress.postal_code) doc.text(shippingAddress.postal_code, 50, 235);
      doc.text(shippingAddress.phone, 50, 250);

      // Items Table Header
      const tableTop = 300;
      doc.text('Item', 50, tableTop);
      doc.text('Qty', 250, tableTop);
      doc.text('Unit Price', 300, tableTop);
      doc.text('Total', 450, tableTop);
      
      // Draw line under header
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

      // Items
      let yPosition = tableTop + 30;
      items.forEach((item, index) => {
        doc.text(item.product_name, 50, yPosition);
        doc.text(item.quantity.toString(), 250, yPosition);
        doc.text(`${order.currency} ${parseFloat(item.unit_price).toFixed(2)}`, 300, yPosition);
        doc.text(`${order.currency} ${parseFloat(item.line_total).toFixed(2)}`, 450, yPosition);
        yPosition += 20;
      });

      // Totals
      yPosition += 20;
      doc.moveTo(300, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 15;

      doc.text('Subtotal:', 350, yPosition);
      doc.text(`${order.currency} ${parseFloat(order.subtotal).toFixed(2)}`, 450, yPosition);
      yPosition += 20;

      if (order.shipping_cost > 0) {
        doc.text('Shipping:', 350, yPosition);
        doc.text(`${order.currency} ${parseFloat(order.shipping_cost).toFixed(2)}`, 450, yPosition);
        yPosition += 20;
      }

      if (order.tax_amount > 0) {
        doc.text('Tax:', 350, yPosition);
        doc.text(`${order.currency} ${parseFloat(order.tax_amount).toFixed(2)}`, 450, yPosition);
        yPosition += 20;
      }

      // Total line
      doc.moveTo(300, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 15;
      doc.fontSize(14).text('Total:', 350, yPosition);
      doc.text(`${order.currency} ${parseFloat(order.total_amount).toFixed(2)}`, 450, yPosition);

      // Payment Information
      yPosition += 40;
      doc.fontSize(12).text('Payment Method:', 50, yPosition);
      doc.text(order.payment_method.replace('_', ' ').toUpperCase(), 150, yPosition);

      // Footer
      doc.fontSize(10).text('Thank you for your business!', 50, 700);
      doc.text('For support, contact: support@smileshoppro.com', 50, 715);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// Generate and Upload Invoice
const generateOrderInvoice = catchAsync(async (req, res) => {
  const { id: orderId } = req.params;

  // Get order details with items
  const orderResult = await pool.query(
    `SELECT 
      o.order_id, o.order_number, o.status, o.subtotal, o.shipping_cost, 
      o.tax_amount, o.total_amount, o.currency, o.payment_method,
      o.shipping_address, o.created_at,
      u.first_name, u.last_name, u.email
     FROM orders o
     LEFT JOIN users u ON o.customer_id = u.user_id
     WHERE o.order_id = $1`,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found',
      message: 'Order does not exist'
    });
  }

  const order = orderResult.rows[0];

  // Get order items
  const itemsResult = await pool.query(
    `SELECT product_name, quantity, unit_price, line_total
     FROM order_items 
     WHERE order_id = $1
     ORDER BY created_at ASC`,
    [orderId]
  );

  try {
    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(order, itemsResult.rows);

    // Create file object for upload
    const file = {
      buffer: pdfBuffer,
      originalname: `invoice_${order.order_number}.pdf`,
      mimetype: 'application/pdf',
      size: pdfBuffer.length
    };

    // Upload to Supabase
    const uploadResult = await uploadFile(file, STORAGE_BUCKETS.INVOICES, `orders/${orderId}`, {
      allowedTypes: ['application/pdf'],
      maxSize: FILE_SIZE_LIMITS.document,
      makePublic: false,
      prefix: 'invoice'
    });

    // Save invoice info to database
    const invoiceResult = await pool.query(
      `INSERT INTO order_invoices 
       (order_id, invoice_number, file_path, file_url, file_size, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING invoice_id, invoice_number, created_at`,
      [
        orderId,
        `INV-${order.order_number}`,
        uploadResult.data.path,
        uploadResult.data.publicUrl,
        uploadResult.data.size,
        req.user?.user_id
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Invoice generated successfully',
      data: {
        ...invoiceResult.rows[0],
        file_info: uploadResult.data
      }
    });

  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Invoice generation failed',
      message: error.message
    });
  }
});

// Download Invoice
const downloadOrderInvoice = catchAsync(async (req, res) => {
  const { id: orderId } = req.params;

  // Get invoice info
  const invoiceResult = await pool.query(
    `SELECT oi.invoice_id, oi.invoice_number, oi.file_path, o.order_number
     FROM order_invoices oi
     JOIN orders o ON oi.order_id = o.order_id
     WHERE oi.order_id = $1
     ORDER BY oi.created_at DESC
     LIMIT 1`,
    [orderId]
  );

  if (invoiceResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Invoice not found',
      message: 'No invoice found for this order'
    });
  }

  const invoice = invoiceResult.rows[0];

  try {
    // Download from Supabase
    const downloadResult = await downloadFile(STORAGE_BUCKETS.INVOICES, invoice.file_path);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice_${invoice.invoice_number}.pdf"`);

    // Send file
    res.send(downloadResult.data);

  } catch (error) {
    console.error('Invoice download error:', error);
    res.status(500).json({
      success: false,
      error: 'Download failed',
      message: error.message
    });
  }
});

// Get Invoice Signed URL
const getInvoiceSignedUrl = catchAsync(async (req, res) => {
  const { id: orderId } = req.params;
  const { expiresIn = 3600 } = req.query;

  // Get invoice info
  const invoiceResult = await pool.query(
    `SELECT file_path FROM order_invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  );

  if (invoiceResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Invoice not found',
      message: 'No invoice found for this order'
    });
  }

  const invoice = invoiceResult.rows[0];

  try {
    const signedUrlResult = await generateSignedUrl(
      STORAGE_BUCKETS.INVOICES,
      invoice.file_path,
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

// List Order Invoices
const listOrderInvoices = catchAsync(async (req, res) => {
  const { id: orderId } = req.params;

  const result = await pool.query(
    `SELECT 
      invoice_id, invoice_number, file_size, created_at,
      u.first_name, u.last_name
     FROM order_invoices oi
     LEFT JOIN users u ON oi.generated_by = u.user_id
     WHERE oi.order_id = $1
     ORDER BY oi.created_at DESC`,
    [orderId]
  );

  res.json({
    success: true,
    data: result.rows
  });
});

// Delete Invoice
const deleteOrderInvoice = catchAsync(async (req, res) => {
  const { invoiceId } = req.params;

  // Get invoice info
  const invoiceResult = await pool.query(
    'SELECT invoice_id, file_path FROM order_invoices WHERE invoice_id = $1',
    [invoiceId]
  );

  if (invoiceResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Invoice not found',
      message: 'Invoice does not exist'
    });
  }

  const invoice = invoiceResult.rows[0];

  try {
    // Delete from Supabase storage
    if (invoice.file_path) {
      await deleteFile(STORAGE_BUCKETS.INVOICES, invoice.file_path);
    }

    // Delete from database
    await pool.query(
      'DELETE FROM order_invoices WHERE invoice_id = $1',
      [invoiceId]
    );

    res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });

  } catch (error) {
    console.error('Invoice delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Delete failed',
      message: error.message
    });
  }
});

module.exports = {
  generateOrderInvoice,
  downloadOrderInvoice,
  getInvoiceSignedUrl,
  listOrderInvoices,
  deleteOrderInvoice
};
