# Dental Store Deployment Guide

Complete deployment instructions for the Sudan dental store platform with microservices architecture.

## 🏗️ Architecture Overview

The dental store uses a microservices architecture with 5 core services:

- **auth-service** (Port 5000) - User authentication and authorization
- **product-service** (Port 5001) - Product catalog and inventory management
- **order-service** (Port 5002) - Order processing and management
- **payment-service** (Port 5003) - Payment processing (Sudan local methods)
- **shipment-service** (Port 5004) - Shipping and logistics management
- **Frontend** (Port 8080) - React application with modern UI

## 🚀 Quick Start Deployment

### 1. Prerequisites

```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Git
sudo apt-get update && sudo apt-get install git
```

### 2. Clone Repository

```bash
git clone <your-repo-url>
cd dental-store
```

### 3. Environment Configuration

Create environment files for each service:

```bash
# Auth Service
cp auth-service/.env.example auth-service/.env
# Edit with your JWT secret and database credentials

# Product Service
cp smile-shop-pro/product-service/.env.example smile-shop-pro/product-service/.env
# Edit with your database credentials

# Order Service
cp smile-shop-pro/order-service/.env.example smile-shop-pro/order-service/.env
# Edit with your database credentials and service URLs

# Payment Service
cp smile-shop-pro/payment-service/.env.example smile-shop-pro/payment-service/.env
# Edit with your database credentials and service URLs

# Shipment Service
cp smile-shop-pro/shipment-service/.env.example smile-shop-pro/shipment-service/.env
# Edit with your database credentials and service URLs

# Frontend
cp smile-shop-pro/.env.example smile-shop-pro/.env
# Edit with your service URLs
```

### 4. Start All Services

```bash
# Make deployment script executable
chmod +x deploy.sh

# Deploy the entire system
./deploy.sh
```

### 5. Verify Deployment

Check if all services are running:

```bash
# Check service status
docker-compose ps

# Check service health
curl http://localhost:8080/health  # Frontend
curl http://localhost:5000/health  # Auth Service
curl http://localhost:5001/health  # Product Service
curl http://localhost:5002/health  # Order Service
curl http://localhost:5003/health  # Payment Service
curl http://localhost:5004/health  # Shipment Service
```

## 🐳 Docker Deployment

### Development Environment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f [service-name]

# Stop all services
docker-compose down

# Rebuild specific service
docker-compose build [service-name]
docker-compose up -d [service-name]
```

### Production Environment

```bash
# Use production environment
docker-compose -f docker-compose.prod.yml up -d

# Or set environment variables
NODE_ENV=production docker-compose up -d
```

## 🛠️ Manual Deployment (Alternative)

### Database Setup

```bash
# Start PostgreSQL
docker run --name dental-postgres -e POSTGRES_PASSWORD=your_password -d -p 5432:5432 postgres:15

# Create database
docker exec dental-postgres psql -U postgres -c "CREATE DATABASE dental_store;"

# Run migrations
cd auth-service && npm run migrate
cd ../smile-shop-pro/product-service && npm run migrate
cd ../smile-shop-pro/order-service && npm run migrate
cd ../smile-shop-pro/payment-service && npm run migrate
cd ../smile-shop-pro/shipment-service && npm run migrate
```

### Service Startup

```bash
# Terminal 1: Auth Service
cd auth-service && npm run dev

# Terminal 2: Product Service
cd smile-shop-pro/product-service && npm run dev

# Terminal 3: Order Service
cd smile-shop-pro/order-service && npm run dev

# Terminal 4: Payment Service
cd smile-shop-pro/payment-service && npm run dev

# Terminal 5: Shipment Service
cd smile-shop-pro/shipment-service && npm run dev

# Terminal 6: Frontend
cd smile-shop-pro && npm run dev
```

## 🔧 Configuration

### Environment Variables

**Required for all services:**
```env
DATABASE_URL=postgresql://username:password@localhost:5432/dental_store
NODE_ENV=development
```

**Auth Service:**
```env
JWT_SECRET=your_very_long_jwt_secret_here
JWT_EXPIRES_IN=24h
BCRYPT_SALT_ROUNDS=12
```

**Payment Service:**
```env
ORDER_SERVICE_URL=http://localhost:5002
AUTH_SERVICE_URL=http://localhost:5000
```

**Order Service:**
```env
AUTH_SERVICE_URL=http://localhost:5000
PRODUCT_SERVICE_URL=http://localhost:5001
PAYMENT_SERVICE_URL=http://localhost:5003
SHIPMENT_SERVICE_URL=http://localhost:5004
```

**Shipment Service:**
```env
AUTH_SERVICE_URL=http://localhost:5000
ORDER_SERVICE_URL=http://localhost:5002
```

**Frontend:**
```env
VITE_AUTH_SERVICE_URL=http://localhost:5000
VITE_PRODUCT_SERVICE_URL=http://localhost:5001
VITE_ORDER_SERVICE_URL=http://localhost:5002
VITE_PAYMENT_SERVICE_URL=http://localhost:5003
VITE_SHIPMENT_SERVICE_URL=http://localhost:5004
```

## 📊 Monitoring & Health Checks

### Health Endpoints

```bash
# Frontend
curl http://localhost:8080/health

# Auth Service
curl http://localhost:5000/health

# Product Service
curl http://localhost:5001/health

# Order Service
curl http://localhost:5002/health

# Payment Service
curl http://localhost:5003/health

# Shipment Service
curl http://localhost:5004/health

# Prometheus
curl http://localhost:9090/-/healthy

# Grafana
curl http://localhost:3000/api/health
```

### Monitoring Dashboards

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)

## 🔒 Security Considerations

### Production Security Checklist

- [ ] Change all default passwords
- [ ] Use strong JWT secrets (64+ characters)
- [ ] Set up proper SSL certificates
- [ ] Configure firewall rules
- [ ] Set up database backups
- [ ] Enable audit logging
- [ ] Configure rate limiting
- [ ] Set up monitoring alerts
- [ ] Review CORS origins
- [ ] Enable HTTPS in production

### SSL Certificate Setup

```bash
# Generate self-signed certificate (development)
openssl req -x509 -newkey rsa:4096 -keyout ssl/server.key -out ssl/server.crt -days 365 -nodes -subj "/CN=dental-store.local"

# Or use Let's Encrypt for production
# certbot certonly --webroot -w /path/to/webroot -d yourdomain.com
```

## 🛠️ Troubleshooting

### Common Issues

**Service won't start:**
```bash
# Check logs
docker-compose logs [service-name]

# Check if port is in use
lsof -i :5000  # Check port 5000

# Restart specific service
docker-compose restart [service-name]
```

**Database connection issues:**
```bash
# Check database status
docker-compose exec postgres pg_isready -U dental_user

# Check database logs
docker-compose logs postgres
```

**Service health checks failing:**
```bash
# Check if service is responding
curl -f http://localhost:5000/health

# Check service logs
docker-compose logs [service-name]
```

## 🔄 Scaling & Load Balancing

### Horizontal Scaling

```bash
# Scale specific service
docker-compose up -d --scale auth-service=3

# Or modify docker-compose.yml
services:
  auth-service:
    deploy:
      replicas: 3
```

### Load Balancing

```bash
# Install and configure nginx
sudo apt-get install nginx

# Configure nginx.conf for load balancing
upstream auth_backend {
    server auth-service-1:5000;
    server auth-service-2:5000;
    server auth-service-3:5000;
}

server {
    listen 80;
    location /api/auth/ {
        proxy_pass http://auth_backend;
    }
}
```

## 📦 Backup & Recovery

### Database Backup

```bash
# Create backup
docker exec postgres pg_dump -U dental_user dental_store > backups/dental_store_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker exec -i postgres psql -U dental_user dental_store < backup_file.sql
```

### Service Logs

```bash
# Collect all logs
docker-compose logs > logs/all_services.log

# Follow specific service logs
docker-compose logs -f auth-service
```

## 🚀 Production Deployment

### Cloud Deployment Options

**Option 1: AWS**
```bash
# Use AWS ECS with Fargate
aws ecs create-cluster --cluster-name dental-store
# Configure services, load balancers, RDS
```

**Option 2: Google Cloud**
```bash
# Use Google Cloud Run or GKE
gcloud run deploy auth-service --image gcr.io/your-project/auth-service
```

**Option 3: DigitalOcean**
```bash
# Use DigitalOcean App Platform or Droplets
doctl apps create --spec app.yaml
```

### Production Environment Variables

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db:5432/dental_store
JWT_SECRET=your_production_jwt_secret
ALLOWED_ORIGINS=https://yourdomain.com
ENABLE_HTTPS=true
LOG_LEVEL=warn
```

## 📋 Maintenance Tasks

### Regular Maintenance

```bash
# Daily: Check service health
curl -f http://localhost:5000/health && echo "All services healthy"

# Weekly: Database optimization
docker exec postgres vacuumdb -U dental_user dental_store

# Monthly: Update dependencies
npm audit fix
npm update

# Quarterly: Security updates
# Review and update security policies
# Update SSL certificates
# Review access logs
```

### Performance Monitoring

```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s "http://localhost:5000/health"

# Monitor memory usage
docker stats

# Check database performance
docker exec postgres psql -U dental_user -c "SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
```

## 🔧 Development Workflow

### Adding New Features

1. **Create feature branch**
   ```bash
   git checkout -b feature/new-payment-method
   ```

2. **Implement feature across services**
   - Update database schema if needed
   - Implement API endpoints
   - Update frontend integration
   - Add tests

3. **Test thoroughly**
   ```bash
   npm test  # Run all tests
   ```

4. **Deploy to staging**
   ```bash
   ./deploy.sh  # Deploy to staging environment
   ```

5. **Get approval and merge**
   ```bash
   git checkout main
   git merge feature/new-payment-method
   git push
   ```

## 📞 Support & Troubleshooting

### Getting Help

- **Documentation**: Check service-specific README files
- **Logs**: `docker-compose logs [service-name]`
- **Health Checks**: `curl http://localhost:5000/health`
- **Database**: `docker exec postgres psql -U dental_user dental_store`

### Common Issues

**"Service won't start"**
- Check if ports are available
- Verify environment variables
- Check database connection

**"Database connection failed"**
- Verify PostgreSQL is running
- Check DATABASE_URL format
- Ensure database exists

**"API calls failing"**
- Check service health endpoints
- Verify CORS configuration
- Check authentication tokens

## 🎯 Next Steps

1. **Complete Setup**: Follow the deployment steps above
2. **Test Integration**: Verify all services communicate properly
3. **Add Monitoring**: Set up alerts for production
4. **Security Audit**: Review security configurations
5. **Performance Testing**: Load test the system

---

**Your dental store platform is now ready for deployment!** 🦷🇸🇩

The system includes all necessary components for a complete e-commerce operation in Sudan with local payment methods and simplified shipping.
