const { pool } = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');

// Submit Professional Verification
const submitProfessionalVerification = catchAsync(async (req, res) => {
  const { license_number, license_type, institution, graduation_year, documents } = req.body;
  const userId = req.user.user_id;

  // Check if user already has a pending or approved verification
  const existingVerification = await pool.query(
    `SELECT verification_id, status FROM professional_verifications 
     WHERE user_id = $1 AND status IN ('pending', 'approved')`,
    [userId]
  );

  if (existingVerification.rows.length > 0) {
    const status = existingVerification.rows[0].status;
    return res.status(400).json({
      success: false,
      error: 'Verification exists',
      message: status === 'approved' 
        ? 'You are already verified as a professional'
        : 'You already have a pending verification request'
    });
  }

  // Create verification request
  const result = await pool.query(
    `INSERT INTO professional_verifications 
     (user_id, license_number, license_type, institution, graduation_year, documents, status, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
     RETURNING verification_id, status, submitted_at`,
    [userId, license_number, license_type, institution, graduation_year, JSON.stringify(documents || [])]
  );

  // Update user role to professional (pending verification)
  await pool.query(
    'UPDATE users SET role = $1, updated_at = NOW() WHERE user_id = $2',
    ['professional', userId]
  );

  res.status(201).json({
    success: true,
    message: 'Professional verification submitted successfully',
    data: {
      verification_id: result.rows[0].verification_id,
      status: result.rows[0].status,
      submitted_at: result.rows[0].submitted_at
    }
  });
});

// Get Professional Status
const getProfessionalStatus = catchAsync(async (req, res) => {
  const userId = req.user.user_id;

  const verification = await pool.query(
    `SELECT verification_id, license_number, license_type, institution, 
            graduation_year, status, submitted_at, reviewed_at, reviewed_by, notes
     FROM professional_verifications 
     WHERE user_id = $1 
     ORDER BY submitted_at DESC 
     LIMIT 1`,
    [userId]
  );

  if (verification.rows.length === 0) {
    return res.json({
      success: true,
      data: {
        status: 'not_submitted',
        message: 'No professional verification submitted'
      }
    });
  }

  const verificationData = verification.rows[0];
  
  // Get reviewer info if reviewed
  let reviewerInfo = null;
  if (verificationData.reviewed_by) {
    const reviewer = await pool.query(
      'SELECT first_name, last_name FROM users WHERE user_id = $1',
      [verificationData.reviewed_by]
    );
    if (reviewer.rows.length > 0) {
      reviewerInfo = `${reviewer.rows[0].first_name} ${reviewer.rows[0].last_name}`;
    }
  }

  res.json({
    success: true,
    data: {
      verification_id: verificationData.verification_id,
      license_number: verificationData.license_number,
      license_type: verificationData.license_type,
      institution: verificationData.institution,
      graduation_year: verificationData.graduation_year,
      status: verificationData.status,
      submitted_at: verificationData.submitted_at,
      reviewed_at: verificationData.reviewed_at,
      reviewed_by: reviewerInfo,
      notes: verificationData.notes
    }
  });
});

// Admin: Approve Professional
const approveProfessional = catchAsync(async (req, res) => {
  const { user_id, notes } = req.body;
  const reviewerId = req.user.user_id;

  // Get the verification request
  const verification = await pool.query(
    `SELECT verification_id, status FROM professional_verifications 
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY submitted_at DESC 
     LIMIT 1`,
    [user_id]
  );

  if (verification.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Verification not found',
      message: 'No pending verification found for this user'
    });
  }

  // Update verification status
  await pool.query(
    `UPDATE professional_verifications 
     SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1, notes = $2
     WHERE verification_id = $3`,
    [reviewerId, notes, verification.rows[0].verification_id]
  );

  // Update user status to verified professional
  await pool.query(
    `UPDATE users 
     SET role = 'professional', status = 'active', updated_at = NOW() 
     WHERE user_id = $1`,
    [user_id]
  );

  // Log activity
  await pool.query(
    'INSERT INTO user_activity_log (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
    [user_id, 'professional_approved', { approved_by: reviewerId, notes }, req.ip]
  );

  res.json({
    success: true,
    message: 'Professional verification approved successfully'
  });
});

// Admin: Reject Professional
const rejectProfessional = catchAsync(async (req, res) => {
  const { user_id, reason } = req.body;
  const reviewerId = req.user.user_id;

  // Get the verification request
  const verification = await pool.query(
    `SELECT verification_id, status FROM professional_verifications 
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY submitted_at DESC 
     LIMIT 1`,
    [user_id]
  );

  if (verification.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Verification not found',
      message: 'No pending verification found for this user'
    });
  }

  // Update verification status
  await pool.query(
    `UPDATE professional_verifications 
     SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1, notes = $2
     WHERE verification_id = $3`,
    [reviewerId, reason, verification.rows[0].verification_id]
  );

  // Revert user role to customer
  await pool.query(
    `UPDATE users 
     SET role = 'customer', updated_at = NOW() 
     WHERE user_id = $1`,
    [user_id]
  );

  // Log activity
  await pool.query(
    'INSERT INTO user_activity_log (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
    [user_id, 'professional_rejected', { rejected_by: reviewerId, reason }, req.ip]
  );

  res.json({
    success: true,
    message: 'Professional verification rejected successfully'
  });
});

// Admin: List Pending Verifications
const listPendingVerifications = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    'SELECT COUNT(*) FROM professional_verifications WHERE status = $1',
    ['pending']
  );

  const verifications = await pool.query(
    `SELECT pv.verification_id, pv.user_id, pv.license_number, pv.license_type, 
            pv.institution, pv.graduation_year, pv.submitted_at,
            u.first_name, u.last_name, u.email, u.phone
     FROM professional_verifications pv
     JOIN users u ON pv.user_id = u.user_id
     WHERE pv.status = 'pending'
     ORDER BY pv.submitted_at ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const totalVerifications = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalVerifications / limit);

  res.json({
    success: true,
    data: {
      verifications: verifications.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalVerifications,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Admin: Get All Verifications (with status filter)
const getAllVerifications = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const values = [];
  let paramCount = 0;

  if (status) {
    whereClause += ` AND pv.status = $${++paramCount}`;
    values.push(status);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM professional_verifications pv ${whereClause}`,
    values
  );

  const verifications = await pool.query(
    `SELECT pv.verification_id, pv.user_id, pv.license_number, pv.license_type, 
            pv.institution, pv.graduation_year, pv.status, pv.submitted_at, 
            pv.reviewed_at, pv.notes,
            u.first_name, u.last_name, u.email, u.phone,
            r.first_name as reviewer_first_name, r.last_name as reviewer_last_name
     FROM professional_verifications pv
     JOIN users u ON pv.user_id = u.user_id
     LEFT JOIN users r ON pv.reviewed_by = r.user_id
     ${whereClause}
     ORDER BY pv.submitted_at DESC
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalVerifications = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalVerifications / limit);

  res.json({
    success: true,
    data: {
      verifications: verifications.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalVerifications,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

module.exports = {
  submitProfessionalVerification,
  getProfessionalStatus,
  approveProfessional,
  rejectProfessional,
  listPendingVerifications,
  getAllVerifications
};
