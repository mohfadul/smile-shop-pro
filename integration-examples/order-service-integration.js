// order-service/src/index.js - Integration Example

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import existing routes
const orderRoutes = require('./routes/orderRoutes');

// Import NEW invoice routes
const invoiceRoutes = require('./routes/invoiceRoutes');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/api/v1/orders', orderRoutes);

// ADD THIS LINE - Invoice generation and management
app.use('/api/v1/invoices', invoiceRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'order-service',
    timestamp: new Date().toISOString(),
    features: ['orders', 'invoices', 'pdf-generation'] // Updated
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`📦 Order Service running on port ${PORT}`);
  console.log(`📄 Invoice endpoints available at /api/v1/invoices`);
});

module.exports = app;
