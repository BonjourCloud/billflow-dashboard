import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Bill } from '@/data/bills';
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency';
import { useCategories } from '@/hooks/useCategories';

interface SpendingChartWidgetProps {
  bills: Bill[];
  activeCategory?: string;
  onCategoryClick?: (category: string) => void;
}

export function SpendingChartWidget({ bills, activeCategory, onCategoryClick }: SpendingChartWidgetProps) {
  const { getLabel, getColor } = useCategories();
  const data = useMemo(() => {
    const byCategory: Record<string, number> = {};
    bills.forEach(b => {
      byCategory[b.category] = (byCategory[b.category] || 0) + b.amount;
    });
    return Object.entries(byCategory)
      .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [bills]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1], delay: 0.25 }}
      className="col-span-12 glass-card rounded-3xl p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">
            Spending by Category
          </h3>
        </div>
        {activeCategory && activeCategory !== 'all' && (
          <button
            onClick={() => onCategoryClick?.('all')}
            className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            ✕ Clear filter: <span className="font-medium">{getLabel(activeCategory)}</span>
          </button>
        )}
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <XAxis
              dataKey="category"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              tickFormatter={(v: string) => getLabel(v)}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              tickFormatter={(v: number) => formatCurrencyCompact(v)}
              width={50}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--secondary) / 0.5)', radius: 8 }}
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '12px',
                backdropFilter: 'blur(12px)',
                fontSize: '13px',
              }}
              labelStyle={{ color: 'hsl(var(--card-foreground))', fontWeight: 600 }}
              labelFormatter={(v: string) => getLabel(v)}
              itemStyle={{ color: 'hsl(var(--muted-foreground))' }}
              formatter={(value: number) => [formatCurrency(value), 'Amount']}
            />
            <Bar dataKey="amount" radius={[8, 8, 0, 0]} maxBarSize={48} className="cursor-pointer" onClick={(_: unknown, index: number) => {
              const clicked = data[index].category;
              onCategoryClick?.(clicked === activeCategory ? 'all' : clicked);
            }}>
              {data.map((entry) => (
                <Cell
                  key={entry.category}
                  fill={getColor(entry.category)}
                  opacity={activeCategory && activeCategory !== 'all' && entry.category !== activeCategory ? 0.3 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
