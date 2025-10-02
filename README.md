# 🦷 Dental Store Sudan - Complete Microservices Platform

A comprehensive e-commerce platform specifically designed for dental supplies and equipment in Sudan, featuring a modern microservices architecture with advanced security, analytics, and automation capabilities.

## 🌟 Features

### 🔐 **Security & Authentication**
- JWT authentication with HttpOnly cookies
- Multi-factor authentication support
- Role-based access control (RBAC)
- Account lockout protection
- Rate limiting and DDoS protection
- Comprehensive security headers

### 🛒 **E-Commerce Core**
- Product catalog with dental-specific categories
- Advanced inventory management
- Multi-currency support (USD/SDG)
- Local payment methods (Bank transfer, Cash on delivery)
- Order management and tracking
- Shipping and delivery management

### 🏥 **Sudan-Specific Features**
- Local bank integration for payments
- Sudanese Pound (SDG) currency support
- Local delivery and shipping zones
- Dental professional verification
- Compliance with local regulations

### 📊 **Advanced Analytics & Reporting**
- Real-time business intelligence dashboard
- Customer behavior analytics
- Revenue and sales reporting
- Geographic performance analysis
- Inventory turnover tracking
- Payment method analytics

### 📧 **Marketing Automation**
- Email automation sequences
- Customer onboarding workflows
- Abandoned cart recovery
- Post-purchase follow-ups
- Professional customer campaigns
- Multi-channel notifications (Email, SMS, WhatsApp)

### 🔧 **Admin Features**
- Comprehensive admin dashboard
- Bulk operations for products, orders, and users
- CSV import/export functionality
- Real-time monitoring and alerts
- Exchange rate management
- User role management

### ♿ **Accessibility & UX**
- WCAG 2.1 AA compliance
- High contrast mode
- Font size adjustment
- Reduced motion support
- Screen reader optimization
- Keyboard navigation

## 🏗️ Architecture

### Microservices
- **API Gateway**: Central authentication, rate limiting, and routing
- **Auth Service**: User authentication and authorization
- **Product Service**: Product catalog and inventory management
- **Order Service**: Order processing and management
- **Payment Service**: Local payment processing
- **Shipment Service**: Shipping and delivery management
- **Notification Service**: Multi-channel communications
- **Reporting Service**: Analytics and automated reports
- **Event Bus**: Asynchronous event processing

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **shadcn/ui** for components
- **React Query** for data fetching
- **React Router** for navigation

### Infrastructure
- **Docker** containerization
- **PostgreSQL** database
- **Redis** for caching
- **Nginx** reverse proxy
- **Prometheus** monitoring
- **Grafana** dashboards
- **Istio** service mesh ready

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 13+
- Redis (optional, for caching)
- Docker (optional, for containerized deployment)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/dental-store-sudan.git
   cd dental-store-sudan
   ```

2. **Install dependencies**
   ```bash
   # Install dependencies for all services
   npm run install:all
   ```

3. **Set up environment variables**
   ```bash
   # Copy example environment files
   cp env.development.example .env.development
   
   # Edit environment variables for each service
   # See ENVIRONMENT_SETUP.md for detailed configuration
   ```

4. **Set up databases**
   ```bash
   # Create PostgreSQL databases for each service
   npm run db:setup
   
   # Run migrations
   npm run db:migrate
   ```

5. **Start development servers**
   ```bash
   # Option 1: Use PowerShell script (Windows)
   .\start-dev.ps1
   
   # Option 2: Use Docker Compose
   docker-compose up -d
   
   # Option 3: Start services individually
   npm run dev:auth &
   npm run dev:products &
   npm run dev:orders &
   npm run dev:payments &
   npm run dev:shipments &
   npm run dev:notifications &
   npm run dev:reporting &
   npm run dev:frontend
   ```

6. **Access the application**
   - Frontend: http://localhost:5173
   - API Gateway: http://localhost:3000
   - Admin Dashboard: http://localhost:5173/admin

## 📁 Project Structure

```
dental-store-sudan/
├── api-gateway/              # Central API gateway
├── auth-service/             # Authentication service
├── smile-shop-pro/           # Frontend React application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # Custom React hooks
│   │   └── integrations/    # External service integrations
│   ├── product-service/     # Product catalog service
│   ├── order-service/       # Order management service
│   ├── payment-service/     # Payment processing service
│   └── shipment-service/    # Shipping management service
├── notification-service/     # Multi-channel notifications
├── reporting-service/        # Analytics and reporting
├── event-bus/               # Event processing service
├── external-integrations/   # Third-party API integrations
├── monitoring/              # Monitoring and alerting
├── service-mesh/            # Istio configuration
├── api-documentation/       # OpenAPI specifications
└── database/               # Database schemas and migrations
```

## 🔧 Configuration

### Environment Variables
Each service requires specific environment variables. See `ENVIRONMENT_SETUP.md` for detailed configuration instructions.

### Database Setup
- PostgreSQL databases for each microservice
- Redis for caching and session storage
- Database migrations and seeding scripts included

### Security Configuration
- JWT secret keys
- Rate limiting settings
- CORS configuration
- Security headers setup

## 📊 Monitoring & Analytics

### Built-in Monitoring
- **Prometheus** metrics collection
- **Grafana** dashboards for visualization
- **Health checks** for all services
- **Performance monitoring** and alerting

### Business Analytics
- Revenue and sales analytics
- Customer behavior tracking
- Product performance metrics
- Geographic analysis for Sudan market
- Payment method performance

## 🧪 Testing

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e

# Run load tests
npm run test:load
```

## 🚀 Deployment

### Docker Deployment
```bash
# Build all services
docker-compose build

# Deploy to production
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes Deployment
```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Deploy with Istio service mesh
kubectl apply -f service-mesh/istio-config.yaml
```

### Manual Deployment
See `DEPLOYMENT.md` for detailed deployment instructions.

## 📚 API Documentation

Interactive API documentation is available at:
- Development: http://localhost:3000/docs
- Production: https://api.dentalstore.sd/docs

OpenAPI specifications are located in the `api-documentation/` directory.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Email: support@dentalstore.sd
- Documentation: [Wiki](https://github.com/yourusername/dental-store-sudan/wiki)
- Issues: [GitHub Issues](https://github.com/yourusername/dental-store-sudan/issues)

## 🙏 Acknowledgments

- Built for the dental community in Sudan
- Designed with accessibility and local market needs in mind
- Powered by modern web technologies and microservices architecture

---

**Made with ❤️ for the dental professionals of Sudan** 🇸🇩
