const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const handlebars = require('handlebars');
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
  defaultMeta: { service: 'pdf-generator-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class PDFGeneratorService {
  constructor() {
    this.browser = null;
    this.templates = new Map();
    this.initializeTemplates();
  }

  async initializeTemplates() {
    try {
      // Register Handlebars helpers
      this.registerHandlebarsHelpers();
      
      // Load PDF templates
      await this.loadTemplates();
      
      logger.info('📄 PDF Generator Service initialized successfully');
    } catch (error) {
      logger.error('📄 Failed to initialize PDF Generator Service:', error);
    }
  }

  registerHandlebarsHelpers() {
    // Date formatting helper
    handlebars.registerHelper('formatDate', function(date, format) {
      const d = new Date(date);
      if (format === 'short') {
        return d.toLocaleDateString('en-US');
      } else if (format === 'long') {
        return d.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      }
      return d.toISOString().split('T')[0];
    });

    // Currency formatting helper
    handlebars.registerHelper('formatCurrency', function(amount, currency = 'USD') {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
      });
      return formatter.format(amount);
    });

    // Number formatting helper
    handlebars.registerHelper('formatNumber', function(number, decimals = 2) {
      return parseFloat(number).toFixed(decimals);
    });

    // Conditional helper
    handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    // Math helper
    handlebars.registerHelper('multiply', function(a, b) {
      return a * b;
    });

    // Loop index helper
    handlebars.registerHelper('inc', function(value) {
      return parseInt(value) + 1;
    });
  }

  async loadTemplates() {
    const templateDir = path.join(__dirname, '../templates');
    
    try {
      // Create templates directory if it doesn't exist
      await fs.mkdir(templateDir, { recursive: true });
      
      // Load invoice template
      this.templates.set('invoice', this.getInvoiceTemplate());
      
      // Load report templates
      this.templates.set('sales_report', this.getSalesReportTemplate());
      this.templates.set('inventory_report', this.getInventoryReportTemplate());
      this.templates.set('financial_report', this.getFinancialReportTemplate());
      
      logger.info('📄 PDF templates loaded successfully');
    } catch (error) {
      logger.error('📄 Failed to load PDF templates:', error);
    }
  }

  async getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  async generatePDF({ templateName, data, options = {} }) {
    try {
      const template = this.templates.get(templateName);
      if (!template) {
        throw new Error(`Template '${templateName}' not found`);
      }

      // Compile template with data
      const compiledTemplate = handlebars.compile(template);
      const html = compiledTemplate(data);

      // Generate PDF using Puppeteer
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Configure PDF options
      const pdfOptions = {
        format: options.format || 'A4',
        printBackground: true,
        margin: {
          top: options.marginTop || '20mm',
          right: options.marginRight || '15mm',
          bottom: options.marginBottom || '20mm',
          left: options.marginLeft || '15mm'
        },
        ...options
      };

      // Generate PDF buffer
      const pdfBuffer = await page.pdf(pdfOptions);
      
      await page.close();

      logger.info(`📄 PDF generated successfully: ${templateName}`);
      
      return {
        success: true,
        buffer: pdfBuffer,
        size: pdfBuffer.length,
        template: templateName
      };

    } catch (error) {
      logger.error('📄 Failed to generate PDF:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateInvoice(orderData) {
    try {
      // Prepare invoice data
      const invoiceData = {
        invoice_number: orderData.order_number,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        
        // Company information
        company: {
          name: 'Dental Store Sudan',
          address: 'Khartoum, Sudan',
          phone: '+249 123 456 789',
          email: 'info@dentalstore.sd',
          website: 'www.dentalstore.sd'
        },
        
        // Customer information
        customer: {
          name: orderData.customer_name || 'Valued Customer',
          email: orderData.customer_email || '',
          phone: orderData.customer_phone || '',
          address: orderData.shipping_address || ''
        },
        
        // Order details
        order: {
          number: orderData.order_number,
          date: orderData.created_at,
          status: orderData.status,
          payment_method: orderData.payment_method,
          payment_status: orderData.payment_status
        },
        
        // Items
        items: orderData.items || [],
        
        // Totals
        subtotal: orderData.subtotal || 0,
        tax_rate: orderData.tax_rate || 0.08,
        tax_amount: orderData.tax_amount || 0,
        shipping_cost: orderData.shipping_cost || 0,
        discount_amount: orderData.discount_amount || 0,
        total_amount: orderData.total_amount || 0,
        
        // Currency
        currency: orderData.currency || 'USD',
        
        // Notes
        notes: orderData.notes || 'Thank you for your business!',
        
        // Terms
        terms: 'Payment is due within 30 days. Late payments may be subject to fees.'
      };

      return await this.generatePDF({
        templateName: 'invoice',
        data: invoiceData,
        options: {
          format: 'A4',
          displayHeaderFooter: true,
          headerTemplate: '<div></div>',
          footerTemplate: `
            <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
              Page <span class="pageNumber"></span> of <span class="totalPages"></span>
            </div>
          `
        }
      });

    } catch (error) {
      logger.error('📄 Failed to generate invoice:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateReport({ reportType, reportData, title, subtitle }) {
    try {
      const templateName = `${reportType}_report`;
      
      const data = {
        title: title || `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`,
        subtitle: subtitle || '',
        generated_at: new Date().toISOString(),
        generated_by: 'Dental Store Sudan - Reporting System',
        ...reportData
      };

      return await this.generatePDF({
        templateName: templateName,
        data: data,
        options: {
          format: 'A4',
          landscape: reportType === 'inventory' ? true : false,
          displayHeaderFooter: true,
          headerTemplate: `
            <div style="font-size: 10px; text-align: center; width: 100%; color: #666; padding: 5px;">
              ${title || 'Report'} - Generated on ${new Date().toLocaleDateString()}
            </div>
          `,
          footerTemplate: `
            <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
              Page <span class="pageNumber"></span> of <span class="totalPages"></span> | Dental Store Sudan
            </div>
          `
        }
      });

    } catch (error) {
      logger.error('📄 Failed to generate report:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getInvoiceTemplate() {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice {{invoice_number}}</title>
    <style>
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; color: #333; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
        .company-info h1 { color: #2563eb; margin: 0; font-size: 28px; }
        .company-info p { margin: 5px 0; color: #666; }
        .invoice-info { text-align: right; }
        .invoice-info h2 { color: #2563eb; margin: 0; font-size: 24px; }
        .invoice-info p { margin: 5px 0; }
        .billing-info { display: flex; justify-content: space-between; margin: 30px 0; }
        .billing-section h3 { color: #2563eb; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .billing-section p { margin: 3px 0; }
        .items-table { width: 100%; border-collapse: collapse; margin: 30px 0; }
        .items-table th { background-color: #2563eb; color: white; padding: 12px; text-align: left; }
        .items-table td { padding: 10px 12px; border-bottom: 1px solid #eee; }
        .items-table tr:nth-child(even) { background-color: #f9fafb; }
        .totals { float: right; width: 300px; margin-top: 20px; }
        .totals table { width: 100%; }
        .totals td { padding: 8px 12px; }
        .totals .total-row { font-weight: bold; font-size: 18px; background-color: #2563eb; color: white; }
        .notes { margin-top: 40px; padding: 20px; background-color: #f9fafb; border-left: 4px solid #2563eb; }
        .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
        .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .status-paid { background-color: #10b981; color: white; }
        .status-pending { background-color: #f59e0b; color: white; }
        .status-failed { background-color: #ef4444; color: white; }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-info">
            <h1>🦷 {{company.name}}</h1>
            <p>{{company.address}}</p>
            <p>Phone: {{company.phone}}</p>
            <p>Email: {{company.email}}</p>
            <p>Website: {{company.website}}</p>
        </div>
        <div class="invoice-info">
            <h2>INVOICE</h2>
            <p><strong>Invoice #:</strong> {{invoice_number}}</p>
            <p><strong>Date:</strong> {{formatDate invoice_date 'short'}}</p>
            <p><strong>Due Date:</strong> {{formatDate due_date 'short'}}</p>
            <p><strong>Status:</strong> 
                <span class="status-badge status-{{order.payment_status}}">
                    {{order.payment_status}}
                </span>
            </p>
        </div>
    </div>

    <div class="billing-info">
        <div class="billing-section">
            <h3>Bill To:</h3>
            <p><strong>{{customer.name}}</strong></p>
            {{#if customer.email}}<p>{{customer.email}}</p>{{/if}}
            {{#if customer.phone}}<p>{{customer.phone}}</p>{{/if}}
            {{#if customer.address}}<p>{{customer.address}}</p>{{/if}}
        </div>
        <div class="billing-section">
            <h3>Order Details:</h3>
            <p><strong>Order #:</strong> {{order.number}}</p>
            <p><strong>Order Date:</strong> {{formatDate order.date 'short'}}</p>
            <p><strong>Payment Method:</strong> {{order.payment_method}}</p>
            <p><strong>Order Status:</strong> {{order.status}}</p>
        </div>
    </div>

    <table class="items-table">
        <thead>
            <tr>
                <th>#</th>
                <th>Description</th>
                <th>SKU</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
            </tr>
        </thead>
        <tbody>
            {{#each items}}
            <tr>
                <td>{{inc @index}}</td>
                <td>
                    <strong>{{this.name}}</strong>
                    {{#if this.description}}<br><small>{{this.description}}</small>{{/if}}
                </td>
                <td>{{this.sku}}</td>
                <td>{{this.quantity}}</td>
                <td>{{formatCurrency this.price ../currency}}</td>
                <td>{{formatCurrency (multiply this.quantity this.price) ../currency}}</td>
            </tr>
            {{/each}}
        </tbody>
    </table>

    <div class="totals">
        <table>
            <tr>
                <td>Subtotal:</td>
                <td style="text-align: right;">{{formatCurrency subtotal currency}}</td>
            </tr>
            {{#if discount_amount}}
            <tr>
                <td>Discount:</td>
                <td style="text-align: right;">-{{formatCurrency discount_amount currency}}</td>
            </tr>
            {{/if}}
            {{#if shipping_cost}}
            <tr>
                <td>Shipping:</td>
                <td style="text-align: right;">{{formatCurrency shipping_cost currency}}</td>
            </tr>
            {{/if}}
            <tr>
                <td>Tax ({{formatNumber (multiply tax_rate 100) 0}}%):</td>
                <td style="text-align: right;">{{formatCurrency tax_amount currency}}</td>
            </tr>
            <tr class="total-row">
                <td>TOTAL:</td>
                <td style="text-align: right;">{{formatCurrency total_amount currency}}</td>
            </tr>
        </table>
    </div>

    <div style="clear: both;"></div>

    {{#if notes}}
    <div class="notes">
        <h4>Notes:</h4>
        <p>{{notes}}</p>
    </div>
    {{/if}}

    <div class="notes">
        <h4>Payment Terms:</h4>
        <p>{{terms}}</p>
    </div>

    <div class="footer">
        <p>Thank you for your business!</p>
        <p>This invoice was generated automatically by Dental Store Sudan system.</p>
    </div>
</body>
</html>
    `;
  }

  getSalesReportTemplate() {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{title}}</title>
    <style>
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #2563eb; margin: 0; }
        .header p { color: #666; margin: 5px 0; }
        .summary-cards { display: flex; justify-content: space-between; margin: 30px 0; }
        .card { background: #f9fafb; padding: 20px; border-radius: 8px; text-align: center; flex: 1; margin: 0 10px; border-left: 4px solid #2563eb; }
        .card h3 { margin: 0; color: #2563eb; }
        .card .value { font-size: 24px; font-weight: bold; margin: 10px 0; }
        .data-table { width: 100%; border-collapse: collapse; margin: 30px 0; }
        .data-table th { background-color: #2563eb; color: white; padding: 12px; text-align: left; }
        .data-table td { padding: 10px 12px; border-bottom: 1px solid #eee; }
        .data-table tr:nth-child(even) { background-color: #f9fafb; }
        .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{title}}</h1>
        {{#if subtitle}}<p>{{subtitle}}</p>{{/if}}
        <p>Generated on {{formatDate generated_at 'long'}}</p>
        <p>{{generated_by}}</p>
    </div>

    {{#if summary}}
    <div class="summary-cards">
        <div class="card">
            <h3>Total Sales</h3>
            <div class="value">{{formatCurrency summary.total_sales 'USD'}}</div>
        </div>
        <div class="card">
            <h3>Total Orders</h3>
            <div class="value">{{summary.total_orders}}</div>
        </div>
        <div class="card">
            <h3>Average Order</h3>
            <div class="value">{{formatCurrency summary.average_order 'USD'}}</div>
        </div>
        <div class="card">
            <h3>Customers</h3>
            <div class="value">{{summary.total_customers}}</div>
        </div>
    </div>
    {{/if}}

    {{#if data}}
    <table class="data-table">
        <thead>
            <tr>
                <th>Date</th>
                <th>Orders</th>
                <th>Revenue</th>
                <th>Customers</th>
                <th>Avg Order Value</th>
            </tr>
        </thead>
        <tbody>
            {{#each data}}
            <tr>
                <td>{{formatDate this.date 'short'}}</td>
                <td>{{this.orders}}</td>
                <td>{{formatCurrency this.revenue 'USD'}}</td>
                <td>{{this.customers}}</td>
                <td>{{formatCurrency this.avg_order_value 'USD'}}</td>
            </tr>
            {{/each}}
        </tbody>
    </table>
    {{/if}}

    <div class="footer">
        <p>Dental Store Sudan - Sales Report</p>
        <p>This report was generated automatically by the reporting system.</p>
    </div>
</body>
</html>
    `;
  }

  getInventoryReportTemplate() {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{title}}</title>
    <style>
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 15px; color: #333; font-size: 12px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 15px; }
        .header h1 { color: #2563eb; margin: 0; font-size: 20px; }
        .header p { color: #666; margin: 3px 0; }
        .summary-cards { display: flex; justify-content: space-between; margin: 20px 0; }
        .card { background: #f9fafb; padding: 15px; border-radius: 6px; text-align: center; flex: 1; margin: 0 5px; border-left: 3px solid #2563eb; }
        .card h3 { margin: 0; color: #2563eb; font-size: 14px; }
        .card .value { font-size: 18px; font-weight: bold; margin: 8px 0; }
        .data-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 11px; }
        .data-table th { background-color: #2563eb; color: white; padding: 8px; text-align: left; }
        .data-table td { padding: 6px 8px; border-bottom: 1px solid #eee; }
        .data-table tr:nth-child(even) { background-color: #f9fafb; }
        .status-low { color: #ef4444; font-weight: bold; }
        .status-out { color: #dc2626; font-weight: bold; background-color: #fee2e2; }
        .status-good { color: #10b981; }
        .footer { margin-top: 30px; text-align: center; color: #666; font-size: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{title}}</h1>
        {{#if subtitle}}<p>{{subtitle}}</p>{{/if}}
        <p>Generated on {{formatDate generated_at 'long'}}</p>
        <p>{{generated_by}}</p>
    </div>

    {{#if summary}}
    <div class="summary-cards">
        <div class="card">
            <h3>Total Products</h3>
            <div class="value">{{summary.total_products}}</div>
        </div>
        <div class="card">
            <h3>Low Stock Items</h3>
            <div class="value">{{summary.low_stock_items}}</div>
        </div>
        <div class="card">
            <h3>Out of Stock</h3>
            <div class="value">{{summary.out_of_stock_items}}</div>
        </div>
        <div class="card">
            <h3>Total Value</h3>
            <div class="value">{{formatCurrency summary.total_value 'USD'}}</div>
        </div>
    </div>
    {{/if}}

    {{#if data}}
    <table class="data-table">
        <thead>
            <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Min Threshold</th>
                <th>Unit Price</th>
                <th>Total Value</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            {{#each data}}
            <tr>
                <td>{{this.sku}}</td>
                <td>{{this.name}}</td>
                <td>{{this.category}}</td>
                <td>{{this.stock_quantity}}</td>
                <td>{{this.low_stock_threshold}}</td>
                <td>{{formatCurrency this.price 'USD'}}</td>
                <td>{{formatCurrency (multiply this.stock_quantity this.price) 'USD'}}</td>
                <td>
                    {{#ifEquals this.stock_quantity 0}}
                        <span class="status-out">OUT OF STOCK</span>
                    {{else}}
                        {{#if (this.stock_quantity <= this.low_stock_threshold)}}
                            <span class="status-low">LOW STOCK</span>
                        {{else}}
                            <span class="status-good">IN STOCK</span>
                        {{/if}}
                    {{/ifEquals}}
                </td>
            </tr>
            {{/each}}
        </tbody>
    </table>
    {{/if}}

    <div class="footer">
        <p>Dental Store Sudan - Inventory Report</p>
        <p>This report was generated automatically by the reporting system.</p>
    </div>
</body>
</html>
    `;
  }

  getFinancialReportTemplate() {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{title}}</title>
    <style>
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #2563eb; margin: 0; }
        .header p { color: #666; margin: 5px 0; }
        .summary-cards { display: flex; justify-content: space-between; margin: 30px 0; }
        .card { background: #f9fafb; padding: 20px; border-radius: 8px; text-align: center; flex: 1; margin: 0 10px; border-left: 4px solid #2563eb; }
        .card h3 { margin: 0; color: #2563eb; }
        .card .value { font-size: 24px; font-weight: bold; margin: 10px 0; }
        .data-table { width: 100%; border-collapse: collapse; margin: 30px 0; }
        .data-table th { background-color: #2563eb; color: white; padding: 12px; text-align: left; }
        .data-table td { padding: 10px 12px; border-bottom: 1px solid #eee; }
        .data-table tr:nth-child(even) { background-color: #f9fafb; }
        .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{title}}</h1>
        {{#if subtitle}}<p>{{subtitle}}</p>{{/if}}
        <p>Generated on {{formatDate generated_at 'long'}}</p>
        <p>{{generated_by}}</p>
    </div>

    {{#if summary}}
    <div class="summary-cards">
        <div class="card">
            <h3>Total Revenue</h3>
            <div class="value">{{formatCurrency summary.total_revenue 'USD'}}</div>
        </div>
        <div class="card">
            <h3>Net Profit</h3>
            <div class="value">{{formatCurrency summary.net_profit 'USD'}}</div>
        </div>
        <div class="card">
            <h3>Transactions</h3>
            <div class="value">{{summary.total_transactions}}</div>
        </div>
        <div class="card">
            <h3>Avg Transaction</h3>
            <div class="value">{{formatCurrency summary.avg_transaction 'USD'}}</div>
        </div>
    </div>
    {{/if}}

    {{#if data}}
    <table class="data-table">
        <thead>
            <tr>
                <th>Payment Method</th>
                <th>Transactions</th>
                <th>Total Amount</th>
                <th>Success Rate</th>
                <th>Avg Amount</th>
            </tr>
        </thead>
        <tbody>
            {{#each data}}
            <tr>
                <td>{{this.payment_method}}</td>
                <td>{{this.transactions}}</td>
                <td>{{formatCurrency this.total_amount 'USD'}}</td>
                <td>{{formatNumber this.success_rate 1}}%</td>
                <td>{{formatCurrency this.avg_amount 'USD'}}</td>
            </tr>
            {{/each}}
        </tbody>
    </table>
    {{/if}}

    <div class="footer">
        <p>Dental Store Sudan - Financial Report</p>
        <p>This report was generated automatically by the reporting system.</p>
    </div>
</body>
</html>
    `;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('📄 PDF Generator Service closed successfully');
    }
  }
}

// Export singleton instance
module.exports = new PDFGeneratorService();
