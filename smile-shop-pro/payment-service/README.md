# Payment Service

Payment processing microservice for the Online Medical Store platform with local payment methods for Sudan market.

## Overview

The Payment Service handles local payment processing for the Sudan market, supporting bank transfers and cash payments. It integrates with the order-service for payment status updates and provides secure payment processing without international payment gateways.

## Features

- 🏦 Local bank transfer processing
- 💵 Cash on delivery support
- 🔄 Payment confirmation and tracking
- 💰 Refund management
- 🏦 Bank transfer instructions for customers
- 📊 Payment analytics and reporting
- 🛡️ Local payment security and validation
- 🇸🇩 Sudan-specific payment workflows

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Security**: Helmet, CORS, Rate limiting
- **Validation**: Express-validator + Joi
- **Logging**: Winston
- **HTTP Client**: Axios for inter-service communication

## Quick Start

### 1. Environment Setup

Create a `.env` file in the root directory:

```env
PORT=5003
DATABASE_URL=postgres://username:password@localhost:5432/paymentdb
ORDER_SERVICE_URL=http://localhost:5002
AUTH_SERVICE_URL=http://localhost:5000
NODE_ENV=development
```

### 2. Database Setup

Run the database migrations:

```bash
npm run migrate
```

This will create:
- `payment_transactions` table for payment records
- `payment_refunds` table for refund management
- `payment_webhooks` table for webhook events
- `payment_methods` table for customer payment methods
- `payment_fees` table for fee tracking
- `payment_disputes` table for dispute management

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development Server

```bash
npm run dev
```

The service will be available at `http://localhost:5003`

## API Endpoints

### Payment Processing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/bank-transfer` | Create bank transfer payment |
| POST | `/api/payments/cash` | Create cash payment |
| POST | `/api/payments/confirm-bank-transfer` | Confirm bank transfer (Admin) |
| GET | `/api/payments/bank-instructions` | Get bank transfer instructions |
| GET | `/api/payments/:transactionId` | Get payment transaction details |
| GET | `/api/payments/reference/:paymentReference` | Get payment by reference (public) |
| GET | `/api/payments/user/history` | Get user's payment history |
| POST | `/api/payments/calculate-fees` | Calculate payment fees |
| GET | `/api/payments/admin/stats` | Get payment statistics (Admin) |

### Payment Methods

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payment-methods` | Get user's payment methods |
| PUT | `/api/payment-methods/:id/default` | Set payment method as default |
| DELETE | `/api/payment-methods/:id` | Detach payment method |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/stripe` | Stripe webhook handler (legacy) |
| POST | `/webhooks/:provider` | Generic webhook handler |

## Database Schema

### Payment Transactions Table

```sql
CREATE TABLE payment_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    user_id UUID NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status payment_status DEFAULT 'pending',
    payment_method payment_method NOT NULL,
    payment_provider VARCHAR(50),
    provider_transaction_id VARCHAR(255),
    provider_payment_method_id VARCHAR(255),
    gateway_response JSONB DEFAULT '{}',
    failure_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Payment Methods

- **bank_transfer**: Local bank transfer payments
- **cash_on_delivery**: Cash payments on delivery

### Payment Status

- **pending**: Payment initiated, awaiting confirmation
- **completed**: Payment successfully processed
- **failed**: Payment processing failed
- **cancelled**: Payment cancelled
- **refunded**: Payment fully refunded
- **partially_refunded**: Payment partially refunded

## Security Features

### Payment Security

- **Input Validation** - Express-validator for all endpoints
- **Rate Limiting** - 100 requests/15min for general, 10/min for sensitive ops
- **CORS Protection** - Configurable origin validation
- **Input Sanitization** - XSS and injection prevention
- **Request Validation** - Suspicious pattern detection

### Local Payment Security

- **Reference Validation** - Secure payment reference format validation
- **Bank Transfer Verification** - Admin confirmation process
- **Audit Logging** - Complete payment activity tracking
- **Status Tracking** - Real-time payment status updates

## Local Payment Flow

### Bank Transfer Process

1. **Customer initiates payment** via frontend
2. **Payment record created** with unique reference (PAY-TIMESTAMP-RANDOM)
3. **Bank instructions provided** (Bank of Khartoum details)
4. **Customer completes transfer** using provided reference
5. **Admin verifies payment** via bank confirmation
6. **Admin confirms payment** in system
7. **Order status updated** to paid/shipped

### Cash Payment Process

1. **Customer selects cash payment** for order
2. **Payment record created** with reference
3. **Customer pays at pickup/delivery**
4. **Payment status updated** to completed
5. **Order status updated** to shipped/delivered

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
payment-service/
├── src/
│   ├── controllers/
│   │   └── paymentController.js
│   ├── middlewares/
│   │   ├── errorHandler.js
│   │   ├── security.js
│   │   └── validateRequest.js
│   ├── models/
│   │   └── paymentModel.js
│   ├── routes/
│   │   ├── paymentRoutes.js
│   │   ├── paymentMethodRoutes.js
│   │   └── webhookRoutes.js
│   ├── services/
│   │   └── stripeService.js (local payment service)
│   └── index.js
├── database/
│   ├── migrations/
│   │   └── 001_create_payments_tables.sql
│   ├── schema.sql
│   ├── connection.js
│   └── migrate.js
├── tests/
├── logs/
├── .env
├── .env.example
├── package.json
└── README.md
```

## Integration

### Required Services

- **auth-service** - User authentication and authorization
- **order-service** - Order management and status updates

### Environment Variables

```env
DATABASE_URL=postgres://username:password@localhost:5432/paymentdb
ORDER_SERVICE_URL=http://localhost:5002
AUTH_SERVICE_URL=http://localhost:5000
```

## Local Payment Features

### Bank Transfer Instructions

The service provides standardized bank transfer instructions for Sudan:

```json
{
  "bank_name": "Bank of Khartoum",
  "account_name": "Khalid Dqash Medical Company",
  "account_number": "1234567890",
  "iban": "SD123456789012345678901234567890",
  "swift_code": "BKSDSD",
  "instructions": [
    "Transfer the exact amount to the account above",
    "Include the payment reference in the transfer description",
    "Send proof of payment to payments@medicalstore.com.sd",
    "Payment will be confirmed within 1-2 business days",
    "Contact +249-123-456789 for payment assistance"
  ],
  "processing_time": "1-2 business days",
  "currency": "SDG/USD"
}
```

### Payment References

All payments generate unique references in format: `PAY-TIMESTAMP-RANDOM`

Example: `PAY-1702345678901-ABC123`

### Fee Structure

- **Bank Transfer Fee**: 0.5% of transaction amount
- **Processing Fee**: 1.00 SDG/USD fixed fee
- **Insurance**: Optional, 1% of order value

## Testing

Run the test suite:

```bash
npm test
```

Tests include:
- Payment creation and validation
- Bank transfer processing
- Cash payment handling
- Refund processing
- Fee calculations
- Integration with order-service

## Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5003
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5003/health || exit 1
CMD ["npm", "start"]
```

### Production Checklist

- [ ] Set up PostgreSQL database
- [ ] Configure environment variables
- [ ] Set up proper logging and monitoring
- [ ] Configure rate limiting for production traffic
- [ ] Set up backup and recovery procedures
- [ ] Test all payment flows
- [ ] Set up admin interfaces for payment management

## Monitoring

### Health Check Endpoint

```bash
curl http://localhost:5003/health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "payment-service",
  "version": "1.0.0"
}
```

### Payment Statistics

Admin can access payment analytics:
- Total payments processed
- Payment method breakdown
- Success/failure rates
- Revenue tracking

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

MIT License - see LICENSE file for details.
