/**
 * Checkout Page - Dental Store Sudan
 * Order review and payment processing
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCart, usePaymentMethods, useShippingMethods, useCreateOrder, useCreatePayment } from "@/hooks/useApi";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  CreditCard, 
  MapPin, 
  User, 
  Phone, 
  Mail, 
  Truck, 
  Shield, 
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

interface ShippingAddress {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface BillingAddress extends ShippingAddress {
  sameAsShipping: boolean;
}

const Checkout = () => {
  const navigate = useNavigate();
  const { data: cartData, isLoading: cartLoading } = useCart();
  const { data: paymentMethodsData } = usePaymentMethods();
  const { data: shippingMethodsData } = useShippingMethods();
  const { mutate: createOrder, isPending: creatingOrder } = useCreateOrder();
  const { mutate: createPayment, isPending: processingPayment } = useCreatePayment();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedShippingMethod, setSelectedShippingMethod] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    fullName: "",
    phone: "",
    email: "",
    address: "",
    city: "Khartoum",
    state: "Khartoum State",
    postalCode: "",
    country: "Sudan"
  });

  const [billingAddress, setBillingAddress] = useState<BillingAddress>({
    ...shippingAddress,
    sameAsShipping: true
  });

  const cart = cartData?.cart;
  const items = cart?.items || [];
  const paymentMethods = paymentMethodsData?.methods || [];
  const shippingMethods = shippingMethodsData?.methods || [];

  useEffect(() => {
    if (billingAddress.sameAsShipping) {
      setBillingAddress({ ...shippingAddress, sameAsShipping: true });
    }
  }, [shippingAddress, billingAddress.sameAsShipping]);

  const calculateSubtotal = () => {
    return items.reduce((total: number, item: any) => total + (item.price * item.quantity), 0);
  };

  const getShippingCost = () => {
    if (!selectedShippingMethod) return 0;
    const method = shippingMethods.find(m => m.id === selectedShippingMethod);
    return method?.cost || 0;
  };

  const calculateTax = () => {
    const subtotal = calculateSubtotal();
    return subtotal * 0.17; // 17% VAT in Sudan
  };

  const calculateTotal = () => {
    return calculateSubtotal() + getShippingCost() + calculateTax();
  };

  const validateStep = (step: number) => {
    switch (step) {
      case 1:
        return shippingAddress.fullName && 
               shippingAddress.phone && 
               shippingAddress.email && 
               shippingAddress.address && 
               shippingAddress.city;
      case 2:
        return selectedShippingMethod;
      case 3:
        return selectedPaymentMethod;
      default:
        return false;
    }
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    } else {
      toast.error("Please fill in all required fields");
    }
  };

  const handlePlaceOrder = async () => {
    if (!validateStep(3)) {
      toast.error("Please complete all required information");
      return;
    }

    try {
      // Create order
      const orderData = {
        items: items.map((item: any) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          variantId: item.variant?.id
        })),
        shippingAddress,
        billingAddress: billingAddress.sameAsShipping ? shippingAddress : billingAddress,
        shippingMethod: selectedShippingMethod,
        paymentMethod: selectedPaymentMethod,
        notes: orderNotes,
        subtotal: calculateSubtotal(),
        shippingCost: getShippingCost(),
        tax: calculateTax(),
        total: calculateTotal()
      };

      const orderResponse = await createOrder(orderData);
      
      if (orderResponse?.order?.id) {
        // Create payment
        const paymentData = {
          orderId: orderResponse.order.id,
          amount: calculateTotal(),
          method: selectedPaymentMethod,
          currency: 'SDG'
        };

        const paymentResponse = await createPayment(paymentData);
        
        if (paymentResponse?.payment?.id) {
          toast.success("Order placed successfully!");
          navigate(`/orders/${orderResponse.order.id}`);
        }
      }
    } catch (error) {
      toast.error("Failed to place order. Please try again.");
    }
  };

  if (cartLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading checkout...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground mb-4">
              Add some items to your cart before proceeding to checkout.
            </p>
            <Button onClick={() => navigate('/products')}>
              Browse Products
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
              onClick={() => navigate('/cart')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Cart
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Checkout</h1>
              <p className="text-muted-foreground">Complete your order</p>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-4">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                    ${currentStep >= step 
                      ? 'bg-dental-primary text-white' 
                      : 'bg-muted text-muted-foreground'
                    }
                  `}>
                    {currentStep > step ? <CheckCircle className="h-4 w-4" /> : step}
                  </div>
                  {step < 4 && (
                    <div className={`
                      w-12 h-0.5 mx-2
                      ${currentStep > step ? 'bg-dental-primary' : 'bg-muted'}
                    `} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Step 1: Shipping Address */}
              {currentStep >= 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Shipping Address
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="fullName">Full Name *</Label>
                        <Input
                          id="fullName"
                          value={shippingAddress.fullName}
                          onChange={(e) => setShippingAddress({...shippingAddress, fullName: e.target.value})}
                          placeholder="Dr. Ahmed Mohamed"
                          disabled={currentStep !== 1}
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Phone Number *</Label>
                        <Input
                          id="phone"
                          value={shippingAddress.phone}
                          onChange={(e) => setShippingAddress({...shippingAddress, phone: e.target.value})}
                          placeholder="+249 123 456 789"
                          disabled={currentStep !== 1}
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={shippingAddress.email}
                        onChange={(e) => setShippingAddress({...shippingAddress, email: e.target.value})}
                        placeholder="your@email.com"
                        disabled={currentStep !== 1}
                      />
                    </div>

                    <div>
                      <Label htmlFor="address">Street Address *</Label>
                      <Textarea
                        id="address"
                        value={shippingAddress.address}
                        onChange={(e) => setShippingAddress({...shippingAddress, address: e.target.value})}
                        placeholder="Building number, street name, area"
                        disabled={currentStep !== 1}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="city">City *</Label>
                        <Select
                          value={shippingAddress.city}
                          onValueChange={(value) => setShippingAddress({...shippingAddress, city: value})}
                          disabled={currentStep !== 1}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Khartoum">Khartoum</SelectItem>
                            <SelectItem value="Omdurman">Omdurman</SelectItem>
                            <SelectItem value="Bahri">Bahri</SelectItem>
                            <SelectItem value="Port Sudan">Port Sudan</SelectItem>
                            <SelectItem value="Kassala">Kassala</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          value={shippingAddress.state}
                          onChange={(e) => setShippingAddress({...shippingAddress, state: e.target.value})}
                          disabled={currentStep !== 1}
                        />
                      </div>
                      <div>
                        <Label htmlFor="postalCode">Postal Code</Label>
                        <Input
                          id="postalCode"
                          value={shippingAddress.postalCode}
                          onChange={(e) => setShippingAddress({...shippingAddress, postalCode: e.target.value})}
                          disabled={currentStep !== 1}
                        />
                      </div>
                    </div>

                    {currentStep === 1 && (
                      <div className="flex justify-end">
                        <Button onClick={handleNextStep} className="bg-dental-primary hover:bg-dental-primary/90">
                          Continue to Shipping
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Step 2: Shipping Method */}
              {currentStep >= 2 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      Shipping Method
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup
                      value={selectedShippingMethod}
                      onValueChange={setSelectedShippingMethod}
                      disabled={currentStep !== 2}
                    >
                      {shippingMethods.map((method) => (
                        <div key={method.id} className="flex items-center space-x-2 p-4 border rounded-lg">
                          <RadioGroupItem value={method.id} id={method.id} />
                          <Label htmlFor={method.id} className="flex-1 cursor-pointer">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-medium">{method.name}</p>
                                <p className="text-sm text-muted-foreground">{method.description}</p>
                                <p className="text-sm text-muted-foreground">{method.duration}</p>
                              </div>
                              <span className="font-medium">
                                {method.cost === 0 ? 'FREE' : `$${method.cost.toFixed(2)}`}
                              </span>
                            </div>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>

                    {currentStep === 2 && (
                      <div className="flex justify-between mt-6">
                        <Button variant="outline" onClick={() => setCurrentStep(1)}>
                          Back
                        </Button>
                        <Button onClick={handleNextStep} className="bg-dental-primary hover:bg-dental-primary/90">
                          Continue to Payment
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Step 3: Payment Method */}
              {currentStep >= 3 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Payment Method
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup
                      value={selectedPaymentMethod}
                      onValueChange={setSelectedPaymentMethod}
                      disabled={currentStep !== 3}
                    >
                      {paymentMethods.map((method) => (
                        <div key={method.id} className="flex items-center space-x-2 p-4 border rounded-lg">
                          <RadioGroupItem value={method.id} id={method.id} />
                          <Label htmlFor={method.id} className="flex-1 cursor-pointer">
                            <div>
                              <p className="font-medium">{method.name}</p>
                              <p className="text-sm text-muted-foreground">{method.description}</p>
                            </div>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>

                    <div className="mt-6">
                      <Label htmlFor="orderNotes">Order Notes (Optional)</Label>
                      <Textarea
                        id="orderNotes"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Special instructions for your order..."
                        disabled={currentStep !== 3}
                      />
                    </div>

                    {currentStep === 3 && (
                      <div className="flex justify-between mt-6">
                        <Button variant="outline" onClick={() => setCurrentStep(2)}>
                          Back
                        </Button>
                        <Button onClick={handleNextStep} className="bg-dental-primary hover:bg-dental-primary/90">
                          Review Order
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Step 4: Order Review */}
              {currentStep === 4 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Review Your Order
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-muted p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-4 w-4 text-dental-primary" />
                        <span className="font-medium">Secure Checkout</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Your payment information is encrypted and secure.
                      </p>
                    </div>

                    <div className="flex justify-between">
                      <Button variant="outline" onClick={() => setCurrentStep(3)}>
                        Back
                      </Button>
                      <Button
                        onClick={handlePlaceOrder}
                        disabled={creatingOrder || processingPayment}
                        className="bg-dental-primary hover:bg-dental-primary/90"
                      >
                        {creatingOrder || processingPayment ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          `Place Order - $${calculateTotal().toFixed(2)}`
                        )}
                      </Button>
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
                  {/* Items */}
                  <div className="space-y-2">
                    {items.map((item: any) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.productName} × {item.quantity}</span>
                        <span>${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  {/* Costs */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>${calculateSubtotal().toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Shipping</span>
                      <span>
                        {getShippingCost() === 0 ? 'FREE' : `$${getShippingCost().toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>VAT (17%)</span>
                      <span>${calculateTax().toFixed(2)}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-dental-primary">${calculateTotal().toFixed(2)}</span>
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
};

export default Checkout;
