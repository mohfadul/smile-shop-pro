/**
 * Shopping Cart Page - Dental Store Sudan
 * Shows cart items with price calculation and stock validation
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart, useUpdateCartItem, useRemoveFromCart } from "@/hooks/useApi";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  ArrowLeft, 
  Loader2,
  AlertCircle,
  CheckCircle,
  Package,
  CreditCard
} from "lucide-react";
import { toast } from "sonner";

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
  variant?: {
    id: string;
    name: string;
  };
  stock: number;
}

const Cart = () => {
  const navigate = useNavigate();
  const { data: cartData, isLoading, error } = useCart();
  const { mutate: updateCartItem, isPending: updating } = useUpdateCartItem();
  const { mutate: removeFromCart, isPending: removing } = useRemoveFromCart();

  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());

  const cart = cartData?.cart;
  const items: CartItem[] = cart?.items || [];

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    
    setUpdatingItems(prev => new Set([...prev, itemId]));
    updateCartItem(
      { itemId, data: { quantity: newQuantity } },
      {
        onSettled: () => {
          setUpdatingItems(prev => {
            const newSet = new Set(prev);
            newSet.delete(itemId);
            return newSet;
          });
        }
      }
    );
  };

  const handleRemoveItem = (itemId: string) => {
    removeFromCart(itemId);
  };

  const calculateSubtotal = () => {
    return items.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateShipping = () => {
    const subtotal = calculateSubtotal();
    return subtotal >= 100 ? 0 : 50; // Free shipping over $100, otherwise 50 SDG
  };

  const calculateTax = () => {
    const subtotal = calculateSubtotal();
    return subtotal * 0.17; // 17% VAT in Sudan
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateShipping() + calculateTax();
  };

  const getStockStatus = (item: CartItem) => {
    if (item.quantity > item.stock) {
      return { status: 'over-stock', message: `Only ${item.stock} available`, color: 'red' };
    }
    if (item.stock === 0) {
      return { status: 'out-of-stock', message: 'Out of stock', color: 'red' };
    }
    if (item.stock < 5) {
      return { status: 'low-stock', message: `${item.stock} left`, color: 'orange' };
    }
    return { status: 'in-stock', message: 'In stock', color: 'green' };
  };

  const hasStockIssues = () => {
    return items.some(item => {
      const status = getStockStatus(item);
      return status.status === 'over-stock' || status.status === 'out-of-stock';
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading your cart...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Unable to Load Cart</h2>
            <p className="text-muted-foreground mb-4">
              There was an error loading your cart. Please try again.
            </p>
            <Button onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Button
              variant="ghost"
              onClick={() => navigate('/products')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Continue Shopping
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Shopping Cart</h1>
              <p className="text-muted-foreground">
                {items.length} {items.length === 1 ? 'item' : 'items'} in your cart
              </p>
            </div>
          </div>

          {items.length === 0 ? (
            /* Empty Cart */
            <div className="text-center py-16">
              <ShoppingCart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
              <p className="text-muted-foreground mb-6">
                Looks like you haven't added any items to your cart yet.
              </p>
              <Button asChild className="bg-dental-primary hover:bg-dental-primary/90">
                <Link to="/products">
                  <Package className="mr-2 h-4 w-4" />
                  Browse Products
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Cart Items */}
              <div className="lg:col-span-2 space-y-4">
                {items.map((item) => {
                  const stockStatus = getStockStatus(item);
                  const isUpdating = updatingItems.has(item.id);

                  return (
                    <Card key={item.id} className="overflow-hidden">
                      <CardContent className="p-6">
                        <div className="flex flex-col sm:flex-row gap-4">
                          {/* Product Image */}
                          <div className="flex-shrink-0">
                            <img
                              src={item.productImage}
                              alt={item.productName}
                              className="w-24 h-24 object-cover rounded-lg"
                            />
                          </div>

                          {/* Product Info */}
                          <div className="flex-1 space-y-2">
                            <div>
                              <h3 className="font-semibold text-lg">
                                <Link 
                                  to={`/product/${item.productId}`}
                                  className="hover:text-dental-primary transition-colors"
                                >
                                  {item.productName}
                                </Link>
                              </h3>
                              {item.variant && (
                                <p className="text-sm text-muted-foreground">
                                  Variant: {item.variant.name}
                                </p>
                              )}
                            </div>

                            {/* Stock Status */}
                            <div className="flex items-center gap-2">
                              {stockStatus.status === 'in-stock' && (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                              {(stockStatus.status === 'low-stock' || stockStatus.status === 'over-stock') && (
                                <AlertCircle className="h-4 w-4 text-orange-500" />
                              )}
                              {stockStatus.status === 'out-of-stock' && (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              )}
                              <span className={`text-sm font-medium text-${stockStatus.color}-600`}>
                                {stockStatus.message}
                              </span>
                            </div>

                            {/* Price */}
                            <div className="flex items-center justify-between">
                              <span className="text-xl font-bold text-dental-primary">
                                ${item.price.toFixed(2)}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                ${(item.price * item.quantity).toFixed(2)} total
                              </span>
                            </div>
                          </div>

                          {/* Quantity Controls */}
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                disabled={item.quantity <= 1 || isUpdating}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => {
                                  const newQuantity = parseInt(e.target.value) || 1;
                                  handleQuantityChange(item.id, newQuantity);
                                }}
                                className="w-16 text-center"
                                min="1"
                                max={item.stock}
                                disabled={isUpdating}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                disabled={item.quantity >= item.stock || isUpdating}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItem(item.id)}
                              disabled={removing}
                              className="text-destructive hover:text-destructive"
                            >
                              {removing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Order Summary */}
              <div className="lg:col-span-1">
                <Card className="sticky top-4">
                  <CardHeader>
                    <CardTitle>Order Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Subtotal */}
                    <div className="flex justify-between">
                      <span>Subtotal ({items.length} items)</span>
                      <span>${calculateSubtotal().toFixed(2)}</span>
                    </div>

                    {/* Shipping */}
                    <div className="flex justify-between">
                      <span>Shipping</span>
                      <span>
                        {calculateShipping() === 0 ? (
                          <Badge variant="secondary">FREE</Badge>
                        ) : (
                          `$${calculateShipping().toFixed(2)}`
                        )}
                      </span>
                    </div>

                    {/* Tax */}
                    <div className="flex justify-between">
                      <span>VAT (17%)</span>
                      <span>${calculateTax().toFixed(2)}</span>
                    </div>

                    <Separator />

                    {/* Total */}
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total</span>
                      <span className="text-dental-primary">${calculateTotal().toFixed(2)}</span>
                    </div>

                    {/* Free Shipping Notice */}
                    {calculateShipping() > 0 && (
                      <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                        Add ${(100 - calculateSubtotal()).toFixed(2)} more for free shipping!
                      </div>
                    )}

                    {/* Stock Issues Warning */}
                    {hasStockIssues() && (
                      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">Stock Issues</span>
                        </div>
                        <p className="text-sm text-destructive/80 mt-1">
                          Some items in your cart are out of stock or exceed available quantity.
                        </p>
                      </div>
                    )}

                    {/* Checkout Button */}
                    <Button
                      asChild
                      className="w-full bg-dental-primary hover:bg-dental-primary/90"
                      disabled={hasStockIssues() || items.length === 0}
                    >
                      <Link to="/checkout">
                        <CreditCard className="mr-2 h-4 w-4" />
                        Proceed to Checkout
                      </Link>
                    </Button>

                    {/* Security Notice */}
                    <div className="text-xs text-muted-foreground text-center">
                      🔒 Secure checkout with SSL encryption
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Cart;
