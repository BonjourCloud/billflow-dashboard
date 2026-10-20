import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CreditCard,
  Wallet,
  Send,
  StickyNote,
  CalendarDays,
  Tag,
  RefreshCw,
  TrendingUp,
  Clock,
  AlertCircle,
  Banknote,
  Smartphone,
  Plus,
} from 'lucide-react';
import { Bill } from '@/data/bills';
import {
  PaymentRecord,
  BillNote,
  PaymentMethod,
  formatPaymentMethod,
  PAYMENT_METHODS,
} from '@/data/billDetails';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const methodIcon = (m: PaymentRecord['method']) => {
  if (m === 'cash') return <Banknote className="w-4 h-4" />;
  if (m === 'debit_card' || m === 'credit_card') return <CreditCard className="w-4 h-4" />;
  if (m === 'upi') return <Smartphone className="w-4 h-4" />;
  return <Wallet className="w-4 h-4" />;
};

const paymentStatusCls = (s: PaymentRecord['status']) => {
  if (s === 'completed') return 'badge-paid';
  if (s === 'failed') return 'badge-overdue';
  return 'badge-pending';
};

const BillDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: bill,
    isLoading: isBillLoading,
    isError: isBillError,
    error: billError,
    refetch: refetchBill,
  } = useQuery<Bill>({
    queryKey: ['bills', id],
    queryFn: () => apiRequest<Bill>(`/api/bills/${id}`),
    enabled: !!id,
  });

  const {
    data: payments = [],
    isLoading: isPaymentsLoading,
  } = useQuery<PaymentRecord[]>({
    queryKey: ['payments', id],
    queryFn: () => apiRequest<PaymentRecord[]>(`/api/bills/${id}/payments`),
    enabled: !!id,
  });

  const {
    data: billNotes = [],
    isLoading: isNotesLoading,
  } = useQuery<BillNote[]>({
    queryKey: ['notes', id],
    queryFn: () => apiRequest<BillNote[]>(`/api/bills/${id}/notes`),
    enabled: !!id,
  });

  const [newNote, setNewNote] = useState('');
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit_card');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null);

  const totalPaid = useMemo(
    () =>
      payments
        .filter((p) => p.status === 'completed')
        .reduce((sum, p) => sum + p.amount, 0),
    [payments],
  );

  const remainingAmount = useMemo(() => {
    if (!bill) return 0;
    return Math.max(0, bill.amount - totalPaid);
  }, [bill, totalPaid]);

  const addPaymentMutation = useMutation({
    mutationFn: (newPayment: {
      amount: number;
      paymentDate: string;
      method: PaymentMethod;
      reference?: string | null;
      notes?: string | null;
    }) =>
      apiRequest<PaymentRecord>(`/api/bills/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify(newPayment),
      }),
    onSuccess: () => {
      toast.success('Payment recorded successfully');
      queryClient.invalidateQueries({ queryKey: ['payments', id] });
      queryClient.invalidateQueries({ queryKey: ['bills', id] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setIsPaymentDialogOpen(false);
      setPaymentReference('');
      setPaymentNotes('');
      setPaymentFormError(null);
    },
    onError: (err: Error) => {
      setPaymentFormError(err.message || 'Failed to record payment');
      toast.error(err.message || 'Failed to record payment');
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: (text: string) =>
      apiRequest<BillNote>(`/api/bills/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    onSuccess: () => {
      toast.success('Note added');
      queryClient.invalidateQueries({ queryKey: ['notes', id] });
      setNewNote('');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add note');
    },
  });

  const handleOpenPaymentDialog = () => {
    if (!bill) return;
    const defaultAmount = remainingAmount > 0 ? remainingAmount : bill.amount;
    setPaymentAmount(defaultAmount.toFixed(2));
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('credit_card');
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentFormError(null);
    setIsPaymentDialogOpen(true);
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (addPaymentMutation.isPending) return;

    const parsedAmount = parseFloat(paymentAmount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setPaymentFormError('Please enter a valid positive payment amount.');
      return;
    }

    if (!paymentDate) {
      setPaymentFormError('Please select a payment date.');
      return;
    }

    setPaymentFormError(null);
    addPaymentMutation.mutate({
      amount: parsedAmount,
      paymentDate,
      method: paymentMethod,
      reference: paymentReference.trim() || null,
      notes: paymentNotes.trim() || null,
    });
  };

  const handleAddNote = () => {
    if (!newNote.trim() || !id || addNoteMutation.isPending) return;
    addNoteMutation.mutate(newNote.trim());
  };

  if (isBillLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isBillError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card rounded-3xl p-8 text-center max-w-md space-y-4 border-destructive/30">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-foreground">Failed to load bill</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {billError instanceof Error ? billError.message : 'The requested bill could not be retrieved.'}
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => refetchBill()} className="active:scale-95 transition-transform">
              Try again
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="active:scale-95 transition-transform">
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Bill not found.</p>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const statusCls = bill.status === 'paid' ? 'badge-paid' : bill.status === 'overdue' ? 'badge-overdue' : 'badge-pending';

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-3 mb-6"
        >
          <Button variant="ghost" size="icon" className="active:scale-95" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{bill.name}</h1>
            <p className="text-sm text-muted-foreground capitalize">
              {bill.category} •{' '}
              {bill.recurrenceType === 'recurring' || bill.isSubscription
                ? `Monthly Recurring${bill.billingCycle ? ` (${bill.billingCycle})` : ''}`
                : 'One-time'}
            </p>
          </div>
          <span className={`text-xs font-medium px-3 py-1.5 rounded-full border ${statusCls} capitalize`}>{bill.status}</span>
        </motion.div>

        {/* Info Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { icon: Tag, label: 'Amount', value: `$${bill.amount.toFixed(2)}`, color: 'text-foreground' },
            { icon: CalendarDays, label: 'Due Date', value: format(new Date(bill.dueDate), 'MMM dd, yyyy'), color: 'text-muted-foreground' },
            { icon: TrendingUp, label: 'Total Paid', value: `$${totalPaid.toFixed(2)}`, color: 'status-paid' },
            { icon: Clock, label: 'Payments', value: `${payments.length} ${payments.length === 1 ? 'record' : 'records'}`, color: 'text-muted-foreground' },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
              className="glass-card rounded-2xl p-4"
            >
              <item.icon className="w-4 h-4 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
              <p className={`font-semibold text-sm font-mono-data ${item.color}`}>{item.value}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Payment History */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
            className="lg:col-span-3 glass-card rounded-3xl p-6"
          >
            <div className="flex items-center justify-between gap-2 mb-5">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">Payment History</h3>
              </div>
              <Button
                size="sm"
                onClick={handleOpenPaymentDialog}
                className="active:scale-95 transition-transform text-xs h-8 px-3 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Record Payment
              </Button>
            </div>

            {isPaymentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : payments.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No payment records yet.</p>
            ) : (
              <ScrollArea className="h-[340px] pr-2">
                <div className="space-y-2">
                  <AnimatePresence>
                    {payments.map((p, i) => {
                      const displayDate = p.paymentDate || p.date || p.createdAt || '';
                      return (
                        <motion.div
                          key={p._id || p.id || `payment-${i}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.15, delay: i * 0.03 }}
                          className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground">
                            {methodIcon(p.method)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{formatPaymentMethod(p.method)}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                              {displayDate && (
                                <span>{format(new Date(displayDate), 'MMM dd, yyyy')}</span>
                              )}
                              {p.reference && (
                                <span className="truncate">• Ref: {p.reference}</span>
                              )}
                            </div>
                            {p.notes && (
                              <p className="text-xs text-muted-foreground/80 mt-0.5 truncate">{p.notes}</p>
                            )}
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${paymentStatusCls(p.status)} capitalize`}>
                            {p.status}
                          </span>
                          <span className="font-mono-data text-sm font-semibold min-w-[70px] text-right">
                            ${p.amount.toFixed(2)}
                          </span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            )}
          </motion.div>

          {/* Notes */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.2 }}
            className="lg:col-span-2 glass-card rounded-3xl p-6 flex flex-col"
          >
            <div className="flex items-center gap-2 mb-5">
              <StickyNote className="w-4 h-4 text-[hsl(var(--status-pending))]" />
              <h3 className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">Notes</h3>
            </div>

            <ScrollArea className="flex-1 h-[220px] pr-2 mb-4">
              {isNotesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : billNotes.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No notes yet.</p>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {billNotes.map((n, i) => (
                      <motion.div
                        key={n._id || n.id || `note-${i}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: i * 0.03 }}
                        className="p-3 rounded-xl bg-secondary/30"
                      >
                        <p className="text-sm leading-relaxed">{n.text}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(n.createdAt), 'MMM dd, yyyy • h:mm a')}
                        </p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>

            <div className="flex gap-2">
              <Textarea
                placeholder="Add a note..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                className="min-h-[60px] bg-secondary/50 border-border/40 resize-none text-sm"
                disabled={addNoteMutation.isPending}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddNote();
                  }
                }}
              />
              <Button
                size="icon"
                className="shrink-0 self-end active:scale-95"
                onClick={handleAddNote}
                disabled={!newNote.trim() || addNoteMutation.isPending}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="glass-card border-border/40 sm:max-w-[440px] sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleRecordPayment} className="space-y-4 mt-2">
            {paymentFormError && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {paymentFormError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="payment-amount" className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Amount ($)
              </Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                disabled={addPaymentMutation.isPending}
                className="bg-secondary/50 border-border/40 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-date" className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Payment Date
              </Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={addPaymentMutation.isPending}
                className="bg-secondary/50 border-border/40 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-method" className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Payment Method
              </Label>
              <Select
                value={paymentMethod}
                onValueChange={(val) => setPaymentMethod(val as PaymentMethod)}
                disabled={addPaymentMutation.isPending}
              >
                <SelectTrigger id="payment-method" className="bg-secondary/50 border-border/40 rounded-xl">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {formatPaymentMethod(method)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-reference" className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Reference / Transaction ID (Optional)
              </Label>
              <Input
                id="payment-reference"
                type="text"
                maxLength={100}
                placeholder="e.g. UPI-12345, CHK-9901"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                disabled={addPaymentMutation.isPending}
                className="bg-secondary/50 border-border/40 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-notes" className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Notes / Remarks (Optional)
              </Label>
              <Textarea
                id="payment-notes"
                maxLength={500}
                placeholder="Additional details about this payment..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                disabled={addPaymentMutation.isPending}
                className="bg-secondary/50 border-border/40 rounded-xl min-h-[60px] resize-none text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={addPaymentMutation.isPending}
                onClick={() => setIsPaymentDialogOpen(false)}
                className="active:scale-95 transition-transform"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addPaymentMutation.isPending}
                className="active:scale-95 transition-transform"
              >
                {addPaymentMutation.isPending ? 'Recording…' : 'Record Payment'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BillDetail;
