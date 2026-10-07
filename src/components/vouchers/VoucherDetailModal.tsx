import React from 'react';
import { FeeVoucher, VoucherItem } from '../../types';
import { formatCurrency, getAppliedFineAmount, getEffectiveMultiple } from '../../utils/feeMath';
import { RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';

interface VoucherDetailModalProps {
  voucher: FeeVoucher;
  particulars: VoucherItem[];
  roundingEnabled: boolean;
  roundingMultiple: number;
  canUndoCarry: boolean;
  canDelete: boolean;
  canReissue?: boolean;
  onReissue?: (v: FeeVoucher) => void;
  onUndoCarry: (v: FeeVoucher) => void;
  onDelete: (v: FeeVoucher) => void;
  onClose: () => void;
}

export const VoucherDetailModal: React.FC<VoucherDetailModalProps> = ({
  voucher,
  particulars,
  roundingEnabled,
  roundingMultiple,
  canUndoCarry,
  canDelete,
  canReissue = false,
  onReissue,
  onUndoCarry,
  onDelete,
  onClose,
}) => {
  const [confirmReissue, setConfirmReissue] = React.useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-3 sm:space-y-4 my-auto max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate pr-2">
            Voucher Details &bull; <span className="font-mono">{voucher.voucherNo}</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 text-xs overflow-y-auto flex-1 min-h-0">
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[55vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="p-2 sm:p-2.5">Line Item</th>
                  <th className="p-2 sm:p-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {particulars.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-2 sm:p-2.5 font-medium text-slate-800">{item.label}</td>
                    <td
                      className={`p-2 sm:p-2.5 text-right font-bold ${
                        item.amount < 0 ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="divide-y divide-slate-200">
                <tr className="bg-slate-100 font-bold text-slate-800 border-t border-slate-300">
                  <td className="p-2 sm:p-2.5 text-[11px] sm:text-xs">
                    NET DUE AMOUNT:
                  </td>
                  <td className="p-2 sm:p-2.5 text-right text-teal-700 font-bold text-xs sm:text-sm">
                    {formatCurrency(voucher.netDue)}
                  </td>
                </tr>
                <tr className="bg-rose-50 font-bold text-rose-900 border-t border-rose-200">
                  <td className="p-2 sm:p-2.5 text-[10.5px] sm:text-[11px]">PAYABLE AFTER DUE DATE:</td>
                  <td className="p-2 sm:p-2.5 text-right text-rose-700 font-bold text-xs sm:text-sm">
                    {formatCurrency(voucher.netDue + getAppliedFineAmount(voucher, roundingMultiple))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {voucher.status === 'Carried' && canUndoCarry && (
              <button
                type="button"
                onClick={() => onUndoCarry(voucher)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Undo Carry Forward</span>
              </button>
            )}
            {canReissue && onReissue && voucher.status !== 'Carried' && voucher.status !== 'Reversed' && voucher.voucherType !== 'Admission' && (
              confirmReissue ? (
                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-teal-50 border border-teal-200 rounded-xl text-[11px] text-teal-900">
                  <span className="font-semibold">Rebuild from current fee settings? Manual edits are replaced; payments are kept.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmReissue(false);
                      onReissue(voucher);
                    }}
                    className="px-2 py-1 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Reissue
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReissue(false)}
                    className="px-2 py-1 bg-white border border-teal-200 font-bold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReissue(true)}
                  className="flex-1 sm:flex-initial px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reissue</span>
                </button>
              )
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(voucher)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs cursor-pointer text-center"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
