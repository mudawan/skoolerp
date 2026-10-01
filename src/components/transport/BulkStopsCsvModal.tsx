import React from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { formatCurrency } from '../../utils/feeMath';
import { X, Upload, Download, CheckCircle2, AlertTriangle, MapPin } from 'lucide-react';

export interface BulkStopPreviewRow {
  id?: string;
  rowIdx?: number;
  name: string;
  area: string;
  landmark: string;
  monthlyFare: number;
  isValid: boolean;
  isDuplicateInCsv?: boolean;
  validationError?: string;
  errorMsg?: string;
  selected?: boolean;
  sortOrder?: number;
  existingStop?: any;
}

export interface BulkStopsCsvModalProps {
  show: boolean;
  onClose: () => void;
  onClear: () => void;
  rows: BulkStopPreviewRow[];
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
  onToggleSelectRow?: (idx: number) => void;
  onCommit: () => void;
}

export const BulkStopsCsvModal: React.FC<BulkStopsCsvModalProps> = ({
  show,
  onClose,
  onClear,
  rows,
  fileInputRef,
  onDownloadSample,
  onFileInputChange,
  onToggleSelectAllValid,
  onCommit,
}) => {
  useEscapeKey(onClose, show);

  if (!show) return null;

  const validRows = rows.filter((r) => r.isValid);
  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Bulk Import Bus Stops</h3>
              <p className="text-[11px] text-slate-500">Import stop names, areas, landmarks, and fares</p>
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
                <p className="font-bold text-slate-700">Select or drop stops CSV file</p>
                <p className="text-[11px] text-slate-500">Columns: name, area, landmark, monthlyFare</p>
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
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer"
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
                <span className="font-bold text-slate-800">
                  {rows.length} rows loaded ({validRows.length} valid)
                </span>
                <button
                  type="button"
                  onClick={onClear}
                  className="text-rose-600 underline font-semibold hover:text-rose-700"
                >
                  Clear & Re-upload
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 font-bold text-slate-600">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Area</th>
                      <th className="p-2">Fare</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, idx) => (
                      <tr key={idx} className={r.isValid ? '' : 'bg-rose-50/50'}>
                        <td className="p-2 font-bold">{r.name}</td>
                        <td className="p-2">{r.area}</td>
                        <td className="p-2 font-mono font-bold">{formatCurrency(r.monthlyFare)}</td>
                        <td className="p-2">
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
                onClick={onCommit}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
              >
                Import All Valid Stops
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
