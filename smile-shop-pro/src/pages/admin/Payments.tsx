import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Eye,
  MoreHorizontal,
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { useUserPayments } from '@/hooks/use-payments';
import { useAuth } from '@/hooks/use-auth';

const Payments = () => {
  const { data: payments, isLoading, error } = useUserPayments();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState<any>(null);

  const filteredPayments = payments?.filter(payment => {
    const matchesSearch = payment.transaction_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.order_id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;

    return matchesSearch && matchesStatus;
  }) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'paid':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'pending':
      case 'processing':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      case 'refunded':
        return <Badge className="bg-purple-100 text-purple-800">Refunded</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'bank_transfer':
        return <Badge className="bg-blue-100 text-blue-800">Bank Transfer</Badge>;
      case 'cash_on_delivery':
        return <Badge className="bg-green-100 text-green-800">Cash</Badge>;
      case 'credit_card':
        return <Badge className="bg-purple-100 text-purple-800">Credit Card</Badge>;
      default:
        return <Badge variant="outline">{method}</Badge>;
    }
  };

  const handleRefund = async (paymentId: string) => {
    // TODO: Implement refund functionality
    console.log('Refund payment:', paymentId);
  };

  const handleRetryPayment = async (paymentId: string) => {
    // TODO: Implement payment retry functionality
    console.log('Retry payment:', paymentId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-600 mt-1">Manage payment transactions and refunds</p>
        </div>
        <Button>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search payments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline">
          Export
        </Button>
      </div>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CreditCard className="mr-2 h-5 w-5" />
            Payment Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gray-200 rounded animate-pulse" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded animate-pulse mb-1" />
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <XCircle className="mx-auto h-12 w-12 text-red-500" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Error loading payments</h3>
              <p className="mt-1 text-sm text-gray-500">Unable to load payment data. Please try again.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment) => (
                  <TableRow key={payment.transaction_id}>
                    <TableCell className="font-medium">
                      <div>
                        <p className="font-medium">{payment.transaction_id.slice(0, 8)}...</p>
                        <p className="text-sm text-gray-500">{payment.payment_reference}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{payment.order_id.slice(0, 8)}...</p>
                    </TableCell>
                    <TableCell className="font-medium">
                      ${payment.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {getMethodBadge(payment.payment_method)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(payment.status)}
                    </TableCell>
                    <TableCell>
                      {new Date(payment.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <Dialog>
                            <DialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Payment Details</DialogTitle>
                                <DialogDescription>
                                  Complete payment transaction information
                                </DialogDescription>
                              </DialogHeader>
                              {selectedPayment && (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="font-medium mb-2">Transaction Info</h4>
                                      <div className="space-y-1 text-sm">
                                        <p><span className="font-medium">ID:</span> {selectedPayment.transaction_id}</p>
                                        <p><span className="font-medium">Reference:</span> {selectedPayment.payment_reference}</p>
                                        <p><span className="font-medium">Status:</span> {getStatusBadge(selectedPayment.status)}</p>
                                        <p><span className="font-medium">Date:</span> {new Date(selectedPayment.created_at).toLocaleDateString()}</p>
                                      </div>
                                    </div>
                                    <div>
                                      <h4 className="font-medium mb-2">Payment Details</h4>
                                      <div className="space-y-1 text-sm">
                                        <p><span className="font-medium">Amount:</span> ${selectedPayment.amount.toFixed(2)}</p>
                                        <p><span className="font-medium">Method:</span> {getMethodBadge(selectedPayment.payment_method)}</p>
                                        <p><span className="font-medium">Provider:</span> {selectedPayment.payment_provider}</p>
                                      </div>
                                    </div>
                                  </div>

                                  {selectedPayment.failure_reason && (
                                    <div>
                                      <h4 className="font-medium mb-2 text-red-600">Failure Reason</h4>
                                      <p className="text-sm text-red-600">{selectedPayment.failure_reason}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>

                          {payment.status === 'failed' && (
                            <DropdownMenuItem onClick={() => handleRetryPayment(payment.transaction_id)}>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Retry Payment
                            </DropdownMenuItem>
                          )}

                          {payment.status === 'completed' && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleRefund(payment.transaction_id)}
                            >
                              <DollarSign className="mr-2 h-4 w-4" />
                              Process Refund
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!isLoading && !error && filteredPayments.length === 0 && (
            <div className="text-center py-12">
              <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No payments found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || statusFilter !== 'all' ? 'Try adjusting your search or filter criteria.' : 'Payment transactions will appear here.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Payments;