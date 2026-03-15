import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

interface HeroWidgetProps {
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  paidPercent: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
}

export function HeroWidget({ totalAmount, paidAmount, pendingAmount, overdueAmount, paidPercent, paidCount, pendingCount, overdueCount }: HeroWidgetProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className="col-span-12 md:col-span-8 row-span-2 glass-card rounded-3xl p-8 flex flex-col justify-between"
    >
      <div>
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Monthly Flow</p>
        <div className="mt-3 text-5xl font-bold font-mono-data tracking-tighter">
          ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{paidPercent.toFixed(0)}% paid</span>
          <span className="font-mono-data">${paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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
      <p className="text-xs text-muted-foreground font-mono-data">${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
    </div>
  );
}
