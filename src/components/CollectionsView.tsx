import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FeeCollection, FeeVoucher, PaymentTransaction, VoucherItem } from '../types';
import { formatCurrency, formatMonthName } from '../utils/feeMath';
import { normalizePaymentMode } from '../utils/paymentMode';
import { parseCsvLine, downloadCsv } from '../utils/csv';
import { StudentAvatar } from './StudentAvatar';
import { ConfirmModal } from './ConfirmModal';
import { DatePicker } from './DatePicker';
import { VoucherParticularsEditor } from './VoucherParticularsEditor';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle,
  Coins,
  Copy,
  CreditCard,
  Download,
  FileSpreadsheet,
  HelpCircle,
  LayoutGrid,
  List,
  Plus,
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
  } = useApp();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [collectionToDelete, setCollectionToDelete] = useState<FeeCollection | null>(null);

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

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((cur) => (cur?.text === text ? null : cur));
    }, 4500);
  };

  // Direct Collection Modal State
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [directSearch, setDirectSearch] = useState('');
  const [selectedVoucherId, setSelectedVoucherId] = useState('');
  const [directAmount, setDirectAmount] = useState<number | string>('');
  const [directMode, setDirectMode] = useState<'Cash' | 'BankTransfer' | 'Cheque' | 'Online'>('Cash');
  const [directRef, setDirectRef] = useState('');
  const [directDate, setDirectDate] = useState(new Date().toISOString().split('T')[0]);
  const [directNotes, setDirectNotes] = useState('');
  const [directItems, setDirectItems] = useState<VoucherItem[]>([]);

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
      date: string;
      paymentMode: string;
      refNo: string;
      studentId?: string;
      studentName?: string;
      className?: string;
      voucherId?: string;
      voucherNo?: string;
      netDue?: number;
      alreadyPaid?: number;
      remainingBalance?: number;
      isValid: boolean;
      isDuplicate?: boolean;
      selected: boolean;
      errorMsg?: string;
    }[]
  >([]);

  useEscapeKey(() => {
    if (showDirectModal) {
      setShowDirectModal(false);
    } else if (showBulkModal) {
      setShowBulkModal(false);
    }
  }, showDirectModal || showBulkModal);

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

  // Backward compatible alias
  const filteredCollections = sortedCollections;

  // Available vouchers for collection
  const availableVouchers = vouchers.filter(
    (v) => v.status !== 'Reversed' && v.status !== 'Carried'
  );
  const selectedVoucher = availableVouchers.find((v) => v.id === selectedVoucherId);
  const selectedStudent = selectedVoucher ? students.find((s) => s.id === selectedVoucher.studentId) : undefined;
  const selectedClass = selectedVoucher ? classes.find((c) => c.id === selectedVoucher.classId) : undefined;

  // Dynamic calculations based on edited line items
  const dynamicNetDue = useMemo(() => {
    if (directItems.length > 0) {
      return Math.max(0, directItems.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
    }
    return selectedVoucher ? selectedVoucher.netDue : 0;
  }, [directItems, selectedVoucher]);

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
    } else {
      setSelectedVoucherId('');
      setDirectItems([]);
      setDirectAmount('');
    }

    setDirectSearch('');
    setDirectMode('Cash');
    setDirectRef('');
    setDirectDate(new Date().toISOString().split('T')[0]);
    setDirectNotes('');
    setShowDirectModal(true);
  };

  const handleSelectVoucher = (vId: string) => {
    setSelectedVoucherId(vId);
    const v = availableVouchers.find((item) => item.id === vId);
    if (v) {
      setDirectItems(v.particulars.map((p) => ({ ...p })));
      const remaining = Math.max(0, v.netDue - v.amountPaid);
      setDirectAmount(remaining > 0 ? remaining : v.netDue);
    } else {
      setDirectItems([]);
      setDirectAmount('');
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

    if (res.success) {
      showToast(
        `Recorded ${formatCurrency(numAmount)} payment for ${selectedVoucher.voucherNo} (${selectedStudent?.name || 'Student'}).`,
        'success'
      );
      setShowDirectModal(false);
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

        const firstTokens = parseCsvLine(rawLines[0]).map((t) => t.toLowerCase().replace(/["'\s_#\-]/g, ''));
        const hasHeader =
          firstTokens.some((t) => t.includes('reg') || t.includes('student') || t.includes('roll') || t.includes('admission') || t === 'id') ||
          firstTokens.some((t) => t.includes('amount') || t.includes('paid') || t.includes('fee'));

        let colMap = {
          regNo: 0,
          amount: 1,
          date: 2,
          paymentMode: 3,
          refNo: 4,
        };

        let dataLines = rawLines;

        if (hasHeader) {
          colMap = {
            regNo: firstTokens.findIndex((t) => t.includes('reg') || t.includes('student') || t.includes('roll') || t.includes('admission') || t === 'id'),
            amount: firstTokens.findIndex((t) => t.includes('amount') || t.includes('paid') || t.includes('fee') || t.includes('collec')),
            date: firstTokens.findIndex((t) => t.includes('date') || t.includes('day') || t.includes('time') || t.includes('dt')),
            paymentMode: firstTokens.findIndex((t) => t.includes('mode') || t.includes('method') || t.includes('type') || t.includes('channel')),
            refNo: firstTokens.findIndex((t) => t.includes('ref') || t.includes('txn') || t.includes('trn') || t.includes('receipt') || t.includes('cheque') || t.includes('memo')),
          };

          if (colMap.regNo === -1) {
            colMap.regNo = 0;
          }
          if (colMap.amount === -1) {
            colMap.amount = colMap.regNo === 0 ? 1 : 0;
          }
          dataLines = rawLines.slice(1);
        } else {
          const sampleParts = parseCsvLine(rawLines[0]);
          if (sampleParts.length >= 5) {
            colMap = { regNo: 0, amount: 1, date: 2, paymentMode: 3, refNo: 4 };
          } else if (sampleParts.length === 4) {
            if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(sampleParts[2])) {
              colMap = { regNo: 0, amount: 1, date: 2, paymentMode: 3, refNo: -1 };
            } else {
              colMap = { regNo: 0, amount: 1, date: -1, paymentMode: 2, refNo: 3 };
            }
          }
        }

        if (dataLines.length === 0) {
          setBulkImportStatus({ message: null, error: 'CSV file contains only a header row and no data records.' });
          return;
        }

        const seenRegNos = new Set<string>();
        const parsed: typeof bulkPreviewRows = [];

        dataLines.forEach((line, idx) => {
          const parts = parseCsvLine(line);
          if (parts.length < 2 || parts.every((p) => !p)) return;

          const rawReg = (parts[colMap.regNo] || '').trim();
          const rawAmt = parts[colMap.amount] || '0';
          const rawDate = colMap.date >= 0 && parts[colMap.date] ? parts[colMap.date].trim() : '';
          const rawMode = colMap.paymentMode >= 0 && parts[colMap.paymentMode] ? parts[colMap.paymentMode].trim() : 'BankTransfer';
          const rawRef = colMap.refNo >= 0 && parts[colMap.refNo] ? parts[colMap.refNo].trim() : '';

          const amount = parseFloat(rawAmt.replace(/[^0-9.-]+/g, '')) || 0;
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
          const netDue = targetVoucher?.netDue || 0;
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
            errorMsg = `Invalid payment mode "${rawMode}" (use Cash, BankTransfer, Cheque, Online)`;
          }

          const isDuplicate = cleanReg ? seenRegNos.has(cleanReg) : false;
          if (cleanReg && isValid) {
            seenRegNos.add(cleanReg);
          }

          parsed.push({
            id: `row-${idx}-${Date.now()}`,
            regNo: rawReg || (student?.regNo ?? 'N/A'),
            amount,
            date: rowDate,
            paymentMode: normalizePaymentMode(rawMode) || rawMode || 'BankTransfer',
            refNo: rawRef,
            studentId: student?.id,
            studentName: student?.name,
            className: studentClass?.name,
            voucherId: targetVoucher?.id,
            voucherNo: targetVoucher?.voucherNo,
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
    let sampleContent = `RegNo,PaidAmount,CollectionDate,PaymentMode,ReferenceNo\n`;
    if (sampleVouchers.length > 0) {
      sampleVouchers.forEach((v, i) => {
        const student = students.find((s) => s.id === v.studentId);
        const regNo = student?.regNo || `REG-${1001 + i}`;
        const remaining = Math.max(0, v.netDue - v.amountPaid);
        sampleContent += `${regNo},${remaining > 0 ? remaining : v.netDue},${todayStr},BankTransfer,PK-BANK-${1000 + i}\n`;
      });
    } else {
      const sampleStudents = students.slice(0, 3);
      if (sampleStudents.length > 0) {
        sampleStudents.forEach((s, i) => {
          sampleContent += `${s.regNo},5000,${todayStr},BankTransfer,PK-BANK-${1001 + i}\n`;
        });
      } else {
        sampleContent += `REG-1001,7800,${todayStr},BankTransfer,PK-MZB-9811\nREG-1002,3300,${todayStr},Cash,DESK-402\nREG-1003,4500,${todayStr},Online,EP-9021\n`;
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
      'Voucher #',
      'Fee Month',
      'Student Reg #',
      'Student Name',
      'Class',
      'Payment Mode',
      'Reference #',
      'Amount Paid (Rs)',
      'Session Total (Rs)',
      'Notes',
    ];

    const rows: (string | number)[][] = [];
    let grandTotal = 0;

    filteredCollections.forEach((col) => {
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
    if (filteredCollections.length === 0) {
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
    showToast(`Exported ${filteredCollections.length} collection session(s) to CSV.`, 'success');
  };

  const handleCopyCsvToClipboard = () => {
    if (filteredCollections.length === 0) {
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

  // Filtered voucher options for direct payment search
  const searchedVouchers = availableVouchers.filter((v) => {
    if (!directSearch.trim()) return true;
    const term = directSearch.toLowerCase();
    const stu = students.find((s) => s.id === v.studentId);
    return (
      v.voucherNo.toLowerCase().includes(term) ||
      (stu && stu.name.toLowerCase().includes(term)) ||
      (stu && stu.studentNo.toLowerCase().includes(term)) ||
      (stu && stu.regNo.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6 relative">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold ${
              toastMessage.type === 'success'
                ? 'bg-slate-900 text-emerald-300 border-slate-700'
                : 'bg-rose-900 text-rose-100 border-rose-700'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 text-white/70 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl text-xs border border-slate-200 shadow-xs transition cursor-pointer"
              title="Download Fee Collections & Payment Ledger as CSV"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleCopyCsvToClipboard}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl text-xs border border-slate-200 shadow-xs transition cursor-pointer"
              title="Copy Collections & Payment Ledger CSV data to clipboard"
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
            <>
              <button
                onClick={() => handleOpenDirectCollection()}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Record Payment
              </button>
              <button
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Bulk CSV Import
              </button>
            </>
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
            Showing <span className="font-bold text-slate-800">{filteredCollections.length}</span> of{' '}
            <span className="font-bold text-slate-800">{collections.length}</span> session(s)
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="text-emerald-700 font-bold">
            Total: {formatCurrency(filteredCollections.reduce((sum, c) => sum + c.totalAmount, 0))}
          </div>
        </div>
      </div>

      {/* Collections Grid View */}
      {viewMode === 'grid' && (
        <div className="space-y-4">
          {filteredCollections.length > 0 ? (
            filteredCollections.map((col) => {
              const colTxns = transactions.filter((t) => t.collectionId === col.id);

              return (
                <div
                  key={col.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 font-bold">
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

                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold text-emerald-600">
                        {formatCurrency(col.totalAmount)}
                      </span>
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

                  {/* Sub Transactions List */}
                  <div className="space-y-1.5 pt-1">
                    <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Itemized Voucher Payment Transactions:
                    </h4>
                    <div className="divide-y divide-slate-100 bg-slate-50/70 rounded-xl border border-slate-100 text-xs overflow-hidden">
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

                            <div className="flex items-center gap-4">
                              <span className="text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                                {t.paymentMode} {t.referenceNo ? `(${t.referenceNo})` : ''}
                              </span>
                              <span className="font-bold text-emerald-700">
                                {formatCurrency(t.amount)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
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
                  {hasPermission('fees.delete') && (
                    <th className="p-3.5 text-right w-16 whitespace-nowrap">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCollections.length === 0 ? (
                  <tr>
                    <td
                      colSpan={hasPermission('fees.delete') ? 7 : 6}
                      className="p-8 text-center text-slate-400 italic"
                    >
                      No fee collection sessions match your search.
                    </td>
                  </tr>
                ) : (
                  filteredCollections.map((col, idx) => {
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
                          <div className="flex flex-wrap items-center gap-1.5 max-w-xl">
                            {colTxns.map((t) => {
                              const stu = students.find((s) => s.id === t.studentId);
                              return (
                                <span
                                  key={t.id}
                                  className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap"
                                >
                                  <StudentAvatar photoUrl={stu?.photoUrl} name={stu?.name || 'Student'} size="xs" />
                                  <span>{stu?.name || 'Student'}</span>
                                  <span className="text-emerald-700 font-bold ml-0.5">({formatCurrency(t.amount)})</span>
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-sm text-emerald-700 whitespace-nowrap">
                          {formatCurrency(col.totalAmount)}
                        </td>
                        {hasPermission('fees.delete') && (
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleDeleteSession(col)}
                              title="Delete Collection Session"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Direct Payment / Single Collection Modal */}
      {showDirectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl space-y-4 my-auto sm:my-8 animate-in fade-in duration-200 border border-slate-200/80">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Record Fee Collection</h3>
                  <p className="text-xs text-slate-500">Collect full, remaining, or partial fee payments directly</p>
                </div>
              </div>
              <button
                onClick={() => setShowDirectModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDirectPayment} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Pane: Voucher Search & Particulars Editor */}
                <div className="lg:col-span-6 space-y-3">
                  {/* Voucher Search & Selection */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Select Fee Voucher *</label>
                    <div className="space-y-1.5">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search voucher #, student name (e.g. FE2026-000202)..."
                          value={directSearch}
                          onChange={(e) => setDirectSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <select
                        value={selectedVoucherId}
                        onChange={(e) => handleSelectVoucher(e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800 text-xs"
                        size={searchedVouchers.length > 4 ? 4 : Math.max(3, searchedVouchers.length + 1)}
                      >
                        <option value="" className="text-slate-400 font-normal">
                          -- Select a Student / Fee Voucher ({searchedVouchers.length} found) --
                        </option>
                        {searchedVouchers.map((v) => {
                          const s = students.find((stu) => stu.id === v.studentId);
                          const rem = Math.max(0, v.netDue - v.amountPaid);
                          const excess = v.amountPaid > v.netDue ? v.amountPaid - v.netDue : 0;
                          return (
                            <option key={v.id} value={v.id} className="py-0.5">
                              {v.voucherNo} &bull; {s?.name} &bull; {rem > 0 ? `Bal: Rs. ${rem.toLocaleString()}` : excess > 0 ? `Adv: Rs. ${excess.toLocaleString()}` : 'Paid'} ({v.status}) [{v.month}]
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {/* Editable Voucher Line Items / Particulars */}
                  {selectedVoucher && (
                    <VoucherParticularsEditor
                      items={directItems}
                      onChange={(updated) => {
                        setDirectItems(updated);
                        const newNet = Math.max(0, updated.reduce((s, p) => s + (Number(p.amount) || 0), 0));
                        const newRem = Math.max(0, newNet - (selectedVoucher.amountPaid || 0));
                        if (Number(directAmount) === selectedRemaining && newRem > 0) {
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
                  )}
                </div>

                {/* Right Pane: Live Overview & Payment Inputs */}
                <div className="lg:col-span-6 space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                  {/* Selected Voucher Live Overview Card */}
                  {selectedVoucher ? (
                    <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StudentAvatar photoUrl={selectedStudent?.photoUrl} name={selectedStudent?.name || 'Student'} size="sm" />
                          <div>
                            <div className="font-bold text-slate-900 text-sm">{selectedStudent?.name}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {selectedVoucher.voucherNo} &bull; {selectedClass?.name} &bull; {formatMonthName(selectedVoucher.month)}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            selectedVoucher.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : selectedVoucher.status === 'Partial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {selectedVoucher.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-100 text-center font-mono">
                        <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                          <div className="text-[9px] text-slate-500 font-sans">Original Due</div>
                          <div className="font-bold text-slate-800 text-xs">{formatCurrency(selectedVoucher.netDue)}</div>
                        </div>
                        <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                          <div className="text-[9px] text-slate-500 font-sans">Already Paid</div>
                          <div className="font-bold text-emerald-700 text-xs">{formatCurrency(selectedVoucher.amountPaid)}</div>
                        </div>
                        <div className="bg-emerald-50/80 p-1.5 rounded border border-emerald-200">
                          <div className="text-[9px] text-emerald-800 font-sans font-bold">
                            {selectedVoucher.amountPaid >= dynamicNetDue ? 'Settlement' : 'Revised Remaining'}
                          </div>
                          <div className="font-black text-emerald-800 text-xs">
                            {selectedVoucher.amountPaid >= dynamicNetDue
                              ? selectedVoucher.amountPaid > dynamicNetDue
                                ? `+${formatCurrency(selectedVoucher.amountPaid - dynamicNetDue)} Adv`
                                : 'Fully Settled'
                              : formatCurrency(dynamicRemaining)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-400 bg-white rounded-lg border border-dashed border-slate-200 text-xs">
                      Please select a fee voucher on the left to collect payment.
                    </div>
                  )}

                  {/* Amount Input with Quick-fill Buttons */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-700">Collection Amount (Rs.) *</label>
                      {selectedVoucher && dynamicRemaining > 0 ? (
                        <button
                          type="button"
                          onClick={() => setDirectAmount(dynamicRemaining)}
                          className="text-[11px] text-teal-600 hover:text-teal-800 font-bold hover:underline cursor-pointer"
                        >
                          Auto-fill Remaining ({formatCurrency(dynamicRemaining)})
                        </button>
                      ) : null}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rs.</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={directAmount}
                        onChange={(e) => setDirectAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Enter payment amount"
                        className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-base text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>

                    {/* Quick amount suggestion chips */}
                    {selectedVoucher && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {dynamicRemaining > 0 ? (
                          <button
                            type="button"
                            onClick={() => setDirectAmount(dynamicRemaining)}
                            className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded text-[10px] font-bold transition cursor-pointer"
                          >
                            Full Balance: {formatCurrency(dynamicRemaining)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDirectAmount(dynamicNetDue)}
                            className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded text-[10px] font-bold transition cursor-pointer"
                          >
                            Fill Fee: {formatCurrency(dynamicNetDue)}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDirectAmount(dynamicNetDue)}
                          className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-[10px] font-semibold transition cursor-pointer"
                        >
                          Net Due: {formatCurrency(dynamicNetDue)}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Payment Mode & Date */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Payment Mode *</label>
                      <select
                        value={directMode}
                        onChange={(e) => setDirectMode(e.target.value as any)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs"
                      >
                        <option value="Cash">Cash Desk</option>
                        <option value="BankTransfer">Bank Transfer / Online</option>
                        <option value="Cheque">Cheque Deposit</option>
                        <option value="Online">Credit/Debit Card</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Collection Date *</label>
                      <DatePicker
                        value={directDate}
                        required
                        themeColor={themeConfig?.color || 'teal'}
                        onChange={(newDate) => setDirectDate(newDate)}
                        idPrefix="collection-direct-date"
                        placeholder="Select Collection Date"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Deposit Slip / Ref # (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. PK-MZB-981120 or Cash Receipt #"
                      value={directRef}
                      onChange={(e) => setDirectRef(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Receipt Notes / Remarks (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Cleared remaining balance"
                      value={directNotes}
                      onChange={(e) => setDirectNotes(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowDirectModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedVoucher || Number(directAmount) <= 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer text-xs disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Record Collection ({directAmount ? formatCurrency(Number(directAmount)) : 'Rs. 0'})</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`bg-white rounded-2xl ${
              bulkPreviewRows.length > 0 ? 'max-w-4xl' : 'max-w-md'
            } w-full p-6 shadow-2xl space-y-5 transition-all max-h-[90vh] flex flex-col`}
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
                <button
                  type="button"
                  onClick={handleDownloadSampleBulkCsv}
                  className="flex items-center gap-2 text-teal-600 font-bold hover:underline cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Download Sample CSV Format
                </button>

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
                    Supports standard comma-separated .csv files
                  </span>
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
                      <span className="text-teal-700 font-semibold text-[11px]">Total Amount:</span>
                      <span className="font-bold text-teal-800">
                        {formatCurrency(
                          bulkPreviewRows
                            .filter((r) => r.selected && r.isValid)
                            .reduce((sum, r) => sum + r.amount, 0)
                        )}
                      </span>
                    </div>
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
                        <th className="p-3 w-10 text-center">Import</th>
                        <th className="p-3">Student (Reg #)</th>
                        <th className="p-3">Active Voucher</th>
                        <th className="p-3 text-right">Net Due</th>
                        <th className="p-3 text-right">Paid So Far</th>
                        <th className="p-3 text-right">Remaining</th>
                        <th className="p-3 text-right">Collection Amount</th>
                        <th className="p-3">Collection Date</th>
                        <th className="p-3">Payment Mode & Ref</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulkPreviewRows.map((r) => (
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
                          <td className="p-3 text-right font-mono text-slate-600">
                            {r.netDue !== undefined ? formatCurrency(r.netDue) : '—'}
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
                            <span className="font-semibold block">{r.paymentMode}</span>
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
    </div>
  );
};