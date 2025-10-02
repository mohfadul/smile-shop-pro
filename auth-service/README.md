# Auth Service

Authentication microservice for the Online Medical Store platform.

## Overview

The Auth Service handles user authentication, authorization, and user management for the medical store platform. It provides secure login, registration, and user profile management with comprehensive security features.

## Features

- 🔐 JWT-based authentication
- 👤 User registration and login
- 🔒 Password hashing with bcrypt
- 🚫 Account lockout after failed attempts
- 📧 Email verification (configurable)
- 👥 Role-based access control (customer, admin, manager, staff)
- 📊 User activity logging
- 🔑 Password history tracking
- 🚪 Session management

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT + bcrypt
- **Validation**: Express-validator + Joi
- **Security**: Helmet, CORS, Rate limiting
- **Logging**: Winston
- **Testing**: Jest

## Quick Start

### 1. Environment Setup

Create a `.env` file in the root directory:

```env
PORT=5000
DATABASE_URL=postgres://username:password@localhost:5432/authdb
JWT_SECRET=your_jwt_secret_here_make_this_very_long_and_random
JWT_EXPIRES_IN=1d
BCRYPT_SALT_ROUNDS=12
NODE_ENV=development
```

### 2. Database Setup

Run the database migrations:

```bash
npm run migrate
```

This will create:
- `users` table with authentication fields
- `user_sessions` table for session tracking
- `user_activity_log` table for audit trails
- `password_history` table for security
- Proper indexes and constraints
- Row Level Security policies

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development Server

```bash
npm run dev
```

The service will be available at `http://localhost:5000`

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/profile` | Get user profile |
| PUT | `/api/auth/profile` | Update user profile |

### User Management (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/users` | List all users |
| GET | `/api/auth/users/:id` | Get user by ID |
| PUT | `/api/auth/users/:id` | Update user |
| DELETE | `/api/auth/users/:id` | Delete user |

## Database Schema

### Users Table

```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role user_role DEFAULT 'customer',
    status user_status DEFAULT 'active',
    email_verified BOOLEAN DEFAULT false,
    email_verification_token VARCHAR(255),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### User Roles

- `customer` - Regular customers
- `admin` - System administrators
- `manager` - Store managers
- `staff` - Store staff

### User Status

- `active` - Active account
- `inactive` - Inactive account
- `suspended` - Suspended account
- `pending` - Pending verification

## Security Features

### Password Security

- bcrypt hashing with 12 salt rounds
- Password history tracking (prevents reuse)
- Minimum password requirements enforced
- Account lockout after 5 failed attempts

### Session Management

- JWT tokens with configurable expiration
- Session tracking per device
- Automatic cleanup of expired sessions

### Rate Limiting

- 100 requests per 15 minutes for general endpoints
- 5 requests per 15 minutes for authentication endpoints
- Automatic cleanup of expired rate limit entries

### Audit Logging

- All user actions logged with IP and timestamp
- Failed login attempts tracked
- Admin actions logged for compliance

## Development

### Available Scripts

```bash
npm run dev           # Start development server with nodemon
npm run start         # Start production server
npm run migrate       # Run database migrations
npm run migrate:status # Check migration status
npm run test          # Run tests
npm run lint          # Lint code
```

### Project Structure

```
auth-service/
├── src/
│   ├── controllers/
│   │   └── authController.js
│   ├── middlewares/
│   │   ├── errorHandler.js
│   │   ├── validateRequest.js
│   │   └── security.js
│   ├── models/
│   │   └── userModel.js
│   ├── routes/
│   │   └── authRoutes.js
│   ├── utils/
│   │   └── catchAsync.js
│   └── index.js
├── database/
│   ├── migrations/
│   │   └── 001_create_users_table.sql
│   ├── schema.sql
│   ├── connection.js
│   └── migrate.js
├── tests/
│   ├── unit/
│   └── integration/
├── logs/
├── .env
├── .env.example
├── package.json
└── README.md
```

## Testing

Run the test suite:

```bash
npm test
```

Tests include:
- Unit tests for controllers and utilities
- Integration tests for API endpoints
- Database operation tests
- Security and validation tests

## Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1
CMD ["npm", "start"]
```

### Production Checklist

- [ ] Set strong JWT_SECRET (64+ characters)
- [ ] Configure production database
- [ ] Set up Redis for session storage
- [ ] Configure monitoring (Sentry, etc.)
- [ ] Set up proper logging
- [ ] Configure rate limiting for production
- [ ] Set up health checks
- [ ] Configure SSL/TLS certificates

## Monitoring

### Health Check Endpoint

```bash
curl http://localhost:5000/health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": "1h 30m",
  "database": "connected",
  "version": "1.0.0"
}
```

### Metrics

- Request count and response times
- Error rates by endpoint
- Database connection pool status
- Memory and CPU usage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

MIT License - see LICENSE file for details.
