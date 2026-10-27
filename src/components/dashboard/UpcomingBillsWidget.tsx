import { motion } from 'framer-motion';
import { Clock, CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Bill } from '@/data/bills';
import { differenceInDays } from 'date-fns';
import { formatCurrency } from '@/lib/currency';

interface UpcomingBillsWidgetProps {
  bills: Bill[];
}

export function UpcomingBillsWidget({ bills }: UpcomingBillsWidgetProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1], delay: 0.1 }}
      className="col-span-12 md:col-span-4 row-span-2 glass-card rounded-3xl p-6 flex flex-col"
    >
      <div className="flex items-center gap-2 mb-5">
        <Clock className="w-4 h-4 text-accent" />
        <h3 className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">Upcoming</h3>
      </div>
      <div className="flex-1 flex flex-col gap-3">
        {bills.map((bill, i) => {
          const daysUntil = differenceInDays(new Date(bill.dueDate), new Date());
          const urgency = daysUntil <= 3 ? 'status-overdue' : daysUntil <= 7 ? 'status-pending' : 'status-upcoming';
          return (
            <motion.div
              key={bill._id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: 0.15 + i * 0.05 }}
              // Expected recurring bills are not in the database yet, so they have no detail page.
              onClick={() => navigate(bill._id.startsWith('projected:') ? '/subscriptions' : `/bill/${bill._id}`)}
              className="flex items-center justify-between p-3 rounded-2xl bg-secondary/50 hover:bg-secondary/70 transition-colors cursor-pointer group"
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{bill.name}</p>
                  {bill.planId && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
                      EMI
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <CalendarDays className={`w-3 h-3 ${urgency}`} />
                  <span className={`text-xs ${urgency}`}>
                    {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d left`}
                  </span>
                </div>
              </div>
              <span className="font-mono-data font-semibold text-sm shrink-0">
                {formatCurrency(bill.amount)}
              </span>
            </motion.div>
          );
        })}
        {bills.length === 0 && (
          <p className="text-muted-foreground text-sm text-center mt-8">All caught up! 🎉</p>
        )}
      </div>
    </motion.div>
  );
}
