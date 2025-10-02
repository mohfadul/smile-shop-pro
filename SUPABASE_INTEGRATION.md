# Supabase File Storage Integration Guide

## 🎯 Overview

This guide provides complete integration of Supabase file storage into your dental store microservices platform. All file operations use the provided Supabase service role key for secure, scalable storage.

## 🔑 Credentials Verified

- **Project URL**: `https://piplzeixrpiwoqbgpvzp.supabase.co`
- **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` ✅ **VERIFIED**

## 📦 Storage Buckets

| Bucket Name | Purpose | Access Level | Max File Size |
|-------------|---------|--------------|---------------|
| `product-images` | Product photos | Public | 5MB |
| `order-invoices` | PDF invoices | Private | 10MB |
| `analytics-reports` | Excel/PDF reports | Private | 50MB |
| `user-documents` | User uploads | Private | 10MB |
| `temp-files` | Temporary storage | Private | 10MB |

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
# For all services
npm install @supabase/supabase-js multer

# For order service (PDF generation)
npm install pdfkit

# For reporting service (Excel generation)
npm install exceljs pdfkit
```

### 2. Verify Connection

```bash
node scripts/verify-supabase.js
```

### 3. Update Service Files

Add the file routes to your main service files:

#### Product Service (`product-service/src/index.js`)
```javascript
const fileRoutes = require('./routes/fileRoutes');
app.use('/api/v1/files', fileRoutes);
```

#### Order Service (`order-service/src/index.js`)
```javascript
const invoiceRoutes = require('./routes/invoiceRoutes');
app.use('/api/v1/invoices', invoiceRoutes);
```

#### Reporting Service (`reporting-service/src/index.js`)
```javascript
const reportFileRoutes = require('./routes/reportFileRoutes');
app.use('/api/v1/reports', reportFileRoutes);
```

## 📋 API Endpoints

### Product Service - File Operations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/v1/files/products/:id/images` | Get product images | No |
| `POST` | `/api/v1/files/products/:id/images` | Upload single image | Staff+ |
| `POST` | `/api/v1/files/products/:id/images/bulk` | Upload multiple images | Staff+ |
| `DELETE` | `/api/v1/files/products/images/:imageId` | Delete image | Staff+ |
| `GET` | `/api/v1/files/products/images/:imageId/signed-url` | Get signed URL | Staff+ |
| `DELETE` | `/api/v1/files/products/images/bulk` | Bulk delete images | Admin+ |

### Order Service - Invoice Operations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/v1/invoices/orders/:id/invoice` | Generate invoice | Staff+ |
| `GET` | `/api/v1/invoices/orders/:id/invoice/download` | Download invoice | Customer/Staff+ |
| `GET` | `/api/v1/invoices/orders/:id/invoice/signed-url` | Get signed URL | Customer/Staff+ |
| `GET` | `/api/v1/invoices/orders/:id/invoices` | List order invoices | Staff+ |
| `DELETE` | `/api/v1/invoices/invoices/:invoiceId` | Delete invoice | Admin+ |

### Reporting Service - Report Operations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/v1/reports/generate` | Generate report | Staff+ |
| `GET` | `/api/v1/reports/` | List reports | Staff+ |
| `GET` | `/api/v1/reports/:reportId/download` | Download report | Staff+ |
| `GET` | `/api/v1/reports/:reportId/signed-url` | Get signed URL | Staff+ |
| `DELETE` | `/api/v1/reports/:reportId` | Delete report | Admin+ |

## 💻 Usage Examples

### Upload Product Image

```javascript
// Frontend (React)
const uploadImage = async (productId, imageFile) => {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('alt_text', 'Product image');
  formData.append('is_primary', 'true');

  const response = await fetch(`/api/v1/files/products/${productId}/images`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  return response.json();
};
```

### Generate Order Invoice

```javascript
// Backend API call
const generateInvoice = async (orderId) => {
  const response = await fetch(`/api/v1/invoices/orders/${orderId}/invoice`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  return response.json();
};
```

### Generate Analytics Report

```javascript
// Generate Excel sales report
const generateReport = async () => {
  const response = await fetch('/api/v1/reports/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reportType: 'sales_report',
      format: 'excel',
      title: 'Monthly Sales Report',
      filters: {
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      }
    })
  });

  return response.json();
};
```

## 🔒 Security Features

### Role-Based Access Control

- **Public Access**: Product images only
- **Customer Access**: Own order invoices
- **Staff Access**: All file operations except deletion
- **Admin Access**: Full access including deletion

### File Validation

- **Type Validation**: Only allowed file types per bucket
- **Size Limits**: Enforced per file type
- **Malware Protection**: Built into Supabase
- **Signed URLs**: Temporary access for private files

### Error Handling

```javascript
// Comprehensive error responses
{
  "success": false,
  "error": "Upload failed",
  "message": "File size exceeds 5MB limit"
}
```

## 📊 Database Schema Updates

Add these tables to your services:

### Product Service
```sql
-- Add storage_path column to existing product_images table
ALTER TABLE product_images ADD COLUMN storage_path VARCHAR(500);
```

### Order Service
```sql
-- Create order_invoices table
CREATE TABLE order_invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(order_id),
  invoice_number VARCHAR(50) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_url TEXT,
  file_size INTEGER,
  generated_by UUID REFERENCES users(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Reporting Service
```sql
-- Create generated_reports table
CREATE TABLE generated_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  format VARCHAR(20) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  filters JSONB,
  generated_by UUID REFERENCES users(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🧪 Testing

### Test File Upload
```bash
curl -X POST \
  http://localhost:5001/api/v1/files/products/123e4567-e89b-12d3-a456-426614174000/images \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@test-image.jpg" \
  -F "alt_text=Test image"
```

### Test Invoice Generation
```bash
curl -X POST \
  http://localhost:5002/api/v1/invoices/orders/123e4567-e89b-12d3-a456-426614174000/invoice \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

## 🔧 Troubleshooting

### Common Issues

1. **Connection Failed**
   - Verify Supabase URL and service key
   - Check internet connection
   - Ensure project is active

2. **Upload Failed**
   - Check file size limits
   - Verify file type is allowed
   - Ensure bucket exists

3. **Access Denied**
   - Verify JWT token is valid
   - Check user role permissions
   - Ensure bucket permissions are correct

### Debug Mode

Enable debug logging:
```javascript
process.env.DEBUG = 'supabase:*';
```

## 📈 Performance Optimization

### Caching Strategy
- Use CDN for public images
- Implement signed URL caching
- Cache file metadata in Redis

### File Optimization
- Compress images before upload
- Use WebP format for better compression
- Implement progressive JPEG loading

## 🎉 Ready to Deploy!

Your Supabase file storage integration is now complete and production-ready. All services can now:

- ✅ Upload files securely to Supabase
- ✅ Generate and store PDF invoices
- ✅ Create Excel/PDF reports
- ✅ Manage file access with role-based permissions
- ✅ Handle file downloads and signed URLs
- ✅ Validate file types and sizes
- ✅ Track file operations in the database

The system is fully integrated with your existing authentication and authorization flow, ensuring secure and scalable file operations across your dental store platform.
