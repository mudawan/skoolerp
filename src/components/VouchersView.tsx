import React, { useState, useEffect, useMemo } from 'react';
import { useApp, DownstreamConflict } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FeeVoucher, VoucherStatus, ParticularKind, VoucherItem } from '../types';
import { formatCurrency, formatMonthName, getMonthPickerWindow, getNextMonthString, mergeWithDataMonths, VoucherPreviewCalculation } from '../utils/feeMath';
import { MonthPicker } from './MonthPicker';
import { DatePicker } from './DatePicker';
import { PrintVoucherModal } from './PrintVoucherModal';
import { ExportPdfModal } from './ExportPdfModal';
import { StudentAvatar } from './StudentAvatar';
import { VoucherParticularsEditor } from './VoucherParticularsEditor';
import { RecordsPerPageSelector } from './RecordsPerPageSelector';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  CornerDownRight,
  Download,
  Eye,
  FileCheck2,
  FileDown,
  FilePlus,
  FileText,
  Filter,
  Info,
  Layers,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

export const VouchersView: React.FC = () => {
  const {
    activeMonth,
    vouchers,
    transactions,
    students,
    classes,
    templates,
    previewVoucherGeneration,
    commitVoucherGeneration,
    collectVoucherPayment,
    updateVoucherParticulars,
    getDownstreamVouchersInfo,
    deleteVoucher,
    bulkDeleteVouchers,
    bulkCarryForwardDefaulters,
    undoCarryForwardVoucher,
    hasPermission,
    getMonthClosureStatus,
    themeConfig,
    priorMonthRule,
    skippedMonthRule,
    voucherDeletionResolution,
    defaultLateFeeRate,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Table Sorting State
  const [sortField, setSortField] = useState<'voucherNo' | 'regNo' | 'name' | 'class' | 'netDue' | 'paid' | 'status'>('voucherNo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: 'voucherNo' | 'regNo' | 'name' | 'class' | 'netDue' | 'paid' | 'status') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Generator Wizard State
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [targetMonth, setTargetMonth] = useState(activeMonth);
  // See HeaderBar.tsx for why these are kept separate: the picker window
  // alone doesn't mean data exists for those months, so it must not feed the
  // "Vouchers / Records Exist" indicator dot.
  const pickerWindowMonths = useMemo(
    () => mergeWithDataMonths(getMonthPickerWindow(), vouchers.map((v) => v.month)),
    [vouchers]
  );
  const monthsWithData = useMemo(
    () => Array.from(new Set(vouchers.map((v) => v.month))),
    [vouchers]
  );
  const [scope, setScope] = useState<'all' | 'class' | 'students' | 'student'>('all');
  const [scopeClassId, setScopeClassId] = useState(classes[0]?.id || '');
  const [selectedSingleStudentId, setSelectedSingleStudentId] = useState<string>('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [lateFeeInput, setLateFeeInput] = useState(defaultLateFeeRate || 500);
  const [selectedGenStudentIds, setSelectedGenStudentIds] = useState<string[]>([]);
  const [isParamsCollapsed, setIsParamsCollapsed] = useState(false);

  // Automatically sync generator targetMonth when working month in header changes
  useEffect(() => {
    setTargetMonth(activeMonth);
  }, [activeMonth]);

  useEffect(() => {
    setLateFeeInput(defaultLateFeeRate);
  }, [defaultLateFeeRate]);

  // Pre-generation preview data
  const [previewsData, setPreviewsData] = useState<{
    previews: VoucherPreviewCalculation[];
    monthClosureBlocked: boolean;
    closureMessage?: string;
  } | null>(null);

  // Print Modal
  const [printingVoucher, setPrintingVoucher] = useState<FeeVoucher | null>(null);

  // PDF Export Modal State
  const [exportPdfVouchers, setExportPdfVouchers] = useState<FeeVoucher[] | null>(null);

  // Collect Modal
  const [collectingVoucher, setCollectingVoucher] = useState<FeeVoucher | null>(null);
  const [collectAmount, setCollectAmount] = useState<number | string>(0);
  const [collectMode, setCollectMode] = useState<'Cash' | 'BankTransfer' | 'Cheque' | 'Online'>('Cash');
  const [collectRef, setCollectRef] = useState('');
  const [collectNotes, setCollectNotes] = useState('');
  const [collectItems, setCollectItems] = useState<VoucherItem[]>([]);

  // Calculations for collecting voucher
  const collectDynamicNetDue = useMemo(() => {
    if (collectItems.length > 0) {
      return Math.max(0, collectItems.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
    }
    return collectingVoucher ? collectingVoucher.netDue : 0;
  }, [collectItems, collectingVoucher]);

  const collectDynamicRemaining = useMemo(() => {
    if (!collectingVoucher) return 0;
    return Math.max(0, collectDynamicNetDue - collectingVoucher.amountPaid);
  }, [collectDynamicNetDue, collectingVoucher]);

  // Voucher Detail Modal
  const [detailVoucher, setDetailVoucher] = useState<FeeVoucher | null>(null);

  const globalTemplates = useMemo(() => {
    return (templates || [])
      .filter((t) => !t.studentId && !t.classId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [templates]);

  const sortedDetailParticulars = useMemo(() => {
    if (!detailVoucher) return [];
    const studentTpls = (templates || []).filter(
      (t) => t.studentId === detailVoucher.studentId && (!t.month || t.month === detailVoucher.month)
    );
    const classTpls = (templates || []).filter(
      (t) => !t.studentId && t.classId === detailVoucher.classId && (!t.month || t.month === detailVoucher.month)
    );
    const sortMap = new Map<ParticularKind, number>();
    globalTemplates.forEach((t) => sortMap.set(t.kind, t.sortOrder));
    classTpls.forEach((t) => {
      if (t.sortOrder !== undefined) sortMap.set(t.kind, t.sortOrder);
    });
    studentTpls.forEach((t) => {
      if (t.sortOrder !== undefined) sortMap.set(t.kind, t.sortOrder);
    });

    return [...detailVoucher.particulars]
      .map((item) => {
        const studentOverride = studentTpls.find((t) => t.kind === item.kind);
        const classOverride = classTpls.find((t) => t.kind === item.kind);
        const globalTpl = globalTemplates.find((t) => t.kind === item.kind);
        let label = studentOverride?.label || classOverride?.label || globalTpl?.label || item.label;
        if (item.kind === 'Tuition') {
          label = label.replace(/\s*\(Class[^)]*\)/gi, '').trim() || 'Tuition Fee';
        } else if (item.kind === 'Transport') {
          label = studentOverride?.label || classOverride?.label || globalTpl?.label || 'Transport Fee';
        }
        return {
          ...item,
          label,
        };
      })
      .sort((a, b) => {
        const orderA = sortMap.get(a.kind) ?? 99;
        const orderB = sortMap.get(b.kind) ?? 99;
        return orderA - orderB;
      });
  }, [detailVoucher, templates, globalTemplates]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Toast state
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((current) => (current?.text === text ? null : current));
    }, 4500);
  };

  // Delete Modal State (with Chronological Block Guard)
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    mode: 'single' | 'bulk';
    targetVoucher?: FeeVoucher;
    targetIds?: string[];
    hasTransactions: boolean;
    transactionCount: number;
    hasDownstream: boolean;
    downstreamConflicts: DownstreamConflict[];
    totalDownstreamCount: number;
  } | null>(null);

  // Policy Consequence Confirmation Modal State
  const [policyConfirmModal, setPolicyConfirmModal] = useState<{
    isOpen: boolean;
    priorRule?: 'warning' | 'recalculate';
    affectedPriorPreviews: VoucherPreviewCalculation[];
    affectedSkippedPreviews: VoucherPreviewCalculation[];
  } | null>(null);

  // Carry Forward Confirmation Modal State
  const [carryModal, setCarryModal] = useState<{
    isOpen: boolean;
    targetVouchers: FeeVoucher[];
    targetMonth: string;
  } | null>(null);
  const [addLateFine, setAddLateFine] = useState(true);
  const [carryFineAmount, setCarryFineAmount] = useState<number>(defaultLateFeeRate || 500);

  // Undo Carry Forward Confirmation Modal State
  const [undoCarryModal, setUndoCarryModal] = useState<{
    isOpen: boolean;
    targetVoucher: FeeVoucher;
    hasDownstream: boolean;
    downstreamMonths: string[];
  } | null>(null);

  useEffect(() => {
    setCarryFineAmount(defaultLateFeeRate || 500);
  }, [defaultLateFeeRate]);

  useEscapeKey(() => {
    if (policyConfirmModal) {
      setPolicyConfirmModal(null);
    } else if (deleteModal) {
      setDeleteModal(null);
    } else if (undoCarryModal) {
      setUndoCarryModal(null);
    } else if (carryModal) {
      setCarryModal(null);
    } else if (printingVoucher) {
      setPrintingVoucher(null);
    } else if (exportPdfVouchers) {
      setExportPdfVouchers(null);
    } else if (collectingVoucher) {
      setCollectingVoucher(null);
    } else if (detailVoucher) {
      setDetailVoucher(null);
    } else if (showGeneratorModal) {
      setShowGeneratorModal(false);
    }
  }, !!(
    policyConfirmModal ||
    deleteModal ||
    undoCarryModal ||
    carryModal ||
    printingVoucher ||
    exportPdfVouchers ||
    collectingVoucher ||
    detailVoucher ||
    showGeneratorModal
  ));

  const handleOpenUndoCarryModal = (v: FeeVoucher) => {
    // Check if any future vouchers exist for this student
    const futureVouchers = vouchers.filter(
      (item) => item.studentId === v.studentId && item.id !== v.id && item.month > v.month
    );
    const downstreamMonths = Array.from(new Set(futureVouchers.map((item) => item.month))).sort();

    setUndoCarryModal({
      isOpen: true,
      targetVoucher: v,
      hasDownstream: futureVouchers.length > 0,
      downstreamMonths,
    });
  };

  const executeUndoCarryForward = () => {
    if (!undoCarryModal?.targetVoucher) return;
    const v = undoCarryModal.targetVoucher;
    const res = undoCarryForwardVoucher(v.id);

    if (res.success) {
      showToast(`Successfully reverted carry forward for Voucher #${v.voucherNo} (${formatMonthName(v.month)})!`);
      setUndoCarryModal(null);
      if (detailVoucher?.id === v.id) {
        setDetailVoucher(null);
      }
    } else {
      showToast(res.error || 'Failed to undo carry forward', 'error');
    }
  };

  const handleOpenCarryModalForSelected = () => {
    const unpaidSelected = vouchers.filter(
      (v) => selectedIds.includes(v.id) && v.status !== 'Paid' && v.status !== 'Carried' && v.status !== 'Reversed'
    );
    if (unpaidSelected.length === 0) {
      showToast('No unpaid vouchers selected to carry forward.', 'error');
      return;
    }
    setCarryFineAmount(defaultLateFeeRate || 500);
    setCarryModal({
      isOpen: true,
      targetVouchers: unpaidSelected,
      targetMonth: getNextMonthString(activeMonth),
    });
  };

  const handleOpenCarryModalSingle = (v: FeeVoucher) => {
    setCarryFineAmount(v.lateFeeRate || defaultLateFeeRate || 500);
    setCarryModal({
      isOpen: true,
      targetVouchers: [v],
      targetMonth: getNextMonthString(v.month),
    });
  };

  const executeCarryForwardFromVouchers = () => {
    if (!carryModal || carryModal.targetVouchers.length === 0) return;

    const idsToCarry = carryModal.targetVouchers.map((v) => v.id);
    const { successCount } = bulkCarryForwardDefaulters(
      idsToCarry,
      carryModal.targetMonth,
      addLateFine,
      carryFineAmount
    );

    if (successCount > 0) {
      showToast(
        `Successfully carried forward ${successCount} voucher(s) into ${formatMonthName(
          carryModal.targetMonth
        )}!`
      );
      setSelectedIds((prev) => prev.filter((id) => !idsToCarry.includes(id)));
      setCarryModal(null);
    } else {
      showToast('Failed to carry forward selected voucher(s).', 'error');
    }
  };

  // Filter & Sort Vouchers
  const filteredVouchers = vouchers.filter((v) => {
    if (v.month !== activeMonth) return false;

    const student = students.find((s) => s.id === v.studentId);
    const matchesSearch =
      v.voucherNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (student && student.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (student && student.regNo.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesClass = selectedClassId === 'all' || v.classId === selectedClassId;
    const matchesStatus = selectedStatus === 'all' || v.status === selectedStatus;

    return matchesSearch && matchesClass && matchesStatus;
  });

  const sortedVouchers = [...filteredVouchers].sort((a, b) => {
    const studentA = students.find((s) => s.id === a.studentId);
    const studentB = students.find((s) => s.id === b.studentId);
    const classA = classes.find((c) => c.id === a.classId);
    const classB = classes.find((c) => c.id === b.classId);

    let comparison = 0;
    switch (sortField) {
      case 'voucherNo':
        comparison = a.voucherNo.localeCompare(b.voucherNo, undefined, { numeric: true });
        break;
      case 'regNo':
        comparison = (studentA?.regNo || '').localeCompare(studentB?.regNo || '', undefined, { numeric: true });
        break;
      case 'name':
        comparison = (studentA?.name || '').localeCompare(studentB?.name || '');
        break;
      case 'class':
        comparison = (classA?.name || '').localeCompare(classB?.name || '', undefined, { numeric: true });
        break;
      case 'netDue':
        comparison = a.netDue - b.netDue;
        break;
      case 'paid':
        comparison = a.amountPaid - b.amountPaid;
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
      case 'dueDate':
        comparison = a.dueDate.localeCompare(b.dueDate);
        break;
      default:
        comparison = 0;
    }

    if (comparison === 0) {
      comparison = a.voucherNo.localeCompare(b.voucherNo, undefined, { numeric: true });
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const totalPages = Math.ceil(sortedVouchers.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const paginatedVouchers = sortedVouchers.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  // Build preview data + auto-selected ids for a given scope. The single
  // 'student' scope maps onto the existing multi-student 'students' scope
  // restricted to the one chosen student id.
  const buildGeneratorPreview = (newScope: typeof scope, newClassId: string, newMonth: string) => {
    let data: ReturnType<typeof previewVoucherGeneration>;
    if (newScope === 'student') {
      data = previewVoucherGeneration(newMonth, 'students', undefined, selectedSingleStudentId ? [selectedSingleStudentId] : []);
    } else {
      data = previewVoucherGeneration(newMonth, newScope, newClassId);
    }
    let selected: string[] = [];
    if (newScope === 'student') {
      selected = selectedSingleStudentId ? [selectedSingleStudentId] : [];
    } else {
      selected = data.previews
        .filter((p) => !p.isAlreadyGenerated && !p.isBlockedByPriorRule && !p.isBlockedBySkippedRule && !p.isBeforeFirstBillingMonth)
        .map((p) => p.student.id);
    }
    return { data, selected };
  };

  const handleOpenGenerator = () => {
    const monthToUse = activeMonth;
    setTargetMonth(monthToUse);
    setDueDateInput('');
    const { data, selected } = buildGeneratorPreview(scope, scopeClassId, monthToUse);
    setPreviewsData(data);
    setSelectedGenStudentIds(selected);
    setShowGeneratorModal(true);
  };

  const handleUpdatePreview = (newScope = scope, newClassId = scopeClassId, newMonth = targetMonth) => {
    setScope(newScope);
    setScopeClassId(newClassId);
    setTargetMonth(newMonth);
    const { data, selected } = buildGeneratorPreview(newScope, newClassId, newMonth);
    setPreviewsData(data);
    setSelectedGenStudentIds(selected);
  };

  const handleSingleStudentChange = (studentId: string) => {
    setSelectedSingleStudentId(studentId);
    const { data, selected } = buildGeneratorPreview('student', scopeClassId, targetMonth);
    setPreviewsData(data);
    setSelectedGenStudentIds(selected);
  };

  const handleSelectAllGen = () => {
    if (!previewsData) return;
    const eligible = previewsData.previews
      .filter((p) => !p.isAlreadyGenerated && !p.isBlockedByPriorRule && !p.isBlockedBySkippedRule && !p.isBeforeFirstBillingMonth)
      .map((p) => p.student.id);
    setSelectedGenStudentIds(eligible);
  };

  const handleSelectNoneGen = () => {
    setSelectedGenStudentIds([]);
  };

  const toggleGenStudent = (studentId: string) => {
    setSelectedGenStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const executeCommitGeneration = () => {
    const res = commitVoucherGeneration(
      targetMonth,
      'students',
      undefined,
      selectedGenStudentIds,
      dueDateInput,
      Number(lateFeeInput) || 200
    );

    if (res.success) {
      showToast(
        `Successfully generated ${res.generatedCount} new fee voucher(s) for ${formatMonthName(targetMonth)}!`
      );
      setShowGeneratorModal(false);
      setPolicyConfirmModal(null);
    } else {
      showToast(res.error || 'Failed to generate vouchers', 'error');
    }
  };

  const handleCommitGeneration = () => {
    if (selectedGenStudentIds.length === 0) {
      showToast('Please select at least one student for voucher generation.', 'error');
      return;
    }

    if (!dueDateInput) {
      showToast('Please select a Due Date for the fee vouchers.', 'error');
      return;
    }

    const affectedPriorPreviews =
      priorMonthRule === 'warning' || priorMonthRule === 'recalculate'
        ? previewsData?.previews.filter(
            (p) => selectedGenStudentIds.includes(p.student.id) && p.hasFutureVouchers
          ) || []
        : [];

    const affectedSkippedPreviews =
      skippedMonthRule === 'warning'
        ? previewsData?.previews.filter(
            (p) => selectedGenStudentIds.includes(p.student.id) && p.hasSkippedMonths
          ) || []
        : [];

    if (affectedPriorPreviews.length > 0 || affectedSkippedPreviews.length > 0) {
      setPolicyConfirmModal({
        isOpen: true,
        priorRule: priorMonthRule === 'recalculate' ? 'recalculate' : 'warning',
        affectedPriorPreviews,
        affectedSkippedPreviews,
      });
      return;
    }

    executeCommitGeneration();
  };

  const handleOpenCollectModal = (voucher: FeeVoucher) => {
    setCollectingVoucher(voucher);
    setCollectItems(voucher.particulars.map((p) => ({ ...p })));
    const remaining = Math.max(0, voucher.netDue - voucher.amountPaid);
    setCollectAmount(remaining > 0 ? remaining : voucher.netDue);
    setCollectMode('Cash');
    setCollectRef('');
    setCollectNotes('');
  };

  const handleSaveLineItemsOnly = () => {
    if (!collectingVoucher) return;
    const res = updateVoucherParticulars(collectingVoucher.id, collectItems);
    if (res.success) {
      showToast('Voucher line items and totals updated successfully!');
      if (res.voucher) {
        setCollectingVoucher(res.voucher);
      }
    } else {
      showToast(res.error || 'Failed to update voucher particulars', 'error');
    }
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectingVoucher) return;

    const numAmount = Number(collectAmount) || 0;
    if (numAmount <= 0) {
      showToast('Please enter a valid positive payment amount.', 'error');
      return;
    }

    const res = collectVoucherPayment(
      collectingVoucher.id,
      numAmount,
      collectMode,
      collectRef.trim() || undefined,
      collectNotes.trim() || undefined,
      undefined,
      collectItems
    );

    if (res.success) {
      showToast('Payment recorded successfully! Voucher status and line items updated.');
      setCollectingVoucher(null);
    } else {
      showToast(res.error || 'Failed to record payment', 'error');
    }
  };

  const handleOpenDeleteSingle = (v: FeeVoucher) => {
    const vTxns = transactions.filter((t) => t.voucherId === v.id);
    const downstreamInfo = getDownstreamVouchersInfo([v.id]);

    setDeleteModal({
      isOpen: true,
      mode: 'single',
      targetVoucher: v,
      hasTransactions: vTxns.length > 0,
      transactionCount: vTxns.length,
      hasDownstream: downstreamInfo.hasDownstream,
      downstreamConflicts: downstreamInfo.conflicts,
      totalDownstreamCount: downstreamInfo.totalDownstreamCount,
    });
  };

  const handleOpenDeleteBulk = () => {
    if (selectedIds.length === 0) return;
    const selectedTxns = transactions.filter((t) => selectedIds.includes(t.voucherId));
    const downstreamInfo = getDownstreamVouchersInfo(selectedIds);

    setDeleteModal({
      isOpen: true,
      mode: 'bulk',
      targetIds: selectedIds,
      hasTransactions: selectedTxns.length > 0,
      transactionCount: selectedTxns.length,
      hasDownstream: downstreamInfo.hasDownstream,
      downstreamConflicts: downstreamInfo.conflicts,
      totalDownstreamCount: downstreamInfo.totalDownstreamCount,
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteModal) return;

    if (deleteModal.hasDownstream && voucherDeletionResolution === 'manual') {
      showToast(
        'Deletion blocked by system policy. Subsequent billing month vouchers exist. Please delete newer future vouchers first or adjust the policy in Settings.',
        'error'
      );
      setDeleteModal(null);
      return;
    }

    if (deleteModal.mode === 'single' && deleteModal.targetVoucher) {
      const v = deleteModal.targetVoucher;
      const res = deleteVoucher(v.id, deleteModal.hasTransactions);

      if (res.success) {
        if (deleteModal.hasDownstream && voucherDeletionResolution === 'auto-heal') {
          showToast(
            `Fee voucher ${v.voucherNo} deleted and ${deleteModal.totalDownstreamCount} subsequent voucher(s) auto-healed.`
          );
        } else if (deleteModal.hasDownstream && voucherDeletionResolution === 'cascade') {
          showToast(
            `Fee voucher ${v.voucherNo} and ${deleteModal.totalDownstreamCount} subsequent voucher(s) cascade deleted.`
          );
        } else {
          showToast(`Fee voucher ${v.voucherNo} deleted successfully.`);
        }
        setSelectedIds((prev) => prev.filter((id) => id !== v.id));
        if (detailVoucher?.id === v.id) setDetailVoucher(null);
        const remaining = filteredVouchers.length - (res.deletedCount || 1);
        const newTotalPages = Math.ceil(remaining / itemsPerPage) || 1;
        if (currentPage > newTotalPages) {
          setCurrentPage(newTotalPages);
        }
      } else {
        showToast(res.error || 'Failed to delete voucher', 'error');
      }
    } else if (deleteModal.mode === 'bulk' && deleteModal.targetIds) {
      const ids = deleteModal.targetIds;
      const res = bulkDeleteVouchers(ids, deleteModal.hasTransactions);

      if (res.success) {
        if (deleteModal.hasDownstream && voucherDeletionResolution === 'auto-heal') {
          showToast(
            `Deleted ${res.deletedCount} voucher(s) and auto-healed subsequent month balances.`
          );
        } else if (deleteModal.hasDownstream && voucherDeletionResolution === 'cascade') {
          showToast(`Cascade deleted ${res.deletedCount} total voucher(s).`);
        } else {
          showToast(`Successfully deleted ${res.deletedCount} voucher(s).`);
        }
        setSelectedIds([]);
        const remaining = filteredVouchers.length - res.deletedCount;
        const newTotalPages = Math.ceil(remaining / itemsPerPage) || 1;
        if (currentPage > newTotalPages) {
          setCurrentPage(newTotalPages);
        }
      } else {
        showToast(res.error || 'Failed to delete vouchers', 'error');
      }
    }

    setDeleteModal(null);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedVouchers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedVouchers.map((v) => v.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-teal-600" />
            Monthly Fee Vouchers ({formatMonthName(activeMonth)})
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Generate monthly fee vouchers with itemized particulars, discounts, and print 3-copy student bank vouchers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedIds.length > 0 ? (
            <button
              onClick={() =>
                setExportPdfVouchers(vouchers.filter((v) => selectedIds.includes(v.id)))
              }
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              Download PDF ({selectedIds.length})
            </button>
          ) : (
            filteredVouchers.length > 0 && (
              <button
                onClick={() => setExportPdfVouchers(filteredVouchers)}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                Export PDF ({filteredVouchers.length})
              </button>
            )
          )}

          {hasPermission('fees.generate') && (
            <button
              onClick={handleOpenGenerator}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <FilePlus className="w-4 h-4" />
              Generate Vouchers Wizard
            </button>
          )}

          {selectedIds.length > 0 &&
            vouchers.some((v) => selectedIds.includes(v.id) && v.status !== 'Paid' && v.status !== 'Carried' && v.status !== 'Reversed') &&
            hasPermission('fees.generate') && (
              <button
                onClick={handleOpenCarryModalForSelected}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                Carry Forward ({vouchers.filter((v) => selectedIds.includes(v.id) && v.status !== 'Paid' && v.status !== 'Carried' && v.status !== 'Reversed').length})
              </button>
            )}

          {selectedIds.length > 0 && hasPermission('fees.delete') && (
            <button
              onClick={handleOpenDeleteBulk}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by voucher #, student name, student #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">Class:</span>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <span className="text-slate-500 font-medium">Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="Issued">Issued (Unpaid)</option>
            <option value="Partial">Partial Paid</option>
            <option value="Paid">Paid Full</option>
            <option value="Carried">Carried Over</option>
          </select>
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider select-none">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.length > 0 && selectedIds.length === paginatedVouchers.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                </th>
                <th
                  onClick={() => handleSort('voucherNo')}
                  className={`p-3 cursor-pointer transition-colors hover:bg-slate-100/80 whitespace-nowrap ${
                    sortField === 'voucherNo' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Voucher Number"
                >
                  <div className="flex items-center gap-1">
                    <span>Voucher #</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'voucherNo' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('regNo')}
                  className={`p-3 cursor-pointer transition-colors hover:bg-slate-100/80 whitespace-nowrap ${
                    sortField === 'regNo' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Student Registration Number"
                >
                  <div className="flex items-center gap-1">
                    <span>Reg #</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'regNo' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('name')}
                  className={`p-3 cursor-pointer transition-colors hover:bg-slate-100/80 min-w-[170px] ${
                    sortField === 'name' || sortField === 'class' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Student & Class"
                >
                  <div className="flex items-center gap-1">
                    <span>Student / Class</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'name' || sortField === 'class' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('netDue')}
                  className={`p-3 cursor-pointer transition-colors hover:bg-slate-100/80 whitespace-nowrap ${
                    sortField === 'netDue' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Net Due Amount"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Net Due</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'netDue' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('paid')}
                  className={`p-3 cursor-pointer transition-colors hover:bg-slate-100/80 whitespace-nowrap ${
                    sortField === 'paid' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Paid Amount"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Paid</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'paid' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className={`p-3 cursor-pointer transition-colors hover:bg-slate-100/80 whitespace-nowrap text-center ${
                    sortField === 'status' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Voucher Status"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Status</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'status' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th className="p-3 w-24 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedVouchers.length > 0 ? (
                paginatedVouchers.map((v) => {
                  const student = students.find((s) => s.id === v.studentId);
                  const schoolClass = classes.find((c) => c.id === v.classId);
                  const isSelected = selectedIds.includes(v.id);
                  const canCollect = v.status !== 'Carried' && v.status !== 'Reversed' && hasPermission('fees.collect');
                  const canCarry = v.status !== 'Paid' && v.status !== 'Carried' && v.status !== 'Reversed' && hasPermission('fees.generate');
                  const canUndoCarry = v.status === 'Carried' && hasPermission('fees.generate');
                  const canDelete = hasPermission('fees.generate');

                  return (
                    <tr
                      key={v.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isSelected ? 'bg-teal-50/40' : ''
                      }`}
                    >
                      <td className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(v.id)}
                          className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <span>{v.voucherNo}</span>
                        {v.voucherType === 'Admission' && (
                          <span className="ml-1.5 text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 align-middle">ADM</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-mono font-semibold text-teal-700 bg-teal-50/80 px-2 py-0.5 rounded border border-teal-100/80 text-[11px] inline-block">
                          {student?.regNo || '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2.5 min-w-[170px]">
                          <StudentAvatar photoUrl={student?.photoUrl} name={student?.name || 'Unknown'} size="sm" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-900 truncate max-w-[150px]">{student?.name || 'Unknown'}</span>
                            <span className="text-[11px] font-medium text-slate-500 truncate max-w-[150px]">
                              {schoolClass?.name || 'Class'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-bold text-slate-900 font-mono text-right whitespace-nowrap">{formatCurrency(v.netDue)}</td>
                      <td className="p-3 font-bold text-emerald-700 font-mono text-right whitespace-nowrap">
                        {formatCurrency(v.amountPaid)}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            v.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : v.status === 'Partial'
                              ? 'bg-amber-100 text-amber-800'
                              : v.status === 'Carried'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td className="p-2 text-center whitespace-nowrap w-24">
                        <div className="flex flex-col gap-1 items-center justify-center w-fit mx-auto">
                          {/* Row 1: Primary actions (Collect, Carry, View) */}
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              disabled={!canCollect}
                              onClick={() => canCollect && handleOpenCollectModal(v)}
                              title={
                                !hasPermission('fees.collect')
                                  ? 'Collect payment permission required'
                                  : v.status === 'Carried'
                                  ? 'Balance already carried forward'
                                  : v.status === 'Paid'
                                  ? 'Record Additional / Advance Payment'
                                  : 'Collect Payment'
                              }
                              className={`p-1.5 rounded-lg transition shrink-0 inline-flex items-center justify-center ${
                                canCollect
                                  ? v.status === 'Paid'
                                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 shadow-2xs cursor-pointer'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer'
                                  : 'bg-slate-100 text-slate-300 border border-slate-200/60 cursor-not-allowed'
                              }`}
                            >
                              <Coins className="w-3.5 h-3.5" />
                            </button>

                            {v.status === 'Carried' ? (
                              <button
                                type="button"
                                disabled={!canUndoCarry}
                                onClick={() => canUndoCarry && handleOpenUndoCarryModal(v)}
                                title={
                                  canUndoCarry
                                    ? `Undo Carry Forward for ${formatMonthName(v.month)}`
                                    : 'Permission required to undo carry forward'
                                }
                                className={`p-1.5 rounded-lg transition shrink-0 inline-flex items-center justify-center ${
                                  canUndoCarry
                                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 shadow-2xs cursor-pointer'
                                    : 'bg-slate-100 text-slate-300 border border-slate-200/60 cursor-not-allowed'
                                }`}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!canCarry}
                                onClick={() => canCarry && handleOpenCarryModalSingle(v)}
                                title={
                                  canCarry
                                    ? `Carry Forward Balance to ${formatMonthName(getNextMonthString(v.month))}`
                                    : v.status === 'Paid'
                                    ? 'Cannot carry forward a fully paid voucher'
                                    : 'Carry forward balance disabled'
                                }
                                className={`p-1.5 rounded-lg transition shrink-0 inline-flex items-center justify-center ${
                                  canCarry
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-2xs cursor-pointer'
                                    : 'bg-slate-100 text-slate-300 border border-slate-200/60 cursor-not-allowed'
                                }`}
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setDetailVoucher(v)}
                              title="View Particulars"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer shrink-0 inline-flex items-center justify-center border border-transparent"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Row 2: Secondary / output actions (Print, PDF, Delete) */}
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPrintingVoucher(v)}
                              title="Print 3-Copy Voucher"
                              className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-slate-100 rounded-lg transition cursor-pointer shrink-0 inline-flex items-center justify-center border border-transparent"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setExportPdfVouchers([v])}
                              title="Download PDF Voucher"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer shrink-0 inline-flex items-center justify-center border border-transparent"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={!canDelete}
                              onClick={() => canDelete && handleOpenDeleteSingle(v)}
                              title={canDelete ? 'Delete Voucher' : 'Permission required to delete'}
                              className={`p-1.5 rounded-lg transition shrink-0 inline-flex items-center justify-center ${
                                canDelete
                                  ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer border border-transparent'
                                  : 'bg-slate-100 text-slate-300 border border-slate-200/60 cursor-not-allowed'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                    No fee vouchers found for {formatMonthName(activeMonth)} matching filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {sortedVouchers.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-3">
              <RecordsPerPageSelector
                value={itemsPerPage}
                onChange={(newSize) => {
                  setItemsPerPage(newSize);
                  setCurrentPage(1);
                }}
                totalRecords={sortedVouchers.length}
                presetOptions={[25, 50, 100]}
                idPrefix="vouchers-per-page"
              />
              <span className="text-slate-400">&bull;</span>
              <span>
                Showing {sortedVouchers.length > 0 ? startIndex + 1 : 0} to{' '}
                {Math.min(startIndex + itemsPerPage, sortedVouchers.length)} of {sortedVouchers.length}{' '}
                vouchers
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100 transition font-semibold cursor-pointer"
              >
                Previous
              </button>
              <span className="px-2 font-bold text-slate-800">
                Page {safeCurrentPage} of {totalPages}
              </span>
              <button
                disabled={safeCurrentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100 transition font-semibold cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generator Wizard Modal */}
      {showGeneratorModal && previewsData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-4 sm:p-5 shadow-2xl space-y-3.5 my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/80">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>Voucher Generation Wizard</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200">
                      {formatMonthName(targetMonth)}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Review student particulars, set due date & fine rate, and generate vouchers.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsParamsCollapsed((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                  title={isParamsCollapsed ? 'Expand generator settings' : 'Collapse generator settings'}
                >
                  {isParamsCollapsed ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                      <span>Expand Settings</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
                      <span>Hide Settings</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGeneratorModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                  title="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Month Closure Gate Blocking Alert */}
            {previewsData.monthClosureBlocked && (
              <div className="px-3.5 py-2.5 bg-rose-50 border-l-4 border-rose-500 rounded-xl text-xs text-rose-900 flex items-start gap-2 shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-rose-800">Month Closure Gate Active: </span>
                  <span>{previewsData.closureMessage}</span>
                </div>
              </div>
            )}

            {/* Parameters & Configuration Toolbar (Collapsible) */}
            {!isParamsCollapsed && (
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs shrink-0 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Target Month</label>
                    <MonthPicker
                      value={targetMonth}
                      onChange={(newMonth) => handleUpdatePreview(scope, scopeClassId, newMonth)}
                      availableMonths={monthsWithData}
                      closedMonths={pickerWindowMonths.filter((m) => getMonthClosureStatus(m).isClosed)}
                      themeColor={themeConfig?.color || 'teal'}
                      isLight={true}
                      showSteppers={false}
                      variant="input"
                      className="w-full"
                      idPrefix="modal-target-month-picker"
                      align="left"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Scope</label>
                    <select
                      value={scope === 'students' ? 'all' : scope}
                      onChange={(e) => handleUpdatePreview(e.target.value as any, scopeClassId, targetMonth)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                      <option value="all">All Active Students</option>
                      <option value="class">Single Class Only</option>
                      <option value="student">Single Student Only</option>
                    </select>
                  </div>

                  {scope === 'class' ? (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Class</label>
                      <select
                        value={scopeClassId}
                        onChange={(e) => handleUpdatePreview(scope, e.target.value, targetMonth)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      >
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : scope === 'student' ? (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Student</label>
                      <select
                        value={selectedSingleStudentId}
                        onChange={(e) => handleSingleStudentChange(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      >
                        <option value="">— Select student —</option>
                        {students
                          .filter((s) => s.status === 'Active')
                          .slice()
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.regNo})
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : null}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Due Date</label>
                    <DatePicker
                      value={dueDateInput}
                      themeColor={themeConfig?.color || 'teal'}
                      onChange={(newDate) => setDueDateInput(newDate)}
                      idPrefix="modal-due-date-picker"
                      placeholder="Select Due Date"
                      required
                    />
                  </div>

                  <div className={scope === 'class' ? '' : 'col-span-2 sm:col-span-1'}>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Late Fine (Rs.)</label>
                    <input
                      type="number"
                      step="50"
                      value={lateFeeInput}
                      onChange={(e) => setLateFeeInput(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Integrated Policy & Exclusions Sub-Bar */}
                {(previewsData.previews.some((p) => p.isBeforeFirstBillingMonth) ||
                  previewsData.previews.some((p) => p.isBlockedByPriorRule) ||
                  previewsData.previews.some((p) => p.isBlockedBySkippedRule) ||
                  (priorMonthRule === 'warning' && previewsData.previews.some((p) => p.hasFutureVouchers)) ||
                  (skippedMonthRule === 'warning' && previewsData.previews.some((p) => p.hasSkippedMonths && !p.isAlreadyGenerated)) ||
                  (priorMonthRule === 'recalculate' && previewsData.previews.some((p) => p.hasFutureVouchers))) && (
                  <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-slate-600">
                    {previewsData.previews.some((p) => p.isBeforeFirstBillingMonth) && (
                      <div className="inline-flex items-center gap-1.5 text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          <strong className="text-slate-700">First Billing Month:</strong> Students with a start month after {formatMonthName(targetMonth)} are excluded.
                        </span>
                      </div>
                    )}

                    {previewsData.previews.some((p) => p.isBlockedByPriorRule) && (
                      <div className="inline-flex items-center gap-1.5 text-rose-700 font-medium">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>Chronological rule: students with future vouchers blocked.</span>
                      </div>
                    )}

                    {previewsData.previews.some((p) => p.isBlockedBySkippedRule) && (
                      <div className="inline-flex items-center gap-1.5 text-rose-700 font-medium">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>Sequential rule: students with skipped months blocked.</span>
                      </div>
                    )}

                    {priorMonthRule === 'warning' && previewsData.previews.some((p) => p.hasFutureVouchers) && (
                      <div className="inline-flex items-center gap-1.5 text-amber-800 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Future vouchers exist (confirmation will be prompted).</span>
                      </div>
                    )}

                    {skippedMonthRule === 'warning' && previewsData.previews.some((p) => p.hasSkippedMonths && !p.isAlreadyGenerated) && (
                      <div className="inline-flex items-center gap-1.5 text-amber-800 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Skipped month warning: unbilled intermediate months exist.</span>
                      </div>
                    )}

                    {priorMonthRule === 'recalculate' && previewsData.previews.some((p) => p.hasFutureVouchers) && (
                      <div className="inline-flex items-center gap-1.5 text-indigo-700 font-medium">
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span>Subsequent voucher arrears will update automatically.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Previews Table & Metric Bar */}
            {(() => {
              const eligiblePreviews = previewsData.previews.filter(
                (p) => !p.isAlreadyGenerated && !p.isBlockedByPriorRule && !p.isBlockedBySkippedRule && !p.isBeforeFirstBillingMonth
              );
              const isAllEligibleSelected =
                eligiblePreviews.length > 0 &&
                eligiblePreviews.every((p) => selectedGenStudentIds.includes(p.student.id));

              const selectedTotalNetDue = previewsData.previews
                .filter((p) => selectedGenStudentIds.includes(p.student.id))
                .reduce((sum, p) => sum + p.netDue, 0);

              const alreadyGenCount = previewsData.previews.filter((p) => p.isAlreadyGenerated).length;
              const blockedCount = previewsData.previews.filter(
                (p) => p.isBlockedByPriorRule || p.isBlockedBySkippedRule || p.isBeforeFirstBillingMonth
              ).length;

              return (
                <div className="flex flex-col flex-1 min-h-0 space-y-2">
                  {/* Summary Metrics & Selection Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs shrink-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <div className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] shadow-2xs">
                        <span className="text-slate-500 font-semibold">Total Students:</span>
                        <span className="font-bold text-slate-800">{previewsData.previews.length}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 text-[11px] shadow-2xs">
                        <span className="text-emerald-700 font-semibold">Selected:</span>
                        <span className="font-bold text-emerald-800">{selectedGenStudentIds.length}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/80 text-[11px] shadow-2xs">
                        <span className="text-teal-700 font-semibold">Est. Net Due:</span>
                        <span className="font-bold text-teal-800 font-mono">{formatCurrency(selectedTotalNetDue)}</span>
                      </div>
                      {alreadyGenCount > 0 && (
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] shadow-2xs">
                          <span className="text-slate-500 font-semibold">Already Issued:</span>
                          <span className="font-bold text-slate-700">{alreadyGenCount}</span>
                        </div>
                      )}
                      {blockedCount > 0 && (
                        <div className="inline-flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/80 text-[11px] shadow-2xs">
                          <span className="text-rose-700 font-semibold">Excluded / Blocked:</span>
                          <span className="font-bold text-rose-800">{blockedCount}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={isAllEligibleSelected ? handleSelectNoneGen : handleSelectAllGen}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-semibold text-xs shadow-2xs transition cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 text-teal-600" />
                        <span>{isAllEligibleSelected ? 'Deselect All' : `Select All Ready (${eligiblePreviews.length})`}</span>
                      </button>
                    </div>
                  </div>

                  {/* Compact Table */}
                  <div
                    className={`w-full overflow-x-auto overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-2xs block flex-1 transition-all ${
                      isParamsCollapsed ? 'max-h-[66vh] sm:max-h-[70vh]' : 'max-h-[50vh] sm:max-h-[54vh]'
                    }`}
                  >
                    <table className="w-full min-w-[750px] border-collapse text-left text-[11px] text-slate-700">
                      <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200 sticky top-0 z-10 shadow-xs">
                        <tr>
                          <th className="py-2 px-2.5 w-8 text-center whitespace-nowrap bg-slate-50">
                            <input
                              type="checkbox"
                              checked={isAllEligibleSelected}
                              onChange={() => (isAllEligibleSelected ? handleSelectNoneGen() : handleSelectAllGen())}
                              className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                              title="Select / Deselect all eligible active students"
                            />
                          </th>
                          <th className="py-2 px-2.5 w-20 whitespace-nowrap bg-slate-50">Reg #</th>
                          <th className="py-2 px-2.5 min-w-[160px] whitespace-nowrap bg-slate-50">Student Name</th>
                          <th className="py-2 px-2.5 whitespace-nowrap bg-slate-50">Class</th>
                          {globalTemplates.map((tpl) => (
                            <th key={tpl.id} className="py-2 px-2.5 text-right whitespace-nowrap bg-slate-50 min-w-[90px]">
                              {tpl.label}
                            </th>
                          ))}
                          <th className="py-2 px-2.5 text-right font-bold whitespace-nowrap bg-slate-50 min-w-[100px]">Net Due</th>
                          <th className="py-2 px-2.5 text-center whitespace-nowrap bg-slate-50 min-w-[140px]">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewsData.previews.map((p) => {
                          const isSelected = selectedGenStudentIds.includes(p.student.id);

                          return (
                            <tr
                              key={p.student.id}
                              className={`transition ${
                                p.isBlockedByPriorRule || p.isBlockedBySkippedRule
                                  ? 'bg-rose-50/40 opacity-75'
                                  : p.isBeforeFirstBillingMonth
                                  ? 'bg-slate-50/70 opacity-75'
                                  : isSelected
                                  ? 'bg-teal-50/40 hover:bg-teal-50/70'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-1.5 px-2.5 text-center">
                                <input
                                  type="checkbox"
                                  disabled={p.isAlreadyGenerated || p.isBlockedByPriorRule || p.isBlockedBySkippedRule || p.isBeforeFirstBillingMonth}
                                  checked={isSelected}
                                  onChange={() => toggleGenStudent(p.student.id)}
                                  className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-30"
                                />
                              </td>
                              <td className="py-1.5 px-2.5 font-mono font-semibold text-teal-700 text-[11px]">
                                {p.student.regNo || '-'}
                              </td>
                              <td className="py-1.5 px-2.5">
                                <div className="flex items-center gap-1.5">
                                  <StudentAvatar photoUrl={p.student.photoUrl} name={p.student.name} size="xs" />
                                  <span className="font-bold text-slate-900 whitespace-nowrap">{p.student.name}</span>
                                </div>
                              </td>
                              <td className="py-1.5 px-2.5 text-slate-600 whitespace-nowrap">{p.schoolClass?.name}</td>
                              {globalTemplates.map((tpl) => {
                                const part = p.particulars.find((item) => item.kind === tpl.kind);
                                const amt = part ? part.amount : 0;
                                return (
                                  <td
                                    key={tpl.id}
                                    className={`py-1.5 px-2.5 text-right font-mono whitespace-nowrap ${
                                      amt < 0
                                        ? 'text-emerald-700 font-semibold'
                                        : tpl.kind === 'PreviousBalance' && amt > 0
                                        ? 'text-rose-700 font-semibold'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {formatCurrency(amt)}
                                  </td>
                                );
                              })}
                              <td className="py-1.5 px-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                                {formatCurrency(p.netDue)}
                              </td>
                              <td className="py-1.5 px-2.5 text-center">
                                {p.isAlreadyGenerated ? (
                                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                    Already Issued
                                  </span>
                                ) : p.isBeforeFirstBillingMonth ? (
                                  <span
                                    title={p.firstBillingMonthBlockReason}
                                    className="bg-slate-100 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center justify-center gap-1 border border-slate-200"
                                  >
                                    <Calendar className="w-3 h-3 text-slate-500" />
                                    Starts {p.student.firstBillingMonth ? formatMonthName(p.student.firstBillingMonth) : 'Later'}
                                  </span>
                                ) : p.isBlockedByPriorRule ? (
                                  <span
                                    title={p.blockReason}
                                    className="bg-rose-100 text-rose-800 text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center justify-center gap-1"
                                  >
                                    <ShieldAlert className="w-3 h-3 text-rose-600" />
                                    Blocked: Future Exists
                                  </span>
                                ) : p.isBlockedBySkippedRule ? (
                                  <span
                                    title={p.skippedBlockReason}
                                    className="bg-rose-100 text-rose-800 text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center justify-center gap-1"
                                  >
                                    <ShieldAlert className="w-3 h-3 text-rose-600" />
                                    Blocked: Month Skipped
                                  </span>
                                ) : p.hasSkippedMonths && skippedMonthRule === 'warning' ? (
                                  <span
                                    title={`Skipped: ${p.skippedMonths?.map(formatMonthName).join(', ')}`}
                                    className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center justify-center gap-1"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    Skipped Warning
                                  </span>
                                ) : p.hasFutureVouchers && priorMonthRule === 'warning' ? (
                                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center justify-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    Warning Mode
                                  </span>
                                ) : p.hasFutureVouchers && priorMonthRule === 'recalculate' ? (
                                  <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center justify-center gap-1">
                                    <RefreshCw className="w-3 h-3 text-indigo-600" />
                                    Auto-Recalculate
                                  </span>
                                ) : isSelected ? (
                                  <span className="bg-teal-100 text-teal-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                    Ready
                                  </span>
                                ) : (
                                  <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                    Unselected
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Action Footer */}
            <div className="flex items-center justify-between pt-2.5 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setShowGeneratorModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={previewsData.monthClosureBlocked || selectedGenStudentIds.length === 0}
                onClick={handleCommitGeneration}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer text-xs disabled:opacity-40 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Commit & Generate ({selectedGenStudentIds.length}) Vouchers</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Payment Modal */}
      {collectingVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto sm:my-8 animate-in fade-in duration-200 border border-slate-200/80">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Collect Payment &bull; {collectingVoucher.voucherNo}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Student: {students.find((s) => s.id === collectingVoucher.studentId)?.name} &bull; {students.find((s) => s.id === collectingVoucher.studentId)?.regNo} &bull; {formatMonthName(collectingVoucher.month)}                  </p>
                </div>
              </div>
              <button
                onClick={() => setCollectingVoucher(null)}
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
                    const newRem = Math.max(0, newNet - (collectingVoucher.amountPaid || 0));
                    if (Number(collectAmount) === collectDynamicRemaining && newRem > 0) {
                      setCollectAmount(newRem);
                    }
                  }}
                  originalItems={collectingVoucher.particulars}
                  onResetToOriginal={() => {
                    setCollectItems(collectingVoucher.particulars.map((p) => ({ ...p })));
                    const rem = Math.max(0, collectingVoucher.netDue - collectingVoucher.amountPaid);
                    setCollectAmount(rem > 0 ? rem : collectingVoucher.netDue);
                  }}
                  onSaveLineItems={handleSaveLineItemsOnly}
                  amountPaid={collectingVoucher.amountPaid}
                  studentId={collectingVoucher.studentId}
                />
              </div>

              {/* Right Pane: Summary Card & Collection Form */}
              <div className="lg:col-span-6 space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                {/* Summary Card */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Student</span>
                    <span className="font-bold text-slate-900">
                      {students.find((s) => s.id === collectingVoucher.studentId)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono">
                    <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                      <div className="text-[9px] text-slate-500 font-sans">Original Due</div>
                      <div className="font-bold text-slate-800 text-xs">{formatCurrency(collectingVoucher.netDue)}</div>
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                      <div className="text-[9px] text-slate-500 font-sans">Paid</div>
                      <div className="font-bold text-emerald-700 text-xs">
                        {formatCurrency(collectingVoucher.amountPaid)}
                      </div>
                    </div>
                    <div className="bg-emerald-50/80 p-1.5 rounded border border-emerald-200">
                      <div className="text-[9px] text-emerald-800 font-sans font-bold">
                        {collectingVoucher.amountPaid >= collectDynamicNetDue ? 'Settlement' : 'Remaining'}
                      </div>
                      <div className="font-black text-emerald-800 text-xs">
                        {collectingVoucher.amountPaid >= collectDynamicNetDue
                          ? `Paid ${
                              collectingVoucher.amountPaid > collectDynamicNetDue
                                ? `(+${formatCurrency(collectingVoucher.amountPaid - collectDynamicNetDue)} Adv)`
                                : ''
                            }`
                          : formatCurrency(collectDynamicRemaining)}
                      </div>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSavePayment} className="space-y-3 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-700">Collection Amount (Rs.) *</label>
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
                        step="1"
                        required
                        min="1"
                        value={collectAmount}
                        onChange={(e) => setCollectAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-base text-emerald-700 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Payment Mode</label>
                      <select
                        value={collectMode}
                        onChange={(e) => setCollectMode(e.target.value as any)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs"
                      >
                        <option value="Cash">Cash Desk</option>
                        <option value="BankTransfer">Bank Transfer / Online</option>
                        <option value="Cheque">Cheque Deposit</option>
                        <option value="Online">Credit/Debit Card</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Bank Ref / Deposit Slip #</label>
                      <input
                        type="text"
                        placeholder="e.g. PK-MZB-988471"
                        value={collectRef}
                        onChange={(e) => setCollectRef(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="Optional receipt notes"
                      value={collectNotes}
                      onChange={(e) => setCollectNotes(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setCollectingVoucher(null)}
                      className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={Number(collectAmount) <= 0}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <Receipt className="w-4 h-4" />
                      <span>Confirm & Post ({collectAmount ? formatCurrency(Number(collectAmount)) : 'Rs. 0'})</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Voucher Particulars &bull; {detailVoucher.voucherNo}
              </h3>
              <button
                onClick={() => setDetailVoucher(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="p-2">Line Item</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedDetailParticulars.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-medium">{item.label}</td>
                        <td
                          className={`p-2 text-right font-bold ${
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
                      <td className="p-2">NET DUE AMOUNT:</td>
                      <td className="p-2 text-right text-teal-700 font-bold">
                        {formatCurrency(detailVoucher.netDue)}
                      </td>
                    </tr>
                    <tr className="bg-rose-50 font-bold text-rose-900 border-t border-rose-200">
                      <td className="p-2">PAYABLE AFTER DUE DATE:</td>
                      <td className="p-2 text-right text-rose-700 font-bold">
                        {formatCurrency(detailVoucher.netDue + (detailVoucher.lateFeeRate || 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
              <div className="flex items-center gap-2">
                {detailVoucher.status === 'Carried' && hasPermission('fees.generate') && (
                  <button
                    type="button"
                    onClick={() => handleOpenUndoCarryModal(detailVoucher)}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Undo Carry Forward
                  </button>
                )}
                {hasPermission('fees.delete') && (
                  <button
                    type="button"
                    onClick={() => handleOpenDeleteSingle(detailVoucher)}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Voucher
                  </button>
                )}
              </div>
              <button
                onClick={() => setDetailVoucher(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal Launcher */}
      {printingVoucher && (
        <PrintVoucherModal
          voucher={printingVoucher}
          onClose={() => setPrintingVoucher(null)}
        />
      )}

      {/* Delete Confirmation Modal with Chronological Block Guard (Configured via Settings Policy) */}
      {deleteModal?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div
            id="voucher-delete-guard-modal"
            className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            {deleteModal.hasDownstream ? (
              // Chronological Sequence Notice (Policy Applied)
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-3 rounded-xl shrink-0 ${
                      voucherDeletionResolution === 'auto-heal'
                        ? 'bg-emerald-100 text-emerald-700'
                        : voucherDeletionResolution === 'cascade'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {voucherDeletionResolution === 'auto-heal' ? (
                      <Sparkles className="w-6 h-6" />
                    ) : voucherDeletionResolution === 'cascade' ? (
                      <Trash2 className="w-6 h-6" />
                    ) : (
                      <ShieldAlert className="w-6 h-6" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        {voucherDeletionResolution === 'auto-heal'
                          ? 'Delete Voucher & Auto-Heal Balances'
                          : voucherDeletionResolution === 'cascade'
                          ? 'Delete Voucher & Cascade Subsequent'
                          : 'Deletion Blocked by System Policy'}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500">
                      {voucherDeletionResolution === 'auto-heal'
                        ? 'Subsequent billing month vouchers exist. Deleting will automatically recalculate downstream balances to remove ghost arrears.'
                        : voucherDeletionResolution === 'cascade'
                        ? `Subsequent billing month vouchers exist. Deleting will remove this voucher and cascade delete all ${deleteModal.totalDownstreamCount} downstream voucher(s).`
                        : 'Subsequent billing month vouchers exist. System policy requires deleting newer vouchers first before removing prior records.'}
                    </p>
                  </div>
                </div>

                {/* Target & Downstream Conflict Details (Brief & Uncluttered) */}
                {deleteModal.downstreamConflicts.length === 1 ? (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Student:</span>
                      <span className="font-bold text-slate-900">
                        {deleteModal.downstreamConflicts[0].student.name}{' '}
                        <span className="text-slate-500 font-mono font-normal">
                          ({deleteModal.downstreamConflicts[0].student.regNo})
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Subsequent Voucher(s):</span>
                      <span className="font-semibold text-slate-800">
                        {deleteModal.downstreamConflicts[0].downstreamVouchers
                          .map((dv) => dv.month)
                          .join(', ')}{' '}
                        <span className="text-slate-500 font-normal">
                          ({deleteModal.downstreamConflicts[0].downstreamVouchers.length} total)
                        </span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div className="flex items-center justify-between font-semibold text-slate-700">
                      <span>Affected Students ({deleteModal.downstreamConflicts.length}):</span>
                      <span className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        {deleteModal.totalDownstreamCount} subsequent voucher(s)
                      </span>
                    </div>
                    <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                      {deleteModal.downstreamConflicts.map((conflict, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/80 text-[11px]"
                        >
                          <span className="font-medium text-slate-900 truncate max-w-[220px]">
                            {conflict.student.name}{' '}
                            <span className="text-slate-500 font-mono font-normal text-[10px]">
                              ({conflict.student.regNo})
                            </span>
                          </span>
                          <span className="text-slate-500 text-[11px]">
                            {conflict.downstreamVouchers.map((dv) => dv.month).join(', ')}{' '}
                            <span className="font-medium text-slate-700">
                              ({conflict.downstreamVouchers.length})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transaction Notice */}
                {deleteModal.hasTransactions && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-900 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      Payment Transactions Detected
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-800/90">
                      {deleteModal.transactionCount} payment transaction(s) recorded on the selected voucher(s). Confirming will automatically reverse and remove those payment records from the collections ledger.
                    </p>
                  </div>
                )}

                {/* Active Policy Status Indicator */}
                <div className="p-2.5 rounded-xl border text-xs flex items-center justify-between bg-slate-50 border-slate-200">
                  <span className="text-slate-500 font-medium">Applied Settings Policy:</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    {voucherDeletionResolution === 'auto-heal' && (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        Auto-Heal & Recalculate
                      </>
                    )}
                    {voucherDeletionResolution === 'cascade' && (
                      <>
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        Cascade Delete All Subsequent
                      </>
                    )}
                    {voucherDeletionResolution === 'manual' && (
                      <>
                        <ArrowUp className="w-3.5 h-3.5 text-slate-700" />
                        Strict Reverse Chronological
                      </>
                    )}
                  </span>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setDeleteModal(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                  >
                    {voucherDeletionResolution === 'manual' ? 'Close' : 'Cancel'}
                  </button>

                  {voucherDeletionResolution === 'auto-heal' && (
                    <button
                      type="button"
                      id="btn-confirm-auto-heal-delete"
                      onClick={handleConfirmDelete}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Auto-Heal & Delete
                    </button>
                  )}

                  {voucherDeletionResolution === 'cascade' && (
                    <button
                      type="button"
                      id="btn-confirm-cascade-delete"
                      onClick={handleConfirmDelete}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Cascade Delete All ({1 + deleteModal.totalDownstreamCount})
                    </button>
                  )}
                </div>
              </div>
            ) : (
              // Standard Delete Confirmation (No Downstream Conflicts)
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 bg-rose-100 text-rose-700 rounded-xl shrink-0">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {deleteModal.mode === 'single'
                        ? `Delete Fee Voucher ${deleteModal.targetVoucher?.voucherNo}`
                        : `Delete ${deleteModal.targetIds?.length} Selected Vouchers`}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      This action will permanently remove the selected voucher record(s).
                    </p>
                  </div>
                </div>

                {deleteModal.mode === 'single' && deleteModal.targetVoucher && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Student:</span>
                      <span className="font-bold text-slate-900">
                        {students.find((s) => s.id === deleteModal.targetVoucher?.studentId)?.name || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Month / Status:</span>
                      <span className="font-semibold text-slate-800">
                        {formatMonthName(deleteModal.targetVoucher.month)} ({deleteModal.targetVoucher.status})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Net Due:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatCurrency(deleteModal.targetVoucher.netDue)}
                      </span>
                    </div>
                  </div>
                )}

                {deleteModal.hasTransactions && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-900 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      Payment Transactions Detected
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-800/90">
                      {deleteModal.mode === 'single'
                        ? `This voucher has ${deleteModal.transactionCount} recorded payment transaction(s). Confirming will automatically reverse/delete those payment records from collections.`
                        : `${deleteModal.transactionCount} payment transaction(s) exist across these vouchers. Confirming will automatically reverse/delete those payment records from collections.`}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setDeleteModal(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    id="btn-confirm-standard-delete"
                    onClick={handleConfirmDelete}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirm & Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Policy Consequence Summary Alert Modal */}
      {policyConfirmModal?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl shrink-0 bg-amber-100 text-amber-700">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Generation Policy Consequence Confirmation
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  You are generating fee vouchers for <strong>{formatMonthName(targetMonth)}</strong>. Please review the policy consequences below before proceeding.
                </p>
              </div>
            </div>

            {/* Skipped Month Warning Section */}
            {policyConfirmModal.affectedSkippedPreviews.length > 0 && (
              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/80 text-xs text-amber-900 space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Skipped Billing Month Policy Consequence:
                </div>
                <p className="leading-relaxed">
                  Generating vouchers for <strong>{formatMonthName(targetMonth)}</strong> will proceed, but prior intermediate billing month(s) (e.g. {policyConfirmModal.affectedSkippedPreviews[0]?.skippedMonths?.map(formatMonthName).join(', ')}) remain unbilled and skipped for the affected student(s).
                </p>
                <div className="text-[11px] font-bold text-slate-700 pt-1">
                  Students with Skipped Months ({policyConfirmModal.affectedSkippedPreviews.length}):
                </div>
                <div className="max-h-28 overflow-y-auto border border-amber-200/60 rounded-lg p-1.5 bg-white/80 space-y-1">
                  {policyConfirmModal.affectedSkippedPreviews.map((p) => (
                    <div key={p.student.id} className="flex items-center justify-between text-slate-800 text-[11px] px-2 py-1 bg-amber-50/50 rounded">
                      <span className="font-semibold">{p.student.name} ({p.student.regNo})</span>
                      <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                        Skipped: {p.skippedMonths?.map(formatMonthName).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prior Month Consequence Section */}
            {policyConfirmModal.affectedPriorPreviews.length > 0 && (
              policyConfirmModal.priorRule === 'warning' ? (
                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/80 text-xs text-amber-900 space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Prior Month Sequential Consequence:
                  </div>
                  <p className="leading-relaxed">
                    Generating vouchers for <strong>{formatMonthName(targetMonth)}</strong> will create the new voucher(s), but existing future vouchers will <strong>NOT</strong> automatically inherit new carry-over balance arrears.
                  </p>
                  <div className="text-[11px] font-bold text-slate-700 pt-1">
                    Students with Existing Future Vouchers ({policyConfirmModal.affectedPriorPreviews.length}):
                  </div>
                  <div className="max-h-28 overflow-y-auto border border-amber-200/60 rounded-lg p-1.5 bg-white/80 space-y-1">
                    {policyConfirmModal.affectedPriorPreviews.map((p) => (
                      <div key={p.student.id} className="flex items-center justify-between text-slate-800 text-[11px] px-2 py-1 bg-amber-50/50 rounded">
                        <span className="font-semibold">{p.student.name} ({p.student.regNo})</span>
                        <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                          Future: {formatMonthName(p.latestFutureMonth || '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-indigo-50 rounded-xl border border-indigo-200/80 text-xs text-indigo-900 space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-indigo-800">
                    <RefreshCw className="w-4 h-4 text-indigo-600 shrink-0" />
                    Auto-Recalculation Notice:
                  </div>
                  <p className="leading-relaxed">
                    Generating vouchers for <strong>{formatMonthName(targetMonth)}</strong> will create the new voucher(s) AND <strong>automatically recalculate</strong> and update previous balance arrears on all subsequent future vouchers.
                  </p>
                  <div className="text-[11px] font-bold text-slate-700 pt-1">
                    Students with Existing Future Vouchers ({policyConfirmModal.affectedPriorPreviews.length}):
                  </div>
                  <div className="max-h-28 overflow-y-auto border border-indigo-200/60 rounded-lg p-1.5 bg-white/80 space-y-1">
                    {policyConfirmModal.affectedPriorPreviews.map((p) => (
                      <div key={p.student.id} className="flex items-center justify-between text-slate-800 text-[11px] px-2 py-1 bg-indigo-50/50 rounded">
                        <span className="font-semibold">{p.student.name} ({p.student.regNo})</span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
                          Future: {formatMonthName(p.latestFutureMonth || '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPolicyConfirmModal(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeCommitGeneration}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                Confirm & Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carry Forward Confirmation Modal */}
      {carryModal?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-amber-100 text-amber-700 shrink-0">
                  <ArrowRight className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Confirm Carry Forward to {formatMonthName(carryModal.targetMonth)}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Carrying forward will mark selected voucher(s) as 'Carried' and transfer arrears as Previous Balance into {formatMonthName(carryModal.targetMonth)}.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCarryModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addLateFine}
                  onChange={(e) => setAddLateFine(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300 cursor-pointer"
                />
                <span className="font-semibold text-amber-950">Add Late Payment Fine / Surcharge</span>
              </label>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[11px] font-bold ${addLateFine ? 'text-amber-800' : 'text-slate-400'}`}>Rs.</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  disabled={!addLateFine}
                  value={carryFineAmount}
                  onChange={(e) => setCarryFineAmount(Math.max(0, Number(e.target.value) || 0))}
                  className={`w-24 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-right border transition-all ${
                    addLateFine
                      ? 'bg-white border-amber-300 text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none shadow-2xs'
                      : 'bg-amber-100/40 border-amber-200/60 text-slate-400 cursor-not-allowed opacity-60'
                  }`}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-700 flex justify-between">
                <span>Vouchers to Carry ({carryModal.targetVouchers.length}):</span>
                <span className="text-amber-800">
                  Total Arrears:{' '}
                  {formatCurrency(
                    carryModal.targetVouchers.reduce(
                      (sum, v) => sum + (v.netDue - v.amountPaid) + (addLateFine ? carryFineAmount : 0),
                      0
                    )
                  )}
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50 space-y-1.5 text-xs">
                {carryModal.targetVouchers.map((v) => {
                  const student = students.find((s) => s.id === v.studentId);
                  const cls = classes.find((c) => c.id === v.classId);
                  const arrears = v.netDue - v.amountPaid + (addLateFine ? carryFineAmount : 0);

                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {student?.name || 'Student'} ({v.voucherNo})
                        </div>
                        <div className="text-[10px] text-slate-500">{cls?.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-amber-700">{formatCurrency(arrears)}</div>
                        <div className="text-[9px] text-slate-400">Target: {carryModal.targetMonth}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCarryModal(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeCarryForwardFromVouchers}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Confirm & Carry Forward ({carryModal.targetVouchers.length})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Carry Forward Modal with Strict Downstream Guard */}
      {undoCarryModal?.isOpen && undoCarryModal.targetVoucher && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  undoCarryModal.hasDownstream
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {undoCarryModal.hasDownstream ? (
                  <AlertTriangle className="w-6 h-6" />
                ) : (
                  <RotateCcw className="w-6 h-6" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {undoCarryModal.hasDownstream
                    ? 'Cannot Undo Carry Forward (Downstream Conflict)'
                    : 'Undo Carry Forward Confirmation'}
                </h3>
                <p className="text-xs text-slate-500">
                  Voucher #{undoCarryModal.targetVoucher.voucherNo} &bull;{' '}
                  {formatMonthName(undoCarryModal.targetVoucher.month)}
                </p>
              </div>
            </div>

            {undoCarryModal.hasDownstream ? (
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
                  <p className="font-semibold">
                    This action is blocked to preserve chronological ledger integrity.
                  </p>
                  <p>
                    A subsequent voucher already exists for this student in{' '}
                    <span className="font-bold">
                      {undoCarryModal.downstreamMonths.map((m) => formatMonthName(m)).join(', ')}
                    </span>
                    .
                  </p>
                  <p className="text-rose-900 font-medium">
                    To undo carry forward on this {formatMonthName(undoCarryModal.targetVoucher.month)}{' '}
                    voucher, you must first delete or resolve the subsequent month voucher(s).
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-600">
                <p>
                  Are you sure you want to revert the carry forward status for Voucher{' '}
                  <span className="font-bold text-slate-900">
                    #{undoCarryModal.targetVoucher.voucherNo}
                  </span>{' '}
                  (
                  {students.find((s) => s.id === undoCarryModal.targetVoucher.studentId)?.name ||
                    'Student'}
                  )?
                </p>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Status:</span>
                    <span className="font-bold text-slate-800">Carried Forward</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Restored Status:</span>
                    <span className="font-bold text-teal-700">
                      {(undoCarryModal.targetVoucher.paidAmount || 0) > 0 ? 'Partial' : 'Issued'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Net Due:</span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(undoCarryModal.targetVoucher.netDue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Outstanding Unpaid:</span>
                    <span className="font-bold text-rose-600">
                      {formatCurrency(
                        undoCarryModal.targetVoucher.netDue - (undoCarryModal.targetVoucher.amountPaid || 0)
                      )}
                    </span>
                  </div>
                </div>
                <p className="text-slate-500 italic">
                  Once restored, this voucher will be available for direct fee collection or re-carrying.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUndoCarryModal(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
              >
                {undoCarryModal.hasDownstream ? 'Close' : 'Cancel'}
              </button>
              {!undoCarryModal.hasDownstream && (
                <button
                  type="button"
                  onClick={executeUndoCarryForward}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Confirm Undo Carry</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Export Modal */}
      {exportPdfVouchers && (
        <ExportPdfModal
          vouchers={exportPdfVouchers}
          onClose={() => setExportPdfVouchers(null)}
          onSuccess={(msg) => showToast(msg)}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[9999] animate-in slide-in-from-bottom-5 duration-200">
          <div
            className={`px-4 py-3 rounded-xl shadow-xl border text-xs font-bold flex items-center gap-2.5 max-w-sm ${
              toastMessage.type === 'success'
                ? 'bg-slate-900 text-white border-slate-800'
                : 'bg-rose-600 text-white border-rose-700'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
            )}
            <span className="flex-1">{toastMessage.text}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="p-1 hover:bg-white/20 rounded-lg transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
