/**
 * Payment Service - Dental Store Sudan
 * Handles payment processing and transactions
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5003;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Payment Service',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/api/payment-methods', (req, res) => {
  res.json({
    success: true,
    data: {
      methods: [
        {
          id: 'cash_on_delivery',
          name: 'Cash on Delivery',
          type: 'cash',
          enabled: true,
          description: 'Pay when you receive your order'
        },
        {
          id: 'bank_transfer',
          name: 'Bank Transfer',
          type: 'bank',
          enabled: true,
          description: 'Direct bank transfer (Sudan banks)'
        },
        {
          id: 'mobile_money',
          name: 'Mobile Money',
          type: 'mobile',
          enabled: true,
          description: 'Zain Cash, MTN, Sudani'
        }
      ]
    }
  });
});

app.post('/api/payments', (req, res) => {
  const { orderId, amount, method, currency = 'SDG' } = req.body;
  
  // Simulate payment creation
  const payment = {
    id: `pay_${Date.now()}`,
    orderId,
    amount,
    currency,
    method,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  res.status(201).json({
    success: true,
    data: { payment }
  });
});

app.get('/api/payments/:id', (req, res) => {
  const { id } = req.params;
  
  // Simulate payment retrieval
  const payment = {
    id,
    orderId: 'ord_123',
    amount: 299.99,
    currency: 'SDG',
    method: 'cash_on_delivery',
    status: 'completed',
    createdAt: new Date().toISOString()
  };
  
  res.json({
    success: true,
    data: { payment }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Payment Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
