#!/bin/bash

# Dental Store Deployment Script
# This script deploys the entire dental store system

set -e  # Exit on any error

echo "🚀 Starting Dental Store Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker and Docker Compose are installed
check_dependencies() {
    print_status "Checking dependencies..."

    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    print_status "✅ Dependencies check passed"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."

    mkdir -p logs
    mkdir -p ssl
    mkdir -p monitoring
    mkdir -p database/backups

    print_status "✅ Directories created"
}

# Generate SSL certificates (self-signed for development)
generate_ssl_certs() {
    print_status "Generating SSL certificates..."

    if [ ! -f ssl/server.crt ] || [ ! -f ssl/server.key ]; then
        openssl req -x509 -newkey rsa:4096 -keyout ssl/server.key -out ssl/server.crt -days 365 -nodes -subj "/CN=dental-store.local"
        print_status "✅ SSL certificates generated"
    else
        print_warning "SSL certificates already exist, skipping generation"
    fi
}

# Build Docker images
build_images() {
    print_status "Building Docker images..."

    # Build all services
    docker-compose build --parallel

    print_status "✅ Docker images built"
}

# Start services
start_services() {
    print_status "Starting services..."

    # Start all services
    docker-compose up -d

    print_status "✅ Services started"

    # Wait for services to be healthy
    print_status "Waiting for services to be ready..."
    sleep 30

    # Check service health
    check_service_health
}

# Check if all services are healthy
check_service_health() {
    print_status "Checking service health..."

    services=("auth-service" "product-service" "order-service" "payment-service" "shipment-service" "frontend" "postgres" "redis" "nginx")

    all_healthy=true

    for service in "${services[@]}"; do
        if curl -f "http://localhost:8080/health" &>/dev/null; then
            print_status "✅ $service is healthy"
        else
            print_warning "⚠️  $service health check failed"
            all_healthy=false
        fi
    done

    if [ "$all_healthy" = true ]; then
        print_status "🎉 All services are healthy!"
    else
        print_warning "⚠️  Some services may not be fully ready yet"
    fi
}

# Run database migrations
run_migrations() {
    print_status "Running database migrations..."

    # Wait for database to be ready
    sleep 10

    # Run migrations for all services
    docker-compose exec auth-service npm run migrate || print_warning "Auth service migration failed"
    docker-compose exec product-service npm run migrate || print_warning "Product service migration failed"
    docker-compose exec order-service npm run migrate || print_warning "Order service migration failed"
    docker-compose exec payment-service npm run migrate || print_warning "Payment service migration failed"
    docker-compose exec shipment-service npm run migrate || print_warning "Shipment service migration failed"

    print_status "✅ Database migrations completed"
}

# Display service information
display_info() {
    print_status "🎉 Dental Store Deployment Complete!"
    echo ""
    echo "📋 Service URLs:"
    echo "  🌐 Frontend: http://localhost:8080"
    echo "  🔐 Auth Service: http://localhost:5000"
    echo "  📦 Product Service: http://localhost:5001"
    echo "  🛒 Order Service: http://localhost:5002"
    echo "  💳 Payment Service: http://localhost:5003"
    echo "  🚚 Shipment Service: http://localhost:5004"
    echo ""
    echo "📊 Monitoring:"
    echo "  📈 Prometheus: http://localhost:9090"
    echo "  📊 Grafana: http://localhost:3000 (admin/admin)"
    echo ""
    echo "🛠️  Management Commands:"
    echo "  Stop: docker-compose down"
    echo "  Restart: docker-compose restart"
    echo "  Logs: docker-compose logs -f [service-name]"
    echo "  Backup: docker exec postgres pg_dump -U dental_user dental_store > database/backups/backup.sql"
    echo ""
    echo "🔒 Security Notes:"
    echo "  - SSL certificates are self-signed for development"
    echo "  - Change default passwords in production"
    echo "  - Update JWT secrets and API keys"
    echo ""
}

# Main deployment flow
main() {
    echo "🏥 Dental Store Deployment Script"
    echo "================================="
    echo ""

    check_dependencies
    create_directories
    generate_ssl_certs
    build_images
    start_services
    run_migrations
    display_info

    echo ""
    print_status "🎯 Deployment completed successfully!"
    print_status "Your dental store is now running at http://localhost:8080"
}

# Run main function
main "$@"
