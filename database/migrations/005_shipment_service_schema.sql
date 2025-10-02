-- =============================================================================
-- SHIPMENT SERVICE DATABASE MIGRATION
-- Dental Store Sudan - Shipping & Logistics Management
-- Migration: 005_shipment_service_schema.sql
-- =============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For geographic data (optional)

-- Create custom types for shipment management
DO $$ BEGIN
    CREATE TYPE shipment_status AS ENUM (
        'pending', 'confirmed', 'picked_up', 'in_transit', 'out_for_delivery',
        'delivered', 'failed_delivery', 'returned', 'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE delivery_type AS ENUM (
        'standard', 'express', 'overnight', 'same_day', 'pickup'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE package_status AS ENUM (
        'prepared', 'picked_up', 'in_transit', 'delivered', 'damaged', 'lost'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- SHIPPING CARRIERS TABLE - Available shipping providers
-- =============================================================================
CREATE TABLE IF NOT EXISTS shipping_carriers (
    carrier_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    
    -- Carrier information
    description TEXT,
    website VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    
    -- Service areas
    coverage_areas JSONB DEFAULT '[]', -- Array of states/cities covered
    international_shipping BOOLEAN DEFAULT false,
    
    -- API integration
    api_endpoint VARCHAR(255),
    api_key_required BOOLEAN DEFAULT false,
    tracking_url_template VARCHAR(500), -- Template with {tracking_number} placeholder
    
    -- Status and configuration
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- SHIPPING METHODS TABLE - Available shipping options
-- =============================================================================
CREATE TABLE IF NOT EXISTS shipping_methods (
    method_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    carrier_id UUID NOT NULL REFERENCES shipping_carriers(carrier_id) ON DELETE CASCADE,
    
    -- Method details
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    delivery_type delivery_type DEFAULT 'standard',
    
    -- Delivery timeframes
    min_delivery_days INTEGER DEFAULT 1 CHECK (min_delivery_days > 0),
    max_delivery_days INTEGER DEFAULT 7 CHECK (max_delivery_days >= min_delivery_days),
    
    -- Restrictions
    max_weight_kg DECIMAL(8,3), -- Maximum weight in kg
    max_dimensions JSONB, -- {length, width, height} in cm
    restricted_items JSONB DEFAULT '[]', -- Array of restricted item types
    
    -- Pricing
    base_rate DECIMAL(8,2) NOT NULL CHECK (base_rate >= 0),
    rate_per_kg DECIMAL(8,2) DEFAULT 0 CHECK (rate_per_kg >= 0),
    free_shipping_threshold DECIMAL(10,2), -- Minimum order value for free shipping
    
    -- Status and configuration
    is_active BOOLEAN DEFAULT true,
    requires_signature BOOLEAN DEFAULT false,
    insurance_available BOOLEAN DEFAULT false,
    tracking_available BOOLEAN DEFAULT true,
    
    -- Service areas
    available_zones JSONB DEFAULT '[]', -- Array of zone IDs where available
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(carrier_id, code)
);

-- =============================================================================
-- SHIPPING ZONES TABLE - Geographic zones for shipping
-- =============================================================================
CREATE TABLE IF NOT EXISTS shipping_zones (
    zone_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    
    -- Geographic coverage
    countries JSONB DEFAULT '[]', -- Array of country codes
    states JSONB DEFAULT '[]', -- Array of state names
    cities JSONB DEFAULT '[]', -- Array of city names
    postal_codes JSONB DEFAULT '[]', -- Array of postal code patterns
    
    -- Zone configuration
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- SHIPPING RATES TABLE - Zone-based shipping rates
-- =============================================================================
CREATE TABLE IF NOT EXISTS shipping_rates (
    rate_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES shipping_zones(zone_id) ON DELETE CASCADE,
    method_id UUID NOT NULL REFERENCES shipping_methods(method_id) ON DELETE CASCADE,
    
    -- Weight-based pricing
    min_weight_kg DECIMAL(6,2) DEFAULT 0 CHECK (min_weight_kg >= 0),
    max_weight_kg DECIMAL(6,2) CHECK (max_weight_kg IS NULL OR max_weight_kg >= min_weight_kg),
    
    -- Order value-based pricing
    min_order_value DECIMAL(10,2) DEFAULT 0 CHECK (min_order_value >= 0),
    max_order_value DECIMAL(10,2) CHECK (max_order_value IS NULL OR max_order_value >= min_order_value),
    
    -- Rates
    base_rate DECIMAL(8,2) NOT NULL CHECK (base_rate >= 0),
    rate_per_kg DECIMAL(8,2) DEFAULT 0 CHECK (rate_per_kg >= 0),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    effective_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- SHIPMENTS TABLE - Main shipment records
-- =============================================================================
CREATE TABLE IF NOT EXISTS shipments (
    shipment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_number VARCHAR(50) UNIQUE NOT NULL,
    order_id UUID NOT NULL, -- References orders table from order service
    user_id UUID NOT NULL, -- References users table from auth service
    
    -- Shipping details
    carrier_id UUID NOT NULL REFERENCES shipping_carriers(carrier_id),
    method_id UUID NOT NULL REFERENCES shipping_methods(method_id),
    zone_id UUID REFERENCES shipping_zones(zone_id),
    
    -- Status and tracking
    status shipment_status DEFAULT 'pending',
    tracking_number VARCHAR(100),
    carrier_tracking_number VARCHAR(100), -- Carrier's internal tracking number
    
    -- Addresses
    origin_address JSONB NOT NULL,
    destination_address JSONB NOT NULL,
    
    -- Package information
    total_weight_kg DECIMAL(8,3) CHECK (total_weight_kg IS NULL OR total_weight_kg > 0),
    total_dimensions JSONB, -- {length, width, height} in cm
    package_count INTEGER DEFAULT 1 CHECK (package_count > 0),
    
    -- Costs
    shipping_cost DECIMAL(10,2) NOT NULL CHECK (shipping_cost >= 0),
    insurance_cost DECIMAL(10,2) DEFAULT 0 CHECK (insurance_cost >= 0),
    additional_fees DECIMAL(10,2) DEFAULT 0 CHECK (additional_fees >= 0),
    total_cost DECIMAL(10,2) NOT NULL CHECK (total_cost >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Delivery information
    estimated_delivery_date TIMESTAMP WITH TIME ZONE,
    actual_delivery_date TIMESTAMP WITH TIME ZONE,
    delivery_attempts INTEGER DEFAULT 0 CHECK (delivery_attempts >= 0),
    max_delivery_attempts INTEGER DEFAULT 3 CHECK (max_delivery_attempts > 0),
    
    -- Delivery details
    delivered_to VARCHAR(200), -- Name of person who received
    delivery_signature_url TEXT,
    delivery_photo_url TEXT,
    delivery_notes TEXT,
    
    -- Special instructions
    special_instructions TEXT,
    requires_signature BOOLEAN DEFAULT false,
    requires_adult_signature BOOLEAN DEFAULT false,
    fragile BOOLEAN DEFAULT false,
    
    -- Additional information
    notes TEXT, -- Internal notes
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    picked_up_at TIMESTAMP WITH TIME ZONE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT shipments_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

-- =============================================================================
-- SHIPMENT ITEMS TABLE - Items in each shipment
-- =============================================================================
CREATE TABLE IF NOT EXISTS shipment_items (
    item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL, -- References order_items table from order service
    
    -- Item details (snapshot from order)
    product_id UUID NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    product_sku VARCHAR(100) NOT NULL,
    variant_id UUID,
    variant_name VARCHAR(100),
    
    -- Quantity and packaging
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    weight_per_item_kg DECIMAL(8,3),
    dimensions_per_item JSONB, -- {length, width, height} in cm
    
    -- Package assignment
    package_number INTEGER DEFAULT 1,
    
    -- Special handling
    fragile BOOLEAN DEFAULT false,
    hazardous BOOLEAN DEFAULT false,
    temperature_controlled BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- SHIPMENT TRACKING TABLE - Tracking events and updates
-- =============================================================================
CREATE TABLE IF NOT EXISTS shipment_tracking (
    tracking_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    
    -- Tracking event details
    event_type VARCHAR(50) NOT NULL, -- 'picked_up', 'in_transit', 'delivered', etc.
    event_description TEXT NOT NULL,
    location VARCHAR(200),
    
    -- Event timing
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    estimated_delivery TIMESTAMP WITH TIME ZONE,
    
    -- Source of information
    source VARCHAR(50) DEFAULT 'carrier', -- 'carrier', 'manual', 'api', 'webhook'
    carrier_event_id VARCHAR(255), -- Carrier's event ID
    
    -- Additional details
    details JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- SHIPMENT NOTIFICATIONS TABLE - Track notifications sent
-- =============================================================================
CREATE TABLE IF NOT EXISTS shipment_notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    
    -- Notification details
    type VARCHAR(50) NOT NULL, -- 'email', 'sms', 'whatsapp', 'push'
    channel VARCHAR(50) NOT NULL, -- 'shipped', 'in_transit', 'delivered', etc.
    recipient VARCHAR(255) NOT NULL,
    
    -- Message content
    subject VARCHAR(255),
    message TEXT NOT NULL,
    template_id VARCHAR(100),
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    
    -- Provider information
    provider VARCHAR(50), -- 'gmail', 'twilio', 'whatsapp_business'
    provider_message_id VARCHAR(255),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT shipment_notifications_type_valid CHECK (
        type IN ('email', 'sms', 'whatsapp', 'push')
    ),
    CONSTRAINT shipment_notifications_status_valid CHECK (
        status IN ('pending', 'sent', 'delivered', 'failed', 'cancelled')
    )
);

-- =============================================================================
-- DELIVERY ATTEMPTS TABLE - Track delivery attempts
-- =============================================================================
CREATE TABLE IF NOT EXISTS delivery_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    
    -- Attempt details
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    attempted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Attempt result
    successful BOOLEAN DEFAULT false,
    failure_reason VARCHAR(100), -- 'no_one_home', 'refused', 'address_issue', etc.
    notes TEXT,
    
    -- Next attempt information
    next_attempt_scheduled TIMESTAMP WITH TIME ZONE,
    
    -- Delivery person information
    driver_name VARCHAR(100),
    driver_phone VARCHAR(20),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(shipment_id, attempt_number)
);

-- =============================================================================
-- RETURN SHIPMENTS TABLE - Return/exchange shipments
-- =============================================================================
CREATE TABLE IF NOT EXISTS return_shipments (
    return_shipment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_number VARCHAR(50) UNIQUE NOT NULL,
    original_shipment_id UUID NOT NULL REFERENCES shipments(shipment_id),
    order_id UUID NOT NULL, -- References orders table
    
    -- Return details
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Return shipment information
    carrier_id UUID REFERENCES shipping_carriers(carrier_id),
    method_id UUID REFERENCES shipping_methods(method_id),
    tracking_number VARCHAR(100),
    
    -- Status
    status shipment_status DEFAULT 'pending',
    
    -- Addresses (reversed from original)
    pickup_address JSONB NOT NULL, -- Customer's address
    return_address JSONB NOT NULL, -- Store's address
    
    -- Costs
    return_shipping_cost DECIMAL(10,2) DEFAULT 0 CHECK (return_shipping_cost >= 0),
    who_pays_shipping VARCHAR(20) DEFAULT 'customer', -- 'customer', 'store', 'carrier'
    
    -- Items being returned
    items JSONB NOT NULL, -- Array of {item_id, quantity, reason}
    
    -- Processing
    received_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    refund_issued_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional information
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT return_shipments_who_pays_valid CHECK (
        who_pays_shipping IN ('customer', 'store', 'carrier')
    )
);

-- =============================================================================
-- INDEXES for performance optimization
-- =============================================================================

-- Shipping carriers indexes
CREATE INDEX IF NOT EXISTS idx_shipping_carriers_code ON shipping_carriers(code);
CREATE INDEX IF NOT EXISTS idx_shipping_carriers_is_active ON shipping_carriers(is_active);
CREATE INDEX IF NOT EXISTS idx_shipping_carriers_name ON shipping_carriers(name);

-- Shipping methods indexes
CREATE INDEX IF NOT EXISTS idx_shipping_methods_carrier_id ON shipping_methods(carrier_id);
CREATE INDEX IF NOT EXISTS idx_shipping_methods_code ON shipping_methods(code);
CREATE INDEX IF NOT EXISTS idx_shipping_methods_delivery_type ON shipping_methods(delivery_type);
CREATE INDEX IF NOT EXISTS idx_shipping_methods_is_active ON shipping_methods(is_active);

-- Shipping zones indexes
CREATE INDEX IF NOT EXISTS idx_shipping_zones_code ON shipping_zones(code);
CREATE INDEX IF NOT EXISTS idx_shipping_zones_is_active ON shipping_zones(is_active);

-- Shipping rates indexes
CREATE INDEX IF NOT EXISTS idx_shipping_rates_zone_id ON shipping_rates(zone_id);
CREATE INDEX IF NOT EXISTS idx_shipping_rates_method_id ON shipping_rates(method_id);
CREATE INDEX IF NOT EXISTS idx_shipping_rates_is_active ON shipping_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_shipping_rates_effective_date ON shipping_rates(effective_date);

-- Shipments indexes
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_user_id ON shipments(user_id);
CREATE INDEX IF NOT EXISTS idx_shipments_shipment_number ON shipments(shipment_number);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_carrier_id ON shipments(carrier_id);
CREATE INDEX IF NOT EXISTS idx_shipments_method_id ON shipments(method_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON shipments(created_at);
CREATE INDEX IF NOT EXISTS idx_shipments_estimated_delivery ON shipments(estimated_delivery_date);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_shipments_user_status ON shipments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_shipments_carrier_status ON shipments(carrier_id, status);
CREATE INDEX IF NOT EXISTS idx_shipments_status_created ON shipments(status, created_at);

-- Shipment items indexes
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id ON shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_order_item_id ON shipment_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_product_id ON shipment_items(product_id);

-- Shipment tracking indexes
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_shipment_id ON shipment_tracking(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_event_type ON shipment_tracking(event_type);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_event_timestamp ON shipment_tracking(event_timestamp);

-- Shipment notifications indexes
CREATE INDEX IF NOT EXISTS idx_shipment_notifications_shipment_id ON shipment_notifications(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_notifications_type ON shipment_notifications(type);
CREATE INDEX IF NOT EXISTS idx_shipment_notifications_status ON shipment_notifications(status);

-- Delivery attempts indexes
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_shipment_id ON delivery_attempts(shipment_id);
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_attempted_at ON delivery_attempts(attempted_at);
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_successful ON delivery_attempts(successful);

-- Return shipments indexes
CREATE INDEX IF NOT EXISTS idx_return_shipments_original_shipment_id ON return_shipments(original_shipment_id);
CREATE INDEX IF NOT EXISTS idx_return_shipments_order_id ON return_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_return_shipments_return_number ON return_shipments(return_number);
CREATE INDEX IF NOT EXISTS idx_return_shipments_status ON return_shipments(status);

-- =============================================================================
-- TRIGGERS for automatic updates
-- =============================================================================

-- Generate shipment number automatically
CREATE OR REPLACE FUNCTION generate_shipment_number()
RETURNS TRIGGER AS $$
DECLARE
    year_suffix VARCHAR(2);
    sequence_num INTEGER;
BEGIN
    -- Get last 2 digits of current year
    year_suffix := RIGHT(EXTRACT(YEAR FROM NOW())::TEXT, 2);
    
    -- Get next sequence number for this year
    SELECT COALESCE(MAX(CAST(RIGHT(shipment_number, 6) AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM shipments
    WHERE shipment_number LIKE 'SHP-' || year_suffix || '%';
    
    -- Generate shipment number: SHP-YY-NNNNNN
    NEW.shipment_number := 'SHP-' || year_suffix || '-' || LPAD(sequence_num::TEXT, 6, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_shipment_number
    BEFORE INSERT ON shipments
    FOR EACH ROW
    WHEN (NEW.shipment_number IS NULL)
    EXECUTE FUNCTION generate_shipment_number();

-- Update shipment status based on tracking events
CREATE OR REPLACE FUNCTION update_shipment_status_from_tracking()
RETURNS TRIGGER AS $$
BEGIN
    -- Update shipment status based on tracking event
    UPDATE shipments
    SET 
        status = CASE NEW.event_type
            WHEN 'picked_up' THEN 'picked_up'::shipment_status
            WHEN 'in_transit' THEN 'in_transit'::shipment_status
            WHEN 'out_for_delivery' THEN 'out_for_delivery'::shipment_status
            WHEN 'delivered' THEN 'delivered'::shipment_status
            WHEN 'failed_delivery' THEN 'failed_delivery'::shipment_status
            WHEN 'returned' THEN 'returned'::shipment_status
            ELSE status
        END,
        updated_at = NOW(),
        picked_up_at = CASE WHEN NEW.event_type = 'picked_up' THEN NEW.event_timestamp ELSE picked_up_at END,
        shipped_at = CASE WHEN NEW.event_type = 'in_transit' THEN NEW.event_timestamp ELSE shipped_at END,
        delivered_at = CASE WHEN NEW.event_type = 'delivered' THEN NEW.event_timestamp ELSE delivered_at END
    WHERE shipment_id = NEW.shipment_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_shipment_status_from_tracking
    AFTER INSERT ON shipment_tracking
    FOR EACH ROW EXECUTE FUNCTION update_shipment_status_from_tracking();

-- Calculate total shipment cost
CREATE OR REPLACE FUNCTION calculate_shipment_total_cost()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate total cost
    NEW.total_cost := NEW.shipping_cost + NEW.insurance_cost + NEW.additional_fees;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_shipment_total_cost
    BEFORE INSERT OR UPDATE ON shipments
    FOR EACH ROW EXECUTE FUNCTION calculate_shipment_total_cost();

-- Update timestamps
CREATE TRIGGER update_shipping_carriers_updated_at BEFORE UPDATE ON shipping_carriers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipping_methods_updated_at BEFORE UPDATE ON shipping_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipping_zones_updated_at BEFORE UPDATE ON shipping_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipping_rates_updated_at BEFORE UPDATE ON shipping_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON shipments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_return_shipments_updated_at BEFORE UPDATE ON return_shipments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FUNCTIONS for common operations
-- =============================================================================

-- Function to get shipment details with tracking
CREATE OR REPLACE FUNCTION get_shipment_details(p_shipment_id UUID)
RETURNS TABLE (
    shipment_id UUID,
    shipment_number VARCHAR(50),
    order_id UUID,
    status shipment_status,
    tracking_number VARCHAR(100),
    carrier_name VARCHAR(100),
    method_name VARCHAR(100),
    estimated_delivery TIMESTAMP WITH TIME ZONE,
    actual_delivery TIMESTAMP WITH TIME ZONE,
    tracking_events JSONB,
    items JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.shipment_id,
        s.shipment_number,
        s.order_id,
        s.status,
        s.tracking_number,
        sc.name as carrier_name,
        sm.name as method_name,
        s.estimated_delivery_date,
        s.actual_delivery_date,
        COALESCE(
            (SELECT json_agg(json_build_object(
                'event_type', st.event_type,
                'description', st.event_description,
                'location', st.location,
                'timestamp', st.event_timestamp
            ) ORDER BY st.event_timestamp DESC)
            FROM shipment_tracking st WHERE st.shipment_id = s.shipment_id),
            '[]'::json
        ) as tracking_events,
        COALESCE(
            (SELECT json_agg(json_build_object(
                'product_name', si.product_name,
                'product_sku', si.product_sku,
                'quantity', si.quantity,
                'package_number', si.package_number
            ))
            FROM shipment_items si WHERE si.shipment_id = s.shipment_id),
            '[]'::json
        ) as items
    FROM shipments s
    LEFT JOIN shipping_carriers sc ON s.carrier_id = sc.carrier_id
    LEFT JOIN shipping_methods sm ON s.method_id = sm.method_id
    WHERE s.shipment_id = p_shipment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate shipping cost
CREATE OR REPLACE FUNCTION calculate_shipping_cost(
    p_zone_id UUID,
    p_method_id UUID,
    p_weight_kg DECIMAL(8,3),
    p_order_value DECIMAL(10,2)
)
RETURNS DECIMAL(8,2) AS $$
DECLARE
    shipping_cost DECIMAL(8,2) := 0;
    rate_record RECORD;
BEGIN
    -- Find applicable shipping rate
    SELECT sr.base_rate, sr.rate_per_kg, sm.free_shipping_threshold
    INTO rate_record
    FROM shipping_rates sr
    JOIN shipping_methods sm ON sr.method_id = sm.method_id
    WHERE sr.zone_id = p_zone_id
    AND sr.method_id = p_method_id
    AND sr.is_active = true
    AND (sr.min_weight_kg IS NULL OR p_weight_kg >= sr.min_weight_kg)
    AND (sr.max_weight_kg IS NULL OR p_weight_kg <= sr.max_weight_kg)
    AND (sr.min_order_value IS NULL OR p_order_value >= sr.min_order_value)
    AND (sr.max_order_value IS NULL OR p_order_value <= sr.max_order_value)
    AND sr.effective_date <= NOW()
    AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
    ORDER BY sr.effective_date DESC
    LIMIT 1;
    
    IF rate_record IS NOT NULL THEN
        -- Check for free shipping threshold
        IF rate_record.free_shipping_threshold IS NOT NULL 
           AND p_order_value >= rate_record.free_shipping_threshold THEN
            shipping_cost := 0;
        ELSE
            -- Calculate cost: base rate + (weight * rate per kg)
            shipping_cost := rate_record.base_rate + (p_weight_kg * rate_record.rate_per_kg);
        END IF;
    END IF;
    
    RETURN shipping_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get shipping analytics
CREATE OR REPLACE FUNCTION get_shipping_analytics(
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    total_shipments INTEGER,
    delivered_shipments INTEGER,
    in_transit_shipments INTEGER,
    failed_deliveries INTEGER,
    delivery_success_rate DECIMAL(5,2),
    avg_delivery_time_hours DECIMAL(8,2),
    shipments_by_carrier JSONB,
    shipments_by_status JSONB,
    daily_shipments JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_shipments,
        COUNT(CASE WHEN s.status = 'delivered' THEN 1 END)::INTEGER as delivered_shipments,
        COUNT(CASE WHEN s.status IN ('in_transit', 'out_for_delivery') THEN 1 END)::INTEGER as in_transit_shipments,
        COUNT(CASE WHEN s.status = 'failed_delivery' THEN 1 END)::INTEGER as failed_deliveries,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND((COUNT(CASE WHEN s.status = 'delivered' THEN 1 END)::DECIMAL / COUNT(*) * 100), 2)
            ELSE 0 
        END as delivery_success_rate,
        COALESCE(
            AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.created_at)) / 3600)::DECIMAL(8,2),
            0
        ) as avg_delivery_time_hours,
        (SELECT json_object_agg(sc.name, count)
         FROM (SELECT s.carrier_id, COUNT(*) as count
               FROM shipments s
               WHERE s.created_at BETWEEN p_start_date AND p_end_date
               GROUP BY s.carrier_id) carrier_counts
         JOIN shipping_carriers sc ON carrier_counts.carrier_id = sc.carrier_id) as shipments_by_carrier,
        (SELECT json_object_agg(status, count)
         FROM (SELECT status, COUNT(*) as count
               FROM shipments
               WHERE created_at BETWEEN p_start_date AND p_end_date
               GROUP BY status) s) as shipments_by_status,
        (SELECT json_agg(json_build_object(
            'date', date_trunc('day', created_at),
            'shipments', COUNT(*),
            'delivered', COUNT(CASE WHEN status = 'delivered' THEN 1 END)
         ) ORDER BY date_trunc('day', created_at))
         FROM shipments
         WHERE created_at BETWEEN p_start_date AND p_end_date
         GROUP BY date_trunc('day', created_at)) as daily_shipments
    FROM shipments s
    WHERE s.created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VIEWS for common queries
-- =============================================================================

-- View for shipment summary
CREATE OR REPLACE VIEW shipment_summary AS
SELECT 
    s.shipment_id,
    s.shipment_number,
    s.order_id,
    s.user_id,
    s.status,
    s.tracking_number,
    sc.name as carrier_name,
    sm.name as method_name,
    sm.delivery_type,
    s.total_cost,
    s.currency,
    s.estimated_delivery_date,
    s.actual_delivery_date,
    s.created_at,
    s.delivered_at,
    COUNT(si.item_id) as item_count,
    SUM(si.quantity) as total_quantity
FROM shipments s
LEFT JOIN shipping_carriers sc ON s.carrier_id = sc.carrier_id
LEFT JOIN shipping_methods sm ON s.method_id = sm.method_id
LEFT JOIN shipment_items si ON s.shipment_id = si.shipment_id
GROUP BY s.shipment_id, s.shipment_number, s.order_id, s.user_id, s.status,
         s.tracking_number, sc.name, sm.name, sm.delivery_type, s.total_cost,
         s.currency, s.estimated_delivery_date, s.actual_delivery_date,
         s.created_at, s.delivered_at;

-- =============================================================================
-- INITIAL DATA SEEDING
-- =============================================================================

-- Create shipping zones for Sudan
INSERT INTO shipping_zones (name, code, description, states, countries) VALUES
('Khartoum Metro', 'KRT-METRO', 'Khartoum, Bahri, and Omdurman', '["Khartoum"]', '["SD"]'),
('Khartoum State', 'KRT-STATE', 'Other areas in Khartoum State', '["Khartoum"]', '["SD"]'),
('Northern States', 'NORTH', 'Northern and River Nile States', '["Northern", "River Nile"]', '["SD"]'),
('Eastern States', 'EAST', 'Kassala, Red Sea, and Gedaref States', '["Kassala", "Red Sea", "Gedaref"]', '["SD"]'),
('Central States', 'CENTRAL', 'Gezira, White Nile, and Sennar States', '["Gezira", "White Nile", "Sennar"]', '["SD"]'),
('Western States', 'WEST', 'North Darfur, South Darfur, West Darfur, Central Darfur, East Darfur', '["North Darfur", "South Darfur", "West Darfur", "Central Darfur", "East Darfur"]', '["SD"]'),
('Southern States', 'SOUTH', 'Blue Nile and South Kordofan States', '["Blue Nile", "South Kordofan"]', '["SD"]')
ON CONFLICT (code) DO NOTHING;

-- Create shipping carriers
INSERT INTO shipping_carriers (name, code, description, coverage_areas, is_active) VALUES
('Sudan Post', 'SUDAN_POST', 'National postal service of Sudan', '["All Sudan"]', true),
('DHL Sudan', 'DHL', 'International express delivery', '["Khartoum", "Port Sudan", "Kassala"]', true),
('Local Delivery Service', 'LOCAL', 'Local delivery within Khartoum', '["Khartoum"]', true),
('Express Courier Sudan', 'EXPRESS_SD', 'Express delivery service', '["Khartoum", "Gezira", "Northern"]', true)
ON CONFLICT (code) DO NOTHING;

-- Create shipping methods
INSERT INTO shipping_methods (
    carrier_id, name, code, description, delivery_type, 
    min_delivery_days, max_delivery_days, base_rate, rate_per_kg, is_active
)
SELECT 
    sc.carrier_id, method_name, method_code, method_desc, method_type::delivery_type,
    min_days, max_days, base_cost, rate_kg, true
FROM shipping_carriers sc
CROSS JOIN (VALUES
    ('Sudan Post', 'Standard Delivery', 'STD', 'Standard postal delivery', 'standard', 3, 7, 15.00, 2.00),
    ('Sudan Post', 'Express Delivery', 'EXP', 'Express postal delivery', 'express', 1, 3, 25.00, 3.00),
    ('DHL Sudan', 'DHL Express', 'DHL_EXP', 'International express delivery', 'express', 1, 2, 50.00, 5.00),
    ('Local Delivery Service', 'Same Day', 'SAME_DAY', 'Same day delivery in Khartoum', 'same_day', 1, 1, 30.00, 0.00),
    ('Local Delivery Service', 'Next Day', 'NEXT_DAY', 'Next day delivery in Khartoum', 'overnight', 1, 2, 20.00, 1.00),
    ('Express Courier Sudan', 'Express', 'ECS_EXP', 'Express courier service', 'express', 1, 3, 35.00, 2.50)
) AS methods(carrier_name, method_name, method_code, method_desc, method_type, min_days, max_days, base_cost, rate_kg)
WHERE sc.name = methods.carrier_name
ON CONFLICT (carrier_id, code) DO NOTHING;

-- Create shipping rates for each zone and method combination
INSERT INTO shipping_rates (zone_id, method_id, min_weight_kg, max_weight_kg, base_rate, rate_per_kg, is_active)
SELECT 
    sz.zone_id, sm.method_id, 0, 50, 
    CASE 
        WHEN sz.code = 'KRT-METRO' THEN sm.base_rate * 0.8  -- 20% discount for metro area
        WHEN sz.code = 'KRT-STATE' THEN sm.base_rate
        ELSE sm.base_rate * 1.5  -- 50% surcharge for other areas
    END as base_rate,
    sm.rate_per_kg,
    true
FROM shipping_zones sz
CROSS JOIN shipping_methods sm
WHERE sm.is_active = true
ON CONFLICT DO NOTHING;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Shipment Service Database Migration Completed Successfully';
    RAISE NOTICE 'Created tables: shipping_carriers, shipping_methods, shipping_zones, shipping_rates, shipments, shipment_items, shipment_tracking, shipment_notifications, delivery_attempts, return_shipments';
    RAISE NOTICE 'Created indexes, triggers, functions, and views';
    RAISE NOTICE 'Seeded initial carriers, methods, zones, and rates for Sudan';
    RAISE NOTICE 'Migration: 005_shipment_service_schema.sql - COMPLETED';
END $$;
