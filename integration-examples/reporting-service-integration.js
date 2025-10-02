// reporting-service/src/index.js - Integration Example

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import existing routes (if any)
// const analyticsRoutes = require('./routes/analyticsRoutes');

// Import NEW report file routes
const reportFileRoutes = require('./routes/reportFileRoutes');

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
  max: 50 // Lower limit for reporting service (resource intensive)
});
app.use(limiter);

// Routes
// app.use('/api/v1/analytics', analyticsRoutes); // If you have existing analytics routes

// ADD THIS LINE - Report generation and file management
app.use('/api/v1/reports', reportFileRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'reporting-service',
    timestamp: new Date().toISOString(),
    features: ['reports', 'excel-generation', 'pdf-generation', 'analytics'] // Updated
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

const PORT = process.env.PORT || 5006;
app.listen(PORT, () => {
  console.log(`📊 Reporting Service running on port ${PORT}`);
  console.log(`📈 Report generation endpoints available at /api/v1/reports`);
});

module.exports = app;
