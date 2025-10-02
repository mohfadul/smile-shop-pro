-- =============================================================================
-- NOTIFICATION SERVICE DATABASE MIGRATION
-- Dental Store Sudan - Notification & Communication Management
-- Migration: 006_notification_service_schema.sql
-- =============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types for notification management
DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'email', 'sms', 'whatsapp', 'push', 'in_app'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_status AS ENUM (
        'pending', 'queued', 'sent', 'delivered', 'failed', 'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_priority AS ENUM (
        'low', 'normal', 'high', 'urgent'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE template_type AS ENUM (
        'transactional', 'marketing', 'system', 'alert'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- NOTIFICATION TEMPLATES TABLE - Reusable message templates
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_templates (
    template_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(50) NOT NULL UNIQUE, -- Used in code to reference template
    
    -- Template details
    type template_type DEFAULT 'transactional',
    category VARCHAR(50), -- 'order', 'payment', 'shipping', 'user', 'system'
    description TEXT,
    
    -- Template content for different channels
    email_subject VARCHAR(255),
    email_body TEXT,
    sms_body VARCHAR(1600), -- SMS character limit
    whatsapp_body TEXT,
    push_title VARCHAR(100),
    push_body VARCHAR(255),
    in_app_title VARCHAR(100),
    in_app_body TEXT,
    
    -- Template variables
    variables JSONB DEFAULT '[]', -- Array of variable names used in template
    sample_data JSONB DEFAULT '{}', -- Sample data for testing
    
    -- Localization
    language VARCHAR(5) DEFAULT 'en', -- ISO language code
    
    -- Status and configuration
    is_active BOOLEAN DEFAULT true,
    is_system_template BOOLEAN DEFAULT false, -- Cannot be deleted
    
    -- Metadata
    tags TEXT[], -- Array of tags for categorization
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID -- References users table
);

-- =============================================================================
-- NOTIFICATIONS TABLE - Individual notification records
-- =============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Template and content
    template_id UUID REFERENCES notification_templates(template_id),
    template_code VARCHAR(50), -- For reference even if template is deleted
    
    -- Recipient information
    user_id UUID, -- References users table (if registered user)
    recipient_email VARCHAR(255),
    recipient_phone VARCHAR(20),
    recipient_name VARCHAR(200),
    
    -- Notification details
    type notification_type NOT NULL,
    priority notification_priority DEFAULT 'normal',
    status notification_status DEFAULT 'pending',
    
    -- Content (rendered from template)
    subject VARCHAR(255),
    body TEXT NOT NULL,
    
    -- Channel-specific content
    email_html TEXT, -- HTML version for email
    push_data JSONB, -- Additional data for push notifications
    
    -- Scheduling
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    send_after TIMESTAMP WITH TIME ZONE, -- Delay sending until this time
    expires_at TIMESTAMP WITH TIME ZONE, -- Don't send after this time
    
    -- Processing information
    attempts INTEGER DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER DEFAULT 3 CHECK (max_attempts > 0),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    
    -- Provider information
    provider VARCHAR(50), -- 'gmail', 'twilio', 'whatsapp_business', etc.
    provider_message_id VARCHAR(255),
    provider_response JSONB DEFAULT '{}',
    
    -- Error handling
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Related records
    order_id UUID, -- References orders table (if order-related)
    reference_type VARCHAR(50), -- 'order', 'payment', 'shipment', 'user', etc.
    reference_id UUID, -- ID of related record
    
    -- Additional information
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT notifications_recipient_required CHECK (
        recipient_email IS NOT NULL OR recipient_phone IS NOT NULL OR user_id IS NOT NULL
    )
);

-- =============================================================================
-- NOTIFICATION CAMPAIGNS TABLE - Bulk notification campaigns
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_campaigns (
    campaign_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Campaign details
    template_id UUID NOT NULL REFERENCES notification_templates(template_id),
    type notification_type NOT NULL,
    priority notification_priority DEFAULT 'normal',
    
    -- Targeting
    target_audience JSONB NOT NULL, -- Criteria for selecting recipients
    estimated_recipients INTEGER,
    actual_recipients INTEGER DEFAULT 0,
    
    -- Scheduling
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'scheduled', 'running', 'completed', 'cancelled'
    
    -- Results
    sent_count INTEGER DEFAULT 0 CHECK (sent_count >= 0),
    delivered_count INTEGER DEFAULT 0 CHECK (delivered_count >= 0),
    failed_count INTEGER DEFAULT 0 CHECK (failed_count >= 0),
    
    -- Configuration
    send_rate_per_minute INTEGER DEFAULT 60, -- Rate limiting
    
    -- Additional information
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, -- References users table

    -- Constraints
    CONSTRAINT notification_campaigns_status_valid CHECK (
        status IN ('draft', 'scheduled', 'running', 'completed', 'cancelled', 'paused')
    )
);

-- =============================================================================
-- NOTIFICATION PREFERENCES TABLE - User notification preferences
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    preference_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References users table
    
    -- Notification category preferences
    category VARCHAR(50) NOT NULL, -- 'order', 'payment', 'shipping', 'marketing', etc.
    
    -- Channel preferences
    email_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    whatsapp_enabled BOOLEAN DEFAULT false,
    push_enabled BOOLEAN DEFAULT true,
    in_app_enabled BOOLEAN DEFAULT true,
    
    -- Frequency settings
    frequency VARCHAR(20) DEFAULT 'immediate', -- 'immediate', 'daily', 'weekly', 'never'
    quiet_hours_start TIME, -- Start of quiet hours (no notifications)
    quiet_hours_end TIME, -- End of quiet hours
    timezone VARCHAR(50), -- User's timezone
    
    -- Additional preferences
    language VARCHAR(5) DEFAULT 'en',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, category),
    
    -- Constraints
    CONSTRAINT notification_preferences_frequency_valid CHECK (
        frequency IN ('immediate', 'daily', 'weekly', 'never')
    )
);

-- =============================================================================
-- NOTIFICATION QUEUE TABLE - Queue for processing notifications
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_queue (
    queue_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID NOT NULL REFERENCES notifications(notification_id) ON DELETE CASCADE,
    
    -- Queue information
    priority notification_priority DEFAULT 'normal',
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Processing status
    status VARCHAR(20) DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
    attempts INTEGER DEFAULT 0 CHECK (attempts >= 0),
    
    -- Worker information
    worker_id VARCHAR(100), -- ID of worker processing this item
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error information
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT notification_queue_status_valid CHECK (
        status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')
    )
);

-- =============================================================================
-- NOTIFICATION LOGS TABLE - Detailed logging of notification events
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID REFERENCES notifications(notification_id) ON DELETE SET NULL,
    
    -- Log details
    event_type VARCHAR(50) NOT NULL, -- 'queued', 'sent', 'delivered', 'failed', 'clicked', 'opened'
    event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Event data
    provider VARCHAR(50),
    provider_event_id VARCHAR(255),
    event_data JSONB DEFAULT '{}',
    
    -- Additional information
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- NOTIFICATION WEBHOOKS TABLE - Webhook events from providers
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_webhooks (
    webhook_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Provider information
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_id VARCHAR(255), -- Provider's event ID
    
    -- Related notification
    notification_id UUID REFERENCES notifications(notification_id),
    provider_message_id VARCHAR(255),
    
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
    CONSTRAINT notification_webhooks_processing_attempts_positive CHECK (processing_attempts >= 0)
);

-- =============================================================================
-- EMAIL AUTOMATION SEQUENCES TABLE - Automated email sequences
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_automation_sequences (
    sequence_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Trigger configuration
    trigger_event VARCHAR(100) NOT NULL, -- 'user_registered', 'order_placed', 'cart_abandoned', etc.
    trigger_conditions JSONB DEFAULT '{}', -- Additional conditions for triggering
    
    -- Sequence configuration
    is_active BOOLEAN DEFAULT true,
    
    -- Steps in the sequence
    steps JSONB NOT NULL, -- Array of sequence steps with delays and templates
    
    -- Statistics
    total_enrolled INTEGER DEFAULT 0,
    total_completed INTEGER DEFAULT 0,
    
    -- Metadata
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID -- References users table
);

-- =============================================================================
-- EMAIL AUTOMATION ENROLLMENTS TABLE - Track users in automation sequences
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_automation_enrollments (
    enrollment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sequence_id UUID NOT NULL REFERENCES email_automation_sequences(sequence_id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- References users table
    
    -- Enrollment details
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    trigger_data JSONB DEFAULT '{}', -- Data that triggered the enrollment
    
    -- Progress tracking
    current_step INTEGER DEFAULT 0 CHECK (current_step >= 0),
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'cancelled', 'paused'
    
    -- Completion tracking
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason VARCHAR(100),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(sequence_id, user_id),
    
    -- Constraints
    CONSTRAINT email_automation_enrollments_status_valid CHECK (
        status IN ('active', 'completed', 'cancelled', 'paused')
    )
);

-- =============================================================================
-- INDEXES for performance optimization
-- =============================================================================

-- Notification templates indexes
CREATE INDEX IF NOT EXISTS idx_notification_templates_code ON notification_templates(code);
CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON notification_templates(type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_category ON notification_templates(category);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active ON notification_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_notification_templates_language ON notification_templates(language);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_template_id ON notifications(template_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_at ON notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_notifications_order_id ON notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON notifications(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_notifications_provider_message_id ON notifications(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_email ON notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_phone ON notifications(recipient_phone);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_status ON notifications(user_id, type, status);
CREATE INDEX IF NOT EXISTS idx_notifications_status_scheduled ON notifications(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_type_status_created ON notifications(type, status, created_at);

-- Notification campaigns indexes
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_template_id ON notification_campaigns(template_id);
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_type ON notification_campaigns(type);
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status ON notification_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_scheduled_at ON notification_campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_created_by ON notification_campaigns(created_by);

-- Notification preferences indexes
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_category ON notification_preferences(category);

-- Notification queue indexes
CREATE INDEX IF NOT EXISTS idx_notification_queue_notification_id ON notification_queue(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_priority ON notification_queue(priority);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled_for ON notification_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_queue_worker_id ON notification_queue(worker_id);

-- Composite index for queue processing
CREATE INDEX IF NOT EXISTS idx_notification_queue_processing ON notification_queue(status, priority, scheduled_for);

-- Notification logs indexes
CREATE INDEX IF NOT EXISTS idx_notification_logs_notification_id ON notification_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_event_type ON notification_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_event_timestamp ON notification_logs(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_notification_logs_provider ON notification_logs(provider);

-- Notification webhooks indexes
CREATE INDEX IF NOT EXISTS idx_notification_webhooks_provider ON notification_webhooks(provider);
CREATE INDEX IF NOT EXISTS idx_notification_webhooks_event_type ON notification_webhooks(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_webhooks_notification_id ON notification_webhooks(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_webhooks_processed ON notification_webhooks(processed);
CREATE INDEX IF NOT EXISTS idx_notification_webhooks_provider_message_id ON notification_webhooks(provider_message_id);

-- Email automation sequences indexes
CREATE INDEX IF NOT EXISTS idx_email_automation_sequences_trigger_event ON email_automation_sequences(trigger_event);
CREATE INDEX IF NOT EXISTS idx_email_automation_sequences_is_active ON email_automation_sequences(is_active);
CREATE INDEX IF NOT EXISTS idx_email_automation_sequences_created_by ON email_automation_sequences(created_by);

-- Email automation enrollments indexes
CREATE INDEX IF NOT EXISTS idx_email_automation_enrollments_sequence_id ON email_automation_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_email_automation_enrollments_user_id ON email_automation_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_email_automation_enrollments_status ON email_automation_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_email_automation_enrollments_enrolled_at ON email_automation_enrollments(enrolled_at);

-- =============================================================================
-- TRIGGERS for automatic updates
-- =============================================================================

-- Update notification status based on queue processing
CREATE OR REPLACE FUNCTION update_notification_from_queue()
RETURNS TRIGGER AS $$
BEGIN
    -- Update notification status based on queue status
    UPDATE notifications
    SET 
        status = CASE NEW.status
            WHEN 'completed' THEN 'sent'::notification_status
            WHEN 'failed' THEN 'failed'::notification_status
            ELSE status
        END,
        attempts = NEW.attempts,
        sent_at = CASE WHEN NEW.status = 'completed' THEN NEW.completed_at ELSE sent_at END,
        failed_at = CASE WHEN NEW.status = 'failed' THEN NEW.completed_at ELSE failed_at END,
        error_message = CASE WHEN NEW.status = 'failed' THEN NEW.error_message ELSE error_message END,
        updated_at = NOW()
    WHERE notification_id = NEW.notification_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notification_from_queue
    AFTER UPDATE ON notification_queue
    FOR EACH ROW EXECUTE FUNCTION update_notification_from_queue();

-- Log notification events automatically
CREATE OR REPLACE FUNCTION log_notification_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Log status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO notification_logs (
            notification_id, event_type, provider, event_data
        ) VALUES (
            NEW.notification_id, 
            NEW.status::text, 
            NEW.provider,
            json_build_object(
                'old_status', OLD.status,
                'new_status', NEW.status,
                'attempts', NEW.attempts
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_notification_event
    AFTER UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION log_notification_event();

-- Update campaign statistics
CREATE OR REPLACE FUNCTION update_campaign_statistics()
RETURNS TRIGGER AS $$
DECLARE
    campaign_rec RECORD;
BEGIN
    -- Find related campaign (if any)
    SELECT nc.campaign_id INTO campaign_rec
    FROM notification_campaigns nc
    WHERE nc.campaign_id = (NEW.metadata->>'campaign_id')::UUID;
    
    IF campaign_rec.campaign_id IS NOT NULL THEN
        -- Update campaign statistics
        UPDATE notification_campaigns
        SET 
            sent_count = (
                SELECT COUNT(*) FROM notifications 
                WHERE metadata->>'campaign_id' = campaign_rec.campaign_id::text 
                AND status IN ('sent', 'delivered')
            ),
            delivered_count = (
                SELECT COUNT(*) FROM notifications 
                WHERE metadata->>'campaign_id' = campaign_rec.campaign_id::text 
                AND status = 'delivered'
            ),
            failed_count = (
                SELECT COUNT(*) FROM notifications 
                WHERE metadata->>'campaign_id' = campaign_rec.campaign_id::text 
                AND status = 'failed'
            ),
            updated_at = NOW()
        WHERE campaign_id = campaign_rec.campaign_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_campaign_statistics
    AFTER UPDATE OF status ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_campaign_statistics();

-- Update timestamps
CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_campaigns_updated_at BEFORE UPDATE ON notification_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_queue_updated_at BEFORE UPDATE ON notification_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_automation_sequences_updated_at BEFORE UPDATE ON email_automation_sequences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_automation_enrollments_updated_at BEFORE UPDATE ON email_automation_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FUNCTIONS for common operations
-- =============================================================================

-- Function to create notification from template
CREATE OR REPLACE FUNCTION create_notification_from_template(
    p_template_code VARCHAR(50),
    p_user_id UUID DEFAULT NULL,
    p_recipient_email VARCHAR(255) DEFAULT NULL,
    p_recipient_phone VARCHAR(20) DEFAULT NULL,
    p_recipient_name VARCHAR(200) DEFAULT NULL,
    p_type notification_type DEFAULT 'email',
    p_template_data JSONB DEFAULT '{}',
    p_priority notification_priority DEFAULT 'normal',
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS UUID AS $$
DECLARE
    template_rec RECORD;
    notification_id UUID;
    rendered_subject VARCHAR(255);
    rendered_body TEXT;
BEGIN
    -- Get template
    SELECT * INTO template_rec
    FROM notification_templates
    WHERE code = p_template_code AND is_active = true;
    
    IF template_rec IS NULL THEN
        RAISE EXCEPTION 'Template not found: %', p_template_code;
    END IF;
    
    -- Render template content based on type
    CASE p_type
        WHEN 'email' THEN
            rendered_subject := template_rec.email_subject;
            rendered_body := template_rec.email_body;
        WHEN 'sms' THEN
            rendered_subject := NULL;
            rendered_body := template_rec.sms_body;
        WHEN 'whatsapp' THEN
            rendered_subject := NULL;
            rendered_body := template_rec.whatsapp_body;
        WHEN 'push' THEN
            rendered_subject := template_rec.push_title;
            rendered_body := template_rec.push_body;
        WHEN 'in_app' THEN
            rendered_subject := template_rec.in_app_title;
            rendered_body := template_rec.in_app_body;
    END CASE;
    
    -- Replace template variables (simple string replacement)
    FOR key, value IN SELECT * FROM jsonb_each_text(p_template_data)
    LOOP
        rendered_subject := REPLACE(rendered_subject, '{{' || key || '}}', value);
        rendered_body := REPLACE(rendered_body, '{{' || key || '}}', value);
    END LOOP;
    
    -- Create notification
    INSERT INTO notifications (
        template_id, template_code, user_id, recipient_email, recipient_phone,
        recipient_name, type, priority, subject, body, scheduled_at,
        reference_type, reference_id, metadata
    ) VALUES (
        template_rec.template_id, p_template_code, p_user_id, p_recipient_email,
        p_recipient_phone, p_recipient_name, p_type, p_priority, rendered_subject,
        rendered_body, p_scheduled_at, p_reference_type, p_reference_id, p_template_data
    ) RETURNING notifications.notification_id INTO notification_id;
    
    -- Add to queue
    INSERT INTO notification_queue (notification_id, priority, scheduled_for)
    VALUES (notification_id, p_priority, p_scheduled_at);
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get notification analytics
CREATE OR REPLACE FUNCTION get_notification_analytics(
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    total_notifications INTEGER,
    sent_notifications INTEGER,
    delivered_notifications INTEGER,
    failed_notifications INTEGER,
    delivery_rate DECIMAL(5,2),
    notifications_by_type JSONB,
    notifications_by_status JSONB,
    daily_notifications JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_notifications,
        COUNT(CASE WHEN n.status IN ('sent', 'delivered') THEN 1 END)::INTEGER as sent_notifications,
        COUNT(CASE WHEN n.status = 'delivered' THEN 1 END)::INTEGER as delivered_notifications,
        COUNT(CASE WHEN n.status = 'failed' THEN 1 END)::INTEGER as failed_notifications,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND((COUNT(CASE WHEN n.status = 'delivered' THEN 1 END)::DECIMAL / COUNT(*) * 100), 2)
            ELSE 0 
        END as delivery_rate,
        (SELECT json_object_agg(type, count)
         FROM (SELECT type, COUNT(*) as count
               FROM notifications
               WHERE created_at BETWEEN p_start_date AND p_end_date
               GROUP BY type) t) as notifications_by_type,
        (SELECT json_object_agg(status, count)
         FROM (SELECT status, COUNT(*) as count
               FROM notifications
               WHERE created_at BETWEEN p_start_date AND p_end_date
               GROUP BY status) s) as notifications_by_status,
        (SELECT json_agg(json_build_object(
            'date', date_trunc('day', created_at),
            'total', COUNT(*),
            'sent', COUNT(CASE WHEN status IN ('sent', 'delivered') THEN 1 END),
            'delivered', COUNT(CASE WHEN status = 'delivered' THEN 1 END),
            'failed', COUNT(CASE WHEN status = 'failed' THEN 1 END)
         ) ORDER BY date_trunc('day', created_at))
         FROM notifications
         WHERE created_at BETWEEN p_start_date AND p_end_date
         GROUP BY date_trunc('day', created_at)) as daily_notifications
    FROM notifications n
    WHERE n.created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process notification queue
CREATE OR REPLACE FUNCTION process_notification_queue(
    p_limit INTEGER DEFAULT 100,
    p_worker_id VARCHAR(100) DEFAULT 'default'
)
RETURNS INTEGER AS $$
DECLARE
    processed_count INTEGER := 0;
    queue_item RECORD;
BEGIN
    -- Get items from queue to process
    FOR queue_item IN
        SELECT nq.queue_id, nq.notification_id
        FROM notification_queue nq
        WHERE nq.status = 'queued'
        AND nq.scheduled_for <= NOW()
        ORDER BY nq.priority DESC, nq.scheduled_for ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    LOOP
        -- Mark as processing
        UPDATE notification_queue
        SET 
            status = 'processing',
            worker_id = p_worker_id,
            started_at = NOW(),
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE queue_id = queue_item.queue_id;
        
        processed_count := processed_count + 1;
    END LOOP;
    
    RETURN processed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VIEWS for common queries
-- =============================================================================

-- View for notification summary
CREATE OR REPLACE VIEW notification_summary AS
SELECT 
    n.notification_id,
    n.template_code,
    n.user_id,
    n.recipient_email,
    n.recipient_phone,
    n.recipient_name,
    n.type,
    n.priority,
    n.status,
    n.subject,
    n.scheduled_at,
    n.sent_at,
    n.delivered_at,
    n.failed_at,
    n.attempts,
    n.provider,
    n.error_message,
    n.created_at,
    nt.name as template_name,
    nt.category as template_category
FROM notifications n
LEFT JOIN notification_templates nt ON n.template_id = nt.template_id;

-- =============================================================================
-- INITIAL DATA SEEDING
-- =============================================================================

-- Create default notification templates
INSERT INTO notification_templates (
    name, code, type, category, email_subject, email_body, sms_body, whatsapp_body,
    variables, is_system_template
) VALUES
(
    'Order Confirmation',
    'ORDER_CONFIRMATION',
    'transactional',
    'order',
    'Order Confirmation - {{order_number}}',
    'Dear {{customer_name}},<br><br>Thank you for your order! Your order <strong>{{order_number}}</strong> has been confirmed.<br><br>Order Total: {{total_amount}} {{currency}}<br>Payment Method: {{payment_method}}<br><br>We will notify you once your order is shipped.<br><br>Best regards,<br>Dental Store Sudan',
    'Hello {{customer_name}}! Your order {{order_number}} has been confirmed. Total: {{total_amount}} {{currency}}. Thank you for choosing Dental Store Sudan!',
    'Hello {{customer_name}}! 🦷\n\nThank you for your order! Your order *{{order_number}}* has been confirmed.\n\n💰 *Total:* {{total_amount}} {{currency}}\n💳 *Payment:* {{payment_method}}\n\nWe''ll notify you once your order is shipped.\n\nThank you for choosing Dental Store Sudan! 🇸🇩',
    '["customer_name", "order_number", "total_amount", "currency", "payment_method"]',
    true
),
(
    'Payment Confirmation',
    'PAYMENT_CONFIRMATION',
    'transactional',
    'payment',
    'Payment Confirmed - {{order_number}}',
    'Dear {{customer_name}},<br><br>We have successfully received your payment for order <strong>{{order_number}}</strong>.<br><br>Payment Amount: {{amount}} {{currency}}<br>Payment Method: {{payment_method}}<br>Transaction ID: {{transaction_id}}<br><br>Your order is now being prepared for shipment.<br><br>Best regards,<br>Dental Store Sudan',
    'Payment confirmed! {{amount}} {{currency}} received for order {{order_number}}. Transaction ID: {{transaction_id}}. Your order is being prepared.',
    'Hello {{customer_name}}! 💳\n\nYour payment of *{{amount}} {{currency}}* for order *{{order_number}}* has been confirmed.\n\n✅ Payment successful!\n🔢 Transaction ID: {{transaction_id}}\n\nYour order is now being prepared for shipment.\n\nThank you! 🦷',
    '["customer_name", "order_number", "amount", "currency", "payment_method", "transaction_id"]',
    true
),
(
    'Shipment Notification',
    'SHIPMENT_NOTIFICATION',
    'transactional',
    'shipping',
    'Your Order Has Been Shipped - {{order_number}}',
    'Dear {{customer_name}},<br><br>Great news! Your order <strong>{{order_number}}</strong> has been shipped.<br><br>Tracking Number: {{tracking_number}}<br>Estimated Delivery: {{delivery_date}}<br>Carrier: {{carrier_name}}<br><br>You can track your package using the tracking number provided.<br><br>Best regards,<br>Dental Store Sudan',
    'Your order {{order_number}} has been shipped! Tracking: {{tracking_number}}. Estimated delivery: {{delivery_date}}. Dental Store Sudan.',
    'Hello {{customer_name}}! 📦\n\nGreat news! Your order *{{order_number}}* has been shipped.\n\n🚚 *Tracking:* {{tracking_number}}\n📅 *Estimated Delivery:* {{delivery_date}}\n\nTrack your package with the number above.\n\nThank you for choosing Dental Store Sudan! 🦷🇸🇩',
    '["customer_name", "order_number", "tracking_number", "delivery_date", "carrier_name"]',
    true
),
(
    'Welcome Email',
    'WELCOME_EMAIL',
    'transactional',
    'user',
    'Welcome to Dental Store Sudan!',
    'Dear {{customer_name}},<br><br>Welcome to Dental Store Sudan! We''re excited to have you join our community of dental professionals.<br><br>Your account has been successfully created. You can now browse our extensive catalog of dental equipment and supplies.<br><br>If you have any questions, please don''t hesitate to contact us.<br><br>Best regards,<br>Dental Store Sudan Team',
    'Welcome to Dental Store Sudan, {{customer_name}}! Your account is ready. Start browsing our dental equipment catalog today!',
    'Welcome to Dental Store Sudan, {{customer_name}}! 🦷\n\nYour account is ready! Browse our extensive catalog of dental equipment and supplies.\n\nWelcome to the community! 🇸🇩',
    '["customer_name"]',
    true
),
(
    'Password Reset',
    'PASSWORD_RESET',
    'transactional',
    'user',
    'Reset Your Password - Dental Store Sudan',
    'Dear {{customer_name}},<br><br>You have requested to reset your password for your Dental Store Sudan account.<br><br>Click the link below to reset your password:<br><a href="{{reset_link}}">Reset Password</a><br><br>This link will expire in 1 hour.<br><br>If you did not request this, please ignore this email.<br><br>Best regards,<br>Dental Store Sudan',
    'Reset your Dental Store Sudan password: {{reset_link}} (expires in 1 hour)',
    'Reset your Dental Store Sudan password: {{reset_link}} (expires in 1 hour)',
    '["customer_name", "reset_link"]',
    true
)
ON CONFLICT (code) DO NOTHING;

-- Create default notification preferences for common categories
INSERT INTO notification_preferences (user_id, category, email_enabled, sms_enabled, whatsapp_enabled, push_enabled)
SELECT 
    u.user_id,
    unnest(ARRAY['order', 'payment', 'shipping', 'marketing', 'security', 'system']) as category,
    true, -- email enabled by default
    false, -- SMS disabled by default (cost)
    false, -- WhatsApp disabled by default (requires opt-in)
    true -- push enabled by default
FROM users u
ON CONFLICT (user_id, category) DO NOTHING;

-- Create sample email automation sequence
INSERT INTO email_automation_sequences (
    name, description, trigger_event, steps, is_active, created_by
) VALUES (
    'Welcome Series',
    'Welcome email sequence for new users',
    'user_registered',
    '[
        {
            "step": 1,
            "delay_hours": 0,
            "template_code": "WELCOME_EMAIL",
            "type": "email"
        },
        {
            "step": 2,
            "delay_hours": 24,
            "template_code": "PRODUCT_CATALOG_INTRO",
            "type": "email"
        },
        {
            "step": 3,
            "delay_hours": 168,
            "template_code": "FIRST_ORDER_DISCOUNT",
            "type": "email"
        }
    ]'::jsonb,
    true,
    (SELECT user_id FROM users WHERE email = 'admin@dentalstore.sd' LIMIT 1)
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Notification Service Database Migration Completed Successfully';
    RAISE NOTICE 'Created tables: notification_templates, notifications, notification_campaigns, notification_preferences, notification_queue, notification_logs, notification_webhooks, email_automation_sequences, email_automation_enrollments';
    RAISE NOTICE 'Created indexes, triggers, functions, and views';
    RAISE NOTICE 'Seeded initial templates, preferences, and automation sequences';
    RAISE NOTICE 'Migration: 006_notification_service_schema.sql - COMPLETED';
END $$;
