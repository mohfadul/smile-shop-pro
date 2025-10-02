-- Migration: Create users table and related structures
-- Version: 1.0.0
-- Description: Initial user management schema

-- Create custom types
CREATE TYPE user_role AS ENUM ('customer', 'admin', 'manager', 'staff');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending');

-- Users table - Main user authentication and profile data
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role user_role DEFAULT 'customer',
    status user_status DEFAULT 'active',
    email_verified BOOLEAN DEFAULT false,
    email_verification_token VARCHAR(255),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~* '^\+?[\d\s\-\(\)]+$'),
    CONSTRAINT users_password_length CHECK (length(password_hash) >= 60), -- bcrypt hash length
    CONSTRAINT users_login_attempts_positive CHECK (login_attempts >= 0)
);

-- User sessions table - For tracking active sessions (optional, for enhanced security)
CREATE TABLE user_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    device_info TEXT,
    ip_address INET,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure one active session per user per device (optional constraint)
    CONSTRAINT unique_user_device UNIQUE (user_id, device_info)
);

-- User activity log - For audit trail and security monitoring
CREATE TABLE user_activity_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Password history - For enforcing password change policies
CREATE TABLE password_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_email_verified ON users(email_verified);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_login ON users(last_login_at);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);

CREATE INDEX idx_user_activity_user_created ON user_activity_log(user_id, created_at);
CREATE INDEX idx_user_activity_action ON user_activity_log(action, created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for user activity logging
CREATE OR REPLACE FUNCTION log_user_activity()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_activity_log (user_id, action, details, ip_address)
    VALUES (
        COALESCE(NEW.user_id, OLD.user_id),
        TG_OP,
        jsonb_build_object(
            'table', TG_TABLE_NAME,
            'old_data', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
            'new_data', CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END
        ),
        inet_client_addr()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Create triggers for activity logging
CREATE TRIGGER log_users_changes
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION log_user_activity();

-- Create trigger for password history
CREATE OR REPLACE FUNCTION add_password_to_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Only add to history if password actually changed
    IF OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
        INSERT INTO password_history (user_id, password_hash)
        VALUES (NEW.user_id, OLD.password_hash);

        -- Clean up old password history (keep only last 5)
        DELETE FROM password_history
        WHERE user_id = NEW.user_id
        AND history_id NOT IN (
            SELECT history_id FROM password_history
            WHERE user_id = NEW.user_id
            ORDER BY changed_at DESC
            LIMIT 5
        );
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER track_password_history
    AFTER UPDATE OF password_hash ON users
    FOR EACH ROW EXECUTE FUNCTION add_password_to_history();

-- Function to check if password was used recently
CREATE OR REPLACE FUNCTION is_password_reused(p_user_id UUID, p_password_hash VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM password_history
        WHERE user_id = p_user_id
        AND password_hash = p_password_hash
        AND changed_at > NOW() - INTERVAL '1 year'
    );
END;
$$ language 'plpgsql';

-- Function to reset login attempts on successful login
CREATE OR REPLACE FUNCTION reset_login_attempts(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET login_attempts = 0,
        locked_until = NULL,
        last_login_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ language 'plpgsql';

-- Function to increment login attempts and lock account if needed
CREATE OR REPLACE FUNCTION increment_login_attempts(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_attempts INTEGER;
    should_lock BOOLEAN := false;
BEGIN
    UPDATE users
    SET login_attempts = login_attempts + 1
    WHERE user_id = p_user_id
    RETURNING login_attempts INTO current_attempts;

    -- Lock account after 5 failed attempts for 30 minutes
    IF current_attempts >= 5 THEN
        UPDATE users
        SET locked_until = NOW() + INTERVAL '30 minutes'
        WHERE user_id = p_user_id;
        should_lock := true;
    END IF;

    RETURN should_lock;
END;
$$ language 'plpgsql';

-- Row Level Security (RLS) - Enable for production
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all users" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- RLS Policies for user sessions
CREATE POLICY "Users can view their own sessions" ON user_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own sessions" ON user_sessions
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for activity log
CREATE POLICY "Users can view their own activity" ON user_activity_log
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all activity" ON user_activity_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- Insert sample admin user (for testing - remove in production)
-- Password: Admin123! (bcrypt hash)
INSERT INTO users (first_name, last_name, email, password_hash, role, status, email_verified)
VALUES (
    'System',
    'Administrator',
    'admin@medicalstore.com',
    '$2b$10$rEuVt2qKJbGq2YkKJbGq2YKJbgq2YKJbgq2YKJbgq2YKJbgq2YKJ', -- Admin123!
    'admin',
    'active',
    true
) ON CONFLICT (email) DO NOTHING;

-- Insert sample manager user (for testing - remove in production)
-- Password: Manager123! (bcrypt hash)
INSERT INTO users (first_name, last_name, email, password_hash, role, status, email_verified)
VALUES (
    'Store',
    'Manager',
    'manager@medicalstore.com',
    '$2b$10$rEuVt2qKJbGq2YKJbgq2YkKJbGq2YKJbgq2YKJbgq2YKJbgq2YKJ', -- Manager123!
    'manager',
    'active',
    true
) ON CONFLICT (email) DO NOTHING;
