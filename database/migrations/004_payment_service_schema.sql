-- =============================================================================
-- PAYMENT SERVICE DATABASE MIGRATION
-- Dental Store Sudan - Payment Processing & Management
-- Migration: 004_payment_service_schema.sql
-- =============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types for payment management
DO $$ BEGIN
    CREATE TYPE payment_provider AS ENUM (
        'bank_transfer', 'cash_on_delivery', 'zain_cash', 'mtn_money', 
        'sudani_mobile', 'credit_card', 'debit_card'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transaction_status AS ENUM (
        'pending', 'processing', 'completed', 'failed', 'cancelled', 
        'refunded', 'partially_refunded', 'disputed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM (
        'payment', 'refund', 'partial_refund', 'chargeback', 'fee', 'adjustment'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- PAYMENT TRANSACTIONS TABLE - Main payment records
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_number VARCHAR(50) UNIQUE NOT NULL,
    order_id UUID NOT NULL, -- References orders table from order service
    user_id UUID NOT NULL, -- References users table from auth service
    
    -- Transaction details
    type transaction_type DEFAULT 'payment',
    status transaction_status DEFAULT 'pending',
    provider payment_provider NOT NULL,
    
    -- Financial information
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    exchange_rate DECIMAL(10,4) DEFAULT 1.0000,
    amount_in_base_currency DECIMAL(10,2), -- Amount in USD
    
    -- Provider-specific information
    provider_transaction_id VARCHAR(255),
    provider_reference VARCHAR(255),
    provider_response JSONB DEFAULT '{}',
    
    -- Bank transfer specific fields
    bank_name VARCHAR(100),
    bank_code VARCHAR(20),
    account_number VARCHAR(50),
    account_holder_name VARCHAR(200),
    transfer_reference VARCHAR(100),
    transfer_date TIMESTAMP WITH TIME ZONE,
    
    -- Mobile money specific fields
    mobile_provider VARCHAR(50), -- 'zain_cash', 'mtn_money', 'sudani_mobile'
    mobile_number VARCHAR(20),
    mobile_reference VARCHAR(100),
    
    -- Card payment specific fields (if implemented later)
    card_last_four VARCHAR(4),
    card_brand VARCHAR(20),
    card_type VARCHAR(20), -- 'credit', 'debit'
    
    -- Processing information
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID, -- References users table (for manual processing)
    
    -- Failure and error handling
    failure_code VARCHAR(50),
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Fees and charges
    processing_fee DECIMAL(10,2) DEFAULT 0,
    gateway_fee DECIMAL(10,2) DEFAULT 0,
    total_fees DECIMAL(10,2) DEFAULT 0,
    
    -- Additional information
    description TEXT,
    notes TEXT, -- Internal notes
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- For pending payments

    -- Constraints
    CONSTRAINT payment_transactions_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT payment_transactions_exchange_rate_positive CHECK (exchange_rate > 0),
    CONSTRAINT payment_transactions_retry_count_positive CHECK (retry_count >= 0)
);

-- =============================================================================
-- PAYMENT METHODS TABLE - Customer saved payment methods
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_methods (
    method_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References users table from auth service
    
    -- Method details
    provider payment_provider NOT NULL,
    name VARCHAR(100) NOT NULL, -- User-friendly name
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Bank account details
    bank_name VARCHAR(100),
    bank_code VARCHAR(20),
    account_number VARCHAR(50), -- Encrypted/masked
    account_holder_name VARCHAR(200),
    account_type VARCHAR(20), -- 'checking', 'savings'
    
    -- Mobile money details
    mobile_provider VARCHAR(50),
    mobile_number VARCHAR(20), -- Encrypted/masked
    mobile_account_name VARCHAR(200),
    
    -- Card details (if implemented)
    card_last_four VARCHAR(4),
    card_brand VARCHAR(20),
    card_type VARCHAR(20),
    card_expiry_month INTEGER,
    card_expiry_year INTEGER,
    
    -- Verification status
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_method VARCHAR(50), -- 'micro_deposit', 'sms', 'manual'
    
    -- Security and metadata
    fingerprint VARCHAR(100), -- Unique identifier for duplicate detection
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT payment_methods_card_expiry_valid CHECK (
        (card_expiry_month IS NULL OR (card_expiry_month BETWEEN 1 AND 12)) AND
        (card_expiry_year IS NULL OR card_expiry_year >= EXTRACT(YEAR FROM NOW()))
    )
);

-- =============================================================================
-- PAYMENT REFUNDS TABLE - Refund tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_refunds (
    refund_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    refund_number VARCHAR(50) UNIQUE NOT NULL,
    original_transaction_id UUID NOT NULL REFERENCES payment_transactions(transaction_id),
    order_id UUID NOT NULL, -- References orders table
    
    -- Refund details
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Processing information
    status transaction_status DEFAULT 'pending',
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID, -- References users table
    
    -- Provider information
    provider_refund_id VARCHAR(255),
    provider_reference VARCHAR(255),
    provider_response JSONB DEFAULT '{}',
    
    -- Fees
    refund_fee DECIMAL(10,2) DEFAULT 0,
    
    -- Additional information
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT payment_refunds_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

-- =============================================================================
-- PAYMENT WEBHOOKS TABLE - Webhook event tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_webhooks (
    webhook_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_id VARCHAR(255), -- Provider's event ID
    
    -- Related records
    transaction_id UUID REFERENCES payment_transactions(transaction_id),
    refund_id UUID REFERENCES payment_refunds(refund_id),
    
    -- Webhook data
    payload JSONB NOT NULL,
    headers JSONB DEFAULT '{}',
    signature VARCHAR(500), -- Webhook signature for verification
    
    -- Processing status
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_attempts INTEGER DEFAULT 0,
    processing_error TEXT,
    
    -- Verification
    verified BOOLEAN DEFAULT false,
    verification_error TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT payment_webhooks_processing_attempts_positive CHECK (processing_attempts >= 0)
);

-- =============================================================================
-- PAYMENT DISPUTES TABLE - Dispute and chargeback management
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_disputes (
    dispute_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_number VARCHAR(50) UNIQUE NOT NULL,
    transaction_id UUID NOT NULL REFERENCES payment_transactions(transaction_id),
    
    -- Dispute details
    type VARCHAR(50) NOT NULL, -- 'chargeback', 'inquiry', 'fraud', 'authorization'
    reason VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Status and dates
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'under_review', 'won', 'lost', 'closed'
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    due_date TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Provider information
    provider_dispute_id VARCHAR(255),
    provider_reason_code VARCHAR(50),
    
    -- Evidence and documentation
    evidence JSONB DEFAULT '{}', -- Evidence submitted
    evidence_due_date TIMESTAMP WITH TIME ZONE,
    evidence_submitted_at TIMESTAMP WITH TIME ZONE,
    
    -- Resolution
    resolution VARCHAR(100), -- 'accepted', 'disputed', 'won', 'lost'
    resolution_reason TEXT,
    
    -- Additional information
    description TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT payment_disputes_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT payment_disputes_type_valid CHECK (
        type IN ('chargeback', 'inquiry', 'fraud', 'authorization', 'processing_error')
    ),
    CONSTRAINT payment_disputes_status_valid CHECK (
        status IN ('open', 'under_review', 'won', 'lost', 'closed', 'expired')
    )
);

-- =============================================================================
-- PAYMENT FEES TABLE - Fee tracking and calculation
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_fees (
    fee_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES payment_transactions(transaction_id),
    refund_id UUID REFERENCES payment_refunds(refund_id),
    
    -- Fee details
    fee_type VARCHAR(50) NOT NULL, -- 'processing', 'gateway', 'currency_conversion', 'dispute'
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Calculation details
    calculation_method VARCHAR(50), -- 'percentage', 'fixed', 'tiered'
    calculation_base DECIMAL(10,2), -- Base amount for percentage calculations
    rate DECIMAL(8,4), -- Rate used (percentage or fixed amount)
    
    -- Provider information
    provider VARCHAR(50),
    provider_fee_id VARCHAR(255),
    
    -- Description and metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT payment_fees_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT payment_fees_type_valid CHECK (
        fee_type IN ('processing', 'gateway', 'currency_conversion', 'dispute', 'chargeback', 'refund')
    ),
    CONSTRAINT payment_fees_calculation_method_valid CHECK (
        calculation_method IN ('percentage', 'fixed', 'tiered', 'custom')
    )
);

-- =============================================================================
-- BANK ACCOUNTS TABLE - Sudan bank account information
-- =============================================================================
CREATE TABLE IF NOT EXISTS sudan_bank_accounts (
    bank_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_name VARCHAR(100) NOT NULL,
    bank_code VARCHAR(20) UNIQUE NOT NULL,
    swift_code VARCHAR(11),
    
    -- Account details for receiving payments
    account_number VARCHAR(50) NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    branch_name VARCHAR(100),
    branch_code VARCHAR(20),
    
    -- Bank information
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    
    -- Status and configuration
    is_active BOOLEAN DEFAULT true,
    supports_online_transfer BOOLEAN DEFAULT false,
    processing_time_hours INTEGER DEFAULT 24, -- Expected processing time
    
    -- Instructions for customers
    transfer_instructions TEXT,
    required_reference_format VARCHAR(100), -- Format for transfer reference
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- EXCHANGE RATES TABLE - Currency exchange rates
-- =============================================================================
CREATE TABLE IF NOT EXISTS exchange_rates (
    rate_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    rate DECIMAL(12,6) NOT NULL CHECK (rate > 0),
    
    -- Rate metadata
    source VARCHAR(50), -- 'central_bank', 'manual', 'api'
    effective_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional information
    buy_rate DECIMAL(12,6), -- Rate for buying foreign currency
    sell_rate DECIMAL(12,6), -- Rate for selling foreign currency
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, -- References users table

    -- Constraints
    CONSTRAINT exchange_rates_currency_format CHECK (
        from_currency ~ '^[A-Z]{3}$' AND to_currency ~ '^[A-Z]{3}$'
    ),
    CONSTRAINT exchange_rates_different_currencies CHECK (from_currency != to_currency),
    UNIQUE(from_currency, to_currency, effective_date)
);

-- =============================================================================
-- INDEXES for performance optimization
-- =============================================================================

-- Payment transactions indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider ON payment_transactions(provider);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_type ON payment_transactions(type);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_number ON payment_transactions(transaction_number);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_transaction_id ON payment_transactions(provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_processed_at ON payment_transactions(processed_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_status ON payment_transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_status ON payment_transactions(order_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_status ON payment_transactions(provider, status);

-- Payment methods indexes
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_provider ON payment_methods(provider);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(is_default);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_active ON payment_methods(is_active);
CREATE INDEX IF NOT EXISTS idx_payment_methods_fingerprint ON payment_methods(fingerprint);

-- Payment refunds indexes
CREATE INDEX IF NOT EXISTS idx_payment_refunds_original_transaction_id ON payment_refunds(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_order_id ON payment_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status ON payment_refunds(status);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_refund_number ON payment_refunds(refund_number);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_created_at ON payment_refunds(created_at);

-- Payment webhooks indexes
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_provider ON payment_webhooks(provider);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_event_type ON payment_webhooks(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_transaction_id ON payment_webhooks(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_processed ON payment_webhooks(processed);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created_at ON payment_webhooks(created_at);

-- Payment disputes indexes
CREATE INDEX IF NOT EXISTS idx_payment_disputes_transaction_id ON payment_disputes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_status ON payment_disputes(status);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_type ON payment_disputes(type);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_opened_at ON payment_disputes(opened_at);

-- Payment fees indexes
CREATE INDEX IF NOT EXISTS idx_payment_fees_transaction_id ON payment_fees(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_fees_refund_id ON payment_fees(refund_id);
CREATE INDEX IF NOT EXISTS idx_payment_fees_fee_type ON payment_fees(fee_type);

-- Sudan bank accounts indexes
CREATE INDEX IF NOT EXISTS idx_sudan_bank_accounts_bank_code ON sudan_bank_accounts(bank_code);
CREATE INDEX IF NOT EXISTS idx_sudan_bank_accounts_is_active ON sudan_bank_accounts(is_active);

-- Exchange rates indexes
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_effective_date ON exchange_rates(effective_date);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_expires_at ON exchange_rates(expires_at);

-- =============================================================================
-- TRIGGERS for automatic updates
-- =============================================================================

-- Generate transaction number automatically
CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS TRIGGER AS $$
DECLARE
    year_suffix VARCHAR(2);
    sequence_num INTEGER;
BEGIN
    -- Get last 2 digits of current year
    year_suffix := RIGHT(EXTRACT(YEAR FROM NOW())::TEXT, 2);
    
    -- Get next sequence number for this year
    SELECT COALESCE(MAX(CAST(RIGHT(transaction_number, 8) AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM payment_transactions
    WHERE transaction_number LIKE 'TXN-' || year_suffix || '%';
    
    -- Generate transaction number: TXN-YY-NNNNNNNN
    NEW.transaction_number := 'TXN-' || year_suffix || '-' || LPAD(sequence_num::TEXT, 8, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_transaction_number
    BEFORE INSERT ON payment_transactions
    FOR EACH ROW
    WHEN (NEW.transaction_number IS NULL)
    EXECUTE FUNCTION generate_transaction_number();

-- Generate refund number automatically
CREATE OR REPLACE FUNCTION generate_refund_number()
RETURNS TRIGGER AS $$
DECLARE
    year_suffix VARCHAR(2);
    sequence_num INTEGER;
BEGIN
    -- Get last 2 digits of current year
    year_suffix := RIGHT(EXTRACT(YEAR FROM NOW())::TEXT, 2);
    
    -- Get next sequence number for this year
    SELECT COALESCE(MAX(CAST(RIGHT(refund_number, 8) AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM payment_refunds
    WHERE refund_number LIKE 'REF-' || year_suffix || '%';
    
    -- Generate refund number: REF-YY-NNNNNNNN
    NEW.refund_number := 'REF-' || year_suffix || '-' || LPAD(sequence_num::TEXT, 8, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_refund_number
    BEFORE INSERT ON payment_refunds
    FOR EACH ROW
    WHEN (NEW.refund_number IS NULL)
    EXECUTE FUNCTION generate_refund_number();

-- Calculate amount in base currency
CREATE OR REPLACE FUNCTION calculate_base_currency_amount()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate amount in USD (base currency)
    IF NEW.currency = 'USD' THEN
        NEW.amount_in_base_currency := NEW.amount;
    ELSE
        NEW.amount_in_base_currency := NEW.amount / NEW.exchange_rate;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_base_currency_amount
    BEFORE INSERT OR UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION calculate_base_currency_amount();

-- Update timestamps
CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_refunds_updated_at BEFORE UPDATE ON payment_refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_disputes_updated_at BEFORE UPDATE ON payment_disputes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sudan_bank_accounts_updated_at BEFORE UPDATE ON sudan_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FUNCTIONS for common operations
-- =============================================================================

-- Function to get payment details with related information
CREATE OR REPLACE FUNCTION get_payment_details(p_transaction_id UUID)
RETURNS TABLE (
    transaction_id UUID,
    transaction_number VARCHAR(50),
    order_id UUID,
    amount DECIMAL(10,2),
    currency VARCHAR(3),
    status transaction_status,
    provider payment_provider,
    created_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    refunds JSONB,
    fees JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pt.transaction_id,
        pt.transaction_number,
        pt.order_id,
        pt.amount,
        pt.currency,
        pt.status,
        pt.provider,
        pt.created_at,
        pt.processed_at,
        COALESCE(
            (SELECT json_agg(json_build_object(
                'refund_id', pr.refund_id,
                'amount', pr.amount,
                'status', pr.status,
                'created_at', pr.created_at
            ))
            FROM payment_refunds pr WHERE pr.original_transaction_id = pt.transaction_id),
            '[]'::json
        ) as refunds,
        COALESCE(
            (SELECT json_agg(json_build_object(
                'fee_type', pf.fee_type,
                'amount', pf.amount,
                'description', pf.description
            ))
            FROM payment_fees pf WHERE pf.transaction_id = pt.transaction_id),
            '[]'::json
        ) as fees
    FROM payment_transactions pt
    WHERE pt.transaction_id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current exchange rate
CREATE OR REPLACE FUNCTION get_exchange_rate(
    p_from_currency VARCHAR(3),
    p_to_currency VARCHAR(3)
)
RETURNS DECIMAL(12,6) AS $$
DECLARE
    current_rate DECIMAL(12,6);
BEGIN
    -- Return 1.0 for same currency
    IF p_from_currency = p_to_currency THEN
        RETURN 1.0;
    END IF;
    
    -- Get most recent rate
    SELECT rate INTO current_rate
    FROM exchange_rates
    WHERE from_currency = p_from_currency
    AND to_currency = p_to_currency
    AND effective_date <= NOW()
    AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY effective_date DESC
    LIMIT 1;
    
    -- Return rate or default to 1.0 if not found
    RETURN COALESCE(current_rate, 1.0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate payment analytics
CREATE OR REPLACE FUNCTION get_payment_analytics(
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    total_transactions INTEGER,
    total_amount DECIMAL(10,2),
    successful_transactions INTEGER,
    failed_transactions INTEGER,
    success_rate DECIMAL(5,2),
    transactions_by_provider JSONB,
    transactions_by_status JSONB,
    daily_transactions JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_transactions,
        COALESCE(SUM(pt.amount_in_base_currency), 0) as total_amount,
        COUNT(CASE WHEN pt.status = 'completed' THEN 1 END)::INTEGER as successful_transactions,
        COUNT(CASE WHEN pt.status = 'failed' THEN 1 END)::INTEGER as failed_transactions,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND((COUNT(CASE WHEN pt.status = 'completed' THEN 1 END)::DECIMAL / COUNT(*) * 100), 2)
            ELSE 0 
        END as success_rate,
        (SELECT json_object_agg(provider, count)
         FROM (SELECT provider, COUNT(*) as count
               FROM payment_transactions
               WHERE created_at BETWEEN p_start_date AND p_end_date
               GROUP BY provider) p) as transactions_by_provider,
        (SELECT json_object_agg(status, count)
         FROM (SELECT status, COUNT(*) as count
               FROM payment_transactions
               WHERE created_at BETWEEN p_start_date AND p_end_date
               GROUP BY status) s) as transactions_by_status,
        (SELECT json_agg(json_build_object(
            'date', date_trunc('day', created_at),
            'transactions', COUNT(*),
            'amount', SUM(amount_in_base_currency),
            'successful', COUNT(CASE WHEN status = 'completed' THEN 1 END)
         ) ORDER BY date_trunc('day', created_at))
         FROM payment_transactions
         WHERE created_at BETWEEN p_start_date AND p_end_date
         GROUP BY date_trunc('day', created_at)) as daily_transactions
    FROM payment_transactions pt
    WHERE pt.created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VIEWS for common queries
-- =============================================================================

-- View for transaction summary
CREATE OR REPLACE VIEW payment_transaction_summary AS
SELECT 
    pt.transaction_id,
    pt.transaction_number,
    pt.order_id,
    pt.user_id,
    pt.type,
    pt.status,
    pt.provider,
    pt.amount,
    pt.currency,
    pt.amount_in_base_currency,
    pt.processed_at,
    pt.created_at,
    COALESCE(SUM(pf.amount), 0) as total_fees,
    COALESCE(SUM(pr.amount), 0) as total_refunded
FROM payment_transactions pt
LEFT JOIN payment_fees pf ON pt.transaction_id = pf.transaction_id
LEFT JOIN payment_refunds pr ON pt.transaction_id = pr.original_transaction_id AND pr.status = 'completed'
GROUP BY pt.transaction_id, pt.transaction_number, pt.order_id, pt.user_id,
         pt.type, pt.status, pt.provider, pt.amount, pt.currency,
         pt.amount_in_base_currency, pt.processed_at, pt.created_at;

-- =============================================================================
-- INITIAL DATA SEEDING
-- =============================================================================

-- Insert Sudan bank accounts for receiving payments
INSERT INTO sudan_bank_accounts (
    bank_name, bank_code, swift_code, account_number, account_name,
    branch_name, transfer_instructions, is_active
) VALUES
(
    'Bank of Khartoum',
    'BOK',
    'BOKHSDKH',
    '1234567890',
    'Dental Store Sudan Ltd',
    'Main Branch',
    'Please include your order number in the transfer reference. Transfers are processed within 24 hours during business days.',
    true
),
(
    'Faisal Islamic Bank',
    'FIBS',
    'FIBSSDKH',
    '0987654321',
    'Dental Store Sudan Ltd',
    'Khartoum Branch',
    'Use format: ORDER-XXXXXX as reference. Contact us after transfer with receipt.',
    true
),
(
    'Blue Nile Mashreq Bank',
    'BNMB',
    'BNMBSDKH',
    '1122334455',
    'Dental Store Sudan Ltd',
    'Commercial Branch',
    'Include order number and customer name in transfer details.',
    true
)
ON CONFLICT (bank_code) DO NOTHING;

-- Insert initial exchange rates (USD to SDG)
INSERT INTO exchange_rates (
    from_currency, to_currency, rate, source, created_by
) VALUES
(
    'USD', 'SDG', 600.0000, 'manual', 
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1)
),
(
    'SDG', 'USD', 0.0017, 'manual',
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1)
)
ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Payment Service Database Migration Completed Successfully';
    RAISE NOTICE 'Created tables: payment_transactions, payment_methods, payment_refunds, payment_webhooks, payment_disputes, payment_fees, sudan_bank_accounts, exchange_rates';
    RAISE NOTICE 'Created indexes, triggers, functions, and views';
    RAISE NOTICE 'Seeded initial bank accounts and exchange rates';
    RAISE NOTICE 'Migration: 004_payment_service_schema.sql - COMPLETED';
END $$;
