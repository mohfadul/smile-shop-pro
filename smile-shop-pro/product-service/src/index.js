const express = require('express');
const dotenv = require('dotenv');
const compression = require('compression');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const { errorHandler } = require('./middlewares/errorHandler');
const {
  helmetConfig,
  corsOptions,
  sanitizeInput,
  validateRequest,
  securityMonitor,
  requestSizeLimit,
  generalLimiter,
  sensitiveLimiter
} = require('./middlewares/security');

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL'];
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
app.use(express.json({ limit: '2mb' })); // Parse JSON with size limit for product images
app.use(express.urlencoded({ extended: true, limit: '2mb' })); // Parse URL-encoded data

// Security middleware (order matters!)
app.use(requestSizeLimit); // Request size limiting
app.use(sanitizeInput); // Input sanitization
app.use(validateRequest); // Request validation
app.use(securityMonitor); // Security monitoring

// Health check endpoint (before rate limiting)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'product-service',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// API Routes with appropriate rate limiting
app.use('/api/products', generalLimiter, productRoutes); // General rate limiting for product operations
app.use('/api/categories', generalLimiter, categoryRoutes); // General rate limiting for category operations

// Admin routes with sensitive operation limiting
app.use('/api/admin/products', sensitiveLimiter); // Stricter limits for admin operations
app.use('/api/admin/categories', sensitiveLimiter); // Stricter limits for admin operations

// Global error handler (must be last)
app.use(errorHandler);

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /health',
      'GET /api/products',
      'POST /api/products',
      'GET /api/products/:id',
      'PUT /api/products/:id',
      'DELETE /api/products/:id',
      'GET /api/categories',
      'POST /api/categories',
      'GET /api/categories/:id',
    ],
  });
});

// Start server
const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, () => {
  console.log(`🚀 Product Service running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 Security: Enhanced protection enabled`);
  console.log(`📈 Health check: http://localhost:${PORT}/health`);
  console.log(`📦 Product API: http://localhost:${PORT}/api/products`);
  console.log(`🏷️ Category API: http://localhost:${PORT}/api/categories`);
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
