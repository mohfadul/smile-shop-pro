const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const axios = require('axios');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'event-bus-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class EventBusService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.subscriptions = new Map();
    this.eventHistory = [];
    this.isConnected = false;
    
    // Event types configuration
    this.eventTypes = {
      // Order Events
      'order.created': { exchange: 'orders', routingKey: 'order.created', durable: true },
      'order.updated': { exchange: 'orders', routingKey: 'order.updated', durable: true },
      'order.cancelled': { exchange: 'orders', routingKey: 'order.cancelled', durable: true },
      'order.completed': { exchange: 'orders', routingKey: 'order.completed', durable: true },
      
      // Payment Events
      'payment.created': { exchange: 'payments', routingKey: 'payment.created', durable: true },
      'payment.verified': { exchange: 'payments', routingKey: 'payment.verified', durable: true },
      'payment.failed': { exchange: 'payments', routingKey: 'payment.failed', durable: true },
      'payment.refunded': { exchange: 'payments', routingKey: 'payment.refunded', durable: true },
      
      // Inventory Events
      'inventory.low_stock': { exchange: 'inventory', routingKey: 'inventory.low_stock', durable: true },
      'inventory.out_of_stock': { exchange: 'inventory', routingKey: 'inventory.out_of_stock', durable: true },
      'inventory.restocked': { exchange: 'inventory', routingKey: 'inventory.restocked', durable: true },
      'inventory.updated': { exchange: 'inventory', routingKey: 'inventory.updated', durable: true },
      
      // User Events
      'user.registered': { exchange: 'users', routingKey: 'user.registered', durable: true },
      'user.updated': { exchange: 'users', routingKey: 'user.updated', durable: true },
      'user.deleted': { exchange: 'users', routingKey: 'user.deleted', durable: true },
      
      // Shipment Events
      'shipment.created': { exchange: 'shipments', routingKey: 'shipment.created', durable: true },
      'shipment.shipped': { exchange: 'shipments', routingKey: 'shipment.shipped', durable: true },
      'shipment.delivered': { exchange: 'shipments', routingKey: 'shipment.delivered', durable: true },
      
      // System Events
      'system.exchange_rate_updated': { exchange: 'system', routingKey: 'system.exchange_rate_updated', durable: true },
      'system.backup_completed': { exchange: 'system', routingKey: 'system.backup_completed', durable: true },
      'system.maintenance_started': { exchange: 'system', routingKey: 'system.maintenance_started', durable: true },
      
      // Notification Events
      'notification.sent': { exchange: 'notifications', routingKey: 'notification.sent', durable: true },
      'notification.failed': { exchange: 'notifications', routingKey: 'notification.failed', durable: true },
      
      // Report Events
      'report.generated': { exchange: 'reports', routingKey: 'report.generated', durable: true },
      'report.scheduled': { exchange: 'reports', routingKey: 'report.scheduled', durable: true }
    };
  }

  async initialize() {
    try {
      // Connect to RabbitMQ
      const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      this.connection = await amqp.connect(rabbitmqUrl);
      this.channel = await this.connection.createChannel();
      
      // Set up error handlers
      this.connection.on('error', (error) => {
        logger.error('RabbitMQ connection error:', error);
        this.isConnected = false;
      });
      
      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
        // Implement reconnection logic here
        setTimeout(() => this.reconnect(), 5000);
      });
      
      // Create exchanges for different event types
      await this.setupExchanges();
      
      // Set up dead letter exchange for failed messages
      await this.setupDeadLetterExchange();
      
      this.isConnected = true;
      logger.info('✅ Event Bus Service initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Event Bus Service:', error);
      throw error;
    }
  }

  async setupExchanges() {
    const exchanges = ['orders', 'payments', 'inventory', 'users', 'shipments', 'system', 'notifications', 'reports'];
    
    for (const exchange of exchanges) {
      await this.channel.assertExchange(exchange, 'topic', { durable: true });
      logger.info(`📡 Exchange '${exchange}' created/verified`);
    }
  }

  async setupDeadLetterExchange() {
    // Dead letter exchange for failed messages
    await this.channel.assertExchange('dlx', 'direct', { durable: true });
    await this.channel.assertQueue('failed_events', {
      durable: true,
      arguments: {
        'x-message-ttl': 7 * 24 * 60 * 60 * 1000, // 7 days TTL
      }
    });
    await this.channel.bindQueue('failed_events', 'dlx', 'failed');
    
    logger.info('💀 Dead letter exchange configured');
  }

  async publishEvent({ event_type, data, source_service, correlation_id, priority = 5, user_id }) {
    try {
      if (!this.isConnected) {
        throw new Error('Event Bus not connected');
      }

      const eventConfig = this.eventTypes[event_type];
      if (!eventConfig) {
        throw new Error(`Unknown event type: ${event_type}`);
      }

      const eventId = uuidv4();
      const timestamp = new Date().toISOString();
      
      const eventMessage = {
        event_id: eventId,
        event_type,
        data,
        source_service,
        correlation_id: correlation_id || uuidv4(),
        user_id,
        timestamp,
        version: '1.0'
      };

      // Publish to appropriate exchange
      const published = await this.channel.publish(
        eventConfig.exchange,
        eventConfig.routingKey,
        Buffer.from(JSON.stringify(eventMessage)),
        {
          persistent: eventConfig.durable,
          priority,
          messageId: eventId,
          timestamp: Date.now(),
          headers: {
            source_service,
            event_type,
            correlation_id: eventMessage.correlation_id
          }
        }
      );

      if (published) {
        // Store in event history (in-memory for now, should use database in production)
        this.eventHistory.push({
          ...eventMessage,
          published_at: timestamp,
          status: 'published'
        });

        // Keep only last 1000 events in memory
        if (this.eventHistory.length > 1000) {
          this.eventHistory = this.eventHistory.slice(-1000);
        }

        logger.info(`📡 Event published: ${event_type} from ${source_service}`, {
          event_id: eventId,
          correlation_id: eventMessage.correlation_id
        });

        return eventId;
      } else {
        throw new Error('Failed to publish event to RabbitMQ');
      }

    } catch (error) {
      logger.error('❌ Error publishing event:', error);
      throw error;
    }
  }

  async createSubscription({ event_types, callback_url, service_name, filter_criteria, created_by }) {
    try {
      const subscriptionId = uuidv4();
      const queueName = `${service_name}_${subscriptionId}`;

      // Create queue for this subscription
      await this.channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx',
          'x-dead-letter-routing-key': 'failed'
        }
      });

      // Bind queue to exchanges for specified event types
      for (const event_type of event_types) {
        const eventConfig = this.eventTypes[event_type];
        if (eventConfig) {
          await this.channel.bindQueue(queueName, eventConfig.exchange, eventConfig.routingKey);
        }
      }

      // Set up consumer for this subscription
      await this.channel.consume(queueName, async (message) => {
        if (message) {
          try {
            const eventData = JSON.parse(message.content.toString());
            
            // Apply filter criteria if specified
            if (filter_criteria && !this.matchesFilter(eventData, filter_criteria)) {
              this.channel.ack(message);
              return;
            }

            // Send event to callback URL
            await this.deliverEvent(callback_url, eventData, message);
            
            // Acknowledge message
            this.channel.ack(message);
            
            logger.info(`📨 Event delivered to ${service_name}: ${eventData.event_type}`);

          } catch (error) {
            logger.error(`❌ Error processing event for ${service_name}:`, error);
            
            // Reject message and send to dead letter queue after 3 retries
            const retryCount = (message.properties.headers['x-retry-count'] || 0) + 1;
            
            if (retryCount < 3) {
              // Retry with exponential backoff
              setTimeout(() => {
                this.channel.publish(
                  message.fields.exchange,
                  message.fields.routingKey,
                  message.content,
                  {
                    ...message.properties,
                    headers: {
                      ...message.properties.headers,
                      'x-retry-count': retryCount
                    }
                  }
                );
              }, Math.pow(2, retryCount) * 1000);
            }
            
            this.channel.nack(message, false, false); // Send to dead letter queue
          }
        }
      });

      // Store subscription info
      this.subscriptions.set(subscriptionId, {
        id: subscriptionId,
        event_types,
        callback_url,
        service_name,
        filter_criteria,
        queue_name: queueName,
        created_by,
        created_at: new Date().toISOString(),
        status: 'active'
      });

      logger.info(`📋 Subscription created for ${service_name}: ${event_types.join(', ')}`);
      
      return subscriptionId;

    } catch (error) {
      logger.error('❌ Error creating subscription:', error);
      throw error;
    }
  }

  async deliverEvent(callbackUrl, eventData, originalMessage) {
    try {
      const response = await axios.post(callbackUrl, eventData, {
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json',
          'X-Event-ID': eventData.event_id,
          'X-Event-Type': eventData.event_type,
          'X-Source-Service': eventData.source_service,
          'X-Correlation-ID': eventData.correlation_id
        }
      });

      if (response.status >= 200 && response.status < 300) {
        return true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      logger.error(`❌ Failed to deliver event to ${callbackUrl}:`, error.message);
      throw error;
    }
  }

  matchesFilter(eventData, filterCriteria) {
    // Simple filter matching - can be extended for complex criteria
    for (const [key, value] of Object.entries(filterCriteria)) {
      if (eventData.data[key] !== value) {
        return false;
      }
    }
    return true;
  }

  async getEventHistory({ event_type, source_service, date_from, date_to, limit, offset }) {
    // Filter event history based on criteria
    let filteredEvents = this.eventHistory;

    if (event_type) {
      filteredEvents = filteredEvents.filter(event => event.event_type === event_type);
    }

    if (source_service) {
      filteredEvents = filteredEvents.filter(event => event.source_service === source_service);
    }

    if (date_from) {
      filteredEvents = filteredEvents.filter(event => event.timestamp >= date_from);
    }

    if (date_to) {
      filteredEvents = filteredEvents.filter(event => event.timestamp <= date_to);
    }

    // Apply pagination
    const startIndex = offset || 0;
    const endIndex = startIndex + (limit || 50);
    
    return filteredEvents.slice(startIndex, endIndex);
  }

  async getEventStats(days = 7) {
    const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    const recentEvents = this.eventHistory.filter(event => 
      new Date(event.timestamp) >= cutoffDate
    );

    // Group by event type
    const eventTypeStats = {};
    const serviceStats = {};
    
    recentEvents.forEach(event => {
      // Event type stats
      if (!eventTypeStats[event.event_type]) {
        eventTypeStats[event.event_type] = 0;
      }
      eventTypeStats[event.event_type]++;

      // Service stats
      if (!serviceStats[event.source_service]) {
        serviceStats[event.source_service] = 0;
      }
      serviceStats[event.source_service]++;
    });

    return {
      period_days: days,
      total_events: recentEvents.length,
      event_types: eventTypeStats,
      services: serviceStats,
      active_subscriptions: this.subscriptions.size,
      generated_at: new Date().toISOString()
    };
  }

  async getSubscriptions() {
    return Array.from(this.subscriptions.values());
  }

  async deleteSubscription(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    try {
      // Delete the queue
      await this.channel.deleteQueue(subscription.queue_name);
      
      // Remove from subscriptions map
      this.subscriptions.delete(subscriptionId);
      
      logger.info(`🗑️ Subscription deleted: ${subscription.service_name}`);
      
    } catch (error) {
      logger.error('❌ Error deleting subscription:', error);
      throw error;
    }
  }

  async replayEvents(eventIds, targetService) {
    const results = [];
    
    for (const eventId of eventIds) {
      const event = this.eventHistory.find(e => e.event_id === eventId);
      
      if (event) {
        try {
          // Re-publish the event
          await this.publishEvent({
            event_type: event.event_type,
            data: event.data,
            source_service: 'event-bus-replay',
            correlation_id: event.correlation_id,
            user_id: event.user_id
          });
          
          results.push({ event_id: eventId, status: 'replayed' });
          
        } catch (error) {
          results.push({ event_id: eventId, status: 'failed', error: error.message });
        }
      } else {
        results.push({ event_id: eventId, status: 'not_found' });
      }
    }
    
    return results;
  }

  async checkConnection() {
    return this.isConnected && this.connection && !this.connection.connection.destroyed;
  }

  async reconnect() {
    try {
      logger.info('🔄 Attempting to reconnect to RabbitMQ...');
      await this.initialize();
    } catch (error) {
      logger.error('❌ Reconnection failed:', error);
      setTimeout(() => this.reconnect(), 10000); // Try again in 10 seconds
    }
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.isConnected = false;
      logger.info('✅ Event Bus Service closed successfully');
    } catch (error) {
      logger.error('❌ Error closing Event Bus Service:', error);
    }
  }

  // Utility methods for common event publishing
  async publishOrderEvent(eventType, orderData, userId) {
    return await this.publishEvent({
      event_type: `order.${eventType}`,
      data: orderData,
      source_service: 'order-service',
      user_id: userId
    });
  }

  async publishPaymentEvent(eventType, paymentData, userId) {
    return await this.publishEvent({
      event_type: `payment.${eventType}`,
      data: paymentData,
      source_service: 'payment-service',
      user_id: userId
    });
  }

  async publishInventoryEvent(eventType, inventoryData, userId) {
    return await this.publishEvent({
      event_type: `inventory.${eventType}`,
      data: inventoryData,
      source_service: 'product-service',
      user_id: userId
    });
  }

  async publishSystemEvent(eventType, systemData, userId) {
    return await this.publishEvent({
      event_type: `system.${eventType}`,
      data: systemData,
      source_service: 'system',
      user_id: userId
    });
  }
}

module.exports = EventBusService;
