const notificationModel = require('../models/notificationModel');
const emailService = require('../services/emailService');
const whatsappService = require('../services/whatsappService');
const smsService = require('../services/smsService');
const templateService = require('../services/templateService');
const { AppError } = require('../middlewares/errorHandler');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'notification-controller' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const notificationController = {
  // Send a single notification
  async sendNotification(req, res, next) {
    try {
      const {
        channel,
        to_contact,
        subject,
        body,
        attachments = [],
        related_entity,
        related_id,
        template_id,
        template_data = {},
        priority = 5
      } = req.body;

      const userId = req.user?.user_id || req.user?.id;

      let finalSubject = subject;
      let finalBody = body;

      // If template_id is provided, render the template
      if (template_id) {
        try {
          const renderedTemplate = await templateService.renderTemplate(template_id, template_data);
          finalSubject = renderedTemplate.subject || subject;
          finalBody = renderedTemplate.body;
        } catch (templateError) {
          logger.warn(`Template rendering failed for ${template_id}:`, templateError.message);
          // Continue with provided subject/body if template fails
        }
      }

      // Create notification record
      const notification = await notificationModel.createNotification({
        channel,
        to_contact,
        subject: finalSubject,
        body: finalBody,
        attachments,
        related_entity,
        related_id,
        created_by: userId,
        template_id,
        template_data,
        priority
      });

      // Send notification immediately (async)
      setImmediate(async () => {
        try {
          await this.processNotification(notification);
        } catch (error) {
          logger.error(`Failed to process notification ${notification.id}:`, error);
        }
      });

      res.status(201).json({
        success: true,
        message: 'Notification queued successfully',
        data: {
          notification_id: notification.id,
          channel: notification.channel,
          status: notification.status,
          created_at: notification.created_at
        }
      });

    } catch (error) {
      logger.error('Error sending notification:', error);
      next(new AppError('Failed to send notification', 500));
    }
  },

  // Send bulk notifications
  async sendBulkNotifications(req, res, next) {
    try {
      const {
        notifications,
        template_id,
        template_data = {}
      } = req.body;

      if (!Array.isArray(notifications) || notifications.length === 0) {
        return next(new AppError('Notifications array is required', 400));
      }

      const userId = req.user?.user_id || req.user?.id;
      const results = [];

      for (const notificationData of notifications) {
        try {
          const notification = await notificationModel.createNotification({
            ...notificationData,
            created_by: userId,
            template_id,
            template_data
          });

          results.push({
            notification_id: notification.id,
            status: 'queued',
            to_contact: notification.to_contact
          });

          // Process notification async
          setImmediate(async () => {
            try {
              await this.processNotification(notification);
            } catch (error) {
              logger.error(`Failed to process bulk notification ${notification.id}:`, error);
            }
          });

        } catch (error) {
          logger.error('Error creating bulk notification:', error);
          results.push({
            status: 'failed',
            error: error.message,
            to_contact: notificationData.to_contact
          });
        }
      }

      res.status(201).json({
        success: true,
        message: `Bulk notifications processed: ${results.length} total`,
        data: {
          total: results.length,
          queued: results.filter(r => r.status === 'queued').length,
          failed: results.filter(r => r.status === 'failed').length,
          results
        }
      });

    } catch (error) {
      logger.error('Error sending bulk notifications:', error);
      next(new AppError('Failed to send bulk notifications', 500));
    }
  },

  // Get notifications with filtering
  async getNotifications(req, res, next) {
    try {
      const {
        channel,
        status,
        related_entity,
        related_id,
        date_from,
        date_to,
        limit = 50,
        offset = 0
      } = req.query;

      const filters = {
        channel,
        status,
        related_entity,
        related_id: related_id ? parseInt(related_id) : undefined,
        date_from,
        date_to,
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      // If not admin/manager, only show user's own notifications
      if (!['admin', 'manager'].includes(req.user.role)) {
        filters.created_by = req.user.user_id || req.user.id;
      }

      const notifications = await notificationModel.getNotifications(filters);

      res.status(200).json({
        success: true,
        data: {
          notifications,
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: notifications.length
          }
        }
      });

    } catch (error) {
      logger.error('Error getting notifications:', error);
      next(new AppError('Failed to retrieve notifications', 500));
    }
  },

  // Get single notification
  async getNotification(req, res, next) {
    try {
      const { id } = req.params;
      const notification = await notificationModel.getNotificationById(id);

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      // Check authorization - users can only see their own notifications
      if (!['admin', 'manager'].includes(req.user.role) && 
          notification.created_by !== (req.user.user_id || req.user.id)) {
        return next(new AppError('Access denied', 403));
      }

      res.status(200).json({
        success: true,
        data: notification
      });

    } catch (error) {
      logger.error('Error getting notification:', error);
      next(new AppError('Failed to retrieve notification', 500));
    }
  },

  // Retry failed notification
  async retryNotification(req, res, next) {
    try {
      const { id } = req.params;
      const notification = await notificationModel.getNotificationById(id);

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      if (notification.status !== 'failed') {
        return next(new AppError('Only failed notifications can be retried', 400));
      }

      if (notification.retry_count >= notification.max_retries) {
        return next(new AppError('Maximum retry attempts exceeded', 400));
      }

      // Reset status to pending and add to queue
      await notificationModel.updateNotificationStatus(id, 'pending');
      await notificationModel.addToQueue(id, 1); // High priority for retries

      // Process immediately
      setImmediate(async () => {
        try {
          await this.processNotification(notification);
        } catch (error) {
          logger.error(`Failed to retry notification ${id}:`, error);
        }
      });

      res.status(200).json({
        success: true,
        message: 'Notification retry initiated',
        data: {
          notification_id: id,
          retry_count: notification.retry_count + 1
        }
      });

    } catch (error) {
      logger.error('Error retrying notification:', error);
      next(new AppError('Failed to retry notification', 500));
    }
  },

  // Get notification statistics
  async getNotificationStats(req, res, next) {
    try {
      const { days = 30 } = req.query;
      const stats = await notificationModel.getNotificationStats(parseInt(days));

      // Group stats by channel and calculate totals
      const channelStats = {};
      let totalNotifications = 0;
      let totalCost = 0;

      stats.forEach(stat => {
        if (!channelStats[stat.channel]) {
          channelStats[stat.channel] = {
            channel: stat.channel,
            total: 0,
            sent: 0,
            failed: 0,
            pending: 0,
            cost: 0
          };
        }

        channelStats[stat.channel][stat.status] = parseInt(stat.count);
        channelStats[stat.channel].total += parseInt(stat.count);
        channelStats[stat.channel].cost += parseFloat(stat.total_cost || 0);

        totalNotifications += parseInt(stat.count);
        totalCost += parseFloat(stat.total_cost || 0);
      });

      res.status(200).json({
        success: true,
        data: {
          period_days: parseInt(days),
          total_notifications: totalNotifications,
          total_cost_usd: totalCost,
          channels: Object.values(channelStats),
          generated_at: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error getting notification stats:', error);
      next(new AppError('Failed to retrieve notification statistics', 500));
    }
  },

  // Get user notification preferences
  async getUserPreferences(req, res, next) {
    try {
      const { userId } = req.params;

      // Users can only access their own preferences
      if (req.user.role !== 'admin' && (req.user.user_id || req.user.id) !== parseInt(userId)) {
        return next(new AppError('Access denied', 403));
      }

      const query = `
        SELECT channel, notification_type, is_enabled
        FROM notification_preferences
        WHERE user_id = $1
        ORDER BY channel, notification_type
      `;

      const result = await notificationModel.pool.query(query, [userId]);

      res.status(200).json({
        success: true,
        data: {
          user_id: parseInt(userId),
          preferences: result.rows
        }
      });

    } catch (error) {
      logger.error('Error getting user preferences:', error);
      next(new AppError('Failed to retrieve user preferences', 500));
    }
  },

  // Update user notification preferences
  async updateUserPreferences(req, res, next) {
    try {
      const { userId } = req.params;
      const { preferences } = req.body;

      // Users can only update their own preferences
      if (req.user.role !== 'admin' && (req.user.user_id || req.user.id) !== parseInt(userId)) {
        return next(new AppError('Access denied', 403));
      }

      if (!Array.isArray(preferences)) {
        return next(new AppError('Preferences must be an array', 400));
      }

      // Update preferences
      for (const pref of preferences) {
        const { channel, notification_type, is_enabled } = pref;

        const query = `
          INSERT INTO notification_preferences (user_id, channel, notification_type, is_enabled)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id, channel, notification_type)
          DO UPDATE SET is_enabled = $4, updated_at = NOW()
        `;

        await notificationModel.pool.query(query, [userId, channel, notification_type, is_enabled]);
      }

      res.status(200).json({
        success: true,
        message: 'User preferences updated successfully',
        data: {
          user_id: parseInt(userId),
          updated_preferences: preferences.length
        }
      });

    } catch (error) {
      logger.error('Error updating user preferences:', error);
      next(new AppError('Failed to update user preferences', 500));
    }
  },

  // Get notification providers
  async getProviders(req, res, next) {
    try {
      const query = `
        SELECT id, name, channel, is_active, is_default, rate_limit_per_minute, cost_per_message
        FROM notification_providers
        ORDER BY channel, name
      `;

      const result = await notificationModel.pool.query(query);

      res.status(200).json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      logger.error('Error getting providers:', error);
      next(new AppError('Failed to retrieve providers', 500));
    }
  },

  // Update notification provider
  async updateProvider(req, res, next) {
    try {
      const { id } = req.params;
      const { is_active, is_default, config, rate_limit_per_minute, cost_per_message } = req.body;

      const query = `
        UPDATE notification_providers
        SET is_active = COALESCE($2, is_active),
            is_default = COALESCE($3, is_default),
            config = COALESCE($4, config),
            rate_limit_per_minute = COALESCE($5, rate_limit_per_minute),
            cost_per_message = COALESCE($6, cost_per_message),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;

      const result = await notificationModel.pool.query(query, [
        id, is_active, is_default, config ? JSON.stringify(config) : null,
        rate_limit_per_minute, cost_per_message
      ]);

      if (result.rows.length === 0) {
        return next(new AppError('Provider not found', 404));
      }

      res.status(200).json({
        success: true,
        message: 'Provider updated successfully',
        data: result.rows[0]
      });

    } catch (error) {
      logger.error('Error updating provider:', error);
      next(new AppError('Failed to update provider', 500));
    }
  },

  // Process a notification (internal method)
  async processNotification(notification) {
    try {
      logger.info(`Processing notification ${notification.id} via ${notification.channel}`);

      let result;
      switch (notification.channel) {
        case 'email':
          result = await emailService.sendEmail({
            to: notification.to_contact,
            subject: notification.subject,
            body: notification.body,
            attachments: JSON.parse(notification.attachments || '[]')
          });
          break;

        case 'whatsapp':
          result = await whatsappService.sendWhatsApp({
            to: notification.to_contact,
            body: notification.body,
            attachments: JSON.parse(notification.attachments || '[]')
          });
          break;

        case 'sms':
          result = await smsService.sendSMS({
            to: notification.to_contact,
            body: notification.body
          });
          break;

        default:
          throw new Error(`Unsupported notification channel: ${notification.channel}`);
      }

      // Update notification status based on result
      if (result.success) {
        await notificationModel.updateNotificationStatus(
          notification.id,
          'sent',
          null,
          {
            provider_message_id: result.message_id,
            cost_usd: result.cost
          }
        );
        logger.info(`Notification ${notification.id} sent successfully`);
      } else {
        throw new Error(result.error || 'Unknown error');
      }

    } catch (error) {
      logger.error(`Error processing notification ${notification.id}:`, error);

      // Update notification as failed
      await notificationModel.updateNotificationStatus(
        notification.id,
        'failed',
        error.message
      );

      // Schedule retry if within retry limits
      if (notification.retry_count < notification.max_retries) {
        const nextRetryAt = new Date(Date.now() + (Math.pow(2, notification.retry_count) * 60000)); // Exponential backoff
        await notificationModel.incrementRetryCount(notification.id, nextRetryAt);
        await notificationModel.addToQueue(notification.id, 3, nextRetryAt); // Medium priority for retries
      }

      throw error;
    }
  },

  // Webhook handlers for delivery status updates
  async handleSendGridWebhook(req, res) {
    try {
      const events = req.body;

      for (const event of events) {
        const { sg_message_id, event: eventType, timestamp } = event;

        if (sg_message_id) {
          let status;
          let deliveredAt = null;

          switch (eventType) {
            case 'delivered':
              status = 'delivered';
              deliveredAt = new Date(timestamp * 1000);
              break;
            case 'bounce':
            case 'dropped':
              status = 'failed';
              break;
            case 'open':
              // Update read timestamp but don't change status
              await notificationModel.pool.query(
                'UPDATE notifications_log SET read_at = $1 WHERE provider_message_id = $2',
                [new Date(timestamp * 1000), sg_message_id]
              );
              continue;
            default:
              continue;
          }

          await notificationModel.updateNotificationStatus(
            null, // We don't have the internal ID, so we'll update by provider_message_id
            status,
            null,
            { delivered_at: deliveredAt }
          );
        }
      }

      res.status(200).json({ success: true });

    } catch (error) {
      logger.error('Error handling SendGrid webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },

  async handleTwilioWebhook(req, res) {
    try {
      const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;

      if (MessageSid) {
        let status;
        let deliveredAt = null;

        switch (MessageStatus) {
          case 'delivered':
            status = 'delivered';
            deliveredAt = new Date();
            break;
          case 'failed':
          case 'undelivered':
            status = 'failed';
            break;
          case 'read':
            // Update read timestamp
            await notificationModel.pool.query(
              'UPDATE notifications_log SET read_at = NOW() WHERE provider_message_id = $1',
              [MessageSid]
            );
            return res.status(200).json({ success: true });
          default:
            return res.status(200).json({ success: true });
        }

        await notificationModel.updateNotificationStatus(
          null,
          status,
          ErrorMessage,
          { delivered_at: deliveredAt }
        );
      }

      res.status(200).json({ success: true });

    } catch (error) {
      logger.error('Error handling Twilio webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
};

module.exports = notificationController;
