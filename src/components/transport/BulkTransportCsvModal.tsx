import React from 'react';
import { SchoolClass, Student, TransportAssignment, TransportBus, TransportStop } from '../../types';
import { formatCurrency, formatMonthName } from '../../utils/feeMath';
import { SortableTh } from '../SortableTh';
import { useSortState, sortRows } from '../../hooks/useTableSort';
import { Upload, X, Check, AlertCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react';

export interface BulkTransportPreviewRow {
  id: string;
  regNo: string;
  student?: Student;
  studentClass?: SchoolClass;
  busInput: string;
  bus?: TransportBus;
  stopInput: string;
  stop?: TransportStop;
  tripType: 'RoundTrip' | 'OneWay';
  daysCharged: number;
  discount: number;
  effectiveFare: number;
  existingAsgn?: TransportAssignment;
  isValid: boolean;
  isDuplicateInCsv: boolean;
  selected: boolean;
  errorMsg?: string;
}

type PreviewFilter = 'all' | 'valid' | 'invalid' | 'duplicates' | 'updates';

interface BulkTransportCsvModalProps {
  show: boolean;
  onClose: () => void;
  onClear: () => void;
  activeMonth: string;
  rows: BulkTransportPreviewRow[];
  previewFilter: PreviewFilter;
  setPreviewFilter: React.Dispatch<React.SetStateAction<PreviewFilter>>;
  importStatus: { message: string | null; error: string | null };
  isDragging: boolean;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onDownloadSample: () => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onToggleSelectAllValid: () => void;
  onToggleSelectRow: (rowId: string) => void;
  onCommit: () => void;
}

export const BulkTransportCsvModal: React.FC<BulkTransportCsvModalProps> = ({
  show,
  onClose,
  onClear,
  activeMonth,
  rows,
  previewFilter,
  setPreviewFilter,
  importStatus,
  isDragging,
  setIsDragging,
  fileInputRef,
  onDownloadSample,
  onFileInputChange,
  onDrop,
  onToggleSelectAllValid,
  onToggleSelectRow,
  onCommit,
}) => {
  const { sort: rowSort, toggleSort: toggleRowSort } = useSortState();
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className={`bg-white rounded-2xl ${
          rows.length > 0 ? 'max-w-5xl' : 'max-w-md'
        } w-full p-6 shadow-2xl space-y-5 transition-all max-h-[90vh] flex flex-col`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-teal-600" />
            {rows.length > 0
              ? 'Preview & Verify Transport Assignments'
              : 'Import Transport Assignments from CSV'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="space-y-4 text-xs text-slate-600">
            <p>
              Upload a CSV file with student transport assignments for <strong>{formatMonthName(activeMonth)}</strong>. First row must contain column headers.
            </p>

            <button
              type="button"
              onClick={onDownloadSample}
              className="flex items-center gap-2 text-teal-600 font-bold hover:underline cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Download Sample Transport CSV Format</span>
            </button>

            {/* Status alerts */}
            {importStatus.message && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{importStatus.message}</span>
              </div>
            )}
            {importStatus.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{importStatus.error}</span>
              </div>
            )}

            {/* File Dropzone & Click Target */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer group ${
                isDragging
                  ? 'border-teal-500 bg-teal-50/60'
                  : 'border-teal-300 hover:border-teal-500 bg-teal-50/20 hover:bg-teal-50/60'
              }`}
            >
              <Upload className="w-8 h-8 text-teal-600 group-hover:scale-110 transition mx-auto mb-2" />
              <span className="font-bold text-slate-800 block text-sm">
                Click to select CSV File or drag & drop
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">
                Supports standard comma-separated .csv files
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="mt-3 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Browse CSV File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onFileInputChange}
              />
            </div>
          </div>
        ) : (
          /* Preview View with Interactive Table & Filters */
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Metric Summary Bar */}
            {(() => {
              const total = rows.length;
              const validRows = rows.filter((r) => r.isValid && !r.isDuplicateInCsv);
              const selectedCount = validRows.filter((r) => r.selected).length;
              const updateCount = validRows.filter((r) => !!r.existingAsgn).length;
              const duplicateCount = rows.filter((r) => r.isDuplicateInCsv).length;
              const invalidCount = rows.filter((r) => !r.isValid && !r.isDuplicateInCsv).length;
              const totalIssues = duplicateCount + invalidCount;
              const totalEstRevenue = validRows.filter((r) => r.selected).reduce((sum, r) => sum + r.effectiveFare, 0);

              const filteredUnsorted = rows.filter((r) => {
                if (previewFilter === 'valid') return r.isValid && !r.isDuplicateInCsv;
                if (previewFilter === 'invalid') return !r.isValid || r.isDuplicateInCsv;
                if (previewFilter === 'duplicates') return r.isDuplicateInCsv;
                if (previewFilter === 'updates') return r.isValid && !r.isDuplicateInCsv && !!r.existingAsgn;
                return true;
              });
              const filteredRows = sortRows<BulkTransportPreviewRow>(filteredUnsorted, rowSort, {
                selected: (r) => r.selected && r.isValid && !r.isDuplicateInCsv,
                student: (r) => r.student?.name || r.regNo,
                class: (r) => r.studentClass?.name,
                busStop: (r) => `${r.bus?.busNumber || r.busInput} ${r.stop?.name || r.stopInput}`,
                trip: (r) => r.tripType,
                days: (r) => r.daysCharged,
                discount: (r) => r.discount,
                fare: (r) => (r.isValid && !r.isDuplicateInCsv ? r.effectiveFare : null),
                status: (r) => r.errorMsg || (r.existingAsgn ? 'Updates Existing' : 'New Assignment'),
              });

              return (
                <>
                  {/* Compact Status & Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/90 px-3 py-2 rounded-xl border border-slate-200 text-xs shrink-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <div className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                        <span className="text-slate-500 font-semibold text-[11px]">Total Rows:</span>
                        <span className="font-bold text-slate-900">{total}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 shadow-2xs">
                        <span className="text-emerald-700 font-semibold text-[11px]">Selected:</span>
                        <span className="font-bold text-emerald-800">{selectedCount}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/80 shadow-2xs">
                        <span className="text-teal-700 font-semibold text-[11px]">Est. Revenue:</span>
                        <span className="font-bold text-teal-800">{formatCurrency(totalEstRevenue)}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80 shadow-2xs">
                        <span className="text-amber-700 font-semibold text-[11px]">Updates:</span>
                        <span className="font-bold text-amber-800">{updateCount}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/80 shadow-2xs">
                        <span className="text-rose-700 font-semibold text-[11px]">Duplicates:</span>
                        <span className="font-bold text-rose-800">{duplicateCount}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/80 shadow-2xs">
                        <span className="text-rose-700 font-semibold text-[11px]">Invalid:</span>
                        <span className="font-bold text-rose-800">{invalidCount}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={onToggleSelectAllValid}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-semibold text-xs shadow-2xs transition cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 text-teal-600" />
                        <span>Toggle Select All</span>
                      </button>
                      <button
                        type="button"
                        onClick={onClear}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-lg font-semibold text-xs transition cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload New File</span>
                      </button>
                    </div>
                  </div>

                  {/* Filter Selector Tabs */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs shrink-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('all')}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                          previewFilter === 'all'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        All ({total})
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreviewFilter('valid')}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                          previewFilter === 'valid'
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Valid Only ({validRows.length})
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreviewFilter('updates')}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                          previewFilter === 'updates'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Updates ({updateCount})
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreviewFilter('invalid')}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                          previewFilter === 'invalid'
                            ? 'bg-rose-700 text-white shadow-xs'
                            : totalIssues > 0
                            ? 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        Issues ({totalIssues})
                      </button>
                    </div>

                    {previewFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('all')}
                        className="text-xs text-teal-700 hover:text-teal-900 font-bold underline cursor-pointer"
                      >
                        Reset Filter (Show All)
                      </button>
                    )}
                  </div>

                  {/* Error Alert */}
                  {importStatus.error && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{importStatus.error}</span>
                    </div>
                  )}

                  {/* Interactive Preview Table Container */}
                  <div className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto max-h-[50vh] flex-1">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <SortableTh label="Import" sortKey="selected" sort={rowSort} onSort={toggleRowSort} className="w-10 text-center" />
                          <SortableTh label="Student (Reg #)" sortKey="student" sort={rowSort} onSort={toggleRowSort} />
                          <SortableTh label="Class" sortKey="class" sort={rowSort} onSort={toggleRowSort} />
                          <SortableTh label="Bus & Stop" sortKey="busStop" sort={rowSort} onSort={toggleRowSort} />
                          <SortableTh label="Trip" sortKey="trip" sort={rowSort} onSort={toggleRowSort} className="text-center" />
                          <SortableTh label="Days" sortKey="days" sort={rowSort} onSort={toggleRowSort} className="text-center" />
                          <SortableTh label="Discount" sortKey="discount" sort={rowSort} onSort={toggleRowSort} className="text-right" />
                          <SortableTh label="Net Fare" sortKey="fare" sort={rowSort} onSort={toggleRowSort} className="text-right" />
                          <SortableTh label="Status" sortKey="status" sort={rowSort} onSort={toggleRowSort} />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-8 text-center bg-white text-slate-500">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <AlertCircle className="w-6 h-6 text-slate-400" />
                                <p className="font-semibold text-slate-700 text-sm">
                                  No records match the current filter: <span className="font-bold capitalize">{previewFilter}</span>
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setPreviewFilter('all')}
                                  className="mt-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                                >
                                  View All ({total}) Records
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredRows.map((row) => {
                            const isRowValid = row.isValid && !row.isDuplicateInCsv;
                            return (
                              <tr
                                key={row.id}
                                className={`hover:bg-slate-50/80 transition ${
                                  row.isDuplicateInCsv
                                    ? 'bg-rose-50/60 text-slate-700'
                                    : !row.isValid
                                    ? 'bg-rose-50/40'
                                    : row.existingAsgn
                                    ? 'bg-amber-50/40'
                                    : row.selected
                                    ? 'bg-teal-50/20'
                                    : ''
                                }`}
                              >
                                <td className="p-3 text-center">
                                  <input
                                    type="checkbox"
                                    disabled={!isRowValid}
                                    checked={row.selected && isRowValid}
                                    onChange={() => onToggleSelectRow(row.id)}
                                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                  />
                                </td>

                                <td className="p-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                                      {row.regNo}
                                    </span>
                                    <span className="font-bold text-slate-900">
                                      {row.student?.name || <span className="text-rose-500 italic">Unmatched</span>}
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
                                      <span className="text-rose-600 italic text-[11px]">{row.busInput || 'No Bus'}</span>
                                    )}
                                    <span className="font-bold text-slate-800">
                                      {row.stop?.name || <span className="text-rose-600 italic text-[11px]">{row.stopInput || 'No Stop'}</span>}
                                    </span>
                                  </div>
                                  {row.stop && (
                                    <span className="text-[10px] text-slate-500 block mt-0.5">
                                      Base: {formatCurrency(row.stop.monthlyFare)}
                                    </span>
                                  )}
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

                                <td className="p-3 text-center font-bold text-slate-700 font-mono">
                                  {row.daysCharged}d
                                </td>

                                <td className="p-3 text-right font-mono text-slate-600">
                                  {row.discount > 0 ? formatCurrency(row.discount) : '—'}
                                </td>

                                <td className="p-3 text-right font-mono font-bold text-teal-700">
                                  {isRowValid ? formatCurrency(row.effectiveFare) : '—'}
                                </td>

                                <td className="p-3">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                                      row.isDuplicateInCsv
                                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                        : !row.isValid
                                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                        : row.existingAsgn
                                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    }`}
                                  >
                                    {!row.isValid && <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />}
                                    {row.existingAsgn && !row.isDuplicateInCsv && row.isValid && (
                                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                    )}
                                    {row.errorMsg
                                      ? row.errorMsg
                                      : row.existingAsgn
                                      ? 'Updates Existing'
                                      : 'New Assignment'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}

            {/* Modal Footer Controls */}
            {rows.length > 0 && (
              <div className="flex justify-end items-center border-t border-slate-200 pt-3 shrink-0">
                <button
                  type="button"
                  onClick={onCommit}
                  disabled={
                    rows.filter((r) => r.selected && r.isValid && !r.isDuplicateInCsv).length === 0
                  }
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Confirm & Save {
                      rows.filter((r) => r.selected && r.isValid && !r.isDuplicateInCsv).length
                    } Selected Assignment(s)
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
