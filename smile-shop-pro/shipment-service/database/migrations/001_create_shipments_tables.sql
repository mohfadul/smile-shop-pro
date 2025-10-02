-- Migration: Create shipments tables and related structures
-- Version: 1.0.0
-- Description: Initial shipping and logistics schema

-- Create custom types
CREATE TYPE shipment_status AS ENUM ('pending', 'label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned', 'cancelled');
CREATE TYPE shipping_carrier AS ENUM ('ups', 'fedex', 'usps', 'dhl', 'local_delivery', 'pickup');
CREATE TYPE delivery_type AS ENUM ('standard', 'express', 'overnight', 'two_day', 'ground', 'pickup');

-- Shipping carriers table - Carrier configuration and settings
CREATE TABLE shipping_carriers (
    carrier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name shipping_carrier NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    api_key VARCHAR(255),
    api_secret VARCHAR(255),
    webhook_url VARCHAR(500),
    test_mode BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    base_url VARCHAR(255),
    tracking_url_template VARCHAR(500),
    estimated_delivery_days INTEGER DEFAULT 3,
    max_weight_kg DECIMAL(6,2),
    max_dimensions_cm VARCHAR(50), -- e.g., "100x50x50"
    supports_insurance BOOLEAN DEFAULT false,
    supports_signature BOOLEAN DEFAULT false,
    supports_pickup BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shipping methods table - Available shipping options
CREATE TABLE shipping_methods (
    method_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    carrier_id UUID REFERENCES shipping_carriers(carrier_id),
    delivery_type delivery_type NOT NULL,
    estimated_days INTEGER NOT NULL,
    base_cost DECIMAL(8,2) NOT NULL CHECK (base_cost >= 0),
    cost_per_kg DECIMAL(8,2) DEFAULT 0 CHECK (cost_per_kg >= 0),
    cost_per_km DECIMAL(8,2) DEFAULT 0 CHECK (cost_per_km >= 0),
    min_weight_kg DECIMAL(6,2) DEFAULT 0,
    max_weight_kg DECIMAL(6,2),
    insurance_available BOOLEAN DEFAULT false,
    signature_required BOOLEAN DEFAULT false,
    tracking_available BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shipments table - Main shipment records
CREATE TABLE shipments (
    shipment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL, -- References order-service orders table
    user_id UUID NOT NULL, -- References auth-service users table
    method_id UUID NOT NULL REFERENCES shipping_methods(method_id),
    carrier_id UUID REFERENCES shipping_carriers(carrier_id),
    tracking_number VARCHAR(100),
    carrier_tracking_url VARCHAR(500),
    status shipment_status DEFAULT 'pending',
    estimated_delivery_date DATE,
    actual_delivery_date DATE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    shipping_cost DECIMAL(8,2) NOT NULL CHECK (shipping_cost >= 0),
    insurance_cost DECIMAL(8,2) DEFAULT 0 CHECK (insurance_cost >= 0),
    fuel_surcharge DECIMAL(8,2) DEFAULT 0 CHECK (fuel_surcharge >= 0),
    total_cost DECIMAL(8,2) NOT NULL CHECK (total_cost >= 0),
    weight_kg DECIMAL(6,2),
    dimensions_cm VARCHAR(50),
    package_count INTEGER DEFAULT 1 CHECK (package_count > 0),
    signature_required BOOLEAN DEFAULT false,
    insurance_amount DECIMAL(10,2) DEFAULT 0 CHECK (insurance_amount >= 0),
    special_instructions TEXT,
    carrier_response JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT shipments_total_calculation CHECK (
        total_cost = (shipping_cost + insurance_cost + fuel_surcharge)
    )
);

-- Shipment tracking table - Track status updates from carriers
CREATE TABLE shipment_tracking (
    tracking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    status shipment_status NOT NULL,
    location VARCHAR(255),
    description TEXT,
    carrier_status VARCHAR(100),
    estimated_delivery DATE,
    carrier_timestamp TIMESTAMP WITH TIME ZONE,
    raw_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shipping addresses table - Store customer shipping addresses
CREATE TABLE shipping_addresses (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References auth-service users table
    type VARCHAR(20) DEFAULT 'shipping', -- 'shipping', 'billing'
    is_default BOOLEAN DEFAULT false,
    label VARCHAR(100), -- 'Home', 'Work', etc.
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    company VARCHAR(100),
    address_line_1 VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'USA',
    phone VARCHAR(20),
    email VARCHAR(255),
    instructions TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shipping zones table - Define shipping rates by geographic zones
CREATE TABLE shipping_zones (
    zone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    countries TEXT[] DEFAULT '{}',
    states TEXT[] DEFAULT '{}',
    postal_codes TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shipping rates table - Zone-based shipping rates
CREATE TABLE shipping_rates (
    rate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID NOT NULL REFERENCES shipping_zones(zone_id),
    method_id UUID NOT NULL REFERENCES shipping_methods(method_id),
    min_weight_kg DECIMAL(6,2) DEFAULT 0,
    max_weight_kg DECIMAL(6,2),
    base_rate DECIMAL(8,2) NOT NULL CHECK (base_rate >= 0),
    rate_per_kg DECIMAL(8,2) DEFAULT 0 CHECK (rate_per_kg >= 0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure no overlapping weight ranges for same zone/method
    CONSTRAINT shipping_rates_no_overlap EXCLUDE (
        zone_id WITH =,
        method_id WITH =,
        min_weight_kg WITH &&,
        max_weight_kg WITH &&
    )
);

-- Shipment notifications table - Track notifications sent to customers
CREATE TABLE shipment_notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'email', 'sms', 'push'
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'delivered', 'failed', 'pending'
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_shipping_carriers_active ON shipping_carriers(is_active);
CREATE INDEX idx_shipping_carriers_name ON shipping_carriers(name);

CREATE INDEX idx_shipping_methods_carrier ON shipping_methods(carrier_id);
CREATE INDEX idx_shipping_methods_active ON shipping_methods(is_active);
CREATE INDEX idx_shipping_methods_type ON shipping_methods(delivery_type);

CREATE INDEX idx_shipments_order_id ON shipments(order_id);
CREATE INDEX idx_shipments_user_id ON shipments(user_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_tracking ON shipments(tracking_number);
CREATE INDEX idx_shipments_created ON shipments(created_at);
CREATE INDEX idx_shipments_delivery ON shipments(estimated_delivery_date);

CREATE INDEX idx_shipment_tracking_shipment ON shipment_tracking(shipment_id);
CREATE INDEX idx_shipment_tracking_status ON shipment_tracking(status);
CREATE INDEX idx_shipment_tracking_created ON shipment_tracking(created_at);

CREATE INDEX idx_shipping_addresses_user ON shipping_addresses(user_id);
CREATE INDEX idx_shipping_addresses_default ON shipping_addresses(is_default);
CREATE INDEX idx_shipping_addresses_active ON shipping_addresses(is_active);

CREATE INDEX idx_shipping_zones_active ON shipping_zones(is_active);

CREATE INDEX idx_shipping_rates_zone ON shipping_rates(zone_id);
CREATE INDEX idx_shipping_rates_method ON shipping_rates(method_id);
CREATE INDEX idx_shipping_rates_active ON shipping_rates(is_active);

CREATE INDEX idx_shipment_notifications_shipment ON shipment_notifications(shipment_id);
CREATE INDEX idx_shipment_notifications_status ON shipment_notifications(status);

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_shipping_carriers_updated_at BEFORE UPDATE ON shipping_carriers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shipping_methods_updated_at BEFORE UPDATE ON shipping_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shipping_addresses_updated_at BEFORE UPDATE ON shipping_addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shipping_zones_updated_at BEFORE UPDATE ON shipping_zones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shipping_rates_updated_at BEFORE UPDATE ON shipping_rates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for shipment status tracking
CREATE OR REPLACE FUNCTION log_shipment_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO shipment_tracking (shipment_id, status, description, carrier_timestamp)
        VALUES (NEW.shipment_id, NEW.status, 'Status updated to ' || NEW.status, NOW());
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_log_shipment_status_changes
    AFTER UPDATE OF status ON shipments
    FOR EACH ROW EXECUTE FUNCTION log_shipment_status_change();

-- Function to calculate shipping cost based on weight and zone
CREATE OR REPLACE FUNCTION calculate_shipping_cost(
    p_method_id UUID,
    p_weight_kg DECIMAL,
    p_zone_id UUID DEFAULT NULL
) RETURNS DECIMAL(8,2) AS $$
DECLARE
    base_rate DECIMAL(8,2) := 0;
    weight_rate DECIMAL(8,2) := 0;
    total_cost DECIMAL(8,2) := 0;
BEGIN
    -- Get shipping method rates
    SELECT sr.base_rate, sr.rate_per_kg
    INTO base_rate, weight_rate
    FROM shipping_rates sr
    WHERE sr.method_id = p_method_id
    AND (p_zone_id IS NULL OR sr.zone_id = p_zone_id)
    AND sr.is_active = true
    AND (p_weight_kg IS NULL OR p_weight_kg BETWEEN sr.min_weight_kg AND COALESCE(sr.max_weight_kg, 999999))
    ORDER BY sr.rate_per_kg DESC -- Prefer higher rates (more specific)
    LIMIT 1;

    -- If no rate found, use method's base rate
    IF base_rate IS NULL THEN
        SELECT sm.base_cost INTO base_rate
        FROM shipping_methods sm
        WHERE sm.method_id = p_method_id;
    END IF;

    -- Calculate total cost
    total_cost := base_rate + (COALESCE(p_weight_kg, 0) * weight_rate);

    RETURN total_cost;
END;
$$ language 'plpgsql';

-- Function to get available shipping methods for an address
CREATE OR REPLACE FUNCTION get_available_shipping_methods(p_address JSONB)
RETURNS TABLE (
    method_id UUID,
    name VARCHAR,
    display_name VARCHAR,
    estimated_days INTEGER,
    cost DECIMAL,
    carrier_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sm.method_id,
        sm.name,
        sm.display_name,
        sm.estimated_days,
        calculate_shipping_cost(sm.method_id, NULL::DECIMAL) as cost,
        sc.display_name as carrier_name
    FROM shipping_methods sm
    JOIN shipping_carriers sc ON sm.carrier_id = sc.carrier_id
    WHERE sm.is_active = true
    AND sc.is_active = true
    ORDER BY sm.sort_order, sm.estimated_days;
END;
$$ language 'plpgsql';

-- Function to estimate delivery date
CREATE OR REPLACE FUNCTION estimate_delivery_date(p_method_id UUID, p_ship_date DATE DEFAULT CURRENT_DATE)
RETURNS DATE AS $$
DECLARE
    estimated_days INTEGER;
    delivery_date DATE;
BEGIN
    SELECT sm.estimated_days INTO estimated_days
    FROM shipping_methods sm
    WHERE sm.method_id = p_method_id;

    -- Add estimated days to ship date (excluding weekends)
    delivery_date := p_ship_date + (estimated_days || ' days')::INTERVAL;

    -- If delivery falls on weekend, move to Monday
    IF EXTRACT(DOW FROM delivery_date) IN (0, 6) THEN -- Sunday = 0, Saturday = 6
        delivery_date := delivery_date + (8 - EXTRACT(DOW FROM delivery_date))::INTEGER;
    END IF;

    RETURN delivery_date;
END;
$$ language 'plpgsql';

-- Row Level Security (RLS) - Enable for production
ALTER TABLE shipping_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shipments
CREATE POLICY "Users can view their own shipments" ON shipments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create shipments for their orders" ON shipments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for shipping addresses
CREATE POLICY "Users can manage their own shipping addresses" ON shipping_addresses
    FOR ALL USING (auth.uid() = user_id);

-- Insert sample carriers
INSERT INTO shipping_carriers (name, display_name, test_mode, estimated_delivery_days) VALUES
    ('ups', 'UPS', true, 2),
    ('fedex', 'FedEx', true, 2),
    ('usps', 'USPS', true, 3),
    ('dhl', 'DHL', true, 3),
    ('local_delivery', 'Local Delivery', true, 1);

-- Insert sample shipping methods
INSERT INTO shipping_methods (name, display_name, carrier_id, delivery_type, estimated_days, base_cost, tracking_available)
SELECT
    'standard',
    'Standard Shipping',
    carrier_id,
    'standard',
    3,
    9.99,
    true
FROM shipping_carriers
WHERE name IN ('ups', 'fedex', 'usps');

INSERT INTO shipping_methods (name, display_name, carrier_id, delivery_type, estimated_days, base_cost, tracking_available)
SELECT
    'express',
    'Express Shipping',
    carrier_id,
    'express',
    2,
    19.99,
    true
FROM shipping_carriers
WHERE name IN ('ups', 'fedex', 'dhl');

INSERT INTO shipping_methods (name, display_name, carrier_id, delivery_type, estimated_days, base_cost, tracking_available)
SELECT
    'overnight',
    'Overnight Shipping',
    carrier_id,
    'overnight',
    1,
    39.99,
    true
FROM shipping_carriers
WHERE name IN ('ups', 'fedex');

INSERT INTO shipping_methods (name, display_name, carrier_id, delivery_type, estimated_days, base_cost, tracking_available)
SELECT
    'pickup',
    'Store Pickup',
    carrier_id,
    'pickup',
    0,
    0.00,
    false
FROM shipping_carriers
WHERE name = 'local_delivery';

-- Insert sample shipping zones (basic US zones)
INSERT INTO shipping_zones (name, countries, states) VALUES
    ('Continental US', ARRAY['USA'], ARRAY['AL', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']);

-- Insert sample shipping rates
INSERT INTO shipping_rates (zone_id, method_id, base_rate, rate_per_kg)
SELECT
    sz.zone_id,
    sm.method_id,
    CASE
        WHEN sm.delivery_type = 'standard' THEN 9.99
        WHEN sm.delivery_type = 'express' THEN 19.99
        WHEN sm.delivery_type = 'overnight' THEN 39.99
        ELSE 0.00
    END as base_rate,
    CASE
        WHEN sm.delivery_type = 'standard' THEN 2.50
        WHEN sm.delivery_type = 'express' THEN 5.00
        WHEN sm.delivery_type = 'overnight' THEN 10.00
        ELSE 0.00
    END as rate_per_kg
FROM shipping_zones sz
CROSS JOIN shipping_methods sm
WHERE sz.name = 'Continental US'
AND sm.name != 'pickup';
