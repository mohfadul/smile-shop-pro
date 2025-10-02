const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'email-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      // Check if we're in development mode
      const isDevelopment = process.env.NODE_ENV === 'development' || process.env.EMAIL_MOCK_MODE === 'true';

      if (isDevelopment) {
        // Use Ethereal Email for development/testing
        const testAccount = await nodemailer.createTestAccount();
        
        this.transporter = nodemailer.createTransporter({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });

        logger.info('📧 Email service initialized with Ethereal (development mode)');
        logger.info(`📧 Test account: ${testAccount.user}`);
        this.isConfigured = true;
        return;
      }

      // Production configuration with SendGrid
      if (process.env.SENDGRID_API_KEY) {
        this.transporter = nodemailer.createTransporter({
          service: 'SendGrid',
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY,
          },
        });

        logger.info('📧 Email service initialized with SendGrid');
        this.isConfigured = true;
        return;
      }

      // Alternative: Gmail with OAuth2
      if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GMAIL_CLIENT_ID,
          process.env.GMAIL_CLIENT_SECRET,
          'https://developers.google.com/oauthplayground'
        );

        oauth2Client.setCredentials({
          refresh_token: process.env.GMAIL_REFRESH_TOKEN,
        });

        const accessToken = await oauth2Client.getAccessToken();

        this.transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            type: 'OAuth2',
            user: process.env.GMAIL_USER,
            clientId: process.env.GMAIL_CLIENT_ID,
            clientSecret: process.env.GMAIL_CLIENT_SECRET,
            refreshToken: process.env.GMAIL_REFRESH_TOKEN,
            accessToken: accessToken.token,
          },
        });

        logger.info('📧 Email service initialized with Gmail OAuth2');
        this.isConfigured = true;
        return;
      }

      // Fallback: Basic SMTP
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        this.transporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        logger.info('📧 Email service initialized with custom SMTP');
        this.isConfigured = true;
        return;
      }

      logger.warn('📧 No email configuration found, email service disabled');
      this.isConfigured = false;

    } catch (error) {
      logger.error('📧 Failed to initialize email service:', error);
      this.isConfigured = false;
    }
  }

  async sendEmail({ to, subject, body, attachments = [], from = null }) {
    try {
      if (!this.isConfigured) {
        logger.warn('📧 Email service not configured, simulating send');
        return {
          success: true,
          message_id: `mock_${Date.now()}`,
          cost: 0.0001,
          preview_url: null
        };
      }

      // Prepare email options
      const fromEmail = from || process.env.FROM_EMAIL || 'noreply@dentalstore.sd';
      const fromName = process.env.FROM_NAME || 'Dental Store Sudan';

      const mailOptions = {
        from: `${fromName} <${fromEmail}>`,
        to: to,
        subject: subject,
        html: this.formatEmailBody(body),
        text: this.stripHtml(body),
        attachments: this.formatAttachments(attachments)
      };

      // Send email
      const info = await this.transporter.sendMail(mailOptions);

      // Log success
      logger.info(`📧 Email sent successfully to ${to}`, {
        messageId: info.messageId,
        subject: subject,
        to: to
      });

      // Return result
      return {
        success: true,
        message_id: info.messageId,
        cost: 0.0001, // Approximate cost per email
        preview_url: nodemailer.getTestMessageUrl(info) // Only works with Ethereal
      };

    } catch (error) {
      logger.error('📧 Failed to send email:', error);
      return {
        success: false,
        error: error.message,
        cost: 0
      };
    }
  }

  async sendBulkEmails(emails) {
    const results = [];

    for (const email of emails) {
      try {
        const result = await this.sendEmail(email);
        results.push({
          to: email.to,
          success: result.success,
          message_id: result.message_id,
          error: result.error
        });

        // Add delay to respect rate limits
        await this.delay(100); // 100ms delay between emails

      } catch (error) {
        logger.error(`📧 Failed to send bulk email to ${email.to}:`, error);
        results.push({
          to: email.to,
          success: false,
          error: error.message
        });
      }
    }

    return {
      total: emails.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  formatEmailBody(body) {
    // Convert plain text to HTML if needed
    if (!body.includes('<html>') && !body.includes('<div>')) {
      return `
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dental Store Sudan</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
              .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>🦷 Dental Store Sudan</h1>
            </div>
            <div class="content">
              ${body.replace(/\n/g, '<br>')}
            </div>
            <div class="footer">
              <p>Dental Store Sudan | Khartoum, Sudan | +249 123 456 789</p>
              <p>This email was sent automatically. Please do not reply to this email.</p>
            </div>
          </body>
        </html>
      `;
    }
    return body;
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\n\s*\n/g, '\n').trim();
  }

  formatAttachments(attachments) {
    return attachments.map(attachment => {
      if (typeof attachment === 'string') {
        // URL attachment
        return {
          filename: attachment.split('/').pop(),
          path: attachment
        };
      }
      
      if (attachment.type === 'pdf' && attachment.url) {
        return {
          filename: attachment.filename || 'document.pdf',
          path: attachment.url,
          contentType: 'application/pdf'
        };
      }

      return attachment;
    });
  }

  async verifyConnection() {
    try {
      if (!this.isConfigured) {
        return { success: false, error: 'Email service not configured' };
      }

      await this.transporter.verify();
      return { success: true, message: 'Email service connection verified' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Template-based email sending
  async sendTemplateEmail(templateName, to, templateData) {
    const templates = {
      order_confirmation: {
        subject: 'Order Confirmation - {{order_number}}',
        body: `
          <h2>Thank you for your order!</h2>
          <p>Dear {{customer_name}},</p>
          <p>Your order <strong>{{order_number}}</strong> has been confirmed and is being processed.</p>
          
          <h3>Order Details:</h3>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px;">
            {{order_details}}
          </div>
          
          <p><strong>Total Amount:</strong> {{total_amount}} {{currency}}</p>
          <p><strong>Payment Method:</strong> {{payment_method}}</p>
          
          <p>We will notify you once your order is shipped.</p>
          
          <p>Thank you for choosing Dental Store Sudan!</p>
        `
      },
      
      payment_confirmation: {
        subject: 'Payment Confirmed - {{order_number}}',
        body: `
          <h2>Payment Confirmation</h2>
          <p>Dear {{customer_name}},</p>
          <p>We have successfully received your payment for order <strong>{{order_number}}</strong>.</p>
          
          <p><strong>Payment Amount:</strong> {{amount}} {{currency}}</p>
          <p><strong>Payment Method:</strong> {{payment_method}}</p>
          <p><strong>Transaction ID:</strong> {{transaction_id}}</p>
          
          <p>Your order is now being prepared for shipment.</p>
          
          <p>Thank you for your business!</p>
        `
      },
      
      shipment_notification: {
        subject: 'Your Order Has Been Shipped - {{order_number}}',
        body: `
          <h2>Your Order is On Its Way!</h2>
          <p>Dear {{customer_name}},</p>
          <p>Great news! Your order <strong>{{order_number}}</strong> has been shipped.</p>
          
          <p><strong>Tracking Number:</strong> {{tracking_number}}</p>
          <p><strong>Estimated Delivery:</strong> {{delivery_date}}</p>
          <p><strong>Shipping Address:</strong></p>
          <div style="background-color: #f3f4f6; padding: 10px; border-radius: 4px;">
            {{shipping_address}}
          </div>
          
          <p>You can track your package using the tracking number provided.</p>
          
          <p>Thank you for choosing Dental Store Sudan!</p>
        `
      }
    };

    const template = templates[templateName];
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    // Replace template variables
    let subject = template.subject;
    let body = template.body;

    Object.keys(templateData).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, templateData[key]);
      body = body.replace(regex, templateData[key]);
    });

    return await this.sendEmail({ to, subject, body });
  }
}

// Export singleton instance
module.exports = new EmailService();
