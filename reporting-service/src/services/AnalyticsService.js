const { pool } = require('../models/reportingModel');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'analytics' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class AnalyticsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Revenue Analytics
  async getRevenueAnalytics(period = '30d', currency = 'USD') {
    const cacheKey = `revenue_${period}_${currency}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const periodClause = this.getPeriodClause(period);
      
      const query = `
        WITH revenue_data AS (
          SELECT 
            DATE_TRUNC('day', o.created_at) as date,
            SUM(CASE WHEN o.currency = $1 THEN o.total_amount ELSE 0 END) as revenue,
            COUNT(o.order_id) as orders,
            AVG(CASE WHEN o.currency = $1 THEN o.total_amount ELSE NULL END) as avg_order_value,
            COUNT(DISTINCT o.user_id) as unique_customers
          FROM orders o
          WHERE o.status IN ('delivered', 'completed')
            AND o.created_at >= ${periodClause}
          GROUP BY DATE_TRUNC('day', o.created_at)
          ORDER BY date
        ),
        totals AS (
          SELECT 
            SUM(revenue) as total_revenue,
            SUM(orders) as total_orders,
            AVG(avg_order_value) as overall_avg_order_value,
            COUNT(DISTINCT date) as days_with_sales
          FROM revenue_data
        ),
        growth AS (
          SELECT 
            LAG(revenue) OVER (ORDER BY date) as prev_revenue,
            revenue,
            date
          FROM revenue_data
        )
        SELECT 
          rd.*,
          t.total_revenue,
          t.total_orders,
          t.overall_avg_order_value,
          CASE 
            WHEN g.prev_revenue > 0 
            THEN ((g.revenue - g.prev_revenue) / g.prev_revenue * 100)
            ELSE 0 
          END as daily_growth_rate
        FROM revenue_data rd
        CROSS JOIN totals t
        LEFT JOIN growth g ON rd.date = g.date
        ORDER BY rd.date
      `;

      const result = await pool.query(query, [currency]);
      
      const analytics = {
        period,
        currency,
        daily_data: result.rows,
        summary: {
          total_revenue: result.rows[0]?.total_revenue || 0,
          total_orders: result.rows[0]?.total_orders || 0,
          avg_order_value: result.rows[0]?.overall_avg_order_value || 0,
          days_with_sales: result.rows.length,
          avg_daily_revenue: result.rows.length > 0 
            ? (result.rows[0]?.total_revenue || 0) / result.rows.length 
            : 0
        }
      };

      this.cache.set(cacheKey, { data: analytics, timestamp: Date.now() });
      return analytics;

    } catch (error) {
      logger.error('Error getting revenue analytics:', error);
      throw error;
    }
  }

  // Customer Analytics
  async getCustomerAnalytics(period = '30d') {
    const cacheKey = `customers_${period}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const periodClause = this.getPeriodClause(period);
      
      const query = `
        WITH customer_metrics AS (
          SELECT 
            u.user_id,
            u.created_at as registration_date,
            COUNT(o.order_id) as total_orders,
            SUM(CASE WHEN o.status IN ('delivered', 'completed') THEN o.total_amount ELSE 0 END) as total_spent,
            MAX(o.created_at) as last_order_date,
            MIN(o.created_at) as first_order_date,
            CASE 
              WHEN COUNT(o.order_id) = 0 THEN 'No Orders'
              WHEN COUNT(o.order_id) = 1 THEN 'One-time'
              WHEN COUNT(o.order_id) BETWEEN 2 AND 5 THEN 'Regular'
              ELSE 'Loyal'
            END as customer_segment,
            CASE 
              WHEN MAX(o.created_at) >= NOW() - INTERVAL '30 days' THEN 'Active'
              WHEN MAX(o.created_at) >= NOW() - INTERVAL '90 days' THEN 'At Risk'
              ELSE 'Churned'
            END as customer_status
          FROM users u
          LEFT JOIN orders o ON u.user_id = o.user_id
          WHERE u.created_at >= ${periodClause}
          GROUP BY u.user_id, u.created_at
        ),
        cohort_analysis AS (
          SELECT 
            DATE_TRUNC('month', registration_date) as cohort_month,
            COUNT(*) as customers,
            COUNT(CASE WHEN total_orders > 0 THEN 1 END) as converted_customers,
            AVG(total_spent) as avg_ltv,
            COUNT(CASE WHEN customer_status = 'Active' THEN 1 END) as active_customers
          FROM customer_metrics
          GROUP BY DATE_TRUNC('month', registration_date)
          ORDER BY cohort_month
        )
        SELECT 
          cm.*,
          ca.cohort_month,
          ca.customers as cohort_size,
          ca.converted_customers,
          ca.avg_ltv as cohort_avg_ltv
        FROM customer_metrics cm
        LEFT JOIN cohort_analysis ca ON DATE_TRUNC('month', cm.registration_date) = ca.cohort_month
      `;

      const result = await pool.query(query);
      
      // Process results
      const customers = result.rows;
      const segments = {};
      const statuses = {};
      
      customers.forEach(customer => {
        segments[customer.customer_segment] = (segments[customer.customer_segment] || 0) + 1;
        statuses[customer.customer_status] = (statuses[customer.customer_status] || 0) + 1;
      });

      const analytics = {
        period,
        total_customers: customers.length,
        segments,
        statuses,
        metrics: {
          avg_orders_per_customer: customers.reduce((sum, c) => sum + c.total_orders, 0) / customers.length || 0,
          avg_customer_ltv: customers.reduce((sum, c) => sum + parseFloat(c.total_spent || 0), 0) / customers.length || 0,
          conversion_rate: customers.filter(c => c.total_orders > 0).length / customers.length * 100 || 0,
          retention_rate: customers.filter(c => c.customer_status === 'Active').length / customers.length * 100 || 0
        },
        cohorts: this.processCohortData(customers)
      };

      this.cache.set(cacheKey, { data: analytics, timestamp: Date.now() });
      return analytics;

    } catch (error) {
      logger.error('Error getting customer analytics:', error);
      throw error;
    }
  }

  // Product Performance Analytics
  async getProductAnalytics(period = '30d') {
    const cacheKey = `products_${period}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const periodClause = this.getPeriodClause(period);
      
      const query = `
        WITH product_sales AS (
          SELECT 
            p.product_id,
            p.name as product_name,
            p.category_id,
            c.name as category_name,
            p.price,
            p.stock_quantity,
            SUM(oi.quantity) as total_sold,
            SUM(oi.quantity * oi.price) as total_revenue,
            COUNT(DISTINCT o.order_id) as orders_count,
            COUNT(DISTINCT o.user_id) as unique_buyers,
            AVG(oi.price) as avg_selling_price,
            MAX(o.created_at) as last_sold_date
          FROM products p
          LEFT JOIN order_items oi ON p.product_id = oi.product_id
          LEFT JOIN orders o ON oi.order_id = o.order_id
          LEFT JOIN categories c ON p.category_id = c.category_id
          WHERE o.created_at >= ${periodClause} OR o.created_at IS NULL
          GROUP BY p.product_id, p.name, p.category_id, c.name, p.price, p.stock_quantity
        ),
        category_performance AS (
          SELECT 
            category_id,
            category_name,
            COUNT(*) as products_count,
            SUM(total_sold) as category_sales,
            SUM(total_revenue) as category_revenue,
            AVG(total_sold) as avg_sales_per_product
          FROM product_sales
          WHERE total_sold > 0
          GROUP BY category_id, category_name
        ),
        inventory_analysis AS (
          SELECT 
            product_id,
            CASE 
              WHEN stock_quantity = 0 THEN 'Out of Stock'
              WHEN stock_quantity <= 5 THEN 'Low Stock'
              WHEN stock_quantity <= 20 THEN 'Medium Stock'
              ELSE 'High Stock'
            END as stock_status,
            CASE 
              WHEN total_sold = 0 THEN 'No Sales'
              WHEN total_sold <= 5 THEN 'Low Performer'
              WHEN total_sold <= 20 THEN 'Medium Performer'
              ELSE 'High Performer'
            END as performance_tier
          FROM product_sales
        )
        SELECT 
          ps.*,
          ia.stock_status,
          ia.performance_tier,
          cp.category_sales,
          cp.category_revenue,
          RANK() OVER (ORDER BY ps.total_revenue DESC) as revenue_rank,
          RANK() OVER (ORDER BY ps.total_sold DESC) as sales_rank
        FROM product_sales ps
        LEFT JOIN inventory_analysis ia ON ps.product_id = ia.product_id
        LEFT JOIN category_performance cp ON ps.category_id = cp.category_id
        ORDER BY ps.total_revenue DESC
      `;

      const result = await pool.query(query);
      
      const products = result.rows;
      const categories = {};
      const stockStatus = {};
      const performanceTiers = {};
      
      products.forEach(product => {
        const catName = product.category_name || 'Uncategorized';
        if (!categories[catName]) {
          categories[catName] = {
            products_count: 0,
            total_sales: 0,
            total_revenue: 0
          };
        }
        categories[catName].products_count++;
        categories[catName].total_sales += product.total_sold || 0;
        categories[catName].total_revenue += parseFloat(product.total_revenue || 0);
        
        stockStatus[product.stock_status] = (stockStatus[product.stock_status] || 0) + 1;
        performanceTiers[product.performance_tier] = (performanceTiers[product.performance_tier] || 0) + 1;
      });

      const analytics = {
        period,
        total_products: products.length,
        top_products: products.slice(0, 10),
        categories,
        stock_analysis: stockStatus,
        performance_analysis: performanceTiers,
        metrics: {
          total_products_sold: products.reduce((sum, p) => sum + (p.total_sold || 0), 0),
          total_product_revenue: products.reduce((sum, p) => sum + parseFloat(p.total_revenue || 0), 0),
          avg_products_per_order: products.reduce((sum, p) => sum + (p.orders_count || 0), 0) / products.length || 0,
          inventory_turnover: this.calculateInventoryTurnover(products)
        }
      };

      this.cache.set(cacheKey, { data: analytics, timestamp: Date.now() });
      return analytics;

    } catch (error) {
      logger.error('Error getting product analytics:', error);
      throw error;
    }
  }

  // Geographic Analytics (Sudan-specific)
  async getGeographicAnalytics(period = '30d') {
    try {
      const periodClause = this.getPeriodClause(period);
      
      const query = `
        WITH geographic_data AS (
          SELECT 
            COALESCE(o.shipping_address->>'state', 'Unknown') as state,
            COALESCE(o.shipping_address->>'city', 'Unknown') as city,
            COUNT(o.order_id) as orders,
            SUM(o.total_amount) as revenue,
            COUNT(DISTINCT o.user_id) as customers,
            AVG(o.total_amount) as avg_order_value
          FROM orders o
          WHERE o.created_at >= ${periodClause}
            AND o.status IN ('delivered', 'completed')
          GROUP BY 
            COALESCE(o.shipping_address->>'state', 'Unknown'),
            COALESCE(o.shipping_address->>'city', 'Unknown')
        ),
        state_totals AS (
          SELECT 
            state,
            SUM(orders) as state_orders,
            SUM(revenue) as state_revenue,
            SUM(customers) as state_customers,
            COUNT(*) as cities_count
          FROM geographic_data
          GROUP BY state
        )
        SELECT 
          gd.*,
          st.state_orders,
          st.state_revenue,
          st.state_customers,
          st.cities_count,
          RANK() OVER (ORDER BY gd.revenue DESC) as revenue_rank
        FROM geographic_data gd
        LEFT JOIN state_totals st ON gd.state = st.state
        ORDER BY gd.revenue DESC
      `;

      const result = await pool.query(query);
      
      const locations = result.rows;
      const states = {};
      
      locations.forEach(location => {
        if (!states[location.state]) {
          states[location.state] = {
            orders: location.state_orders,
            revenue: parseFloat(location.state_revenue),
            customers: location.state_customers,
            cities: [],
            cities_count: location.cities_count
          };
        }
        
        states[location.state].cities.push({
          city: location.city,
          orders: location.orders,
          revenue: parseFloat(location.revenue),
          customers: location.customers,
          avg_order_value: parseFloat(location.avg_order_value)
        });
      });

      return {
        period,
        states,
        top_locations: locations.slice(0, 10),
        metrics: {
          total_states: Object.keys(states).length,
          total_cities: locations.length,
          geographic_concentration: this.calculateGeographicConcentration(states)
        }
      };

    } catch (error) {
      logger.error('Error getting geographic analytics:', error);
      throw error;
    }
  }

  // Payment Method Analytics
  async getPaymentAnalytics(period = '30d') {
    try {
      const periodClause = this.getPeriodClause(period);
      
      const query = `
        SELECT 
          o.payment_method,
          o.payment_status,
          COUNT(*) as transactions,
          SUM(o.total_amount) as total_amount,
          AVG(o.total_amount) as avg_transaction_value,
          COUNT(CASE WHEN o.payment_status = 'paid' THEN 1 END) as successful_payments,
          COUNT(CASE WHEN o.payment_status = 'failed' THEN 1 END) as failed_payments,
          COUNT(CASE WHEN o.payment_status = 'pending' THEN 1 END) as pending_payments
        FROM orders o
        WHERE o.created_at >= ${periodClause}
        GROUP BY o.payment_method, o.payment_status
        ORDER BY total_amount DESC
      `;

      const result = await pool.query(query);
      
      const payments = result.rows;
      const methods = {};
      
      payments.forEach(payment => {
        if (!methods[payment.payment_method]) {
          methods[payment.payment_method] = {
            total_transactions: 0,
            total_amount: 0,
            successful: 0,
            failed: 0,
            pending: 0,
            success_rate: 0
          };
        }
        
        const method = methods[payment.payment_method];
        method.total_transactions += payment.transactions;
        method.total_amount += parseFloat(payment.total_amount);
        method.successful += payment.successful_payments;
        method.failed += payment.failed_payments;
        method.pending += payment.pending_payments;
      });

      // Calculate success rates
      Object.keys(methods).forEach(methodName => {
        const method = methods[methodName];
        method.success_rate = method.total_transactions > 0 
          ? (method.successful / method.total_transactions * 100) 
          : 0;
      });

      return {
        period,
        payment_methods: methods,
        raw_data: payments,
        metrics: {
          total_transactions: payments.reduce((sum, p) => sum + p.transactions, 0),
          total_amount: payments.reduce((sum, p) => sum + parseFloat(p.total_amount), 0),
          overall_success_rate: this.calculateOverallSuccessRate(payments)
        }
      };

    } catch (error) {
      logger.error('Error getting payment analytics:', error);
      throw error;
    }
  }

  // Helper Methods
  getPeriodClause(period) {
    const periodMap = {
      '7d': "NOW() - INTERVAL '7 days'",
      '30d': "NOW() - INTERVAL '30 days'",
      '90d': "NOW() - INTERVAL '90 days'",
      '1y': "NOW() - INTERVAL '1 year'",
      'ytd': "DATE_TRUNC('year', NOW())",
      'mtd': "DATE_TRUNC('month', NOW())"
    };
    
    return periodMap[period] || periodMap['30d'];
  }

  processCohortData(customers) {
    const cohorts = {};
    
    customers.forEach(customer => {
      const cohortMonth = new Date(customer.registration_date).toISOString().slice(0, 7);
      if (!cohorts[cohortMonth]) {
        cohorts[cohortMonth] = {
          total_customers: 0,
          converted_customers: 0,
          total_revenue: 0,
          avg_ltv: 0
        };
      }
      
      cohorts[cohortMonth].total_customers++;
      if (customer.total_orders > 0) {
        cohorts[cohortMonth].converted_customers++;
        cohorts[cohortMonth].total_revenue += parseFloat(customer.total_spent || 0);
      }
    });

    // Calculate averages
    Object.keys(cohorts).forEach(month => {
      const cohort = cohorts[month];
      cohort.conversion_rate = cohort.converted_customers / cohort.total_customers * 100;
      cohort.avg_ltv = cohort.converted_customers > 0 
        ? cohort.total_revenue / cohort.converted_customers 
        : 0;
    });

    return cohorts;
  }

  calculateInventoryTurnover(products) {
    const totalSold = products.reduce((sum, p) => sum + (p.total_sold || 0), 0);
    const totalStock = products.reduce((sum, p) => sum + (p.stock_quantity || 0), 0);
    
    return totalStock > 0 ? totalSold / totalStock : 0;
  }

  calculateGeographicConcentration(states) {
    const revenues = Object.values(states).map(s => s.revenue);
    const totalRevenue = revenues.reduce((sum, r) => sum + r, 0);
    
    if (totalRevenue === 0) return 0;
    
    // Calculate Herfindahl-Hirschman Index for concentration
    const hhi = revenues.reduce((sum, revenue) => {
      const marketShare = revenue / totalRevenue;
      return sum + (marketShare * marketShare);
    }, 0);
    
    return hhi * 10000; // Convert to standard HHI scale
  }

  calculateOverallSuccessRate(payments) {
    const totalTransactions = payments.reduce((sum, p) => sum + p.transactions, 0);
    const successfulTransactions = payments.reduce((sum, p) => sum + p.successful_payments, 0);
    
    return totalTransactions > 0 ? (successfulTransactions / totalTransactions * 100) : 0;
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    logger.info('Analytics cache cleared');
  }
}

module.exports = new AnalyticsService();
