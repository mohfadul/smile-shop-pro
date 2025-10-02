-- =============================================================================
-- ORDER SERVICE DATABASE MIGRATION
-- Dental Store Sudan - Order Management & Processing
-- Migration: 003_order_service_schema.sql
-- =============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types for order management
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'pending', 'confirmed', 'processing', 'shipped', 'delivered', 
        'cancelled', 'refunded', 'returned', 'on_hold'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM (
        'pending', 'paid', 'partially_paid', 'failed', 'refunded', 
        'partially_refunded', 'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM (
        'bank_transfer', 'cash_on_delivery', 'mobile_money', 'credit_card', 'debit_card'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE fulfillment_status AS ENUM (
        'unfulfilled', 'partially_fulfilled', 'fulfilled', 'shipped', 'delivered'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- ORDERS TABLE - Main order records
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders (
    order_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID NOT NULL, -- References users table from auth service
    
    -- Order status and tracking
    status order_status DEFAULT 'pending',
    payment_status payment_status DEFAULT 'pending',
    fulfillment_status fulfillment_status DEFAULT 'unfulfilled',
    
    -- Financial information
    subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
    tax_amount DECIMAL(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_cost DECIMAL(10,2) DEFAULT 0 CHECK (shipping_cost >= 0),
    discount_amount DECIMAL(10,2) DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    exchange_rate DECIMAL(10,4) DEFAULT 1.0000, -- For multi-currency support
    
    -- Payment information
    payment_method payment_method,
    payment_reference VARCHAR(255), -- Bank reference, transaction ID, etc.
    payment_due_date TIMESTAMP WITH TIME ZONE,
    
    -- Customer information
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    customer_notes TEXT,
    
    -- Addresses
    billing_address JSONB NOT NULL,
    shipping_address JSONB NOT NULL,
    
    -- Shipping information
    shipping_method VARCHAR(100),
    tracking_number VARCHAR(100),
    estimated_delivery_date TIMESTAMP WITH TIME ZONE,
    actual_delivery_date TIMESTAMP WITH TIME ZONE,
    
    -- Additional information
    source VARCHAR(50) DEFAULT 'web', -- 'web', 'mobile', 'phone', 'admin'
    tags TEXT[], -- Array of tags for categorization
    notes TEXT, -- Internal notes
    metadata JSONB DEFAULT '{}', -- Additional metadata
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT orders_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT orders_exchange_rate_positive CHECK (exchange_rate > 0),
    CONSTRAINT orders_source_valid CHECK (source IN ('web', 'mobile', 'phone', 'admin', 'api'))
);

-- =============================================================================
-- ORDER ITEMS TABLE - Individual items in orders
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_items (
    item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL, -- References products table from product service
    variant_id UUID, -- References product_variants table from product service
    
    -- Product information (snapshot at time of order)
    product_name VARCHAR(200) NOT NULL,
    product_sku VARCHAR(100) NOT NULL,
    variant_name VARCHAR(100),
    variant_sku VARCHAR(100),
    
    -- Pricing and quantity
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
    
    -- Product details snapshot
    product_details JSONB DEFAULT '{}', -- Snapshot of product attributes
    
    -- Fulfillment tracking
    quantity_fulfilled INTEGER DEFAULT 0 CHECK (quantity_fulfilled >= 0),
    quantity_shipped INTEGER DEFAULT 0 CHECK (quantity_shipped >= 0),
    quantity_returned INTEGER DEFAULT 0 CHECK (quantity_returned >= 0),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT order_items_quantity_fulfilled_valid CHECK (quantity_fulfilled <= quantity),
    CONSTRAINT order_items_quantity_shipped_valid CHECK (quantity_shipped <= quantity_fulfilled),
    CONSTRAINT order_items_quantity_returned_valid CHECK (quantity_returned <= quantity_shipped)
);

-- =============================================================================
-- ORDER STATUS HISTORY TABLE - Track status changes
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_status_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    
    -- Status change information
    previous_status order_status,
    new_status order_status NOT NULL,
    reason VARCHAR(255),
    notes TEXT,
    
    -- Who made the change
    changed_by UUID, -- References users table
    changed_by_type VARCHAR(20) DEFAULT 'user', -- 'user', 'system', 'api'
    
    -- Additional context
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT order_status_history_changed_by_type_valid CHECK (
        changed_by_type IN ('user', 'system', 'api', 'webhook')
    )
);

-- =============================================================================
-- ORDER PAYMENTS TABLE - Payment tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    
    -- Payment details
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method payment_method NOT NULL,
    status payment_status DEFAULT 'pending',
    
    -- Payment references
    transaction_id VARCHAR(255),
    reference_number VARCHAR(255),
    gateway_response JSONB, -- Response from payment gateway
    
    -- Bank transfer specific
    bank_name VARCHAR(100),
    account_number VARCHAR(50),
    transfer_date TIMESTAMP WITH TIME ZONE,
    
    -- Mobile money specific
    mobile_provider VARCHAR(50), -- 'zain_cash', 'mtn_money', 'sudani_mobile'
    mobile_number VARCHAR(20),
    
    -- Processing information
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID, -- References users table
    failure_reason TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT order_payments_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

-- =============================================================================
-- ORDER SHIPPING TABLE - Shipping and tracking information
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_shipping (
    shipping_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    
    -- Shipping details
    carrier VARCHAR(100), -- 'sudan_post', 'dhl', 'fedex', 'local_delivery'
    service_type VARCHAR(100), -- 'standard', 'express', 'overnight'
    tracking_number VARCHAR(100),
    tracking_url TEXT,
    
    -- Shipping address (can be different from order shipping address)
    shipping_address JSONB NOT NULL,
    
    -- Package information
    weight DECIMAL(8,3), -- in kg
    dimensions JSONB, -- {length, width, height} in cm
    package_count INTEGER DEFAULT 1,
    
    -- Dates and status
    shipped_at TIMESTAMP WITH TIME ZONE,
    estimated_delivery TIMESTAMP WITH TIME ZONE,
    actual_delivery TIMESTAMP WITH TIME ZONE,
    delivery_attempts INTEGER DEFAULT 0,
    
    -- Delivery information
    delivered_to VARCHAR(200), -- Name of person who received
    delivery_notes TEXT,
    delivery_signature_url TEXT,
    
    -- Costs
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    insurance_cost DECIMAL(10,2) DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- ORDER DISCOUNTS TABLE - Applied discounts and coupons
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_discounts (
    discount_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    
    -- Discount information
    discount_type VARCHAR(20) NOT NULL, -- 'percentage', 'fixed_amount', 'free_shipping'
    discount_value DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL CHECK (discount_amount >= 0),
    
    -- Coupon information
    coupon_code VARCHAR(100),
    coupon_name VARCHAR(200),
    
    -- Application scope
    applies_to VARCHAR(20) DEFAULT 'order', -- 'order', 'shipping', 'item'
    target_item_id UUID, -- If applies to specific item
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT order_discounts_type_valid CHECK (
        discount_type IN ('percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y')
    ),
    CONSTRAINT order_discounts_applies_to_valid CHECK (
        applies_to IN ('order', 'shipping', 'item', 'category')
    )
);

-- =============================================================================
-- ORDER NOTIFICATIONS TABLE - Track notifications sent
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    
    -- Notification details
    type VARCHAR(50) NOT NULL, -- 'email', 'sms', 'whatsapp', 'push'
    channel VARCHAR(50) NOT NULL, -- 'order_confirmation', 'payment_received', 'shipped', etc.
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
    CONSTRAINT order_notifications_type_valid CHECK (
        type IN ('email', 'sms', 'whatsapp', 'push')
    ),
    CONSTRAINT order_notifications_status_valid CHECK (
        status IN ('pending', 'sent', 'delivered', 'failed', 'cancelled')
    )
);

-- =============================================================================
-- ORDER RETURNS TABLE - Return and refund management
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_returns (
    return_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    
    -- Return details
    return_number VARCHAR(50) UNIQUE NOT NULL,
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Return items (can be partial)
    items JSONB NOT NULL, -- Array of {item_id, quantity, reason}
    
    -- Financial information
    refund_amount DECIMAL(10,2) NOT NULL CHECK (refund_amount >= 0),
    restocking_fee DECIMAL(10,2) DEFAULT 0 CHECK (restocking_fee >= 0),
    
    -- Status and processing
    status VARCHAR(20) DEFAULT 'requested', -- 'requested', 'approved', 'rejected', 'received', 'processed'
    approved_by UUID, -- References users table
    processed_by UUID, -- References users table
    
    -- Dates
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional information
    return_shipping_cost DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT order_returns_status_valid CHECK (
        status IN ('requested', 'approved', 'rejected', 'received', 'processed', 'cancelled')
    )
);

-- =============================================================================
-- INDEXES for performance optimization
-- =============================================================================

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_confirmed_at ON orders(confirmed_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created ON orders(payment_status, created_at);

-- Order items indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_sku ON order_items(product_sku);

-- Order status history indexes
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON order_status_history(created_at);
CREATE INDEX IF NOT EXISTS idx_order_status_history_new_status ON order_status_history(new_status);

-- Order payments indexes
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_status ON order_payments(status);
CREATE INDEX IF NOT EXISTS idx_order_payments_payment_method ON order_payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_order_payments_transaction_id ON order_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_processed_at ON order_payments(processed_at);

-- Order shipping indexes
CREATE INDEX IF NOT EXISTS idx_order_shipping_order_id ON order_shipping(order_id);
CREATE INDEX IF NOT EXISTS idx_order_shipping_tracking_number ON order_shipping(tracking_number);
CREATE INDEX IF NOT EXISTS idx_order_shipping_carrier ON order_shipping(carrier);
CREATE INDEX IF NOT EXISTS idx_order_shipping_shipped_at ON order_shipping(shipped_at);

-- Order discounts indexes
CREATE INDEX IF NOT EXISTS idx_order_discounts_order_id ON order_discounts(order_id);
CREATE INDEX IF NOT EXISTS idx_order_discounts_coupon_code ON order_discounts(coupon_code);

-- Order notifications indexes
CREATE INDEX IF NOT EXISTS idx_order_notifications_order_id ON order_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notifications_type ON order_notifications(type);
CREATE INDEX IF NOT EXISTS idx_order_notifications_status ON order_notifications(status);
CREATE INDEX IF NOT EXISTS idx_order_notifications_sent_at ON order_notifications(sent_at);

-- Order returns indexes
CREATE INDEX IF NOT EXISTS idx_order_returns_order_id ON order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_return_number ON order_returns(return_number);
CREATE INDEX IF NOT EXISTS idx_order_returns_status ON order_returns(status);
CREATE INDEX IF NOT EXISTS idx_order_returns_requested_at ON order_returns(requested_at);

-- =============================================================================
-- TRIGGERS for automatic updates
-- =============================================================================

-- Generate order number automatically
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    year_suffix VARCHAR(2);
    sequence_num INTEGER;
BEGIN
    -- Get last 2 digits of current year
    year_suffix := RIGHT(EXTRACT(YEAR FROM NOW())::TEXT, 2);
    
    -- Get next sequence number for this year
    SELECT COALESCE(MAX(CAST(RIGHT(order_number, 6) AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM orders
    WHERE order_number LIKE 'ORD-' || year_suffix || '%';
    
    -- Generate order number: ORD-YY-NNNNNN
    NEW.order_number := 'ORD-' || year_suffix || '-' || LPAD(sequence_num::TEXT, 6, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION generate_order_number();

-- Update order totals when items change
CREATE OR REPLACE FUNCTION update_order_totals()
RETURNS TRIGGER AS $$
DECLARE
    order_subtotal DECIMAL(10,2);
    order_total DECIMAL(10,2);
BEGIN
    -- Calculate subtotal from order items
    SELECT COALESCE(SUM(total_price), 0)
    INTO order_subtotal
    FROM order_items
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id);
    
    -- Update order with new subtotal and total
    UPDATE orders
    SET 
        subtotal = order_subtotal,
        total_amount = order_subtotal + tax_amount + shipping_cost - discount_amount,
        updated_at = NOW()
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_order_totals_insert
    AFTER INSERT ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_order_totals();

CREATE TRIGGER trigger_update_order_totals_update
    AFTER UPDATE ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_order_totals();

CREATE TRIGGER trigger_update_order_totals_delete
    AFTER DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_order_totals();

-- Log status changes automatically
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_status_history (
            order_id, previous_status, new_status, 
            changed_by_type, metadata
        ) VALUES (
            NEW.order_id, OLD.status, NEW.status,
            'system', json_build_object('trigger', 'automatic')
        );
        
        -- Update timestamp fields based on new status
        CASE NEW.status
            WHEN 'confirmed' THEN NEW.confirmed_at := NOW();
            WHEN 'shipped' THEN NEW.shipped_at := NOW();
            WHEN 'delivered' THEN NEW.delivered_at := NOW();
            WHEN 'cancelled' THEN NEW.cancelled_at := NOW();
            ELSE NULL;
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_order_status_change
    BEFORE UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- Update timestamps
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_payments_updated_at BEFORE UPDATE ON order_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_shipping_updated_at BEFORE UPDATE ON order_shipping
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_returns_updated_at BEFORE UPDATE ON order_returns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FUNCTIONS for common operations
-- =============================================================================

-- Function to get order with all details
CREATE OR REPLACE FUNCTION get_order_details(p_order_id UUID)
RETURNS TABLE (
    order_id UUID,
    order_number VARCHAR(50),
    status order_status,
    payment_status payment_status,
    total_amount DECIMAL(10,2),
    currency VARCHAR(3),
    customer_email VARCHAR(255),
    items JSONB,
    payments JSONB,
    shipping JSONB,
    status_history JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.order_id,
        o.order_number,
        o.status,
        o.payment_status,
        o.total_amount,
        o.currency,
        o.customer_email,
        COALESCE(
            (SELECT json_agg(json_build_object(
                'item_id', oi.item_id,
                'product_name', oi.product_name,
                'product_sku', oi.product_sku,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'total_price', oi.total_price
            ))
            FROM order_items oi WHERE oi.order_id = o.order_id),
            '[]'::json
        ) as items,
        COALESCE(
            (SELECT json_agg(json_build_object(
                'payment_id', op.payment_id,
                'amount', op.amount,
                'payment_method', op.payment_method,
                'status', op.status,
                'transaction_id', op.transaction_id
            ))
            FROM order_payments op WHERE op.order_id = o.order_id),
            '[]'::json
        ) as payments,
        COALESCE(
            (SELECT json_build_object(
                'tracking_number', os.tracking_number,
                'carrier', os.carrier,
                'shipped_at', os.shipped_at,
                'estimated_delivery', os.estimated_delivery
            )
            FROM order_shipping os WHERE os.order_id = o.order_id LIMIT 1),
            '{}'::json
        ) as shipping,
        COALESCE(
            (SELECT json_agg(json_build_object(
                'previous_status', osh.previous_status,
                'new_status', osh.new_status,
                'created_at', osh.created_at,
                'reason', osh.reason
            ) ORDER BY osh.created_at)
            FROM order_status_history osh WHERE osh.order_id = o.order_id),
            '[]'::json
        ) as status_history
    FROM orders o
    WHERE o.order_id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate order analytics
CREATE OR REPLACE FUNCTION get_order_analytics(
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    total_orders INTEGER,
    total_revenue DECIMAL(10,2),
    avg_order_value DECIMAL(10,2),
    orders_by_status JSONB,
    orders_by_payment_method JSONB,
    daily_orders JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_orders,
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        COALESCE(AVG(o.total_amount), 0) as avg_order_value,
        (SELECT json_object_agg(status, count)
         FROM (SELECT status, COUNT(*) as count
               FROM orders
               WHERE created_at BETWEEN p_start_date AND p_end_date
               GROUP BY status) s) as orders_by_status,
        (SELECT json_object_agg(payment_method, count)
         FROM (SELECT payment_method, COUNT(*) as count
               FROM orders
               WHERE created_at BETWEEN p_start_date AND p_end_date
               AND payment_method IS NOT NULL
               GROUP BY payment_method) pm) as orders_by_payment_method,
        (SELECT json_agg(json_build_object(
            'date', date_trunc('day', created_at),
            'orders', COUNT(*),
            'revenue', SUM(total_amount)
         ) ORDER BY date_trunc('day', created_at))
         FROM orders
         WHERE created_at BETWEEN p_start_date AND p_end_date
         GROUP BY date_trunc('day', created_at)) as daily_orders
    FROM orders o
    WHERE o.created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VIEWS for common queries
-- =============================================================================

-- View for order summary
CREATE OR REPLACE VIEW order_summary AS
SELECT 
    o.order_id,
    o.order_number,
    o.user_id,
    o.status,
    o.payment_status,
    o.fulfillment_status,
    o.total_amount,
    o.currency,
    o.customer_email,
    o.payment_method,
    o.created_at,
    o.confirmed_at,
    o.shipped_at,
    o.delivered_at,
    COUNT(oi.item_id) as item_count,
    SUM(oi.quantity) as total_quantity
FROM orders o
LEFT JOIN order_items oi ON o.order_id = oi.order_id
GROUP BY o.order_id, o.order_number, o.user_id, o.status, o.payment_status,
         o.fulfillment_status, o.total_amount, o.currency, o.customer_email,
         o.payment_method, o.created_at, o.confirmed_at, o.shipped_at, o.delivered_at;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Order Service Database Migration Completed Successfully';
    RAISE NOTICE 'Created tables: orders, order_items, order_status_history, order_payments, order_shipping, order_discounts, order_notifications, order_returns';
    RAISE NOTICE 'Created indexes, triggers, functions, and views';
    RAISE NOTICE 'Migration: 003_order_service_schema.sql - COMPLETED';
END $$;
