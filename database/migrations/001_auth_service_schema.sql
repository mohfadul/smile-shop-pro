-- =============================================================================
-- AUTH SERVICE DATABASE MIGRATION
-- Dental Store Sudan - Authentication & User Management
-- Migration: 001_auth_service_schema.sql
-- =============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types for user management
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'admin', 'manager', 'staff', 'dentist');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending', 'verified');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- USERS TABLE - Main authentication and profile data
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role user_role DEFAULT 'customer',
    status user_status DEFAULT 'active',
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    email_verification_token VARCHAR(255),
    phone_verification_code VARCHAR(6),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    profile_image_url TEXT,
    date_of_birth DATE,
    gender VARCHAR(10),
    address JSONB,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~* '^\+?[\d\s\-\(\)]+$'),
    CONSTRAINT users_password_length CHECK (length(password_hash) >= 60), -- bcrypt hash length
    CONSTRAINT users_login_attempts_positive CHECK (login_attempts >= 0),
    CONSTRAINT users_gender_valid CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'))
);

-- =============================================================================
-- USER SESSIONS TABLE - Active session tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    device_info TEXT,
    ip_address INET,
    user_agent TEXT,
    location JSONB,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes
    CONSTRAINT unique_active_session_per_device UNIQUE (user_id, device_info) DEFERRABLE INITIALLY DEFERRED
);

-- =============================================================================
-- USER ACTIVITY LOG - Audit trail
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_activity_log (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- PASSWORD HISTORY - Prevent password reuse
-- =============================================================================
CREATE TABLE IF NOT EXISTS password_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- PROFESSIONAL VERIFICATIONS - Dental professional verification
-- =============================================================================
CREATE TABLE IF NOT EXISTS professional_verifications (
    verification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    license_number VARCHAR(100) NOT NULL,
    license_type VARCHAR(50) NOT NULL, -- 'dentist', 'dental_hygienist', 'dental_assistant'
    issuing_authority VARCHAR(100) NOT NULL,
    institution VARCHAR(200),
    graduation_year INTEGER,
    specialization VARCHAR(100),
    documents JSONB, -- Array of document URLs/IDs
    status verification_status DEFAULT 'pending',
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES users(user_id),
    notes TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT professional_verifications_graduation_year_valid 
        CHECK (graduation_year IS NULL OR (graduation_year >= 1950 AND graduation_year <= EXTRACT(YEAR FROM NOW()) + 10)),
    CONSTRAINT professional_verifications_license_type_valid 
        CHECK (license_type IN ('dentist', 'dental_hygienist', 'dental_assistant', 'orthodontist', 'oral_surgeon'))
);

-- =============================================================================
-- USER PREFERENCES - Detailed user preferences
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_preferences (
    preference_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- 'notification', 'privacy', 'display', 'communication'
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, category, key)
);

-- =============================================================================
-- USER ADDRESSES - Multiple addresses per user
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_addresses (
    address_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL DEFAULT 'shipping', -- 'shipping', 'billing', 'clinic'
    label VARCHAR(50), -- 'Home', 'Office', 'Clinic', etc.
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    company VARCHAR(100),
    street_address_1 VARCHAR(255) NOT NULL,
    street_address_2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20),
    country VARCHAR(2) DEFAULT 'SD', -- ISO country code
    phone VARCHAR(20),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT user_addresses_type_valid CHECK (type IN ('shipping', 'billing', 'clinic', 'other')),
    CONSTRAINT user_addresses_country_valid CHECK (country ~ '^[A-Z]{2}$')
);

-- =============================================================================
-- NOTIFICATION PREFERENCES - User notification settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    preference_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL, -- 'order_status', 'promotions', 'security', etc.
    email_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    whatsapp_enabled BOOLEAN DEFAULT false,
    push_enabled BOOLEAN DEFAULT true,
    frequency VARCHAR(20) DEFAULT 'immediate', -- 'immediate', 'daily', 'weekly', 'never'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, notification_type)
);

-- =============================================================================
-- INDEXES for performance optimization
-- =============================================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

-- User sessions indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);

-- User activity log indexes
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id ON user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_action ON user_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_created_at ON user_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_success ON user_activity_log(success);

-- Password history indexes
CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history(user_id);
CREATE INDEX IF NOT EXISTS idx_password_history_created_at ON password_history(created_at);

-- Professional verifications indexes
CREATE INDEX IF NOT EXISTS idx_professional_verifications_user_id ON professional_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_professional_verifications_status ON professional_verifications(status);
CREATE INDEX IF NOT EXISTS idx_professional_verifications_license_number ON professional_verifications(license_number);
CREATE INDEX IF NOT EXISTS idx_professional_verifications_submitted_at ON professional_verifications(submitted_at);

-- User preferences indexes
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_category ON user_preferences(category);

-- User addresses indexes
CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_type ON user_addresses(type);
CREATE INDEX IF NOT EXISTS idx_user_addresses_is_default ON user_addresses(is_default);

-- Notification preferences indexes
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

-- =============================================================================
-- TRIGGERS for automatic timestamp updates
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_professional_verifications_updated_at BEFORE UPDATE ON professional_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_addresses_updated_at BEFORE UPDATE ON user_addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own data
CREATE POLICY users_own_data ON users
    FOR ALL USING (auth.uid() = user_id);

-- Admins can see all users
CREATE POLICY users_admin_access ON users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Similar policies for other tables
CREATE POLICY user_sessions_own_data ON user_sessions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY user_activity_log_own_data ON user_activity_log
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY password_history_own_data ON password_history
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY professional_verifications_own_data ON professional_verifications
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY user_preferences_own_data ON user_preferences
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY user_addresses_own_data ON user_addresses
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY notification_preferences_own_data ON notification_preferences
    FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- INITIAL DATA SEEDING
-- =============================================================================

-- Create default admin user (password: 'admin123' - CHANGE IN PRODUCTION!)
INSERT INTO users (
    user_id,
    first_name,
    last_name,
    email,
    password_hash,
    role,
    status,
    email_verified,
    created_at
) VALUES (
    uuid_generate_v4(),
    'System',
    'Administrator',
    'admin@dentalstore.sd',
    '$2b$12$LQv3c1yqBwEHxE5W8.qjO.L8xMzqrqhOcjhzqxqxqxqxqxqxqxqxq', -- bcrypt hash of 'admin123'
    'admin',
    'active',
    true,
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- Create default notification preferences for all notification types
INSERT INTO notification_preferences (user_id, notification_type, email_enabled, sms_enabled, whatsapp_enabled, push_enabled)
SELECT 
    u.user_id,
    unnest(ARRAY['order_status', 'payment_confirmation', 'shipping_updates', 'promotions', 'security_alerts', 'system_maintenance']) as notification_type,
    true,
    false,
    false,
    true
FROM users u
ON CONFLICT (user_id, notification_type) DO NOTHING;

-- =============================================================================
-- FUNCTIONS for common operations
-- =============================================================================

-- Function to get user by email
CREATE OR REPLACE FUNCTION get_user_by_email(user_email TEXT)
RETURNS TABLE (
    user_id UUID,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(255),
    password_hash VARCHAR(255),
    role user_role,
    status user_status,
    email_verified BOOLEAN,
    phone_verified BOOLEAN,
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_attempts INTEGER,
    locked_until TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.password_hash,
        u.role,
        u.status,
        u.email_verified,
        u.phone_verified,
        u.last_login_at,
        u.login_attempts,
        u.locked_until
    FROM users u
    WHERE u.email = user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log user activity
CREATE OR REPLACE FUNCTION log_user_activity(
    p_user_id UUID,
    p_action VARCHAR(100),
    p_resource VARCHAR(100) DEFAULT NULL,
    p_resource_id VARCHAR(255) DEFAULT NULL,
    p_details JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO user_activity_log (
        user_id, action, resource, resource_id, details,
        ip_address, user_agent, success, error_message
    ) VALUES (
        p_user_id, p_action, p_resource, p_resource_id, p_details,
        p_ip_address, p_user_agent, p_success, p_error_message
    ) RETURNING user_activity_log.log_id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() OR is_active = false;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VIEWS for common queries
-- =============================================================================

-- View for user profile with address and preferences
CREATE OR REPLACE VIEW user_profiles AS
SELECT 
    u.user_id,
    u.first_name,
    u.last_name,
    u.email,
    u.phone,
    u.role,
    u.status,
    u.email_verified,
    u.phone_verified,
    u.profile_image_url,
    u.date_of_birth,
    u.gender,
    u.preferences,
    u.created_at,
    u.last_login_at,
    COALESCE(
        json_agg(
            json_build_object(
                'address_id', ua.address_id,
                'type', ua.type,
                'label', ua.label,
                'street_address_1', ua.street_address_1,
                'street_address_2', ua.street_address_2,
                'city', ua.city,
                'state', ua.state,
                'postal_code', ua.postal_code,
                'country', ua.country,
                'is_default', ua.is_default
            )
        ) FILTER (WHERE ua.address_id IS NOT NULL),
        '[]'::json
    ) AS addresses
FROM users u
LEFT JOIN user_addresses ua ON u.user_id = ua.user_id
GROUP BY u.user_id, u.first_name, u.last_name, u.email, u.phone, u.role, 
         u.status, u.email_verified, u.phone_verified, u.profile_image_url,
         u.date_of_birth, u.gender, u.preferences, u.created_at, u.last_login_at;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Auth Service Database Migration Completed Successfully';
    RAISE NOTICE 'Created tables: users, user_sessions, user_activity_log, password_history, professional_verifications, user_preferences, user_addresses, notification_preferences';
    RAISE NOTICE 'Created indexes, triggers, RLS policies, functions, and views';
    RAISE NOTICE 'Migration: 001_auth_service_schema.sql - COMPLETED';
END $$;
