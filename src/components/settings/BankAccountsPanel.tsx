import React from 'react';
import { useApp } from '../../context/AppContext';
import { BankAccount } from '../../types';
import { Pencil, Plus, Trash2 } from 'lucide-react';

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
  const { hasPermission, setDefaultBankAccount } = useApp();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-800 text-sm">
          Collection Bank Accounts (Shown on Fee Vouchers)
        </h3>
        {hasPermission('settings.manage') && (
          <button
            onClick={() => handleOpenBankModal()}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Bank Account
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bankAccounts.map((bank) => (
          <div
            key={bank.id}
            className={`p-5 rounded-2xl border space-y-3 transition ${
              bank.isDefault
                ? 'bg-white border-teal-500 ring-2 ring-teal-500/20 shadow-md'
                : 'bg-white border-slate-200/80 shadow-xs'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-900 text-base">{bank.bankName}</h4>
                  {bank.isDefault && (
                    <span className="bg-teal-100 text-teal-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                      ACTIVE DEFAULT BANK
                    </span>
                  )}
                </div>
                <p className="font-mono font-bold text-slate-700 text-xs mt-0.5">
                  A/C: {bank.accountNumber}
                </p>
              </div>

              {hasPermission('settings.manage') && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenBankModal(bank)}
                    className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                    title="Edit Bank Details & Instructions"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {!bank.isDefault && (
                    <button
                      type="button"
                      onClick={() => setDefaultBankAccount(bank.id)}
                      className="text-[11px] font-bold text-teal-600 hover:underline cursor-pointer px-1.5 py-1"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBankToDelete(bank)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                    title="Delete Bank Account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-semibold">Title: {bank.title}</span>
                {bank.branchCode && <span className="text-slate-500">Branch: {bank.branchCode}</span>}
              </div>

              {/* LTR Instructions (English) */}
              <div className="bg-white p-2 rounded-lg border border-slate-200/80 space-y-0.5" dir="ltr">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Instructions (LTR / English)
                </span>
                <p className="text-slate-700 text-[11px] font-medium leading-tight">
                  {bank.instructionsLtr || bank.instructionsLine1 || <span className="text-slate-400 italic">No English instructions set</span>}
                </p>
              </div>

              {/* RTL Instructions (Urdu) */}
              <div className="bg-white p-2 rounded-lg border border-slate-200/80 space-y-0.5" dir="rtl">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 block text-right">
                  ہدایات (RTL / Urdu)
                </span>
                <p className="text-slate-800 text-[11.5px] font-medium leading-relaxed text-right font-urdu">
                  {bank.instructionsRtl || bank.instructionsLine2 || <span className="text-slate-400 italic">اردو ہدایات درج نہیں ہیں</span>}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
