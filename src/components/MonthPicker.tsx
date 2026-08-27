import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Screen Location Aware dynamic positioning state
  const [placement, setPlacement] = useState<{
    vertical: 'bottom' | 'top';
    horizontal: 'left' | 'right' | 'center';
  }>({ vertical: 'bottom', horizontal: align });

  // Parse current selected year and month
  const parsedParts = (value || '').split('-').map(Number);
  const selectedYear = parsedParts[0] || new Date().getFullYear();
  const selectedMonth = parsedParts[1] || new Date().getMonth() + 1;

  // Viewing year in the calendar grid
  const [viewYear, setViewYear] = useState<number>(selectedYear);

  const preset = THEME_COLOR_PRESETS[themeColor as keyof typeof THEME_COLOR_PRESETS] || THEME_COLOR_PRESETS.teal;

  // Sync viewYear when value changes externally
  useEffect(() => {
    if (selectedYear) {
      setViewYear(selectedYear);
    }
  }, [selectedYear]);

  // Screen location awareness: detect available space above/below and left/right
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const popoverHeight = 180; // ultra-compact month picker height
      const popoverWidth = 190;  // ultra-compact width

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const spaceRight = window.innerWidth - rect.left;

      const vertical = spaceBelow < popoverHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';

      let horizontal = align;
      if (align === 'center') {
        const centerPos = rect.left + rect.width / 2;
        if (centerPos < popoverWidth / 2) horizontal = 'left';
        else if (window.innerWidth - centerPos < popoverWidth / 2) horizontal = 'right';
      } else if (align === 'left' && spaceRight < popoverWidth) {
        horizontal = 'right';
      } else if (align === 'right' && rect.right < popoverWidth) {
        horizontal = 'left';
      }

      setPlacement({ vertical, horizontal });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, align]);

  // Click outside and Escape key listener to dismiss popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
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

  const popoverPositionClass = useMemo(() => {
    const vClass = placement.vertical === 'top' ? 'bottom-full mb-1' : 'top-full mt-1';
    const hClass =
      placement.horizontal === 'right'
        ? 'right-0'
        : placement.horizontal === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0';
    return `${vClass} ${hClass}`;
  }, [placement]);

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger: Input Variant (for forms / modals) */}
      {variant === 'input' ? (
        <button
          ref={triggerRef}
          type="button"
          id={`${idPrefix}-trigger`}
          disabled={disabled}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          style={
            isOpen
              ? {
                  borderColor: preset.primaryColor,
                  boxShadow: `0 0 0 2px ${preset.lightBorder}`,
                }
              : undefined
          }
          className={`w-full flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold transition hover:border-slate-300 focus:outline-none ${
            disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'text-slate-800'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <CalendarIcon className="w-3.5 h-3.5 shrink-0" style={{ color: preset.primaryColor }} />
            <span className="truncate">{displayLabel}</span>
          </div>
          <span className="text-[9px] font-mono uppercase bg-slate-100 text-slate-500 px-1 py-0.5 rounded shrink-0">
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
            ref={triggerRef}
            type="button"
            id={`${idPrefix}-trigger`}
            disabled={disabled}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
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

      {/* Popover Calendar Grid (Reduced to 2/3 size: 190px width) */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className={`absolute z-50 w-[190px] rounded-xl bg-white border border-slate-200/90 shadow-2xl p-2 text-slate-900 animate-in fade-in zoom-in-95 duration-150 ${popoverPositionClass}`}
        >
          {/* Header with Year Selector (Compact) */}
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <button
              type="button"
              onClick={handlePrevYear}
              disabled={viewYear <= minYear}
              title="Previous Year"
              className="p-0.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition cursor-pointer disabled:opacity-30"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1">
              <span className="font-extrabold text-[11px] text-slate-900 tracking-tight">
                {viewYear}
              </span>
              <span className="text-[8px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-slate-100 text-slate-600">
                Year
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextYear}
              disabled={viewYear >= maxYear}
              title="Next Year"
              className="p-0.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition cursor-pointer disabled:opacity-30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 12 Months Grid (Ultra-compact) */}
          <div className="grid grid-cols-3 gap-1 py-1">
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
                  className={`relative py-1 px-1 rounded text-[10px] font-bold transition flex flex-col items-center justify-center cursor-pointer border ${
                    isSelected
                      ? 'shadow-2xs ring-1 ring-offset-0.5 ring-slate-200 font-extrabold'
                      : 'hover:bg-slate-100 border-transparent hover:border-slate-200'
                  }`}
                  title={`${FULL_MONTH_NAMES[idx]} ${viewYear}${isClosed ? ' (Closed)' : ''}`}
                >
                  <span>{mName}</span>

                  {/* Indicator badges (Closed / Has Vouchers / Current month) */}
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {isCurrent && !isSelected && (
                      <span
                        style={{ backgroundColor: preset.primaryColor }}
                        className="w-1 h-1 rounded-full"
                        title="Current Calendar Month"
                      />
                    )}
                    {hasData && !isSelected && !isCurrent && (
                      <span
                        className="w-1 h-1 rounded-full bg-slate-300"
                        title="Vouchers / Records Exist"
                      />
                    )}
                    {isClosed && (
                      <span
                        className={`text-[7px] font-bold px-0.5 rounded ${
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

          {/* Footer Quick Actions (Ultra-compact) */}
          <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[9px]">
            <button
              type="button"
              onClick={handleQuickCurrent}
              style={{ color: preset.primaryColor }}
              className="font-bold hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <CalendarIcon className="w-2.5 h-2.5" />
              <span>Current</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-1.5 py-0.5 font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
