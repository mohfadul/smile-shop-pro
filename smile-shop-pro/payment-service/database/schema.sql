-- Payment Service Database Schema
-- Complete payment processing system for the medical store

-- Create custom types
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded');
CREATE TYPE payment_method AS ENUM ('credit_card', 'debit_card', 'bank_transfer', 'paypal', 'stripe', 'cash_on_delivery');
CREATE TYPE refund_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- Payment transactions table - Main payment records
CREATE TABLE payment_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL, -- References order-service orders table
    user_id UUID NOT NULL, -- References auth-service users table
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    status payment_status DEFAULT 'pending',
    payment_method payment_method NOT NULL,
    payment_provider VARCHAR(50), -- 'stripe', 'paypal', etc.
    provider_transaction_id VARCHAR(255), -- External payment provider ID
    provider_payment_method_id VARCHAR(255), -- Stripe payment method ID
    gateway_response JSONB DEFAULT '{}', -- Full response from payment gateway
    failure_reason TEXT,
    metadata JSONB DEFAULT '{}', -- Additional payment data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT payment_transactions_amount_positive CHECK (amount > 0)
);

-- Payment refunds table - Refund management
CREATE TABLE payment_refunds (
    refund_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES payment_transactions(transaction_id) ON DELETE CASCADE,
    order_id UUID NOT NULL, -- References order-service orders table
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    status refund_status DEFAULT 'pending',
    refund_reason VARCHAR(255),
    provider_refund_id VARCHAR(255), -- External refund ID
    gateway_response JSONB DEFAULT '{}',
    processed_by UUID, -- User who processed the refund
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT payment_refunds_amount_positive CHECK (amount > 0)
);

-- Payment webhooks table - Track webhook events from payment providers
CREATE TABLE payment_webhooks (
    webhook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES payment_transactions(transaction_id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'stripe', 'paypal', etc.
    event_type VARCHAR(100) NOT NULL, -- 'payment_intent.succeeded', 'charge.dispute.created', etc.
    event_id VARCHAR(255), -- Provider's event ID
    payload JSONB NOT NULL, -- Full webhook payload
    signature VARCHAR(255), -- Webhook signature for verification
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment methods table - Store customer payment methods for future use
CREATE TABLE payment_methods (
    payment_method_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References auth-service users table
    provider VARCHAR(50) NOT NULL, -- 'stripe', 'paypal', etc.
    provider_payment_method_id VARCHAR(255) NOT NULL,
    type payment_method NOT NULL,
    last_four_digits VARCHAR(4),
    expiry_month INTEGER,
    expiry_year INTEGER,
    brand VARCHAR(50), -- 'visa', 'mastercard', etc.
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment fees table - Track payment processing fees
CREATE TABLE payment_fees (
    fee_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES payment_transactions(transaction_id) ON DELETE CASCADE,
    fee_type VARCHAR(50) NOT NULL, -- 'processing', 'gateway', 'interchange'
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    description TEXT,
    provider_fee_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment disputes table - Handle chargebacks and disputes
CREATE TABLE payment_disputes (
    dispute_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES payment_transactions(transaction_id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_dispute_id VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'under_review', 'won', 'lost', 'accepted'
    reason VARCHAR(255),
    evidence_deadline DATE,
    response_due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_payment_transactions_order_id ON payment_transactions(order_id);
CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX idx_payment_transactions_provider_transaction_id ON payment_transactions(provider_transaction_id);
CREATE INDEX idx_payment_transactions_created_at ON payment_transactions(created_at);

CREATE INDEX idx_payment_refunds_transaction_id ON payment_refunds(transaction_id);
CREATE INDEX idx_payment_refunds_status ON payment_refunds(status);
CREATE INDEX idx_payment_refunds_created_at ON payment_refunds(created_at);

CREATE INDEX idx_payment_webhooks_transaction_id ON payment_webhooks(transaction_id);
CREATE INDEX idx_payment_webhooks_event_type ON payment_webhooks(event_type);
CREATE INDEX idx_payment_webhooks_processed ON payment_webhooks(processed);

CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX idx_payment_methods_provider ON payment_methods(provider);
CREATE INDEX idx_payment_methods_active ON payment_methods(is_active);

CREATE INDEX idx_payment_fees_transaction_id ON payment_fees(transaction_id);
CREATE INDEX idx_payment_fees_type ON payment_fees(fee_type);

CREATE INDEX idx_payment_disputes_transaction_id ON payment_disputes(transaction_id);
CREATE INDEX idx_payment_disputes_provider ON payment_disputes(provider);
CREATE INDEX idx_payment_disputes_status ON payment_disputes(status);

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_refunds_updated_at BEFORE UPDATE ON payment_refunds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_disputes_updated_at BEFORE UPDATE ON payment_disputes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate total payment amount including fees
CREATE OR REPLACE FUNCTION calculate_payment_total(p_transaction_id UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    payment_amount DECIMAL(10,2);
    total_fees DECIMAL(10,2) := 0;
BEGIN
    -- Get payment amount
    SELECT amount INTO payment_amount
    FROM payment_transactions
    WHERE transaction_id = p_transaction_id;

    -- Calculate total fees
    SELECT COALESCE(SUM(amount), 0) INTO total_fees
    FROM payment_fees
    WHERE transaction_id = p_transaction_id;

    RETURN payment_amount + total_fees;
END;
$$ language 'plpgsql';

-- Function to check if payment can be refunded
CREATE OR REPLACE FUNCTION can_refund_payment(p_transaction_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    payment_status payment_status;
    transaction_date TIMESTAMP WITH TIME ZONE;
    days_since_transaction INTEGER;
BEGIN
    SELECT pt.status, pt.created_at INTO payment_status, transaction_date
    FROM payment_transactions pt WHERE pt.transaction_id = p_transaction_id;

    -- Can only refund completed payments
    IF payment_status != 'completed' THEN
        RETURN false;
    END IF;

    -- Can refund within 180 days of transaction
    days_since_transaction := EXTRACT(DAYS FROM (NOW() - transaction_date));

    RETURN days_since_transaction <= 180;
END;
$$ language 'plpgsql';

-- Function to get refundable amount (considering partial refunds)
CREATE OR REPLACE FUNCTION get_refundable_amount(p_transaction_id UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    original_amount DECIMAL(10,2);
    refunded_amount DECIMAL(10,2) := 0;
BEGIN
    -- Get original payment amount
    SELECT amount INTO original_amount
    FROM payment_transactions
    WHERE transaction_id = p_transaction_id;

    -- Calculate total refunded amount
    SELECT COALESCE(SUM(amount), 0) INTO refunded_amount
    FROM payment_refunds
    WHERE transaction_id = p_transaction_id AND status = 'completed';

    RETURN original_amount - refunded_amount;
END;
$$ language 'plpgsql';

-- Row Level Security (RLS) - Enable for production
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_disputes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment transactions
CREATE POLICY "Users can view their own payment transactions" ON payment_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create payment transactions for their orders" ON payment_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for payment methods
CREATE POLICY "Users can manage their own payment methods" ON payment_methods
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for payment refunds
CREATE POLICY "Users can view refunds for their payments" ON payment_refunds
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM payment_transactions pt
            WHERE pt.transaction_id = payment_refunds.transaction_id
            AND pt.user_id = auth.uid()
        )
    );

-- Insert sample payment data (for testing - remove in production)
-- Note: These reference the sample orders from order-service
INSERT INTO payment_transactions (transaction_id, order_id, user_id, amount, status, payment_method, provider)
SELECT
    gen_random_uuid(),
    o.order_id,
    o.user_id,
    o.total_amount,
    'completed',
    'credit_card',
    'stripe'
FROM orders o
WHERE o.user_id IN (SELECT user_id FROM users WHERE email = 'admin@medicalstore.com')
LIMIT 1;
