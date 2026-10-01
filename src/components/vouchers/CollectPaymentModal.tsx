import React from 'react';
import { FeeVoucher, PaymentMode, Student, VoucherItem } from '../../types';
import { formatCurrency } from '../../utils/feeMath';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { X, CheckCircle2, DollarSign, Calendar } from 'lucide-react';

export interface CollectPaymentModalProps {
  voucher: FeeVoucher;
  students: Student[];
  items: VoucherItem[];
  setItems: (items: VoucherItem[]) => void;
  amount: number;
  setAmount: (amt: number) => void;
  mode: PaymentMode;
  setMode: (mode: PaymentMode) => void;
  refNo: string;
  setRefNo: (ref: string) => void;
  notes: string;
  setNotes: (notes: string) => void;
  date: string;
  setDate: (date: string) => void;
  themeColor?: string;
  dynamicNetDue: number;
  dynamicRemaining: number;
  roundingEnabled?: boolean;
  roundingMultiple?: number;
  onSaveLineItems?: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const CollectPaymentModal: React.FC<CollectPaymentModalProps> = ({
  voucher,
  students,
  items,
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
  dynamicNetDue,
  dynamicRemaining,
  onSubmit,
  onClose,
}) => {
  useEscapeKey(onClose, true);
  const student = students.find((s) => s.id === voucher.studentId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Collect Fee Payment</h3>
              <p className="text-[11px] text-slate-500">
                Voucher #{voucher.voucherNo} • {student?.name || 'Student'} ({student?.regNo})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <div>
              <div className="text-[10px] text-slate-500 font-semibold">Total Due</div>
              <div className="text-sm font-bold font-mono text-slate-900">{formatCurrency(dynamicNetDue)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-semibold">Remaining Balance</div>
              <div className="text-sm font-bold font-mono text-rose-600">{formatCurrency(dynamicRemaining)}</div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Amount to Collect (Rs.) *</label>
              <input
                type="number"
                min="1"
                max={dynamicRemaining > 0 ? dynamicRemaining : undefined}
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm font-bold font-mono bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                placeholder="0"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PaymentMode)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="BankTransfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online">Online</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reference / Cheque #</label>
              <input
                type="text"
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                placeholder="Optional bank txn or cheque number"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Remarks</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional collection notes"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={amount <= 0}
              onClick={onSubmit}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Confirm Payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
