import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DEFAULT_PAYMENT_MODE, type PaymentMode } from '../utils/paymentMode';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { FeeVoucher, VoucherStatus, ParticularKind, VoucherItem } from '../types';
import { formatCurrency, formatMonthName, getAppliedFineAmount, getEffectiveMultiple, getMonthPickerWindow, getNextMonthString, mergeWithDataMonths, roundUpToMultiple, VoucherPreviewCalculation } from '../utils/feeMath';
import { MonthPicker } from './MonthPicker';
import { DatePicker } from './DatePicker';
import { PrintVoucherModal } from './PrintVoucherModal';
import { ExportPdfModal } from './ExportPdfModal';
import { StudentAvatar } from './StudentAvatar';
import { VoucherParticularsEditor } from './VoucherParticularsEditor';
import { RecordsPerPageSelector } from './RecordsPerPageSelector';
import { DeleteVoucherModal, DeleteModalState } from './vouchers/DeleteVoucherModal';
import { PolicyConsequenceModal, PolicyConfirmModalState } from './vouchers/PolicyConsequenceModal';
import { CarryForwardModal, CarryModalState } from './vouchers/CarryForwardModal';
import { UndoCarryModal, UndoCarryModalState } from './vouchers/UndoCarryModal';
import { VoucherDetailModal } from './vouchers/VoucherDetailModal';
import { CollectPaymentModal } from './vouchers/CollectPaymentModal';
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
  SlidersHorizontal,
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
    defaultDueDateEnabled,
    getComputedDefaultDueDate,
    roundingMultiple,
    roundingEnabled,
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
  const [singleStudentSearchQuery, setSingleStudentSearchQuery] = useState('');
  const [isSingleStudentComboOpen, setIsSingleStudentComboOpen] = useState(false);
  const singleStudentComboRef = useRef<HTMLDivElement>(null);
  const [selectedGenStudentIds, setSelectedGenStudentIds] = useState<string[]>([]);
  const [isParamsCollapsed, setIsParamsCollapsed] = useState(false);

  // Automatically sync generator targetMonth when working month in header changes
  useEffect(() => {
    setTargetMonth(activeMonth);
  }, [activeMonth]);

  useEffect(() => {
    setLateFeeInput(defaultLateFeeRate);
  }, [defaultLateFeeRate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (singleStudentComboRef.current && !singleStudentComboRef.current.contains(event.target as Node)) {
        setIsSingleStudentComboOpen(false);
      }
    };
    if (isSingleStudentComboOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSingleStudentComboOpen]);

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
  const [collectMode, setCollectMode] = useState<PaymentMode>(DEFAULT_PAYMENT_MODE);
  const [collectRef, setCollectRef] = useState('');
  const [collectNotes, setCollectNotes] = useState('');
  const [collectDate, setCollectDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectItems, setCollectItems] = useState<VoucherItem[]>([]);

  // Calculations for collecting voucher
  const collectDynamicNetDue = useMemo(() => {
    if (collectItems.length > 0) {
      const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, collectingVoucher?.roundingMultiple);
      return roundUpToMultiple(collectItems.reduce((sum, p) => sum + (Number(p.amount) || 0), 0), mult);
    }
    return collectingVoucher ? collectingVoucher.netDue : 0;
  }, [collectItems, collectingVoucher, roundingEnabled, roundingMultiple]);

  const collectDynamicRemaining = useMemo(() => {
    if (!collectingVoucher) return 0;
    return Math.max(0, collectDynamicNetDue - collectingVoucher.amountPaid);
  }, [collectDynamicNetDue, collectingVoucher]);

  // Generator Preview Sorting state (default: Reg # ascending)
  const [previewSortField, setPreviewSortField] = useState<string>('regNo');
  const [previewSortDirection, setPreviewSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleTogglePreviewSort = (field: string) => {
    if (previewSortField === field) {
      setPreviewSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setPreviewSortField(field);
      setPreviewSortDirection('asc');
    }
  };

  const renderPreviewSortIcon = (field: string) => {
    if (previewSortField === field) {
      return previewSortDirection === 'asc' ? (
        <ArrowUp className="w-3.5 h-3.5 text-teal-600 shrink-0 inline-block" />
      ) : (
        <ArrowDown className="w-3.5 h-3.5 text-teal-600 shrink-0 inline-block" />
      );
    }
    return (
      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 shrink-0 inline-block transition" />
    );
  };

  // Voucher Detail Modal
  const [detailVoucher, setDetailVoucher] = useState<FeeVoucher | null>(null);

  const globalTemplates = useMemo(() => {
    return (templates || [])
      .filter((t) => !t.studentId && !t.classId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [templates]);

  // Deduplicated unique fee columns for preview modal
  const previewFeeColumns = useMemo(() => {
    const kindMap = new Map<string, { id: string; kind: ParticularKind; label: string; sortOrder: number }>();

    const CANONICAL_ORDER: Record<string, number> = {
      Tuition: 10,
      Flex1: 20,
      Flex2: 30,
      Transport: 40,
      Flex3: 50,
      Flex4: 60,
      Fine: 70,
      PreviousBalance: 80,
      Discount: 90,
    };

    const globals = (templates || []).filter((t) => !t.studentId && !t.classId);

    // Prefer template with targetMonth over generic 'all' or empty month
    globals.forEach((t) => {
      const existing = kindMap.get(t.kind);
      if (!existing || t.month === targetMonth) {
        kindMap.set(t.kind, {
          id: t.id,
          kind: t.kind,
          label: t.label,
          sortOrder: t.sortOrder ?? CANONICAL_ORDER[t.kind] ?? 99,
        });
      }
    });

    // Also include any particulars kind present in calculated previews
    if (previewsData?.previews) {
      previewsData.previews.forEach((p) => {
        p.particulars.forEach((item) => {
          if (!kindMap.has(item.kind)) {
            kindMap.set(item.kind, {
              id: item.kind,
              kind: item.kind,
              label: item.label,
              sortOrder: CANONICAL_ORDER[item.kind] ?? 99,
            });
          }
        });
      });
    }

    return Array.from(kindMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [templates, targetMonth, previewsData]);

  // Generator Preview sorted list (default sorted by Reg #)
  const sortedPreviews = useMemo(() => {
    if (!previewsData?.previews) return [];
    return [...previewsData.previews].sort((a, b) => {
      let comp = 0;
      if (previewSortField === 'regNo') {
        const regA = a.student.regNo || a.student.studentNo || '';
        const regB = b.student.regNo || b.student.studentNo || '';
        comp = regA.localeCompare(regB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (previewSortField === 'name') {
        comp = (a.student.name || '').localeCompare(b.student.name || '');
      } else if (previewSortField === 'class') {
        const clsA = a.schoolClass?.name || '';
        const clsB = b.schoolClass?.name || '';
        comp = clsA.localeCompare(clsB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (previewSortField === 'netDue') {
        comp = a.netDue - b.netDue;
      } else if (previewSortField === 'status') {
        const getStatusRank = (p: VoucherPreviewCalculation) => {
          if (p.isBlockedByPriorRule || p.isBlockedBySkippedRule || p.isBeforeFirstBillingMonth) return 1;
          if (p.isAlreadyGenerated) return 2;
          return 3;
        };
        comp = getStatusRank(a) - getStatusRank(b);
      } else {
        const amtA = a.particulars.find((it) => it.kind === previewSortField)?.amount ?? 0;
        const amtB = b.particulars.find((it) => it.kind === previewSortField)?.amount ?? 0;
        comp = amtA - amtB;
      }

      if (comp === 0 && previewSortField !== 'regNo') {
        const regA = a.student.regNo || a.student.studentNo || '';
        const regB = b.student.regNo || b.student.studentNo || '';
        comp = regA.localeCompare(regB, undefined, { numeric: true, sensitivity: 'base' });
      }

      return previewSortDirection === 'asc' ? comp : -comp;
    });
  }, [previewsData?.previews, previewSortField, previewSortDirection]);

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
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);

  // Policy Consequence Confirmation Modal State
  const [policyConfirmModal, setPolicyConfirmModal] = useState<PolicyConfirmModalState | null>(null);

  // Carry Forward Confirmation Modal State
  const [carryModal, setCarryModal] = useState<CarryModalState | null>(null);
  const [addLateFine, setAddLateFine] = useState(true);
  const [carryFineAmount, setCarryFineAmount] = useState<number>(defaultLateFeeRate || 500);

  // Undo Carry Forward Confirmation Modal State
  const [undoCarryModal, setUndoCarryModal] = useState<UndoCarryModalState | null>(null);

  useEffect(() => {
    setCarryFineAmount(defaultLateFeeRate || 500);
  }, [defaultLateFeeRate]);

  useEscapeKey(() => {
    if (isSingleStudentComboOpen) {
      setIsSingleStudentComboOpen(false);
    } else if (policyConfirmModal) {
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
    isSingleStudentComboOpen ||
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
    setPreviewSortField('regNo');
    setPreviewSortDirection('asc');
    const initialDue = defaultDueDateEnabled ? getComputedDefaultDueDate(monthToUse) : '';
    setDueDateInput(initialDue);
    const { data, selected } = buildGeneratorPreview(scope, scopeClassId, monthToUse);
    setPreviewsData(data);
    setSelectedGenStudentIds(selected);
    setShowGeneratorModal(true);
  };

  const handleUpdatePreview = (newScope = scope, newClassId = scopeClassId, newMonth = targetMonth) => {
    setScope(newScope);
    setScopeClassId(newClassId);
    if (newMonth !== targetMonth) {
      setTargetMonth(newMonth);
      if (defaultDueDateEnabled) {
        setDueDateInput(getComputedDefaultDueDate(newMonth));
      }
    }
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
    setCollectMode(DEFAULT_PAYMENT_MODE);
    setCollectRef('');
    setCollectNotes('');
    setCollectDate(new Date().toISOString().split('T')[0]);
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
      collectDate || undefined,
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
    const pageIds = paginatedVouchers.map((v) => v.id);
    const allPageSelected =
      pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
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
                      paginatedVouchers.length > 0 &&
                      paginatedVouchers.every((v) => selectedIds.includes(v.id))
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-3 sm:p-5 shadow-2xl space-y-2 sm:space-y-3 my-auto h-[96dvh] sm:h-auto sm:max-h-[92vh] max-h-[96dvh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 sm:pb-2.5 shrink-0 gap-2">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                <div className="p-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/80 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                      Voucher Generator
                    </h3>
                    <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 inline-flex items-center whitespace-nowrap shrink-0">
                      {formatMonthName(targetMonth)}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 hidden sm:block truncate mt-0.5">
                    Review student particulars, set due date & fine rate, and generate vouchers.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsParamsCollapsed((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
                  title={isParamsCollapsed ? 'Expand generator settings' : 'Collapse generator settings'}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="hidden sm:inline">{isParamsCollapsed ? 'Expand Settings' : 'Hide Settings'}</span>
                  <span className="sm:hidden">{isParamsCollapsed ? 'Settings' : 'Hide'}</span>
                  {isParamsCollapsed ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGeneratorModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
                  title="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Month Closure Gate Blocking Alert */}
            {previewsData.monthClosureBlocked && (
              <div className="px-3 py-2 bg-rose-50 border-l-4 border-rose-500 rounded-xl text-xs text-rose-900 flex items-start gap-2 shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-rose-800">Month Closure Gate Active: </span>
                  <span>{previewsData.closureMessage}</span>
                </div>
              </div>
            )}

            {/* Parameters Summary Bar (When Collapsed) */}
            {isParamsCollapsed && (
              <div className="bg-slate-50 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-slate-200/80 text-xs shrink-0 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-2.5 sm:gap-x-3.5 gap-y-0.5 text-slate-600 text-[11px] sm:text-xs min-w-0">
                  <div className="inline-flex items-center gap-1 font-bold text-slate-800">
                    <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>{formatMonthName(targetMonth)}</span>
                  </div>
                  <div className="inline-flex items-center gap-1">
                    <span className="text-slate-300 hidden sm:inline">•</span>
                    <span className="text-slate-500">Scope:</span>
                    <span className="font-semibold text-slate-800">
                      {scope === 'all'
                        ? 'All Active'
                        : scope === 'class'
                        ? (classes.find((c) => c.id === scopeClassId)?.name || 'Class')
                        : 'Single Student'}
                    </span>
                  </div>
                  {dueDateInput && (
                    <div className="inline-flex items-center gap-1">
                      <span className="text-slate-300 hidden sm:inline">•</span>
                      <span className="text-slate-500">Due:</span>
                      <span className="font-semibold text-slate-800 font-mono">{dueDateInput}</span>
                    </div>
                  )}
                  <div className="inline-flex items-center gap-1">
                    <span className="text-slate-300 hidden sm:inline">•</span>
                    <span className="text-slate-500">Fine:</span>
                    <span className="font-semibold text-slate-800 font-mono">{formatCurrency(lateFeeInput)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsParamsCollapsed(false)}
                  className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-lg text-[11px] sm:text-xs font-bold shrink-0 transition cursor-pointer flex items-center gap-1"
                  title="Modify parameters like Month, Scope, Due Date, or Late Fine"
                >
                  <span>Edit</span>
                  <ChevronDown className="w-3 h-3 text-teal-600" />
                </button>
              </div>
            )}

            {/* Parameters & Configuration Toolbar (Collapsible) */}
            {!isParamsCollapsed && (
              <div className="bg-slate-50 p-2 sm:p-2.5 rounded-xl border border-slate-200 text-xs shrink-0 space-y-2 max-h-[35vh] sm:max-h-none overflow-y-auto">
                <div
                  className={`grid gap-2 sm:gap-2.5 ${
                    scope === 'class' || scope === 'student'
                      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
                      : 'grid-cols-2 sm:grid-cols-4'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                      <label className="block text-[10px] sm:text-[11px] font-bold text-slate-600">Target Month</label>
                    </div>
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
                    <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                      <label className="block text-[10px] sm:text-[11px] font-bold text-slate-600">Scope</label>
                    </div>
                    <select
                      value={scope === 'students' ? 'all' : scope}
                      onChange={(e) => handleUpdatePreview(e.target.value as any, scopeClassId, targetMonth)}
                      className="w-full px-2 sm:px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                      <option value="all">All Active Students</option>
                      <option value="class">Single Class Only</option>
                      <option value="student">Single Student Only</option>
                    </select>
                  </div>

                  {scope === 'class' ? (
                    <div>
                      <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                        <label className="block text-[10px] sm:text-[11px] font-bold text-slate-600">Select Class</label>
                      </div>
                      <select
                        value={scopeClassId}
                        onChange={(e) => handleUpdatePreview(scope, e.target.value, targetMonth)}
                        className="w-full px-2 sm:px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
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
                      <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                        <label className="block text-[10px] sm:text-[11px] font-bold text-slate-600">Select Student</label>
                      </div>
                      {(() => {
                        const activeStudentsList = students.filter((s) => s.status === 'Active');
                        const term = singleStudentSearchQuery.toLowerCase().trim();
                        const filteredCandidates = activeStudentsList.filter((s) => {
                          if (!term) return true;
                          const cls = classes.find((c) => c.id === s.classId);
                          return (
                            s.name.toLowerCase().includes(term) ||
                            s.regNo.toLowerCase().includes(term) ||
                            (s.studentNo && s.studentNo.toLowerCase().includes(term)) ||
                            (s.fatherName && s.fatherName.toLowerCase().includes(term)) ||
                            (s.mobileNumber && s.mobileNumber.includes(term)) ||
                            (cls && cls.name.toLowerCase().includes(term))
                          );
                        });
                        const selectedStudent = students.find((s) => s.id === selectedSingleStudentId);
                        return (
                          <div className="relative min-w-0" ref={singleStudentComboRef}>
                            {/* Click outside backdrop */}
                            {isSingleStudentComboOpen && (
                              <div
                                className="fixed inset-0 z-40 bg-transparent"
                                onClick={() => setIsSingleStudentComboOpen(false)}
                              />
                            )}

                            <div className="relative z-50">
                              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              <input
                                type="text"
                                placeholder="Search student..."
                                value={singleStudentSearchQuery}
                                onChange={(e) => {
                                  setSingleStudentSearchQuery(e.target.value);
                                  handleSingleStudentChange('');
                                  setIsSingleStudentComboOpen(true);
                                }}
                                onFocus={() => setIsSingleStudentComboOpen(true)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setIsSingleStudentComboOpen(false);
                                  } else if (e.key === 'Enter' && selectedStudent) {
                                    e.preventDefault();
                                    setIsSingleStudentComboOpen(false);
                                  }
                                }}
                                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition truncate"
                              />
                              {singleStudentSearchQuery || selectedStudent ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSingleStudentSearchQuery('');
                                    handleSingleStudentChange('');
                                    setIsSingleStudentComboOpen(false);
                                  }}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                                  title="Clear search"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              )}
                            </div>

                            {/* Dropdown Popover List */}
                            {isSingleStudentComboOpen && (
                              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 ring-1 ring-slate-900/10">
                                {filteredCandidates.length > 0 ? (
                                  filteredCandidates.slice(0, 50).map((s) => {
                                    const cls = classes.find((c) => c.id === s.classId);
                                    const isSelected = s.id === selectedSingleStudentId;
                                    return (
                                      <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => {
                                          handleSingleStudentChange(s.id);
                                          setSingleStudentSearchQuery(`${s.name} (${s.regNo})`);
                                          setIsSingleStudentComboOpen(false);
                                        }}
                                        className={`w-full text-left p-2.5 hover:bg-teal-50/60 flex items-center justify-between gap-2.5 transition cursor-pointer ${
                                          isSelected ? 'bg-teal-50 font-bold' : ''
                                        }`}
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                                          <StudentAvatar photoUrl={s.photoUrl} name={s.name} size="xs" />
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-bold text-slate-900 truncate text-xs" title={s.name}>
                                                {s.name}
                                              </span>
                                              <span className="text-[10px] font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200/60 px-1.5 py-0.2 rounded shrink-0">
                                                {s.regNo}
                                              </span>
                                            </div>
                                            <div className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                              <span>{cls?.name || 'No Class'}</span>
                                              {s.fatherName && <span>&bull; S/D of {s.fatherName}</span>}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                                          <span
                                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                              s.status === 'Active'
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : 'bg-rose-100 text-rose-800'
                                            }`}
                                          >
                                            {s.status}
                                          </span>
                                          {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 mr-0.5" />}
                                        </div>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <div className="p-4 text-center text-slate-400 text-xs italic">
                                    No matching students found
                                  </div>
                                )}
                                {filteredCandidates.length > 50 && (
                                  <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50 font-medium">
                                    Showing 50 of {filteredCandidates.length} students. Refine query to narrow down.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}

                  <div>
                    <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                      <label className="block text-[10px] sm:text-[11px] font-bold text-slate-600">Due Date</label>
                      {defaultDueDateEnabled && dueDateInput && (
                        <span className="text-[9px] leading-none font-semibold text-teal-700 bg-teal-50 px-1 py-0.5 rounded border border-teal-200/80 flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" />
                          Default
                        </span>
                      )}
                    </div>
                    <DatePicker
                      value={dueDateInput}
                      size="sm"
                      themeColor={themeConfig?.color || 'teal'}
                      onChange={(newDate) => setDueDateInput(newDate)}
                      idPrefix="modal-due-date-picker"
                      placeholder="Select Due Date"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                      <label className="block text-[10px] sm:text-[11px] font-bold text-slate-600">Late Fine (Rs.)</label>
                    </div>
                    <input
                      type="number"
                      value={lateFeeInput}
                      onChange={(e) => setLateFeeInput(Number(e.target.value))}
                      className="w-full px-2 sm:px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
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
                  <div className="pt-1.5 sm:pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-[11px] text-slate-600">
                    {previewsData.previews.some((p) => p.isBeforeFirstBillingMonth) && (
                      <div className="inline-flex items-center gap-1.5 text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          <strong className="text-slate-700">First Billing Month:</strong> Students with start after {formatMonthName(targetMonth)} excluded.
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
                        <span>Future vouchers exist (confirmation will prompt).</span>
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
                <div className="flex flex-col flex-1 min-h-0 space-y-1.5 sm:space-y-2">
                  {/* Summary Metrics & Selection Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 bg-slate-50 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 text-xs shrink-0">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 min-w-0">
                      <div className="inline-flex items-center gap-1 bg-white px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-slate-200 text-[10px] sm:text-[11px] shadow-2xs">
                        <span className="text-slate-500 font-semibold">Total:</span>
                        <span className="font-bold text-slate-800">{previewsData.previews.length}</span>
                      </div>
                      <div className="inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-emerald-200/80 text-[10px] sm:text-[11px] shadow-2xs">
                        <span className="text-emerald-700 font-semibold">Selected:</span>
                        <span className="font-bold text-emerald-800">{selectedGenStudentIds.length}</span>
                      </div>
                      <div className="inline-flex items-center gap-1 bg-teal-50 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-teal-200/80 text-[10px] sm:text-[11px] shadow-2xs">
                        <span className="text-teal-700 font-semibold">
                          <span className="sm:hidden">Net:</span>
                          <span className="hidden sm:inline">Est. Net Due:</span>
                        </span>
                        <span className="font-bold text-teal-800 font-mono">{formatCurrency(selectedTotalNetDue)}</span>
                      </div>
                      {alreadyGenCount > 0 && (
                        <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-slate-200 text-[10px] sm:text-[11px] shadow-2xs">
                          <span className="text-slate-500 font-semibold">Issued:</span>
                          <span className="font-bold text-slate-700">{alreadyGenCount}</span>
                        </div>
                      )}
                      {blockedCount > 0 && (
                        <div className="inline-flex items-center gap-1 bg-rose-50 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-rose-200/80 text-[10px] sm:text-[11px] shadow-2xs">
                          <span className="text-rose-700 font-semibold">Blocked:</span>
                          <span className="font-bold text-rose-800">{blockedCount}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={isAllEligibleSelected ? handleSelectNoneGen : handleSelectAllGen}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-semibold text-[11px] sm:text-xs shadow-2xs transition cursor-pointer w-full sm:w-auto"
                      >
                        <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span>{isAllEligibleSelected ? 'Deselect All' : `Select All Ready (${eligiblePreviews.length})`}</span>
                      </button>
                    </div>
                  </div>

                  {/* Compact Table Wrapper with guaranteed min-height */}
                  <div
                    className={`w-full overflow-x-auto overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-2xs block flex-1 min-h-[190px] sm:min-h-[240px] transition-all ${
                      isParamsCollapsed ? 'max-h-[72vh]' : 'max-h-[48vh] sm:max-h-[56vh]'
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
                          <th
                            onClick={() => handleTogglePreviewSort('regNo')}
                            className="py-2 px-2.5 w-20 whitespace-nowrap bg-slate-50 cursor-pointer hover:bg-slate-100 select-none group"
                            title="Click to sort by Reg #"
                          >
                            <div className="inline-flex items-center gap-1">
                              <span>Reg #</span>
                              {renderPreviewSortIcon('regNo')}
                            </div>
                          </th>
                          <th
                            onClick={() => handleTogglePreviewSort('name')}
                            className="py-2 px-2.5 min-w-[160px] whitespace-nowrap bg-slate-50 cursor-pointer hover:bg-slate-100 select-none group"
                            title="Click to sort by Student Name"
                          >
                            <div className="inline-flex items-center gap-1">
                              <span>Student Name</span>
                              {renderPreviewSortIcon('name')}
                            </div>
                          </th>
                          <th
                            onClick={() => handleTogglePreviewSort('class')}
                            className="py-2 px-2.5 whitespace-nowrap bg-slate-50 cursor-pointer hover:bg-slate-100 select-none group"
                            title="Click to sort by Class"
                          >
                            <div className="inline-flex items-center gap-1">
                              <span>Class</span>
                              {renderPreviewSortIcon('class')}
                            </div>
                          </th>
                          {previewFeeColumns.map((col) => (
                            <th
                              key={col.kind}
                              onClick={() => handleTogglePreviewSort(col.kind)}
                              className="py-2 px-2.5 text-right whitespace-nowrap bg-slate-50 min-w-[90px] cursor-pointer hover:bg-slate-100 select-none group"
                              title={`Click to sort by ${col.label}`}
                            >
                              <div className="inline-flex items-center gap-1 justify-end w-full">
                                <span>{col.label}</span>
                                {renderPreviewSortIcon(col.kind)}
                              </div>
                            </th>
                          ))}
                          <th
                            onClick={() => handleTogglePreviewSort('netDue')}
                            className="py-2 px-2.5 text-right font-bold whitespace-nowrap bg-slate-50 min-w-[100px] cursor-pointer hover:bg-slate-100 select-none group"
                            title="Click to sort by Net Due"
                          >
                            <div className="inline-flex items-center gap-1 justify-end w-full">
                              <span>Net Due</span>
                              {renderPreviewSortIcon('netDue')}
                            </div>
                          </th>
                          <th
                            onClick={() => handleTogglePreviewSort('status')}
                            className="py-2 px-2.5 text-center whitespace-nowrap bg-slate-50 min-w-[140px] cursor-pointer hover:bg-slate-100 select-none group"
                            title="Click to sort by Status"
                          >
                            <div className="inline-flex items-center gap-1 justify-center w-full">
                              <span>Status</span>
                              {renderPreviewSortIcon('status')}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedPreviews.map((p) => {
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
                              {previewFeeColumns.map((col) => {
                                const part = p.particulars.find((item) => item.kind === col.kind);
                                const amt = part ? part.amount : 0;
                                return (
                                  <td
                                    key={col.kind}
                                    className={`py-1.5 px-2.5 text-right font-mono whitespace-nowrap ${
                                      amt < 0
                                        ? 'text-emerald-700 font-semibold'
                                        : col.kind === 'PreviousBalance' && amt > 0
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

                  {/* Mobile Table Swipe Hint */}
                  <div className="sm:hidden flex items-center justify-between text-[10px] text-slate-400 px-1 pt-0.5 shrink-0">
                    <span className="flex items-center gap-1">
                      <ArrowUpDown className="w-2.5 h-2.5 rotate-90 text-slate-400" />
                      <span>Swipe table sideways to view fee heads</span>
                    </span>
                    <span className="font-semibold text-slate-500">{previewsData.previews.length} students</span>
                  </div>
                </div>
              );
            })()}

            {/* Action Footer */}
            <div className="flex items-center justify-between pt-2 sm:pt-2.5 border-t border-slate-200 shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setShowGeneratorModal(false)}
                className="px-3 sm:px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={previewsData.monthClosureBlocked || selectedGenStudentIds.length === 0}
                onClick={handleCommitGeneration}
                className="px-3.5 sm:px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer text-xs disabled:opacity-40 flex items-center gap-1.5 shrink-0"
              >
                <Check className="w-4 h-4" />
                <span>
                  <span className="sm:hidden">Generate ({selectedGenStudentIds.length})</span>
                  <span className="hidden sm:inline">Commit & Generate ({selectedGenStudentIds.length}) Vouchers</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Payment Modal */}
      {collectingVoucher && (
        <CollectPaymentModal
          voucher={collectingVoucher}
          students={students}
          items={collectItems}
          setItems={setCollectItems}
          amount={collectAmount}
          setAmount={setCollectAmount}
          mode={collectMode}
          setMode={setCollectMode}
          refNo={collectRef}
          setRefNo={setCollectRef}
          notes={collectNotes}
          setNotes={setCollectNotes}
          date={collectDate}
          setDate={setCollectDate}
          themeColor={themeConfig?.color || 'teal'}
          dynamicNetDue={collectDynamicNetDue}
          dynamicRemaining={collectDynamicRemaining}
          roundingEnabled={roundingEnabled}
          roundingMultiple={roundingMultiple}
          onSaveLineItems={handleSaveLineItemsOnly}
          onSubmit={handleSavePayment}
          onClose={() => setCollectingVoucher(null)}
        />
      )}


      {/* Detail Modal */}
      {detailVoucher && (
        <VoucherDetailModal
          voucher={detailVoucher}
          particulars={sortedDetailParticulars}
          roundingEnabled={roundingEnabled}
          roundingMultiple={roundingMultiple}
          canUndoCarry={hasPermission('fees.generate')}
          canDelete={hasPermission('fees.delete')}
          onUndoCarry={handleOpenUndoCarryModal}
          onDelete={handleOpenDeleteSingle}
          onClose={() => setDetailVoucher(null)}
        />
      )}


      {/* Print Modal Launcher */}
      {printingVoucher && (
        <PrintVoucherModal
          voucher={printingVoucher}
          onClose={() => setPrintingVoucher(null)}
        />
      )}

      {/* Delete Confirmation Modal with Chronological Block Guard (Configured via Settings Policy) */}
      {deleteModal && (
        <DeleteVoucherModal
          deleteModal={deleteModal}
          students={students}
          voucherDeletionResolution={voucherDeletionResolution}
          onClose={() => setDeleteModal(null)}
          onConfirm={handleConfirmDelete}
        />
      )}


      {/* Policy Consequence Summary Alert Modal */}
      {policyConfirmModal && (
        <PolicyConsequenceModal
          policyConfirmModal={policyConfirmModal}
          targetMonth={targetMonth}
          onClose={() => setPolicyConfirmModal(null)}
          onConfirm={executeCommitGeneration}
        />
      )}


      {/* Carry Forward Confirmation Modal */}
      {carryModal && (
        <CarryForwardModal
          carryModal={carryModal}
          students={students}
          classes={classes}
          addLateFine={addLateFine}
          setAddLateFine={setAddLateFine}
          carryFineAmount={carryFineAmount}
          setCarryFineAmount={setCarryFineAmount}
          onClose={() => setCarryModal(null)}
          onConfirm={executeCarryForwardFromVouchers}
        />
      )}


      {/* Undo Carry Forward Modal with Strict Downstream Guard */}
      {undoCarryModal && undoCarryModal.targetVoucher && (
        <UndoCarryModal
          undoCarryModal={undoCarryModal}
          students={students}
          onClose={() => setUndoCarryModal(null)}
          onConfirm={executeUndoCarryForward}
        />
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
