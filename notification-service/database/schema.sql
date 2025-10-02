-- Notification Service Database Schema
-- This schema handles multi-channel notifications for the dental store platform

-- Create database if not exists
-- CREATE DATABASE notificationdb;

-- Notifications log table - tracks all sent notifications
CREATE TABLE IF NOT EXISTS notifications_log (
  id SERIAL PRIMARY KEY,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'push')),
  to_contact TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'read')),
  error TEXT,
  related_entity VARCHAR(50), -- 'order', 'payment', 'user', 'product'
  related_id INT,
  created_by INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  template_id VARCHAR(100),
  template_data JSONB DEFAULT '{}',
  provider VARCHAR(50), -- 'sendgrid', 'twilio', 'firebase'
  provider_message_id TEXT,
  cost_usd DECIMAL(10,4) DEFAULT 0.00
);

-- Notification templates table - reusable message templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'push')),
  subject_template TEXT,
  body_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]', -- Array of required variables
  is_active BOOLEAN DEFAULT true,
  created_by INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Notification preferences table - user notification settings
CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'push')),
  notification_type VARCHAR(50) NOT NULL, -- 'order_confirmation', 'payment_reminder', etc.
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, channel, notification_type)
);

-- Notification providers table - external service configurations
CREATE TABLE IF NOT EXISTS notification_providers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'push')),
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  config JSONB NOT NULL, -- Provider-specific configuration
  rate_limit_per_minute INT DEFAULT 60,
  cost_per_message DECIMAL(10,4) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Notification queues table - for background processing
CREATE TABLE IF NOT EXISTS notification_queues (
  id SERIAL PRIMARY KEY,
  notification_id INT REFERENCES notifications_log(id),
  priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10), -- 1 = highest priority
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  worker_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Notification campaigns table - for bulk notifications
CREATE TABLE IF NOT EXISTS notification_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'push')),
  template_id INT REFERENCES notification_templates(id),
  target_criteria JSONB, -- Criteria for selecting recipients
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'cancelled')),
  total_recipients INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_by INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications_log(status);
CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications_log(channel);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications_log(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_related ON notifications_log(related_entity, related_id);
CREATE INDEX IF NOT EXISTS idx_notifications_retry ON notifications_log(next_retry_at) WHERE status = 'failed' AND retry_count < max_retries;

CREATE INDEX IF NOT EXISTS idx_templates_channel ON notification_templates(channel);
CREATE INDEX IF NOT EXISTS idx_templates_active ON notification_templates(is_active);

CREATE INDEX IF NOT EXISTS idx_preferences_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_preferences_enabled ON notification_preferences(is_enabled);

CREATE INDEX IF NOT EXISTS idx_providers_channel ON notification_providers(channel);
CREATE INDEX IF NOT EXISTS idx_providers_active ON notification_providers(is_active);
CREATE INDEX IF NOT EXISTS idx_providers_default ON notification_providers(is_default);

CREATE INDEX IF NOT EXISTS idx_queues_status ON notification_queues(status);
CREATE INDEX IF NOT EXISTS idx_queues_scheduled ON notification_queues(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_queues_priority ON notification_queues(priority);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON notification_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON notification_campaigns(scheduled_at);

-- Insert default notification templates
INSERT INTO notification_templates (name, channel, subject_template, body_template, variables) VALUES
('order_confirmation_email', 'email', 'Order Confirmation - {{order_number}}', 
 'Dear {{customer_name}},\n\nThank you for your order! Your order {{order_number}} has been confirmed.\n\nOrder Details:\n{{order_details}}\n\nTotal: {{total_amount}} {{currency}}\n\nWe will notify you once your order is shipped.\n\nBest regards,\nDental Store Team', 
 '["customer_name", "order_number", "order_details", "total_amount", "currency"]'),

('payment_confirmation_whatsapp', 'whatsapp', null,
 'Hello {{customer_name}}! 💳\n\nYour payment of {{amount}} {{currency}} for order {{order_number}} has been confirmed.\n\nThank you for choosing our dental store! 🦷',
 '["customer_name", "amount", "currency", "order_number"]'),

('shipment_tracking_sms', 'sms', null,
 'Your order {{order_number}} has been shipped! Track: {{tracking_number}}. Estimated delivery: {{delivery_date}}. - Dental Store',
 '["order_number", "tracking_number", "delivery_date"]'),

('low_stock_alert_email', 'email', 'Low Stock Alert - {{product_name}}',
 'Dear Admin,\n\nProduct "{{product_name}}" (SKU: {{sku}}) is running low on stock.\n\nCurrent Stock: {{current_stock}}\nMinimum Threshold: {{min_threshold}}\n\nPlease reorder soon to avoid stockouts.\n\nBest regards,\nInventory System',
 '["product_name", "sku", "current_stock", "min_threshold"]'),

('appointment_reminder_whatsapp', 'whatsapp', null,
'Hello {{customer_name}}! 📅\n\nReminder: You have a dental appointment tomorrow at {{appointment_time}}.\n\nLocation: {{clinic_address}}\nDoctor: {{doctor_name}}\n\nPlease arrive 15 minutes early. Call {{clinic_phone}} if you need to reschedule.\n\nSee you soon! 🦷',
'["customer_name", "appointment_time", "clinic_address", "doctor_name", "clinic_phone"]')

ON CONFLICT (name) DO NOTHING;

-- Insert default notification providers (with placeholder configs)
INSERT INTO notification_providers (name, channel, is_active, is_default, config, rate_limit_per_minute, cost_per_message) VALUES
('sendgrid', 'email', true, true, '{"api_key": "SENDGRID_API_KEY", "from_email": "noreply@dentalstore.sd", "from_name": "Dental Store Sudan"}', 300, 0.0001),
('twilio_whatsapp', 'whatsapp', true, true, '{"account_sid": "TWILIO_ACCOUNT_SID", "auth_token": "TWILIO_AUTH_TOKEN", "from_number": "whatsapp:+14155238886"}', 60, 0.005),
('twilio_sms', 'sms', true, true, '{"account_sid": "TWILIO_ACCOUNT_SID", "auth_token": "TWILIO_AUTH_TOKEN", "from_number": "+1234567890"}', 100, 0.0075),
('firebase_push', 'push', false, false, '{"server_key": "FIREBASE_SERVER_KEY", "project_id": "dental-store-app"}', 1000, 0.0000)

ON CONFLICT (name) DO NOTHING;

-- Insert default notification preferences for common notification types
-- These will be used as defaults for new users
INSERT INTO notification_preferences (user_id, channel, notification_type, is_enabled) VALUES
(0, 'email', 'order_confirmation', true),
(0, 'email', 'payment_confirmation', true),
(0, 'email', 'shipment_tracking', true),
(0, 'whatsapp', 'order_confirmation', true),
(0, 'whatsapp', 'payment_confirmation', true),
(0, 'whatsapp', 'shipment_tracking', true),
(0, 'sms', 'shipment_tracking', false),
(0, 'push', 'order_confirmation', false)

ON CONFLICT (user_id, channel, notification_type) DO NOTHING;

-- Create a function to automatically set updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_providers_updated_at BEFORE UPDATE ON notification_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_campaigns_updated_at BEFORE UPDATE ON notification_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Email automation tables
CREATE TABLE IF NOT EXISTS email_sequence_executions (
  id SERIAL PRIMARY KEY,
  sequence_name VARCHAR(100) NOT NULL,
  recipient_email TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS email_sequence_steps (
  id SERIAL PRIMARY KEY,
  execution_id INT REFERENCES email_sequence_executions(id) ON DELETE CASCADE,
  step_index INT NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  subject_template TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  trigger_data JSONB DEFAULT '{}',
  recipient_email TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'processing', 'sent', 'failed', 'skipped', 'cancelled')),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for email automation
CREATE INDEX IF NOT EXISTS idx_sequence_executions_status ON email_sequence_executions(status);
CREATE INDEX IF NOT EXISTS idx_sequence_executions_name ON email_sequence_executions(sequence_name);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_scheduled ON email_sequence_steps(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_sequence_steps_execution ON email_sequence_steps(execution_id);
