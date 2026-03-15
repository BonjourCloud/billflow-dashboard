import { useState, useEffect } from 'react';
import { Moon, Sun, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DashboardHeader() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDark);
  }, [isDark]);

  return (
    <header className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-2xl bg-primary/10">
          <Receipt className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">BillFlow</h1>
          <p className="text-xs text-muted-foreground">Subscriptions & Bill Management</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsDark(!isDark)}
        className="rounded-xl active:scale-95 transition-transform"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </Button>
    </header>
  );
}
