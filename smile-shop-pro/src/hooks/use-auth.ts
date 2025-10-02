import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { User, Session } from '@supabase/supabase-js';

export type Profile = Tables<'profiles'>;

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Error getting initial session:', error);
          setError(error.message);
        } else if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setError(null);
        }
      } catch (err) {
        console.error('Unexpected error getting session:', err);
        if (isMounted) {
          setError('Failed to initialize authentication');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        try {
          setSession(session);
          setUser(session?.user ?? null);
          setError(null);

          // Handle specific auth events
          if (event === 'SIGNED_OUT') {
            // Clear any cached data
            localStorage.removeItem('supabase.auth.token');
          }
        } catch (err) {
          console.error('Error handling auth state change:', err);
          setError('Authentication state change failed');
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useMutation({
    mutationFn: async () => {
      try {
        const { error } = await supabase.auth.signOut();

        if (error) {
          console.error('Sign out error:', error);

          // Handle specific sign out errors
          if (error.message.includes('Invalid session')) {
            throw new Error('Your session has expired. Please sign in again.');
          }

          throw new Error(`Sign out failed: ${error.message}`);
        }

        return true;
      } catch (error) {
        console.error('Unexpected error during sign out:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while signing out');
      }
    },
    onError: (error) => {
      console.error('Sign out mutation error:', error);
      setError(error instanceof Error ? error.message : 'Sign out failed');
    },
  });

  return {
    user,
    session,
    loading,
    error,
    signOut: signOut.mutate,
    isLoading: signOut.isPending,
    isAuthenticated: !!user && !!session,
  };
};

export const useProfile = (userId?: string) => {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId || typeof userId !== 'string') {
        throw new Error('Valid user ID is required');
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('Supabase error in useProfile:', error);

          if (error.code === 'PGRST116') {
            throw new Error(`Profile not found for user ${userId}`);
          }

          if (error.code === 'PGRST301') {
            throw new Error('Database connection failed. Please check your configuration.');
          }

          throw new Error(`Failed to fetch profile: ${error.message}`);
        }

        if (!data) {
          throw new Error(`Profile not found for user ${userId}`);
        }

        // Validate profile data
        if (!data.id || !data.email) {
          throw new Error('Profile data is incomplete');
        }

        return data as Profile;
      } catch (error) {
        console.error('Error in useProfile:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while fetching the profile');
      }
    },
    enabled: !!userId && userId.trim().length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
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
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Profile> }) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Valid user ID is required');
      }

      if (!updates || typeof updates !== 'object') {
        throw new Error('Valid profile updates are required');
      }

      try {
        // Sanitize and validate updates
        const sanitizedUpdates = { ...updates };

        // Ensure email is valid if provided
        if (sanitizedUpdates.email && !sanitizedUpdates.email.includes('@')) {
          throw new Error('Invalid email format');
        }

        // Ensure full_name is a string if provided
        if (sanitizedUpdates.full_name && typeof sanitizedUpdates.full_name !== 'string') {
          throw new Error('Full name must be a string');
        }

        // Ensure phone is a string if provided
        if (sanitizedUpdates.phone && typeof sanitizedUpdates.phone !== 'string') {
          throw new Error('Phone must be a string');
        }

        const { data, error } = await supabase
          .from('profiles')
          .update(sanitizedUpdates)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          console.error('Supabase error in useUpdateProfile:', error);

          if (error.code === 'PGRST116') {
            throw new Error(`Profile not found for user ${id}`);
          }

          if (error.code === 'PGRST301') {
            throw new Error('Database connection failed. Please check your configuration.');
          }

          throw new Error(`Failed to update profile: ${error.message}`);
        }

        if (!data) {
          throw new Error(`Profile update failed for user ${id}`);
        }

        return data as Profile;
      } catch (error) {
        console.error('Error in useUpdateProfile:', error);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('An unexpected error occurred while updating the profile');
      }
    },
    onSuccess: (data) => {
      // Invalidate and refetch the profile query
      queryClient.invalidateQueries({ queryKey: ['profile', data.id] });

      // Also invalidate any other queries that might be affected
      queryClient.invalidateQueries({ queryKey: ['user', data.id] });
    },
    onError: (error) => {
      console.error('Profile update mutation error:', error);
    },
  });
};
