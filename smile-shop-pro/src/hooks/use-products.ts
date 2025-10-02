import { useQuery } from '@tanstack/react-query';

export type Product = {
  product_id: string;
  name: string;
  description?: string | null;
  short_description?: string | null;
  sku: string;
  barcode?: string | null;
  price: number;
  cost_price?: number | null;
  compare_at_price?: number | null;
  category_id?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  weight?: number | null;
  dimensions?: string | null;
  status: 'active' | 'inactive' | 'discontinued' | 'out_of_stock';
  is_featured: boolean;
  is_digital: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  track_inventory: boolean;
  allow_backorders: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string[] | null;
  images?: any[] | null;
  specifications?: any | null;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
  categories?: {
    category_id: string;
    name: string;
    description?: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  } | null;
};

const PRODUCT_SERVICE_URL = import.meta.env.VITE_PRODUCT_SERVICE_URL || 'http://localhost:5001';

export const useProducts = () => {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      try {
        const response = await fetch(`${PRODUCT_SERVICE_URL}/api/products`);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Products endpoint not found. Please check if the product-service is running.');
          }

          if (response.status >= 500) {
            throw new Error('Product service is temporarily unavailable. Please try again later.');
          }

          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to fetch products: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate response structure
        if (!data.products || !Array.isArray(data.products)) {
          throw new Error('Invalid response format: expected products array');
        }

        // Sanitize and validate each product
        const validatedProducts = data.products.map((product: any, index: number) => {
          if (!product || typeof product !== 'object') {
            throw new Error(`Invalid product data at index ${index}`);
          }

          if (!product.product_id || !product.name || !product.sku) {
            throw new Error(`Product missing required fields at index ${index}`);
          }

          return {
            ...product,
            // Ensure numeric fields are numbers
            price: typeof product.price === 'number' ? product.price : 0,
            cost_price: typeof product.cost_price === 'number' ? product.cost_price : null,
            compare_at_price: typeof product.compare_at_price === 'number' ? product.compare_at_price : null,
            stock_quantity: typeof product.stock_quantity === 'number' ? product.stock_quantity : 0,
            low_stock_threshold: typeof product.low_stock_threshold === 'number' ? product.low_stock_threshold : 5,
            // Ensure boolean fields
            is_featured: Boolean(product.is_featured),
            is_digital: Boolean(product.is_digital),
            track_inventory: Boolean(product.track_inventory),
            allow_backorders: Boolean(product.allow_backorders),
            // Ensure status is valid
            status: ['active', 'inactive', 'discontinued', 'out_of_stock'].includes(product.status)
              ? product.status
              : 'inactive',
          } as Product;
        });

        return validatedProducts;
      } catch (error) {
        console.error('Error in useProducts:', error);

        // Re-throw with more context for React Query error handling
        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while fetching products');
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
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useProduct = (id: string) => {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      if (!id || typeof id !== 'string') {
        throw new Error('Valid product ID is required');
      }

      try {
        const response = await fetch(`${PRODUCT_SERVICE_URL}/api/products/${id}`);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Product with ID ${id} not found`);
          }

          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to fetch product: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.product) {
          throw new Error(`Product with ID ${id} not found`);
        }

        const product = data.product;

        // Validate and sanitize product data
        if (!product.product_id || !product.name || !product.sku) {
          throw new Error('Product data is incomplete');
        }

        return {
          ...product,
          // Ensure numeric fields are numbers
          price: typeof product.price === 'number' ? product.price : 0,
          cost_price: typeof product.cost_price === 'number' ? product.cost_price : null,
          compare_at_price: typeof product.compare_at_price === 'number' ? product.compare_at_price : null,
          stock_quantity: typeof product.stock_quantity === 'number' ? product.stock_quantity : 0,
          low_stock_threshold: typeof product.low_stock_threshold === 'number' ? product.low_stock_threshold : 5,
          // Ensure boolean fields
          is_featured: Boolean(product.is_featured),
          is_digital: Boolean(product.is_digital),
          track_inventory: Boolean(product.track_inventory),
          allow_backorders: Boolean(product.allow_backorders),
          // Ensure status is valid
          status: ['active', 'inactive', 'discontinued', 'out_of_stock'].includes(product.status)
            ? product.status
            : 'inactive',
        } as Product;
      } catch (error) {
        console.error('Error in useProduct:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while fetching the product');
      }
    },
    enabled: !!id && id.trim().length > 0,
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
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const response = await fetch(`${PRODUCT_SERVICE_URL}/api/categories`);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Categories endpoint not found. Please check if the product-service is running.');
          }

          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to fetch categories: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.categories || !Array.isArray(data.categories)) {
          throw new Error('Invalid response format: expected categories array');
        }

        // Validate category data
        const validatedCategories = data.categories.map((category: any, index: number) => {
          if (!category || typeof category !== 'object') {
            throw new Error(`Invalid category data at index ${index}`);
          }

          if (!category.category_id || !category.name) {
            throw new Error(`Category missing required fields at index ${index}`);
          }

          return {
            category_id: category.category_id,
            name: category.name,
            description: category.description,
            parent_category_id: category.parent_category_id,
            is_active: Boolean(category.is_active),
            sort_order: typeof category.sort_order === 'number' ? category.sort_order : 0,
            created_at: category.created_at,
            updated_at: category.updated_at,
            subcategories: category.subcategories || [],
            product_count: typeof category.product_count === 'number' ? category.product_count : 0,
          };
        });

        return validatedCategories;
      } catch (error) {
        console.error('Error in useCategories:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while fetching categories');
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (categories don't change often)
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useProductsByCategory = (categoryId: string) => {
  return useQuery({
    queryKey: ['products', 'category', categoryId],
    queryFn: async () => {
      if (!categoryId || typeof categoryId !== 'string') {
        throw new Error('Valid category ID is required');
      }

      try {
        const response = await fetch(`${PRODUCT_SERVICE_URL}/api/products/category/${categoryId}`);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`No products found in category ${categoryId}`);
          }

          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to fetch products by category: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.products || !Array.isArray(data.products)) {
          throw new Error('Invalid response format: expected products array');
        }

        // Validate and sanitize products
        const validatedProducts = data.products.map((product: any, index: number) => {
          if (!product || typeof product !== 'object') {
            throw new Error(`Invalid product data at index ${index}`);
          }

          if (!product.product_id || !product.name || !product.sku) {
            throw new Error(`Product missing required fields at index ${index}`);
          }

          return {
            ...product,
            // Ensure numeric fields are numbers
            price: typeof product.price === 'number' ? product.price : 0,
            cost_price: typeof product.cost_price === 'number' ? product.cost_price : null,
            compare_at_price: typeof product.compare_at_price === 'number' ? product.compare_at_price : null,
            stock_quantity: typeof product.stock_quantity === 'number' ? product.stock_quantity : 0,
            low_stock_threshold: typeof product.low_stock_threshold === 'number' ? product.low_stock_threshold : 5,
            // Ensure boolean fields
            is_featured: Boolean(product.is_featured),
            is_digital: Boolean(product.is_digital),
            track_inventory: Boolean(product.track_inventory),
            allow_backorders: Boolean(product.allow_backorders),
            // Ensure status is valid
            status: ['active', 'inactive', 'discontinued', 'out_of_stock'].includes(product.status)
              ? product.status
              : 'inactive',
          } as Product;
        });

        return validatedProducts;
      } catch (error) {
        console.error('Error in useProductsByCategory:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while fetching products by category');
      }
    },
    enabled: !!categoryId && categoryId.trim().length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
