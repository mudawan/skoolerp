import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface RecordsPerPageSelectorProps {
  value: number; // 0 or positive number. 0 or NaN indicates 'all' (or custom large number)
  onChange: (newValue: number) => void;
  totalRecords: number;
  idPrefix?: string;
  presetOptions?: number[]; // default [25, 50, 100]
}

export const RecordsPerPageSelector: React.FC<RecordsPerPageSelectorProps> = ({
  value,
  onChange,
  totalRecords,
  idPrefix = 'records-per-page',
  presetOptions = [25, 50, 100],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState<string>(
    value >= totalRecords && totalRecords > 0 ? 'All' : value.toString()
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync internal input string with external value
  useEffect(() => {
    if (value >= 100000 || (value >= totalRecords && totalRecords > 0 && value !== 25 && value !== 50 && value !== 100)) {
      setInputValue('All');
    } else {
      setInputValue(value.toString());
    }
  }, [value, totalRecords]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApplyNumber = (num: number) => {
    if (num <= 0 || isNaN(num)) {
      // If 0 or invalid, show all
      onChange(Math.max(totalRecords, 100000));
      setInputValue('All');
    } else {
      onChange(num);
      setInputValue(num.toString());
    }
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = inputValue.trim().toLowerCase();
      if (trimmed === 'all' || trimmed === '0' || trimmed === '') {
        handleApplyNumber(Math.max(totalRecords, 100000));
      } else {
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed) && parsed > 0) {
          handleApplyNumber(parsed);
        } else {
          // fallback
          handleApplyNumber(25);
        }
      }
    }
  };

  const handleInputBlur = () => {
    const trimmed = inputValue.trim().toLowerCase();
    if (trimmed === 'all' || trimmed === '0' || trimmed === '') {
      handleApplyNumber(Math.max(totalRecords, 100000));
    } else {
      const parsed = parseInt(trimmed, 10);
      if (!isNaN(parsed) && parsed > 0) {
        handleApplyNumber(parsed);
      } else {
        setInputValue(value >= 100000 ? 'All' : value.toString());
      }
    }
  };

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className="font-medium text-slate-500">Show</span>

      <div className="relative inline-flex items-center">
        <input
          id={`${idPrefix}-input`}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onBlur={handleInputBlur}
          onFocus={() => setIsOpen(true)}
          className="w-16 h-7 pl-2 pr-5 bg-white border border-slate-200 hover:border-slate-300 focus:border-teal-500 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 text-center cursor-text transition-colors shadow-2xs"
          placeholder="25"
          title="Type a number or 'All' and press Enter"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen((prev) => !prev)}
          className="absolute right-1 p-0.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {isOpen && (
          <div className="absolute left-0 bottom-full mb-1 z-30 w-28 bg-white rounded-xl shadow-lg border border-slate-200 py-1 text-xs animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold text-slate-400 border-b border-slate-100">
              Presets
            </div>
            {presetOptions.map((opt) => {
              const isSelected = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleApplyNumber(opt)}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-teal-50 hover:text-teal-700 transition cursor-pointer font-medium ${
                    isSelected ? 'bg-teal-50/80 text-teal-700 font-bold' : 'text-slate-700'
                  }`}
                >
                  <span>{opt} records</span>
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => handleApplyNumber(Math.max(totalRecords, 100000))}
              className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-teal-50 hover:text-teal-700 transition cursor-pointer font-medium border-t border-slate-100 ${
                value >= 100000 || value >= totalRecords ? 'bg-teal-50/80 text-teal-700 font-bold' : 'text-slate-700'
              }`}
            >
              <span>All records</span>
              {(value >= 100000 || value >= totalRecords) && <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />}
            </button>
          </div>
        )}
      </div>

      <span className="font-medium text-slate-500">per page</span>
    </div>
  );
};
