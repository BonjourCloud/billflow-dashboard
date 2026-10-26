import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Landmark,
  Plus,
  Search,
  Filter,
  X,
  Calendar,
  IndianRupee,
  TrendingUp,
  Percent,
  AlertCircle,
  Clock,
  ArrowRight,
  ArrowUpDown,
  CreditCard,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  useInstallmentStore,
  InstallmentSortField,
} from '@/hooks/useInstallmentStore';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { InstallmentDialog } from '@/components/installments/InstallmentDialog';
import {
  InstallmentPlan,
  PlanStatus,
  PLAN_TYPE_LABELS,
  PLAN_STATUS_LABELS,
  InstallmentFilterStatus,
} from '@/data/installments';
import { BillCategory } from '@/data/bills';
import { useCategories } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/currency';

export default function Installments() {
  const { categories, getLabel } = useCategories();
  const navigate = useNavigate();
  const store = useInstallmentStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<InstallmentPlan | null>(null);

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setDialogOpen(true);
  };

  const getStatusBadge = (status: PlanStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-500 border border-sky-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
            <XCircle className="w-3 h-3" />
            Cancelled
          </span>
        );
    }
  };

  if (store.isLoading && store.allPlans.length === 0) {
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
              <h3 className="font-semibold text-base text-foreground">
                Failed to load installment plans
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {store.error instanceof Error
                  ? store.error.message
                  : 'An unexpected server error occurred.'}
              </p>
            </div>
            <Button onClick={() => store.refetch()} variant="outline">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasActiveFilters =
    store.filterStatus !== 'all' ||
    store.filterCategory !== 'all' ||
    Boolean(store.searchQuery.trim());

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <DashboardHeader />

        {/* Page Title & Create CTA */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Installment & EMI Plans</h1>
            <p className="text-sm text-muted-foreground">
              Manage vehicle loans, credit card EMIs, personal financing, and scheduled payoffs.
            </p>
          </div>
          <Button onClick={handleOpenCreate} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Create Plan
          </Button>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Plans */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-3xl p-5"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Active Plans</span>
              <Landmark className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold font-mono-data text-foreground">
              {store.summaryMetrics.activeCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {store.summaryMetrics.completedCount} completed • {store.summaryMetrics.cancelledCount} cancelled
            </p>
          </motion.div>

          {/* Remaining Balance */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass-card rounded-3xl p-5"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Remaining Balance</span>
              <IndianRupee className="w-4 h-4 text-accent" />
            </div>
            <p className="text-2xl font-bold font-mono-data text-foreground">
              {formatCurrency(store.summaryMetrics.totalRemainingBalance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Across {store.summaryMetrics.activeCount} active financing plans
            </p>
          </motion.div>

          {/* Monthly Commitment */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card rounded-3xl p-5"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Monthly Commitment</span>
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold font-mono-data text-foreground">
              {formatCurrency(store.summaryMetrics.monthlyCommitment)}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Sum of active installment bills
            </p>
          </motion.div>

          {/* Total Paid */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card rounded-3xl p-5"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Total Paid</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold font-mono-data text-emerald-500">
              {formatCurrency(store.summaryMetrics.totalPaid)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Recorded payments across all plans
            </p>
          </motion.div>
        </div>

        {/* Filter & Search Bar */}
        <div className="glass-card rounded-3xl p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search plans by name, type, or category..."
                value={store.searchQuery}
                onChange={(e) => store.setSearchQuery(e.target.value)}
                className="pl-9 bg-background/50"
              />
              {store.searchQuery && (
                <button
                  type="button"
                  onClick={() => store.setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Pills */}
            <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-2xl border border-border/40 overflow-x-auto">
              {(['all', 'active', 'completed', 'cancelled'] as InstallmentFilterStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => store.setFilterStatus(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all whitespace-nowrap ${
                    store.filterStatus === st
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Category Dropdown */}
            <Select
              value={store.filterCategory}
              onValueChange={(val: BillCategory | 'all') => store.setFilterCategory(val)}
            >
              <SelectTrigger className="w-[160px] bg-background/50">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.slug} value={cat.slug}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort Dropdown */}
            <Select
              value={store.sortBy}
              onValueChange={(val: InstallmentSortField) => store.setSortBy(val)}
            >
              <SelectTrigger className="w-[170px] bg-background/50">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Date Created</SelectItem>
                <SelectItem value="remainingBalance">Remaining Balance</SelectItem>
                <SelectItem value="installmentAmount">Monthly Payment</SelectItem>
                <SelectItem value="totalPaid">Total Paid</SelectItem>
                <SelectItem value="name">Plan Name</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => store.setSortOrder(store.sortOrder === 'asc' ? 'desc' : 'asc')}
              title={`Sort ${store.sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
              className="shrink-0"
            >
              <ArrowUpDown className="w-4 h-4" />
            </Button>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
              <span>
                Showing {store.filteredPlans.length} of {store.allPlans.length} plans
              </span>
              <button
                type="button"
                onClick={store.resetFilters}
                className="text-primary hover:underline"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>

        {/* Plans Grid / Empty States */}
        {store.allPlans.length === 0 ? (
          <div className="glass-card rounded-3xl p-12 text-center max-w-md mx-auto my-12 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Landmark className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">No Installment Plans Yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Keep track of EMIs, vehicle loans, and large purchases with finite payment schedules and live payoff progress.
              </p>
            </div>
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Your First Plan
            </Button>
          </div>
        ) : store.filteredPlans.length === 0 ? (
          <div className="glass-card rounded-3xl p-12 text-center max-w-md mx-auto my-12 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto text-muted-foreground">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-foreground">No matching plans</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No installment plans matched your current filter or search criteria.
              </p>
            </div>
            <Button variant="outline" onClick={store.resetFilters}>
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {store.filteredPlans.map((plan) => {
                const paidPercent =
                  plan.scheduledTotal > 0
                    ? Math.min(100, Math.round((plan.totalPaid / plan.scheduledTotal) * 100))
                    : 0;

                return (
                  <motion.div
                    key={plan._id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => navigate(`/installments/${plan._id}`)}
                    className="glass-card rounded-3xl p-6 cursor-pointer hover:border-primary/40 hover:shadow-lg transition-all group flex flex-col justify-between"
                  >
                    <div>
                      {/* Header: Title, Category, Status */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base text-foreground group-hover:text-primary transition-colors truncate">
                            {plan.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{getLabel(plan.category)}</span>
                            <span>•</span>
                            <span>{PLAN_TYPE_LABELS[plan.planType] || plan.planType}</span>
                          </div>
                        </div>
                        {getStatusBadge(plan.status)}
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5 my-4">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-semibold font-mono-data">{paidPercent}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              plan.status === 'completed'
                                ? 'bg-sky-500'
                                : plan.status === 'cancelled'
                                ? 'bg-muted-foreground'
                                : 'bg-primary'
                            }`}
                            style={{ width: `${paidPercent}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono-data">
                          <span>{formatCurrency(plan.totalPaid)} paid</span>
                          <span>{formatCurrency(plan.scheduledTotal)} total</span>
                        </div>
                      </div>

                      {/* Financial Detail Grid */}
                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/40 text-xs">
                        <div>
                          <p className="text-muted-foreground">Monthly Payment</p>
                          <p className="font-semibold font-mono-data text-foreground mt-0.5">
                            {formatCurrency(plan.installmentAmount)}
                            <span className="text-[10px] font-normal text-muted-foreground"> /mo</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Remaining Balance</p>
                          <p className="font-semibold font-mono-data text-foreground mt-0.5">
                            {formatCurrency(plan.remainingBalance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Financed Term</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {plan.totalInstallments} months
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Interest Rate</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {plan.interestRate > 0 ? `${plan.interestRate}% flat` : '0% (No interest)'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Link indicator */}
                    <div className="pt-4 mt-3 border-t border-border/30 flex items-center justify-between text-xs text-primary font-medium">
                      <span>View Schedule & Details</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Dialog for Creating / Editing */}
        <InstallmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          plan={editingPlan}
          onSave={store.createPlan}
          onUpdate={(id, updates) => store.updatePlan({ id, updates })}
          isPending={store.isCreating || store.isUpdating}
        />
      </div>
    </div>
  );
}
