// Performance optimization utilities for dental store microservices

const NodeCache = require('node-cache');

// Cache configuration
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60, // Check for expired keys every 60 seconds
  maxKeys: 1000, // Maximum number of keys
  deleteOnExpire: true,
  useClones: false, // Don't clone objects for better performance
});

// Cache key generators
const generateUserCacheKey = (userId, action) => `user:${userId}:${action}`;
const generateProductCacheKey = (productId, action) => `product:${productId}:${action}`;
const generateOrderCacheKey = (orderId, action) => `order:${orderId}:${action}`;
const generateCategoryCacheKey = (categoryId) => `category:${categoryId}`;

// Cache TTL configurations
const CACHE_TTL = {
  USER_PROFILE: 600, // 10 minutes
  PRODUCT_DETAILS: 1800, // 30 minutes
  PRODUCT_LIST: 300, // 5 minutes
  CATEGORY_LIST: 3600, // 1 hour
  ORDER_DETAILS: 300, // 5 minutes
  ORDER_LIST: 180, // 3 minutes
  EXCHANGE_RATE: 3600, // 1 hour (external data)
};

// Cache management functions
const setCache = (key, value, ttl = CACHE_TTL.USER_PROFILE) => {
  return cache.set(key, value, ttl);
};

const getCache = (key) => {
  return cache.get(key);
};

const deleteCache = (key) => {
  return cache.del(key);
};

const flushCache = () => {
  return cache.flushAll();
};

// Cache invalidation helpers
const invalidateUserCache = (userId) => {
  const keys = cache.keys().filter(key => key.startsWith(`user:${userId}:`));
  keys.forEach(key => cache.del(key));
};

const invalidateProductCache = (productId) => {
  const keys = cache.keys().filter(key => key.startsWith(`product:${productId}:`));
  keys.forEach(key => cache.del(key));
};

const invalidateOrderCache = (orderId) => {
  const keys = cache.keys().filter(key => key.startsWith(`order:${orderId}:`));
  keys.forEach(key => cache.del(key));
};

// Database query optimization
const optimizeQuery = (query, params) => {
  // Log slow queries in development
  if (process.env.NODE_ENV === 'development') {
    const startTime = Date.now();

    return {
      execute: async () => {
        const result = await query.execute(params);
        const duration = Date.now() - startTime;

        if (duration > 100) { // Log queries slower than 100ms
          console.warn(`Slow query detected: ${duration}ms`, {
            query: query.toString(),
            params,
            duration
          });
        }

        return result;
      }
    };
  }

  return { execute: () => query.execute(params) };
};

// Pagination helper
const createPagination = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    total,
    page,
    limit,
    pages: totalPages,
    has_next: hasNext,
    has_prev: hasPrev,
    next_page: hasNext ? page + 1 : null,
    prev_page: hasPrev ? page - 1 : null,
  };
};

// Response time tracking
const trackResponseTime = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const method = req.method;
    const url = req.originalUrl;
    const statusCode = res.statusCode;

    // Log slow responses
    if (duration > 1000) { // Responses slower than 1 second
      console.warn(`Slow response: ${duration}ms`, {
        method,
        url,
        statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    }

    // Add response time header
    res.setHeader('X-Response-Time', `${duration}ms`);
  });

  next();
};

// Memory usage monitoring
const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`, // Resident Set Size
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(usage.external / 1024 / 1024)}MB`,
  };
};

// Database connection health check
const checkDatabaseHealth = async (pool) => {
  try {
    const startTime = Date.now();
    await pool.query('SELECT 1');
    const responseTime = Date.now() - startTime;

    return {
      status: 'healthy',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

// Service health check aggregator
const createHealthCheck = (pool, serviceName) => {
  return async () => {
    const dbHealth = await checkDatabaseHealth(pool);
    const memoryUsage = getMemoryUsage();
    const uptime = process.uptime();

    const health = {
      service: serviceName,
      status: dbHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: `${Math.round(uptime)}s`,
      database: dbHealth,
      memory: memoryUsage,
      cache: {
        keys: cache.keys().length,
        hits: cache.getStats().hits,
        misses: cache.getStats().misses,
      },
    };

    return health;
  };
};

// Batch processing helper
const processBatch = async (items, batchSize, processor) => {
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
};

// Debounce helper for expensive operations
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Export all utilities
module.exports = {
  cache,
  setCache,
  getCache,
  deleteCache,
  flushCache,
  generateUserCacheKey,
  generateProductCacheKey,
  generateOrderCacheKey,
  generateCategoryCacheKey,
  CACHE_TTL,
  invalidateUserCache,
  invalidateProductCache,
  invalidateOrderCache,
  optimizeQuery,
  createPagination,
  trackResponseTime,
  getMemoryUsage,
  checkDatabaseHealth,
  createHealthCheck,
  processBatch,
  debounce,
};
