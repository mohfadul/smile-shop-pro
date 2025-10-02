/**
 * Orders Page - Dental Store Sudan
 * Customer order history and tracking
 */

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useOrders, useOrder, useTrackShipment } from "@/hooks/useApi";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Package, 
  Truck, 
  CheckCircle, 
  Clock, 
  XCircle, 
  Search,
  Eye,
  Download,
  Loader2,
  AlertCircle,
  MapPin,
  Calendar,
  CreditCard
} from "lucide-react";
import { format } from "date-fns";

const Orders = () => {
  const { id } = useParams<{ id: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  const { data: ordersData, isLoading: ordersLoading, error: ordersError } = useOrders();
  const { data: orderData, isLoading: orderLoading } = useOrder(id!);
  const { data: trackingData, isLoading: trackingLoading } = useTrackShipment(trackingNumber);

  const orders = ordersData?.orders || [];
  const order = orderData?.order;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'delivered':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'cancelled':
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'processing':
      case 'shipped':
      case 'in_transit':
        return <Truck className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'delivered':
        return 'bg-green-500';
      case 'cancelled':
      case 'failed':
        return 'bg-red-500';
      case 'processing':
      case 'shipped':
      case 'in_transit':
        return 'bg-blue-500';
      default:
        return 'bg-yellow-500';
    }
  };

  const filteredOrders = orders.filter((order: any) =>
    order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.items?.some((item: any) => 
      item.productName?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // Single Order View
  if (id && order) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        
        <main className="flex-1">
          <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold">Order #{order.id}</h1>
                <p className="text-muted-foreground">
                  Placed on {format(new Date(order.createdAt), 'MMMM dd, yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(order.status)}
                <Badge className={getStatusColor(order.status)}>
                  {order.status.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Order Details */}
              <div className="lg:col-span-2 space-y-6">
                {/* Items */}
                <Card>
                  <CardHeader>
                    <CardTitle>Order Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {order.items?.map((item: any, index: number) => (
                        <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                          <img
                            src={item.productImage || 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=100'}
                            alt={item.productName}
                            className="w-16 h-16 object-cover rounded"
                          />
                          <div className="flex-1">
                            <h4 className="font-medium">{item.productName}</h4>
                            {item.variant && (
                              <p className="text-sm text-muted-foreground">
                                Variant: {item.variant.name}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground">
                              Quantity: {item.quantity}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">${item.price.toFixed(2)}</p>
                            <p className="text-sm text-muted-foreground">
                              Total: ${(item.price * item.quantity).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Shipping Address */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Shipping Address
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      <p className="font-medium">{order.shippingAddress?.fullName}</p>
                      <p>{order.shippingAddress?.address}</p>
                      <p>{order.shippingAddress?.city}, {order.shippingAddress?.state}</p>
                      <p>{order.shippingAddress?.country}</p>
                      <p className="text-sm text-muted-foreground">
                        Phone: {order.shippingAddress?.phone}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Tracking */}
                {order.trackingNumber && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        Shipment Tracking
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Tracking Number:</span>
                          <code className="bg-muted px-2 py-1 rounded text-sm">
                            {order.trackingNumber}
                          </code>
                        </div>
                        
                        {trackingData?.tracking && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Current Status:</span>
                              <Badge className={getStatusColor(trackingData.tracking.status)}>
                                {trackingData.tracking.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </div>
                            
                            <div className="space-y-2">
                              <p className="text-sm">
                                <span className="font-medium">Current Location:</span> {trackingData.tracking.currentLocation}
                              </p>
                              <p className="text-sm">
                                <span className="font-medium">Estimated Delivery:</span> {' '}
                                {format(new Date(trackingData.tracking.estimatedDelivery), 'MMMM dd, yyyy')}
                              </p>
                            </div>

                            <div className="space-y-2">
                              <h4 className="font-medium">Tracking History</h4>
                              {trackingData.tracking.history?.map((event: any, index: number) => (
                                <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                                  <div className="w-2 h-2 bg-dental-primary rounded-full mt-2"></div>
                                  <div className="flex-1">
                                    <p className="font-medium">{event.description}</p>
                                    <p className="text-sm text-muted-foreground">{event.location}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {format(new Date(event.timestamp), 'MMM dd, yyyy HH:mm')}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Order Summary */}
              <div className="lg:col-span-1">
                <Card className="sticky top-4">
                  <CardHeader>
                    <CardTitle>Order Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>${order.subtotal?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Shipping</span>
                      <span>${order.shippingCost?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax</span>
                      <span>${order.tax?.toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total</span>
                      <span className="text-dental-primary">${order.total?.toFixed(2)}</span>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        <span className="text-sm">Payment Method</span>
                      </div>
                      <p className="text-sm font-medium">{order.paymentMethod}</p>
                      <Badge className={getStatusColor(order.paymentStatus)}>
                        {order.paymentStatus?.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <Button className="w-full" variant="outline">
                        <Download className="mr-2 h-4 w-4" />
                        Download Invoice
                      </Button>
                      <Button className="w-full" variant="outline" asChild>
                        <Link to="/orders">
                          <Eye className="mr-2 h-4 w-4" />
                          View All Orders
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  // Orders List View
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">My Orders</h1>
            <p className="text-muted-foreground">
              Track and manage your orders
            </p>
          </div>

          <Tabs defaultValue="orders" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="orders">Order History</TabsTrigger>
              <TabsTrigger value="tracking">Track Package</TabsTrigger>
            </TabsList>

            {/* Orders Tab */}
            <TabsContent value="orders" className="space-y-6">
              {/* Search */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search orders..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Orders List */}
              {ordersLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p>Loading your orders...</p>
                </div>
              ) : ordersError ? (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Unable to Load Orders</h3>
                  <p className="text-muted-foreground">Please try again later.</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Orders Found</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery ? 'No orders match your search.' : "You haven't placed any orders yet."}
                  </p>
                  <Button asChild className="bg-dental-primary hover:bg-dental-primary/90">
                    <Link to="/products">Start Shopping</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((order: any) => (
                    <Card key={order.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="font-semibold">Order #{order.id}</h3>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(order.createdAt), 'MMMM dd, yyyy')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(order.status)}
                            <Badge className={getStatusColor(order.status)}>
                              {order.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {order.items?.length} {order.items?.length === 1 ? 'item' : 'items'}
                            </p>
                            <p className="font-semibold text-dental-primary">
                              ${order.total?.toFixed(2)}
                            </p>
                          </div>
                          <Button asChild variant="outline">
                            <Link to={`/orders/${order.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Tracking Tab */}
            <TabsContent value="tracking" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Track Your Package</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Enter your tracking number to get real-time updates
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="tracking">Tracking Number</Label>
                    <div className="flex gap-2">
                      <Input
                        id="tracking"
                        placeholder="DS2024001"
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                      />
                      <Button 
                        onClick={() => {/* Trigger tracking query */}}
                        disabled={!trackingNumber || trackingLoading}
                      >
                        {trackingLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {trackingData?.tracking && (
                    <div className="mt-6 p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold">Tracking Results</h4>
                        <Badge className={getStatusColor(trackingData.tracking.status)}>
                          {trackingData.tracking.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-sm">
                          <span className="font-medium">Current Location:</span> {trackingData.tracking.currentLocation}
                        </p>
                        <p className="text-sm">
                          <span className="font-medium">Estimated Delivery:</span> {' '}
                          {format(new Date(trackingData.tracking.estimatedDelivery), 'MMMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Orders;
