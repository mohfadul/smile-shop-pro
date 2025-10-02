const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'AUTH_SERVICE_URL', 'PRODUCT_SERVICE_URL', 'ORDER_SERVICE_URL', 'PAYMENT_SERVICE_URL', 'SHIPMENT_SERVICE_URL'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
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

app.use(compression());
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

// JWT Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      error: 'Access denied',
      message: 'No token provided'
    });
  }

  try {
    // Verify token with auth service
    const response = await axios.post(`${process.env.AUTH_SERVICE_URL}/api/auth/verify-token`, {
      token: token
    });

    req.user = response.data.user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Token verification failed'
    });
  }
};

// Role-based authorization middleware
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Insufficient permissions for this operation'
      });
    }

    next();
  };
};

// Service health check
app.get('/health', async (req, res) => {
  try {
    const services = [
      { name: 'auth-service', url: process.env.AUTH_SERVICE_URL },
      { name: 'product-service', url: process.env.PRODUCT_SERVICE_URL },
      { name: 'order-service', url: process.env.ORDER_SERVICE_URL },
      { name: 'payment-service', url: process.env.PAYMENT_SERVICE_URL },
      { name: 'shipment-service', url: process.env.SHIPMENT_SERVICE_URL },
    ];

    const healthResults = {};

    for (const service of services) {
      try {
        const response = await axios.get(`${service.url}/health`, { timeout: 5000 });
        healthResults[service.name] = {
          status: 'healthy',
          responseTime: Date.now() - req.startTime,
          ...response.data
        };
      } catch (error) {
        healthResults[service.name] = {
          status: 'unhealthy',
          error: error.message,
          responseTime: Date.now() - req.startTime
        };
      }
    }

    const overallStatus = Object.values(healthResults).every(h => h.status === 'healthy') ? 'healthy' : 'degraded';

    res.status(200).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: healthResults,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes - Proxy to microservices with authentication

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const response = await axios.post(`${process.env.AUTH_SERVICE_URL}/api/auth/register`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Auth service error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const response = await axios.post(`${process.env.AUTH_SERVICE_URL}/api/auth/login`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Auth service error' });
  }
});

// Product routes (public)
app.get('/api/products', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.PRODUCT_SERVICE_URL}/api/products`, { params: req.query });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Product service error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.PRODUCT_SERVICE_URL}/api/products/${req.params.id}`);
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Product service error' });
  }
});

// Order routes (authenticated)
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const response = await axios.post(`${process.env.ORDER_SERVICE_URL}/api/orders`, req.body, {
      headers: { Authorization: req.headers.authorization }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Order service error' });
  }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const response = await axios.get(`${process.env.ORDER_SERVICE_URL}/api/orders`, {
      headers: { Authorization: req.headers.authorization },
      params: req.query
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Order service error' });
  }
});

// Admin routes (role-based authorization)
app.get('/api/admin/dashboard', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    // Aggregate data from multiple services for admin dashboard
    const [products, orders, payments] = await Promise.all([
      axios.get(`${process.env.PRODUCT_SERVICE_URL}/api/products?limit=1000`),
      axios.get(`${process.env.ORDER_SERVICE_URL}/api/orders?limit=1000`, {
        headers: { Authorization: req.headers.authorization }
      }),
      axios.get(`${process.env.PAYMENT_SERVICE_URL}/api/payments/admin/stats?period=30d`, {
        headers: { Authorization: req.headers.authorization }
      })
    ]);

    res.status(200).json({
      products: products.data.products?.length || 0,
      orders: orders.data.orders?.length || 0,
      revenue: orders.data.orders?.filter(o => o.payment_status === 'paid').reduce((sum, o) => sum + o.total_amount, 0) || 0,
      payments: payments.data.statistics
    });
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Dashboard data aggregation failed' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`🔗 Auth Service: ${process.env.AUTH_SERVICE_URL}`);
  console.log(`📦 Product Service: ${process.env.PRODUCT_SERVICE_URL}`);
  console.log(`🛒 Order Service: ${process.env.ORDER_SERVICE_URL}`);
  console.log(`💳 Payment Service: ${process.env.PAYMENT_SERVICE_URL}`);
  console.log(`🚚 Shipment Service: ${process.env.SHIPMENT_SERVICE_URL}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
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

module.exports = app;
