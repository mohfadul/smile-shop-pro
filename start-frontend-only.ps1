# Frontend Only Development Script
# For quick UI development and testing

Write-Host "🦷 Starting Frontend Development Environment..." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

$baseDir = "C:\Users\pc\OneDrive\Desktop\github"
Set-Location "$baseDir\smile-shop-pro"

Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Cyan
npm install

Write-Host ""
Write-Host "🎯 Starting React development server..." -ForegroundColor Green
Write-Host "🌐 Frontend will be available at: http://localhost:5173" -ForegroundColor Yellow
Write-Host "📊 Admin dashboard at: http://localhost:5173/admin" -ForegroundColor Yellow
Write-Host ""

# Start the frontend development server
npm run dev
