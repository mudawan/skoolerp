import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { FeeVoucher, ParticularKind, VoucherItem } from '../types';
import { formatCurrency, formatMonthName } from '../utils/feeMath';
import { exportSingleFeeVoucherPdf, printFeeVoucherPdf } from '../utils/pdfGenerator';
import { Building2, Download, Loader2, Printer, X } from 'lucide-react';

interface PrintVoucherModalProps {
  voucher: FeeVoucher;
  onClose: () => void;
}

export const PrintVoucherModal: React.FC<PrintVoucherModalProps> = ({ voucher, onClose }) => {
  const { institute, bankAccounts, students, classes, templates } = useApp();
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const student = students.find((s) => s.id === voucher.studentId);
  const schoolClass = classes.find((c) => c.id === voucher.classId);
  const activeBank = bankAccounts.find((b) => b.active && b.isDefault) || bankAccounts.find((b) => b.active);

  const copies = [
    { title: 'BANK COPY', tagColor: 'bg-indigo-700 text-white' },
    { title: 'INSTITUTE COPY', tagColor: 'bg-teal-700 text-white' },
    { title: 'STUDENT COPY', tagColor: 'bg-slate-800 text-white' },
  ];

  const standardOrder: { kind: ParticularKind; defaultLabel: string }[] = [
    { kind: 'Tuition', defaultLabel: 'Tuition Fee' },
    { kind: 'Flex1', defaultLabel: 'Admission Fee' },
    { kind: 'Flex2', defaultLabel: 'Registration Fee' },
    { kind: 'Transport', defaultLabel: 'Transport Fee' },
    { kind: 'Fine', defaultLabel: 'Fine' },
    { kind: 'Flex3', defaultLabel: 'Exam Fee' },
    { kind: 'Flex4', defaultLabel: 'Other' },
    { kind: 'PreviousBalance', defaultLabel: 'Previous Balance' },
    { kind: 'Discount', defaultLabel: 'Discount in Fee' },
  ];

  const globalTemplates = (templates || [])
    .filter((t) => !t.studentId && !t.classId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const classTemplates = (templates || []).filter(
    (t) => !t.studentId && t.classId === voucher.classId && (!t.month || t.month === voucher.month)
  );
  const studentTemplates = (templates || []).filter(
    (t) => t.studentId === student?.id && (!t.month || t.month === voucher.month)
  );

  const sortMap = new Map<ParticularKind, number>();
  globalTemplates.forEach((t) => sortMap.set(t.kind, t.sortOrder));
  classTemplates.forEach((t) => {
    if (t.sortOrder !== undefined) sortMap.set(t.kind, t.sortOrder);
  });
  studentTemplates.forEach((t) => {
    if (t.sortOrder !== undefined) sortMap.set(t.kind, t.sortOrder);
  });

  const orderedKinds: { kind: ParticularKind; defaultLabel: string }[] = standardOrder
    .slice()
    .sort((a, b) => {
      const orderA = sortMap.get(a.kind) ?? 99;
      const orderB = sortMap.get(b.kind) ?? 99;
      return orderA - orderB;
    });

  const itemsToRender: VoucherItem[] = orderedKinds.map((ordered) => {
    const existing = voucher.particulars.find((p) => p.kind === ordered.kind);
    const studentOverride = studentTemplates.find((t) => t.kind === ordered.kind);
    const classOverride = classTemplates.find((t) => t.kind === ordered.kind);
    const globalTpl = globalTemplates.find((t) => t.kind === ordered.kind);
    let label = studentOverride?.label || classOverride?.label || globalTpl?.label || (existing ? existing.label : ordered.defaultLabel);
    if (ordered.kind === 'Tuition') {
      label = label.replace(/\s*\(Class[^)]*\)/gi, '').trim() || 'Tuition Fee';
    } else if (ordered.kind === 'Transport') {
      label = studentOverride?.label || classOverride?.label || globalTpl?.label || 'Transport Fee';
    }
    return {
      kind: ordered.kind,
      label,
      amount: existing ? existing.amount : 0,
    };
  });

  // Direct clean PDF print stream (like StudentFeeLedger print ledger button)
  const handlePrint = async () => {
    try {
      setIsPrinting(true);
      const context = { institute, bankAccounts, students, classes, templates };
      await printFeeVoucherPdf(voucher, context);
    } catch (err) {
      console.error('Failed to print voucher PDF:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  // Download single PDF file
  const handleSavePdf = async () => {
    try {
      setIsExporting(true);
      const context = { institute, bankAccounts, students, classes, templates };
      await exportSingleFeeVoucherPdf(voucher, context);
    } catch (err) {
      console.error('Failed to export voucher PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl space-y-4 my-auto">
        {/* Modal Top Toolbar (Hidden on Print) */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 print:hidden">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-slate-900">
              Print Fee Voucher &bull; {voucher.voucherNo}
            </h3>
            <span className="text-xs font-mono font-semibold bg-teal-100 text-teal-800 px-2 py-0.5 rounded">
              {formatMonthName(voucher.month)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExporting || isPrinting}
              onClick={handleSavePdf}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
              title="Save clean PDF file to device"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
              ) : (
                <Download className="w-4 h-4 text-slate-600" />
              )}
              <span>Save PDF</span>
            </button>

            <button
              type="button"
              disabled={isPrinting || isExporting}
              onClick={handlePrint}
              className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
              title="Print official clean voucher PDF statement directly"
            >
              {isPrinting ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>Print PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition ml-1"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable 3-Copy Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 print:grid-cols-3 print:gap-2 print:p-0">
          {copies.map((copy) => (
            <div
              key={copy.title}
              className="border-2 border-dashed border-slate-300 p-3 rounded-xl bg-white text-[11px] text-slate-800 space-y-2 relative shadow-2xs print:border-solid print:border-slate-800 print:shadow-none print:p-2"
            >
              {/* Copy Badge Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${copy.tagColor}`}>
                  {copy.title}
                </span>
                <span className="font-mono font-bold text-slate-900 text-[10px]">
                  {voucher.voucherNo}
                </span>
              </div>

              {/* Institute Header */}
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                {institute.logoUrl ? (
                  <img
                    src={institute.logoUrl}
                    alt={institute.name}
                    className="w-8 h-8 object-contain rounded-md border border-slate-200 shrink-0 bg-white"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-md bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 font-bold text-xs shrink-0">
                    {institute.name ? institute.name.charAt(0) : 'S'}
                  </div>
                )}
                <div className="flex-1 min-w-0 text-center">
                  <h4 className="font-bold text-xs uppercase text-slate-900 tracking-tight truncate">
                    {institute.name}
                  </h4>
                  <p className="text-[8.5px] text-slate-500 leading-tight truncate">{institute.address}</p>
                  <p className="text-[9px] font-bold text-teal-800">
                    FEE VOUCHER &bull; {formatMonthName(voucher.month).toUpperCase()}
                  </p>
                </div>
              </div>

              {/* Student Metadata */}
              <div className="grid grid-cols-2 gap-1 bg-slate-50/60 p-2 rounded border border-slate-100 text-[10px]">
                <div>
                  <span className="text-slate-400 block text-[9px]">Student Name:</span>
                  <span className="font-bold text-slate-900 truncate block">{student?.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px]">Registration No.:</span>
                  <span className="font-mono font-bold text-slate-900 truncate block">
                    {student?.regNo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px]">Class:</span>
                  <span className="font-bold text-slate-900">{schoolClass?.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px]">Father Name:</span>
                  <span className="font-bold text-slate-900 truncate block">
                    {student?.fatherName}
                  </span>
                </div>
              </div>

              {/* Issue Date & Due Date Info */}
              <div className="flex justify-between items-center text-[10px] bg-amber-50 p-1.5 rounded border border-amber-200/60 font-bold text-amber-900">
                <span>Issue Date: {voucher.issueDate}</span>
                <span>Due Date: {voucher.dueDate}</span>
              </div>

              {/* Itemized Particulars */}
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-left text-[10px]">
                  <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="p-1">Particulars</th>
                      <th className="p-1 text-right">Amount (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsToRender.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-1 font-medium text-slate-800">{item.label}</td>
                        <td
                          className={`p-1 text-right font-bold ${
                            item.amount < 0 ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="divide-y divide-slate-200">
                    <tr className="bg-slate-100 font-bold text-slate-800 border-t border-slate-300">
                      <td className="p-1">NET DUE AMOUNT:</td>
                      <td className="p-1 text-right text-teal-700 font-bold">
                        {formatCurrency(voucher.netDue)}
                      </td>
                    </tr>
                    <tr className="bg-rose-50 font-bold text-rose-900 border-t border-rose-200">
                      <td className="p-1 text-[9.5px]">PAYABLE AFTER DUE DATE:</td>
                      <td className="p-1 text-right text-rose-700 font-bold">
                        {formatCurrency(voucher.netDue + (voucher.lateFeeRate || 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Bank Account Details & Instructions */}
              <div className="bg-slate-50 p-2 rounded border border-slate-200 text-[10px] space-y-1">
                {activeBank ? (
                  <>
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-slate-900">{activeBank.bankName}</p>
                      <p className="font-mono font-semibold text-slate-700 text-[9px]">A/C: {activeBank.accountNumber}</p>
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-slate-500">
                      <span className="truncate">{activeBank.title}</span>
                      {activeBank.branchCode && <span>Branch: {activeBank.branchCode}</span>}
                    </div>

                    {/* LTR Instructions (English) */}
                    {(activeBank.instructionsLtr || activeBank.instructionsLine1) && (
                      <div
                        className="pt-1 border-t border-slate-200/80 text-[8.5px] text-slate-700 text-left leading-tight"
                        dir="ltr"
                      >
                        {activeBank.instructionsLtr || activeBank.instructionsLine1}
                      </div>
                    )}

                    {/* RTL Instructions (Urdu) */}
                    {(activeBank.instructionsRtl || activeBank.instructionsLine2) && (
                      <div
                        className="text-[9.5px] text-slate-800 text-right leading-tight font-medium"
                        dir="rtl"
                        style={{ fontFamily: "'Noto Nastaliq Urdu', 'Noto Sans Arabic', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', sans-serif" }}
                      >
                        {activeBank.instructionsRtl || activeBank.instructionsLine2}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="italic text-slate-500 text-center">
                    Payment can be made at the institute accounts office
                  </p>
                )}
              </div>

              {/* Signatures */}
              <div className="pt-3 flex justify-between items-end text-[9px] text-slate-400 font-medium">
                <span className="border-t border-slate-300 pt-0.5 px-2">Bank Stamp</span>
                <span className="border-t border-slate-300 pt-0.5 px-2">Accounts Office</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
