import { useState } from 'react';
import { useCategories } from '@/hooks/useCategories';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Landmark,
  Calendar,
  TrendingUp,
  Percent,
  Clock,
  Pencil,
  Ban,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import {
  useInstallmentPlan,
  useInstallmentStore,
} from '@/hooks/useInstallmentStore';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { InstallmentDialog } from '@/components/installments/InstallmentDialog';
import {
  PlanStatus,
  PLAN_TYPE_LABELS,
} from '@/data/installments';
import { BillStatus } from '@/data/bills';
import { Button } from '@/components/ui/button';
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
import { formatCurrency } from '@/lib/currency';

export default function InstallmentDetail() {
  const { getLabel } = useCategories();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useInstallmentPlan(id);
  const { updatePlan, isUpdating, cancelPlan, isCancelling } =
    useInstallmentStore();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <DashboardHeader />
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data || !data.plan) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <DashboardHeader />
          <div className="glass-card rounded-3xl p-8 text-center max-w-md mx-auto my-16 space-y-4 border-destructive/30">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-foreground">
                Installment Plan Not Found
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {error instanceof Error
                  ? error.message
                  : 'The requested installment plan could not be retrieved or does not exist.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" onClick={() => navigate('/installments')}>
                Back to Plans
              </Button>
              <Button onClick={() => refetch()}>Try Again</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { plan, installments } = data;

  const paidPercent =
    plan.scheduledTotal > 0
      ? Math.min(100, Math.round((plan.totalPaid / plan.scheduledTotal) * 100))
      : 0;

  const getStatusBadge = (status: PlanStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Active Plan
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-sky-500/10 text-sky-500 border border-sky-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
            <XCircle className="w-3.5 h-3.5" />
            Cancelled
          </span>
        );
    }
  };

  const getBillStatusBadge = (status: BillStatus) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Paid
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
            <AlertTriangle className="w-3 h-3" />
            Overdue
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  const handleConfirmCancel = async () => {
    if (!id || isCancelling) return;
    try {
      await cancelPlan(id);
      setCancelDialogOpen(false);
      refetch();
    } catch {
      // Toast is handled in useInstallmentStore
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <DashboardHeader />

        {/* Back and Breadcrumb navigation */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/installments')}
            className="gap-1.5 h-8 px-2 text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Installments
          </Button>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="font-medium text-foreground truncate max-w-xs">
            {plan.name}
          </span>
        </div>

        {/* Plan Header Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-3xl p-6 sm:p-8 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {plan.name}
                </h1>
                {getStatusBadge(plan.status)}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2.5 py-0.5 rounded-lg bg-secondary/80 font-medium">
                  {getLabel(plan.category)}
                </span>
                <span>•</span>
                <span>{PLAN_TYPE_LABELS[plan.planType] || plan.planType}</span>
                <span>•</span>
                <span>Created {format(new Date(plan.createdAt), 'MMM dd, yyyy')}</span>
              </div>
            </div>

            {/* Actions for Active plans */}
            {plan.status === 'active' && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditDialogOpen(true)}
                  className="gap-1.5 h-9"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Details
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelDialogOpen(true)}
                  className="gap-1.5 h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Cancel Plan
                </Button>
              </div>
            )}
          </div>

          {/* Progress Bar & Payoff Stats */}
          <div className="rounded-2xl p-4 bg-secondary/30 border border-border/40 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Payoff Progress</span>
              <span className="font-bold font-mono-data text-foreground">{paidPercent}% Complete</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
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
            <div className="flex items-center justify-between text-xs font-mono-data text-muted-foreground pt-1">
              <span>{formatCurrency(plan.totalPaid)} Paid</span>
              <span>{formatCurrency(plan.remainingBalance)} Remaining</span>
            </div>
          </div>

          {/* Financial Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/30">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1">
                Principal Amount
              </span>
              <p className="text-base sm:text-lg font-bold font-mono-data text-foreground">
                {formatCurrency(plan.principalAmount)}
              </p>
              {plan.downPayment > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Down payment: {formatCurrency(-plan.downPayment)}
                </p>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/30">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1">
                Financed Debt
              </span>
              <p className="text-base sm:text-lg font-bold font-mono-data text-foreground">
                {formatCurrency(plan.financedAmount)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Principal - Down Payment
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/30">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1">
                Total Interest
              </span>
              <p className="text-base sm:text-lg font-bold font-mono-data text-accent">
                {formatCurrency(plan.totalInterest)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {plan.interestRate > 0 ? `${plan.interestRate}% flat p.a.` : '0% flat interest'}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/30">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1">
                Monthly Payment
              </span>
              <p className="text-base sm:text-lg font-bold font-mono-data text-primary">
                {formatCurrency(plan.installmentAmount)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {plan.totalInstallments} total months
              </p>
            </div>
          </div>
        </motion.div>

        {/* Installments Schedule Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-3xl p-6 sm:p-8 space-y-4"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-border/40 pb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Installment Schedule</h2>
              <p className="text-xs text-muted-foreground">
                {installments.length} scheduled installment bills. Click any installment to record payments or view receipts.
              </p>
            </div>
            {plan.status === 'cancelled' && (
              <span className="text-xs text-destructive bg-destructive/10 px-3 py-1 rounded-full border border-destructive/20">
                Plan cancelled • Unpaid occurrences removed
              </span>
            )}
          </div>

          {installments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No installment bills found for this plan.
            </div>
          ) : (
            <div className="space-y-2">
              {installments.map((installment, idx) => {
                const num = installment.installmentNumber || idx + 1;
                const total = installment.totalInstallments || plan.totalInstallments;

                return (
                  <div
                    key={installment._id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-secondary/20 hover:bg-secondary/40 transition-colors border border-border/30"
                  >
                    {/* Left: Installment # and Due Date */}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-xs font-bold font-mono-data text-muted-foreground">
                        #{num}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">
                          Installment {num} of {total}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
                          Due {format(new Date(installment.dueDate), 'MMMM dd, yyyy')}
                        </p>
                      </div>
                    </div>

                    {/* Right: Amount, Status, and Action Link */}
                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <div className="text-right">
                        <p className="font-bold font-mono-data text-sm text-foreground">
                          {formatCurrency(installment.amount)}
                        </p>
                        <div className="mt-0.5">
                          {getBillStatusBadge(installment.status)}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="gap-1.5 text-xs text-primary hover:text-primary hover:bg-primary/10 h-8 px-3"
                      >
                        <Link to={`/bill/${installment._id}`}>
                          <span>{installment.status === 'paid' ? 'View Bill' : 'View / Pay'}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>
              All payments made against installment bills automatically sync to your plan balance in real time.
            </span>
          </div>
        </motion.div>

        {/* Edit Dialog */}
        <InstallmentDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          plan={plan}
          onSave={async () => {}}
          onUpdate={async (planId, updates) => {
            await updatePlan({ id: planId, updates });
            refetch();
          }}
          isPending={isUpdating}
        />

        {/* Cancel Confirmation Alert Dialog */}
        <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Cancel Installment Plan?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 pt-2 text-foreground/80">
                <p>
                  Are you sure you want to cancel <strong>{plan.name}</strong>?
                </p>
                <p className="text-xs text-muted-foreground">
                  • All <strong>unpaid</strong> future installments and their scheduled notifications will be permanently deleted.
                  <br />
                  • All <strong>paid</strong> installments, payment records, and receipts will remain safely stored in your history.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCancelling}>Keep Plan</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
