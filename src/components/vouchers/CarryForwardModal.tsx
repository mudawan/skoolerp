import React, { useState } from 'react';
import { FeeVoucher, Student } from '../../types';
import { formatCurrency, formatMonthName, getNextMonthString } from '../../utils/feeMath';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { X, ArrowRight, AlertTriangle } from 'lucide-react';

export interface CarryForwardModalProps {
  isOpen: boolean;
  voucher: FeeVoucher | null;
  student?: Student;
  onClose: () => void;
  onConfirm: (targetMonth: string, addLateFine: boolean, customFineAmount?: number) => void;
}

export const CarryForwardModal: React.FC<CarryForwardModalProps> = ({
  isOpen,
  voucher,
  student,
  onClose,
  onConfirm,
}) => {
  useEscapeKey(onClose, isOpen);

  const [addLateFine, setAddLateFine] = useState(false);
  const [fineAmount, setFineAmount] = useState<number>(voucher?.lateFeeRate || 100);
  const targetMonth = voucher ? getNextMonthString(voucher.month) : '';
  const outstanding = voucher ? voucher.netDue - voucher.amountPaid : 0;

  if (!isOpen || !voucher) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-amber-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <ArrowRight className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Carry Forward Balance</h3>
              <p className="text-[11px] text-slate-500">Roll unpaid arrears to following month</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Student:</span>
              <span className="font-bold text-slate-900">{student?.name || 'Student'} ({student?.regNo})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Source Month:</span>
              <span className="font-semibold text-slate-700">{formatMonthName(voucher.month)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Target Month:</span>
              <span className="font-bold text-teal-700">{formatMonthName(targetMonth)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5">
              <span className="text-slate-700 font-bold">Outstanding Arrears:</span>
              <span className="font-bold text-rose-600 font-mono">{formatCurrency(outstanding)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={addLateFine}
                onChange={(e) => setAddLateFine(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500"
              />
              <span>Apply Late Payment Fine</span>
            </label>

            {addLateFine && (
              <div className="pl-6 pt-1">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Fine Amount (Rs.)</label>
                <div className="relative w-36">
                  <span className={`absolute left-2.5 top-1.5 text-[11px] font-bold ${addLateFine ? 'text-amber-800' : 'text-slate-400'}`}>
                    Rs.
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={fineAmount}
                    onChange={(e) => setFineAmount(Number(e.target.value) || 0)}
                    className="w-full pl-8 pr-2 py-1 bg-white border border-amber-300 rounded-lg text-xs font-bold font-mono focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            )}
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
              onClick={() => onConfirm(targetMonth, addLateFine, addLateFine ? fineAmount : undefined)}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Confirm Carry Forward
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
