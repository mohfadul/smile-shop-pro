const { Pool } = require('pg');

// Database connection configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings for production
  ...(process.env.NODE_ENV === 'production' && {
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
  }),
  // Development settings
  ...(process.env.NODE_ENV !== 'production' && {
    max: 10,
    idleTimeoutMillis: 10000,
  }),
};

// Create connection pool
const pool = new Pool(dbConfig);

// Event handlers for connection pool
pool.on('connect', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('New client connected to the database');
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err);
  // Don't exit the process, just log the error
});

pool.on('remove', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Client removed from pool');
  }
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connected successfully');
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
};

// Graceful shutdown
const closePool = async () => {
  try {
    await pool.end();
    console.log('Database pool closed');
  } catch (err) {
    console.error('Error closing database pool:', err);
  }
};

// Health check query
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT 1 as health_check');
    return result.rows[0].health_check === 1;
  } catch (err) {
    console.error('Health check failed:', err);
    return false;
  }
};

module.exports = {
  pool,
  testConnection,
  closePool,
  healthCheck,
};
