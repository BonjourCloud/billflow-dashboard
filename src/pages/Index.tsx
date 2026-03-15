import { useState } from 'react';
import { useBillStore } from '@/hooks/useBillStore';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { HeroWidget } from '@/components/dashboard/HeroWidget';
import { UpcomingBillsWidget } from '@/components/dashboard/UpcomingBillsWidget';
import { AIInsightsWidget } from '@/components/dashboard/AIInsightsWidget';
import { BillTable } from '@/components/dashboard/BillTable';
import { BillDialog } from '@/components/dashboard/BillDialog';
import { SpendingChartWidget } from '@/components/dashboard/SpendingChartWidget';
import { Bill } from '@/data/bills';

const Index = () => {
  const store = useBillStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);

  const handleAdd = () => { setEditingBill(null); setDialogOpen(true); };
  const handleEdit = (bill: Bill) => { setEditingBill(bill); setDialogOpen(true); };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <DashboardHeader />
        <div className="grid grid-cols-12 gap-4">
          <HeroWidget {...store.stats} />
          <UpcomingBillsWidget bills={store.upcomingBills} />
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
