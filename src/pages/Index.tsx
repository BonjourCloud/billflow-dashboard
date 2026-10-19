import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useBillStore } from '@/hooks/useBillStore';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { HeroWidget } from '@/components/dashboard/HeroWidget';
import { UpcomingBillsWidget } from '@/components/dashboard/UpcomingBillsWidget';
import { AIInsightsWidget } from '@/components/dashboard/AIInsightsWidget';
import { BillTable } from '@/components/dashboard/BillTable';
import { BillDialog } from '@/components/dashboard/BillDialog';
import { SpendingChartWidget } from '@/components/dashboard/SpendingChartWidget';
import { Button } from '@/components/ui/button';
import { Bill } from '@/data/bills';

const Index = () => {
  const store = useBillStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);

  const handleAdd = () => { setEditingBill(null); setDialogOpen(true); };
  const handleEdit = (bill: Bill) => { setEditingBill(bill); setDialogOpen(true); };

  if (store.isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <DashboardHeader />
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (store.isError) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <DashboardHeader />
          <div className="glass-card rounded-3xl p-8 text-center max-w-md mx-auto my-16 space-y-4 border-destructive/30">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-foreground">Failed to load bills</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {store.error instanceof Error ? store.error.message : 'Unable to retrieve your bills from the server.'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => store.refetch()} className="active:scale-95 transition-transform">
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <DashboardHeader />
        <div className="grid grid-cols-12 gap-4">
          <HeroWidget {...store.stats} />
          <UpcomingBillsWidget bills={store.upcomingBills} />
          <SpendingChartWidget bills={store.allBills} activeCategory={store.filterCategory} onCategoryClick={(cat) => store.setFilterCategory(cat as any)} />
          <AIInsightsWidget />
          <BillTable
            bills={store.bills}
            filterStatus={store.filterStatus}
            setFilterStatus={store.setFilterStatus}
            filterCategory={store.filterCategory}
            setFilterCategory={store.setFilterCategory}
            sortBy={store.sortBy}
            setSortBy={store.setSortBy}
            sortOrder={store.sortOrder}
            setSortOrder={store.setSortOrder}
            searchQuery={store.searchQuery}
            setSearchQuery={store.setSearchQuery}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={store.deleteBill}
          />
        </div>
      </div>
      <BillDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bill={editingBill}
        onSave={store.addBill}
        onUpdate={store.updateBill}
      />
    </div>
  );
};

export default Index;
