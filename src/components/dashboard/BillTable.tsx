import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpDown, Filter, Plus, Pencil, Trash2, X, Repeat } from 'lucide-react';
import { Bill, BillStatus, BillCategory, STATUSES } from '@/data/bills';
import { useCategories } from '@/hooks/useCategories';
import { useIsMobile } from '@/hooks/use-mobile';
import { RowActions } from '@/components/RowActions';
import type { BillSortBy } from '@/lib/billSort';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';

interface BillTableProps {
  bills: Bill[];
  filterStatus: BillStatus | 'all';
  setFilterStatus: (s: BillStatus | 'all') => void;
  filterCategory: BillCategory | 'all';
  setFilterCategory: (c: BillCategory | 'all') => void;
  sortBy: BillSortBy;
  setSortBy: (s: BillSortBy) => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (o: 'asc' | 'desc') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAdd: () => void;
  onEdit: (bill: Bill) => void;
  onDelete: (id: string, scope?: 'this' | 'future' | 'all') => void;
}

export function BillTable({
  bills, filterStatus, setFilterStatus, filterCategory, setFilterCategory,
  sortBy, setSortBy, sortOrder, setSortOrder, searchQuery, setSearchQuery,
  onAdd, onEdit, onDelete,
}: BillTableProps) {
  const { categories, getLabel } = useCategories();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);
  const [deleteScopeChoice, setDeleteScopeChoice] = useState<'this' | 'future'>('this');

  const toggleSort = (field: 'dueDate' | 'amount') => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('asc'); }
  };

  const statusBadge = (status: BillStatus) => {
    const cls = status === 'paid' ? 'badge-paid' : status === 'overdue' ? 'badge-overdue' : 'badge-pending';
    return <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${cls} capitalize`}>{status}</span>;
  };

  const isRecurring = Boolean(
    billToDelete && (billToDelete.seriesId || billToDelete.recurrenceType === 'recurring' || billToDelete.isSubscription)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1], delay: 0.3 }}
      className="col-span-12 glass-card rounded-3xl p-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h3 className="font-semibold text-lg">Bill Hub</h3>
        <Button onClick={onAdd} size="sm" className="gap-2 active:scale-95 transition-transform">
          <Plus className="w-4 h-4" /> Add Bill
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search bills..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/40 focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v as BillStatus | 'all')}>
          <SelectTrigger className="w-[140px] bg-secondary/50 border-border/40">
            <Filter className="w-3 h-3 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={v => setFilterCategory(v as BillCategory | 'all')}>
          <SelectTrigger className="w-[160px] bg-secondary/50 border-border/40">
            <Filter className="w-3 h-3 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterStatus !== 'all' || filterCategory !== 'all' || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterStatus('all'); setFilterCategory('all'); setSearchQuery(''); }}
            className="gap-1.5 text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
          >
            <X className="w-3.5 h-3.5" /> Clear filters
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        {isMobile ? (
          <ul className="space-y-2" aria-label="Bills">
            {bills.map(bill => {
              const billIsRecurring = bill.recurrenceType === 'recurring' || bill.isSubscription;
              return (
                <li key={bill._id} className="rounded-2xl border border-border/30 bg-secondary/20 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/bill/${bill._id}`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="font-medium text-sm truncate">{bill.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {billIsRecurring ? 'Recurring' : 'One-time'} · {getLabel(bill.category)}
                      </p>
                    </button>
                    {statusBadge(bill.status)}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="font-mono-data text-base font-semibold">{formatCurrency(bill.amount)}</p>
                      <p className="font-mono-data text-xs text-muted-foreground">
                        Due {format(new Date(bill.dueDate), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <RowActions
                      actions={[
                        { label: `Edit ${bill.name}`, icon: Pencil, onClick: () => onEdit(bill) },
                        {
                          label: `Delete ${bill.name}`,
                          icon: Trash2,
                          tone: 'danger',
                          onClick: () => {
                            setBillToDelete(bill);
                            setDeleteScopeChoice('this');
                          },
                        },
                      ]}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="pb-3 pl-4">Name</th>
              <th className="pb-3">Category</th>
              <th className="pb-3 cursor-pointer select-none" onClick={() => toggleSort('amount')}>
                <span className="inline-flex items-center gap-1">Amount <ArrowUpDown className="w-3 h-3" /></span>
              </th>
              <th className="pb-3 cursor-pointer select-none" onClick={() => toggleSort('dueDate')}>
                <span className="inline-flex items-center gap-1">Due Date <ArrowUpDown className="w-3 h-3" /></span>
              </th>
              <th
                className="pb-3 cursor-pointer select-none"
                onClick={() => setSortBy('smart')}
                title="Needs attention first: overdue, then next due, then paid"
                aria-sort={sortBy === 'smart' ? 'other' : 'none'}
              >
                <span className="inline-flex items-center gap-1">
                  Status {sortBy === 'smart' ? <span className="normal-case text-primary">· priority</span> : <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="pb-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {bills.map(bill => {
                const billIsRecurring = bill.recurrenceType === 'recurring' || bill.isSubscription;
                return (
                  <motion.tr
                    key={bill._id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="group border-t border-border/20 hover:bg-secondary/30 transition-colors duration-150"
                  >
                    <td className="py-3 pl-4">
                      <div
                        className="cursor-pointer hover:text-accent transition-colors"
                        onClick={() => navigate(`/bill/${bill._id}`)}
                      >
                        <p className="font-medium text-sm">{bill.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {billIsRecurring ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                              <Repeat className="w-2.5 h-2.5" /> Recurring
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">One-time</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-sm text-muted-foreground">{getLabel(bill.category)}</td>
                    <td className="py-3 font-mono-data text-sm font-semibold">{formatCurrency(bill.amount)}</td>
                    <td className="py-3 font-mono-data text-sm text-muted-foreground">{format(new Date(bill.dueDate), 'MMM dd, yyyy')}</td>
                    <td className="py-3">{statusBadge(bill.status)}</td>
                    <td className="py-3 pr-4">
                      <RowActions
                        actions={[
                          { label: `Edit ${bill.name}`, icon: Pencil, onClick: () => onEdit(bill) },
                          {
                            label: `Delete ${bill.name}`,
                            icon: Trash2,
                            tone: 'danger',
                            onClick: () => {
                              setBillToDelete(bill);
                              setDeleteScopeChoice('this');
                            },
                          },
                        ]}
                      />
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
        )}
        {bills.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-12">No bills match your filters.</p>
        )}
      </div>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog
        open={!!billToDelete}
        onOpenChange={(open) => {
          if (!open) setBillToDelete(null);
        }}
      >
        <AlertDialogContent className="glass-card border-border/40 sm:rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRecurring ? 'Delete Recurring Bill' : 'Delete Bill'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span>
                Are you sure you want to delete{' '}
                <span className="font-semibold text-foreground">{billToDelete?.name}</span>?
              </span>

              {isRecurring && (
                <div className="pt-2 text-left space-y-2">
                  <p className="text-xs font-semibold text-foreground">Select deletion scope:</p>
                  <div className="space-y-2">
                    <label
                      onClick={() => setDeleteScopeChoice('this')}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        deleteScopeChoice === 'this'
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border/40 bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="deleteScope"
                        checked={deleteScopeChoice === 'this'}
                        onChange={() => setDeleteScopeChoice('this')}
                        className="mt-0.5 text-primary"
                      />
                      <div className="text-xs">
                        <span className="font-medium text-foreground block">
                          Delete this occurrence only
                        </span>
                        <span>Removes this month&apos;s bill. Future recurring cycles continue uninterrupted.</span>
                      </div>
                    </label>

                    <label
                      onClick={() => setDeleteScopeChoice('future')}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        deleteScopeChoice === 'future'
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border/40 bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="deleteScope"
                        checked={deleteScopeChoice === 'future'}
                        onChange={() => setDeleteScopeChoice('future')}
                        className="mt-0.5 text-primary"
                      />
                      <div className="text-xs">
                        <span className="font-medium text-foreground block">
                          Stop all future recurring occurrences
                        </span>
                        <span>Cancels the recurring series. Past paid occurrences remain safely saved in your records.</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="active:scale-95 transition-transform">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-95 transition-transform"
              onClick={() => {
                if (billToDelete) {
                  onDelete(billToDelete._id, isRecurring ? deleteScopeChoice : 'this');
                  setBillToDelete(null);
                }
              }}
            >
              {isRecurring
                ? deleteScopeChoice === 'future'
                  ? 'Stop Future Occurrences'
                  : 'Delete This Occurrence'
                : 'Delete Bill'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
