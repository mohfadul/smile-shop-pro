import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import AdminLayout from './admin/components/AdminLayout';
import Dashboard from './admin/Dashboard';

const Admin = () => {
  const { user, isAuthenticated, isLoading } = useAuth();

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user has admin privileges
  const userRole = user?.user_metadata?.role || 'customer';
  if (userRole !== 'admin' && userRole !== 'manager') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don't have permission to access the admin panel.</p>
          <p className="text-sm text-gray-500">Your role: {userRole}</p>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <Dashboard />
    </AdminLayout>
  );
};

export default Admin;
