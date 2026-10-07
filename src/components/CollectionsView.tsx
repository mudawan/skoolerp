import { SortableTh } from './SortableTh';
import { useSortState, sortRows } from '../hooks/useTableSort';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FeeCollection, FeeVoucher, PaymentTransaction, VoucherItem, PaymentReceiptData } from '../types';
import { formatCurrency, formatMonthName, getEffectiveMultiple, roundUpToMultiple, getCurrencyCode } from '../utils/feeMath';
import { normalizePaymentMode, paymentModeText, DEFAULT_PAYMENT_MODE, PAYMENT_MODES, type PaymentMode } from '../utils/paymentMode';
import { parseCsvLine, detectCsvDelimiter, downloadCsv } from '../utils/csv';
import { mapCsvHeader, COLLECTION_CSV, CSV_REG_NO, CSV_STUDENT_NAME, CSV_CLASS, CSV_VOUCHER_NO, CSV_FEE_MONTH, CSV_PAYMENT_MODE, CSV_REFERENCE_NO } from '../utils/csvHeaders';
import { StudentAvatar } from './StudentAvatar';
import { ConfirmModal } from './ConfirmModal';
import { DatePicker } from './DatePicker';
import { VoucherParticularsEditor } from './VoucherParticularsEditor';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  CreditCard,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Info,
  LayoutGrid,
  List,
  Plus,
  Printer,
  Receipt,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

export const CollectionsView: React.FC = () => {
  const {
    activeMonth,
    collections,
    historyFrom,
    ensureHistoryLoaded,
    transactions,
    vouchers,
    students,
    classes,
    collectVoucherPayment,
    updateVoucherParticulars,
    bulkCsvCollection,
    deleteCollection,
    hasPermission,
    themeConfig,
    roundingMultiple,
    roundingEnabled,
    showToast,
  } = useApp();

  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  // Itemized students/transactions stay hidden until a collection is expanded.
  const [expandedCollections, setExpandedCollections] = useState<Record<string, boolean>>({});
  const [collectionToDelete, setCollectionToDelete] = useState<FeeCollection | null>(null);

  const toggleCollectionCollapse = (colId: string) => {
    setExpandedCollections((prev) => ({
      ...prev,
      [colId]: !prev[colId],
    }));
  };

  // Payment Receipt Modal State
  const [receiptModalData, setReceiptModalData] = useState<PaymentReceiptData | PaymentReceiptData[] | null>(null);
  const [receiptInitialIndex, setReceiptInitialIndex] = useState<number>(0);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Sorting state - default to oldest first (asc) so Sr# 1 refers to oldest transaction
  type SortField = 'sr' | 'date' | 'type' | 'transactions' | 'totalAmount';
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>('sr');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition shrink-0" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-teal-600 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-teal-600 shrink-0" />
    );
  };

  // Direct Collection Modal State
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [isChangingVoucher, setIsChangingVoucher] = useState(false);
  const [directSearch, setDirectSearch] = useState('');
  const [selectedVoucherId, setSelectedVoucherId] = useState('');
  const [isVoucherPickerOpen, setIsVoucherPickerOpen] = useState(false);
  const [highlightedVoucherIndex, setHighlightedVoucherIndex] = useState(0);
  const voucherPickerContainerRef = useRef<HTMLDivElement>(null);
  const voucherInputRef = useRef<HTMLInputElement>(null);
  const [directAmount, setDirectAmount] = useState<number | string>('');
  const [directMode, setDirectMode] = useState<PaymentMode>(DEFAULT_PAYMENT_MODE);
  const [directRef, setDirectRef] = useState('');
  const [directDate, setDirectDate] = useState(new Date().toISOString().split('T')[0]);
  const [directNotes, setDirectNotes] = useState('');
  const [directItems, setDirectItems] = useState<VoucherItem[]>([]);

  // Click outside to close voucher picker dropdown
  useEffect(() => {
    if (!isVoucherPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        voucherPickerContainerRef.current &&
        !voucherPickerContainerRef.current.contains(e.target as Node)
      ) {
        setIsVoucherPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVoucherPickerOpen]);

  // Bulk CSV Modal State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkImportStatus, setBulkImportStatus] = useState<{ message: string | null; error: string | null }>({
    message: null,
    error: null,
  });
  const [bulkPreviewRows, setBulkPreviewRows] = useState<
    {
      id: string;
      regNo: string;
      amount: number;
      fine?: number;
      date: string;
      paymentMode: string;
      refNo: string;
      studentId?: string;
      studentName?: string;
      className?: string;
      voucherId?: string;
      voucherNo?: string;
      originalNetDue?: number;
      netDue?: number;
      alreadyPaid?: number;
      remainingBalance?: number;
      isValid: boolean;
      isDuplicate?: boolean;
      selected: boolean;
      errorMsg?: string;
    }[]
  >([]);
  const { sort: bulkSort, toggleSort: toggleBulkSort } = useSortState();
  const sortedBulkPreviewRows = useMemo(
    () =>
      sortRows<(typeof bulkPreviewRows)[number]>(bulkPreviewRows, bulkSort, {
        selected: (r) => r.selected && r.isValid,
        student: (r) => r.studentName || r.regNo,
        voucherNo: (r) => r.voucherNo,
        fine: (r) => r.fine,
        netDue: (r) => r.netDue,
        alreadyPaid: (r) => r.alreadyPaid,
        remaining: (r) => r.remainingBalance,
        amount: (r) => r.amount,
        date: (r) => r.date,
        mode: (r) => paymentModeText(r.paymentMode),
        status: (r) => r.errorMsg || (r.amount === r.remainingBalance ? 'Clears Balance' : r.amount < (r.remainingBalance || 0) ? 'Partial Payment' : 'Overpayment'),
      }),
    [bulkPreviewRows, bulkSort]
  );

  useEscapeKey(() => {
    if (isVoucherPickerOpen) {
      setIsVoucherPickerOpen(false);
      return;
    }
    if (showDirectModal) {
      setShowDirectModal(false);
    } else if (showBulkModal) {
      setShowBulkModal(false);
    }
  }, isVoucherPickerOpen || showDirectModal || showBulkModal);

  // Filtered & Sorted Collections (Sr# 1 = oldest transaction of the month by default)
  const sortedCollections = useMemo(() => {
    const filtered = collections.filter(
      (c) =>
        c.collectionNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.date.includes(searchTerm) ||
        (c.notes && c.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'sr' || sortField === 'date') {
        const dateDiff = a.date.localeCompare(b.date);
        comparison = dateDiff !== 0 ? dateDiff : a.collectionNo.localeCompare(b.collectionNo);
      } else if (sortField === 'type') {
        const typeA = a.isBulkImport ? 'Bulk CSV Import' : 'Direct Collection';
        const typeB = b.isBulkImport ? 'Bulk CSV Import' : 'Direct Collection';
        comparison = typeA.localeCompare(typeB);
      } else if (sortField === 'transactions') {
        comparison = a.transactionCount - b.transactionCount;
      } else if (sortField === 'totalAmount') {
        comparison = a.totalAmount - b.totalAmount;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [collections, searchTerm, sortField, sortDirection]);

  // Available vouchers for collection - only the single latest voucher per student
  const availableVouchers = useMemo(() => {
    // Exclude reversed and carried vouchers
    const validVouchers = vouchers.filter(
      (v) => v.status !== 'Reversed' && v.status !== 'Carried'
    );

    // Sort valid vouchers so newest ones (by month, date, voucherNo) are evaluated first
    const sorted = [...validVouchers].sort((a, b) => {
      // 1. Month comparison (descending, e.g. '2026-08' > '2026-07')
      const monthDiff = (b.month || '').localeCompare(a.month || '');
      if (monthDiff !== 0) return monthDiff;

      // 2. Issue date or created date comparison (descending)
      const dateA = a.issueDate || a.createdDate || '';
      const dateB = b.issueDate || b.createdDate || '';
      const dateDiff = dateB.localeCompare(dateA);
      if (dateDiff !== 0) return dateDiff;

      // 3. Voucher number comparison (descending)
      return (b.voucherNo || '').localeCompare(a.voucherNo || '');
    });

    // Group by studentId and pick only the latest voucher for each student
    const studentLatestMap = new Map<string, FeeVoucher>();
    for (const v of sorted) {
      if (!studentLatestMap.has(v.studentId)) {
        studentLatestMap.set(v.studentId, v);
      }
    }

    return Array.from(studentLatestMap.values());
  }, [vouchers]);

  const selectedVoucher = vouchers.find((v) => v.id === selectedVoucherId);
  const selectedStudent = selectedVoucher ? students.find((s) => s.id === selectedVoucher.studentId) : undefined;
  const selectedClass = selectedVoucher ? classes.find((c) => c.id === selectedVoucher.classId) : undefined;

  // Dynamic calculations based on edited line items
  const dynamicNetDue = useMemo(() => {
    if (directItems.length > 0) {
      return roundUpToMultiple(
        directItems.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
        getEffectiveMultiple(roundingEnabled, roundingMultiple, selectedVoucher?.roundingMultiple)
      );
    }
    return selectedVoucher ? selectedVoucher.netDue : 0;
  }, [directItems, selectedVoucher, roundingEnabled, roundingMultiple]);

  const dynamicRemaining = useMemo(() => {
    if (!selectedVoucher) return 0;
    return Math.max(0, dynamicNetDue - selectedVoucher.amountPaid);
  }, [dynamicNetDue, selectedVoucher]);

  const selectedRemaining = dynamicRemaining;

  // Open Direct Collection Modal
  const handleOpenDirectCollection = (preSelectedVoucher?: FeeVoucher) => {
    if (preSelectedVoucher) {
      setSelectedVoucherId(preSelectedVoucher.id);
      setDirectItems(preSelectedVoucher.particulars.map((p) => ({ ...p })));
      const remaining = Math.max(0, preSelectedVoucher.netDue - preSelectedVoucher.amountPaid);
      setDirectAmount(remaining > 0 ? remaining : preSelectedVoucher.netDue);
      setIsChangingVoucher(false);
      setIsVoucherPickerOpen(false);
    } else {
      setSelectedVoucherId('');
      setDirectItems([]);
      setDirectAmount('');
      setIsChangingVoucher(true);
      setIsVoucherPickerOpen(false);
    }

    setDirectSearch('');
    setHighlightedVoucherIndex(0);
    setDirectMode(DEFAULT_PAYMENT_MODE);
    setDirectRef('');
    setDirectDate(new Date().toISOString().split('T')[0]);
    setDirectNotes('');
    setShowDirectModal(true);
  };

  const handleSelectVoucher = (vId: string) => {
    setSelectedVoucherId(vId);
    setIsChangingVoucher(false);
    setIsVoucherPickerOpen(false);
    setDirectSearch('');
    const v = vouchers.find((item) => item.id === vId);
    if (v) {
      setDirectItems(v.particulars.map((p) => ({ ...p })));
      const remaining = Math.max(0, v.netDue - v.amountPaid);
      setDirectAmount(remaining > 0 ? remaining : v.netDue);
    } else {
      setDirectItems([]);
      setDirectAmount('');
    }
  };

  const handlePickerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isVoucherPickerOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsVoucherPickerOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedVoucherIndex((prev) =>
        prev < searchedVouchers.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedVoucherIndex((prev) =>
        prev > 0 ? prev - 1 : Math.max(0, searchedVouchers.length - 1)
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchedVouchers[highlightedVoucherIndex]) {
        handleSelectVoucher(searchedVouchers[highlightedVoucherIndex].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsVoucherPickerOpen(false);
    }
  };

  const handleSaveLineItemsOnly = () => {
    if (!selectedVoucher) return;
    const res = updateVoucherParticulars(selectedVoucher.id, directItems);
    if (res.success) {
      showToast('Voucher line items and totals updated successfully!', 'success');
    } else {
      showToast(res.error || 'Failed to update voucher particulars', 'error');
    }
  };

  const handleOpenTransactionReceipt = (t: PaymentTransaction) => {
    const vch = vouchers.find((v) => v.id === t.voucherId);
    const stu = students.find((s) => s.id === t.studentId);
    const cls = classes.find((c) => c.id === stu?.classId || c.id === vch?.classId);
    if (!vch || !stu) {
      showToast('Could not find voucher or student record for this receipt.', 'error');
      return;
    }
    setReceiptModalData({
      transaction: t,
      voucher: vch,
      student: stu,
      schoolClass: cls,
    });
    setReceiptInitialIndex(0);
    setShowReceiptModal(true);
  };

  const handleOpenCollectionReceipts = (col: FeeCollection, initialStudentTxnId?: string) => {
    const colTxns = transactions.filter((t) => t.collectionId === col.id);
    if (colTxns.length === 0) {
      showToast('No transactions found in this collection session.', 'error');
      return;
    }
    const receipts: PaymentReceiptData[] = [];
    colTxns.forEach((t) => {
      const vch = vouchers.find((v) => v.id === t.voucherId);
      const stu = students.find((s) => s.id === t.studentId);
      const cls = classes.find((c) => c.id === stu?.classId || c.id === vch?.classId);
      if (vch && stu) {
        receipts.push({
          transaction: t,
          voucher: vch,
          student: stu,
          schoolClass: cls,
          collectionDate: col.date,
        });
      }
    });

    if (receipts.length === 0) {
      showToast('Could not find voucher or student records for this collection.', 'error');
      return;
    }

    let initialIdx = 0;
    if (initialStudentTxnId) {
      const foundIdx = receipts.findIndex((r) => r.transaction.id === initialStudentTxnId);
      if (foundIdx >= 0) initialIdx = foundIdx;
    }

    setReceiptModalData(receipts);
    setReceiptInitialIndex(initialIdx);
    setShowReceiptModal(true);
  };

  const handleSaveDirectPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVoucher) {
      showToast('Please select a valid fee voucher.', 'error');
      return;
    }

    const numAmount = Number(directAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Collection amount must be a positive number greater than zero.', 'error');
      return;
    }

    const res = collectVoucherPayment(
      selectedVoucher.id,
      numAmount,
      directMode,
      directRef.trim() || undefined,
      directNotes.trim() || undefined,
      directDate,
      directItems
    );

    if (res.success && res.transaction) {
      showToast(
        `Recorded ${formatCurrency(numAmount)} payment for ${selectedVoucher.voucherNo} (${selectedStudent?.name || 'Student'}).`,
        'success'
      );
      setShowDirectModal(false);

      const targetStudent = selectedStudent || students.find((s) => s.id === selectedVoucher.studentId);
      const studentClass = classes.find((c) => c.id === targetStudent?.classId || c.id === selectedVoucher.classId);
      const updatedAmountPaid = (selectedVoucher.amountPaid || 0) + numAmount;
      const updatedNetDue = dynamicNetDue > 0 ? dynamicNetDue : selectedVoucher.netDue;

      setReceiptModalData({
        transaction: res.transaction,
        voucher: {
          ...selectedVoucher,
          particulars: directItems.length > 0 ? directItems : selectedVoucher.particulars,
          amountPaid: updatedAmountPaid,
          netDue: updatedNetDue,
          status: updatedAmountPaid >= updatedNetDue && updatedNetDue > 0 ? 'Paid' : 'Partial',
        },
        student: targetStudent!,
        schoolClass: studentClass,
      });
      setShowReceiptModal(true);
    } else {
      showToast(res.error || 'Failed to record fee collection', 'error');
    }
  };

  // Bulk CSV Parsing & File Upload (Matched by Student Reg #)
  const processCsvFile = (file: File) => {
    if (!file) return;
    setBulkImportStatus({ message: null, error: null });

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text || !text.trim()) {
          setBulkImportStatus({ message: null, error: 'The uploaded CSV file is empty.' });
          return;
        }

        const rawLines = text
          .split(/\r\n|\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (rawLines.length === 0) {
          setBulkImportStatus({ message: null, error: 'No data rows found in the CSV file.' });
          return;
        }

        const normalizeDate = (rawDate: string): string => {
          if (!rawDate || !rawDate.trim()) {
            return new Date().toISOString().split('T')[0];
          }
          const str = rawDate.trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            return str;
          }
          const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
          if (dmyMatch) {
            const p1 = parseInt(dmyMatch[1], 10);
            const p2 = parseInt(dmyMatch[2], 10);
            const year = dmyMatch[3];
            if (p2 > 12 && p1 <= 12) {
              return `${year}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
            }
            return `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
          }
          const parsed = new Date(str);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
          }
          return new Date().toISOString().split('T')[0];
        };

        const delimiter = detectCsvDelimiter(rawLines[0]);
        const { map: colMap, error: headerError } = mapCsvHeader(parseCsvLine(rawLines[0], [delimiter]), COLLECTION_CSV);
        if (headerError) {
          setBulkImportStatus({ message: null, error: headerError });
          return;
        }
        const dataLines = rawLines.slice(1);

        if (dataLines.length === 0) {
          setBulkImportStatus({ message: null, error: 'CSV file contains only a header row and no data records.' });
          return;
        }

        const seenRegNos = new Set<string>();
        const parsed: typeof bulkPreviewRows = [];

        dataLines.forEach((line, idx) => {
          const parts = parseCsvLine(line, [delimiter]);
          if (parts.length < 2 || parts.every((p) => !p)) return;

          const rawReg = (parts[colMap.regNo] || '').trim();
          const rawAmt = parts[colMap.amount] || '0';
          const rawFine = colMap.fine >= 0 && parts[colMap.fine] !== undefined ? parts[colMap.fine].trim() : '';
          const rawDate = colMap.date >= 0 && parts[colMap.date] ? parts[colMap.date].trim() : '';
          const rawMode = colMap.paymentMode >= 0 && parts[colMap.paymentMode] ? parts[colMap.paymentMode].trim() : '';
          const rawRef = colMap.refNo >= 0 && parts[colMap.refNo] ? parts[colMap.refNo].trim() : '';

          const amount = parseFloat(rawAmt.replace(/[^0-9.-]+/g, '')) || 0;
          let fineValue: number | undefined = undefined;
          if (rawFine !== '') {
            const cleanFineStr = rawFine.replace(/[^0-9.-]+/g, '');
            if (cleanFineStr !== '' && cleanFineStr !== '-') {
              const parsedFine = parseFloat(cleanFineStr);
              if (!isNaN(parsedFine)) {
                fineValue = parsedFine;
              }
            }
          }

          const cleanReg = rawReg.toLowerCase();
          const rowDate = normalizeDate(rawDate);

          // Match student by Registration Number (Reg #)
          const student = students.find(
            (s) =>
              s.regNo.trim().toLowerCase() === cleanReg ||
              s.studentNo.trim().toLowerCase() === cleanReg
          );

          const studentClass = student ? classes.find((c) => c.id === student.classId) : undefined;

          // Find voucher in the active working month
          const targetVoucher = student
            ? vouchers.find((v) => v.studentId === student.id && v.month === activeMonth)
            : undefined;

          const alreadyPaid = targetVoucher?.amountPaid || 0;
          const originalNetDue = targetVoucher?.netDue || 0;
          let netDue = originalNetDue;

          // If fine column is provided and voucher exists, add the fine to the voucher
          if (targetVoucher && fineValue !== undefined && fineValue !== 0) {
            const simulatedParticulars = targetVoucher.particulars.map((p) => ({ ...p }));
            const fineIndex = simulatedParticulars.findIndex((p) => p.kind === 'Fine');
            if (fineIndex >= 0) {
              simulatedParticulars[fineIndex] = {
                ...simulatedParticulars[fineIndex],
                amount: simulatedParticulars[fineIndex].amount + fineValue,
              };
            } else {
              simulatedParticulars.push({
                kind: 'Fine',
                label: 'Fine',
                amount: fineValue,
              });
            }

            const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, targetVoucher.roundingMultiple);
            netDue = roundUpToMultiple(
              simulatedParticulars.reduce((sum, p) => sum + p.amount, 0),
              mult
            );
          }

          const remainingBalance = Math.max(0, netDue - alreadyPaid);

          let isValid = true;
          let errorMsg: string | undefined;

          if (!rawReg) {
            isValid = false;
            errorMsg = 'Missing Reg #';
          } else if (!student) {
            isValid = false;
            errorMsg = `No student found with Reg # "${rawReg}"`;
          } else if (!targetVoucher) {
            isValid = false;
            errorMsg = `No voucher issued for ${formatMonthName(activeMonth)}`;
          } else if (targetVoucher.status === 'Carried') {
            isValid = false;
            errorMsg = `Voucher carried forward`;
          } else if (targetVoucher.status === 'Reversed') {
            isValid = false;
            errorMsg = `Voucher reversed (cannot collect)`;
          } else if (amount <= 0) {
            isValid = false;
            errorMsg = 'Amount must be > 0';
          } else if (rawMode && !normalizePaymentMode(rawMode)) {
            isValid = false;
            errorMsg = `Invalid payment mode "${rawMode}" (use ${PAYMENT_MODES.join(', ')})`;
          }

          const isDuplicate = cleanReg ? seenRegNos.has(cleanReg) : false;
          if (cleanReg && isValid) {
            seenRegNos.add(cleanReg);
          }

          parsed.push({
            id: `row-${idx}-${Date.now()}`,
            regNo: rawReg || (student?.regNo ?? 'N/A'),
            amount,
            fine: fineValue,
            date: rowDate,
            paymentMode: normalizePaymentMode(rawMode) || DEFAULT_PAYMENT_MODE,
            refNo: rawRef,
            studentId: student?.id,
            studentName: student?.name,
            className: studentClass?.name,
            voucherId: targetVoucher?.id,
            voucherNo: targetVoucher?.voucherNo,
            originalNetDue,
            netDue,
            alreadyPaid,
            remainingBalance,
            // Duplicate Reg # in the same file is flagged for visibility but
            // no longer forces the row invalid/unselectable -- an admin may
            // legitimately be recording two payments for the same student
            // in one file, so it's a warning, not a block.
            isValid,
            isDuplicate,
            selected: isValid,
            errorMsg: isDuplicate ? `Duplicate Reg # in file (still importable)` : errorMsg,
          });
        });

        if (parsed.length === 0) {
          setBulkImportStatus({ message: null, error: 'Could not extract any valid records from CSV file.' });
          return;
        }

        setBulkPreviewRows(parsed);
      } catch (err: any) {
        setBulkImportStatus({ message: null, error: `Failed to parse CSV file: ${err?.message || 'Unknown error'}` });
      }
    };

    reader.readAsText(file);
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processCsvFile(file);
    }
  };

  const handleToggleRow = (id: string) => {
    setBulkPreviewRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleToggleSelectAll = () => {
    const validRows = bulkPreviewRows.filter((r) => r.isValid);
    const allSelected = validRows.every((r) => r.selected);
    setBulkPreviewRows((prev) =>
      prev.map((r) =>
        r.isValid ? { ...r, selected: !allSelected } : r
      )
    );
  };

  const handleCommitBulkImport = () => {
    const validSelectedRows = bulkPreviewRows.filter((r) => r.selected && r.isValid);
    if (validSelectedRows.length === 0) {
      showToast('No valid rows selected for import.', 'error');
      return;
    }

    const res = bulkCsvCollection(
      validSelectedRows.map((r) => ({
        regNo: r.regNo,
        studentId: r.studentId,
        voucherId: r.voucherId,
        amount: r.amount,
        fine: r.fine,
        paymentMode: r.paymentMode,
        refNo: r.refNo,
        date: r.date,
      })),
      activeMonth
    );

    if (res.success) {
      showToast(`Successfully recorded payment collections for ${res.successCount} student(s)!`, 'success');
      setShowBulkModal(false);
      setBulkPreviewRows([]);
      setBulkImportStatus({ message: null, error: null });
    } else {
      showToast('Failed to import CSV collections: ' + res.errors.join('; '), 'error');
    }
  };

  const handleDownloadSampleBulkCsv = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const sampleVouchers = vouchers.filter((v) => v.month === activeMonth && v.status !== 'Reversed').slice(0, 4);
    const sampleCols = COLLECTION_CSV.columns;
    let sampleContent = `${[sampleCols.regNo, sampleCols.amount, sampleCols.fine, sampleCols.date, sampleCols.paymentMode, sampleCols.refNo].join(',')}\n`;
    if (sampleVouchers.length > 0) {
      sampleVouchers.forEach((v, i) => {
        const student = students.find((s) => s.id === v.studentId);
        const regNo = student?.regNo || `REG-${1001 + i}`;
        const remaining = Math.max(0, v.netDue - v.amountPaid);
        const sampleFine = i === 0 ? 500 : 0;
        sampleContent += `${regNo},${remaining > 0 ? remaining : v.netDue},${sampleFine},${todayStr},BankDeposit,BANK-${1000 + i}\n`;
      });
    } else {
      const sampleStudents = students.slice(0, 3);
      if (sampleStudents.length > 0) {
        sampleStudents.forEach((s, i) => {
          const sampleFine = i === 0 ? 500 : 0;
          sampleContent += `${s.regNo},5000,${sampleFine},${todayStr},BankDeposit,BANK-${1001 + i}\n`;
        });
      } else {
        sampleContent += `REG-1001,8000,500,${todayStr},BankDeposit,TXN-9811\nREG-1002,3200,0,${todayStr},SchoolCashier,DESK-402\nREG-1003,4500,0,${todayStr},OnlineTransfer,ONL-9021\n`;
      }
    }

    downloadCsv(`Skooler_Bulk_Collection_Sample_${activeMonth}.csv`, sampleContent);
  };

  // CSV Export & Copy for Fee Collections & Payment Ledger
  const [copiedCsv, setCopiedCsv] = useState(false);

  const generateCollectionsCsvContent = () => {
    const headers = [
      'Collection Session #',
      'Collection Date',
      'Collection Type',
      'Transaction #',
      'Transaction Date',
      CSV_VOUCHER_NO,
      CSV_FEE_MONTH,
      CSV_REG_NO,
      CSV_STUDENT_NAME,
      CSV_CLASS,
      CSV_PAYMENT_MODE,
      CSV_REFERENCE_NO,
      `Amount Paid (${getCurrencyCode()})`,
      `Session Total (${getCurrencyCode()})`,
      'Notes',
    ];

    const rows: (string | number)[][] = [];
    let grandTotal = 0;

    sortedCollections.forEach((col) => {
      const colTxns = transactions.filter((t) => t.collectionId === col.id);

      if (colTxns.length === 0) {
        rows.push([
          `"${col.collectionNo}"`,
          `"${col.date}"`,
          `"${col.isBulkImport ? 'Bulk CSV Import' : 'Direct Collection'}"`,
          '""',
          '""',
          '""',
          '""',
          '""',
          '""',
          '""',
          '""',
          '""',
          col.totalAmount,
          col.totalAmount,
          `"${(col.notes || '').replace(/"/g, '""')}"`,
        ]);
        grandTotal += col.totalAmount;
      } else {
        colTxns.forEach((t) => {
          const vch = vouchers.find((v) => v.id === t.voucherId);
          const stu = students.find((s) => s.id === t.studentId);
          const cls = stu ? classes.find((c) => c.id === stu.classId) : undefined;
          grandTotal += t.amount;

          rows.push([
            `"${col.collectionNo}"`,
            `"${col.date}"`,
            `"${col.isBulkImport ? 'Bulk CSV Import' : 'Direct Collection'}"`,
            `"${t.txnNo}"`,
            `"${t.date}"`,
            `"${vch?.voucherNo || ''}"`,
            `"${vch?.month ? formatMonthName(vch.month) : ''}"`,
            `"${stu?.regNo || ''}"`,
            `"${(stu?.name || '').replace(/"/g, '""')}"`,
            `"${cls?.name || ''}"`,
            `"${t.paymentMode}"`,
            `"${(t.referenceNo || '').replace(/"/g, '""')}"`,
            t.amount,
            col.totalAmount,
            `"${(t.notes || col.notes || '').replace(/"/g, '""')}"`,
          ]);
        });
      }
    });

    // Grand total row
    rows.push([
      '"TOTAL"',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      grandTotal,
      grandTotal,
      '""',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  };

  const handleExportCsv = () => {
    if (sortedCollections.length === 0) {
      showToast('No collection records to export.', 'error');
      return;
    }

    const csvContent = generateCollectionsCsvContent();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `Fee_Collections_Payment_Ledger_${activeMonth}_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${sortedCollections.length} collection session(s) to CSV.`, 'success');
  };

  const handleCopyCsvToClipboard = () => {
    if (sortedCollections.length === 0) {
      showToast('No collection records to copy.', 'error');
      return;
    }

    const csvContent = generateCollectionsCsvContent();
    navigator.clipboard.writeText(csvContent);
    setCopiedCsv(true);
    showToast('Collection payment ledger CSV copied to clipboard!', 'success');
    setTimeout(() => setCopiedCsv(false), 3000);
  };

  const handleDeleteSession = (col: FeeCollection) => {
    setCollectionToDelete(col);
  };

  const handleConfirmDeleteSession = () => {
    if (!collectionToDelete) return;
    deleteCollection(collectionToDelete.id);
    showToast(`Collection session ${collectionToDelete.collectionNo} deleted.`, 'success');
    setCollectionToDelete(null);
  };

  // Filtered voucher options for direct payment search & picker
  const searchedVouchers = useMemo(() => {
    if (!directSearch.trim()) return availableVouchers;
    const term = directSearch.toLowerCase().trim();
    return availableVouchers.filter((v) => {
      const stu = students.find((s) => s.id === v.studentId);
      const cls = classes.find((c) => c.id === v.classId);
      return (
        v.voucherNo.toLowerCase().includes(term) ||
        (v.month && v.month.toLowerCase().includes(term)) ||
        (v.status && v.status.toLowerCase().includes(term)) ||
        (stu && (
          stu.name.toLowerCase().includes(term) ||
          stu.studentNo.toLowerCase().includes(term) ||
          stu.regNo.toLowerCase().includes(term) ||
          (stu.fatherName && stu.fatherName.toLowerCase().includes(term))
        )) ||
        (cls && cls.name.toLowerCase().includes(term))
      );
    });
  }, [availableVouchers, directSearch, students, classes]);

  return (
    <div className="space-y-6 relative">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-teal-600" />
            Fee Collections & Payment Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Record direct fee payments, enter partial/remaining balances, and bulk import bank collection CSVs for {formatMonthName(activeMonth)}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Grid</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
              <span>List</span>
            </button>
          </div>

          {/* Export CSV & Copy Toolbar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-collections-export-csv"
              onClick={handleExportCsv}
              disabled={sortedCollections.length === 0}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl text-xs border border-slate-200 shadow-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-100"
              title={sortedCollections.length === 0 ? 'No collection records to export' : 'Download Fee Collections & Payment Ledger as CSV'}
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              id="btn-collections-copy-csv"
              onClick={handleCopyCsvToClipboard}
              disabled={sortedCollections.length === 0}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl text-xs border border-slate-200 shadow-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-100"
              title={sortedCollections.length === 0 ? 'No collection records to copy' : 'Copy Collections & Payment Ledger CSV data to clipboard'}
            >
              {copiedCsv ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-600" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {hasPermission('fees.collect') && (
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                id="btn-record-payment"
                onClick={() => handleOpenDirectCollection()}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Record Payment
              </button>
              <button
                type="button"
                id="btn-bulk-csv-import"
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
                title="Bulk import fee collections from CSV"
              >
                <Upload className="w-4 h-4" />
                Bulk CSV Import
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search & Stats Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search collections by session #, date, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </div>
        <div className="flex items-center gap-4 text-slate-500 font-medium">
          <div>
            Showing <span className="font-bold text-slate-800">{sortedCollections.length}</span> of{' '}
            <span className="font-bold text-slate-800">{collections.length}</span> session(s)
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="text-emerald-700 font-bold">
            Total: {formatCurrency(sortedCollections.reduce((sum, c) => sum + c.totalAmount, 0))}
          </div>
          {historyFrom && historyFrom > '0000-01' && (
            <button
              type="button"
              onClick={() => void ensureHistoryLoaded('0000-01')}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 cursor-pointer"
              title="Closed months are loaded on demand"
            >
              Load older sessions
            </button>
          )}
        </div>
      </div>

      {/* Collections Grid View */}
      {viewMode === 'grid' && (
        <div className="space-y-4">
          {sortedCollections.length > 0 ? (
            sortedCollections.map((col) => {
              const colTxns = transactions.filter((t) => t.collectionId === col.id);

              return (
                <div
                  key={col.id}
                  style={{
                    background: `linear-gradient(160deg, ${preset.lightBg}40 0%, #ffffff 35%, #ffffff 100%)`,
                  }}
                  className="rounded-2xl border border-slate-200/80 hover:border-slate-300 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
                >
                  {/* Theme Accent Bar */}
                  <div
                    className="h-1.5 w-full"
                    style={{
                      background: `linear-gradient(90deg, ${preset.primaryColor} 0%, ${preset.hoverColor} 100%)`,
                    }}
                  />

                  <div className="p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl border flex items-center justify-center font-bold shadow-2xs"
                          style={{
                            backgroundColor: preset.lightBg,
                            borderColor: preset.lightBorder,
                            color: preset.primaryColor,
                          }}
                        >
                          <Receipt className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-base">{col.collectionNo}</h3>
                            {col.isBulkImport ? (
                              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                                Bulk CSV Import
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                                Direct Collection
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-mono">
                            Date: {col.date} &bull; {col.transactionCount} Transaction(s)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-emerald-600">
                          {formatCurrency(col.totalAmount)}
                        </span>
                        {colTxns.length > 1 ? (
                          <button
                            onClick={() => handleOpenCollectionReceipts(col)}
                            title={`View & print all ${colTxns.length} payment receipts in batch`}
                            className="px-2.5 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 hover:text-teal-800 border border-teal-200 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Batch Receipts ({colTxns.length})</span>
                          </button>
                        ) : colTxns.length === 1 ? (
                          <button
                            onClick={() => handleOpenCollectionReceipts(col)}
                            title="Print Payment Receipt Slip"
                            className="px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 hover:text-teal-800 border border-teal-200 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Receipt</span>
                          </button>
                        ) : null}
                        {hasPermission('fees.delete') && (
                          <button
                            onClick={() => handleDeleteSession(col)}
                            title="Delete Collection Session"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                  {/* Sub Transactions List (Collapsible) */}
                  <div className="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => toggleCollectionCollapse(col.id)}
                      className="w-full flex items-center justify-between text-left py-1 group cursor-pointer select-none rounded-lg hover:bg-slate-50/80 px-1 -mx-1 transition"
                      title={expandedCollections[col.id] ? 'Hide itemized transactions' : 'Show itemized transactions'}
                    >
                      <div className="flex items-center gap-2">
                        <h4 className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900 uppercase tracking-wider transition">
                          Itemized Voucher Payment Transactions:
                        </h4>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {colTxns.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 group-hover:text-teal-700 transition">
                        <span>{expandedCollections[col.id] ? 'Hide' : 'Show'}</span>
                        {expandedCollections[col.id] ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 transition" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 transition" />
                        )}
                      </div>
                    </button>

                    {expandedCollections[col.id] && (
                      <div className="divide-y divide-slate-100 bg-slate-50/70 rounded-xl border border-slate-100 text-xs overflow-hidden transition-all duration-200">
                        {colTxns.map((t) => {
                          const vch = vouchers.find((v) => v.id === t.voucherId);
                          const stu = students.find((s) => s.id === t.studentId);

                          return (
                            <div key={t.id} className="p-2.5 flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className="font-mono font-bold text-slate-800 text-[11px]">
                                  {t.txnNo}
                                </span>
                                <StudentAvatar photoUrl={stu?.photoUrl} name={stu?.name || 'Student'} size="xs" />
                                <span className="font-bold text-slate-900">{stu?.name}</span>
                                <span className="text-slate-400 text-[11px] font-mono">
                                  ({vch?.voucherNo})
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                                  {paymentModeText(t.paymentMode)} {t.referenceNo ? `(${t.referenceNo})` : ''}
                                </span>
                                <span className="font-bold text-emerald-700">
                                  {formatCurrency(t.amount)}
                                </span>
                                <button
                                  onClick={() => handleOpenCollectionReceipts(col, t.id)}
                                  title={`View & print payment receipt for ${stu?.name || 'student'}`}
                                  className="px-2 py-0.5 text-[11px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 hover:text-teal-800 border border-teal-200 rounded flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Slip</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
          ) : (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 italic">
              No fee collection sessions recorded yet. Click "Record Payment" to record a collection.
            </div>
          )}
        </div>
      )}

      {/* Collections List Table View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr className="whitespace-nowrap select-none">
                  <th
                    onClick={() => handleSort('sr')}
                    className="p-3.5 w-14 text-center whitespace-nowrap cursor-pointer hover:bg-slate-100/90 group transition"
                    title="Sort by Serial / Chronological Order"
                  >
                    <div className="inline-flex items-center justify-center gap-1">
                      <span>Sr #</span>
                      {renderSortIndicator('sr')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('date')}
                    className="p-3.5 w-28 whitespace-nowrap cursor-pointer hover:bg-slate-100/90 group transition"
                    title="Sort by Date"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Date</span>
                      {renderSortIndicator('date')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('type')}
                    className="p-3.5 w-32 whitespace-nowrap cursor-pointer hover:bg-slate-100/90 group transition"
                    title="Sort by Type / Source"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Type / Source</span>
                      {renderSortIndicator('type')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('transactions')}
                    className="p-3.5 w-24 text-center whitespace-nowrap cursor-pointer hover:bg-slate-100/90 group transition"
                    title="Sort by Number of Transactions"
                  >
                    <div className="inline-flex items-center justify-center gap-1">
                      <span>Transactions</span>
                      {renderSortIndicator('transactions')}
                    </div>
                  </th>
                  <th className="p-3.5 whitespace-nowrap">Voucher & Student Summary</th>
                  <th
                    onClick={() => handleSort('totalAmount')}
                    className="p-3.5 w-32 text-right whitespace-nowrap cursor-pointer hover:bg-slate-100/90 group transition"
                    title="Sort by Total Amount Collected"
                  >
                    <div className="inline-flex items-center justify-end gap-1">
                      <span>Total Collected</span>
                      {renderSortIndicator('totalAmount')}
                    </div>
                  </th>
                  <th className="p-3.5 text-right w-24 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedCollections.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-slate-400 italic"
                    >
                      No fee collection sessions match your search.
                    </td>
                  </tr>
                ) : (
                  sortedCollections.map((col, idx) => {
                    const colTxns = transactions.filter((t) => t.collectionId === col.id);

                    return (
                      <tr key={col.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3.5 text-center font-bold text-slate-500 font-mono whitespace-nowrap">
                          {idx + 1}
                        </td>
                        <td className="p-3.5 text-slate-600 whitespace-nowrap font-mono">
                          {col.date}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          {col.isBulkImport ? (
                            <span className="inline-flex items-center text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
                              Bulk CSV Import
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                              Direct Collection
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-700 whitespace-nowrap">
                          {col.transactionCount}
                        </td>
                        <td className="p-3.5">
                          <button
                            type="button"
                            onClick={() => toggleCollectionCollapse(col.id)}
                            aria-expanded={!!expandedCollections[col.id]}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-teal-700 transition cursor-pointer select-none"
                          >
                            <span>
                              {expandedCollections[col.id] ? 'Hide' : 'Show'} {colTxns.length} student{colTxns.length === 1 ? '' : 's'}
                            </span>
                            {expandedCollections[col.id] ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {expandedCollections[col.id] && (
                          <div className="flex flex-wrap items-center gap-1.5 max-w-xl mt-1.5">
                            {colTxns.map((t) => {
                              const stu = students.find((s) => s.id === t.studentId);
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => handleOpenCollectionReceipts(col, t.id)}
                                  title={`View & print payment receipt for ${stu?.name || 'student'}`}
                                  className="inline-flex items-center gap-1 bg-slate-100 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 text-slate-700 hover:text-teal-800 text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap transition cursor-pointer"
                                >
                                  <StudentAvatar photoUrl={stu?.photoUrl} name={stu?.name || 'Student'} size="xs" />
                                  <span>{stu?.name || 'Student'}</span>
                                  <span className="text-emerald-700 font-bold ml-0.5">({formatCurrency(t.amount)})</span>
                                </button>
                              );
                            })}
                          </div>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-sm text-emerald-700 whitespace-nowrap">
                          {formatCurrency(col.totalAmount)}
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {colTxns.length > 1 ? (
                              <button
                                onClick={() => handleOpenCollectionReceipts(col)}
                                title={`View & print all ${colTxns.length} payment receipts in batch`}
                                className="px-2 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                <span>Receipts ({colTxns.length})</span>
                              </button>
                            ) : colTxns.length === 1 ? (
                              <button
                                onClick={() => handleOpenCollectionReceipts(col)}
                                title="Print Payment Receipt"
                                className="p-1.5 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded-lg transition cursor-pointer"
                              >
                                <Receipt className="w-4 h-4" />
                              </button>
                            ) : null}
                            {hasPermission('fees.delete') && (
                              <button
                                onClick={() => handleDeleteSession(col)}
                                title="Delete Collection Session"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Direct Quick Payment / Collection Modal */}
      {showDirectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-3 sm:p-5 shadow-2xl space-y-3 my-auto animate-in fade-in duration-200 border border-slate-200/80 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 shrink-0">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                  <Coins className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">Record Fee Collection</h3>
                    {selectedVoucher && (
                      <>
                        <span className="font-mono font-bold text-[11px] sm:text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                          {selectedVoucher.voucherNo}
                        </span>
                        <span
                          className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            selectedVoucher.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : selectedVoucher.status === 'Partial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {selectedVoucher.status}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate hidden xs:block">
                    Collect full, remaining, or partial fee payments directly
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDirectModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Header Voucher Ribbon: Search & Select OR Student Summary Card */}
            {!selectedVoucher || isChangingVoucher ? (
              <div
                ref={voucherPickerContainerRef}
                className="bg-slate-50/95 rounded-xl p-2.5 sm:p-3 border border-slate-200 space-y-2 shrink-0 relative"
              >
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[11px] text-slate-700 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Search & Select Fee Voucher *</span>
                    <span className="text-[10px] font-normal text-slate-400 hidden sm:inline">
                      ({searchedVouchers.length} latest student vouchers)
                    </span>
                  </label>
                  {selectedVoucher && isChangingVoucher && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsChangingVoucher(false);
                        setIsVoucherPickerOpen(false);
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold hover:underline cursor-pointer"
                    >
                      Keep {selectedVoucher.voucherNo}
                    </button>
                  )}
                </div>

                {/* Integrated Search & Picker Combobox */}
                <div className="relative">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={voucherInputRef}
                      type="text"
                      placeholder="Search by student name, Reg #, voucher #, class..."
                      value={directSearch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDirectSearch(val);
                        setHighlightedVoucherIndex(0);
                        setIsVoucherPickerOpen(val.trim().length > 0);
                      }}
                      onKeyDown={handlePickerKeyDown}
                      className="w-full h-10 pl-9 pr-16 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition shadow-xs"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {directSearch ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDirectSearch('');
                            setHighlightedVoucherIndex(0);
                            voucherInputRef.current?.focus();
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition cursor-pointer"
                          title="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setIsVoucherPickerOpen((prev) => !prev);
                          if (!isVoucherPickerOpen) {
                            voucherInputRef.current?.focus();
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition cursor-pointer"
                        title="Toggle voucher list"
                      >
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                            isVoucherPickerOpen ? 'rotate-180 text-emerald-600' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Dropdown Popover List */}
                  {isVoucherPickerOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 ring-1 ring-slate-900/10">
                      {searchedVouchers.length > 0 ? (
                        searchedVouchers.slice(0, 100).map((v, index) => {
                          const s = students.find((stu) => stu.id === v.studentId);
                          const cls = classes.find((c) => c.id === v.classId);
                          const rem = Math.max(0, v.netDue - v.amountPaid);
                          const excess = v.amountPaid > v.netDue ? v.amountPaid - v.netDue : 0;
                          const isSelected = v.id === selectedVoucherId;
                          const isHighlighted = index === highlightedVoucherIndex;

                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => handleSelectVoucher(v.id)}
                              onMouseEnter={() => setHighlightedVoucherIndex(index)}
                              className={`w-full text-left p-2.5 transition flex items-center justify-between gap-3 cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-50 font-medium'
                                  : isHighlighted
                                  ? 'bg-slate-50'
                                  : 'hover:bg-slate-50/80'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <StudentAvatar
                                  photoUrl={s?.photoUrl}
                                  name={s?.name || 'Student'}
                                  size="sm"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-900 text-xs truncate">
                                      {s?.name || 'Unknown Student'}
                                    </span>
                                    {s?.regNo && (
                                      <span className="text-[10px] font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200/60 px-1.5 py-0.2 rounded shrink-0">
                                        {s.regNo}
                                      </span>
                                    )}
                                    {cls && (
                                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded shrink-0 font-medium">
                                        {cls.name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className="font-bold text-slate-700">{v.voucherNo}</span>
                                    <span>&bull;</span>
                                    <span className="text-slate-600 font-sans">{formatMonthName(v.month)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Balance & Status Tag */}
                              <div className="text-right shrink-0 flex flex-col items-end gap-1">
                                <div>
                                  {rem > 0 ? (
                                    <span className="font-mono font-bold text-xs text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md">
                                      Bal: {formatCurrency(rem)}
                                    </span>
                                  ) : excess > 0 ? (
                                    <span className="font-mono font-bold text-xs text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md">
                                      Adv: {formatCurrency(excess)}
                                    </span>
                                  ) : (
                                    <span className="font-mono font-bold text-xs text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md">
                                      Paid in Full
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                                    v.status === 'Paid'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : v.status === 'Partial'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {v.status}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 text-center text-slate-500 text-xs">
                          <p className="font-medium text-slate-700">No fee vouchers found</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Try searching with a different student name, reg #, or voucher number.
                          </p>
                          {directSearch && (
                            <button
                              type="button"
                              onClick={() => {
                                setDirectSearch('');
                                setHighlightedVoucherIndex(0);
                                voucherInputRef.current?.focus();
                              }}
                              className="mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 underline cursor-pointer"
                            >
                              Clear Search
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50/90 rounded-xl p-2.5 sm:px-3 sm:py-2 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
                {/* Student Info */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <StudentAvatar
                    photoUrl={selectedStudent?.photoUrl}
                    name={selectedStudent?.name || 'Student'}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                        {selectedStudent?.name || 'Unknown Student'}
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setIsChangingVoucher(true);
                          setIsVoucherPickerOpen(false);
                          setTimeout(() => {
                            voucherInputRef.current?.focus();
                          }, 50);
                        }}
                        className="text-[10px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 px-1.5 py-0.5 rounded cursor-pointer transition flex items-center gap-1 shrink-0"
                        title="Choose a different voucher"
                      >
                        <Search className="w-2.5 h-2.5" />
                        Change Voucher
                      </button>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 font-mono flex items-center gap-1 sm:gap-1.5 flex-wrap">
                      <span className="font-semibold">{selectedVoucher.voucherNo}</span>
                      {selectedStudent?.regNo && (
                        <>
                          <span>&bull;</span>
                          <span>Reg: {selectedStudent.regNo}</span>
                        </>
                      )}
                      {selectedClass?.name && (
                        <>
                          <span>&bull;</span>
                          <span>Class: {selectedClass.name}</span>
                        </>
                      )}
                      <span>&bull;</span>
                      <span>{formatMonthName(selectedVoucher.month)}</span>
                    </p>
                  </div>
                </div>

                {/* 3 Metric Pills */}
                <div className="grid grid-cols-3 gap-1 sm:gap-1.5 font-mono text-center shrink-0">
                  <div className="bg-white px-1.5 sm:px-2 py-1 rounded-md border border-slate-200 min-w-0">
                    <div className="text-[8px] sm:text-[9px] text-slate-500 font-sans font-medium">Original Due</div>
                    <div className="font-bold text-slate-800 text-[10px] sm:text-xs truncate">
                      {formatCurrency(selectedVoucher.netDue)}
                    </div>
                  </div>
                  <div className="bg-white px-1.5 sm:px-2 py-1 rounded-md border border-slate-200 min-w-0">
                    <div className="text-[8px] sm:text-[9px] text-slate-500 font-sans font-medium">Already Paid</div>
                    <div className="font-bold text-emerald-700 text-[10px] sm:text-xs truncate">
                      {formatCurrency(selectedVoucher.amountPaid)}
                    </div>
                  </div>
                  <div className="bg-emerald-50 px-1.5 sm:px-2 py-1 rounded-md border border-emerald-200 min-w-0">
                    <div className="text-[8px] sm:text-[9px] text-emerald-800 font-sans font-bold">
                      {selectedVoucher.amountPaid >= dynamicNetDue ? 'Settlement' : 'Remaining'}
                    </div>
                    <div className="font-black text-emerald-800 text-[10px] sm:text-xs truncate">
                      {selectedVoucher.amountPaid >= dynamicNetDue
                        ? selectedVoucher.amountPaid > dynamicNetDue
                          ? `+${formatCurrency(selectedVoucher.amountPaid - dynamicNetDue)} Adv`
                          : 'Settled'
                        : formatCurrency(dynamicRemaining)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main Content Grid: Left & Right Panes */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-3.5 items-stretch overflow-y-auto flex-1 min-h-0 pr-0.5">
              {/* Left Pane: Particulars Editor */}
              <div className="lg:col-span-6 flex flex-col min-h-[220px] lg:h-full lg:min-h-0">
                {selectedVoucher ? (
                  <VoucherParticularsEditor
                    compact={true}
                    items={directItems}
                    onChange={(updated) => {
                      setDirectItems(updated);
                      const mult = getEffectiveMultiple(
                        roundingEnabled,
                        roundingMultiple,
                        selectedVoucher?.roundingMultiple
                      );
                      const newNet = Math.max(
                        0,
                        roundUpToMultiple(
                          updated.reduce((s, p) => s + (Number(p.amount) || 0), 0),
                          mult
                        )
                      );
                      const newRem = Math.max(0, newNet - (selectedVoucher.amountPaid || 0));
                      if (Number(directAmount) === selectedRemaining && newRem >= 0) {
                        setDirectAmount(newRem);
                      }
                    }}
                    originalItems={selectedVoucher.particulars}
                    onResetToOriginal={() => {
                      setDirectItems(selectedVoucher.particulars.map((p) => ({ ...p })));
                      const rem = Math.max(0, selectedVoucher.netDue - selectedVoucher.amountPaid);
                      setDirectAmount(rem > 0 ? rem : selectedVoucher.netDue);
                    }}
                    onSaveLineItems={handleSaveLineItemsOnly}
                    amountPaid={selectedVoucher.amountPaid}
                    studentId={selectedVoucher.studentId}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center flex flex-col items-center justify-center h-full min-h-[220px] text-slate-400">
                    <div className="p-2.5 bg-white text-slate-400 rounded-full mb-2 border border-slate-200 shadow-2xs">
                      <Receipt className="w-4 h-4 text-teal-600" />
                    </div>
                    <div className="font-bold text-slate-700 text-xs mb-1">
                      Fee Heads & Breakdown
                    </div>
                    <p className="text-[11px] text-slate-500 max-w-xs">
                      Select a fee voucher in the header above to review, customize, and save particulars.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Pane: Collection Form */}
              <div className="lg:col-span-6 flex flex-col min-h-[260px] lg:h-full lg:min-h-0 w-full">
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs flex flex-col w-full h-full">
                  {/* Header Bar */}
                  <div className="bg-slate-50 border-b border-slate-200 px-2.5 py-1.5 sm:px-3 sm:py-2 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-bold text-xs text-slate-800">Collection & Payment Details</span>
                    </div>
                    {selectedVoucher && (
                      <span className="text-[10px] font-medium text-slate-500 font-mono">
                        {formatMonthName(selectedVoucher.month)}
                      </span>
                    )}
                  </div>

                  {/* Form Content */}
                  <form onSubmit={handleSaveDirectPayment} className="flex flex-col justify-between flex-1 min-h-0 text-xs">
                    <div className="p-3 sm:p-3.5 overflow-y-auto flex-1 space-y-2.5 bg-slate-50/40">
                      {/* Amount Section */}
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                          <label className="block font-bold text-slate-700 text-[11px]">
                            Collection Amount ({getCurrencyCode()}) *
                          </label>
                          {selectedVoucher && dynamicRemaining > 0 ? (
                            <button
                              type="button"
                              onClick={() => setDirectAmount(dynamicRemaining)}
                              className="text-[10px] sm:text-[11px] text-teal-600 hover:text-teal-800 font-bold hover:underline cursor-pointer"
                            >
                              Auto-fill Remaining ({formatCurrency(dynamicRemaining)})
                            </button>
                          ) : selectedVoucher ? (
                            <button
                              type="button"
                              onClick={() => setDirectAmount(dynamicNetDue)}
                              className="text-[10px] sm:text-[11px] text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer"
                            >
                              Fill Voucher Fee ({formatCurrency(dynamicNetDue)})
                            </button>
                          ) : null}
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">
                            {getCurrencyCode()}
                          </span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            disabled={!selectedVoucher}
                            value={directAmount}
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            onChange={(e) =>
                              setDirectAmount(
                                e.target.value === '' ? '' : Number(e.target.value)
                              )
                            }
                            placeholder={selectedVoucher ? "Enter Amount" : "Select voucher first"}
                            className="w-full h-[38px] pl-9 pr-3 bg-white border border-slate-200 rounded-lg font-bold text-sm text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>

                        {/* Quick suggestion chips */}
                        {selectedVoucher && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {dynamicRemaining > 0 ? (
                              <button
                                type="button"
                                onClick={() => setDirectAmount(dynamicRemaining)}
                                className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-md text-[10px] font-bold transition cursor-pointer"
                              >
                                Full Balance: {formatCurrency(dynamicRemaining)}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDirectAmount(dynamicNetDue)}
                                className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-md text-[10px] font-bold transition cursor-pointer"
                              >
                                Fill Fee: {formatCurrency(dynamicNetDue)}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDirectAmount(dynamicNetDue)}
                              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md text-[10px] font-semibold transition cursor-pointer"
                            >
                              Net Due: {formatCurrency(dynamicNetDue)}
                            </button>
                          </div>
                        )}

                        {selectedVoucher &&
                          typeof directAmount === 'number' &&
                          directAmount > dynamicRemaining && (
                            <div className="mt-1.5 flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-md px-2 py-1">
                              <Info className="w-3 h-3 shrink-0" />
                              <span className="text-[10px] font-medium">
                                Excess {formatCurrency(directAmount - dynamicRemaining)} to be held as credit / advance.
                              </span>
                            </div>
                          )}
                      </div>

                      {/* Payment Mode & Date */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                            Payment Mode *
                          </label>
                          <select
                            value={directMode}
                            disabled={!selectedVoucher}
                            onChange={(e) => setDirectMode(e.target.value as any)}
                            className="w-full h-[38px] px-2.5 bg-white border border-slate-200 rounded-lg font-semibold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            <option value="SchoolCashier">School Cashier</option>
                            <option value="BankDeposit">Bank Deposit</option>
                            <option value="OnlineTransfer">Online Transfer</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                            Collection Date *
                          </label>
                          <DatePicker
                            value={directDate}
                            required
                            disabled={!selectedVoucher}
                            themeColor={themeConfig?.color || 'teal'}
                            onChange={(newDate) => setDirectDate(newDate)}
                            idPrefix="collection-direct-date"
                            placeholder="Select Collection Date"
                            className="w-full"
                          />
                        </div>
                      </div>

                      {/* Compacted Bank Ref & Notes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                            Bank Ref / Slip #
                          </label>
                          <input
                            type="text"
                            disabled={!selectedVoucher}
                            placeholder="e.g. TXN-981120"
                            value={directRef}
                            onChange={(e) => setDirectRef(e.target.value)}
                            className="w-full h-[38px] px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-100"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                            Notes (Optional)
                          </label>
                          <input
                            type="text"
                            disabled={!selectedVoucher}
                            placeholder="Optional receipt notes"
                            value={directNotes}
                            onChange={(e) => setDirectNotes(e.target.value)}
                            className="w-full h-[38px] px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-100"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Modal Footer Controls */}
                    <div className="bg-slate-50 border-t border-slate-200 p-2.5 sm:px-3 sm:py-2.5 flex items-center justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowDirectModal(false)}
                        className="px-3.5 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer text-xs font-semibold transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!selectedVoucher || Number(directAmount) <= 0}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs transition cursor-pointer text-xs disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Record Collection ({directAmount ? formatCurrency(Number(directAmount)) : formatCurrency(0)})</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`bg-white rounded-2xl ${
              bulkPreviewRows.length > 0 ? 'max-w-4xl' : 'max-w-md'
            } w-full p-6 shadow-2xl space-y-5 transition-all my-auto max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-teal-600" />
                {bulkPreviewRows.length > 0
                  ? 'Preview & Verify CSV Data'
                  : 'Import Fee Collections from CSV'}
              </h3>
              <button
                onClick={() => {
                  setShowBulkModal(false);
                  setBulkPreviewRows([]);
                  setBulkImportStatus({ message: null, error: null });
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bulkPreviewRows.length === 0 ? (
              <div className="space-y-3 text-xs text-slate-600">
                <p>
                  Upload a CSV file with fee collection records for <strong>{formatMonthName(activeMonth)}</strong>. First row must contain column headers.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadSampleBulkCsv}
                    className="flex items-center gap-2 text-teal-600 font-bold hover:underline cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Download Sample CSV Format
                  </button>
                </div>

                {/* Status alerts */}
                {bulkImportStatus.message && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-medium flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{bulkImportStatus.message}</span>
                  </div>
                )}
                {bulkImportStatus.error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{bulkImportStatus.error}</span>
                  </div>
                )}

                {/* File Dropzone & Click Target */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-teal-300 hover:border-teal-500 bg-teal-50/20 hover:bg-teal-50/60 rounded-xl p-6 text-center transition cursor-pointer group"
                >
                  <Upload className="w-8 h-8 text-teal-600 group-hover:scale-110 transition mx-auto mb-2" />
                  <span className="font-bold text-slate-800 block text-sm">
                    Click to select CSV File
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Supports .csv files (comma, semicolon or tab separated) (RegNo, PaidAmount, Fine, Date, PaymentMode, RefNo)
                  </span>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-2 bg-slate-100 text-slate-600 rounded-md text-[11px] font-medium border border-slate-200">
                    <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Accepted Date format: <strong>YYYY-MM-DD</strong> or <strong>DD/MM/YYYY</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Browse CSV File
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsvFileUpload}
                  />
                </div>
              </div>
            ) : (
              /* Preview View with Interactive Table */
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                {/* Compact Status & Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/90 px-3 py-2 rounded-xl border border-slate-200 text-xs shrink-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <div className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-slate-500 font-semibold text-[11px]">Total Rows:</span>
                      <span className="font-bold text-slate-900">{bulkPreviewRows.length}</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 shadow-2xs">
                      <span className="text-emerald-700 font-semibold text-[11px]">Selected:</span>
                      <span className="font-bold text-emerald-800">
                        {bulkPreviewRows.filter((r) => r.selected && r.isValid).length}
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/80 shadow-2xs">
                      <span className="text-teal-700 font-semibold text-[11px]">Total Collection:</span>
                      <span className="font-bold text-teal-800">
                        {formatCurrency(
                          bulkPreviewRows
                            .filter((r) => r.selected && r.isValid)
                            .reduce((sum, r) => sum + r.amount, 0)
                        )}
                      </span>
                    </div>
                    {bulkPreviewRows.some((r) => r.fine !== undefined && r.fine !== 0) && (
                      <div className="inline-flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80 shadow-2xs">
                        <span className="text-amber-700 font-semibold text-[11px]">Net Fines:</span>
                        <span className="font-bold text-amber-800 font-mono">
                          {formatCurrency(
                            bulkPreviewRows
                              .filter((r) => r.selected && r.isValid && r.fine !== undefined)
                              .reduce((sum, r) => sum + (r.fine || 0), 0)
                          )}
                        </span>
                      </div>
                    )}
                    <div className="inline-flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/80 shadow-2xs">
                      <span className="text-rose-700 font-semibold text-[11px]">Duplicates:</span>
                      <span className="font-bold text-rose-800">
                        {bulkPreviewRows.filter((r) => r.isDuplicate).length}
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80 shadow-2xs">
                      <span className="text-amber-700 font-semibold text-[11px]">Invalid:</span>
                      <span className="font-bold text-amber-800">
                        {bulkPreviewRows.filter((r) => !r.isValid).length}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-semibold text-xs shadow-2xs transition cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 text-teal-600" />
                      <span>Toggle Select All</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkPreviewRows([]);
                        setBulkImportStatus({ message: null, error: null });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-lg font-semibold text-xs transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload New File</span>
                    </button>
                  </div>
                </div>

                {bulkImportStatus.error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{bulkImportStatus.error}</span>
                  </div>
                )}

                {/* Table container */}
                <div className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto max-h-[50vh] flex-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <SortableTh label="Import" sortKey="selected" sort={bulkSort} onSort={toggleBulkSort} className="w-10 text-center" />
                        <SortableTh label="Student (Reg #)" sortKey="student" sort={bulkSort} onSort={toggleBulkSort} />
                        <SortableTh label="Active Voucher" sortKey="voucherNo" sort={bulkSort} onSort={toggleBulkSort} />
                        <SortableTh label="Fine Adj." sortKey="fine" sort={bulkSort} onSort={toggleBulkSort} className="text-right" />
                        <SortableTh label="Net Due" sortKey="netDue" sort={bulkSort} onSort={toggleBulkSort} className="text-right" />
                        <SortableTh label="Paid So Far" sortKey="alreadyPaid" sort={bulkSort} onSort={toggleBulkSort} className="text-right" />
                        <SortableTh label="Remaining" sortKey="remaining" sort={bulkSort} onSort={toggleBulkSort} className="text-right" />
                        <SortableTh label="Collection Amount" sortKey="amount" sort={bulkSort} onSort={toggleBulkSort} className="text-right" />
                        <SortableTh label="Collection Date" sortKey="date" sort={bulkSort} onSort={toggleBulkSort} />
                        <SortableTh label="Payment Mode & Ref" sortKey="mode" sort={bulkSort} onSort={toggleBulkSort} />
                        <SortableTh label="Status" sortKey="status" sort={bulkSort} onSort={toggleBulkSort} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedBulkPreviewRows.map((r) => (
                        <tr
                          key={r.id}
                          className={`hover:bg-slate-50/80 transition ${
                            r.isDuplicate
                              ? 'bg-rose-50/60 text-slate-700'
                              : !r.isValid
                              ? 'bg-amber-50/40'
                              : r.selected
                              ? 'bg-teal-50/20'
                              : ''
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              disabled={!r.isValid}
                              checked={r.selected && r.isValid}
                              onChange={() => handleToggleRow(r.id)}
                              className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                                {r.regNo}
                              </span>
                              <span className="font-bold text-slate-900">
                                {r.studentName || <span className="text-slate-400 italic">Unmatched</span>}
                              </span>
                            </div>
                            {r.className && (
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                {r.className}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-mono">
                            {r.voucherNo ? (
                              <span className="text-teal-700 font-semibold">{r.voucherNo}</span>
                            ) : (
                              <span className="text-slate-400 italic">No Voucher</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {r.fine !== undefined ? (
                              r.fine > 0 ? (
                                <span className="inline-flex items-center font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[11px]">
                                  +{formatCurrency(r.fine)}
                                </span>
                              ) : r.fine < 0 ? (
                                <span className="inline-flex items-center font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[11px]">
                                  {formatCurrency(r.fine)}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">0 (No change)</span>
                              )
                            ) : (
                              <span className="text-slate-300 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600">
                            {r.netDue !== undefined ? (
                              <div>
                                <span className="font-semibold text-slate-800">{formatCurrency(r.netDue)}</span>
                                {r.fine !== undefined && r.originalNetDue !== undefined && r.originalNetDue !== r.netDue && (
                                  <span className="text-[10px] text-slate-400 block font-normal">
                                    was {formatCurrency(r.originalNetDue)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-500">
                            {r.alreadyPaid !== undefined ? formatCurrency(r.alreadyPaid) : '—'}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-800">
                            {r.remainingBalance !== undefined ? formatCurrency(r.remainingBalance) : '—'}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-700">
                            {formatCurrency(r.amount)}
                          </td>
                          <td className="p-3 font-mono text-slate-700 font-medium">
                            {r.date}
                          </td>
                          <td className="p-3 text-slate-600">
                            <span className="font-semibold block">{paymentModeText(r.paymentMode)}</span>
                            {r.refNo && <span className="font-mono text-[10px] text-slate-500">{r.refNo}</span>}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                r.isDuplicate
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : !r.isValid
                                  ? 'bg-amber-100 text-amber-900'
                                  : r.amount === r.remainingBalance
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : r.amount < (r.remainingBalance || 0)
                                  ? 'bg-teal-100 text-teal-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {r.errorMsg
                                ? r.errorMsg
                                : r.amount === r.remainingBalance
                                ? 'Clears Balance'
                                : r.amount < (r.remainingBalance || 0)
                                ? 'Partial Payment'
                                : 'Overpayment'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            {bulkPreviewRows.length > 0 && (
              <div className="flex justify-end items-center border-t border-slate-200 pt-3 shrink-0">
                <button
                  type="button"
                  disabled={bulkPreviewRows.filter((r) => r.selected && r.isValid).length === 0}
                  onClick={handleCommitBulkImport}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Confirm & Record {bulkPreviewRows.filter((r) => r.selected && r.isValid).length} Selected Collection(s)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Collection Confirmation Modal */}
      <ConfirmModal
        isOpen={!!collectionToDelete}
        title="Delete Collection Session"
        message={
          collectionToDelete ? (
            <div className="space-y-2">
              <p>
                Are you sure you want to delete collection session{' '}
                <strong className="text-slate-900">{collectionToDelete.collectionNo}</strong>?
              </p>
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                Paid voucher balances will be automatically recalculated and adjusted.
              </div>
            </div>
          ) : (
            ''
          )
        }
        confirmLabel="Delete Session"
        variant="danger"
        onConfirm={handleConfirmDeleteSession}
        onClose={() => setCollectionToDelete(null)}
      />

      {/* Official Payment Receipt Modal Generator */}
      <PaymentReceiptModal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        receiptData={receiptModalData}
        initialIndex={receiptInitialIndex}
      />
    </div>
  );
};