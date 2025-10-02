// FREE ALTERNATIVE: Open-source PDF generation using PDFKit (replaces paid PDF APIs)
const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pdf-generation-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class PDFGenerationService {
  constructor() {
    this.isConfigured = true; // Always available since it's open-source
    this.tempDir = process.env.PDF_TEMP_DIR || './temp/pdfs';
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory:', error);
    }
  }

  // FREE ALTERNATIVE: Generate invoice PDF using PDFKit (replaces paid PDF APIs)
  async generateInvoicePDF(invoiceData) {
    try {
      logger.info(`📄 Generating invoice PDF for order ${invoiceData.orderNumber} (FREE PDFKit)`);

      return new Promise((resolve, reject) => {
        try {
          // Create new PDF document
          const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
              Title: `Invoice ${invoiceData.orderNumber}`,
              Author: 'Dental Store Sudan',
              Subject: `Invoice for Order ${invoiceData.orderNumber}`,
              Creator: 'Dental Store Sudan PDF Service',
              Producer: 'PDFKit (Open Source)'
            }
          });

          const buffers = [];
          doc.on('data', buffers.push.bind(buffers));
          doc.on('end', () => {
            const pdfBuffer = Buffer.concat(buffers);
            resolve({
              success: true,
              buffer: pdfBuffer,
              size: pdfBuffer.length,
              filename: `Invoice_${invoiceData.orderNumber}.pdf`,
              generator: 'PDFKit (FREE)'
            });
          });

          // Header with company logo area
          doc.fontSize(20)
             .fillColor('#2563eb')
             .text('🦷 DENTAL STORE SUDAN', 50, 50);

          doc.fontSize(12)
             .fillColor('#666')
             .text('Professional Dental Equipment & Supplies', 50, 75)
             .text('Khartoum, Sudan | +249 123 456 789', 50, 90)
             .text('info@dentalstore.sd | www.dentalstore.sd', 50, 105);

          // Invoice title and number
          doc.fontSize(24)
             .fillColor('#000')
             .text('INVOICE', 400, 50);

          doc.fontSize(12)
             .text(`Invoice #: ${invoiceData.orderNumber}`, 400, 80)
             .text(`Date: ${new Date(invoiceData.createdAt).toLocaleDateString()}`, 400, 95)
             .text(`Due Date: ${new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString()}`, 400, 110);

          // Customer information
          let yPosition = 150;
          doc.fontSize(14)
             .fillColor('#2563eb')
             .text('BILL TO:', 50, yPosition);

          yPosition += 20;
          doc.fontSize(12)
             .fillColor('#000')
             .text(`${invoiceData.customer.firstName} ${invoiceData.customer.lastName}`, 50, yPosition)
             .text(invoiceData.customer.email, 50, yPosition + 15)
             .text(invoiceData.customer.phone || 'N/A', 50, yPosition + 30);

          if (invoiceData.shippingAddress) {
            doc.text('SHIPPING ADDRESS:', 300, yPosition)
               .text(invoiceData.shippingAddress.street || 'N/A', 300, yPosition + 15)
               .text(`${invoiceData.shippingAddress.city || ''}, ${invoiceData.shippingAddress.state || ''}`, 300, yPosition + 30)
               .text(invoiceData.shippingAddress.postalCode || '', 300, yPosition + 45);
          }

          // Items table
          yPosition = 250;
          
          // Table header
          doc.rect(50, yPosition, 500, 25)
             .fillAndStroke('#2563eb', '#2563eb');

          doc.fillColor('#fff')
             .fontSize(10)
             .text('ITEM', 60, yPosition + 8)
             .text('QTY', 300, yPosition + 8)
             .text('UNIT PRICE', 350, yPosition + 8)
             .text('TOTAL', 450, yPosition + 8);

          yPosition += 25;

          // Table rows
          let subtotal = 0;
          invoiceData.items.forEach((item, index) => {
            const rowColor = index % 2 === 0 ? '#f9fafb' : '#fff';
            
            doc.rect(50, yPosition, 500, 20)
               .fillAndStroke(rowColor, '#e5e7eb');

            const itemTotal = item.quantity * item.price;
            subtotal += itemTotal;

            doc.fillColor('#000')
               .fontSize(9)
               .text(item.name.substring(0, 40), 60, yPosition + 6)
               .text(item.quantity.toString(), 300, yPosition + 6)
               .text(`${item.price.toFixed(2)} ${invoiceData.currency}`, 350, yPosition + 6)
               .text(`${itemTotal.toFixed(2)} ${invoiceData.currency}`, 450, yPosition + 6);

            yPosition += 20;
          });

          // Totals section
          yPosition += 20;
          const totalsX = 350;

          doc.fontSize(10)
             .text('Subtotal:', totalsX, yPosition)
             .text(`${subtotal.toFixed(2)} ${invoiceData.currency}`, 450, yPosition);

          yPosition += 15;
          const tax = invoiceData.taxAmount || 0;
          doc.text('Tax:', totalsX, yPosition)
             .text(`${tax.toFixed(2)} ${invoiceData.currency}`, 450, yPosition);

          yPosition += 15;
          const shipping = invoiceData.shippingCost || 0;
          doc.text('Shipping:', totalsX, yPosition)
             .text(`${shipping.toFixed(2)} ${invoiceData.currency}`, 450, yPosition);

          yPosition += 20;
          const total = subtotal + tax + shipping;
          
          doc.rect(350, yPosition - 5, 200, 25)
             .fillAndStroke('#2563eb', '#2563eb');

          doc.fillColor('#fff')
             .fontSize(12)
             .text('TOTAL:', totalsX + 10, yPosition + 3)
             .text(`${total.toFixed(2)} ${invoiceData.currency}`, 450, yPosition + 3);

          // Payment information
          yPosition += 50;
          doc.fillColor('#2563eb')
             .fontSize(12)
             .text('PAYMENT INFORMATION:', 50, yPosition);

          yPosition += 20;
          doc.fillColor('#000')
             .fontSize(10)
             .text(`Payment Method: ${invoiceData.paymentMethod || 'Bank Transfer'}`, 50, yPosition)
             .text(`Payment Status: ${invoiceData.paymentStatus || 'Pending'}`, 50, yPosition + 15);

          if (invoiceData.paymentMethod === 'bank_transfer') {
            yPosition += 35;
            doc.text('Bank Transfer Details:', 50, yPosition)
               .text('Bank: Bank of Khartoum', 50, yPosition + 15)
               .text('Account: 1234567890', 50, yPosition + 30)
               .text('SWIFT: BOKH SD KH', 50, yPosition + 45);
          }

          // Footer
          yPosition = 700;
          doc.fontSize(8)
             .fillColor('#666')
             .text('Thank you for your business! For questions about this invoice, contact us at info@dentalstore.sd', 50, yPosition, {
               width: 500,
               align: 'center'
             });

          doc.text('This invoice was generated automatically by Dental Store Sudan system.', 50, yPosition + 20, {
             width: 500,
             align: 'center'
           });

          // Finalize the PDF
          doc.end();

        } catch (error) {
          reject(error);
        }
      });

    } catch (error) {
      logger.error('📄 Failed to generate invoice PDF:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // FREE ALTERNATIVE: Generate report PDF using PDFKit
  async generateReportPDF(reportData) {
    try {
      logger.info(`📄 Generating ${reportData.type} report PDF (FREE PDFKit)`);

      return new Promise((resolve, reject) => {
        try {
          const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
              Title: `${reportData.type} Report`,
              Author: 'Dental Store Sudan',
              Subject: `${reportData.type} Report - ${reportData.period}`,
              Creator: 'Dental Store Sudan Reporting Service',
              Producer: 'PDFKit (Open Source)'
            }
          });

          const buffers = [];
          doc.on('data', buffers.push.bind(buffers));
          doc.on('end', () => {
            const pdfBuffer = Buffer.concat(buffers);
            resolve({
              success: true,
              buffer: pdfBuffer,
              size: pdfBuffer.length,
              filename: `${reportData.type}_Report_${reportData.period}.pdf`,
              generator: 'PDFKit (FREE)'
            });
          });

          // Header
          doc.fontSize(20)
             .fillColor('#2563eb')
             .text('🦷 DENTAL STORE SUDAN', 50, 50);

          doc.fontSize(16)
             .fillColor('#000')
             .text(`${reportData.type.toUpperCase()} REPORT`, 50, 80);

          doc.fontSize(12)
             .fillColor('#666')
             .text(`Period: ${reportData.period}`, 50, 105)
             .text(`Generated: ${new Date().toLocaleString()}`, 50, 120);

          let yPosition = 160;

          // Summary section
          if (reportData.summary) {
            doc.fontSize(14)
               .fillColor('#2563eb')
               .text('SUMMARY', 50, yPosition);

            yPosition += 25;
            Object.entries(reportData.summary).forEach(([key, value]) => {
              doc.fontSize(11)
                 .fillColor('#000')
                 .text(`${key.replace(/_/g, ' ').toUpperCase()}:`, 50, yPosition)
                 .text(value.toString(), 200, yPosition);
              yPosition += 18;
            });

            yPosition += 20;
          }

          // Data table
          if (reportData.data && reportData.data.length > 0) {
            doc.fontSize(14)
               .fillColor('#2563eb')
               .text('DETAILED DATA', 50, yPosition);

            yPosition += 25;

            // Table header
            const headers = Object.keys(reportData.data[0]);
            const colWidth = 500 / headers.length;

            doc.rect(50, yPosition, 500, 20)
               .fillAndStroke('#2563eb', '#2563eb');

            doc.fillColor('#fff')
               .fontSize(9);

            headers.forEach((header, index) => {
              doc.text(header.toUpperCase(), 55 + (index * colWidth), yPosition + 6);
            });

            yPosition += 20;

            // Table rows
            reportData.data.slice(0, 20).forEach((row, rowIndex) => { // Limit to 20 rows
              const rowColor = rowIndex % 2 === 0 ? '#f9fafb' : '#fff';
              
              doc.rect(50, yPosition, 500, 18)
                 .fillAndStroke(rowColor, '#e5e7eb');

              doc.fillColor('#000')
                 .fontSize(8);

              headers.forEach((header, colIndex) => {
                const value = row[header]?.toString().substring(0, 15) || 'N/A';
                doc.text(value, 55 + (colIndex * colWidth), yPosition + 5);
              });

              yPosition += 18;

              // Page break if needed
              if (yPosition > 700) {
                doc.addPage();
                yPosition = 50;
              }
            });
          }

          // Footer
          const footerY = 750;
          doc.fontSize(8)
             .fillColor('#666')
             .text('Generated by Dental Store Sudan Reporting System (PDFKit - Open Source)', 50, footerY, {
               width: 500,
               align: 'center'
             });

          doc.end();

        } catch (error) {
          reject(error);
        }
      });

    } catch (error) {
      logger.error('📄 Failed to generate report PDF:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // FREE ALTERNATIVE: Generate certificate PDF
  async generateCertificatePDF(certificateData) {
    try {
      logger.info(`📄 Generating certificate PDF for ${certificateData.recipientName} (FREE PDFKit)`);

      return new Promise((resolve, reject) => {
        try {
          const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            layout: 'landscape',
            info: {
              Title: `Certificate - ${certificateData.title}`,
              Author: 'Dental Store Sudan',
              Subject: `Certificate for ${certificateData.recipientName}`,
              Creator: 'Dental Store Sudan Certificate Service',
              Producer: 'PDFKit (Open Source)'
            }
          });

          const buffers = [];
          doc.on('data', buffers.push.bind(buffers));
          doc.on('end', () => {
            const pdfBuffer = Buffer.concat(buffers);
            resolve({
              success: true,
              buffer: pdfBuffer,
              size: pdfBuffer.length,
              filename: `Certificate_${certificateData.recipientName.replace(/\s+/g, '_')}.pdf`,
              generator: 'PDFKit (FREE)'
            });
          });

          // Certificate border
          doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60)
             .lineWidth(3)
             .stroke('#2563eb');

          doc.rect(40, 40, doc.page.width - 80, doc.page.height - 80)
             .lineWidth(1)
             .stroke('#2563eb');

          // Header
          doc.fontSize(24)
             .fillColor('#2563eb')
             .text('🦷 DENTAL STORE SUDAN', 0, 100, { align: 'center' });

          doc.fontSize(18)
             .fillColor('#000')
             .text('CERTIFICATE OF COMPLETION', 0, 140, { align: 'center' });

          // Certificate content
          doc.fontSize(14)
             .text('This is to certify that', 0, 200, { align: 'center' });

          doc.fontSize(28)
             .fillColor('#2563eb')
             .text(certificateData.recipientName, 0, 240, { align: 'center' });

          doc.fontSize(14)
             .fillColor('#000')
             .text('has successfully completed', 0, 290, { align: 'center' });

          doc.fontSize(20)
             .fillColor('#2563eb')
             .text(certificateData.title, 0, 330, { align: 'center' });

          if (certificateData.description) {
            doc.fontSize(12)
               .fillColor('#666')
               .text(certificateData.description, 0, 370, { 
                 align: 'center',
                 width: doc.page.width - 100
               });
          }

          // Date and signature area
          const signatureY = 450;
          doc.fontSize(12)
             .fillColor('#000')
             .text(`Date: ${new Date().toLocaleDateString()}`, 100, signatureY);

          doc.text('Authorized Signature', doc.page.width - 200, signatureY);
          
          // Signature line
          doc.moveTo(doc.page.width - 200, signatureY + 30)
             .lineTo(doc.page.width - 50, signatureY + 30)
             .stroke('#000');

          // Certificate ID
          doc.fontSize(8)
             .fillColor('#666')
             .text(`Certificate ID: ${certificateData.certificateId || Date.now()}`, 0, doc.page.height - 80, { align: 'center' });

          doc.end();

        } catch (error) {
          reject(error);
        }
      });

    } catch (error) {
      logger.error('📄 Failed to generate certificate PDF:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Save PDF buffer to file
  async savePDFToFile(pdfBuffer, filename) {
    try {
      const filePath = path.join(this.tempDir, filename);
      await fs.writeFile(filePath, pdfBuffer);
      
      logger.info(`📄 PDF saved to file: ${filePath}`);
      
      return {
        success: true,
        filePath: filePath,
        filename: filename,
        size: pdfBuffer.length
      };
    } catch (error) {
      logger.error('📄 Failed to save PDF to file:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Clean up temporary files
  async cleanupTempFiles(olderThanHours = 24) {
    try {
      const files = await fs.readdir(this.tempDir);
      const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
      
      let cleanedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }
      
      logger.info(`📄 Cleaned up ${cleanedCount} temporary PDF files`);
      
      return {
        success: true,
        cleanedCount: cleanedCount
      };
    } catch (error) {
      logger.error('📄 Failed to cleanup temp files:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get service status
  getServiceStatus() {
    return {
      configured: this.isConfigured,
      generator: 'PDFKit (Open Source)',
      cost_per_pdf: 0, // FREE
      features: [
        'invoice_generation',
        'report_generation', 
        'certificate_generation',
        'custom_styling',
        'unlimited_generation'
      ],
      limitations: [
        'server_processing_only',
        'basic_styling_options'
      ],
      temp_directory: this.tempDir
    };
  }
}

// Export singleton instance
module.exports = new PDFGenerationService();
