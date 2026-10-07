import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { SortState } from '../hooks/useTableSort';

interface SortableThProps {
  label: React.ReactNode;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  /** Alignment / extra classes for the <th> (e.g. "text-right"). */
  className?: string;
  title?: string;
}

/** Click-sortable table header cell, styled like the main list views. */
export const SortableTh: React.FC<SortableThProps> = ({ label, sortKey, sort, onSort, className = '', title }) => {
  const active = sort.key === sortKey;
  const justify = className.includes('text-right')
    ? 'justify-end'
    : className.includes('text-center')
    ? 'justify-center'
    : '';
  return (
    <th
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={title || 'Click to sort'}
      className={`p-3 cursor-pointer select-none transition-colors hover:bg-slate-200/60 whitespace-nowrap ${
        active ? 'text-teal-700 bg-teal-50/60' : ''
      } ${className}`}
    >
      <div className={`flex items-center gap-1 ${justify}`}>
        <span>{label}</span>
        <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
          {active ? (
            sort.dir === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
          )}
        </span>
      </div>
    </th>
  );
};

export default SortableTh;
