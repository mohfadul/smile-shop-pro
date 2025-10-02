const jwt = require('jsonwebtoken');
const { pool } = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');

// Middleware to verify JWT token
const authenticateToken = catchAsync(async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Check for token in HttpOnly cookies
  else if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access denied',
      message: 'No token provided'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists and is active
    const userResult = await pool.query(
      'SELECT user_id, email, role, status FROM users WHERE user_id = $1',
      [decoded.user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'User no longer exists'
      });
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'Account inactive',
        message: 'Your account is not active'
      });
    }

    // Add user info to request
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Token is malformed'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        message: 'Please login again'
      });
    }

    throw error;
  }
});

// Middleware to authorize specific roles
const authorizeRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please login first'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Access forbidden',
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};

// Middleware to check if user owns resource or is admin
const authorizeOwnerOrAdmin = (userIdField = 'user_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please login first'
      });
    }

    const resourceUserId = req.params[userIdField] || req.body[userIdField];
    
    if (req.user.role === 'admin' || req.user.user_id === resourceUserId) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Access forbidden',
      message: 'You can only access your own resources'
    });
  };
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userResult = await pool.query(
      'SELECT user_id, email, role, status FROM users WHERE user_id = $1',
      [decoded.user_id]
    );

    if (userResult.rows.length > 0 && userResult.rows[0].status === 'active') {
      req.user = userResult.rows[0];
    }
  } catch (error) {
    // Silently continue without user info
  }

  next();
});

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizeOwnerOrAdmin,
  optionalAuth
};
