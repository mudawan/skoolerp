import React from 'react';
import { FeeVoucher, VoucherItem } from '../../types';
import { formatCurrency, getAppliedFineAmount, getEffectiveMultiple } from '../../utils/feeMath';
import { RotateCcw, Trash2, X } from 'lucide-react';

interface VoucherDetailModalProps {
  voucher: FeeVoucher;
  particulars: VoucherItem[];
  roundingEnabled: boolean;
  roundingMultiple: number;
  canUndoCarry: boolean;
  canDelete: boolean;
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
  onUndoCarry,
  onDelete,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-base font-bold text-slate-900">
            Voucher Particulars &bull; {voucher.voucherNo}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-2">Line Item</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {particulars.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-2 font-medium">{item.label}</td>
                    <td
                      className={`p-2 text-right font-bold ${
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
                  <td className="p-2">
                    {getEffectiveMultiple(roundingEnabled, roundingMultiple, voucher?.roundingMultiple) > 1
                      ? `NET DUE AMOUNT (ROUNDED TO ${getEffectiveMultiple(roundingEnabled, roundingMultiple, voucher?.roundingMultiple)}):`
                      : 'NET DUE AMOUNT:'}
                  </td>
                  <td className="p-2 text-right text-teal-700 font-bold">
                    {formatCurrency(voucher.netDue)}
                  </td>
                </tr>
                <tr className="bg-rose-50 font-bold text-rose-900 border-t border-rose-200">
                  <td className="p-2">PAYABLE AFTER DUE DATE:</td>
                  <td className="p-2 text-right text-rose-700 font-bold">
                    {formatCurrency(voucher.netDue + getAppliedFineAmount(voucher, roundingMultiple))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            {voucher.status === 'Carried' && canUndoCarry && (
              <button
                type="button"
                onClick={() => onUndoCarry(voucher)}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Undo Carry Forward
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(voucher)}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Voucher
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
