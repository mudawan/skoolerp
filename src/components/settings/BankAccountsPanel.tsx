import React from 'react';
import { useApp } from '../../context/AppContext';
import { BankAccount } from '../../types';
import { THEME_COLOR_PRESETS } from '../../utils/themeConfig';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';

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
  const { hasPermission, setDefaultBankAccount, themeConfig } = useApp();
  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-800 text-sm">
          Collection Bank Accounts (Shown on Fee Vouchers)
        </h3>
        {hasPermission('settings.manage') && (
          <button
            onClick={() => handleOpenBankModal()}
            style={{ backgroundColor: preset.primaryColor }}
            className="flex items-center gap-2 hover:opacity-95 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition"
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
            style={
              bank.isDefault
                ? {
                    borderColor: preset.primaryColor,
                    background: `linear-gradient(160deg, ${preset.lightBg}80 0%, #ffffff 40%, #ffffff 100%)`,
                  }
                : {
                    background: `linear-gradient(160deg, ${preset.lightBg}40 0%, #ffffff 35%, #ffffff 100%)`,
                  }
            }
            className={`rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs hover:shadow-md hover:-translate-y-0.5 ${
              bank.isDefault
                ? 'ring-2'
                : 'border-slate-200/80 hover:border-slate-300'
            }`}
          >
            {/* Theme Accent Bar */}
            <div
              className="h-1.5 w-full transition-all duration-300"
              style={{
                background: bank.isDefault
                  ? `linear-gradient(90deg, ${preset.primaryColor} 0%, ${preset.hoverColor} 100%)`
                  : '#cbd5e1',
              }}
            />

            <div className="p-5 space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs"
                    style={{
                      backgroundColor: preset.lightBg,
                      borderColor: preset.lightBorder,
                      color: preset.primaryColor,
                    }}
                  >
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900 text-base">{bank.bankName}</h4>
                      {bank.isDefault && (
                        <span
                          style={{
                            backgroundColor: preset.lightBg,
                            color: preset.textColor,
                            borderColor: preset.lightBorder,
                          }}
                          className="font-extrabold text-[10px] px-2 py-0.5 rounded-full border tracking-wide"
                        >
                          ACTIVE DEFAULT BANK
                        </span>
                      )}
                    </div>
                    <p className="font-mono font-bold text-slate-700 text-xs mt-0.5">
                      A/C: {bank.accountNumber}
                    </p>
                  </div>
                </div>

                {hasPermission('settings.manage') && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenBankModal(bank)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                      title="Edit Bank Details & Instructions"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {!bank.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDefaultBankAccount(bank.id)}
                        style={{ color: preset.primaryColor }}
                        className="text-[11px] font-bold hover:underline cursor-pointer px-1.5 py-1"
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

              <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-100 text-xs space-y-2">
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
          </div>
        ))}
      </div>
    </div>
  );
};
