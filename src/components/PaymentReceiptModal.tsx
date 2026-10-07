import React, { useState, useEffect, useMemo } from 'react';
import { paymentModeText, isBankedMode } from '../utils/paymentMode';
import {
  Printer,
  Download,
  Copy,
  Check,
  X,
  Receipt,
  Building2,
  FileText,
  CreditCard,
  User,
  Calendar,
  Layers,
  Sparkles,
  Scissors,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react';
import { PaymentReceiptData, ParticularKind, VoucherItem } from '../types';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatMonthName, numberToWords, getCurrencyCode, formatAmount } from '../utils/feeMath';
import { exportPaymentReceiptPdf, printPaymentReceiptPdf } from '../utils/pdfGenerator';
import { StudentAvatar } from './StudentAvatar';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptData: PaymentReceiptData | PaymentReceiptData[] | null;
  initialIndex?: number;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  receiptData,
  initialIndex = 0,
}) => {
  const { institute, bankAccounts, students, classes, feeTemplates, voucherRoundingMultiple, appTheme, showToast } =
    useApp();

  useEscapeKey(onClose, isOpen);

  const [copyMode, setCopyMode] = useState<'dual' | 'single' | 'thermal'>('dual');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Normalize receipts list
  const receipts = useMemo(() => {
    if (!receiptData) return [];
    return Array.isArray(receiptData) ? receiptData : [receiptData];
  }, [receiptData]);

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      if (initialIndex >= 0 && initialIndex < receipts.length) {
        setCurrentIndex(initialIndex);
      } else {
        setCurrentIndex(0);
      }
    }
  }, [isOpen, initialIndex, receipts.length]);

  if (!isOpen || receipts.length === 0) return null;

  const isBatch = receipts.length > 1;
  const activeReceipt = receipts[currentIndex] || receipts[0];
  const { transaction: txn, voucher, student } = activeReceipt;

  const schoolClass =
    activeReceipt.schoolClass ||
    classes.find((c) => c.id === student?.classId || c.id === voucher?.classId);
  const activeBank =
    activeReceipt.bankAccount ||
    bankAccounts.find((b) => b.active && b.isDefault) ||
    bankAccounts.find((b) => b.active);

  const totalPaid = voucher?.amountPaid || txn?.amount || 0;
  const netDue = voucher?.netDue || 0;
  const remaining = Math.max(0, netDue - totalPaid);
  const isFullyPaid = totalPaid >= netDue && netDue > 0;

  // Build ordered list of all fee particulars matching the standard order and custom templates
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

  const globalTemplates = (feeTemplates || [])
    .filter((t) => !t.studentId && !t.classId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const classTemplates = (feeTemplates || []).filter(
    (t) => !t.studentId && t.classId === voucher?.classId && (!t.month || t.month === voucher?.month)
  );
  const studentTemplates = (feeTemplates || []).filter(
    (t) => t.studentId === student?.id && (!t.month || t.month === voucher?.month)
  );

  const sortMap = new Map<ParticularKind, number>();
  globalTemplates.forEach((t) => sortMap.set(t.kind, t.sortOrder));
  classTemplates.forEach((t) => {
    if (t.sortOrder !== undefined) sortMap.set(t.kind, t.sortOrder);
  });
  studentTemplates.forEach((t) => {
    if (t.sortOrder !== undefined) sortMap.set(t.kind, t.sortOrder);
  });

  const orderedKinds = standardOrder.slice().sort((a, b) => {
    const orderA = sortMap.get(a.kind) ?? 99;
    const orderB = sortMap.get(b.kind) ?? 99;
    return orderA - orderB;
  });

  const allParticularsToRender: VoucherItem[] = orderedKinds.map((ordered) => {
    const existing = (voucher?.particulars || []).find((p) => p.kind === ordered.kind);
    const studentOverride = studentTemplates.find((t) => t.kind === ordered.kind);
    const classOverride = classTemplates.find((t) => t.kind === ordered.kind);
    const globalTpl = globalTemplates.find((t) => t.kind === ordered.kind);
    let label =
      studentOverride?.label ||
      classOverride?.label ||
      globalTpl?.label ||
      (existing ? existing.label : ordered.defaultLabel);
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

  const pdfContext = {
    institute,
    bankAccounts,
    students,
    classes,
    templates: feeTemplates,
    roundingMultiple: voucherRoundingMultiple,
    themeColor: '#0f766e',
  };

  const handlePrintAll = async () => {
    try {
      setIsPrinting(true);
      await printPaymentReceiptPdf(receipts, pdfContext, { copyMode });
      showToast(`Opening print dialog for all ${receipts.length} batch payment receipts...`, 'info');
    } catch (err) {
      console.error('Batch print failed:', err);
      showToast('Failed to trigger batch direct print.', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintCurrent = async () => {
    try {
      setIsPrinting(true);
      await printPaymentReceiptPdf(activeReceipt, pdfContext, { copyMode });
      showToast(`Opening print dialog for receipt (${student?.name})...`, 'info');
    } catch (err) {
      console.error('Print failed:', err);
      showToast('Failed to trigger direct print.', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadAllPdf = async () => {
    try {
      setIsDownloading(true);
      await exportPaymentReceiptPdf(receipts, pdfContext, { copyMode });
      showToast(`Downloaded batch PDF containing ${receipts.length} receipts.`, 'success');
    } catch (err) {
      console.error('Batch download failed:', err);
      showToast('Failed to generate batch PDF download.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadCurrentPdf = async () => {
    try {
      setIsDownloading(true);
      await exportPaymentReceiptPdf(activeReceipt, pdfContext, { copyMode });
      showToast(`Payment receipt PDF for ${student?.name} downloaded successfully.`, 'success');
    } catch (err) {
      console.error('Download failed:', err);
      showToast('Failed to generate PDF download.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopySummary = async () => {
    try {
      const summaryText = `*OFFICIAL FEE PAYMENT RECEIPT*
Institute: ${institute.name}
Receipt #: ${txn?.txnNo}
Date: ${txn?.date}
Student: ${student?.name} (Reg: ${student?.regNo})
Class: ${schoolClass?.name || 'General'}
Voucher #: ${voucher?.voucherNo} (${formatMonthName(voucher?.month || '')})
Amount Paid: ${formatCurrency(txn?.amount || 0)}
Payment Mode: ${paymentModeText(txn?.paymentMode)}${txn?.referenceNo ? ` [Ref: ${txn.referenceNo}]` : ''}
Status: ${isFullyPaid ? 'FULLY PAID' : `PARTIAL (Remaining: ${formatCurrency(remaining || 0)})`}
Amount in Words: ${numberToWords(txn?.amount || 0)}
Thank you for your payment!`;

      await navigator.clipboard.writeText(summaryText);
      setIsCopied(true);
      showToast('Receipt summary copied to clipboard for WhatsApp/SMS!', 'success');
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error('Copy failed:', err);
      showToast('Failed to copy to clipboard.', 'error');
    }
  };

  const batchTotalAmount = receipts.reduce((sum, r) => sum + (r.transaction?.amount || 0), 0);

  const renderSingleSlipPreview = (copyTitle: string, isCompact: boolean = false) => {
    return (
      <div
        className={`bg-white rounded-xl border border-slate-200 shadow-sm relative overflow-hidden transition-all text-slate-800 ${
          isCompact ? 'p-4 text-xs' : 'p-6 text-sm'
        }`}
      >
        {/* Top Watermark / Institute Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-3">
          <div className="flex items-center gap-3">
            {institute.logoUrl ? (
              <img
                src={institute.logoUrl}
                alt="Logo"
                className={`${isCompact ? 'w-10 h-10' : 'w-12 h-12'} object-contain rounded border border-slate-100 bg-white p-0.5`}
              />
            ) : (
              <div
                className={`${
                  isCompact ? 'w-10 h-10' : 'w-12 h-12'
                } rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold font-serif text-base shadow-sm`}
              >
                {institute.name ? institute.name.charAt(0) : 'A'}
              </div>
            )}

            <div>
              <h2 className={`font-bold text-slate-900 leading-tight uppercase ${isCompact ? 'text-sm' : 'text-base'}`}>
                {institute.name || 'APEX INTERNATIONAL INSTITUTE'}
              </h2>
              <p className="text-[11px] text-slate-500 line-clamp-1">
                {[institute.address, institute.phone ? `Ph: ${institute.phone}` : '', institute.regNo ? `Reg: ${institute.regNo}` : '']
                  .filter(Boolean)
                  .join(' • ')}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0 flex flex-col items-end">
            <div className="bg-teal-700 text-white px-3 py-1 rounded-md text-center shadow-xs">
              <span className="block font-black text-[11px] uppercase tracking-wider">PAYMENT RECEIPT</span>
              <span className="block text-[9px] font-semibold text-teal-100 uppercase tracking-widest">{copyTitle}</span>
            </div>
          </div>
        </div>

        {/* Student & Metadata Ribbon */}
        <div className="mt-3 bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Student:</span>
            <span className="font-bold text-slate-900">{student?.name}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Receipt #:</span>
            <span className="font-mono font-bold text-teal-700">{txn?.txnNo}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Reg / Roll #:</span>
            <span className="font-mono font-bold text-slate-800">
              {student?.regNo} {student?.studentNo ? `(${student.studentNo})` : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Date:</span>
            <span className="font-semibold text-slate-800">{txn?.date}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Class:</span>
            <span className="font-bold text-slate-800">{schoolClass?.name || 'General'}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Voucher Ref:</span>
            <span className="font-medium text-slate-800">
              {voucher?.voucherNo} <span className="text-slate-400">({formatMonthName(voucher?.month || '')})</span>
            </span>
          </div>

          <div className="flex items-center gap-2 col-span-2">
            <span className="text-slate-400 font-medium">Payment Mode:</span>
            <span className="font-semibold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 text-[11px]">
              {paymentModeText(txn?.paymentMode)} {txn?.referenceNo ? `[Ref: ${txn.referenceNo}]` : ''}
            </span>
            {student?.fatherName && (
              <span className="text-slate-500 text-[11px] ml-auto">Father: {student.fatherName}</span>
            )}
          </div>
        </div>

        {/* Fee Breakdown Table */}
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 text-xs">
          <table data-no-resize className="w-full text-left">
            <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-1.5 px-3">Fee Head / Description</th>
                <th className="py-1.5 px-3 text-right">Amount ({getCurrencyCode()})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allParticularsToRender.map((p, idx) => (
                <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                  <td className="py-1 px-3 text-slate-700">{p.label}</td>
                  <td
                    className={`py-1 px-3 text-right font-mono font-semibold ${
                      p.amount < 0 ? 'text-teal-600' : 'text-slate-800'
                    }`}
                  >
                    {formatCurrency(p.amount)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold border-t border-slate-200">
                <td className="py-1.5 px-3 text-slate-800">Total Voucher Net Due</td>
                <td className="py-1.5 px-3 text-right font-mono text-slate-900">
                  {formatCurrency(voucher?.netDue || 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Amount Paid Highlight Card */}
        <div className="mt-3 bg-emerald-50/90 border border-emerald-200 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
              AMOUNT RECEIVED TODAY
            </span>
            <span className="text-lg font-black font-mono text-emerald-900">{formatCurrency(txn?.amount || 0)}</span>
            <span className="text-[11px] text-emerald-800 italic block mt-0.5">
              In Words: {numberToWords(txn?.amount || 0)}
            </span>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                isFullyPaid ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}
            >
              {isFullyPaid ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  FULLY PAID
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                  PARTIAL PAYMENT
                </>
              )}
            </span>
            <span className="text-[11px] font-semibold text-slate-600">
              Remaining Balance: <span className="font-mono font-bold text-slate-800">{formatCurrency(remaining)}</span>
            </span>
          </div>
        </div>

        {/* Bank Details & Remarks */}
        {(txn?.notes || activeBank) && (
          <div className="mt-2 text-[11px] text-slate-500 bg-slate-50/60 p-2 rounded border border-slate-100">
            {txn?.notes && <p className="font-medium text-slate-700">Remarks: {txn.notes}</p>}
            {activeBank && isBankedMode(txn?.paymentMode) && (
              <p className="text-[10px] text-slate-500">
                Deposit Bank: {activeBank.bankName} | A/C: {activeBank.accountNumber} | Title: {activeBank.title}
              </p>
            )}
          </div>
        )}

        {/* Signatures & Footer Notice */}
        <div className="mt-6 pt-3 border-t border-slate-100 flex items-end justify-between text-[11px] text-slate-500">
          <div className="text-center w-36">
            <div className="border-b border-slate-300 mb-1 w-full" />
            <span>Depositor Signature</span>
          </div>

          <div className="text-center">
            <span className="text-[10px] italic text-slate-400 block">
              Official computer-generated receipt • Apex Fee System
            </span>
          </div>

          <div className="text-center w-36">
            <div className="border-b border-slate-300 mb-1 w-full" />
            <span className="font-semibold text-slate-700">Authorized Cashier Stamp</span>
          </div>
        </div>
      </div>
    );
  };

  const renderThermalPreview = () => {
    return (
      <div className="max-w-[340px] mx-auto bg-white p-4 font-mono text-xs border border-slate-300 shadow-md rounded-md text-slate-900">
        <div className="text-center border-b border-dashed border-slate-400 pb-2 mb-2">
          <h2 className="font-bold text-sm uppercase">{institute.name || 'APEX INSTITUTE'}</h2>
          <p className="text-[10px] text-slate-600">{institute.address}</p>
          <p className="text-[10px] text-slate-600">Ph: {institute.phone}</p>
          <div className="mt-1 font-bold bg-black text-white px-2 py-0.5 inline-block text-[11px]">
            PAYMENT RECEIPT
          </div>
        </div>

        <div className="space-y-1 text-[11px] border-b border-dashed border-slate-400 pb-2 mb-2">
          <div className="flex justify-between">
            <span>Txn #:</span>
            <span className="font-bold">{txn?.txnNo}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{txn?.date}</span>
          </div>
          <div className="flex justify-between">
            <span>Student:</span>
            <span className="font-bold">{student?.name}</span>
          </div>
          <div className="flex justify-between">
            <span>Reg #:</span>
            <span>{student?.regNo}</span>
          </div>
          <div className="flex justify-between">
            <span>Class:</span>
            <span>{schoolClass?.name || 'General'}</span>
          </div>
          <div className="flex justify-between">
            <span>Voucher #:</span>
            <span>{voucher?.voucherNo}</span>
          </div>
          <div className="flex justify-between">
            <span>Mode:</span>
            <span>{paymentModeText(txn?.paymentMode)}</span>
          </div>
        </div>

        <div className="border-b border-dashed border-slate-400 pb-2 mb-2">
          <div className="flex justify-between font-bold text-[10px] uppercase border-b border-slate-200 pb-1 mb-1">
            <span>Particulars</span>
            <span>Amount</span>
          </div>
          {allParticularsToRender.map((p, idx) => (
            <div key={idx} className="flex justify-between text-[11px]">
              <span className="truncate pr-2">{p.label}</span>
              <span>{formatAmount(p.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t border-slate-300 pt-1 mt-1">
            <span>Net Due:</span>
            <span>{formatCurrency(voucher?.netDue || 0)}</span>
          </div>
        </div>

        <div className="border-b border-dashed border-slate-400 pb-2 mb-2 text-center bg-slate-100 p-2 rounded">
          <span className="text-[10px] font-bold block">PAID AMOUNT</span>
          <span className="text-base font-black font-mono block">{formatCurrency(txn?.amount || 0)}</span>
          <span className="text-[9px] block text-slate-600 mt-0.5">{numberToWords(txn?.amount || 0)}</span>
          <div className="mt-1 text-[10px] font-bold">
            {isFullyPaid ? '*** FULLY PAID ***' : `Remaining: ${formatCurrency(remaining)}`}
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-500 pt-2 space-y-2">
          <p>Thank you for your payment!</p>
          <div className="pt-4 border-b border-slate-300 w-32 mx-auto" />
          <p>Cashier Signature</p>
        </div>
      </div>
    );
  };

  return (
    <div
      id="payment-receipt-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        id="payment-receipt-modal-container"
        className="bg-slate-100 border border-slate-300 rounded-2xl w-full max-w-4xl my-auto max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Top Control Bar */}
        <div className="bg-white px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-md">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">
                  {isBatch ? 'Batch Payment Receipt Generator' : 'Payment Receipt Generator'}
                </h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded">
                  {isBatch ? `${receipts.length} Receipts in Batch` : txn?.txnNo}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {isBatch ? (
                  <span>
                    Batch collection &bull; Viewing <span className="font-semibold text-slate-800">{student?.name}</span> ({schoolClass?.name || 'Class'})
                  </span>
                ) : (
                  <span>
                    Official payment receipt for <span className="font-semibold text-slate-800">{student?.name}</span> &bull; {schoolClass?.name || 'Class'}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Copy Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setCopyMode('dual')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                copyMode === 'dual'
                  ? 'bg-white text-teal-800 font-bold shadow-xs border border-slate-200'
                  : 'hover:text-slate-900'
              }`}
              title="Print 2 copies (Student & Office Copy) on a single A4 page"
            >
              <Layers className="w-3.5 h-3.5 text-teal-600" />
              <span>Dual Slip (A4)</span>
            </button>

            <button
              onClick={() => setCopyMode('single')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                copyMode === 'single'
                  ? 'bg-white text-teal-800 font-bold shadow-xs border border-slate-200'
                  : 'hover:text-slate-900'
              }`}
              title="Print 1 full-page slip"
            >
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span>Single (A4)</span>
            </button>

            <button
              onClick={() => setCopyMode('thermal')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                copyMode === 'thermal'
                  ? 'bg-white text-teal-800 font-bold shadow-xs border border-slate-200'
                  : 'hover:text-slate-900'
              }`}
              title="Print on standard 80mm POS receipt roll"
            >
              <CreditCard className="w-3.5 h-3.5 text-slate-600" />
              <span>POS (80mm)</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition border border-slate-200 bg-white cursor-pointer"
              title="Copy receipt details for WhatsApp / SMS"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>

            {isBatch ? (
              <>
                <button
                  onClick={handleDownloadAllPdf}
                  disabled={isDownloading}
                  className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                  title={`Download single PDF file with all ${receipts.length} student receipts`}
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isDownloading ? 'Saving...' : `PDF All (${receipts.length})`}</span>
                </button>

                <button
                  onClick={handlePrintCurrent}
                  disabled={isPrinting}
                  className="px-3 py-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                  title="Print only this currently selected student's receipt"
                >
                  <Printer className="w-3.5 h-3.5 text-teal-700" />
                  <span>Print Slip</span>
                </button>

                <button
                  onClick={handlePrintAll}
                  disabled={isPrinting}
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-xl transition flex items-center gap-2 shadow-md hover:shadow-lg cursor-pointer disabled:opacity-50"
                  title={`Print all ${receipts.length} payment receipt slips in batch`}
                >
                  <Printer className="w-4 h-4" />
                  <span>{isPrinting ? 'Preparing Print...' : `Print All (${receipts.length})`}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleDownloadCurrentPdf}
                  disabled={isDownloading}
                  className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isDownloading ? 'Saving...' : 'PDF'}</span>
                </button>

                <button
                  onClick={handlePrintCurrent}
                  disabled={isPrinting}
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-xl transition flex items-center gap-2 shadow-md hover:shadow-lg cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isPrinting ? 'Preparing Print...' : 'Print Receipt'}</span>
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer ml-1"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Preview Area */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100/80">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Batch Navigation Banner when multiple receipts in batch */}
            {isBatch && (
              <div className="bg-white rounded-xl border border-teal-200/80 shadow-xs p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Student <span className="text-teal-700 font-black">{currentIndex + 1}</span> of {receipts.length}
                      </span>
                      <span className="text-[11px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                        {student?.regNo}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Batch Total: <strong className="text-emerald-700 font-mono">{formatCurrency(batchTotalAmount)}</strong> across {receipts.length} vouchers
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
                  <button
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentIndex === 0}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer"
                    title="Previous Student Receipt"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>

                  <select
                    value={currentIndex}
                    onChange={(e) => setCurrentIndex(Number(e.target.value))}
                    className="text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-teal-500 max-w-[200px] sm:max-w-[240px] truncate cursor-pointer"
                  >
                    {receipts.map((r, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {r.student?.name} ({r.student?.regNo}) &bull; {formatCurrency(r.transaction?.amount || 0)}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setCurrentIndex((prev) => Math.min(receipts.length - 1, prev + 1))}
                    disabled={currentIndex === receipts.length - 1}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer"
                    title="Next Student Receipt"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {copyMode === 'thermal' ? (
              renderThermalPreview()
            ) : copyMode === 'dual' ? (
              <div className="space-y-4">
                {/* Student Copy */}
                {renderSingleSlipPreview('STUDENT / PARENT COPY', true)}

                {/* Perforation Cut Line */}
                <div className="relative py-1 flex items-center justify-center">
                  <div className="border-t-2 border-dashed border-slate-300 w-full" />
                  <div className="absolute bg-slate-100 px-3 py-0.5 rounded-full border border-slate-200 text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
                    <Scissors className="w-3 h-3 text-slate-400" />
                    <span>Perforated Tear-off Line</span>
                  </div>
                </div>

                {/* Institute / Accounts Copy */}
                {renderSingleSlipPreview('INSTITUTE / ACCOUNTS COPY', true)}
              </div>
            ) : (
              renderSingleSlipPreview('ORIGINAL RECEIPT', false)
            )}
          </div>
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="bg-white px-5 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {isBatch
                ? `Batch of ${receipts.length} payment receipts ready. Click 'Print All' or 'Print Slip' to generate.`
                : 'Ready for printing or PDF export. Receipt registered in collection logs.'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isBatch && (
              <button
                onClick={handleDownloadCurrentPdf}
                disabled={isDownloading}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Download Current PDF
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentReceiptModal;
