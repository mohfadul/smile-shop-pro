const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const cron = require('node-cron');
const winston = require('winston');

// Load environment variables
require('dotenv').config();

// Import services and models
const { pool, testConnection } = require('./models/reportingModel');
const reportController = require('./controllers/reportController');
const analyticsController = require('./controllers/analyticsController');
const dashboardController = require('./controllers/dashboardController');
const exchangeRateController = require('./controllers/exchangeRateController');
const { errorHandler } = require('./middlewares/errorHandler');
const { authenticateToken, authorizeRoles } = require('./middlewares/auth');
const schedulerService = require('./services/schedulerService');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'reporting-service' },
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
  'AUTH_SERVICE_URL',
  'PRODUCT_SERVICE_URL',
  'ORDER_SERVICE_URL',
  'PAYMENT_SERVICE_URL'
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

// Stricter rate limiting for report generation
const reportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 report requests per minute
  message: 'Too many report generation requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await testConnection();

    // Test external service connections
    const serviceStatus = {
      database: 'connected',
      scheduler: schedulerService.isRunning() ? 'running' : 'stopped'
    };

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'reporting-service',
      version: '1.0.0',
      services: serviceStatus,
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      service: 'reporting-service'
    });
  }
});

// Validation middleware
const validateReportGeneration = [
  body('template_name').notEmpty().withMessage('Template name is required'),
  body('parameters').optional().isObject(),
  body('format').optional().isIn(['pdf', 'excel', 'csv']).withMessage('Invalid format'),
  body('recipients').optional().isArray()
];

const validateScheduledReport = [
  body('name').notEmpty().withMessage('Report name is required'),
  body('report_type').isIn(['sales', 'inventory', 'financial', 'customer', 'product', 'custom']).withMessage('Invalid report type'),
  body('cron_expression').notEmpty().withMessage('Cron expression is required'),
  body('template').isObject().withMessage('Template configuration is required'),
  body('recipients').isArray().withMessage('Recipients must be an array')
];

const validateExchangeRate = [
  body('from_currency').isLength({ min: 3, max: 3 }).withMessage('From currency must be 3 characters'),
  body('to_currency').isLength({ min: 3, max: 3 }).withMessage('To currency must be 3 characters'),
  body('rate').isFloat({ min: 0 }).withMessage('Rate must be a positive number')
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

// Report generation endpoints
app.post('/api/reports/generate', 
  reportLimiter,
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'accountant'), 
  validateReportGeneration, 
  handleValidationErrors, 
  reportController.generateReport
);

app.get('/api/reports/templates', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'accountant'), 
  reportController.getReportTemplates
);

app.post('/api/reports/templates', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  reportController.createReportTemplate
);

// Scheduled reports endpoints
app.get('/api/reports/scheduled', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  reportController.getScheduledReports
);

app.post('/api/reports/scheduled', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  validateScheduledReport, 
  handleValidationErrors, 
  reportController.createScheduledReport
);

app.put('/api/reports/scheduled/:id', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  reportController.updateScheduledReport
);

app.delete('/api/reports/scheduled/:id', 
  authenticateToken, 
  authorizeRoles('admin'), 
  reportController.deleteScheduledReport
);

app.post('/api/reports/scheduled/:id/run', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  reportController.runScheduledReport
);

// Report runs and history
app.get('/api/reports/runs', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'accountant'), 
  reportController.getReportRuns
);

app.get('/api/reports/runs/:id/download', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'accountant'), 
  reportController.downloadReport
);

// Analytics endpoints
app.get('/api/analytics/dashboard', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  analyticsController.getDashboardAnalytics
);

app.get('/api/analytics/sales', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'accountant'), 
  analyticsController.getSalesAnalytics
);

app.get('/api/analytics/inventory', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'staff'), 
  analyticsController.getInventoryAnalytics
);

app.get('/api/analytics/customers', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  analyticsController.getCustomerAnalytics
);

app.get('/api/analytics/products', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  analyticsController.getProductAnalytics
);

// Dashboard widgets endpoints
app.get('/api/dashboard/widgets', 
  authenticateToken, 
  dashboardController.getUserWidgets
);

app.post('/api/dashboard/widgets', 
  authenticateToken, 
  dashboardController.createWidget
);

app.put('/api/dashboard/widgets/:id', 
  authenticateToken, 
  dashboardController.updateWidget
);

app.delete('/api/dashboard/widgets/:id', 
  authenticateToken, 
  dashboardController.deleteWidget
);

// Exchange rate management endpoints
app.get('/api/admin/exchange-rate', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'accountant'), 
  exchangeRateController.getCurrentRates
);

app.get('/api/admin/exchange-rate/history', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'accountant'), 
  exchangeRateController.getRateHistory
);

app.post('/api/admin/exchange-rate', 
  authenticateToken, 
  authorizeRoles('admin', 'manager'), 
  validateExchangeRate, 
  handleValidationErrors, 
  exchangeRateController.setExchangeRate
);

// Admin audit log endpoints
app.get('/api/admin/audit-log', 
  authenticateToken, 
  authorizeRoles('admin'), 
  reportController.getAuditLog
);

app.post('/api/admin/audit-log', 
  authenticateToken, 
  authorizeRoles('admin', 'manager', 'accountant', 'staff'), 
  reportController.createAuditEntry
);

// Report subscriptions endpoints
app.get('/api/reports/subscriptions', 
  authenticateToken, 
  reportController.getUserSubscriptions
);

app.post('/api/reports/subscriptions', 
  authenticateToken, 
  reportController.createSubscription
);

app.delete('/api/reports/subscriptions/:id', 
  authenticateToken, 
  reportController.deleteSubscription
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

// Initialize scheduler for automated reports
const initializeScheduler = async () => {
  try {
    await schedulerService.start();
    logger.info('📊 Report scheduler started successfully');
  } catch (error) {
    logger.error('Failed to start report scheduler:', error);
  }
};

// Start server
const PORT = process.env.PORT || 5006;

const server = app.listen(PORT, async () => {
  try {
    // Test database connection on startup
    await testConnection();
    
    // Initialize scheduler
    await initializeScheduler();
    
    logger.info(`🚀 Reporting Service running on port ${PORT}`);
    logger.info(`📊 Analytics and reporting endpoints available`);
    logger.info(`📈 Scheduled reports enabled`);
    logger.info(`📊 Health check: http://localhost:${PORT}/health`);
  } catch (error) {
    logger.error('Failed to start reporting service:', error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully');
  
  // Stop scheduler
  await schedulerService.stop();
  
  server.close(() => {
    logger.info('✅ HTTP server closed');
    pool.end(() => {
      logger.info('✅ Database pool closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', async () => {
  logger.info('🛑 SIGINT received, shutting down gracefully');
  
  // Stop scheduler
  await schedulerService.stop();
  
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
