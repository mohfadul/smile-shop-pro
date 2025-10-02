const emailService = require('./emailService');
const { pool } = require('../models/notificationModel');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'email-automation' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class EmailAutomationService {
  constructor() {
    this.sequences = new Map();
    this.initializeSequences();
  }

  initializeSequences() {
    // Order Confirmation Sequence
    this.sequences.set('order_confirmation', {
      name: 'Order Confirmation Sequence',
      trigger: 'order.created',
      steps: [
        {
          delay: 0, // Immediate
          template: 'order_confirmation_email',
          subject: 'Order Confirmation - {{order_number}}',
          condition: (data) => data.order_status === 'confirmed'
        },
        {
          delay: 2 * 60 * 60 * 1000, // 2 hours
          template: 'order_processing_email',
          subject: 'Your Order is Being Processed - {{order_number}}',
          condition: (data) => data.order_status !== 'cancelled'
        },
        {
          delay: 24 * 60 * 60 * 1000, // 24 hours
          template: 'order_status_update',
          subject: 'Order Status Update - {{order_number}}',
          condition: (data) => data.order_status === 'processing'
        }
      ]
    });

    // Payment Reminder Sequence
    this.sequences.set('payment_reminder', {
      name: 'Payment Reminder Sequence',
      trigger: 'order.payment_pending',
      steps: [
        {
          delay: 60 * 60 * 1000, // 1 hour
          template: 'payment_reminder_gentle',
          subject: 'Complete Your Order Payment - {{order_number}}',
          condition: (data) => data.payment_status === 'pending'
        },
        {
          delay: 24 * 60 * 60 * 1000, // 24 hours
          template: 'payment_reminder_urgent',
          subject: 'Payment Required - Order {{order_number}} Will Expire Soon',
          condition: (data) => data.payment_status === 'pending'
        },
        {
          delay: 72 * 60 * 60 * 1000, // 72 hours
          template: 'order_cancellation_notice',
          subject: 'Order Cancelled Due to Non-Payment - {{order_number}}',
          condition: (data) => data.payment_status === 'pending'
        }
      ]
    });

    // Customer Onboarding Sequence
    this.sequences.set('customer_onboarding', {
      name: 'Customer Onboarding Sequence',
      trigger: 'user.registered',
      steps: [
        {
          delay: 0, // Immediate
          template: 'welcome_email',
          subject: 'Welcome to Dental Store Sudan! 🦷',
          condition: (data) => data.user_role === 'customer'
        },
        {
          delay: 24 * 60 * 60 * 1000, // 24 hours
          template: 'getting_started_guide',
          subject: 'Getting Started with Your Dental Supplies',
          condition: (data) => !data.first_order_placed
        },
        {
          delay: 7 * 24 * 60 * 60 * 1000, // 7 days
          template: 'first_order_incentive',
          subject: 'Special Discount for Your First Order! 🎉',
          condition: (data) => !data.first_order_placed
        }
      ]
    });

    // Post-Purchase Follow-up Sequence
    this.sequences.set('post_purchase', {
      name: 'Post-Purchase Follow-up',
      trigger: 'order.delivered',
      steps: [
        {
          delay: 24 * 60 * 60 * 1000, // 24 hours after delivery
          template: 'delivery_confirmation',
          subject: 'How was your delivery experience?',
          condition: (data) => data.order_status === 'delivered'
        },
        {
          delay: 7 * 24 * 60 * 60 * 1000, // 7 days after delivery
          template: 'review_request',
          subject: 'Share Your Experience - Review Your Recent Purchase',
          condition: (data) => !data.review_submitted
        },
        {
          delay: 30 * 24 * 60 * 60 * 1000, // 30 days after delivery
          template: 'replenishment_reminder',
          subject: 'Time to Restock Your Dental Supplies?',
          condition: (data) => data.product_category === 'consumables'
        }
      ]
    });

    // Abandoned Cart Sequence
    this.sequences.set('abandoned_cart', {
      name: 'Abandoned Cart Recovery',
      trigger: 'cart.abandoned',
      steps: [
        {
          delay: 60 * 60 * 1000, // 1 hour
          template: 'cart_reminder_gentle',
          subject: 'You left something in your cart',
          condition: (data) => data.cart_value > 0
        },
        {
          delay: 24 * 60 * 60 * 1000, // 24 hours
          template: 'cart_reminder_discount',
          subject: 'Complete your purchase and save 10%!',
          condition: (data) => data.cart_value > 50
        },
        {
          delay: 72 * 60 * 60 * 1000, // 72 hours
          template: 'cart_final_reminder',
          subject: 'Last chance - Your cart expires soon',
          condition: (data) => data.cart_value > 0
        }
      ]
    });

    // Professional Customer Sequence
    this.sequences.set('professional_onboarding', {
      name: 'Professional Customer Onboarding',
      trigger: 'user.verified_professional',
      steps: [
        {
          delay: 0, // Immediate
          template: 'professional_welcome',
          subject: 'Welcome to Our Professional Program! 🏥',
          condition: (data) => data.user_role === 'professional'
        },
        {
          delay: 24 * 60 * 60 * 1000, // 24 hours
          template: 'professional_benefits',
          subject: 'Exclusive Benefits for Dental Professionals',
          condition: (data) => data.user_role === 'professional'
        },
        {
          delay: 7 * 24 * 60 * 60 * 1000, // 7 days
          template: 'bulk_order_invitation',
          subject: 'Special Bulk Pricing Available',
          condition: (data) => data.user_role === 'professional'
        }
      ]
    });

    logger.info(`Initialized ${this.sequences.size} email automation sequences`);
  }

  async triggerSequence(sequenceName, triggerData, recipientEmail) {
    try {
      const sequence = this.sequences.get(sequenceName);
      if (!sequence) {
        logger.warn(`Unknown sequence: ${sequenceName}`);
        return;
      }

      logger.info(`Triggering sequence: ${sequenceName} for ${recipientEmail}`);

      // Create sequence execution record
      const sequenceExecution = await this.createSequenceExecution(
        sequenceName,
        recipientEmail,
        triggerData
      );

      // Schedule all steps
      for (let i = 0; i < sequence.steps.length; i++) {
        const step = sequence.steps[i];
        const scheduledAt = new Date(Date.now() + step.delay);

        await this.scheduleSequenceStep(
          sequenceExecution.id,
          i,
          step,
          triggerData,
          recipientEmail,
          scheduledAt
        );
      }

      logger.info(`Scheduled ${sequence.steps.length} steps for sequence: ${sequenceName}`);
      return sequenceExecution;

    } catch (error) {
      logger.error(`Error triggering sequence ${sequenceName}:`, error);
      throw error;
    }
  }

  async createSequenceExecution(sequenceName, recipientEmail, triggerData) {
    const query = `
      INSERT INTO email_sequence_executions (
        sequence_name, recipient_email, trigger_data, status, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `;

    const result = await pool.query(query, [
      sequenceName,
      recipientEmail,
      JSON.stringify(triggerData),
      'active'
    ]);

    return result.rows[0];
  }

  async scheduleSequenceStep(executionId, stepIndex, step, triggerData, recipientEmail, scheduledAt) {
    const query = `
      INSERT INTO email_sequence_steps (
        execution_id, step_index, template_name, subject_template, 
        scheduled_at, trigger_data, recipient_email, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await pool.query(query, [
      executionId,
      stepIndex,
      step.template,
      step.subject,
      scheduledAt,
      JSON.stringify(triggerData),
      recipientEmail,
      'scheduled'
    ]);

    return result.rows[0];
  }

  async processScheduledSteps() {
    try {
      // Get steps that are due to be sent
      const query = `
        SELECT * FROM email_sequence_steps 
        WHERE status = 'scheduled' 
        AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT 50
      `;

      const result = await pool.query(query);
      const steps = result.rows;

      logger.info(`Processing ${steps.length} scheduled email steps`);

      for (const step of steps) {
        await this.executeSequenceStep(step);
      }

    } catch (error) {
      logger.error('Error processing scheduled steps:', error);
    }
  }

  async executeSequenceStep(step) {
    try {
      // Mark as processing
      await pool.query(
        'UPDATE email_sequence_steps SET status = $1, processing_started_at = NOW() WHERE id = $2',
        ['processing', step.id]
      );

      const triggerData = JSON.parse(step.trigger_data);
      const sequence = this.sequences.get(step.sequence_name);
      
      if (!sequence) {
        throw new Error(`Sequence not found: ${step.sequence_name}`);
      }

      const sequenceStep = sequence.steps[step.step_index];
      
      // Check condition if exists
      if (sequenceStep.condition && !sequenceStep.condition(triggerData)) {
        logger.info(`Skipping step ${step.id} - condition not met`);
        await pool.query(
          'UPDATE email_sequence_steps SET status = $1, completed_at = NOW() WHERE id = $2',
          ['skipped', step.id]
        );
        return;
      }

      // Render subject with data
      const subject = this.renderTemplate(step.subject_template, triggerData);

      // Send email using template
      const result = await emailService.sendTemplateEmail(
        step.template_name,
        step.recipient_email,
        {
          ...triggerData,
          subject: subject
        }
      );

      if (result.success) {
        await pool.query(
          'UPDATE email_sequence_steps SET status = $1, completed_at = NOW(), message_id = $2 WHERE id = $3',
          ['sent', result.message_id, step.id]
        );
        logger.info(`Successfully sent sequence step ${step.id}`);
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      logger.error(`Error executing sequence step ${step.id}:`, error);
      
      // Mark as failed
      await pool.query(
        'UPDATE email_sequence_steps SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
        ['failed', error.message, step.id]
      );
    }
  }

  renderTemplate(template, data) {
    let rendered = template;
    
    // Simple template rendering - replace {{variable}} with data
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, data[key] || '');
    });

    return rendered;
  }

  async cancelSequence(executionId) {
    try {
      // Cancel the execution
      await pool.query(
        'UPDATE email_sequence_executions SET status = $1, cancelled_at = NOW() WHERE id = $2',
        ['cancelled', executionId]
      );

      // Cancel pending steps
      await pool.query(
        'UPDATE email_sequence_steps SET status = $1 WHERE execution_id = $2 AND status = $3',
        ['cancelled', executionId, 'scheduled']
      );

      logger.info(`Cancelled sequence execution: ${executionId}`);

    } catch (error) {
      logger.error(`Error cancelling sequence ${executionId}:`, error);
      throw error;
    }
  }

  async getSequenceStats(sequenceName, days = 30) {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_executions,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
          AVG(
            CASE WHEN status = 'completed' 
            THEN EXTRACT(EPOCH FROM (completed_at - created_at))/3600 
            END
          ) as avg_completion_hours
        FROM email_sequence_executions 
        WHERE sequence_name = $1 
        AND created_at >= NOW() - INTERVAL '${days} days'
      `;

      const result = await pool.query(query, [sequenceName]);
      return result.rows[0];

    } catch (error) {
      logger.error(`Error getting sequence stats for ${sequenceName}:`, error);
      throw error;
    }
  }

  // Start the processor (call this on service startup)
  startProcessor() {
    // Process scheduled steps every minute
    setInterval(() => {
      this.processScheduledSteps();
    }, 60 * 1000);

    logger.info('Email automation processor started');
  }
}

module.exports = new EmailAutomationService();
