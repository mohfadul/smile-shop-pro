# Health Check Script for Dental Store Services
Write-Host "🔍 Checking Dental Store Services Health..." -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green

$services = @(
    @{Name="API Gateway"; URL="http://localhost:3000/health"; Port=3000},
    @{Name="Auth Service"; URL="http://localhost:5000/health"; Port=5000},
    @{Name="Product Service"; URL="http://localhost:5001/health"; Port=5001},
    @{Name="Order Service"; URL="http://localhost:5002/health"; Port=5002},
    @{Name="Payment Service"; URL="http://localhost:5003/health"; Port=5003},
    @{Name="Shipment Service"; URL="http://localhost:5004/health"; Port=5004},
    @{Name="Notification Service"; URL="http://localhost:5005/health"; Port=5005},
    @{Name="Reporting Service"; URL="http://localhost:5006/health"; Port=5006},
    @{Name="Event Bus"; URL="http://localhost:5007/health"; Port=5007},
    @{Name="Frontend App"; URL="http://localhost:5173"; Port=5173}
)

foreach ($service in $services) {
    try {
        Write-Host "Checking $($service.Name) on port $($service.Port)..." -NoNewline
        $response = Invoke-WebRequest -Uri $service.URL -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host " ✅ HEALTHY" -ForegroundColor Green
        } else {
            Write-Host " ⚠️ RESPONDING ($($response.StatusCode))" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host " ❌ NOT RESPONDING" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🌐 Main Access Points:" -ForegroundColor Cyan
Write-Host "   Frontend:      http://localhost:5173" -ForegroundColor White
Write-Host "   Admin Panel:   http://localhost:5173/admin" -ForegroundColor White
Write-Host "   API Gateway:   http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "📊 API Health Checks:" -ForegroundColor Cyan
Write-Host "   Gateway Health: http://localhost:3000/health" -ForegroundColor White
Write-Host "   Auth Health:    http://localhost:5000/health" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to close"
