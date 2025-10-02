const { pool } = require('../models/userModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');

// Security utility functions
const isAccountLocked = (lockedUntil) => {
  return lockedUntil && new Date() < new Date(lockedUntil);
};

const incrementLoginAttempts = async (userId) => {
  const result = await pool.query(
    'SELECT increment_login_attempts($1) as should_lock',
    [userId]
  );
  return result.rows[0].should_lock;
};

const resetLoginAttempts = async (userId) => {
  await pool.query('SELECT reset_login_attempts($1)', [userId]);
};

const register = catchAsync(async (req, res) => {
  const { first_name, last_name, email, password, role = 'customer' } = req.body;

  // Check if user already exists
  const existingUser = await pool.query(
    'SELECT user_id FROM users WHERE email = $1',
    [email]
  );

  if (existingUser.rows.length > 0) {
    return res.status(409).json({
      error: 'User already exists',
      message: 'An account with this email already exists.',
    });
  }

  // Hash password with salt rounds from environment
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Validate role
  const validRoles = ['customer', 'admin', 'manager', 'staff'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({
      error: 'Invalid role',
      message: 'Role must be one of: ' + validRoles.join(', '),
    });
  }

  const result = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING user_id, first_name, last_name, email, role, created_at`,
    [first_name, last_name, email, hashedPassword, role]
  );

  const newUser = result.rows[0];

  // Generate verification token (for email verification - optional)
  const verificationToken = jwt.sign(
    { user_id: newUser.user_id, type: 'email_verification' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  // Update user with verification token
  await pool.query(
    'UPDATE users SET email_verification_token = $1 WHERE user_id = $2',
    [verificationToken, newUser.user_id]
  );

  // Log registration activity
  await pool.query(
    'INSERT INTO user_activity_log (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
    [newUser.user_id, 'registration', { email }, req.ip]
  );

  // Return user data (excluding sensitive information)
  res.status(201).json({
    user: {
      user_id: newUser.user_id,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      email: newUser.email,
      role: newUser.role,
      created_at: newUser.created_at,
    },
    message: 'Registration successful. Please verify your email address.',
  });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  // Get user with lock status
  const userResult = await pool.query(
    `SELECT user_id, first_name, last_name, email, password_hash, role, status,
            locked_until, login_attempts, email_verified
     FROM users WHERE email = $1`,
    [email]
  );

  if (userResult.rows.length === 0) {
    return res.status(401).json({
      error: 'Invalid credentials',
      message: 'Invalid email or password.',
    });
  }

  const user = userResult.rows[0];

  // Check if account is locked
  if (isAccountLocked(user.locked_until)) {
    const remainingTime = Math.ceil(
      (new Date(user.locked_until) - new Date()) / 1000 / 60
    );

    return res.status(423).json({
      error: 'Account locked',
      message: `Account is locked due to too many failed attempts. Try again in ${remainingTime} minutes.`,
    });
  }

  // Check if account is active
  if (user.status !== 'active') {
    return res.status(401).json({
      error: 'Account inactive',
      message: 'Your account is not active. Please contact support.',
    });
  }

  // Verify password
  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    // Increment failed login attempts
    const shouldLock = await incrementLoginAttempts(user.user_id);

    if (shouldLock) {
      return res.status(423).json({
        error: 'Account locked',
        message: 'Account locked due to too many failed attempts. Try again in 30 minutes.',
      });
    }

    return res.status(401).json({
      error: 'Invalid credentials',
      message: 'Invalid email or password.',
    });
  }

  // Successful login - reset attempts and update last login
  await resetLoginAttempts(user.user_id);

  // Generate JWT token
  const tokenPayload = {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    type: 'access',
  };

  const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    issuer: 'auth-service',
    audience: 'medical-store',
  });

  // Log successful login
  await pool.query(
    'INSERT INTO user_activity_log (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
    [user.user_id, 'login', { success: true }, req.ip]
  );

  // Set HttpOnly cookie for security
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  // Return user info (no token in response body)
  res.json({
    success: true,
    message: 'Login successful',
    user: {
      user_id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
      email_verified: user.email_verified,
    },
    expires_in: process.env.JWT_EXPIRES_IN || '1d',
  });
});

module.exports = { register, login };
