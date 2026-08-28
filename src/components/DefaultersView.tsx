import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FeeVoucher, PaymentTransaction, VoucherItem, ParticularKind } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { DatePicker } from './DatePicker';
import { VoucherParticularsEditor } from './VoucherParticularsEditor';
import { RecordsPerPageSelector } from './RecordsPerPageSelector';
import {
  formatCurrency,
  formatMonthName,
  getNextMonthString,
} from '../utils/feeMath';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Coins,
  Eye,
  Filter,
  Info,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

export const DefaultersView: React.FC = () => {
  const {
    activeMonth,
    vouchers,
    students,
    classes,
    templates,
    collectVoucherPayment,
    updateVoucherParticulars,
    bulkCarryForwardDefaulters,
    undoCarryForwardVoucher,
    getMonthClosureStatus,
    hasPermission,
    themeConfig,
    defaultLateFeeRate,
  } = useApp();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addLateFine, setAddLateFine] = useState(true);
  const [carryFineAmount, setCarryFineAmount] = useState<number>(defaultLateFeeRate || 500);
  const [activeTab, setActiveTab] = useState<'uncarried' | 'zeroDue' | 'carried'>('uncarried');

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  // Inspect Voucher Detail Modal
  const [inspectVoucher, setInspectVoucher] = useState<FeeVoucher | null>(null);

  const globalTemplates = useMemo(() => {
    return (templates || [])
      .filter((t) => !t.studentId && !t.classId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [templates]);

  const sortedDetailParticulars = useMemo(() => {
    if (!inspectVoucher) return [];
    const studentTpls = (templates || []).filter(
      (t) => t.studentId === inspectVoucher.studentId && (!t.month || t.month === inspectVoucher.month)
    );
    const classTpls = (templates || []).filter(
      (t) => !t.studentId && t.classId === inspectVoucher.classId && (!t.month || t.month === inspectVoucher.month)
    );
    const sortMap = new Map<ParticularKind, number>();
    globalTemplates.forEach((t) => sortMap.set(t.kind, t.sortOrder));
    classTpls.forEach((t) => {
      if (t.sortOrder !== undefined) sortMap.set(t.kind, t.sortOrder);
    });
    studentTpls.forEach((t) => {
      if (t.sortOrder !== undefined) sortMap.set(t.kind, t.sortOrder);
    });

    return [...inspectVoucher.particulars]
      .map((item) => {
        const studentOverride = studentTpls.find((t) => t.kind === item.kind);
        const classOverride = classTpls.find((t) => t.kind === item.kind);
        const globalTpl = globalTemplates.find((t) => t.kind === item.kind);
        let label = studentOverride?.label || classOverride?.label || globalTpl?.label || item.label;
        if (item.kind === 'Tuition') {
          label = label.replace(/\s*\(Class[^)]*\)/gi, '').trim() || 'Tuition Fee';
        } else if (item.kind === 'Transport') {
          label = studentOverride?.label || classOverride?.label || globalTpl?.label || 'Transport Fee';
        }
        return {
          ...item,
          label,
        };
      })
      .sort((a, b) => {
        const orderA = sortMap.get(a.kind) ?? 99;
        const orderB = sortMap.get(b.kind) ?? 99;
        return orderA - orderB;
      });
  }, [inspectVoucher, templates, globalTemplates]);

  useEffect(() => {
    setCarryFineAmount(defaultLateFeeRate || 500);
  }, [defaultLateFeeRate]);

  // Reset page to 1 whenever tab, search, class filter, or itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, selectedClassId, itemsPerPage]);

  // Toast state
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((current) => (current?.text === text ? null : current));
    }, 4500);
  };

  // Undo Carry Forward Confirmation Modal State
  const [undoCarryModal, setUndoCarryModal] = useState<{
    isOpen: boolean;
    targetVoucher: FeeVoucher;
    hasDownstream: boolean;
    downstreamMonths: string[];
  } | null>(null);

  const handleOpenUndoCarryModal = (v: FeeVoucher) => {
    const futureVouchers = vouchers.filter(
      (item) => item.studentId === v.studentId && item.id !== v.id && item.month > v.month
    );
    const downstreamMonths = Array.from(new Set(futureVouchers.map((item) => item.month))).sort();

    setUndoCarryModal({
      isOpen: true,
      targetVoucher: v,
      hasDownstream: futureVouchers.length > 0,
      downstreamMonths,
    });
  };

  const executeUndoCarryForward = () => {
    if (!undoCarryModal?.targetVoucher) return;
    const v = undoCarryModal.targetVoucher;
    const res = undoCarryForwardVoucher(v.id);

    if (res.success) {
      showToast(`Successfully reverted carry forward for Voucher #${v.voucherNo} (${formatMonthName(v.month)})!`);
      setUndoCarryModal(null);
    } else {
      showToast(res.error || 'Failed to undo carry forward', 'error');
    }
  };

  // Carry Forward Confirmation Modal State
  const [carryModal, setCarryModal] = useState<{
    isOpen: boolean;
    targetVouchers: FeeVoucher[];
    targetMonth: string;
  } | null>(null);

  // Collect Payment Modal State
  const [collectingVoucher, setCollectingVoucher] = useState<FeeVoucher | null>(null);
  const [collectAmount, setCollectAmount] = useState<number | string>('');
  const [collectMode, setCollectMode] = useState<PaymentTransaction['paymentMode']>('Cash');
  const [collectRef, setCollectRef] = useState('');
  const [collectDate, setCollectDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectNotes, setCollectNotes] = useState('');
  const [collectItems, setCollectItems] = useState<VoucherItem[]>([]);

  // Dynamic calculations for collect modal
  const collectDynamicNetDue = useMemo(() => {
    if (collectItems.length > 0) {
      return Math.max(0, collectItems.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
    }
    return collectingVoucher ? collectingVoucher.netDue : 0;
  }, [collectItems, collectingVoucher]);

  const collectDynamicRemaining = useMemo(() => {
    if (!collectingVoucher) return 0;
    return Math.max(0, collectDynamicNetDue - collectingVoucher.amountPaid);
  }, [collectDynamicNetDue, collectingVoucher]);

  useEscapeKey(() => {
    if (collectingVoucher) {
      setCollectingVoucher(null);
    } else if (inspectVoucher) {
      setInspectVoucher(null);
    } else if (carryModal) {
      setCarryModal(null);
    } else if (undoCarryModal) {
      setUndoCarryModal(null);
    }
  }, !!(collectingVoucher || inspectVoucher || carryModal || undoCarryModal));

  const monthStatus = getMonthClosureStatus(activeMonth);

  // 1. Defaulter vouchers in active working month (Issued or Partial with netDue > 0 and amountPaid < netDue)
  const defaulterVouchers = useMemo(() => {
    return vouchers.filter(
      (v) =>
        v.month === activeMonth &&
        v.status !== 'Reversed' &&
        v.status !== 'Carried' &&
        v.netDue > 0 &&
        v.amountPaid < v.netDue
    );
  }, [vouchers, activeMonth]);

  // 2. Zero-due vouchers in active working month (e.g. 100% scholarship, 0 tuition, or fully discounted / settled)
  const zeroDueVouchers = useMemo(() => {
    return vouchers.filter(
      (v) =>
        v.month === activeMonth &&
        v.status !== 'Reversed' &&
        v.status !== 'Carried' &&
        (v.netDue <= 0 || (v.discountTotal >= v.grossTotal && v.grossTotal > 0))
    );
  }, [vouchers, activeMonth]);

  // 3. Carried vouchers in active working month
  const carriedVouchers = useMemo(() => {
    return vouchers.filter(
      (v) => v.month === activeMonth && v.status === 'Carried'
    );
  }, [vouchers, activeMonth]);

  const nextMonthStr = getNextMonthString(activeMonth);

  // Active dataset according to selected tab
  const currentTabList = useMemo(() => {
    if (activeTab === 'uncarried') return defaulterVouchers;
    if (activeTab === 'zeroDue') return zeroDueVouchers;
    return carriedVouchers;
  }, [activeTab, defaulterVouchers, zeroDueVouchers, carriedVouchers]);

  // Filtered dataset based on search term and class selection
  const filteredVouchers = useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase();
    return currentTabList.filter((v) => {
      const student = students.find((s) => s.id === v.studentId);
      const cls = classes.find((c) => c.id === v.classId);

      // Class Filter
      if (selectedClassId !== 'all' && v.classId !== selectedClassId) {
        return false;
      }

      // Search Query Filter
      if (trimmed) {
        const matchesName = student?.name?.toLowerCase().includes(trimmed);
        const matchesRoll = student?.rollNumber?.toLowerCase().includes(trimmed);
        const matchesReg = student?.regNo?.toLowerCase().includes(trimmed);
        const matchesFather = student?.fatherName?.toLowerCase().includes(trimmed);
        const matchesVoucherNo = v.voucherNo?.toLowerCase().includes(trimmed);
        const matchesClass = cls?.name?.toLowerCase().includes(trimmed);

        if (!matchesName && !matchesRoll && !matchesReg && !matchesFather && !matchesVoucherNo && !matchesClass) {
          return false;
        }
      }

      return true;
    });
  }, [currentTabList, students, classes, selectedClassId, searchTerm]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredVouchers.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const paginatedVouchers = filteredVouchers.slice(startIndex, startIndex + itemsPerPage);

  const visibleIds = useMemo(() => paginatedVouchers.map((v) => v.id), [paginatedVouchers]);
  const isAllVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const isSomeVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));

  // Selection handlers
  const toggleSelectVisible = () => {
    if (isAllVisibleSelected) {
      // Unselect visible items
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      // Select all visible items
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleSelectAllFiltered = () => {
    const allFilteredIds = filteredVouchers.map((v) => v.id);
    const allSelected = allFilteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  // Carry Forward Handlers
  const handleOpenCarryModalMain = () => {
    const targetVouchers =
      selectedIds.length > 0
        ? defaulterVouchers.filter((v) => selectedIds.includes(v.id))
        : defaulterVouchers;

    if (targetVouchers.length === 0) {
      showToast('No uncarried defaulter vouchers available to carry forward.', 'error');
      return;
    }

    setCarryFineAmount(defaultLateFeeRate || 500);
    setCarryModal({
      isOpen: true,
      targetVouchers,
      targetMonth: nextMonthStr,
    });
  };

  const handleOpenCarryModalSingle = (v: FeeVoucher) => {
    setCarryFineAmount(v.lateFeeRate || defaultLateFeeRate || 500);
    setCarryModal({
      isOpen: true,
      targetVouchers: [v],
      targetMonth: nextMonthStr,
    });
  };

  const executeCarryForward = () => {
    if (!carryModal || carryModal.targetVouchers.length === 0) return;

    const idsToCarry = carryModal.targetVouchers.map((v) => v.id);
    const { successCount } = bulkCarryForwardDefaulters(
      idsToCarry,
      carryModal.targetMonth,
      addLateFine,
      carryFineAmount
    );

    if (successCount > 0) {
      showToast(
        `Successfully carried forward ${successCount} defaulter voucher(s) into ${formatMonthName(
          carryModal.targetMonth
        )}!`
      );
      setSelectedIds((prev) => prev.filter((id) => !idsToCarry.includes(id)));
      setCarryModal(null);
    } else {
      showToast('Failed to carry forward selected voucher(s).', 'error');
    }
  };

  // Payment Collection Handlers
  const handleOpenCollectModal = (v: FeeVoucher) => {
    setCollectingVoucher(v);
    setCollectItems(v.particulars.map((p) => ({ ...p })));
    const remaining = Math.max(0, v.netDue - v.amountPaid);
    setCollectAmount(remaining);
    setCollectMode('Cash');
    setCollectRef('');
    setCollectDate(new Date().toISOString().split('T')[0]);
    setCollectNotes('');
  };

  const handleSaveLineItemsOnly = () => {
    if (!collectingVoucher) return;
    const res = updateVoucherParticulars(collectingVoucher.id, collectItems);
    if (res.success) {
      showToast('Voucher line items and totals updated successfully!', 'success');
      if (res.voucher) {
        setCollectingVoucher(res.voucher);
      }
    } else {
      showToast(res.error || 'Failed to update voucher particulars', 'error');
    }
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectingVoucher) return;

    const numAmount = Number(collectAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Payment amount must be greater than zero.', 'error');
      return;
    }

    const res = collectVoucherPayment(
      collectingVoucher.id,
      numAmount,
      collectMode,
      collectRef.trim() || undefined,
      collectNotes.trim() || undefined,
      collectDate,
      collectItems
    );

    if (res.success) {
      showToast(`Payment of ${formatCurrency(numAmount)} recorded for voucher #${collectingVoucher.voucherNo}!`);
      setCollectingVoucher(null);
    } else {
      showToast(res.error || 'Failed to record payment', 'error');
    }
  };

  const collectingStudent = collectingVoucher ? students.find((s) => s.id === collectingVoucher.studentId) : undefined;

  // Outstanding sum for active tab filtered items
  const totalArrearsActiveTab = useMemo(() => {
    if (activeTab === 'uncarried') {
      return filteredVouchers.reduce((sum, v) => sum + Math.max(0, v.netDue - v.amountPaid), 0);
    }
    if (activeTab === 'zeroDue') {
      return filteredVouchers.reduce((sum, v) => sum + (v.discountTotal || 0), 0);
    }
    return filteredVouchers.reduce((sum, v) => sum + v.netDue, 0);
  }, [activeTab, filteredVouchers]);

  return (
    <div className="space-y-6 relative" id="defaulters-view-container">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold ${
              toastMessage.type === 'success'
                ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
                : 'bg-rose-900 text-rose-100 border-rose-700'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 text-white/70 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            Fee Defaulters & Month-End Closure Gate
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Track unpaid student vouchers, inspect zero-due scholarship records, collect balances, apply late fines, and carry forward balances.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-teal-50 border border-teal-200 text-teal-900 rounded-xl px-3.5 py-2 text-xs font-bold shadow-2xs">
            <Calendar className="w-4 h-4 text-teal-600 mr-2 shrink-0" />
            <span className="text-teal-700 font-medium mr-1.5">Working Month:</span>
            <span>{formatMonthName(activeMonth)} ({activeMonth})</span>
          </div>
        </div>
      </div>

      {/* Month Closure Gate Status Card */}
      <div
        className={`p-5 rounded-2xl border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 transition-all ${
          monthStatus.isClosed
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            : 'bg-amber-50/80 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex items-start gap-3.5">
          {monthStatus.isClosed ? (
            <div className="p-2.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-700 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-sm font-bold">
                Month Status for {formatMonthName(activeMonth)}:
              </h3>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide inline-flex items-center gap-1 ${
                  monthStatus.isClosed
                    ? 'bg-emerald-200 text-emerald-950'
                    : 'bg-amber-200 text-amber-950'
                }`}
              >
                {monthStatus.isClosed ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-800" />
                    <span>CLOSED</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-800" />
                    <span>OPEN / UNCARRIED DEFAULTERS</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs opacity-90 mt-1 flex items-center gap-2 flex-wrap">
              <span>Total Vouchers: <strong className="font-bold">{monthStatus.totalVouchers}</strong></span>
              <span>&bull;</span>
              <span>Paid / Settled: <strong className="font-bold text-emerald-800">{monthStatus.paidCount}</strong></span>
              <span>&bull;</span>
              <span>Zero-Due: <strong className="font-bold text-teal-800">{zeroDueVouchers.length}</strong></span>
              <span>&bull;</span>
              <span>Carried: <strong className="font-bold">{monthStatus.carriedCount}</strong></span>
              <span>&bull;</span>
              <span className={`px-2 py-0.5 rounded font-bold ${monthStatus.uncarriedUnpaidCount > 0 ? 'bg-amber-200/80 text-amber-950' : 'bg-emerald-200/80 text-emerald-950'}`}>
                Uncarried Defaulters: {monthStatus.uncarriedUnpaidCount}
              </span>
            </p>
          </div>
        </div>

        {hasPermission('fees.generate') && defaulterVouchers.length > 0 && (
          <button
            onClick={handleOpenCarryModalMain}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer hover:scale-102 active:scale-98 whitespace-nowrap self-stretch lg:self-auto justify-center"
          >
            <span>
              {selectedIds.length > 0
                ? `Carry Forward Selected (${selectedIds.length})`
                : `Carry Forward All Defaulters (${defaulterVouchers.length})`}
              {' to ' + formatMonthName(nextMonthStr)}
            </span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        )}
      </div>

      {/* Defaulters Main Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Navigation Tabs & Late Fine Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tab 1: Unpaid Defaulters */}
            <button
              type="button"
              onClick={() => setActiveTab('uncarried')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
                activeTab === 'uncarried'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${activeTab === 'uncarried' ? 'text-amber-400' : 'text-amber-600'}`} />
              <span>Unpaid Defaulters</span>
            </button>

            {/* Tab 2: Zero-Due / Settled Students */}
            <button
              type="button"
              onClick={() => setActiveTab('zeroDue')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
                activeTab === 'zeroDue'
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <CheckCircle className={`w-3.5 h-3.5 ${activeTab === 'zeroDue' ? 'text-emerald-300' : 'text-emerald-600'}`} />
              <span>Zero-Due / Settled</span>
            </button>

            {/* Tab 3: Carried Forward History */}
            <button
              type="button"
              onClick={() => setActiveTab('carried')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
                activeTab === 'carried'
                  ? 'bg-amber-700 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <ArrowRight className={`w-3.5 h-3.5 ${activeTab === 'carried' ? 'text-amber-200' : 'text-amber-700'}`} />
              <span>Carried Forward</span>
            </button>
          </div>

          {/* Right Toolbar: Late payment fine input (for unpaid defaulters tab) */}
          {activeTab === 'uncarried' && (
            <div className="flex items-center gap-2 bg-white pl-3 pr-2 py-1.5 rounded-xl border border-slate-200 shadow-2xs text-xs">
              <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="checkbox-add-late-fine"
                  checked={addLateFine}
                  onChange={(e) => setAddLateFine(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                />
                <span className="font-bold text-slate-800 text-[11px]">Late Payment Surcharge:</span>
              </label>
              <div
                className={`flex items-center rounded-lg border transition-all ${
                  addLateFine
                    ? 'bg-amber-50/60 border-amber-300 focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500 focus-within:bg-white'
                    : 'bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed'
                }`}
              >
                <span className={`pl-2 text-[11px] font-bold ${addLateFine ? 'text-amber-800' : 'text-slate-400'}`}>
                  Rs.
                </span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  id="input-carry-fine-amount"
                  disabled={!addLateFine}
                  value={addLateFine ? carryFineAmount : 0}
                  onChange={(e) => setCarryFineAmount(Math.max(0, Number(e.target.value) || 0))}
                  className={`w-20 pr-2 py-1 text-xs font-mono font-bold text-right bg-transparent focus:outline-none ${
                    addLateFine ? 'text-slate-900' : 'text-slate-400 cursor-not-allowed'
                  }`}
                  placeholder="0"
                />
              </div>
            </div>
          )}
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 bg-white border-b border-slate-200/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-defaulters-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by student name, roll #, reg #, father name, voucher #..."
              className="w-full pl-10 pr-9 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition shadow-2xs font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Class Filter Dropdown */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-slate-500 font-semibold text-[11px]">Class:</span>
              <select
                id="select-defaulters-class"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="bg-transparent font-bold text-slate-800 text-xs focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Classes ({currentTabList.length})</option>
                {classes.map((c) => {
                  const countInClass = currentTabList.filter((v) => v.classId === c.id).length;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} ({countInClass})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Total Arrears Metric Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs">
              <span className="text-slate-500 font-medium text-[11px]">
                {activeTab === 'uncarried' ? 'Total Arrears:' : activeTab === 'zeroDue' ? 'Concessions:' : 'Total Carried:'}
              </span>
              <span className={`font-mono font-bold ${activeTab === 'uncarried' ? 'text-rose-600' : 'text-emerald-700'}`}>
                {formatCurrency(totalArrearsActiveTab)}
              </span>
            </div>
          </div>
        </div>

        {/* Selection Banner (when items are selected) */}
        {selectedIds.length > 0 && activeTab === 'uncarried' && (
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-950">
                {selectedIds.length} of {defaulterVouchers.length} defaulters selected
              </span>
              <span className="text-amber-700">&bull;</span>
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="text-teal-700 hover:text-teal-900 font-bold hover:underline cursor-pointer"
              >
                {filteredVouchers.every((v) => selectedIds.includes(v.id))
                  ? 'Deselect matching filter'
                  : `Select all ${filteredVouchers.length} matching vouchers`}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {hasPermission('fees.generate') && (
                <button
                  type="button"
                  onClick={handleOpenCarryModalMain}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Carry Forward Selected ({selectedIds.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={clearSelection}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-amber-100/60 font-semibold rounded-lg transition cursor-pointer"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Tab 2 Info Note (Zero Due Settled Students) */}
        {activeTab === 'zeroDue' && (
          <div className="p-3.5 bg-emerald-50/60 border-b border-emerald-200/80 flex items-start gap-2.5 text-xs text-emerald-950">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Zero Net Due / Full Scholarship Concession:</span>{' '}
              These students have vouchers issued with Rs. 0 net payable (e.g. 100% concession, full scholarship, or zero tuition). Their vouchers are automatically settled and marked <strong className="underline">Paid (Closed)</strong>, allowing the month to close smoothly without blocking.
            </div>
          </div>
        )}

        {/* Table Content */}
        <div className="overflow-x-auto">
          {/* TAB 1: UNCARRIED DEFAULTERS */}
          {activeTab === 'uncarried' && (
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      id="checkbox-select-all-visible"
                      checked={isAllVisibleSelected}
                      ref={(input) => {
                        if (input) {
                          input.indeterminate = !isAllVisibleSelected && isSomeVisibleSelected;
                        }
                      }}
                      onChange={toggleSelectVisible}
                      className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                      title="Select all vouchers on current page"
                    />
                  </th>
                  <th className="p-3">Voucher #</th>
                  <th className="p-3">Student & Father Name</th>
                  <th className="p-3">Class</th>
                  <th className="p-3 text-right">Net Due</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Outstanding</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedVouchers.length > 0 ? (
                  paginatedVouchers.map((v) => {
                    const student = students.find((s) => s.id === v.studentId);
                    const cls = classes.find((c) => c.id === v.classId);
                    const outstanding = Math.max(0, v.netDue - v.amountPaid);
                    const isSelected = selectedIds.includes(v.id);

                    return (
                      <tr
                        key={v.id}
                        className={`hover:bg-slate-50/80 transition ${
                          isSelected ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(v.id)}
                            className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 text-[11px]">
                            {v.voucherNo}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <StudentAvatar photoUrl={student?.photoUrl} name={student?.name || 'Unknown'} size="sm" />
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">{student?.name || 'Unknown'}</div>
                              <div className="text-[11px] text-slate-500 font-medium">
                                {student?.rollNumber ? `Roll: ${student.rollNumber}` : student?.regNo ? `Reg: ${student.regNo}` : ''}
                                {student?.fatherName ? ` • S/D/O ${student.fatherName}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {cls?.name}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-800 font-mono text-right">{formatCurrency(v.netDue)}</td>
                        <td className="p-3 text-emerald-700 font-semibold font-mono text-right">{formatCurrency(v.amountPaid)}</td>
                        <td className="p-3 font-bold text-rose-600 font-mono text-right">{formatCurrency(outstanding)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {hasPermission('fees.collect') && (
                              <button
                                type="button"
                                onClick={() => handleOpenCollectModal(v)}
                                title={`Collect payment for voucher #${v.voucherNo}`}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition shadow-2xs cursor-pointer shrink-0 inline-flex items-center gap-1 text-[11px]"
                              >
                                <Coins className="w-3.5 h-3.5" />
                                <span>Collect</span>
                              </button>
                            )}
                            {hasPermission('fees.generate') && (
                              <button
                                type="button"
                                onClick={() => handleOpenCarryModalSingle(v)}
                                title={`Carry forward voucher #${v.voucherNo} into ${formatMonthName(nextMonthStr)}`}
                                className="p-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition shadow-2xs cursor-pointer shrink-0 inline-flex items-center justify-center"
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                      {searchTerm || selectedClassId !== 'all'
                        ? 'No uncarried defaulters match your search criteria.'
                        : `No uncarried defaulter vouchers in ${formatMonthName(activeMonth)}. Month is closed!`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* TAB 2: ZERO-DUE / SETTLED VOUCHERS */}
          {activeTab === 'zeroDue' && (
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3">Voucher #</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Class</th>
                  <th className="p-3 text-right">Gross Total</th>
                  <th className="p-3 text-right">Scholarship / Concession</th>
                  <th className="p-3 text-right">Net Payable</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedVouchers.length > 0 ? (
                  paginatedVouchers.map((v) => {
                    const student = students.find((s) => s.id === v.studentId);
                    const cls = classes.find((c) => c.id === v.classId);

                    return (
                      <tr key={v.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-mono font-bold text-slate-900">
                          <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 text-[11px]">
                            {v.voucherNo}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <StudentAvatar photoUrl={student?.photoUrl} name={student?.name || 'Unknown'} size="sm" />
                            <div>
                              <div className="font-bold text-slate-900">{student?.name || 'Unknown'}</div>
                              <div className="text-[11px] text-slate-500 font-medium">
                                {student?.rollNumber ? `Roll: ${student.rollNumber}` : student?.regNo ? `Reg: ${student.regNo}` : ''}
                                {student?.fatherName ? ` • S/D/O ${student.fatherName}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {cls?.name}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-right text-slate-600">{formatCurrency(v.grossTotal)}</td>
                        <td className="p-3 font-mono text-right font-bold text-emerald-700">
                          {formatCurrency(v.discountTotal || v.grossTotal)}
                        </td>
                        <td className="p-3 font-mono text-right font-bold text-slate-900">
                          {formatCurrency(v.netDue)}
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px]">
                            <CheckCircle className="w-3 h-3" />
                            <span>Settled (0 Due)</span>
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => setInspectVoucher(v)}
                            title="Inspect Voucher Details"
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition shadow-2xs cursor-pointer inline-flex items-center gap-1 text-[11px]"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                      {searchTerm || selectedClassId !== 'all'
                        ? 'No zero-due / scholarship vouchers match your search criteria.'
                        : `No zero-due vouchers in ${formatMonthName(activeMonth)}.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* TAB 3: CARRIED FORWARD VOUCHERS */}
          {activeTab === 'carried' && (
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3">Voucher #</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Class</th>
                  <th className="p-3 text-right">Net Due</th>
                  <th className="p-3">Carried To Month</th>
                  <th className="p-3 text-right">Carried Late Surcharge</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedVouchers.length > 0 ? (
                  paginatedVouchers.map((v) => {
                    const student = students.find((s) => s.id === v.studentId);
                    const cls = classes.find((c) => c.id === v.classId);

                    return (
                      <tr key={v.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-mono font-bold text-slate-900">
                          <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 text-[11px]">
                            {v.voucherNo}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <StudentAvatar photoUrl={student?.photoUrl} name={student?.name || 'Unknown'} size="sm" />
                            <div>
                              <div className="font-bold text-slate-900">{student?.name || 'Unknown'}</div>
                              <div className="text-[11px] text-slate-500 font-medium">
                                {student?.rollNumber ? `Roll: ${student.rollNumber}` : student?.regNo ? `Reg: ${student.regNo}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {cls?.name}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-800 font-mono text-right">{formatCurrency(v.netDue)}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full text-[11px]">
                            <ArrowRight className="w-3 h-3" />
                            {v.carryForwardMonth ? formatMonthName(v.carryForwardMonth) : 'Next Month'}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-600 font-mono text-right">
                          {v.carriedLateFine ? formatCurrency(v.carriedLateFine) : 'None'}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {hasPermission('fees.generate') && (
                              <button
                                type="button"
                                onClick={() => handleOpenUndoCarryModal(v)}
                                title={`Undo carry forward for voucher #${v.voucherNo}`}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold rounded-lg transition shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Undo Carry</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                      {searchTerm || selectedClassId !== 'all'
                        ? 'No carried forward vouchers match your search criteria.'
                        : `No carried forward vouchers in ${formatMonthName(activeMonth)}.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination controls */}
        {filteredVouchers.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <RecordsPerPageSelector
                value={itemsPerPage}
                onChange={(newSize) => {
                  setItemsPerPage(newSize);
                  setCurrentPage(1);
                }}
                totalRecords={filteredVouchers.length}
                presetOptions={[25, 50, 100]}
                idPrefix="defaulters-per-page"
              />
              <span className="text-slate-400">&bull;</span>
              <span>
                Total: <strong>{filteredVouchers.length}</strong> vouchers
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">
                Page {safeCurrentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {inspectVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Voucher Particulars &bull; {inspectVoucher.voucherNo}
              </h3>
              <button
                onClick={() => setInspectVoucher(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="p-2">Line Item</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedDetailParticulars.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-medium">{item.label}</td>
                        <td
                          className={`p-2 text-right font-bold ${
                            item.amount < 0 ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="divide-y divide-slate-200">
                    <tr className="bg-slate-100 font-bold text-slate-800 border-t border-slate-300">
                      <td className="p-2">NET DUE AMOUNT:</td>
                      <td className="p-2 text-right text-teal-700 font-bold">
                        {formatCurrency(inspectVoucher.netDue)}
                      </td>
                    </tr>
                    <tr className="bg-rose-50 font-bold text-rose-900 border-t border-rose-200">
                      <td className="p-2">PAYABLE AFTER DUE DATE:</td>
                      <td className="p-2 text-right text-rose-700 font-bold">
                        {formatCurrency(inspectVoucher.netDue + (inspectVoucher.lateFeeRate || 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setInspectVoucher(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs cursor-pointer shadow-2xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Payment Modal */}
      {collectingVoucher && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200/80 space-y-4 my-auto sm:my-8">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Collect Payment &bull; {collectingVoucher.voucherNo}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Student: {collectingStudent?.name} &bull; {formatMonthName(collectingVoucher.month)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCollectingVoucher(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Pane: Particulars Editor */}
              <div className="lg:col-span-6 space-y-2">
                <VoucherParticularsEditor
                  items={collectItems}
                  onChange={(updated) => {
                    setCollectItems(updated);
                    const newNet = Math.max(0, updated.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
                    const newRem = Math.max(0, newNet - (collectingVoucher.amountPaid || 0));
                    if (Number(collectAmount) === collectDynamicRemaining && newRem > 0) {
                      setCollectAmount(newRem);
                    }
                  }}
                  originalItems={collectingVoucher.particulars}
                  onResetToOriginal={() => {
                    setCollectItems(collectingVoucher.particulars.map((p) => ({ ...p })));
                    const remaining = Math.max(0, collectingVoucher.netDue - collectingVoucher.amountPaid);
                    setCollectAmount(remaining);
                  }}
                  onSaveLineItems={handleSaveLineItemsOnly}
                  amountPaid={collectingVoucher.amountPaid}
                  studentId={collectingVoucher.studentId}
                />
              </div>

              {/* Right Pane: Summary Card & Collection Form */}
              <div className="lg:col-span-6 space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                {/* Live Breakdown */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Student</span>
                    <span className="font-bold text-slate-900">{collectingStudent?.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono">
                    <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                      <div className="text-[9px] text-slate-500 font-sans">Net Due</div>
                      <div className="font-bold text-slate-800 text-xs">{formatCurrency(collectDynamicNetDue)}</div>
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                      <div className="text-[9px] text-slate-500 font-sans">Paid</div>
                      <div className="font-bold text-emerald-700 text-xs">{formatCurrency(collectingVoucher.amountPaid)}</div>
                    </div>
                    <div className="bg-emerald-50/80 p-1.5 rounded border border-emerald-200">
                      <div className="text-[9px] text-emerald-800 font-sans font-bold">Remaining</div>
                      <div className="font-black text-emerald-800 text-xs">{formatCurrency(collectDynamicRemaining)}</div>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSavePayment} className="space-y-3 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-700">Amount to Collect (Rs.) *</label>
                      {collectDynamicRemaining > 0 ? (
                        <button
                          type="button"
                          onClick={() => setCollectAmount(collectDynamicRemaining)}
                          className="text-[11px] text-teal-600 hover:text-teal-800 font-bold hover:underline cursor-pointer"
                        >
                          Full Balance ({formatCurrency(collectDynamicRemaining)})
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCollectAmount(collectDynamicNetDue)}
                          className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer"
                        >
                          Fill Total Fee ({formatCurrency(collectDynamicNetDue)})
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rs.</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={collectAmount}
                        onChange={(e) => setCollectAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-emerald-700 text-base focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Payment Mode *</label>
                      <select
                        value={collectMode}
                        onChange={(e) => setCollectMode(e.target.value as any)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs"
                      >
                        <option value="Cash">Cash</option>
                        <option value="BankTransfer">Bank Transfer</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Online">Online / Card</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Date *</label>
                      <DatePicker
                        value={collectDate}
                        required
                        themeColor={themeConfig?.color || 'teal'}
                        onChange={(newDate) => setCollectDate(newDate)}
                        idPrefix="defaulter-collect-date"
                        placeholder="Select Payment Date"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Reference / Cheque / Txn #</label>
                    <input
                      type="text"
                      value={collectRef}
                      onChange={(e) => setCollectRef(e.target.value)}
                      placeholder="e.g. TRX-98213 / Bank Slip No"
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Notes / Remarks</label>
                    <textarea
                      rows={2}
                      value={collectNotes}
                      onChange={(e) => setCollectNotes(e.target.value)}
                      placeholder="Optional notes..."
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setCollectingVoucher(null)}
                      className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold rounded-xl text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Coins className="w-4 h-4" />
                      <span>Confirm & Record Payment</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Carry Forward Confirmation Modal */}
      {carryModal?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-amber-100 text-amber-700 shrink-0">
                  <ArrowRight className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Confirm Carry Forward to {formatMonthName(carryModal.targetMonth)}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Carrying forward will mark selected voucher(s) as 'Carried' and transfer arrears as Previous Balance into {formatMonthName(carryModal.targetMonth)}.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCarryModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="modal-checkbox-add-late-fine"
                  checked={addLateFine}
                  onChange={(e) => setAddLateFine(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300 cursor-pointer"
                />
                <span className="font-bold text-amber-950">Late Payment Surcharge / Fine:</span>
              </label>

              <div
                className={`flex items-center rounded-lg border transition-all ${
                  addLateFine
                    ? 'bg-white border-amber-300 focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500'
                    : 'bg-amber-100/40 border-amber-200/60 opacity-60 cursor-not-allowed'
                }`}
              >
                <span className={`pl-2 text-[11px] font-bold ${addLateFine ? 'text-amber-800' : 'text-slate-400'}`}>
                  Rs.
                </span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  id="modal-input-carry-fine-amount"
                  disabled={!addLateFine}
                  value={addLateFine ? carryFineAmount : 0}
                  onChange={(e) => setCarryFineAmount(Math.max(0, Number(e.target.value) || 0))}
                  className={`w-24 pr-2.5 py-1 text-xs font-mono font-bold text-right bg-transparent focus:outline-none ${
                    addLateFine ? 'text-slate-900' : 'text-slate-400 cursor-not-allowed'
                  }`}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex justify-between items-center text-xs font-bold">
                <span>Vouchers to Carry ({carryModal.targetVouchers.length}):</span>
                <span className="text-amber-800">
                  Total Arrears:{' '}
                  {formatCurrency(
                    carryModal.targetVouchers.reduce(
                      (sum, v) => sum + (v.netDue - v.amountPaid) + (addLateFine ? carryFineAmount : 0),
                      0
                    )
                  )}
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50 space-y-1.5 text-xs">
                {carryModal.targetVouchers.map((v) => {
                  const student = students.find((s) => s.id === v.studentId);
                  const cls = classes.find((c) => c.id === v.classId);
                  const arrears = v.netDue - v.amountPaid + (addLateFine ? carryFineAmount : 0);

                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {student?.name || 'Student'} ({v.voucherNo})
                        </div>
                        <div className="text-[10px] text-slate-500">{cls?.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-amber-700">{formatCurrency(arrears)}</div>
                        <div className="text-[9px] text-slate-400">Target: {carryModal.targetMonth}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCarryModal(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeCarryForward}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Confirm & Carry Forward ({carryModal.targetVouchers.length})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Carry Forward Modal with Strict Downstream Guard */}
      {undoCarryModal?.isOpen && undoCarryModal.targetVoucher && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  undoCarryModal.hasDownstream
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {undoCarryModal.hasDownstream ? (
                  <AlertTriangle className="w-6 h-6" />
                ) : (
                  <RotateCcw className="w-6 h-6" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {undoCarryModal.hasDownstream
                    ? 'Cannot Undo Carry Forward (Downstream Conflict)'
                    : 'Undo Carry Forward Confirmation'}
                </h3>
                <p className="text-xs text-slate-500">
                  Voucher #{undoCarryModal.targetVoucher.voucherNo} &bull;{' '}
                  {formatMonthName(undoCarryModal.targetVoucher.month)}
                </p>
              </div>
            </div>

            {undoCarryModal.hasDownstream ? (
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
                  <p className="font-semibold">
                    This action is blocked to preserve chronological ledger integrity.
                  </p>
                  <p>
                    A subsequent voucher already exists for this student in{' '}
                    <span className="font-bold">
                      {undoCarryModal.downstreamMonths.map((m) => formatMonthName(m)).join(', ')}
                    </span>
                    .
                  </p>
                  <p className="text-rose-900 font-medium">
                    To undo carry forward on this {formatMonthName(undoCarryModal.targetVoucher.month)}{' '}
                    voucher, you must first delete or resolve the subsequent month voucher(s).
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-600">
                <p>
                  Are you sure you want to revert the carry forward status for Voucher{' '}
                  <span className="font-bold text-slate-900">
                    #{undoCarryModal.targetVoucher.voucherNo}
                  </span>{' '}
                  (
                  {students.find((s) => s.id === undoCarryModal.targetVoucher.studentId)?.name ||
                    'Student'}
                  )?
                </p>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Status:</span>
                    <span className="font-bold text-slate-800">Carried Forward</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Restored Status:</span>
                    <span className="font-bold text-teal-700">
                      {(undoCarryModal.targetVoucher.amountPaid || 0) > 0 ? 'Partial' : 'Issued'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Net Due:</span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(undoCarryModal.targetVoucher.netDue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Outstanding Unpaid:</span>
                    <span className="font-bold text-rose-600">
                      {formatCurrency(
                        undoCarryModal.targetVoucher.netDue - (undoCarryModal.targetVoucher.amountPaid || 0)
                      )}
                    </span>
                  </div>
                </div>
                <p className="text-slate-500 italic">
                  Once restored, this voucher will be available for direct fee collection or re-carrying.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUndoCarryModal(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
              >
                {undoCarryModal.hasDownstream ? 'Close' : 'Cancel'}
              </button>
              {!undoCarryModal.hasDownstream && (
                <button
                  type="button"
                  onClick={executeUndoCarryForward}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Confirm Undo Carry</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
