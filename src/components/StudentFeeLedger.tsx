import React, { useState, useMemo, useEffect } from 'react';
import { CSV_VOUCHER_NO, CSV_REFERENCE_NO } from '../utils/csvHeaders';
import { DEFAULT_PAYMENT_MODE, paymentModeText } from '../utils/paymentMode';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FeeVoucher, PaymentTransaction, Student, VoucherItem } from '../types';
import { formatCurrency, formatMonthName, formatStudentAge, calculateAge, getEffectiveMultiple, roundUpToMultiple, getCurrencyCode, getStudentArrears } from '../utils/feeMath';
import { downloadCsv } from '../utils/csv';
import { exportStudentFeeLedgerPdf, printStudentFeeLedgerPdf } from '../utils/pdfGenerator';
import { StudentAvatar } from './StudentAvatar';
import { PrintVoucherModal } from './PrintVoucherModal';
import { DatePicker } from './DatePicker';
import { VoucherParticularsEditor } from './VoucherParticularsEditor';
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Info,
  Loader2,
  Printer,
  Receipt,
  Save,
  Search,
  Send,
  Sparkles,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';

interface StudentFeeLedgerProps {
  initialStudentId?: string;
  onClose?: () => void;
  inModal?: boolean;
}

export const StudentFeeLedger: React.FC<StudentFeeLedgerProps> = ({
  initialStudentId,
  onClose,
  inModal = false,
}) => {
  const {
    students,
    classes,
    vouchers,
    transactions,
    ensureStudentHistory,
    institute,
    bankAccounts,
    templates,
    roundingMultiple,
    roundingEnabled,
    collectVoucherPayment,
    updateVoucherParticulars,
    hasPermission,
    themeConfig,
    showToast,
  } = useApp();

  // Search & Student Selection
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');
  const [studentSearch, setStudentSearch] = useState(() => {
    if (initialStudentId) {
      const s = students.find((st) => st.id === initialStudentId);
      return s ? `${s.name} (${s.regNo})` : '';
    }
    return '';
  });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Sync state if initialStudentId changes externally
  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
      const s = students.find((st) => st.id === initialStudentId);
      if (s) {
        setStudentSearch(`${s.name} (${s.regNo})`);
      }
    } else {
      setSelectedStudentId('');
      setStudentSearch('');
    }
  }, [initialStudentId, students]);

  // Filters & Sorting
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Paid' | 'Partial' | 'Unpaid'>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [tableSearch, setTableSearch] = useState('');

  // Modals & UI States
  const [selectedVoucherForPrint, setSelectedVoucherForPrint] = useState<FeeVoucher | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [collectModalVoucher, setCollectModalVoucher] = useState<FeeVoucher | null>(null);
  const [collectAmount, setCollectAmount] = useState<number | string>('');
  const [collectMode, setCollectMode] = useState<PaymentTransaction['paymentMode']>(DEFAULT_PAYMENT_MODE);
  const [collectRef, setCollectRef] = useState('');
  const [collectDate, setCollectDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectNotes, setCollectNotes] = useState('');
  const [collectItems, setCollectItems] = useState<VoucherItem[]>([]);
  const [activeTxnDetail, setActiveTxnDetail] = useState<PaymentTransaction | null>(null);

  useEscapeKey(() => {
    if (selectedVoucherForPrint) {
      setSelectedVoucherForPrint(null);
    } else if (collectModalVoucher) {
      setCollectModalVoucher(null);
    } else if (activeTxnDetail) {
      setActiveTxnDetail(null);
    } else if (isDropdownOpen) {
      setIsDropdownOpen(false);
    } else if (inModal && onClose) {
      onClose();
    }
  }, !!(selectedVoucherForPrint || collectModalVoucher || activeTxnDetail || isDropdownOpen || (inModal && onClose)));

  // Dynamic calculations for the collect modal
  const collectDynamicNetDue = useMemo(() => {
    if (collectItems.length > 0) {
      const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, collectModalVoucher?.roundingMultiple);
      return roundUpToMultiple(collectItems.reduce((sum, p) => sum + (Number(p.amount) || 0), 0), mult);
    }
    return collectModalVoucher ? collectModalVoucher.netDue : 0;
  }, [collectItems, collectModalVoucher, roundingEnabled, roundingMultiple]);

  const collectDynamicRemaining = useMemo(() => {
    if (!collectModalVoucher) return 0;
    return Math.max(0, collectDynamicNetDue - collectModalVoucher.amountPaid);
  }, [collectDynamicNetDue, collectModalVoucher]);

  // Selected Student
  const currentStudent = students.find((s) => s.id === selectedStudentId);

  // The ledger shows a student's complete history; closed (locked) months are
  // loaded on demand.
  useEffect(() => {
    if (selectedStudentId) void ensureStudentHistory(selectedStudentId);
  }, [selectedStudentId, ensureStudentHistory]);
  const currentClass = currentStudent ? classes.find((c) => c.id === currentStudent.classId) : undefined;

  // Filtered Students for Combobox
  const filteredStudentsList = useMemo(() => {
    if (!studentSearch.trim()) return students.slice(0, 30);
    const q = studentSearch.toLowerCase().trim();
    return students
      .filter(
        (s) =>
          s.regNo.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.fatherName.toLowerCase().includes(q) ||
          classes.find((c) => c.id === s.classId)?.name.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [students, studentSearch, classes]);

  // Student Vouchers
  const studentVouchers = useMemo(() => {
    if (!selectedStudentId) return [];
    return vouchers.filter((v) => v.studentId === selectedStudentId && v.status !== 'Reversed');
  }, [vouchers, selectedStudentId]);

  // Student Transactions
  const studentTransactions = useMemo(() => {
    if (!selectedStudentId) return [];
    return transactions.filter((t) => t.studentId === selectedStudentId);
  }, [transactions, selectedStudentId]);

  // Build Ledger Entries
  const ledgerEntries = useMemo(() => {
    const rawList = studentVouchers.map((v) => {
      const vTxns = studentTransactions.filter((t) => t.voucherId === v.id);
      const latestTxn = vTxns.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0];

      // Authoritative deposit from active transactions; resets to 0 if transactions are deleted
      const txnsDeposit = vTxns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const effectiveDeposit = vTxns.length > 0 ? txnsDeposit : (v.status === 'Carried' ? (v.amountPaid || 0) : 0);

      const balance = Math.max(0, v.netDue - effectiveDeposit);
      const isPaid = v.status === 'Paid' || (v.netDue > 0 && effectiveDeposit >= v.netDue);
      const isPartial = v.status === 'Partial' || (effectiveDeposit > 0 && effectiveDeposit < v.netDue);
      const isUnpaid = !isPaid && !isPartial;

      let effectiveStatus = v.status;
      if (isPaid) effectiveStatus = 'Paid';
      else if (isPartial) effectiveStatus = 'Partial';
      else if (isUnpaid) effectiveStatus = 'Issued';

      return {
        voucher: v,
        month: v.month,
        monthLabel: formatMonthName(v.month),
        voucherNo: v.voucherNo,
        collectionDate: latestTxn ? latestTxn.date : isPaid ? v.createdDate : '—',
        txnNo: latestTxn ? latestTxn.txnNo : vTxns.length > 0 ? `${vTxns.length} Txns` : '—',
        paymentMode: latestTxn ? latestTxn.paymentMode : vTxns[0]?.paymentMode || '',
        referenceNo: latestTxn?.referenceNo || '',
        total: v.netDue,
        deposit: effectiveDeposit,
        balance,
        status: effectiveStatus,
        txns: vTxns,
        dueDate: v.dueDate,
      };
    });

    // Sort
    rawList.sort((a, b) => {
      const comp = a.month.localeCompare(b.month);
      return sortOrder === 'desc' ? -comp : comp;
    });

    // Filter
    return rawList
      .filter((item) => {
        if (statusFilter === 'Paid') return item.status === 'Paid';
        if (statusFilter === 'Partial') return item.status === 'Partial';
        if (statusFilter === 'Unpaid') return item.status !== 'Paid';
        return true;
      })
      .filter((item) => {
        if (!tableSearch.trim()) return true;
        const q = tableSearch.toLowerCase();
        return (
          item.monthLabel.toLowerCase().includes(q) ||
          item.voucherNo.toLowerCase().includes(q) ||
          item.txnNo.toLowerCase().includes(q) ||
          item.collectionDate.includes(q) ||
          item.paymentMode.toLowerCase().includes(q)
        );
      })
      .map((item, index) => ({
        ...item,
        serialNo: index + 1,
      }));
  }, [studentVouchers, studentTransactions, sortOrder, statusFilter, tableSearch]);

  // Overall Financial Totals
  const totalBilled = studentVouchers.reduce((s, v) => s + v.netDue, 0);
  const totalDeposited = ledgerEntries.reduce((s, e) => s + e.deposit, 0);
  const totalBalance = Math.max(0, totalBilled - totalDeposited);
  const recoveryRate = totalBilled > 0 ? Math.round((totalDeposited / totalBilled) * 100) : 0;
  const unpaidCount = ledgerEntries.filter((e) => e.total > e.deposit).length;

  // Overdue months analysis: only open (not yet carried-forward) balances count.
  const studentArrears = useMemo(
    () => getStudentArrears(studentVouchers, selectedStudentId),
    [studentVouchers, selectedStudentId]
  );
  const nonZeroDueMonthsCount = studentArrears.arrearsMonths.length;
  const oldestOverdueMonth = studentArrears.oldestOpenMonth || null;

  // Availability of ledger records for action buttons
  const hasLedgerRecords = Boolean(currentStudent && ledgerEntries.length > 0);

  // 1. Copy to Clipboard (Tab-separated for Excel / Google Sheets)
  const handleCopyToClipboard = () => {
    if (!currentStudent) {
      showToast('Please select a student first.', 'info');
      return;
    }
    if (ledgerEntries.length === 0) {
      showToast('No billing or collection records found for this student.', 'info');
      return;
    }

    const headers = [
      'Sr #',
      'Fee Month',
      'Voucher #',
      'Collection Date',
      'Receipt / Txn #',
      'Payment Mode',
      `Total (${getCurrencyCode()})`,
      `Deposit (${getCurrencyCode()})`,
      `Balance (${getCurrencyCode()})`,
      'Status',
    ];

    const rows = ledgerEntries.map((e) => [
      e.serialNo,
      e.monthLabel,
      e.voucherNo,
      e.collectionDate,
      e.txnNo,
      e.paymentMode || '—',
      e.total,
      e.deposit,
      e.balance,
      e.status,
    ]);

    const titleInfo = `FEE COLLECTIONS LEDGER - ${currentStudent.name} (Reg #: ${currentStudent.regNo}) - Class: ${currentClass?.name || 'N/A'}\nTotal Billed: ${formatCurrency(totalBilled)} | Total Deposited: ${formatCurrency(totalDeposited)} | Outstanding Balance: ${formatCurrency(totalBalance)}\n\n`;

    const textContent =
      titleInfo +
      [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n') +
      `\n\tTOTAL\t\t\t\t\t${totalBilled}\t${totalDeposited}\t${totalBalance}\t`;

    navigator.clipboard.writeText(textContent);
    setCopiedToast(true);
    showToast('Student fee ledger copied to clipboard.', 'success');
    setTimeout(() => setCopiedToast(false), 3500);
  };

  // 2. Export Excel / CSV
  const handleExportCsv = () => {
    if (!currentStudent) {
      showToast('Please select a student first.', 'info');
      return;
    }
    if (ledgerEntries.length === 0) {
      showToast('No billing or collection records found for this student.', 'info');
      return;
    }

    const headers = [
      'Serial No',
      'Fee Month',
      CSV_VOUCHER_NO,
      'Collection Date',
      'Receipt / Txn No',
      'Payment Mode',
      CSV_REFERENCE_NO,
      `Total Billed (${getCurrencyCode()})`,
      `Deposit Paid (${getCurrencyCode()})`,
      `Remaining Balance (${getCurrencyCode()})`,
      'Status',
    ];

    const rows = ledgerEntries.map((e) => [
      e.serialNo,
      `"${e.monthLabel}"`,
      `"${e.voucherNo}"`,
      `"${e.collectionDate}"`,
      `"${e.txnNo}"`,
      `"${e.paymentMode || ''}"`,
      `"${e.referenceNo || ''}"`,
      e.total,
      e.deposit,
      e.balance,
      `"${e.status}"`,
    ]);

    // Add totals row
    rows.push([
      '',
      '"TOTAL"',
      '""',
      '""',
      '""',
      '""',
      '""',
      totalBilled,
      totalDeposited,
      totalBalance,
      '""',
    ]);

    const cleanReg = currentStudent.regNo.replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadCsv(
      `Fee_Collections_${cleanReg}_${new Date().toISOString().split('T')[0]}.csv`,
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    );
    showToast('Student fee ledger exported to CSV.', 'success');
  };

  // 3. Export PDF
  const handleExportPdf = async () => {
    if (!currentStudent) {
      showToast('Please select a student first.', 'info');
      return;
    }
    if (ledgerEntries.length === 0) {
      showToast('No billing or collection records found for this student.', 'info');
      return;
    }
    try {
      setIsExportingPdf(true);
      const context = { institute, bankAccounts, students, classes, templates, roundingMultiple: roundingEnabled ? roundingMultiple : 1 };
      await exportStudentFeeLedgerPdf(currentStudent, currentClass, ledgerEntries, context);
      showToast('Student fee ledger PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error('Failed to export student fee ledger PDF:', err);
      showToast('Failed to generate PDF. Please try again.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // 4. Quick Print (Prints the dedicated clean PDF ledger layout directly)
  const handlePrint = async () => {
    if (!currentStudent) {
      showToast('Please select a student first.', 'info');
      return;
    }
    if (ledgerEntries.length === 0) {
      showToast('No billing or collection records found for this student.', 'info');
      return;
    }
    try {
      setIsPrinting(true);
      const context = { institute, bankAccounts, students, classes, templates, roundingMultiple: roundingEnabled ? roundingMultiple : 1 };
      await printStudentFeeLedgerPdf(currentStudent, currentClass, ledgerEntries, context);
    } catch (err) {
      console.error('Failed to print student fee ledger:', err);
      showToast('Failed to open print preview. Please try again.', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  // Direct Collection Handler
  const handleOpenCollectModal = (voucher: FeeVoucher) => {
    setCollectModalVoucher(voucher);
    setCollectItems(voucher.particulars.map((p) => ({ ...p })));
    const rem = Math.max(0, voucher.netDue - voucher.amountPaid);
    setCollectAmount(rem > 0 ? rem : voucher.netDue);
    setCollectMode(DEFAULT_PAYMENT_MODE);
    setCollectRef('');
    setCollectDate(new Date().toISOString().split('T')[0]);
    setCollectNotes(`Direct student ledger collection for ${voucher.voucherNo}`);
  };

  const handleSaveLineItemsOnly = () => {
    if (!collectModalVoucher) return;
    const res = updateVoucherParticulars(collectModalVoucher.id, collectItems);
    if (res.success) {
      showToast('Voucher line items and totals updated successfully!', 'success');
      if (res.voucher) {
        setCollectModalVoucher(res.voucher);
      }
    } else {
      showToast(res.error || 'Failed to update voucher particulars', 'error');
    }
  };

  const handleSaveCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectModalVoucher) return;
    const amt = typeof collectAmount === 'string' ? parseFloat(collectAmount) : collectAmount;
    if (isNaN(amt) || amt <= 0) {
      showToast('Please enter a valid collection deposit amount.', 'error');
      return;
    }

    const res = collectVoucherPayment(
      collectModalVoucher.id,
      amt,
      collectMode,
      collectRef || undefined,
      collectNotes || undefined,
      collectDate,
      collectItems
    );

    if (res.success) {
      showToast(`Deposit of ${formatCurrency(amt)} recorded successfully.`, 'success');
      setCollectModalVoucher(null);
    } else {
      showToast(res.error || 'Failed to collect payment.', 'error');
    }
  };

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <History className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Student Fee Collections & Billing Ledger
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete financial audit trail, monthly vouchers, collection dates, deposits, and outstanding balances for any registered student.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Student Combobox / Quick Selector */}
          <div className="relative w-full sm:w-80">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Reg #, Name, Class..."
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                className="w-full pl-9.5 pr-8 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition"
              />
              {studentSearch || selectedStudentId ? (
                <button
                  type="button"
                  onClick={() => {
                    setStudentSearch('');
                    setSelectedStudentId('');
                    setIsDropdownOpen(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear selection"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              )}
            </div>

            {/* Autocomplete Dropdown */}
            {isDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {filteredStudentsList.length > 0 ? (
                    filteredStudentsList.map((s) => {
                      const cls = classes.find((c) => c.id === s.classId);
                      const isSel = s.id === selectedStudentId;
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSelectedStudentId(s.id);
                            setStudentSearch(`${s.name} (${s.regNo})`);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full text-left p-2.5 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer ${
                            isSel ? 'bg-teal-50/70 font-bold' : ''
                          }`}
                        >
                          <StudentAvatar photoUrl={s.photoUrl} name={s.name} size="xs" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {s.name}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                                {s.regNo}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 truncate block">
                              {cls?.name || 'Class'} &bull; {s.fatherName}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-xs text-slate-400 italic">
                      No matching student found.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Header Action Buttons for Export PDF & Print Ledger */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-ledger-header-export-pdf"
              type="button"
              onClick={handleExportPdf}
              disabled={!hasLedgerRecords || isExportingPdf || isPrinting}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition ${
                !hasLedgerRecords
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
              }`}
              title={
                !currentStudent
                  ? 'Select a student to export PDF ledger'
                  : !hasLedgerRecords
                  ? 'No fee or collection records available for this student'
                  : 'Export official printable PDF statement'
              }
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
              ) : (
                <FileText className="w-4 h-4 text-teal-400" />
              )}
              <span>{isExportingPdf ? 'Exporting...' : 'Export PDF'}</span>
            </button>

            <button
              id="btn-ledger-header-print"
              type="button"
              onClick={handlePrint}
              disabled={!hasLedgerRecords || isPrinting || isExportingPdf}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition ${
                !hasLedgerRecords
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-teal-700 hover:bg-teal-800 text-white cursor-pointer'
              }`}
              title={
                !currentStudent
                  ? 'Select a student to print ledger statement'
                  : !hasLedgerRecords
                  ? 'No fee or collection records available for this student'
                  : 'Print official clean ledger statement'
              }
            >
              {isPrinting ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>{isPrinting ? 'Preparing...' : 'Print Ledger'}</span>
            </button>
          </div>
        </div>
      </div>

      {currentStudent ? (
        <>
          {/* Selected Student Banner & Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            {/* Dedicated Print Only Header */}
            <div className="hidden print:block mb-4 border-b border-slate-300 pb-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {institute.logoUrl && (
                    <img
                      src={institute.logoUrl}
                      alt={institute.name}
                      className="w-12 h-12 object-contain rounded-lg border border-slate-200 shrink-0"
                    />
                  )}
                  <div>
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-wide">
                      {institute.name || 'INSTITUTE NAME'}
                    </h1>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {[
                        institute.address,
                        institute.phone ? `Phone: ${institute.phone}` : '',
                        institute.email ? `Email: ${institute.email}` : '',
                        institute.regNo ? `Reg #: ${institute.regNo}` : '',
                      ]
                        .filter(Boolean)
                        .join('  •  ')}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-teal-800 uppercase tracking-wider block">
                    STUDENT FEE COLLECTIONS & BILLING LEDGER
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Generated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <StudentAvatar
                  photoUrl={currentStudent.photoUrl}
                  name={currentStudent.name}
                  size="md"
                />
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900">{currentStudent.name}</h3>
                    <span className="bg-teal-100 text-teal-800 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md">
                      Reg #: {currentStudent.regNo}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        currentStudent.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : currentStudent.status === 'Graduated'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {currentStudent.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mt-1 flex-wrap font-medium">
                    <span>
                      <strong className="text-slate-700">Class:</strong>{' '}
                      {currentClass?.name || 'Unassigned'}
                    </span>
                    <span>&bull;</span>
                    <span>
                      <strong className="text-slate-700">Father:</strong>{' '}
                      {currentStudent.fatherName}
                    </span>
                    <span>&bull;</span>
                    <span>
                      <strong className="text-slate-700">Phone:</strong>{' '}
                      {currentStudent.fatherPhone || 'N/A'}
                    </span>
                    {currentStudent.dob && (
                      <>
                        <span>&bull;</span>
                        <span>
                          <strong className="text-slate-700">DOB & Age:</strong>{' '}
                          {currentStudent.dob}{' '}
                          <span className="text-teal-700 font-semibold bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200/60">
                            {formatStudentAge(currentStudent.dob, 'full')}
                          </span>
                        </span>
                      </>
                    )}
                    {currentStudent.monthlyDiscount > 0 && (
                      <>
                        <span>&bull;</span>
                        <span className="text-emerald-700 font-bold">
                          Discount: {formatCurrency(currentStudent.monthlyDiscount)}/mo
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Clipboard, Excel, PDF, Print */}
              <div className="flex items-center gap-2 flex-wrap print:hidden">
                <button
                  type="button"
                  id="btn-ledger-copy-clipboard"
                  onClick={handleCopyToClipboard}
                  disabled={!hasLedgerRecords}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                  title={
                    !hasLedgerRecords
                      ? 'No fee or collection records available to copy'
                      : 'Copy formatted ledger to clipboard for Excel / Sheets'
                  }
                >
                  {copiedToast ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <ClipboardCopy className="w-4 h-4 text-slate-500" />
                      <span>Copy to Clipboard</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  id="btn-ledger-export-excel"
                  onClick={handleExportCsv}
                  disabled={!hasLedgerRecords}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 hover:border-emerald-300 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                  title={
                    !hasLedgerRecords
                      ? 'No fee or collection records available to export'
                      : 'Download as Excel CSV'
                  }
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Export Excel</span>
                </button>

                <button
                  type="button"
                  id="btn-ledger-export-pdf"
                  onClick={handleExportPdf}
                  disabled={!hasLedgerRecords || isExportingPdf || isPrinting}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-900"
                  title={
                    !hasLedgerRecords
                      ? 'No fee or collection records available for this student'
                      : 'Export official printable PDF statement'
                  }
                >
                  {isExportingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                  ) : (
                    <FileText className="w-4 h-4 text-teal-400" />
                  )}
                  <span>{isExportingPdf ? 'Exporting...' : 'Export PDF'}</span>
                </button>

                <button
                  type="button"
                  id="btn-ledger-print"
                  onClick={handlePrint}
                  disabled={!hasLedgerRecords || isPrinting || isExportingPdf}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-teal-700"
                  title={
                    !hasLedgerRecords
                      ? 'No fee or collection records available for this student'
                      : 'Print official clean ledger statement'
                  }
                >
                  {isPrinting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  <span>{isPrinting ? 'Preparing...' : 'Print Ledger'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Financial Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Lifetime Billed
              </span>
              <span className="text-xl font-black text-slate-900 mt-1 block">
                {formatCurrency(totalBilled)}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                Across {studentVouchers.length} billing cycle(s)
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Total Deposited / Paid
              </span>
              <span className="text-xl font-black text-emerald-700 mt-1 block">
                {formatCurrency(totalDeposited)}
              </span>
              <span className="text-[11px] text-emerald-600/80 font-medium">
                {studentTransactions.length} payment transaction(s)
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">
                Outstanding Balance
              </span>
              <span
                className={`text-xl font-black mt-1 block ${
                  totalBalance > 0 ? 'text-rose-600' : 'text-emerald-700'
                }`}
              >
                {formatCurrency(totalBalance)}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                {unpaidCount > 0 ? `${unpaidCount} unpaid/partial voucher(s)` : 'All fees settled!'}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider block">
                Settlement Rate
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-black text-teal-800">{recoveryRate}%</span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {totalDeposited >= totalBilled && totalBilled > 0 ? '100% Cleared' : 'Recovery ratio'}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-teal-600 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, recoveryRate)}%` }}
                />
              </div>
            </div>

            {/* Box 5: Months with Non-Zero Due Balance (Arrears Streak) */}
            <div
              className={`p-4 rounded-2xl border shadow-xs transition ${
                nonZeroDueMonthsCount > 0
                  ? nonZeroDueMonthsCount >= 3
                    ? 'bg-rose-50/40 border-rose-200'
                    : 'bg-amber-50/40 border-amber-200'
                  : 'bg-emerald-50/30 border-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider block ${
                    nonZeroDueMonthsCount > 0
                      ? nonZeroDueMonthsCount >= 3
                        ? 'text-rose-700'
                        : 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  Unpaid Due Months
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    nonZeroDueMonthsCount > 0
                      ? nonZeroDueMonthsCount >= 3
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {nonZeroDueMonthsCount > 0
                    ? nonZeroDueMonthsCount >= 3
                      ? 'Arrears Streak'
                      : 'Pending'
                    : 'All Settled'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span
                  className={`text-xl font-black ${
                    nonZeroDueMonthsCount > 0
                      ? nonZeroDueMonthsCount >= 3
                        ? 'text-rose-600'
                        : 'text-amber-600'
                      : 'text-emerald-700'
                  }`}
                >
                  {nonZeroDueMonthsCount} {nonZeroDueMonthsCount === 1 ? 'Month' : 'Months'}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium block mt-0.5 truncate">
                {nonZeroDueMonthsCount > 0 && oldestOverdueMonth
                  ? `Due since ${formatMonthName(oldestOverdueMonth)}`
                  : 'Zero outstanding due cycles'}
              </span>
            </div>
          </div>

          {/* Table Toolbar & Search Filter */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/70 print:hidden">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Fee Collections & Billing Records ({ledgerEntries.length})
                </h4>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Search within ledger */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter month, voucher #, txn..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 w-48"
                  />
                </div>

                {/* Status Filter Buttons */}
                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-xs font-bold">
                  {(['ALL', 'Paid', 'Partial', 'Unpaid'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        statusFilter === st
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st === 'ALL' ? 'All' : st}
                    </button>
                  ))}
                </div>

                {/* Sort toggle */}
                <button
                  onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                  title="Toggle Chronological / Reverse Order"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
                </button>
              </div>
            </div>

            {/* Main Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-3 text-center w-12">Sr #</th>
                    <th className="p-3">Fee Month</th>
                    <th className="p-3">Voucher #</th>
                    <th className="p-3">Collection Date</th>
                    <th className="p-3">Receipt / Txn #</th>
                    <th className="p-3 text-right">Total ({getCurrencyCode()})</th>
                    <th className="p-3 text-right">Deposit ({getCurrencyCode()})</th>
                    <th className="p-3 text-right">Balance ({getCurrencyCode()})</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center print:hidden">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledgerEntries.length > 0 ? (
                    ledgerEntries.map((entry) => {
                      return (
                        <tr key={entry.voucher.id} className="hover:bg-slate-50/80 transition">
                          {/* Serial # */}
                          <td className="p-3 text-center font-bold text-slate-400">
                            {entry.serialNo}
                          </td>

                          {/* Fee Month */}
                          <td className="p-3 font-bold text-slate-900">
                            <span className="block">{entry.monthLabel}</span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Due: {entry.dueDate}
                            </span>
                          </td>

                          {/* Voucher # */}
                          <td className="p-3 font-mono font-bold text-teal-700">
                            {entry.voucherNo}
                          </td>

                          {/* Collection Date */}
                          <td className="p-3 font-medium text-slate-700">
                            {entry.collectionDate !== '—' ? (
                              <span className="font-semibold text-slate-900">
                                {entry.collectionDate}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Pending</span>
                            )}
                          </td>

                          {/* Receipt / Txn # */}
                          <td className="p-3">
                            {entry.txnNo !== '—' ? (
                              <div>
                                <span className="font-mono font-bold text-slate-800 block text-[11px]">
                                  {entry.txnNo}
                                </span>
                                {entry.paymentMode && (
                                  <span className="inline-block text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded mt-0.5">
                                    {paymentModeText(entry.paymentMode)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>

                          {/* Total */}
                          <td className="p-3 text-right font-bold text-slate-900">
                            {formatCurrency(entry.total)}
                          </td>

                          {/* Deposit */}
                          <td className="p-3 text-right font-bold text-emerald-700">
                            {entry.deposit > 0 ? (
                              formatCurrency(entry.deposit)
                            ) : (
                              <span className="text-slate-400 font-normal">—</span>
                            )}
                          </td>

                          {/* Balance */}
                          <td className="p-3 text-right font-bold">
                            {entry.balance === 0 ? (
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                                {formatCurrency(0)}
                              </span>
                            ) : (
                              <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded">
                                {formatCurrency(entry.balance)}
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="p-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10.5px] ${
                                entry.status === 'Paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : entry.status === 'Partial'
                                  ? 'bg-amber-100 text-amber-800'
                                  : entry.status === 'Carried'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {entry.status}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="p-3 text-center print:hidden">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* View / Print Voucher */}
                              <button
                                onClick={() => setSelectedVoucherForPrint(entry.voucher)}
                                className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition cursor-pointer"
                                title="View & Print Fee Voucher"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Quick Collect Deposit (if allowed) */}
                              {(hasPermission('fees.collect') || hasPermission('fees.edit')) &&
                                entry.voucher.status !== 'Carried' &&
                                entry.voucher.status !== 'Reversed' && (
                                <button
                                  onClick={() => handleOpenCollectModal(entry.voucher)}
                                  className={`px-2 py-1 rounded-lg font-bold text-[11px] shadow-2xs transition flex items-center gap-1 cursor-pointer ${
                                    entry.balance <= 0
                                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  }`}
                                  title={entry.balance <= 0 ? 'Record Additional / Advance Deposit' : 'Deposit fee payment'}
                                >
                                  <Wallet className="w-3 h-3" />
                                  <span>Deposit</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="p-10 text-center text-slate-400 italic">
                        No billing or collection records found for this student.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Table Footer */}
                {ledgerEntries.length > 0 && (
                  <tfoot className="bg-slate-900 text-white font-bold border-t border-slate-800">
                    <tr>
                      <td colSpan={5} className="p-3 font-bold text-xs uppercase tracking-wider">
                        TOTAL STATEMENT SUMMARY:
                      </td>
                      <td className="p-3 text-right text-teal-300 text-xs">
                        {formatCurrency(totalBilled)}
                      </td>
                      <td className="p-3 text-right text-emerald-400 text-xs">
                        {formatCurrency(totalDeposited)}
                      </td>
                      <td className="p-3 text-right text-rose-300 text-xs">
                        {formatCurrency(totalBalance)}
                      </td>
                      <td colSpan={2} className="p-3 text-center text-amber-300 text-xs">
                        {recoveryRate}% Collected
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Dedicated Printable Signatures Footer */}
          <div className="hidden print:flex justify-between items-end mt-12 pt-8 text-xs text-slate-700 break-inside-avoid">
            <div className="text-center w-52 border-t border-slate-400 pt-1.5 font-medium">
              Prepared / Verified By
            </div>
            <div className="text-center w-52 border-t border-slate-400 pt-1.5 font-medium">
              Authorized Signatory / Stamp
            </div>
          </div>

          {/* Individual Payment Transactions History (Collapsible / Information) */}
          {studentTransactions.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3 print:hidden">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-teal-600" />
                  Detailed Payment Transactions Log ({studentTransactions.length})
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {studentTransactions.map((txn) => {
                  const matchedVoucher = vouchers.find((v) => v.id === txn.voucherId);
                  return (
                    <div
                      key={txn.id}
                      className="p-3.5 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/80 rounded-xl text-xs space-y-2 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900">{txn.txnNo}</span>
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">
                          {paymentModeText(txn.paymentMode)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>Date: {txn.date}</span>
                        <span className="font-bold text-emerald-700 text-sm">
                          {formatCurrency(txn.amount)}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-200/60 pt-1.5">
                        <span>Voucher: {matchedVoucher?.voucherNo || txn.voucherId}</span>
                        {txn.referenceNo && <span>Ref: {txn.referenceNo}</span>}
                      </div>

                      {txn.notes && (
                        <p className="text-[10px] text-slate-400 italic">{txn.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white p-8 sm:p-12 rounded-2xl border border-slate-200/80 shadow-xs text-center space-y-6">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto text-teal-600 shadow-2xs">
              <Search className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              Select a Student to View Ledger
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Use the search bar above to look up any student by <span className="font-semibold text-slate-700">Registration #</span> (e.g. REG-1001), <span className="font-semibold text-slate-700">Student Name</span>, <span className="font-semibold text-slate-700">Father Name</span>, or <span className="font-semibold text-slate-700">Class</span>.
            </p>
          </div>

          {students.length > 0 && (
            <div className="max-w-2xl mx-auto pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">
                Quick Select Registered Students
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {students.slice(0, 6).map((s) => {
                  const cls = classes.find((c) => c.id === s.classId);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(s.id);
                        setStudentSearch(`${s.name} (${s.regNo})`);
                      }}
                      className="p-2.5 rounded-xl border border-slate-200 hover:border-teal-500/50 hover:bg-teal-50/30 text-left transition cursor-pointer flex items-center gap-2.5 group"
                    >
                      <StudentAvatar photoUrl={s.photoUrl} name={s.name} size="xs" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-800 group-hover:text-teal-700 truncate">
                            {s.name}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-teal-600 bg-teal-50 px-1 rounded shrink-0">
                            {s.regNo}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 truncate block">
                          {cls?.name || 'Class'} &bull; {s.fatherName}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* View & Print Voucher Modal */}
      {selectedVoucherForPrint && (
        <PrintVoucherModal
          voucher={selectedVoucherForPrint}
          onClose={() => setSelectedVoucherForPrint(null)}
        />
      )}

      {/* Direct Deposit Collection Modal */}
      {collectModalVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:hidden">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-3 sm:p-5 shadow-2xl space-y-3 my-auto animate-in fade-in duration-200 border border-slate-200/80 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 shrink-0">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                  <Wallet className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">Record Fee Collection Deposit</h3>
                    <span className="font-mono font-bold text-[11px] sm:text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                      {collectModalVoucher.voucherNo}
                    </span>
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        collectModalVoucher.status === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : collectModalVoucher.status === 'Partial'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {collectModalVoucher.status}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate hidden xs:block">
                    Record fee deposit against voucher &bull; {formatMonthName(collectModalVoucher.month)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCollectModalVoucher(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Student & Balance Ribbon in Header */}
            <div className="bg-slate-50/90 rounded-xl p-2.5 sm:px-3 sm:py-2 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
              {/* Student Info */}
              <div className="flex items-center gap-2.5 min-w-0">
                <StudentAvatar
                  photoUrl={currentStudent?.photoUrl}
                  name={currentStudent?.name || 'Student'}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                      {currentStudent?.name || 'Unknown Student'}
                    </h4>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-mono flex items-center gap-1 sm:gap-1.5 flex-wrap">
                    <span className="font-semibold">{collectModalVoucher.voucherNo}</span>
                    {currentStudent?.regNo && (
                      <>
                        <span>&bull;</span>
                        <span>Reg: {currentStudent.regNo}</span>
                      </>
                    )}
                    <span>&bull;</span>
                    <span>{formatMonthName(collectModalVoucher.month)}</span>
                  </p>
                </div>
              </div>

              {/* 3 Metric Pills */}
              <div className="grid grid-cols-3 gap-1 sm:gap-1.5 font-mono text-center shrink-0">
                <div className="bg-white px-1.5 sm:px-2 py-1 rounded-md border border-slate-200 min-w-0">
                  <div className="text-[8px] sm:text-[9px] text-slate-500 font-sans font-medium">Original Due</div>
                  <div className="font-bold text-slate-800 text-[10px] sm:text-xs truncate">
                    {formatCurrency(collectModalVoucher.netDue)}
                  </div>
                </div>
                <div className="bg-white px-1.5 sm:px-2 py-1 rounded-md border border-slate-200 min-w-0">
                  <div className="text-[8px] sm:text-[9px] text-slate-500 font-sans font-medium">Already Paid</div>
                  <div className="font-bold text-emerald-700 text-[10px] sm:text-xs truncate">
                    {formatCurrency(collectModalVoucher.amountPaid)}
                  </div>
                </div>
                <div className="bg-emerald-50 px-1.5 sm:px-2 py-1 rounded-md border border-emerald-200 min-w-0">
                  <div className="text-[8px] sm:text-[9px] text-emerald-800 font-sans font-bold">
                    {collectModalVoucher.amountPaid >= collectDynamicNetDue ? 'Settlement' : 'Remaining'}
                  </div>
                  <div className="font-black text-emerald-800 text-[10px] sm:text-xs truncate">
                    {collectModalVoucher.amountPaid >= collectDynamicNetDue
                      ? `Fully Paid ${
                          collectModalVoucher.amountPaid > collectDynamicNetDue
                            ? `(+${formatCurrency(collectModalVoucher.amountPaid - collectDynamicNetDue)} Adv)`
                            : ''
                        }`
                      : formatCurrency(collectDynamicRemaining)}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content Grid: Left & Right Panes */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-3.5 items-stretch overflow-y-auto flex-1 min-h-0 pr-0.5">
              {/* Left Pane: Particulars Editor */}
              <div className="lg:col-span-6 flex flex-col min-h-[220px] lg:h-full lg:min-h-0">
                <VoucherParticularsEditor
                  compact={true}
                  items={collectItems}
                  onChange={(updated) => {
                    setCollectItems(updated);
                    const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, collectModalVoucher?.roundingMultiple);
                    const newNet = Math.max(0, roundUpToMultiple(updated.reduce((s, p) => s + (Number(p.amount) || 0), 0), mult));
                    const newRem = Math.max(0, newNet - (collectModalVoucher.amountPaid || 0));
                    if (Number(collectAmount) === collectDynamicRemaining && newRem >= 0) {
                      setCollectAmount(newRem);
                    }
                  }}
                  originalItems={collectModalVoucher.particulars}
                  onResetToOriginal={() => {
                    setCollectItems(collectModalVoucher.particulars.map((p) => ({ ...p })));
                    const rem = Math.max(0, collectModalVoucher.netDue - collectModalVoucher.amountPaid);
                    setCollectAmount(rem > 0 ? rem : collectModalVoucher.netDue);
                  }}
                  onSaveLineItems={handleSaveLineItemsOnly}
                  amountPaid={collectModalVoucher.amountPaid}
                  studentId={collectModalVoucher.studentId}
                />
              </div>

              {/* Right Pane: Collection Form */}
              <div className="lg:col-span-6 flex flex-col min-h-[260px] lg:h-full lg:min-h-0 w-full">
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs flex flex-col w-full h-full">
                  {/* Header Bar */}
                  <div className="bg-slate-50 border-b border-slate-200 px-2.5 py-1.5 sm:px-3 sm:py-2 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-bold text-xs text-slate-800">Deposit & Payment Details</span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-500 font-mono">
                      {formatMonthName(collectModalVoucher.month)}
                    </span>
                  </div>

                  {/* Form Content */}
                  <form onSubmit={handleSaveCollection} className="flex flex-col justify-between flex-1 min-h-0 text-xs">
                    <div className="p-3 sm:p-3.5 overflow-y-auto flex-1 space-y-2.5 bg-slate-50/40">
                      {/* Amount Section */}
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                          <label className="font-bold text-slate-700 text-[11px] block">
                            Deposit Amount to Collect ({getCurrencyCode()}) *
                          </label>
                          {collectDynamicRemaining > 0 ? (
                            <button
                              type="button"
                              onClick={() => setCollectAmount(collectDynamicRemaining)}
                              className="text-[10px] sm:text-[11px] text-teal-600 hover:text-teal-800 font-bold hover:underline cursor-pointer"
                            >
                              Auto-fill Remaining ({formatCurrency(collectDynamicRemaining)})
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCollectAmount(collectDynamicNetDue)}
                              className="text-[10px] sm:text-[11px] text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer"
                            >
                              Fill Voucher Fee ({formatCurrency(collectDynamicNetDue)})
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">{getCurrencyCode()}</span>
                          <input
                            type="number"
                            required
                            min={1}
                            value={collectAmount}
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            onChange={(e) => setCollectAmount(e.target.value)}
                            className="w-full h-[38px] pl-12 pr-3 bg-white border border-slate-200 rounded-lg font-bold text-sm text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            placeholder="Enter Amount"
                          />
                        </div>

                        {/* Quick suggestion chips */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {collectDynamicRemaining > 0 ? (
                            <button
                              type="button"
                              onClick={() => setCollectAmount(collectDynamicRemaining)}
                              className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-md text-[10px] font-bold transition cursor-pointer"
                            >
                              Full Balance: {formatCurrency(collectDynamicRemaining)}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCollectAmount(collectDynamicNetDue)}
                              className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-md text-[10px] font-bold transition cursor-pointer"
                            >
                              Fill Fee: {formatCurrency(collectDynamicNetDue)}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setCollectAmount(collectDynamicNetDue)}
                            className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md text-[10px] font-semibold transition cursor-pointer"
                          >
                            Net Due: {formatCurrency(collectDynamicNetDue)}
                          </button>
                        </div>
                      </div>

                      {/* Payment Mode & Date */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1 text-[11px]">Payment Mode *</label>
                          <select
                            value={collectMode}
                            onChange={(e) =>
                              setCollectMode(e.target.value as PaymentTransaction['paymentMode'])
                            }
                            className="w-full h-[38px] px-2.5 bg-white border border-slate-200 rounded-lg font-semibold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          >
                            <option value="SchoolCashier">School Cashier</option>
                            <option value="BankDeposit">Bank Deposit</option>
                            <option value="OnlineTransfer">Online Transfer</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1 text-[11px]">Collection Date *</label>
                          <DatePicker
                            value={collectDate}
                            required
                            themeColor={themeConfig?.color || 'teal'}
                            onChange={(newDate) => setCollectDate(newDate)}
                            idPrefix="ledger-collect-date"
                            placeholder="Select Collection Date"
                            className="w-full"
                          />
                        </div>
                      </div>

                      {/* Compacted Bank Ref & Notes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                            Bank Ref / Slip #
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. TR-98231"
                            value={collectRef}
                            onChange={(e) => setCollectRef(e.target.value)}
                            className="w-full h-[38px] px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1 text-[11px]">Notes (Optional)</label>
                          <input
                            type="text"
                            placeholder="Additional remarks..."
                            value={collectNotes}
                            onChange={(e) => setCollectNotes(e.target.value)}
                            className="w-full h-[38px] px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Modal Footer Controls */}
                    <div className="bg-slate-50 border-t border-slate-200 p-2.5 sm:px-3 sm:py-2.5 flex items-center justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setCollectModalVoucher(null)}
                        className="px-3.5 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer text-xs font-semibold transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!collectAmount || Number(collectAmount) <= 0}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs transition cursor-pointer text-xs disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm Deposit ({collectAmount ? formatCurrency(Number(collectAmount)) : formatCurrency(0)})</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
