import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Receipt,
  CreditCard,
  Landmark,
  Check,
  Search,
  ShieldCheck,
  X,
  FileSpreadsheet,
  AlertCircle,
  Clock,
  Send,
  Building2,
} from 'lucide-react';
import { formatMonthName, getNextMonthString, getPreviousMonthString, normalizeMonthString } from '../../utils/feeMath';
import { PaymentMode } from '../../types';

interface MonthEndWizardPanelProps {
  initialMonth?: string;
  onNavigateToTab?: (tab: 'dashboard' | 'vouchers' | 'collections' | 'defaulters') => void;
}

export const MonthEndWizardPanel: React.FC<MonthEndWizardPanelProps> = ({
  initialMonth,
  onNavigateToTab,
}) => {
  const {
    vouchers,
    transactions,
    students,
    classes,
    bankAccounts,
    activeMonth,
    setActiveMonth,
    getMonthClosureStatus,
    lockedMonths,
    lockMonth,
    unlockMonth,
    isMonthLocked,
    bulkCarryForwardDefaulters,
    collectVoucherPayment,
    defaultLateFeeRate,
    currentUser,
    hasPermission,
    showToast,
  } = useApp();

  // Find unclosed months with vouchers
  const prevMonthStr = getPreviousMonthString(activeMonth);
  const prevMonthStatus = getMonthClosureStatus(prevMonthStr);

  // Default target month:
  // Prefer unclosed previous month if it has vouchers, else initialMonth, else activeMonth
  const defaultTarget = useMemo(() => {
    if (initialMonth) return initialMonth;
    if (!prevMonthStatus.isClosed && prevMonthStatus.totalVouchers > 0) {
      return prevMonthStr;
    }
    return activeMonth;
  }, [initialMonth, prevMonthStatus, prevMonthStr, activeMonth]);

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultTarget);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Available unique months from existing vouchers
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      const norm = normalizeMonthString(v.month);
      if (norm && /^\d{4}-\d{2}$/.test(norm)) set.add(norm);
    });
    const normActive = normalizeMonthString(activeMonth);
    if (normActive && /^\d{4}-\d{2}$/.test(normActive)) set.add(normActive);
    const normPrev = normalizeMonthString(prevMonthStr);
    if (normPrev && /^\d{4}-\d{2}$/.test(normPrev)) set.add(normPrev);
    return Array.from(set).sort().reverse();
  }, [vouchers, activeMonth, prevMonthStr]);

  const monthStatus = getMonthClosureStatus(selectedMonth);
  const isLocked = isMonthLocked(selectedMonth);
  const nextMonthStr = getNextMonthString(selectedMonth);

  // Vouchers for this month
  const monthVouchers = useMemo(() => {
    return vouchers.filter((v) => v.month === selectedMonth && v.status !== 'Reversed');
  }, [vouchers, selectedMonth]);

  // Outstanding / Uncarried Defaulters for this month
  const uncarriedDefaulters = useMemo(() => {
    return monthVouchers.filter(
      (v) =>
        (v.status === 'Issued' || v.status === 'Partial') &&
        v.netDue > 0 &&
        v.amountPaid < v.netDue
    );
  }, [monthVouchers]);

  // Transactions for this month
  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => t.month === selectedMonth);
  }, [transactions, selectedMonth]);

  // Financial aggregates
  const financialSummary = useMemo(() => {
    const totalGross = monthVouchers.reduce((sum, v) => sum + (v.grossTotal || 0), 0);
    const totalDiscounts = monthVouchers.reduce((sum, v) => sum + (v.discountTotal || 0), 0);
    const totalNetDue = monthVouchers.reduce((sum, v) => sum + v.netDue, 0);
    const totalCollected = monthVouchers.reduce((sum, v) => sum + v.amountPaid, 0);
    const totalOutstanding = monthVouchers.reduce(
      (sum, v) => sum + Math.max(0, v.netDue - v.amountPaid),
      0
    );

    const paidCount = monthVouchers.filter(
      (v) => v.status === 'Paid' || (v.netDue <= 0 && v.status !== 'Carried')
    ).length;
    const partialCount = monthVouchers.filter((v) => v.status === 'Partial').length;
    const carriedCount = monthVouchers.filter((v) => v.status === 'Carried').length;
    const zeroDueCount = monthVouchers.filter((v) => v.netDue <= 0).length;

    const collectionRate = totalNetDue > 0 ? Math.round((totalCollected / totalNetDue) * 100) : 100;

    // Payment mode breakdown from transactions
    const modeBreakdown = {
      Cash: { amount: 0, count: 0 },
      BankTransfer: { amount: 0, count: 0 },
      Cheque: { amount: 0, count: 0 },
      Online: { amount: 0, count: 0 },
    };

    monthTransactions.forEach((t) => {
      const mode = (t.paymentMode || 'Cash') as keyof typeof modeBreakdown;
      if (modeBreakdown[mode]) {
        modeBreakdown[mode].amount += t.amount;
        modeBreakdown[mode].count += 1;
      } else {
        modeBreakdown.Cash.amount += t.amount;
        modeBreakdown.Cash.count += 1;
      }
    });

    return {
      totalGross,
      totalDiscounts,
      totalNetDue,
      totalCollected,
      totalOutstanding,
      paidCount,
      partialCount,
      carriedCount,
      zeroDueCount,
      collectionRate,
      modeBreakdown,
    };
  }, [monthVouchers, monthTransactions]);

  // Step 2 checklist items
  const [checklist, setChecklist] = useState<{
    cashCounted: boolean;
    bankVerified: boolean;
    chequesCleared: boolean;
    discountsAudited: boolean;
  }>({
    cashCounted: false,
    bankVerified: false,
    chequesCleared: false,
    discountsAudited: false,
  });

  const toggleChecklist = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Step 2 transaction filter & search
  const [txnSearch, setTxnSearch] = useState('');
  const [txnModeFilter, setTxnModeFilter] = useState<'All' | PaymentMode>('All');

  const filteredTransactions = useMemo(() => {
    return monthTransactions.filter((t) => {
      if (txnModeFilter !== 'All' && t.paymentMode !== txnModeFilter) return false;
      if (!txnSearch.trim()) return true;
      const q = txnSearch.toLowerCase();
      const student = students.find((s) => s.id === t.studentId);
      return (
        t.txnNo.toLowerCase().includes(q) ||
        (student?.name || '').toLowerCase().includes(q) ||
        (student?.regNo || '').toLowerCase().includes(q) ||
        (t.referenceNo || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      );
    });
  }, [monthTransactions, txnModeFilter, txnSearch, students]);

  // Step 3 Carry-forward settings
  const [addLateFine, setAddLateFine] = useState(true);
  const [lateFineAmount, setLateFineAmount] = useState<number>(defaultLateFeeRate || 500);
  const [isProcessingCarry, setIsProcessingCarry] = useState(false);

  // Quick payment modal in Step 3
  const [collectingVoucher, setCollectingVoucher] = useState<{
    voucherId: string;
    studentName: string;
    voucherNo: string;
    balance: number;
    amount: number;
    mode: PaymentMode;
    refNo: string;
    notes: string;
    date: string;
  } | null>(null);

  // Step 4 Lock notes and settings
  const [closureNotes, setClosureNotes] = useState('');
  const [advanceActiveMonth, setAdvanceActiveMonth] = useState(true);
  const [isLocking, setIsLocking] = useState(false);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);

  // Execute Carry Forward
  const handleCarryForwardAll = () => {
    if (uncarriedDefaulters.length === 0) return;
    setIsProcessingCarry(true);

    try {
      const ids = uncarriedDefaulters.map((v) => v.id);
      const res = bulkCarryForwardDefaulters(
        ids,
        nextMonthStr,
        addLateFine,
        addLateFine ? lateFineAmount : undefined
      );

      if (res.success || res.successCount > 0) {
        showToast(
          `Successfully carried forward ${res.successCount} defaulter(s) to ${formatMonthName(nextMonthStr)}.`,
          'success'
        );
      } else {
        const errorMsg = res.errors && res.errors.length > 0 ? res.errors[0] : 'Failed to carry forward defaulters.';
        showToast(errorMsg, 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'An error occurred during carry-forward.', 'error');
    } finally {
      setIsProcessingCarry(false);
    }
  };

  // Quick Payment Collection Submit
  const handleQuickCollect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectingVoucher) return;
    if (collectingVoucher.amount <= 0) {
      showToast('Payment amount must be greater than 0.', 'error');
      return;
    }

    const res = collectVoucherPayment(
      collectingVoucher.voucherId,
      collectingVoucher.amount,
      collectingVoucher.mode,
      collectingVoucher.date,
      collectingVoucher.refNo,
      collectingVoucher.notes
    );

    if (res.success) {
      showToast(`Payment of Rs ${collectingVoucher.amount.toLocaleString()} recorded successfully.`, 'success');
      setCollectingVoucher(null);
    } else {
      showToast(res.error || 'Failed to record payment.', 'error');
    }
  };

  // Final Lock Fee Books
  const handleFinalLock = () => {
    if (uncarriedDefaulters.length > 0) {
      showToast('Cannot lock fee books: outstanding defaulters must be carried forward first.', 'error');
      return;
    }

    setIsLocking(true);
    const res = lockMonth(
      selectedMonth,
      closureNotes ||
        `Month-End closure and fee books finalized for ${formatMonthName(selectedMonth)}. Collections reconciled.`
    );

    if (res.success) {
      if (advanceActiveMonth) {
        setActiveMonth(nextMonthStr);
      }
      showToast(
        `Fee books for ${formatMonthName(selectedMonth)} have been locked & sealed!`,
        'success'
      );
    } else {
      showToast(res.error || 'Failed to lock fee books.', 'error');
    }
    setIsLocking(false);
  };

  // Unlock Fee Books
  const handleUnlock = () => {
    const res = unlockMonth(selectedMonth);
    if (res.success) {
      setUnlockConfirmOpen(false);
    } else {
      showToast(res.error || 'Failed to unlock fee books.', 'error');
    }
  };

  return (
    <div className="space-y-6" id="month-end-wizard-panel">
      {/* Top Banner: Month Selector & Closure Status */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Month-End Closure & Fee Book Lock Wizard
                </h3>
                {isLocked ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <Lock className="w-3.5 h-3.5" />
                    Fee Books Locked & Sealed
                  </span>
                ) : monthStatus.isClosed ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-300">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    All Accounts Settled (Ready to Lock)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    <Clock className="w-3.5 h-3.5" />
                    {uncarriedDefaulters.length} Uncarried Defaulter(s)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Reconcile fee collections, audit bank accounts, resolve uncarried defaulters, and permanently lock
                accounting books before rolling over to the next billing period.
              </p>
            </div>
          </div>

          {/* Month Selector Dropdown */}
          <div className="flex items-center gap-3 shrink-0 self-start lg:self-center bg-slate-50 p-2 rounded-2xl border border-slate-200">
            <label htmlFor="wizard-month-select" className="text-xs font-bold text-slate-700 pl-1">
              Target Month:
            </label>
            <select
              id="wizard-month-select"
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setCurrentStep(1);
              }}
              className="px-3 py-1.5 bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-xl shadow-2xs focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
            >
              {availableMonths.map((m) => {
                const st = getMonthClosureStatus(m);
                const lk = isMonthLocked(m);
                const statusBadge = lk ? '🔒 Locked' : st.isClosed ? '✓ Reconciled' : `⚠️ ${st.uncarriedUnpaidCount} Open`;
                return (
                  <option key={m} value={m}>
                    {formatMonthName(m)} — {statusBadge}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Previous Month Not Closed Callout (if viewing active month while prev is open) */}
        {!prevMonthStatus.isClosed && prevMonthStatus.totalVouchers > 0 && selectedMonth !== prevMonthStr && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold text-amber-900">
                  Previous month {formatMonthName(prevMonthStr)} is not closed yet:
                </span>{' '}
                <span className="text-amber-800">
                  {prevMonthStatus.uncarriedUnpaidCount} uncarried defaulter(s) remain. School policy requires closing prior months sequentially.
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedMonth(prevMonthStr);
                setCurrentStep(1);
              }}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              Switch to {formatMonthName(prevMonthStr)} &rarr;
            </button>
          </div>
        )}

        {/* 4-Step Interactive Navigation Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-6 pt-5 border-t border-slate-100">
          {[
            { step: 1, label: '1. Financial Overview', sub: 'Targets vs Collections' },
            { step: 2, label: '2. Collections & Bank Audit', sub: 'Audit Payments' },
            { step: 3, label: '3. Defaulters & Arrears', sub: `${uncarriedDefaulters.length} Defaulters Pending` },
            { step: 4, label: '4. Lock Fee Books', sub: 'Finalize & Advance' },
          ].map((item) => {
            const isActive = currentStep === item.step;
            const isCompleted = currentStep > item.step || (item.step === 3 && uncarriedDefaulters.length === 0);
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => setCurrentStep(item.step as any)}
                className={`p-3 rounded-2xl text-left transition border cursor-pointer ${
                  isActive
                    ? 'bg-amber-50/80 border-amber-400 text-amber-950 ring-2 ring-amber-400/30 font-bold shadow-xs'
                    : isCompleted
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 hover:bg-emerald-50'
                    : 'bg-slate-50/60 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold">{item.label}</span>
                  {isCompleted && item.step !== currentStep ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : isActive ? (
                    <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0 animate-pulse" />
                  ) : null}
                </div>
                <span className="block text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                  {item.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 1: FINANCIAL OVERVIEW & RECONCILIATION */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {/* Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Billing Target (Net Due)
              </span>
              <div className="text-2xl font-black text-slate-900 mt-1.5">
                Rs {financialSummary.totalNetDue.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>{monthVouchers.length} Total Vouchers</span>
                <span>Gross: Rs {financialSummary.totalGross.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Realized Collections
              </span>
              <div className="text-2xl font-black text-emerald-700 mt-1.5">
                Rs {financialSummary.totalCollected.toLocaleString()}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, financialSummary.collectionRate)}%` }}
                  />
                </div>
                <span className="text-xs font-extrabold text-emerald-700 shrink-0">
                  {financialSummary.collectionRate}%
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs">
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">
                Uncollected Arrears
              </span>
              <div className="text-2xl font-black text-rose-700 mt-1.5">
                Rs {financialSummary.totalOutstanding.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Across {uncarriedDefaulters.length} uncarried defaulter voucher(s)
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">
                Discounts & Concessions
              </span>
              <div className="text-2xl font-black text-indigo-700 mt-1.5">
                Rs {financialSummary.totalDiscounts.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {financialSummary.zeroDueCount} voucher(s) at 100% scholarship / waiver
              </div>
            </div>
          </div>

          {/* Payment Mode Breakdown */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs">
            <h4 className="text-sm font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-teal-600" />
              Collections Breakdown by Payment Method
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700 block">Cash Counter</span>
                  <span className="text-lg font-black text-slate-900">
                    Rs {financialSummary.modeBreakdown.Cash.amount.toLocaleString()}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600">
                  {financialSummary.modeBreakdown.Cash.count} txns
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700 block">Bank Transfer</span>
                  <span className="text-lg font-black text-slate-900">
                    Rs {financialSummary.modeBreakdown.BankTransfer.amount.toLocaleString()}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600">
                  {financialSummary.modeBreakdown.BankTransfer.count} txns
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700 block">Cheque / Pay Order</span>
                  <span className="text-lg font-black text-slate-900">
                    Rs {financialSummary.modeBreakdown.Cheque.amount.toLocaleString()}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600">
                  {financialSummary.modeBreakdown.Cheque.count} txns
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700 block">Online / Gateway</span>
                  <span className="text-lg font-black text-slate-900">
                    Rs {financialSummary.modeBreakdown.Online.amount.toLocaleString()}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600">
                  {financialSummary.modeBreakdown.Online.count} txns
                </span>
              </div>
            </div>
          </div>

          {/* Vouchers Reconciliation Health Status */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900">Reconciliation Health Status</h4>
              <p className="text-xs text-slate-500">
                {isLocked
                  ? `This month is locked. Historical books are frozen.`
                  : uncarriedDefaulters.length === 0
                  ? `All vouchers are settled or carried forward! The month is ready to be locked in Step 4.`
                  : `${uncarriedDefaulters.length} uncarried defaulter(s) detected. Please carry forward or collect them in Step 3.`}
              </p>
            </div>
            <button
              onClick={() => setCurrentStep(2)}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2 shrink-0"
            >
              <span>Verify Collections & Bank Deposits</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: COLLECTIONS & BANK AUDIT */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {/* Pre-Closure Verification Checklist */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs">
            <h4 className="text-sm font-extrabold text-slate-900 mb-1 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              Pre-Closure Reconciliation Checklist
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              Mark off these auditing steps to confirm that all cash drawers, bank deposits, and concessions are verified.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  id: 'cashCounted',
                  title: 'Physical Cash Drawer Reconciled',
                  desc: `Rs ${financialSummary.modeBreakdown.Cash.amount.toLocaleString()} in cash receipts physically tallied with cashier logs.`,
                },
                {
                  id: 'bankVerified',
                  title: 'Direct Bank Transfers Verified',
                  desc: `Rs ${financialSummary.modeBreakdown.BankTransfer.amount.toLocaleString()} in bank transfers matched against bank statements.`,
                },
                {
                  id: 'chequesCleared',
                  title: 'Cheques Submitted & Cleared',
                  desc: `Rs ${financialSummary.modeBreakdown.Cheque.amount.toLocaleString()} in received cheques banked and cleared.`,
                },
                {
                  id: 'discountsAudited',
                  title: 'Discounts & Waivers Approved',
                  desc: `Rs ${financialSummary.totalDiscounts.toLocaleString()} in fee concessions verified against approval records.`,
                },
              ].map((item) => {
                const checked = checklist[item.id as keyof typeof checklist];
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleChecklist(item.id as keyof typeof checklist)}
                    className={`p-4 rounded-2xl border cursor-pointer transition flex items-start gap-3 ${
                      checked
                        ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 mt-0.5 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-extrabold block">{item.title}</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">{item.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Configured Bank Accounts Cross-Check */}
          {bankAccounts && bankAccounts.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs">
              <h4 className="text-sm font-extrabold text-slate-900 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-600" />
                Configured Institute Bank Accounts
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {bankAccounts.map((b) => (
                  <div key={b.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900">{b.bankName}</span>
                      {b.isDefault && (
                        <span className="px-2 py-0.5 bg-teal-100 text-teal-800 text-[10px] font-bold rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-slate-600 font-mono mt-1 text-[11px]">{b.accountTitle}</div>
                    <div className="text-slate-500 font-mono text-[11px]">A/C: {b.accountNumber}</div>
                    {b.iban && <div className="text-slate-400 font-mono text-[10px] truncate">IBAN: {b.iban}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Transactions Ledger for Month */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Payment Transactions Ledger ({monthTransactions.length} Total)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inspect recorded receipts for {formatMonthName(selectedMonth)}.
                </p>
              </div>

              {/* Filter Tabs & Search */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search receipt, student..."
                    value={txnSearch}
                    onChange={(e) => setTxnSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 w-48"
                  />
                </div>

                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                  {(['All', 'Cash', 'BankTransfer', 'Cheque', 'Online'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setTxnModeFilter(m)}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                        txnModeFilter === m
                          ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {m === 'BankTransfer' ? 'Bank' : m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Receipt / Txn #</th>
                    <th className="p-3">Student</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Mode</th>
                    <th className="p-3">Reference / Notes</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        No transactions found matching this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((t) => {
                      const student = students.find((s) => s.id === t.studentId);
                      const cls = classes.find((c) => c.id === student?.classId);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">{t.date}</td>
                          <td className="p-3 whitespace-nowrap font-bold text-slate-900 font-mono text-[11px]">{t.txnNo}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="font-bold text-slate-900 block">{student?.name || 'Unknown'}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{student?.regNo}</span>
                          </td>
                          <td className="p-3 whitespace-nowrap text-slate-600">{cls?.name || 'N/A'}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                              {t.paymentMode}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 text-[11px] truncate max-w-[180px]">
                            {t.referenceNo || t.notes || '—'}
                          </td>
                          <td className="p-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                            Rs {t.amount.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Overview</span>
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2"
            >
              <span>Proceed to Defaulters & Arrears ({uncarriedDefaulters.length})</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: DEFAULTERS & ARREARS RESOLUTION */}
      {currentStep === 3 && (
        <div className="space-y-6">
          {/* Defaulter Status Banner */}
          {uncarriedDefaulters.length === 0 ? (
            <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-emerald-950">
                    No Uncarried Defaulters Remaining!
                  </h4>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    All fee vouchers for {formatMonthName(selectedMonth)} are either fully collected or have been carried forward to {formatMonthName(nextMonthStr)}.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCurrentStep(4)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Proceed to Lock Fee Books &rarr;</span>
              </button>
            </div>
          ) : (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-amber-700" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-amber-950">
                    {uncarriedDefaulters.length} Final Defaulter(s) Require Resolution
                  </h4>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Total unpaid arrears of Rs {financialSummary.totalOutstanding.toLocaleString()} must be carried forward to {formatMonthName(nextMonthStr)} or collected before fee books can be locked.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  id="btn-carry-forward-all-wizard"
                  disabled={isProcessingCarry}
                  onClick={handleCarryForwardAll}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isProcessingCarry ? 'Processing...' : `Carry Forward All to ${formatMonthName(nextMonthStr)}`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Carry Forward Settings Card */}
          {uncarriedDefaulters.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
              <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                Carry-Forward & Late Fine Policy
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-700 block">Target Billing Month</span>
                  <span className="text-sm font-black text-slate-900 block">
                    {formatMonthName(nextMonthStr)}
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Defaulter balances will appear as &quot;Previous Balance Arrears&quot; on the {formatMonthName(nextMonthStr)} voucher.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addLateFine}
                      onChange={(e) => setAddLateFine(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Apply Late Fine to carried balance
                    </span>
                  </label>

                  {addLateFine && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600">Fine Amount (Rs):</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={lateFineAmount}
                        onChange={(e) => setLateFineAmount(Number(e.target.value))}
                        className="w-28 px-3 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Defaulters Table */}
          {uncarriedDefaulters.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Outstanding Defaulters List ({uncarriedDefaulters.length})
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review each student or record an in-person payment immediately.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Student & Reg #</th>
                      <th className="p-3">Class</th>
                      <th className="p-3">Father Contact</th>
                      <th className="p-3">Voucher #</th>
                      <th className="p-3 text-right">Net Due</th>
                      <th className="p-3 text-right">Paid</th>
                      <th className="p-3 text-right">Unpaid Arrears</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {uncarriedDefaulters.map((v) => {
                      const student = students.find((s) => s.id === v.studentId);
                      const cls = classes.find((c) => c.id === student?.classId);
                      const balance = Math.max(0, v.netDue - v.amountPaid);

                      return (
                        <tr key={v.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 whitespace-nowrap">
                            <span className="font-bold text-slate-900 block">{student?.name || 'Unknown'}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{student?.regNo}</span>
                          </td>
                          <td className="p-3 whitespace-nowrap text-slate-600">{cls?.name || '—'}</td>
                          <td className="p-3 whitespace-nowrap text-slate-600">
                            <span className="block font-medium">{student?.fatherName}</span>
                            <span className="text-[10px] text-slate-400">{student?.fatherPhone || 'No Phone'}</span>
                          </td>
                          <td className="p-3 whitespace-nowrap font-mono font-bold text-slate-700">{v.voucherNo}</td>
                          <td className="p-3 text-right font-bold text-slate-900 whitespace-nowrap">
                            Rs {v.netDue.toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                            Rs {v.amountPaid.toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-black text-rose-700 whitespace-nowrap">
                            Rs {balance.toLocaleString()}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => {
                                setCollectingVoucher({
                                  voucherId: v.id,
                                  studentName: student?.name || 'Student',
                                  voucherNo: v.voucherNo,
                                  balance,
                                  amount: balance,
                                  mode: 'Cash',
                                  refNo: '',
                                  notes: `Settlement prior to month close (${selectedMonth})`,
                                  date: new Date().toISOString().split('T')[0],
                                });
                              }}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold transition cursor-pointer"
                            >
                              Collect Now
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Collections Audit</span>
            </button>
            <button
              onClick={() => setCurrentStep(4)}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2"
            >
              <span>Proceed to Lock Fee Books</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: LOCK FEE BOOKS & ADVANCE MONTH */}
      {currentStep === 4 && (
        <div className="space-y-6">
          {/* If uncarried defaulters still exist, block locking */}
          {uncarriedDefaulters.length > 0 ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl space-y-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <div>
                  <h4 className="text-base font-extrabold text-rose-950">
                    Cannot Lock Fee Books: Defaulters Still Unresolved
                  </h4>
                  <p className="text-xs text-rose-800 mt-0.5">
                    There are {uncarriedDefaulters.length} uncarried defaulter voucher(s) with total outstanding balance of Rs {financialSummary.totalOutstanding.toLocaleString()}. All defaulters must be resolved before locking the month.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs"
              >
                &larr; Go Back to Step 3 to Carry Forward Defaulters
              </button>
            </div>
          ) : isLocked ? (
            /* Already Locked Banner */
            <div className="p-8 bg-emerald-50 border border-emerald-200 rounded-3xl text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-300">
                <Lock className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-lg font-black text-emerald-950">
                  Fee Books for {formatMonthName(selectedMonth)} are Locked & Finalized
                </h4>
                <p className="text-xs text-emerald-800 max-w-md mx-auto mt-1">
                  Accounting records for this billing month are sealed. Vouchers, fees, and collections for this month cannot be altered.
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                {onNavigateToTab && (
                  <button
                    onClick={() => onNavigateToTab('vouchers')}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Go to Fee Vouchers &rarr;</span>
                  </button>
                )}
                {(currentUser.role === 'Admin' || hasPermission('settings.manage')) && (
                  <button
                    onClick={() => setUnlockConfirmOpen(true)}
                    className="px-4 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Admin: Unlock Books</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Ready to Lock Form */
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-6">
              <div>
                <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-amber-600" />
                  Final Fee Book Lock Confirmation
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Locking the fee books seals the {formatMonthName(selectedMonth)} ledger and prevents unintended backdated edits or voucher creation.
                </p>
              </div>

              {/* Pre-Lock Verification Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 font-bold block">Reconciled Collections:</span>
                  <span className="text-base font-black text-emerald-700 mt-0.5 block">
                    Rs {financialSummary.totalCollected.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-slate-500">{financialSummary.paidCount} Vouchers Settled</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">Carried Defaulters:</span>
                  <span className="text-base font-black text-slate-900 mt-0.5 block">
                    {financialSummary.carriedCount} Vouchers Transferred
                  </span>
                  <span className="text-[11px] text-slate-500">Transferred to {formatMonthName(nextMonthStr)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">Zero-Due Waivers:</span>
                  <span className="text-base font-black text-slate-900 mt-0.5 block">
                    {financialSummary.zeroDueCount} Vouchers
                  </span>
                  <span className="text-[11px] text-slate-500">Sealed & Cleared</span>
                </div>
              </div>

              {/* Closure Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  Closure Notes / Audit Memo (Optional):
                </label>
                <textarea
                  rows={2}
                  value={closureNotes}
                  onChange={(e) => setClosureNotes(e.target.value)}
                  placeholder="e.g., Reconciled against cashier drawer and Meezan bank statement. Reconciled by Bursar."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Advance to Next Month Toggle */}
              <label className="flex items-start gap-3 p-4 bg-amber-50/60 border border-amber-200 rounded-2xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={advanceActiveMonth}
                  onChange={(e) => setAdvanceActiveMonth(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 mt-0.5"
                />
                <div>
                  <span className="text-xs font-extrabold text-amber-950 block">
                    Advance active system working month to {formatMonthName(nextMonthStr)}
                  </span>
                  <span className="text-[11px] text-amber-800 block mt-0.5">
                    Automatically switches the app&apos;s active month to the next billing cycle so you can generate the new month&apos;s vouchers.
                  </span>
                </div>
              </label>

              {/* Primary Lock Button */}
              <div className="pt-2">
                <button
                  id="btn-confirm-lock-fee-books"
                  disabled={isLocking}
                  onClick={handleFinalLock}
                  className="w-full sm:w-auto px-8 py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white font-extrabold text-sm rounded-2xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {isLocking ? 'Locking Fee Books...' : `Lock Fee Books for ${formatMonthName(selectedMonth)} & Finalize`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUICK PAYMENT COLLECTION MODAL (STEP 3) */}
      {collectingVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">Record Fee Collection</h4>
                <p className="text-xs text-slate-500">{collectingVoucher.studentName} &bull; {collectingVoucher.voucherNo}</p>
              </div>
              <button
                onClick={() => setCollectingVoucher(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickCollect} className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between font-bold">
                <span className="text-slate-600">Outstanding Balance:</span>
                <span className="text-rose-700 text-sm font-black">Rs {collectingVoucher.balance.toLocaleString()}</span>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Amount to Collect (Rs):</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={collectingVoucher.balance}
                  value={collectingVoucher.amount}
                  onChange={(e) =>
                    setCollectingVoucher((prev) => (prev ? { ...prev, amount: Number(e.target.value) } : null))
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Payment Mode:</label>
                  <select
                    value={collectingVoucher.mode}
                    onChange={(e) =>
                      setCollectingVoucher((prev) =>
                        prev ? { ...prev, mode: e.target.value as PaymentMode } : null
                      )
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                  >
                    <option value="Cash">Cash</option>
                    <option value="BankTransfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Online">Online</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Date:</label>
                  <input
                    type="date"
                    value={collectingVoucher.date}
                    onChange={(e) =>
                      setCollectingVoucher((prev) => (prev ? { ...prev, date: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reference / Cheque # (Optional):</label>
                <input
                  type="text"
                  value={collectingVoucher.refNo}
                  onChange={(e) =>
                    setCollectingVoucher((prev) => (prev ? { ...prev, refNo: e.target.value } : null))
                  }
                  placeholder="e.g. Deposit Slip #12345"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCollectingVoucher(null)}
                  className="px-3.5 py-2 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition shadow-xs cursor-pointer"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UNLOCK CONFIRMATION DIALOG (ADMIN ONLY) */}
      {unlockConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
              <Unlock className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-extrabold text-slate-900">
                Unlock Fee Books for {formatMonthName(selectedMonth)}?
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Unlocking historical books will permit adjustments to vouchers and collections. This event will be logged in the permanent audit trail.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUnlockConfirmOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-50 transition cursor-pointer"
              >
                Keep Locked
              </button>
              <button
                type="button"
                onClick={handleUnlock}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
              >
                Confirm Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
