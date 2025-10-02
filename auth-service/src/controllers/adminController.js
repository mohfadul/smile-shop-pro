const { pool } = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');

// Admin: List Users
const listUsers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, role, status, search } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const values = [];
  let paramCount = 0;

  if (role) {
    whereClause += ` AND role = $${++paramCount}`;
    values.push(role);
  }
  if (status) {
    whereClause += ` AND status = $${++paramCount}`;
    values.push(status);
  }
  if (search) {
    whereClause += ` AND (first_name ILIKE $${++paramCount} OR last_name ILIKE $${++paramCount} OR email ILIKE $${++paramCount})`;
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    paramCount += 2;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM users ${whereClause}`,
    values
  );

  const usersResult = await pool.query(
    `SELECT user_id, first_name, last_name, email, phone, role, status, 
            email_verified, last_login_at, created_at, updated_at
     FROM users ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${++paramCount} OFFSET $${++paramCount}`,
    [...values, limit, offset]
  );

  const totalUsers = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalUsers / limit);

  res.json({
    success: true,
    data: {
      users: usersResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalUsers,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
});

// Admin: Get User by ID
const getUserById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const user = await pool.query(
    `SELECT user_id, first_name, last_name, email, phone, role, status, 
            email_verified, last_login_at, login_attempts, locked_until, created_at, updated_at
     FROM users WHERE user_id = $1`,
    [id]
  );

  if (user.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
      message: 'User with the specified ID does not exist'
    });
  }

  res.json({
    success: true,
    data: user.rows[0]
  });
});

// Admin: Update User
const updateUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, phone, email } = req.body;

  const updates = {};
  const values = [];
  let paramCount = 0;

  if (first_name !== undefined) {
    updates.first_name = `$${++paramCount}`;
    values.push(first_name);
  }
  if (last_name !== undefined) {
    updates.last_name = `$${++paramCount}`;
    values.push(last_name);
  }
  if (phone !== undefined) {
    updates.phone = `$${++paramCount}`;
    values.push(phone);
  }
  if (email !== undefined) {
    updates.email = `$${++paramCount}`;
    values.push(email);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No updates provided',
      message: 'Please provide at least one field to update'
    });
  }

  const setClause = Object.keys(updates).map(key => `${key} = ${updates[key]}`).join(', ');
  values.push(id);

  const result = await pool.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() 
     WHERE user_id = $${++paramCount} 
     RETURNING user_id, first_name, last_name, email, phone, role, status, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
      message: 'User with the specified ID does not exist'
    });
  }

  res.json({
    success: true,
    message: 'User updated successfully',
    data: result.rows[0]
  });
});

// Admin: Delete User
const deleteUser = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    'UPDATE users SET status = $1, updated_at = NOW() WHERE user_id = $2 RETURNING user_id',
    ['inactive', id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
      message: 'User with the specified ID does not exist'
    });
  }

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// Admin: Update User Status
const updateUserStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await pool.query(
    'UPDATE users SET status = $1, updated_at = NOW() WHERE user_id = $2 RETURNING user_id, status',
    [status, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
      message: 'User with the specified ID does not exist'
    });
  }

  res.json({
    success: true,
    message: 'User status updated successfully',
    data: result.rows[0]
  });
});

// Admin: Update User Role
const updateUserRole = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const result = await pool.query(
    'UPDATE users SET role = $1, updated_at = NOW() WHERE user_id = $2 RETURNING user_id, role',
    [role, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
      message: 'User with the specified ID does not exist'
    });
  }

  res.json({
    success: true,
    message: 'User role updated successfully',
    data: result.rows[0]
  });
});

// Admin: Get User Activity
const getUserActivity = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;

  const activity = await pool.query(
    `SELECT action, details, ip_address, created_at
     FROM user_activity_log 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [id, limit]
  );

  res.json({
    success: true,
    data: activity.rows
  });
});

// Admin: Bulk User Operations
const bulkUserOperations = catchAsync(async (req, res) => {
  const { action, user_ids, role } = req.body;

  let query;
  let values;

  switch (action) {
    case 'delete':
      query = 'UPDATE users SET status = $1, updated_at = NOW() WHERE user_id = ANY($2)';
      values = ['inactive', user_ids];
      break;
    case 'suspend':
      query = 'UPDATE users SET status = $1, updated_at = NOW() WHERE user_id = ANY($2)';
      values = ['suspended', user_ids];
      break;
    case 'activate':
      query = 'UPDATE users SET status = $1, updated_at = NOW() WHERE user_id = ANY($2)';
      values = ['active', user_ids];
      break;
    case 'change_role':
      if (!role) {
        return res.status(400).json({
          success: false,
          error: 'Role required',
          message: 'Role is required for change_role action'
        });
      }
      query = 'UPDATE users SET role = $1, updated_at = NOW() WHERE user_id = ANY($2)';
      values = [role, user_ids];
      break;
    default:
      return res.status(400).json({
        success: false,
        error: 'Invalid action',
        message: 'Invalid bulk action specified'
      });
  }

  const result = await pool.query(query, values);

  res.json({
    success: true,
    message: `Bulk ${action} completed successfully`,
    affected_count: result.rowCount
  });
});

module.exports = {
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
  updateUserStatus,
  updateUserRole,
  getUserActivity,
  bulkUserOperations
};
