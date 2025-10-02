# 🗄️ **DENTAL STORE SUDAN - DATABASE MIGRATIONS**
## Complete Supabase PostgreSQL Schema for Microservices Platform

---

## 📋 **OVERVIEW**

This directory contains comprehensive database migration scripts for the **Dental Store Sudan** microservices platform. All migrations are designed to work with **Supabase PostgreSQL** and include complete schema definitions, indexes, triggers, functions, and initial data seeding.

---

## 🏗️ **ARCHITECTURE**

### **Microservices Database Schema**

| **Service** | **Migration File** | **Tables** | **Description** |
|-------------|-------------------|------------|-----------------|
| **Auth Service** | `001_auth_service_schema.sql` | 8 tables | User management, authentication, sessions, professional verification |
| **Product Service** | `002_product_service_schema.sql` | 11 tables | Product catalog, inventory, categories, reviews, variants |
| **Order Service** | `003_order_service_schema.sql` | 8 tables | Order management, items, payments, shipping, returns |
| **Payment Service** | `004_payment_service_schema.sql` | 8 tables | Payment processing, methods, refunds, disputes, Sudan banks |
| **Shipment Service** | `005_shipment_service_schema.sql` | 10 tables | Shipping carriers, methods, tracking, delivery, returns |
| **Notification Service** | `006_notification_service_schema.sql` | 9 tables | Email, SMS, WhatsApp, templates, campaigns, automation |
| **Reporting Service** | `007_reporting_service_schema.sql` | 8 tables | Analytics, reports, dashboards, business metrics, cache |

### **Total Database Objects**
- **📊 62 Tables** with comprehensive relationships
- **🔍 200+ Indexes** for optimal performance  
- **⚙️ 50+ Functions** for business logic
- **🔄 30+ Triggers** for automation
- **👁️ 15+ Views** for common queries
- **🛡️ Row Level Security** policies
- **🌱 Initial data seeding** for all services

---

## 🚀 **QUICK START**

### **1. Prerequisites**
```bash
# Install dependencies
cd database
npm install

# Set environment variables
export SUPABASE_URL="https://piplzeixrpiwofbgpvzp.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### **2. Run All Migrations**
```bash
# Automatic migration (recommended)
npm run migrate

# Or run individual services
npm run migrate:auth
npm run migrate:products
npm run migrate:orders
npm run migrate:payments
npm run migrate:shipments
npm run migrate:notifications
npm run migrate:reporting
```

### **3. Verify Installation**
```bash
# Check migration status
npm run status

# Verify database schema
npm run verify
```

---

## 📁 **FILE STRUCTURE**

```
database/
├── migrations/
│   ├── 001_auth_service_schema.sql          # Auth & User Management
│   ├── 002_product_service_schema.sql       # Product Catalog & Inventory
│   ├── 003_order_service_schema.sql         # Order Management
│   ├── 004_payment_service_schema.sql       # Payment Processing
│   ├── 005_shipment_service_schema.sql      # Shipping & Logistics
│   ├── 006_notification_service_schema.sql  # Notifications & Communication
│   ├── 007_reporting_service_schema.sql     # Analytics & Reporting
│   └── 008_run_all_migrations.sql          # Master migration script
├── supabase-migration-runner.js             # Automated migration tool
├── package.json                             # Dependencies & scripts
└── README.md                                # This file
```

---

## 🔧 **MIGRATION DETAILS**

### **001 - Auth Service Schema**
```sql
-- Core Tables
✅ users                    -- User accounts & profiles
✅ user_sessions            -- Active sessions tracking  
✅ user_activity_log        -- Audit trail
✅ password_history         -- Password reuse prevention
✅ professional_verifications -- Dental professional verification
✅ user_preferences         -- User settings
✅ user_addresses          -- Multiple addresses per user
✅ notification_preferences -- Communication preferences

-- Features
🔐 JWT authentication with secure sessions
👨‍⚕️ Professional verification workflow for dentists
🛡️ Account security (lockout, password history)
📍 Multi-address support for billing/shipping
🔔 Granular notification preferences
```

### **002 - Product Service Schema**
```sql
-- Core Tables  
✅ categories              -- Product categorization
✅ brands                  -- Manufacturer information
✅ products                -- Main product catalog
✅ product_images          -- Product photography
✅ product_variants        -- Size, color, options
✅ product_reviews         -- Customer reviews & ratings
✅ inventory_movements     -- Stock tracking & audit
✅ product_collections     -- Curated collections
✅ product_attributes      -- Dynamic attributes
✅ collection_products     -- Many-to-many relationships

-- Features
🦷 Dental-specific product categories & attributes
📦 Advanced inventory management with movement tracking
⭐ Review system with verification & moderation
🏷️ Flexible product variants & collections
🔍 Full-text search with PostgreSQL
📊 Automated stock status updates
```

### **003 - Order Service Schema**
```sql
-- Core Tables
✅ orders                  -- Main order records
✅ order_items             -- Individual line items
✅ order_status_history    -- Status change tracking
✅ order_payments          -- Payment tracking
✅ order_shipping          -- Shipping information
✅ order_discounts         -- Coupons & promotions
✅ order_notifications     -- Communication log
✅ order_returns           -- Return management

-- Features
🛒 Complete order lifecycle management
💰 Multi-currency support (USD/SDG)
📦 Advanced shipping integration
🎫 Flexible discount system
🔄 Return & refund processing
📧 Automated order notifications
📊 Order analytics & reporting
```

### **004 - Payment Service Schema**
```sql
-- Core Tables
✅ payment_transactions    -- All payment records
✅ payment_methods         -- Saved payment methods
✅ payment_refunds         -- Refund processing
✅ payment_webhooks        -- Provider webhooks
✅ payment_disputes        -- Chargeback management
✅ payment_fees            -- Fee tracking
✅ sudan_bank_accounts     -- Local bank information
✅ exchange_rates          -- Currency conversion

-- Features
🏦 Sudan-specific payment methods (bank transfer, mobile money)
💳 Secure payment method storage
🔄 Comprehensive refund system
⚖️ Dispute & chargeback management
💱 Multi-currency with exchange rates
📊 Payment analytics & reporting
🇸🇩 Local bank integration
```

### **005 - Shipment Service Schema**
```sql
-- Core Tables
✅ shipping_carriers       -- Available carriers
✅ shipping_methods        -- Delivery options
✅ shipping_zones          -- Geographic zones
✅ shipping_rates          -- Zone-based pricing
✅ shipments               -- Shipment records
✅ shipment_items          -- Package contents
✅ shipment_tracking       -- Real-time tracking
✅ shipment_notifications  -- Delivery updates
✅ delivery_attempts       -- Failed delivery tracking
✅ return_shipments        -- Return logistics

-- Features
🚚 Multiple carrier support (Sudan Post, DHL, Local)
📍 Zone-based shipping rates for Sudan
📦 Package tracking & notifications
🔄 Return shipment management
📊 Delivery analytics & performance
🇸🇩 Sudan-specific zones & carriers
```

### **006 - Notification Service Schema**
```sql
-- Core Tables
✅ notification_templates  -- Reusable message templates
✅ notifications           -- Individual messages
✅ notification_campaigns  -- Bulk campaigns
✅ notification_preferences -- User preferences
✅ notification_queue      -- Processing queue
✅ notification_logs       -- Event logging
✅ notification_webhooks   -- Provider webhooks
✅ email_automation_sequences -- Automated sequences
✅ email_automation_enrollments -- User enrollments

-- Features
📧 Multi-channel notifications (Email, SMS, WhatsApp)
🎨 Rich template system with variables
🚀 Automated email sequences
📊 Campaign management & analytics
⚡ Queue-based processing
🔔 Granular user preferences
🌍 Multi-language support
```

### **007 - Reporting Service Schema**
```sql
-- Core Tables
✅ report_definitions      -- Report templates
✅ generated_reports       -- Report instances
✅ report_schedules        -- Automated reports
✅ analytics_cache         -- Performance cache
✅ dashboard_widgets       -- Dashboard components
✅ user_dashboards         -- Custom dashboards
✅ report_access_log       -- Usage tracking
✅ business_metrics        -- KPI tracking

-- Features
📊 Comprehensive business analytics
📈 Interactive dashboards
⏰ Scheduled report generation
💾 Intelligent caching system
📋 Custom report builder
🎯 Key performance indicators
📱 Mobile-responsive dashboards
```

---

## 🛠️ **MANUAL MIGRATION**

If automatic migration fails, you can run migrations manually:

### **Option 1: Supabase SQL Editor**
1. Go to your Supabase project: https://app.supabase.co/project/piplzeixrpiwofbgpvzp/sql
2. Copy and paste each migration file in order
3. Execute each migration

### **Option 2: Direct PostgreSQL Connection**
```bash
# Connect to Supabase PostgreSQL
psql "postgresql://postgres:[password]@db.piplzeixrpiwofbgpvzp.supabase.co:5432/postgres"

# Run migrations
\i database/migrations/001_auth_service_schema.sql
\i database/migrations/002_product_service_schema.sql
\i database/migrations/003_order_service_schema.sql
\i database/migrations/004_payment_service_schema.sql
\i database/migrations/005_shipment_service_schema.sql
\i database/migrations/006_notification_service_schema.sql
\i database/migrations/007_reporting_service_schema.sql
```

### **Option 3: Supabase CLI**
```bash
# Initialize Supabase project
npx supabase init

# Link to your project
npx supabase link --project-ref piplzeixrpiwofbgpvzp

# Push migrations
npx supabase db push
```

---

## 🔒 **SECURITY FEATURES**

### **Row Level Security (RLS)**
- ✅ **Users can only access their own data**
- ✅ **Admin users have elevated permissions**
- ✅ **Service-to-service authentication**
- ✅ **Audit logging for sensitive operations**

### **Data Protection**
- ✅ **Password hashing with bcrypt**
- ✅ **Sensitive data encryption**
- ✅ **PII data handling compliance**
- ✅ **Secure session management**

### **Access Control**
- ✅ **Role-based permissions**
- ✅ **API key management**
- ✅ **Rate limiting support**
- ✅ **Audit trail for all operations**

---

## 📊 **PERFORMANCE OPTIMIZATIONS**

### **Indexing Strategy**
- ✅ **Primary key indexes on all tables**
- ✅ **Foreign key indexes for relationships**
- ✅ **Composite indexes for common queries**
- ✅ **Full-text search indexes**
- ✅ **Partial indexes for filtered queries**

### **Query Optimization**
- ✅ **Materialized views for complex queries**
- ✅ **Stored procedures for business logic**
- ✅ **Query result caching**
- ✅ **Connection pooling support**

### **Monitoring & Analytics**
- ✅ **Query performance tracking**
- ✅ **Index usage statistics**
- ✅ **Connection monitoring**
- ✅ **Storage usage tracking**

---

## 🌍 **SUDAN-SPECIFIC FEATURES**

### **Localization**
- ✅ **Arabic language support**
- ✅ **Sudan currency (SDG) with USD**
- ✅ **Local date/time formatting**
- ✅ **Sudan phone number validation**

### **Business Logic**
- ✅ **Sudan bank account integration**
- ✅ **Mobile money support (Zain Cash, MTN, Sudani)**
- ✅ **Local shipping zones & carriers**
- ✅ **Sudan-specific tax calculations**

### **Compliance**
- ✅ **Local business registration**
- ✅ **Professional licensing verification**
- ✅ **Sudan banking regulations**
- ✅ **Local data protection laws**

---

## 🧪 **TESTING & VALIDATION**

### **Data Integrity**
```sql
-- Check all foreign key constraints
SELECT * FROM information_schema.table_constraints 
WHERE constraint_type = 'FOREIGN KEY';

-- Validate data consistency
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM orders;
```

### **Performance Testing**
```sql
-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
ORDER BY idx_scan DESC;

-- Query performance
EXPLAIN ANALYZE SELECT * FROM products WHERE status = 'active';
```

### **Migration Verification**
```bash
# Run verification script
npm run verify

# Check migration log
SELECT * FROM migration_log ORDER BY executed_at;
```

---

## 🔧 **TROUBLESHOOTING**

### **Common Issues**

1. **Connection Failed**
   ```bash
   # Check environment variables
   echo $SUPABASE_URL
   echo $SUPABASE_SERVICE_ROLE_KEY
   
   # Test connection
   curl -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" $SUPABASE_URL/rest/v1/
   ```

2. **Migration Timeout**
   ```bash
   # Run individual migrations
   npm run migrate:auth
   npm run migrate:products
   # ... continue with each service
   ```

3. **Permission Denied**
   ```bash
   # Verify service role key has admin permissions
   # Check Supabase project settings
   ```

4. **Duplicate Objects**
   ```sql
   -- Check existing objects before migration
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

### **Recovery Procedures**

1. **Reset Database**
   ```bash
   npm run reset
   npm run migrate
   ```

2. **Partial Migration Recovery**
   ```sql
   -- Check migration log
   SELECT * FROM migration_log WHERE success = false;
   
   -- Re-run failed migrations manually
   ```

3. **Backup & Restore**
   ```bash
   # Create backup before migration
   pg_dump "postgresql://..." > backup.sql
   
   # Restore if needed
   psql "postgresql://..." < backup.sql
   ```

---

## 📈 **MONITORING & MAINTENANCE**

### **Regular Maintenance Tasks**

1. **Weekly**
   - Monitor query performance
   - Check index usage statistics
   - Review error logs

2. **Monthly**
   - Analyze storage usage
   - Update table statistics
   - Review security logs

3. **Quarterly**
   - Performance optimization review
   - Index maintenance
   - Data archival planning

### **Monitoring Queries**
```sql
-- Database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Table sizes
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Active connections
SELECT count(*) FROM pg_stat_activity;
```

---

## 🤝 **SUPPORT & CONTRIBUTION**

### **Getting Help**
- 📧 **Email**: support@dentalstore.sd
- 💬 **Discord**: [Join Community](https://discord.gg/dental-store-sudan)
- 🐛 **Issues**: [GitHub Issues](https://github.com/mohfadul/smile-shop-pro/issues)

### **Contributing**
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### **Development Guidelines**
- Follow PostgreSQL best practices
- Include comprehensive comments
- Add appropriate indexes
- Test all constraints
- Document breaking changes

---

## 📄 **LICENSE**

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

## 🎉 **CONCLUSION**

The Dental Store Sudan database schema provides a **production-ready**, **scalable**, and **secure** foundation for the microservices platform. With comprehensive migrations, performance optimizations, and Sudan-specific features, this database supports the complete dental equipment e-commerce workflow.

**Ready to serve dental professionals across Sudan! 🦷🇸🇩**

---

*Last updated: October 2024*
*Version: 1.0.0*
*Microservices: 7 services, 62 tables, 200+ indexes*
