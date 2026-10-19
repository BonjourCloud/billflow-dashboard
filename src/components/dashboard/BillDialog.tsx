import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Bill, BillStatus, BillCategory, CATEGORIES, STATUSES } from '@/data/bills';

interface BillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: Bill | null;
  onSave: (bill: Omit<Bill, '_id'>) => void;
  onUpdate: (id: string, updates: Partial<Bill>) => void;
}

export function BillDialog({ open, onOpenChange, bill, onSave, onUpdate }: BillDialogProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<BillStatus>('pending');
  const [category, setCategory] = useState<BillCategory>('utilities');
  const [isSubscription, setIsSubscription] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (bill) {
      setName(bill.name);
      setAmount(bill.amount.toString());
      setDueDate(bill.dueDate ? new Date(bill.dueDate).toISOString().split('T')[0] : '');
      setStatus(bill.status);
      setCategory(bill.category);
      setIsSubscription(bill.isSubscription);
    } else {
      setName(''); setAmount(''); setDueDate(''); setStatus('pending');
      setCategory('utilities'); setIsSubscription(false);
    }
    setErrors({});
  }, [bill, open]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) e.amount = 'Valid amount required';
    if (!dueDate) e.dueDate = 'Due date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const data = { name, amount: Number(amount), dueDate, status, category, isSubscription };
    if (bill) onUpdate(bill._id, data);
    else onSave(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-border/40 sm:max-w-[480px] sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>{bill ? 'Edit Bill' : 'Add New Bill'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          <div className="space-y-2">
            <Label htmlFor="name">Bill Name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)}
              className="bg-secondary/50 focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Netflix" />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input id="amount" type="number" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="bg-secondary/50 font-mono-data focus:ring-2 focus:ring-primary/50"
                placeholder="0.00" />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input id="dueDate" type="date" value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="bg-secondary/50 font-mono-data focus:ring-2 focus:ring-primary/50" />
              {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as BillStatus)}>
                <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={v => setCategory(v as BillCategory)}>
                <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <Label htmlFor="subscription">Recurring Subscription</Label>
            <Switch id="subscription" checked={isSubscription} onCheckedChange={setIsSubscription} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="active:scale-95 transition-transform">
              Cancel
            </Button>
            <Button type="submit" className="active:scale-95 transition-transform">
              {bill ? 'Update' : 'Add'} Bill
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
