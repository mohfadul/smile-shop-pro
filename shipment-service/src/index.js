/**
 * Shipment Service - Dental Store Sudan
 * Handles shipping and delivery tracking
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5004;

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
    service: 'Shipment Service',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/api/shipping-methods', (req, res) => {
  res.json({
    success: true,
    data: {
      methods: [
        {
          id: 'standard',
          name: 'Standard Delivery',
          duration: '3-5 business days',
          cost: 50, // SDG
          description: 'Regular delivery within Khartoum'
        },
        {
          id: 'express',
          name: 'Express Delivery',
          duration: '1-2 business days',
          cost: 100, // SDG
          description: 'Fast delivery within Khartoum'
        },
        {
          id: 'pickup',
          name: 'Store Pickup',
          duration: 'Same day',
          cost: 0,
          description: 'Pick up from our store'
        }
      ]
    }
  });
});

app.get('/api/shipments', (req, res) => {
  const { orderId, status } = req.query;
  
  // Mock shipments data
  const shipments = [
    {
      id: 'ship_001',
      orderId: 'ord_123',
      trackingNumber: 'DS2024001',
      status: 'in_transit',
      method: 'standard',
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    },
    {
      id: 'ship_002',
      orderId: 'ord_124',
      trackingNumber: 'DS2024002',
      status: 'delivered',
      method: 'express',
      deliveredAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    }
  ];
  
  let filtered = shipments;
  
  if (orderId) {
    filtered = filtered.filter(s => s.orderId === orderId);
  }
  
  if (status) {
    filtered = filtered.filter(s => s.status === status);
  }
  
  res.json({
    success: true,
    data: { shipments: filtered }
  });
});

app.get('/api/shipments/track/:trackingNumber', (req, res) => {
  const { trackingNumber } = req.params;
  
  // Mock tracking data
  const tracking = {
    trackingNumber,
    status: 'in_transit',
    currentLocation: 'Khartoum Distribution Center',
    estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    history: [
      {
        status: 'picked_up',
        location: 'Dental Store Sudan',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        description: 'Package picked up from store'
      },
      {
        status: 'in_transit',
        location: 'Khartoum Distribution Center',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        description: 'Package arrived at distribution center'
      },
      {
        status: 'out_for_delivery',
        location: 'Local Delivery Hub',
        timestamp: new Date().toISOString(),
        description: 'Package out for delivery'
      }
    ]
  };
  
  res.json({
    success: true,
    data: { tracking }
  });
});

app.post('/api/shipping/calculate', (req, res) => {
  const { items, destination, method = 'standard' } = req.body;
  
  // Mock shipping calculation
  const baseRates = {
    standard: 50,
    express: 100,
    pickup: 0
  };
  
  const weight = items?.reduce((total, item) => total + (item.weight || 1), 0) || 1;
  const baseCost = baseRates[method] || 50;
  const weightCost = weight > 5 ? (weight - 5) * 10 : 0;
  
  const calculation = {
    method,
    baseCost,
    weightCost,
    totalCost: baseCost + weightCost,
    currency: 'SDG',
    estimatedDays: method === 'express' ? 2 : method === 'pickup' ? 0 : 4
  };
  
  res.json({
    success: true,
    data: { calculation }
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
  console.log(`🚀 Shipment Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
