const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

// Enhanced rate limiting with progressive slowdown for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for auth endpoints
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  skipFailedRequests: false, // Count failed requests
  keyGenerator: (req) => {
    // Use IP + User-Agent for better rate limiting
    return `${req.ip}-${req.get('User-Agent')}`;
  },
  handler: (req, res) => {
    // Enhanced logging with user context
    console.warn(`Auth rate limit exceeded for IP: ${req.ip}, User-Agent: ${req.get('User-Agent')}, Path: ${req.path}`);

    res.status(429).json({
      error: 'Too many requests',
      message: 'Authentication rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000 / 60), // minutes
    });
  },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for general endpoints
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`General rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);

    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000 / 60),
    });
  },
});

// Stricter rate limiting for sensitive operations
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // limit each IP to 3 requests per minute for sensitive operations
  message: {
    error: 'Too many sensitive operations, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.ALLOWED_ORIGINS ?
      process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:8080'];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining'],
  maxAge: 86400, // 24 hours
};

// Security headers configuration
const helmetConfig = helmet({
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
  crossOriginEmbedderPolicy: false, // Disable for API responses
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query);
  }

  // Sanitize route parameters
  if (req.params && typeof req.params === 'object') {
    sanitizeObject(req.params);
  }

  next();
};

// Recursive object sanitization
const sanitizeObject = (obj) => {
  for (let key in obj) {
    if (typeof obj[key] === 'string') {
      // Remove potential XSS
      obj[key] = obj[key]
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .replace(/javascript:/gi, '') // Remove javascript: URLs
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .trim();

      // Limit string length
      if (obj[key].length > 1000) {
        obj[key] = obj[key].substring(0, 1000) + '...';
      }
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
};

// Request validation middleware
const validateRequest = (req, res, next) => {
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
    /(<script|javascript:|vbscript:|data:text\/html)/i,
    /(\|\||&&)/, // Potential command injection
  ];

  const requestData = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params,
    headers: req.headers,
  });

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(requestData)) {
      console.warn(`Suspicious request pattern detected from IP: ${req.ip}`);
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request contains potentially malicious content.',
      });
    }
  }

  next();
};

// Security monitoring middleware
const securityMonitor = (req, res, next) => {
  // Log security-relevant requests
  const securityEvents = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/admin',
  ];

  if (securityEvents.some(path => req.path.includes(path))) {
    console.log(`Security event: ${req.method} ${req.path} from ${req.ip} at ${new Date().toISOString()}`);
  }

  // Add security headers to response
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
};

// Request size limiting
const requestSizeLimit = (req, res, next) => {
  // Limit request body size (5MB for file uploads, 1MB for regular requests)
  const maxSize = req.headers['content-type']?.includes('multipart') ? 5 * 1024 * 1024 : 1024 * 1024;

  if (req.headers['content-length'] && parseInt(req.headers['content-length']) > maxSize) {
    return res.status(413).json({
      error: 'Request too large',
      message: 'Request body exceeds maximum allowed size.',
    });
  }

  next();
};

// Export all security middleware
module.exports = {
  authLimiter,
  generalLimiter,
  sensitiveLimiter,
  corsOptions,
  helmetConfig,
  sanitizeInput,
  validateRequest,
  securityMonitor,
  requestSizeLimit,
};
