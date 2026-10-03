import React from 'react';
import { FeeVoucher, SchoolClass, Student } from '../../types';
import { formatCurrency, formatMonthName } from '../../utils/feeMath';
import { ArrowRight, X } from 'lucide-react';

export interface CarryModalState {
  isOpen: boolean;
  targetVouchers: FeeVoucher[];
  targetMonth: string;
}

interface CarryForwardModalProps {
  carryModal: CarryModalState;
  students: Student[];
  classes: SchoolClass[];
  addLateFine: boolean;
  setAddLateFine: (v: boolean) => void;
  carryFineAmount: number;
  setCarryFineAmount: (v: number) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export const CarryForwardModal: React.FC<CarryForwardModalProps> = ({
  carryModal,
  students,
  classes,
  addLateFine,
  setAddLateFine,
  carryFineAmount,
  setCarryFineAmount,
  onClose,
  onConfirm,
}) => {
  return (
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
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
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

        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-700 flex justify-between">
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
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
          >
            <span>Confirm & Carry Forward ({carryModal.targetVouchers.length})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
