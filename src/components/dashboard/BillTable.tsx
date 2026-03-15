import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpDown, Filter, Plus, Pencil, Trash2 } from 'lucide-react';
import { Bill, BillStatus, BillCategory, CATEGORIES, STATUSES } from '@/data/bills';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

interface BillTableProps {
  bills: Bill[];
  filterStatus: BillStatus | 'all';
  setFilterStatus: (s: BillStatus | 'all') => void;
  filterCategory: BillCategory | 'all';
  setFilterCategory: (c: BillCategory | 'all') => void;
  sortBy: 'dueDate' | 'amount';
  setSortBy: (s: 'dueDate' | 'amount') => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (o: 'asc' | 'desc') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAdd: () => void;
  onEdit: (bill: Bill) => void;
  onDelete: (id: string) => void;
}

export function BillTable({
  bills, filterStatus, setFilterStatus, filterCategory, setFilterCategory,
  sortBy, setSortBy, sortOrder, setSortOrder, searchQuery, setSearchQuery,
  onAdd, onEdit, onDelete,
}: BillTableProps) {
  const toggleSort = (field: 'dueDate' | 'amount') => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('asc'); }
  };

  const statusBadge = (status: BillStatus) => {
    const cls = status === 'paid' ? 'badge-paid' : status === 'overdue' ? 'badge-overdue' : 'badge-pending';
    return <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${cls} capitalize`}>{status}</span>;
  };

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
            {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
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
              <th className="pb-3">Status</th>
              <th className="pb-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {bills.map(bill => (
                <motion.tr
                  key={bill.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="group border-t border-border/20 hover:bg-secondary/30 transition-colors duration-150"
                >
                  <td className="py-3 pl-4">
                    <div>
                      <p className="font-medium text-sm">{bill.name}</p>
                      {bill.isSubscription && <span className="text-xs text-muted-foreground">Recurring</span>}
                    </div>
                  </td>
                  <td className="py-3 capitalize text-sm text-muted-foreground">{bill.category}</td>
                  <td className="py-3 font-mono-data text-sm font-semibold">${bill.amount.toFixed(2)}</td>
                  <td className="py-3 font-mono-data text-sm text-muted-foreground">{format(new Date(bill.dueDate), 'MMM dd, yyyy')}</td>
                  <td className="py-3">{statusBadge(bill.status)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 active:scale-95" onClick={() => onEdit(bill)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive active:scale-95" onClick={() => onDelete(bill.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {bills.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-12">No bills match your filters.</p>
        )}
      </div>
    </motion.div>
  );
}
