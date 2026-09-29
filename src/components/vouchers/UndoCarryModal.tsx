import React from 'react';
import { FeeVoucher, Student } from '../../types';
import { formatCurrency, formatMonthName } from '../../utils/feeMath';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export interface UndoCarryModalState {
  isOpen: boolean;
  targetVoucher: FeeVoucher;
  hasDownstream: boolean;
  downstreamMonths: string[];
}

interface UndoCarryModalProps {
  undoCarryModal: UndoCarryModalState;
  students: Student[];
  onClose: () => void;
  onConfirm: () => void;
}

export const UndoCarryModal: React.FC<UndoCarryModalProps> = ({
  undoCarryModal,
  students,
  onClose,
  onConfirm,
}) => {
  return (
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
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
          >
            {undoCarryModal.hasDownstream ? 'Close' : 'Cancel'}
          </button>
          {!undoCarryModal.hasDownstream && (
            <button
              type="button"
              onClick={onConfirm}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Confirm Undo Carry</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
