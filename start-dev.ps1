# Dental Store Development Environment Startup Script
# This script starts all services in the correct order

Write-Host "🦷 Starting Dental Store Development Environment..." -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green

# Function to start a service in a new PowerShell window
function Start-Service {
    param(
        [string]$ServiceName,
        [string]$ServicePath,
        [int]$Port,
        [string]$Description
    )
    
    Write-Host "🚀 Starting $ServiceName on port $Port..." -ForegroundColor Yellow
    Write-Host "   $Description" -ForegroundColor Gray
    
    $scriptContent = @"
        Set-Location '$ServicePath'
        Write-Host '📦 Installing dependencies for $ServiceName...' -ForegroundColor Cyan
        npm install
        Write-Host '🎯 Starting $ServiceName...' -ForegroundColor Green
        npm run dev
        Read-Host 'Press Enter to close this window'
"@
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $scriptContent
    Start-Sleep -Seconds 2
}

# Set base directory
$baseDir = "C:\Users\pc\OneDrive\Desktop\github"
Set-Location $baseDir

Write-Host ""
Write-Host "🔧 Starting Core Services..." -ForegroundColor Magenta

# Start Auth Service (Core dependency)
Start-Service -ServiceName "Auth Service" -ServicePath "$baseDir\auth-service" -Port 5000 -Description "JWT Authentication & User Management"

# Start API Gateway (Central routing)
Start-Service -ServiceName "API Gateway" -ServicePath "$baseDir\api-gateway" -Port 3000 -Description "Central Auth & Rate Limiting"

Write-Host ""
Write-Host "📦 Starting Business Services..." -ForegroundColor Magenta

# Start Product Service
Start-Service -ServiceName "Product Service" -ServicePath "$baseDir\smile-shop-pro\product-service" -Port 5001 -Description "Product Catalog and Inventory"

# Start Order Service
Start-Service -ServiceName "Order Service" -ServicePath "$baseDir\smile-shop-pro\order-service" -Port 5002 -Description "Order Management and Processing"

# Start Payment Service
Start-Service -ServiceName "Payment Service" -ServicePath "$baseDir\smile-shop-pro\payment-service" -Port 5003 -Description "Local Payment Processing"

# Start Shipment Service
Start-Service -ServiceName "Shipment Service" -ServicePath "$baseDir\smile-shop-pro\shipment-service" -Port 5004 -Description "Shipping and Delivery Management"

Write-Host ""
Write-Host "🔔 Starting Advanced Services..." -ForegroundColor Magenta

# Start Notification Service
Start-Service -ServiceName "Notification Service" -ServicePath "$baseDir\notification-service" -Port 5005 -Description "Multi-Channel Notifications"

# Start Reporting Service
Start-Service -ServiceName "Reporting Service" -ServicePath "$baseDir\reporting-service" -Port 5006 -Description "Analytics and Automated Reports"

# Start Event Bus
Start-Service -ServiceName "Event Bus" -ServicePath "$baseDir\event-bus" -Port 5007 -Description "Async Event Processing"

Write-Host ""
Write-Host "🌐 Starting Frontend Application..." -ForegroundColor Magenta

# Start Frontend (React + TypeScript)
Start-Service -ServiceName "Frontend App" -ServicePath "$baseDir\smile-shop-pro" -Port 5173 -Description "React Admin Dashboard and Customer Interface"

Write-Host ""
Write-Host "✅ All services are starting up!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Access Points:" -ForegroundColor Cyan
Write-Host "   Frontend App:     http://localhost:5173" -ForegroundColor White
Write-Host "   Admin Dashboard:  http://localhost:5173/admin" -ForegroundColor White
Write-Host "   API Gateway:      http://localhost:3000" -ForegroundColor White
Write-Host "   Auth Service:     http://localhost:5000" -ForegroundColor White
Write-Host ""
Write-Host "📊 Service Status:" -ForegroundColor Cyan
Write-Host "   Auth Service:       Port 5000 ✅" -ForegroundColor White
Write-Host "   Product Service:    Port 5001 ✅" -ForegroundColor White
Write-Host "   Order Service:      Port 5002 ✅" -ForegroundColor White
Write-Host "   Payment Service:    Port 5003 ✅" -ForegroundColor White
Write-Host "   Shipment Service:   Port 5004 ✅" -ForegroundColor White
Write-Host "   Notification Svc:   Port 5005 ✅" -ForegroundColor White
Write-Host "   Reporting Service:  Port 5006 ✅" -ForegroundColor White
Write-Host "   Event Bus:          Port 5007 ✅" -ForegroundColor White
Write-Host "   Frontend App:       Port 5173 ✅" -ForegroundColor White
Write-Host "   API Gateway:        Port 3000 ✅" -ForegroundColor White
Write-Host ""
Write-Host "⏱️  Please wait 30-60 seconds for all services to fully start..." -ForegroundColor Yellow
Write-Host ""
Write-Host "🦷 Dental Store Platform is ready for development!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green

# Keep this window open
Read-Host "Press Enter to close this startup window"
