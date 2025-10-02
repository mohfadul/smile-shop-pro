const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const winston = require('winston');

// Load environment variables
require('dotenv').config();

// Import services and models
const { pool, testConnection } = require('./models/notificationModel');
const notificationController = require('./controllers/notificationController');
const templateController = require('./controllers/templateController');
const campaignController = require('./controllers/campaignController');
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
  defaultMeta: { service: 'notification-service' },
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
  'DATABASE_URL',
  'REDIS_URL',
  'SENDGRID_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN'
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
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use(limiter);

// Stricter rate limiting for sending notifications
const sendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 send requests per minute
  message: 'Too many notification send requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await testConnection();

    // Test Redis connection (if available)
    let redisStatus = 'not configured';
    try {
      const redis = require('./services/queueService');
      redisStatus = 'connected';
    } catch (error) {
      redisStatus = 'disconnected';
    }

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'notification-service',
      version: '1.0.0',
      database: 'connected',
      redis: redisStatus,
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      service: 'notification-service'
    });
  }
});

// Validation middleware
const validateNotificationSend = [
  body('channel').isIn(['email', 'whatsapp', 'sms', 'push']).withMessage('Invalid channel'),
  body('to_contact').notEmpty().withMessage('Recipient contact is required'),
  body('body').notEmpty().withMessage('Message body is required'),
  body('subject').optional().isString(),
  body('template_id').optional().isString(),
  body('template_data').optional().isObject(),
  body('related_entity').optional().isString(),
  body('related_id').optional().isInt(),
  body('priority').optional().isInt({ min: 1, max: 10 })
];

const validateTemplateCreate = [
  body('name').notEmpty().withMessage('Template name is required'),
  body('channel').isIn(['email', 'whatsapp', 'sms', 'push']).withMessage('Invalid channel'),
  body('body_template').notEmpty().withMessage('Body template is required'),
  body('subject_template').optional().isString(),
  body('variables').optional().isArray()
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

// Notification sending endpoints
app.post('/api/notifications/send', 
  sendLimiter, 
  authenticateToken, 
  validateNotificationSend, 
  handleValidationErrors, 
  notificationController.sendNotification
);

app.post('/api/notifications/send-bulk', 
  sendLimiter, 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  notificationController.sendBulkNotifications
);

// Notification management endpoints
app.get('/api/notifications', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'staff'), 
  notificationController.getNotifications
);

app.get('/api/notifications/:id', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'staff'), 
  notificationController.getNotification
);

app.put('/api/notifications/:id/retry', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  notificationController.retryNotification
);

app.get('/api/notifications/stats/summary', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  notificationController.getNotificationStats
);

// Template management endpoints
app.get('/api/templates', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'staff'), 
  templateController.getTemplates
);

app.post('/api/templates', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  validateTemplateCreate, 
  handleValidationErrors, 
  templateController.createTemplate
);

app.put('/api/templates/:id', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  templateController.updateTemplate
);

app.delete('/api/templates/:id', 
  authenticateToken, 
  authorizeRoles('admin'), 
  templateController.deleteTemplate
);

// Campaign management endpoints
app.get('/api/campaigns', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  campaignController.getCampaigns
);

app.post('/api/campaigns', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  campaignController.createCampaign
);

app.put('/api/campaigns/:id/start', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  campaignController.startCampaign
);

app.put('/api/campaigns/:id/cancel', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  campaignController.cancelCampaign
);

// User preference endpoints
app.get('/api/preferences/:userId', 
  authenticateToken, 
  notificationController.getUserPreferences
);

app.put('/api/preferences/:userId', 
  authenticateToken, 
  notificationController.updateUserPreferences
);

// Provider management endpoints (admin only)
app.get('/api/providers', 
  authenticateToken, 
  authorizeRoles('admin'), 
  notificationController.getProviders
);

app.put('/api/providers/:id', 
  authenticateToken, 
  authorizeRoles('admin'), 
  notificationController.updateProvider
);

// Webhook endpoints for delivery status updates
app.post('/api/webhooks/sendgrid', notificationController.handleSendGridWebhook);
app.post('/api/webhooks/twilio', notificationController.handleTwilioWebhook);

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
const PORT = process.env.PORT || 5005;

const server = app.listen(PORT, async () => {
  try {
    // Test database connection on startup
    await testConnection();
    logger.info(`🚀 Notification Service running on port ${PORT}`);
    logger.info(`📧 Email provider: SendGrid`);
    logger.info(`📱 WhatsApp provider: Twilio`);
    logger.info(`📊 Health check: http://localhost:${PORT}/health`);
  } catch (error) {
    logger.error('Failed to start notification service:', error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('✅ HTTP server closed');
    pool.end(() => {
      logger.info('✅ Database pool closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('✅ HTTP server closed');
    pool.end(() => {
      logger.info('✅ Database pool closed');
      process.exit(0);
    });
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
