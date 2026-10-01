import React from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { formatCurrency } from '../../utils/feeMath';
import { X, Upload, Download, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';

export interface BulkTransportPreviewRow {
  id?: string;
  rowIdx: number;
  regNo: string;
  studentName?: string;
  className?: string;
  busNumber: string;
  stopName: string;
  tripType: 'RoundTrip' | 'OneWay';
  daysCharged: number;
  discount: number;
  calculatedFare: number;
  isValid: boolean;
  isDuplicateInCsv?: boolean;
  validationError?: string;
  selected: boolean;
}

export interface BulkTransportCsvModalProps {
  show: boolean;
  onClose: () => void;
  onClear: () => void;
  activeMonth: string;
  rows: BulkTransportPreviewRow[];
  previewFilter: string;
  setPreviewFilter: (f: any) => void;
  importStatus: { message: string | null; error: string | null };
  isDragging: boolean;
  setIsDragging: (d: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDownloadSample: () => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onToggleSelectAllValid: () => void;
  onToggleSelectRow: (idx: number) => void;
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
  fileInputRef,
  onDownloadSample,
  onFileInputChange,
  onToggleSelectAllValid,
  onToggleSelectRow,
  onCommit,
}) => {
  useEscapeKey(onClose, show);

  if (!show) return null;

  const validRows = rows.filter((r) => r.isValid);
  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Bulk Import Transport Assignments</h3>
              <p className="text-[11px] text-slate-500">Assign students to routes and stops via CSV</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {rows.length === 0 ? (
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3">
              <Upload className="w-8 h-8 text-slate-400 mx-auto" />
              <div>
                <p className="font-bold text-slate-700">Select or drop a CSV file</p>
                <p className="text-[11px] text-slate-500">Columns: regNo, bus, stop, tripType, days, discount</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={onFileInputChange}
                className="hidden"
              />
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Choose File
                </button>
                <button
                  type="button"
                  onClick={onDownloadSample}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Sample CSV
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">
                    {rows.length} rows loaded ({validRows.length} valid)
                  </span>
                  <button
                    type="button"
                    onClick={onToggleSelectAllValid}
                    className="text-teal-700 underline font-semibold hover:text-teal-800"
                  >
                    Select All Valid
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onClear}
                  className="text-rose-600 underline font-semibold hover:text-rose-700"
                >
                  Clear & Re-upload
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 font-bold text-slate-600">
                    <tr>
                      <th className="p-2 w-8"></th>
                      <th className="p-2">Reg #</th>
                      <th className="p-2">Bus</th>
                      <th className="p-2">Stop</th>
                      <th className="p-2">Trip</th>
                      <th className="p-2">Fare</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {rows.map((r, idx) => (
                      <tr key={idx} className={r.isValid ? '' : 'bg-rose-50/50'}>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            disabled={!r.isValid}
                            checked={r.selected}
                            onChange={() => onToggleSelectRow(idx)}
                          />
                        </td>
                        <td className="p-2 font-bold">{r.regNo}</td>
                        <td className="p-2">{r.busNumber}</td>
                        <td className="p-2">{r.stopName}</td>
                        <td className="p-2">{r.tripType}</td>
                        <td className="p-2 font-bold">{formatCurrency(r.calculatedFare)}</td>
                        <td className="p-2 font-sans">
                          {r.isValid ? (
                            <span className="text-emerald-700 font-bold">Valid</span>
                          ) : (
                            <span className="text-rose-600">{r.validationError}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 transition cursor-pointer"
            >
              Close
            </button>
            {rows.length > 0 && (
              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={onCommit}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                Import {selectedCount} Selected
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
