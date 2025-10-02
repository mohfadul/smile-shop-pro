-- Reporting Service Database Schema
-- This schema handles analytics, reports, and scheduled reporting for the dental store platform

-- Create database if not exists
-- CREATE DATABASE reportingdb;

-- Scheduled reports table - manages automated report generation
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('sales', 'inventory', 'financial', 'customer', 'product', 'custom')),
  cron_expression VARCHAR(50) NOT NULL, -- e.g., '0 9 * * 1' for every Monday at 9 AM
  template JSONB NOT NULL, -- Report configuration and parameters
  recipients JSONB NOT NULL DEFAULT '[]', -- Array of email addresses
  google_drive_folder_id TEXT,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_by INT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Report runs table - tracks execution history of scheduled reports
CREATE TABLE IF NOT EXISTS report_runs (
  id SERIAL PRIMARY KEY,
  scheduled_report_id INT REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  file_path TEXT,
  file_url TEXT,
  google_drive_file_id TEXT,
  error_message TEXT,
  execution_time_ms INT,
  file_size_bytes BIGINT,
  record_count INT,
  parameters JSONB DEFAULT '{}',
  created_by INT
);

-- Report templates table - predefined report configurations
CREATE TABLE IF NOT EXISTS report_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(150) NOT NULL,
  description TEXT,
  report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('sales', 'inventory', 'financial', 'customer', 'product', 'custom')),
  query_template TEXT NOT NULL, -- SQL query template with placeholders
  parameters JSONB DEFAULT '[]', -- Array of parameter definitions
  output_formats JSONB DEFAULT '["pdf", "excel", "csv"]', -- Supported output formats
  chart_config JSONB, -- Chart configuration for visual reports
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Analytics cache table - stores pre-computed analytics data
CREATE TABLE IF NOT EXISTS analytics_cache (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(200) UNIQUE NOT NULL,
  metric_type VARCHAR(50) NOT NULL, -- 'sales', 'inventory', 'customers', etc.
  time_period VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly'
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  data JSONB NOT NULL,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Dashboard widgets table - configurable dashboard components
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  widget_type VARCHAR(50) NOT NULL CHECK (widget_type IN ('chart', 'metric', 'table', 'alert')),
  title VARCHAR(100) NOT NULL,
  position_x INT DEFAULT 0,
  position_y INT DEFAULT 0,
  width INT DEFAULT 4,
  height INT DEFAULT 3,
  config JSONB NOT NULL, -- Widget-specific configuration
  data_source VARCHAR(100), -- Reference to data source
  refresh_interval INT DEFAULT 300, -- Refresh interval in seconds
  is_visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Report subscriptions table - user subscriptions to reports
CREATE TABLE IF NOT EXISTS report_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  scheduled_report_id INT REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  delivery_method VARCHAR(20) DEFAULT 'email' CHECK (delivery_method IN ('email', 'whatsapp', 'dashboard')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, scheduled_report_id, delivery_method)
);

-- Exchange rates table - for multi-currency reporting
CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  from_currency VARCHAR(3) NOT NULL,
  to_currency VARCHAR(3) NOT NULL,
  rate DECIMAL(18,6) NOT NULL,
  effective_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  source VARCHAR(50) DEFAULT 'manual' -- 'manual', 'api', 'bank'
);

-- Admin audit log table - tracks all admin actions
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  admin_id INT NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL, -- 'user', 'product', 'order', 'payment', etc.
  target_id INT,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_enabled ON scheduled_reports(enabled);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run ON scheduled_reports(next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_type ON scheduled_reports(report_type);

CREATE INDEX IF NOT EXISTS idx_report_runs_scheduled_report ON report_runs(scheduled_report_id);
CREATE INDEX IF NOT EXISTS idx_report_runs_status ON report_runs(status);
CREATE INDEX IF NOT EXISTS idx_report_runs_started_at ON report_runs(started_at);

CREATE INDEX IF NOT EXISTS idx_report_templates_type ON report_templates(report_type);
CREATE INDEX IF NOT EXISTS idx_report_templates_active ON report_templates(is_active);

CREATE INDEX IF NOT EXISTS idx_analytics_cache_key ON analytics_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_expires ON analytics_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_metric_period ON analytics_cache(metric_type, time_period);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_user ON dashboard_widgets(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_visible ON dashboard_widgets(is_visible);

CREATE INDEX IF NOT EXISTS idx_report_subscriptions_user ON report_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_active ON report_subscriptions(is_active);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_effective ON exchange_rates(effective_at);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_type, target_id);

-- Insert default report templates
INSERT INTO report_templates (name, display_name, description, report_type, query_template, parameters, output_formats, chart_config) VALUES

-- Sales Reports
('daily_sales', 'Daily Sales Report', 'Daily sales summary with totals and trends', 'sales',
 'SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(total_amount) as revenue FROM orders WHERE created_at >= $1 AND created_at <= $2 GROUP BY DATE(created_at) ORDER BY date',
 '[{"name": "date_from", "type": "date", "required": true}, {"name": "date_to", "type": "date", "required": true}]',
 '["pdf", "excel", "csv"]',
 '{"type": "line", "x": "date", "y": "revenue", "title": "Daily Revenue Trend"}'),

('monthly_sales', 'Monthly Sales Report', 'Monthly sales analysis with product breakdown', 'sales',
 'SELECT DATE_TRUNC(''month'', o.created_at) as month, COUNT(o.id) as orders, SUM(o.total_amount) as revenue, COUNT(DISTINCT o.user_id) as customers FROM orders o WHERE o.created_at >= $1 AND o.created_at <= $2 GROUP BY month ORDER BY month',
 '[{"name": "date_from", "type": "date", "required": true}, {"name": "date_to", "type": "date", "required": true}]',
 '["pdf", "excel"]',
 '{"type": "bar", "x": "month", "y": "revenue", "title": "Monthly Revenue"}'),

-- Inventory Reports
('low_stock', 'Low Stock Report', 'Products with stock below minimum threshold', 'inventory',
 'SELECT p.name, p.sku, p.stock_quantity, p.low_stock_threshold, c.name as category FROM products p JOIN categories c ON p.category_id = c.id WHERE p.stock_quantity <= p.low_stock_threshold AND p.status = ''active'' ORDER BY p.stock_quantity ASC',
 '[]',
 '["pdf", "excel", "csv"]',
 '{"type": "table", "title": "Low Stock Items"}'),

('inventory_valuation', 'Inventory Valuation Report', 'Current inventory value by category', 'inventory',
 'SELECT c.name as category, COUNT(p.id) as products, SUM(p.stock_quantity) as total_stock, SUM(p.stock_quantity * p.price) as total_value FROM products p JOIN categories c ON p.category_id = c.id WHERE p.status = ''active'' GROUP BY c.name ORDER BY total_value DESC',
 '[]',
 '["pdf", "excel"]',
 '{"type": "pie", "label": "category", "value": "total_value", "title": "Inventory Value by Category"}'),

-- Financial Reports
('revenue_summary', 'Revenue Summary', 'Revenue breakdown by payment method and status', 'financial',
 'SELECT payment_method, payment_status, COUNT(*) as transactions, SUM(total_amount) as amount FROM orders WHERE created_at >= $1 AND created_at <= $2 GROUP BY payment_method, payment_status ORDER BY amount DESC',
 '[{"name": "date_from", "type": "date", "required": true}, {"name": "date_to", "type": "date", "required": true}]',
 '["pdf", "excel"]',
 '{"type": "bar", "x": "payment_method", "y": "amount", "title": "Revenue by Payment Method"}'),

-- Customer Reports
('customer_analysis', 'Customer Analysis', 'Customer behavior and purchase patterns', 'customer',
 'SELECT u.email, u.full_name, COUNT(o.id) as orders, SUM(o.total_amount) as total_spent, MAX(o.created_at) as last_order FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE u.role = ''customer'' GROUP BY u.id, u.email, u.full_name ORDER BY total_spent DESC LIMIT 100',
 '[]',
 '["pdf", "excel", "csv"]',
 '{"type": "table", "title": "Top Customers"}'),

-- Product Reports
('product_performance', 'Product Performance', 'Best and worst performing products', 'product',
 'SELECT p.name, p.sku, COUNT(oi.id) as times_ordered, SUM(oi.quantity) as total_quantity, SUM(oi.price * oi.quantity) as revenue FROM products p LEFT JOIN order_items oi ON p.id = oi.product_id LEFT JOIN orders o ON oi.order_id = o.id WHERE o.created_at >= $1 AND o.created_at <= $2 GROUP BY p.id, p.name, p.sku ORDER BY revenue DESC',
 '[{"name": "date_from", "type": "date", "required": true}, {"name": "date_to", "type": "date", "required": true}]',
 '["pdf", "excel"]',
 '{"type": "bar", "x": "name", "y": "revenue", "title": "Product Revenue Performance"}')

ON CONFLICT (name) DO NOTHING;

-- Insert default exchange rates (USD to SDG)
INSERT INTO exchange_rates (from_currency, to_currency, rate, created_by, source) VALUES
('USD', 'SDG', 600.00, 1, 'manual'),
('SDG', 'USD', 0.00167, 1, 'manual')
ON CONFLICT DO NOTHING;

-- Insert sample scheduled reports
INSERT INTO scheduled_reports (name, description, report_type, cron_expression, template, recipients, created_by) VALUES
('daily_sales_report', 'Daily sales summary sent every morning', 'sales', '0 8 * * *', 
 '{"template_name": "daily_sales", "parameters": {"date_from": "yesterday", "date_to": "yesterday"}, "format": "pdf"}',
 '["admin@dentalstore.sd", "manager@dentalstore.sd"]', 1),

('weekly_inventory_report', 'Weekly low stock alert', 'inventory', '0 9 * * 1',
 '{"template_name": "low_stock", "parameters": {}, "format": "excel"}',
 '["inventory@dentalstore.sd", "manager@dentalstore.sd"]', 1),

('monthly_financial_report', 'Monthly financial summary', 'financial', '0 10 1 * *',
 '{"template_name": "revenue_summary", "parameters": {"date_from": "last_month_start", "date_to": "last_month_end"}, "format": "pdf"}',
 '["finance@dentalstore.sd", "admin@dentalstore.sd"]', 1)

ON CONFLICT DO NOTHING;

-- Create a function to automatically set updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_scheduled_reports_updated_at BEFORE UPDATE ON scheduled_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_report_templates_updated_at BEFORE UPDATE ON report_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dashboard_widgets_updated_at BEFORE UPDATE ON dashboard_widgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a function to clean up expired analytics cache
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM analytics_cache WHERE expires_at < now();
END;
$$ language 'plpgsql';

-- Create a function to calculate next run time for scheduled reports
CREATE OR REPLACE FUNCTION calculate_next_run(cron_expr TEXT, last_run TIMESTAMP WITH TIME ZONE DEFAULT NULL)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    next_run TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Simple cron calculation for common patterns
    -- This is a simplified version - in production, use a proper cron library
    
    CASE 
        WHEN cron_expr = '0 8 * * *' THEN -- Daily at 8 AM
            next_run = (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '8 hours')::TIMESTAMP WITH TIME ZONE;
        WHEN cron_expr = '0 9 * * 1' THEN -- Weekly on Monday at 9 AM
            next_run = (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days' + INTERVAL '9 hours')::TIMESTAMP WITH TIME ZONE;
        WHEN cron_expr = '0 10 1 * *' THEN -- Monthly on 1st at 10 AM
            next_run = (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + INTERVAL '10 hours')::TIMESTAMP WITH TIME ZONE;
        ELSE
            next_run = (CURRENT_TIMESTAMP + INTERVAL '1 day')::TIMESTAMP WITH TIME ZONE;
    END CASE;
    
    RETURN next_run;
END;
$$ language 'plpgsql';

-- Update next_run_at for all scheduled reports
UPDATE scheduled_reports 
SET next_run_at = calculate_next_run(cron_expression, last_run_at)
WHERE enabled = true AND next_run_at IS NULL;
