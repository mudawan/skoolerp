import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Check } from 'lucide-react';
import { formatMonthName } from '../utils/feeMath';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';

export interface MonthPickerProps {
  value: string; // 'YYYY-MM'
  onChange: (monthStr: string) => void;
  availableMonths?: string[]; // Optional highlight/indicator of data months
  closedMonths?: string[]; // Optional months that are marked closed
  themeColor?: string;
  isLight?: boolean;
  className?: string;
  idPrefix?: string;
  align?: 'left' | 'right' | 'center';
  compact?: boolean;
  showSteppers?: boolean;
  variant?: 'pill' | 'input';
  disabled?: boolean;
  minYear?: number;
  maxYear?: number;
  placeholder?: string;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const MonthPicker: React.FC<MonthPickerProps> = ({
  value,
  onChange,
  availableMonths = [],
  closedMonths = [],
  themeColor = 'teal',
  isLight = false,
  className = '',
  idPrefix = 'month-picker',
  align = 'left',
  compact = false,
  showSteppers = true,
  variant = 'pill',
  disabled = false,
  minYear = 2020,
  maxYear = 2035,
  placeholder = 'Select Month',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current selected year and month
  const parsedParts = (value || '').split('-').map(Number);
  const selectedYear = parsedParts[0] || new Date().getFullYear();
  const selectedMonth = parsedParts[1] || new Date().getMonth() + 1;

  // Viewing year in the calendar grid
  const [viewYear, setViewYear] = useState<number>(selectedYear);

  const preset = THEME_COLOR_PRESETS[themeColor] || THEME_COLOR_PRESETS.teal;

  // Sync viewYear when value changes externally
  useEffect(() => {
    if (selectedYear) {
      setViewYear(selectedYear);
    }
  }, [selectedYear]);

  // Click outside listener to dismiss popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectMonth = (monthIndex: number) => {
    if (disabled) return;
    const monthStr = `${viewYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    onChange(monthStr);
    setIsOpen(false);
  };

  const handlePrevYear = () => {
    setViewYear((prev) => Math.max(minYear, prev - 1));
  };

  const handleNextYear = () => {
    setViewYear((prev) => Math.min(maxYear, prev + 1));
  };

  const handleQuickCurrent = () => {
    if (disabled) return;
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    setViewYear(curYear);
    const monthStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
    onChange(monthStr);
    setIsOpen(false);
  };

  // Quick navigation helpers for left/right step buttons next to trigger
  const handleStepMonth = (delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    let y = selectedYear;
    let m = selectedMonth + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    const newMonthStr = `${y}-${String(m).padStart(2, '0')}`;
    onChange(newMonthStr);
  };

  const currentMonthDate = new Date();
  const currentMonthStr = `${currentMonthDate.getFullYear()}-${String(currentMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const displayLabel = value
    ? compact
      ? `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`
      : `${formatMonthName(value)}`
    : placeholder;

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger: Input Variant (for forms / modals) */}
      {variant === 'input' ? (
        <button
          type="button"
          id={`${idPrefix}-trigger`}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 ${
            isOpen ? 'ring-2 border-teal-500 ring-teal-500/20' : ''
          } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'text-slate-800'}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CalendarIcon className="w-4 h-4 text-teal-600 shrink-0" />
            <span className="truncate">{displayLabel}</span>
          </div>
          <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">
            {value || 'YYYY-MM'}
          </span>
        </button>
      ) : (
        /* Trigger: Pill Variant (for Headers, Sidebars, Navbars) */
        <div
          style={{
            backgroundColor: isLight ? preset.lightBg : 'rgba(0, 0, 0, 0.4)',
            borderColor: isLight ? preset.lightBorder : preset.primaryColor + '50',
          }}
          className="flex items-center justify-between border rounded-xl p-0.5 shadow-2xs group transition-all"
        >
          {showSteppers && (
            <button
              type="button"
              onClick={(e) => handleStepMonth(-1, e)}
              disabled={disabled}
              title="Previous Month"
              style={{ color: preset.primaryColor }}
              className="p-1 rounded-lg hover:opacity-80 active:scale-95 disabled:opacity-30 cursor-pointer transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            id={`${idPrefix}-trigger`}
            disabled={disabled}
            onClick={() => !disabled && setIsOpen(!isOpen)}
            className="flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg font-extrabold text-xs tracking-wide transition cursor-pointer"
            style={{ color: isLight ? preset.textColor : '#ffffff' }}
            title="Click to pick month & year from calendar"
          >
            <CalendarIcon
              style={{ color: preset.primaryColor }}
              className="w-3.5 h-3.5 shrink-0"
            />
            <span className="truncate whitespace-nowrap">{displayLabel}</span>
          </button>

          {showSteppers && (
            <button
              type="button"
              onClick={(e) => handleStepMonth(1, e)}
              disabled={disabled}
              title="Next Month"
              style={{ color: preset.primaryColor }}
              className="p-1 rounded-lg hover:opacity-80 active:scale-95 disabled:opacity-30 cursor-pointer transition"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Popover Calendar Grid */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-2 w-72 rounded-2xl bg-white border border-slate-200/90 shadow-2xl p-3.5 text-slate-900 animate-in fade-in zoom-in-95 duration-150 ${
            align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'
          }`}
        >
          {/* Header with Year Selector */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <button
              type="button"
              onClick={handlePrevYear}
              disabled={viewYear <= minYear}
              title="Previous Year"
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm text-slate-900 tracking-tight">
                {viewYear}
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                Billing Year
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextYear}
              disabled={viewYear >= maxYear}
              title="Next Year"
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 12 Months Grid */}
          <div className="grid grid-cols-3 gap-2 py-3">
            {MONTH_NAMES.map((mName, idx) => {
              const monthNum = idx + 1;
              const monthStr = `${viewYear}-${String(monthNum).padStart(2, '0')}`;
              const isSelected = value === monthStr;
              const isCurrent = currentMonthStr === monthStr;
              const hasData = availableMonths.includes(monthStr);
              const isClosed = closedMonths.includes(monthStr);

              return (
                <button
                  key={monthStr}
                  type="button"
                  onClick={() => handleSelectMonth(idx)}
                  style={{
                    backgroundColor: isSelected
                      ? preset.primaryColor
                      : isCurrent
                      ? preset.lightBg
                      : undefined,
                    borderColor: isSelected
                      ? preset.primaryColor
                      : isCurrent
                      ? preset.lightBorder
                      : undefined,
                    color: isSelected
                      ? '#ffffff'
                      : isCurrent
                      ? preset.textColor
                      : '#334155',
                  }}
                  className={`relative py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center cursor-pointer border ${
                    isSelected
                      ? 'shadow-md ring-2 ring-offset-1 ring-slate-200 font-extrabold'
                      : 'hover:bg-slate-100 border-transparent hover:border-slate-200'
                  }`}
                  title={`${FULL_MONTH_NAMES[idx]} ${viewYear}${isClosed ? ' (Closed)' : ''}`}
                >
                  <span className="text-xs">{mName}</span>

                  {/* Indicator badges (Closed / Has Vouchers / Current month) */}
                  <div className="flex items-center gap-1 mt-1">
                    {isCurrent && !isSelected && (
                      <span
                        style={{ backgroundColor: preset.primaryColor }}
                        className="w-1.5 h-1.5 rounded-full"
                        title="Current Calendar Month"
                      />
                    )}
                    {hasData && !isSelected && !isCurrent && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-slate-300"
                        title="Vouchers / Records Exist"
                      />
                    )}
                    {isClosed && (
                      <span
                        className={`text-[8px] font-bold px-1 rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        Closed
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer Quick Actions */}
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleQuickCurrent}
              style={{ color: preset.primaryColor }}
              className="text-[11px] font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <CalendarIcon className="w-3 h-3" />
              <span>Current Month</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
