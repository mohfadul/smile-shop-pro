const { Pool } = require('pg');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'notification-model' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Database connection configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/notificationdb',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
};

// Create connection pool
const pool = new Pool(dbConfig);

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('✅ Database connection successful');
    return result.rows[0];
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    throw error;
  }
};

// Notification CRUD operations
const notificationModel = {
  // Create a new notification
  async createNotification(notificationData) {
    const {
      channel,
      to_contact,
      subject,
      body,
      attachments = [],
      related_entity,
      related_id,
      created_by,
      template_id,
      template_data = {},
      priority = 5
    } = notificationData;

    const query = `
      INSERT INTO notifications_log (
        channel, to_contact, subject, body, attachments, 
        related_entity, related_id, created_by, template_id, template_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      channel, to_contact, subject, body, JSON.stringify(attachments),
      related_entity, related_id, created_by, template_id, JSON.stringify(template_data)
    ];

    try {
      const result = await pool.query(query, values);
      const notification = result.rows[0];

      // Add to queue for processing
      await this.addToQueue(notification.id, priority);

      logger.info(`Created notification ${notification.id} for ${channel} to ${to_contact}`);
      return notification;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  },

  // Get notifications with filtering and pagination
  async getNotifications(filters = {}) {
    const {
      channel,
      status,
      related_entity,
      related_id,
      created_by,
      date_from,
      date_to,
      limit = 50,
      offset = 0
    } = filters;

    let query = `
      SELECT 
        id, channel, to_contact, subject, body, attachments,
        status, error, related_entity, related_id, created_by,
        created_at, sent_at, delivered_at, read_at,
        retry_count, max_retries, template_id, provider,
        provider_message_id, cost_usd
      FROM notifications_log
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 0;

    if (channel) {
      paramCount++;
      query += ` AND channel = $${paramCount}`;
      values.push(channel);
    }

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(status);
    }

    if (related_entity) {
      paramCount++;
      query += ` AND related_entity = $${paramCount}`;
      values.push(related_entity);
    }

    if (related_id) {
      paramCount++;
      query += ` AND related_id = $${paramCount}`;
      values.push(related_id);
    }

    if (created_by) {
      paramCount++;
      query += ` AND created_by = $${paramCount}`;
      values.push(created_by);
    }

    if (date_from) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      values.push(date_from);
    }

    if (date_to) {
      paramCount++;
      query += ` AND created_at <= $${paramCount}`;
      values.push(date_to);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    values.push(limit, offset);

    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting notifications:', error);
      throw error;
    }
  },

  // Get a single notification by ID
  async getNotificationById(id) {
    const query = `
      SELECT 
        id, channel, to_contact, subject, body, attachments,
        status, error, related_entity, related_id, created_by,
        created_at, sent_at, delivered_at, read_at,
        retry_count, max_retries, template_id, template_data,
        provider, provider_message_id, cost_usd
      FROM notifications_log
      WHERE id = $1
    `;

    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting notification by ID:', error);
      throw error;
    }
  },

  // Update notification status
  async updateNotificationStatus(id, status, error = null, providerData = {}) {
    const {
      provider_message_id,
      cost_usd,
      delivered_at,
      read_at
    } = providerData;

    let query = `
      UPDATE notifications_log 
      SET status = $2, error = $3, sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END
    `;

    const values = [id, status, error];
    let paramCount = 3;

    if (provider_message_id) {
      paramCount++;
      query += `, provider_message_id = $${paramCount}`;
      values.push(provider_message_id);
    }

    if (cost_usd) {
      paramCount++;
      query += `, cost_usd = $${paramCount}`;
      values.push(cost_usd);
    }

    if (delivered_at) {
      paramCount++;
      query += `, delivered_at = $${paramCount}`;
      values.push(delivered_at);
    }

    if (read_at) {
      paramCount++;
      query += `, read_at = $${paramCount}`;
      values.push(read_at);
    }

    query += ` WHERE id = $1 RETURNING *`;

    try {
      const result = await pool.query(query, values);
      logger.info(`Updated notification ${id} status to ${status}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating notification status:', error);
      throw error;
    }
  },

  // Increment retry count and set next retry time
  async incrementRetryCount(id, nextRetryAt) {
    const query = `
      UPDATE notifications_log 
      SET retry_count = retry_count + 1, next_retry_at = $2
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [id, nextRetryAt]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error incrementing retry count:', error);
      throw error;
    }
  },

  // Add notification to processing queue
  async addToQueue(notificationId, priority = 5, scheduledAt = new Date()) {
    const query = `
      INSERT INTO notification_queues (notification_id, priority, scheduled_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [notificationId, priority, scheduledAt]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error adding notification to queue:', error);
      throw error;
    }
  },

  // Get next notifications from queue for processing
  async getQueuedNotifications(limit = 10) {
    const query = `
      SELECT 
        nq.id as queue_id,
        nq.notification_id,
        nq.priority,
        nq.scheduled_at,
        nl.channel,
        nl.to_contact,
        nl.subject,
        nl.body,
        nl.attachments,
        nl.template_id,
        nl.template_data,
        nl.retry_count,
        nl.max_retries
      FROM notification_queues nq
      JOIN notifications_log nl ON nq.notification_id = nl.id
      WHERE nq.status = 'queued' 
        AND nq.scheduled_at <= NOW()
        AND nl.status IN ('pending', 'failed')
        AND nl.retry_count < nl.max_retries
      ORDER BY nq.priority ASC, nq.scheduled_at ASC
      LIMIT $1
    `;

    try {
      const result = await pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting queued notifications:', error);
      throw error;
    }
  },

  // Update queue item status
  async updateQueueStatus(queueId, status, workerId = null) {
    let query = `UPDATE notification_queues SET status = $2`;
    const values = [queueId, status];
    let paramCount = 2;

    if (status === 'processing') {
      paramCount++;
      query += `, processing_started_at = NOW(), worker_id = $${paramCount}`;
      values.push(workerId);
    } else if (status === 'completed' || status === 'failed') {
      query += `, processing_completed_at = NOW()`;
    }

    query += ` WHERE id = $1 RETURNING *`;

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating queue status:', error);
      throw error;
    }
  },

  // Get notification statistics
  async getNotificationStats(days = 30) {
    const query = `
      SELECT 
        channel,
        status,
        COUNT(*) as count,
        SUM(cost_usd) as total_cost
      FROM notifications_log
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY channel, status
      ORDER BY channel, status
    `;

    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      throw error;
    }
  },

  // Get failed notifications that can be retried
  async getRetryableNotifications() {
    const query = `
      SELECT *
      FROM notifications_log
      WHERE status = 'failed' 
        AND retry_count < max_retries
        AND (next_retry_at IS NULL OR next_retry_at <= NOW())
      ORDER BY created_at ASC
      LIMIT 100
    `;

    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting retryable notifications:', error);
      throw error;
    }
  }
};

module.exports = {
  pool,
  testConnection,
  ...notificationModel
};
