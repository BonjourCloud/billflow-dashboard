import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';

interface HeroWidgetProps {
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  paidPercent: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  /** Month switcher; omit to hide it. */
  monthLabel?: string;
  isCurrentMonth?: boolean;
  carriedOverCount?: number;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onCurrentMonth?: () => void;
}

export function HeroWidget({ totalAmount, paidAmount, pendingAmount, overdueAmount, paidPercent, paidCount, pendingCount, overdueCount, monthLabel, isCurrentMonth = true, carriedOverCount = 0, onPrevMonth, onNextMonth, onCurrentMonth }: HeroWidgetProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className="col-span-12 md:col-span-8 row-span-2 glass-card rounded-3xl p-8 flex flex-col justify-between"
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Monthly Flow</p>
          {monthLabel && (
            <div className="flex items-center gap-1" role="group" aria-label="Select month">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevMonth} aria-label="Previous month">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="min-w-[8.5rem] text-center text-sm font-medium" aria-live="polite">{monthLabel}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNextMonth} aria-label="Next month">
                <ChevronRight className="w-4 h-4" />
              </Button>
              {!isCurrentMonth && (
                <Button variant="outline" size="sm" className="h-8 ml-1" onClick={onCurrentMonth}>
                  This month
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 text-5xl font-bold font-mono-data tracking-tighter">
          {formatCurrency(totalAmount)}
        </div>
        {carriedOverCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Includes {carriedOverCount} unpaid {carriedOverCount === 1 ? 'bill' : 'bills'} from earlier months
          </p>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{paidPercent.toFixed(0)}% paid</span>
          <span className="font-mono-data">{formatCurrency(paidAmount)}</span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${paidPercent}%` }}
            transition={{ duration: 0.8, ease: [0.2, 0, 0, 1], delay: 0.2 }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatChip icon={<TrendingUp className="w-4 h-4 status-paid" />} label="Paid" count={paidCount} amount={paidAmount} className="badge-paid" />
        <StatChip icon={<TrendingDown className="w-4 h-4 status-pending" />} label="Pending" count={pendingCount} amount={pendingAmount} className="badge-pending" />
        <StatChip icon={<AlertTriangle className="w-4 h-4 status-overdue" />} label="Overdue" count={overdueCount} amount={overdueAmount} className="badge-overdue" />
      </div>
    </motion.div>
  );
}

function StatChip({ icon, label, count, amount, className }: { icon: React.ReactNode; label: string; count: number; amount: number; className: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-lg font-semibold font-mono-data">{count}</p>
      <p className="text-xs text-muted-foreground font-mono-data">{formatCurrency(amount)}</p>
    </div>
  );
}
