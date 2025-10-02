-- Migration: Create orders tables and related structures
-- Version: 1.0.0
-- Description: Initial order management schema

-- Create custom types
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'cancelled');
CREATE TYPE shipping_method AS ENUM ('standard', 'express', 'overnight', 'pickup');

-- Orders table - Main order information
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References auth-service users table
    order_number VARCHAR(50) UNIQUE NOT NULL,
    status order_status DEFAULT 'pending',
    subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
    tax_amount DECIMAL(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_amount DECIMAL(10,2) DEFAULT 0 CHECK (shipping_amount >= 0),
    discount_amount DECIMAL(10,2) DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    shipping_address JSONB NOT NULL,
    billing_address JSONB,
    shipping_method shipping_method DEFAULT 'standard',
    estimated_delivery_date DATE,
    actual_delivery_date DATE,
    tracking_number VARCHAR(100),
    notes TEXT,
    payment_status payment_status DEFAULT 'pending',
    payment_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT orders_total_calculation CHECK (
        total_amount = (subtotal + tax_amount + shipping_amount - discount_amount)
    )
);

-- Order items table - Individual items in each order
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL, -- References product-service products table
    variant_id UUID, -- References product-service product_variants table
    product_name VARCHAR(255) NOT NULL, -- Snapshot of product name at time of order
    product_sku VARCHAR(100) NOT NULL, -- Snapshot of SKU at time of order
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
    discount_amount DECIMAL(10,2) DEFAULT 0 CHECK (discount_amount >= 0),
    tax_amount DECIMAL(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
    specifications JSONB DEFAULT '{}', -- Product specifications at time of order
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT order_items_total_calculation CHECK (
        total_price = ((unit_price * quantity) - discount_amount + tax_amount)
    )
);

-- Order status history - Track all status changes
CREATE TABLE order_status_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    old_status order_status,
    new_status order_status NOT NULL,
    changed_by UUID, -- User who made the change
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order payments - Payment transaction details
CREATE TABLE order_payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    payment_method VARCHAR(50) NOT NULL,
    payment_provider VARCHAR(100),
    transaction_id VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    status payment_status DEFAULT 'pending',
    payment_date TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order shipping - Shipping and tracking information
CREATE TABLE order_shipping (
    shipping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    carrier VARCHAR(100),
    tracking_number VARCHAR(100),
    shipping_cost DECIMAL(10,2) DEFAULT 0 CHECK (shipping_cost >= 0),
    weight DECIMAL(8,3),
    dimensions VARCHAR(100),
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    estimated_delivery DATE,
    actual_delivery DATE,
    status VARCHAR(50) DEFAULT 'preparing',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order discounts - Applied discounts and coupons
CREATE TABLE order_discounts (
    discount_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    coupon_code VARCHAR(50),
    discount_type VARCHAR(20) NOT NULL, -- 'percentage', 'fixed_amount', 'free_shipping'
    discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value >= 0),
    discount_amount DECIMAL(10,2) NOT NULL CHECK (discount_amount >= 0),
    description TEXT,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order notifications - Track notifications sent to customers
CREATE TABLE order_notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
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
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX idx_order_status_history_created_at ON order_status_history(created_at);

CREATE INDEX idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX idx_order_payments_status ON order_payments(status);

CREATE INDEX idx_order_shipping_order_id ON order_shipping(order_id);
CREATE INDEX idx_order_shipping_tracking ON order_shipping(tracking_number);

CREATE INDEX idx_order_discounts_order_id ON order_discounts(order_id);
CREATE INDEX idx_order_discounts_coupon ON order_discounts(coupon_code);

CREATE INDEX idx_order_notifications_order_id ON order_notifications(order_id);
CREATE INDEX idx_order_notifications_status ON order_notifications(status);

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_order_payments_updated_at BEFORE UPDATE ON order_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_order_shipping_updated_at BEFORE UPDATE ON order_shipping FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for order status history
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
        VALUES (NEW.order_id, OLD.status, NEW.status, NEW.updated_by);
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_log_order_status_changes
    AFTER UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR AS $$
DECLARE
    order_num VARCHAR(50);
    current_year INTEGER;
    sequence_num INTEGER;
BEGIN
    current_year := EXTRACT(YEAR FROM NOW());

    -- Get next sequence number for this year
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM orders
    WHERE order_number LIKE 'ORD' || current_year || '%';

    -- Generate order number in format: ORD20240001
    order_num := 'ORD' || current_year || LPAD(sequence_num::TEXT, 4, '0');

    RETURN order_num;
END;
$$ language 'plpgsql';

-- Function to calculate order totals
CREATE OR REPLACE FUNCTION calculate_order_totals(p_order_id UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    total DECIMAL(10,2) := 0;
    subtotal DECIMAL(10,2) := 0;
    tax DECIMAL(10,2) := 0;
    shipping DECIMAL(10,2) := 0;
    discount DECIMAL(10,2) := 0;
BEGIN
    -- Calculate subtotal from order items
    SELECT COALESCE(SUM(total_price), 0) INTO subtotal
    FROM order_items WHERE order_id = p_order_id;

    -- Get shipping amount
    SELECT COALESCE(shipping_amount, 0) INTO shipping
    FROM orders WHERE order_id = p_order_id;

    -- Get discount amount
    SELECT COALESCE(SUM(discount_amount), 0) INTO discount
    FROM order_discounts WHERE order_id = p_order_id;

    -- Calculate tax (assuming 8% tax rate - can be made configurable)
    tax := (subtotal - discount) * 0.08;

    -- Calculate total
    total := subtotal + tax + shipping - discount;

    -- Update order with calculated totals
    UPDATE orders SET
        subtotal = subtotal,
        tax_amount = tax,
        discount_amount = discount,
        total_amount = total
    WHERE order_id = p_order_id;

    RETURN total;
END;
$$ language 'plpgsql';

-- Function to check if order can be cancelled
CREATE OR REPLACE FUNCTION can_cancel_order(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    order_status order_status;
    order_date TIMESTAMP WITH TIME ZONE;
    days_since_order INTEGER;
BEGIN
    SELECT o.status, o.created_at INTO order_status, order_date
    FROM orders o WHERE o.order_id = p_order_id;

    -- Can only cancel pending, confirmed, or processing orders
    IF order_status NOT IN ('pending', 'confirmed', 'processing') THEN
        RETURN false;
    END IF;

    -- Can cancel within 24 hours of order placement
    days_since_order := EXTRACT(DAYS FROM (NOW() - order_date));

    RETURN days_since_order <= 1;
END;
$$ language 'plpgsql';

-- Row Level Security (RLS) - Enable for production
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_shipping ENABLE ROW LEVEL SECURITY;

-- RLS Policies for orders table
CREATE POLICY "Users can view their own orders" ON orders
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own orders" ON orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending orders" ON orders
    FOR UPDATE USING (auth.uid() = user_id AND status IN ('pending', 'confirmed'));

-- RLS Policies for order items
CREATE POLICY "Users can view items from their orders" ON order_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM orders WHERE orders.order_id = order_items.order_id AND orders.user_id = auth.uid())
    );

-- RLS Policies for order status history
CREATE POLICY "Users can view history of their orders" ON order_status_history
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM orders WHERE orders.order_id = order_status_history.order_id AND orders.user_id = auth.uid())
    );

-- Insert sample orders (for testing - remove in production)
-- Note: These reference the sample users from auth-service
INSERT INTO orders (order_id, user_id, order_number, subtotal, total_amount, shipping_address, status)
SELECT
    gen_random_uuid(),
    u.user_id,
    generate_order_number(),
    100.00,
    108.00, -- subtotal + 8% tax
    '{"street": "123 Main St", "city": "Anytown", "state": "CA", "zip": "12345", "country": "USA"}'::jsonb,
    'delivered'
FROM users u
WHERE u.email = 'admin@medicalstore.com'
LIMIT 1;

-- Insert sample order items
INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, unit_price, total_price)
SELECT
    o.order_id,
    p.product_id,
    p.name,
    p.sku,
    1,
    p.price,
    p.price
FROM orders o
JOIN products p ON p.name = 'Professional Dental Chair Deluxe'
WHERE o.user_id IN (SELECT user_id FROM users WHERE email = 'admin@medicalstore.com')
LIMIT 1;
