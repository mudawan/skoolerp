import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  BankAccount,
  FeeTemplate,
  ParticularKind,
  PriorMonthVoucherRule,
  SkippedMonthVoucherRule,
  Student,
  User,
  UserRole,
  VoucherDeletionResolution,
} from '../types';
import { formatCurrency, formatMonthName } from '../utils/feeMath';
import { parseCsvLine, CSV_DELIMITERS_TEMPLATE } from '../utils/csv';
import { ConfirmModal } from './ConfirmModal';
import { DataCleanupView } from './DataCleanupView';
import { UserPermissionsModal } from './UserPermissionsModal';
import { AppearancePanel } from './settings/AppearancePanel';
import { ProfilePanel } from './settings/ProfilePanel';
import { PoliciesPanel } from './settings/PoliciesPanel';
import { BankAccountsPanel } from './settings/BankAccountsPanel';
import { UsersPanel } from './settings/UsersPanel';
import {
  ALL_PERMISSIONS,
  ROLE_PRESET_PERMISSIONS,
} from '../utils/permissions';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Building2,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
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
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    institute,
    updateInstitute,
    bankAccounts,
    addBankAccount,
    updateBankAccount,
    deleteBankAccount,
    templates,
    updateGlobalTemplatesList,
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
    users,
    addUser,
    updateUser,
    updateUserPermissions,
    deleteUser,
    currentUser,
    students,
    classes,
    activeMonth,
    setActiveMonth,
    beforeMonthChange,
    showToast,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'appearance' | 'policies' | 'banks' | 'templates' | 'users' | 'cleanup'>('profile');
  const [policyCategoryTab, setPolicyCategoryTab] = useState<'prior' | 'skipped' | 'deletion'>('prior');
  const [selectedPriorRule, setSelectedPriorRule] = useState<PriorMonthVoucherRule>(priorMonthRule);
  const [selectedSkippedRule, setSelectedSkippedRule] = useState<SkippedMonthVoucherRule>(skippedMonthRule);
  const [selectedDeletionResolution, setSelectedDeletionResolution] = useState<VoucherDeletionResolution>(voucherDeletionResolution);
  const [selectedLateFeeRate, setSelectedLateFeeRate] = useState<number>(defaultLateFeeRate);
  const [selectedRoundingMultiple, setSelectedRoundingMultiple] = useState<number>(roundingMultiple);
  const [selectedRoundingEnabled, setSelectedRoundingEnabled] = useState<boolean>(roundingEnabled);
  const [selectedDefaultDueDateEnabled, setSelectedDefaultDueDateEnabled] = useState<boolean>(defaultDueDateEnabled);
  const [selectedDefaultDueDay, setSelectedDefaultDueDay] = useState<number>(defaultDueDay);
  const [showPolicyConfirmModal, setShowPolicyConfirmModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
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
    isDefaultDueDateModified;

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
    setShowPolicyConfirmModal(false);
    setToastMessage('Fee Voucher Policies updated and activated successfully!');
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

  // Helper to initialize local roster values from global templates state
  const initializeRosterState = () => {
    const globalTpls = templates.filter((t) => !t.studentId && !t.classId);
    const items = STANDARD_ROSTER.map((item) => {
      const match = globalTpls.find((t) => t.kind === item.kind);
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

  const [rosterState, setRosterState] = useState(initializeRosterState);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sync roster state only when the GLOBAL template slice changes; class and
  // student override saves must never clobber unsaved global edits.
  const globalTemplatesKey = useMemo(
    () => JSON.stringify(templates.filter((t) => !t.studentId && !t.classId)),
    [templates]
  );
  const [globalBaselineKey, setGlobalBaselineKey] = useState('[]');
  React.useEffect(() => {
    const fresh = initializeRosterState();
    setRosterState(fresh);
    setGlobalBaselineKey(draftKeyOf(fresh));
  }, [globalTemplatesKey]);

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
      id: `tpl-${r.kind.toLowerCase()}-${idx + 1}`,
      kind: r.kind,
      label: r.label.trim() || STANDARD_ROSTER.find((sr) => sr.kind === r.kind)?.defaultLabel || r.kind,
      defaultAmount: allowNegativeAmount(r.kind) ? Number(r.defaultAmount) || 0 : Math.max(0, Number(r.defaultAmount) || 0),
      sortOrder: idx + 1,
    }));

    updateGlobalTemplatesList(updatedGlobalTemplates);
    setToastMessage('Fee Particulars roster order & labels saved successfully! All vouchers and PDF exports will follow this order.');
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSaveAllParticulars = (e: React.FormEvent) => {
    e.preventDefault();
    saveGlobalRoster();
  };

  // 3-Way Hierarchy Fee Template Overrides State: Global | Class | Student
  const [templateScopeMode, setTemplateScopeMode] = useState<'global' | 'class' | 'student'>('global');
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
          (t) => !t.studentId && t.classId === selectedClassId && (!t.month || t.month === activeMonth)
        )
      ),
    [templates, selectedClassId, activeMonth]
  );
  const studentTemplatesKey = useMemo(
    () =>
      JSON.stringify([
        templates.filter((t) => t.studentId === selectedStudentId && (!t.month || t.month === activeMonth)),
        selectedStudent
          ? templates.filter(
              (t) =>
                !t.studentId &&
                t.classId === selectedStudent.classId &&
                (!t.month || t.month === activeMonth)
            )
          : [],
      ]),
    [templates, selectedStudentId, selectedStudent, activeMonth]
  );
  const [classBaselineKey, setClassBaselineKey] = useState('[]');
  const [studentBaselineKey, setStudentBaselineKey] = useState('[]');
  const [rebuildNonce, setRebuildNonce] = useState(0);

  // Sync class roster state when selected class, templates, rosterState, or activeMonth changes
  useEffect(() => {
    if (!selectedClass) {
      setClassRosterState([]);
      setClassBaselineKey('[]');
      return;
    }

    const existingClassOverrides = templates.filter(
      (t) => !t.studentId && t.classId === selectedClass.id && (!t.month || t.month === activeMonth)
    );

    const items = rosterState.map((r) => {
      const override = existingClassOverrides.find((o) => o.kind === r.kind);
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
  }, [selectedClassId, selectedClass, classTemplatesKey, rosterState, activeMonth, rebuildNonce]);

  // Sync student roster state when selected student, templates, rosterState, or activeMonth changes
  useEffect(() => {
    if (!selectedStudent) {
      setStudentRosterState([]);
      setStudentBaselineKey('[]');
      return;
    }

    const existingStudentOverrides = templates.filter(
      (t) => t.studentId === selectedStudent.id && (!t.month || t.month === activeMonth)
    );
    const existingClassOverrides = templates.filter(
      (t) => !t.studentId && t.classId === selectedStudent.classId && (!t.month || t.month === activeMonth)
    );
    const sClass = classes.find((c) => c.id === selectedStudent.classId);

    const items = rosterState.map((r) => {
      const studentOverride = existingStudentOverrides.find((o) => o.kind === r.kind);
      const classOverride = existingClassOverrides.find((o) => o.kind === r.kind);
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
  }, [selectedStudentId, studentTemplatesKey, rosterState, activeMonth, classes, selectedStudent, rebuildNonce]);

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
        defaultAmount: allowNegativeAmount(item.kind) ? Number(item.defaultAmount) || 0 : Math.max(0, Number(item.defaultAmount) || 0),
        sortOrder: globalItem?.sortOrder || idx + 1,
      };
    });

    saveClassTemplateOverrides(selectedClassId, activeMonth, itemsToSave);
    setToastMessage(
      `Class-level fee template for ${selectedClass.name} saved for ${formatMonthName(activeMonth)}! This overrides global template for all students in ${selectedClass.name}.`
    );
  };

  const handleSaveClassOverrides = (e: React.FormEvent) => {
    e.preventDefault();
    saveClassRoster();
  };

  const handleClearClassOverrides = (classIdToClear: string) => {
    const classObj = classes.find((c) => c.id === classIdToClear);
    deleteClassTemplates(classIdToClear, activeMonth);
    setToastMessage(
      `Class-level template overrides cleared for ${classObj?.name || 'Class'}. Reverted to Global Default template for ${formatMonthName(activeMonth)}.`
    );
  };

  const saveStudentRoster = () => {
    if (!selectedStudentId || !selectedStudent) return;

    const itemsToSave = studentRosterState.map((item, idx) => {
      const globalItem = rosterState.find((r) => r.kind === item.kind);
      return {
        kind: item.kind,
        label: item.label.trim() || globalItem?.label || item.kind,
        defaultAmount: allowNegativeAmount(item.kind) ? Number(item.defaultAmount) || 0 : Math.max(0, Number(item.defaultAmount) || 0),
        sortOrder: globalItem?.sortOrder || idx + 1,
      };
    });

    saveStudentTemplateOverrides(selectedStudentId, activeMonth, itemsToSave);
    setToastMessage(
      `Student-specific fee template for ${selectedStudent.name} (${selectedStudent.regNo}) saved for ${formatMonthName(activeMonth)}! All vouchers & PDF printouts for this month will reflect these individual overrides.`
    );
  };

  const handleSaveStudentOverrides = (e: React.FormEvent) => {
    e.preventDefault();
    saveStudentRoster();
  };

  const handleClearStudentOverrides = (studentIdToClear: string) => {
    const studentObj = students.find((s) => s.id === studentIdToClear);
    deleteStudentTemplates(studentIdToClear, activeMonth);
    setToastMessage(
      `Custom individual overrides cleared for ${studentObj?.name || 'student'}${studentObj ? ` (${studentObj.regNo})` : ''}. Reverted to class/global fee template for ${formatMonthName(activeMonth)}.`
    );
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
        : `Student Override tier (${selectedStudent?.name || selectedStudent?.regNo || ''})`;

  const discardDirtyDrafts = () => {
    if (templateScopeMode === 'global') {
      const fresh = initializeRosterState();
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
    | { kind: 'month'; label: string; apply: () => void };

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
    resetAllTemplates(activeMonth);
    setRosterState(initializeRosterState());
    setShowResetAllModal(false);
    setToastMessage(
      `Global fee templates reset to system defaults and all student-specific template overrides deleted for ${formatMonthName(activeMonth)}!`
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

  // List of all classes with active custom overrides for activeMonth (Flex 1-4 and Fine)
  const activeClassOverridesList = useMemo(() => {
    const classIds = Array.from(
      new Set(
        templates
          .filter((t) => !t.studentId && !!t.classId && (!t.month || t.month === activeMonth))
          .map((t) => t.classId!)
      )
    );
    return classIds
      .map((cId) => {
        const cls = classes.find((c) => c.id === cId);
        const cOverrides = templates.filter(
          (t) =>
            !t.studentId &&
            t.classId === cId &&
            (!t.month || t.month === activeMonth) &&
            ['Flex1', 'Flex2', 'Flex3', 'Flex4', 'Fine'].includes(t.kind)
        );
        return {
          classObj: cls,
          classId: cId,
          className: cls?.name || 'Unknown Class',
          overrides: cOverrides,
        };
      })
      .filter((item) => !!item.classObj && item.overrides.length > 0);
  }, [templates, activeMonth, classes]);

  // List of all students with active custom overrides for activeMonth (Flex 1-4 and Fine)
  const activeStudentOverridesList = useMemo(() => {
    const studentIds = Array.from(
      new Set(
        templates
          .filter((t) => !!t.studentId && (!t.month || t.month === activeMonth))
          .map((t) => t.studentId!)
      )
    );
    return studentIds
      .map((sId) => {
        const std = students.find((s) => s.id === sId);
        const sOverrides = templates.filter(
          (t) =>
            t.studentId === sId &&
            (!t.month || t.month === activeMonth) &&
            ['Flex1', 'Flex2', 'Flex3', 'Flex4', 'Fine'].includes(t.kind)
        );
        const sClass = std ? classes.find((c) => c.id === std.classId) : null;
        return {
          student: std,
          studentId: sId,
          className: sClass?.name || 'Unassigned',
          overrides: sOverrides,
        };
      })
      .filter((item) => !!item.student && item.overrides.length > 0);
  }, [templates, activeMonth, students, classes]);

  // Bulk selection state for active student overrides list
  const [selectedOverrideIds, setSelectedOverrideIds] = useState<string[]>([]);

  // Clear bulk selection when activeMonth changes
  useEffect(() => {
    setSelectedOverrideIds([]);
  }, [activeMonth]);

  const handleToggleSelectAllOverrides = () => {
    if (
      selectedOverrideIds.length === activeStudentOverridesList.length &&
      activeStudentOverridesList.length > 0
    ) {
      setSelectedOverrideIds([]);
    } else {
      setSelectedOverrideIds(activeStudentOverridesList.map((item) => item.studentId));
    }
  };

  const handleToggleSelectOverride = (studentId: string) => {
    setSelectedOverrideIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const handleBulkDeleteOverrides = () => {
    if (selectedOverrideIds.length === 0) return;
    selectedOverrideIds.forEach((sId) => {
      deleteStudentTemplates(sId, activeMonth);
    });
    setToastMessage(
      `Custom fee template overrides deleted for ${selectedOverrideIds.length} student${
        selectedOverrideIds.length === 1 ? '' : 's'
      } for ${formatMonthName(activeMonth)}.`
    );
    setSelectedOverrideIds([]);
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
      const sTemplates = templates.filter(
        (t) => t.studentId === s.id && (!t.month || t.month === activeMonth)
      );
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
    link.setAttribute('download', `fee_template_overrides_${activeMonth}.csv`);
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
      const existingOtherOverrides = templates.filter(
        (t) =>
          t.studentId === student.id &&
          (!t.month || t.month === activeMonth) &&
          !['Fine', 'Flex1', 'Flex2', 'Flex3', 'Flex4'].includes(t.kind)
      );

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

    bulkSaveMultipleStudentTemplateOverrides(entriesToSave, activeMonth);

    setToastMessage(
      `Successfully imported custom fee template overrides for ${validRows.length} student${
        validRows.length === 1 ? '' : 's'
      } for ${formatMonthName(activeMonth)}!`
    );

    setShowCsvModal(false);
    setParsedCsvRows([]);
    setIsParsedPreviewExpanded(false);
    setCsvFileName('');
    setCsvParseError(null);
  };

  // User Management State
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

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
      setEditingUser(null);
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

  const [userFormData, setUserFormData] = useState<{
    username: string;
    password?: string;
    name: string;
    role: UserRole;
    email?: string;
    permissions: string[];
  }>({
    username: '',
    password: '',
    name: '',
    role: 'Accountant',
    email: '',
    permissions: [...ROLE_PRESET_PERMISSIONS.Accountant],
  });

  const [permissionsUser, setPermissionsUser] = useState<User | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState<boolean>(false);

  const handleOpenPermissionsModal = (user: User) => {
    setPermissionsUser(user);
    setShowPermissionsModal(true);
  };

  const handleSavePermissions = async (userId: string, permissions: string[], role: UserRole) => {
    const res = await updateUserPermissions(userId, permissions, role);
    if (!res.success) {
      showToast(res.error || 'Failed to update user permissions.', 'error');
      throw new Error(res.error);
    }
    const targetUser = users.find((u) => u.id === userId);
    showToast(`Permissions for @${targetUser?.username || 'user'} updated successfully!`, 'success');
  };

  const handleOpenUserModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUserFormData({
        username: user.username,
        password: '',
        name: user.name,
        role: user.role,
        email: user.email || '',
        permissions:
          Array.isArray(user.permissions) && user.permissions.length > 0
            ? [...user.permissions]
            : [...(ROLE_PRESET_PERMISSIONS[user.role] || ROLE_PRESET_PERMISSIONS.Viewer)],
      });
    } else {
      setEditingUser(null);
      setUserFormData({
        username: '',
        password: '',
        name: '',
        role: 'Accountant',
        email: '',
        permissions: [...ROLE_PRESET_PERMISSIONS.Accountant],
      });
    }
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.username.trim()) {
      showToast('Username is required.', 'warning');
      return;
    }

    if (editingUser) {
      const updates: Partial<User> = {
        username: userFormData.username.trim(),
        name: userFormData.name.trim() || userFormData.username.trim(),
        role: userFormData.role,
        email: userFormData.email?.trim() || undefined,
        permissions: userFormData.permissions,
      };
      if (userFormData.password?.trim()) {
        updates.password = userFormData.password.trim();
      }
      const res = await updateUser(editingUser.id, updates);
      if (!res.success) {
        showToast(res.error || 'Failed to update user.', 'error');
        return;
      }
      showToast(`Operator @${userFormData.username} updated successfully!`, 'success');
    } else {
      const plainPassword = userFormData.password?.trim() || '';
      if (plainPassword.length < 6) {
        showToast('Password is required (minimum 6 characters).', 'warning');
        return;
      }
      const res = await addUser({
        username: userFormData.username.trim(),
        password: plainPassword,
        name: userFormData.name.trim() || userFormData.username.trim(),
        role: userFormData.role,
        email: userFormData.email?.trim() || undefined,
        permissions: userFormData.permissions,
      });
      if (!res.success) {
        showToast(res.error || 'Failed to create user.', 'error');
        return;
      }
      showToast(`Operator @${userFormData.username} added successfully!`, 'success');
    }

    setShowUserModal(false);
  };

  const handleDeleteUser = (id: string, name: string) => {
    setUserToDelete({ id, name });
  };

  const handleConfirmDeleteUser = () => {
    if (!userToDelete) return;
    const res = deleteUser(userToDelete.id);
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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-teal-600" />
            System & Administrative Settings
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage institute profile, active default bank accounts for voucher printing, and fee particular templates.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl flex-wrap">
          <button
            onClick={() => setActiveSubTab('profile')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'profile' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-teal-600" />
            <span>Institute Profile</span>
          </button>
          <button
            id="settings-tab-appearance"
            onClick={() => setActiveSubTab('appearance')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'appearance' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-teal-600" />
            <span>Appearance & Themes</span>
          </button>
          <button
            onClick={() => setActiveSubTab('policies')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'policies' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-teal-600" />
            <span>Voucher Policies</span>
          </button>
          <button
            onClick={() => setActiveSubTab('banks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'banks' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-teal-600" />
            <span>Bank Accounts</span>
          </button>
          <button
            onClick={() => setActiveSubTab('templates')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'templates' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" />
            <span>Fee Templates</span>
          </button>
          {(currentUser?.role === 'Admin' || hasPermission('users.manage') || hasPermission('settings.manage')) && (
            <button
              id="settings-tab-users"
              onClick={() => setActiveSubTab('users')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'users' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-teal-600" />
              <span>Users & Auth</span>
            </button>
          )}
          {(currentUser?.role === 'Admin' || hasPermission('settings.manage')) && (
            <button
              id="settings-tab-cleanup"
              onClick={() => setActiveSubTab('cleanup')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'cleanup'
                  ? 'bg-rose-50 text-rose-800 shadow-2xs border border-rose-200'
                  : 'text-slate-600 hover:text-rose-700'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-rose-600" />
              <span>Data Cleanup</span>
            </button>
          )}
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
          {/* 3-Tier Fee Template Scope Switcher */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-teal-600 shrink-0" />
                  <h3 className="font-bold text-slate-900 text-sm">
                    3-Tier Fee Template Hierarchy
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                    Billing Month: {formatMonthName(activeMonth)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Lookup precedence: <strong className="text-teal-700">1. Student Individual Override</strong> &gt; <strong className="text-indigo-700">2. Class-Level Override</strong> &gt; <strong className="text-slate-700">3. Global Default</strong>.
                </p>
              </div>

              {/* Scope Segmented Control */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1 shrink-0 self-start md:self-auto border border-slate-200/70">
                <button
                  type="button"
                  id="tab-scope-global"
                  onClick={() =>
                    requestTransition({
                      kind: 'scope',
                      label: scopeLabel,
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
                  1. Global Default
                </button>
                <button
                  type="button"
                  id="tab-scope-class"
                  onClick={() =>
                    requestTransition({
                      kind: 'scope',
                      label: scopeLabel,
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
                    templateScopeMode === 'class' || (selectedClassId && !selectedStudentId)
                      ? 'bg-white text-indigo-950 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                  2. Class Override
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
                      label: scopeLabel,
                      apply: () => {
                        setTemplateScopeMode('student');
                        setSelectedClassId('');
                      },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    templateScopeMode === 'student' || selectedStudentId
                      ? 'bg-white text-teal-950 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5 text-teal-600" />
                  3. Student Override
                  {activeStudentOverridesList.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-teal-100 text-teal-800 font-extrabold">
                      {activeStudentOverridesList.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Scope Specific Selector & Quick Tools Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
              <div className="flex-1 min-w-0">
                {selectedStudent ? (
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Student Individual Fee Template • {selectedStudent.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure custom fee particulars and rates for {selectedStudent.name} ({selectedStudent.regNo} - {selectedStudentClass?.name || 'Class'}) in {formatMonthName(activeMonth)}. Overrides both Class and Global templates.
                    </p>
                  </div>
                ) : selectedClass ? (
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-indigo-600" />
                      Class Fee Template Override • {selectedClass.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure default fee particulars for all students enrolled in <strong>{selectedClass.name}</strong> for {formatMonthName(activeMonth)}. Overrides Global defaults for this class unless a student has an individual override.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Global Fee Particulars & Base Line Items
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Standardized fee roster applied to all students across vouchers and exports whenever class or student overrides are not specified. Drag ⠿ to reorder.
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
                            (t) => !t.studentId && t.classId === c.id && (!t.month || t.month === activeMonth)
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
                              (t) => t.studentId === std.id && (!t.month || t.month === activeMonth)
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
          </div>

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
                    (t) => t.studentId === selectedStudent.id && (!t.month || t.month === activeMonth)
                  ) ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Individual Overrides Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-200/80 text-slate-700 border border-slate-300">
                      Inheriting {templates.some((t) => !t.studentId && t.classId === selectedStudent.classId && (!t.month || t.month === activeMonth)) ? 'Class Overrides' : 'Global Template'}
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
                    (t) => !t.studentId && t.classId === selectedClass.id && (!t.month || t.month === activeMonth)
                  ) ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Class Overrides Active
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
              <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">
                  {selectedStudent
                    ? `💡 Fee Particulars Customization for ${selectedStudent.name} (${selectedStudent.regNo}) (${formatMonthName(activeMonth)}). Overrides class & global template.`
                    : selectedClass
                    ? `💡 Fee Particulars Customization for Class ${selectedClass.name} (${formatMonthName(activeMonth)}). Overrides global defaults for all students in this class.`
                    : '💡 Drag rows by the handle (⠿) to reorder line items. PDF and voucher printouts will follow this exact order.'}
                </span>
                {(selectedStudent || selectedClass) && (
                  <span className="text-[11px] text-teal-700 font-bold bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                    Month: {formatMonthName(activeMonth)}
                  </span>
                )}
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
                        onClick={() => handleClearStudentOverrides(selectedStudent.id)}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Revert to Class / Global Template
                      </button>

                      <button
                        type="submit"
                        id="btn-save-student-overrides"
                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        Save Overrides for {selectedStudent.name} ({selectedStudent.regNo})
                      </button>
                    </>
                  ) : selectedClass ? (
                    <>
                      <button
                        type="button"
                        id="btn-revert-class-overrides"
                        onClick={() => handleClearClassOverrides(selectedClass.id)}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Revert Class to Global Template
                      </button>

                      <button
                        type="submit"
                        id="btn-save-class-overrides"
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        Save Overrides for Class {selectedClass.name}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-slate-500">
                        Changes here update the standard global template for all students across classes.
                      </span>
                      <button
                        type="submit"
                        id="btn-save-fee-particulars"
                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        Save Global Fee Particulars Configuration
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </form>

          {/* Active Class Overrides Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  Active Class-Level Overrides in {formatMonthName(activeMonth)}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Classes configured with custom particulars (Fine & Flex 1–4) for this billing month.
                </p>
              </div>
              <span className="text-slate-600 font-bold text-xs bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                {activeClassOverridesList.length} class{activeClassOverridesList.length === 1 ? '' : 'es'} configured
              </span>
            </div>

            {activeClassOverridesList.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="p-3">Class Name</th>
                        <th className="p-3">Base Fee</th>
                        <th className="p-3">Overridden Particulars (Fine & Flex 1–4)</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeClassOverridesList.map((item) => (
                        <tr key={item.classId} className="hover:bg-indigo-50/40 transition">
                          <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                            {item.className}
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
                                  onClick={() => handleClearClassOverrides(item.classId)}
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
                No class-specific fee particulars overrides configured for {formatMonthName(activeMonth)}. All classes inherit global defaults.
              </div>
            )}
          </div>

          {/* Active Student Overrides Table in Working Month */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  Active Student Overrides in {formatMonthName(activeMonth)}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Students configured with custom fine and Flex 1–4 particulars overrides for this billing month.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                {selectedOverrideIds.length > 0 && hasPermission('settings.manage') && (
                  <button
                    type="button"
                    onClick={handleBulkDeleteOverrides}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Selected ({selectedOverrideIds.length})
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
                  {activeStudentOverridesList.length} student{activeStudentOverridesList.length === 1 ? '' : 's'} configured
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
                                selectedOverrideIds.length === activeStudentOverridesList.length
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
                        <th className="p-3">Overridden Particulars (Fine & Flex 1–4)</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeStudentOverridesList.map((item) => {
                        const isSelected = selectedOverrideIds.includes(item.studentId);
                        return (
                          <tr
                            key={item.studentId}
                            className={`transition ${isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50/70'}`}
                          >
                            {hasPermission('settings.manage') && (
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectOverride(item.studentId)}
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
                                    onClick={() => handleClearStudentOverrides(item.studentId)}
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
                No student-specific Flex 1–4 template overrides configured for {formatMonthName(activeMonth)}. All students are currently using global fee particulars.
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'users' &&
        (currentUser?.role === 'Admin' || hasPermission('users.manage') || hasPermission('settings.manage')) && (
          <UsersPanel
            handleOpenUserModal={handleOpenUserModal}
            handleOpenPermissionsModal={handleOpenPermissionsModal}
            handleDeleteUser={handleDeleteUser}
          />
        )}

      {/* Subtab 6: Selection-Based Database Cleanup & Table Reset */}
      {activeSubTab === 'cleanup' && <DataCleanupView />}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingUser ? `Edit User: @${editingUser.username}` : 'Add New System User'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Username (Login ID) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. accountant_lahore"
                  value={userFormData.username}
                  onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Muhammad Kashif"
                  value={userFormData.name}
                  onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. kashif@skooleracademy.edu.pk"
                  value={userFormData.email || ''}
                  onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {editingUser ? 'New Password (leave empty to keep current)' : 'Password *'}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder={editingUser ? 'Leave blank to preserve current password' : 'Min 6 characters'}
                    required={!editingUser}
                    value={userFormData.password || ''}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Assigned Role Preset *</label>
                <select
                  value={userFormData.role}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    const presetPerms =
                      ROLE_PRESET_PERMISSIONS[nextRole] || userFormData.permissions;
                    setUserFormData({
                      ...userFormData,
                      role: nextRole,
                      permissions: nextRole === 'Custom' ? userFormData.permissions : [...presetPerms],
                    });
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="Admin">Admin (Full System & Policy Access)</option>
                  <option value="Accountant">Accountant (Fee Invoicing & Collections)</option>
                  <option value="Viewer">Viewer (Read-Only Financial Auditing)</option>
                  <option value="Custom">Custom (Granular Permissions)</option>
                </select>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-teal-600" />
                    <span>Granular Permissions:</span>
                    <span className="font-mono text-teal-700 font-bold">
                      {userFormData.permissions.length} of {ALL_PERMISSIONS.length} active
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {userFormData.role === 'Admin'
                      ? 'Full system privileges across all modules'
                      : userFormData.role === 'Accountant'
                      ? 'Standard operations, billing, and collections'
                      : userFormData.role === 'Viewer'
                      ? 'Read-only financial audits and reports'
                      : 'Customized module security access'}
                  </p>
                </div>

                {editingUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserModal(false);
                      handleOpenPermissionsModal(editingUser);
                    }}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-teal-700 font-bold text-xs rounded-lg shadow-2xs transition shrink-0 cursor-pointer"
                  >
                    Open Matrix
                  </button>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Granular Permission Matrix Modal */}
      {showPermissionsModal && permissionsUser && (
        <UserPermissionsModal
          isOpen={showPermissionsModal}
          user={permissionsUser}
          onClose={() => {
            setShowPermissionsModal(false);
            setPermissionsUser(null);
          }}
          onSave={handleSavePermissions}
        />
      )}

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
                  placeholder="e.g. Meezan Bank Limited"
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
                  placeholder="e.g. Skooler Model Academy Fee Account"
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
                  placeholder="0102 (F-7 Markaz Branch)"
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
                  : `Import Fee Template Overrides (${formatMonthName(activeMonth)})`}
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
                  Upload a CSV file with student fee template overrides for <strong>{formatMonthName(activeMonth)} ({activeMonth})</strong>. First row must contain column headers.
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
                      <span className="font-bold text-teal-800 text-sm">{formatMonthName(activeMonth)}</span>
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
                  <p className="text-xs text-slate-500">Working Month: {formatMonthName(activeMonth)}</p>
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
                <li>Delete all <strong>student-specific fee template overrides</strong> for <strong>{formatMonthName(activeMonth)} ({activeMonth})</strong>.</li>
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
