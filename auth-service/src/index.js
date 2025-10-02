const express = require('express');
const dotenv = require('dotenv');
const compression = require('compression');
const authRoutes = require('./routes/authRoutes');
const { errorHandler } = require('./middlewares/errorHandler');
const {
  helmetConfig,
  corsOptions,
  sanitizeInput,
  validateRequest,
  securityMonitor,
  requestSizeLimit,
  authLimiter,
  generalLimiter,
  sensitiveLimiter
} = require('./middlewares/security');
const { trackResponseTime, createHealthCheck } = require('./utils/performance');
const { pool, testConnection } = require('./models/userModel');

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Create Express application
const app = express();

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set('trust proxy', 1);

// Global middleware
app.use(helmetConfig); // Security headers
app.use(cors(corsOptions)); // CORS protection
app.use(compression()); // Response compression
app.use(express.json({ limit: '1mb' })); // Parse JSON with size limit
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // Parse URL-encoded data

// Performance monitoring
app.use(trackResponseTime); // Track response times

// Security middleware (order matters!)
app.use(requestSizeLimit); // Request size limiting
app.use(sanitizeInput); // Input sanitization
app.use(validateRequest); // Request validation
app.use(securityMonitor); // Security monitoring

// Health check endpoint (before rate limiting)
app.get('/health', async (req, res) => {
  try {
    const healthCheck = createHealthCheck(pool, 'auth-service');
    const health = await healthCheck();

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      service: 'auth-service',
    });
  }
});

// API Routes with appropriate rate limiting
app.use('/api/auth/login', authLimiter); // Stricter rate limiting for login
app.use('/api/auth/register', authLimiter); // Stricter rate limiting for registration
app.use('/api/auth', generalLimiter, authRoutes); // General rate limiting for other auth routes

// Admin routes with sensitive operation limiting
app.use('/api/auth/admin', sensitiveLimiter); // Stricter limits for admin operations

// Global error handler (must be last)
app.use(errorHandler);

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /health',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/profile',
      'PUT /api/auth/profile',
    ],
  });
});

// Start server
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Auth Service running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 Security: Enhanced protection enabled`);
  console.log(`📈 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
