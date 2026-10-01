import React from 'react';
import { useApp } from '../../context/AppContext';
import { formatCurrency, formatMonthName } from '../../utils/feeMath';
import { ActiveTab } from '../../types';
import { Calendar, CheckCircle2, Lock, ArrowRight, AlertTriangle } from 'lucide-react';

export interface MonthEndWizardPanelProps {
  initialMonth?: string;
  hideHeader?: boolean;
  onNavigateToTab?: (tab: ActiveTab) => void;
}

export const MonthEndWizardPanel: React.FC<MonthEndWizardPanelProps> = ({
  initialMonth,
  onNavigateToTab,
}) => {
  const { activeMonth, vouchers, lockedMonths, lockMonth, unlockMonth } = useApp();
  const month = initialMonth || activeMonth;
  const isLocked = lockedMonths.includes(month);

  const monthVouchers = vouchers.filter((v) => v.month === month && v.status !== 'Reversed');
  const paidCount = monthVouchers.filter((v) => v.status === 'Paid').length;
  const unpaidCount = monthVouchers.filter((v) => v.status === 'Issued' || v.status === 'Partial').length;
  const carriedCount = monthVouchers.filter((v) => v.status === 'Carried').length;
  const totalDue = monthVouchers.reduce((s, v) => s + v.netDue, 0);
  const totalCollected = monthVouchers.reduce((s, v) => s + v.amountPaid, 0);

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Month-End Closure Wizard • {formatMonthName(month)}
            </h3>
            <p className="text-xs text-slate-500">Reconcile fee collections, audit defaulters, and close billing months</p>
          </div>
        </div>

        {isLocked ? (
          <button
            type="button"
            onClick={() => unlockMonth(month)}
            className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-rose-600" />
            Unlock Billing Month
          </button>
        ) : (
          <button
            type="button"
            onClick={() => lockMonth(month)}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Lock & Finalize Month
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="text-slate-500 text-[11px]">Total Issued</div>
          <div className="text-base font-bold font-mono text-slate-900">{monthVouchers.length}</div>
        </div>
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
          <div className="text-emerald-700 text-[11px] font-semibold">Fully Paid</div>
          <div className="text-base font-bold font-mono text-emerald-800">{paidCount}</div>
        </div>
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
          <div className="text-amber-700 text-[11px] font-semibold">Outstanding Defaulters</div>
          <div className="text-base font-bold font-mono text-amber-900">{unpaidCount}</div>
        </div>
        <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
          <div className="text-indigo-700 text-[11px] font-semibold">Carried Forward</div>
          <div className="text-base font-bold font-mono text-indigo-900">{carriedCount}</div>
        </div>
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-slate-800">Financial Summary</div>
          <div className="text-[11px] text-slate-500">
            Total Billed: <span className="font-mono font-bold text-slate-700">{formatCurrency(totalDue)}</span> • Collected:{' '}
            <span className="font-mono font-bold text-emerald-700">{formatCurrency(totalCollected)}</span>
          </div>
        </div>

        {onNavigateToTab && unpaidCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigateToTab('defaulters')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>Review Defaulters</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
