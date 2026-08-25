import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { FeeVoucher, PaymentTransaction, Student, VoucherItem } from '../types';
import { formatCurrency, formatMonthName, formatStudentAge, calculateAge } from '../utils/feeMath';
import { exportStudentFeeLedgerPdf, printStudentFeeLedgerPdf } from '../utils/pdfGenerator';
import { StudentAvatar } from './StudentAvatar';
import { PrintVoucherModal } from './PrintVoucherModal';
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
    institute,
    bankAccounts,
    templates,
    collectVoucherPayment,
    updateVoucherParticulars,
    hasPermission,
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
  const [collectModalVoucher, setCollectModalVoucher] = useState<FeeVoucher | null>(null);
  const [collectAmount, setCollectAmount] = useState<number | string>('');
  const [collectMode, setCollectMode] = useState<PaymentTransaction['paymentMode']>('Cash');
  const [collectRef, setCollectRef] = useState('');
  const [collectDate, setCollectDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectNotes, setCollectNotes] = useState('');
  const [collectItems, setCollectItems] = useState<VoucherItem[]>([]);
  const [activeTxnDetail, setActiveTxnDetail] = useState<PaymentTransaction | null>(null);

  // Dynamic calculations for the collect modal
  const collectDynamicNetDue = useMemo(() => {
    if (collectItems.length > 0) {
      return Math.max(0, collectItems.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
    }
    return collectModalVoucher ? collectModalVoucher.netDue : 0;
  }, [collectItems, collectModalVoucher]);

  const collectDynamicRemaining = useMemo(() => {
    if (!collectModalVoucher) return 0;
    return Math.max(0, collectDynamicNetDue - collectModalVoucher.amountPaid);
  }, [collectDynamicNetDue, collectModalVoucher]);

  // Selected Student
  const currentStudent = students.find((s) => s.id === selectedStudentId);
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

      const balance = Math.max(0, v.netDue - v.amountPaid);
      const isPaid = v.status === 'Paid' || (v.netDue > 0 && v.amountPaid >= v.netDue);
      const isPartial = v.status === 'Partial' || (v.amountPaid > 0 && v.amountPaid < v.netDue);
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
        deposit: v.amountPaid,
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
  const totalDeposited = studentVouchers.reduce((s, v) => s + v.amountPaid, 0);
  const totalBalance = Math.max(0, totalBilled - totalDeposited);
  const recoveryRate = totalBilled > 0 ? Math.round((totalDeposited / totalBilled) * 100) : 0;
  const unpaidCount = studentVouchers.filter((v) => v.netDue > v.amountPaid).length;

  // Overdue months analysis (non-zero due balance cycles)
  const overdueVouchers = useMemo(() => {
    return studentVouchers
      .filter((v) => Math.max(0, v.netDue - v.amountPaid) > 0)
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [studentVouchers]);

  const nonZeroDueMonthsCount = overdueVouchers.length;
  const oldestOverdueMonth = overdueVouchers.length > 0 ? overdueVouchers[0].month : null;

  // 1. Copy to Clipboard (Tab-separated for Excel / Google Sheets)
  const handleCopyToClipboard = () => {
    if (!currentStudent || ledgerEntries.length === 0) return;

    const headers = [
      'Sr #',
      'Fee Month',
      'Voucher #',
      'Collection Date',
      'Receipt / Txn #',
      'Payment Mode',
      'Total (Rs)',
      'Deposit (Rs)',
      'Balance (Rs)',
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

    const titleInfo = `FEE COLLECTIONS LEDGER - ${currentStudent.name} (Reg #: ${currentStudent.regNo}) - Class: ${currentClass?.name || 'N/A'}\nTotal Billed: Rs. ${totalBilled} | Total Deposited: Rs. ${totalDeposited} | Outstanding Balance: Rs. ${totalBalance}\n\n`;

    const textContent =
      titleInfo +
      [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n') +
      `\n\tTOTAL\t\t\t\t\t${totalBilled}\t${totalDeposited}\t${totalBalance}\t`;

    navigator.clipboard.writeText(textContent);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 3500);
  };

  // 2. Export Excel / CSV
  const handleExportCsv = () => {
    if (!currentStudent || ledgerEntries.length === 0) return;

    const headers = [
      'Serial No',
      'Fee Month',
      'Voucher No',
      'Collection Date',
      'Receipt / Txn No',
      'Payment Mode',
      'Reference No',
      'Total Billed (Rs)',
      'Deposit Paid (Rs)',
      'Remaining Balance (Rs)',
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

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const cleanReg = currentStudent.regNo.replace(/[^a-zA-Z0-9_-]/g, '_');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Fee_Collections_${cleanReg}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. Export PDF
  const handleExportPdf = async () => {
    if (!currentStudent || ledgerEntries.length === 0) return;
    const context = { institute, bankAccounts, students, classes, templates };
    await exportStudentFeeLedgerPdf(currentStudent, currentClass, ledgerEntries, context);
  };

  // 4. Quick Print (Prints the dedicated clean PDF ledger layout directly)
  const handlePrint = async () => {
    if (!currentStudent || ledgerEntries.length === 0) return;
    const context = { institute, bankAccounts, students, classes, templates };
    await printStudentFeeLedgerPdf(currentStudent, currentClass, ledgerEntries, context);
  };

  // Direct Collection Handler
  const handleOpenCollectModal = (voucher: FeeVoucher) => {
    setCollectModalVoucher(voucher);
    setCollectItems(voucher.particulars.map((p) => ({ ...p })));
    const rem = Math.max(0, voucher.netDue - voucher.amountPaid);
    setCollectAmount(rem > 0 ? rem : voucher.netDue);
    setCollectMode('Cash');
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
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
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

        {/* Student Combobox / Quick Selector */}
        <div className="relative w-full md:w-80">
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
                  onClick={handleCopyToClipboard}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                  title="Copy formatted ledger to clipboard for Excel / Sheets"
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
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 hover:border-emerald-300 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                  title="Download as Excel CSV"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Export Excel</span>
                </button>

                <button
                  onClick={handleExportPdf}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                  title="Export official printable PDF statement"
                >
                  <FileText className="w-4 h-4 text-teal-400" />
                  <span>Export PDF</span>
                </button>

                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                  title="Print official clean ledger statement"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Ledger</span>
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
                    <th className="p-3 text-right">Total (Rs)</th>
                    <th className="p-3 text-right">Deposit (Rs)</th>
                    <th className="p-3 text-right">Balance (Rs)</th>
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
                                    {entry.paymentMode}
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
                                Rs. 0
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
                              {hasPermission('vouchers:edit') && (
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
                          {txn.paymentMode}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:hidden">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl space-y-4 border border-slate-100 my-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Record Fee Collection Deposit</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Voucher: {collectModalVoucher.voucherNo} &bull; {formatMonthName(collectModalVoucher.month)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCollectModalVoucher(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Pane: Particulars Editor */}
              <div className="lg:col-span-6 space-y-2">
                <VoucherParticularsEditor
                  items={collectItems}
                  onChange={(updated) => {
                    setCollectItems(updated);
                    const newNet = Math.max(0, updated.reduce((s, p) => s + (Number(p.amount) || 0), 0));
                    const newRem = Math.max(0, newNet - (collectModalVoucher.amountPaid || 0));
                    if (Number(collectAmount) === collectDynamicRemaining && newRem > 0) {
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

              {/* Right Pane: Summary Card & Deposit Form */}
              <div className="lg:col-span-6 space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                {/* Summary Card */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-600 pb-1 border-b border-slate-100">
                    <span>Student:</span>
                    <span className="font-bold text-slate-900">{currentStudent?.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono">
                    <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                      <div className="text-[9px] text-slate-500 font-sans">Net Billed</div>
                      <div className="font-bold text-slate-800 text-xs">{formatCurrency(collectModalVoucher.netDue)}</div>
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                      <div className="text-[9px] text-slate-500 font-sans">Paid</div>
                      <div className="font-bold text-emerald-700 text-xs">{formatCurrency(collectModalVoucher.amountPaid)}</div>
                    </div>
                    <div className="bg-emerald-50/80 p-1.5 rounded border border-emerald-200">
                      <div className="text-[9px] text-emerald-800 font-sans font-bold">
                        {collectModalVoucher.amountPaid >= collectDynamicNetDue ? 'Settlement' : 'Remaining'}
                      </div>
                      <div className="font-black text-emerald-800 text-xs">
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

                <form onSubmit={handleSaveCollection} className="space-y-3 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 block">
                        Deposit Amount to Collect (Rs.) *
                      </label>
                      {collectDynamicRemaining > 0 ? (
                        <button
                          type="button"
                          onClick={() => setCollectAmount(collectDynamicRemaining)}
                          className="text-[11px] text-teal-600 hover:text-teal-800 font-bold hover:underline cursor-pointer"
                        >
                          Auto-fill Remaining ({formatCurrency(collectDynamicRemaining)})
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCollectAmount(collectDynamicNetDue)}
                          className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer"
                        >
                          Fill Voucher Fee ({formatCurrency(collectDynamicNetDue)})
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rs.</span>
                      <input
                        type="number"
                        required
                        min={1}
                        value={collectAmount}
                        onChange={(e) => setCollectAmount(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Payment Mode *</label>
                      <select
                        value={collectMode}
                        onChange={(e) =>
                          setCollectMode(e.target.value as PaymentTransaction['paymentMode'])
                        }
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs"
                      >
                        <option value="Cash">Cash</option>
                        <option value="BankTransfer">Bank Transfer</option>
                        <option value="Online">Online / Card</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Collection Date *</label>
                      <input
                        type="date"
                        required
                        value={collectDate}
                        onChange={(e) => setCollectDate(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Reference # / Cheque No / Bank Txn (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TR-98231"
                      value={collectRef}
                      onChange={(e) => setCollectRef(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="Additional remarks..."
                      value={collectNotes}
                      onChange={(e) => setCollectNotes(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setCollectModalVoucher(null)}
                      className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition cursor-pointer text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!collectAmount || Number(collectAmount) <= 0}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40 text-xs"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm Deposit ({collectAmount ? formatCurrency(Number(collectAmount)) : 'Rs. 0'})</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
