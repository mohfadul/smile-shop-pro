const { validationResult } = require('express-validator');

// Request validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Format errors for better client handling
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
    }));

    return res.status(400).json({
      error: 'Validation failed',
      message: 'Please check your input and try again.',
      validationErrors: formattedErrors,
    });
  }

  next();
};

module.exports = { validateRequest };
