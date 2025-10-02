// Async error wrapper for route handlers
// This utility wraps async functions to catch rejected promises and pass them to the error handler

module.exports = (fn) => {
  return (req, res, next) => {
    // Execute the function and catch any promise rejections
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
