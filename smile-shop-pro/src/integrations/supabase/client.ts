// This file now acts as a bridge to the auth-service instead of Supabase
// import { supabase } from "@/integrations/supabase/client";

const AUTH_SERVICE_URL = import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:5000';

// Auth service client functions
export const authService = {
  async register(userData: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    role?: string;
  }) {
    const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    return response.json();
  },

  async login(credentials: {
    email: string;
    password: string;
  }) {
    const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies in request
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    return response.json();
  },

  async logout() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Clear local storage regardless of response
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');

    if (!response.ok) {
      console.warn('Logout request failed, but cleared local storage');
    }
  },

  async getProfile() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        throw new Error('Authentication expired');
      }
      const error = await response.json();
      throw new Error(error.message || 'Failed to get profile');
    }

    return response.json();
  },

  async updateProfile(updates: any) {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update profile');
    }

    return response.json();
  },

  getToken() {
    // Token is now in HttpOnly cookie, not accessible via JS
    return null;
  },

  setToken(token: string) {
    // Token is automatically set as HttpOnly cookie by the server
    // Store only non-sensitive user data in sessionStorage
  },

  setUserData(userData: any) {
    // Use sessionStorage instead of localStorage for better security
    sessionStorage.setItem('user_data', JSON.stringify(userData));
  },

  getUserData() {
    const data = sessionStorage.getItem('user_data');
    return data ? JSON.parse(data) : null;
  },

  clearAuthData() {
    // Clear session storage - HttpOnly cookie will be cleared by server
    sessionStorage.removeItem('user_data');
  },

  isAuthenticated() {
    return !!localStorage.getItem('auth_token');
  },
};

// Export for backward compatibility (some components might still reference supabase)
export const supabase = {
  auth: {
    signUp: authService.register,
    signInWithPassword: authService.login,
    signOut: authService.logout,
    getUser: authService.getProfile,
    updateUser: authService.updateProfile,
    getSession: async () => {
      const token = authService.getToken();
      const userData = authService.getUserData();

      if (token && userData) {
        return {
          data: {
            session: {
              access_token: token,
              user: userData,
            },
          },
        };
      }

      return { data: { session: null } };
    },
    onAuthStateChange: (callback: any) => {
      // Simple implementation - in production you'd want proper auth state management
      const checkAuth = () => {
        const isAuth = authService.isAuthenticated();
        const userData = authService.getUserData();

        if (isAuth && userData) {
          callback('SIGNED_IN', { user: userData });
        } else {
          callback('SIGNED_OUT', null);
        }
      };

      // Check immediately
      checkAuth();

      // Return unsubscribe function
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: { message: 'Database queries not supported' } }),
      }),
    }),
  }),
};