# Dental Store Sudan - Backend Services Startup Script
# Starts all microservices for development

Write-Host "🦷 Starting Dental Store Sudan Backend Services" -ForegroundColor Green
Write-Host "=" * 60

# Configuration
$services = @(
    @{
        Name = "API Gateway"
        Path = "api-gateway"
        Port = 3000
        Description = "Central API Gateway & Rate Limiting"
    },
    @{
        Name = "Auth Service"
        Path = "auth-service"
        Port = 5000
        Description = "JWT Authentication & User Management"
    },
    @{
        Name = "Product Service"
        Path = "product-service"
        Port = 5001
        Description = "Product Catalog & Inventory Management"
    },
    @{
        Name = "Order Service"
        Path = "order-service"
        Port = 5002
        Description = "Order Management & Processing"
    },
    @{
        Name = "Payment Service"
        Path = "payment-service"
        Port = 5003
        Description = "Payment Processing & Transactions"
    },
    @{
        Name = "Shipment Service"
        Path = "shipment-service"
        Port = 5004
        Description = "Shipping & Delivery Tracking"
    },
    @{
        Name = "Notification Service"
        Path = "notification-service"
        Port = 5005
        Description = "Email, SMS & WhatsApp Notifications"
    },
    @{
        Name = "Reporting Service"
        Path = "reporting-service"
        Port = 5006
        Description = "Analytics & Business Intelligence"
    }
)

# Function to start a service
function Start-BackendService {
    param(
        [string]$ServiceName,
        [string]$ServicePath,
        [int]$Port,
        [string]$Description
    )
    
    Write-Host "🚀 Starting $ServiceName on port $Port..." -ForegroundColor Cyan
    
    # Check if service directory exists
    if (-not (Test-Path $ServicePath)) {
        Write-Host "❌ Directory not found: $ServicePath" -ForegroundColor Red
        return $false
    }
    
    # Check if package.json exists
    if (-not (Test-Path "$ServicePath/package.json")) {
        Write-Host "❌ package.json not found in $ServicePath" -ForegroundColor Red
        return $false
    }
    
    # Start the service in a new PowerShell window
    $scriptBlock = "cd '$ServicePath'; npm install; npm run dev"
    
    try {
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $scriptBlock -WindowStyle Normal
        Write-Host "✅ $ServiceName started successfully" -ForegroundColor Green
        Write-Host "   📍 URL: http://localhost:$Port" -ForegroundColor Gray
        Write-Host "   📝 $Description" -ForegroundColor Gray
        Write-Host ""
        return $true
    }
    catch {
        Write-Host "❌ Failed to start $ServiceName" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Function to check if port is available
function Test-Port {
    param([int]$Port)
    
    try {
        $connection = New-Object System.Net.Sockets.TcpClient
        $connection.Connect("localhost", $Port)
        $connection.Close()
        return $true
    }
    catch {
        return $false
    }
}

# Main execution
Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
}
catch {
    Write-Host "❌ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check npm
try {
    $npmVersion = npm --version
    Write-Host "✅ npm version: $npmVersion" -ForegroundColor Green
}
catch {
    Write-Host "❌ npm not found. Please install npm first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🚀 Starting backend services..." -ForegroundColor Yellow
Write-Host ""

$successCount = 0
$totalServices = $services.Count

foreach ($service in $services) {
    # Check if port is already in use
    if (Test-Port -Port $service.Port) {
        Write-Host "⚠️  Port $($service.Port) is already in use. Skipping $($service.Name)..." -ForegroundColor Yellow
        continue
    }
    
    $success = Start-BackendService -ServiceName $service.Name -ServicePath $service.Path -Port $service.Port -Description $service.Description
    if ($success) {
        $successCount++
    }
    
    # Small delay between service starts
    Start-Sleep -Seconds 2
}

Write-Host "=" * 60
Write-Host "📊 Startup Summary:" -ForegroundColor Green
Write-Host "✅ Successfully started: $successCount/$totalServices services" -ForegroundColor Green

if ($successCount -eq $totalServices) {
    Write-Host ""
    Write-Host "🎉 All backend services are running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Service URLs:" -ForegroundColor Cyan
    foreach ($service in $services) {
        Write-Host "   • $($service.Name): http://localhost:$($service.Port)" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "🌐 API Gateway: http://localhost:3000" -ForegroundColor Yellow
    Write-Host "📊 Health Check: http://localhost:3000/health" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 Tips:" -ForegroundColor Cyan
    Write-Host "   • Use Ctrl+C in each service window to stop individual services" -ForegroundColor Gray
    Write-Host "   • Check service logs in their respective windows" -ForegroundColor Gray
    Write-Host "   • Frontend will connect to these services automatically" -ForegroundColor Gray
}
else {
    Write-Host ""
    Write-Host "⚠️  Some services failed to start. Check the error messages above." -ForegroundColor Yellow
    Write-Host "💡 You can still use the frontend with demo data." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Press Enter to close this startup window..."
Read-Host
