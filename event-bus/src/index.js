const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const winston = require('winston');

// Load environment variables
require('dotenv').config();

// Import services and models
const EventBusService = require('./services/EventBusService');
const eventController = require('./controllers/eventController');
const { errorHandler } = require('./middlewares/errorHandler');
const { authenticateToken, authorizeRoles } = require('./middlewares/auth');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'event-bus' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'RABBITMQ_URL'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  logger.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// Create Express application
const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS ?
      process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:8080'];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for event publishing
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use(limiter);

// Initialize Event Bus Service
const eventBusService = new EventBusService();

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const rabbitMQStatus = await eventBusService.checkConnection();
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'event-bus',
      version: '1.0.0',
      rabbitmq: rabbitMQStatus ? 'connected' : 'disconnected',
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      service: 'event-bus'
    });
  }
});

// Validation middleware
const validateEventPublish = [
  body('event_type').notEmpty().withMessage('Event type is required'),
  body('data').isObject().withMessage('Event data must be an object'),
  body('source_service').notEmpty().withMessage('Source service is required'),
  body('correlation_id').optional().isString(),
  body('priority').optional().isInt({ min: 1, max: 10 })
];

// Request validation handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// API Routes

// Event publishing endpoints
app.post('/api/events/publish', 
  authenticateToken,
  validateEventPublish, 
  handleValidationErrors, 
  async (req, res, next) => {
    try {
      const {
        event_type,
        data,
        source_service,
        correlation_id,
        priority = 5
      } = req.body;

      const eventId = await eventBusService.publishEvent({
        event_type,
        data,
        source_service,
        correlation_id,
        priority,
        user_id: req.user?.user_id || req.user?.id
      });

      res.status(201).json({
        success: true,
        message: 'Event published successfully',
        data: {
          event_id: eventId,
          event_type,
          source_service,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error publishing event:', error);
      next(error);
    }
  }
);

// Bulk event publishing
app.post('/api/events/publish-batch', 
  authenticateToken,
  authorizeRoles('admin', 'manager', 'system'),
  async (req, res, next) => {
    try {
      const { events } = req.body;

      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          error: 'Events array is required'
        });
      }

      const results = [];
      for (const event of events) {
        try {
          const eventId = await eventBusService.publishEvent({
            ...event,
            user_id: req.user?.user_id || req.user?.id
          });
          results.push({ success: true, event_id: eventId, event_type: event.event_type });
        } catch (error) {
          results.push({ success: false, error: error.message, event_type: event.event_type });
        }
      }

      res.status(201).json({
        success: true,
        message: 'Batch events processed',
        data: {
          total: events.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results
        }
      });

    } catch (error) {
      logger.error('Error publishing batch events:', error);
      next(error);
    }
  }
);

// Event subscription management
app.post('/api/events/subscribe', 
  authenticateToken,
  authorizeRoles('admin', 'manager', 'system'),
  async (req, res, next) => {
    try {
      const {
        event_types,
        callback_url,
        service_name,
        filter_criteria
      } = req.body;

      const subscriptionId = await eventBusService.createSubscription({
        event_types,
        callback_url,
        service_name,
        filter_criteria,
        created_by: req.user?.user_id || req.user?.id
      });

      res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        data: {
          subscription_id: subscriptionId,
          event_types,
          service_name
        }
      });

    } catch (error) {
      logger.error('Error creating subscription:', error);
      next(error);
    }
  }
);

// Get event history
app.get('/api/events/history', 
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  async (req, res, next) => {
    try {
      const {
        event_type,
        source_service,
        date_from,
        date_to,
        limit = 50,
        offset = 0
      } = req.query;

      const events = await eventBusService.getEventHistory({
        event_type,
        source_service,
        date_from,
        date_to,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.status(200).json({
        success: true,
        data: {
          events,
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        }
      });

    } catch (error) {
      logger.error('Error getting event history:', error);
      next(error);
    }
  }
);

// Get event statistics
app.get('/api/events/stats', 
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  async (req, res, next) => {
    try {
      const { days = 7 } = req.query;
      const stats = await eventBusService.getEventStats(parseInt(days));

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Error getting event stats:', error);
      next(error);
    }
  }
);

// Get active subscriptions
app.get('/api/events/subscriptions', 
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  async (req, res, next) => {
    try {
      const subscriptions = await eventBusService.getSubscriptions();

      res.status(200).json({
        success: true,
        data: subscriptions
      });

    } catch (error) {
      logger.error('Error getting subscriptions:', error);
      next(error);
    }
  }
);

// Delete subscription
app.delete('/api/events/subscriptions/:id', 
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      await eventBusService.deleteSubscription(id);

      res.status(200).json({
        success: true,
        message: 'Subscription deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting subscription:', error);
      next(error);
    }
  }
);

// Event replay endpoint (for debugging/recovery)
app.post('/api/events/replay', 
  authenticateToken,
  authorizeRoles('admin'),
  async (req, res, next) => {
    try {
      const {
        event_ids,
        target_service
      } = req.body;

      if (!Array.isArray(event_ids) || event_ids.length === 0) {
        return res.status(400).json({
          error: 'Event IDs array is required'
        });
      }

      const results = await eventBusService.replayEvents(event_ids, target_service);

      res.status(200).json({
        success: true,
        message: 'Event replay initiated',
        data: results
      });

    } catch (error) {
      logger.error('Error replaying events:', error);
      next(error);
    }
  }
);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 5007;

const server = app.listen(PORT, async () => {
  try {
    // Initialize Event Bus Service
    await eventBusService.initialize();
    
    logger.info(`🚀 Event Bus Service running on port ${PORT}`);
    logger.info(`🔄 RabbitMQ connection established`);
    logger.info(`📡 Event publishing and subscription endpoints available`);
    logger.info(`📊 Health check: http://localhost:${PORT}/health`);
  } catch (error) {
    logger.error('Failed to start event bus service:', error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully');
  
  // Close event bus connections
  await eventBusService.close();
  
  server.close(() => {
    logger.info('✅ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('🛑 SIGINT received, shutting down gracefully');
  
  // Close event bus connections
  await eventBusService.close();
  
  server.close(() => {
    logger.info('✅ HTTP server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
