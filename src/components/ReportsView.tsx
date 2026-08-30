import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatMonthName, formatStudentAge } from '../utils/feeMath';
import { downloadCsv } from '../utils/csv';
import { StudentFeeLedger } from './StudentFeeLedger';
import { StudentAvatar } from './StudentAvatar';
import { DatePicker } from './DatePicker';
import {
  printOutstandingArrearsPdf,
  exportOutstandingArrearsPdf,
  OutstandingArrearsPdfRow,
  printFeeCollectionReportPdf,
  exportFeeCollectionReportPdf,
  FeeCollectionReportPdfRow,
} from '../utils/pdfGenerator';
import {
  BarChart3,
  BookMarked,
  History,
  CalendarRange,
  Layers,
  Search,
  Clock,
  AlertTriangle,
  Wallet,
  Users,
  Printer,
  FileText,
  HandCoins,
  FileDown,
  FileSpreadsheet,
  Download,
  CalendarDays,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  X,
  School,
  GraduationCap,
  TrendingUp,
} from 'lucide-react';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';

export interface ReportsViewProps {
  initialReportType?: 'feeCollection' | 'studentLedger' | 'outstanding';
  initialStudentId?: string;
  onReportTypeChange?: (type: 'feeCollection' | 'studentLedger' | 'outstanding') => void;
  onStudentIdChange?: (id: string | undefined) => void;
}

type FeeReportTab = 'quick' | 'dateRange' | 'classWise' | 'studentWise' | 'pending';

type QuickPeriod = 'today' | 'thisMonth' | 'lastMonth';

interface ReportRow {
  date: string;
  regNo: string;
  studentName: string;
  className: string;
  feeMonth: string;
  total: number;
  paid: number;
  balance: number;
}

const METRIC_LABELS: Record<FeeReportTab, string> = {
  quick: 'Fees collected (and relevant quick lists)',
  dateRange: 'Generate a fee collection report over a custom date range',
  classWise: 'Fee collection report filtered by class',
  studentWise: 'Fee collection report for a specific student',
  pending: 'Students with outstanding balances',
};

export const ReportsView: React.FC<ReportsViewProps> = ({
  initialReportType,
  initialStudentId,
  onReportTypeChange,
  onStudentIdChange,
}) => {
  const { activeMonth, classes, vouchers, students, institute, bankAccounts, transactions, themeConfig } = useApp();
  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  const [reportType, setReportType] = useState<'feeCollection' | 'studentLedger' | 'outstanding'>(
    initialReportType || 'feeCollection'
  );
  const [feeReportTab, setFeeReportTab] = useState<FeeReportTab>('quick');
  const [selectedMetricKey, setSelectedMetricKey] = useState<string>('collection');
  const [selectedStudentForLedger, setSelectedStudentForLedger] = useState<string | undefined>(
    initialStudentId
  );

  useEffect(() => {
    if (initialReportType) {
      setReportType(initialReportType);
    }
  }, [initialReportType]);

  useEffect(() => {
    if (initialStudentId !== undefined) {
      setSelectedStudentForLedger(initialStudentId);
    }
  }, [initialStudentId]);

  const handleTabChange = (type: 'feeCollection' | 'studentLedger' | 'outstanding') => {
    setReportType(type);
    onReportTypeChange?.(type);
  };

  const handleSelectStudentForLedger = (studentId: string | undefined) => {
    setSelectedStudentForLedger(studentId);
    onStudentIdChange?.(studentId);
  };

  // ---- Report builder state & helpers --------------------------------------

  const todayStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>('thisMonth');
  const [dateFrom, setDateFrom] = useState<string>(() => `${todayStr.slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState<string>(todayStr);
  const [dateRangeRows, setDateRangeRows] = useState<ReportRow[]>([]);
  const [dateRangeGenerated, setDateRangeGenerated] = useState(true);

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classDateFilter, setClassDateFilter] = useState<
    'all' | 'thisMonth' | 'prevMonth'
  >('thisMonth');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);

  const prevMonthStr = (month: string): string => {
    const [y, mo] = month.split('-').map(Number);
    const d = new Date(y, mo - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const buildReportRows = (txns: (typeof transactions)[number][]): ReportRow[] =>
    txns
      .map((t) => {
        const v = vouchers.find((x) => x.id === t.voucherId);
        const s = students.find((x) => x.id === t.studentId);
        const cls = classes.find((c) => c.id === (v?.classId || s?.classId));
        return {
          date: t.date,
          regNo: s?.regNo || '',
          studentName: s?.name || '—',
          className: cls?.name || '—',
          feeMonth: v?.month ? formatMonthName(v.month) : '—',
          total: v?.netDue ?? t.amount,
          paid: t.amount,
          balance: (v?.netDue ?? 0) - (v?.amountPaid ?? 0),
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));

  // Sync date range rows when dates or transactions change
  useEffect(() => {
    if (dateFrom && dateTo) {
      const filtered = transactions.filter((t) => t.date >= dateFrom && t.date <= dateTo);
      setDateRangeRows(buildReportRows(filtered));
    }
  }, [dateFrom, dateTo, transactions, vouchers, students, classes]);

  const quickRows: ReportRow[] = (() => {
    if (quickPeriod === 'today') {
      return buildReportRows(transactions.filter((t) => t.date === todayStr));
    }
    if (quickPeriod === 'thisMonth') {
      return buildReportRows(
        transactions.filter((t) => t.date.slice(0, 7) === activeMonth)
      );
    }
    const lm = prevMonthStr(activeMonth);
    return buildReportRows(transactions.filter((t) => t.date.slice(0, 7) === lm));
  })();

  const quickPeriodLabel =
    quickPeriod === 'today'
      ? `Today's List (${todayStr})`
      : quickPeriod === 'thisMonth'
      ? `This Month's List (${formatMonthName(activeMonth)})`
      : `Last Month's List (${formatMonthName(prevMonthStr(activeMonth))})`;

  const filterTxnsByDate = (txns: (typeof transactions)[number][]) => {
    if (classDateFilter === 'thisMonth') {
      return txns.filter((t) => t.date.slice(0, 7) === activeMonth);
    }
    if (classDateFilter === 'prevMonth') {
      return txns.filter((t) => t.date.slice(0, 7) === prevMonthStr(activeMonth));
    }
    return txns;
  };

  const classWiseRows = (() => {
    const ids = selectedClassId
      ? new Set(
          students.filter((s) => s.classId === selectedClassId).map((s) => s.id)
        )
      : null;
    const txns = ids
      ? transactions.filter((t) => ids.has(t.studentId))
      : transactions;
    return buildReportRows(filterTxnsByDate(txns));
  })();

  const classDateFilterLabel =
    classDateFilter === 'thisMonth'
      ? formatMonthName(activeMonth)
      : classDateFilter === 'prevMonth'
      ? formatMonthName(prevMonthStr(activeMonth))
      : 'All Time';

  const selectedClassName = classes.find((c) => c.id === selectedClassId)?.name || '';

  const filteredStudentsList = !studentSearch.trim()
    ? students.slice(0, 30)
    : students
        .filter((s) => {
          const q = studentSearch.toLowerCase().trim();
          return (
            s.regNo.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            s.fatherName.toLowerCase().includes(q) ||
            (classes.find((c) => c.id === s.classId)?.name || '').toLowerCase().includes(q)
          );
        })
        .slice(0, 30);

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const studentWiseRows = selectedStudentId
    ? buildReportRows(transactions.filter((t) => t.studentId === selectedStudentId))
    : [];

  const handleGenerateDateRange = () => {
    if (!dateFrom || !dateTo) return;
    const rows = buildReportRows(
      transactions.filter((t) => t.date >= dateFrom && t.date <= dateTo)
    );
    setDateRangeRows(rows);
    setDateRangeGenerated(true);
  };

  // ---- Derived data ---------------------------------------------------------

  const monthVouchers = vouchers.filter((v) => v.month === activeMonth && v.status !== 'Reversed');
  const vouchersIssued = monthVouchers.length;

  const monthTxns = transactions.filter((t) => t.date.slice(0, 7) === activeMonth);
  const thisMonthCollection = monthTxns.reduce((sum, t) => sum + t.amount, 0);
  const studentsPaidThisMonth = new Set(monthTxns.map((t) => t.studentId)).size;

  const vouchersWithReceivable = vouchers.filter(
    (v) => v.status !== 'Reversed' && v.amountPaid < v.netDue
  );

  // Student Outstanding Balances (per student, active receivables)
  const studentOutstandingRows = students
    .map((s) => {
      const cls = classes.find((c) => c.id === s.classId);

      const allStudentVouchers = vouchers
        .filter((v) => v.studentId === s.id && v.status !== 'Reversed')
        .sort((a, b) => a.month.localeCompare(b.month));

      const overdueVouchers = allStudentVouchers.filter(
        (v) => Math.max(0, v.netDue - v.amountPaid) > 0
      );

      const uncarriedUnpaidVouchers = allStudentVouchers.filter(
        (v) => v.status !== 'Carried' && v.amountPaid < v.netDue
      );

      const totalOutstanding =
        uncarriedUnpaidVouchers.length > 0
          ? uncarriedUnpaidVouchers.reduce((sum, v) => sum + (v.netDue - v.amountPaid), 0)
          : overdueVouchers.length > 0
          ? Math.max(0, overdueVouchers.slice(-1)[0].netDue - overdueVouchers.slice(-1)[0].amountPaid)
          : 0;

      const unpaidMonths = overdueVouchers.map((v) => v.month);
      const unpaidMonthsCount = unpaidMonths.length;
      const oldestUnpaidMonth = unpaidMonths[0] || '';
      const formattedMonthsList = overdueVouchers.map((v) => formatMonthName(v.month)).join(', ');

      return {
        studentId: s.id,
        studentNo: s.studentNo,
        regNo: s.regNo,
        name: s.name,
        photoUrl: s.photoUrl,
        dob: s.dob,
        ageStr: formatStudentAge(s.dob),
        className: cls?.name || 'Class',
        fatherName: s.fatherName,
        fatherPhone: s.fatherPhone,
        unpaidVoucherCount: overdueVouchers.length,
        unpaidMonthsCount,
        oldestUnpaidMonth,
        formattedMonthsList,
        totalOutstanding,
      };
    })
    .filter((row) => row.totalOutstanding > 0);

  const totalPending = studentOutstandingRows.reduce((sum, r) => sum + r.totalOutstanding, 0);

  const pendingRows: ReportRow[] = (() => {
    const rows: ReportRow[] = [];
    for (const r of studentOutstandingRows) {
      const sv = vouchers
        .filter((v) => v.studentId === r.studentId && v.status !== 'Reversed')
        .sort((a, b) => a.month.localeCompare(b.month));
      const uncarried = sv.filter((v) => v.status !== 'Carried' && v.amountPaid < v.netDue);
      const included =
        uncarried.length > 0
          ? uncarried
          : sv.filter((v) => v.amountPaid < v.netDue).slice(-1);
      for (const v of included) {
        rows.push({
          date: v.dueDate,
          regNo: r.regNo,
          studentName: r.name,
          className: r.className,
          feeMonth: formatMonthName(v.month),
          total: v.netDue,
          paid: v.amountPaid,
          balance: v.netDue - v.amountPaid,
        });
      }
    }
    return rows;
  })();

  // ---- Metrics --------------------------------------------------------------

  const monthTarget = monthVouchers.reduce((sum, v) => sum + v.netDue, 0);
  const collectionRate = monthTarget > 0 ? Math.round((thisMonthCollection / monthTarget) * 100) : 0;
  const activeStudentsCount = students.filter((s) => s.status === 'Active').length;
  const payerPercentage = activeStudentsCount > 0 ? Math.round((studentsPaidThisMonth / activeStudentsCount) * 100) : 0;
  const paidVouchersCount = monthVouchers.filter((v) => v.status === 'Paid').length;

  const metrics = [
    {
      key: 'collection',
      label: 'This Month Collection',
      value: formatCurrency(thisMonthCollection),
      icon: Wallet,
      accent: 'text-emerald-700',
      iconBg: 'bg-emerald-50 text-emerald-600',
      hint: `${monthTxns.length} txn${monthTxns.length !== 1 ? 's' : ''}`,
      badge: `${collectionRate}% collected`,
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
      tab: 'quick' as FeeReportTab,
    },
    {
      key: 'pending',
      label: 'Total Pending',
      value: formatCurrency(totalPending),
      icon: AlertTriangle,
      accent: 'text-rose-600',
      iconBg: 'bg-rose-50 text-rose-600',
      hint: `${studentOutstandingRows.length} student${studentOutstandingRows.length !== 1 ? 's' : ''}`,
      badge: 'Defaulters',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200/70',
      tab: 'pending' as FeeReportTab,
    },
    {
      key: 'issued',
      label: 'Vouchers Issued',
      value: String(vouchersIssued),
      icon: FileText,
      accent: 'text-slate-800',
      iconBg: 'bg-teal-50 text-teal-600',
      hint: `For ${formatMonthName(activeMonth)}`,
      badge: `${paidVouchersCount} Paid`,
      badgeClass: 'bg-teal-50 text-teal-700 border-teal-200/70',
      tab: 'quick' as FeeReportTab,
    },
    {
      key: 'receivable',
      label: 'Vouchers w/ Balance',
      value: String(vouchersWithReceivable.length),
      icon: HandCoins,
      accent: 'text-indigo-700',
      iconBg: 'bg-indigo-50 text-indigo-600',
      hint: 'Currently due',
      badge: 'Unsettled',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
      tab: 'pending' as FeeReportTab,
    },
    {
      key: 'studentsPaid',
      label: 'Students Paid',
      value: String(studentsPaidThisMonth),
      icon: Users,
      accent: 'text-sky-700',
      iconBg: 'bg-sky-50 text-sky-600',
      hint: `of ${activeStudentsCount || students.length} students`,
      badge: `${payerPercentage}% paid`,
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/70',
      tab: 'quick' as FeeReportTab,
    },
  ];

  const activeMetric = (key: string) => {
    setSelectedMetricKey(key);
    const m = metrics.find((x) => x.key === key);
    if (!m) return;
    if (feeReportTab !== m.tab) setFeeReportTab(m.tab);
    if (m.tab === 'quick') setQuickPeriod('thisMonth');
  };

  const handleFeeReportTabChange = (tab: FeeReportTab) => {
    setFeeReportTab(tab);
    if (tab === 'pending') {
      setSelectedMetricKey('pending');
    } else if (tab === 'quick') {
      setSelectedMetricKey('collection');
    } else {
      setSelectedMetricKey('');
    }
  };

  // ---- Arrears export & print handlers ---------------------------------------
  const [arrearsCopied, setArrearsCopied] = useState(false);
  const [arrearsCsvDownloaded, setArrearsCsvDownloaded] = useState(false);
  const [isPrintingArrears, setIsPrintingArrears] = useState(false);
  const [isSavingArrearsPdf, setIsSavingArrearsPdf] = useState(false);

  const handleCopyArrears = async () => {
    if (studentOutstandingRows.length === 0) return;
    const headers = ['Sr#', 'Reg No', 'Student Name', 'Class', 'Father Name', 'Phone', 'Unpaid Months', 'Total Outstanding'];
    const lines = [
      headers.join('\t'),
      ...studentOutstandingRows.map((r, i) =>
        [i + 1, r.regNo, r.name, r.className, r.fatherName, r.fatherPhone, r.unpaidMonthsCount, r.totalOutstanding].join('\t')
      ),
      ['TOTAL', '', '', '', '', '', '', totalPending].join('\t'),
    ];
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        // ignore
      }
      document.body.removeChild(ta);
    }
    setArrearsCopied(true);
    setTimeout(() => setArrearsCopied(false), 2200);
  };

  const handleExportArrearsCsv = () => {
    if (studentOutstandingRows.length === 0) return;
    const headers = ['Sr#', 'Reg No', 'Student Name', 'Class', 'Father Name', 'Phone', 'Unpaid Months', 'Total Outstanding'];
    const csvRows = studentOutstandingRows.map((r, i) => [
      i + 1,
      `"${r.regNo || ''}"`,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${(r.className || '').replace(/"/g, '""')}"`,
      `"${(r.fatherName || '').replace(/"/g, '""')}"`,
      `"${(r.fatherPhone || '').replace(/"/g, '""')}"`,
      r.unpaidMonthsCount,
      r.totalOutstanding,
    ]);
    const totalRow = ['TOTAL', '""', '""', '""', '""', '""', '""', totalPending];
    const csvContent = '\uFEFF' + [headers.join(','), ...csvRows.map((e) => e.join(',')), totalRow.join(',')].join('\n');
    downloadCsv(`Student_Fee_Arrears_${activeMonth}.csv`, csvContent);
    setArrearsCsvDownloaded(true);
    setTimeout(() => setArrearsCsvDownloaded(false), 2000);
  };

  const handleSaveArrearsPdf = async () => {
    if (studentOutstandingRows.length === 0 || isSavingArrearsPdf) return;
    try {
      setIsSavingArrearsPdf(true);
      const pdfRows: OutstandingArrearsPdfRow[] = studentOutstandingRows.map((r) => ({
        regNo: r.regNo,
        name: r.name,
        dob: r.dob,
        ageStr: r.ageStr,
        className: r.className,
        fatherName: r.fatherName,
        fatherPhone: r.fatherPhone,
        unpaidMonthsCount: r.unpaidMonthsCount,
        oldestUnpaidMonth: r.oldestUnpaidMonth,
        totalOutstanding: r.totalOutstanding,
      }));
      const monthLabel = formatMonthName(activeMonth);
      await exportOutstandingArrearsPdf(
        pdfRows,
        {
          institute,
          bankAccounts,
          students,
          classes,
          themeColor: themeConfig?.activePreset?.primaryColor,
        },
        monthLabel
      );
    } finally {
      setIsSavingArrearsPdf(false);
    }
  };

  const handlePrintArrears = async () => {
    if (studentOutstandingRows.length === 0 || isPrintingArrears) return;
    try {
      setIsPrintingArrears(true);
      const pdfRows: OutstandingArrearsPdfRow[] = studentOutstandingRows.map((r) => ({
        regNo: r.regNo,
        name: r.name,
        dob: r.dob,
        ageStr: r.ageStr,
        className: r.className,
        fatherName: r.fatherName,
        fatherPhone: r.fatherPhone,
        unpaidMonthsCount: r.unpaidMonthsCount,
        oldestUnpaidMonth: r.oldestUnpaidMonth,
        totalOutstanding: r.totalOutstanding,
      }));
      const monthLabel = formatMonthName(activeMonth);
      await printOutstandingArrearsPdf(
        pdfRows,
        {
          institute,
          bankAccounts,
          students,
          classes,
          themeColor: themeConfig?.activePreset?.primaryColor,
        },
        monthLabel
      );
    } finally {
      setIsPrintingArrears(false);
    }
  };

  const reportTabs: { key: FeeReportTab; label: string; icon: typeof Layers }[] = [
    { key: 'quick', label: 'Quick Reports', icon: Clock },
    { key: 'dateRange', label: 'Date Range', icon: CalendarRange },
    { key: 'classWise', label: 'Class Wise', icon: Layers },
    { key: 'studentWise', label: 'Student Wise', icon: Search },
    { key: 'pending', label: 'Pending', icon: AlertTriangle },
  ];

  // ---- Report export helpers -------------------------------------------------

  const REPORT_HEADERS = ['Sr#', 'Date', 'Reg No', 'Student Name', 'Class', 'Fee Month', 'Total', 'Paid', 'Balance'];

  const ReportTable: React.FC<{ rows: ReportRow[]; title: string; filename: string }> = ({
    rows,
    title,
    filename,
  }) => {
    const [copied, setCopied] = useState(false);
    const [csvDownloaded, setCsvDownloaded] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isSavingPdf, setIsSavingPdf] = useState(false);

    const totals = rows.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        paid: acc.paid + r.paid,
        balance: acc.balance + r.balance,
      }),
      { total: 0, paid: 0, balance: 0 }
    );

    const handleCopy = async () => {
      if (rows.length === 0) return;
      const lines = [
        REPORT_HEADERS.join('\t'),
        ...rows.map((r, i) =>
          [i + 1, r.date, r.regNo || '', r.studentName, r.className, r.feeMonth, r.total, r.paid, r.balance].join('\t')
        ),
        ['TOTAL', '', '', '', '', '', totals.total, totals.paid, totals.balance].join('\t'),
      ];
      const text = lines.join('\n');
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
        } catch {
          // ignore
        }
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    };

    const handleCsv = () => {
      if (rows.length === 0) return;
      const csvRows = rows.map((r, i) => [
        i + 1,
        `"${r.date}"`,
        `"${r.regNo || ''}"`,
        `"${(r.studentName || '').replace(/"/g, '""')}"`,
        `"${(r.className || '').replace(/"/g, '""')}"`,
        `"${(r.feeMonth || '').replace(/"/g, '""')}"`,
        r.total,
        r.paid,
        r.balance,
      ]);
      const totalRow = [
        'TOTAL',
        '""',
        '""',
        '""',
        '""',
        '""',
        totals.total,
        totals.paid,
        totals.balance,
      ];
      const csvContent =
        '\uFEFF' +
        [REPORT_HEADERS.join(','), ...csvRows.map((e) => e.join(',')), totalRow.join(',')].join('\n');
      downloadCsv(filename, csvContent);
      setCsvDownloaded(true);
      setTimeout(() => setCsvDownloaded(false), 2000);
    };

    const handleSavePdf = async () => {
      if (rows.length === 0 || isSavingPdf) return;
      try {
        setIsSavingPdf(true);
        const pdfRows: FeeCollectionReportPdfRow[] = rows.map((r) => ({
          date: r.date,
          regNo: r.regNo,
          studentName: r.studentName,
          className: r.className,
          feeMonth: r.feeMonth,
          total: r.total,
          paid: r.paid,
          balance: r.balance,
        }));
        await exportFeeCollectionReportPdf(
          pdfRows,
          {
            institute,
            bankAccounts,
            students,
            classes,
            themeColor: themeConfig?.activePreset?.primaryColor,
          },
          title,
          filename.replace(/\.csv$/i, '.pdf')
        );
      } finally {
        setIsSavingPdf(false);
      }
    };

    const handlePrintPdf = async () => {
      if (rows.length === 0 || isPrinting) return;
      try {
        setIsPrinting(true);
        const pdfRows: FeeCollectionReportPdfRow[] = rows.map((r) => ({
          date: r.date,
          regNo: r.regNo,
          studentName: r.studentName,
          className: r.className,
          feeMonth: r.feeMonth,
          total: r.total,
          paid: r.paid,
          balance: r.balance,
        }));
        await printFeeCollectionReportPdf(
          pdfRows,
          {
            institute,
            bankAccounts,
            students,
            classes,
            themeColor: themeConfig?.activePreset?.primaryColor,
          },
          title
        );
      } finally {
        setIsPrinting(false);
      }
    };

    return (
      <div>
        {/* Printable institutional header (visible only when printing) */}
        <div className="hidden print:block mb-4 border-b border-slate-300 pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {institute.logoUrl ? (
                <img
                  src={institute.logoUrl}
                  alt={institute.name}
                  className="w-12 h-12 object-contain rounded-lg border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 font-bold text-base shrink-0">
                  {institute.name ? institute.name.charAt(0) : 'S'}
                </div>
              )}
              <div>
                <h1 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                  {institute.name || 'INSTITUTE NAME'}
                </h1>
                <p className="text-[11px] text-slate-500 font-medium">
                  {institute.address || 'School Campus'} {institute.phone && `• Ph: ${institute.phone}`} {institute.regNo && `• Reg #: ${institute.regNo}`}
                </p>
                <p className="text-[11px] font-bold text-slate-700 mt-1">{title}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Generated
              </span>
              <span className="text-sm font-bold text-slate-900">{todayStr}</span>
            </div>
          </div>
        </div>

        {/* Toolbar (hidden when printing) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 print:hidden">
          <div>
            <h4 className="font-bold text-slate-800 text-sm">{title}</h4>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-500 font-mono">
                {rows.length} record{rows.length !== 1 ? 's' : ''}
              </span>
              {rows.length > 0 && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Collected:{' '}
                    <strong className="text-emerald-700 font-bold font-mono">
                      {formatCurrency(totals.paid)}
                    </strong>
                  </span>
                  {totals.balance > 0 && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Balance:{' '}
                        <strong className="text-rose-600 font-bold font-mono">
                          {formatCurrency(totals.balance)}
                        </strong>
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Copy Button */}
            <button
              type="button"
              id="btn-report-copy"
              onClick={handleCopy}
              disabled={rows.length === 0}
              title={rows.length === 0 ? 'No records to copy' : 'Copy formatted table to clipboard (Excel / Sheets compatible)'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer border ${
                rows.length === 0
                  ? 'bg-slate-50 text-slate-300 border-slate-200/60 cursor-not-allowed'
                  : copied
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* CSV Button */}
            <button
              type="button"
              id="btn-report-csv"
              onClick={handleCsv}
              disabled={rows.length === 0}
              title={rows.length === 0 ? 'No records to export' : 'Download report as UTF-8 CSV'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer border ${
                rows.length === 0
                  ? 'bg-slate-50 text-slate-300 border-slate-200/60 cursor-not-allowed'
                  : csvDownloaded
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 hover:border-emerald-300'
              }`}
            >
              {csvDownloaded ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">Downloaded!</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Export CSV</span>
                </>
              )}
            </button>

            {/* Save PDF Button */}
            <button
              type="button"
              id="btn-report-save-pdf"
              onClick={handleSavePdf}
              disabled={rows.length === 0 || isSavingPdf}
              title={rows.length === 0 ? 'No records to save' : 'Download official PDF document'}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer ${
                rows.length === 0
                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {isSavingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 text-teal-400" />
                  <span>Save PDF</span>
                </>
              )}
            </button>

            {/* Print PDF Button */}
            <button
              type="button"
              id="btn-report-print-pdf"
              onClick={handlePrintPdf}
              disabled={rows.length === 0 || isPrinting}
              title={rows.length === 0 ? 'No records to print' : 'Print official landscape PDF report'}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer ${
                rows.length === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-teal-700 hover:bg-teal-800 text-white'
              }`}
            >
              {isPrinting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Preparing...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 text-white" />
                  <span>Print PDF</span>
                </>
              )}
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400 italic text-sm">No records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-2.5">Sr#</th>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Reg No</th>
                  <th className="p-2.5">Student Name</th>
                  <th className="p-2.5">Class</th>
                  <th className="p-2.5">Fee Month</th>
                  <th className="p-2.5 text-right">Total</th>
                  <th className="p-2.5 text-right">Paid</th>
                  <th className="p-2.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-2.5 text-slate-400">{i + 1}</td>
                    <td className="p-2.5 font-medium">{r.date}</td>
                    <td className="p-2.5 font-mono text-slate-500">{r.regNo || '—'}</td>
                    <td className="p-2.5 font-bold text-slate-900">{r.studentName}</td>
                    <td className="p-2.5">{r.className}</td>
                    <td className="p-2.5">{r.feeMonth}</td>
                    <td className="p-2.5 text-right font-semibold">{formatCurrency(r.total)}</td>
                    <td className="p-2.5 text-right font-bold text-emerald-700">{formatCurrency(r.paid)}</td>
                    <td className="p-2.5 text-right font-bold text-rose-600">{formatCurrency(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold border-t border-slate-800">
                <tr>
                  <td colSpan={6} className="p-2.5">TOTAL:</td>
                  <td className="p-2.5 text-right text-teal-300">{formatCurrency(totals.total)}</td>
                  <td className="p-2.5 text-right text-emerald-400">{formatCurrency(totals.paid)}</td>
                  <td className="p-2.5 text-right text-rose-300">{formatCurrency(totals.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Printable Signatures Block (visible when printing via browser Ctrl+P) */}
        {rows.length > 0 && (
          <div className="hidden print:flex justify-between items-end mt-12 pt-8 text-xs text-slate-700 break-inside-avoid">
            <div className="text-center w-52 border-t border-slate-400 pt-1.5 font-medium">
              Prepared By (Cashier / Accountant)
            </div>
            <div className="text-center w-52 border-t border-slate-400 pt-1.5 font-medium">
              Verified By (Accounts Incharge)
            </div>
            <div className="text-center w-52 border-t border-slate-400 pt-1.5 font-medium">
              Approved By (Principal / Director)
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
        <div className="flex items-center gap-3.5">
          {institute.logoUrl ? (
            <img
              src={institute.logoUrl}
              alt={institute.name}
              className="w-12 h-12 object-contain rounded-xl border border-slate-200/80 p-1 bg-white shrink-0 shadow-2xs"
            />
          ) : (
            <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700 shrink-0">
              <BarChart3 className="w-6 h-6 text-teal-600" />
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Financial & Fee Audit Reports
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {institute.name} &bull; Fee collection metrics, generated fee reports, and outstanding balance audits.
            </p>
          </div>
        </div>
      </div>

      {/* Primary Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto print:hidden">
        <button
          onClick={() => handleTabChange('feeCollection')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            reportType === 'feeCollection'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Fee Collection Report
        </button>
        <button
          onClick={() => handleTabChange('studentLedger')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            reportType === 'studentLedger'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4" />
          Student Fee Collections Ledger
        </button>
        <button
          onClick={() => handleTabChange('outstanding')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            reportType === 'outstanding'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          Student Outstanding Balances Arrears ({studentOutstandingRows.length})
        </button>
      </div>

      {reportType === 'studentLedger' ? (
        <StudentFeeLedger initialStudentId={selectedStudentForLedger} />
      ) : reportType === 'outstanding' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
            <div>
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Student Unpaid Fee Arrears Audit ({studentOutstandingRows.length} Defaulters)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Total Pending Arrears:{' '}
                <strong className="text-rose-700 font-bold font-mono">
                  {formatCurrency(totalPending)}
                </strong>
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Copy Button */}
              <button
                type="button"
                id="btn-arrears-copy"
                onClick={handleCopyArrears}
                disabled={studentOutstandingRows.length === 0}
                title={studentOutstandingRows.length === 0 ? 'No records to copy' : 'Copy defaulters list to clipboard'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer border ${
                  studentOutstandingRows.length === 0
                    ? 'bg-slate-50 text-slate-300 border-slate-200/60 cursor-not-allowed'
                    : arrearsCopied
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                {arrearsCopied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-500" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              {/* CSV Button */}
              <button
                type="button"
                id="btn-arrears-csv"
                onClick={handleExportArrearsCsv}
                disabled={studentOutstandingRows.length === 0}
                title={studentOutstandingRows.length === 0 ? 'No records to export' : 'Download arrears audit report as CSV'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer border ${
                  studentOutstandingRows.length === 0
                    ? 'bg-slate-50 text-slate-300 border-slate-200/60 cursor-not-allowed'
                    : arrearsCsvDownloaded
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 hover:border-emerald-300'
                }`}
              >
                {arrearsCsvDownloaded ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">Downloaded!</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Export CSV</span>
                  </>
                )}
              </button>

              {/* Save PDF Button */}
              <button
                type="button"
                id="btn-arrears-save-pdf"
                onClick={handleSaveArrearsPdf}
                disabled={studentOutstandingRows.length === 0 || isSavingArrearsPdf}
                title={studentOutstandingRows.length === 0 ? 'No records to save' : 'Download arrears audit PDF'}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer ${
                  studentOutstandingRows.length === 0
                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                {isSavingArrearsPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4 text-teal-400" />
                    <span>Save PDF</span>
                  </>
                )}
              </button>

              {/* Print PDF Button */}
              <button
                type="button"
                id="btn-arrears-print-pdf"
                onClick={handlePrintArrears}
                disabled={studentOutstandingRows.length === 0 || isPrintingArrears}
                title={studentOutstandingRows.length === 0 ? 'No records to print' : 'Print arrears audit PDF'}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer ${
                  studentOutstandingRows.length === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-teal-700 hover:bg-teal-800 text-white'
                }`}
              >
                {isPrintingArrears ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Preparing...</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4 text-white" />
                    <span>Print PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3">Student Info</th>
                  <th className="p-3">Class</th>
                  <th className="p-3">Father Name & Contact</th>
                  <th className="p-3">Months Unpaid (Streak)</th>
                  <th className="p-3 text-right">Outstanding (Net)</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentOutstandingRows.length > 0 ? (
                  studentOutstandingRows.map((r) => (
                    <tr key={r.studentId} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <StudentAvatar photoUrl={r.photoUrl} name={r.name} size="xs" />
                          <div>
                            <span className="font-bold text-slate-900 block">{r.name}</span>
                            <span className="text-[11px] text-slate-500 font-mono font-semibold block">
                              Reg #: {r.regNo}
                            </span>
                            {r.dob && (
                              <span className="text-[10px] text-slate-400 font-medium block">
                                DOB: {r.dob} ({r.ageStr})
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{r.className}</td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-900 block">{r.fatherName}</span>
                        <span className="text-[11px] text-slate-500">{r.fatherPhone}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                r.unpaidMonthsCount >= 3
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-amber-100 text-amber-900 border border-amber-200'
                              }`}
                            >
                              {r.unpaidMonthsCount} {r.unpaidMonthsCount === 1 ? 'Month' : 'Months'} Due
                            </span>
                            {r.unpaidMonthsCount >= 3 && (
                              <span className="text-[10px] font-bold bg-rose-600 text-white px-1.5 py-0.2 rounded">
                                Streak
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-medium">
                            Due since {formatMonthName(r.oldestUnpaidMonth)}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-bold text-rose-600">
                        {formatCurrency(r.totalOutstanding)}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            handleSelectStudentForLedger(r.studentId);
                            handleTabChange('studentLedger');
                          }}
                          className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold rounded-lg transition text-[11px] cursor-pointer"
                        >
                          View Ledger
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                      Zero outstanding defaulter arrears found!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Metrics Section */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 sm:p-4 print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  style={{
                    backgroundColor: `${preset.primaryColor}14`,
                    color: preset.primaryColor,
                  }}
                  className="p-1.5 rounded-lg flex items-center justify-center shrink-0 shadow-2xs"
                >
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                    <span>Fee Collection Metrics</span>
                    <span className="text-[10px] font-normal normal-case text-slate-400 hidden sm:inline">
                      &bull; Click any metric to filter reports
                    </span>
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/70">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Billing Month: <strong className="text-slate-800 font-semibold">{formatMonthName(activeMonth)}</strong></span>
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/70">
                  <span>Collection Rate:</span>
                  <strong className="text-emerald-700 font-bold font-mono">{collectionRate}%</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
              {metrics.map((m) => {
                const Icon = m.icon;
                const isSelected = selectedMetricKey === m.key;

                return (
                  <button
                    key={m.key}
                    type="button"
                    id={`metric-card-${m.key}`}
                    onClick={() => activeMetric(m.key)}
                    title={`Click to filter: ${METRIC_LABELS[m.tab]}`}
                    style={
                      isSelected
                        ? {
                            borderColor: preset.primaryColor,
                            backgroundColor: `${preset.primaryColor}0d`,
                            boxShadow: `0 0 0 1px ${preset.primaryColor}33`,
                          }
                        : undefined
                    }
                    className={`group text-left rounded-xl p-3 border transition-all duration-150 cursor-pointer flex flex-col justify-between relative ${
                      isSelected
                        ? 'shadow-2xs'
                        : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 hover:shadow-2xs'
                    }`}
                  >
                    {/* Top Row: Metric Label & Icon */}
                    <div className="flex items-start justify-between gap-1.5 mb-1.5">
                      <span
                        style={isSelected ? { color: preset.textColor } : undefined}
                        className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900 transition-colors leading-tight line-clamp-1"
                      >
                        {m.label}
                      </span>
                      <span
                        style={
                          isSelected
                            ? {
                                backgroundColor: preset.primaryColor,
                                color: '#ffffff',
                              }
                            : undefined
                        }
                        className={`w-6 h-6 shrink-0 rounded-lg flex items-center justify-center transition-colors ${
                          isSelected ? 'shadow-2xs' : m.iconBg
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    {/* Middle Row: Primary Value */}
                    <div className="mb-2">
                      <div
                        className={`text-lg sm:text-xl font-black font-mono tracking-tight leading-none truncate ${
                          isSelected ? 'text-slate-900' : m.accent
                        }`}
                      >
                        {m.value}
                      </div>
                    </div>

                    {/* Bottom Row: Context Hint & Status Badge */}
                    <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 font-medium pt-1.5 border-t border-slate-100/90">
                      <span className="truncate text-slate-500">{m.hint}</span>
                      {m.badge && (
                        <span
                          style={
                            isSelected
                              ? {
                                  backgroundColor: `${preset.primaryColor}18`,
                                  color: preset.textColor,
                                  borderColor: `${preset.primaryColor}40`,
                                }
                              : undefined
                          }
                          className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${
                            isSelected ? 'border' : m.badgeClass
                          }`}
                        >
                          {m.badge}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate Reports Section */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Generate Fee Reports
              </h3>
              <p className="text-[11px] text-slate-500">{METRIC_LABELS[feeReportTab]}</p>
            </div>

            <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 overflow-x-auto print:hidden">
              {reportTabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => handleFeeReportTabChange(t.key)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      feeReportTab === t.key
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="p-6">
              {feeReportTab === 'quick' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(
                      [
                        { key: 'today', label: "View Today's List", icon: CalendarDays },
                        { key: 'thisMonth', label: "This Month's List", icon: Wallet },
                        { key: 'lastMonth', label: "Last Month's List", icon: History },
                      ] as { key: QuickPeriod; label: string; icon: typeof Clock }[]
                    ).map((b) => {
                      const Icon = b.icon;
                      return (
                        <button
                          key={b.key}
                          onClick={() => setQuickPeriod(b.key)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                            quickPeriod === b.key
                              ? 'bg-teal-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                  <ReportTable
                    rows={quickRows}
                    title={quickPeriodLabel}
                    filename={`Fee_Collection_Quick_${quickPeriod}_${activeMonth}.csv`}
                  />
                </div>
              )}

              {feeReportTab === 'dateRange' && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-4 print:hidden">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        From Date
                      </label>
                      <DatePicker value={dateFrom} onChange={setDateFrom} themeColor="teal" allowClear={false} className="w-44" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        To Date
                      </label>
                      <DatePicker value={dateTo} onChange={setDateTo} themeColor="teal" allowClear={false} className="w-44" />
                    </div>
                    <button
                      onClick={handleGenerateDateRange}
                      disabled={!dateFrom || !dateTo}
                      className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-teal-600 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Generate Report
                    </button>
                  </div>
                  {dateRangeGenerated ? (
                    <ReportTable
                      rows={dateRangeRows}
                      title={`Fee Collection Report — ${dateFrom} to ${dateTo}`}
                      filename={`Fee_Collection_${dateFrom}_to_${dateTo}.csv`}
                    />
                  ) : (
                    <div className="p-8 text-center text-slate-400 italic text-sm">
                      Select a from/to date range and click Generate Report.
                    </div>
                  )}
                </div>
              )}

              {feeReportTab === 'classWise' && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-4 print:hidden">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Select Class
                      </label>
                      <div className="relative">
                        <School className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <select
                          value={selectedClassId}
                          onChange={(e) => setSelectedClassId(e.target.value)}
                          className="pl-9.5 pr-8 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition appearance-none cursor-pointer min-w-56"
                        >
                          <option value="">All Classes</option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Period
                      </label>
                      <div className="relative">
                        <CalendarDays className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <select
                          value={classDateFilter}
                          onChange={(e) =>
                            setClassDateFilter(
                              e.target.value as 'all' | 'thisMonth' | 'prevMonth'
                            )
                          }
                          className="pl-9.5 pr-8 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition appearance-none cursor-pointer min-w-44"
                        >
                          <option value="all">All Time</option>
                          <option value="thisMonth">This Month</option>
                          <option value="prevMonth">Previous Month</option>
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <ReportTable
                    rows={classWiseRows}
                    title={`Class Wise Fee Collection Report — ${
                      selectedClassName || 'All Classes'
                    } (${classDateFilterLabel})`}
                    filename={`Fee_Collection_Class_${
                      (selectedClassName || 'All_Classes').replace(/\s+/g, '_')
                    }_${classDateFilter}.csv`}
                  />
                </div>
              )}

              {feeReportTab === 'studentWise' && (
                <div className="space-y-5">
                  <div className="print:hidden">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Search Student
                    </label>
                    <div className="relative w-full md:w-96">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search Reg #, Name, Class..."
                          value={studentSearch}
                          onChange={(e) => {
                            setStudentSearch(e.target.value);
                            setIsStudentDropdownOpen(true);
                          }}
                          onFocus={() => setIsStudentDropdownOpen(true)}
                          className="w-full pl-9.5 pr-8 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition"
                        />
                        {studentSearch || selectedStudentId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setStudentSearch('');
                              setSelectedStudentId('');
                              setIsStudentDropdownOpen(false);
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

                      {isStudentDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-30"
                            onClick={() => setIsStudentDropdownOpen(false)}
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
                                      setIsStudentDropdownOpen(false);
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

                  {selectedStudentId && selectedStudent ? (
                    <ReportTable
                      rows={studentWiseRows}
                      title={`Student Wise Fee Collection Report — ${selectedStudent.name} (${selectedStudent.regNo})`}
                      filename={`Fee_Collection_Student_${selectedStudent.regNo}.csv`}
                    />
                  ) : (
                    <div className="p-8 text-center text-slate-400 italic text-sm flex items-center justify-center gap-2">
                      <GraduationCap className="w-4 h-4" />
                      Select a student to view their fee collection report.
                    </div>
                  )}
                </div>
              )}

              {feeReportTab === 'pending' && (
                <div className="space-y-5">
                  {pendingRows.length > 0 ? (
                    <ReportTable
                      rows={pendingRows}
                      title={`Pending Fee Report (${formatMonthName(activeMonth)})`}
                      filename={`Pending_Fee_Report_${activeMonth}.csv`}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <BookMarked className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-sm font-bold text-slate-700 mb-1">No Pending Balances</p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        All students have cleared their fee balances for {formatMonthName(activeMonth)}.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
