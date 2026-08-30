import React from 'react';
import { FeeVoucher, Student, VoucherItem } from '../../types';
import {
  formatCurrency,
  formatMonthName,
  getEffectiveMultiple,
  roundUpToMultiple,
} from '../../utils/feeMath';
import { useApp } from '../../context/AppContext';
import { VoucherParticularsEditor } from '../VoucherParticularsEditor';
import { DatePicker } from '../DatePicker';
import { StudentAvatar } from '../StudentAvatar';
import { Coins, Info, Receipt, X } from 'lucide-react';

export type CollectMode = 'Cash' | 'BankTransfer' | 'Cheque' | 'Online';

interface CollectPaymentModalProps {
  voucher: FeeVoucher;
  students: Student[];
  items: VoucherItem[];
  setItems: (items: VoucherItem[]) => void;
  amount: number | string;
  setAmount: (v: number | string) => void;
  mode: CollectMode;
  setMode: (m: CollectMode) => void;
  refNo: string;
  setRefNo: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  themeColor?: string;
  dynamicNetDue: number;
  dynamicRemaining: number;
  roundingEnabled: boolean;
  roundingMultiple: number;
  onSaveLineItems: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const CollectPaymentModal: React.FC<CollectPaymentModalProps> = ({
  voucher,
  students,
  items,
  setItems,
  amount,
  setAmount,
  mode,
  setMode,
  refNo,
  setRefNo,
  notes,
  setNotes,
  date,
  setDate,
  themeColor,
  dynamicNetDue,
  dynamicRemaining,
  roundingEnabled,
  roundingMultiple,
  onSaveLineItems,
  onSubmit,
  onClose,
}) => {
  const { classes } = useApp();
  const student = students.find((s) => s.id === voucher.studentId);
  const studentClass = classes.find(
    (c) => c.id === voucher.classId || c.id === student?.classId
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-4 sm:p-5 shadow-2xl space-y-3 my-auto animate-in fade-in duration-200 border border-slate-200/80 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
              <Coins className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">Collect Payment</h3>
                <span className="font-mono font-bold text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                  {voucher.voucherNo}
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    voucher.status === 'Paid'
                      ? 'bg-emerald-100 text-emerald-800'
                      : voucher.status === 'Partial'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {voucher.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Collect full, remaining, or partial fee payments directly
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Student & Balance Ribbon in Header */}
        <div className="bg-slate-50/90 rounded-xl px-3 py-2 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shrink-0">
          {/* Student Info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <StudentAvatar
              photoUrl={student?.photoUrl}
              name={student?.name || 'Student'}
              size="sm"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                  {student?.name || 'Unknown Student'}
                </h4>
              </div>
              <p className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
                <span>{voucher.voucherNo}</span>
                {student?.regNo && (
                  <>
                    <span>&bull;</span>
                    <span>Reg: {student.regNo}</span>
                  </>
                )}
                {studentClass?.name && (
                  <>
                    <span>&bull;</span>
                    <span>Class: {studentClass.name}</span>
                  </>
                )}
                <span>&bull;</span>
                <span>{formatMonthName(voucher.month)}</span>
              </p>
            </div>
          </div>

          {/* 3 Metric Pills */}
          <div className="flex items-center gap-1.5 shrink-0 self-stretch sm:self-auto justify-between sm:justify-end">
            <div className="grid grid-cols-3 gap-1.5 font-mono text-center">
              <div className="bg-white px-2 py-0.5 rounded-md border border-slate-200 min-w-[70px]">
                <div className="text-[9px] text-slate-500 font-sans font-medium">Original Due</div>
                <div className="font-bold text-slate-800 text-[11px] sm:text-xs">
                  {formatCurrency(voucher.netDue)}
                </div>
              </div>
              <div className="bg-white px-2 py-0.5 rounded-md border border-slate-200 min-w-[70px]">
                <div className="text-[9px] text-slate-500 font-sans font-medium">Already Paid</div>
                <div className="font-bold text-emerald-700 text-[11px] sm:text-xs">
                  {formatCurrency(voucher.amountPaid)}
                </div>
              </div>
              <div className="bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 min-w-[76px]">
                <div className="text-[9px] text-emerald-800 font-sans font-bold">
                  {voucher.amountPaid >= dynamicNetDue ? 'Settlement' : 'Remaining'}
                </div>
                <div className="font-black text-emerald-800 text-[11px] sm:text-xs">
                  {voucher.amountPaid >= dynamicNetDue
                    ? voucher.amountPaid > dynamicNetDue
                      ? `+${formatCurrency(voucher.amountPaid - dynamicNetDue)} Adv`
                      : 'Settled'
                    : formatCurrency(dynamicRemaining)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid: Left & Right Panes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch overflow-y-auto flex-1 min-h-0 pr-0.5">
          {/* Left Pane: Particulars Editor */}
          <div className="lg:col-span-6 flex flex-col h-full min-h-0">
            <VoucherParticularsEditor
              compact={true}
              items={items}
              onChange={(updated) => {
                setItems(updated);
                const mult = getEffectiveMultiple(
                  roundingEnabled,
                  roundingMultiple,
                  voucher?.roundingMultiple
                );
                const newNet = Math.max(
                  0,
                  roundUpToMultiple(
                    updated.reduce((s, p) => s + (Number(p.amount) || 0), 0),
                    mult
                  )
                );
                const newRem = Math.max(0, newNet - (voucher.amountPaid || 0));
                if (Number(amount) === dynamicRemaining && newRem > 0) {
                  setAmount(newRem);
                }
              }}
              originalItems={voucher.particulars}
              onResetToOriginal={() => {
                setItems(voucher.particulars.map((p) => ({ ...p })));
                const rem = Math.max(0, voucher.netDue - voucher.amountPaid);
                setAmount(rem > 0 ? rem : voucher.netDue);
              }}
              onSaveLineItems={onSaveLineItems}
              amountPaid={voucher.amountPaid}
              studentId={voucher.studentId}
            />
          </div>

          {/* Right Pane: Collection Form */}
          <div className="lg:col-span-6 flex flex-col h-full min-h-0">
            <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between h-full space-y-2.5">
              <form onSubmit={onSubmit} className="flex flex-col justify-between h-full space-y-2.5 text-xs">
                <div className="space-y-2.5">
                  {/* Amount Section */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-700 text-[11px]">
                        Collection Amount (Rs.) *
                      </label>
                      {dynamicRemaining > 0 ? (
                        <button
                          type="button"
                          onClick={() => setAmount(dynamicRemaining)}
                          className="text-[11px] text-teal-600 hover:text-teal-800 font-bold hover:underline cursor-pointer"
                        >
                          Auto-fill Remaining ({formatCurrency(dynamicRemaining)})
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAmount(dynamicNetDue)}
                          className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer"
                        >
                          Fill Voucher Fee ({formatCurrency(dynamicNetDue)})
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">
                        Rs.
                      </span>
                      <input
                        type="number"
                        step="1"
                        required
                        min="1"
                        value={amount}
                        onChange={(e) =>
                          setAmount(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        className="w-full h-[38px] pl-9 pr-3 bg-white border border-slate-200 rounded-lg font-bold text-sm text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        placeholder="Enter Amount"
                      />
                    </div>

                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {dynamicRemaining > 0 ? (
                        <button
                          type="button"
                          onClick={() => setAmount(dynamicRemaining)}
                          className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded text-[10px] font-bold transition cursor-pointer"
                        >
                          Full Balance: {formatCurrency(dynamicRemaining)}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAmount(dynamicNetDue)}
                          className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded text-[10px] font-bold transition cursor-pointer"
                        >
                          Fill Fee: {formatCurrency(dynamicNetDue)}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAmount(dynamicNetDue)}
                        className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-[10px] font-semibold transition cursor-pointer"
                      >
                        Net Due: {formatCurrency(dynamicNetDue)}
                      </button>
                    </div>

                    {typeof amount === 'number' && amount > dynamicRemaining && (
                      <div className="mt-1.5 flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-md px-2 py-1">
                        <Info className="w-3 h-3 shrink-0" />
                        <span className="text-[10px] font-medium">
                          Excess {formatCurrency(amount - dynamicRemaining)} to be held as credit / advance.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Payment Mode & Date - Exactly 38px matching heights */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                        Payment Mode *
                      </label>
                      <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value as CollectMode)}
                        className="w-full h-[38px] px-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      >
                        <option value="Cash">Cash Desk</option>
                        <option value="BankTransfer">Bank Transfer / Online</option>
                        <option value="Cheque">Cheque Deposit</option>
                        <option value="Online">Credit/Debit Card</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                        Collection Date *
                      </label>
                      <DatePicker
                        value={date}
                        required
                        themeColor={themeColor || 'teal'}
                        onChange={(newDate) => setDate(newDate)}
                        idPrefix="voucher-collect-date"
                        placeholder="Select Collection Date"
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Compacted Bank Ref & Notes - 2 columns */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                        Bank Ref / Slip #
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. PK-MZB-988471"
                        value={refNo}
                        onChange={(e) => setRefNo(e.target.value)}
                        className="w-full h-[38px] px-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                        Notes (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Optional receipt notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full h-[38px] px-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Modal Footer Controls */}
                <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-200 mt-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer font-semibold text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={Number(amount) <= 0}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs transition cursor-pointer text-xs disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Confirm & Post ({amount ? formatCurrency(Number(amount)) : 'Rs. 0'})</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

