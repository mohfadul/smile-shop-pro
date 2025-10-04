import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const PAYMENT_SERVICE_URL = import.meta.env.VITE_PAYMENT_SERVICE_URL || 'http://localhost:5003';

export type PaymentIntent = {
  client_secret: string;
  payment_intent_id: string;
  amount: number;
  currency: string;
};

export type PaymentTransaction = {
  transaction_id: string;
  order_id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';
  payment_method: 'credit_card' | 'debit_card' | 'bank_transfer' | 'paypal' | 'stripe' | 'cash_on_delivery';
  payment_provider: string;
  provider_transaction_id?: string;
  provider_payment_method_id?: string;
  gateway_response?: any;
  failure_reason?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
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

export const useCreatePaymentIntent = () => {
  return useMutation({
    mutationFn: async (orderData: {
      order_id: string;
      amount: number;
      currency?: string;
      metadata?: any;
    }) => {
      try {
        const response = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/create-intent`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(orderData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create payment intent');
        }

        const data = await response.json();
        return data as {
          payment_intent: PaymentIntent;
          fees: any;
          transaction_id: string;
        };
      } catch (error) {
        console.error('Error creating payment intent:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while creating payment intent');
      }
    },
  });
};

export const useConfirmPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentData: {
      payment_intent_id: string;
      order_id: string;
    }) => {
      try {
        const response = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/confirm`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(paymentData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to confirm payment');
        }

        const data = await response.json();
        return data as {
          payment: any;
          message: string;
        };
      } catch (error) {
        console.error('Error confirming payment:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while confirming payment');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
};

export const usePaymentTransaction = (transactionId: string) => {
  return useQuery({
    queryKey: ['payment', transactionId],
    queryFn: async () => {
      if (!transactionId || typeof transactionId !== 'string') {
        throw new Error('Valid transaction ID is required');
      }

      try {
        const response = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/${transactionId}`, {
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Payment transaction with ID ${transactionId} not found`);
          }

          if (response.status === 401) {
            throw new Error('Authentication required to view payment details.');
          }

          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to fetch payment: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.transaction) {
          throw new Error(`Payment transaction with ID ${transactionId} not found`);
        }

        return data.transaction as PaymentTransaction;
      } catch (error) {
        console.error('Error in usePaymentTransaction:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while fetching the payment transaction');
      }
    },
    enabled: !!transactionId && transactionId.trim().length > 0,
    retry: (failureCount, error) => {
      if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: string }).message;
        if (message && message.includes('not found')) {
          return false;
        }
      }

      return failureCount < 2;
    },
    staleTime: 30 * 1000,
  });
};

export const useUserPayments = () => {
  return useQuery({
    queryKey: ['user-payments'],
    queryFn: async () => {
      try {
        const response = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/user/history`, {
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Payment history endpoint not found. Please check if the payment-service is running.');
          }

          if (response.status === 401) {
            throw new Error('Authentication required to view payment history.');
          }

          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to fetch payment history: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.payments || !Array.isArray(data.payments)) {
          throw new Error('Invalid response format: expected payments array');
        }

        return data.payments as PaymentTransaction[];
      } catch (error) {
        console.error('Error in useUserPayments:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while fetching payment history');
      }
    },
    retry: (failureCount, error) => {
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500) {
          return false;
        }
      }

      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 2 * 60 * 1000,
  });
};

export const useCalculatePaymentFees = () => {
  return useMutation({
    mutationFn: async (amountData: {
      amount: number;
      currency?: string;
    }) => {
      try {
        const response = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/calculate-fees`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(amountData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to calculate payment fees');
        }

        const data = await response.json();
        return data.fees;
      } catch (error) {
        console.error('Error calculating payment fees:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while calculating payment fees');
      }
    },
  });
};