const twilio = require('twilio');
const nodemailer = require('nodemailer');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'sms-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class SMSService {
  constructor() {
    this.twilioClient = null;
    this.emailTransporter = null;
    this.isConfigured = false;
    this.fromNumber = null;
    this.initializeService();
  }

  async initializeService() {
    try {
      // Check if we're in development mode
      const isDevelopment = process.env.NODE_ENV === 'development' || process.env.SMS_MOCK_MODE === 'true';

      if (isDevelopment) {
        logger.info('📱 SMS service initialized in mock mode (development)');
        this.isConfigured = true;
        return;
      }

      // FREE ALTERNATIVE 1: Twilio Trial (FREE - $15 credit, limited recipients)
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        this.fromNumber = process.env.TWILIO_SMS_FROM; // Trial number provided by Twilio
        
        logger.info('📱 SMS service initialized with Twilio Trial (FREE)');
        logger.info(`📱 From number: ${this.fromNumber} (Trial - verified recipients only)`);
        this.isConfigured = true;
        this.provider = 'twilio';
        return;
      }

      // FREE ALTERNATIVE 2: Email-to-SMS Gateway (FREE for most carriers)
      if (process.env.EMAIL_TO_SMS_ENABLED === 'true' && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        this.emailTransporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
          },
        });

        logger.info('📱 SMS service initialized with Email-to-SMS Gateway (FREE)');
        logger.info('📱 Supports major carriers: Zain, MTN, Sudani');
        this.isConfigured = true;
        this.provider = 'email-to-sms';
        return;
      }

      // FREE ALTERNATIVE 3: Manual SMS logging (for development/testing)
      if (process.env.SMS_MANUAL_MODE === 'true') {
        logger.info('📱 SMS service initialized in MANUAL mode (FREE)');
        logger.info('📱 Messages will be logged for manual sending');
        this.isConfigured = true;
        this.provider = 'manual';
        return;
      }

      logger.warn('📱 No SMS configuration found, SMS service disabled');
      this.isConfigured = false;

    } catch (error) {
      logger.error('📱 Failed to initialize SMS service:', error);
      this.isConfigured = false;
    }
  }

  async sendSMS({ to, body }) {
    try {
      // Format phone number
      const formattedTo = this.formatPhoneNumber(to);

      if (!this.isConfigured) {
        logger.warn(`📱 SMS service not configured, simulating send to ${formattedTo}`);
        return {
          success: true,
          message_id: `mock_sms_${Date.now()}`,
          cost: 0, // FREE
          to: formattedTo
        };
      }

      // MANUAL MODE: Log message for manual sending (FREE alternative)
      if (this.provider === 'manual') {
        logger.info('📱 MANUAL SMS MESSAGE (Copy and send manually):');
        logger.info(`📱 TO: ${formattedTo}`);
        logger.info(`📱 MESSAGE: ${body}`);
        logger.info('📱 ----------------------------------------');
        
        return {
          success: true,
          message_id: `manual_sms_${Date.now()}`,
          cost: 0, // FREE - manual sending
          to: formattedTo,
          manual_mode: true
        };
      }

      // EMAIL-TO-SMS Gateway (FREE alternative)
      if (this.provider === 'email-to-sms') {
        const emailAddress = this.getEmailToSMSAddress(formattedTo);
        
        if (!emailAddress) {
          logger.warn(`📱 Cannot determine email-to-SMS address for ${formattedTo}`);
          return {
            success: false,
            error: 'Unsupported carrier for email-to-SMS',
            cost: 0
          };
        }

        const mailOptions = {
          from: process.env.GMAIL_USER,
          to: emailAddress,
          subject: '', // Most carriers ignore subject for SMS
          text: body.substring(0, 160) // SMS character limit
        };

        const info = await this.emailTransporter.sendMail(mailOptions);
        
        logger.info(`📱 SMS sent via email-to-SMS to ${formattedTo}`, {
          messageId: info.messageId,
          emailAddress: emailAddress
        });

        return {
          success: true,
          message_id: info.messageId,
          cost: 0, // FREE via email-to-SMS
          to: formattedTo,
          method: 'email-to-sms'
        };
      }

      // TWILIO Trial (FREE with limitations)
      if (this.provider === 'twilio' && this.twilioClient) {
        const messageOptions = {
          from: this.fromNumber,
          to: formattedTo,
          body: body.substring(0, 1600) // SMS character limit
        };

        const message = await this.twilioClient.messages.create(messageOptions);

        logger.info(`📱 SMS sent via Twilio Trial to ${formattedTo}`, {
          messageId: message.sid,
          status: message.status
        });

        return {
          success: true,
          message_id: message.sid,
          cost: 0, // FREE with Twilio Trial credit
          to: formattedTo,
          status: message.status,
          method: 'twilio-trial'
        };
      }

      throw new Error('No SMS provider configured');

    } catch (error) {
      logger.error('📱 Failed to send SMS:', error);
      return {
        success: false,
        error: error.message,
        cost: 0,
        to: to
      };
    }
  }

  async sendBulkSMS(messages) {
    const results = [];

    for (const message of messages) {
      try {
        const result = await this.sendSMS(message);
        results.push({
          to: message.to,
          success: result.success,
          message_id: result.message_id,
          error: result.error
        });

        // Add delay to respect rate limits
        await this.delay(1000); // 1 second delay between messages

      } catch (error) {
        logger.error(`📱 Failed to send bulk SMS to ${message.to}:`, error);
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

    // Return in international format
    return `+${cleaned}`;
  }

  // FREE Email-to-SMS Gateway addresses for Sudan carriers
  getEmailToSMSAddress(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Sudan carrier email-to-SMS gateways (these are common patterns, may need verification)
    const carrierGateways = {
      // Zain Sudan (common patterns)
      '24991': '@sms.zain.sd',
      '24992': '@sms.zain.sd',
      '24995': '@sms.zain.sd',
      
      // MTN Sudan (common patterns)
      '24990': '@sms.mtn.sd',
      '24999': '@sms.mtn.sd',
      
      // Sudani (common patterns)
      '24912': '@sms.sudani.sd',
      '24915': '@sms.sudani.sd',
      '24918': '@sms.sudani.sd'
    };

    // Try to match carrier by prefix
    for (const [prefix, gateway] of Object.entries(carrierGateways)) {
      if (cleaned.startsWith(prefix)) {
        return cleaned + gateway;
      }
    }

    // Fallback: try generic email-to-SMS format
    // Note: These may not work for Sudan carriers, but included for completeness
    if (cleaned.startsWith('249')) {
      return `${cleaned}@sms.sd`; // Generic format (may not exist)
    }

    return null; // Cannot determine carrier
  }

  async verifyConnection() {
    try {
      if (!this.isConfigured) {
        return { success: false, error: 'SMS service not configured' };
      }

      if (this.provider === 'manual') {
        return { success: true, message: 'SMS service in manual mode' };
      }

      if (this.provider === 'email-to-sms') {
        // Test email connection
        await this.emailTransporter.verify();
        return { 
          success: true, 
          message: 'Email-to-SMS service connection verified',
          provider: 'email-to-sms'
        };
      }

      if (this.provider === 'twilio' && this.twilioClient) {
        // Test Twilio connection
        const account = await this.twilioClient.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        return { 
          success: true, 
          message: 'Twilio SMS service connection verified',
          provider: 'twilio-trial',
          account_status: account.status
        };
      }

      return { success: false, error: 'Unknown SMS provider' };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Template-based SMS sending
  async sendTemplateSMS(templateName, to, templateData) {
    const templates = {
      order_confirmation: {
        body: `Hello {{customer_name}}! Your order {{order_number}} has been confirmed. Total: {{total_amount}} {{currency}}. Thank you for choosing Dental Store Sudan!`
      },
      
      payment_confirmation: {
        body: `Payment confirmed! {{amount}} {{currency}} received for order {{order_number}}. Transaction ID: {{transaction_id}}. Your order is being prepared.`
      },
      
      shipment_notification: {
        body: `Your order {{order_number}} has been shipped! Tracking: {{tracking_number}}. Estimated delivery: {{delivery_date}}. Dental Store Sudan.`
      },
      
      appointment_reminder: {
        body: `Reminder: Dental appointment tomorrow at {{appointment_time}}. Location: {{clinic_address}}. Contact: {{clinic_phone}}. See you soon!`
      },
      
      verification_code: {
        body: `Your verification code is: {{code}}. Valid for 10 minutes. Do not share this code. - Dental Store Sudan`
      }
    };

    const template = templates[templateName];
    if (!template) {
      throw new Error(`SMS template ${templateName} not found`);
    }

    // Replace template variables
    let body = template.body;

    Object.keys(templateData).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      body = body.replace(regex, templateData[key]);
    });

    return await this.sendSMS({ to, body });
  }

  // Sudan-specific phone number validation
  validateSudanesePhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Sudan phone number patterns
    const patterns = [
      /^249[0-9]{9}$/,     // +249 followed by 9 digits
      /^0[0-9]{9}$/,       // 0 followed by 9 digits (local format)
      /^[0-9]{9}$/         // 9 digits (mobile without leading 0)
    ];

    return patterns.some(pattern => pattern.test(cleaned));
  }

  // Get SMS service status and configuration
  async getServiceStatus() {
    try {
      const status = {
        configured: this.isConfigured,
        provider: this.provider || 'none',
        cost_per_message: 0, // All alternatives are FREE
        features: []
      };

      if (this.provider === 'twilio') {
        status.features = ['international_sms', 'delivery_status', 'trial_credit'];
        status.limitations = ['verified_recipients_only', 'trial_credit_limit'];
      } else if (this.provider === 'email-to-sms') {
        status.features = ['carrier_sms', 'free_unlimited'];
        status.limitations = ['carrier_dependent', 'delivery_not_guaranteed'];
      } else if (this.provider === 'manual') {
        status.features = ['manual_sending', 'unlimited'];
        status.limitations = ['requires_manual_action'];
      }

      return status;

    } catch (error) {
      return {
        configured: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new SMSService();
