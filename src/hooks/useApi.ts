/**
 * React Hooks for API Integration
 * Provides easy-to-use hooks for backend services
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  authService, 
  productService, 
  orderService, 
  paymentService, 
  shipmentService, 
  reportingService,
  healthCheck 
} from '@/lib/api';
import { toast } from 'sonner';

// Auth Hooks
export const useAuth = () => {
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: authService.login,
    onSuccess: (data: any) => {
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      toast.success('Login successful!');
    },
    onError: (error: Error) => {
      toast.error(`Login failed: ${error.message}`);
    },
  });

  const registerMutation = useMutation({
    mutationFn: authService.register,
    onSuccess: () => {
      toast.success('Registration successful! Please login.');
    },
    onError: (error: Error) => {
      toast.error(`Registration failed: ${error.message}`);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      queryClient.clear();
      toast.success('Logged out successfully');
    },
  });

  const profileQuery = useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: authService.getProfile,
    enabled: !!localStorage.getItem('auth_token'),
  });

  return {
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout: logoutMutation.mutate,
    profile: profileQuery.data,
    isLoading: loginMutation.isPending || registerMutation.isPending || profileQuery.isLoading,
    isAuthenticated: !!localStorage.getItem('auth_token'),
  };
};

// Product Hooks
export const useProducts = (params?: any) => {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => productService.getProducts(params),
  });
};

export const useProduct = (id: string) => {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => productService.getProduct(id),
    enabled: !!id,
  });
};

export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: productService.getCategories,
  });
};

export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: productService.createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product created successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create product: ${error.message}`);
    },
  });
};

// Order Hooks
export const useOrders = (params?: any) => {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => orderService.getOrders(params),
  });
};

export const useOrder = (id: string) => {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => orderService.getOrder(id),
    enabled: !!id,
  });
};

export const useCart = () => {
  return useQuery({
    queryKey: ['cart'],
    queryFn: orderService.getCart,
  });
};

export const useAddToCart = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: orderService.addToCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Added to cart!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add to cart: ${error.message}`);
    },
  });
};

export const useUpdateCartItem = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: { quantity: number } }) =>
      orderService.updateCartItem(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update cart: ${error.message}`);
    },
  });
};

export const useRemoveFromCart = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: orderService.removeFromCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Removed from cart');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove from cart: ${error.message}`);
    },
  });
};

export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: orderService.createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Order created successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create order: ${error.message}`);
    },
  });
};

// Payment Hooks
export const usePaymentMethods = () => {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: paymentService.getPaymentMethods,
  });
};

export const useCreatePayment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: paymentService.createPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Payment initiated successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Payment failed: ${error.message}`);
    },
  });
};

// Shipment Hooks
export const useShipments = (params?: any) => {
  return useQuery({
    queryKey: ['shipments', params],
    queryFn: () => shipmentService.getShipments(params),
  });
};

export const useTrackShipment = (trackingNumber: string) => {
  return useQuery({
    queryKey: ['shipments', 'track', trackingNumber],
    queryFn: () => shipmentService.trackShipment(trackingNumber),
    enabled: !!trackingNumber,
  });
};

export const useShippingMethods = () => {
  return useQuery({
    queryKey: ['shipping-methods'],
    queryFn: shipmentService.getShippingMethods,
  });
};

// Reporting Hooks
export const useDashboardStats = () => {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: reportingService.getDashboardStats,
  });
};

export const useSalesReport = (params: any) => {
  return useQuery({
    queryKey: ['reports', 'sales', params],
    queryFn: () => reportingService.getSalesReport(params),
  });
};

// Health Check Hook
export const useHealthCheck = () => {
  return useQuery({
    queryKey: ['health-check'],
    queryFn: healthCheck.checkAllServices,
    refetchInterval: 30000, // Check every 30 seconds
  });
};

// Service Status Hook
export const useServiceStatus = () => {
  const { data: healthData, isLoading } = useHealthCheck();
  
  const getServiceStatus = (serviceName: string) => {
    const service = healthData?.find(s => s.name === serviceName);
    return service?.status || 'unknown';
  };

  const allServicesHealthy = healthData?.every(s => s.status === 'healthy') || false;

  return {
    healthData,
    isLoading,
    getServiceStatus,
    allServicesHealthy,
  };
};
