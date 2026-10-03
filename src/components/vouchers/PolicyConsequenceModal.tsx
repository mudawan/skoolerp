import React from 'react';
import { VoucherPreviewCalculation, formatMonthName } from '../../utils/feeMath';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface PolicyConfirmModalState {
  isOpen: boolean;
  priorRule?: 'warning' | 'recalculate';
  affectedPriorPreviews: VoucherPreviewCalculation[];
  affectedSkippedPreviews: VoucherPreviewCalculation[];
}

interface PolicyConsequenceModalProps {
  policyConfirmModal: PolicyConfirmModalState;
  targetMonth: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const PolicyConsequenceModal: React.FC<PolicyConsequenceModalProps> = ({
  policyConfirmModal,
  targetMonth,
  onClose,
  onConfirm,
}) => {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-xl shrink-0 bg-amber-100 text-amber-700">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Generation Policy Consequence Confirmation
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              You are generating fee vouchers for <strong>{formatMonthName(targetMonth)}</strong>. Please review the policy consequences below before proceeding.
            </p>
          </div>
        </div>

        {/* Skipped Month Warning Section */}
        {policyConfirmModal.affectedSkippedPreviews.length > 0 && (
          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/80 text-xs text-amber-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              Skipped Billing Month Policy Consequence:
            </div>
            <p className="leading-relaxed">
              Generating vouchers for <strong>{formatMonthName(targetMonth)}</strong> will proceed, but prior intermediate billing month(s) (e.g. {policyConfirmModal.affectedSkippedPreviews[0]?.skippedMonths?.map(formatMonthName).join(', ')}) remain unbilled and skipped for the affected student(s).
            </p>
            <div className="text-[11px] font-bold text-slate-700 pt-1">
              Students with Skipped Months ({policyConfirmModal.affectedSkippedPreviews.length}):
            </div>
            <div className="max-h-28 overflow-y-auto border border-amber-200/60 rounded-lg p-1.5 bg-white/80 space-y-1">
              {policyConfirmModal.affectedSkippedPreviews.map((p) => (
                <div key={p.student.id} className="flex items-center justify-between text-slate-800 text-[11px] px-2 py-1 bg-amber-50/50 rounded">
                  <span className="font-semibold">{p.student.name} ({p.student.regNo})</span>
                  <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                    Skipped: {p.skippedMonths?.map(formatMonthName).join(', ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prior Month Consequence Section */}
        {policyConfirmModal.affectedPriorPreviews.length > 0 && (
          policyConfirmModal.priorRule === 'warning' ? (
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/80 text-xs text-amber-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Prior Month Sequential Consequence:
              </div>
              <p className="leading-relaxed">
                Generating vouchers for <strong>{formatMonthName(targetMonth)}</strong> will create the new voucher(s), but existing future vouchers will <strong>NOT</strong> automatically inherit new carry-over balance arrears.
              </p>
              <div className="text-[11px] font-bold text-slate-700 pt-1">
                Students with Existing Future Vouchers ({policyConfirmModal.affectedPriorPreviews.length}):
              </div>
              <div className="max-h-28 overflow-y-auto border border-amber-200/60 rounded-lg p-1.5 bg-white/80 space-y-1">
                {policyConfirmModal.affectedPriorPreviews.map((p) => (
                  <div key={p.student.id} className="flex items-center justify-between text-slate-800 text-[11px] px-2 py-1 bg-amber-50/50 rounded">
                    <span className="font-semibold">{p.student.name} ({p.student.regNo})</span>
                    <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                      Future: {formatMonthName(p.latestFutureMonth || '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-indigo-50 rounded-xl border border-indigo-200/80 text-xs text-indigo-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-indigo-800">
                <RefreshCw className="w-4 h-4 text-indigo-600 shrink-0" />
                Auto-Recalculation Notice:
              </div>
              <p className="leading-relaxed">
                Generating vouchers for <strong>{formatMonthName(targetMonth)}</strong> will create the new voucher(s) AND <strong>automatically recalculate</strong> and update previous balance arrears on all subsequent future vouchers.
              </p>
              <div className="text-[11px] font-bold text-slate-700 pt-1">
                Students with Existing Future Vouchers ({policyConfirmModal.affectedPriorPreviews.length}):
              </div>
              <div className="max-h-28 overflow-y-auto border border-indigo-200/60 rounded-lg p-1.5 bg-white/80 space-y-1">
                {policyConfirmModal.affectedPriorPreviews.map((p) => (
                  <div key={p.student.id} className="flex items-center justify-between text-slate-800 text-[11px] px-2 py-1 bg-indigo-50/50 rounded">
                    <span className="font-semibold">{p.student.name} ({p.student.regNo})</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
                      Future: {formatMonthName(p.latestFutureMonth || '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

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
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
          >
            Confirm & Proceed
          </button>
        </div>
      </div>
    </div>
  );
};
