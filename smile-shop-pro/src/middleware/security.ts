// Security middleware for rate limiting and input validation

// Rate limiting store (in production, use Redis or similar)
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limiting configuration
const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 requests per 15 minutes for auth
  general: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 requests per minute for general endpoints
  products: { windowMs: 60 * 1000, maxRequests: 200 }, // 200 requests per minute for products
};

// Clean up expired rate limit entries
const cleanupRateLimits = () => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
};

// Run cleanup every minute
setInterval(cleanupRateLimits, 60 * 1000);

export const createRateLimiter = (type: keyof typeof RATE_LIMITS = 'general') => {
  return (req: Request, ip?: string): { success: boolean; resetTime?: number } => {
    const identifier = ip || req.headers.get('x-forwarded-for') || 'anonymous';
    const limit = RATE_LIMITS[type];
    const now = Date.now();
    const key = `${type}:${identifier}`;

    const existing = rateLimitStore.get(key);

    if (!existing || now > existing.resetTime) {
      // First request or window expired
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + limit.windowMs,
      });
      return { success: true };
    }

    if (existing.count >= limit.maxRequests) {
      // Rate limit exceeded
      return {
        success: false,
        resetTime: existing.resetTime,
      };
    }

    // Increment counter
    existing.count++;
    rateLimitStore.set(key, existing);

    return { success: true };
  };
};

// Input validation schemas
export const VALIDATION_SCHEMAS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
  phone: /^\+?[\d\s\-()]+$/,
  name: /^[a-zA-Z\s]{2,50}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
};

// Input sanitization functions
export const sanitizeInput = {
  string: (value: string, maxLength = 255): string => {
    if (typeof value !== 'string') {
      throw new Error('Expected string input');
    }
    return value.trim().substring(0, maxLength);
  },

  email: (value: string): string => {
    const sanitized = sanitizeInput.string(value, 255).toLowerCase();
    if (!VALIDATION_SCHEMAS.email.test(sanitized)) {
      throw new Error('Invalid email format');
    }
    return sanitized;
  },

  password: (value: string): string => {
    const sanitized = sanitizeInput.string(value, 128);
    if (!VALIDATION_SCHEMAS.password.test(sanitized)) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, and number');
    }
    return sanitized;
  },

  name: (value: string): string => {
    const sanitized = sanitizeInput.string(value, 100);
    if (!VALIDATION_SCHEMAS.name.test(sanitized)) {
      throw new Error('Name must be 2-50 characters and contain only letters and spaces');
    }
    return sanitized;
  },

  phone: (value: string): string => {
    const sanitized = sanitizeInput.string(value, 20).replace(/[\s\-()]/g, '');
    if (!VALIDATION_SCHEMAS.phone.test(sanitized)) {
      throw new Error('Invalid phone number format');
    }
    return sanitized;
  },

  uuid: (value: string): string => {
    const sanitized = sanitizeInput.string(value, 36);
    if (!VALIDATION_SCHEMAS.uuid.test(sanitized)) {
      throw new Error('Invalid UUID format');
    }
    return sanitized;
  },

  number: (value: string | number, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num) || num < min || num > max) {
      throw new Error(`Number must be between ${min} and ${max}`);
    }
    return num;
  },

  boolean: (value: string | boolean): boolean => {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error('Boolean value must be true or false');
  },
};

// XSS prevention
export const sanitizeHTML = (input: string): string => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// SQL injection prevention (basic)
export const sanitizeSQL = (input: string): string => {
  return input.replace(/[';\\]/g, '');
};

// Security headers middleware (for when we have a backend)
export const getSecurityHeaders = () => ({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});

// Request validation middleware
export const validateRequest = (schema: Record<string, (value: unknown) => unknown>) => {
  return (data: Record<string, unknown>): { success: boolean; errors?: string[]; sanitized?: Record<string, unknown> } => {
    const errors: string[] = [];
    const sanitized: Record<string, unknown> = {};

    for (const [field, validator] of Object.entries(schema)) {
      try {
        if (data[field] !== undefined) {
          sanitized[field] = validator(data[field]);
        } else if (validator.required) {
          errors.push(`${field} is required`);
        }
      } catch (error) {
        errors.push(`${field}: ${error instanceof Error ? error.message : 'Invalid value'}`);
      }
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      sanitized: errors.length === 0 ? sanitized : undefined,
    };
  };
};

// Common validation schemas
export const AUTH_VALIDATION = {
  email: (value: string) => sanitizeInput.email(value),
  password: (value: string) => sanitizeInput.password(value),
};

export const PROFILE_VALIDATION = {
  full_name: (value: string) => sanitizeInput.name(value),
  email: (value: string) => sanitizeInput.email(value),
  phone: (value: string) => sanitizeInput.phone(value),
  company: (value: string) => sanitizeInput.string(value, 100),
  address: (value: string) => sanitizeHTML(sanitizeInput.string(value, 500)),
};

export const PRODUCT_VALIDATION = {
  name: (value: string) => sanitizeHTML(sanitizeInput.string(value, 255)),
  description: (value: string) => sanitizeHTML(sanitizeInput.string(value, 2000)),
  price: (value: string | number) => sanitizeInput.number(value, 0, 999999.99),
  stock_quantity: (value: string | number) => sanitizeInput.number(value, 0, 999999),
  category_id: (value: string) => sanitizeInput.uuid(value),
  image_url: (value: string) => sanitizeInput.string(value, 500),
};
