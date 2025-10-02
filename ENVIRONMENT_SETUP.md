# Environment Variables Setup

Complete environment configuration for all services in the dental store platform.

## 📋 Overview

The dental store platform uses multiple microservices that require specific environment variables for proper operation. This guide provides all the necessary configuration for development and production environments.

## 🔧 Service Environment Variables

### **Auth Service** (`auth-service/.env`)
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://dental_user:dental_password_2024@localhost:5432/dental_store

# JWT Configuration
JWT_SECRET=SFxyRDWtaBCOeVOHD1h1A0kpMXs74V7/HJbNFUJW7qhKHUv9s4zmxUrkgkjjnPC91WmBiWb0bzpJMWdycC0k9Q==
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Security Configuration
BCRYPT_SALT_ROUNDS=12
SESSION_TIMEOUT_MINUTES=30
MAX_LOGIN_ATTEMPTS=5
ACCOUNT_LOCKOUT_MINUTES=30

# Redis Configuration (for session storage in production)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info

# Service URLs (for inter-service communication)
PRODUCT_SERVICE_URL=http://localhost:5001
ORDER_SERVICE_URL=http://localhost:5002
PAYMENT_SERVICE_URL=http://localhost:5003
SHIPMENT_SERVICE_URL=http://localhost:5004

# Monitoring
SENTRY_DSN=

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=noreply@dentalstore.com

# Feature Flags
ENABLE_CACHING=true
ENABLE_COMPRESSION=true
ENABLE_RATE_LIMITING=true
```

### **Product Service** (`smile-shop-pro/product-service/.env`)
```env
# Server Configuration
PORT=5001
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://dental_user:dental_password_2024@localhost:5432/dental_store

# Service URLs (for inter-service communication)
AUTH_SERVICE_URL=http://localhost:5000
ORDER_SERVICE_URL=http://localhost:5002
PAYMENT_SERVICE_URL=http://localhost:5003
SHIPMENT_SERVICE_URL=http://localhost:5004

# Redis Configuration (for caching in production)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info

# Security
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# Feature Flags
ENABLE_CACHING=true
ENABLE_COMPRESSION=true
ENABLE_RATE_LIMITING=true

# File Upload Configuration
MAX_FILE_SIZE=5242880
ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/webp
UPLOAD_PATH=uploads/
```

### **Order Service** (`smile-shop-pro/order-service/.env`)
```env
# Server Configuration
PORT=5002
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://dental_user:dental_password_2024@localhost:5432/dental_store

# Service URLs (for inter-service communication)
AUTH_SERVICE_URL=http://localhost:5000
PRODUCT_SERVICE_URL=http://localhost:5001
PAYMENT_SERVICE_URL=http://localhost:5003
SHIPMENT_SERVICE_URL=http://localhost:5004

# Redis Configuration (for caching in production)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info

# Security
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# Feature Flags
ENABLE_CACHING=true
ENABLE_COMPRESSION=true
ENABLE_RATE_LIMITING=true

# Order Configuration
ORDER_NUMBER_PREFIX=ORD
ORDER_EXPIRY_MINUTES=30
MAX_ORDER_ITEMS=50
```

### **Payment Service** (`smile-shop-pro/payment-service/.env`)
```env
# Server Configuration
PORT=5003
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://dental_user:dental_password_2024@localhost:5432/dental_store

# Service URLs (for inter-service communication)
AUTH_SERVICE_URL=http://localhost:5000
ORDER_SERVICE_URL=http://localhost:5002
SHIPMENT_SERVICE_URL=http://localhost:5004

# Redis Configuration (for session storage and caching)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info

# Security
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# Feature Flags
ENABLE_CACHING=true
ENABLE_COMPRESSION=true
ENABLE_RATE_LIMITING=true

# Payment Configuration (Sudan local payments)
BANK_NAME=Bank of Khartoum
BANK_ACCOUNT_NAME=Khalid Dqash Medical Company
BANK_ACCOUNT_NUMBER=1234567890
BANK_IBAN=SD123456789012345678901234567890
BANK_SWIFT=BKSDSD
BANK_CONTACT=+249-123-456789

# Payment Settings
PAYMENT_REFERENCE_PREFIX=PAY
PAYMENT_EXPIRY_HOURS=48
MAX_PAYMENT_ATTEMPTS=3

# Currency Settings
PRIMARY_CURRENCY=USD
LOCAL_CURRENCY=SDG
EXCHANGE_RATE_API=internal
```

### **Shipment Service** (`smile-shop-pro/shipment-service/.env`)
```env
# Server Configuration
PORT=5004
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://dental_user:dental_password_2024@localhost:5432/dental_store

# Service URLs (for inter-service communication)
AUTH_SERVICE_URL=http://localhost:5000
ORDER_SERVICE_URL=http://localhost:5002

# Redis Configuration (for caching in production)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info

# Security
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# Feature Flags
ENABLE_CACHING=true
ENABLE_COMPRESSION=true
ENABLE_RATE_LIMITING=true

# Shipping Configuration
DEFAULT_SHIPPING_METHOD=standard
SHIPPING_ZONE=Continental US
MAX_WEIGHT_KG=50
MAX_DIMENSIONS_CM=200x100x100

# Carrier Configuration (for future integration)
CARRIER_API_KEY=
CARRIER_WEBHOOK_SECRET=

# Tracking Configuration
TRACKING_UPDATE_INTERVAL_MINUTES=30
TRACKING_RETRY_ATTEMPTS=3
```

### **Frontend** (`smile-shop-pro/.env`)
```env
# Service URLs
VITE_AUTH_SERVICE_URL=http://localhost:5000
VITE_PRODUCT_SERVICE_URL=http://localhost:5001
VITE_ORDER_SERVICE_URL=http://localhost:5002
VITE_PAYMENT_SERVICE_URL=http://localhost:5003
VITE_SHIPMENT_SERVICE_URL=http://localhost:5004

# Application Configuration
VITE_APP_NAME=Dental Store
VITE_APP_DESCRIPTION=Khalid Dqash Medical Company - Dental Equipment Store
VITE_APP_URL=http://localhost:8080

# Currency Settings
VITE_PRIMARY_CURRENCY=USD
VITE_LOCAL_CURRENCY=SDG

# Feature Flags
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG=true
VITE_ENABLE_PWA=false

# API Configuration
VITE_API_TIMEOUT=10000
VITE_API_RETRY_ATTEMPTS=3

# UI Configuration
VITE_ITEMS_PER_PAGE=12
VITE_MAX_CART_ITEMS=50

# Security
VITE_CORS_ORIGINS=http://localhost:5000,http://localhost:5001,http://localhost:5002,http://localhost:5003,http://localhost:5004

# Development
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL=info
```

## 🚀 Quick Setup Commands

### **Development Environment**
```bash
# Copy environment templates to actual .env files
cp auth-service/.env.example auth-service/.env
cp smile-shop-pro/product-service/.env.example smile-shop-pro/product-service/.env
cp smile-shop-pro/order-service/.env.example smile-shop-pro/order-service/.env
cp smile-shop-pro/payment-service/.env.example smile-shop-pro/payment-service/.env
cp smile-shop-pro/shipment-service/.env.example smile-shop-pro/shipment-service/.env
cp smile-shop-pro/.env.example smile-shop-pro/.env

# Edit each .env file with your specific values
# Start with database credentials and JWT secret
```

### **Production Environment**
```bash
# Use production environment variables
export NODE_ENV=production

# Set production database URL
export DATABASE_URL=postgresql://prod_user:prod_pass@prod_host:5432/dental_store

# Set production JWT secret (generate a strong one)
export JWT_SECRET=your_very_long_production_jwt_secret_here

# Set production service URLs
export AUTH_SERVICE_URL=http://auth-service:5000
export PRODUCT_SERVICE_URL=http://product-service:5001
# ... etc for all services
```

## 🔒 Security Notes

### **JWT Secret Requirements**
- **Minimum 64 characters** for security
- **Use cryptographically secure random generation**
- **Store securely** (environment variables, secret management)
- **Rotate regularly** in production

### **Database Credentials**
- **Use strong passwords** (minimum 12 characters)
- **Different credentials** for each environment
- **Database user** with minimal required permissions
- **SSL connection** in production

### **API Keys & Secrets**
- **Never commit** to version control
- **Use environment variables** or secret management
- **Rotate regularly** in production
- **Monitor access** and audit usage

## 🛠️ Environment-Specific Configurations

### **Development Environment**
- **Relaxed security** for easier development
- **Detailed logging** for debugging
- **Localhost origins** for CORS
- **Longer timeouts** for debugging

### **Production Environment**
- **Enhanced security** measures
- **Optimized performance** settings
- **Proper CORS origins** for your domain
- **Monitoring and alerting** configuration
- **SSL/TLS** enforcement

### **Testing Environment**
- **Separate database** for testing
- **Mock external services** where possible
- **Faster timeouts** for quick test execution
- **Detailed test logging**

## 📊 Environment Variables Reference

| Service | Variable | Description | Required | Example |
|---------|----------|-------------|----------|---------|
| **All Services** | `DATABASE_URL` | PostgreSQL connection string | ✅ | `postgresql://user:pass@host:5432/db` |
| **All Services** | `NODE_ENV` | Environment (development/production) | ✅ | `development` |
| **All Services** | `ALLOWED_ORIGINS` | CORS allowed origins | ✅ | `http://localhost:3000,https://domain.com` |
| **Auth Service** | `JWT_SECRET` | JWT signing secret | ✅ | `64+ character secret` |
| **Auth Service** | `JWT_EXPIRES_IN` | JWT expiration time | ❌ | `24h` |
| **Payment Service** | `BANK_*` | Sudanese bank details | ✅ | Bank of Khartoum details |
| **Frontend** | `VITE_*_SERVICE_URL` | Service URLs | ✅ | `http://localhost:5000` |

## 🔧 Troubleshooting

### **Common Issues**

**"Environment variable not found"**
- Check if .env file exists in correct location
- Verify variable names match exactly
- Ensure no extra spaces or quotes

**"Database connection failed"**
- Verify DATABASE_URL format
- Check database server is running
- Confirm credentials are correct

**"Service communication failed"**
- Verify service URLs in environment variables
- Check if target services are running
- Confirm network connectivity between services

### **Environment Validation**

```bash
# Check if all required variables are set
node -e "
const required = ['DATABASE_URL', 'JWT_SECRET'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('Missing required environment variables:', missing);
  process.exit(1);
}
console.log('✅ All required environment variables are set');
"
```

## 🚀 Production Deployment

### **Environment Variables in Production**

**Option 1: Environment Variables**
```bash
export DATABASE_URL="postgresql://prod_user:prod_pass@prod_db:5432/dental_store"
export JWT_SECRET="your_production_secret"
# Start services
docker-compose up -d
```

**Option 2: .env files**
```bash
# Copy and modify production .env files
cp .env.production .env
# Edit with production values
docker-compose up -d
```

**Option 3: Docker secrets**
```yaml
# docker-compose.yml
services:
  auth-service:
    environment:
      - DATABASE_URL_FILE=/run/secrets/db_url
    secrets:
      - db_url
```

## 📋 Next Steps

1. **Copy environment templates** to actual .env files
2. **Update database credentials** with your PostgreSQL setup
3. **Generate secure JWT secret** (64+ characters)
4. **Configure service URLs** for your deployment
5. **Test connectivity** between all services
6. **Set up production secrets** for production deployment

---

**Your dental store platform environment is now properly configured for development and production deployment!** 🦷🇸🇩
