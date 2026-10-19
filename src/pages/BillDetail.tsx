import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, CreditCard, Building, Wallet, Send, StickyNote,
  CalendarDays, Tag, RefreshCw, TrendingUp, Clock, AlertCircle,
} from 'lucide-react';
import { Bill } from '@/data/bills';
import { MOCK_PAYMENTS, MOCK_NOTES, PaymentRecord, BillNote } from '@/data/billDetails';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

const methodIcon = (m: PaymentRecord['method']) => {
  if (m === 'card') return <CreditCard className="w-4 h-4" />;
  if (m === 'bank') return <Building className="w-4 h-4" />;
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

  const { data: bill, isLoading, isError, error, refetch } = useQuery<Bill>({
    queryKey: ['bills', id],
    queryFn: () => apiRequest<Bill>(`/api/bills/${id}`),
    enabled: !!id,
  });

  const [notes, setNotes] = useState<BillNote[]>(MOCK_NOTES);
  const [newNote, setNewNote] = useState('');

  const payments = useMemo(
    () => MOCK_PAYMENTS.filter(p => p.billId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [id]
  );

  const billNotes = useMemo(
    () => notes.filter(n => n.billId === id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [id, notes]
  );

  const totalPaid = useMemo(
    () => payments.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0),
    [payments]
  );

  const addNote = () => {
    if (!newNote.trim() || !id) return;
    setNotes(prev => [...prev, { id: crypto.randomUUID(), billId: id, text: newNote.trim(), createdAt: new Date().toISOString() }]);
    setNewNote('');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card rounded-3xl p-8 text-center max-w-md space-y-4 border-destructive/30">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-foreground">Failed to load bill</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {error instanceof Error ? error.message : 'The requested bill could not be retrieved.'}
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="active:scale-95 transition-transform">
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
            <p className="text-sm text-muted-foreground capitalize">{bill.category} • {bill.isSubscription ? 'Recurring' : 'One-time'}</p>
          </div>
          <span className={`text-xs font-medium px-3 py-1.5 rounded-full border ${statusCls} capitalize`}>{bill.status}</span>
        </motion.div>

        {/* Info Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { icon: Tag, label: 'Amount', value: `$${bill.amount.toFixed(2)}`, color: 'text-foreground' },
            { icon: CalendarDays, label: 'Due Date', value: format(new Date(bill.dueDate), 'MMM dd, yyyy'), color: 'text-muted-foreground' },
            { icon: TrendingUp, label: 'Total Paid', value: `$${totalPaid.toFixed(2)}`, color: 'status-paid' },
            { icon: Clock, label: 'Payments', value: `${payments.length} records`, color: 'text-muted-foreground' },
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
            <div className="flex items-center gap-2 mb-5">
              <RefreshCw className="w-4 h-4 text-accent" />
              <h3 className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">Payment History</h3>
            </div>
            {payments.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No payment records yet.</p>
            ) : (
              <ScrollArea className="h-[340px] pr-2">
                <div className="space-y-2">
                  <AnimatePresence>
                    {payments.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.15, delay: i * 0.03 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground">
                          {methodIcon(p.method)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize">{p.method} payment</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(p.date), 'MMM dd, yyyy')}</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${paymentStatusCls(p.status)} capitalize`}>
                          {p.status}
                        </span>
                        <span className="font-mono-data text-sm font-semibold min-w-[70px] text-right">
                          ${p.amount.toFixed(2)}
                        </span>
                      </motion.div>
                    ))}
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
              {billNotes.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No notes yet.</p>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {billNotes.map((n, i) => (
                      <motion.div
                        key={n.id}
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
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
              />
              <Button size="icon" className="shrink-0 self-end active:scale-95" onClick={addNote} disabled={!newNote.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default BillDetail;
