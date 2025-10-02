import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const ORDER_SERVICE_URL = import.meta.env.VITE_ORDER_SERVICE_URL || 'http://localhost:5002';
const AUTH_SERVICE_URL = import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:5000';

export type Order = {
  order_id: string;
  user_id: string;
  order_number: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  subtotal: number;
  tax_amount: number;
  shipping_amount: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  shipping_address: any;
  billing_address?: any;
  shipping_method: 'standard' | 'express' | 'overnight' | 'pickup';
  estimated_delivery_date?: string;
  actual_delivery_date?: string;
  tracking_number?: string;
  notes?: string;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  payment_reference?: string;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  order_item_id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  discount_amount: number;
  tax_amount: number;
  specifications?: any;
  created_at: string;
};

export type OrderWithItems = Order & {
  items: OrderItem[];
};

const getAuthToken = () => {
  return localStorage.getItem('auth_token');
};

const getAuthHeaders = () => {
  const token = getAuthToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

export const useOrders = (userId?: string) => {
  return useQuery({
    queryKey: ['orders', userId],
    queryFn: async () => {
      try {
        const headers = getAuthHeaders();
        const url = userId
          ? `${ORDER_SERVICE_URL}/api/orders?user_id=${userId}`
          : `${ORDER_SERVICE_URL}/api/orders`;

        const response = await fetch(url, { headers });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Orders endpoint not found. Please check if the order-service is running.');
          }

          if (response.status === 401) {
            throw new Error('Authentication required to view orders.');
          }

          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to fetch orders: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate response structure
        if (!data.orders || !Array.isArray(data.orders)) {
          throw new Error('Invalid response format: expected orders array');
        }

        return data.orders as Order[];
      } catch (error) {
        console.error('Error in useOrders:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while fetching orders');
      }
    },
    retry: (failureCount, error) => {
      // Don't retry on client errors (4xx)
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500) {
          return false;
        }
      }

      // Retry up to 3 times for server errors
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useOrder = (orderId: string) => {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      if (!orderId || typeof orderId !== 'string') {
        throw new Error('Valid order ID is required');
      }

      try {
        const response = await fetch(`${ORDER_SERVICE_URL}/api/orders/${orderId}`, {
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Order with ID ${orderId} not found`);
          }

          if (response.status === 401) {
            throw new Error('Authentication required to view order details.');
          }

          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to fetch order: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.order) {
          throw new Error(`Order with ID ${orderId} not found`);
        }

        return data.order as OrderWithItems;
      } catch (error) {
        console.error('Error in useOrder:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while fetching the order');
      }
    },
    enabled: !!orderId && orderId.trim().length > 0,
    retry: (failureCount, error) => {
      // Don't retry on 404 errors
      if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: string }).message;
        if (message && message.includes('not found')) {
          return false;
        }
      }

      return failureCount < 2;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

export const useCreateOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderData: {
      items: Array<{
        product_id: string;
        quantity: number;
        unit_price: number;
      }>;
      shipping_address: any;
      billing_address?: any;
      shipping_method?: string;
      notes?: string;
    }) => {
      try {
        const response = await fetch(`${ORDER_SERVICE_URL}/api/orders`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(orderData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create order');
        }

        const data = await response.json();
        return data.order as Order;
      } catch (error) {
        console.error('Error creating order:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while creating the order');
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', data.order_id] });
    },
  });
};

export const useCancelOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason?: string }) => {
      try {
        const response = await fetch(`${ORDER_SERVICE_URL}/api/orders/${orderId}/cancel`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ reason }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to cancel order');
        }

        const data = await response.json();
        return data.order as Order;
      } catch (error) {
        console.error('Error cancelling order:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while cancelling the order');
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', data.order_id] });
    },
  });
};
