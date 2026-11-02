import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FeeVoucher, ParticularKind, VoucherCopyType, VoucherItem } from '../types';
import { formatCurrency, formatMonthName, getAppliedFineAmount, getEffectiveMultiple, getCurrencyCode } from '../utils/feeMath';
import {
  VOUCHER_HEX,
  VOUCHER_FONT_PX,
  VOUCHER_COPY_TITLES,
  VOUCHER_STUDENT_ROWS,
  formatLineItemAmount,
} from '../utils/voucherTheme';
import { exportSingleFeeVoucherPdf, printFeeVoucherPdf } from '../utils/pdfGenerator';
import {
  CheckCircle,
  Download,
  Loader2,
  Printer,
  X,
} from 'lucide-react';

interface PrintVoucherModalProps {
  voucher: FeeVoucher;
  onClose: () => void;
}

export const PrintVoucherModal: React.FC<PrintVoucherModalProps> = ({ voucher, onClose }) => {
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

  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedCopies, setSelectedCopies] = useState<VoucherCopyType[]>(
    voucherDefaultCopies && voucherDefaultCopies.length > 0
      ? voucherDefaultCopies
      : ['bank', 'institute', 'student']
  );

  const student = students.find((s) => s.id === voucher.studentId);
  const schoolClass = classes.find((c) => c.id === voucher.classId);
  const activeBank = bankAccounts.find((b) => b.active && b.isDefault) || bankAccounts.find((b) => b.active);

  const copyDefinitions: Record<VoucherCopyType, { title: string; type: VoucherCopyType }> = {
    bank: { title: VOUCHER_COPY_TITLES.bank, type: 'bank' },
    institute: { title: VOUCHER_COPY_TITLES.institute, type: 'institute' },
    student: { title: VOUCHER_COPY_TITLES.student, type: 'student' },
  };

  const T = VOUCHER_HEX;
  const F = VOUCHER_FONT_PX;
  const rule = `1px solid ${T.border}`;
  const studentValues: Record<string, string> = {
    name: student?.name || 'Unknown',
    father: student?.fatherName || 'N/A',
    regNo: student?.regNo || 'N/A',
    class: schoolClass?.name || 'N/A',
  };

  const effectiveOrder = voucherCopyOrder && voucherCopyOrder.length > 0
    ? voucherCopyOrder
    : (['bank', 'institute', 'student'] as VoucherCopyType[]);

  const activeRenderCopies = effectiveOrder
    .filter((c) => selectedCopies.includes(c))
    .map((c) => copyDefinitions[c]);

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

  // Direct clean PDF print stream
  const handlePrint = async () => {
    try {
      setIsPrinting(true);
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
      await exportSingleFeeVoucherPdf(voucher, context);
    } catch (err) {
      console.error('Failed to export voucher PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  useEscapeKey(onClose, true, 1);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-5xl w-full p-3 sm:p-6 shadow-2xl space-y-3 sm:space-y-4 my-auto sm:my-6">
        {/* Modal Top Toolbar (Hidden on Print) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2.5 sm:gap-3 print:hidden">
          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Fee Voucher &bull; <span className="font-mono">{voucher.voucherNo}</span>
              </h3>
              <span className="text-[11px] font-mono font-semibold bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-md">
                {formatMonthName(voucher.month)}
              </span>
              <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-md hidden sm:inline-block">
                {activeRenderCopies.length} of 3 Copies
              </span>
            </div>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="sm:hidden p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition shrink-0"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              disabled={isExporting || isPrinting}
              onClick={handleSavePdf}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 sm:px-3.5 py-2 rounded-xl text-xs transition cursor-pointer disabled:opacity-50 min-h-[38px]"
              title="Save clean PDF file to device"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
              ) : (
                <Download className="w-3.5 h-3.5 text-slate-600" />
              )}
              <span>Save PDF</span>
            </button>

            <button
              type="button"
              disabled={isPrinting || isExporting}
              onClick={handlePrint}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 bg-teal-700 hover:bg-teal-800 text-white font-bold px-3.5 sm:px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer disabled:opacity-50 min-h-[38px]"
              title="Print official clean voucher PDF statement directly"
            >
              {isPrinting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <Printer className="w-3.5 h-3.5" />
              )}
              <span>Print PDF</span>
            </button>

            {/* Desktop Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="hidden sm:block p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition ml-1"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Copies Checkboxes Selection Bar */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 print:hidden">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-teal-600" />
            Copies to Include:
          </span>

          <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
            {(['bank', 'institute', 'student'] as VoucherCopyType[]).map((cType) => {
              const isChecked = selectedCopies.includes(cType);
              const title = cType === 'bank' ? 'Bank Copy' : cType === 'institute' ? 'Institute Copy' : 'Student Copy';
              const badgeColor = cType === 'bank' ? 'text-indigo-700' : cType === 'institute' ? 'text-teal-700' : 'text-slate-800';
              return (
                <label
                  key={cType}
                  className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none hover:text-slate-900 transition"
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
                  <span className={isChecked ? `font-bold ${badgeColor}` : 'text-slate-600'}>{title}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Printable Dynamic Copies Grid - Strict 3-column layout so 1 or 2 copies maintain exact standard 3-copy dimensions */}
        <div className="grid grid-cols-3 print:grid-cols-3 gap-3 print:gap-2 print:p-0 overflow-x-auto min-w-[760px] md:min-w-0">
          {activeRenderCopies.map((copy, copyIdx) => {
            return (
              <div
                key={copy.title}
                className="p-3 bg-white relative print:p-2"
                style={{ border: rule, color: T.ink, fontSize: F.body, fontFamily: 'Helvetica, Arial, sans-serif', background: T.paper }}
              >
                {copyIdx > 0 && (
                  <div
                    aria-hidden
                    className="absolute"
                    style={{ left: -7, top: -6, bottom: -6, borderLeft: `1px dashed ${T.tear}` }}
                  />
                )}
                {/* Copy badge: no background, black text */}
                <div className="flex items-center justify-between pb-1.5">
                  <span className="font-bold px-2 py-0.5" style={{ border: rule, fontSize: F.body }}>
                    {copy.title}
                  </span>
                  <span className="font-mono font-bold" style={{ fontSize: F.body }}>
                    {voucher.voucherNo}
                  </span>
                </div>

                {/* Institute header (logo unchanged) */}
                <div className="flex items-center gap-2 pb-2" style={{ borderBottom: rule }}>
                  {institute.logoUrl ? (
                    <img
                      src={institute.logoUrl}
                      alt={institute.name}
                      className="w-8 h-8 object-contain shrink-0 bg-white"
                    />
                  ) : (
                    <div
                      className="w-8 h-8 flex items-center justify-center font-bold shrink-0"
                      style={{ border: rule, fontSize: F.title }}
                    >
                      {institute.name ? institute.name.charAt(0) : 'S'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-center">
                    <h4 className="font-bold uppercase truncate" style={{ fontSize: F.title }}>
                      {institute.name}
                    </h4>
                    <p className="truncate leading-tight" style={{ fontSize: F.small, color: T.muted }}>{institute.address}</p>
                    <p className="font-bold" style={{ fontSize: F.body }}>
                      FEE VOUCHER &bull; {formatMonthName(voucher.month).toUpperCase()}
                    </p>
                  </div>
                </div>

                {/* Student particulars: heading followed by value */}
                <div className="mt-2 p-2 grid gap-x-1.5 gap-y-0.5" style={{ background: T.fill, border: rule, gridTemplateColumns: 'max-content minmax(0, 1fr)' }}>
                  {VOUCHER_STUDENT_ROWS.map((row) => (
                    <React.Fragment key={row.key}>
                      <span style={{ color: T.muted }}>{row.heading}</span>
                      <span className="font-bold truncate">{studentValues[row.key]}</span>
                    </React.Fragment>
                  ))}
                </div>

                {/* Issue / due dates: no background */}
                <div className="mt-2 flex justify-between items-center p-1.5 font-bold" style={{ border: rule }}>
                  <span>Issue Date: {voucher.issueDate}</span>
                  <span>Due Date: {voucher.dueDate}</span>
                </div>

                {/* Itemized particulars */}
                <div className="mt-2" style={{ border: rule }}>
                  <table data-no-resize className="w-full text-left" style={{ fontSize: F.body }}>
                    <thead style={{ background: T.fill, borderBottom: rule }}>
                      <tr>
                        <th className="p-1 font-bold">Particulars</th>
                        <th className="p-1 text-right font-bold">Amount ({getCurrencyCode()})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsToRender.map((item, pIdx) => (
                        <tr key={pIdx} style={{ borderBottom: `1px solid ${T.itemRule}` }}>
                          <td className="p-1">{item.label}</td>
                          <td className="p-1 text-right">{formatLineItemAmount(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold" style={{ background: T.fill }}>
                        <td className="p-1">NET DUE AMOUNT:</td>
                        <td className="p-1 text-right" style={{ fontSize: F.title }}>
                          {formatCurrency(voucher.netDue)}
                        </td>
                      </tr>
                      <tr className="font-bold" style={{ borderTop: rule }}>
                        <td className="p-1">PAYABLE AFTER DUE DATE:</td>
                        <td className="p-1 text-right">
                          {formatCurrency(voucher.netDue + getAppliedFineAmount(voucher, roundingMultiple))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Bank details: no color */}
                <div className="mt-2 p-2 space-y-1" style={{ border: rule }}>
                  {activeBank ? (
                    <>
                      <div className="flex justify-between items-center font-bold">
                        <p>{activeBank.bankName}</p>
                        <p>A/C: {activeBank.accountNumber}</p>
                      </div>
                      <div className="flex justify-between items-center" style={{ fontSize: F.small, color: T.muted }}>
                        <span className="truncate">Title: {activeBank.title}</span>
                        {activeBank.branchCode && <span>Branch: {activeBank.branchCode}</span>}
                      </div>
                      {(activeBank.instructionsLtr || activeBank.instructionsLine1) && (
                        <div className="pt-1 text-left leading-tight" dir="ltr" style={{ borderTop: rule, fontSize: F.small }}>
                          {activeBank.instructionsLtr || activeBank.instructionsLine1}
                        </div>
                      )}
                      {(activeBank.instructionsRtl || activeBank.instructionsLine2) && (
                        <div
                          className="text-right leading-tight"
                          dir="rtl"
                          style={{ fontSize: F.body, fontFamily: "'Noto Sans Arabic', 'Noto Sans Hebrew', sans-serif" }}
                        >
                          {activeBank.instructionsRtl || activeBank.instructionsLine2}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="italic text-center" style={{ fontSize: F.small, color: T.muted }}>
                      Payment can be made at the institute accounts office
                    </p>
                  )}
                </div>

                {/* Signatures */}
                <div className="pt-3 flex justify-between items-end" style={{ fontSize: F.small, color: T.muted }}>
                  <span className="pt-0.5 px-2" style={{ borderTop: rule }}>Bank Stamp</span>
                  <span className="pt-0.5 px-2" style={{ borderTop: rule }}>Accounts Office</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
