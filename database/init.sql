-- Dental Store Database Initialization
-- This script runs when the PostgreSQL container starts

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS dental_store;

-- Connect to the dental_store database
\c dental_store;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types (if not exists)
DO $$
BEGIN
    -- User roles
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('customer', 'admin', 'manager', 'staff');
    END IF;

    -- User status
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
        CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending');
    END IF;

    -- Product status
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
        CREATE TYPE product_status AS ENUM ('active', 'inactive', 'discontinued', 'out_of_stock');
    END IF;

    -- Order status
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
    END IF;

    -- Payment status
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded');
    END IF;

    -- Payment method
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE payment_method AS ENUM ('credit_card', 'debit_card', 'bank_transfer', 'paypal', 'stripe', 'cash_on_delivery');
    END IF;

    -- Shipment status
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shipment_status') THEN
        CREATE TYPE shipment_status AS ENUM ('pending', 'label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned', 'cancelled');
    END IF;

    -- Shipping carrier
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shipping_carrier') THEN
        CREATE TYPE shipping_carrier AS ENUM ('ups', 'fedex', 'usps', 'dhl', 'local_delivery', 'pickup');
    END IF;

    -- Delivery type
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_type') THEN
        CREATE TYPE delivery_type AS ENUM ('standard', 'express', 'overnight', 'two_day', 'ground', 'pickup');
    END IF;

    -- Refund status
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status') THEN
        CREATE TYPE refund_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- Type already exists, continue
        NULL;
END $$;

-- Create indexes for better performance (if not exists)
DO $$
BEGIN
    -- Users table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_email') THEN
        CREATE INDEX idx_users_email ON users(email);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_role') THEN
        CREATE INDEX idx_users_role ON users(role);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_status') THEN
        CREATE INDEX idx_users_status ON users(status);
    END IF;

    -- Products table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_products_category') THEN
        CREATE INDEX idx_products_category ON products(category_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_products_status') THEN
        CREATE INDEX idx_products_status ON products(status);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_products_sku') THEN
        CREATE INDEX idx_products_sku ON products(sku);
    END IF;

    -- Orders table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_user_id') THEN
        CREATE INDEX idx_orders_user_id ON orders(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_status') THEN
        CREATE INDEX idx_orders_status ON orders(status);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_order_number') THEN
        CREATE INDEX idx_orders_order_number ON orders(order_number);
    END IF;

    -- Shipments table indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_shipments_order_id') THEN
        CREATE INDEX idx_shipments_order_id ON shipments(order_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_shipments_tracking') THEN
        CREATE INDEX idx_shipments_tracking ON shipments(tracking_number);
    END IF;

    -- Payment transactions indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payment_transactions_order_id') THEN
        CREATE INDEX idx_payment_transactions_order_id ON payment_transactions(order_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payment_transactions_user_id') THEN
        CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- Index already exists, continue
        NULL;
END $$;

-- Set up Row Level Security (RLS) for production
-- Note: These policies will be applied when migrations run

-- Create utility functions for common operations
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

-- Create utility functions for payment operations
CREATE OR REPLACE FUNCTION generate_payment_reference()
RETURNS VARCHAR AS $$
DECLARE
    payment_ref VARCHAR(50);
    timestamp_str VARCHAR;
    random_str VARCHAR;
BEGIN
    timestamp_str := REPLACE(CAST(EXTRACT(EPOCH FROM NOW()) * 1000 AS BIGINT)::TEXT, '.', '');
    random_str := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    -- Generate payment reference in format: PAY-TIMESTAMP-RANDOM
    payment_ref := 'PAY-' || timestamp_str || '-' || random_str;

    RETURN payment_ref;
END;
$$ language 'plpgsql';

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'Dental Store database initialized successfully';
    RAISE NOTICE 'Database: dental_store';
    RAISE NOTICE 'Extensions: uuid-ossp, pgcrypto';
    RAISE NOTICE 'Custom types: user_role, user_status, product_status, order_status, payment_status, payment_method, shipment_status, shipping_carrier, delivery_type, refund_status';
    RAISE NOTICE 'Utility functions: generate_order_number, generate_payment_reference';
END $$;
