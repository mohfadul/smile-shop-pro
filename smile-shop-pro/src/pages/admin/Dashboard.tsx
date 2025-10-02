import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  ShoppingCart,
  CreditCard,
  Truck,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Activity,
  RefreshCw
} from 'lucide-react';
import { useProducts } from '@/hooks/use-products';
import { useOrders } from '@/hooks/use-orders';
import { useAuth } from '@/hooks/use-auth';

const StatCard = ({ title, value, icon: Icon, trend, color = "blue", isLoading = false }: {
  title: string;
  value: string | number;
  icon: any;
  trend?: string;
  color?: string;
  isLoading?: boolean;
}) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {isLoading ? (
            <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mt-1" />
          ) : (
            <>
              <p className="text-2xl font-bold">{value}</p>
              {trend && (
                <p className="text-xs text-muted-foreground mt-1">
                  <span className={trend.startsWith('+') ? 'text-green-600' : 'text-red-600'}>
                    {trend}
                  </span>
                  {' from last month'}
                </p>
              )}
            </>
          )}
        </div>
        <div className={`p-3 rounded-full bg-${color}-100`}>
          <Icon className={`h-6 w-6 text-${color}-600`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { user } = useAuth();

  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
    lowStockProducts: 0,
    featuredProducts: 0,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshData = async () => {
    setIsRefreshing(true);
    // Data will automatically refresh due to React Query
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  useEffect(() => {
    if (products && orders) {
      const totalProducts = products.length;
      const totalOrders = orders.length;
      const totalRevenue = orders
        .filter(order => order.payment_status === 'paid')
        .reduce((sum, order) => sum + order.total_amount, 0);
      const pendingOrders = orders.filter(order => order.status === 'pending').length;
      const lowStockProducts = products.filter(product =>
        product.stock_quantity > 0 && product.stock_quantity <= product.low_stock_threshold
      ).length;
      const featuredProducts = products.filter(product => product.is_featured).length;

      setStats({
        totalProducts,
        totalOrders,
        totalRevenue,
        pendingOrders,
        lowStockProducts,
        featuredProducts,
      });
    }
  }, [products, orders]);

  const recentOrders = orders?.slice(0, 5) || [];
  const lowStockItems = products?.filter(product =>
    product.stock_quantity > 0 && product.stock_quantity <= product.low_stock_threshold
  ).slice(0, 5) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back, {user?.user_metadata?.full_name || 'Admin'}! Here's your store overview.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={refreshData}
          disabled={isRefreshing}
          className="flex items-center"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Products"
          value={stats.totalProducts}
          icon={Package}
          trend="+2.5%"
          color="blue"
          isLoading={productsLoading}
        />
        <StatCard
          title="Total Orders"
          value={stats.totalOrders}
          icon={ShoppingCart}
          trend="+12.3%"
          color="green"
          isLoading={ordersLoading}
        />
        <StatCard
          title="Revenue"
          value={`$${stats.totalRevenue.toFixed(2)}`}
          icon={DollarSign}
          trend="+8.7%"
          color="emerald"
          isLoading={ordersLoading}
        />
        <StatCard
          title="Pending Orders"
          value={stats.pendingOrders}
          icon={Clock}
          color="orange"
          isLoading={ordersLoading}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Featured Products"
          value={stats.featuredProducts}
          icon={TrendingUp}
          color="purple"
          isLoading={productsLoading}
        />
        <StatCard
          title="Low Stock Items"
          value={stats.lowStockProducts}
          icon={AlertTriangle}
          color="red"
          isLoading={productsLoading}
        />
        <StatCard
          title="Active Orders"
          value={orders?.filter(o => o.status !== 'cancelled').length || 0}
          icon={Activity}
          color="indigo"
          isLoading={ordersLoading}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <ShoppingCart className="mr-2 h-5 w-5" />
              Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded animate-pulse mb-1" />
                      <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentOrders.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No recent orders</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div key={order.order_id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <div>
                        <p className="text-sm font-medium">{order.order_number}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">${order.total_amount.toFixed(2)}</p>
                      <Badge variant={order.status === 'pending' ? 'secondary' : 'default'}>
                        {order.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-200 rounded animate-pulse" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded animate-pulse mb-1" />
                      <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : lowStockItems.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <span className="ml-2 text-green-600">All items in stock</span>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockItems.map((product) => (
                  <div key={product.product_id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="destructive">{product.stock_quantity} left</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
              <Package className="h-6 w-6 mb-2" />
              <span className="text-sm">Add Product</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
              <ShoppingCart className="h-6 w-6 mb-2" />
              <span className="text-sm">Process Orders</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
              <CreditCard className="h-6 w-6 mb-2" />
              <span className="text-sm">View Payments</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
              <Truck className="h-6 w-6 mb-2" />
              <span className="text-sm">Track Shipments</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
