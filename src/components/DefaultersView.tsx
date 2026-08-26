import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { FeeVoucher, PaymentTransaction, VoucherItem } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { DatePicker } from './DatePicker';
import { VoucherParticularsEditor } from './VoucherParticularsEditor';
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
  Coins,
  Receipt,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

export const DefaultersView: React.FC = () => {
  const {
    activeMonth,
    vouchers,
    students,
    classes,
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
  const [activeTab, setActiveTab] = useState<'uncarried' | 'carried'>('uncarried');

  useEffect(() => {
    setCarryFineAmount(defaultLateFeeRate || 500);
  }, [defaultLateFeeRate]);

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

  const monthStatus = getMonthClosureStatus(activeMonth);

  // Defaulter vouchers in active working month (Issued or Partial)
  const defaulterVouchers = vouchers.filter(
    (v) =>
      v.month === activeMonth &&
      v.status !== 'Reversed' &&
      v.status !== 'Carried' &&
      v.amountPaid < v.netDue
  );

  // Carried vouchers in active working month
  const carriedVouchers = vouchers.filter(
    (v) => v.month === activeMonth && v.status === 'Carried'
  );

  const nextMonthStr = getNextMonthString(activeMonth);

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

  const toggleSelectAll = () => {
    if (selectedIds.length === defaulterVouchers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(defaulterVouchers.map((v) => v.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const collectingStudent = collectingVoucher ? students.find((s) => s.id === collectingVoucher.studentId) : undefined;
  const collectingRemaining = collectingVoucher ? Math.max(0, collectingVoucher.netDue - collectingVoucher.amountPaid) : 0;

  return (
    <div className="space-y-6 relative">
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
            Track unpaid student vouchers, collect remaining balances, apply late fines, and carry forward balances into the next month.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-teal-50 border border-teal-200 text-teal-900 rounded-xl px-3 py-1.5 text-xs font-bold shadow-2xs">
            <Calendar className="w-4 h-4 text-teal-600 mr-2 shrink-0" />
            <span className="text-teal-700 font-medium mr-1.5">Working Month:</span>
            <span>{formatMonthName(activeMonth)} ({activeMonth})</span>
          </div>
        </div>
      </div>

      {/* Month Closure Gate Status Card */}
      <div
        className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
          monthStatus.isClosed
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            : 'bg-amber-50/80 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex items-start gap-3">
          {monthStatus.isClosed ? (
            <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              Month Status for {formatMonthName(activeMonth)}:
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide ${
                  monthStatus.isClosed
                    ? 'bg-emerald-200 text-emerald-950'
                    : 'bg-amber-200 text-amber-950'
                }`}
              >
                {monthStatus.isClosed ? 'CLOSED' : 'OPEN / UNCARRIED DEFAULTERS'}
              </span>
            </h3>
            <p className="text-xs opacity-90 mt-0.5">
              Total Vouchers: {monthStatus.totalVouchers} &bull; Paid: {monthStatus.paidCount} &bull;
              Carried: {monthStatus.carriedCount} &bull;{' '}
              <span className="font-bold underline">
                Uncarried Defaulters: {monthStatus.uncarriedUnpaidCount}
              </span>
            </p>
          </div>
        </div>

        {hasPermission('fees.generate') && defaulterVouchers.length > 0 && (
          <button
            onClick={handleOpenCarryModalMain}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer hover:scale-102 active:scale-98 whitespace-nowrap"
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

      {/* Defaulters Table / Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('uncarried')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'uncarried'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>Unpaid Defaulters</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'uncarried' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {defaulterVouchers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('carried')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'carried'
                  ? 'bg-amber-700 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>Carried Forward</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'carried' ? 'bg-amber-900 text-amber-100' : 'bg-slate-100 text-slate-700'
              }`}>
                {carriedVouchers.length}
              </span>
            </button>
          </div>

          {activeTab === 'uncarried' && (
            <div className="flex items-center gap-1.5 bg-white pl-3 pr-1.5 py-1 rounded-xl border border-slate-200 shadow-2xs text-xs">
              <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="checkbox-add-late-fine"
                  checked={addLateFine}
                  onChange={(e) => setAddLateFine(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                />
                <span className="font-bold text-slate-800">Late Payment Fine / Surcharge:</span>
              </label>
              <div className={`flex items-center rounded-lg border transition-all ${
                addLateFine
                  ? 'bg-amber-50/60 border-amber-300 focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500 focus-within:bg-white'
                  : 'bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed'
              }`}>
                <span className={`pl-2 text-[11px] font-bold ${addLateFine ? 'text-amber-800' : 'text-slate-400'}`}>Rs.</span>
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

        <div className="overflow-x-auto">
          {activeTab === 'uncarried' ? (
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.length > 0 && selectedIds.length === defaulterVouchers.length
                      }
                      onChange={toggleSelectAll}
                      className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-3">Voucher #</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Class</th>
                  <th className="p-3">Net Due</th>
                  <th className="p-3">Paid</th>
                  <th className="p-3">Outstanding Balance</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {defaulterVouchers.length > 0 ? (
                  defaulterVouchers.map((v) => {
                    const student = students.find((s) => s.id === v.studentId);
                    const cls = classes.find((c) => c.id === v.classId);
                    const outstanding = v.netDue - v.amountPaid;
                    const isSelected = selectedIds.includes(v.id);

                    return (
                      <tr
                        key={v.id}
                        className={`hover:bg-slate-50 transition ${
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
                        <td className="p-3 font-mono font-bold text-slate-900">{v.voucherNo}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <StudentAvatar photoUrl={student?.photoUrl} name={student?.name || 'Unknown'} size="xs" />
                            <span className="font-bold text-slate-900">{student?.name || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {cls?.name}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-800">{formatCurrency(v.netDue)}</td>
                        <td className="p-3 text-emerald-700 font-semibold">{formatCurrency(v.amountPaid)}</td>
                        <td className="p-3 font-bold text-rose-600">{formatCurrency(outstanding)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {hasPermission('fees.collect') && (
                              <button
                                type="button"
                                onClick={() => handleOpenCollectModal(v)}
                                title={`Collect payment for voucher #${v.voucherNo}`}
                                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition shadow-2xs cursor-pointer shrink-0 inline-flex items-center justify-center"
                              >
                                <Coins className="w-4 h-4" />
                              </button>
                            )}
                            {hasPermission('fees.generate') && (
                              <button
                                type="button"
                                onClick={() => handleOpenCarryModalSingle(v)}
                                title={`Carry forward voucher #${v.voucherNo} into ${formatMonthName(nextMonthStr)}`}
                                className="p-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition shadow-2xs cursor-pointer shrink-0 inline-flex items-center justify-center"
                              >
                                <ArrowRight className="w-4 h-4" />
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
                      No uncarried defaulter vouchers in {formatMonthName(activeMonth)}. Month is closed!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3">Voucher #</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Class</th>
                  <th className="p-3">Net Due</th>
                  <th className="p-3">Carried To Month</th>
                  <th className="p-3">Carried Late Fine</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carriedVouchers.length > 0 ? (
                  carriedVouchers.map((v) => {
                    const student = students.find((s) => s.id === v.studentId);
                    const cls = classes.find((c) => c.id === v.classId);

                    return (
                      <tr key={v.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-mono font-bold text-slate-900">{v.voucherNo}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <StudentAvatar photoUrl={student?.photoUrl} name={student?.name || 'Unknown'} size="xs" />
                            <span className="font-bold text-slate-900">{student?.name || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {cls?.name}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-800">{formatCurrency(v.netDue)}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                            <ArrowRight className="w-3 h-3" />
                            {v.carryForwardMonth ? formatMonthName(v.carryForwardMonth) : 'Next Month'}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-600">
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
                      No carried forward vouchers in {formatMonthName(activeMonth)}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Collect Payment Modal */}
      {collectingVoucher && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 my-6">
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
                    const newNet = Math.max(0, updated.reduce((s, p) => s + (Number(p.amount) || 0), 0));
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
                    <label className="block font-bold text-slate-700 mb-1">Ref / Receipt # (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. PK-MZB-9811"
                      value={collectRef}
                      onChange={(e) => setCollectRef(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="Additional remarks..."
                      value={collectNotes}
                      onChange={(e) => setCollectNotes(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setCollectingVoucher(null)}
                      className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={Number(collectAmount) <= 0}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer text-xs disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <Receipt className="w-4 h-4" />
                      <span>Record Payment ({collectAmount ? formatCurrency(Number(collectAmount)) : 'Rs. 0'})</span>
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
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
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
                <span className="font-bold text-amber-950">Late Payment Fine / Surcharge:</span>
              </label>

              <div className={`flex items-center rounded-lg border transition-all ${
                addLateFine
                  ? 'bg-white border-amber-300 focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500'
                  : 'bg-amber-100/40 border-amber-200/60 opacity-60 cursor-not-allowed'
              }`}>
                <span className={`pl-2 text-[11px] font-bold ${addLateFine ? 'text-amber-800' : 'text-slate-400'}`}>Rs.</span>
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
                      {(undoCarryModal.targetVoucher.paidAmount || 0) > 0 ? 'Partial' : 'Issued'}
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
