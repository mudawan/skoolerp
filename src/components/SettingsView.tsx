import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  ActiveTab,
  BankAccount,
  FeeTemplate,
  ParticularKind,
  PriorMonthVoucherRule,
  SkippedMonthVoucherRule,
  Student,
  User,
  UserRole,
  VoucherCopyType,
  VoucherDeletionResolution,
} from '../types';
import {
  formatCurrency,
  formatMonthName,
  getMonthPickerWindow,
  mergeWithDataMonths,
} from '../utils/feeMath';
import { parseCsvLine, CSV_DELIMITERS_TEMPLATE } from '../utils/csv';
import { ConfirmModal } from './ConfirmModal';
import { DataCleanupView } from './DataCleanupView';
import { UserModal, UserModalSaveData } from './UserModal';
import { AppearancePanel } from './settings/AppearancePanel';
import { ProfilePanel } from './settings/ProfilePanel';
import { PoliciesPanel } from './settings/PoliciesPanel';
import { BankAccountsPanel } from './settings/BankAccountsPanel';
import { UsersPanel } from './settings/UsersPanel';
import { MonthEndWizardPanel } from './settings/MonthEndWizardPanel';
import { DatabaseBackupsPanel } from './settings/DatabaseBackupsPanel';
import { MonthPicker } from './MonthPicker';
import {
  ALL_PERMISSIONS,
  ROLE_PRESET_PERMISSIONS,
  SPECIALTY_PRESETS,
  getEffectiveRole,
} from '../utils/permissions';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Building2,
  Calendar,
  CalendarCheck,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  Calculator,
  Database,
  Download,
  FileSpreadsheet,
  GraduationCap,
  GripVertical,
  KeyRound,
  ListFilter,
  MapPin,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Server,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';

export interface SettingsViewProps {
  initialSubTab?: 'profile' | 'appearance' | 'policies' | 'banks' | 'templates' | 'users' | 'cleanup' | 'monthEnd' | 'database';
  targetMonth?: string;
  viewMode?: 'settings' | 'policies';
  onNavigateToTab?: (tab: ActiveTab) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialSubTab,
  targetMonth,
  viewMode = 'settings',
  onNavigateToTab,
}) => {
  const {
    institute,
    updateInstitute,
    bankAccounts,
    addBankAccount,
    updateBankAccount,
    deleteBankAccount,
    templates,
    updateGlobalTemplatesList,
    deleteGlobalTemplates,
    saveClassTemplateOverrides,
    deleteClassTemplates,
    saveStudentTemplateOverrides,
    bulkSaveMultipleStudentTemplateOverrides,
    deleteStudentTemplates,
    resetAllTemplates,
    hasPermission,
    priorMonthRule,
    setPriorMonthRule,
    skippedMonthRule,
    setSkippedMonthRule,
    voucherDeletionResolution,
    setVoucherDeletionResolution,
    defaultLateFeeRate,
    setDefaultLateFeeRate,
    roundingMultiple,
    setRoundingMultiple,
    roundingEnabled,
    setRoundingEnabled,
    defaultDueDateEnabled,
    defaultDueDay,
    setDefaultDueDateSettings,
    voucherCopyOrder,
    setVoucherCopyOrder,
    voucherDefaultCopies,
    setVoucherDefaultCopies,
    users,
    addUser,
    updateUser,
    updateUserPermissions,
    deleteUser,
    currentUser,
    students,
    classes,
    vouchers,
    getMonthClosureStatus,
    themeConfig,
    activeMonth,
    setActiveMonth,
    beforeMonthChange,
    showToast,
  } = useApp();

  const defaultSubTab = initialSubTab || (viewMode === 'policies' ? 'policies' : 'profile');
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'appearance' | 'policies' | 'banks' | 'templates' | 'users' | 'cleanup' | 'monthEnd' | 'database'>(defaultSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    } else if (viewMode === 'policies') {
      setActiveSubTab('policies');
    }
  }, [initialSubTab, viewMode]);
  const [policyCategoryTab, setPolicyCategoryTab] = useState<'copies' | 'prior' | 'skipped' | 'deletion'>('copies');
  const [selectedPriorRule, setSelectedPriorRule] = useState<PriorMonthVoucherRule>(priorMonthRule);
  const [selectedSkippedRule, setSelectedSkippedRule] = useState<SkippedMonthVoucherRule>(skippedMonthRule);
  const [selectedDeletionResolution, setSelectedDeletionResolution] = useState<VoucherDeletionResolution>(voucherDeletionResolution);
  const [selectedLateFeeRate, setSelectedLateFeeRate] = useState<number>(defaultLateFeeRate);
  const [selectedRoundingMultiple, setSelectedRoundingMultiple] = useState<number>(roundingMultiple);
  const [selectedRoundingEnabled, setSelectedRoundingEnabled] = useState<boolean>(roundingEnabled);
  const [selectedDefaultDueDateEnabled, setSelectedDefaultDueDateEnabled] = useState<boolean>(defaultDueDateEnabled);
  const [selectedDefaultDueDay, setSelectedDefaultDueDay] = useState<number>(defaultDueDay);
  const [selectedVoucherCopyOrder, setSelectedVoucherCopyOrder] = useState<VoucherCopyType[]>(voucherCopyOrder);
  const [selectedVoucherDefaultCopies, setSelectedVoucherDefaultCopies] = useState<VoucherCopyType[]>(voucherDefaultCopies);
  const [showPolicyConfirmModal, setShowPolicyConfirmModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Month data availability and closure status for MonthPicker components
  const pickerWindowMonths = useMemo(
    () => mergeWithDataMonths(getMonthPickerWindow(), vouchers.map((v) => v.month)),
    [vouchers]
  );
  const monthsWithData = useMemo(
    () => Array.from(new Set(vouchers.map((v) => v.month))),
    [vouchers]
  );
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
  const [bankToDelete, setBankToDelete] = useState<BankAccount | null>(null);

  // Sync policy drafts when context values change
  useEffect(() => {
    setSelectedPriorRule(priorMonthRule);
  }, [priorMonthRule]);

  useEffect(() => {
    setSelectedSkippedRule(skippedMonthRule);
  }, [skippedMonthRule]);

  useEffect(() => {
    setSelectedDeletionResolution(voucherDeletionResolution);
  }, [voucherDeletionResolution]);

  useEffect(() => {
    setSelectedLateFeeRate(defaultLateFeeRate);
  }, [defaultLateFeeRate]);

  useEffect(() => {
    setSelectedRoundingMultiple(roundingMultiple);
  }, [roundingMultiple]);

  useEffect(() => {
    setSelectedRoundingEnabled(roundingEnabled);
  }, [roundingEnabled]);

  useEffect(() => {
    setSelectedDefaultDueDateEnabled(defaultDueDateEnabled);
  }, [defaultDueDateEnabled]);

  useEffect(() => {
    setSelectedDefaultDueDay(defaultDueDay);
  }, [defaultDueDay]);

  useEffect(() => {
    setSelectedVoucherCopyOrder(voucherCopyOrder);
  }, [voucherCopyOrder]);

  useEffect(() => {
    setSelectedVoucherDefaultCopies(voucherDefaultCopies);
  }, [voucherDefaultCopies]);

  // Check if default due date policy has unsaved modifications
  const isDefaultDueDateModified =
    selectedDefaultDueDateEnabled !== defaultDueDateEnabled ||
    (selectedDefaultDueDateEnabled && selectedDefaultDueDay !== defaultDueDay);

  // Check for unsaved policy modifications
  const hasPolicyChanges =
    selectedPriorRule !== priorMonthRule ||
    selectedSkippedRule !== skippedMonthRule ||
    selectedDeletionResolution !== voucherDeletionResolution ||
    selectedLateFeeRate !== defaultLateFeeRate ||
    selectedRoundingMultiple !== roundingMultiple ||
    selectedRoundingEnabled !== roundingEnabled ||
    isDefaultDueDateModified ||
    JSON.stringify(selectedVoucherCopyOrder) !== JSON.stringify(voucherCopyOrder) ||
    JSON.stringify(selectedVoucherDefaultCopies) !== JSON.stringify(voucherDefaultCopies);

  const handleSavePolicyClick = () => {
    if (!hasPolicyChanges) {
      showToast('No changes detected in fee voucher policies.', 'info');
      return;
    }
    setShowPolicyConfirmModal(true);
  };

  const handleConfirmPolicyChanges = () => {
    setPriorMonthRule(selectedPriorRule);
    setSkippedMonthRule(selectedSkippedRule);
    setVoucherDeletionResolution(selectedDeletionResolution);
    setDefaultLateFeeRate(selectedLateFeeRate);
    setRoundingMultiple(selectedRoundingMultiple);
    setRoundingEnabled(selectedRoundingEnabled);
    setDefaultDueDateSettings({
      enabled: selectedDefaultDueDateEnabled,
      day: selectedDefaultDueDay,
    });
    setVoucherCopyOrder(selectedVoucherCopyOrder);
    setVoucherDefaultCopies(selectedVoucherDefaultCopies);
    setShowPolicyConfirmModal(false);
    setToastMessage('Fee Voucher Policies & Print Layout updated and activated successfully!');
    showToast('Fee Voucher Policies updated successfully!', 'success');
  };

  const handleResetPolicyDrafts = () => {
    setSelectedPriorRule(priorMonthRule);
    setSelectedSkippedRule(skippedMonthRule);
    setSelectedDeletionResolution(voucherDeletionResolution);
    setSelectedLateFeeRate(defaultLateFeeRate);
    setSelectedRoundingMultiple(roundingMultiple);
    setSelectedRoundingEnabled(roundingEnabled);
    setSelectedDefaultDueDateEnabled(defaultDueDateEnabled);
    setSelectedDefaultDueDay(defaultDueDay);
    setSelectedVoucherCopyOrder(voucherCopyOrder);
    setSelectedVoucherDefaultCopies(voucherDefaultCopies);
    showToast('Policy selections reset to current saved configuration.', 'info');
  };

  // Auto-close toast popup notifications after 3.5 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Institute Profile Form State
  const [profileData, setProfileData] = useState({ ...institute });
  const [logoInputType, setLogoInputType] = useState<'upload' | 'url'>('upload');
  const [customLogoUrl, setCustomLogoUrl] = useState('');
  const [logoDragActive, setLogoDragActive] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Sync profileData when institute changes in context
  useEffect(() => {
    setProfileData({ ...institute });
  }, [institute]);

  const handleLogoFile = (file: File) => {
    setLogoError(null);
    if (!file.type.startsWith('image/')) {
      setLogoError('Please select a valid image file (PNG, JPG, SVG, or WEBP).');
      return;
    }
    // Max 500KB
    if (file.size > 500 * 1024) {
      setLogoError('Logo image size exceeds 500KB. Please upload a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setProfileData((prev) => ({ ...prev, logoUrl: result }));
        showToast('Logo loaded! Click "Save Profile & Branding" to save.', 'info');
      }
    };
    reader.onerror = () => {
      setLogoError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setLogoDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleLogoFile(e.dataTransfer.files[0]);
    }
  };

  const handleApplyLogoUrl = () => {
    setLogoError(null);
    const trimmed = customLogoUrl.trim();
    if (!trimmed) {
      setLogoError('Please enter a valid image URL.');
      return;
    }
    setProfileData((prev) => ({ ...prev, logoUrl: trimmed }));
    setCustomLogoUrl('');
    showToast('Logo URL applied! Click "Save Profile & Branding" to save.', 'info');
  };

  const handleRemoveLogo = () => {
    setLogoError(null);
    setProfileData((prev) => ({ ...prev, logoUrl: '' }));
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = '';
    }
    showToast('School logo removed.', 'info');
  };

  // Bank Form State
  const [showBankModal, setShowBankModal] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [bankFormData, setBankFormData] = useState({
    bankName: '',
    title: '',
    accountNumber: '',
    branchCode: '',
    instructionsLtr: '',
    instructionsRtl: '',
    instructionsLine1: '',
    instructionsLine2: '',
    active: true,
    isDefault: false,
  });

  // Fee Particulars Roster State
  const STANDARD_ROSTER: {
    kind: ParticularKind;
    defaultLabel: string;
    description: string;
    isFlex: boolean;
    isDynamic: boolean;
    sortOrder: number;
  }[] = [
    {
      kind: 'Tuition',
      defaultLabel: 'Tuition Fee',
      description: 'Calculated dynamically from the enrolled student\'s Class monthly fee.',
      isFlex: false,
      isDynamic: true,
      sortOrder: 1,
    },
    {
      kind: 'Flex1',
      defaultLabel: 'Admission Fee',
      description: 'User-customizable line item. Enter label and default amount.',
      isFlex: true,
      isDynamic: false,
      sortOrder: 2,
    },
    {
      kind: 'Flex2',
      defaultLabel: 'Registration Fee',
      description: 'User-customizable line item. Enter label and default amount.',
      isFlex: true,
      isDynamic: false,
      sortOrder: 3,
    },
    {
      kind: 'Transport',
      defaultLabel: 'Transport Fee',
      description: 'Calculated dynamically based on the student\'s active Bus Stop / Route assignment.',
      isFlex: false,
      isDynamic: true,
      sortOrder: 4,
    },
    {
      kind: 'Fine',
      defaultLabel: 'Fine',
      description: 'Late fee or manual penalty line item.',
      isFlex: false,
      isDynamic: false,
      sortOrder: 5,
    },
    {
      kind: 'Flex3',
      defaultLabel: 'Exam Fee',
      description: 'User-customizable line item. Enter label and default amount.',
      isFlex: true,
      isDynamic: false,
      sortOrder: 6,
    },
    {
      kind: 'Flex4',
      defaultLabel: 'Other',
      description: 'User-customizable line item. Enter label and default amount.',
      isFlex: true,
      isDynamic: false,
      sortOrder: 7,
    },
    {
      kind: 'PreviousBalance',
      defaultLabel: 'Previous Balance',
      description: 'Calculated dynamically from unpaid prior month arrears or advance credit.',
      isFlex: false,
      isDynamic: true,
      sortOrder: 8,
    },
    {
      kind: 'Discount',
      defaultLabel: 'Discount in Fee',
      description: 'Calculated dynamically from student\'s monthly fee concession / scholarship.',
      isFlex: false,
      isDynamic: true,
      sortOrder: 9,
    },
  ];

  // Fee Template Month Mode: 'all' (Recurring across all months) vs 'specific' (single month override)
  const [templateMonthMode, setTemplateMonthMode] = useState<'all' | 'specific'>('all');
  const [templateSpecificMonth, setTemplateSpecificMonth] = useState<string>(targetMonth || activeMonth);
  const effectiveTemplateMonth = templateMonthMode === 'all' ? 'all' : templateSpecificMonth;

  // Helper to initialize local roster values from global templates state
  const initializeRosterState = (targetMonth: string = effectiveTemplateMonth) => {
    const isAll = targetMonth === 'all';
    const monthGlobalTpls = !isAll
      ? templates.filter((t) => !t.studentId && !t.classId && t.month === targetMonth)
      : [];
    const hasMonthOverride = monthGlobalTpls.length > 0;
    const allMonthsGlobalTpls = templates.filter(
      (t) => !t.studentId && !t.classId && (!t.month || t.month === 'all')
    );
    const sourceTpls = hasMonthOverride ? monthGlobalTpls : allMonthsGlobalTpls;

    const items = STANDARD_ROSTER.map((item) => {
      const match = sourceTpls.find((t) => t.kind === item.kind);
      let label = match?.label || item.defaultLabel;
      // Sanitize corrupted labels like FFFFFF2 or empty strings or legacy Transport names
      if (!label || label.toUpperCase().includes('FFFFFF') || label.trim() === '') {
        label = item.defaultLabel;
      }
      if (item.kind === 'Transport' && (label === 'Transport' || label === 'School Bus Transport Fee' || /school bus/i.test(label) || /transport charge/i.test(label))) {
        label = 'Transport Fee';
      }
      return {
        kind: item.kind,
        label,
        defaultAmount: match ? match.defaultAmount : 0,
        sortOrder: match ? match.sortOrder : item.sortOrder,
      };
    });
    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const [rosterState, setRosterState] = useState(() => initializeRosterState('all'));
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sync roster state only when the GLOBAL template slice changes; class and
  // student override saves must never clobber unsaved global edits.
  const globalTemplatesKey = useMemo(
    () =>
      JSON.stringify(
        templates.filter(
          (t) =>
            !t.studentId &&
            !t.classId &&
            (effectiveTemplateMonth === 'all'
              ? !t.month || t.month === 'all'
              : t.month === effectiveTemplateMonth || !t.month || t.month === 'all')
        )
      ),
    [templates, effectiveTemplateMonth]
  );
  const [globalBaselineKey, setGlobalBaselineKey] = useState('[]');
  React.useEffect(() => {
    const fresh = initializeRosterState(effectiveTemplateMonth);
    setRosterState(fresh);
    setGlobalBaselineKey(draftKeyOf(fresh));
  }, [globalTemplatesKey, effectiveTemplateMonth]);

  const hasGlobalMonthOverride = useMemo(() => {
    if (effectiveTemplateMonth === 'all') return false;
    return templates.some((t) => !t.studentId && !t.classId && t.month === effectiveTemplateMonth);
  }, [templates, effectiveTemplateMonth]);

  const handleRosterLabelChange = (kind: ParticularKind, label: string) => {
    setRosterState((prev) =>
      prev.map((item) => (item.kind === kind ? { ...item, label } : item))
    );
  };

  const handleRosterAmountChange = (kind: ParticularKind, amount: number) => {
    setRosterState((prev) =>
      prev.map((item) => (item.kind === kind ? { ...item, defaultAmount: amount } : item))
    );
  };

  const handleDropReorder = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    setRosterState((prev) => {
      const copy = [...prev];
      const [draggedItem] = copy.splice(draggedIndex, 1);
      copy.splice(targetIndex, 0, draggedItem);
      return copy.map((item, idx) => ({ ...item, sortOrder: idx + 1 }));
    });
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Only Flex1-4 may hold a negative (adjustment) amount; all other heads
  // (Tuition, Transport, Fine, Previous Balance, Discount) are positive-only.
  const allowNegativeAmount = (kind: ParticularKind): boolean =>
    kind === 'Flex1' || kind === 'Flex2' || kind === 'Flex3' || kind === 'Flex4';

  const saveGlobalRoster = () => {
    const updatedGlobalTemplates: FeeTemplate[] = rosterState.map((r, idx) => ({
      id: `tpl-${r.kind.toLowerCase()}-${effectiveTemplateMonth}-${idx + 1}`,
      kind: r.kind,
      label: r.label.trim() || STANDARD_ROSTER.find((sr) => sr.kind === r.kind)?.defaultLabel || r.kind,
      defaultAmount: allowNegativeAmount(r.kind) ? Number(r.defaultAmount) || 0 : Math.max(0, Number(r.defaultAmount) || 0),
      sortOrder: idx + 1,
      month: effectiveTemplateMonth,
    }));

    updateGlobalTemplatesList(updatedGlobalTemplates, effectiveTemplateMonth);
    if (effectiveTemplateMonth === 'all') {
      setToastMessage('Global fee particulars roster order & rates saved for All Months! All vouchers and PDF exports will follow this baseline.');
    } else {
      setToastMessage(`Global fee particulars override saved for ${formatMonthName(effectiveTemplateMonth)}! Vouchers generated for this month will use this global override.`);
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleClearGlobalMonthOverride = () => {
    if (effectiveTemplateMonth === 'all') return;
    deleteGlobalTemplates(effectiveTemplateMonth);
    setToastMessage(
      `Global month override cleared for ${formatMonthName(effectiveTemplateMonth)}. Reverted to All-Months Global defaults.`
    );
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSaveAllParticulars = (e: React.FormEvent) => {
    e.preventDefault();
    saveGlobalRoster();
  };

  // 4-Way Hierarchy Fee Template Overrides State: Global | Class | Student | Overrides Directory
  const [templateScopeMode, setTemplateScopeMode] = useState<'global' | 'class' | 'student' | 'overrides'>('global');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState<boolean>(false);
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState<boolean>(false);
  const [isDueDayDropdownOpen, setIsDueDayDropdownOpen] = useState<boolean>(false);
  const [showResetAllModal, setShowResetAllModal] = useState<boolean>(false);
  const studentSearchDropdownRef = useRef<HTMLDivElement>(null);
  const classSearchDropdownRef = useRef<HTMLDivElement>(null);
  const dueDayDropdownRef = useRef<HTMLDivElement>(null);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId),
    [students, selectedStudentId]
  );
  const selectedStudentClass = useMemo(
    () => (selectedStudent ? classes.find((c) => c.id === selectedStudent.classId) : null),
    [selectedStudent, classes]
  );
  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId),
    [classes, selectedClassId]
  );

  // Student roster state for selected student
  const [studentRosterState, setStudentRosterState] = useState<
    Array<{
      kind: ParticularKind;
      label: string;
      defaultAmount: number;
      isOverridden: boolean;
    }>
  >([]);

  // Class roster state for selected class
  const [classRosterState, setClassRosterState] = useState<
    Array<{
      kind: ParticularKind;
      label: string;
      defaultAmount: number;
      isOverridden: boolean;
    }>
  >([]);

  // Click outside listener for student and class search dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        studentSearchDropdownRef.current &&
        !studentSearchDropdownRef.current.contains(event.target as Node)
      ) {
        setIsStudentDropdownOpen(false);
      }
      if (
        classSearchDropdownRef.current &&
        !classSearchDropdownRef.current.contains(event.target as Node)
      ) {
        setIsClassDropdownOpen(false);
      }
      if (
        dueDayDropdownRef.current &&
        !dueDayDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDueDayDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Draft-dirty bookkeeping: effects rebuild these editors only from their
  // OWN template slice (never the whole store), and capture a baseline key at
  // build time so unsaved edits can be detected before destructive switches.
  const draftKeyOf = (
    rows: Array<{ kind: ParticularKind; label: string; defaultAmount: number; isOverridden?: boolean }>
  ) => JSON.stringify(rows.map((r) => [r.kind, r.label.trim(), Math.max(0, Number(r.defaultAmount) || 0), !!r.isOverridden]));

  const classTemplatesKey = useMemo(
    () =>
      JSON.stringify(
        templates.filter(
          (t) =>
            !t.studentId &&
            t.classId === selectedClassId &&
            (effectiveTemplateMonth === 'all'
              ? !t.month || t.month === 'all'
              : t.month === effectiveTemplateMonth || !t.month || t.month === 'all')
        )
      ),
    [templates, selectedClassId, effectiveTemplateMonth]
  );
  const studentTemplatesKey = useMemo(
    () =>
      JSON.stringify([
        templates.filter(
          (t) =>
            t.studentId === selectedStudentId &&
            (effectiveTemplateMonth === 'all'
              ? !t.month || t.month === 'all'
              : t.month === effectiveTemplateMonth || !t.month || t.month === 'all')
        ),
        selectedStudent
          ? templates.filter(
              (t) =>
                !t.studentId &&
                t.classId === selectedStudent.classId &&
                (effectiveTemplateMonth === 'all'
                  ? !t.month || t.month === 'all'
                  : t.month === effectiveTemplateMonth || !t.month || t.month === 'all')
            )
          : [],
      ]),
    [templates, selectedStudentId, selectedStudent, effectiveTemplateMonth]
  );
  const [classBaselineKey, setClassBaselineKey] = useState('[]');
  const [studentBaselineKey, setStudentBaselineKey] = useState('[]');
  const [rebuildNonce, setRebuildNonce] = useState(0);

  // Sync class roster state when selected class, templates, rosterState, or effectiveTemplateMonth changes
  useEffect(() => {
    if (!selectedClass) {
      setClassRosterState([]);
      setClassBaselineKey('[]');
      return;
    }

    const isAll = effectiveTemplateMonth === 'all';
    const specificClassOverrides = !isAll
      ? templates.filter((t) => !t.studentId && t.classId === selectedClass.id && t.month === effectiveTemplateMonth)
      : [];
    const hasSpecificClassOverride = specificClassOverrides.length > 0;
    const allMonthsClassOverrides = templates.filter(
      (t) => !t.studentId && t.classId === selectedClass.id && (!t.month || t.month === 'all')
    );
    const classOverridesToUse = hasSpecificClassOverride ? specificClassOverrides : allMonthsClassOverrides;

    const items = rosterState.map((r) => {
      const override = classOverridesToUse.find((o) => o.kind === r.kind);
      const isOverridden = !!override;
      let defaultAmount = 0;

      if (override && override.defaultAmount !== undefined) {
        defaultAmount = override.defaultAmount;
      } else if (r.kind === 'Tuition') {
        defaultAmount = selectedClass.monthlyFee || 0;
      } else {
        defaultAmount = r.defaultAmount || 0;
      }

      return {
        kind: r.kind,
        label: override?.label || r.label,
        defaultAmount,
        isOverridden,
      };
    });

    setClassRosterState(items);
    setClassBaselineKey(draftKeyOf(items));
  }, [selectedClassId, selectedClass, classTemplatesKey, rosterState, effectiveTemplateMonth, rebuildNonce]);

  // Sync student roster state when selected student, templates, rosterState, or effectiveTemplateMonth changes
  useEffect(() => {
    if (!selectedStudent) {
      setStudentRosterState([]);
      setStudentBaselineKey('[]');
      return;
    }

    const isAll = effectiveTemplateMonth === 'all';
    const specificStudentOverrides = !isAll
      ? templates.filter((t) => t.studentId === selectedStudent.id && t.month === effectiveTemplateMonth)
      : [];
    const hasSpecificStudentOverride = specificStudentOverrides.length > 0;
    const allMonthsStudentOverrides = templates.filter(
      (t) => t.studentId === selectedStudent.id && (!t.month || t.month === 'all')
    );
    const studentOverridesToUse = hasSpecificStudentOverride ? specificStudentOverrides : allMonthsStudentOverrides;

    const specificClassOverrides = !isAll
      ? templates.filter(
          (t) => !t.studentId && t.classId === selectedStudent.classId && t.month === effectiveTemplateMonth
        )
      : [];
    const hasSpecificClassOverride = specificClassOverrides.length > 0;
    const allMonthsClassOverrides = templates.filter(
      (t) => !t.studentId && t.classId === selectedStudent.classId && (!t.month || t.month === 'all')
    );
    const classOverridesToUse = hasSpecificClassOverride ? specificClassOverrides : allMonthsClassOverrides;

    const sClass = classes.find((c) => c.id === selectedStudent.classId);

    const items = rosterState.map((r) => {
      const studentOverride = studentOverridesToUse.find((o) => o.kind === r.kind);
      const classOverride = classOverridesToUse.find((o) => o.kind === r.kind);
      const isOverridden = !!studentOverride;
      let defaultAmount = 0;

      if (studentOverride && studentOverride.defaultAmount !== undefined) {
        defaultAmount = studentOverride.defaultAmount;
      } else if (classOverride && classOverride.defaultAmount !== undefined) {
        defaultAmount = classOverride.defaultAmount;
      } else if (r.kind === 'Tuition') {
        defaultAmount = sClass?.monthlyFee || 0;
      } else if (r.kind === 'Discount') {
        defaultAmount = selectedStudent.monthlyDiscount || 0;
      } else {
        defaultAmount = r.defaultAmount || 0;
      }

      return {
        kind: r.kind,
        label: studentOverride?.label || classOverride?.label || r.label,
        defaultAmount,
        isOverridden,
      };
    });

    setStudentRosterState(items);
    setStudentBaselineKey(draftKeyOf(items));
  }, [selectedStudentId, studentTemplatesKey, rosterState, effectiveTemplateMonth, classes, selectedStudent, rebuildNonce]);

  const handleStudentRosterLabelChange = (kind: ParticularKind, label: string) => {
    setStudentRosterState((prev) =>
      prev.map((item) => (item.kind === kind ? { ...item, label, isOverridden: true } : item))
    );
  };

  const handleStudentRosterAmountChange = (kind: ParticularKind, amount: number) => {
    setStudentRosterState((prev) =>
      prev.map((item) =>
        item.kind === kind ? { ...item, defaultAmount: amount, isOverridden: true } : item
      )
    );
  };

  const handleClassRosterLabelChange = (kind: ParticularKind, label: string) => {
    setClassRosterState((prev) =>
      prev.map((item) => (item.kind === kind ? { ...item, label, isOverridden: true } : item))
    );
  };

  const handleClassRosterAmountChange = (kind: ParticularKind, amount: number) => {
    setClassRosterState((prev) =>
      prev.map((item) =>
        item.kind === kind ? { ...item, defaultAmount: amount, isOverridden: true } : item
      )
    );
  };

  const saveClassRoster = () => {
    if (!selectedClassId || !selectedClass) return;

    const itemsToSave = classRosterState.map((item, idx) => {
      const globalItem = rosterState.find((r) => r.kind === item.kind);
      return {
        kind: item.kind,
        label: item.label.trim() || globalItem?.label || item.kind,
        defaultAmount: allowNegativeAmount(item.kind)
          ? Number(item.defaultAmount) || 0
          : Math.max(0, Number(item.defaultAmount) || 0),
        sortOrder: globalItem?.sortOrder || idx + 1,
      };
    });

    saveClassTemplateOverrides(selectedClassId, effectiveTemplateMonth, itemsToSave);
    if (effectiveTemplateMonth === 'all') {
      setToastMessage(
        `Class-level fee template for ${selectedClass.name} saved for All Months! This permanently overrides global defaults for all students in ${selectedClass.name}.`
      );
    } else {
      setToastMessage(
        `Class-level fee template for ${selectedClass.name} saved for ${formatMonthName(effectiveTemplateMonth)}! Overrides global defaults for this billing month.`
      );
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSaveClassOverrides = (e: React.FormEvent) => {
    e.preventDefault();
    saveClassRoster();
  };

  const handleClearClassOverrides = (classIdToClear: string, monthToClear: string = effectiveTemplateMonth) => {
    const classObj = classes.find((c) => c.id === classIdToClear);
    deleteClassTemplates(classIdToClear, monthToClear);
    if (monthToClear === 'all') {
      setToastMessage(
        `All-months class template overrides cleared for ${classObj?.name || 'Class'}. Reverted to Global Default templates.`
      );
    } else {
      setToastMessage(
        `Class-level template overrides cleared for ${classObj?.name || 'Class'} for ${formatMonthName(monthToClear)}.`
      );
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  const saveStudentRoster = () => {
    if (!selectedStudentId || !selectedStudent) return;

    const itemsToSave = studentRosterState.map((item, idx) => {
      const globalItem = rosterState.find((r) => r.kind === item.kind);
      return {
        kind: item.kind,
        label: item.label.trim() || globalItem?.label || item.kind,
        defaultAmount: allowNegativeAmount(item.kind)
          ? Number(item.defaultAmount) || 0
          : Math.max(0, Number(item.defaultAmount) || 0),
        sortOrder: globalItem?.sortOrder || idx + 1,
      };
    });

    saveStudentTemplateOverrides(selectedStudentId, effectiveTemplateMonth, itemsToSave);
    if (effectiveTemplateMonth === 'all') {
      setToastMessage(
        `Student-specific fee template for ${selectedStudent.name} (${selectedStudent.regNo}) saved for All Months! Recurring across all billing months.`
      );
    } else {
      setToastMessage(
        `Student-specific fee template for ${selectedStudent.name} (${selectedStudent.regNo}) saved for ${formatMonthName(effectiveTemplateMonth)}! All vouchers & PDF printouts for this month will reflect these individual overrides.`
      );
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSaveStudentOverrides = (e: React.FormEvent) => {
    e.preventDefault();
    saveStudentRoster();
  };

  const handleClearStudentOverrides = (studentIdToClear: string, monthToClear: string = effectiveTemplateMonth) => {
    const studentObj = students.find((s) => s.id === studentIdToClear);
    deleteStudentTemplates(studentIdToClear, monthToClear);
    if (monthToClear === 'all') {
      setToastMessage(
        `All-months custom overrides cleared for ${studentObj?.name || 'student'}${studentObj ? ` (${studentObj.regNo})` : ''}. Reverted to class/global fee templates.`
      );
    } else {
      setToastMessage(
        `Custom individual overrides cleared for ${studentObj?.name || 'student'}${studentObj ? ` (${studentObj.regNo})` : ''} for ${formatMonthName(monthToClear)}.`
      );
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ---- Unsaved-edit guard: tier switches & month changes must never silently
  // ---- discard in-progress drafts. Dirty state is derived by comparing the
  // ---- live editor rows against the baseline captured when they were built.
  const globalDirty = draftKeyOf(rosterState) !== globalBaselineKey;
  const classDirty =
    !!selectedClass &&
    classRosterState.length > 0 &&
    draftKeyOf(classRosterState) !== classBaselineKey;
  const studentDirty =
    !!selectedStudent &&
    studentRosterState.length > 0 &&
    draftKeyOf(studentRosterState) !== studentBaselineKey;

  const scopeLabel =
    templateScopeMode === 'global'
      ? 'Global tier'
      : templateScopeMode === 'class'
        ? `Class Override tier (${selectedClass?.name || ''})`
        : templateScopeMode === 'student'
          ? `Student Override tier (${selectedStudent?.name || selectedStudent?.regNo || ''})`
          : 'Overrides Directory';

  const discardDirtyDrafts = () => {
    if (templateScopeMode === 'global') {
      const fresh = initializeRosterState(effectiveTemplateMonth);
      setRosterState(fresh);
      setGlobalBaselineKey(draftKeyOf(fresh));
    } else {
      if (templateScopeMode === 'class') setClassBaselineKey(draftKeyOf(classRosterState));
      if (templateScopeMode === 'student') setStudentBaselineKey(draftKeyOf(studentRosterState));
      setRebuildNonce((n) => n + 1);
    }
    setToastMessage('Unsaved changes discarded.');
    setTimeout(() => setToastMessage(null), 2500);
  };

  const saveActiveDrafts = () => {
    const transition = pendingTransition;
    let savedCount = 0;
    if (templateScopeMode === 'global' && globalDirty) {
      saveGlobalRoster();
      savedCount++;
    }
    if (templateScopeMode === 'class' && classDirty) {
      saveClassRoster();
      savedCount++;
    }
    if (templateScopeMode === 'student' && studentDirty) {
      saveStudentRoster();
      savedCount++;
    }
    if (!savedCount) {
      setToastMessage('Nothing to save.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    setPendingTransition(null);
    transition?.apply();
  };

  type PendingTransition =
    | { kind: 'scope'; label: string; apply: () => void }
    | { kind: 'month'; label: string; apply: () => void }
    | { kind: 'view'; label: string; apply: () => void }
    | { kind: 'class'; label: string; apply: () => void }
    | { kind: 'student'; label: string; apply: () => void };

  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);

  const requestTransition = (next: PendingTransition) => {
    const dirty =
      (templateScopeMode === 'global' && globalDirty) ||
      (templateScopeMode === 'class' && classDirty) ||
      (templateScopeMode === 'student' && studentDirty);
    if (!dirty) {
      next.apply();
      return;
    }
    setPendingTransition(next);
  };

  // Month changes initiated outside SettingsView (header/sidebar pickers) are
  // routed through the same guard via the shared beforeMonthChange ref. A ref
  // to requestTransition keeps the handler free of stale scope/dirty closures.
  const requestTransitionRef = useRef(requestTransition);
  requestTransitionRef.current = requestTransition;
  React.useEffect(() => {
    if (!beforeMonthChange) return;
    beforeMonthChange.current = (next: string): boolean => {
      requestTransitionRef.current({
        kind: 'month',
        label: formatMonthName(next),
        apply: () => {
          setActiveMonth(next);
          showToast(`Working month switched to ${formatMonthName(next)}.`, 'info');
        },
      });
      return true;
    };
    return () => {
      if (beforeMonthChange) beforeMonthChange.current = null;
    };
  }, [beforeMonthChange]);

  const handleConfirmResetAll = () => {
    const targetResetMonth = effectiveTemplateMonth === 'all' ? activeMonth : effectiveTemplateMonth;
    resetAllTemplates(targetResetMonth);
    setRosterState(initializeRosterState());
    setShowResetAllModal(false);
    setToastMessage(
      `Global fee templates reset to system defaults and all student-specific template overrides deleted for ${formatMonthName(targetResetMonth)}!`
    );
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Search filter for student dropdown
  const filteredStudents = useMemo(() => {
    if (!studentSearchQuery.trim()) {
      return students.slice(0, 25);
    }
    const q = studentSearchQuery.toLowerCase();
    return students
      .filter((s) => {
        const sClass = classes.find((c) => c.id === s.classId);
        return (
          s.name.toLowerCase().includes(q) ||
          s.regNo.toLowerCase().includes(q) ||
          (s.fatherName && s.fatherName.toLowerCase().includes(q)) ||
          (sClass && sClass.name.toLowerCase().includes(q))
        );
      })
      .slice(0, 30);
  }, [students, classes, studentSearchQuery]);

  // Overrides list scope filter: 'all' (all overrides) | 'target' (target month + all-months) | 'all_months' (recurring only) | 'billing' (active billing month + all-months)
  const [overridesFilter, setOverridesFilter] = useState<'all' | 'target' | 'active' | 'all_months' | 'billing'>('all');

  // List of all classes with active custom overrides (Flex 1-4 and Fine)
  const activeClassOverridesList = useMemo(() => {
    const classOverrides = templates.filter(
      (t) => !t.studentId && !!t.classId && ['Flex1', 'Flex2', 'Flex3', 'Flex4', 'Fine'].includes(t.kind)
    );

    const map = new Map<
      string,
      { classId: string; month: string; isAllMonths: boolean; overrides: FeeTemplate[] }
    >();

    for (const t of classOverrides) {
      const m = !t.month || t.month === 'all' ? 'all' : t.month;
      if (overridesFilter === 'all_months' && m !== 'all') continue;
      if ((overridesFilter === 'target' || overridesFilter === 'active') && m !== templateSpecificMonth && m !== 'all') continue;
      if (overridesFilter === 'billing' && m !== activeMonth && m !== 'all') continue;

      const key = `${t.classId}:::${m}`;
      if (!map.has(key)) {
        map.set(key, {
          classId: t.classId!,
          month: m,
          isAllMonths: m === 'all',
          overrides: [],
        });
      }
      map.get(key)!.overrides.push(t);
    }

    return Array.from(map.values())
      .map((item) => {
        const cls = classes.find((c) => c.id === item.classId);
        return {
          ...item,
          classObj: cls,
          className: cls?.name || 'Unknown Class',
          uniqueKey: `${item.classId}:::${item.month}`,
        };
      })
      .filter((item) => !!item.classObj && item.overrides.length > 0);
  }, [templates, classes, overridesFilter, templateSpecificMonth, activeMonth]);

  // List of all students with active custom overrides (Flex 1-4 and Fine)
  const activeStudentOverridesList = useMemo(() => {
    const studentOverrides = templates.filter(
      (t) => !!t.studentId && ['Flex1', 'Flex2', 'Flex3', 'Flex4', 'Fine'].includes(t.kind)
    );

    const map = new Map<
      string,
      { studentId: string; month: string; isAllMonths: boolean; overrides: FeeTemplate[] }
    >();

    for (const t of studentOverrides) {
      const m = !t.month || t.month === 'all' ? 'all' : t.month;
      if (overridesFilter === 'all_months' && m !== 'all') continue;
      if ((overridesFilter === 'target' || overridesFilter === 'active') && m !== templateSpecificMonth && m !== 'all') continue;
      if (overridesFilter === 'billing' && m !== activeMonth && m !== 'all') continue;

      const key = `${t.studentId}:::${m}`;
      if (!map.has(key)) {
        map.set(key, {
          studentId: t.studentId!,
          month: m,
          isAllMonths: m === 'all',
          overrides: [],
        });
      }
      map.get(key)!.overrides.push(t);
    }

    return Array.from(map.values())
      .map((item) => {
        const std = students.find((s) => s.id === item.studentId);
        const sClass = std ? classes.find((c) => c.id === std.classId) : null;
        return {
          ...item,
          student: std,
          className: sClass?.name || 'Unassigned',
          uniqueKey: `${item.studentId}:::${item.month}`,
        };
      })
      .filter((item) => !!item.student && item.overrides.length > 0);
  }, [templates, students, classes, overridesFilter, templateSpecificMonth, activeMonth]);

  // Total active overrides count across class and student tiers
  const totalOverridesCount = activeClassOverridesList.length + activeStudentOverridesList.length;

  // Bulk selection state for active student overrides list (keyed by uniqueKey: studentId:::month)
  const [selectedOverrideKeys, setSelectedOverrideKeys] = useState<string[]>([]);

  // Clear bulk selection when activeMonth, templateSpecificMonth or filter changes
  useEffect(() => {
    setSelectedOverrideKeys([]);
  }, [activeMonth, templateSpecificMonth, overridesFilter]);

  const handleToggleSelectAllOverrides = () => {
    if (
      selectedOverrideKeys.length === activeStudentOverridesList.length &&
      activeStudentOverridesList.length > 0
    ) {
      setSelectedOverrideKeys([]);
    } else {
      setSelectedOverrideKeys(activeStudentOverridesList.map((item) => item.uniqueKey));
    }
  };

  const handleToggleSelectOverride = (uniqueKey: string) => {
    setSelectedOverrideKeys((prev) =>
      prev.includes(uniqueKey) ? prev.filter((k) => k !== uniqueKey) : [...prev, uniqueKey]
    );
  };

  const handleBulkDeleteOverrides = () => {
    if (selectedOverrideKeys.length === 0) return;
    selectedOverrideKeys.forEach((key) => {
      const [sId, m] = key.split(':::');
      if (sId) {
        deleteStudentTemplates(sId, m || 'all');
      }
    });
    setToastMessage(
      `Custom fee template overrides deleted for ${selectedOverrideKeys.length} student override${
        selectedOverrideKeys.length === 1 ? '' : 's'
      }.`
    );
    setSelectedOverrideKeys([]);
  };

  // CSV Bulk Upload for Fee Templates Overrides
  interface ParsedCsvTemplateRow {
    rowNum: number;
    rawId: string;
    student?: Student;
    className?: string;
    fineAmount: number;
    flex1Label: string;
    flex1Amount: number;
    flex2Label: string;
    flex2Amount: number;
    flex3Label: string;
    flex3Amount: number;
    flex4Label: string;
    flex4Amount: number;
    isValid: boolean;
    validationError?: string;
    totalOverrideAmount: number;
  }

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFileName, setCsvFileName] = useState('');
  const [isCsvDragging, setIsCsvDragging] = useState(false);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const [parsedCsvRows, setParsedCsvRows] = useState<ParsedCsvTemplateRow[]>([]);
  const [isParsedPreviewExpanded, setIsParsedPreviewExpanded] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const processCsvContent = (text: string) => {
    setCsvParseError(null);
    if (!text || !text.trim()) {
      setParsedCsvRows([]);
      return;
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setParsedCsvRows([]);
      return;
    }

    const firstLineCells = parseCsvLine(lines[0], CSV_DELIMITERS_TEMPLATE);
    const firstLineClean = firstLineCells.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Check if first line is a header
    const isHeader = firstLineClean.some(
      (c) =>
        c === 'reg' ||
        c === 'regno' ||
        c === 'regnumber' ||
        c === 'registration' ||
        c === 'registrationno' ||
        c === 'registrationnumber' ||
        c === 'id' ||
        c === 'fine' ||
        c.includes('flex') ||
        c.includes('label') ||
        c.includes('value') ||
        c.includes('amount')
    );

    const headerMap: Record<string, number> = {};

    if (isHeader) {
      firstLineClean.forEach((c, idx) => {
        if (
          c === 'reg' ||
          c === 'regno' ||
          c === 'regnumber' ||
          c === 'registration' ||
          c === 'registrationno' ||
          c === 'registrationnumber' ||
          c === 'id' ||
          c === 'studentid' ||
          c === 'studentno' ||
          c === 'rollno'
        ) {
          if (headerMap.id === undefined) headerMap.id = idx;
        } else if (
          c === 'fine' ||
          c === 'fineamount' ||
          c === 'finevalue' ||
          c === 'penalty' ||
          c === 'latefine'
        ) {
          headerMap.fine = idx;
        } else if (
          c === 'flex1label' ||
          c === 'flex1name' ||
          c === 'flex1title' ||
          c === 'admissionlabel'
        ) {
          headerMap.flex1Label = idx;
        } else if (
          c === 'flex1value' ||
          c === 'flex1amount' ||
          c === 'flex1' ||
          c === 'admissionfee' ||
          c === 'admission'
        ) {
          headerMap.flex1Value = idx;
        } else if (
          c === 'flex2label' ||
          c === 'flex2name' ||
          c === 'flex2title' ||
          c === 'registrationlabel'
        ) {
          headerMap.flex2Label = idx;
        } else if (
          c === 'flex2value' ||
          c === 'flex2amount' ||
          c === 'flex2' ||
          c === 'registrationfee' ||
          c === 'registration'
        ) {
          headerMap.flex2Value = idx;
        } else if (
          c === 'flex3label' ||
          c === 'flex3name' ||
          c === 'flex3title' ||
          c === 'examlabel'
        ) {
          headerMap.flex3Label = idx;
        } else if (
          c === 'flex3value' ||
          c === 'flex3amount' ||
          c === 'flex3' ||
          c === 'examfee' ||
          c === 'exam'
        ) {
          headerMap.flex3Value = idx;
        } else if (
          c === 'flex4label' ||
          c === 'flex4name' ||
          c === 'flex4title' ||
          c === 'otherlabel'
        ) {
          headerMap.flex4Label = idx;
        } else if (
          c === 'flex4value' ||
          c === 'flex4amount' ||
          c === 'flex4' ||
          c === 'otherfee' ||
          c === 'other'
        ) {
          headerMap.flex4Value = idx;
        }
      });
    }

    // Fallbacks for standard positional format: id, fine, flex1 label, flex1 value, flex2 label, flex2 value, flex3 label, flex3 value, flex4 label, flex4 value
    const idIdx = headerMap.id ?? 0;
    const fineIdx = headerMap.fine ?? 1;
    const flex1LabelIdx = headerMap.flex1Label ?? 2;
    const flex1ValueIdx = headerMap.flex1Value ?? 3;
    const flex2LabelIdx = headerMap.flex2Label ?? 4;
    const flex2ValueIdx = headerMap.flex2Value ?? 5;
    const flex3LabelIdx = headerMap.flex3Label ?? 6;
    const flex3ValueIdx = headerMap.flex3Value ?? 7;
    const flex4LabelIdx = headerMap.flex4Label ?? 8;
    const flex4ValueIdx = headerMap.flex4Value ?? 9;

    const dataLines = isHeader ? lines.slice(1) : lines;

    const globalFlex1 =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex1')?.label || 'Admission Fee';
    const globalFlex2 =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex2')?.label || 'Registration Fee';
    const globalFlex3 =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex3')?.label || 'Exam Fee';
    const globalFlex4 =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex4')?.label || 'Other';

    const parseNum = (val: string | undefined): number => {
      if (!val) return 0;
      const clean = val.replace(/[^0-9.-]/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    };

    const results: ParsedCsvTemplateRow[] = [];

    dataLines.forEach((line, idx) => {
      const cells = parseCsvLine(line, CSV_DELIMITERS_TEMPLATE);
      if (cells.length === 0 || (cells.length === 1 && !cells[0].trim())) return;

      const rawId = (cells[idIdx] || '').trim();
      if (!rawId) return;

      const cleanId = rawId.toLowerCase();
      const alphaNumClean = cleanId.replace(/[^a-z0-9]/g, '');

      // Student Lookup matching ONLY by Reg # (global rule: only one student identifier Reg #)
      const matchedStudent =
        students.find((s) => s.regNo.trim().toLowerCase() === cleanId) ||
        students.find(
          (s) => s.regNo.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === alphaNumClean
        );

      const sClass = matchedStudent
        ? classes.find((c) => c.id === matchedStudent.classId)
        : undefined;

      const fineAmount = Math.max(0, parseNum(cells[fineIdx]));

      const rawF1Label = (cells[flex1LabelIdx] || '').trim();
      const flex1Amount = parseNum(cells[flex1ValueIdx]);
      const flex1Label = rawF1Label || globalFlex1;

      const rawF2Label = (cells[flex2LabelIdx] || '').trim();
      const flex2Amount = parseNum(cells[flex2ValueIdx]);
      const flex2Label = rawF2Label || globalFlex2;

      const rawF3Label = (cells[flex3LabelIdx] || '').trim();
      const flex3Amount = parseNum(cells[flex3ValueIdx]);
      const flex3Label = rawF3Label || globalFlex3;

      const rawF4Label = (cells[flex4LabelIdx] || '').trim();
      const flex4Amount = parseNum(cells[flex4ValueIdx]);
      const flex4Label = rawF4Label || globalFlex4;

      const isValid = !!matchedStudent;
      const validationError = isValid
        ? undefined
        : `Student with Reg # "${rawId}" not found in students directory.`;

      const totalOverrideAmount =
        fineAmount + flex1Amount + flex2Amount + flex3Amount + flex4Amount;

      results.push({
        rowNum: idx + 1,
        rawId,
        student: matchedStudent,
        className: sClass?.name,
        fineAmount,
        flex1Label,
        flex1Amount,
        flex2Label,
        flex2Amount,
        flex3Label,
        flex3Amount,
        flex4Label,
        flex4Amount,
        isValid,
        validationError,
        totalOverrideAmount,
      });
    });

    if (results.length === 0) {
      setCsvParseError('No rows could be parsed from the CSV input.');
    }

    setParsedCsvRows(results);
  };

  const handleCsvFileUpload = (file: File) => {
    setCsvFileName(file.name);
    setCsvParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        processCsvContent(text);
      } else {
        setCsvParseError('File is empty.');
      }
    };
    reader.onerror = () => {
      setCsvParseError('Failed to read CSV file.');
    };
    reader.readAsText(file);
  };

  const handleDownloadSampleCsv = () => {
    const headers = [
      'reg #',
      'fine',
      'flex1 label',
      'flex1 value',
      'flex2 label',
      'flex2 value',
      'flex3 label',
      'flex3 value',
      'flex4 label',
      'flex4 value',
    ];

    const globalFlex1 =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex1')?.label || 'Admission Fee';
    const globalFlex2 =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex2')?.label || 'Registration Fee';
    const globalFlex3 =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex3')?.label || 'Exam Fee';
    const globalFlex4 =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex4')?.label || 'Other';

    const activeStudents = students.filter((s) => s.status === 'Active');
    const sampleList = activeStudents.length > 0 ? activeStudents : students;

    const sampleRows = sampleList.map((s) => {
      const sTemplates = templates.filter((t) => {
        if (t.studentId !== s.id) return false;
        if (effectiveTemplateMonth === 'all') {
          return !t.month || t.month === 'all';
        }
        return t.month === effectiveTemplateMonth;
      });
      const fineTpl = sTemplates.find((t) => t.kind === 'Fine');
      const f1Tpl = sTemplates.find((t) => t.kind === 'Flex1');
      const f2Tpl = sTemplates.find((t) => t.kind === 'Flex2');
      const f3Tpl = sTemplates.find((t) => t.kind === 'Flex3');
      const f4Tpl = sTemplates.find((t) => t.kind === 'Flex4');

      return [
        s.regNo,
        fineTpl ? fineTpl.defaultAmount : 0,
        `"${f1Tpl?.label || globalFlex1}"`,
        f1Tpl ? f1Tpl.defaultAmount : 0,
        `"${f2Tpl?.label || globalFlex2}"`,
        f2Tpl ? f2Tpl.defaultAmount : 0,
        `"${f3Tpl?.label || globalFlex3}"`,
        f3Tpl ? f3Tpl.defaultAmount : 0,
        `"${f4Tpl?.label || globalFlex4}"`,
        f4Tpl ? f4Tpl.defaultAmount : 0,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...sampleRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `fee_template_overrides_${effectiveTemplateMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCommitCsvUpload = () => {
    const validRows = parsedCsvRows.filter((r) => r.isValid && r.student);
    if (validRows.length === 0) {
      setCsvParseError('No valid rows to import. Please check student identifiers.');
      return;
    }

    const globalFlex1Label =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex1')?.label || 'Admission Fee';
    const globalFlex2Label =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex2')?.label || 'Registration Fee';
    const globalFlex3Label =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex3')?.label || 'Exam Fee';
    const globalFlex4Label =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Flex4')?.label || 'Other';
    const globalFineLabel =
      templates.find((t) => !t.studentId && !t.classId && t.kind === 'Fine')?.label || 'Fine';

    const entriesToSave = validRows.map((row) => {
      const student = row.student!;
      // Preserve any existing non-flex non-fine overrides (e.g. tuition)
      const existingOtherOverrides = templates.filter((t) => {
        if (t.studentId !== student.id) return false;
        const matchMonth =
          effectiveTemplateMonth === 'all'
            ? !t.month || t.month === 'all'
            : t.month === effectiveTemplateMonth;
        return matchMonth && !['Fine', 'Flex1', 'Flex2', 'Flex3', 'Flex4'].includes(t.kind);
      });

      const items: Array<{
        kind: ParticularKind;
        label: string;
        defaultAmount: number;
        sortOrder: number;
      }> = [
        ...existingOtherOverrides.map((t) => ({
          kind: t.kind,
          label: t.label,
          defaultAmount: t.defaultAmount,
          sortOrder: t.sortOrder,
        })),
      ];

      if (row.fineAmount > 0) {
        items.push({
          kind: 'Fine',
          label: globalFineLabel,
          defaultAmount: row.fineAmount,
          sortOrder: 5,
        });
      }

      if (row.flex1Amount !== 0 || (row.flex1Label && row.flex1Label !== globalFlex1Label)) {
        items.push({
          kind: 'Flex1',
          label: row.flex1Label,
          defaultAmount: row.flex1Amount,
          sortOrder: 2,
        });
      }

      if (row.flex2Amount !== 0 || (row.flex2Label && row.flex2Label !== globalFlex2Label)) {
        items.push({
          kind: 'Flex2',
          label: row.flex2Label,
          defaultAmount: row.flex2Amount,
          sortOrder: 3,
        });
      }

      if (row.flex3Amount !== 0 || (row.flex3Label && row.flex3Label !== globalFlex3Label)) {
        items.push({
          kind: 'Flex3',
          label: row.flex3Label,
          defaultAmount: row.flex3Amount,
          sortOrder: 6,
        });
      }

      if (row.flex4Amount !== 0 || (row.flex4Label && row.flex4Label !== globalFlex4Label)) {
        items.push({
          kind: 'Flex4',
          label: row.flex4Label,
          defaultAmount: row.flex4Amount,
          sortOrder: 7,
        });
      }

      return {
        studentId: student.id,
        items,
      };
    });

    bulkSaveMultipleStudentTemplateOverrides(entriesToSave, effectiveTemplateMonth);

    setToastMessage(
      `Successfully imported custom fee template overrides for ${validRows.length} student${
        validRows.length === 1 ? '' : 's'
      } for ${effectiveTemplateMonth === 'all' ? 'All Months (Recurring)' : formatMonthName(effectiveTemplateMonth)}!`
    );

    setShowCsvModal(false);
    setParsedCsvRows([]);
    setIsParsedPreviewExpanded(false);
    setCsvFileName('');
    setCsvParseError(null);
  };

  // Unified Operator Management Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [modalUser, setModalUser] = useState<User | null>(null);
  const [modalInitialTab, setModalInitialTab] = useState<'profile' | 'permissions'>('profile');

  // Close the top-most open modal/overlay when Escape is pressed. Declared
  // after all the state it references so the active flag evaluates cleanly.
  useEscapeKey(() => {
    if (isStudentDropdownOpen) {
      setIsStudentDropdownOpen(false);
    } else if (isClassDropdownOpen) {
      setIsClassDropdownOpen(false);
    } else if (showPolicyConfirmModal) {
      setShowPolicyConfirmModal(false);
    } else if (showResetAllModal) {
      setShowResetAllModal(false);
    } else if (pendingTransition) {
      setPendingTransition(null);
    } else if (showCsvModal) {
      setShowCsvModal(false);
      setParsedCsvRows([]);
      setIsParsedPreviewExpanded(false);
      setCsvFileName('');
      setCsvParseError(null);
    } else if (showUserModal) {
      setShowUserModal(false);
      setModalUser(null);
    } else if (showBankModal) {
      setShowBankModal(false);
      setEditingBank(null);
    }
  }, !!(
    isStudentDropdownOpen ||
    isClassDropdownOpen ||
    showPolicyConfirmModal ||
    showResetAllModal ||
    pendingTransition ||
    showCsvModal ||
    showUserModal ||
    showBankModal
  ));

  const handleOpenUserModal = (user?: User, initialTab: 'profile' | 'permissions' = 'profile') => {
    setModalUser(user || null);
    setModalInitialTab(initialTab);
    setShowUserModal(true);
  };

  const handleOpenPermissionsModal = (user: User) => {
    handleOpenUserModal(user, 'permissions');
  };

  const handleSaveUserModal = async (data: UserModalSaveData) => {
    if (data.id) {
      // Updating existing operator
      const updates: Partial<User> = {
        username: data.username.trim(),
        name: data.name.trim() || data.username.trim(),
        role: data.role,
        email: data.email?.trim() || undefined,
        permissions: data.permissions,
      };
      if (data.password?.trim()) {
        updates.password = data.password.trim();
      }

      const res = await updateUser(data.id, updates);
      if (!res.success) {
        showToast(res.error || 'Failed to update operator.', 'error');
        throw new Error(res.error || 'Failed to update operator.');
      }

      // If permissions or role changed, also trigger updateUserPermissions to ensure security audit is logged
      const originalUser = users.find((u) => u.id === data.id);
      if (
        originalUser &&
        (originalUser.role !== data.role ||
          JSON.stringify(originalUser.permissions) !== JSON.stringify(data.permissions))
      ) {
        await updateUserPermissions(data.id, data.permissions, data.role);
      }

      showToast(`Operator @${data.username} updated successfully!`, 'success');
    } else {
      // Creating new operator
      if (!data.password?.trim()) {
        showToast('Password is required for new operator accounts.', 'warning');
        throw new Error('Password is required for new operator accounts.');
      }

      const res = await addUser({
        username: data.username.trim(),
        password: data.password.trim(),
        name: data.name.trim() || data.username.trim(),
        role: data.role,
        email: data.email?.trim() || undefined,
        permissions: data.permissions,
      });

      if (!res.success) {
        showToast(res.error || 'Failed to create operator.', 'error');
        throw new Error(res.error || 'Failed to create operator.');
      }

      showToast(`Operator @${data.username} created successfully!`, 'success');
    }

    setShowUserModal(false);
    setModalUser(null);
  };

  const handleDeleteUser = (id: string, name: string) => {
    setUserToDelete({ id, name });
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    const res = await deleteUser(userToDelete.id);
    if (!res.success) {
      showToast(res.error || 'Failed to delete user.', 'error');
    } else {
      showToast(`User ${userToDelete.name} removed from system.`, 'success');
    }
    setUserToDelete(null);
  };

  const handleConfirmDeleteBank = () => {
    if (!bankToDelete) return;
    deleteBankAccount(bankToDelete.id);
    showToast(`Bank account "${bankToDelete.bankName}" removed.`, 'success');
    setBankToDelete(null);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateInstitute(profileData);
    showToast('Institute profile updated successfully!', 'success');
  };

  const handleOpenBankModal = (bank?: BankAccount) => {
    if (bank) {
      setEditingBank(bank);
      const ltr = bank.instructionsLtr ?? bank.instructionsLine1 ?? '';
      const rtl = bank.instructionsRtl ?? bank.instructionsLine2 ?? '';
      setBankFormData({
        bankName: bank.bankName,
        title: bank.title,
        accountNumber: bank.accountNumber,
        branchCode: bank.branchCode,
        instructionsLtr: ltr,
        instructionsRtl: rtl,
        instructionsLine1: ltr,
        instructionsLine2: rtl,
        active: bank.active,
        isDefault: bank.isDefault,
      });
    } else {
      setEditingBank(null);
      setBankFormData({
        bankName: '',
        title: '',
        accountNumber: '',
        branchCode: '',
        instructionsLtr: '',
        instructionsRtl: '',
        instructionsLine1: '',
        instructionsLine2: '',
        active: true,
        isDefault: bankAccounts.length === 0,
      });
    }
    setShowBankModal(true);
  };

  const handleSaveBank = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...bankFormData,
      instructionsLine1: bankFormData.instructionsLtr,
      instructionsLine2: bankFormData.instructionsRtl,
    };
    if (editingBank) {
      updateBankAccount(editingBank.id, payload);
      showToast(`Bank "${bankFormData.bankName}" updated.`, 'success');
    } else {
      addBankAccount(payload);
      showToast(`Bank "${bankFormData.bankName}" added.`, 'success');
    }
    setShowBankModal(false);
  };

  interface SettingsHeaderConfig {
    title: string;
    subtitle: string;
    icon: React.ElementType;
    iconColor?: string;
  }

  const SETTINGS_HEADER_CONFIGS: Record<typeof activeSubTab, SettingsHeaderConfig> = {
    profile: {
      title: 'Campus Profile & Institution Identity',
      subtitle: 'Campus name, registration credentials, official crest/logo, and receipt contact details.',
      icon: Building2,
    },
    banks: {
      title: 'Bank Accounts & Deposit Instructions',
      subtitle: 'Institution deposit accounts, branch codes, IBAN numbers, and student deposit instructions.',
      icon: CreditCard,
    },
    users: {
      title: 'Users & Permissions Management',
      subtitle: 'Operator profiles, password credentials, and granular role-based access control.',
      icon: Users,
    },
    appearance: {
      title: 'Appearance & Visual Themes',
      subtitle: 'Campus UI color palette, dark/light contrast modes, and sidebar orientation.',
      icon: Palette,
    },
    database: {
      title: 'Database, Backups & Disaster Recovery',
      subtitle: 'Cloud storage synchronization status, manual snapshot creation, and database restore.',
      icon: Server,
    },
    cleanup: {
      title: 'Data Maintenance & System Cleanup',
      subtitle: 'High-risk data purge utilities, transactional audit resetting, and test record cleanup.',
      icon: Database,
      iconColor: 'text-rose-600',
    },
    policies: {
      title: 'Fee Calculation & Voucher Policies',
      subtitle: 'Default billing due dates, late payment surcharge rates, and downstream voucher recalculation rules.',
      icon: Sliders,
    },
    templates: {
      title: 'Fee Structure & Particulars Templates',
      subtitle: 'Standard monthly tuition templates, class-level rate sheets, and individualized student fee overrides.',
      icon: FileSpreadsheet,
    },
    monthEnd: {
      title: 'Month-End Reconciliation & Closure',
      subtitle: 'Audit collections, reconcile outstanding fees, apply late fines, and lock accounting periods.',
      icon: CalendarCheck,
    },
  };

  const currentHeaderConfig = SETTINGS_HEADER_CONFIGS[activeSubTab] || SETTINGS_HEADER_CONFIGS.profile;
  const HeaderIcon = currentHeaderConfig.icon;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <HeaderIcon className={`w-6 h-6 ${currentHeaderConfig.iconColor || 'text-teal-600'}`} />
            {currentHeaderConfig.title}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {currentHeaderConfig.subtitle}
          </p>
        </div>
      </div>

      {activeSubTab === 'appearance' && <AppearancePanel />}

      {activeSubTab === 'profile' && (
        <ProfilePanel
          profileData={profileData}
          setProfileData={setProfileData}
          logoInputType={logoInputType}
          setLogoInputType={setLogoInputType}
          customLogoUrl={customLogoUrl}
          setCustomLogoUrl={setCustomLogoUrl}
          logoDragActive={logoDragActive}
          setLogoDragActive={setLogoDragActive}
          logoError={logoError}
          setLogoError={setLogoError}
          logoFileInputRef={logoFileInputRef}
          handleLogoFile={handleLogoFile}
          handleLogoDrop={handleLogoDrop}
          handleApplyLogoUrl={handleApplyLogoUrl}
          handleRemoveLogo={handleRemoveLogo}
          handleSaveProfile={handleSaveProfile}
        />
      )}

      {activeSubTab === 'policies' && (
        <PoliciesPanel
          selectedLateFeeRate={selectedLateFeeRate}
          setSelectedLateFeeRate={setSelectedLateFeeRate}
          defaultLateFeeRate={defaultLateFeeRate}
          selectedRoundingMultiple={selectedRoundingMultiple}
          setSelectedRoundingMultiple={setSelectedRoundingMultiple}
          selectedRoundingEnabled={selectedRoundingEnabled}
          setSelectedRoundingEnabled={setSelectedRoundingEnabled}
          roundingMultiple={roundingMultiple}
          roundingEnabled={roundingEnabled}
          isDefaultDueDateModified={isDefaultDueDateModified}
          selectedDefaultDueDateEnabled={selectedDefaultDueDateEnabled}
          setSelectedDefaultDueDateEnabled={setSelectedDefaultDueDateEnabled}
          selectedDefaultDueDay={selectedDefaultDueDay}
          setSelectedDefaultDueDay={setSelectedDefaultDueDay}
          dueDayDropdownRef={dueDayDropdownRef}
          isDueDayDropdownOpen={isDueDayDropdownOpen}
          setIsDueDayDropdownOpen={setIsDueDayDropdownOpen}
          policyCategoryTab={policyCategoryTab}
          setPolicyCategoryTab={setPolicyCategoryTab}
          selectedPriorRule={selectedPriorRule}
          setSelectedPriorRule={setSelectedPriorRule}
          selectedSkippedRule={selectedSkippedRule}
          setSelectedSkippedRule={setSelectedSkippedRule}
          selectedDeletionResolution={selectedDeletionResolution}
          setSelectedDeletionResolution={setSelectedDeletionResolution}
          selectedVoucherCopyOrder={selectedVoucherCopyOrder}
          setSelectedVoucherCopyOrder={setSelectedVoucherCopyOrder}
          selectedVoucherDefaultCopies={selectedVoucherDefaultCopies}
          setSelectedVoucherDefaultCopies={setSelectedVoucherDefaultCopies}
          hasPolicyChanges={hasPolicyChanges}
          handleResetPolicyDrafts={handleResetPolicyDrafts}
          handleSavePolicyClick={handleSavePolicyClick}
        />
      )}

      {activeSubTab === 'banks' && (
        <BankAccountsPanel
          bankAccounts={bankAccounts}
          handleOpenBankModal={handleOpenBankModal}
          setBankToDelete={setBankToDelete}
        />
      )}

      {/* Subtab 3: Fee Particular Templates */}
      {activeSubTab === 'templates' && (
        <div className="space-y-4">
          {/* 4-Tier Fee Template Scope Switcher Card */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Sliders className="w-4 h-4 text-teal-600 shrink-0" />
                  <h3 className="font-bold text-slate-900 text-sm">
                    Fee Template Hierarchy & Overrides
                  </h3>
                  {templateScopeMode !== 'overrides' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                      Target: {effectiveTemplateMonth === 'all' ? 'All Months (Recurring)' : formatMonthName(effectiveTemplateMonth)}
                    </span>
                  )}
                  {templateScopeMode === 'overrides' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                      {totalOverridesCount} Active Overrides Configured
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {templateScopeMode === 'overrides'
                    ? 'Audit, filter, bulk-manage, and import/export class & student custom fee template overrides.'
                    : 'Configure default fee particular templates and multi-tier override rules for billing vouchers.'}
                </p>
              </div>

              {/* 4-Tier Scope Segmented Control */}
              <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl gap-1 shrink-0 self-start md:self-auto border border-slate-200/70 max-w-full">
                <button
                  type="button"
                  id="tab-scope-global"
                  onClick={() =>
                    requestTransition({
                      kind: 'scope',
                      label: 'Global Default',
                      apply: () => {
                        setTemplateScopeMode('global');
                        setSelectedStudentId('');
                        setSelectedClassId('');
                      },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    templateScopeMode === 'global' && !selectedStudentId && !selectedClassId
                      ? 'bg-white text-teal-950 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5 text-teal-600" />
                  <span>1. Global Default</span>
                </button>
                <button
                  type="button"
                  id="tab-scope-class"
                  onClick={() =>
                    requestTransition({
                      kind: 'scope',
                      label: 'Class Override',
                      apply: () => {
                        setTemplateScopeMode('class');
                        setSelectedStudentId('');
                        if (!selectedClassId && classes.length > 0) {
                          setSelectedClassId(classes[0].id);
                        }
                      },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    templateScopeMode === 'class'
                      ? 'bg-white text-indigo-950 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                  <span>2. Class Override</span>
                  {activeClassOverridesList.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-extrabold">
                      {activeClassOverridesList.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  id="tab-scope-student"
                  onClick={() =>
                    requestTransition({
                      kind: 'scope',
                      label: 'Student Override',
                      apply: () => {
                        setTemplateScopeMode('student');
                        setSelectedClassId('');
                      },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    templateScopeMode === 'student'
                      ? 'bg-white text-teal-950 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5 text-teal-600" />
                  <span>3. Student Override</span>
                  {activeStudentOverridesList.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-teal-100 text-teal-800 font-extrabold">
                      {activeStudentOverridesList.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  id="tab-scope-overrides"
                  onClick={() =>
                    requestTransition({
                      kind: 'scope',
                      label: 'Overrides Directory',
                      apply: () => {
                        setTemplateScopeMode('overrides');
                      },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    templateScopeMode === 'overrides'
                      ? 'bg-white text-amber-950 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5 text-amber-600" />
                  <span>4. Overrides Directory</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      templateScopeMode === 'overrides'
                        ? 'bg-amber-100 text-amber-900'
                        : totalOverridesCount > 0
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {totalOverridesCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Scope 1-3 Configuration: Application Period & Scope Target Controls */}
            {templateScopeMode !== 'overrides' && (
              <>

            {/* Schedule / Application Period Selector */}
            <div className="p-3 bg-slate-50/90 border border-slate-200/80 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                <div className="text-xs min-w-0">
                  <span className="font-bold text-slate-800">Application Schedule:</span>{' '}
                  <span className="text-slate-600">
                    {templateMonthMode === 'all'
                      ? 'Applies recurringly to All Months across vouchers unless overridden'
                      : `Applies as a dedicated override exclusively to ${formatMonthName(templateSpecificMonth)}`}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0 max-w-full">
                <div className="inline-flex p-1 bg-white border border-slate-200 rounded-xl shadow-2xs">
                  <button
                    type="button"
                    id="btn-template-mode-all"
                    onClick={() => {
                      if (templateMonthMode !== 'all') {
                        requestTransition({
                          kind: 'month',
                          label: 'All Months (Recurring)',
                          apply: () => setTemplateMonthMode('all'),
                        });
                      }
                    }}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${
                      templateMonthMode === 'all'
                        ? 'bg-teal-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">All Months</span>
                    <span className="hidden sm:inline text-[10px] opacity-90">(Recurring)</span>
                  </button>
                  <button
                    type="button"
                    id="btn-template-mode-specific"
                    onClick={() => {
                      if (templateMonthMode !== 'specific') {
                        requestTransition({
                          kind: 'month',
                          label: formatMonthName(templateSpecificMonth),
                          apply: () => setTemplateMonthMode('specific'),
                        });
                      }
                    }}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${
                      templateMonthMode === 'specific'
                        ? 'bg-teal-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Specific Month</span>
                    <span className="hidden sm:inline text-[10px] opacity-90">Override</span>
                  </button>
                </div>

                {templateMonthMode === 'specific' && (
                  <div id="input-template-specific-month" className="inline-flex items-center">
                    <MonthPicker
                      value={templateSpecificMonth}
                      onChange={(val) => {
                        if (!val) return;
                        requestTransition({
                          kind: 'month',
                          label: formatMonthName(val),
                          apply: () => setTemplateSpecificMonth(val),
                        });
                      }}
                      availableMonths={monthsWithData}
                      closedMonths={pickerWindowMonths.filter((m) => getMonthClosureStatus(m).isClosed)}
                      themeColor={themeConfig?.color || 'teal'}
                      isLight={true}
                      align="right"
                      showSteppers={true}
                      variant="pill"
                      idPrefix="template-specific-month"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Global Override Status Banner */}
            {templateScopeMode === 'global' && effectiveTemplateMonth !== 'all' && (
              hasGlobalMonthOverride ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>
                      <strong>Custom Global Override for {formatMonthName(effectiveTemplateMonth)}:</strong> This month has customized global fee particulars that override the All-Months baseline.
                    </span>
                  </div>
                  {hasPermission('settings.manage') && (
                    <button
                      type="button"
                      id="btn-revert-global-override"
                      onClick={handleClearGlobalMonthOverride}
                      className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition shrink-0 cursor-pointer"
                    >
                      Revert to All-Months Baseline
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                  <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>
                    Currently inheriting the <strong>All Months (Recurring)</strong> global template. Saving changes here will create a dedicated global override for <strong>{formatMonthName(effectiveTemplateMonth)}</strong> without altering other months.
                  </span>
                </div>
              )
            )}

            {/* Scope Specific Selector & Quick Tools Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
              <div className="flex-1 min-w-0">
                {selectedStudent ? (
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Student Individual Fee Template • {selectedStudent.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure custom fee particulars and rates for {selectedStudent.name} ({selectedStudent.regNo} - {selectedStudentClass?.name || 'Class'}) for {effectiveTemplateMonth === 'all' ? 'All Months (Recurring)' : formatMonthName(effectiveTemplateMonth)}. Overrides both Class and Global templates.
                    </p>
                  </div>
                ) : selectedClass ? (
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-indigo-600" />
                      Class Fee Template Override • {selectedClass.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure default fee particulars for all students enrolled in <strong>{selectedClass.name}</strong> for {effectiveTemplateMonth === 'all' ? 'All Months (Recurring)' : formatMonthName(effectiveTemplateMonth)}. Overrides Global defaults for this class unless a student has an individual override.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Global Fee Particulars & Base Line Items
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Standardized fee roster applied to all students across vouchers and exports whenever class or student overrides are not specified ({effectiveTemplateMonth === 'all' ? 'Recurring Baseline' : `Override for ${formatMonthName(effectiveTemplateMonth)}`}). Drag ⠿ to reorder.
                    </p>
                  </div>
                )}
              </div>

              {/* Selector & Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start lg:self-auto">
                {/* Class Selector when in Class mode or Global mode */}
                {(templateScopeMode === 'class' || (!selectedStudent && selectedClass)) && (
                  <div className="relative">
                    <div className="relative flex items-center">
                      <BookOpen className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                      <select
                        id="select-override-class"
                        value={selectedClassId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          requestTransition({
                            kind: 'scope',
                            label: `Class Override tier (${selectedClass?.name || ''})`,
                            apply: () => {
                              setSelectedClassId(nextId);
                              setSelectedStudentId('');
                              setTemplateScopeMode('class');
                            },
                          });
                        }}
                        className="pl-9 pr-8 py-2 bg-indigo-50/60 hover:bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-950 transition w-48 sm:w-56 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                      >
                        <option value="">-- Select Class --</option>
                        {classes.map((c) => {
                          const hasClassOverride = templates.some(
                            (t) =>
                              !t.studentId &&
                              t.classId === c.id &&
                              (effectiveTemplateMonth === 'all'
                                ? !t.month || t.month === 'all'
                                : t.month === effectiveTemplateMonth || !t.month || t.month === 'all')
                          );
                          return (
                            <option key={c.id} value={c.id}>
                              {c.name} {hasClassOverride ? '★ (Custom Overrides)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                )}

                {/* Searchable Student Selector */}
                {(templateScopeMode === 'student' || selectedStudent) && (
                  <div className="relative" ref={studentSearchDropdownRef}>
                    <div className="relative flex items-center">
                      <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                      <input
                        type="text"
                        value={
                          isStudentDropdownOpen
                            ? studentSearchQuery
                            : selectedStudent
                            ? `${selectedStudent.name} (${selectedStudent.regNo})`
                            : ''
                        }
                        onChange={(e) => {
                          setStudentSearchQuery(e.target.value);
                          setIsStudentDropdownOpen(true);
                        }}
                        onFocus={() => {
                          setStudentSearchQuery('');
                          setIsStudentDropdownOpen(true);
                        }}
                        placeholder="Search student or pick..."
                        className={`pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/80 border rounded-xl text-xs font-semibold text-slate-800 transition w-56 sm:w-64 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${
                          selectedStudent
                            ? 'border-teal-400 bg-teal-50/50 text-teal-900'
                            : 'border-slate-200'
                        }`}
                      />
                      {selectedStudent ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStudentId('');
                            setStudentSearchQuery('');
                            setIsStudentDropdownOpen(false);
                          }}
                          className="absolute right-2.5 p-1 text-slate-400 hover:text-rose-600 rounded-md transition"
                          title="Clear student selection"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsStudentDropdownOpen((prev) => !prev)}
                          className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-md transition"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Dropdown Menu */}
                    {isStudentDropdownOpen && (
                      <div className="absolute z-40 right-0 sm:left-0 sm:right-auto mt-1.5 w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 max-h-72 overflow-y-auto divide-y divide-slate-100">
                        {/* Default Option: Clear student */}
                        <div
                          onClick={() => {
                            setSelectedStudentId('');
                            setIsStudentDropdownOpen(false);
                            setStudentSearchQuery('');
                          }}
                          className={`p-2.5 flex items-center justify-between hover:bg-teal-50/70 cursor-pointer transition text-xs ${
                            !selectedStudentId ? 'bg-teal-50/80 font-bold text-teal-900' : 'text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                              <Sliders className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">Select Student</div>
                              <div className="text-[11px] text-slate-500 font-normal">Choose a student for individual overrides</div>
                            </div>
                          </div>
                          {!selectedStudentId && <Check className="w-4 h-4 text-teal-600" />}
                        </div>

                        {/* Filtered Student List */}
                        {filteredStudents.length > 0 ? (
                          filteredStudents.map((std) => {
                            const stdClass = classes.find((c) => c.id === std.classId);
                            const hasOverrides = templates.some(
                              (t) =>
                                t.studentId === std.id &&
                                (effectiveTemplateMonth === 'all'
                                  ? !t.month || t.month === 'all'
                                  : t.month === effectiveTemplateMonth || !t.month || t.month === 'all')
                            );
                            const isCurrent = selectedStudentId === std.id;

                            return (
                              <div
                                key={std.id}
                                onClick={() => {
                                  requestTransition({
                                    kind: 'scope',
                                    label: `Student Override tier (${selectedStudent?.name || selectedStudent?.regNo || ''})`,
                                    apply: () => {
                                      setSelectedStudentId(std.id);
                                      setSelectedClassId('');
                                      setTemplateScopeMode('student');
                                      setIsStudentDropdownOpen(false);
                                      setStudentSearchQuery('');
                                    },
                                  });
                                }}
                                className={`p-2.5 flex items-center justify-between hover:bg-teal-50/70 cursor-pointer transition text-xs ${
                                  isCurrent ? 'bg-teal-50 font-bold' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-full bg-slate-800 text-teal-400 font-bold flex items-center justify-center text-[11px] shrink-0">
                                    {std.name.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                                      <span className="truncate">{std.name}</span>
                                      <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1 py-0.2 rounded shrink-0">
                                        {std.regNo}
                                      </span>
                                    </div>
                                    <div className="text-slate-500 text-[11px] truncate">
                                      Class: <span className="text-slate-700 font-medium">{stdClass?.name || 'N/A'}</span>
                                      {std.fatherName && ` • S/O: ${std.fatherName}`}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 pl-2">
                                  {hasOverrides && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                                      Custom
                                    </span>
                                  )}
                                  {isCurrent && <Check className="w-3.5 h-3.5 text-teal-600" />}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="p-3 text-center text-xs text-slate-500">
                            No students found matching "{studentSearchQuery}".
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Bulk Upload CSV Button */}
                <button
                  type="button"
                  id="btn-bulk-upload-template-csv"
                  onClick={() => {
                    setCsvParseError(null);
                    setShowCsvModal(true);
                  }}
                  className="flex items-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                  title="Upload student fee template overrides from CSV"
                >
                  <Upload className="w-3.5 h-3.5 text-teal-600" />
                  Bulk Upload CSV
                </button>

                {/* Reset All Button */}
                <button
                  type="button"
                  id="btn-reset-all-templates"
                  onClick={() => setShowResetAllModal(true)}
                  className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer"
                  title="Reset global template to defaults and delete overrides for current month"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                  Reset All
                </button>
              </div>
            </div>
            </>
          )}
          </div>

          {/* Form for Scope 1-3 (Global, Class, Student) */}
          {templateScopeMode !== 'overrides' && (
            <>
              <form
                onSubmit={
                  selectedStudent
                    ? handleSaveStudentOverrides
                    : selectedClass
                    ? handleSaveClassOverrides
                    : handleSaveAllParticulars
                }
                className="space-y-4"
              >
            {/* Selected Student Banner (if a student is active) */}
            {selectedStudent && (
              <div className="bg-teal-50/70 rounded-2xl border border-teal-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-teal-400 font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                    {selectedStudent.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      {selectedStudent.name}
                      <span className="text-xs font-mono font-bold text-teal-700 bg-white border border-teal-200 px-2 py-0.5 rounded-md">
                        {selectedStudent.regNo}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Class: <span className="font-semibold text-slate-800">{selectedStudentClass?.name || 'N/A'}</span>
                      {selectedStudent.section && ` (Sec ${selectedStudent.section})`}
                      {selectedStudent.fatherName && ` • S/D/O: ${selectedStudent.fatherName}`}
                      {selectedStudent.monthlyDiscount ? ` • Base Discount: Rs. ${Math.round(selectedStudent.monthlyDiscount)}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                  {templates.some(
                    (t) =>
                      t.studentId === selectedStudent.id &&
                      (effectiveTemplateMonth === 'all'
                        ? !t.month || t.month === 'all'
                        : t.month === effectiveTemplateMonth || !t.month || t.month === 'all')
                  ) ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Individual Overrides Active ({effectiveTemplateMonth === 'all' ? 'All Months' : formatMonthName(effectiveTemplateMonth)})
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-200/80 text-slate-700 border border-slate-300">
                      Inheriting{' '}
                      {templates.some(
                        (t) =>
                          !t.studentId &&
                          t.classId === selectedStudent.classId &&
                          (effectiveTemplateMonth === 'all'
                            ? !t.month || t.month === 'all'
                            : t.month === effectiveTemplateMonth || !t.month || t.month === 'all')
                      )
                        ? 'Class Overrides'
                        : 'Global Template'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      requestTransition({
                        kind: 'scope',
                        label: scopeLabel,
                        apply: () => {
                          setSelectedStudentId('');
                          setStudentSearchQuery('');
                          setTemplateScopeMode('global');
                        },
                      });
                    }}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900 bg-white hover:bg-teal-100/50 border border-teal-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Return to Global
                  </button>
                </div>
              </div>
            )}

            {/* Selected Class Banner (if in class override mode) */}
            {!selectedStudent && selectedClass && (
              <div className="bg-indigo-50/70 rounded-2xl border border-indigo-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-900 text-indigo-300 font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      {selectedClass.name}
                      <span className="text-xs font-bold text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded-md">
                        Base Monthly Fee: Rs. {selectedClass.monthlyFee || 0}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Class Level Tier • Enrolled Students: {students.filter((s) => s.classId === selectedClass.id).length}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                  {templates.some(
                    (t) =>
                      !t.studentId &&
                      t.classId === selectedClass.id &&
                      (effectiveTemplateMonth === 'all'
                        ? !t.month || t.month === 'all'
                        : t.month === effectiveTemplateMonth || !t.month || t.month === 'all')
                  ) ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Class Overrides Active ({effectiveTemplateMonth === 'all' ? 'All Months' : formatMonthName(effectiveTemplateMonth)})
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-200/80 text-slate-700 border border-slate-300">
                      Inheriting Global Template
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      requestTransition({
                        kind: 'scope',
                        label: scopeLabel,
                        apply: () => {
                          setSelectedClassId('');
                          setTemplateScopeMode('global');
                        },
                      });
                    }}
                    className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-100/50 border border-indigo-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Return to Global
                  </button>
                </div>
              </div>
            )}

            {/* Unified Fee Particulars Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-600">
                  {selectedStudent
                    ? `💡 Fee Particulars Customization for ${selectedStudent.name} (${selectedStudent.regNo}) (${effectiveTemplateMonth === 'all' ? 'All Months Recurring' : formatMonthName(effectiveTemplateMonth)}). Overrides class & global template.`
                    : selectedClass
                    ? `💡 Fee Particulars Customization for Class ${selectedClass.name} (${effectiveTemplateMonth === 'all' ? 'All Months Recurring' : formatMonthName(effectiveTemplateMonth)}). Overrides global defaults for all students in this class.`
                    : `💡 Drag rows by the handle (⠿) to reorder line items for ${effectiveTemplateMonth === 'all' ? 'All Months (Recurring)' : formatMonthName(effectiveTemplateMonth)}. PDF and voucher printouts will follow this exact order.`}
                </span>
                <span className="text-[11px] text-teal-800 font-bold bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-md shrink-0 self-start sm:self-auto flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-600" />
                  <span>Month: {effectiveTemplateMonth === 'all' ? 'All Months (Recurring)' : formatMonthName(effectiveTemplateMonth)}</span>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3 w-10 text-center"></th>
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3">Fee Particular / Label</th>
                      <th className="p-3">Calculation / Description</th>
                      <th className="p-3 text-right w-44">Default Amount (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rosterState.map((r, index) => {
                      const spec = STANDARD_ROSTER.find((sr) => sr.kind === r.kind)!;
                      const isFlexField = spec.isFlex;
                      const isDragged = draggedIndex === index;
                      const isDragOver = dragOverIndex === index;

                      // Student or Class specific value if selected
                      const studentItem = selectedStudent
                        ? studentRosterState.find((s) => s.kind === r.kind)
                        : null;
                      const classItem = !selectedStudent && selectedClass
                        ? classRosterState.find((c) => c.kind === r.kind)
                        : null;

                      const currentLabel = selectedStudent
                        ? studentItem?.label ?? r.label
                        : selectedClass
                        ? classItem?.label ?? r.label
                        : r.label;

                      const currentAmount = selectedStudent
                        ? studentItem?.defaultAmount ?? r.defaultAmount
                        : selectedClass
                        ? classItem?.defaultAmount ?? r.defaultAmount
                        : r.defaultAmount;

                      const isScopeSpecific = !!(selectedStudent || selectedClass);

                      return (
                        <tr
                          key={r.kind}
                          draggable={!isScopeSpecific && hasPermission('settings.manage')}
                          onDragStart={(e) => {
                            if (isScopeSpecific) return;
                            setDraggedIndex(index);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            if (isScopeSpecific) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverIndex !== index) {
                              setDragOverIndex(index);
                            }
                          }}
                          onDragLeave={() => {
                            if (isScopeSpecific) return;
                            if (dragOverIndex === index) {
                              setDragOverIndex(null);
                            }
                          }}
                          onDrop={(e) => {
                            if (isScopeSpecific) return;
                            e.preventDefault();
                            handleDropReorder(index);
                          }}
                          onDragEnd={() => {
                            if (isScopeSpecific) return;
                            setDraggedIndex(null);
                            setDragOverIndex(null);
                          }}
                          className={`transition ${
                            isDragOver
                              ? 'bg-teal-50 border-t-2 border-teal-500'
                              : isDragged
                              ? 'opacity-40 bg-slate-100'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <td className="p-3 text-center">
                            {!isScopeSpecific && hasPermission('settings.manage') ? (
                              <button
                                type="button"
                                title="Drag to reorder"
                                className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-teal-600 p-1 rounded inline-flex items-center justify-center transition"
                              >
                                <GripVertical className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="w-4 h-4 inline-block" />
                            )}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-400">
                            {index + 1}
                          </td>
                          <td className="p-3">
                            {isFlexField ? (
                              <input
                                type="text"
                                value={currentLabel}
                                onChange={(e) => {
                                  if (selectedStudent) {
                                    handleStudentRosterLabelChange(r.kind, e.target.value);
                                  } else if (selectedClass) {
                                    handleClassRosterLabelChange(r.kind, e.target.value);
                                  } else {
                                    handleRosterLabelChange(r.kind, e.target.value);
                                  }
                                }}
                                placeholder={spec.defaultLabel}
                                disabled={!hasPermission('settings.manage')}
                                className="w-full max-w-xs p-2 bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-lg font-bold text-slate-900 transition text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                              />
                            ) : (
                              <span className="font-bold text-slate-900 block text-xs">
                                {currentLabel}
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <p className="text-slate-600 text-xs">{spec.description}</p>
                          </td>
                          <td className="p-3 text-right">
                            {isFlexField ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span className="text-slate-400 font-semibold text-xs">Rs.</span>
                                <input
                                  type="number"
                                  value={currentAmount === 0 ? '' : currentAmount}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 0;
                                    if (selectedStudent) {
                                      handleStudentRosterAmountChange(r.kind, val);
                                    } else if (selectedClass) {
                                      handleClassRosterAmountChange(r.kind, val);
                                    } else {
                                      handleRosterAmountChange(r.kind, val);
                                    }
                                  }}
                                  placeholder="0"
                                  disabled={!hasPermission('settings.manage')}
                                  className="w-24 p-1.5 text-right bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-lg font-bold text-slate-900 text-xs transition disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                {spec.isDynamic ? 'Auto-Calculated' : 'On Trigger / Voucher'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Action Bar */}
              {hasPermission('settings.manage') && (
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  {selectedStudent ? (
                    <>
                      <button
                        type="button"
                        id="btn-revert-student-overrides"
                        onClick={() => handleClearStudentOverrides(selectedStudent.id, effectiveTemplateMonth)}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Revert ({effectiveTemplateMonth === 'all' ? 'All Months' : formatMonthName(effectiveTemplateMonth)})
                      </button>

                      <button
                        type="submit"
                        id="btn-save-student-overrides"
                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        Save Overrides for {selectedStudent.name} ({effectiveTemplateMonth === 'all' ? 'All Months Recurring' : formatMonthName(effectiveTemplateMonth)})
                      </button>
                    </>
                  ) : selectedClass ? (
                    <>
                      <button
                        type="button"
                        id="btn-revert-class-overrides"
                        onClick={() => handleClearClassOverrides(selectedClass.id, effectiveTemplateMonth)}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Revert Class ({effectiveTemplateMonth === 'all' ? 'All Months' : formatMonthName(effectiveTemplateMonth)})
                      </button>

                      <button
                        type="submit"
                        id="btn-save-class-overrides"
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        Save Overrides for Class {selectedClass.name} ({effectiveTemplateMonth === 'all' ? 'All Months Recurring' : formatMonthName(effectiveTemplateMonth)})
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-slate-500">
                        {effectiveTemplateMonth === 'all'
                          ? 'Changes here update the recurring global baseline applied to all months.'
                          : `Changes here create a dedicated global override exclusively for ${formatMonthName(effectiveTemplateMonth)}.`}
                      </span>
                      <button
                        type="submit"
                        id="btn-save-fee-particulars"
                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        Save Global Fee Particulars ({effectiveTemplateMonth === 'all' ? 'All Months Baseline' : formatMonthName(effectiveTemplateMonth)})
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </form>

          {/* Quick link to Overrides Directory if overrides exist */}
          {totalOverridesCount > 0 && (
            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <ListFilter className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>{totalOverridesCount}</strong> custom fee override{totalOverridesCount === 1 ? '' : 's'} active ({activeClassOverridesList.length} class, {activeStudentOverridesList.length} student).
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  requestTransition({
                    kind: 'scope',
                    label: 'Overrides Directory',
                    apply: () => setTemplateScopeMode('overrides'),
                  })
                }
                className="font-bold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>Switch to 4. Overrides Directory</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Scope 4: Active Overrides Directory */}
      {templateScopeMode === 'overrides' && (
        <div className="space-y-4">
          {/* Overrides Management Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-600 shrink-0" />
              <div>
                <span className="text-xs font-bold text-slate-800">Overrides List View:</span>{' '}
                <span className="text-xs text-slate-500">
                  Filter class and student custom overrides by application period
                </span>
              </div>
            </div>

            <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1 shrink-0 self-start sm:self-auto border border-slate-200/70 flex-wrap">
              <button
                type="button"
                id="btn-filter-overrides-all"
                onClick={() => setOverridesFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  overridesFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Overrides
              </button>
              <button
                type="button"
                id="btn-filter-overrides-all-months"
                onClick={() => setOverridesFilter('all_months')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  overridesFilter === 'all_months'
                    ? 'bg-white text-teal-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Months (Recurring)
              </button>
              <button
                type="button"
                id="btn-filter-overrides-target"
                onClick={() => setOverridesFilter('target')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  overridesFilter === 'target' || overridesFilter === 'active'
                    ? 'bg-white text-indigo-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Target Month ({formatMonthName(templateSpecificMonth)})
              </button>
              {activeMonth !== templateSpecificMonth && (
                <button
                  type="button"
                  id="btn-filter-overrides-billing"
                  onClick={() => setOverridesFilter('billing')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    overridesFilter === 'billing'
                      ? 'bg-white text-indigo-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Billing Month ({formatMonthName(activeMonth)})
                </button>
              )}
            </div>
          </div>

          {/* Active Class Overrides Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  Class-Level Fee Overrides
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Classes configured with custom particulars (Fine & Flex 1–4) for recurring or month-specific periods.
                </p>
              </div>
              <span className="text-slate-600 font-bold text-xs bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                {activeClassOverridesList.length} class override{activeClassOverridesList.length === 1 ? '' : 's'}
              </span>
            </div>

            {activeClassOverridesList.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="p-3">Class Name</th>
                        <th className="p-3">Schedule</th>
                        <th className="p-3">Base Fee</th>
                        <th className="p-3">Overridden Particulars (Fine & Flex 1–4)</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeClassOverridesList.map((item) => (
                        <tr key={item.uniqueKey} className="hover:bg-indigo-50/40 transition">
                          <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                            {item.className}
                          </td>
                          <td className="p-3">
                            {item.isAllMonths ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                                <Sparkles className="w-3 h-3 text-teal-600" />
                                All Months (Recurring)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                <Calendar className="w-3 h-3 text-slate-500" />
                                {formatMonthName(item.month)}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-medium text-slate-700">
                            Rs. {item.classObj?.monthlyFee || 0}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1.5 max-w-md">
                              {item.overrides.map((ov) => (
                                <span
                                  key={ov.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-800 border border-indigo-200"
                                >
                                  <strong>{ov.label || ov.kind}:</strong> {formatCurrency(ov.defaultAmount)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  requestTransition({
                                    kind: 'scope',
                                    label: scopeLabel,
                                    apply: () => {
                                      setSelectedClassId(item.classId);
                                      setSelectedStudentId('');
                                      setTemplateScopeMode('class');
                                      if (item.isAllMonths) {
                                        setTemplateMonthMode('all');
                                      } else {
                                        setTemplateMonthMode('specific');
                                        setTemplateSpecificMonth(item.month);
                                      }
                                      window.scrollTo({ top: 100, behavior: 'smooth' });
                                    },
                                  });
                                }}
                                className="px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition cursor-pointer"
                              >
                                Edit in Table
                              </button>
                              {hasPermission('settings.manage') && (
                                <button
                                  type="button"
                                  onClick={() => handleClearClassOverrides(item.classId, item.month)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                  title="Delete Class Overrides"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                No class-specific fee particulars overrides match the selected view.
              </div>
            )}
          </div>

          {/* Active Student Overrides Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  Student Individual Fee Overrides
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Students configured with custom fine and Flex 1–4 particulars overrides for recurring or month-specific periods.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                {selectedOverrideKeys.length > 0 && hasPermission('settings.manage') && (
                  <button
                    type="button"
                    onClick={handleBulkDeleteOverrides}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Selected ({selectedOverrideKeys.length})
                  </button>
                )}
                {hasPermission('settings.manage') && (
                  <>
                    <button
                      type="button"
                      id="btn-upload-overrides-csv-section"
                      onClick={() => {
                        setCsvParseError(null);
                        setShowCsvModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition cursor-pointer"
                      title="Bulk import fee overrides via CSV"
                    >
                      <Upload className="w-3.5 h-3.5 text-teal-600" />
                      Import CSV
                    </button>
                    <button
                      type="button"
                      id="btn-sample-overrides-csv-section"
                      onClick={handleDownloadSampleCsv}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
                      title="Download template CSV with current students"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      CSV Template
                    </button>
                  </>
                )}
                <span className="text-slate-600 font-bold text-xs bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                  {activeStudentOverridesList.length} override{activeStudentOverridesList.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {activeStudentOverridesList.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <tr>
                        {hasPermission('settings.manage') && (
                          <th className="p-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={
                                activeStudentOverridesList.length > 0 &&
                                selectedOverrideKeys.length === activeStudentOverridesList.length
                              }
                              onChange={handleToggleSelectAllOverrides}
                              title="Select all"
                              className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                          </th>
                        )}
                        <th className="p-3">Student Name</th>
                        <th className="p-3">Reg #</th>
                        <th className="p-3">Class</th>
                        <th className="p-3">Schedule</th>
                        <th className="p-3">Overridden Particulars (Fine & Flex 1–4)</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeStudentOverridesList.map((item) => {
                        const isSelected = selectedOverrideKeys.includes(item.uniqueKey);
                        return (
                          <tr
                            key={item.uniqueKey}
                            className={`transition ${isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50/70'}`}
                          >
                            {hasPermission('settings.manage') && (
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectOverride(item.uniqueKey)}
                                  className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                                />
                              </td>
                            )}
                            <td className="p-3 font-bold text-slate-900">
                              {item.student?.name}
                            </td>
                            <td className="p-3">
                              <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                                {item.student?.regNo}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="font-medium text-slate-700">{item.className}</span>
                            </td>
                            <td className="p-3">
                              {item.isAllMonths ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                                  <Sparkles className="w-3 h-3 text-teal-600" />
                                  All Months (Recurring)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  <Calendar className="w-3 h-3 text-slate-500" />
                                  {formatMonthName(item.month)}
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1.5 max-w-md">
                                {item.overrides.map((ov) => (
                                  <span
                                    key={ov.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-teal-50 text-teal-800 border border-teal-200"
                                  >
                                    <strong>{ov.label || ov.kind}:</strong> {formatCurrency(ov.defaultAmount)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    requestTransition({
                                      kind: 'scope',
                                      label: scopeLabel,
                                      apply: () => {
                                        setSelectedStudentId(item.studentId);
                                        setSelectedClassId('');
                                        setTemplateScopeMode('student');
                                        if (item.isAllMonths) {
                                          setTemplateMonthMode('all');
                                        } else {
                                          setTemplateMonthMode('specific');
                                          setTemplateSpecificMonth(item.month);
                                        }
                                        window.scrollTo({ top: 100, behavior: 'smooth' });
                                      },
                                    });
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition cursor-pointer"
                                >
                                  Edit in Table
                                </button>
                                {hasPermission('settings.manage') && (
                                  <button
                                    type="button"
                                    onClick={() => handleClearStudentOverrides(item.studentId, item.month)}
                                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                    title="Delete Student Overrides"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                No student-specific Flex 1–4 template overrides match the selected view.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )}

      {activeSubTab === 'users' &&
        (currentUser?.role === 'Admin' || hasPermission('users.manage')) && (
          <UsersPanel
            handleOpenUserModal={handleOpenUserModal}
            handleOpenPermissionsModal={handleOpenPermissionsModal}
            handleDeleteUser={handleDeleteUser}
          />
        )}

      {/* Subtab: Central Database & Disaster Recovery Backups */}
      {activeSubTab === 'database' && <DatabaseBackupsPanel />}

      {/* Subtab 6: Selection-Based Database Cleanup & Table Reset */}
      {activeSubTab === 'cleanup' && <DataCleanupView />}

      {/* Subtab 7: Month End Reconciliation & Defaulter Wizard */}
      {activeSubTab === 'monthEnd' && (
        <MonthEndWizardPanel
          initialMonth={targetMonth}
          onNavigateToTab={onNavigateToTab}
        />
      )}

      {/* Unified Operator Management Modal (Profile Credentials & Granular Permissions Matrix) */}
      <UserModal
        isOpen={showUserModal}
        user={modalUser}
        initialTab={modalInitialTab}
        onClose={() => {
          setShowUserModal(false);
          setModalUser(null);
        }}
        onSave={handleSaveUserModal}
      />

      {/* Bank Modal */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingBank ? 'Edit Bank Account' : 'Add Collection Bank Account'}
              </h3>
              <button onClick={() => setShowBankModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBank} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Bank Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Commercial Bank Limited"
                  value={bankFormData.bankName}
                  onChange={(e) => setBankFormData({ ...bankFormData, bankName: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Account Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Fee Collection Account"
                  value={bankFormData.title}
                  onChange={(e) => setBankFormData({ ...bankFormData, title: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Account Number / IBAN *</label>
                <input
                  type="text"
                  required
                  placeholder="0102-0103984758"
                  value={bankFormData.accountNumber}
                  onChange={(e) => setBankFormData({ ...bankFormData, accountNumber: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Branch Code / Name</label>
                <input
                  type="text"
                  placeholder="0102 (Main Branch)"
                  value={bankFormData.branchCode}
                  onChange={(e) => setBankFormData({ ...bankFormData, branchCode: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-3 pt-1 border-t border-slate-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-xs text-slate-800">
                      Voucher Instructions (Left-to-Right / English)
                    </label>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">LTR</span>
                  </div>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="e.g. Fee can be paid at any online branch or via Mobile Banking App / 1Link."
                    value={bankFormData.instructionsLtr}
                    onChange={(e) =>
                      setBankFormData({
                        ...bankFormData,
                        instructionsLtr: e.target.value,
                        instructionsLine1: e.target.value,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:border-teal-500 transition"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Printed below bank details on vouchers with left-to-right English alignment.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-xs text-slate-800">
                      ہدایات برائے واؤچر (Right-to-Left / Urdu)
                    </label>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">RTL</span>
                  </div>
                  <input
                    type="text"
                    dir="rtl"
                    placeholder="مثال: فیس مقررہ تاریخ تک کسی بھی برانچ یا موبائل ایپ کے ذریعے جمع کروائی جا سکتی ہے۔"
                    value={bankFormData.instructionsRtl}
                    onChange={(e) =>
                      setBankFormData({
                        ...bankFormData,
                        instructionsRtl: e.target.value,
                        instructionsLine2: e.target.value,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-right font-urdu font-medium focus:bg-white focus:border-teal-500 transition"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5 text-right">
                    واؤچر پر دائیں سے بائیں (RTL) اردو انداز میں پرنٹ ہوگا۔
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowBankModal(false)}
                  className="px-4 py-2 border rounded-xl"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-teal-600 text-white font-bold rounded-xl">
                  Save Bank Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Bulk Upload Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className={`bg-white rounded-2xl ${
              parsedCsvRows.length > 0 ? 'max-w-4xl' : 'max-w-md'
            } w-full p-6 shadow-2xl space-y-5 transition-all max-h-[90vh] flex flex-col border border-slate-200`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-teal-600" />
                {parsedCsvRows.length > 0
                  ? 'Preview & Verify Fee Template Overrides'
                  : `Import Fee Template Overrides (${effectiveTemplateMonth === 'all' ? 'All Months Recurring' : formatMonthName(effectiveTemplateMonth)})`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCsvModal(false);
                  setParsedCsvRows([]);
                  setIsParsedPreviewExpanded(false);
                  setCsvFileName('');
                  setCsvParseError(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            {parsedCsvRows.length === 0 ? (
              <div className="space-y-3 text-xs text-slate-600">
                <p>
                  Upload a CSV file with student fee template overrides for <strong>{effectiveTemplateMonth === 'all' ? 'All Months (Recurring Baseline)' : `${formatMonthName(effectiveTemplateMonth)} (${effectiveTemplateMonth})`}</strong>. First row must contain column headers.
                </p>

                <button
                  type="button"
                  onClick={handleDownloadSampleCsv}
                  className="flex items-center gap-2 text-teal-600 font-bold hover:underline cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Download Sample CSV Format
                </button>

                {/* Status / Error alerts */}
                {csvParseError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{csvParseError}</span>
                  </div>
                )}

                {/* File Dropzone & Click Target */}
                <div
                  onClick={() => csvFileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsCsvDragging(true);
                  }}
                  onDragLeave={() => setIsCsvDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsCsvDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleCsvFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed ${
                    isCsvDragging
                      ? 'border-teal-500 bg-teal-50/60'
                      : 'border-teal-300 hover:border-teal-500 bg-teal-50/20 hover:bg-teal-50/60'
                  } rounded-xl p-6 text-center transition cursor-pointer group`}
                >
                  <Upload className="w-8 h-8 text-teal-600 group-hover:scale-110 transition mx-auto mb-2" />
                  <span className="font-bold text-slate-800 block text-sm">
                    {csvFileName ? (
                      <span className="text-teal-800 font-mono">{csvFileName}</span>
                    ) : (
                      'Click to select CSV File'
                    )}
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Supports standard comma-separated .csv files
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      csvFileInputRef.current?.click();
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Browse CSV File
                  </button>
                  <input
                    ref={csvFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleCsvFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>
            ) : (
              /* Preview View with Collapsible Table */
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                {/* Status Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Rows</span>
                      <span className="font-bold text-slate-900 text-sm">{parsedCsvRows.length}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Valid Matches</span>
                      <span className="font-bold text-emerald-700 text-sm">
                        {parsedCsvRows.filter((r) => r.isValid).length}
                      </span>
                    </div>
                    {parsedCsvRows.some((r) => !r.isValid) && (
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Invalid / Skipped</span>
                        <span className="font-bold text-rose-600 text-sm">
                          {parsedCsvRows.filter((r) => !r.isValid).length}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Target Month</span>
                      <span className="font-bold text-teal-800 text-sm">
                        {effectiveTemplateMonth === 'all' ? 'All Months (Recurring)' : formatMonthName(effectiveTemplateMonth)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      id="btn-toggle-parsed-preview"
                      onClick={() => setIsParsedPreviewExpanded((prev) => !prev)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer text-xs transition shadow-2xs"
                    >
                      <span>{isParsedPreviewExpanded ? 'Hide Table Preview' : 'Show Table Preview'}</span>
                      {isParsedPreviewExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setParsedCsvRows([]);
                        setIsParsedPreviewExpanded(false);
                        setCsvFileName('');
                        setCsvParseError(null);
                      }}
                      className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-semibold cursor-pointer text-xs"
                    >
                      Clear & Upload New File
                    </button>
                  </div>
                </div>

                {csvParseError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{csvParseError}</span>
                  </div>
                )}

                {/* Collapsible Preview Section */}
                {isParsedPreviewExpanded ? (
                  <div className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto max-h-[50vh] flex-1">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="p-3 w-12 text-center">Row</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Student</th>
                          <th className="p-3">Fine</th>
                          <th className="p-3">Flex 1</th>
                          <th className="p-3">Flex 2</th>
                          <th className="p-3">Flex 3</th>
                          <th className="p-3">Flex 4</th>
                          <th className="p-3 text-right">Total Override</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedCsvRows.map((row) => (
                          <tr
                            key={row.rowNum}
                            className={`hover:bg-slate-50/80 transition ${
                              !row.isValid ? 'bg-rose-50/60' : ''
                            }`}
                          >
                            <td className="p-3 text-center font-mono text-slate-500">{row.rowNum}</td>
                            <td className="p-3">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                  <Check className="w-3 h-3 text-emerald-600" /> Matched
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded"
                                  title={row.validationError}
                                >
                                  <AlertCircle className="w-3 h-3 text-rose-600" /> Invalid Reg #
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              {row.student ? (
                                <div>
                                  <div className="font-bold text-slate-900">{row.student.name}</div>
                                  <div className="text-[10px] font-mono text-teal-700 font-semibold">
                                    {row.student.regNo} {row.className ? `• ${row.className}` : ''}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-rose-700 font-mono font-bold text-xs">
                                  {row.rawId} (Not Found)
                                </div>
                              )}
                            </td>
                            <td className="p-3 font-mono text-slate-700">
                              {row.fineAmount > 0 ? formatCurrency(row.fineAmount) : '—'}
                            </td>
                            <td className="p-3">
                              <div>
                                <div className="text-[10px] text-slate-500 font-medium truncate max-w-[120px]" title={row.flex1Label}>
                                  {row.flex1Label}
                                </div>
                                <div className={`font-mono text-xs ${row.flex1Amount > 0 ? 'font-bold text-slate-800' : row.flex1Amount < 0 ? 'font-bold text-rose-600' : 'text-slate-400'}`}>
                                  {row.flex1Amount !== 0 ? formatCurrency(row.flex1Amount) : '—'}
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div>
                                <div className="text-[10px] text-slate-500 font-medium truncate max-w-[120px]" title={row.flex2Label}>
                                  {row.flex2Label}
                                </div>
                                <div className={`font-mono text-xs ${row.flex2Amount > 0 ? 'font-bold text-slate-800' : row.flex2Amount < 0 ? 'font-bold text-rose-600' : 'text-slate-400'}`}>
                                  {row.flex2Amount !== 0 ? formatCurrency(row.flex2Amount) : '—'}
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div>
                                <div className="text-[10px] text-slate-500 font-medium truncate max-w-[120px]" title={row.flex3Label}>
                                  {row.flex3Label}
                                </div>
                                <div className={`font-mono text-xs ${row.flex3Amount > 0 ? 'font-bold text-slate-800' : row.flex3Amount < 0 ? 'font-bold text-rose-600' : 'text-slate-400'}`}>
                                  {row.flex3Amount !== 0 ? formatCurrency(row.flex3Amount) : '—'}
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div>
                                <div className="text-[10px] text-slate-500 font-medium truncate max-w-[120px]" title={row.flex4Label}>
                                  {row.flex4Label}
                                </div>
                                <div className={`font-mono text-xs ${row.flex4Amount > 0 ? 'font-bold text-slate-800' : row.flex4Amount < 0 ? 'font-bold text-rose-600' : 'text-slate-400'}`}>
                                  {row.flex4Amount !== 0 ? formatCurrency(row.flex4Amount) : '—'}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-right font-bold font-mono text-teal-800">
                              {formatCurrency(row.totalOverrideAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsParsedPreviewExpanded(true)}
                    className="border border-dashed border-slate-300 hover:border-teal-400 rounded-xl p-4 bg-slate-50/50 hover:bg-slate-50 flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-teal-600" />
                      <span className="text-xs text-slate-700 font-medium">
                        {parsedCsvRows.filter((r) => r.isValid).length} student override{parsedCsvRows.filter((r) => r.isValid).length === 1 ? '' : 's'} parsed. Preview table is collapsed.
                      </span>
                    </div>
                    <span className="text-xs text-teal-700 font-bold hover:underline flex items-center gap-1">
                      Click to expand preview <ChevronDown className="w-3.5 h-3.5" />
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-between items-center border-t border-slate-200 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowCsvModal(false);
                  setParsedCsvRows([]);
                  setIsParsedPreviewExpanded(false);
                  setCsvFileName('');
                  setCsvParseError(null);
                }}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer text-xs font-semibold"
              >
                {parsedCsvRows.length > 0 ? 'Cancel' : 'Close'}
              </button>

              {parsedCsvRows.length > 0 && (
                <button
                  type="button"
                  id="btn-commit-bulk-upload-csv"
                  disabled={parsedCsvRows.filter((r) => r.isValid).length === 0}
                  onClick={handleCommitCsvUpload}
                  className="px-4 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import Overrides for {parsedCsvRows.filter((r) => r.isValid).length} Student
                  {parsedCsvRows.filter((r) => r.isValid).length === 1 ? '' : 's'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset All Confirmation Modal */}
      {showResetAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Reset All Fee Templates?</h3>
                  <p className="text-xs text-slate-500">
                    Working Month: {formatMonthName(effectiveTemplateMonth === 'all' ? activeMonth : effectiveTemplateMonth)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResetAllModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs text-slate-600">
              <p>
                Are you sure you want to perform a comprehensive template reset?
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-700 font-medium">
                <li>Reset the <strong>global 9-item fee particulars roster</strong> to default system labels, ordering, and amounts.</li>
                <li>Delete all <strong>student-specific fee template overrides</strong> for <strong>{formatMonthName(effectiveTemplateMonth === 'all' ? activeMonth : effectiveTemplateMonth)} ({effectiveTemplateMonth === 'all' ? activeMonth : effectiveTemplateMonth})</strong>.</li>
              </ul>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] font-medium mt-2">
                All newly generated vouchers and re-generated/printed PDF vouchers for this month will use clean default fee rules.
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetAllModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-reset-all"
                onClick={handleConfirmResetAll}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset All to Default
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved-draft guard modal: fires for tier switches and month changes */}
      <ConfirmModal
        isOpen={!!pendingTransition}
        variant="warning"
        title={`Unsaved changes in ${scopeLabel}`}
        message="Save them first, or continue without saving. Discarding will restore this tier's editor from saved data."
        cancelLabel="Keep Editing"
        confirmLabel="Save & Continue"
        tertiaryLabel="Discard & Continue"
        tertiaryVariant="danger"
        onTertiary={() => {
          discardDirtyDrafts();
          if (pendingTransition) pendingTransition.apply();
          setPendingTransition(null);
        }}
        onConfirm={saveActiveDrafts}
        onClose={() => setPendingTransition(null)}
      />

      {/* Delete User Confirmation Modal */}
      <ConfirmModal
        isOpen={!!userToDelete}
        title="Remove Authorized User"
        message={
          userToDelete ? (
            <p>
              Are you sure you want to remove user{' '}
              <strong className="text-slate-900">'{userToDelete.name}'</strong> from authorized personnel? They will no longer be able to log in.
            </p>
          ) : (
            ''
          )
        }
        confirmLabel="Remove User"
        variant="danger"
        onConfirm={handleConfirmDeleteUser}
        onClose={() => setUserToDelete(null)}
      />

      {/* Delete Bank Account Confirmation Modal */}
      <ConfirmModal
        isOpen={!!bankToDelete}
        title="Delete Bank Account"
        message={
          bankToDelete ? (
            <div className="space-y-2">
              <p>
                Are you sure you want to delete{' '}
                <strong className="text-slate-900">{bankToDelete.bankName}</strong>{' '}
                <span className="font-mono">(A/C: {bankToDelete.accountNumber})</span>?
              </p>
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                Until another account is set as the active default, newly issued vouchers{' '}
                <strong>and reprints of existing ones</strong> will instruct:{' '}
                <strong>&ldquo;Payment can be made at the institute accounts office.&rdquo;</strong>
              </div>
            </div>
          ) : (
            ''
          )
        }
        confirmLabel="Delete Account"
        variant="danger"
        onConfirm={handleConfirmDeleteBank}
        onClose={() => setBankToDelete(null)}
      />

      {/* Fee Voucher Policy Change Warning Confirmation Modal */}
      {showPolicyConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh]">
            {/* Compact Modal Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-amber-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0 border border-amber-200">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">
                    Confirm Policy Changes
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Review modified rules & operational impacts
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPolicyConfirmModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition hover:bg-white/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Compact List of Modified Policies */}
            <div className="p-4 overflow-y-auto space-y-2.5 text-xs divide-y divide-slate-100">
              {/* Late Fee Rate (Promoted to Top) */}
              {selectedLateFeeRate !== defaultLateFeeRate && (
                <div className="pt-2 first:pt-0 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Late Surcharge Rate
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Rs. {defaultLateFeeRate} &rarr; <span className="text-teal-700 font-extrabold">Rs. {selectedLateFeeRate}</span>
                    </span>
                  </div>
                  <div className="p-2 bg-amber-50/80 border border-amber-200/70 rounded-lg text-[11px] text-amber-900 leading-relaxed">
                    <strong>Impact:</strong> Updates default fine pre-fill for new vouchers and month-end defaulter carry-forwards.
                  </div>
                </div>
              )}

              {/* Default Due Date Policy */}
              {isDefaultDueDateModified && (
                <div className="pt-2 first:pt-0 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-teal-600" />
                      Default Voucher Due Date
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {defaultDueDateEnabled ? `Day ${defaultDueDay}th` : 'No default'}{' '}
                      &rarr;{' '}
                      <span className="text-teal-700 font-extrabold">
                        {selectedDefaultDueDateEnabled ? `Day ${selectedDefaultDueDay}th` : 'No default'}
                      </span>
                    </span>
                  </div>
                  <div className="p-2 bg-teal-50/80 border border-teal-200/70 rounded-lg text-[11px] text-teal-900 leading-relaxed">
                    <strong>Impact:</strong>{' '}
                    {selectedDefaultDueDateEnabled
                      ? `Pre-fills voucher due date to day ${selectedDefaultDueDay} of billing month in generator.`
                      : 'No default due date pre-fill in generator (left blank).'}
                  </div>
                </div>
              )}

              {/* Net Due Rounding Multiple */}
              {(selectedRoundingMultiple !== roundingMultiple || selectedRoundingEnabled !== roundingEnabled) && (
                <div className="pt-2 first:pt-0 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-indigo-600" />
                      Net Due Rounding
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {roundingEnabled && roundingMultiple > 1 ? `Nearest Rs. ${roundingMultiple}` : 'Exact (1)'}{' '}
                      &rarr;{' '}
                      <span className="text-indigo-700 font-extrabold">
                        {selectedRoundingMultiple > 1 ? `Nearest Rs. ${selectedRoundingMultiple}` : 'Exact (1)'}
                      </span>
                    </span>
                  </div>
                  <div className="p-2 bg-indigo-50/80 border border-indigo-200/70 rounded-lg text-[11px] text-indigo-900 leading-relaxed">
                    <strong>Impact:</strong>{' '}
                    {selectedRoundingMultiple <= 1
                      ? 'Net due rounding is turned OFF — new vouchers are billed at their exact amounts; late fines are not rounded.'
                      : `Voucher net due amounts round up to the nearest multiple of ${selectedRoundingMultiple}; late fines carried forward round the same way. Negative balances remain unrounded.`}
                  </div>
                </div>
              )}

              {/* Prior Month Rule */}
              {selectedPriorRule !== priorMonthRule && (
                <div className="pt-2 first:pt-0 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-teal-600" />
                      Prior Month Generation
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {priorMonthRule} &rarr; <span className="text-teal-700 font-extrabold">{selectedPriorRule}</span>
                    </span>
                  </div>
                  <div className="p-2 bg-amber-50/80 border border-amber-200/70 rounded-lg text-[11px] text-amber-900 leading-relaxed">
                    <strong>Impact:</strong>{' '}
                    {selectedPriorRule === 'strict' && 'Blocks generation for any month prior to student’s latest issued month.'}
                    {selectedPriorRule === 'warning' && 'Allows prior-month vouchers after warning; downstream figures remain static.'}
                    {selectedPriorRule === 'recalculate' && 'Auto-updates prior balances and recalculates net dues across subsequent vouchers.'}
                  </div>
                </div>
              )}

              {/* Skipped Month Rule */}
              {selectedSkippedRule !== skippedMonthRule && (
                <div className="pt-2 first:pt-0 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-teal-600" />
                      Skipped Month Generation
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {skippedMonthRule} &rarr; <span className="text-teal-700 font-extrabold">{selectedSkippedRule}</span>
                    </span>
                  </div>
                  <div className="p-2 bg-amber-50/80 border border-amber-200/70 rounded-lg text-[11px] text-amber-900 leading-relaxed">
                    <strong>Impact:</strong>{' '}
                    {selectedSkippedRule === 'strict' && 'Strictly blocks generation if any preceding month in billing history was skipped.'}
                    {selectedSkippedRule === 'warning' && 'Warns operators when skipping intermediate months before proceeding.'}
                    {selectedSkippedRule === 'allow' && 'Allows independent generation for any target month without gap checks.'}
                  </div>
                </div>
              )}

              {/* Voucher Deletion Policy */}
              {selectedDeletionResolution !== voucherDeletionResolution && (
                <div className="pt-2 first:pt-0 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      Voucher Deletion Policy
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {voucherDeletionResolution} &rarr; <span className="text-teal-700 font-extrabold">{selectedDeletionResolution}</span>
                    </span>
                  </div>
                  <div className="p-2 bg-rose-50/80 border border-rose-200/70 rounded-lg text-[11px] text-rose-900 leading-relaxed">
                    <strong>Impact:</strong>{' '}
                    {selectedDeletionResolution === 'cascade' && 'Deleting a prior voucher permanently deletes all newer subsequent vouchers.'}
                    {selectedDeletionResolution === 'auto-heal' && 'Deleting a voucher auto-heals subsequent vouchers and recalculates balances.'}
                    {selectedDeletionResolution === 'manual' && 'Deleting prior vouchers is blocked until newer vouchers are deleted in reverse order.'}
                  </div>
                </div>
              )}
            </div>

            {/* Compact Modal Footer */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPolicyConfirmModal(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-apply-policies"
                onClick={handleConfirmPolicyChanges}
                className="px-4 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[9999] animate-in slide-in-from-bottom-5 duration-200">
          <div className="px-4 py-3 rounded-xl shadow-xl border bg-slate-900 text-white border-slate-800 text-xs font-bold flex items-center gap-2.5 max-w-sm">
            <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="flex-1">{toastMessage}</span>
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
