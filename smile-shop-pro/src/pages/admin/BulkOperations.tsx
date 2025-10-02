import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Upload, 
  Download, 
  Package, 
  ShoppingCart, 
  Users, 
  Mail,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface BulkOperation {
  id: string;
  type: 'product' | 'order' | 'user' | 'notification';
  action: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  processed: number;
  errors: string[];
  createdAt: Date;
}

const BulkOperations: React.FC = () => {
  const [operations, setOperations] = useState<BulkOperation[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Product Bulk Operations
  const [productFilters, setProductFilters] = useState({
    category: '',
    status: '',
    priceRange: { min: '', max: '' },
    stockLevel: ''
  });

  // Order Bulk Operations
  const [orderFilters, setOrderFilters] = useState({
    status: '',
    dateRange: { start: '', end: '' },
    paymentStatus: '',
    shippingMethod: ''
  });

  // User Bulk Operations
  const [userFilters, setUserFilters] = useState({
    role: '',
    status: '',
    registrationDate: { start: '', end: '' },
    lastActivity: ''
  });

  const handleBulkAction = async (type: string, action: string, filters: any) => {
    setIsProcessing(true);
    
    try {
      const operationId = `${type}_${action}_${Date.now()}`;
      
      const newOperation: BulkOperation = {
        id: operationId,
        type: type as any,
        action,
        status: 'processing',
        progress: 0,
        total: 0,
        processed: 0,
        errors: [],
        createdAt: new Date()
      };

      setOperations(prev => [newOperation, ...prev]);

      // Simulate bulk operation with progress updates
      await simulateBulkOperation(operationId, type, action, filters);

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start bulk operation",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const simulateBulkOperation = async (
    operationId: string, 
    type: string, 
    action: string, 
    filters: any
  ) => {
    // Simulate API call to get total items
    const total = Math.floor(Math.random() * 100) + 10;
    
    updateOperation(operationId, { total, status: 'processing' });

    // Simulate processing with progress updates
    for (let i = 0; i <= total; i++) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate processing time
      
      const progress = Math.round((i / total) * 100);
      const hasError = Math.random() < 0.05; // 5% chance of error per item
      
      updateOperation(operationId, {
        processed: i,
        progress,
        errors: hasError ? [`Error processing item ${i}`] : []
      });
    }

    // Complete operation
    updateOperation(operationId, {
      status: 'completed',
      progress: 100
    });

    toast({
      title: "Bulk Operation Completed",
      description: `Successfully processed ${total} items`,
    });
  };

  const updateOperation = (id: string, updates: Partial<BulkOperation>) => {
    setOperations(prev => prev.map(op => 
      op.id === id ? { ...op, ...updates } : op
    ));
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadFile(file);
      toast({
        title: "File Selected",
        description: `Selected: ${file.name}`,
      });
    }
  }, [toast]);

  const handleCsvImport = async (type: string) => {
    if (!uploadFile) {
      toast({
        title: "No File Selected",
        description: "Please select a CSV file to import",
        variant: "destructive"
      });
      return;
    }

    const operationId = `import_${type}_${Date.now()}`;
    
    const newOperation: BulkOperation = {
      id: operationId,
      type: type as any,
      action: 'import',
      status: 'processing',
      progress: 0,
      total: 0,
      processed: 0,
      errors: [],
      createdAt: new Date()
    };

    setOperations(prev => [newOperation, ...prev]);

    // Simulate CSV processing
    await simulateCsvImport(operationId, uploadFile);
  };

  const simulateCsvImport = async (operationId: string, file: File) => {
    // Simulate reading CSV file
    const total = Math.floor(Math.random() * 500) + 50;
    updateOperation(operationId, { total });

    for (let i = 0; i <= total; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const progress = Math.round((i / total) * 100);
      const hasError = Math.random() < 0.02; // 2% chance of error per row
      
      updateOperation(operationId, {
        processed: i,
        progress,
        errors: hasError ? [`Row ${i}: Invalid data format`] : []
      });
    }

    updateOperation(operationId, { status: 'completed', progress: 100 });
    setUploadFile(null);
  };

  const exportData = async (type: string, format: 'csv' | 'xlsx' | 'json') => {
    toast({
      title: "Export Started",
      description: `Exporting ${type} data as ${format.toUpperCase()}...`,
    });

    // Simulate export
    setTimeout(() => {
      toast({
        title: "Export Completed",
        description: `${type} data exported successfully`,
      });
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Bulk Operations</h1>
        <Badge variant="secondary">
          {operations.filter(op => op.status === 'processing').length} Active Operations
        </Badge>
      </div>

      <Tabs defaultValue="products" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Products
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Product Bulk Operations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="product-category">Category</Label>
                  <Select value={productFilters.category} onValueChange={(value) => 
                    setProductFilters(prev => ({ ...prev, category: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instruments">Instruments</SelectItem>
                      <SelectItem value="consumables">Consumables</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="product-status">Status</Label>
                  <Select value={productFilters.status} onValueChange={(value) => 
                    setProductFilters(prev => ({ ...prev, status: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="discontinued">Discontinued</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="min-price">Min Price</Label>
                  <Input
                    id="min-price"
                    type="number"
                    placeholder="0"
                    value={productFilters.priceRange.min}
                    onChange={(e) => setProductFilters(prev => ({
                      ...prev,
                      priceRange: { ...prev.priceRange, min: e.target.value }
                    }))}
                  />
                </div>

                <div>
                  <Label htmlFor="max-price">Max Price</Label>
                  <Input
                    id="max-price"
                    type="number"
                    placeholder="1000"
                    value={productFilters.priceRange.max}
                    onChange={(e) => setProductFilters(prev => ({
                      ...prev,
                      priceRange: { ...prev.priceRange, max: e.target.value }
                    }))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={() => handleBulkAction('product', 'update_prices', productFilters)}
                  disabled={isProcessing}
                >
                  Update Prices
                </Button>
                <Button 
                  onClick={() => handleBulkAction('product', 'update_status', productFilters)}
                  disabled={isProcessing}
                >
                  Update Status
                </Button>
                <Button 
                  onClick={() => handleBulkAction('product', 'update_categories', productFilters)}
                  disabled={isProcessing}
                >
                  Update Categories
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => exportData('products', 'csv')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </div>

              <div className="border-t pt-4">
                <Label htmlFor="product-csv">Import Products from CSV</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    id="product-csv"
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                  />
                  <Button 
                    onClick={() => handleCsvImport('product')}
                    disabled={!uploadFile || isProcessing}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Order Bulk Operations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="order-status">Order Status</Label>
                  <Select value={orderFilters.status} onValueChange={(value) => 
                    setOrderFilters(prev => ({ ...prev, status: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="payment-status">Payment Status</Label>
                  <Select value={orderFilters.paymentStatus} onValueChange={(value) => 
                    setOrderFilters(prev => ({ ...prev, paymentStatus: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="All Payment Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={orderFilters.dateRange.start}
                    onChange={(e) => setOrderFilters(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, start: e.target.value }
                    }))}
                  />
                </div>

                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={orderFilters.dateRange.end}
                    onChange={(e) => setOrderFilters(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, end: e.target.value }
                    }))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={() => handleBulkAction('order', 'update_status', orderFilters)}
                  disabled={isProcessing}
                >
                  Update Status
                </Button>
                <Button 
                  onClick={() => handleBulkAction('order', 'send_notifications', orderFilters)}
                  disabled={isProcessing}
                >
                  Send Notifications
                </Button>
                <Button 
                  onClick={() => handleBulkAction('order', 'generate_invoices', orderFilters)}
                  disabled={isProcessing}
                >
                  Generate Invoices
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => exportData('orders', 'xlsx')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Excel
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Bulk Operations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="user-role">Role</Label>
                  <Select value={userFilters.role} onValueChange={(value) => 
                    setUserFilters(prev => ({ ...prev, role: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="All Roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="user-status">Status</Label>
                  <Select value={userFilters.status} onValueChange={(value) => 
                    setUserFilters(prev => ({ ...prev, status: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="reg-start">Registration Start</Label>
                  <Input
                    id="reg-start"
                    type="date"
                    value={userFilters.registrationDate.start}
                    onChange={(e) => setUserFilters(prev => ({
                      ...prev,
                      registrationDate: { ...prev.registrationDate, start: e.target.value }
                    }))}
                  />
                </div>

                <div>
                  <Label htmlFor="reg-end">Registration End</Label>
                  <Input
                    id="reg-end"
                    type="date"
                    value={userFilters.registrationDate.end}
                    onChange={(e) => setUserFilters(prev => ({
                      ...prev,
                      registrationDate: { ...prev.registrationDate, end: e.target.value }
                    }))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={() => handleBulkAction('user', 'send_welcome_email', userFilters)}
                  disabled={isProcessing}
                >
                  Send Welcome Email
                </Button>
                <Button 
                  onClick={() => handleBulkAction('user', 'update_roles', userFilters)}
                  disabled={isProcessing}
                >
                  Update Roles
                </Button>
                <Button 
                  onClick={() => handleBulkAction('user', 'export_data', userFilters)}
                  disabled={isProcessing}
                >
                  Export User Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Bulk Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="notification-subject">Subject</Label>
                  <Input
                    id="notification-subject"
                    placeholder="Enter notification subject"
                  />
                </div>

                <div>
                  <Label htmlFor="notification-message">Message</Label>
                  <Textarea
                    id="notification-message"
                    placeholder="Enter notification message"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Notification Type</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="all">All Channels</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Target Audience</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select audience" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_customers">All Customers</SelectItem>
                        <SelectItem value="professionals">Professionals Only</SelectItem>
                        <SelectItem value="recent_customers">Recent Customers</SelectItem>
                        <SelectItem value="inactive_customers">Inactive Customers</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={() => handleBulkAction('notification', 'send_bulk', {})}
                    disabled={isProcessing}
                  >
                    Send Notification
                  </Button>
                  <Button variant="outline">
                    Schedule for Later
                  </Button>
                  <Button variant="outline">
                    Preview
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Operations History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Recent Operations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {operations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No bulk operations yet
              </div>
            ) : (
              operations.map((operation) => (
                <div key={operation.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        operation.status === 'completed' ? 'default' :
                        operation.status === 'failed' ? 'destructive' :
                        operation.status === 'processing' ? 'secondary' : 'outline'
                      }>
                        {operation.status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                        {operation.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                        {operation.status === 'processing' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        {operation.status}
                      </Badge>
                      <span className="font-medium">
                        {operation.type} - {operation.action}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {operation.createdAt.toLocaleString()}
                    </span>
                  </div>

                  {operation.status === 'processing' && (
                    <div className="mb-2">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Progress: {operation.processed} / {operation.total}</span>
                        <span>{operation.progress}%</span>
                      </div>
                      <Progress value={operation.progress} className="h-2" />
                    </div>
                  )}

                  {operation.errors.length > 0 && (
                    <Alert className="mt-2">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {operation.errors.length} error(s) occurred during processing
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkOperations;
