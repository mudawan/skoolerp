import React from 'react';
import { BankAccount } from '../../types';
import { Landmark, Plus, Trash2, Edit2, CheckCircle2 } from 'lucide-react';

export interface BankAccountsPanelProps {
  bankAccounts: BankAccount[];
  handleOpenBankModal: (bank?: BankAccount) => void;
  setBankToDelete: (bank: BankAccount) => void;
}

export const BankAccountsPanel: React.FC<BankAccountsPanelProps> = ({
  bankAccounts,
  handleOpenBankModal,
  setBankToDelete,
}) => {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Designated Bank Accounts</h3>
            <p className="text-xs text-slate-500">Bank accounts printed on fee vouchers and deposit slips</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleOpenBankModal()}
          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Bank Account
        </button>
      </div>

      {bankAccounts.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          No bank accounts configured. Add a designated bank account for fee voucher deposits.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bankAccounts.map((b) => (
            <div
              key={b.id}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-xs transition space-y-2 text-xs"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    {b.bankName}
                    {b.isDefault && (
                      <span className="px-1.5 py-0.5 rounded font-extrabold text-[10px] bg-emerald-100 text-emerald-800">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500 text-[11px]">{b.title}</div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenBankModal(b)}
                    className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setBankToDelete(b)}
                    className="p-1 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="font-mono text-slate-700 bg-white p-2 rounded-lg border border-slate-200/80">
                <span className="text-slate-400 select-none mr-2">A/C:</span>
                <span className="font-bold">{b.accountNumber}</span>
                {b.branchCode && (
                  <span className="text-slate-500 ml-2 text-[11px]">(Branch: {b.branchCode})</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
