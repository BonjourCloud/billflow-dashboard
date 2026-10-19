import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  X,
  Repeat,
  Pencil,
  Trash2,
  Ban,
  AlertCircle,
  Calendar,
  Sparkles,
  ArrowUpDown,
} from 'lucide-react';
import { useSubscriptionStore } from '@/hooks/useSubscriptionStore';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SubscriptionDialog } from '@/components/subscriptions/SubscriptionDialog';
import { Subscription } from '@/data/subscriptions';
import { BillCategory, CATEGORIES } from '@/data/bills';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export default function Subscriptions() {
  const store = useSubscriptionStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [cancellingSub, setCancellingSub] = useState<Subscription | null>(null);
  const [deletingSub, setDeletingSub] = useState<Subscription | null>(null);
  const [deleteScope, setDeleteScope] = useState<'future' | 'all'>('future');

  const handleAdd = () => {
    setEditingSub(null);
    setDialogOpen(true);
  };

  const handleEdit = (sub: Subscription) => {
    setEditingSub(sub);
    setDialogOpen(true);
  };

  const toggleSort = (field: 'name' | 'amount' | 'recurringDay') => {
    if (store.sortBy === field) {
      store.setSortOrder(store.sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      store.setSortBy(field);
      store.setSortOrder('asc');
    }
  };

  if (store.isLoading && store.allSubscriptions.length === 0) {
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
                Failed to load subscriptions
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {store.error instanceof Error
                  ? store.error.message
                  : 'Unable to retrieve your subscriptions from the server.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => store.refetch()}
              className="active:scale-95 transition-transform"
            >
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <DashboardHeader />

        {/* Top Summary Metrics Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="glass-card rounded-3xl p-6 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Subscriptions
              </span>
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Repeat className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-4xl font-bold font-mono-data tracking-tight">
                {store.stats.activeCount}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {store.stats.endedCount} ended or cancelled series
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="glass-card rounded-3xl p-6 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Monthly Commitment
              </span>
              <div className="p-2 rounded-xl bg-accent/10 text-accent">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-4xl font-bold font-mono-data tracking-tight">
                $
                {store.stats.monthlyRunRate.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Committed across {store.stats.activeCount} active recurring services
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="glass-card rounded-3xl p-6 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Annualized Commitment
              </span>
              <div className="p-2 rounded-xl bg-[hsl(var(--status-pending))]/10 text-[hsl(var(--status-pending))]">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-4xl font-bold font-mono-data tracking-tight">
                $
                {store.stats.annualRunRate.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Estimate based on current active monthly recurring series
              </p>
            </div>
          </motion.div>
        </div>

        {/* Subscriptions Table Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
          className="glass-card rounded-3xl p-6"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Subscription Hub
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage standing recurring subscriptions and services
              </p>
            </div>
            <Button
              onClick={handleAdd}
              size="sm"
              className="gap-2 active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4" /> Add Subscription
            </Button>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search subscriptions..."
                value={store.searchQuery}
                onChange={(e) => store.setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/40 focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            <Select
              value={store.filterStatus}
              onValueChange={(v) =>
                store.setFilterStatus(v as 'all' | 'active' | 'inactive')
              }
            >
              <SelectTrigger className="w-[140px] bg-secondary/50 border-border/40">
                <Filter className="w-3 h-3 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Cancelled / Ended</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={store.filterCategory}
              onValueChange={(v) =>
                store.setFilterCategory(v as BillCategory | 'all')
              }
            >
              <SelectTrigger className="w-[160px] bg-secondary/50 border-border/40">
                <Filter className="w-3 h-3 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(store.filterStatus !== 'all' ||
              store.filterCategory !== 'all' ||
              store.searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  store.setFilterStatus('all');
                  store.setFilterCategory('all');
                  store.setSearchQuery('');
                }}
                className="gap-1.5 text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
              >
                <X className="w-3.5 h-3.5" /> Clear filters
              </Button>
            )}
          </div>

          {/* Subscriptions Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th
                    className="pb-3 pl-4 cursor-pointer select-none"
                    onClick={() => toggleSort('name')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Service Name <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="pb-3">Category</th>
                  <th className="pb-3">Cadence</th>
                  <th
                    className="pb-3 cursor-pointer select-none"
                    onClick={() => toggleSort('recurringDay')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Renewal Day <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="pb-3 cursor-pointer select-none"
                    onClick={() => toggleSort('amount')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Monthly Cost <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {store.subscriptions.map((sub) => {
                    const statusCls = sub.isActive
                      ? 'badge-paid'
                      : 'badge-overdue';

                    return (
                      <motion.tr
                        key={sub._id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="group border-t border-border/20 hover:bg-secondary/30 transition-colors duration-150"
                      >
                        <td className="py-3 pl-4 font-medium text-sm">
                          <div className="flex items-center gap-2">
                            <Repeat className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>{sub.name}</span>
                          </div>
                        </td>
                        <td className="py-3 capitalize text-sm text-muted-foreground">
                          {sub.category}
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">
                          Monthly
                        </td>
                        <td className="py-3 text-sm text-muted-foreground font-mono-data">
                          Day {sub.recurringDay} ({sub.recurringDay}
                          {getOrdinalSuffix(sub.recurringDay)})
                        </td>
                        <td className="py-3 font-mono-data text-sm font-semibold">
                          ${sub.amount.toFixed(2)}
                          <span className="text-xs text-muted-foreground font-normal">
                            /mo
                          </span>
                        </td>
                        <td className="py-3">
                          <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusCls} capitalize`}
                          >
                            {sub.isActive ? 'Active' : 'Ended'}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Edit subscription"
                              className="h-8 w-8 active:scale-95"
                              onClick={() => handleEdit(sub)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {sub.isActive && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Cancel subscription"
                                className="h-8 w-8 text-amber-500 hover:text-amber-600 active:scale-95"
                                onClick={() => setCancellingSub(sub)}
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Delete subscription"
                              className="h-8 w-8 text-destructive active:scale-95"
                              onClick={() => {
                                setDeletingSub(sub);
                                setDeleteScope('future');
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>

            {store.subscriptions.length === 0 && (
              <div className="text-center py-16 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-secondary/50 text-muted-foreground flex items-center justify-center mx-auto">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-base">
                  {store.allSubscriptions.length === 0
                    ? 'No subscriptions recorded yet'
                    : 'No subscriptions match your filters'}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {store.allSubscriptions.length === 0
                    ? 'Add recurring services like Netflix, Spotify, AWS, or gym memberships to monitor your monthly commitments.'
                    : 'Try clearing your filters or search query to see other subscriptions.'}
                </p>
                {store.allSubscriptions.length === 0 && (
                  <Button
                    onClick={handleAdd}
                    size="sm"
                    className="mt-2 gap-2 active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> Add your first subscription
                  </Button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Subscription Dialog (Add / Edit) */}
      <SubscriptionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subscription={editingSub}
        onSave={store.addSubscription}
        onUpdate={store.updateSubscription}
        isPending={store.isAdding || store.isUpdating}
      />

      {/* Cancel Confirmation Dialog */}
      <AlertDialog
        open={!!cancellingSub}
        onOpenChange={(open) => {
          if (!open) setCancellingSub(null);
        }}
      >
        <AlertDialogContent className="glass-card border-border/40 sm:rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span>
                Are you sure you want to cancel{' '}
                <span className="font-semibold text-foreground">
                  {cancellingSub?.name}
                </span>
                ?
              </span>
              <span className="block text-xs text-muted-foreground pt-1">
                Cancelling will stop all future monthly renewals. Any past paid
                records will remain safely preserved in your history.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={store.isCancelling}
              className="active:scale-95"
            >
              Keep Subscription
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={store.isCancelling}
              className="bg-amber-600 text-white hover:bg-amber-700 active:scale-95"
              onClick={() => {
                if (cancellingSub) {
                  store.cancelSubscription(cancellingSub._id);
                  setCancellingSub(null);
                }
              }}
            >
              {store.isCancelling ? 'Cancelling…' : 'Stop Renewals'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingSub}
        onOpenChange={(open) => {
          if (!open) setDeletingSub(null);
        }}
      >
        <AlertDialogContent className="glass-card border-border/40 sm:rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subscription</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span>
                Are you sure you want to delete{' '}
                <span className="font-semibold text-foreground">
                  {deletingSub?.name}
                </span>
                ?
              </span>

              <div className="pt-2 text-left space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  Select deletion scope:
                </p>
                <div className="space-y-2">
                  <label
                    onClick={() => setDeleteScope('future')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      deleteScope === 'future'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border/40 bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deleteSubScope"
                      checked={deleteScope === 'future'}
                      onChange={() => setDeleteScope('future')}
                      className="mt-0.5 text-primary"
                    />
                    <div className="text-xs">
                      <span className="font-medium text-foreground block">
                        Stop future renewals only (Recommended)
                      </span>
                      <span>
                        Stops the subscription series. All past paid bills
                        remain in your financial records.
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => setDeleteScope('all')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      deleteScope === 'all'
                        ? 'border-destructive bg-destructive/10 text-foreground'
                        : 'border-border/40 bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deleteSubScope"
                      checked={deleteScope === 'all'}
                      onChange={() => setDeleteScope('all')}
                      className="mt-0.5 text-destructive"
                    />
                    <div className="text-xs">
                      <span className="font-medium text-foreground block">
                        Delete entire subscription & all history
                      </span>
                      <span>
                        Permanently deletes this series and all associated bill
                        occurrences, including historical payment records.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={store.isDeleting}
              className="active:scale-95"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={store.isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-95"
              onClick={() => {
                if (deletingSub) {
                  store.deleteSubscription(deletingSub._id, deleteScope);
                  setDeletingSub(null);
                }
              }}
            >
              {store.isDeleting
                ? 'Deleting…'
                : deleteScope === 'all'
                  ? 'Delete All Records'
                  : 'Stop Future Renewals'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
