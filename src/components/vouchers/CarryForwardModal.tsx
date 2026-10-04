import React from 'react';
import { FeeVoucher } from '../../types';
import { formatCurrency, formatMonthName } from '../../utils/feeMath';
import { ArrowRight, X } from 'lucide-react';

export interface CarryModalState {
  isOpen: boolean;
  targetVouchers: FeeVoucher[];
  targetMonth: string;
}

interface CarryForwardModalProps {
  carryModal: CarryModalState;
  addLateFine: boolean;
  setAddLateFine: (v: boolean) => void;
  carryFineAmount: number;
  setCarryFineAmount: (v: number) => void;
  isProcessing?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Shared "Confirm Carry Forward" dialog used by every carry-forward entry point
 * (Defaulters, Vouchers, Month-End Wizard). The vouchers being carried are already
 * visible in the calling view, so this shows only a summary and the late-fine option.
 */
export const CarryForwardModal: React.FC<CarryForwardModalProps> = ({
  carryModal,
  addLateFine,
  setAddLateFine,
  carryFineAmount,
  setCarryFineAmount,
  isProcessing = false,
  onClose,
  onConfirm,
}) => {
  const count = carryModal.targetVouchers.length;
  const arrears = carryModal.targetVouchers.reduce((sum, v) => sum + (v.netDue - v.amountPaid), 0);
  const fineEach = addLateFine ? carryFineAmount : 0;
  const totalFines = fineEach * count;
  const targetLabel = formatMonthName(carryModal.targetMonth);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-100 text-amber-700 shrink-0">
              <ArrowRight className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Confirm Carry Forward to {targetLabel}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Carrying forward will mark the voucher(s) as 'Carried' and transfer the unpaid arrears as Previous
                Balance into {targetLabel}.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" disabled={isProcessing}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addLateFine}
              onChange={(e) => setAddLateFine(e.target.checked)}
              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300 cursor-pointer"
            />
            <span className="font-semibold text-amber-950">Add Late Payment Fine / Surcharge</span>
          </label>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[11px] font-bold ${addLateFine ? 'text-amber-800' : 'text-slate-400'}`}>Rs.</span>
            <input
              type="number"
              min="0"
              disabled={!addLateFine}
              value={carryFineAmount}
              onWheel={(e) => (e.target as HTMLElement).blur()}
              onChange={(e) => setCarryFineAmount(Math.max(0, Number(e.target.value) || 0))}
              className={`w-24 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-right border transition-all ${
                addLateFine
                  ? 'bg-white border-amber-300 text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none shadow-2xs'
                  : 'bg-amber-100/40 border-amber-200/60 text-slate-400 cursor-not-allowed opacity-60'
              }`}
              placeholder="0"
            />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-600">Vouchers to carry</span>
            <span className="font-bold text-slate-900">{count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Unpaid arrears</span>
            <span className="font-mono font-bold text-slate-900">{formatCurrency(arrears)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">
              Late fines{addLateFine && count > 0 ? ` (${count} × ${formatCurrency(fineEach)})` : ''}
            </span>
            <span className="font-mono font-bold text-slate-900">{formatCurrency(totalFines)}</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-slate-200">
            <span className="font-bold text-slate-800">Total carried into {targetLabel}</span>
            <span className="font-mono font-bold text-amber-700">{formatCurrency(arrears + totalFines)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing || count === 0}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>{isProcessing ? 'Processing...' : `Confirm & Carry Forward (${count})`}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
