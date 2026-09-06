import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';
import { normalizeDateToISO } from '../utils/feeMath';

export interface DatePickerProps {
  value: string; // 'YYYY-MM-DD'
  onChange: (dateStr: string) => void;
  minDate?: string; // 'YYYY-MM-DD'
  maxDate?: string; // 'YYYY-MM-DD'
  minYear?: number;
  maxYear?: number;
  themeColor?: string;
  className?: string;
  size?: 'sm' | 'md';
  idPrefix?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  align?: 'left' | 'right' | 'center';
  allowClear?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  minDate,
  maxDate,
  minYear = 1950,
  maxYear = 2050,
  themeColor = 'teal',
  className = '',
  size = 'md',
  idPrefix = 'date-picker',
  placeholder = 'Select date',
  required = false,
  disabled = false,
  align = 'left',
  allowClear = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Screen Location Aware dynamic positioning state
  const [placement, setPlacement] = useState<{
    vertical: 'bottom' | 'top';
    horizontal: 'left' | 'right' | 'center';
  }>({ vertical: 'bottom', horizontal: align });

  // Fixed coordinates for the portal-rendered popover (screen space)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // Parse value
  const parsedDate = useMemo(() => {
    if (!value || typeof value !== 'string') return null;
    const iso = normalizeDateToISO(value);
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    return { year: y, month: m - 1, day: d, isoStr: iso };
  }, [value]);

  const today = useMemo(() => {
    const d = new Date();
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
      str: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    };
  }, []);

  // Grid view year and month
  const [viewYear, setViewYear] = useState<number>(
    parsedDate ? parsedDate.year : today.year
  );
  const [viewMonth, setViewMonth] = useState<number>(
    parsedDate ? parsedDate.month : today.month
  );

  const preset = THEME_COLOR_PRESETS[themeColor as keyof typeof THEME_COLOR_PRESETS] || THEME_COLOR_PRESETS.teal;

  // Sync internal state when external value changes
  useEffect(() => {
    if (parsedDate) {
      setViewYear(parsedDate.year);
      setViewMonth(parsedDate.month);
    }
  }, [parsedDate]);

  // Position updater
  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popoverHeight = 240; // ultra-compact height with safety margin
    const popoverWidth = 224;  // ultra-compact width

    // If trigger is scrolled completely out of viewport, close
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setIsOpen(false);
      return;
    }

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

    let top: number;
    if (vertical === 'bottom') {
      top = rect.bottom + 4;
    } else {
      top = rect.top - popoverHeight - 4;
    }
    let left: number;
    if (horizontal === 'right') {
      left = rect.right - popoverWidth;
    } else if (horizontal === 'center') {
      left = rect.left + rect.width / 2 - popoverWidth / 2;
    } else {
      left = rect.left;
    }

    // Viewport bounds clamping
    const safeTop = Math.max(8, Math.min(top, window.innerHeight - popoverHeight - 8));
    const safeLeft = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));

    setPopoverPos({ top: safeTop, left: safeLeft });
  };

  // Screen location awareness: detect available space above/below and left/right
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, align]);

  // Click outside and Escape key listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (!target) return;

      const isInsideContainer = containerRef.current?.contains(target);
      const isInsidePopover = popoverRef.current?.contains(target);

      if (!isInsideContainer && !isInsidePopover) {
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
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Month navigation boundaries
  const isPrevDisabled = disabled || (viewYear <= minYear && viewMonth === 0);
  const isNextDisabled = disabled || (viewYear >= maxYear && viewMonth === 11);

  const handlePrevMonth = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isPrevDisabled) return;
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => Math.max(minYear, y - 1));
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isNextDisabled) return;
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => Math.min(maxYear, y + 1));
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number, monthOffset = 0, explicitDateStr?: string) => {
    if (disabled) return;
    let dateStr = explicitDateStr;
    if (!dateStr) {
      let targetYear = viewYear;
      let targetMonth = viewMonth + monthOffset;

      if (targetMonth < 0) {
        targetMonth = 11;
        targetYear -= 1;
      } else if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }

      dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    // Guard against selecting out-of-bound disabled days
    if (minDate && dateStr < minDate) return;
    if (maxDate && dateStr > maxDate) return;

    onChange(dateStr);
    setIsOpen(false);
  };

  // Today shortcut check against minDate / maxDate
  const isTodayDisabled = Boolean(
    disabled || (minDate && today.str < minDate) || (maxDate && today.str > maxDate)
  );

  const handleTodayClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (disabled || isTodayDisabled) return;
    setViewYear(today.year);
    setViewMonth(today.month);
    onChange(today.str);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || required) return;
    onChange('');
  };

  const handleToggle = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      if (parsedDate) {
        setViewYear(parsedDate.year);
        setViewMonth(parsedDate.month);
      } else {
        setViewYear(today.year);
        setViewMonth(today.month);
      }
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Generate calendar days for current viewMonth and viewYear
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      day: number;
      isCurrentMonth: boolean;
      monthOffset: number;
      dateStr: string;
      isToday: boolean;
      isSelected: boolean;
      isDisabled: boolean;
    }> = [];

    // Previous month leading days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      let prevY = viewYear;
      let prevM = viewMonth - 1;
      if (prevM < 0) {
        prevM = 11;
        prevY -= 1;
      }
      const dStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        isCurrentMonth: false,
        monthOffset: -1,
        dateStr: dStr,
        isToday: dStr === today.str,
        isSelected: parsedDate ? dStr === parsedDate.isoStr : dStr === value,
        isDisabled: Boolean(
          (minDate && dStr < minDate) || (maxDate && dStr > maxDate)
        ),
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        isCurrentMonth: true,
        monthOffset: 0,
        dateStr: dStr,
        isToday: dStr === today.str,
        isSelected: parsedDate ? dStr === parsedDate.isoStr : dStr === value,
        isDisabled: Boolean(
          (minDate && dStr < minDate) || (maxDate && dStr > maxDate)
        ),
      });
    }

    // Next month trailing days to complete fixed 6 rows (42 days) to prevent height jumps
    const totalSlots = 42;
    const remaining = totalSlots - days.length;
    for (let d = 1; d <= remaining; d++) {
      let nextY = viewYear;
      let nextM = viewMonth + 1;
      if (nextM > 11) {
        nextM = 0;
        nextY += 1;
      }
      const dStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        isCurrentMonth: false,
        monthOffset: 1,
        dateStr: dStr,
        isToday: dStr === today.str,
        isSelected: parsedDate ? dStr === parsedDate.isoStr : dStr === value,
        isDisabled: Boolean(
          (minDate && dStr < minDate) || (maxDate && dStr > maxDate)
        ),
      });
    }

    return days;
  }, [viewYear, viewMonth, today.str, value, minDate, maxDate]);

  // Format display date
  const displayFormatted = useMemo(() => {
    if (!parsedDate) return '';
    const dateObj = new Date(parsedDate.year, parsedDate.month, parsedDate.day);
    if (isNaN(dateObj.getTime())) return value;
    return `${parsedDate.day} ${SHORT_MONTH_NAMES[parsedDate.month]} ${parsedDate.year}`;
  }, [parsedDate, value]);

  // Dynamic min and max year to ensure any existing selected date is always represented
  const effectiveMinYear = useMemo(() => {
    if (parsedDate && parsedDate.year < minYear) return parsedDate.year - 2;
    return minYear;
  }, [parsedDate, minYear]);

  const effectiveMaxYear = useMemo(() => {
    if (parsedDate && parsedDate.year > maxYear) return parsedDate.year + 2;
    return maxYear;
  }, [parsedDate, maxYear]);

  // Generate Year options (fast jump for DOB)
  const yearsList = useMemo(() => {
    const yrs: number[] = [];
    for (let y = effectiveMaxYear; y >= effectiveMinYear; y--) {
      yrs.push(y);
    }
    return yrs;
  }, [effectiveMinYear, effectiveMaxYear]);

  return (
    <div ref={containerRef} className={`relative inline-block w-full text-left ${className}`}>
      {/* Trigger Input */}
      <div
        style={
          isOpen
            ? {
                borderColor: preset.primaryColor,
                boxShadow: `0 0 0 2px ${preset.lightBorder}`,
              }
            : undefined
        }
        className={`w-full flex items-center justify-between bg-white border border-slate-200 rounded-lg text-xs font-semibold transition hover:border-slate-300 ${
          size === 'sm' ? 'px-2.5 py-1.5' : 'px-2.5 h-[38px]'
        } ${
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'text-slate-800'
        }`}
      >
        <button
          ref={triggerRef}
          type="button"
          id={`${idPrefix}-trigger`}
          disabled={disabled}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          onClick={handleToggle}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left bg-transparent border-0 p-0 focus:outline-none cursor-pointer disabled:cursor-not-allowed"
        >
          <CalendarIcon className="w-3.5 h-3.5 shrink-0" style={{ color: preset.primaryColor }} />
          <span className={`truncate ${!value ? 'text-slate-400 font-normal' : 'text-slate-800 font-bold'}`}>
            {displayFormatted || placeholder}
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {allowClear && !required && value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear date"
              aria-label="Clear date"
              className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer border-0 bg-transparent flex items-center justify-center focus:outline-none"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <span className="text-[9px] font-mono uppercase bg-slate-100 text-slate-500 px-1 py-0.5 rounded pointer-events-none">
            {parsedDate ? parsedDate.isoStr : value || 'YYYY-MM-DD'}
          </span>
        </div>
      </div>

      {/* Popover Calendar Grid (Reduced to 2/3 size: 216px width) */}
      {isOpen &&
        popoverPos &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-modal="true"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            className="fixed z-[9999] w-[216px] rounded-xl bg-white border border-slate-200/90 shadow-2xl p-2 text-slate-900 animate-in fade-in zoom-in-95 duration-150 select-none"
          >
          {/* Header Controls (Compact) */}
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <button
              type="button"
              disabled={isPrevDisabled}
              onClick={handlePrevMonth}
              title="Previous Month"
              className={`p-0.5 rounded transition ${
                isPrevDisabled
                  ? 'opacity-25 cursor-not-allowed text-slate-300'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Month & Year Selectors / Jumpers */}
            <div className="flex items-center gap-0.5">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="font-extrabold text-[10px] text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-1 py-0.5 focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {SHORT_MONTH_NAMES[idx]}
                  </option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="font-extrabold text-[10px] text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-1 py-0.5 focus:outline-none cursor-pointer"
              >
                {yearsList.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={isNextDisabled}
              onClick={handleNextMonth}
              title="Next Month"
              className={`p-0.5 rounded transition ${
                isNextDisabled
                  ? 'opacity-25 cursor-not-allowed text-slate-300'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer'
              }`}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Weekday Names */}
          <div className="grid grid-cols-7 gap-0.5 pt-1 pb-0.5 text-center">
            {WEEKDAY_NAMES.map((w, idx) => (
              <span
                key={w}
                className={`text-[8px] font-bold tracking-wider ${
                  idx === 0 || idx === 6 ? 'text-rose-500/80' : 'text-slate-400'
                }`}
              >
                {w}
              </span>
            ))}
          </div>

          {/* Days Grid (Always fixed 6 rows = 42 slots, invariant height) */}
          <div className="grid grid-cols-7 grid-rows-6 gap-0.5 py-0.5 h-[146px]">
            {calendarDays.map((item, idx) => {
              const { day, isCurrentMonth, isSelected, isToday, isDisabled, dateStr } = item;

              return (
                <button
                  key={`${dateStr}-${idx}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDay(day, item.monthOffset, dateStr)}
                  style={{
                    backgroundColor: isSelected
                      ? preset.primaryColor
                      : isToday && !isSelected
                      ? preset.lightBg
                      : undefined,
                    color: isSelected
                      ? '#ffffff'
                      : isToday && !isSelected
                      ? preset.textColor
                      : !isCurrentMonth
                      ? '#94a3b8'
                      : '#1e293b',
                    borderColor: isSelected
                      ? preset.primaryColor
                      : isToday && !isSelected
                      ? preset.lightBorder
                      : 'transparent',
                  }}
                  className={`h-5.5 rounded text-[10px] font-semibold flex items-center justify-center relative transition border ${
                    isSelected
                      ? 'shadow-2xs font-extrabold ring-1 ring-offset-0.5 ring-slate-200 cursor-pointer'
                      : isDisabled
                      ? 'opacity-20 cursor-not-allowed'
                      : 'hover:bg-slate-100 cursor-pointer'
                  }`}
                >
                  <span>{day}</span>
                  {isToday && !isSelected && (
                    <span
                      style={{ backgroundColor: preset.primaryColor }}
                      className="absolute bottom-0.5 w-0.5 h-0.5 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Shortcuts (Ultra-compact) */}
          <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[9px]">
            <button
              type="button"
              disabled={isTodayDisabled}
              onClick={handleTodayClick}
              style={{ color: isTodayDisabled ? '#94a3b8' : preset.primaryColor }}
              className={`font-bold flex items-center gap-0.5 transition ${
                isTodayDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:underline cursor-pointer'
              }`}
            >
              <CalendarIcon className="w-2.5 h-2.5" />
              <span>Today</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-1.5 py-0.5 font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition cursor-pointer"
            >
              Done
            </button>
          </div>
          </div>,
          document.body
        )}
    </div>
  );
};
