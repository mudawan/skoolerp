import React from 'react';
import { FeeVoucher, Student, VoucherItem } from '../../types';
import {
  formatCurrency,
  formatMonthName,
  getEffectiveMultiple,
  roundUpToMultiple,
} from '../../utils/feeMath';
import { VoucherParticularsEditor } from '../VoucherParticularsEditor';
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
  dynamicNetDue,
  dynamicRemaining,
  roundingEnabled,
  roundingMultiple,
  onSaveLineItems,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-5xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto sm:my-8 animate-in fade-in duration-200 border border-slate-200/80">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Collect Payment &bull; {voucher.voucherNo}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Student: {students.find((s) => s.id === voucher.studentId)?.name} &bull; {students.find((s) => s.id === voucher.studentId)?.regNo} &bull; {formatMonthName(voucher.month)}                  </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Pane: Particulars Editor */}
          <div className="lg:col-span-6 space-y-2">
            <VoucherParticularsEditor
              items={items}
              onChange={(updated) => {
                setItems(updated);
                const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, voucher?.roundingMultiple);
                const newNet = Math.max(0, roundUpToMultiple(updated.reduce((s, p) => s + (Number(p.amount) || 0), 0), mult));
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

          {/* Right Pane: Summary Card & Collection Form */}
          <div className="lg:col-span-6 space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
            {/* Summary Card */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Student</span>
                <span className="font-bold text-slate-900">
                  {students.find((s) => s.id === voucher.studentId)?.name}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono">
                <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                  <div className="text-[9px] text-slate-500 font-sans">Original Due</div>
                  <div className="font-bold text-slate-800 text-xs">{formatCurrency(voucher.netDue)}</div>
                </div>
                <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                  <div className="text-[9px] text-slate-500 font-sans">Paid</div>
                  <div className="font-bold text-emerald-700 text-xs">
                    {formatCurrency(voucher.amountPaid)}
                  </div>
                </div>
                <div className="bg-emerald-50/80 p-1.5 rounded border border-emerald-200">
                  <div className="text-[9px] text-emerald-800 font-sans font-bold">
                    {voucher.amountPaid >= dynamicNetDue ? 'Settlement' : 'Remaining'}
                  </div>
                  <div className="font-black text-emerald-800 text-xs">
                    {voucher.amountPaid >= dynamicNetDue
                      ? `Paid ${
                          voucher.amountPaid > dynamicNetDue
                            ? `(+${formatCurrency(voucher.amountPaid - dynamicNetDue)} Adv)`
                            : ''
                        }`
                      : formatCurrency(dynamicRemaining)}
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Collection Amount (Rs.) *</label>
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
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rs.</span>
                  <input
                    type="number"
                    step="1"
                    required
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-base text-emerald-700 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                {typeof amount === 'number' && amount > dynamicRemaining && (
                  <div className="mt-1.5 flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-md px-2 py-1">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[11px] font-medium">
                      Excess {formatCurrency(amount - dynamicRemaining)} to be held as credit / advance.
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Mode</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as CollectMode)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs"
                  >
                    <option value="Cash">Cash Desk</option>
                    <option value="BankTransfer">Bank Transfer / Online</option>
                    <option value="Cheque">Cheque Deposit</option>
                    <option value="Online">Credit/Debit Card</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bank Ref / Deposit Slip #</label>
                  <input
                    type="text"
                    placeholder="e.g. PK-MZB-988471"
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Optional receipt notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Number(amount) <= 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Confirm & Post ({amount ? formatCurrency(Number(amount)) : 'Rs. 0'})</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
