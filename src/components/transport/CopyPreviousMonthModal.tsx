import React from 'react';
import { SchoolClass, Student, TransportAssignment, TransportBus, TransportStop } from '../../types';
import { formatCurrency, formatMonthName } from '../../utils/feeMath';
import { SortableTh } from '../SortableTh';
import { useSortState, sortRows } from '../../hooks/useTableSort';
import { Copy, X, Check, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export type CopyRowStatus = 'copy' | 'exists' | 'inactive' | 'missing' | 'billing';

export interface CopyPreviewRow {
  id: string; // id of the source (previous month) assignment
  student?: Student;
  studentClass?: SchoolClass;
  bus?: TransportBus;
  stop?: TransportStop;
  tripType: 'RoundTrip' | 'OneWay';
  daysCharged: number;
  discount: number;
  fare: number;
  status: CopyRowStatus;
  reason: string; // plain-language explanation shown in the Status column
  existing?: TransportAssignment; // assignment already present in the target month
  selected: boolean;
}

export type CopyFilter = 'all' | 'copy' | 'exists' | 'other';

interface CopyPreviousMonthModalProps {
  show: boolean;
  onClose: () => void;
  activeMonth: string;
  prevMonth: string;
  daysCharged: number;
  rows: CopyPreviewRow[];
  filter: CopyFilter;
  setFilter: (f: CopyFilter) => void;
  onToggleRow: (rowId: string) => void;
  onToggleAll: () => void;
  onCommit: () => void;
}

export const CopyPreviousMonthModal: React.FC<CopyPreviousMonthModalProps> = ({
  show,
  onClose,
  activeMonth,
  prevMonth,
  daysCharged,
  rows,
  filter,
  setFilter,
  onToggleRow,
  onToggleAll,
  onCommit,
}) => {
  const { sort, toggleSort } = useSortState();
  if (!show) return null;

  const monthName = formatMonthName(activeMonth);
  const prevName = formatMonthName(prevMonth);

  const copyRows = rows.filter((r) => r.status === 'copy');
  const existsRows = rows.filter((r) => r.status === 'exists');
  const otherRows = rows.filter((r) => r.status !== 'copy' && r.status !== 'exists');
  const selectedRows = copyRows.filter((r) => r.selected);
  const totalFare = selectedRows.reduce((sum, r) => sum + r.fare, 0);

  const filteredUnsorted = rows.filter((r) => {
    if (filter === 'copy') return r.status === 'copy';
    if (filter === 'exists') return r.status === 'exists';
    if (filter === 'other') return r.status !== 'copy' && r.status !== 'exists';
    return true;
  });
  const filtered = sortRows<CopyPreviewRow>(filteredUnsorted, sort, {
    selected: (r) => r.status === 'copy' && r.selected,
    student: (r) => r.student?.name,
    class: (r) => r.studentClass?.name,
    busStop: (r) => `${r.bus?.busNumber || ''} ${r.stop?.name || ''}`,
    trip: (r) => r.tripType,
    days: (r) => r.daysCharged,
    discount: (r) => r.discount,
    fare: (r) => (r.status === 'copy' ? r.fare : null),
    status: (r) => r.reason,
  });

  const chip = (
    key: CopyFilter,
    label: string,
    count: number,
    active: string,
    idle: string,
    idleLabel: string,
    activeLabel: string
  ) => (
    <button
      type="button"
      onClick={() => setFilter(filter === key ? 'all' : key)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-left transition cursor-pointer ${
        filter === key ? active : idle
      }`}
      title={`Filter: ${label}`}
    >
      <span className={`font-semibold text-[11px] ${filter === key ? activeLabel : idleLabel}`}>{label}:</span>
      <span className="font-bold">{count}</span>
    </button>
  );

  const statusStyle = (s: CopyRowStatus) =>
    s === 'copy'
      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
      : s === 'exists'
      ? 'bg-amber-100 text-amber-900 border border-amber-200'
      : 'bg-rose-100 text-rose-800 border border-rose-200';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Copy className="w-5 h-5 text-teal-600" />
            Preview & Verify Copy from {prevName} to {monthName}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-600 space-y-1">
            <AlertCircle className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="font-semibold text-slate-800">No active transport assignments found in {prevName}.</p>
            <p className="text-xs text-slate-500">There is nothing to copy into {monthName}.</p>
          </div>
        ) : (
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            {/* Plain-language summary of everything that will and will not happen */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-700 space-y-1 shrink-0">
              <p className="flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-teal-600 mt-0.5 shrink-0" />
                <span>
                  <strong>{selectedRows.length}</strong> of {copyRows.length} copyable assignment(s) will be created for{' '}
                  {monthName} with <strong>{daysCharged}</strong> active day(s). Bus, stop, trip type and discount are
                  copied unchanged, so no account-history entries are added (the route did not change).
                </span>
              </p>
              {existsRows.length > 0 && (
                <p className="flex items-start gap-1.5 text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <span>
                    <strong>{existsRows.length}</strong> student(s) already have an assignment in {monthName}. They are{' '}
                    <strong>skipped and left exactly as they are</strong>.
                  </span>
                </p>
              )}
              {otherRows.length > 0 && (
                <p className="flex items-start gap-1.5 text-rose-800">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                  <span>
                    <strong>{otherRows.length}</strong> assignment(s) cannot be copied (inactive student, missing or
                    inactive bus or stop, or billing not yet started). The reason is shown on each row.
                  </span>
                </p>
              )}
            </div>

            {/* Status & action bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/90 px-3 py-2 rounded-xl border border-slate-200 text-xs shrink-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {chip(
                  'all',
                  'Total',
                  rows.length,
                  'bg-slate-900 text-white border-slate-900 shadow-xs',
                  'bg-white text-slate-700 hover:bg-slate-100 border-slate-200 shadow-2xs',
                  'text-slate-500',
                  'text-slate-300'
                )}
                {chip(
                  'copy',
                  'Will Copy',
                  selectedRows.length,
                  'bg-emerald-700 text-white border-emerald-700 shadow-xs',
                  'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-200/80 shadow-2xs',
                  'text-emerald-700',
                  'text-emerald-100'
                )}
                <div className="inline-flex items-center gap-1.5 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/80 shadow-2xs">
                  <span className="text-teal-700 font-semibold text-[11px]">Est. Revenue:</span>
                  <span className="font-bold text-teal-800">{formatCurrency(totalFare)}</span>
                </div>
                {chip(
                  'exists',
                  'Already Assigned',
                  existsRows.length,
                  'bg-amber-600 text-white border-amber-600 shadow-xs',
                  'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-200/80 shadow-2xs',
                  'text-amber-700',
                  'text-amber-100'
                )}
                {chip(
                  'other',
                  'Cannot Copy',
                  otherRows.length,
                  'bg-rose-700 text-white border-rose-700 shadow-xs',
                  'bg-rose-50 text-rose-800 hover:bg-rose-100 border-rose-200/80 shadow-2xs',
                  'text-rose-700',
                  'text-rose-100'
                )}
              </div>
              <button
                type="button"
                onClick={onToggleAll}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-semibold text-xs shadow-2xs transition cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 text-teal-600" />
                <span>Toggle Select All</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto max-h-[45vh] flex-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <SortableTh label="Copy" sortKey="selected" sort={sort} onSort={toggleSort} className="w-10 text-center" />
                    <SortableTh label="Student (Reg #)" sortKey="student" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Class" sortKey="class" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Bus & Stop" sortKey="busStop" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Trip" sortKey="trip" sort={sort} onSort={toggleSort} className="text-center" />
                    <SortableTh label="Days" sortKey="days" sort={sort} onSort={toggleSort} className="text-center" />
                    <SortableTh label="Discount" sortKey="discount" sort={sort} onSort={toggleSort} className="text-right" />
                    <SortableTh label="Net Fare" sortKey="fare" sort={sort} onSort={toggleSort} className="text-right" />
                    <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center bg-white text-slate-500">
                        <p className="font-semibold text-slate-700 text-sm">No records match this filter.</p>
                        <button
                          type="button"
                          onClick={() => setFilter('all')}
                          className="mt-2 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                        >
                          View All ({rows.length}) Records
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-50/80 transition ${
                          row.status === 'exists'
                            ? 'bg-amber-50/40'
                            : row.status !== 'copy'
                            ? 'bg-rose-50/40'
                            : row.selected
                            ? 'bg-teal-50/20'
                            : ''
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            disabled={row.status !== 'copy'}
                            checked={row.status === 'copy' && row.selected}
                            onChange={() => onToggleRow(row.id)}
                            className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                              {row.student?.regNo || '—'}
                            </span>
                            <span className="font-bold text-slate-900">
                              {row.student?.name || <span className="text-rose-500 italic">Student not found</span>}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600">
                          {row.studentClass?.name || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {row.bus ? (
                              <span className="font-bold font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {row.bus.busNumber}
                              </span>
                            ) : (
                              <span className="text-rose-600 italic text-[11px]">No Bus</span>
                            )}
                            <span className="font-bold text-slate-800">
                              {row.stop?.name || <span className="text-rose-600 italic text-[11px]">No Stop</span>}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              row.tripType === 'RoundTrip'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {row.tripType === 'RoundTrip' ? 'Round' : 'One Way'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-700 font-mono">{row.daysCharged}d</td>
                        <td className="p-3 text-right font-mono text-slate-600">
                          {row.discount > 0 ? formatCurrency(row.discount) : '—'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-teal-700">
                          {row.status === 'copy' ? formatCurrency(row.fare) : '—'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-start gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${statusStyle(
                              row.status
                            )}`}
                          >
                            {row.status === 'exists' && <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />}
                            {row.status !== 'copy' && row.status !== 'exists' && (
                              <AlertCircle className="w-3 h-3 text-rose-600 shrink-0 mt-0.5" />
                            )}
                            <span>{row.reason}</span>
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end items-center border-t border-slate-200 pt-3 shrink-0">
              <button
                type="button"
                onClick={onCommit}
                disabled={selectedRows.length === 0}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>
                  Confirm & Copy {selectedRows.length} Assignment(s) to {monthName}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
