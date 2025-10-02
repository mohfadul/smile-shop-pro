# 🦷 Dental Store Development Guide

## 🚀 Quick Start Options

### Option 1: Complete System (All Services)
```powershell
PowerShell -ExecutionPolicy Bypass -File "start-dev.ps1"
```
**Starts:** All 10 microservices + frontend
**Use when:** Full system testing, integration development
**Startup time:** 2-3 minutes

### Option 2: Core Services Only (Recommended for Development)
```powershell
PowerShell -ExecutionPolicy Bypass -File "start-simple.ps1"
```
**Starts:** Frontend + Auth Service + API Gateway
**Use when:** UI development, basic functionality testing
**Startup time:** 1 minute

### Option 3: Frontend Only (UI Development)
```powershell
PowerShell -ExecutionPolicy Bypass -File "start-frontend-only.ps1"
```
**Starts:** React frontend only
**Use when:** Pure UI/UX development
**Startup time:** 30 seconds

## 🌐 Access Points

| Service | URL | Purpose |
|---------|-----|---------|
| **Frontend App** | http://localhost:5173 | Main application |
| **Admin Dashboard** | http://localhost:5173/admin | Admin interface |
| **API Gateway** | http://localhost:3000 | Central API routing |
| **Auth Service** | http://localhost:5000 | Authentication |

## 🔧 Manual Service Startup

If you prefer to start services individually:

```powershell
# Frontend (React + TypeScript)
cd smile-shop-pro
npm install
npm run dev

# Auth Service
cd auth-service
npm install
npm run dev

# API Gateway
cd api-gateway
npm install
npm run dev
```

## 🏥 Health Checks

Check if services are running:
```powershell
PowerShell -ExecutionPolicy Bypass -File "check-services.ps1"
```

Or manually check:
- Frontend: http://localhost:5173
- API Gateway: http://localhost:3000/health
- Auth Service: http://localhost:5000/health

## 🐛 Troubleshooting

### Common Issues:

**1. PowerShell Execution Policy Error:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**2. Port Already in Use:**
```powershell
# Find process using port 5173
netstat -ano | findstr :5173
# Kill process (replace PID)
taskkill /PID <PID> /F
```

**3. Node Modules Issues:**
```powershell
# Clean install
rm -rf node_modules package-lock.json
npm install
```

**4. Database Connection Issues:**
- Ensure PostgreSQL is running on port 5432
- Check DATABASE_URL in .env files
- Default credentials: postgres/password

## 📝 Environment Variables

Copy `env.development.example` to `.env` in each service directory:

```bash
# Core configuration
JWT_SECRET=SFxyRDWtaBCOeVOHD1h1A0kpMXs74V7/HJbNFUJW7qhKHUv9s4zmxUrkgkjjnPC91WmBiWb0bzpJMWdycC0k9Q==
DATABASE_URL=postgresql://postgres:password@localhost:5432/dentalstore

# Service URLs
AUTH_SERVICE_URL=http://localhost:5000
VITE_AUTH_SERVICE_URL=http://localhost:5000
```

## 🧪 Testing

```powershell
# Run tests (when implemented)
npm test

# Run linting
npm run lint

# Type checking (TypeScript)
npm run type-check
```

## 📦 Production Build

```powershell
# Build frontend for production
cd smile-shop-pro
npm run build

# Build services
cd auth-service
npm run build
```

## 🔄 Development Workflow

1. **Start with Option 2** (Core Services) for most development
2. **Use Option 3** (Frontend Only) for UI-focused work
3. **Use Option 1** (Complete System) for integration testing
4. **Check health endpoints** to verify services are running
5. **Use browser dev tools** for debugging frontend issues
6. **Check service logs** in PowerShell windows for backend issues

## 🎯 Next Steps

1. **Fix any remaining PowerShell syntax issues**
2. **Set up database with sample data**
3. **Configure environment variables**
4. **Start development!**

---

**Happy coding! 🦷✨**
