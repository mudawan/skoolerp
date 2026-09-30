import React from 'react';
import { useApp } from '../context/AppContext';
import { MonthPicker } from './MonthPicker';
import { getMonthPickerWindow, mergeWithDataMonths } from '../utils/feeMath';
import {
  Building2,
} from 'lucide-react';

export const HeaderBar: React.FC = () => {
  const {
    activeMonth,
    setActiveMonth,
    beforeMonthChange,
    vouchers,
    institute,
    getMonthClosureStatus,
    themeConfig,
  } = useApp();

  // `pickerWindowMonths` covers a reasonable +/- window around today, merged
  // with any months that actually have vouchers -- used only to check
  // closure status. `monthsWithData` is the real set of months that have
  // vouchers, used for the "Vouchers / Records Exist" indicator dot; the
  // window months alone don't mean data exists, so they must NOT feed that
  // indicator (previously they did, making nearly every month in the window
  // show the dot even when nothing existed for it).
  const pickerWindowMonths = mergeWithDataMonths(
    getMonthPickerWindow(),
    vouchers.map((v) => v.month)
  );
  const monthsWithData = Array.from(new Set(vouchers.map((v) => v.month)));

  const requestMonthChange = (next: string) => {
    if (next === activeMonth) return;
    if (beforeMonthChange.current && beforeMonthChange.current(next)) return;
    setActiveMonth(next);
  };

  return (
    <header className="bg-slate-900 text-slate-100 border-b border-slate-800 sticky top-0 z-30 shadow-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Institute Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-xl shadow-sm border border-teal-500 overflow-hidden">
            {institute.logoUrl ? (
              <img
                src={institute.logoUrl}
                alt={institute.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Building2 className="w-6 h-6" />
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              {institute.name}
            </h1>
            <p className="text-xs text-slate-400">
              School Fee Management System &bull; {institute.regNo}
            </p>
          </div>
        </div>

        {/* Right: Controls & Role Switcher */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Working Month Selector */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold text-xs hidden sm:inline">Working Month:</span>
            <MonthPicker
              value={activeMonth}
              onChange={requestMonthChange}
              availableMonths={monthsWithData}
              closedMonths={pickerWindowMonths.filter((m) => getMonthClosureStatus(m).isClosed)}
              themeColor={themeConfig?.color || 'teal'}
              isLight={false}
              idPrefix="headerbar-month-picker"
              align="right"
            />
          </div>
        </div>
      </div>
    </header>
  );
};