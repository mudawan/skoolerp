import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';

export interface DatePickerProps {
  value: string; // 'YYYY-MM-DD'
  onChange: (dateStr: string) => void;
  minDate?: string; // 'YYYY-MM-DD'
  maxDate?: string; // 'YYYY-MM-DD'
  minYear?: number;
  maxYear?: number;
  defaultViewYear?: number;
  defaultViewMonth?: number; // 0-11
  themeColor?: string;
  className?: string;
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
  defaultViewYear,
  defaultViewMonth,
  themeColor = 'teal',
  className = '',
  idPrefix = 'date-picker',
  placeholder = 'Select date',
  required = false,
  disabled = false,
  align = 'left',
  allowClear = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse value
  const parsedDate = useMemo(() => {
    if (!value || !value.includes('-')) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return { year: y, month: m - 1, day: d };
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
    parsedDate ? parsedDate.year : (defaultViewYear ?? today.year)
  );
  const [viewMonth, setViewMonth] = useState<number>(
    parsedDate ? parsedDate.month : (defaultViewMonth ?? today.month)
  );

  const preset = THEME_COLOR_PRESETS[themeColor] || THEME_COLOR_PRESETS.teal;

  // Sync internal state when external value changes
  useEffect(() => {
    if (parsedDate) {
      setViewYear(parsedDate.year);
      setViewMonth(parsedDate.month);
    } else {
      if (defaultViewYear !== undefined) setViewYear(defaultViewYear);
      if (defaultViewMonth !== undefined) setViewMonth(defaultViewMonth);
    }
  }, [parsedDate, defaultViewYear, defaultViewMonth]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsSelectingYear(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => Math.max(minYear, y - 1));
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => Math.min(maxYear, y + 1));
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number, monthOffset = 0) => {
    if (disabled) return;
    let targetYear = viewYear;
    let targetMonth = viewMonth + monthOffset;

    if (targetMonth < 0) {
      targetMonth = 11;
      targetYear -= 1;
    } else if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }

    const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(dateStr);
    setIsOpen(false);
    setIsSelectingYear(false);
  };

  const handleTodayClick = () => {
    if (disabled) return;
    setViewYear(today.year);
    setViewMonth(today.month);
    onChange(today.str);
    setIsOpen(false);
    setIsSelectingYear(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || required) return;
    onChange('');
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
        isSelected: dStr === value,
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
        isSelected: dStr === value,
        isDisabled: Boolean(
          (minDate && dStr < minDate) || (maxDate && dStr > maxDate)
        ),
      });
    }

    // Next month trailing days to complete 6 rows (42 days) or 5 rows
    const totalSlots = days.length <= 35 ? 35 : 42;
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
        isSelected: dStr === value,
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

  // Generate Year options (fast jump for DOB)
  const yearsList = useMemo(() => {
    const yrs: number[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      yrs.push(y);
    }
    return yrs;
  }, [minYear, maxYear]);

  return (
    <div ref={containerRef} className={`relative inline-block w-full text-left ${className}`}>
      {/* Trigger Input */}
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
          <span className={`truncate ${!value ? 'text-slate-400 font-normal' : 'text-slate-800 font-bold'}`}>
            {displayFormatted || placeholder}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {allowClear && !required && value && !disabled && (
            <span
              onClick={handleClear}
              title="Clear date"
              className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
            {value || 'YYYY-MM-DD'}
          </span>
        </div>
      </button>

      {/* Popover Calendar Grid */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1.5 w-76 rounded-2xl bg-white border border-slate-200/90 shadow-2xl p-3.5 text-slate-900 animate-in fade-in zoom-in-95 duration-150 ${
            align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'
          }`}
        >
          {/* Header Controls */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              title="Previous Month"
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Month & Year Selectors / Jumpers */}
            <div className="flex items-center gap-1">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="font-extrabold text-xs text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="font-extrabold text-xs text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
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
              onClick={handleNextMonth}
              title="Next Month"
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Names */}
          <div className="grid grid-cols-7 gap-1 pt-2 pb-1 text-center">
            {WEEKDAY_NAMES.map((w, idx) => (
              <span
                key={w}
                className={`text-[10px] font-bold tracking-wider ${
                  idx === 0 || idx === 6 ? 'text-rose-500/80' : 'text-slate-400'
                }`}
              >
                {w}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 py-1">
            {calendarDays.map((item, idx) => {
              const { day, isCurrentMonth, isSelected, isToday, isDisabled, dateStr } = item;

              return (
                <button
                  key={`${dateStr}-${idx}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDay(day, item.monthOffset)}
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
                  className={`h-8 rounded-lg text-xs font-semibold flex items-center justify-center relative transition cursor-pointer border ${
                    isSelected
                      ? 'shadow-xs font-extrabold ring-2 ring-offset-1 ring-slate-200'
                      : isDisabled
                      ? 'opacity-30 cursor-not-allowed'
                      : 'hover:bg-slate-100'
                  }`}
                >
                  <span>{day}</span>
                  {isToday && !isSelected && (
                    <span
                      style={{ backgroundColor: preset.primaryColor }}
                      className="absolute bottom-1 w-1 h-1 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Shortcuts */}
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleTodayClick}
              style={{ color: preset.primaryColor }}
              className="text-[11px] font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <CalendarIcon className="w-3 h-3" />
              <span>Today</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
