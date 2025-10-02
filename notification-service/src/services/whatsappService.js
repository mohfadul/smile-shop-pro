const twilio = require('twilio');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'whatsapp-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isConfigured = false;
    this.fromNumber = null;
    this.initializeClient();
  }

  initializeClient() {
    try {
      // Check if we're in development mode
      const isDevelopment = process.env.NODE_ENV === 'development' || process.env.WHATSAPP_MOCK_MODE === 'true';

      if (isDevelopment) {
        logger.info('📱 WhatsApp service initialized in mock mode (development)');
        this.isConfigured = true;
        return;
      }

      // FREE ALTERNATIVE: Twilio Trial/Sandbox (FREE - limited but functional)
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        // Use Twilio Sandbox number (FREE) - requires recipient to join sandbox first
        this.fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'; // FREE Twilio Sandbox
        
        logger.info('📱 WhatsApp service initialized with Twilio Sandbox (FREE)');
        logger.info(`📱 From number: ${this.fromNumber} (Sandbox - recipients must join first)`);
        logger.info('📱 To join sandbox, send "join <sandbox-keyword>" to the sandbox number');
        this.isConfigured = true;
        return;
      }

      // FALLBACK: Manual WhatsApp messaging (for development/testing)
      if (process.env.WHATSAPP_MANUAL_MODE === 'true') {
        logger.info('📱 WhatsApp service initialized in MANUAL mode (FREE)');
        logger.info('📱 Messages will be logged for manual sending via WhatsApp Web/App');
        this.isConfigured = true;
        this.manualMode = true;
        return;
      }

      logger.warn('📱 No WhatsApp configuration found, WhatsApp service disabled');
      this.isConfigured = false;

    } catch (error) {
      logger.error('📱 Failed to initialize WhatsApp service:', error);
      this.isConfigured = false;
    }
  }

  async sendWhatsApp({ to, body, attachments = [] }) {
    try {
      // Ensure phone number is in correct format
      const formattedTo = this.formatPhoneNumber(to);

      if (!this.isConfigured) {
        logger.warn(`📱 WhatsApp service not configured, simulating send to ${formattedTo}`);
        return {
          success: true,
          message_id: `mock_wa_${Date.now()}`,
          cost: 0, // FREE
          to: formattedTo
        };
      }

      // MANUAL MODE: Log message for manual sending (FREE alternative)
      if (this.manualMode) {
        logger.info('📱 MANUAL WHATSAPP MESSAGE (Copy and send manually):');
        logger.info(`📱 TO: ${formattedTo.replace('whatsapp:', '')}`);
        logger.info(`📱 MESSAGE: ${body}`);
        if (attachments.length > 0) {
          logger.info(`📱 ATTACHMENTS: ${JSON.stringify(attachments)}`);
        }
        logger.info('📱 ----------------------------------------');
        
        return {
          success: true,
          message_id: `manual_wa_${Date.now()}`,
          cost: 0, // FREE - manual sending
          to: formattedTo,
          manual_mode: true
        };
      }

      // Prepare message options
      const messageOptions = {
        from: this.fromNumber,
        to: formattedTo,
        body: this.formatMessage(body)
      };

      // Add media attachments if provided
      if (attachments && attachments.length > 0) {
        const mediaUrl = this.getFirstMediaUrl(attachments);
        if (mediaUrl) {
          messageOptions.mediaUrl = [mediaUrl];
        }
      }

      // Send WhatsApp message via Twilio
      const message = await this.client.messages.create(messageOptions);

      // Log success
      logger.info(`📱 WhatsApp message sent successfully to ${formattedTo}`, {
        messageId: message.sid,
        to: formattedTo,
        status: message.status
      });

      // Return result
      return {
        success: true,
        message_id: message.sid,
        cost: 0, // FREE with Twilio Sandbox (limited recipients)
        to: formattedTo,
        status: message.status
      };

    } catch (error) {
      logger.error('📱 Failed to send WhatsApp message:', error);
      return {
        success: false,
        error: error.message,
        cost: 0,
        to: to
      };
    }
  }

  async sendBulkWhatsApp(messages) {
    const results = [];

    for (const message of messages) {
      try {
        const result = await this.sendWhatsApp(message);
        results.push({
          to: message.to,
          success: result.success,
          message_id: result.message_id,
          error: result.error
        });

        // Add delay to respect rate limits (Twilio allows 1 message per second)
        await this.delay(1100); // 1.1 second delay between messages

      } catch (error) {
        logger.error(`📱 Failed to send bulk WhatsApp to ${message.to}:`, error);
        results.push({
          to: message.to,
          success: false,
          error: error.message
        });
      }
    }

    return {
      total: messages.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Add country code if missing (assume Sudan +249)
    if (!cleaned.startsWith('249') && !cleaned.startsWith('1')) {
      if (cleaned.startsWith('0')) {
        cleaned = '249' + cleaned.substring(1);
      } else if (cleaned.length === 9) {
        cleaned = '249' + cleaned;
      }
    }

    // Return in WhatsApp format
    return `whatsapp:+${cleaned}`;
  }

  formatMessage(body) {
    // WhatsApp has a 1600 character limit
    if (body.length > 1600) {
      return body.substring(0, 1597) + '...';
    }

    // Add WhatsApp-friendly formatting
    return body
      .replace(/\*\*(.*?)\*\*/g, '*$1*') // Bold formatting
      .replace(/__(.*?)__/g, '_$1_')     // Italic formatting
      .replace(/~~(.*?)~~/g, '~$1~');    // Strikethrough formatting
  }

  getFirstMediaUrl(attachments) {
    for (const attachment of attachments) {
      if (typeof attachment === 'string') {
        return attachment;
      }
      
      if (attachment.url) {
        // WhatsApp supports images, documents, audio, and video
        const supportedTypes = ['image', 'document', 'audio', 'video', 'pdf'];
        const fileType = attachment.type || this.getFileTypeFromUrl(attachment.url);
        
        if (supportedTypes.includes(fileType)) {
          return attachment.url;
        }
      }
    }
    return null;
  }

  getFileTypeFromUrl(url) {
    const extension = url.split('.').pop().toLowerCase();
    const typeMap = {
      'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image',
      'pdf': 'document', 'doc': 'document', 'docx': 'document', 'txt': 'document',
      'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'm4a': 'audio',
      'mp4': 'video', 'avi': 'video', 'mov': 'video', 'webm': 'video'
    };
    return typeMap[extension] || 'document';
  }

  async verifyConnection() {
    try {
      if (!this.isConfigured) {
        return { success: false, error: 'WhatsApp service not configured' };
      }

      if (process.env.NODE_ENV === 'development' || process.env.WHATSAPP_MOCK_MODE === 'true') {
        return { success: true, message: 'WhatsApp service in mock mode' };
      }

      // Test connection by fetching account info
      const account = await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
      return { 
        success: true, 
        message: 'WhatsApp service connection verified',
        account_status: account.status
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Template-based WhatsApp sending
  async sendTemplateWhatsApp(templateName, to, templateData) {
    const templates = {
      order_confirmation: {
        body: `Hello {{customer_name}}! 🦷

Thank you for your order! Your order *{{order_number}}* has been confirmed.

📦 *Order Details:*
{{order_details}}

💰 *Total:* {{total_amount}} {{currency}}
💳 *Payment:* {{payment_method}}

We'll notify you once your order is shipped.

Thank you for choosing Dental Store Sudan! 🇸🇩`
      },
      
      payment_confirmation: {
        body: `Hello {{customer_name}}! 💳

Your payment of *{{amount}} {{currency}}* for order *{{order_number}}* has been confirmed.

✅ Payment successful!
🔢 Transaction ID: {{transaction_id}}

Your order is now being prepared for shipment.

Thank you for choosing our dental store! 🦷`
      },
      
      shipment_notification: {
        body: `Hello {{customer_name}}! 📦

Great news! Your order *{{order_number}}* has been shipped.

🚚 *Tracking:* {{tracking_number}}
📅 *Estimated Delivery:* {{delivery_date}}

📍 *Shipping to:*
{{shipping_address}}

Track your package with the number above.

Thank you for choosing Dental Store Sudan! 🦷🇸🇩`
      },
      
      appointment_reminder: {
        body: `Hello {{customer_name}}! 📅

*Appointment Reminder*

You have a dental appointment *tomorrow* at {{appointment_time}}.

🏥 *Location:* {{clinic_address}}
👨‍⚕️ *Doctor:* {{doctor_name}}
📞 *Contact:* {{clinic_phone}}

Please arrive 15 minutes early. Call us if you need to reschedule.

See you soon! 🦷✨`
      },
      
      low_stock_alert: {
        body: `🚨 *Low Stock Alert*

Product: *{{product_name}}*
SKU: {{sku}}
Current Stock: *{{current_stock}}*
Minimum: {{min_threshold}}

Please reorder soon to avoid stockouts.

- Inventory System 📊`
      }
    };

    const template = templates[templateName];
    if (!template) {
      throw new Error(`WhatsApp template ${templateName} not found`);
    }

    // Replace template variables
    let body = template.body;

    Object.keys(templateData).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      body = body.replace(regex, templateData[key]);
    });

    return await this.sendWhatsApp({ to, body });
  }

  // Sudan-specific phone number validation
  validateSudanesePhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Sudan phone number patterns
    const patterns = [
      /^249[0-9]{9}$/,     // +249 followed by 9 digits
      /^0[0-9]{9}$/,       // 0 followed by 9 digits (local format)
      /^[0-9]{9}$/         // 9 digits (mobile without leading 0)
    ];

    return patterns.some(pattern => pattern.test(cleaned));
  }

  // Get WhatsApp Business API status
  async getBusinessApiStatus() {
    try {
      if (!this.isConfigured || process.env.WHATSAPP_MOCK_MODE === 'true') {
        return {
          status: 'mock',
          message: 'Running in mock mode'
        };
      }

      // Check if using Twilio WhatsApp Business API
      if (this.client) {
        const account = await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        return {
          status: 'active',
          provider: 'twilio',
          account_status: account.status,
          from_number: this.fromNumber
        };
      }

      return {
        status: 'inactive',
        message: 'WhatsApp service not configured'
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new WhatsAppService();
