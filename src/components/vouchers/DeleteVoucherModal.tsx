import React from 'react';
import { FeeVoucher, Student, VoucherDeletionResolution } from '../../types';
import { DownstreamConflict } from '../../context/AppContext';
import { formatCurrency, formatMonthName } from '../../utils/feeMath';
import {
  AlertTriangle,
  ArrowUp,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';

export interface DeleteModalState {
  isOpen: boolean;
  mode: 'single' | 'bulk';
  targetVoucher?: FeeVoucher;
  targetIds?: string[];
  hasTransactions: boolean;
  transactionCount: number;
  hasDownstream: boolean;
  downstreamConflicts: DownstreamConflict[];
  totalDownstreamCount: number;
}

interface DeleteVoucherModalProps {
  deleteModal: DeleteModalState;
  students: Student[];
  voucherDeletionResolution: VoucherDeletionResolution;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteVoucherModal: React.FC<DeleteVoucherModalProps> = ({
  deleteModal,
  students,
  voucherDeletionResolution,
  onClose,
  onConfirm,
}) => {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div
        id="voucher-delete-guard-modal"
        className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        {deleteModal.hasDownstream ? (
          // Chronological Sequence Notice (Policy Applied)
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  voucherDeletionResolution === 'auto-heal'
                    ? 'bg-emerald-100 text-emerald-700'
                    : voucherDeletionResolution === 'cascade'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {voucherDeletionResolution === 'auto-heal' ? (
                  <Sparkles className="w-6 h-6" />
                ) : voucherDeletionResolution === 'cascade' ? (
                  <Trash2 className="w-6 h-6" />
                ) : (
                  <ShieldAlert className="w-6 h-6" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {voucherDeletionResolution === 'auto-heal'
                      ? 'Delete Voucher & Auto-Heal Balances'
                      : voucherDeletionResolution === 'cascade'
                      ? 'Delete Voucher & Cascade Subsequent'
                      : 'Deletion Blocked by System Policy'}
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  {voucherDeletionResolution === 'auto-heal'
                    ? 'Subsequent billing month vouchers exist. Deleting will automatically recalculate downstream balances to remove ghost arrears.'
                    : voucherDeletionResolution === 'cascade'
                    ? `Subsequent billing month vouchers exist. Deleting will remove this voucher and cascade delete all ${deleteModal.totalDownstreamCount} downstream voucher(s).`
                    : 'Subsequent billing month vouchers exist. System policy requires deleting newer vouchers first before removing prior records.'}
                </p>
              </div>
            </div>

            {/* Target & Downstream Conflict Details (Brief & Uncluttered) */}
            {deleteModal.downstreamConflicts.length === 1 ? (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Student:</span>
                  <span className="font-bold text-slate-900">
                    {deleteModal.downstreamConflicts[0].student.name}{' '}
                    <span className="text-slate-500 font-mono font-normal">
                      ({deleteModal.downstreamConflicts[0].student.regNo})
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Subsequent Voucher(s):</span>
                  <span className="font-semibold text-slate-800">
                    {deleteModal.downstreamConflicts[0].downstreamVouchers
                      .map((dv) => dv.month)
                      .join(', ')}{' '}
                    <span className="text-slate-500 font-normal">
                      ({deleteModal.downstreamConflicts[0].downstreamVouchers.length} total)
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-700">
                  <span>Affected Students ({deleteModal.downstreamConflicts.length}):</span>
                  <span className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {deleteModal.totalDownstreamCount} subsequent voucher(s)
                  </span>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {deleteModal.downstreamConflicts.map((conflict, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/80 text-[11px]"
                    >
                      <span className="font-medium text-slate-900 truncate max-w-[220px]">
                        {conflict.student.name}{' '}
                        <span className="text-slate-500 font-mono font-normal text-[10px]">
                          ({conflict.student.regNo})
                        </span>
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        {conflict.downstreamVouchers.map((dv) => dv.month).join(', ')}{' '}
                        <span className="font-medium text-slate-700">
                          ({conflict.downstreamVouchers.length})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transaction Notice */}
            {deleteModal.hasTransactions && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-900 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  Payment Transactions Detected
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800/90">
                  {deleteModal.transactionCount} payment transaction(s) recorded on the selected voucher(s). Confirming will automatically reverse and remove those payment records from the collections ledger.
                </p>
              </div>
            )}

            {/* Active Policy Status Indicator */}
            <div className="p-2.5 rounded-xl border text-xs flex items-center justify-between bg-slate-50 border-slate-200">
              <span className="text-slate-500 font-medium">Applied Settings Policy:</span>
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                {voucherDeletionResolution === 'auto-heal' && (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Auto-Heal & Recalculate
                  </>
                )}
                {voucherDeletionResolution === 'cascade' && (
                  <>
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    Cascade Delete All Subsequent
                  </>
                )}
                {voucherDeletionResolution === 'manual' && (
                  <>
                    <ArrowUp className="w-3.5 h-3.5 text-slate-700" />
                    Strict Reverse Chronological
                  </>
                )}
              </span>
            </div>

            {/* Footer Controls */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                {voucherDeletionResolution === 'manual' ? 'Close' : 'Cancel'}
              </button>

              {voucherDeletionResolution === 'auto-heal' && (
                <button
                  type="button"
                  id="btn-confirm-auto-heal-delete"
                  onClick={onConfirm}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Auto-Heal & Delete
                </button>
              )}

              {voucherDeletionResolution === 'cascade' && (
                <button
                  type="button"
                  id="btn-confirm-cascade-delete"
                  onClick={onConfirm}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Cascade Delete All ({1 + deleteModal.totalDownstreamCount})
                </button>
              )}
            </div>
          </div>
        ) : (
          // Standard Delete Confirmation (No Downstream Conflicts)
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-100 text-rose-700 rounded-xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {deleteModal.mode === 'single'
                    ? `Delete Fee Voucher ${deleteModal.targetVoucher?.voucherNo}`
                    : `Delete ${deleteModal.targetIds?.length} Selected Vouchers`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  This action will permanently remove the selected voucher record(s).
                </p>
              </div>
            </div>

            {deleteModal.mode === 'single' && deleteModal.targetVoucher && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Student:</span>
                  <span className="font-bold text-slate-900">
                    {students.find((s) => s.id === deleteModal.targetVoucher?.studentId)?.name || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Month / Status:</span>
                  <span className="font-semibold text-slate-800">
                    {formatMonthName(deleteModal.targetVoucher.month)} ({deleteModal.targetVoucher.status})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Net Due:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatCurrency(deleteModal.targetVoucher.netDue)}
                  </span>
                </div>
              </div>
            )}

            {deleteModal.hasTransactions && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-900 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  Payment Transactions Detected
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800/90">
                  {deleteModal.mode === 'single'
                    ? `This voucher has ${deleteModal.transactionCount} recorded payment transaction(s). Confirming will automatically reverse/delete those payment records from collections.`
                    : `${deleteModal.transactionCount} payment transaction(s) exist across these vouchers. Confirming will automatically reverse/delete those payment records from collections.`}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-standard-delete"
                onClick={onConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Confirm & Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
