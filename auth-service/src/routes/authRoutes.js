const express = require('express');
const { body, param, query } = require('express-validator');
const { 
  register, 
  login, 
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  getProfile,
  updateProfile,
  changePassword,
  deleteProfile,
  getSessions,
  revokeSession,
  revokeAllSessions
} = require('../controllers/authController');

// Import admin controllers
const {
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
  updateUserStatus,
  updateUserRole,
  getUserActivity,
  bulkUserOperations
} = require('../controllers/adminController');

// Import professional verification controllers
const {
  submitProfessionalVerification,
  getProfessionalStatus,
  approveProfessional,
  rejectProfessional,
  listPendingVerifications,
  getAllVerifications
} = require('../controllers/professionalController');
const { validateRequest } = require('../middlewares/validateRequest');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('first_name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name can only contain letters and spaces'),
  
  body('last_name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('role')
    .optional()
    .isIn(['customer', 'professional', 'admin', 'manager', 'staff'])
    .withMessage('Role must be one of: customer, professional, admin, manager, staff'),
  
  body('phone')
    .optional()
    .matches(/^(\+249|0)[0-9]{9}$/)
    .withMessage('Please provide a valid Sudanese phone number'),
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

const profileUpdateValidation = [
  body('first_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  
  body('last_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  
  body('phone')
    .optional()
    .matches(/^(\+249|0)[0-9]{9}$/)
    .withMessage('Please provide a valid Sudanese phone number'),
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
];

const professionalVerificationValidation = [
  body('license_number')
    .notEmpty()
    .withMessage('License number is required'),
  
  body('license_type')
    .isIn(['dentist', 'dental_technician', 'dental_hygienist', 'orthodontist', 'oral_surgeon'])
    .withMessage('Invalid license type'),
  
  body('institution')
    .notEmpty()
    .withMessage('Institution name is required'),
  
  body('graduation_year')
    .isInt({ min: 1950, max: new Date().getFullYear() })
    .withMessage('Invalid graduation year'),
];

// Authentication Routes
router.post('/register', registerValidation, validateRequest, register);
router.post('/login', loginValidation, validateRequest, login);
router.post('/logout', authenticateToken, logout);
router.post('/refresh', refreshToken);
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required')
], validateRequest, forgotPassword);
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], validateRequest, resetPassword);
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Verification token required')
], validateRequest, verifyEmail);
router.post('/resend-verification', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required')
], validateRequest, resendVerification);

// Profile Management Routes
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, profileUpdateValidation, validateRequest, updateProfile);
router.put('/change-password', authenticateToken, changePasswordValidation, validateRequest, changePassword);
router.delete('/profile', authenticateToken, deleteProfile);

// Session Management Routes
router.get('/sessions', authenticateToken, getSessions);
router.delete('/sessions/:sessionId', authenticateToken, [
  param('sessionId').isUUID().withMessage('Invalid session ID')
], validateRequest, revokeSession);
router.delete('/sessions', authenticateToken, revokeAllSessions);

// Admin Routes - User Management
router.get('/users', authenticateToken, authorizeRoles(['admin', 'manager']), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('role').optional().isIn(['customer', 'professional', 'admin', 'manager', 'staff']),
  query('status').optional().isIn(['active', 'inactive', 'suspended', 'pending'])
], validateRequest, listUsers);

router.get('/users/:id', authenticateToken, authorizeRoles(['admin', 'manager']), [
  param('id').isUUID().withMessage('Invalid user ID')
], validateRequest, getUserById);

router.put('/users/:id', authenticateToken, authorizeRoles(['admin']), [
  param('id').isUUID().withMessage('Invalid user ID'),
  body('first_name').optional().trim().isLength({ min: 2, max: 50 }),
  body('last_name').optional().trim().isLength({ min: 2, max: 50 }),
  body('phone').optional().matches(/^(\+249|0)[0-9]{9}$/)
], validateRequest, updateUser);

router.delete('/users/:id', authenticateToken, authorizeRoles(['admin']), [
  param('id').isUUID().withMessage('Invalid user ID')
], validateRequest, deleteUser);

router.put('/users/:id/status', authenticateToken, authorizeRoles(['admin', 'manager']), [
  param('id').isUUID().withMessage('Invalid user ID'),
  body('status').isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
], validateRequest, updateUserStatus);

router.put('/users/:id/role', authenticateToken, authorizeRoles(['admin']), [
  param('id').isUUID().withMessage('Invalid user ID'),
  body('role').isIn(['customer', 'professional', 'staff', 'manager']).withMessage('Invalid role')
], validateRequest, updateUserRole);

router.get('/users/:id/activity', authenticateToken, authorizeRoles(['admin', 'manager']), [
  param('id').isUUID().withMessage('Invalid user ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100')
], validateRequest, getUserActivity);

router.post('/users/bulk', authenticateToken, authorizeRoles(['admin']), [
  body('action').isIn(['delete', 'suspend', 'activate', 'change_role']).withMessage('Invalid bulk action'),
  body('user_ids').isArray({ min: 1 }).withMessage('User IDs array required'),
  body('user_ids.*').isUUID().withMessage('Invalid user ID format')
], validateRequest, bulkUserOperations);

// Professional Verification Routes
router.post('/professional/verify', authenticateToken, professionalVerificationValidation, validateRequest, submitProfessionalVerification);
router.get('/professional/status', authenticateToken, getProfessionalStatus);
router.put('/professional/approve', authenticateToken, authorizeRoles(['admin', 'manager']), [
  body('user_id').isUUID().withMessage('Invalid user ID'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes too long')
], validateRequest, approveProfessional);
router.put('/professional/reject', authenticateToken, authorizeRoles(['admin', 'manager']), [
  body('user_id').isUUID().withMessage('Invalid user ID'),
  body('reason').notEmpty().withMessage('Rejection reason required')
], validateRequest, rejectProfessional);
router.get('/professional/pending', authenticateToken, authorizeRoles(['admin', 'manager']), listPendingVerifications);
router.get('/professional/all', authenticateToken, authorizeRoles(['admin', 'manager']), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('status').optional().isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status')
], validateRequest, getAllVerifications);

// Health check route for load balancer
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

module.exports = router;