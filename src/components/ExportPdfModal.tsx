import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FeeVoucher, VoucherCopyType } from '../types';
import { formatCurrency, formatMonthName } from '../utils/feeMath';
import { exportSingleCombinedPdf, exportZipIndividualPdfs } from '../utils/pdfGenerator';
import {
  Archive,
  CheckCircle,
  Download,
  FileText,
  Loader2,
  X,
} from 'lucide-react';

interface ExportPdfModalProps {
  vouchers: FeeVoucher[];
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

export const ExportPdfModal: React.FC<ExportPdfModalProps> = ({
  vouchers,
  onClose,
  onSuccess,
}) => {
  if (vouchers.length === 0) return null;

  const {
    institute,
    bankAccounts,
    students,
    classes,
    templates,
    roundingMultiple,
    roundingEnabled,
    voucherCopyOrder,
    voucherDefaultCopies,
  } = useApp();

  const [exportMode, setExportMode] = useState<'single_pdf' | 'zip_pdfs'>('single_pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedCopies, setSelectedCopies] = useState<VoucherCopyType[]>(
    voucherDefaultCopies && voucherDefaultCopies.length > 0
      ? voucherDefaultCopies
      : ['bank', 'institute', 'student']
  );

  const monthLabel = vouchers[0]?.month ? formatMonthName(vouchers[0].month) : 'Vouchers';
  const defaultFilenameBase = `Fee_Vouchers_${monthLabel.replace(/\s+/g, '_')}`;

  const effectiveOrder = voucherCopyOrder && voucherCopyOrder.length > 0
    ? voucherCopyOrder
    : (['bank', 'institute', 'student'] as VoucherCopyType[]);

  const handleExecuteExport = async () => {
    setIsExporting(true);
    try {
      const context = {
        institute,
        bankAccounts,
        students,
        classes,
        templates,
        roundingMultiple: roundingEnabled ? roundingMultiple : 1,
        copiesToInclude: selectedCopies.length > 0 ? selectedCopies : (['bank', 'institute', 'student'] as VoucherCopyType[]),
        copyOrder: effectiveOrder,
      };

      if (exportMode === 'single_pdf') {
        const filename = `${defaultFilenameBase}.pdf`;
        await exportSingleCombinedPdf(vouchers, context, filename);
        if (onSuccess) onSuccess(`Successfully exported ${vouchers.length} voucher(s) as ${filename}!`);
      } else {
        const zipFilename = `${defaultFilenameBase}_Individual.zip`;
        await exportZipIndividualPdfs(vouchers, context, zipFilename);
        if (onSuccess) onSuccess(`Successfully created ZIP archive containing ${vouchers.length} individual voucher PDF(s)!`);
      }

      onClose();
    } catch (err) {
      console.error('PDF Export Error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  useEscapeKey(onClose, !isExporting, 1);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-100 text-teal-700">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Export Fee Vouchers to PDF</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Download {vouchers.length} selected voucher(s) in high-resolution printable format.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Vouchers Summary */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500">Selected Count: </span>
            <span className="font-bold text-slate-900">{vouchers.length} Voucher(s)</span>
          </div>
          <div>
            <span className="text-slate-500">Total Net Amount: </span>
            <span className="font-bold text-teal-700 font-mono">
              {formatCurrency(vouchers.reduce((sum, v) => sum + v.netDue, 0))}
            </span>
          </div>
        </div>

        {/* Copies to Include Checkboxes */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl px-3.5 py-2.5 space-y-1.5">
          <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-teal-600" />
            Copies to Include:
          </span>

          <div className="flex items-center gap-4 flex-wrap pt-0.5">
            {(['bank', 'institute', 'student'] as VoucherCopyType[]).map((cType) => {
              const isChecked = selectedCopies.includes(cType);
              const title = cType === 'bank' ? 'Bank Copy' : cType === 'institute' ? 'Institute Copy' : 'Student Copy';
              const badgeColor = cType === 'bank' ? 'text-indigo-700 font-bold' : cType === 'institute' ? 'text-teal-700 font-bold' : 'text-slate-800 font-bold';
              return (
                <label
                  key={cType}
                  className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      if (isChecked) {
                        if (selectedCopies.length > 1) {
                          setSelectedCopies(selectedCopies.filter((c) => c !== cType));
                        }
                      } else {
                        setSelectedCopies([...selectedCopies, cType]);
                      }
                    }}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                  <span className={isChecked ? badgeColor : 'text-slate-600'}>{title}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Export Mode Options */}
        <div className="space-y-2.5">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Choose Export Format
          </label>

          <div
            onClick={() => setExportMode('single_pdf')}
            className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
              exportMode === 'single_pdf'
                ? 'border-teal-600 bg-teal-50/50 shadow-2xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <input
              type="radio"
              name="exportMode"
              checked={exportMode === 'single_pdf'}
              onChange={() => setExportMode('single_pdf')}
              className="mt-0.5 text-teal-600 focus:ring-teal-500 cursor-pointer"
            />
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-900">Single Combined PDF File</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Combines all {vouchers.length} selected vouchers into one multi-page PDF document.
              </p>
              <div className="text-[10px] font-mono text-teal-700 font-semibold pt-0.5">
                Output: {defaultFilenameBase}.pdf
              </div>
            </div>
          </div>

          <div
            onClick={() => setExportMode('zip_pdfs')}
            className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
              exportMode === 'zip_pdfs'
                ? 'border-teal-600 bg-teal-50/50 shadow-2xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <input
              type="radio"
              name="exportMode"
              checked={exportMode === 'zip_pdfs'}
              onChange={() => setExportMode('zip_pdfs')}
              className="mt-0.5 text-teal-600 focus:ring-teal-500 cursor-pointer"
            />
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-slate-900">
                  ZIP Archive with Individual Voucher PDFs
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Compresses each voucher into a separate PDF file inside a `.zip` file.
              </p>
              <div className="text-[10px] font-mono text-amber-800 font-semibold pt-0.5">
                Output: {defaultFilenameBase}_Individual.zip
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecuteExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating PDF(s)...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>
                  {exportMode === 'single_pdf' ? 'Download Combined PDF' : 'Download ZIP Archive'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
