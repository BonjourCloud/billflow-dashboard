import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Bill } from '@/data/bills';
import { calculateInsights } from '@/lib/insights';
import { useInstallmentStore } from '@/hooks/useInstallmentStore';

interface AIInsightsWidgetProps {
  bills?: Bill[];
  isLoading?: boolean;
}

export function AIInsightsWidget({ bills = [], isLoading = false }: AIInsightsWidgetProps) {
  const { allPlans } = useInstallmentStore();
  const insights = useMemo(
    () => calculateInsights(bills, new Date(), { plans: allPlans }),
    [bills, allPlans],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1], delay: 0.2 }}
      whileHover={{ scale: 1.005 }}
      className="col-span-12 glass-card rounded-3xl p-6 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-primary/10">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">Smart Insights</h3>
          <p className="text-xs text-muted-foreground">Smart analysis of your bills</p>
        </div>
      </div>

      {isLoading && bills.length === 0 ? (
        <div className="space-y-3">
          <div className="h-12 rounded-2xl bg-secondary/30 animate-pulse" />
          <div className="h-12 rounded-2xl bg-secondary/30 animate-pulse" />
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="flex items-start gap-3 p-3 rounded-2xl bg-secondary/30"
            >
              <div
                className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                  insight.type === 'warning' ? 'bg-status-pending' : 'bg-accent'
                }`}
              />
              <p className="text-sm text-muted-foreground leading-relaxed">{insight.text}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
