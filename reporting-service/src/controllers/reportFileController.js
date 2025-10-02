const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const {
  uploadFile,
  downloadFile,
  deleteFile,
  generateSignedUrl,
  listFiles,
  STORAGE_BUCKETS,
  FILE_SIZE_LIMITS
} = require('../../../shared/supabase-storage');
const { pool } = require('../models/reportModel');
const catchAsync = require('../utils/catchAsync');

// Generate Excel Report
const generateExcelReport = async (reportData, reportType) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(reportType);

  // Set up headers based on report type
  let headers = [];
  let data = [];

  switch (reportType) {
    case 'sales_report':
      headers = ['Date', 'Order ID', 'Customer', 'Total Amount', 'Currency', 'Status', 'Payment Method'];
      data = reportData.map(row => [
        new Date(row.created_at).toLocaleDateString(),
        row.order_number,
        `${row.first_name} ${row.last_name}`,
        parseFloat(row.total_amount),
        row.currency,
        row.status,
        row.payment_method
      ]);
      break;

    case 'product_report':
      headers = ['Product Name', 'SKU', 'Category', 'Stock Quantity', 'Price', 'Status', 'Total Sales'];
      data = reportData.map(row => [
        row.name,
        row.sku,
        row.category_name,
        row.stock_quantity,
        parseFloat(row.price),
        row.status,
        row.total_sales || 0
      ]);
      break;

    case 'customer_report':
      headers = ['Customer Name', 'Email', 'Phone', 'Total Orders', 'Total Spent', 'Last Order Date'];
      data = reportData.map(row => [
        `${row.first_name} ${row.last_name}`,
        row.email,
        row.phone,
        row.total_orders,
        parseFloat(row.total_spent || 0),
        row.last_order_date ? new Date(row.last_order_date).toLocaleDateString() : 'N/A'
      ]);
      break;

    default:
      headers = Object.keys(reportData[0] || {});
      data = reportData.map(row => Object.values(row));
  }

  // Add headers
  worksheet.addRow(headers);
  
  // Style headers
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Add data
  data.forEach(row => {
    worksheet.addRow(row);
  });

  // Auto-fit columns
  worksheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    column.width = maxLength < 10 ? 10 : maxLength + 2;
  });

  return workbook;
};

// Generate PDF Report
const generatePDFReport = (reportData, reportType, reportTitle) => {
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
      doc.fontSize(16).text(reportTitle, 50, 80);
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 105);
      doc.text(`Report Type: ${reportType.replace('_', ' ').toUpperCase()}`, 50, 120);

      // Summary
      let yPosition = 160;
      doc.fontSize(14).text('Summary:', 50, yPosition);
      yPosition += 20;
      doc.fontSize(12).text(`Total Records: ${reportData.length}`, 50, yPosition);

      // Data table (simplified for PDF)
      yPosition += 40;
      if (reportData.length > 0) {
        const sampleData = reportData.slice(0, 20); // Show first 20 records
        
        sampleData.forEach((row, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }
          
          let rowText = '';
          switch (reportType) {
            case 'sales_report':
              rowText = `${index + 1}. Order: ${row.order_number} - ${row.first_name} ${row.last_name} - ${row.currency} ${row.total_amount}`;
              break;
            case 'product_report':
              rowText = `${index + 1}. ${row.name} (${row.sku}) - Stock: ${row.stock_quantity} - Price: ${row.price}`;
              break;
            case 'customer_report':
              rowText = `${index + 1}. ${row.first_name} ${row.last_name} - Orders: ${row.total_orders} - Spent: ${row.total_spent || 0}`;
              break;
            default:
              rowText = `${index + 1}. ${JSON.stringify(row).substring(0, 100)}...`;
          }
          
          doc.text(rowText, 50, yPosition);
          yPosition += 15;
        });

        if (reportData.length > 20) {
          yPosition += 10;
          doc.text(`... and ${reportData.length - 20} more records`, 50, yPosition);
        }
      }

      // Footer
      doc.fontSize(10).text('Generated by Smile Shop Pro Reporting System', 50, 750);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// Generate and Upload Report
const generateAndUploadReport = catchAsync(async (req, res) => {
  const { reportType, format = 'excel', title, filters = {} } = req.body;

  if (!reportType) {
    return res.status(400).json({
      success: false,
      error: 'Missing report type',
      message: 'Please specify the report type'
    });
  }

  try {
    // Fetch report data based on type (simplified - you'd have specific queries for each type)
    let reportData = [];
    let reportTitle = title || `${reportType.replace('_', ' ').toUpperCase()} Report`;

    switch (reportType) {
      case 'sales_report':
        const salesResult = await pool.query(`
          SELECT o.order_number, o.total_amount, o.currency, o.status, 
                 o.payment_method, o.created_at, u.first_name, u.last_name
          FROM orders o
          LEFT JOIN users u ON o.customer_id = u.user_id
          WHERE o.created_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
            AND o.created_at <= COALESCE($2::date, CURRENT_DATE)
          ORDER BY o.created_at DESC
        `, [filters.start_date, filters.end_date]);
        reportData = salesResult.rows;
        break;

      case 'product_report':
        const productResult = await pool.query(`
          SELECT p.name, p.sku, p.stock_quantity, p.price, p.status,
                 c.name as category_name,
                 COALESCE(SUM(oi.quantity), 0) as total_sales
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.category_id
          LEFT JOIN order_items oi ON p.product_id = oi.product_id
          GROUP BY p.product_id, c.name
          ORDER BY p.name
        `);
        reportData = productResult.rows;
        break;

      case 'customer_report':
        const customerResult = await pool.query(`
          SELECT u.first_name, u.last_name, u.email, u.phone,
                 COUNT(o.order_id) as total_orders,
                 SUM(o.total_amount) as total_spent,
                 MAX(o.created_at) as last_order_date
          FROM users u
          LEFT JOIN orders o ON u.user_id = o.customer_id
          WHERE u.role = 'customer'
          GROUP BY u.user_id
          ORDER BY total_spent DESC NULLS LAST
        `);
        reportData = customerResult.rows;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid report type',
          message: 'Unsupported report type'
        });
    }

    let fileBuffer;
    let filename;
    let mimeType;

    if (format === 'excel') {
      const workbook = await generateExcelReport(reportData, reportType);
      fileBuffer = await workbook.xlsx.writeBuffer();
      filename = `${reportType}_${Date.now()}.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (format === 'pdf') {
      fileBuffer = await generatePDFReport(reportData, reportType, reportTitle);
      filename = `${reportType}_${Date.now()}.pdf`;
      mimeType = 'application/pdf';
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid format',
        message: 'Supported formats: excel, pdf'
      });
    }

    // Create file object for upload
    const file = {
      buffer: fileBuffer,
      originalname: filename,
      mimetype: mimeType,
      size: fileBuffer.length
    };

    // Upload to Supabase
    const uploadResult = await uploadFile(file, STORAGE_BUCKETS.REPORTS, `reports/${reportType}`, {
      allowedTypes: [mimeType],
      maxSize: FILE_SIZE_LIMITS.report,
      makePublic: false,
      prefix: 'report'
    });

    // Save report info to database
    const reportResult = await pool.query(
      `INSERT INTO generated_reports 
       (report_type, title, format, file_path, file_size, filters, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING report_id, created_at`,
      [
        reportType,
        reportTitle,
        format,
        uploadResult.data.path,
        uploadResult.data.size,
        JSON.stringify(filters),
        req.user?.user_id
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Report generated successfully',
      data: {
        report_id: reportResult.rows[0].report_id,
        report_type: reportType,
        title: reportTitle,
        format: format,
        records_count: reportData.length,
        file_info: uploadResult.data,
        created_at: reportResult.rows[0].created_at
      }
    });

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Report generation failed',
      message: error.message
    });
  }
});

// Download Report
const downloadReport = catchAsync(async (req, res) => {
  const { reportId } = req.params;

  // Get report info
  const reportResult = await pool.query(
    `SELECT report_id, report_type, title, format, file_path
     FROM generated_reports 
     WHERE report_id = $1`,
    [reportId]
  );

  if (reportResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Report not found',
      message: 'Report does not exist'
    });
  }

  const report = reportResult.rows[0];

  try {
    // Download from Supabase
    const downloadResult = await downloadFile(STORAGE_BUCKETS.REPORTS, report.file_path);

    // Set response headers
    const contentType = report.format === 'excel' 
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
    
    const extension = report.format === 'excel' ? 'xlsx' : 'pdf';
    const filename = `${report.report_type}_${report.report_id}.${extension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send file
    res.send(downloadResult.data);

  } catch (error) {
    console.error('Report download error:', error);
    res.status(500).json({
      success: false,
      error: 'Download failed',
      message: error.message
    });
  }
});

// Get Report Signed URL
const getReportSignedUrl = catchAsync(async (req, res) => {
  const { reportId } = req.params;
  const { expiresIn = 3600 } = req.query;

  // Get report info
  const reportResult = await pool.query(
    `SELECT file_path FROM generated_reports WHERE report_id = $1`,
    [reportId]
  );

  if (reportResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Report not found',
      message: 'Report does not exist'
    });
  }

  const report = reportResult.rows[0];

  try {
    const signedUrlResult = await generateSignedUrl(
      STORAGE_BUCKETS.REPORTS,
      report.file_path,
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

// List Generated Reports
const listGeneratedReports = catchAsync(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    report_type, 
    format,
    start_date,
    end_date 
  } = req.query;

  const offset = (page - 1) * limit;
  let whereClause = 'WHERE 1=1';
  const values = [];
  let paramCount = 0;

  if (report_type) {
    whereClause += ` AND report_type = $${++paramCount}`;
    values.push(report_type);
  }

  if (format) {
    whereClause += ` AND format = $${++paramCount}`;
    values.push(format);
  }

  if (start_date) {
    whereClause += ` AND created_at >= $${++paramCount}`;
    values.push(start_date);
  }

  if (end_date) {
    whereClause += ` AND created_at <= $${++paramCount}`;
    values.push(end_date);
  }

  // Count total reports
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM generated_reports ${whereClause}`,
    values
  );

  // Get reports
  const reportsResult = await pool.query(
    `SELECT 
      gr.report_id, gr.report_type, gr.title, gr.format, gr.file_size, gr.created_at,
      u.first_name, u.last_name
     FROM generated_reports gr
     LEFT JOIN users u ON gr.generated_by = u.user_id
     ${whereClause}
     ORDER BY gr.created_at DESC
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalReports = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalReports / limit);

  res.json({
    success: true,
    data: {
      reports: reportsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalReports,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Delete Report
const deleteReport = catchAsync(async (req, res) => {
  const { reportId } = req.params;

  // Get report info
  const reportResult = await pool.query(
    'SELECT report_id, file_path FROM generated_reports WHERE report_id = $1',
    [reportId]
  );

  if (reportResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Report not found',
      message: 'Report does not exist'
    });
  }

  const report = reportResult.rows[0];

  try {
    // Delete from Supabase storage
    if (report.file_path) {
      await deleteFile(STORAGE_BUCKETS.REPORTS, report.file_path);
    }

    // Delete from database
    await pool.query(
      'DELETE FROM generated_reports WHERE report_id = $1',
      [reportId]
    );

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    console.error('Report delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Delete failed',
      message: error.message
    });
  }
});

module.exports = {
  generateAndUploadReport,
  downloadReport,
  getReportSignedUrl,
  listGeneratedReports,
  deleteReport
};
