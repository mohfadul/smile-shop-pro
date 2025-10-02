/**
 * API Integration Layer for Dental Store Sudan
 * Connects frontend to backend microservices
 */

// API Configuration - Use API Gateway for all requests
const getApiBaseUrl = () => {
  // Check if running on production domain
  if (typeof window !== 'undefined' && window.location.hostname === 'dqash.com') {
    return 'https://dqash.com/api';
  }
  // Development fallback
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
};

const API_CONFIG = {
  baseURL: getApiBaseUrl(),
  // All services now go through API Gateway
  authService: getApiBaseUrl(),
  productService: getApiBaseUrl(),
  orderService: getApiBaseUrl(),
  paymentService: getApiBaseUrl(),
  shipmentService: getApiBaseUrl(),
  notificationService: getApiBaseUrl(),
  reportingService: getApiBaseUrl(),
};

// HTTP Client with error handling
class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    // Get auth token from localStorage
    const token = localStorage.getItem('auth_token');
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Service Clients
export const authApi = new ApiClient(API_CONFIG.authService);
export const productApi = new ApiClient(API_CONFIG.productService);
export const orderApi = new ApiClient(API_CONFIG.orderService);
export const paymentApi = new ApiClient(API_CONFIG.paymentService);
export const shipmentApi = new ApiClient(API_CONFIG.shipmentService);
export const notificationApi = new ApiClient(API_CONFIG.notificationService);
export const reportingApi = new ApiClient(API_CONFIG.reportingService);

// API Gateway Client (for unified access)
export const apiGateway = new ApiClient(API_CONFIG.baseURL);

// Service-specific API methods
export const authService = {
  // Authentication
  login: (credentials: { email: string; password: string }) =>
    authApi.post('/api/auth/login', credentials),
  
  register: (userData: { name: string; email: string; password: string; role?: string }) =>
    authApi.post('/api/auth/register', userData),
  
  logout: () => authApi.post('/api/auth/logout'),
  
  refreshToken: () => authApi.post('/api/auth/refresh'),
  
  getProfile: () => authApi.get('/api/auth/profile'),
  
  updateProfile: (data: any) => authApi.put('/api/auth/profile', data),
};

export const productService = {
  // Products
  getProducts: (params?: any) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return productApi.get(`/api/products${query}`);
  },
  
  getProduct: (id: string) => productApi.get(`/api/products/${id}`),
  
  createProduct: (data: any) => productApi.post('/api/products', data),
  
  updateProduct: (id: string, data: any) => productApi.put(`/api/products/${id}`, data),
  
  deleteProduct: (id: string) => productApi.delete(`/api/products/${id}`),
  
  // Categories
  getCategories: () => productApi.get('/api/categories'),
  
  getCategory: (id: string) => productApi.get(`/api/categories/${id}`),
  
  // Inventory
  getInventory: (productId: string) => productApi.get(`/api/products/${productId}/inventory`),
  
  updateInventory: (productId: string, data: any) => 
    productApi.put(`/api/products/${productId}/inventory`, data),
};

export const orderService = {
  // Orders
  getOrders: (params?: any) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return orderApi.get(`/api/orders${query}`);
  },
  
  getOrder: (id: string) => orderApi.get(`/api/orders/${id}`),
  
  createOrder: (data: any) => orderApi.post('/api/orders', data),
  
  updateOrder: (id: string, data: any) => orderApi.put(`/api/orders/${id}`, data),
  
  cancelOrder: (id: string) => orderApi.post(`/api/orders/${id}/cancel`),
  
  // Cart
  getCart: () => orderApi.get('/api/cart'),
  
  addToCart: (data: { productId: string; quantity: number; variantId?: string }) =>
    orderApi.post('/api/cart/items', data),
  
  updateCartItem: (itemId: string, data: { quantity: number }) =>
    orderApi.put(`/api/cart/items/${itemId}`, data),
  
  removeFromCart: (itemId: string) => orderApi.delete(`/api/cart/items/${itemId}`),
  
  clearCart: () => orderApi.delete('/api/cart'),
};

export const paymentService = {
  // Payments
  getPaymentMethods: () => paymentApi.get('/api/payment-methods'),
  
  createPayment: (data: any) => paymentApi.post('/api/payments', data),
  
  getPayment: (id: string) => paymentApi.get(`/api/payments/${id}`),
  
  processPayment: (id: string, data: any) => paymentApi.post(`/api/payments/${id}/process`, data),
  
  refundPayment: (id: string, data: any) => paymentApi.post(`/api/payments/${id}/refund`, data),
};

export const shipmentService = {
  // Shipments
  getShipments: (params?: any) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return shipmentApi.get(`/api/shipments${query}`);
  },
  
  getShipment: (id: string) => shipmentApi.get(`/api/shipments/${id}`),
  
  trackShipment: (trackingNumber: string) => 
    shipmentApi.get(`/api/shipments/track/${trackingNumber}`),
  
  getShippingMethods: () => shipmentApi.get('/api/shipping-methods'),
  
  calculateShipping: (data: any) => shipmentApi.post('/api/shipping/calculate', data),
};

export const reportingService = {
  // Analytics
  getDashboardStats: () => reportingApi.get('/api/analytics/dashboard'),
  
  getSalesReport: (params: any) => {
    const query = new URLSearchParams(params);
    return reportingApi.get(`/api/reports/sales?${query}`);
  },
  
  getCustomerReport: (params: any) => {
    const query = new URLSearchParams(params);
    return reportingApi.get(`/api/reports/customers?${query}`);
  },
  
  getProductReport: (params: any) => {
    const query = new URLSearchParams(params);
    return reportingApi.get(`/api/reports/products?${query}`);
  },
};

// Health check for all services
export const healthCheck = {
  checkAllServices: async () => {
    const services = [
      { name: 'Auth Service', client: authApi },
      { name: 'Product Service', client: productApi },
      { name: 'Order Service', client: orderApi },
      { name: 'Payment Service', client: paymentApi },
      { name: 'Shipment Service', client: shipmentApi },
      { name: 'Notification Service', client: notificationApi },
      { name: 'Reporting Service', client: reportingApi },
    ];

    const results = await Promise.allSettled(
      services.map(async ({ name, client }) => {
        try {
          await client.get('/health');
          return { name, status: 'healthy' };
        } catch (error) {
          return { name, status: 'unhealthy', error: (error as Error).message };
        }
      })
    );

    return results.map((result, index) => ({
      ...services[index],
      ...(result.status === 'fulfilled' ? result.value : { status: 'error', error: result.reason }),
    }));
  },
};

// Export API configuration for debugging
export { API_CONFIG };
