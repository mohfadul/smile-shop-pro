-- =============================================================================
-- REPORTING SERVICE DATABASE MIGRATION
-- Dental Store Sudan - Analytics & Reporting Management
-- Migration: 007_reporting_service_schema.sql
-- =============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types for reporting management
DO $$ BEGIN
    CREATE TYPE report_type AS ENUM (
        'sales', 'inventory', 'customer', 'financial', 'operational', 'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE report_format AS ENUM (
        'pdf', 'excel', 'csv', 'json', 'html'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE report_status AS ENUM (
        'pending', 'generating', 'completed', 'failed', 'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE schedule_frequency AS ENUM (
        'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- REPORT DEFINITIONS TABLE - Predefined report templates
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_definitions (
    definition_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    
    -- Report configuration
    type report_type NOT NULL,
    category VARCHAR(50), -- 'dashboard', 'management', 'compliance', 'analysis'
    
    -- Query configuration
    base_query TEXT NOT NULL, -- Base SQL query for the report
    parameters JSONB DEFAULT '[]', -- Array of parameter definitions
    filters JSONB DEFAULT '[]', -- Available filter options
    
    -- Display configuration
    columns JSONB NOT NULL, -- Column definitions with formatting
    default_sort JSONB, -- Default sorting configuration
    grouping JSONB, -- Grouping configuration
    aggregations JSONB, -- Aggregation functions
    
    -- Chart configuration (for dashboard reports)
    chart_config JSONB, -- Chart type and configuration
    
    -- Access control
    required_roles JSONB DEFAULT '["admin"]', -- Roles that can access this report
    is_public BOOLEAN DEFAULT false,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_system_report BOOLEAN DEFAULT false, -- Cannot be deleted
    
    -- Metadata
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID -- References users table
);

-- =============================================================================
-- GENERATED REPORTS TABLE - Individual report instances
-- =============================================================================
CREATE TABLE IF NOT EXISTS generated_reports (
    report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    definition_id UUID REFERENCES report_definitions(definition_id),
    
    -- Report details
    name VARCHAR(200) NOT NULL,
    type report_type NOT NULL,
    format report_format NOT NULL,
    status report_status DEFAULT 'pending',
    
    -- Generation parameters
    parameters JSONB DEFAULT '{}', -- Parameters used for generation
    filters JSONB DEFAULT '{}', -- Filters applied
    date_range JSONB, -- Date range for the report
    
    -- File information
    file_path TEXT, -- Path to generated file
    file_size BIGINT, -- File size in bytes
    file_url TEXT, -- URL to access the file (if stored externally)
    
    -- Generation details
    generated_at TIMESTAMP WITH TIME ZONE,
    generated_by UUID, -- References users table
    generation_time_ms INTEGER, -- Time taken to generate in milliseconds
    
    -- Data summary
    total_records INTEGER,
    data_summary JSONB, -- Summary statistics about the data
    
    -- Expiration and cleanup
    expires_at TIMESTAMP WITH TIME ZONE,
    auto_delete BOOLEAN DEFAULT true,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    
    -- Additional information
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- REPORT SCHEDULES TABLE - Automated report generation
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_schedules (
    schedule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    definition_id UUID NOT NULL REFERENCES report_definitions(definition_id),
    
    -- Schedule details
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Schedule configuration
    frequency schedule_frequency NOT NULL,
    schedule_time TIME NOT NULL, -- Time of day to run
    schedule_day INTEGER, -- Day of week (1-7) or month (1-31)
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Generation parameters
    parameters JSONB DEFAULT '{}',
    filters JSONB DEFAULT '{}',
    format report_format DEFAULT 'pdf',
    
    -- Recipients
    recipients JSONB NOT NULL, -- Array of email addresses
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Execution tracking
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    run_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    
    -- Error handling
    max_failures INTEGER DEFAULT 3,
    last_error TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID -- References users table
);

-- =============================================================================
-- ANALYTICS CACHE TABLE - Cached analytics data
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics_cache (
    cache_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(255) NOT NULL UNIQUE,
    
    -- Cache details
    category VARCHAR(50) NOT NULL, -- 'sales', 'inventory', 'customers', etc.
    subcategory VARCHAR(50),
    
    -- Cached data
    data JSONB NOT NULL,
    
    -- Cache metadata
    parameters JSONB DEFAULT '{}', -- Parameters used to generate the data
    date_range JSONB, -- Date range for the cached data
    
    -- Cache management
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    hit_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Data freshness
    data_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- When the underlying data was last updated
    
    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Constraints
    CONSTRAINT analytics_cache_expires_at_future CHECK (expires_at > created_at)
);

-- =============================================================================
-- DASHBOARD WIDGETS TABLE - Dashboard widget configurations
-- =============================================================================
CREATE TABLE IF NOT EXISTS dashboard_widgets (
    widget_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Widget details
    name VARCHAR(200) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Widget type and configuration
    widget_type VARCHAR(50) NOT NULL, -- 'chart', 'metric', 'table', 'gauge', 'map'
    chart_type VARCHAR(50), -- 'line', 'bar', 'pie', 'doughnut', 'area', etc.
    
    -- Data source
    data_source VARCHAR(100) NOT NULL, -- 'query', 'api', 'cache_key'
    query TEXT, -- SQL query for data
    api_endpoint VARCHAR(255), -- API endpoint for data
    cache_key VARCHAR(255), -- Cache key for data
    
    -- Display configuration
    config JSONB NOT NULL, -- Widget-specific configuration
    styling JSONB DEFAULT '{}', -- CSS styling options
    
    -- Layout
    grid_position JSONB, -- Position in dashboard grid {x, y, width, height}
    
    -- Data refresh
    refresh_interval_minutes INTEGER DEFAULT 15,
    last_refreshed_at TIMESTAMP WITH TIME ZONE,
    
    -- Access control
    required_roles JSONB DEFAULT '["admin"]',
    is_public BOOLEAN DEFAULT false,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID -- References users table
);

-- =============================================================================
-- USER DASHBOARDS TABLE - User-specific dashboard configurations
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_dashboards (
    dashboard_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References users table
    
    -- Dashboard details
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Layout configuration
    layout JSONB NOT NULL, -- Dashboard layout configuration
    widgets JSONB NOT NULL, -- Array of widget IDs and their positions
    
    -- Settings
    is_default BOOLEAN DEFAULT false,
    is_shared BOOLEAN DEFAULT false,
    shared_with JSONB DEFAULT '[]', -- Array of user IDs or roles
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, name)
);

-- =============================================================================
-- REPORT ACCESS LOG TABLE - Track report access and usage
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_access_log (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Report information
    report_id UUID REFERENCES generated_reports(report_id),
    definition_id UUID REFERENCES report_definitions(definition_id),
    
    -- Access details
    user_id UUID, -- References users table
    action VARCHAR(50) NOT NULL, -- 'view', 'download', 'generate', 'schedule'
    
    -- Request details
    ip_address INET,
    user_agent TEXT,
    
    -- Additional information
    parameters JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- BUSINESS METRICS TABLE - Key business metrics tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS business_metrics (
    metric_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Metric details
    metric_name VARCHAR(100) NOT NULL,
    metric_category VARCHAR(50) NOT NULL, -- 'sales', 'inventory', 'customers', 'operations'
    
    -- Metric value
    metric_value DECIMAL(15,4) NOT NULL,
    metric_unit VARCHAR(20), -- 'currency', 'percentage', 'count', 'ratio'
    
    -- Time period
    period_type VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Comparison data
    previous_value DECIMAL(15,4),
    change_amount DECIMAL(15,4),
    change_percentage DECIMAL(8,4),
    
    -- Additional data
    breakdown JSONB, -- Detailed breakdown of the metric
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(metric_name, metric_category, period_type, period_start)
);

-- =============================================================================
-- INDEXES for performance optimization
-- =============================================================================

-- Report definitions indexes
CREATE INDEX IF NOT EXISTS idx_report_definitions_code ON report_definitions(code);
CREATE INDEX IF NOT EXISTS idx_report_definitions_type ON report_definitions(type);
CREATE INDEX IF NOT EXISTS idx_report_definitions_category ON report_definitions(category);
CREATE INDEX IF NOT EXISTS idx_report_definitions_is_active ON report_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_report_definitions_is_public ON report_definitions(is_public);
CREATE INDEX IF NOT EXISTS idx_report_definitions_created_by ON report_definitions(created_by);

-- Generated reports indexes
CREATE INDEX IF NOT EXISTS idx_generated_reports_definition_id ON generated_reports(definition_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_type ON generated_reports(type);
CREATE INDEX IF NOT EXISTS idx_generated_reports_status ON generated_reports(status);
CREATE INDEX IF NOT EXISTS idx_generated_reports_format ON generated_reports(format);
CREATE INDEX IF NOT EXISTS idx_generated_reports_generated_by ON generated_reports(generated_by);
CREATE INDEX IF NOT EXISTS idx_generated_reports_generated_at ON generated_reports(generated_at);
CREATE INDEX IF NOT EXISTS idx_generated_reports_expires_at ON generated_reports(expires_at);
CREATE INDEX IF NOT EXISTS idx_generated_reports_created_at ON generated_reports(created_at);

-- Report schedules indexes
CREATE INDEX IF NOT EXISTS idx_report_schedules_definition_id ON report_schedules(definition_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_frequency ON report_schedules(frequency);
CREATE INDEX IF NOT EXISTS idx_report_schedules_is_active ON report_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run_at ON report_schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_report_schedules_created_by ON report_schedules(created_by);

-- Analytics cache indexes
CREATE INDEX IF NOT EXISTS idx_analytics_cache_cache_key ON analytics_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_category ON analytics_cache(category);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_subcategory ON analytics_cache(subcategory);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_expires_at ON analytics_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_last_accessed_at ON analytics_cache(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_data_timestamp ON analytics_cache(data_timestamp);

-- Dashboard widgets indexes
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_widget_type ON dashboard_widgets(widget_type);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_is_active ON dashboard_widgets(is_active);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_is_public ON dashboard_widgets(is_public);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_created_by ON dashboard_widgets(created_by);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_last_refreshed_at ON dashboard_widgets(last_refreshed_at);

-- User dashboards indexes
CREATE INDEX IF NOT EXISTS idx_user_dashboards_user_id ON user_dashboards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_dashboards_is_default ON user_dashboards(is_default);
CREATE INDEX IF NOT EXISTS idx_user_dashboards_is_shared ON user_dashboards(is_shared);

-- Report access log indexes
CREATE INDEX IF NOT EXISTS idx_report_access_log_report_id ON report_access_log(report_id);
CREATE INDEX IF NOT EXISTS idx_report_access_log_definition_id ON report_access_log(definition_id);
CREATE INDEX IF NOT EXISTS idx_report_access_log_user_id ON report_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_report_access_log_action ON report_access_log(action);
CREATE INDEX IF NOT EXISTS idx_report_access_log_created_at ON report_access_log(created_at);

-- Business metrics indexes
CREATE INDEX IF NOT EXISTS idx_business_metrics_metric_name ON business_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_business_metrics_category ON business_metrics(metric_category);
CREATE INDEX IF NOT EXISTS idx_business_metrics_period_type ON business_metrics(period_type);
CREATE INDEX IF NOT EXISTS idx_business_metrics_period_start ON business_metrics(period_start);
CREATE INDEX IF NOT EXISTS idx_business_metrics_created_at ON business_metrics(created_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_business_metrics_name_period ON business_metrics(metric_name, period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_category_expires ON analytics_cache(category, expires_at);

-- =============================================================================
-- TRIGGERS for automatic updates
-- =============================================================================

-- Update cache hit count and last accessed time
CREATE OR REPLACE FUNCTION update_cache_access()
RETURNS TRIGGER AS $$
BEGIN
    -- This would be called when cache is accessed (implemented in application)
    NEW.hit_count := OLD.hit_count + 1;
    NEW.last_accessed_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Clean up expired reports
CREATE OR REPLACE FUNCTION cleanup_expired_reports()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark expired reports for cleanup
    UPDATE generated_reports
    SET status = 'expired'
    WHERE expires_at < NOW() 
    AND status NOT IN ('expired', 'failed')
    AND auto_delete = true;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Update next run time for schedules
CREATE OR REPLACE FUNCTION update_schedule_next_run()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate next run time based on frequency
    CASE NEW.frequency
        WHEN 'daily' THEN
            NEW.next_run_at := (CURRENT_DATE + INTERVAL '1 day' + NEW.schedule_time)::TIMESTAMP WITH TIME ZONE;
        WHEN 'weekly' THEN
            NEW.next_run_at := (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '1 week' + (NEW.schedule_day - 1) * INTERVAL '1 day' + NEW.schedule_time)::TIMESTAMP WITH TIME ZONE;
        WHEN 'monthly' THEN
            NEW.next_run_at := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + (NEW.schedule_day - 1) * INTERVAL '1 day' + NEW.schedule_time)::TIMESTAMP WITH TIME ZONE;
        WHEN 'quarterly' THEN
            NEW.next_run_at := (DATE_TRUNC('quarter', CURRENT_DATE) + INTERVAL '3 months' + NEW.schedule_time)::TIMESTAMP WITH TIME ZONE;
        WHEN 'yearly' THEN
            NEW.next_run_at := (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' + NEW.schedule_time)::TIMESTAMP WITH TIME ZONE;
    END CASE;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_schedule_next_run
    BEFORE INSERT OR UPDATE ON report_schedules
    FOR EACH ROW EXECUTE FUNCTION update_schedule_next_run();

-- Update timestamps
CREATE TRIGGER update_report_definitions_updated_at BEFORE UPDATE ON report_definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generated_reports_updated_at BEFORE UPDATE ON generated_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_report_schedules_updated_at BEFORE UPDATE ON report_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboard_widgets_updated_at BEFORE UPDATE ON dashboard_widgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_dashboards_updated_at BEFORE UPDATE ON user_dashboards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FUNCTIONS for common operations
-- =============================================================================

-- Function to get or create analytics cache
CREATE OR REPLACE FUNCTION get_or_create_analytics_cache(
    p_cache_key VARCHAR(255),
    p_category VARCHAR(50),
    p_subcategory VARCHAR(50) DEFAULT NULL,
    p_ttl_minutes INTEGER DEFAULT 60
)
RETURNS JSONB AS $$
DECLARE
    cached_data JSONB;
    cache_expires TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Try to get from cache
    SELECT data INTO cached_data
    FROM analytics_cache
    WHERE cache_key = p_cache_key
    AND expires_at > NOW();
    
    -- Update hit count if found
    IF cached_data IS NOT NULL THEN
        UPDATE analytics_cache
        SET hit_count = hit_count + 1,
            last_accessed_at = NOW()
        WHERE cache_key = p_cache_key;
        
        RETURN cached_data;
    END IF;
    
    -- Cache miss - return null (application should generate and cache data)
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set analytics cache
CREATE OR REPLACE FUNCTION set_analytics_cache(
    p_cache_key VARCHAR(255),
    p_category VARCHAR(50),
    p_data JSONB,
    p_subcategory VARCHAR(50) DEFAULT NULL,
    p_ttl_minutes INTEGER DEFAULT 60,
    p_parameters JSONB DEFAULT '{}',
    p_date_range JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    cache_expires TIMESTAMP WITH TIME ZONE;
BEGIN
    cache_expires := NOW() + (p_ttl_minutes * INTERVAL '1 minute');
    
    -- Insert or update cache
    INSERT INTO analytics_cache (
        cache_key, category, subcategory, data, parameters, 
        date_range, expires_at, hit_count, last_accessed_at
    ) VALUES (
        p_cache_key, p_category, p_subcategory, p_data, p_parameters,
        p_date_range, cache_expires, 0, NOW()
    )
    ON CONFLICT (cache_key) DO UPDATE SET
        data = EXCLUDED.data,
        parameters = EXCLUDED.parameters,
        date_range = EXCLUDED.date_range,
        expires_at = EXCLUDED.expires_at,
        data_timestamp = NOW();
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record business metric
CREATE OR REPLACE FUNCTION record_business_metric(
    p_metric_name VARCHAR(100),
    p_metric_category VARCHAR(50),
    p_metric_value DECIMAL(15,4),
    p_metric_unit VARCHAR(20) DEFAULT NULL,
    p_period_type VARCHAR(20) DEFAULT 'daily',
    p_period_start TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_period_end TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_breakdown JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    metric_id UUID;
    calculated_period_start TIMESTAMP WITH TIME ZONE;
    calculated_period_end TIMESTAMP WITH TIME ZONE;
    previous_metric RECORD;
    change_amt DECIMAL(15,4);
    change_pct DECIMAL(8,4);
BEGIN
    -- Calculate period if not provided
    IF p_period_start IS NULL THEN
        CASE p_period_type
            WHEN 'daily' THEN
                calculated_period_start := DATE_TRUNC('day', NOW());
                calculated_period_end := calculated_period_start + INTERVAL '1 day' - INTERVAL '1 second';
            WHEN 'weekly' THEN
                calculated_period_start := DATE_TRUNC('week', NOW());
                calculated_period_end := calculated_period_start + INTERVAL '1 week' - INTERVAL '1 second';
            WHEN 'monthly' THEN
                calculated_period_start := DATE_TRUNC('month', NOW());
                calculated_period_end := calculated_period_start + INTERVAL '1 month' - INTERVAL '1 second';
            WHEN 'quarterly' THEN
                calculated_period_start := DATE_TRUNC('quarter', NOW());
                calculated_period_end := calculated_period_start + INTERVAL '3 months' - INTERVAL '1 second';
            WHEN 'yearly' THEN
                calculated_period_start := DATE_TRUNC('year', NOW());
                calculated_period_end := calculated_period_start + INTERVAL '1 year' - INTERVAL '1 second';
        END CASE;
    ELSE
        calculated_period_start := p_period_start;
        calculated_period_end := COALESCE(p_period_end, p_period_start + INTERVAL '1 day' - INTERVAL '1 second');
    END IF;
    
    -- Get previous period metric for comparison
    SELECT metric_value INTO previous_metric
    FROM business_metrics
    WHERE metric_name = p_metric_name
    AND metric_category = p_metric_category
    AND period_type = p_period_type
    AND period_start < calculated_period_start
    ORDER BY period_start DESC
    LIMIT 1;
    
    -- Calculate changes
    IF previous_metric.metric_value IS NOT NULL THEN
        change_amt := p_metric_value - previous_metric.metric_value;
        IF previous_metric.metric_value != 0 THEN
            change_pct := (change_amt / previous_metric.metric_value) * 100;
        END IF;
    END IF;
    
    -- Insert or update metric
    INSERT INTO business_metrics (
        metric_name, metric_category, metric_value, metric_unit,
        period_type, period_start, period_end, previous_value,
        change_amount, change_percentage, breakdown
    ) VALUES (
        p_metric_name, p_metric_category, p_metric_value, p_metric_unit,
        p_period_type, calculated_period_start, calculated_period_end,
        previous_metric.metric_value, change_amt, change_pct, p_breakdown
    )
    ON CONFLICT (metric_name, metric_category, period_type, period_start) DO UPDATE SET
        metric_value = EXCLUDED.metric_value,
        metric_unit = EXCLUDED.metric_unit,
        period_end = EXCLUDED.period_end,
        previous_value = EXCLUDED.previous_value,
        change_amount = EXCLUDED.change_amount,
        change_percentage = EXCLUDED.change_percentage,
        breakdown = EXCLUDED.breakdown
    RETURNING business_metrics.metric_id INTO metric_id;
    
    RETURN metric_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get dashboard data
CREATE OR REPLACE FUNCTION get_dashboard_data(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    dashboard_data JSONB;
BEGIN
    -- Get user's default dashboard or create basic one
    SELECT json_build_object(
        'dashboard_id', ud.dashboard_id,
        'name', ud.name,
        'layout', ud.layout,
        'widgets', (
            SELECT json_agg(
                json_build_object(
                    'widget_id', dw.widget_id,
                    'title', dw.title,
                    'type', dw.widget_type,
                    'chart_type', dw.chart_type,
                    'config', dw.config,
                    'position', (ud.widgets->dw.widget_id::text)
                )
            )
            FROM dashboard_widgets dw
            WHERE dw.widget_id::text = ANY(SELECT jsonb_object_keys(ud.widgets))
            AND dw.is_active = true
        )
    ) INTO dashboard_data
    FROM user_dashboards ud
    WHERE ud.user_id = p_user_id
    AND ud.is_default = true
    LIMIT 1;
    
    -- If no dashboard found, return empty structure
    IF dashboard_data IS NULL THEN
        dashboard_data := json_build_object(
            'dashboard_id', null,
            'name', 'Default Dashboard',
            'layout', '{}',
            'widgets', '[]'
        );
    END IF;
    
    RETURN dashboard_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired cache and reports
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS INTEGER AS $$
DECLARE
    cleanup_count INTEGER := 0;
BEGIN
    -- Delete expired cache entries
    DELETE FROM analytics_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    
    -- Delete expired reports
    DELETE FROM generated_reports 
    WHERE expires_at < NOW() 
    AND auto_delete = true 
    AND status = 'expired';
    
    GET DIAGNOSTICS cleanup_count = cleanup_count + ROW_COUNT;
    
    RETURN cleanup_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VIEWS for common queries
-- =============================================================================

-- View for report summary
CREATE OR REPLACE VIEW report_summary AS
SELECT 
    gr.report_id,
    gr.name,
    gr.type,
    gr.format,
    gr.status,
    gr.generated_at,
    gr.generated_by,
    gr.file_size,
    gr.total_records,
    gr.expires_at,
    rd.name as definition_name,
    rd.category as definition_category,
    u.first_name || ' ' || u.last_name as generated_by_name
FROM generated_reports gr
LEFT JOIN report_definitions rd ON gr.definition_id = rd.definition_id
LEFT JOIN users u ON gr.generated_by = u.user_id;

-- View for business metrics summary
CREATE OR REPLACE VIEW business_metrics_summary AS
SELECT 
    bm.metric_name,
    bm.metric_category,
    bm.period_type,
    bm.metric_value,
    bm.metric_unit,
    bm.change_amount,
    bm.change_percentage,
    bm.period_start,
    bm.period_end,
    bm.created_at,
    CASE 
        WHEN bm.change_percentage > 0 THEN 'increase'
        WHEN bm.change_percentage < 0 THEN 'decrease'
        ELSE 'stable'
    END as trend
FROM business_metrics bm;

-- =============================================================================
-- INITIAL DATA SEEDING
-- =============================================================================

-- Create default report definitions
INSERT INTO report_definitions (
    name, code, type, category, base_query, columns, required_roles, is_system_report, created_by
) VALUES
(
    'Sales Summary Report',
    'SALES_SUMMARY',
    'sales',
    'management',
    'SELECT DATE_TRUNC(''day'', o.created_at) as date, COUNT(*) as orders, SUM(o.total_amount) as revenue, AVG(o.total_amount) as avg_order_value FROM orders o WHERE o.status IN (''delivered'', ''completed'') AND o.created_at >= $1 AND o.created_at <= $2 GROUP BY DATE_TRUNC(''day'', o.created_at) ORDER BY date',
    '[
        {"key": "date", "label": "Date", "type": "date", "format": "YYYY-MM-DD"},
        {"key": "orders", "label": "Orders", "type": "number", "format": "#,##0"},
        {"key": "revenue", "label": "Revenue", "type": "currency", "format": "$#,##0.00"},
        {"key": "avg_order_value", "label": "Avg Order Value", "type": "currency", "format": "$#,##0.00"}
    ]'::jsonb,
    '["admin", "manager"]'::jsonb,
    true,
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1)
),
(
    'Inventory Status Report',
    'INVENTORY_STATUS',
    'inventory',
    'operational',
    'SELECT p.name, p.sku, p.stock_quantity, p.low_stock_threshold, c.name as category, CASE WHEN p.stock_quantity <= 0 THEN ''Out of Stock'' WHEN p.stock_quantity <= p.low_stock_threshold THEN ''Low Stock'' ELSE ''In Stock'' END as status FROM products p LEFT JOIN categories c ON p.category_id = c.category_id WHERE p.status = ''active'' ORDER BY p.stock_quantity ASC',
    '[
        {"key": "name", "label": "Product Name", "type": "text"},
        {"key": "sku", "label": "SKU", "type": "text"},
        {"key": "stock_quantity", "label": "Stock", "type": "number", "format": "#,##0"},
        {"key": "low_stock_threshold", "label": "Low Stock Threshold", "type": "number", "format": "#,##0"},
        {"key": "category", "label": "Category", "type": "text"},
        {"key": "status", "label": "Status", "type": "text"}
    ]'::jsonb,
    '["admin", "manager", "staff"]'::jsonb,
    true,
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1)
),
(
    'Customer Analysis Report',
    'CUSTOMER_ANALYSIS',
    'customer',
    'analysis',
    'SELECT u.first_name || '' '' || u.last_name as customer_name, u.email, COUNT(o.order_id) as total_orders, SUM(o.total_amount) as total_spent, AVG(o.total_amount) as avg_order_value, MAX(o.created_at) as last_order_date FROM users u LEFT JOIN orders o ON u.user_id = o.user_id WHERE u.role = ''customer'' GROUP BY u.user_id, u.first_name, u.last_name, u.email ORDER BY total_spent DESC NULLS LAST',
    '[
        {"key": "customer_name", "label": "Customer", "type": "text"},
        {"key": "email", "label": "Email", "type": "email"},
        {"key": "total_orders", "label": "Total Orders", "type": "number", "format": "#,##0"},
        {"key": "total_spent", "label": "Total Spent", "type": "currency", "format": "$#,##0.00"},
        {"key": "avg_order_value", "label": "Avg Order Value", "type": "currency", "format": "$#,##0.00"},
        {"key": "last_order_date", "label": "Last Order", "type": "datetime", "format": "YYYY-MM-DD HH:mm"}
    ]'::jsonb,
    '["admin", "manager"]'::jsonb,
    true,
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1)
)
ON CONFLICT (code) DO NOTHING;

-- Create default dashboard widgets
INSERT INTO dashboard_widgets (
    name, title, widget_type, chart_type, data_source, query, config, 
    grid_position, required_roles, is_system_report, created_by
) VALUES
(
    'total_revenue',
    'Total Revenue',
    'metric',
    NULL,
    'query',
    'SELECT SUM(total_amount) as value FROM orders WHERE status IN (''delivered'', ''completed'') AND created_at >= CURRENT_DATE - INTERVAL ''30 days''',
    '{"format": "currency", "prefix": "$", "suffix": "", "color": "green"}'::jsonb,
    '{"x": 0, "y": 0, "width": 3, "height": 2}'::jsonb,
    '["admin", "manager"]'::jsonb,
    true,
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1)
),
(
    'total_orders',
    'Total Orders',
    'metric',
    NULL,
    'query',
    'SELECT COUNT(*) as value FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL ''30 days''',
    '{"format": "number", "prefix": "", "suffix": "", "color": "blue"}'::jsonb,
    '{"x": 3, "y": 0, "width": 3, "height": 2}'::jsonb,
    '["admin", "manager"]'::jsonb,
    true,
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1)
),
(
    'daily_sales_chart',
    'Daily Sales (Last 30 Days)',
    'chart',
    'line',
    'query',
    'SELECT DATE_TRUNC(''day'', created_at) as date, SUM(total_amount) as revenue FROM orders WHERE status IN (''delivered'', ''completed'') AND created_at >= CURRENT_DATE - INTERVAL ''30 days'' GROUP BY DATE_TRUNC(''day'', created_at) ORDER BY date',
    '{"xAxis": "date", "yAxis": "revenue", "color": "#2563eb"}'::jsonb,
    '{"x": 0, "y": 2, "width": 6, "height": 4}'::jsonb,
    '["admin", "manager"]'::jsonb,
    true,
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1)
),
(
    'low_stock_products',
    'Low Stock Products',
    'table',
    NULL,
    'query',
    'SELECT name, sku, stock_quantity, low_stock_threshold FROM products WHERE stock_quantity <= low_stock_threshold AND status = ''active'' ORDER BY stock_quantity ASC LIMIT 10',
    '{"columns": [{"key": "name", "label": "Product"}, {"key": "sku", "label": "SKU"}, {"key": "stock_quantity", "label": "Stock"}, {"key": "low_stock_threshold", "label": "Threshold"}]}'::jsonb,
    '{"x": 6, "y": 0, "width": 6, "height": 6}'::jsonb,
    '["admin", "manager", "staff"]'::jsonb,
    true,
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1)
)
ON CONFLICT DO NOTHING;

-- Create default dashboard for admin user
INSERT INTO user_dashboards (
    user_id, name, description, layout, widgets, is_default
) VALUES (
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1),
    'Main Dashboard',
    'Default dashboard with key business metrics',
    '{"columns": 12, "rows": 10, "gap": 16}'::jsonb,
    '{
        "total_revenue": {"x": 0, "y": 0, "width": 3, "height": 2},
        "total_orders": {"x": 3, "y": 0, "width": 3, "height": 2},
        "daily_sales_chart": {"x": 0, "y": 2, "width": 6, "height": 4},
        "low_stock_products": {"x": 6, "y": 0, "width": 6, "height": 6}
    }'::jsonb,
    true
)
ON CONFLICT (user_id, name) DO NOTHING;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Reporting Service Database Migration Completed Successfully';
    RAISE NOTICE 'Created tables: report_definitions, generated_reports, report_schedules, analytics_cache, dashboard_widgets, user_dashboards, report_access_log, business_metrics';
    RAISE NOTICE 'Created indexes, triggers, functions, and views';
    RAISE NOTICE 'Seeded initial report definitions, dashboard widgets, and default dashboard';
    RAISE NOTICE 'Migration: 007_reporting_service_schema.sql - COMPLETED';
END $$;
