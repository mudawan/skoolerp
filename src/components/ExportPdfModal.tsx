import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FeeVoucher } from '../types';
import { formatCurrency, formatMonthName } from '../utils/feeMath';
import { exportSingleCombinedPdf, exportZipIndividualPdfs } from '../utils/pdfGenerator';
import { Archive, Download, FileDown, FileText, Loader2, X } from 'lucide-react';

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

  const { institute, bankAccounts, students, classes, templates } = useApp();
  const [exportMode, setExportMode] = useState<'single_pdf' | 'zip_pdfs'>('single_pdf');
  const [isExporting, setIsExporting] = useState(false);

  const monthLabel = vouchers[0]?.month ? formatMonthName(vouchers[0].month) : 'Vouchers';
  const defaultFilenameBase = `Fee_Vouchers_${monthLabel.replace(/\s+/g, '_')}`;

  const handleExecuteExport = async () => {
    setIsExporting(true);
    try {
      const context = { institute, bankAccounts, students, classes, templates };

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
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-100 text-teal-700">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Export Fee Vouchers to PDF</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Download {vouchers.length} selected voucher(s) in high-resolution 3-copy printable format.
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

        {/* Export Mode Options */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Choose Export Format
          </label>

          <div
            onClick={() => setExportMode('single_pdf')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-start gap-3.5 ${
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
              className="mt-1 text-teal-600 focus:ring-teal-500 cursor-pointer"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-900">Single Combined PDF File</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Combines all {vouchers.length} selected vouchers into one multi-page PDF document. Best for batch printing at school accounts.
              </p>
              <div className="text-[10px] font-mono text-teal-700 font-semibold pt-0.5">
                Output: {defaultFilenameBase}.pdf
              </div>
            </div>
          </div>

          <div
            onClick={() => setExportMode('zip_pdfs')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-start gap-3.5 ${
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
              className="mt-1 text-teal-600 focus:ring-teal-500 cursor-pointer"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-slate-900">
                  ZIP Archive (Individual Student PDFs)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Compresses each voucher into a separate PDF file inside a `.zip` file. Ideal for emailing individual vouchers to parents.
              </p>
              <div className="text-[10px] font-mono text-amber-800 font-semibold pt-0.5">
                Output: {defaultFilenameBase}_Individual.zip
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecuteExport}
            disabled={isExporting}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating {exportMode === 'zip_pdfs' ? 'ZIP Archive...' : 'PDF...'}</span>
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                <span>
                  Download {exportMode === 'zip_pdfs' ? 'ZIP Archive' : 'PDF Document'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
