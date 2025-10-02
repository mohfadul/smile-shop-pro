# Simple Development Environment Startup Script
# Starts core services only for quick development

Write-Host "🦷 Starting Dental Store Core Services..." -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green

$baseDir = "C:\Users\pc\OneDrive\Desktop\github"
Set-Location $baseDir

# Function to start a service in a new window
function Start-CoreService {
    param(
        [string]$ServiceName,
        [string]$ServicePath,
        [int]$Port
    )
    
    Write-Host "🚀 Starting $ServiceName on port $Port..." -ForegroundColor Yellow
    
    $command = @"
        Set-Location '$ServicePath'
        Write-Host '📦 Installing dependencies for $ServiceName...' -ForegroundColor Cyan
        npm install --silent
        Write-Host '🎯 Starting $ServiceName on port $Port...' -ForegroundColor Green
        npm run dev
"@
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $command
    Start-Sleep -Seconds 3
}

Write-Host ""
Write-Host "Starting Core Services (Essential for development)..." -ForegroundColor Magenta

# Start Frontend (React App)
Start-CoreService -ServiceName "Frontend App" -ServicePath "$baseDir\smile-shop-pro" -Port 5173

# Start Auth Service
Start-CoreService -ServiceName "Auth Service" -ServicePath "$baseDir\auth-service" -Port 5000

# Start API Gateway
Start-CoreService -ServiceName "API Gateway" -ServicePath "$baseDir\api-gateway" -Port 3000

Write-Host ""
Write-Host "✅ Core services are starting!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Access Points:" -ForegroundColor Cyan
Write-Host "   Frontend App:     http://localhost:5173" -ForegroundColor White
Write-Host "   Admin Dashboard:  http://localhost:5173/admin" -ForegroundColor White
Write-Host "   API Gateway:      http://localhost:3000/health" -ForegroundColor White
Write-Host "   Auth Service:     http://localhost:5000/health" -ForegroundColor White
Write-Host ""
Write-Host "⏱️  Please wait 30-60 seconds for services to start..." -ForegroundColor Yellow
Write-Host ""
Write-Host "🦷 Core development environment ready!" -ForegroundColor Green

Read-Host "Press Enter to close this startup window"
