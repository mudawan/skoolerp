import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { normalizePaymentMode, PAYMENT_MODES, DEFAULT_PAYMENT_MODE } from '../utils/paymentMode';
import { pendingDocumentNumber } from '../utils/sequence';
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '../utils/passwords';
import {
  AppThemeConfig,
  AuditActionType,
  AuditLogEntry,
  BankAccount,
  CleanupResult,
  DataCleanupOptions,
  Family,
  FeeCollection,
  FeeTemplate,
  FeeVoucher,
  InstituteProfile,
  MonthClosureStatus,
  ParticularKind,
  PaymentTransaction,
  PriorMonthVoucherRule,
  SchoolClass,
  SkippedMonthVoucherRule,
  Student,
  StudentAccountHistoryEntry,
  StudentStatus,
  TransportAssignment,
  TransportBus,
  TransportStop,
  User,
  UserRole,
  Institution,
  OperatorInvite,
  VoucherCopyType,
  VoucherDeletionResolution,
  VoucherItem,
  VoucherStatus,
} from '../types';
import { DEFAULT_THEME_CONFIG, applyThemeToDom } from '../utils/themeConfig';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_BUSES,
  INITIAL_CLASSES,
  INITIAL_COLLECTIONS,
  INITIAL_FAMILIES,
  INITIAL_GLOBAL_TEMPLATES,
  createDefaultGlobalTemplates,
  INITIAL_INSTITUTE,
  INITIAL_STOPS,
  INITIAL_STUDENT_ACCOUNT_HISTORY,
  INITIAL_STUDENTS,
  INITIAL_TRANSACTIONS,
  INITIAL_VOUCHERS,
  SEEDED_USERS,
} from '../data/seedData';
import {
  isPermissionAllowed,
  ROLE_PRESET_PERMISSIONS,
  getEffectiveRole,
} from '../utils/permissions';
import {
  calculateStudentVoucherPreview,
  formatMonthName,
  getCurrentMonthString,
  getDaysInMonth,
  getEffectiveMultiple,
  getNextMonthString,
  getPreviousMonthString,
  roundUpToMultiple,
  VoucherPreviewCalculation,
  normalizeDateToISO,
  normalizeCnic,
} from '../utils/feeMath';
import { reconcileFamiliesAndStudents } from '../utils/familyReconcile';
import {
  queueDatabaseSync,
  fetchServerState,
  initLiveRealtimeSync,
  subscribeRemoteChanges,
  setActiveInstitutionId,
  apiRegisterInstitution,
  apiRegisterUser,
  apiLogin,
  apiLogout,
  apiGetMe,
  apiCreateInvite,
  apiListInvites,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
  apiDeleteInstitution,
  apiGenerateVouchers,
  apiReceiveCollection,
  apiGetPreferences,
  apiSavePreferences,
  apiCarryForwardVoucher,
  apiVoucherBatchUpdate,
  syncSimpleEntityCollectionNow,
  subscribeSyncFailures,
  initializeSyncSnapshots,
  resetSyncSnapshots,
  checkMutationAllowed,
  subscribeDbStatus,
  apiUpdateInstituteSettings,
} from '../services/apiSync';

export interface DownstreamConflict {
  voucher: FeeVoucher;
  student: Student;
  downstreamVouchers: FeeVoucher[];
  hasTransactions: boolean;
  txnCount: number;
}

interface AppContextType {
  // Database Connectivity State
  isDbConnected: boolean;
  checkMutationAllowed: () => { allowed: boolean; error?: string };

  // Multi-Tenant & Auth
  currentInstitution: Institution | null;
  currentUser: User;
  isAuthenticated: boolean;
  isSessionLoading: boolean;
  users: User[];
  invites: OperatorInvite[];
  registerInstitution: (params: {
    schoolName: string;
    schoolCode?: string;
    currency?: string;
    address?: string;
    phone?: string;
    email?: string;
    regNo?: string;
    adminName: string;
    adminUsername: string;
    adminEmail?: string;
    adminPassword: string;
  }) => Promise<{ success: boolean; error?: string }>;
  joinInstitution: (params: {
    code: string;
    fullName: string;
    username: string;
    password: string;
    email?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  createInvite: (params: {
    fullName: string;
    assignedRole: UserRole;
    permissions?: string[];
  }) => Promise<{ success: boolean; invite?: OperatorInvite; error?: string }>;
  refreshInvites: () => Promise<void>;
  login: (usernameOrEmail: string, password: string, institutionCode?: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  addUser: (userData: Omit<User, 'id'>) => Promise<{ success: boolean; error?: string; credentialsSummary?: { username: string; password?: string; institutionCode?: string; role: string } }>;
  updateUser: (id: string, updates: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  updateUserPermissions: (id: string, permissions: string[], role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteInstitutionAndData: (confirmationText: string) => Promise<{ success: boolean; error?: string }>;

  // Active Month
  activeMonth: string;
  setActiveMonth: (month: string) => void;
  beforeMonthChange: { current: ((nextMonth: string) => boolean) | null };

  // Classes
  classes: SchoolClass[];
  addClass: (name: string, monthlyFee: number, sortOrder: number) => { success: boolean; error?: string; newClass?: SchoolClass };
  updateClass: (id: string, updates: Partial<SchoolClass>) => { success: boolean; error?: string };
  deleteClass: (id: string) => { success: boolean; error?: string };
  toggleClassActive: (id: string) => { success: boolean; error?: string };
  reorderClasses: (reorderedClasses: SchoolClass[]) => { success: boolean; error?: string };

  // Students
  students: Student[];
  addStudent: (student: Omit<Student, 'id' | 'studentNo' | 'regNo' | 'createdDate'> & { regNo?: string; studentNo?: string }) => {
    success: boolean;
    student?: Student;
    error?: string;
  };
  updateStudent: (id: string, updates: Partial<Student>) => { success: boolean; error?: string };
  deleteStudent: (id: string) => { success: boolean; error?: string };
  bulkDeleteStudents: (ids: string[]) => { deletedCount: number; skippedIds: string[] };

  // Families
  families: Family[];
  addFamily: (family: Omit<Family, 'id' | 'familyNo'>) => { success: boolean; family?: Family; error?: string };
  updateFamily: (id: string, updates: Partial<Family>) => { success: boolean; error?: string };
  deleteFamily: (id: string) => { success: boolean; error?: string };
  addStudentToFamily: (familyId: string, studentId: string) => void;
  removeStudentFromFamily: (familyId: string, studentId: string) => void;

  // Transport
  buses: TransportBus[];
  stops: TransportStop[];
  transportAssignments: TransportAssignment[];
  addBus: (bus: Omit<TransportBus, 'id'>) => { success: boolean; error?: string };
  updateBus: (id: string, updates: Partial<TransportBus>) => { success: boolean; error?: string };
  deleteBus: (id: string) => { success: boolean; error?: string };
  reorderBuses: (reorderedBuses: TransportBus[]) => { success: boolean; error?: string };
  addStop: (stop: Omit<TransportStop, 'id'>) => { success: boolean; error?: string };
  updateStop: (id: string, updates: Partial<TransportStop>) => { success: boolean; error?: string };
  deleteStop: (id: string) => { success: boolean; error?: string };
  reorderStops: (reorderedStops: TransportStop[]) => { success: boolean; error?: string };
  bulkSaveTransportStops: (
    stopsList: Array<Omit<TransportStop, 'id'> & { id?: string }>
  ) => { success: boolean; count: number; addedCount: number; updatedCount: number };
  saveTransportAssignment: (
    assignment: Omit<TransportAssignment, 'id'> & { id?: string }
  ) => { success: boolean; error?: string };
  bulkSaveTransportAssignments: (
    assignments: Array<Omit<TransportAssignment, 'id'> & { id?: string }>
  ) => { success: boolean; count: number };
  deleteTransportAssignment: (id: string) => void;
  copyTransportAssignmentsFromPreviousMonth: (
    targetMonth: string,
    daysChargedOverride?: number
  ) => { success: boolean; copiedCount: number; skippedCount: number; inactiveSkippedCount: number; error?: string };
  bulkUpdateTransportDaysForMonth: (
    targetMonth: string,
    daysCharged: number
  ) => { success: boolean; updatedCount: number };

  // Fee Particular Templates
  templates: FeeTemplate[];
  saveGlobalTemplate: (template: Omit<FeeTemplate, 'id'>, month?: string) => void;
  updateGlobalTemplatesList: (newTemplates: FeeTemplate[], month?: string) => void;
  deleteGlobalTemplates: (month?: string) => void;
  saveClassTemplateOverrides: (
    classId: string,
    month: string,
    items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>
  ) => void;
  deleteClassTemplates: (classId: string, month?: string) => void;
  saveStudentTemplateOverride: (
    studentId: string,
    kind: ParticularKind,
    label: string,
    amount: number,
    month?: string
  ) => void;
  saveStudentTemplateOverrides: (
    studentId: string,
    month: string,
    items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>
  ) => void;
  bulkSaveMultipleStudentTemplateOverrides: (
    entries: Array<{
      studentId: string;
      items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>;
    }>,
    month: string
  ) => void;
  deleteStudentTemplates: (studentId: string, month?: string) => void;
  resetAllTemplates: (month?: string) => void;
  deleteTemplate: (id: string) => void;

  // Fee Vouchers & Generation
  vouchers: FeeVoucher[];
  previewVoucherGeneration: (
    month: string,
    scope: 'all' | 'class' | 'students',
    classId?: string,
    selectedStudentIds?: string[]
  ) => { previews: VoucherPreviewCalculation[]; monthClosureBlocked: boolean; closureMessage?: string };
  commitVoucherGeneration: (
    month: string,
    scope: 'all' | 'class' | 'students',
    classId?: string,
    selectedStudentIds?: string[],
    dueDate?: string,
    lateFeeRate?: number
  ) => { success: boolean; generatedCount: number; error?: string };
  generateAdmissionVoucher: (
    studentId: string,
    month: string,
    options?: {
      dueDate?: string;
      lateFeeRate?: number;
      notes?: string;
      items?: { kind: ParticularKind; label: string; amount: number }[];
    }
  ) => { success: boolean; voucher?: FeeVoucher; error?: string };
  collectVoucherPayment: (
    voucherId: string,
    amount: number,
    paymentMode: PaymentTransaction['paymentMode'],
    referenceNo?: string,
    notes?: string,
    date?: string,
    updatedParticulars?: VoucherItem[]
  ) => { success: boolean; transaction?: PaymentTransaction; error?: string };
  updateVoucherParticulars: (
    voucherId: string,
    updatedParticulars: VoucherItem[]
  ) => { success: boolean; voucher?: FeeVoucher; error?: string };
  bulkCsvCollection: (
    rows: {
      regNo?: string;
      identifier?: string;
      studentId?: string;
      voucherId?: string;
      amount: number;
      fine?: number;
      paymentMode?: string;
      refNo?: string;
      date?: string;
    }[],
    month: string,
    date?: string
  ) => { success: boolean; successCount: number; errors: string[] };
  carryForwardDefaulter: (
    voucherId: string,
    targetMonth: string,
    addLateFine: boolean,
    customFineAmount?: number
  ) => { success: boolean; error?: string };
  bulkCarryForwardDefaulters: (
    voucherIds: string[],
    targetMonth: string,
    addLateFine: boolean,
    customFineAmount?: number,
    perVoucherFines?: Record<string, number>
  ) => { success: boolean; successCount: number; errors: string[] };
  undoCarryForwardVoucher: (voucherId: string) => { success: boolean; error?: string };
  defaultLateFeeRate: number;
  setDefaultLateFeeRate: (rate: number) => void;
  roundingMultiple: number;
  setRoundingMultiple: (multiple: number) => void;
  roundingEnabled: boolean;
  setRoundingEnabled: (enabled: boolean) => void;
  transportRoundingMultiple: number;
  setTransportRoundingMultiple: (multiple: number) => void;
  defaultDueDateEnabled: boolean;
  defaultDueDay: number;
  setDefaultDueDateSettings: (settings: {
    enabled: boolean;
    day?: number;
  }) => void;
  getComputedDefaultDueDate: (month: string) => string;
  voucherCopyOrder: VoucherCopyType[];
  setVoucherCopyOrder: (order: VoucherCopyType[]) => void;
  voucherDefaultCopies: VoucherCopyType[];
  setVoucherDefaultCopies: (copies: VoucherCopyType[]) => void;
  getDownstreamVouchersInfo: (ids: string[]) => {
    hasDownstream: boolean;
    conflicts: DownstreamConflict[];
    totalDownstreamCount: number;
  };
  deleteVoucher: (
    id: string,
    force?: boolean,
    mode?: VoucherDeletionResolution
  ) => { success: boolean; error?: string; hasTxns?: boolean; deletedCount?: number; transactionCount?: number };
  bulkDeleteVouchers: (
    ids: string[],
    force?: boolean,
    mode?: VoucherDeletionResolution
  ) => { success: boolean; deletedCount: number; error?: string; hasTxns?: boolean; transactionCount?: number };

  // Collections & Transactions
  collections: FeeCollection[];
  transactions: PaymentTransaction[];
  deleteCollection: (id: string) => void;

  // UI Preferences & Themes
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  themeConfig: AppThemeConfig;
  updateThemeConfig: (updates: Partial<AppThemeConfig>) => void;
  resetThemeConfig: () => void;

  // Settings & Policy
  priorMonthRule: PriorMonthVoucherRule;
  setPriorMonthRule: (rule: PriorMonthVoucherRule) => void;
  skippedMonthRule: SkippedMonthVoucherRule;
  setSkippedMonthRule: (rule: SkippedMonthVoucherRule) => void;
  voucherDeletionResolution: VoucherDeletionResolution;
  setVoucherDeletionResolution: (policy: VoucherDeletionResolution) => void;
  institute: InstituteProfile;
  updateInstitute: (updates: Partial<InstituteProfile>) => void;
  sessionTimeoutMinutes: number;
  setSessionTimeoutMinutes: (minutes: number) => void;
  bankAccounts: BankAccount[];
  addBankAccount: (bank: Omit<BankAccount, 'id'>) => void;
  updateBankAccount: (id: string, updates: Partial<BankAccount>) => void;
  deleteBankAccount: (id: string) => void;
  setDefaultBankAccount: (id: string) => void;

  // Month Closure Check Helper & Lock Management
  getMonthClosureStatus: (month: string) => MonthClosureStatus;
  lockedMonths: string[];
  lockMonth: (month: string, notes?: string) => { success: boolean; error?: string };
  unlockMonth: (month: string) => { success: boolean; error?: string };
  isMonthLocked: (month: string) => boolean;

  // System Utility & Granular Cleanup
  cleanupDatabaseTables: (options: DataCleanupOptions) => Promise<CleanupResult>;

  // Audit Trail & Activity Logs
  auditLogs: AuditLogEntry[];
  logAuditEvent: (
    entry: Omit<
      AuditLogEntry,
      'id' | 'timestamp' | 'operatorId' | 'operatorUsername' | 'operatorName' | 'operatorRole'
    > &
      Partial<Pick<AuditLogEntry, 'operatorId' | 'operatorUsername' | 'operatorName' | 'operatorRole' | 'timestamp'>>
  ) => void;
  clearAuditLogs: () => void;

  // Student Account History (Chronological Status & Transport Log)
  studentAccountHistory: StudentAccountHistoryEntry[];
  addStudentAccountHistory: (
    entry: Omit<StudentAccountHistoryEntry, 'id' | 'timestamp'> & {
      id?: string;
      timestamp?: string;
    }
  ) => void;
  getStudentAccountHistory: (studentId: string) => StudentAccountHistoryEntry[];
  updateStudentStatus: (
    studentId: string,
    newStatus: StudentStatus,
    reason?: string
  ) => { success: boolean; error?: string };

  // Global In-App Notifications / Toasts
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', durationMs?: number) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEY = 'skooler_app_data_v1';

// Legacy global cache cleanup:
// Earlier versions saved full student rosters, classes, and tenant records into
// un-scoped localStorage keys ('skooler_app_data_v1_students', etc.). In a multi-tenant
// database architecture, keeping these global keys causes cross-tenant contamination
// (e.g. 110 old students appearing in a brand new institution with 0 students).
// We purge all un-scoped entity cache keys so the server database remains authoritative.
try {
  const legacyGlobalKeys = [
    `${STORAGE_KEY}_auth_session`,
    `${STORAGE_KEY}_institution`,
    `${STORAGE_KEY}_sidebar_collapsed`,
    `${STORAGE_KEY}_theme_config`,
    `${STORAGE_KEY}_users`,
    `${STORAGE_KEY}_students`,
    `${STORAGE_KEY}_classes`,
    `${STORAGE_KEY}_families`,
    `${STORAGE_KEY}_buses`,
    `${STORAGE_KEY}_stops`,
    `${STORAGE_KEY}_assignments`,
    `${STORAGE_KEY}_templates`,
    `${STORAGE_KEY}_vouchers`,
    `${STORAGE_KEY}_collections`,
    `${STORAGE_KEY}_transactions`,
    `${STORAGE_KEY}_banks`,
    `${STORAGE_KEY}_audit_logs`,
    `${STORAGE_KEY}_student_account_history`,
    `${STORAGE_KEY}_locked_months`,
    `${STORAGE_KEY}_institute`,
    `${STORAGE_KEY}_prior_month_rule`,
    `${STORAGE_KEY}_skipped_month_rule`,
    `${STORAGE_KEY}_voucher_deletion_resolution`,
    `${STORAGE_KEY}_session_timeout_minutes`,
    `${STORAGE_KEY}_default_late_fee_rate`,
    `${STORAGE_KEY}_rounding_multiple`,
    `${STORAGE_KEY}_rounding_enabled`,
    `${STORAGE_KEY}_default_due_date_enabled`,
    `${STORAGE_KEY}_default_due_day`,
    `${STORAGE_KEY}_due_day_seed_v2`,
    `${STORAGE_KEY}_voucher_copy_order`,
    `${STORAGE_KEY}_voucher_default_copies`,
  ];
  for (const k of legacyGlobalKeys) {
    localStorage.removeItem(k);
  }
} catch {
  // ignore in SSR or restricted environments
}

// Friendly display names for the background sync-failure toast (see the
// subscribeSyncFailures effect below), keyed by the same collection names
// used in SIMPLE_ENTITY_ENDPOINTS in apiSync.ts.
const SYNC_ENTITY_LABELS: Record<string, string> = {
  students: 'Students',
  classes: 'Classes & Sections',
  families: 'Families & Guardians',
  buses: 'Buses Fleet Directory',
  stops: 'Bus Stops & Fare Rates',
  transportAssignments: 'Student Transport Assignments',
  templates: 'Fee Particular Templates',
  bankAccounts: 'Bank Accounts',
  lockedMonths: 'Month Lock/Unlock',
  database: 'Database records',
};

/**
 * Reconciles and guarantees strict 1:1 bidirectional consistency between
 * Student.familyId and Family.memberStudentIds.
 * Ensures no student can ever be listed in multiple families simultaneously.
 */
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Multi-Tenant Institution State
  // The server session (HTTP-only cookie) is the only authority; nothing about the
  // signed-in user or institution is cached in the browser.
  const [currentInstitution, setCurrentInstitution] = useState<Institution | null>(null);

  const [invites, setInvites] = useState<OperatorInvite[]>([]);

  // Database Connectivity State
  const [isDbConnected, setIsDbConnected] = useState<boolean>(true);

  // Toast System (declared early so all domain handlers can notify end-users)
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  const showToast = useCallback(
    (
      message: string,
      type: 'success' | 'error' | 'warning' | 'info' = 'info',
      durationMs: number = 4000
    ) => {
      const id = Date.now();
      setToast({ id, message, type });
      setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, durationMs);
    },
    []
  );

  // Listen to live database status changes
  useEffect(() => {
    const unsub = subscribeDbStatus((status) => {
      setIsDbConnected(status.isConnected);
    });
    return unsub;
  }, []);

  // Fail-fast guard for mutations when PostgreSQL is offline
  const ensureMutationAllowed = useCallback((operationDesc?: string): { allowed: boolean; error?: string } => {
    const perm = checkMutationAllowed();
    if (!perm.allowed) {
      const msg = perm.error || `${operationDesc || 'This operation'} is blocked while the database is offline.`;
      showToast(msg, 'error', 6000);
      return { allowed: false, error: msg };
    }
    return { allowed: true };
  }, [showToast]);

  // Anonymous / unauthenticated guest placeholder for pre-login state
  const ANONYMOUS_USER: User = {
    id: 'usr-guest',
    username: 'guest',
    name: 'Guest User',
    role: 'Viewer',
    permissions: [],
  };

  // Stored Users in Database (Direct from PostgreSQL, zero localStorage cache)
  const [users, setUsers] = useState<User[]>(() => SEEDED_USERS);

  // Authentication State (Option B: Ephemeral Banking Model - invalidated on browser reopen).
  // Starts signed-out; the server session is verified via /api/auth/me on mount.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User>(ANONYMOUS_USER);
  // True only while an existing browser session is being verified against the server.
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(`${STORAGE_KEY}_browser_session_active`) === '1';
    } catch {
      return false;
    }
  });

  const [activeMonth, setActiveMonth] = useState<string>(getCurrentMonthString());

  // Views can register a pre-change guard (returns true when it intercepted
  // the switch, e.g. to confirm unsaved edits) that HeaderBar consults.
  const beforeMonthChange = useRef<((nextMonth: string) => boolean) | null>(null);

  // Policy Settings State (Server-Authoritative in PostgreSQL institutions.settings - no localStorage cache)
  const [priorMonthRule, setPriorMonthRuleState] = useState<PriorMonthVoucherRule>('strict');

  const setPriorMonthRule = (rule: PriorMonthVoucherRule) => {
    setPriorMonthRuleState(rule);
    setInstitute((prev) => ({ ...prev, settings: { ...prev.settings, priorMonthRule: rule } }));
    apiUpdateInstituteSettings({ priorMonthRule: rule });
  };

  const [skippedMonthRule, setSkippedMonthRuleState] = useState<SkippedMonthVoucherRule>('warning');

  const setSkippedMonthRule = (rule: SkippedMonthVoucherRule) => {
    setSkippedMonthRuleState(rule);
    setInstitute((prev) => ({ ...prev, settings: { ...prev.settings, skippedMonthRule: rule } }));
    apiUpdateInstituteSettings({ skippedMonthRule: rule });
  };

  const [voucherDeletionResolution, setVoucherDeletionResolutionState] = useState<VoucherDeletionResolution>('cascade');

  const setVoucherDeletionResolution = (resolution: VoucherDeletionResolution) => {
    setVoucherDeletionResolutionState(resolution);
    setInstitute((prev) => ({ ...prev, settings: { ...prev.settings, voucherDeletionResolution: resolution } }));
    apiUpdateInstituteSettings({ voucherDeletionResolution: resolution });
  };

  // Option B: Inactivity Auto-Logout Timeout (Default: 10 minutes, configurable in Settings & persisted in PostgreSQL)
  const [sessionTimeoutMinutes, setSessionTimeoutMinutesState] = useState<number>(10);

  const setSessionTimeoutMinutes = (mins: number) => {
    const sanitized = Math.max(1, Math.min(180, Number(mins) || 10));
    setSessionTimeoutMinutesState(sanitized);
    setInstitute((prev) => ({
      ...prev,
      sessionTimeoutMinutes: sanitized,
      settings: { ...prev.settings, sessionTimeoutMinutes: sanitized },
    }));
    apiUpdateInstituteSettings({ sessionTimeoutMinutes: sanitized });
  };

  const [defaultLateFeeRate, setDefaultLateFeeRateState] = useState<number>(500);

  const setDefaultLateFeeRate = (rate: number) => {
    const cleanRate = Number(rate) || 0;
    setDefaultLateFeeRateState(cleanRate);
    setInstitute((prev) => ({ ...prev, settings: { ...prev.settings, defaultLateFeeRate: cleanRate } }));
    apiUpdateInstituteSettings({ defaultLateFeeRate: cleanRate });
  };

  const [roundingMultiple, setRoundingMultipleState] = useState<number>(1);

  const setRoundingMultiple = (multiple: number) => {
    const clean = multiple > 0 && Number.isInteger(multiple) ? multiple : 1;
    setRoundingMultipleState(clean);
    setInstitute((prev) => ({ ...prev, settings: { ...prev.settings, roundingMultiple: clean } }));
    apiUpdateInstituteSettings({ roundingMultiple: clean });
  };

  const [roundingEnabled, setRoundingEnabledState] = useState<boolean>(true);

  const setRoundingEnabled = (enabled: boolean) => {
    setRoundingEnabledState(enabled);
    setInstitute((prev) => ({ ...prev, settings: { ...prev.settings, roundingEnabled: enabled } }));
    apiUpdateInstituteSettings({ roundingEnabled: enabled });
  };

  const [transportRoundingMultiple, setTransportRoundingMultipleState] = useState<number>(10);

  const setTransportRoundingMultiple = (multiple: number) => {
    const clean = multiple > 0 && Number.isInteger(multiple) ? multiple : 10;
    setTransportRoundingMultipleState(clean);
    setInstitute((prev) => ({ ...prev, settings: { ...prev.settings, transportRoundingMultiple: clean } }));
    apiUpdateInstituteSettings({ transportRoundingMultiple: clean });
  };

  const [defaultDueDateEnabled, setDefaultDueDateEnabledState] = useState<boolean>(false);

  const [defaultDueDay, setDefaultDueDayState] = useState<number>(15);

  const setDefaultDueDateSettings = useCallback(
    (settings: {
      enabled: boolean;
      day?: number;
    }) => {
      setDefaultDueDateEnabledState(settings.enabled);
      const cleanDay = settings.day !== undefined ? Math.min(Math.max(1, settings.day), 31) : 15;
      if (settings.day !== undefined) {
        setDefaultDueDayState(cleanDay);
      }
      setInstitute((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          defaultDueDateEnabled: settings.enabled,
          ...(settings.day !== undefined ? { defaultDueDay: cleanDay } : {}),
        },
      }));
      apiUpdateInstituteSettings({
        defaultDueDateEnabled: settings.enabled,
        ...(settings.day !== undefined ? { defaultDueDay: cleanDay } : {}),
      });
    },
    []
  );

  const getComputedDefaultDueDate = useCallback(
    (month: string): string => {
      if (!defaultDueDateEnabled) return '';
      if (!month || !month.includes('-')) return '';
      const daysInMonth = getDaysInMonth(month);
      const clampedDay = Math.min(Math.max(1, defaultDueDay), daysInMonth);
      return `${month}-${String(clampedDay).padStart(2, '0')}`;
    },
    [defaultDueDateEnabled, defaultDueDay]
  );

  // Voucher Copy Order & Default Included Copies (Stored directly in PostgreSQL)
  const [voucherCopyOrder, setVoucherCopyOrderState] = useState<VoucherCopyType[]>(['bank', 'institute', 'student']);

  const setVoucherCopyOrder = useCallback((order: VoucherCopyType[]) => {
    const clean = Array.isArray(order) && order.length > 0 ? order : ['bank', 'institute', 'student'];
    setVoucherCopyOrderState(clean);
    setInstitute((prev) => ({ ...prev, settings: { ...prev.settings, voucherCopyOrder: clean } }));
    apiUpdateInstituteSettings({ voucherCopyOrder: clean });
  }, []);

  const [voucherDefaultCopies, setVoucherDefaultCopiesState] = useState<VoucherCopyType[]>(['bank', 'institute', 'student']);

  const setVoucherDefaultCopies = useCallback((copies: VoucherCopyType[]) => {
    const clean = Array.isArray(copies) && copies.length > 0 ? copies : ['bank', 'institute', 'student'];
    setVoucherDefaultCopiesState(clean);
    setInstitute((prev) => ({ ...prev, settings: { ...prev.settings, voucherDefaultCopies: clean } }));
    apiUpdateInstituteSettings({ voucherDefaultCopies: clean });
  }, []);

  // Core domain state
  const [classes, setClasses] = useState<SchoolClass[]>(() => []);

  const [students, setStudents] = useState<Student[]>(() => []);

  const [families, setFamilies] = useState<Family[]>(() => []);

  // Loop-safe sequence counters for auto-generated codes (Reg #, Family #).
  // `useRef` initial values are only applied on the very first render, so these
  // start in sync with the students/families arrays computed above, then
  // increment independently of React's (batched, async) state updates.
  const studentSeqRef = useRef<number>(students.length);
  const familySeqRef = useRef<number>(families.length);

  // Monotonic counter backing generateUniqueId below. Guarantees uniqueness
  // even when several ids are minted within the same millisecond (e.g. a
  // bulk CSV import, or a bulk voucher-generation/carry-forward pass calling
  // .map() over many records in a single synchronous loop), where Date.now()
  // alone can return an identical value on every call. Used for every
  // client-minted entity id: students, families, transport stops/
  // assignments, fee templates, and vouchers.
  const idSeqRef = useRef<number>(0);

  const generateUniqueId = useCallback((prefix: string) => {
    idSeqRef.current += 1;
    return `${prefix}-${Date.now()}-${idSeqRef.current}`;
  }, []);

  // Live mirrors of the students/families state. React batches setState calls,
  // so when addStudent() runs several times inside one synchronous loop (bulk
  // CSV import), the state arrays it closes over remain stale until the next
  // render — later rows cannot see families or students created by earlier
  // rows, which caused one family to be created per student instead of
  // grouping siblings under a shared father CNIC. These refs are updated
  // synchronously by addStudent() and re-synced from state after each flush,
  // giving the loop an always-current view.
  const studentsRef = useRef<Student[]>(students);
  const familiesRef = useRef<Family[]>(families);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    familiesRef.current = families;
  }, [families]);

  const [buses, setBuses] = useState<TransportBus[]>(() => []);

  const [stops, setStops] = useState<TransportStop[]>(() => []);

  const [transportAssignments, setTransportAssignments] = useState<TransportAssignment[]>(() => []);

  const [templates, setTemplates] = useState<FeeTemplate[]>(() => INITIAL_GLOBAL_TEMPLATES);

  const [vouchers, setVouchers] = useState<FeeVoucher[]>(() => []);

  const [collections, setCollections] = useState<FeeCollection[]>(() => []);

  // Live mirror of the vouchers state, same rationale as studentsRef/familiesRef
  // above: bulkCarryForwardDefaulters() calls carryForwardDefaulter() in a
  // synchronous loop, and that function's "already Carried/Paid" duplicate
  // guard needs to see status changes made by earlier vouchers in the same
  // batch, not the pre-batch render snapshot. Kept current inside
  // carryForwardDefaulter() itself and re-synced from state after every
  // commit so it never drifts stale between unrelated actions.
  const vouchersRef = useRef<FeeVoucher[]>(vouchers);

  useEffect(() => {
    vouchersRef.current = vouchers;
  }, [vouchers]);

  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() => []);

  const [institute, setInstitute] = useState<InstituteProfile>(() => INITIAL_INSTITUTE);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => []);

  // Sidebar & theme preferences are per-user and stored server-side in PostgreSQL
  // (users.preferences). They are loaded after authentication and saved on change.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [themeConfig, setThemeConfig] = useState<AppThemeConfig>(DEFAULT_THEME_CONFIG);
  const themeConfigRef = useRef<AppThemeConfig>(DEFAULT_THEME_CONFIG);
  const prefsReadyRef = useRef(false);
  const savedSidebarRef = useRef<boolean>(false);

  const loadUserPreferences = useCallback(async () => {
    const res = await apiGetPreferences();
    const prefs = res.success ? res.preferences : undefined;
    const nextTheme = { ...DEFAULT_THEME_CONFIG, ...(prefs?.themeConfig || {}) } as AppThemeConfig;
    const nextCollapsed = prefs?.sidebarCollapsed === true;
    savedSidebarRef.current = nextCollapsed;
    themeConfigRef.current = nextTheme;
    setThemeConfig(nextTheme);
    setIsSidebarCollapsed(nextCollapsed);
    prefsReadyRef.current = true;
  }, []);

  const resetPreferencesState = useCallback(() => {
    prefsReadyRef.current = false;
    savedSidebarRef.current = false;
    themeConfigRef.current = DEFAULT_THEME_CONFIG;
    setThemeConfig(DEFAULT_THEME_CONFIG);
    setIsSidebarCollapsed(false);
  }, []);

  useEffect(() => {
    if (!prefsReadyRef.current || savedSidebarRef.current === isSidebarCollapsed) return;
    savedSidebarRef.current = isSidebarCollapsed;
    apiSavePreferences({ sidebarCollapsed: isSidebarCollapsed }).catch(() => {});
  }, [isSidebarCollapsed]);

  const updateThemeConfig = useCallback((updates: Partial<AppThemeConfig>) => {
    const next = { ...themeConfigRef.current, ...updates };
    themeConfigRef.current = next;
    setThemeConfig(next);
    applyThemeToDom(next);
    apiSavePreferences({ themeConfig: next }).catch(() => {});
  }, []);

  const resetThemeConfig = useCallback(() => {
    themeConfigRef.current = DEFAULT_THEME_CONFIG;
    setThemeConfig(DEFAULT_THEME_CONFIG);
    applyThemeToDom(DEFAULT_THEME_CONFIG);
    apiSavePreferences({ themeConfig: DEFAULT_THEME_CONFIG }).catch(() => {});
  }, []);

  // Ensure DOM is updated on initial mount and theme changes
  useEffect(() => {
    applyThemeToDom(themeConfig);
  }, [themeConfig]);

  // Audit Trail & Activity Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => []);

  const currentUserRef = useRef<User>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const logAuditEvent = useCallback(
    (
      entry: Omit<
        AuditLogEntry,
        'id' | 'timestamp' | 'operatorId' | 'operatorUsername' | 'operatorName' | 'operatorRole'
      > &
        Partial<Pick<AuditLogEntry, 'operatorId' | 'operatorUsername' | 'operatorName' | 'operatorRole' | 'timestamp'>>
    ) => {
      const activeUser = currentUserRef.current;
      const newLog: AuditLogEntry = {
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: entry.timestamp || new Date().toISOString(),
        operatorId: entry.operatorId || activeUser?.id || 'usr-system',
        operatorUsername: entry.operatorUsername || activeUser?.username || 'system',
        operatorName: entry.operatorName || activeUser?.name || 'System Operator',
        operatorRole: entry.operatorRole || activeUser?.role || 'Admin',
        actionType: entry.actionType,
        actionTitle: entry.actionTitle,
        description: entry.description,
        module: entry.module,
        targetId: entry.targetId,
        targetLabel: entry.targetLabel,
        month: entry.month,
        amount: entry.amount,
        previousValue: entry.previousValue,
        newValue: entry.newValue,
        metadata: entry.metadata,
      };

      setAuditLogs((prev) => [newLog, ...prev]);
    },
    []
  );

  // Student Account History (Chronological Status, Transport & Academic Event Log)
  const [studentAccountHistory, setStudentAccountHistory] = useState<StudentAccountHistoryEntry[]>(() => []);

  const addStudentAccountHistory = useCallback(
    (
      entry: Omit<StudentAccountHistoryEntry, 'id' | 'timestamp'> & {
        id?: string;
        timestamp?: string;
      }
    ) => {
      const activeUser = currentUserRef.current;
      const newEntry: StudentAccountHistoryEntry = {
        id: entry.id || `sah-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        studentId: entry.studentId,
        timestamp: entry.timestamp || new Date().toISOString(),
        date: entry.date || new Date().toISOString().split('T')[0],
        category: entry.category,
        actionTitle: entry.actionTitle,
        description: entry.description,
        previousValue: entry.previousValue,
        newValue: entry.newValue,
        operatorName: entry.operatorName || activeUser?.name || 'System Operator',
        operatorRole: entry.operatorRole || activeUser?.role || 'Admin',
        month: entry.month,
        metadata: entry.metadata,
      };

      setStudentAccountHistory((prev) => [newEntry, ...prev]);
    },
    []
  );

  const getStudentAccountHistory = useCallback(
    (studentId: string): StudentAccountHistoryEntry[] => {
      const explicitEntries = studentAccountHistory.filter((h) => h.studentId === studentId);
      const student = students.find((s) => s.id === studentId);

      const synthesized: StudentAccountHistoryEntry[] = [...explicitEntries];

      // If no enrollment entry exists in explicit history, synthesize one from student admission data
      const hasEnrollment = explicitEntries.some((e) => e.category === 'enrollment');
      if (!hasEnrollment && student) {
        const studentClass = classes.find((c) => c.id === student.classId);
        const admDate = student.admissionDate || student.createdDate || '2024-01-01';
        synthesized.push({
          id: `synth-enr-${student.id}`,
          studentId: student.id,
          timestamp: `${admDate}T08:00:00.000Z`,
          date: admDate,
          category: 'enrollment',
          actionTitle: 'Student Admission & Account Registered',
          description: `Initial registration completed for Class ${studentClass?.name || 'Unassigned'} with status '${student.status}'. Registration #: ${student.regNo}.`,
          previousValue: 'None',
          newValue: student.status,
          operatorName: 'System Registrar',
          operatorRole: 'Admin',
          metadata: { isSynthesized: true },
        });
      }

      // Check for transport assignments that might not have an explicit history record
      const studentAssignments = transportAssignments.filter((a) => a.studentId === studentId);
      for (const asgn of studentAssignments) {
        const hasMatchingTransport = explicitEntries.some(
          (e) => e.category === 'transport' && e.month === asgn.month
        );
        if (!hasMatchingTransport) {
          const stop = stops.find((s) => s.id === asgn.stopId);
          const bus = buses.find((b) => b.id === asgn.busId);
          const monthName = formatMonthName(asgn.month);
          const fare = stop?.monthlyFare ? Math.max(0, stop.monthlyFare - (asgn.discount || 0)) : 0;
          synthesized.push({
            id: `synth-tr-${asgn.id}`,
            studentId: asgn.studentId,
            timestamp: `${asgn.month}-01T08:30:00.000Z`,
            date: `${asgn.month}-01`,
            category: 'transport',
            actionTitle: `Transport Added (${monthName})`,
            description: `Transport assigned for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'} (${bus?.routeName || 'Route'}) - ${asgn.tripType === 'OneWay' ? 'One Way' : 'Round Trip'}. Net fare: Rs. ${fare}.`,
            previousValue: 'No Transport',
            newValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
            month: asgn.month,
            operatorName: 'Transport Incharge',
            operatorRole: 'Accountant',
            metadata: { isSynthesized: true, assignmentId: asgn.id },
          });
        }
      }

      // Sort descending (newest first)
      return synthesized.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    [studentAccountHistory, students, classes, transportAssignments, stops, buses]
  );

  const updateStudentStatus = useCallback(
    (studentId: string, newStatus: StudentStatus, reason?: string) => {
      const target = students.find((s) => s.id === studentId);
      if (!target) return { success: false, error: 'Student not found.' };

      if (target.status === newStatus) {
        return { success: false, error: `Student is already in '${newStatus}' status.` };
      }

      const oldStatus = target.status;
      const activeUser = currentUserRef.current;
      const timestamp = new Date().toISOString();
      const date = timestamp.split('T')[0];

      // Update student status
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, status: newStatus } : s))
      );

      // Add to student account history
      const reasonText = reason?.trim() ? `. Note/Reason: ${reason.trim()}` : '';
      const historyEntry: StudentAccountHistoryEntry = {
        id: `sah-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        studentId,
        timestamp,
        date,
        category: 'status',
        actionTitle: `Status Changed: ${oldStatus} → ${newStatus}`,
        description: `Student enrollment status changed from ${oldStatus} to ${newStatus}${reasonText}.`,
        previousValue: oldStatus,
        newValue: newStatus,
        operatorName: activeUser?.name || 'System Operator',
        operatorRole: activeUser?.role || 'Admin',
        metadata: {
          oldStatus,
          newStatus,
          reason: reason?.trim() || undefined,
        },
      };

      setStudentAccountHistory((prev) => [historyEntry, ...prev]);

      // Log in central audit trail
      logAuditEvent({
        timestamp,
        actionType: 'operator_security',
        actionTitle: `Student Status Changed: ${target.name}`,
        description: `Enrollment status transitioned from ${oldStatus} to ${newStatus} for ${target.name} (${target.regNo})${reasonText}`,
        module: 'Students',
        targetId: target.regNo,
        targetLabel: `${target.name} (${target.regNo})`,
        previousValue: oldStatus,
        newValue: newStatus,
        metadata: {
          studentId: target.id,
          oldStatus,
          newStatus,
          reason: reason?.trim(),
        },
      });

      return { success: true };
    },
    [students, logAuditEvent]
  );

  const [lockedMonths, setLockedMonths] = useState<string[]>(() => []);

  const clearAuditLogs = useCallback(() => {
    setAuditLogs([]);
  }, []);

  const isRemoteUpdateRef = useRef(false);
  const isHydratedRef = useRef(false);

  const applyServerState = useCallback((d: any) => {
    if (!d) return;
    isRemoteUpdateRef.current = true;
    isHydratedRef.current = true;
    if (Array.isArray(d.users) && d.users.length > 0) setUsers(d.users);
    if (Array.isArray(d.classes)) setClasses(d.classes);
    if (Array.isArray(d.students)) setStudents(d.students);
    if (Array.isArray(d.families)) setFamilies(d.families);
    if (Array.isArray(d.buses)) setBuses(d.buses);
    if (Array.isArray(d.stops)) setStops(d.stops);
    if (Array.isArray(d.transportAssignments)) setTransportAssignments(d.transportAssignments);
    if (Array.isArray(d.templates)) {
      setTemplates(d.templates.length > 0 ? d.templates : INITIAL_GLOBAL_TEMPLATES);
    }
    if (Array.isArray(d.vouchers)) setVouchers(d.vouchers);
    if (Array.isArray(d.collections)) setCollections(d.collections);
    if (Array.isArray(d.transactions)) setTransactions(d.transactions);
    if (Array.isArray(d.bankAccounts)) setBankAccounts(d.bankAccounts);
    if (Array.isArray(d.auditLogs)) setAuditLogs(d.auditLogs);
    if (Array.isArray(d.studentAccountHistory)) setStudentAccountHistory(d.studentAccountHistory);
    if (Array.isArray(d.lockedMonths)) setLockedMonths(d.lockedMonths);
    if (d.institute && d.institute.name) {
      setInstitute(d.institute);
      const s = d.institute.settings || {};
      if (s.priorMonthRule) setPriorMonthRuleState(s.priorMonthRule);
      if (s.skippedMonthRule) setSkippedMonthRuleState(s.skippedMonthRule);
      if (s.voucherDeletionResolution) setVoucherDeletionResolutionState(s.voucherDeletionResolution);
      if (s.defaultLateFeeRate !== undefined) setDefaultLateFeeRateState(Number(s.defaultLateFeeRate));
      if (s.roundingMultiple !== undefined) setRoundingMultipleState(Number(s.roundingMultiple));
      if (s.roundingEnabled !== undefined) setRoundingEnabledState(Boolean(s.roundingEnabled));
      if (s.transportRoundingMultiple !== undefined) setTransportRoundingMultipleState(Number(s.transportRoundingMultiple) || 10);
      else setTransportRoundingMultipleState(10);
      if (s.defaultDueDateEnabled !== undefined) setDefaultDueDateEnabledState(Boolean(s.defaultDueDateEnabled));
      if (s.defaultDueDay !== undefined) setDefaultDueDayState(Number(s.defaultDueDay));
      if (Array.isArray(s.voucherCopyOrder) && s.voucherCopyOrder.length > 0) setVoucherCopyOrderState(s.voucherCopyOrder);
      if (Array.isArray(s.voucherDefaultCopies) && s.voucherDefaultCopies.length > 0) setVoucherDefaultCopiesState(s.voucherDefaultCopies);

      const timeoutVal = s.sessionTimeoutMinutes ?? d.institute.sessionTimeoutMinutes;
      if (timeoutVal) {
        const parsed = Number(timeoutVal);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 180) {
          setSessionTimeoutMinutesState(parsed);
        }
      }
    }

    initializeSyncSnapshots(d);

    setTimeout(() => {
      isRemoteUpdateRef.current = false;
    }, 150);
  }, []);

  // Hydrate directly from authoritative PostgreSQL database on mount & subscribe to live SSE real-time sync
  useEffect(() => {
    isHydratedRef.current = false;
    fetchServerState().then((res) => {
      if (res?.success && res.data) {
        setIsDbConnected(true);
        applyServerState(res.data);
      } else {
        setIsDbConnected(false);
      }
    });

    const cleanupSSE = initLiveRealtimeSync();
    const unsubRemote = subscribeRemoteChanges((remoteData) => {
      setIsDbConnected(true);
      applyServerState(remoteData);
    });

    return () => {
      cleanupSSE();
      unsubRemote();
    };
  }, [applyServerState, currentInstitution?.id]);

  // Sync to centralized tenant database
  useEffect(() => {
    if (!isHydratedRef.current || isRemoteUpdateRef.current || !isAuthenticated || !currentInstitution?.id) {
      return;
    }

    // Persist to central database engine
    queueDatabaseSync({
      users,
      classes,
      students,
      families,
      buses,
      stops,
      transportAssignments,
      templates,
      vouchers,
      collections,
      transactions,
      institute,
      bankAccounts,
      auditLogs,
      studentAccountHistory,
      lockedMonths,
    });
  }, [
    users,
    classes,
    students,
    families,
    buses,
    stops,
    transportAssignments,
    templates,
    vouchers,
    collections,
    transactions,
    institute,
    bankAccounts,
    auditLogs,
    studentAccountHistory,
    lockedMonths,
    isAuthenticated,
    currentInstitution?.id,
  ]);

  useEffect(() => {
    if (isAuthenticated && users.length > 0 && !users.some((u) => u.id === currentUser.id)) {
      const fallback = users.find((u) => u.role === 'Admin') || users[0];
      if (fallback) {
        setCurrentUser(fallback);
      }
    }
  }, [users, currentUser, isAuthenticated]);

  // Multi-Tenant Institutional Workspaces & Operator Auth
  const registerInstitution = async (params: {
    schoolName: string;
    schoolCode?: string;
    currency?: string;
    address?: string;
    phone?: string;
    email?: string;
    regNo?: string;
    adminName: string;
    adminUsername: string;
    adminEmail?: string;
    adminPassword: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiRegisterInstitution(params);
      if (!res.success || !res.institution || !res.user) {
        return { success: false, error: res.error || 'Failed to register institution workspace.' };
      }

      // Establish active tenant context
      setCurrentInstitution(res.institution);
      setCurrentUser(res.user);
      setUsers([res.user]);
      setIsAuthenticated(true);
      setActiveInstitutionId(res.institution.id);
      loadUserPreferences().catch(() => {});

      try {
        sessionStorage.setItem(`${STORAGE_KEY}_browser_session_active`, '1');
      } catch {}


      // Update institutional header identity & currency
      setInstitute({
        name: res.institution.name,
        code: res.institution.code,
        regNo: res.institution.registrationNo || '',
        address: res.institution.address || '',
        phone: res.institution.phone || '',
        email: res.institution.email || '',
        currency: res.institution.currency || 'PKR',
        bankName: '',
        bankAccountNo: '',
        bankIban: '',
        invoiceNotes: 'Thank you for your prompt fee settlement.',
      });

      // Clear previous in-memory state for fresh tenant
      setClasses([]);
      setStudents([]);
      setFamilies([]);
      setBuses([]);
      setStops([]);
      setTransportAssignments([]);
      const freshTemplates = createDefaultGlobalTemplates(res.institution.id);
      setTemplates(freshTemplates);
      setVouchers([]);
      setCollections([]);
      setTransactions([]);
      setBankAccounts([]);
      setAuditLogs([]);
      setStudentAccountHistory([]);
      setLockedMonths([]);
      setInvites([]);

      resetSyncSnapshots();
      initializeSyncSnapshots({
        classes: [],
        students: [],
        families: [],
        buses: [],
        stops: [],
        transportAssignments: [],
        templates: freshTemplates,
        bankAccounts: [],
        lockedMonths: [],
      });
      isHydratedRef.current = true;

      logAuditEvent({
        actionType: 'system_cleanup',
        actionTitle: 'New Institution Workspace Provisioned',
        description: `Created workspace for '${res.institution.name}' (${res.institution.code}) under Administrator @${res.user.username}.`,
        module: 'Administration',
        targetId: res.institution.id,
        targetLabel: res.institution.name,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error during institution creation.' };
    }
  };

  const joinInstitution = async (params: {
    code: string;
    fullName: string;
    username: string;
    password: string;
    email?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiRegisterUser(params);
      if (!res.success || !res.user || !res.institution) {
        return { success: false, error: res.error || 'Failed to join institution workspace.' };
      }

      // Reset state for joining operator
      setClasses([]);
      setStudents([]);
      setFamilies([]);
      setBuses([]);
      setStops([]);
      setTransportAssignments([]);
      setTemplates(INITIAL_GLOBAL_TEMPLATES);
      setVouchers([]);
      setCollections([]);
      setTransactions([]);
      setBankAccounts([]);
      setAuditLogs([]);
      setStudentAccountHistory([]);
      setLockedMonths([]);
      setInvites([]);
      resetSyncSnapshots();

      setCurrentInstitution(res.institution);
      setCurrentUser(res.user);
      setIsAuthenticated(true);
      setActiveInstitutionId(res.institution.id);
      loadUserPreferences().catch(() => {});

      try {
        sessionStorage.setItem(`${STORAGE_KEY}_browser_session_active`, '1');
      } catch {}


      // Hydrate state from server for this institution
      const serverState = await fetchServerState(res.institution.id);
      if (serverState?.success && serverState.data) {
        applyServerState(serverState.data);
      }

      logAuditEvent({
        actionType: 'user_create',
        actionTitle: 'Operator Joined Workspace',
        description: `@${res.user.username} (${res.user.role}) connected to ${res.institution.name}.`,
        module: 'Administration',
        targetId: res.user.id,
        targetLabel: res.user.name,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error connecting to institution.' };
    }
  };

  const createInvite = async (params: {
    fullName: string;
    assignedRole: UserRole;
    permissions?: string[];
  }): Promise<{ success: boolean; invite?: OperatorInvite; error?: string }> => {
    const targetInstId = currentInstitution?.id || 'default';
    try {
      const res = await apiCreateInvite(targetInstId, {
        fullName: params.fullName,
        assignedRole: params.assignedRole,
        permissions: params.permissions || [],
        createdBy: currentUser.username,
      });

      if (!res.success || !res.invite) {
        return { success: false, error: res.error || 'Failed to generate staff invite code.' };
      }

      setInvites((prev) => [res.invite!, ...prev.filter((i) => i.inviteCode !== res.invite!.inviteCode)]);

      logAuditEvent({
        actionType: 'user_create',
        actionTitle: 'Operator Invite Code Generated',
        description: `Invite code ${res.invite.inviteCode} issued for ${params.fullName} (${params.assignedRole}).`,
        module: 'Administration',
        targetId: res.invite.inviteCode,
        targetLabel: params.fullName,
      });

      return { success: true, invite: res.invite };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error creating invite.' };
    }
  };

  const refreshInvites = useCallback(async () => {
    const targetInstId = currentInstitution?.id;
    if (!targetInstId) return;
    try {
      const res = await apiListInvites(targetInstId);
      if (res.success && Array.isArray(res.invites)) {
        setInvites(res.invites);
      }
    } catch {
      // ignore
    }
  }, [currentInstitution]);

  // Verify server-side session cookie on initial mount (Option B: Ephemeral Banking Model)
  useEffect(() => {
    let isMounted = true;

    try {
      const isSessionActive = sessionStorage.getItem(`${STORAGE_KEY}_browser_session_active`) === '1';
      if (!isSessionActive) {
        setIsAuthenticated(false);
        setCurrentUser(ANONYMOUS_USER);
        setCurrentInstitution(null);
        setActiveInstitutionId(null);
        setInstitute(INITIAL_INSTITUTE);
        setIsSessionLoading(false);
        return;
      }
    } catch {}

    apiGetMe().then((me) => {
      if (!isMounted) return;
      if (me.success && me.user) {
        setCurrentUser(me.user);
        setIsAuthenticated(true);
        loadUserPreferences().catch(() => {});
        try {
          sessionStorage.removeItem('school_timeout_notice');
          localStorage.setItem('quickfees_last_activity_timestamp', String(Date.now()));
        } catch {}
        if (me.institution) {
          setCurrentInstitution(me.institution);
          setActiveInstitutionId(me.institution.id);
          try {
            const instSettings = me.institution.settings
              ? typeof me.institution.settings === 'string'
                ? JSON.parse(me.institution.settings)
                : me.institution.settings
              : {};
            if (instSettings.priorMonthRule) setPriorMonthRuleState(instSettings.priorMonthRule);
            if (instSettings.skippedMonthRule) setSkippedMonthRuleState(instSettings.skippedMonthRule);
            if (instSettings.voucherDeletionResolution) setVoucherDeletionResolutionState(instSettings.voucherDeletionResolution);
            if (instSettings.defaultLateFeeRate !== undefined) setDefaultLateFeeRateState(Number(instSettings.defaultLateFeeRate));
            if (instSettings.roundingMultiple !== undefined) setRoundingMultipleState(Number(instSettings.roundingMultiple));
            if (instSettings.roundingEnabled !== undefined) setRoundingEnabledState(Boolean(instSettings.roundingEnabled));
            if (instSettings.transportRoundingMultiple !== undefined) setTransportRoundingMultipleState(Number(instSettings.transportRoundingMultiple) || 10);
            else setTransportRoundingMultipleState(10);
            if (instSettings.defaultDueDateEnabled !== undefined) setDefaultDueDateEnabledState(Boolean(instSettings.defaultDueDateEnabled));
            if (instSettings.defaultDueDay !== undefined) setDefaultDueDayState(Number(instSettings.defaultDueDay));
            if (Array.isArray(instSettings.voucherCopyOrder) && instSettings.voucherCopyOrder.length > 0) setVoucherCopyOrderState(instSettings.voucherCopyOrder);
            if (Array.isArray(instSettings.voucherDefaultCopies) && instSettings.voucherDefaultCopies.length > 0) setVoucherDefaultCopiesState(instSettings.voucherDefaultCopies);
            if (instSettings.sessionTimeoutMinutes) {
              const parsed = Number(instSettings.sessionTimeoutMinutes);
              if (!isNaN(parsed) && parsed >= 1 && parsed <= 180) {
                setSessionTimeoutMinutesState(parsed);
              }
            }
          } catch {}
        }
      } else {
        // Not authenticated on server: ensure clean unauthenticated state
        setIsAuthenticated(false);
        setCurrentUser(ANONYMOUS_USER);
        setCurrentInstitution(null);
        setActiveInstitutionId(null);
        setInstitute(INITIAL_INSTITUTE);
        setClasses([]);
        setStudents([]);
        setFamilies([]);
        setBuses([]);
        setStops([]);
        setTransportAssignments([]);
        setTemplates(INITIAL_GLOBAL_TEMPLATES);
        setVouchers([]);
        setCollections([]);
        setTransactions([]);
        setBankAccounts([]);
        setAuditLogs([]);
        setStudentAccountHistory([]);
        setLockedMonths([]);
        setInvites([]);
        try {
          sessionStorage.removeItem(`${STORAGE_KEY}_browser_session_active`);
        } catch {}
        resetPreferencesState();
        resetSyncSnapshots();
      }
      setIsSessionLoading(false);
    }).catch(() => {
      if (isMounted) setIsSessionLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Auth & Roles
  const login = async (
    usernameOrEmail: string,
    password: string,
    institutionCode?: string
  ): Promise<{ success: boolean; error?: string; user?: User }> => {
    const trimmed = usernameOrEmail.trim().toLowerCase();
    if (!trimmed) {
      return { success: false, error: 'Please enter your username or registered email address.' };
    }
    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }

    const cleanCode = (institutionCode || '').trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, error: 'Please enter your Institution Code.' };
    }

    // Authoritative backend multi-tenant login
    try {
      const apiRes = await apiLogin(trimmed, password, cleanCode);
      if (apiRes.success && apiRes.user) {
        // Reset in-memory state before loading new tenant records
        setClasses([]);
        setStudents([]);
        setFamilies([]);
        setBuses([]);
        setStops([]);
        setTransportAssignments([]);
        setTemplates(INITIAL_GLOBAL_TEMPLATES);
        setVouchers([]);
        setCollections([]);
        setTransactions([]);
        setBankAccounts([]);
        setAuditLogs([]);
        setStudentAccountHistory([]);
        setLockedMonths([]);
        setInvites([]);
        resetSyncSnapshots();

        setCurrentUser(apiRes.user);
        setIsAuthenticated(true);
        loadUserPreferences().catch(() => {});
        if (apiRes.institution) {
          setCurrentInstitution(apiRes.institution);
          setActiveInstitutionId(apiRes.institution.id);
          if (apiRes.institution.name) {
            setInstitute((prev) => ({
              ...prev,
              name: apiRes.institution!.name,
              code: apiRes.institution!.code,
              currency: apiRes.institution!.currency || prev.currency,
              address: apiRes.institution!.address || prev.address,
              phone: apiRes.institution!.phone || prev.phone,
              email: apiRes.institution!.email || prev.email,
            }));
          }

          // Hydrate state for this institution
          const stateRes = await fetchServerState(apiRes.institution.id);
          if (stateRes?.success && stateRes.data) {
            applyServerState(stateRes.data);
          }
        }

        try {
          sessionStorage.setItem(`${STORAGE_KEY}_browser_session_active`, '1');
          sessionStorage.removeItem('school_timeout_notice');
          localStorage.setItem('quickfees_last_activity_timestamp', String(Date.now()));
        } catch {}

        return { success: true, user: apiRes.user };
      }
      // Authoritative server answer (e.g. invalid password or user not found)
      return { success: false, error: apiRes.error || 'Login failed. Please check your credentials and try again.' };
    } catch {
      // The database/server is the only authority — there is no offline login.
      return { success: false, error: 'Unable to reach the server. Please check your connection and try again.' };
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    setCurrentUser(ANONYMOUS_USER);
    setCurrentInstitution(null);
    setActiveInstitutionId(null);
    setInstitute(INITIAL_INSTITUTE);
    setClasses([]);
    setStudents([]);
    setFamilies([]);
    setBuses([]);
    setStops([]);
    setTransportAssignments([]);
    setTemplates(INITIAL_GLOBAL_TEMPLATES);
    setVouchers([]);
    setCollections([]);
    setTransactions([]);
    setBankAccounts([]);
    setAuditLogs([]);
    setStudentAccountHistory([]);
    setLockedMonths([]);
    setInvites([]);
    resetPreferencesState();

    try {
      sessionStorage.removeItem(`${STORAGE_KEY}_browser_session_active`);
      localStorage.removeItem(`${STORAGE_KEY}_auth_session`);
      localStorage.removeItem(`${STORAGE_KEY}_institution`);
      localStorage.removeItem(`${STORAGE_KEY}_institute`);
      localStorage.removeItem('quickfees_recent_searched_students');
      localStorage.removeItem('quickfees_last_activity_timestamp');
    } catch {}

    isHydratedRef.current = false;
    resetSyncSnapshots();
    apiLogout().catch(() => {});
  };

  const hasPermission = (permission: string) => {
    return isPermissionAllowed(currentUser, permission);
  };

  const addUser = async (
    userData: Omit<User, 'id'>
  ): Promise<{
    success: boolean;
    error?: string;
    credentialsSummary?: { username: string; password?: string; institutionCode?: string; role: string };
  }> => {
    if (!userData.username.trim()) return { success: false, error: 'Username is required.' };
    if (users.some((u) => u.username.toLowerCase() === userData.username.trim().toLowerCase())) {
      return { success: false, error: 'A user with this username already exists.' };
    }
    const plainPassword = userData.password?.trim() || '';
    if (plainPassword.length < MIN_PASSWORD_LENGTH || plainPassword.length > MAX_PASSWORD_LENGTH) {
      return { success: false, error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.` };
    }

    const defaultRolePerms = ROLE_PRESET_PERMISSIONS[userData.role] || ROLE_PRESET_PERMISSIONS.Viewer;
    const finalPermissions =
      Array.isArray(userData.permissions) && userData.permissions.length > 0
        ? userData.permissions
        : defaultRolePerms;

    // Send the plain password to the server — it hashes it itself (same as
    // login/registration). Hashing it here too would double-hash it against
    // what the server's own hashPassword() produces.
    const res = await apiCreateUser({
      username: userData.username.trim(),
      name: userData.name.trim() || userData.username.trim(),
      email: userData.email,
      password: plainPassword,
      role: userData.role,
      permissions: finalPermissions,
    });

    if (!res.success || !res.user) {
      return { success: false, error: res.error || 'Failed to create user.' };
    }

    // The server is the source of truth for the created record — use its
    // response (real id, normalized username, etc.) rather than fabricating
    // a local-only object.
    setUsers((prev) => [...prev, res.user!]);
    return {
      success: true,
      credentialsSummary: {
        username: res.user.username,
        password: plainPassword,
        institutionCode: currentInstitution?.code || institute?.code || '',
        role: res.user.role,
      },
    };
  };

  const updateUser = async (id: string, updates: Partial<User>): Promise<{ success: boolean; error?: string }> => {
    if (updates.username) {
      const exists = users.some(
        (u) => u.id !== id && u.username.toLowerCase() === updates.username?.trim().toLowerCase()
      );
      if (exists) return { success: false, error: 'Username is already taken by another user.' };
    }

    if (updates.password !== undefined) {
      const plainPassword = updates.password.trim();
      if (plainPassword.length < MIN_PASSWORD_LENGTH || plainPassword.length > MAX_PASSWORD_LENGTH) {
        return { success: false, error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.` };
      }
    }

    // Plain password (if any) goes straight to the server — see addUser's
    // comment on why it must not be hashed client-side first.
    const res = await apiUpdateUser(id, {
      username: updates.username?.trim().toLowerCase(),
      name: updates.name,
      email: updates.email,
      role: updates.role,
      permissions: updates.permissions,
      status: updates.status,
      password: updates.password?.trim(),
    });

    if (!res.success) {
      return { success: false, error: res.error || 'Failed to update user.' };
    }

    // Prefer the server's confirmed record (e.g. normalized username) over
    // the client's own guess at what changed; never store the raw
    // plaintext password locally either way.
    const { password: _pw, ...safeUpdates } = updates;
    const confirmedUpdates = res.user ? { ...safeUpdates, ...res.user } : safeUpdates;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...confirmedUpdates } : u)));
    if (currentUser.id === id) {
      const updatedCurrent = { ...currentUser, ...confirmedUpdates };
      setCurrentUser(updatedCurrent);
    }
    return { success: true };
  };

  const updateUserPermissions = async (
    id: string,
    permissions: string[],
    role?: UserRole
  ): Promise<{ success: boolean; error?: string }> => {
    const userToUpdate = users.find((u) => u.id === id);
    if (!userToUpdate) return { success: false, error: 'User not found.' };

    const determinedRole = role || getEffectiveRole(permissions);
    const result = await updateUser(id, { permissions, role: determinedRole });
    if (result.success) {
      logAuditEvent({
        actionType: 'operator_security',
        actionTitle: 'Operator Security & Privileges Updated',
        description: `Updated authorization profile for @${userToUpdate.username} (${userToUpdate.name}). Role set to ${determinedRole} with ${permissions.length} active privileges.`,
        module: 'Security',
        targetId: userToUpdate.id,
        targetLabel: `@${userToUpdate.username} (${userToUpdate.name})`,
        previousValue: userToUpdate.role,
        newValue: determinedRole,
        metadata: {
          operatorId: userToUpdate.id,
          operatorUsername: userToUpdate.username,
          previousRole: userToUpdate.role,
          newRole: determinedRole,
          privilegesCount: permissions.length,
        },
      });
    }
    return result;
  };

  const deleteUser = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (users.length <= 1) {
      return { success: false, error: 'Cannot delete the only remaining user in the system.' };
    }
    if (currentUser.id === id) {
      return { success: false, error: 'Cannot delete the currently logged in active user.' };
    }
    const res = await apiDeleteUser(id);
    if (!res.success) {
      return { success: false, error: res.error || 'Failed to delete user.' };
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    return { success: true };
  };

  const deleteInstitutionAndData = async (
    confirmationText: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (currentUser.role !== 'Admin') {
      return {
        success: false,
        error: 'Access denied: Only an Administrator for this institution can delete the institution profile and data.',
      };
    }

    const targetInstId = currentInstitution?.id;
    if (!targetInstId) {
      return { success: false, error: 'No active institution found to delete.' };
    }

    const instName = currentInstitution?.name || 'Institution';

    try {
      const res = await apiDeleteInstitution(targetInstId, confirmationText);
      if (!res.success) {
        return { success: false, error: res.error || 'Failed to delete institution on server.' };
      }

      // Reset all operational and administrative local states
      resetPreferencesState();
      setIsAuthenticated(false);
      setCurrentUser(ANONYMOUS_USER);
      setCurrentInstitution(null);
      setActiveInstitutionId(null);
      setInstitute(INITIAL_INSTITUTE);
      setClasses([]);
      setStudents([]);
      setFamilies([]);
      setBuses([]);
      setStops([]);
      setTransportAssignments([]);
      setTemplates(INITIAL_GLOBAL_TEMPLATES);
      setVouchers([]);
      setCollections([]);
      setTransactions([]);
      setBankAccounts([]);
      setAuditLogs([]);
      setStudentAccountHistory([]);
      setLockedMonths([]);
      setUsers([]);
      setInvites([]);

      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith(STORAGE_KEY) || key.startsWith('quickfees_') || key.startsWith('school_'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
        sessionStorage.removeItem(`${STORAGE_KEY}_browser_session_active`);
        sessionStorage.setItem(
          'school_deleted_notice',
          `Institution "${instName}" and all associated academic, financial, and user records have been permanently deleted from the server.`
        );
      } catch {}

      resetSyncSnapshots();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error deleting institution.' };
    }
  };

  // Class Management
  const addClass = (name: string, monthlyFee: number, sortOrder: number) => {
    const perm = ensureMutationAllowed('Class creation');
    if (!perm.allowed) return { success: false, error: perm.error };

    if (!name.trim()) return { success: false, error: 'Class name is required.' };
    if (classes.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return { success: false, error: 'A class with this name already exists.' };
    }
    const newClass: SchoolClass = {
      id: `cls-${Date.now()}`,
      name: name.trim(),
      monthlyFee,
      sortOrder,
      active: true,
    };
    // Insert at the requested position and resequence everyone, rather than
    // a plain sort: if `sortOrder` matches an existing class's position,
    // sort() alone leaves two classes sharing the same number instead of
    // shifting the rest down to make room.
    const existing = [...classes].sort((a, b) => a.sortOrder - b.sortOrder);
    const clampedIndex = Math.min(Math.max(sortOrder - 1, 0), existing.length);
    existing.splice(clampedIndex, 0, newClass);
    setClasses(existing.map((c, idx) => ({ ...c, sortOrder: idx + 1 })));
    return { success: true, newClass };
  };

  const updateClass = (id: string, updates: Partial<SchoolClass>) => {
    const perm = ensureMutationAllowed('Class update');
    if (!perm.allowed) return { success: false, error: perm.error };

    if (updates.name) {
      const exists = classes.some(
        (c) => c.id !== id && c.name.toLowerCase() === updates.name?.trim().toLowerCase()
      );
      if (exists) return { success: false, error: 'A class with this name already exists.' };
    }

    const current = classes.find((c) => c.id === id);
    if (!current) return { success: false, error: 'Class not found.' };

    const patchedFields: Partial<SchoolClass> = {
      ...updates,
      monthlyFee: updates.monthlyFee !== undefined ? updates.monthlyFee : current.monthlyFee,
    };

    // If the Sort Position # was manually changed, resequence the whole list
    // around the new position -- the same way drag-and-drop (reorderClasses)
    // already does. Without this, a manual number edit only patched this one
    // record, leaving the on-screen order (which follows array position, not
    // the sortOrder value) out of sync with the number just typed in, and
    // could leave two classes sharing the same sortOrder.
    if (updates.sortOrder !== undefined && updates.sortOrder !== current.sortOrder) {
      const others = classes.filter((c) => c.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
      const clampedIndex = Math.min(Math.max(updates.sortOrder - 1, 0), others.length);
      others.splice(clampedIndex, 0, { ...current, ...patchedFields });
      setClasses(others.map((c, idx) => ({ ...c, sortOrder: idx + 1 })));
      return { success: true };
    }

    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patchedFields } : c)));
    return { success: true };
  };

  const deleteClass = (id: string) => {
    const perm = ensureMutationAllowed('Class deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    const enrolledStudents = students.filter((s) => s.classId === id);
    if (enrolledStudents.length > 0) {
      return {
        success: false,
        error: `Cannot delete class. ${enrolledStudents.length} student record(s) still reference it (including inactive ones). Reassign them first.`,
      };
    }
    setClasses((prev) => prev.filter((c) => c.id !== id));
    return { success: true };
  };

  const toggleClassActive = (id: string) => {
    const perm = ensureMutationAllowed('Class status update');
    if (!perm.allowed) return { success: false, error: perm.error };

    const cls = classes.find((c) => c.id === id);
    if (!cls) return { success: false, error: 'Class not found' };

    const newActiveState = !cls.active;
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, active: newActiveState } : c)));

    // Deactivating sets enrolled active students to Inactive with AutoDeactivated
    if (!newActiveState) {
      setStudents((prev) =>
        prev.map((s) => (s.classId === id && s.status === 'Active' ? { ...s, status: 'AutoDeactivated' } : s))
      );
    } else {
      // Reactivating restores prior statuses
      setStudents((prev) =>
        prev.map((s) => (s.classId === id && s.status === 'AutoDeactivated' ? { ...s, status: 'Active' } : s))
      );
    }

    return { success: true };
  };

  const reorderClasses = (reorderedClasses: SchoolClass[]) => {
    const perm = ensureMutationAllowed('Class reordering');
    if (!perm.allowed) return;

    const updated = reorderedClasses.map((cls, idx) => ({
      ...cls,
      sortOrder: idx + 1,
    }));
    setClasses(updated);
    return { success: true };
  };

  // Student Management
  const addStudent = (studentData: Omit<Student, 'id' | 'studentNo' | 'regNo' | 'createdDate'> & { regNo?: string; studentNo?: string }) => {
    const perm = ensureMutationAllowed('Student registration');
    if (!perm.allowed) return { success: false, error: perm.error };

    const year = new Date().getFullYear();

    // Check if regNo already exists (read via ref so rows added earlier in a
    // synchronous bulk-import loop are visible to later rows)
    if (studentData.regNo?.trim()) {
      const targetReg = studentData.regNo.trim().toLowerCase();
      const existing = studentsRef.current.find(
        (s) => s.regNo.toLowerCase() === targetReg || s.studentNo.toLowerCase() === targetReg
      );
      if (existing) {
        return {
          success: false,
          error: `Registration No. '${studentData.regNo}' is already assigned.`,
        };
      }
    }

    // Use a ref-backed counter rather than students.length: when addStudent()
    // is invoked repeatedly inside a synchronous loop (bulk CSV import),
    // students.length stays stale across every iteration until React flushes
    // state, which previously caused every blank-Reg# row to receive the
    // same auto-generated regNo.
    studentSeqRef.current += 1;
    const regNo = studentData.regNo?.trim() || `REG-${(1000 + studentSeqRef.current).toString()}`;
    const studentNo = studentData.studentNo?.trim() || regNo;

    // Auto family linking strictly by Father CNIC (reads via refs so a family created
    // for an earlier row of the same bulk import or an existing family whose students were
    // deleted is matched and re-adopted instead of duplicated)
    let familyId = studentData.familyId;
    if (!familyId && studentData.fatherCnic?.trim()) {
      const rawCnic = studentData.fatherCnic.trim();
      const normCnic = normalizeCnic(rawCnic);

      const existingFamily = familiesRef.current.find((f) => {
        // Direct match on family's own stored fatherCnic
        if (!f.fatherCnic?.trim()) return false;
        const fNorm = normalizeCnic(f.fatherCnic);
        return (
          f.fatherCnic.trim().toLowerCase() === rawCnic.toLowerCase() ||
          (normCnic.length >= 5 && fNorm === normCnic)
        );
      });

      if (existingFamily) {
        familyId = existingFamily.id;
        // Re-adopt existing family: fill headName/contactPhone if currently blank
        const updatedHeadName = existingFamily.headName || studentData.fatherName;
        const updatedPhone = existingFamily.contactPhone || studentData.fatherPhone || '';
        if (updatedHeadName !== existingFamily.headName || updatedPhone !== existingFamily.contactPhone) {
          const updatedFamily = {
            ...existingFamily,
            headName: updatedHeadName,
            contactPhone: updatedPhone,
          };
          setFamilies((prev) =>
            prev.map((f) => (f.id === existingFamily.id ? updatedFamily : f))
          );
          familiesRef.current = familiesRef.current.map((f) =>
            f.id === existingFamily.id ? updatedFamily : f
          );
        }
      } else {
        // Create auto family strictly with fatherCnic
        const newFamId = generateUniqueId('fam');
        familySeqRef.current += 1;
        const newFamNo = `FAM${year}-${familySeqRef.current.toString().padStart(4, '0')}`;
        const newFam: Family = {
          id: newFamId,
          familyNo: newFamNo,
          headName: studentData.fatherName,
          contactPhone: studentData.fatherPhone || '',
          fatherCnic: rawCnic,
          address: '',
          memberStudentIds: [],
        };
        setFamilies((prev) => [...prev, newFam]);
        familiesRef.current = [...familiesRef.current, newFam];
        familyId = newFamId;
      }
    }

    const normalizedDob = studentData.dob ? (normalizeDateToISO(studentData.dob) || studentData.dob) : '';
    const normalizedAdmDate = studentData.admissionDate ? (normalizeDateToISO(studentData.admissionDate) || studentData.admissionDate) : undefined;

    const newStudent: Student = {
      ...studentData,
      dob: normalizedDob,
      admissionDate: normalizedAdmDate,
      id: generateUniqueId('stu'),
      studentNo,
      regNo,
      familyId,
      createdDate: new Date().toISOString().split('T')[0],
    };

    studentsRef.current = [...studentsRef.current, newStudent];
    setStudents((prev) => [...prev, newStudent]);

    // Update family linkage
    if (familyId) {
      familiesRef.current = familiesRef.current.map((f) => {
        if (f.id === familyId) {
          return {
            ...f,
            memberStudentIds: Array.from(new Set([...f.memberStudentIds, newStudent.id])),
          };
        }
        return f;
      });
      setFamilies((prev) =>
        prev.map((f) => {
          if (f.id === familyId) {
            return {
              ...f,
              memberStudentIds: Array.from(new Set([...f.memberStudentIds.filter((id) => id !== newStudent.id), newStudent.id])),
            };
          } else {
            return {
              ...f,
              memberStudentIds: f.memberStudentIds.filter((id) => id !== newStudent.id),
            };
          }
        })
      );
    }

    const studentClass = classes.find((c) => c.id === newStudent.classId);
    addStudentAccountHistory({
      studentId: newStudent.id,
      date: newStudent.admissionDate || newStudent.createdDate || new Date().toISOString().split('T')[0],
      category: 'enrollment',
      actionTitle: 'Student Admission & Account Registered',
      description: `Student admitted in Class ${studentClass?.name || 'Unassigned'} with status '${newStudent.status}'. Registration #: ${newStudent.regNo}.`,
      previousValue: 'None',
      newValue: newStudent.status,
    });

    return { success: true, student: newStudent };
  };

  const updateStudent = (id: string, updates: Partial<Student>) => {
    const perm = ensureMutationAllowed('Student update');
    if (!perm.allowed) return { success: false, error: perm.error };

    const target = students.find((s) => s.id === id);
    if (!target) return { success: false, error: 'Student not found.' };

    const oldFamilyId = target.familyId;
    const newFamilyId =
      updates.familyId !== undefined ? (updates.familyId || undefined) : oldFamilyId;

    if (updates.familyId !== undefined && newFamilyId !== oldFamilyId) {
      setFamilies((prev) =>
        prev.map((f) => {
          if (newFamilyId && f.id === newFamilyId) {
            return {
              ...f,
              memberStudentIds: Array.from(new Set([...f.memberStudentIds.filter((mId) => mId !== id), id])),
            };
          } else {
            return {
              ...f,
              memberStudentIds: f.memberStudentIds.filter((mId) => mId !== id),
            };
          }
        })
      );

      const oldFam = families.find((f) => f.id === oldFamilyId);
      const newFam = families.find((f) => f.id === newFamilyId);
      addStudentAccountHistory({
        studentId: id,
        category: 'family',
        actionTitle: newFamilyId ? 'Family Linked' : 'Family Unlinked',
        description: newFamilyId
          ? `Linked to Family ${newFam?.familyNo || 'New Family'} (Head: ${newFam?.headName || 'Guardian'}).`
          : `Unlinked from Family ${oldFam?.familyNo || 'Family'}.`,
        previousValue: oldFam?.familyNo || 'None',
        newValue: newFam?.familyNo || 'None',
      });
    }

    // Status Change
    if (updates.status !== undefined && updates.status !== target.status) {
      const oldStatus = target.status;
      const newStatus = updates.status;
      const timestamp = new Date().toISOString();
      const reasonText = updates.notes ? `. Note: ${updates.notes}` : '';

      addStudentAccountHistory({
        studentId: id,
        timestamp,
        date: timestamp.split('T')[0],
        category: 'status',
        actionTitle: `Status Changed: ${oldStatus} → ${newStatus}`,
        description: `Student enrollment status changed from ${oldStatus} to ${newStatus}${reasonText}.`,
        previousValue: oldStatus,
        newValue: newStatus,
        metadata: { oldStatus, newStatus },
      });

      logAuditEvent({
        timestamp,
        actionType: 'operator_security',
        actionTitle: `Student Status Changed: ${target.name}`,
        description: `Status changed from ${oldStatus} to ${newStatus} for ${target.name} (${target.regNo})${reasonText}`,
        module: 'Students',
        targetId: target.regNo,
        targetLabel: `${target.name} (${target.regNo})`,
        previousValue: oldStatus,
        newValue: newStatus,
        metadata: { studentId: target.id, oldStatus, newStatus },
      });
    }

    // Academic / Class Change
    if (updates.classId !== undefined && updates.classId !== target.classId) {
      const oldClass = classes.find((c) => c.id === target.classId)?.name || 'Previous Class';
      const newClass = classes.find((c) => c.id === updates.classId)?.name || 'New Class';
      addStudentAccountHistory({
        studentId: id,
        category: 'academic',
        actionTitle: `Class Transferred: ${oldClass} → ${newClass}`,
        description: `Student class transferred from ${oldClass} to ${newClass}.`,
        previousValue: oldClass,
        newValue: newClass,
      });
    }

    // Monthly Discount Change
    if (updates.monthlyDiscount !== undefined && updates.monthlyDiscount !== target.monthlyDiscount) {
      addStudentAccountHistory({
        studentId: id,
        category: 'discount',
        actionTitle: `Monthly Discount Updated: Rs. ${target.monthlyDiscount} → Rs. ${updates.monthlyDiscount}`,
        description: `Monthly fee concession adjusted from Rs. ${target.monthlyDiscount} to Rs. ${updates.monthlyDiscount}.`,
        previousValue: `Rs. ${target.monthlyDiscount}`,
        newValue: `Rs. ${updates.monthlyDiscount}`,
      });
    }

    const sanitizedUpdates = { ...updates };
    if (sanitizedUpdates.dob !== undefined) {
      sanitizedUpdates.dob = sanitizedUpdates.dob ? (normalizeDateToISO(sanitizedUpdates.dob) || sanitizedUpdates.dob) : '';
    }
    if (sanitizedUpdates.admissionDate !== undefined) {
      sanitizedUpdates.admissionDate = sanitizedUpdates.admissionDate ? (normalizeDateToISO(sanitizedUpdates.admissionDate) || sanitizedUpdates.admissionDate) : '';
    }

    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        return {
          ...s,
          ...sanitizedUpdates,
          familyId: newFamilyId,
        };
      })
    );
    return { success: true };
  };

  const deleteStudent = (id: string) => {
    const perm = ensureMutationAllowed('Student deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    const studentVouchers = vouchers.filter((v) => v.studentId === id);
    if (studentVouchers.length > 0) {
      return {
        success: false,
        error: `Cannot delete student. ${studentVouchers.length} fee voucher records exist for this student. Delete vouchers first.`,
      };
    }

    setStudents((prev) => prev.filter((s) => s.id !== id));
    studentsRef.current = studentsRef.current.filter((s) => s.id !== id);

    setFamilies((prev) =>
      prev.map((f) => ({ ...f, memberStudentIds: f.memberStudentIds.filter((mId) => mId !== id) }))
    );
    familiesRef.current = familiesRef.current.map((f) => ({
      ...f,
      memberStudentIds: f.memberStudentIds.filter((mId) => mId !== id),
    }));

    setTransportAssignments((prev) => prev.filter((a) => a.studentId !== id));
    setTemplates((prev) => prev.filter((t) => t.studentId !== id));
    return { success: true };
  };

  const bulkDeleteStudents = (ids: string[]) => {
    const perm = ensureMutationAllowed('Bulk student deletion');
    if (!perm.allowed) return { deletedCount: 0, skippedIds: ids };

    let deletedCount = 0;
    const skippedIds: string[] = [];

    ids.forEach((id) => {
      const res = deleteStudent(id);
      if (res.success) {
        deletedCount++;
      } else {
        skippedIds.push(id);
      }
    });

    return { deletedCount, skippedIds };
  };

  // Family Management
  const addFamily = (familyData: Omit<Family, 'id' | 'familyNo'>) => {
    const perm = ensureMutationAllowed('Family creation');
    if (!perm.allowed) return { success: false, error: perm.error };

    const year = new Date().getFullYear();
    familySeqRef.current += 1;
    const familyNo = `FAM${year}-${familySeqRef.current.toString().padStart(4, '0')}`;
    const newFamily: Family = {
      ...familyData,
      id: generateUniqueId('fam'),
      familyNo,
      fatherCnic: familyData.fatherCnic?.trim() || '',
    };
    setFamilies((prev) => [...prev, newFamily]);
    familiesRef.current = [...familiesRef.current, newFamily];
    return { success: true, family: newFamily };
  };

  const updateFamily = (id: string, updates: Partial<Family>) => {
    const perm = ensureMutationAllowed('Family update');
    if (!perm.allowed) return { success: false, error: perm.error };

    const sanitized = { ...updates };
    if (sanitized.fatherCnic !== undefined) {
      sanitized.fatherCnic = sanitized.fatherCnic.trim();
    }
    setFamilies((prev) => prev.map((f) => (f.id === id ? { ...f, ...sanitized } : f)));
    familiesRef.current = familiesRef.current.map((f) => (f.id === id ? { ...f, ...sanitized } : f));
    return { success: true };
  };

  const deleteFamily = (id: string) => {
    const perm = ensureMutationAllowed('Family deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    setFamilies((prev) => prev.filter((f) => f.id !== id));
    familiesRef.current = familiesRef.current.filter((f) => f.id !== id);

    setStudents((prev) =>
      prev.map((s) => (s.familyId === id ? { ...s, familyId: undefined } : s))
    );
    studentsRef.current = studentsRef.current.map((s) =>
      s.familyId === id ? { ...s, familyId: undefined } : s
    );
    return { success: true };
  };

  const addStudentToFamily = (familyId: string, studentId: string) => {
    const perm = ensureMutationAllowed('Family student assignment');
    if (!perm.allowed) return;

    // 1. Update student's familyId
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, familyId } : s))
    );
    studentsRef.current = studentsRef.current.map((s) =>
      s.id === studentId ? { ...s, familyId } : s
    );
    // 2. Add to target family and remove from any previous family
    const updateFamilyMembers = (prevFamilies: Family[]) =>
      prevFamilies.map((f) => {
        if (f.id === familyId) {
          return {
            ...f,
            memberStudentIds: Array.from(new Set([...f.memberStudentIds.filter((id) => id !== studentId), studentId])),
          };
        } else {
          return {
            ...f,
            memberStudentIds: f.memberStudentIds.filter((id) => id !== studentId),
          };
        }
      });
    setFamilies(updateFamilyMembers);
    familiesRef.current = updateFamilyMembers(familiesRef.current);
  };

  const removeStudentFromFamily = (familyId: string, studentId: string) => {
    const perm = ensureMutationAllowed('Family student removal');
    if (!perm.allowed) return;
    // 1. Unset student's familyId if it matches this family
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId && s.familyId === familyId ? { ...s, familyId: undefined } : s))
    );
    studentsRef.current = studentsRef.current.map((s) =>
      s.id === studentId && s.familyId === familyId ? { ...s, familyId: undefined } : s
    );
    // 2. Remove student ID from this family
    const updateFamilyRemoval = (prevFamilies: Family[]) =>
      prevFamilies.map((f) =>
        f.id === familyId
          ? { ...f, memberStudentIds: f.memberStudentIds.filter((id) => id !== studentId) }
          : f
      );
    setFamilies(updateFamilyRemoval);
    familiesRef.current = updateFamilyRemoval(familiesRef.current);
  };

  // Transport Management
  const addBus = (bus: Omit<TransportBus, 'id'>) => {
    const perm = ensureMutationAllowed('Bus addition');
    if (!perm.allowed) return { success: false, error: perm.error };

    if (buses.some((b) => b.busNumber.toLowerCase() === bus.busNumber.toLowerCase())) {
      return { success: false, error: 'Bus number already exists.' };
    }
    const newBus: TransportBus = { ...bus, id: `bus-${Date.now()}` };
    // Insert at the requested position and resequence, same rationale as
    // addClass: a plain sort() leaves a duplicate sortOrder when the
    // requested position is already occupied instead of shifting others.
    const existing = [...buses].sort((a, b) => a.sortOrder - b.sortOrder);
    const clampedIndex = Math.min(Math.max(newBus.sortOrder - 1, 0), existing.length);
    existing.splice(clampedIndex, 0, newBus);
    setBuses(existing.map((b, idx) => ({ ...b, sortOrder: idx + 1 })));
    return { success: true };
  };

  const updateBus = (id: string, updates: Partial<TransportBus>) => {
    const perm = ensureMutationAllowed('Bus update');
    if (!perm.allowed) return { success: false, error: perm.error };

    if (updates.busNumber) {
      const exists = buses.some(
        (b) => b.id !== id && b.busNumber.toLowerCase() === updates.busNumber?.trim().toLowerCase()
      );
      if (exists) return { success: false, error: 'Bus number already exists.' };
    }

    const current = buses.find((b) => b.id === id);
    if (!current) return { success: false, error: 'Bus not found.' };

    // If the Sort Position # was manually changed, resequence the whole
    // fleet list around the new position -- same rationale as updateClass
    // above, and consistent with what drag-and-drop (reorderBuses) does.
    if (updates.sortOrder !== undefined && updates.sortOrder !== current.sortOrder) {
      const others = buses.filter((b) => b.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
      const clampedIndex = Math.min(Math.max(updates.sortOrder - 1, 0), others.length);
      others.splice(clampedIndex, 0, { ...current, ...updates });
      setBuses(others.map((b, idx) => ({ ...b, sortOrder: idx + 1 })));
      return { success: true };
    }

    setBuses((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
    return { success: true };
  };

  const deleteBus = (id: string) => {
    const perm = ensureMutationAllowed('Bus deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    const activeAssignments = transportAssignments.filter(
      (a) => a.busId === id && students.some((s) => s.id === a.studentId && s.status === 'Active')
    );
    if (activeAssignments.length > 0) {
      return {
        success: false,
        error: `Cannot delete bus. ${activeAssignments.length} active student transport assignments refer to this bus.`,
      };
    }
    setTransportAssignments((prev) => prev.filter((a) => a.busId !== id));
    setBuses((prev) => prev.filter((b) => b.id !== id));
    return { success: true };
  };

  const reorderBuses = (reorderedBuses: TransportBus[]) => {
    const perm = ensureMutationAllowed('Bus reordering');
    if (!perm.allowed) return;

    const updated = reorderedBuses.map((bus, idx) => ({
      ...bus,
      sortOrder: idx + 1,
    }));
    setBuses(updated);
    return { success: true };
  };

  const addStop = (stop: Omit<TransportStop, 'id'>) => {
    const perm = ensureMutationAllowed('Stop addition');
    if (!perm.allowed) return { success: false, error: perm.error };

    if (stops.some((s) => s.name.toLowerCase() === stop.name.toLowerCase())) {
      return { success: false, error: 'Bus stop name already exists.' };
    }
    const newStop: TransportStop = {
      ...stop,
      id: `stop-${Date.now()}`,
      monthlyFare: stop.monthlyFare,
    };
    // Insert at the requested position and resequence, same rationale as
    // addClass/addBus above.
    const existing = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
    const clampedIndex = Math.min(Math.max(newStop.sortOrder - 1, 0), existing.length);
    existing.splice(clampedIndex, 0, newStop);
    setStops(existing.map((s, idx) => ({ ...s, sortOrder: idx + 1 })));
    return { success: true };
  };

  const updateStop = (id: string, updates: Partial<TransportStop>) => {
    const perm = ensureMutationAllowed('Stop update');
    if (!perm.allowed) return { success: false, error: perm.error };

    if (updates.name) {
      const exists = stops.some(
        (s) => s.id !== id && s.name.toLowerCase() === updates.name?.trim().toLowerCase()
      );
      if (exists) return { success: false, error: 'Bus stop name already exists.' };
    }

    const current = stops.find((s) => s.id === id);
    if (!current) return { success: false, error: 'Bus stop not found.' };

    const patchedFields: Partial<TransportStop> = {
      ...updates,
      monthlyFare: updates.monthlyFare !== undefined ? updates.monthlyFare : current.monthlyFare,
    };

    // If the Sort Position # was manually changed, resequence the whole
    // stop list around the new position -- same rationale as updateClass /
    // updateBus above, and consistent with what drag-and-drop (reorderStops)
    // does.
    if (updates.sortOrder !== undefined && updates.sortOrder !== current.sortOrder) {
      const others = stops.filter((s) => s.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
      const clampedIndex = Math.min(Math.max(updates.sortOrder - 1, 0), others.length);
      others.splice(clampedIndex, 0, { ...current, ...patchedFields });
      setStops(others.map((s, idx) => ({ ...s, sortOrder: idx + 1 })));
      return { success: true };
    }

    setStops((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ...patchedFields,
            }
          : s
      )
    );
    return { success: true };
  };

  const deleteStop = (id: string) => {
    const perm = ensureMutationAllowed('Stop deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    const activeAssignments = transportAssignments.filter(
      (a) => a.stopId === id && students.some((s) => s.id === a.studentId && s.status === 'Active')
    );
    if (activeAssignments.length > 0) {
      return {
        success: false,
        error: `Cannot delete bus stop. ${activeAssignments.length} active student transport assignments refer to this stop.`,
      };
    }
    setTransportAssignments((prev) => prev.filter((a) => a.stopId !== id));
    setStops((prev) => prev.filter((s) => s.id !== id));
    return { success: true };
  };

  const reorderStops = (reorderedStops: TransportStop[]) => {
    const perm = ensureMutationAllowed('Stop reordering');
    if (!perm.allowed) return;

    const updated = reorderedStops.map((stop, idx) => ({
      ...stop,
      sortOrder: idx + 1,
    }));
    setStops(updated);
    return { success: true };
  };

  const bulkSaveTransportStops = (
    stopsList: Array<Omit<TransportStop, 'id'> & { id?: string }>
  ) => {
    const perm = ensureMutationAllowed('Bulk stop save');
    if (!perm.allowed) return { success: false, count: 0, addedCount: 0, updatedCount: 0 };
    let addedCount = 0;
    let updatedCount = 0;
    setStops((prev) => {
      let currentStops = [...prev];
      for (const item of stopsList) {
        const cleanName = item.name.trim();
        const existingIdx = currentStops.findIndex(
          (s) =>
            (item.id && s.id === item.id) ||
            s.name.toLowerCase() === cleanName.toLowerCase()
        );
        const fare = item.monthlyFare || 0;

        if (existingIdx >= 0) {
          currentStops[existingIdx] = {
            ...currentStops[existingIdx],
            name: cleanName,
            area: item.area !== undefined ? item.area.trim() : currentStops[existingIdx].area,
            landmark: item.landmark !== undefined ? item.landmark.trim() : currentStops[existingIdx].landmark,
            monthlyFare: fare,
            sortOrder: item.sortOrder || currentStops[existingIdx].sortOrder,
          };
          updatedCount++;
        } else {
          const nextSortOrder = item.sortOrder || currentStops.length + 1;
          const newStop: TransportStop = {
            id: item.id || generateUniqueId('stop'),
            name: cleanName,
            area: (item.area || '').trim(),
            landmark: (item.landmark || '').trim(),
            monthlyFare: fare,
            sortOrder: nextSortOrder,
          };
          currentStops.push(newStop);
          addedCount++;
        }
      }
      currentStops.sort((a, b) => a.sortOrder - b.sortOrder);
      return currentStops.map((s, idx) => ({ ...s, sortOrder: idx + 1 }));
    });
    return { success: true, count: stopsList.length, addedCount, updatedCount };
  };

  const saveTransportAssignment = (
    assignment: Omit<TransportAssignment, 'id'> & { id?: string }
  ) => {
    const perm = ensureMutationAllowed('Transport assignment save');
    if (!perm.allowed) return { success: false, error: perm.error };

    const stop = stops.find((s) => s.id === assignment.stopId);
    const bus = buses.find((b) => b.id === assignment.busId);
    const monthName = formatMonthName(assignment.month);
    const fare = stop?.monthlyFare ? Math.max(0, stop.monthlyFare - (assignment.discount || 0)) : 0;

    if (assignment.id) {
      const existing = transportAssignments.find((a) => a.id === assignment.id);
      const isDeactivated = assignment.active === false && existing?.active !== false;
      addStudentAccountHistory({
        studentId: assignment.studentId,
        date: new Date().toISOString().split('T')[0],
        category: 'transport',
        actionTitle: isDeactivated ? `Transport Deactivated (${monthName})` : `Transport Updated (${monthName})`,
        description: isDeactivated
          ? `Transport route deactivated for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'}.`
          : `Transport route updated for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'} (${assignment.tripType === 'OneWay' ? 'One Way' : 'Round Trip'}). Monthly fare: Rs. ${fare}.`,
        previousValue: existing ? `${stops.find((s) => s.id === existing.stopId)?.name || 'Stop'} (${buses.find((b) => b.id === existing.busId)?.busNumber || 'Bus'})` : undefined,
        newValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
        month: assignment.month,
      });

      setTransportAssignments((prev) =>
        prev.map((a) => (a.id === assignment.id ? { ...a, ...assignment } : a))
      );
      return { success: true };
    }

    // Check if assignment already exists for student + month
    const existing = transportAssignments.find(
      (a) => a.studentId === assignment.studentId && a.month === assignment.month
    );

    if (existing) {
      addStudentAccountHistory({
        studentId: assignment.studentId,
        date: new Date().toISOString().split('T')[0],
        category: 'transport',
        actionTitle: `Transport Updated (${monthName})`,
        description: `Transport assignment updated for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'}. Monthly fare: Rs. ${fare}.`,
        previousValue: `${stops.find((s) => s.id === existing.stopId)?.name || 'Stop'} (${buses.find((b) => b.id === existing.busId)?.busNumber || 'Bus'})`,
        newValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
        month: assignment.month,
      });
      setTransportAssignments((prev) =>
        prev.map((a) => (a.id === existing.id ? { ...a, ...assignment } : a))
      );
    } else {
      addStudentAccountHistory({
        studentId: assignment.studentId,
        date: new Date().toISOString().split('T')[0],
        category: 'transport',
        actionTitle: `Transport Added (${monthName})`,
        description: `Transport route assigned for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'} (${bus?.routeName || 'Route'}) - ${assignment.tripType === 'OneWay' ? 'One Way' : 'Round Trip'}. Monthly fare: Rs. ${fare}.`,
        previousValue: 'No Transport',
        newValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
        month: assignment.month,
      });
      const newAsgn: TransportAssignment = {
        ...assignment,
        id: `asgn-${Date.now()}`,
      };
      setTransportAssignments((prev) => [...prev, newAsgn]);
    }
    return { success: true };
  };

  const bulkSaveTransportAssignments = (
    assignments: Array<Omit<TransportAssignment, 'id'> & { id?: string }>
  ) => {
    const perm = ensureMutationAllowed('Bulk transport assignments save');
    if (!perm.allowed) return { success: false, count: 0 };

    setTransportAssignments((prev) => {
      let updated = [...prev];
      for (const asgn of assignments) {
        if (asgn.id) {
          const idx = updated.findIndex((a) => a.id === asgn.id);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], ...asgn };
            continue;
          }
        }
        const existingIdx = updated.findIndex(
          (a) => a.studentId === asgn.studentId && a.month === asgn.month
        );
        if (existingIdx >= 0) {
          updated[existingIdx] = { ...updated[existingIdx], ...asgn };
        } else {
          updated.push({
            ...asgn,
            id: generateUniqueId('asgn'),
          });
        }
      }
      return updated;
    });
    return { success: true, count: assignments.length };
  };

  const deleteTransportAssignment = (id: string) => {
    const perm = ensureMutationAllowed('Transport assignment deletion');
    if (!perm.allowed) return;

    const targetAsgn = transportAssignments.find((a) => a.id === id);
    if (targetAsgn) {
      const stop = stops.find((s) => s.id === targetAsgn.stopId);
      const bus = buses.find((b) => b.id === targetAsgn.busId);
      const monthName = formatMonthName(targetAsgn.month);
      addStudentAccountHistory({
        studentId: targetAsgn.studentId,
        date: new Date().toISOString().split('T')[0],
        category: 'transport',
        actionTitle: `Transport Removed (${monthName})`,
        description: `Transport assignment removed for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'}. Transport fee will not be billed.`,
        previousValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
        newValue: 'Removed / None',
        month: targetAsgn.month,
      });
    }
    setTransportAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  const copyTransportAssignmentsFromPreviousMonth = (
    targetMonth: string,
    daysChargedOverride?: number
  ) => {
    const perm = ensureMutationAllowed('Copy transport assignments');
    if (!perm.allowed) {
      return { success: false, copiedCount: 0, skippedCount: 0, inactiveSkippedCount: 0, error: perm.error };
    }

    if (!targetMonth || !targetMonth.includes('-')) {
      return { success: false, copiedCount: 0, skippedCount: 0, inactiveSkippedCount: 0, error: 'Invalid target month' };
    }

    // Determine previous month YYYY-MM
    const [yStr, mStr] = targetMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const prevMonth = `${y}-${String(m).padStart(2, '0')}`;

    const prevAssignments = transportAssignments.filter((a) => a.month === prevMonth && a.active);
    if (prevAssignments.length === 0) {
      return {
        success: false,
        copiedCount: 0,
        skippedCount: 0,
        inactiveSkippedCount: 0,
        error: `No active transport assignments found in previous month (${prevMonth}).`,
      };
    }

    const currentMonthDays = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
    const effectiveDays =
      daysChargedOverride !== undefined && !isNaN(daysChargedOverride) && daysChargedOverride >= 0
        ? Math.min(daysChargedOverride, currentMonthDays)
        : currentMonthDays;

    let copiedCount = 0;
    let skippedCount = 0;
    let inactiveSkippedCount = 0;
    const newAssignmentsToAdd: TransportAssignment[] = [];

    prevAssignments.forEach((prevAsgn) => {
      // 1. Verify student exists and is active
      const student = students.find((s) => s.id === prevAsgn.studentId);
      if (!student || student.status !== 'Active') {
        inactiveSkippedCount++;
        return;
      }

      // 2. Check if student already has an assignment in target month
      const alreadyHas = transportAssignments.some(
        (a) => a.studentId === prevAsgn.studentId && a.month === targetMonth
      );
      if (alreadyHas) {
        skippedCount++;
        return;
      }

      // 3. Create cloned assignment for target month with specified or full active days
      newAssignmentsToAdd.push({
        id: generateUniqueId('asgn'),
        studentId: prevAsgn.studentId,
        month: targetMonth,
        busId: prevAsgn.busId,
        stopId: prevAsgn.stopId,
        tripType: prevAsgn.tripType,
        daysCharged: effectiveDays,
        discount: prevAsgn.discount || 0,
        active: true,
      });
      copiedCount++;
    });

    if (newAssignmentsToAdd.length > 0) {
      setTransportAssignments((prev) => [...prev, ...newAssignmentsToAdd]);
    }

    return {
      success: true,
      copiedCount,
      skippedCount,
      inactiveSkippedCount,
    };
  };

  const bulkUpdateTransportDaysForMonth = (targetMonth: string, daysCharged: number) => {
    const perm = ensureMutationAllowed('Bulk update transport days');
    if (!perm.allowed) return { success: false, updatedCount: 0 };

    if (!targetMonth || !targetMonth.includes('-')) return { success: false, updatedCount: 0 };
    const [yStr, mStr] = targetMonth.split('-');
    const maxDays = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
    const clampedDays = Math.min(Math.max(daysCharged, 0), maxDays);

    const matchedCount = transportAssignments.filter((a) => a.month === targetMonth).length;
    setTransportAssignments((prev) =>
      prev.map((a) => (a.month === targetMonth ? { ...a, daysCharged: clampedDays } : a))
    );

    return { success: true, updatedCount: matchedCount };
  };

  // Fee Particular Templates
  const saveGlobalTemplate = (template: Omit<FeeTemplate, 'id'>, month?: string) => {
    const perm = ensureMutationAllowed('Save global fee template');
    if (!perm.allowed) return;

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    setTemplates((prev) => {
      const existing = prev.find(
        (t) =>
          !t.studentId &&
          !t.classId &&
          t.kind === template.kind &&
          (isAll ? (!t.month || t.month === 'all') : t.month === month)
      );
      if (existing) {
        return prev.map((t) =>
          t.id === existing.id ? { ...t, ...template, month: targetMonth } : t
        );
      } else {
        const newTpl: FeeTemplate = {
          ...template,
          id: generateUniqueId('tpl'),
          month: targetMonth,
        };
        return [...prev, newTpl].sort((a, b) => a.sortOrder - b.sortOrder);
      }
    });
  };

  const updateGlobalTemplatesList = (newTemplates: FeeTemplate[], month?: string) => {
    const perm = ensureMutationAllowed('Update global fee templates');
    if (!perm.allowed) return;

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    setTemplates((prev) => {
      // Keep per-student and per-class overrides, and global templates belonging to the other scope
      const preserved = prev.filter((t) => {
        if (t.studentId || t.classId) return true;
        const tplIsAll = !t.month || t.month === 'all';
        if (isAll) {
          // Updating all-months global, so keep specific-month global templates
          return !tplIsAll;
        } else {
          // Updating specific-month global, so keep all-months global and other months' global
          return tplIsAll || t.month !== month;
        }
      });
      const taggedNewTemplates = newTemplates.map((tpl, idx) => ({
        ...tpl,
        month: targetMonth,
        sortOrder: tpl.sortOrder ?? (idx + 1),
      }));
      return [...preserved, ...taggedNewTemplates];
    });
  };

  const deleteGlobalTemplates = (month?: string) => {
    const perm = ensureMutationAllowed('Delete global fee templates');
    if (!perm.allowed) return;

    const isAll = !month || month === 'all';
    setTemplates((prev) => {
      if (isAll) {
        // Reset all-months global templates to defaults, keeping specific-month global & overrides
        const preserved = prev.filter((t) => (t.studentId || t.classId) || (t.month && t.month !== 'all'));
        return [...INITIAL_GLOBAL_TEMPLATES, ...preserved];
      } else {
        // Delete the global override for this specific month
        return prev.filter((t) => !(!t.studentId && !t.classId && t.month === month));
      }
    });
  };

  const saveStudentTemplateOverride = (
    studentId: string,
    kind: ParticularKind,
    label: string,
    amount: number,
    month?: string
  ) => {
    const perm = ensureMutationAllowed('Save student fee template override');
    if (!perm.allowed) return;

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    setTemplates((prev) => {
      const existing = prev.find(
        (t) =>
          t.studentId === studentId &&
          t.kind === kind &&
          (isAll ? (!t.month || t.month === 'all') : t.month === month)
      );
      if (existing) {
        return prev.map((t) =>
          t.id === existing.id
            ? { ...t, label, defaultAmount: amount, month: targetMonth }
            : t
        );
      } else {
        const newTpl: FeeTemplate = {
          id: generateUniqueId('tpl-override'),
          studentId,
          month: targetMonth,
          kind,
          label,
          defaultAmount: amount,
          sortOrder: 10,
        };
        return [...prev, newTpl];
      }
    });
  };

  const saveClassTemplateOverrides = (
    classId: string,
    month: string,
    items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>
  ) => {
    const perm = ensureMutationAllowed('Save class fee template overrides');
    if (!perm.allowed) return;

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    setTemplates((prev) => {
      // Find existing overrides for this class in this scope to reuse IDs and avoid churn
      const existingScopeMap = new Map<string, FeeTemplate>();
      prev.forEach((t) => {
        if (!t.studentId && t.classId === classId) {
          const tplIsAll = !t.month || t.month === 'all';
          if ((isAll && tplIsAll) || (!isAll && t.month === month)) {
            existingScopeMap.set(t.kind, t);
          }
        }
      });

      // Remove existing overrides for this class in this scope
      const filtered = prev.filter((t) => {
        if (t.studentId || t.classId !== classId) return true;
        const tplIsAll = !t.month || t.month === 'all';
        if (isAll) return !tplIsAll;
        return t.month !== month;
      });

      const cleanClassId = classId.replace(/^cls-/, '');
      const newOverrides: FeeTemplate[] = items.map((item) => {
        const existing = existingScopeMap.get(item.kind);
        const candidateId = existing?.id && existing.id.length <= 64
          ? existing.id
          : `tpl-c-${cleanClassId}-${item.kind.toLowerCase()}-${targetMonth}`;
        const id = candidateId.length <= 64 ? candidateId : candidateId.slice(0, 64);
        return {
          id,
          classId,
          month: targetMonth,
          kind: item.kind,
          label: item.label,
          defaultAmount: item.defaultAmount,
          sortOrder: item.sortOrder,
        };
      });
      return [...filtered, ...newOverrides];
    });
  };

  const deleteClassTemplates = (classId: string, month?: string) => {
    const perm = ensureMutationAllowed('Delete class fee templates');
    if (!perm.allowed) return;

    setTemplates((prev) =>
      prev.filter((t) => {
        if (t.studentId || t.classId !== classId) return true;
        if (!month || month === 'both') return false; // remove all overrides for this class
        const tplIsAll = !t.month || t.month === 'all';
        if (month === 'all') return !tplIsAll;
        return t.month !== month;
      })
    );
  };

  const saveStudentTemplateOverrides = (
    studentId: string,
    month: string,
    items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>
  ) => {
    const perm = ensureMutationAllowed('Save student fee template overrides');
    if (!perm.allowed) return;

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    setTemplates((prev) => {
      // Find existing overrides for this student in this scope to reuse IDs and avoid churn
      const existingScopeMap = new Map<string, FeeTemplate>();
      prev.forEach((t) => {
        if (t.studentId === studentId) {
          const tplIsAll = !t.month || t.month === 'all';
          if ((isAll && tplIsAll) || (!isAll && t.month === month)) {
            existingScopeMap.set(t.kind, t);
          }
        }
      });

      // Remove existing overrides for this student in this scope
      const filtered = prev.filter((t) => {
        if (t.studentId !== studentId) return true;
        const tplIsAll = !t.month || t.month === 'all';
        if (isAll) return !tplIsAll;
        return t.month !== month;
      });

      const cleanStudentId = studentId.replace(/^stu-/, '');
      const newOverrides: FeeTemplate[] = items.map((item) => {
        const existing = existingScopeMap.get(item.kind);
        const candidateId = existing?.id && existing.id.length <= 64
          ? existing.id
          : `tpl-s-${cleanStudentId}-${item.kind.toLowerCase()}-${targetMonth}`;
        const id = candidateId.length <= 64 ? candidateId : candidateId.slice(0, 64);
        return {
          id,
          studentId,
          month: targetMonth,
          kind: item.kind,
          label: item.label,
          defaultAmount: item.defaultAmount,
          sortOrder: item.sortOrder,
        };
      });
      return [...filtered, ...newOverrides];
    });
  };

  const bulkSaveMultipleStudentTemplateOverrides = (
    entries: Array<{
      studentId: string;
      items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>;
    }>,
    month: string
  ) => {
    const perm = ensureMutationAllowed('Bulk save student fee template overrides');
    if (!perm.allowed) return;

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    setTemplates((prev) => {
      const studentIdsSet = new Set(entries.map((e) => e.studentId));
      const filtered = prev.filter((t) => {
        if (!t.studentId || !studentIdsSet.has(t.studentId)) return true;
        const tplIsAll = !t.month || t.month === 'all';
        if (isAll) return !tplIsAll;
        return t.month !== month;
      });
      const newOverrides: FeeTemplate[] = [];
      entries.forEach(({ studentId, items }) => {
        const cleanStudentId = studentId.replace(/^stu-/, '');
        items.forEach((item) => {
          const candidateId = `tpl-s-${cleanStudentId}-${item.kind.toLowerCase()}-${targetMonth}`;
          newOverrides.push({
            id: candidateId.length <= 64 ? candidateId : candidateId.slice(0, 64),
            studentId,
            month: targetMonth,
            kind: item.kind,
            label: item.label,
            defaultAmount: item.defaultAmount,
            sortOrder: item.sortOrder,
          });
        });
      });
      return [...filtered, ...newOverrides];
    });
  };

  const deleteStudentTemplates = (studentId: string, month?: string) => {
    const perm = ensureMutationAllowed('Delete student fee templates');
    if (!perm.allowed) return;

    setTemplates((prev) =>
      prev.filter((t) => {
        if (t.studentId !== studentId) return true;
        if (!month || month === 'both') return false;
        const tplIsAll = !t.month || t.month === 'all';
        if (month === 'all') return !tplIsAll;
        return t.month !== month;
      })
    );
  };

  const resetAllTemplates = (month?: string) => {
    const perm = ensureMutationAllowed('Reset fee templates');
    if (!perm.allowed) return;

    setTemplates((prev) => {
      if (!month || month === 'all') {
        return [...INITIAL_GLOBAL_TEMPLATES];
      }
      return prev.filter((t) => t.month !== month);
    });
  };

  const deleteTemplate = (id: string) => {
    const perm = ensureMutationAllowed('Delete fee template');
    if (!perm.allowed) return;

    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  // Month Closure Check Helper
  const getMonthClosureStatus = (month: string): MonthClosureStatus => {
    const monthVouchers = vouchers.filter((v) => v.month === month && v.status !== 'Reversed');
    const totalVouchers = monthVouchers.length;

    // Uncarried unpaid vouchers are non-carried vouchers where netDue > 0 and amountPaid < netDue
    const uncarriedUnpaid = monthVouchers.filter(
      (v) => (v.status === 'Issued' || v.status === 'Partial') && v.netDue > 0 && v.amountPaid < v.netDue
    );

    const paidCount = monthVouchers.filter(
      (v) => v.status === 'Paid' || (v.netDue <= 0 && v.status !== 'Carried')
    ).length;
    const carriedCount = monthVouchers.filter((v) => v.status === 'Carried').length;
    const reversedCount = vouchers.filter((v) => v.month === month && v.status === 'Reversed').length;

    const isLocked = lockedMonths.includes(month);
    // A month is closed if explicitly locked OR if there are vouchers generated and NO uncarried unpaid vouchers
    const isClosed = isLocked || (totalVouchers > 0 && uncarriedUnpaid.length === 0);

    return {
      month,
      isClosed,
      isLocked,
      totalVouchers,
      uncarriedUnpaidCount: uncarriedUnpaid.length,
      paidCount,
      carriedCount,
      reversedCount,
    };
  };

  const isMonthLocked = (month: string): boolean => {
    return lockedMonths.includes(month);
  };

  const lockMonth = (month: string, notes?: string): { success: boolean; error?: string } => {
    const perm = ensureMutationAllowed('Lock fee books');
    if (!perm.allowed) return { success: false, error: perm.error };

    if (!month) return { success: false, error: 'Month parameter is required' };
    if (!hasPermission('settings.manage') && currentUser.role !== 'Admin' && !hasPermission('fees.generate')) {
      return { success: false, error: 'Unauthorized: insufficient permissions to lock fee books.' };
    }

    if (!lockedMonths.includes(month)) {
      setLockedMonths((prev) => [...prev, month]);
    }

    logAuditEvent({
      actionType: 'month_closure',
      actionTitle: `Fee Books Locked for ${formatMonthName(month)}`,
      description: notes || `Fee books for ${formatMonthName(month)} (${month}) were reconciled and locked.`,
      module: 'Settings',
      month,
      metadata: {
        month,
        lockedAt: new Date().toISOString(),
        lockedBy: currentUser.username,
        notes: notes || '',
      },
    });

    showToast(`Fee books for ${formatMonthName(month)} (${month}) locked successfully.`, 'success');
    return { success: true };
  };

  const unlockMonth = (month: string): { success: boolean; error?: string } => {
    const perm = ensureMutationAllowed('Unlock fee books');
    if (!perm.allowed) return { success: false, error: perm.error };

    if (!month) return { success: false, error: 'Month parameter is required' };
    if (!hasPermission('settings.manage') && currentUser.role !== 'Admin') {
      return { success: false, error: 'Unauthorized: only Administrators can unlock historical fee books.' };
    }

    setLockedMonths((prev) => prev.filter((m) => m !== month));

    logAuditEvent({
      actionType: 'month_closure',
      actionTitle: `Fee Books Unlocked for ${formatMonthName(month)}`,
      description: `Administrator unlocked historical fee books for ${formatMonthName(month)} (${month}).`,
      module: 'Settings',
      month,
      metadata: {
        month,
        unlockedAt: new Date().toISOString(),
        unlockedBy: currentUser.username,
      },
    });

    showToast(`Fee books for ${formatMonthName(month)} unlocked.`, 'info');
    return { success: true };
  };

  // Preview Voucher Generation
  const previewVoucherGeneration = (
    month: string,
    scope: 'all' | 'class' | 'students',
    classId?: string,
    selectedStudentIds?: string[]
  ) => {
    // Check Month Closure Gate constraint:
    // Generating for a new month is BLOCKED if the previous month still has uncarried unpaid vouchers!
    const prevMonthStr = getPreviousMonthString(month);
    const prevMonthStatus = getMonthClosureStatus(prevMonthStr);

    let closureMessage: string | undefined = undefined;
    let monthClosureBlocked = false;

    if (prevMonthStatus.totalVouchers > 0 && !prevMonthStatus.isClosed) {
      monthClosureBlocked = true;
      closureMessage = `Cannot generate vouchers for ${month}. Previous month (${prevMonthStr}) has ${prevMonthStatus.uncarriedUnpaidCount} uncarried outstanding voucher(s). Please close or carry-forward ${prevMonthStr} defaulters first.`;
    }

    let targetStudents = students.filter((s) => s.status === 'Active');
    if (scope === 'class' && classId) {
      targetStudents = targetStudents.filter((s) => s.classId === classId);
    } else if (scope === 'students') {
      const ids = selectedStudentIds || [];
      targetStudents = targetStudents.filter((s) => ids.includes(s.id));
    }

    const previews = targetStudents.map((student) => {
      const cls = classes.find((c) => c.id === student.classId);
      return calculateStudentVoucherPreview(
        student,
        cls,
        month,
        templates,
        transportAssignments,
        stops,
        vouchers,
        priorMonthRule,
        skippedMonthRule,
        roundingEnabled ? roundingMultiple : 1,
        transportRoundingMultiple
      );
    });

    return { previews, monthClosureBlocked, closureMessage };
  };

  // Generate Admission Voucher (one-time, pre-billing-start)
  // Bypasses firstBillingMonth gate. Particulars: Flex1 + Flex2 (+ Flex3/4 if set).
  // No tuition, no transport, no monthly discount.
  const generateAdmissionVoucher = (
    studentId: string,
    month: string,
    options: { dueDate?: string; lateFeeRate?: number; notes?: string; items?: { kind: ParticularKind; label: string; amount: number }[] } = {}
  ): { success: boolean; voucher?: FeeVoucher; error?: string } => {
    const perm = ensureMutationAllowed('Admission voucher generation');
    if (!perm.allowed) return { success: false, error: perm.error };

    const student = students.find((s) => s.id === studentId);
    if (!student) return { success: false, error: 'Student not found.' };
    if (student.status !== 'Active') return { success: false, error: 'Student is not active.' };

    // Block if an admission or monthly voucher already exists for this month
    const existing = vouchers.find(
      (v) => v.studentId === studentId && v.month === month && v.status !== 'Reversed'
    );
    if (existing) {
      return { success: false, error: `A voucher (${existing.voucherNo}) already exists for ${month}. Delete or reverse it first.` };
    }

    const kindsToInclude: { kind: ParticularKind; defaultLabel: string }[] = [
      { kind: 'Flex1', defaultLabel: 'Admission Fee' },
      { kind: 'Flex2', defaultLabel: 'Registration Fee' },
      { kind: 'Flex3', defaultLabel: 'Exam Fee' },
      { kind: 'Flex4', defaultLabel: 'Other' },
    ];

    // When explicit items are passed (e.g. the admission modal's edited heads),
    // use them directly so generation does not depend on template state that
    // may not have committed yet. Otherwise fall back to template resolution.
    if (options.items && options.items.length > 0) {
      const particulars: VoucherItem[] = options.items
        .filter((it) => (Number(it.amount) || 0) > 0)
        .map((it) => ({
          kind: it.kind,
          label: it.label.trim(),
          amount: Number(it.amount) || 0,
        }))
        .sort(
          (a, b) =>
            kindsToInclude.findIndex((k) => k.kind === a.kind) -
            kindsToInclude.findIndex((k) => k.kind === b.kind)
        );

      if (particulars.length === 0) {
        return {
          success: false,
          error:
            'No admission charges are configured (Admission Fee / Registration Fee / Exam Fee / Other are all zero). ' +
            'Please enter amounts before generating an Admission Voucher.',
        };
      }

      const grossTotal = particulars.reduce((s, p) => s + p.amount, 0);
      const generationMult = roundingEnabled ? roundingMultiple : 1;
      const netDue = roundUpToMultiple(grossTotal, generationMult);

      const returnedVoucher = buildAdmissionVoucher(student, month, particulars, grossTotal, netDue, generationMult, options);
      setVouchers((prev) => [...prev, returnedVoucher]);
      apiVoucherBatchUpdate({ voucherUpserts: [returnedVoucher] })
        .then((res) => {
          if (res?.success) applyServerVoucherNumbers(res.vouchers);
        })
        .catch((err) => {
          reportFinancialSyncFailure('Admission voucher creation', err);
        });
      return { success: true, voucher: returnedVoucher };
    }

    // Resolve admission-charge templates (Flex1, Flex2, Flex3, Flex4 only)
    const studentTpls = templates.filter(
      (t) => t.studentId === studentId && (!t.month || t.month === month)
    );
    const classTpls = templates.filter(
      (t) => !t.studentId && t.classId === student.classId && (!t.month || t.month === month)
    );
    const globalTpls = templates.filter((t) => !t.studentId && !t.classId);

    const resolve = (kind: ParticularKind, defaultLabel: string) => {
      const tpl =
        studentTpls.find((t) => t.kind === kind) ??
        classTpls.find((t) => t.kind === kind) ??
        globalTpls.find((t) => t.kind === kind);
      return { label: tpl?.label || defaultLabel, amount: tpl?.defaultAmount || 0, sortOrder: tpl?.sortOrder ?? 99 };
    };

    const particulars: VoucherItem[] = [];

    kindsToInclude.forEach(({ kind, defaultLabel }) => {
      const { label, amount } = resolve(kind, defaultLabel);
      if (amount > 0) {
        particulars.push({ kind, label, amount });
      }
    });

    if (particulars.length === 0) {
      return {
        success: false,
        error:
          'No admission charges are configured (Admission Fee / Registration Fee / Exam Fee / Other are all zero). ' +
          'Please set amounts in Fee Settings → Particulars before generating an Admission Voucher.',
      };
    }

    // Sort by template sortOrder
    const sortMap = new Map<ParticularKind, number>();
    globalTpls.forEach((t) => sortMap.set(t.kind, t.sortOrder));
    classTpls.forEach((t) => sortMap.set(t.kind, t.sortOrder));
    studentTpls.forEach((t) => sortMap.set(t.kind, t.sortOrder));
    particulars.sort((a, b) => (sortMap.get(a.kind) ?? 99) - (sortMap.get(b.kind) ?? 99));

    const grossTotal = particulars.reduce((s, p) => s + p.amount, 0);
    const generationMult = roundingEnabled ? roundingMultiple : 1;
    const netDue = roundUpToMultiple(grossTotal, generationMult);

    const returnedVoucher = buildAdmissionVoucher(student, month, particulars, grossTotal, netDue, generationMult, options);
    setVouchers((prev) => [...prev, returnedVoucher]);
    apiVoucherBatchUpdate({ voucherUpserts: [returnedVoucher] })
      .then((res) => {
        if (res?.success) applyServerVoucherNumbers(res.vouchers);
      })
      .catch((err) => {
        reportFinancialSyncFailure('Admission voucher creation', err);
      });
    return { success: true, voucher: returnedVoucher };
  };

  // Replace pending placeholder voucher numbers with the numbers the server
  // minted (the database sequence is the single source of truth).
  const applyServerVoucherNumbers = (list?: { id?: string; voucherNo?: string }[]) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const numberById = new Map<string, string>();
    list.forEach((sv) => {
      if (sv?.id && sv?.voucherNo) numberById.set(sv.id, sv.voucherNo);
    });
    if (numberById.size === 0) return;
    setVouchers((prev) =>
      prev.map((v) => {
        const serverNo = numberById.get(v.id);
        return serverNo && serverNo !== v.voucherNo ? { ...v, voucherNo: serverNo } : v;
      })
    );
  };

  const buildAdmissionVoucher = (
    student: Student,
    month: string,
    particulars: VoucherItem[],
    grossTotal: number,
    netDue: number,
    roundingMultipleValue: number,
    options: { dueDate?: string; lateFeeRate?: number; notes?: string }
  ): FeeVoucher => {
    const issueDate = new Date().toISOString().split('T')[0];
    const voucherNo = pendingDocumentNumber();

    return {
      id: generateUniqueId('vch'),
      voucherNo,
      studentId: student.id,
      month,
      classId: student.classId,
      issueDate,
      dueDate: options.dueDate || (defaultDueDateEnabled ? getComputedDefaultDueDate(month) : ''),
      particulars,
      grossTotal,
      discountTotal: 0,
      prevBalance: 0,
      lateFeeRate: options.lateFeeRate ?? defaultLateFeeRate,
      roundingMultiple: roundingMultipleValue,
      netDue,
      amountPaid: 0,
      status: netDue <= 0 ? 'Paid' : 'Issued',
      voucherType: 'Admission',
      notes: options.notes,
      createdDate: issueDate,
    };
  };

  // Commit Voucher Generation
  const commitVoucherGeneration = (
    month: string,
    scope: 'all' | 'class' | 'students',
    classId?: string,
    selectedStudentIds?: string[],
    dueDate?: string,
    lateFeeRate?: number
  ) => {
    const perm = ensureMutationAllowed('Voucher generation');
    if (!perm.allowed) return { success: false, generatedCount: 0, error: perm.error };

    const appliedLateFee = lateFeeRate !== undefined ? lateFeeRate : defaultLateFeeRate;
    const { previews, monthClosureBlocked, closureMessage } = previewVoucherGeneration(
      month,
      scope,
      classId,
      selectedStudentIds
    );

    if (monthClosureBlocked) {
      return { success: false, generatedCount: 0, error: closureMessage };
    }

    const beforeBillingCount = previews.filter((p) => !p.isAlreadyGenerated && p.isBeforeFirstBillingMonth).length;
    let ungenerated = previews.filter((p) => !p.isAlreadyGenerated && !p.isBeforeFirstBillingMonth);

    if (priorMonthRule === 'strict') {
      const blockedCount = ungenerated.filter((p) => p.isBlockedByPriorRule).length;
      ungenerated = ungenerated.filter((p) => !p.isBlockedByPriorRule);

      if (ungenerated.length === 0) {
        return {
          success: false,
          generatedCount: 0,
          error:
            blockedCount > 0
              ? 'Selected student(s) cannot be generated under Strict Chronological Policy because future month voucher(s) already exist.'
              : beforeBillingCount > 0
              ? 'Selected student(s) cannot be generated because their First Fee Billing Month starts after this month.'
              : 'All selected students already have fee vouchers generated for this month.',
        };
      }
    }

    if (skippedMonthRule === 'strict') {
      const skippedBlockedCount = ungenerated.filter((p) => p.isBlockedBySkippedRule).length;
      ungenerated = ungenerated.filter((p) => !p.isBlockedBySkippedRule);

      if (ungenerated.length === 0) {
        return {
          success: false,
          generatedCount: 0,
          error:
            skippedBlockedCount > 0
              ? 'Selected student(s) cannot be generated under Strict Sequential Policy because intermediate prior month(s) were skipped.'
              : beforeBillingCount > 0
              ? 'Selected student(s) cannot be generated because their First Fee Billing Month starts after this month.'
              : 'All selected students already have fee vouchers generated for this month.',
        };
      }
    }

    if (ungenerated.length === 0) {
      return {
        success: false,
        generatedCount: 0,
        error:
          beforeBillingCount > 0
            ? 'Selected student(s) cannot be generated because their First Fee Billing Month starts after this month.'
            : 'All selected students already have fee vouchers generated for this month.',
      };
    }

    const defaultDueDate = dueDate || (defaultDueDateEnabled ? getComputedDefaultDueDate(month) : '');
    const issueDate = new Date().toISOString().split('T')[0];


    // Track prior vouchers whose unpaid balance is being folded into a
    // newly-generated voucher this round (e.g. a pre-billing-start Admission
    // voucher rolling into the first regular monthly voucher). Without
    // marking these Carried, they'd remain as permanent "ghost" unpaid
    // records even after their balance has already moved to the new voucher.
    const priorVouchersToCarry = new Map<string, string>(); // voucherId -> carryForwardMonth

    const newVouchers: FeeVoucher[] = ungenerated.map((prev) => {
      const voucherNo = pendingDocumentNumber();

      if (prev.priorVoucherShouldCarry && prev.priorVoucherId) {
        priorVouchersToCarry.set(prev.priorVoucherId, month);
      }

      return {
        id: generateUniqueId('vch'),
        voucherNo,
        studentId: prev.student.id,
        month,
        classId: prev.student.classId,
        issueDate,
        dueDate: defaultDueDate,
        particulars: prev.particulars,
        grossTotal: prev.grossTotal,
        discountTotal: prev.discountTotal,
        prevBalance: prev.prevBalance,
        lateFeeRate: appliedLateFee,
        roundingMultiple: roundingEnabled ? roundingMultiple : 1,
        netDue: prev.netDue,
        amountPaid: 0,
        status: prev.netDue <= 0 ? 'Paid' : 'Issued',
        createdDate: issueDate,
      };
    });

    // Apply the Carried status to source vouchers in the same state update
    // that adds the new vouchers, whichever commit path below runs.
    const applyCarryMarks = (list: FeeVoucher[]): FeeVoucher[] => {
      if (priorVouchersToCarry.size === 0) return list;
      return list.map((v) =>
        priorVouchersToCarry.has(v.id)
          ? { ...v, status: 'Carried' as VoucherStatus, carryForwardMonth: priorVouchersToCarry.get(v.id) }
          : v
      );
    };

    if (priorMonthRule === 'recalculate' && newVouchers.length > 0) {
      const affectedStudentIds = new Set(newVouchers.map((v) => v.studentId));

      setVouchers((prevVouchers) => {
        let allVouchers = applyCarryMarks([...prevVouchers, ...newVouchers]);

        affectedStudentIds.forEach((studentId) => {
          // Sort all non-reversed vouchers for this student chronologically
          const studentVouchers = allVouchers
            .filter((v) => v.studentId === studentId && v.status !== 'Reversed')
            .sort((a, b) => a.month.localeCompare(b.month));

          studentVouchers.forEach((v, idx) => {
            if (idx === 0) return; // First voucher has no prior voucher in sequence

            const prevVoucher = studentVouchers[idx - 1];
            let newPrevBalance = 0;
            if (
              prevVoucher.status === 'Carried' ||
              prevVoucher.status === 'Issued' ||
              prevVoucher.status === 'Partial'
            ) {
              newPrevBalance = prevVoucher.netDue - prevVoucher.amountPaid;
            } else if (prevVoucher.status === 'Paid') {
              const excess = prevVoucher.amountPaid - prevVoucher.netDue;
              if (excess > 0) newPrevBalance = -excess;
            }

            const cleanParticulars = v.particulars.filter((p) => p.kind !== 'PreviousBalance');
            if (newPrevBalance !== 0) {
              cleanParticulars.push({
                kind: 'PreviousBalance',
                label: newPrevBalance >= 0 ? 'Previous Balance Arrears' : 'Advance Payment Credit',
                amount: newPrevBalance,
              });
            }

            const grossTotal = cleanParticulars
              .filter((p) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
              .reduce((sum, p) => sum + p.amount, 0);

            const discountTotal = cleanParticulars
              .filter((p) => p.kind === 'Discount')
              .reduce((sum, p) => sum + Math.abs(p.amount), 0);

            const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, v.roundingMultiple);
            const netDue = roundUpToMultiple(
              cleanParticulars.reduce((sum, p) => sum + p.amount, 0),
              mult
            );

            let status = v.status;
            if (v.status === 'Carried') {
              status = 'Carried';
            } else if (v.amountPaid >= netDue && netDue > 0) {
              status = 'Paid';
            } else if (netDue <= 0) {
              status = 'Paid';
            } else if (v.amountPaid > 0) {
              status = 'Partial';
            } else {
              status = 'Issued';
            }

            const updatedVoucher: FeeVoucher = {
              ...v,
              particulars: cleanParticulars,
              grossTotal,
              discountTotal,
              prevBalance: newPrevBalance,
              roundingMultiple: mult,
              netDue,
              status,
            };

            const vIndex = allVouchers.findIndex((item) => item.id === v.id);
            if (vIndex !== -1) {
              allVouchers[vIndex] = updatedVoucher;
            }
          });
        });

        return allVouchers;
      });
    } else {
      setVouchers((prev) => applyCarryMarks([...prev, ...newVouchers]));
    }

    if (newVouchers.length > 0) {
      // Phase 3: Transactional server-side API call
      const carriedPriorList = Array.from(priorVouchersToCarry.entries()).map(([id, targetMonth]) => ({
        id,
        targetMonth,
      }));
      apiGenerateVouchers(newVouchers, carriedPriorList)
        .then((res) => {
          if (res?.success) applyServerVoucherNumbers(res.vouchers);
          else if (res && !res.success) {
            reportFinancialSyncFailure('Voucher generation', new Error(res.error || 'Server rejected voucher generation'));
          }
        })
        .catch((err) => {
          reportFinancialSyncFailure('Voucher generation', err);
        });

      const classObj = classId ? classes.find((c) => c.id === classId) : undefined;
      logAuditEvent({
        actionType: 'voucher_generation',
        actionTitle: 'Monthly Fee Vouchers Generated',
        description: `Generated ${newVouchers.length} fee vouchers for billing month ${month} (Scope: ${scope}${classObj ? ` • ${classObj.name}` : ''}).`,
        module: 'Vouchers',
        targetId: `GEN-${month}`,
        targetLabel: `${newVouchers.length} Vouchers • ${month}`,
        month,
        metadata: {
          generatedCount: newVouchers.length,
          month,
          scope,
          classId,
          dueDate,
          lateFeeRate,
        },
      });
    }

    return { success: true, generatedCount: newVouchers.length };
  };

  // Update Voucher Particulars & Recalculate Totals
  const updateVoucherParticulars = (
    voucherId: string,
    updatedParticulars: VoucherItem[]
  ): { success: boolean; voucher?: FeeVoucher; error?: string } => {
    const perm = ensureMutationAllowed('Voucher modification');
    if (!perm.allowed) return { success: false, error: perm.error };

    const voucher = vouchers.find((v) => v.id === voucherId);
    if (!voucher) return { success: false, error: 'Voucher not found' };
    if (voucher.status === 'Reversed') {
      return { success: false, error: 'This voucher is reversed and cannot be modified.' };
    }
    if (voucher.status === 'Carried') {
      return {
        success: false,
        error: `Voucher ${voucher.voucherNo} was carried forward and is locked. Edit the following month's voucher instead.`,
      };
    }

    const cleanParticulars = updatedParticulars.map((p) => ({
      ...p,
      amount: Number(p.amount) || 0,
    }));

    const grossTotal = cleanParticulars
      .filter((p) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
      .reduce((sum, p) => sum + p.amount, 0);

    const discountTotal = cleanParticulars
      .filter((p) => p.kind === 'Discount')
      .reduce((sum, p) => sum + Math.abs(p.amount), 0);

    const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, voucher.roundingMultiple);
    const netDue = roundUpToMultiple(
      cleanParticulars.reduce((sum, p) => sum + p.amount, 0),
      mult
    );

    let newStatus = voucher.status;
    if (voucher.amountPaid >= netDue && netDue > 0) {
      newStatus = 'Paid';
    } else if (voucher.amountPaid > 0) {
      newStatus = 'Partial';
    } else if (netDue <= 0 && voucher.amountPaid === 0) {
      newStatus = 'Paid';
    } else {
      newStatus = 'Issued';
    }

    const updatedVoucher: FeeVoucher = {
      ...voucher,
      particulars: cleanParticulars,
      grossTotal,
      discountTotal,
      roundingMultiple: mult,
      netDue,
      status: newStatus,
    };

    setVouchers((prev) => prev.map((v) => (v.id === voucherId ? updatedVoucher : v)));

    apiVoucherBatchUpdate({ voucherUpserts: [updatedVoucher] }).then((res) => {
      if (!res.success) {
        reportFinancialSyncFailure('Voucher edit', new Error(res.error || 'Failed to update voucher particulars'));
      }
    }).catch((err) => {
      reportFinancialSyncFailure('Voucher edit', err);
    });

    // Audit Logging: Fine modifications and voucher line item adjustments
    const student = students.find((s) => s.id === voucher.studentId);
    const oldFine = voucher.particulars.find((p) => p.kind === 'Fine')?.amount || 0;
    const newFine = cleanParticulars.find((p) => p.kind === 'Fine')?.amount || 0;
    const fineDiff = newFine - oldFine;

    if (fineDiff !== 0) {
      logAuditEvent({
        actionType: 'fine_modification',
        actionTitle: fineDiff > 0 ? 'Manual Late Fine Added/Increased' : 'Manual Fine Reduced/Waived',
        description: `Manual fine adjustment of ${fineDiff > 0 ? '+' : ''}Rs ${fineDiff.toLocaleString()} (from Rs ${oldFine.toLocaleString()} to Rs ${newFine.toLocaleString()}) on voucher ${voucher.voucherNo} for ${student?.name || 'Unknown'}.`,
        module: 'Vouchers',
        targetId: voucher.voucherNo,
        targetLabel: student ? `${student.name} (${student.regNo})` : voucher.voucherNo,
        month: voucher.month,
        amount: Math.abs(fineDiff),
        previousValue: oldFine,
        newValue: newFine,
        metadata: {
          voucherId: voucher.id,
          voucherNo: voucher.voucherNo,
          studentId: voucher.studentId,
          oldFine,
          newFine,
          difference: fineDiff,
          netDue,
        },
      });
    } else {
      logAuditEvent({
        actionType: 'voucher_edit',
        actionTitle: 'Voucher Particulars Updated',
        description: `Fee particulars revised for voucher ${voucher.voucherNo} (${cleanParticulars.length} items, Net Due: Rs ${netDue.toLocaleString()}) for ${student?.name || 'Unknown'}.`,
        module: 'Vouchers',
        targetId: voucher.voucherNo,
        targetLabel: student ? `${student.name} (${student.regNo})` : voucher.voucherNo,
        month: voucher.month,
        amount: netDue,
        metadata: {
          voucherId: voucher.id,
          voucherNo: voucher.voucherNo,
          studentId: voucher.studentId,
          itemsCount: cleanParticulars.length,
          netDue,
        },
      });
    }

    return { success: true, voucher: updatedVoucher };
  };

  // Collect Payment (with optional line items sync)
  const collectVoucherPayment = (
    voucherId: string,
    amount: number,
    paymentMode: PaymentTransaction['paymentMode'],
    referenceNo?: string,
    notes?: string,
    date: string = new Date().toISOString().split('T')[0],
    updatedParticulars?: VoucherItem[]
  ) => {
    const perm = ensureMutationAllowed('Payment collection');
    if (!perm.allowed) return { success: false, error: perm.error };

    const voucher = vouchers.find((v) => v.id === voucherId);
    if (!voucher) return { success: false, error: 'Voucher not found' };
    if (voucher.status === 'Reversed') {
      return { success: false, error: 'This voucher has been reversed and cannot accept payments.' };
    }
    if (voucher.status === 'Carried') {
      const [cy, cm] = voucher.month.split('-').map(Number);
      const nextMonth = cm === 12 ? `${cy + 1}-01` : `${cy}-${String(cm + 1).padStart(2, '0')}`;
      return {
        success: false,
        error: `Voucher ${voucher.voucherNo} was carried forward. Its balance moved to the ${nextMonth} voucher — record this payment against that voucher instead.`,
      };
    }
    if (amount <= 0) return { success: false, error: 'Payment amount must be greater than zero.' };

    let cleanParticulars = voucher.particulars;
    let grossTotal = voucher.grossTotal;
    let discountTotal = voucher.discountTotal;
    let netDue = voucher.netDue;

    if (updatedParticulars && updatedParticulars.length > 0) {
      cleanParticulars = updatedParticulars.map((p) => ({
        ...p,
        amount: Number(p.amount) || 0,
      }));
      grossTotal = cleanParticulars
        .filter((p) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
        .reduce((sum, p) => sum + p.amount, 0);
      discountTotal = cleanParticulars
        .filter((p) => p.kind === 'Discount')
        .reduce((sum, p) => sum + Math.abs(p.amount), 0);
      const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, voucher.roundingMultiple);
      netDue = roundUpToMultiple(cleanParticulars.reduce((sum, p) => sum + p.amount, 0), mult);
    }

    const collectionNo = pendingDocumentNumber();
    const txnNo = pendingDocumentNumber();

    const collectionId = `col-${Date.now()}`;

    const newCollection: FeeCollection = {
      id: collectionId,
      collectionNo,
      date,
      totalAmount: amount,
      transactionCount: 1,
      notes: notes || `Payment for Voucher ${voucher.voucherNo}`,
      isBulkImport: false,
    };

    const originalFine = voucher.particulars.find((p) => p.kind === 'Fine')?.amount || 0;
    const newFine = cleanParticulars.find((p) => p.kind === 'Fine')?.amount || 0;
    const fineDiff = newFine - originalFine;

    const newTxn: PaymentTransaction = {
      id: `txn-${Date.now()}`,
      txnNo,
      collectionId,
      voucherId,
      studentId: voucher.studentId,
      month: voucher.month,
      amount,
      fineAdded: fineDiff !== 0 ? fineDiff : undefined,
      paymentMode,
      referenceNo,
      notes,
      date,
    };

    // Update voucher paid amount & status
    const updatedPaid = voucher.amountPaid + amount;
    let newStatus = voucher.status;
    if (updatedPaid >= netDue && netDue > 0) {
      newStatus = 'Paid';
    } else if (updatedPaid > 0) {
      newStatus = 'Partial';
    } else if (netDue <= 0 && updatedPaid === 0) {
      newStatus = 'Paid';
    } else {
      newStatus = 'Issued';
    }

    setCollections((prev) => [newCollection, ...prev]);
    setTransactions((prev) => [newTxn, ...prev]);
    setVouchers((prev) =>
      prev.map((v) =>
        v.id === voucherId
          ? {
              ...v,
              particulars: cleanParticulars,
              grossTotal,
              discountTotal,
              netDue,
              amountPaid: updatedPaid,
              status: newStatus,
            }
          : v
      )
    );

    // Phase 3: Transactional server-side API call
    apiReceiveCollection({
      collectionId,
      payments: [
        {
          id: newTxn.id,
          transactionId: newTxn.id,
          voucherId,
          amount,
          paymentMode,
          referenceNo,
          notes,
          date,
          fineAdded: fineDiff !== 0 ? fineDiff : undefined,
          updatedParticulars: cleanParticulars,
        },
      ],
      collectionNotes: notes || `Payment for Voucher ${voucher.voucherNo}`,
      date,
    }).then((res) => {
      if (res && res.success) {
        if (res.collection?.collectionNo || res.transactions?.[0]?.txnNo) {
          setCollections((prev) =>
            prev.map((c) =>
              c.id === collectionId
                ? { ...c, collectionNo: res.collection.collectionNo || c.collectionNo }
                : c
            )
          );
          setTransactions((prev) =>
            prev.map((t) =>
              t.id === newTxn.id
                ? { ...t, txnNo: res.transactions?.[0]?.txnNo || t.txnNo }
                : t
            )
          );
        }
      } else if (res && !res.success) {
        reportFinancialSyncFailure('Fee payment collection', new Error(res.error || 'Server rejected payment collection'));
      }
    }).catch((err) => {
      reportFinancialSyncFailure('Fee payment collection', err);
    });

    // Audit Logging: Fine adjustment at payment collection and collection receipt event
    const student = students.find((s) => s.id === voucher.studentId);
    if (fineDiff !== 0) {
      logAuditEvent({
        actionType: 'fine_modification',
        actionTitle: fineDiff > 0 ? 'Late Fine Added at Collection' : 'Fine Waived/Reduced at Collection',
        description: `Fine adjusted by ${fineDiff > 0 ? '+' : ''}Rs ${fineDiff.toLocaleString()} (from Rs ${originalFine.toLocaleString()} to Rs ${newFine.toLocaleString()}) during payment collection for voucher ${voucher.voucherNo} (${student?.name || 'Unknown'}).`,
        module: 'Collections',
        targetId: voucher.voucherNo,
        targetLabel: student ? `${student.name} (${student.regNo})` : voucher.voucherNo,
        month: voucher.month,
        amount: Math.abs(fineDiff),
        previousValue: originalFine,
        newValue: newFine,
        metadata: {
          voucherId,
          voucherNo: voucher.voucherNo,
          studentId: voucher.studentId,
          fineDiff,
          paymentAmount: amount,
          txnNo,
        },
      });
    }

    logAuditEvent({
      actionType: 'collection_payment',
      actionTitle: 'Fee Payment Received',
      description: `Collected fee payment of Rs ${amount.toLocaleString()} via ${paymentMode} for student ${student?.name || 'Unknown'} (Voucher ${voucher.voucherNo}, Txn #${txnNo}).`,
      module: 'Collections',
      targetId: txnNo,
      targetLabel: student ? `${student.name} (${student.regNo})` : voucher.voucherNo,
      month: voucher.month,
      amount,
      metadata: {
        collectionId,
        collectionNo,
        txnNo,
        voucherNo: voucher.voucherNo,
        studentId: voucher.studentId,
        paymentMode,
        referenceNo,
        amountPaid: amount,
      },
    });

    return { success: true, transaction: newTxn };
  };

  // Bulk CSV Collection
  const bulkCsvCollection = (
    rows: {
      regNo?: string;
      identifier?: string;
      studentId?: string;
      voucherId?: string;
      amount: number;
      fine?: number;
      paymentMode?: string;
      refNo?: string;
      date?: string;
    }[],
    month: string,
    defaultDate: string = new Date().toISOString().split('T')[0]
  ) => {
    const perm = ensureMutationAllowed('Bulk CSV payment collection');
    if (!perm.allowed) return { success: false, successCount: 0, errors: [perm.error] };

    let successCount = 0;
    const errors: string[] = [];

    const newTxns: PaymentTransaction[] = [];
    let batchTotal = 0;

    const collectionId = `col-bulk-${Date.now()}`;
    const collectionNo = pendingDocumentNumber();

    const updatedVouchersMap = new Map<
      string,
      {
        paid: number;
        status: FeeVoucher['status'];
        particulars?: VoucherItem[];
        grossTotal?: number;
        discountTotal?: number;
        netDue?: number;
      }
    >();

    rows.forEach((row, idx) => {
      // Find voucher by voucherId, studentId, or by matching student's regNo in target month
      let voucher: FeeVoucher | undefined;
      let matchedStudent = students.find((s) => s.id === row.studentId);
      let targetVoucherRaw: FeeVoucher | undefined;

      if (row.voucherId) {
        targetVoucherRaw = vouchers.find((v) => v.id === row.voucherId);
        if (targetVoucherRaw && !matchedStudent) {
          matchedStudent = students.find((s) => s.id === targetVoucherRaw!.studentId);
        }
      } else if (row.studentId) {
        targetVoucherRaw = vouchers.find(
          (v) => v.studentId === row.studentId && v.month === month
        );
      } else {
        const cleanReg = (row.regNo || row.identifier || '').trim().toLowerCase();
        matchedStudent = students.find(
          (s) =>
            s.regNo.trim().toLowerCase() === cleanReg ||
            s.studentNo.trim().toLowerCase() === cleanReg
        );

        if (matchedStudent) {
          const ms = matchedStudent;
          targetVoucherRaw = vouchers.find(
            (v) => v.studentId === ms.id && v.month === month
          );
        }
      }

      if (targetVoucherRaw && targetVoucherRaw.status !== 'Reversed' && targetVoucherRaw.status !== 'Carried') {
        voucher = targetVoucherRaw;
      }

      if (!voucher) {
        const regDisplay = row.regNo || row.identifier || (matchedStudent ? matchedStudent.regNo : 'Unknown');
        if (targetVoucherRaw) {
          if (targetVoucherRaw.status === 'Carried') {
            const [cy, cm] = targetVoucherRaw.month.split('-').map(Number);
            const nextMonth = cm === 12 ? `${cy + 1}-01` : `${cy}-${String(cm + 1).padStart(2, '0')}`;
            errors.push(
              `Row ${idx + 1} (${regDisplay}): Skipped. Voucher ${targetVoucherRaw.voucherNo} was carried forward. Its balance moved to the ${nextMonth} voucher — record this payment against that voucher instead.`
            );
          } else if (targetVoucherRaw.status === 'Reversed') {
            errors.push(
              `Row ${idx + 1} (${regDisplay}): Skipped. Voucher ${targetVoucherRaw.voucherNo} is reversed and cannot accept payments.`
            );
          }
        } else if (matchedStudent) {
          errors.push(
            `Row ${idx + 1}: No fee voucher found for student ${matchedStudent.name} (Reg # ${regDisplay}) in month ${month}.`
          );
        } else {
          errors.push(
            `Row ${idx + 1}: No student found matching Reg # "${regDisplay}".`
          );
        }
        return;
      }

      if (row.amount <= 0) {
        errors.push(`Row ${idx + 1}: Amount must be > 0 for voucher ${voucher.voucherNo}.`);
        return;
      }

      const rawModeInput = (row.paymentMode || '').trim();
      const normalizedMode = normalizePaymentMode(rawModeInput);
      if (rawModeInput && !normalizedMode) {
        errors.push(
          `Row ${idx + 1}: Invalid payment mode "${rawModeInput}". Allowed: ${PAYMENT_MODES.join(', ')}.`
        );
        return;
      }
      const mode: PaymentTransaction['paymentMode'] = normalizedMode || DEFAULT_PAYMENT_MODE;

      const currentEntry = updatedVouchersMap.get(voucher.id);
      let cleanParticulars = currentEntry?.particulars
        ? [...currentEntry.particulars]
        : voucher.particulars.map((p) => ({ ...p }));
      let effectiveGrossTotal = currentEntry?.grossTotal ?? voucher.grossTotal;
      let effectiveDiscountTotal = currentEntry?.discountTotal ?? voucher.discountTotal;
      let effectiveNetDue = currentEntry?.netDue ?? voucher.netDue;

      // Add fine amount in collection CSV to voucher (e.g. 500 existing fine + 500 CSV fine = 1000 fine)
      const hasFineUpdate = row.fine !== undefined && !isNaN(row.fine) && row.fine !== 0;
      if (hasFineUpdate) {
        const fineIndex = cleanParticulars.findIndex((p) => p.kind === 'Fine');
        if (fineIndex >= 0) {
          cleanParticulars[fineIndex] = {
            ...cleanParticulars[fineIndex],
            amount: cleanParticulars[fineIndex].amount + (row.fine || 0),
          };
        } else {
          cleanParticulars.push({
            kind: 'Fine',
            label: 'Fine',
            amount: row.fine || 0,
          });
        }

        const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, voucher.roundingMultiple);
        effectiveGrossTotal = cleanParticulars
          .filter((p) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
          .reduce((sum, p) => sum + p.amount, 0);
        effectiveDiscountTotal = cleanParticulars
          .filter((p) => p.kind === 'Discount')
          .reduce((sum, p) => sum + Math.abs(p.amount), 0);
        effectiveNetDue = roundUpToMultiple(cleanParticulars.reduce((sum, p) => sum + p.amount, 0), mult);
      }

      const currentPaid = currentEntry?.paid ?? voucher.amountPaid;
      const newPaid = currentPaid + row.amount;

      let newStatus: FeeVoucher['status'] = voucher.status;
      if (newPaid >= effectiveNetDue && effectiveNetDue > 0) {
        newStatus = 'Paid';
      } else if (newPaid > 0) {
        newStatus = 'Partial';
      } else if (effectiveNetDue <= 0 && newPaid === 0) {
        newStatus = 'Paid';
      } else {
        newStatus = 'Issued';
      }

      updatedVouchersMap.set(voucher.id, {
        paid: newPaid,
        status: newStatus,
        particulars: cleanParticulars,
        grossTotal: effectiveGrossTotal,
        discountTotal: effectiveDiscountTotal,
        netDue: effectiveNetDue,
      });

      const txnNo = pendingDocumentNumber();

      const rowDate = row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : defaultDate;
      const studentRegText = matchedStudent?.regNo ? ` [Reg #${matchedStudent.regNo}]` : '';
      newTxns.push({
        id: `txn-bulk-${Date.now()}-${idx}`,
        txnNo,
        collectionId,
        voucherId: voucher.id,
        studentId: voucher.studentId,
        month,
        amount: row.amount,
        fineAdded: hasFineUpdate && (row.fine || 0) !== 0 ? row.fine : undefined,
        paymentMode: mode,
        referenceNo: row.refNo,
        notes: `Bulk CSV Import Payment for ${voucher.voucherNo}${studentRegText}`,
        date: rowDate,
      });

      batchTotal += row.amount;
      successCount++;
    });

    if (successCount > 0) {
      const primaryCollectionDate =
        newTxns[0]?.date || defaultDate || new Date().toISOString().split('T')[0];

      const newCollection: FeeCollection = {
        id: collectionId,
        collectionNo,
        date: primaryCollectionDate,
        totalAmount: batchTotal,
        transactionCount: successCount,
        notes: `Bulk CSV Payment Collection (${successCount} rows)`,
        isBulkImport: true,
      };

      setCollections((prev) => [newCollection, ...prev]);
      setTransactions((prev) => [...newTxns, ...prev]);
      setVouchers((prev) =>
        prev.map((v) => {
          const upd = updatedVouchersMap.get(v.id);
          if (!upd) return v;
          return {
            ...v,
            amountPaid: upd.paid,
            status: upd.status,
            ...(upd.particulars ? { particulars: upd.particulars } : {}),
            ...(upd.grossTotal !== undefined ? { grossTotal: upd.grossTotal } : {}),
            ...(upd.discountTotal !== undefined ? { discountTotal: upd.discountTotal } : {}),
            ...(upd.netDue !== undefined ? { netDue: upd.netDue } : {}),
          };
        })
      );

      // Transactional server-side API call for bulk collection. This is the
      // ONLY network write for this batch — it atomically recomputes each
      // voucher's amountPaid/status server-side and inserts the matching
      // transactions/collection row. A second apiVoucherBatchUpdate call
      // used to fire here as well, duplicating every transaction/collection
      // row and double-incrementing amountPaid; do not reintroduce it.
      apiReceiveCollection({
        collectionId,
        payments: newTxns.map((t) => {
          const upd = updatedVouchersMap.get(t.voucherId);
          return {
            id: t.id,
            transactionId: t.id,
            voucherId: t.voucherId,
            amount: t.amount,
            paymentMode: t.paymentMode,
            referenceNo: t.referenceNo,
            notes: t.notes,
            date: t.date,
            fineAdded: t.fineAdded,
            updatedParticulars: upd?.particulars,
          };
        }),
        collectionNotes: `Bulk CSV Payment Collection (${successCount} rows)`,
        date: primaryCollectionDate,
        isBulkImport: true,
      }).then((res) => {
        if (res && res.success) {
          if (res.collection?.collectionNo) {
            setCollections((prev) =>
              prev.map((c) =>
                c.id === collectionId
                  ? { ...c, collectionNo: res.collection.collectionNo || c.collectionNo }
                  : c
              )
            );
          }
          if (Array.isArray(res.transactions) && res.transactions.length > 0) {
            const serverTxnMap = new Map(res.transactions.map((st: any) => [st.id, st.txnNo]));
            setTransactions((prev) =>
              prev.map((t) => {
                const sTxnNo = serverTxnMap.get(t.id);
                return sTxnNo ? { ...t, txnNo: sTxnNo } : t;
              })
            );
          }
        } else if (res && !res.success) {
          reportFinancialSyncFailure(`Bulk CSV payment collection (${successCount} rows)`, new Error(res.error || 'Server rejected bulk import'));
        }
      }).catch((err) => {
        reportFinancialSyncFailure(`Bulk CSV payment collection (${successCount} rows)`, err);
      });

      // Audit Logging: Bulk CSV Collection
      logAuditEvent({
        actionType: 'bulk_collection',
        actionTitle: 'Bulk CSV Fee Collection Batch Imported',
        description: `Imported bulk fee payments for ${successCount} vouchers totaling Rs ${batchTotal.toLocaleString()} for billing month ${month}.`,
        module: 'Collections',
        targetId: collectionNo,
        targetLabel: `${successCount} payments • Rs ${batchTotal.toLocaleString()}`,
        month,
        amount: batchTotal,
        metadata: {
          collectionId,
          collectionNo,
          successCount,
          totalAmount: batchTotal,
          month,
          importedTxnNos: newTxns.map((t) => t.txnNo),
        },
      });

      // Audit Logging: Record fine additions if any were in CSV
      const fineTxns = newTxns.filter((t) => t.fineAdded && t.fineAdded > 0);
      if (fineTxns.length > 0) {
        const totalFineAdded = fineTxns.reduce((s, t) => s + (t.fineAdded || 0), 0);
        logAuditEvent({
          actionType: 'fine_modification',
          actionTitle: 'Bulk Collection Late Fines Applied',
          description: `Applied Rs ${totalFineAdded.toLocaleString()} in manual/custom late fines across ${fineTxns.length} records during CSV bulk collection import.`,
          module: 'Collections',
          targetId: collectionNo,
          targetLabel: `${fineTxns.length} fine modifications`,
          month,
          amount: totalFineAdded,
          metadata: {
            collectionNo,
            fineRecordsCount: fineTxns.length,
            totalFineAmount: totalFineAdded,
          },
        });
      }
    }

    return { success: successCount > 0, successCount, errors };
  };

  // Carry Forward Defaulters
  const carryForwardDefaulter = (
    voucherId: string,
    targetMonth: string,
    addLateFine: boolean,
    customFineAmount?: number
  ) => {
    const perm = ensureMutationAllowed('Carry forward defaulter');
    if (!perm.allowed) return { success: false, error: perm.error };

    // Read via the ref (not the outer `vouchers` state) so that vouchers
    // already processed earlier in the same bulkCarryForwardDefaulters()
    // loop are visible here. Previously this read the outer closure, which
    // stays pinned to the pre-batch snapshot for the whole synchronous
    // loop -- so the "already Carried/Paid" duplicate guard just below
    // could not detect a voucher this same batch had already carried
    // forward, letting it be processed a second time.
    const baseList = vouchersRef.current;
    const voucher = baseList.find((v) => v.id === voucherId);
    if (!voucher) return { success: false, error: 'Voucher not found' };

    if (voucher.status === 'Reversed') {
      return { success: false, error: `Voucher ${voucher.voucherNo} is reversed and cannot be carried forward.` };
    }
    if (voucher.status === 'Paid' || voucher.status === 'Carried') {
      return { success: false, error: `Voucher is already in '${voucher.status}' status.` };
    }

    const outstandingBalance = voucher.netDue - voucher.amountPaid;
    if (outstandingBalance <= 0) {
      return { success: false, error: 'Voucher has no outstanding balance to carry forward.' };
    }

    // Check if target month voucher already exists for this student
    const existingTargetVoucher = baseList.find(
      (v) => v.studentId === voucher.studentId && v.month === targetMonth && v.status !== 'Reversed'
    );

    const targetMult = getEffectiveMultiple(roundingEnabled, roundingMultiple, existingTargetVoucher?.roundingMultiple);

    const fineAmountToApply = addLateFine
      ? roundUpToMultiple(
          customFineAmount !== undefined ? customFineAmount : (voucher.lateFeeRate || defaultLateFeeRate),
          targetMult
        )
      : 0;

    // Mark current voucher as Carried and update or recalculate target/future
    // vouchers. Built from `baseList` (the ref) rather than setVouchers's
    // `prev` callback, so the result is available synchronously right here
    // and vouchersRef can be updated immediately -- keeping it correct for
    // the very next voucher processed in the same bulk carry-forward loop,
    // instead of waiting for React to flush and re-render.
    let updatedList = baseList.map((v) => {
      if (v.id !== voucherId) return v;

      return {
        ...v,
        status: 'Carried' as VoucherStatus,
        carryForwardMonth: targetMonth,
        carriedLateFine: fineAmountToApply,
      };
    });

    if (existingTargetVoucher) {
      let targetParticulars = existingTargetVoucher.particulars.filter(
        (p) => p.kind !== 'PreviousBalance'
      );

      targetParticulars.push({
        kind: 'PreviousBalance',
        label: outstandingBalance >= 0 ? 'Previous Balance Arrears' : 'Advance Payment Credit',
        amount: outstandingBalance,
      });

      if (fineAmountToApply > 0) {
        const fineIdx = targetParticulars.findIndex((p) => p.kind === 'Fine');
        if (fineIdx >= 0) {
          targetParticulars[fineIdx] = {
            ...targetParticulars[fineIdx],
            amount: fineAmountToApply,
            label: 'Late Payment Carry Fine',
          };
        } else {
          targetParticulars.push({
            kind: 'Fine',
            label: 'Late Payment Carry Fine',
            amount: fineAmountToApply,
          });
        }
      }

      const grossTotal = targetParticulars
        .filter((p) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
        .reduce((sum, p) => sum + p.amount, 0);

      const discountTotal = targetParticulars
        .filter((p) => p.kind === 'Discount')
        .reduce((sum, p) => sum + Math.abs(p.amount), 0);

      const netDue = roundUpToMultiple(
        targetParticulars.reduce((sum, p) => sum + p.amount, 0),
        targetMult
      );

      let targetStatus = existingTargetVoucher.status;
      if (existingTargetVoucher.amountPaid >= netDue) {
        targetStatus = 'Paid';
      } else if (existingTargetVoucher.amountPaid > 0) {
        targetStatus = 'Partial';
      } else if (existingTargetVoucher.status === 'Carried') {
        targetStatus = 'Carried';
      } else {
        targetStatus = 'Issued';
      }

      const updatedTargetVoucher: FeeVoucher = {
        ...existingTargetVoucher,
        particulars: targetParticulars,
        grossTotal,
        discountTotal,
        prevBalance: outstandingBalance,
        roundingMultiple: targetMult,
        netDue,
        status: targetStatus,
      };

      const targetIdx = updatedList.findIndex((item) => item.id === existingTargetVoucher.id);
      if (targetIdx !== -1) {
        updatedList[targetIdx] = updatedTargetVoucher;
      }

      updatedList = recalculateVouchersSequence(updatedList, [voucher.studentId]);
    } else {
      // No voucher exists for this student in the target month.
      //
      // Only auto-create a destination voucher for an Admission (ADM) voucher
      // being carried through the pre-billing months (targetMonth before the
      // student's firstBillingMonth). This keeps a June admission voucher for
      // a September-starting student visible as it is carried on to July and
      // August, with the destination voucher inheriting the Admission type so
      // it keeps the ADM marker in the listing.
      //
      // A normal monthly voucher, by contrast, is simply marked Carried; its
      // outstanding balance is not folded anywhere until the target month
      // voucher actually exists (e.g. when September is generated normally),
      // so carrying forward August does NOT auto-create a September voucher.
      const student = students.find((s) => s.id === voucher.studentId);
      const shouldAutoCreate =
        voucher.voucherType === 'Admission' &&
        !!student?.firstBillingMonth &&
        targetMonth < student.firstBillingMonth;

      if (shouldAutoCreate) {
        const issuedDate = new Date().toISOString().split('T')[0];

        // Due date for the auto-created destination voucher: use the day from
        // settings when present; otherwise inherit the same day as the source
        // (carried) voucher for the target month.
        const settingsDueDate = getComputedDefaultDueDate(targetMonth);
        const sourceDay =
          voucher.dueDate && voucher.dueDate.includes('-') ? voucher.dueDate.split('-')[2] : null;
        const targetDueDate =
          settingsDueDate || (sourceDay ? `${targetMonth}-${sourceDay}` : '');

        const newVoucher: FeeVoucher = {
          id: generateUniqueId('vch'),
          voucherNo: pendingDocumentNumber(),
          studentId: voucher.studentId,
          month: targetMonth,
          classId: student?.classId || voucher.classId,
          issueDate: issuedDate,
          dueDate: targetDueDate,
          particulars: [],
          grossTotal: 0,
          discountTotal: 0,
          prevBalance: 0,
          lateFeeRate: voucher.lateFeeRate ?? defaultLateFeeRate,
          roundingMultiple: roundingEnabled ? roundingMultiple : 1,
          netDue: 0,
          amountPaid: 0,
          status: 'Issued',
          voucherType: voucher.voucherType,
          createdDate: issuedDate,
        };

        updatedList.push(newVoucher);
      }

      updatedList = recalculateVouchersSequence(updatedList, [voucher.studentId]);
    }

    vouchersRef.current = updatedList;
    setVouchers(updatedList);

    // Phase 3: Transactional server-side API call
    apiCarryForwardVoucher({
      voucherId,
      targetMonth,
      addLateFine,
      customFineAmount,
    }).catch((err) => {
      reportFinancialSyncFailure('Balance carry-forward', err);
    });

    // Also persist the full recalculated chain for this student — covers
    // cases the single-pair carry-forward endpoint above doesn't handle:
    // auto-creating a destination Admission voucher for pre-billing months,
    // and any downstream vouchers recalculateVouchersSequence touched.
    apiVoucherBatchUpdate({
      voucherUpserts: updatedList.filter((v) => v.studentId === voucher.studentId),
    })
      .then((res) => {
        if (res?.success) applyServerVoucherNumbers(res.vouchers);
      })
      .catch((err) => {
        reportFinancialSyncFailure('Carry-forward chain recalculation', err);
      });

    // Audit Logging: Carry forward operation
    const student = students.find((s) => s.id === voucher.studentId);
    logAuditEvent({
      actionType: 'carry_forward',
      actionTitle: 'Defaulter Voucher Carried Forward',
      description: `Carried forward outstanding arrears of Rs ${outstandingBalance.toLocaleString()} on voucher ${voucher.voucherNo} (${student?.name || 'Unknown'}) from ${voucher.month} to ${targetMonth}${fineAmountToApply > 0 ? ` with Rs ${fineAmountToApply.toLocaleString()} late fine` : ''}.`,
      module: 'Defaulters',
      targetId: voucher.voucherNo,
      targetLabel: student ? `${student.name} (${student.regNo})` : voucher.voucherNo,
      month: voucher.month,
      amount: outstandingBalance,
      newValue: `Carried to ${targetMonth}`,
      metadata: {
        voucherId: voucher.id,
        voucherNo: voucher.voucherNo,
        studentId: voucher.studentId,
        fromMonth: voucher.month,
        targetMonth,
        outstandingBalance,
        fineApplied: fineAmountToApply,
      },
    });

    if (fineAmountToApply > 0) {
      logAuditEvent({
        actionType: 'fine_modification',
        actionTitle: 'Late Carry Fine Imposed',
        description: `Imposed Rs ${fineAmountToApply.toLocaleString()} late payment fine during carry-forward of voucher ${voucher.voucherNo} into ${targetMonth}.`,
        module: 'Defaulters',
        targetId: voucher.voucherNo,
        targetLabel: student ? `${student.name} (${student.regNo})` : voucher.voucherNo,
        month: targetMonth,
        amount: fineAmountToApply,
        newValue: fineAmountToApply,
        metadata: {
          voucherId: voucher.id,
          targetMonth,
          fineAmount: fineAmountToApply,
        },
      });
    }

    return { success: true };
  };

  const bulkCarryForwardDefaulters = (
    voucherIds: string[],
    targetMonth: string,
    addLateFine: boolean,
    customFineAmount?: number,
    perVoucherFines?: Record<string, number>
  ): { success: boolean; successCount: number; errors: string[] } => {
    let successCount = 0;
    const errors: string[] = [];
    voucherIds.forEach((vId) => {
      const fineToUse = perVoucherFines?.[vId] ?? customFineAmount;
      const res = carryForwardDefaulter(vId, targetMonth, addLateFine, fineToUse);
      if (res.success) {
        successCount++;
      } else if (res.error) {
        errors.push(res.error);
      }
    });
    return {
      success: successCount > 0,
      successCount,
      errors,
    };
  };

  const undoCarryForwardVoucher = (
    voucherId: string
  ): { success: boolean; error?: string } => {
    const perm = ensureMutationAllowed('Undo carry forward');
    if (!perm.allowed) return { success: false, error: perm.error };

    const baseList = vouchersRef.current;
    const voucher = baseList.find((v) => v.id === voucherId);
    if (!voucher) {
      return { success: false, error: 'Voucher not found.' };
    }
    if (voucher.status !== 'Carried') {
      return { success: false, error: `Voucher ${voucher.voucherNo} is not in 'Carried' status and cannot be undone.` };
    }

    // Guard against reversing a carry that has later vouchers in the ledger,
    // mirroring the strict downstream check shown in the UI.
    const hasDownstream = baseList.some(
      (v) =>
        v.studentId === voucher.studentId &&
        v.status !== 'Reversed' &&
        v.id !== voucher.id &&
        v.month > voucher.month
    );
    if (hasDownstream) {
      return {
        success: false,
        error: 'Cannot undo: a subsequent voucher already exists for this student.',
      };
    }

    // Restore the carried voucher to its pre-carry status (Issued or Partial
    // based on any amount already paid) and drop the carry-forward metadata.
    // recalculateVouchersSequence then re-derives every downstream voucher so
    // any folded Previous Balance / carried late fine is released and balances
    // return to their pre-carry state.
    let updatedList = baseList.map((v) => {
      if (v.id !== voucherId) return v;
      const restoredStatus = (v.amountPaid || 0) > 0 ? 'Partial' : 'Issued';
      return {
        ...v,
        status: restoredStatus as VoucherStatus,
        carryForwardMonth: undefined,
        carriedLateFine: undefined,
      };
    });

    updatedList = recalculateVouchersSequence(updatedList, [voucher.studentId]);

    vouchersRef.current = updatedList;
    setVouchers(updatedList);

    apiVoucherBatchUpdate({
      voucherUpserts: updatedList.filter((v) => v.studentId === voucher.studentId),
    }).catch((err) => {
      reportFinancialSyncFailure('Carry-forward undo', err);
    });

    const student = students.find((s) => s.id === voucher.studentId);
    logAuditEvent({
      actionType: 'carry_forward',
      actionTitle: 'Carry Forward Operation Reverted',
      description: `Reverted carry-forward status for voucher ${voucher.voucherNo} (${student?.name || 'Unknown'}). Restored to active status in month ${voucher.month}.`,
      module: 'Defaulters',
      targetId: voucher.voucherNo,
      targetLabel: student ? `${student.name} (${student.regNo})` : voucher.voucherNo,
      month: voucher.month,
      previousValue: `Carried to ${voucher.carryForwardMonth || 'next month'}`,
      newValue: 'Active (Restored)',
      metadata: {
        voucherId: voucher.id,
        voucherNo: voucher.voucherNo,
        studentId: voucher.studentId,
        month: voucher.month,
      },
    });

    return { success: true };
  };

  const recalculateVouchersSequence = (
    allVouchers: FeeVoucher[],
    affectedStudentIds: string[]
  ): FeeVoucher[] => {
    const result = [...allVouchers];

    affectedStudentIds.forEach((studentId) => {
      // Find all non-reversed vouchers for this student sorted by month ASC
      const studentVouchers = result
        .filter((v) => v.studentId === studentId && v.status !== 'Reversed')
        .sort((a, b) => a.month.localeCompare(b.month));

      studentVouchers.forEach((v, idx) => {
        let newPrevBalance = 0;
        let carriedFine = 0;

        const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, v.roundingMultiple);

        if (idx > 0) {
          const prevVoucher = studentVouchers[idx - 1];
          if (
            prevVoucher.status === 'Carried' ||
            prevVoucher.status === 'Issued' ||
            prevVoucher.status === 'Partial'
          ) {
            newPrevBalance = prevVoucher.netDue - prevVoucher.amountPaid;
            if (prevVoucher.status === 'Carried' && prevVoucher.carriedLateFine && prevVoucher.carriedLateFine > 0) {
              carriedFine = roundUpToMultiple(prevVoucher.carriedLateFine, mult);
            }
          } else if (prevVoucher.status === 'Paid') {
            const excess = prevVoucher.amountPaid - prevVoucher.netDue;
            if (excess > 0) newPrevBalance = -excess;
          }
        }

        const cleanParticulars = v.particulars.filter((p) => p.kind !== 'PreviousBalance');
        if (newPrevBalance !== 0) {
          cleanParticulars.push({
            kind: 'PreviousBalance',
            label: newPrevBalance >= 0 ? 'Previous Balance Arrears' : 'Advance Payment Credit',
            amount: newPrevBalance,
          });
        }

        if (carriedFine > 0) {
          const fineIdx = cleanParticulars.findIndex((p) => p.kind === 'Fine');
          if (fineIdx >= 0) {
            cleanParticulars[fineIdx] = {
              ...cleanParticulars[fineIdx],
              amount: carriedFine,
              label: cleanParticulars[fineIdx].label || 'Late Payment Carry Fine',
            };
          } else {
            cleanParticulars.push({
              kind: 'Fine',
              label: 'Late Payment Carry Fine',
              amount: carriedFine,
            });
          }
        }

        const grossTotal = cleanParticulars
          .filter((p) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
          .reduce((sum, p) => sum + p.amount, 0);

        const discountTotal = cleanParticulars
          .filter((p) => p.kind === 'Discount')
          .reduce((sum, p) => sum + Math.abs(p.amount), 0);

        const netDue = roundUpToMultiple(
          cleanParticulars.reduce((sum, p) => sum + p.amount, 0),
          mult
        );

        let status = v.status;
        if (v.status === 'Carried') {
          status = 'Carried';
        } else if (v.amountPaid >= netDue) {
          status = 'Paid';
        } else if (v.amountPaid > 0) {
          status = 'Partial';
        } else {
          status = 'Issued';
        }

        const updatedVoucher: FeeVoucher = {
          ...v,
          particulars: cleanParticulars,
          grossTotal,
          discountTotal,
          prevBalance: newPrevBalance,
          roundingMultiple: mult,
          netDue,
          status,
        };

        const vIndex = result.findIndex((item) => item.id === v.id);
        if (vIndex !== -1) {
          result[vIndex] = updatedVoucher;
        }
        studentVouchers[idx] = updatedVoucher;
      });
    });

    return result;
  };

  const getDownstreamVouchersInfo = (ids: string[]) => {
    const selected = vouchers.filter((v) => ids.includes(v.id));
    const conflicts: DownstreamConflict[] = [];
    let totalDownstreamCount = 0;

    selected.forEach((sv) => {
      const student = students.find((s) => s.id === sv.studentId);
      if (!student) return;

      const downstream = vouchers
        .filter(
          (v) =>
            v.studentId === sv.studentId &&
            v.month > sv.month &&
            !ids.includes(v.id) &&
            v.status !== 'Reversed'
        )
        .sort((a, b) => a.month.localeCompare(b.month));

      if (downstream.length > 0) {
        const allDownstreamIds = downstream.map((d) => d.id);
        const downstreamTxns = transactions.filter((t) => allDownstreamIds.includes(t.voucherId));

        conflicts.push({
          voucher: sv,
          student,
          downstreamVouchers: downstream,
          hasTransactions: downstreamTxns.length > 0,
          txnCount: downstreamTxns.length,
        });

        totalDownstreamCount += downstream.length;
      }
    });

    return {
      hasDownstream: conflicts.length > 0,
      conflicts,
      totalDownstreamCount,
    };
  };

  const deleteVoucher = (
    id: string,
    force: boolean = false,
    mode?: VoucherDeletionResolution
  ) => {
    const perm = ensureMutationAllowed('Voucher deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    const effectiveMode = mode || voucherDeletionResolution;
    const target = vouchers.find((v) => v.id === id);
    if (!target) return { success: false, error: 'Voucher not found' };

    if (effectiveMode === 'manual') {
      const downstreamInfo = getDownstreamVouchersInfo([id]);
      if (downstreamInfo.hasDownstream) {
        return {
          success: false,
          error:
            'Cannot delete voucher because subsequent month vouchers exist for this student. System policy requires deleting newer vouchers first.',
        };
      }
    }

    let idsToDelete = [id];
    const affectedStudentIds = [target.studentId];

    if (effectiveMode === 'cascade') {
      const futureVouchers = vouchers.filter(
        (v) => v.studentId === target.studentId && v.month > target.month && v.status !== 'Reversed'
      );
      idsToDelete = [id, ...futureVouchers.map((v) => v.id)];
    }

    const voucherTxns = transactions.filter((t) => idsToDelete.includes(t.voucherId));
    if (voucherTxns.length > 0 && !force) {
      return {
        success: false,
        error:
          'Cannot delete voucher(s) with recorded payment transactions. Reverse/delete transactions first or confirm forced deletion.',
        hasTxns: true,
        transactionCount: voucherTxns.length,
      };
    }

    const voucherTxnIds = voucherTxns.map((t) => t.id);
    let collectionUpdatesForApi: { id: string; totalAmount: number; transactionCount: number }[] = [];
    let deleteCollectionIdsForApi: string[] = [];

    if (voucherTxns.length > 0 && force) {
      const colIds: string[] = Array.from(new Set<string>(voucherTxns.map((t) => t.collectionId)));
      // Compute the surviving transaction set ONCE from this snapshot, then
      // derive both the transaction removal and the collection recompute from
      // that same result so they can never disagree under concurrent/queued
      // updates (the recompute must not re-read the stale outer `transactions`).
      const keptTxns = transactions.filter(
        (t) => colIds.includes(t.collectionId) && !idsToDelete.includes(t.voucherId)
      );
      const collectionTotals = new Map<string, number>();
      const collectionCounts = new Map<string, number>();
      keptTxns.forEach((t) => {
        collectionTotals.set(t.collectionId, (collectionTotals.get(t.collectionId) || 0) + t.amount);
        collectionCounts.set(t.collectionId, (collectionCounts.get(t.collectionId) || 0) + 1);
      });

      colIds.forEach((cid) => {
        const count = collectionCounts.get(cid) || 0;
        if (count > 0) {
          collectionUpdatesForApi.push({ id: cid, totalAmount: collectionTotals.get(cid) || 0, transactionCount: count });
        } else {
          deleteCollectionIdsForApi.push(cid);
        }
      });

      setTransactions((prev) => prev.filter((t) => !idsToDelete.includes(t.voucherId)));

      setCollections((prev) =>
        prev
          .map((c) => {
            if (colIds.includes(c.id)) {
              return {
                ...c,
                totalAmount: collectionTotals.get(c.id) || 0,
                transactionCount: collectionCounts.get(c.id) || 0,
              };
            }
            return c;
          })
          .filter((c) => c.transactionCount > 0)
      );
    }

    let recalculatedRemaining: FeeVoucher[] = [];
    setVouchers((prev) => {
      let remaining = prev.filter((v) => !idsToDelete.includes(v.id));
      if (effectiveMode === 'auto-heal') {
        remaining = recalculateVouchersSequence(remaining, affectedStudentIds);
      }
      recalculatedRemaining = remaining;
      return remaining;
    });

    // Persist: the client already computed the final result above (deletion
    // cascade, transaction/collection recompute, auto-heal recalculation —
    // all logic that depends on rounding/policy settings that only ever
    // live client-side). This just ships that computed result to be
    // persisted atomically; see apiVoucherBatchUpdate's server-side comment.
    apiVoucherBatchUpdate({
      voucherUpserts:
        effectiveMode === 'auto-heal' ? recalculatedRemaining.filter((v) => affectedStudentIds.includes(v.studentId)) : [],
      deleteVoucherIds: idsToDelete,
      deleteTransactionIds: voucherTxnIds,
      collectionUpdates: collectionUpdatesForApi,
      deleteCollectionIds: deleteCollectionIdsForApi,
    }).catch((err) => {
      reportFinancialSyncFailure('Voucher deletion', err);
    });

    const student = students.find((s) => s.id === target.studentId);
    logAuditEvent({
      actionType: 'voucher_deletion',
      actionTitle: 'Fee Voucher Deleted',
      description: `Permanently deleted voucher ${target.voucherNo} for ${student?.name || 'Unknown'} (Billing Month: ${target.month}, Net Due: Rs ${target.netDue.toLocaleString()}). Resolution mode: ${effectiveMode}.`,
      module: 'Vouchers',
      targetId: target.voucherNo,
      targetLabel: student ? `${student.name} (${student.regNo})` : target.voucherNo,
      month: target.month,
      amount: target.netDue,
      metadata: {
        voucherId: target.id,
        voucherNo: target.voucherNo,
        studentId: target.studentId,
        month: target.month,
        netDue: target.netDue,
        resolutionMode: effectiveMode,
        cascadeCount: idsToDelete.length,
      },
    });

    return { success: true, deletedCount: idsToDelete.length };
  };

  const bulkDeleteVouchers = (
    ids: string[],
    force: boolean = false,
    mode?: VoucherDeletionResolution
  ) => {
    const perm = ensureMutationAllowed('Bulk voucher deletion');
    if (!perm.allowed) return { success: false, deletedCount: 0, error: perm.error };

    const effectiveMode = mode || voucherDeletionResolution;
    const selectedVouchers = vouchers.filter((v) => ids.includes(v.id));
    if (selectedVouchers.length === 0) return { success: false, deletedCount: 0 };

    if (effectiveMode === 'manual') {
      const downstreamInfo = getDownstreamVouchersInfo(ids);
      if (downstreamInfo.hasDownstream) {
        return {
          success: false,
          deletedCount: 0,
          error:
            'Cannot delete selected vouchers because subsequent month vouchers exist for some students. System policy requires deleting newer vouchers first.',
        };
      }
    }

    let idsToDelete = [...ids];
    const affectedStudentIds: string[] = Array.from(new Set(selectedVouchers.map((v) => v.studentId)));

    if (effectiveMode === 'cascade') {
      selectedVouchers.forEach((sv) => {
        const futureVouchers = vouchers.filter(
          (v) => v.studentId === sv.studentId && v.month > sv.month && v.status !== 'Reversed'
        );
        futureVouchers.forEach((fv) => {
          if (!idsToDelete.includes(fv.id)) {
            idsToDelete.push(fv.id);
          }
        });
      });
    }

    const voucherTxns = transactions.filter((t) => idsToDelete.includes(t.voucherId));
    if (voucherTxns.length > 0 && !force) {
      return {
        success: false,
        error:
          'Cannot delete voucher(s) with recorded payment transactions without confirmation.',
        hasTxns: true,
        transactionCount: voucherTxns.length,
        deletedCount: 0,
      };
    }

    const voucherTxnIds = voucherTxns.map((t) => t.id);
    let collectionUpdatesForApi: { id: string; totalAmount: number; transactionCount: number }[] = [];
    let deleteCollectionIdsForApi: string[] = [];

    if (voucherTxns.length > 0 && force) {
      const colIds: string[] = Array.from(new Set<string>(voucherTxns.map((t) => t.collectionId)));
      // Compute the surviving transaction set ONCE from this snapshot, then
      // derive both the transaction removal and the collection recompute from
      // that same result so they can never disagree under concurrent/queued
      // updates (the recompute must not re-read the stale outer `transactions`).
      const keptTxns = transactions.filter(
        (t) => colIds.includes(t.collectionId) && !idsToDelete.includes(t.voucherId)
      );
      const collectionTotals = new Map<string, number>();
      const collectionCounts = new Map<string, number>();
      keptTxns.forEach((t) => {
        collectionTotals.set(t.collectionId, (collectionTotals.get(t.collectionId) || 0) + t.amount);
        collectionCounts.set(t.collectionId, (collectionCounts.get(t.collectionId) || 0) + 1);
      });

      colIds.forEach((cid) => {
        const count = collectionCounts.get(cid) || 0;
        if (count > 0) {
          collectionUpdatesForApi.push({ id: cid, totalAmount: collectionTotals.get(cid) || 0, transactionCount: count });
        } else {
          deleteCollectionIdsForApi.push(cid);
        }
      });

      setTransactions((prev) => prev.filter((t) => !idsToDelete.includes(t.voucherId)));

      setCollections((prev) =>
        prev
          .map((c) => {
            if (colIds.includes(c.id)) {
              return {
                ...c,
                totalAmount: collectionTotals.get(c.id) || 0,
                transactionCount: collectionCounts.get(c.id) || 0,
              };
            }
            return c;
          })
          .filter((c) => c.transactionCount > 0)
      );
    }

    let recalculatedRemaining: FeeVoucher[] = [];
    setVouchers((prev) => {
      let remaining = prev.filter((v) => !idsToDelete.includes(v.id));
      if (effectiveMode === 'auto-heal') {
        remaining = recalculateVouchersSequence(remaining, affectedStudentIds);
      }
      recalculatedRemaining = remaining;
      return remaining;
    });

    apiVoucherBatchUpdate({
      voucherUpserts:
        effectiveMode === 'auto-heal' ? recalculatedRemaining.filter((v) => affectedStudentIds.includes(v.studentId)) : [],
      deleteVoucherIds: idsToDelete,
      deleteTransactionIds: voucherTxnIds,
      collectionUpdates: collectionUpdatesForApi,
      deleteCollectionIds: deleteCollectionIdsForApi,
    }).catch((err) => {
      reportFinancialSyncFailure('Bulk voucher deletion', err);
    });

    logAuditEvent({
      actionType: 'voucher_deletion',
      actionTitle: 'Bulk Fee Vouchers Deleted',
      description: `Bulk deleted ${idsToDelete.length} fee vouchers (Requested: ${ids.length}, Mode: ${effectiveMode}).`,
      module: 'Vouchers',
      targetId: `BULK-DEL-${Date.now()}`,
      targetLabel: `${idsToDelete.length} vouchers removed`,
      metadata: {
        deletedIds: idsToDelete,
        requestedIdsCount: ids.length,
        resolutionMode: effectiveMode,
      },
    });

    return { success: true, deletedCount: idsToDelete.length };
  };

  // Collections Ledger Delete
  const deleteCollection = (id: string) => {
    const perm = ensureMutationAllowed('Collection deletion');
    if (!perm.allowed) return;

    const colToDelete = collections.find((c) => c.id === id);
    const colTxns = transactions.filter(
      (t) => t.collectionId === id || (colToDelete && t.collectionId === colToDelete.collectionNo)
    );
    if (colTxns.length === 0) {
      setCollections((prev) => prev.filter((c) => c.id !== id));
      apiVoucherBatchUpdate({ deleteCollectionIds: [id] }).then((res) => {
        if (!res.success) {
          reportFinancialSyncFailure('Collection deletion', new Error(res.error || 'Failed to delete collection'));
        }
      }).catch((err) => {
        reportFinancialSyncFailure('Collection deletion', err);
      });
      return;
    }

    // Group deductions, fine reversals, and affected students per voucher
    const deductions = new Map<string, number>();
    const fineReversals = new Map<string, number>();
    const affectedStudentIds = new Set<string>();

    colTxns.forEach((t) => {
      deductions.set(t.voucherId, (deductions.get(t.voucherId) || 0) + t.amount);
      if (t.fineAdded && Number(t.fineAdded) !== 0) {
        fineReversals.set(t.voucherId, (fineReversals.get(t.voucherId) || 0) + Number(t.fineAdded));
      }
      if (t.studentId) {
        affectedStudentIds.add(t.studentId);
      }
    });

    setCollections((prev) => prev.filter((c) => c.id !== id));
    setTransactions((prev) =>
      prev.filter(
        (t) => t.collectionId !== id && (!colToDelete || t.collectionId !== colToDelete.collectionNo)
      )
    );

    // Recalculate vouchers with payment deduction and fine reversal
    let recalculatedVouchers: FeeVoucher[] = [];
    setVouchers((prev) => {
      let updatedVouchers = prev.map((v) => {
        const deduct = deductions.get(v.id) || 0;
        const fineToRevert = fineReversals.get(v.id) || 0;

        if (deduct === 0 && fineToRevert === 0) return v;

        let cleanParticulars = v.particulars.map((p) => ({ ...p }));
        let grossTotal = v.grossTotal;
        let discountTotal = v.discountTotal;
        let netDue = v.netDue;

        // Undo fine additions if any
        if (fineToRevert !== 0) {
          const fineIndex = cleanParticulars.findIndex((p) => p.kind === 'Fine');
          if (fineIndex >= 0) {
            const currentFineAmount = cleanParticulars[fineIndex].amount;
            const revertedFineAmount = Math.max(0, currentFineAmount - fineToRevert);
            if (revertedFineAmount > 0) {
              cleanParticulars[fineIndex] = {
                ...cleanParticulars[fineIndex],
                amount: revertedFineAmount,
              };
            } else {
              cleanParticulars = cleanParticulars.filter((_, idx) => idx !== fineIndex);
            }
          }

          const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, v.roundingMultiple);
          grossTotal = cleanParticulars
            .filter((p) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
            .reduce((sum, p) => sum + p.amount, 0);
          discountTotal = cleanParticulars
            .filter((p) => p.kind === 'Discount')
            .reduce((sum, p) => sum + Math.abs(p.amount), 0);
          netDue = roundUpToMultiple(cleanParticulars.reduce((sum, p) => sum + p.amount, 0), mult);
        }

        const newPaid = Math.max(0, v.amountPaid - deduct);
        let newStatus: FeeVoucher['status'] = v.status;
        if (newStatus === 'Paid' || newStatus === 'Partial' || newStatus === 'Issued') {
          if (newPaid >= netDue && netDue > 0) {
            newStatus = 'Paid';
          } else if (newPaid > 0) {
            newStatus = 'Partial';
          } else if (netDue <= 0 && newPaid === 0) {
            newStatus = 'Paid';
          } else {
            newStatus = 'Issued';
          }
        }

        return {
          ...v,
          particulars: cleanParticulars,
          grossTotal,
          discountTotal,
          netDue,
          amountPaid: newPaid,
          status: newStatus,
        };
      });

      // Recalculate downstream student voucher sequence if previous balance / arrears are affected
      if (affectedStudentIds.size > 0) {
        updatedVouchers = recalculateVouchersSequence(updatedVouchers, Array.from(affectedStudentIds));
      }

      recalculatedVouchers = updatedVouchers;
      return updatedVouchers;
    });

    // Persist: delete the collection + its transactions, and upsert every
    // voucher belonging to an affected student (recalculateVouchersSequence
    // can touch a student's whole voucher chain, not just the directly
    // deducted voucher, via the prevBalance cascade — sending the student's
    // full chain is simplest and safe given per-student voucher counts are
    // naturally small).
    apiVoucherBatchUpdate({
      voucherUpserts: recalculatedVouchers.filter((v) => affectedStudentIds.has(v.studentId)),
      deleteTransactionIds: colTxns.map((t) => t.id),
      deleteCollectionIds: [id],
    }).then((res) => {
      if (!res.success) {
        reportFinancialSyncFailure('Collection deletion', new Error(res.error || 'Failed to persist collection deletion'));
      }
    }).catch((err) => {
      reportFinancialSyncFailure('Collection deletion', err);
    });

    // Audit Logging: Collection deletion and reversals
    const totalReverted = colToDelete?.totalAmount || colTxns.reduce((s, t) => s + t.amount, 0);
    const totalFinesReverted = Array.from(fineReversals.values()).reduce((a, b) => a + b, 0);

    logAuditEvent({
      actionType: 'collection_reversal',
      actionTitle: 'Fee Collection Record Deleted & Reversed',
      description: `Reversed collection ${colToDelete?.collectionNo || id} totaling Rs ${totalReverted.toLocaleString()} (${colTxns.length} transactions deducted from student vouchers).`,
      module: 'Collections',
      targetId: colToDelete?.collectionNo || id,
      targetLabel: `${colTxns.length} txns • Rs ${totalReverted.toLocaleString()}`,
      amount: totalReverted,
      metadata: {
        collectionId: id,
        collectionNo: colToDelete?.collectionNo,
        reversedAmount: totalReverted,
        transactionCount: colTxns.length,
        affectedVoucherIds: Array.from(deductions.keys()),
        finesReverted: totalFinesReverted,
      },
    });

    if (totalFinesReverted > 0) {
      logAuditEvent({
        actionType: 'fine_modification',
        actionTitle: 'Collection Late Fines Reverted',
        description: `Reverted Rs ${totalFinesReverted.toLocaleString()} in late fines across ${fineReversals.size} vouchers upon deleting collection ${colToDelete?.collectionNo || id}.`,
        module: 'Collections',
        targetId: colToDelete?.collectionNo || id,
        targetLabel: `${fineReversals.size} voucher fine reversals`,
        amount: totalFinesReverted,
        metadata: {
          collectionId: id,
          collectionNo: colToDelete?.collectionNo,
          finesReverted: totalFinesReverted,
        },
      });
    }
  };

  // Settings
  const updateInstitute = (updates: Partial<InstituteProfile>) => {
    setInstitute((prev) => ({ ...prev, ...updates }));
  };

  const addBankAccount = (bank: Omit<BankAccount, 'id'>) => {
    const perm = ensureMutationAllowed('Add bank account');
    if (!perm.allowed) return;

    const newBank: BankAccount = { ...bank, id: `bank-${Date.now()}` };
    if (newBank.isDefault) {
      setBankAccounts((prev) => prev.map((b) => ({ ...b, isDefault: false })).concat(newBank));
    } else {
      setBankAccounts((prev) => [...prev, newBank]);
    }
  };

  const updateBankAccount = (id: string, updates: Partial<BankAccount>) => {
    const perm = ensureMutationAllowed('Update bank account');
    if (!perm.allowed) return;

    if (updates.isDefault) {
      setBankAccounts((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...updates, isDefault: true } : { ...b, isDefault: false }))
      );
    } else {
      setBankAccounts((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
    }
  };

  const deleteBankAccount = (id: string) => {
    const perm = ensureMutationAllowed('Delete bank account');
    if (!perm.allowed) return;

    setBankAccounts((prev) => prev.filter((b) => b.id !== id));
  };

  const setDefaultBankAccount = (id: string) => {
    const perm = ensureMutationAllowed('Set default bank account');
    if (!perm.allowed) return;

    setBankAccounts((prev) => prev.map((b) => ({ ...b, isDefault: b.id === id })));
  };

  // Selection-based database cleanup with cascading integrity awareness
  const cleanupDatabaseTables = async (options: DataCleanupOptions): Promise<CleanupResult> => {
    const perm = ensureMutationAllowed('Database cleanup');
    if (!perm.allowed) return { success: false, recordsClearedCount: 0, clearedTables: [], error: perm.error };

    const clearedTables: string[] = [];
    let recordsClearedCount = 0;
    // Collects human-readable descriptions of anything that failed to
    // actually persist server-side, so we never report a destructive
    // operation as "successful" when it silently didn't happen.
    const persistenceFailures: string[] = [];

    // Track the final ("after cleanup") value of every table that a
    // simple-entity server endpoint exists for, alongside the existing
    // setState calls, so we can await real persistence for each one below
    // instead of just wiping local/localStorage state and hoping a later
    // background sync happens to catch up.
    let studentsAfter = students;
    let studentsTouched = false;
    let classesAfter = classes;
    let classesTouched = false;
    let familiesAfter = families;
    let familiesTouched = false;
    let templatesAfter = templates;
    let templatesTouched = false;
    let transportAssignmentsAfter = transportAssignments;
    let transportAssignmentsTouched = false;
    let stopsAfter = stops;
    let stopsTouched = false;
    let busesAfter = buses;
    let busesTouched = false;
    let bankAccountsAfter = bankAccounts;
    let bankAccountsTouched = false;
    let secondaryUsersToDelete: User[] = [];

    // 1. Students
    if (options.students) {
      recordsClearedCount += students.length;
      setStudents([]);
      setStudentAccountHistory([]);
      // Remove student members from families
      setFamilies((prev) => prev.map((f) => ({ ...f, memberStudentIds: [] })));
      // Clear transport assignments for students
      setTransportAssignments([]);
      // Clear student fee template overrides
      setTemplates((prev) => prev.filter((t) => !t.studentId));
      clearedTables.push(`Students & Profiles (${students.length} records)`);

      studentsAfter = [];
      studentsTouched = true;
      transportAssignmentsAfter = [];
      transportAssignmentsTouched = true;
      templatesAfter = templatesAfter.filter((t) => !t.studentId);
      templatesTouched = true;
    }

    // 2. Fee Vouchers
    if (options.vouchers) {
      recordsClearedCount += vouchers.length;
      setVouchers([]);
      setLockedMonths([]);
      clearedTables.push(`Fee Vouchers (${vouchers.length} records)`);
    }

    // 3. Fee Collections & Payment Transactions
    if (options.collections) {
      const collCount = collections.length + transactions.length;
      recordsClearedCount += collCount;
      setCollections([]);
      setTransactions([]);
      clearedTables.push(`Collections & Transactions (${collCount} records)`);
    }

    // 4. Classes
    if (options.classes) {
      recordsClearedCount += classes.length;
      setClasses([]);
      // Clear class fee template overrides
      setTemplates((prev) => prev.filter((t) => !t.classId));
      clearedTables.push(`Classes & Sections (${classes.length} records)`);

      classesAfter = [];
      classesTouched = true;
      templatesAfter = templatesAfter.filter((t) => !t.classId);
      templatesTouched = true;
    }

    // 5. Families
    if (options.families) {
      recordsClearedCount += families.length;
      setFamilies([]);
      // Remove familyId links from students if students were not already wiped
      if (!options.students) {
        setStudents((prev) => prev.map((s) => ({ ...s, familyId: undefined })));
        studentsAfter = studentsAfter.map((s) => ({ ...s, familyId: undefined }));
        studentsTouched = true;
      }
      clearedTables.push(`Families & Guardians (${families.length} records)`);

      familiesAfter = [];
      familiesTouched = true;
    }

    // 6. Fee Templates & Overrides
    if (options.templates) {
      const overrideCount = templates.filter((t) => !!t.studentId || !!t.classId).length;
      recordsClearedCount += (overrideCount || templates.length);
      setTemplates(INITIAL_GLOBAL_TEMPLATES);
      clearedTables.push(`Fee Particular Templates (Reset to standard 9-item baseline)`);

      templatesAfter = INITIAL_GLOBAL_TEMPLATES;
      templatesTouched = true;
    }

    // 7. Granular Transport Cleanup & Complete Transport Wipe
    const isFullTransportWipe = Boolean(options.transport);

    // 7a. Student Transport Assignments (only count if students table not already wiping assignments)
    if ((options.transportAssignments || isFullTransportWipe) && !options.students) {
      recordsClearedCount += transportAssignments.length;
      setTransportAssignments([]);
      if (!isFullTransportWipe) {
        clearedTables.push(`Student Transport Assignments (${transportAssignments.length} records)`);
      }

      transportAssignmentsAfter = [];
      transportAssignmentsTouched = true;
    }

    // 7b. Bus Stops & Monthly Fare Rates
    if (options.transportStops || isFullTransportWipe) {
      recordsClearedCount += stops.length;
      setStops([]);
      if (!isFullTransportWipe) {
        clearedTables.push(`Bus Stops & Fare Rates (${stops.length} stops)`);
      }

      stopsAfter = [];
      stopsTouched = true;
    }

    // 7c. Buses Fleet Directory
    if (options.transportBuses || isFullTransportWipe) {
      recordsClearedCount += buses.length;
      setBuses([]);
      if (!isFullTransportWipe) {
        clearedTables.push(`Buses Fleet Directory (${buses.length} buses)`);
      }

      busesAfter = [];
      busesTouched = true;
    }

    if (isFullTransportWipe) {
      const transCount = buses.length + stops.length + (!options.students ? transportAssignments.length : 0);
      clearedTables.push(`Complete Transport System (${transCount} buses, stops & assignments)`);
    }

    // 8. Bank Accounts
    if (options.bankAccounts) {
      recordsClearedCount += bankAccounts.length;
      setBankAccounts([]);
      clearedTables.push(`Bank Accounts (${bankAccounts.length} accounts)`);

      bankAccountsAfter = [];
      bankAccountsTouched = true;
    }

    // 9. Secondary Users (keep currently logged-in user safe)
    if (options.users) {
      const secondaryUsers = users.filter((u) => u.id !== currentUser.id);
      recordsClearedCount += secondaryUsers.length;
      const preserved = users.filter((u) => u.id === currentUser.id);
      setUsers(preserved);
      clearedTables.push(`Secondary Users (${secondaryUsers.length} users removed, current session preserved)`);

      secondaryUsersToDelete = secondaryUsers;
    }

    // --- Await real server-side persistence for every table touched above ---
    // Local/localStorage state is cleared optimistically for a responsive
    // UI, but "success" is not reported to the caller until every affected
    // table has been confirmed persisted (or deleted) on the server. Any
    // failure here means the corresponding local change will be reverted
    // by the reconciliation step further down, rather than silently
    // reappearing, unexplained, on the next refresh.
    const syncJobs: Promise<unknown>[] = [];

    const trackSync = (label: string, touched: boolean, collectionName: string, nextValue: any[]) => {
      if (!touched) return;
      syncJobs.push(
        syncSimpleEntityCollectionNow(collectionName, nextValue).then(({ failedIds }) => {
          if (failedIds.length > 0) {
            persistenceFailures.push(`${label} (${failedIds.length} record(s) could not be persisted)`);
          }
        })
      );
    };

    trackSync('Students & Profiles', studentsTouched, 'students', studentsAfter);
    trackSync('Classes & Sections', classesTouched, 'classes', classesAfter);
    trackSync('Families & Guardians', familiesTouched, 'families', familiesAfter);
    trackSync('Fee Particular Templates', templatesTouched, 'templates', templatesAfter);
    trackSync('Student Transport Assignments', transportAssignmentsTouched, 'transportAssignments', transportAssignmentsAfter);
    trackSync('Bus Stops & Fare Rates', stopsTouched, 'stops', stopsAfter);
    trackSync('Buses Fleet Directory', busesTouched, 'buses', busesAfter);
    trackSync('Bank Accounts', bankAccountsTouched, 'bankAccounts', bankAccountsAfter);

    if (secondaryUsersToDelete.length > 0) {
      syncJobs.push(
        (async () => {
          const results = await Promise.all(secondaryUsersToDelete.map((u) => apiDeleteUser(u.id)));
          const failedCount = results.filter((r) => !r.success).length;
          if (failedCount > 0) {
            persistenceFailures.push(`Secondary Users (${failedCount} could not be deleted)`);
          }
        })()
      );
    }

    // Vouchers/collections/transactions are deliberately excluded from the
    // generic diff-and-sync mechanism (see apiSync.ts) so that routine
    // payment collection can never accidentally bypass the transactional
    // write path. That means a wipe here needs an explicit, awaited
    // persistence call too, or the data would only disappear locally and
    // reappear on the next refresh.
    if (options.vouchers || options.collections) {
      syncJobs.push(
        apiVoucherBatchUpdate({
          deleteVoucherIds: options.vouchers ? vouchers.map((v) => v.id) : [],
          deleteTransactionIds: options.collections ? transactions.map((t) => t.id) : [],
          deleteCollectionIds: options.collections ? collections.map((c) => c.id) : [],
        }).catch((err) => {
          reportFinancialSyncFailure('Data cleanup', err);
          persistenceFailures.push('Fee Vouchers / Collections & Transactions');
        })
      );
    }

    await Promise.all(syncJobs);

    if (persistenceFailures.length > 0) {
      // Some deletions didn't actually reach the database — pull the true
      // server state back down rather than leaving the UI showing data
      // that, in reality, was never removed.
      const fresh = await fetchServerState();
      if (fresh?.success && fresh.data) {
        applyServerState(fresh.data);
      }
      return {
        success: false,
        clearedTables: [],
        recordsClearedCount: 0,
        error: `Cleanup did not fully complete — the following could not be persisted: ${persistenceFailures.join('; ')}. No changes were kept.`,
      };
    }

    logAuditEvent({
      actionType: 'system_cleanup',
      actionTitle: 'Granular Database Cleanup Executed',
      description: `Performed database cleanup across ${clearedTables.length} tables (${recordsClearedCount} total entities removed). Tables purged: ${clearedTables.join(', ')}.`,
      module: 'System',
      targetId: 'DB-CLEANUP',
      targetLabel: `${clearedTables.length} tables purged`,
      metadata: {
        tablesPurged: clearedTables,
        recordsCount: recordsClearedCount,
      },
    });

    return {
      success: true,
      clearedTables,
      recordsClearedCount,
    };
  };

  const reportFinancialSyncFailure = useCallback(
    (actionLabel: string, err: any) => {
      console.error(`[API] ${actionLabel} failed to save:`, err);
      showToast(
        `${actionLabel} failed to save — the change shown may not be saved. Reloading the latest saved data now; please retry if needed.`,
        'error',
        8000
      );
      // The optimistic local update for this action did not actually
      // persist server-side. Reconcile local state with the server's real,
      // saved state rather than leaving the UI silently showing data that
      // was never written — this is the only safe recovery once a
      // fire-and-forget financial write has failed.
      fetchServerState()
        .then((res) => {
          if (res?.success && res.data) {
            applyServerState(res.data);
          }
        })
        .catch(() => {
          // If reconciliation itself fails, the error toast above already
          // told the user the action wasn't saved; nothing further we can
          // safely do without risking papering over a real outage.
        });
    },
    [showToast, applyServerState]
  );

  // Surface background persistence failures for the generic simple-entity
  // sync layer (students/classes/families/buses/stops/transportAssignments/
  // templates/bankAccounts). Routine edits to these tables are persisted by
  // a debounced background sync (see queueDatabaseSync in apiSync.ts) with
  // no caller left waiting for the result, so a rejected create/update/
  // delete there previously surfaced only as a console.warn — the user saw
  // no error and the UI silently drifted from the server's real state until
  // an unrelated refresh happened to overwrite it. This reuses the same
  // toast + reconcile-from-server pattern already used for financial writes.
  useEffect(() => {
    const unsubscribe = subscribeSyncFailures(({ collection, failedIds }) => {
      const label = SYNC_ENTITY_LABELS[collection] || collection;
      reportFinancialSyncFailure(
        `${label} (${failedIds.length} record${failedIds.length === 1 ? '' : 's'})`,
        new Error(`Failed to sync ${failedIds.length} ${collection} record(s): ${failedIds.join(', ')}`)
      );
    });
    return unsubscribe;
  }, [reportFinancialSyncFailure]);

  return (
    <AppContext.Provider
      value={{
        isDbConnected,
        checkMutationAllowed,
        currentInstitution,
        currentUser,
        isAuthenticated,
        isSessionLoading,
        users,
        invites,
        registerInstitution,
        joinInstitution,
        createInvite,
        refreshInvites,
        login,
        logout,
        hasPermission,
        addUser,
        updateUser,
        updateUserPermissions,
        deleteUser,
        deleteInstitutionAndData,
        activeMonth,
        setActiveMonth,
        beforeMonthChange,
        classes,
        addClass,
        updateClass,
        deleteClass,
        toggleClassActive,
        reorderClasses,
        students,
        addStudent,
        updateStudent,
        deleteStudent,
        bulkDeleteStudents,
        families,
        addFamily,
        updateFamily,
        deleteFamily,
        addStudentToFamily,
        removeStudentFromFamily,
        buses,
        stops,
        transportAssignments,
        addBus,
        updateBus,
        deleteBus,
        reorderBuses,
        addStop,
        updateStop,
        deleteStop,
        reorderStops,
        bulkSaveTransportStops,
        saveTransportAssignment,
        bulkSaveTransportAssignments,
        deleteTransportAssignment,
        copyTransportAssignmentsFromPreviousMonth,
        bulkUpdateTransportDaysForMonth,
        templates,
        saveGlobalTemplate,
        updateGlobalTemplatesList,
        deleteGlobalTemplates,
        saveClassTemplateOverrides,
        deleteClassTemplates,
        saveStudentTemplateOverride,
        saveStudentTemplateOverrides,
        bulkSaveMultipleStudentTemplateOverrides,
        deleteStudentTemplates,
        resetAllTemplates,
        deleteTemplate,
        vouchers,
        previewVoucherGeneration,
        commitVoucherGeneration,
        generateAdmissionVoucher,
        collectVoucherPayment,
        updateVoucherParticulars,
        bulkCsvCollection,
        carryForwardDefaulter,
        bulkCarryForwardDefaulters,
        undoCarryForwardVoucher,
        getDownstreamVouchersInfo,
        deleteVoucher,
        bulkDeleteVouchers,
        collections,
        transactions,
        deleteCollection,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        themeConfig,
        updateThemeConfig,
        resetThemeConfig,
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
        transportRoundingMultiple,
        setTransportRoundingMultiple,
        defaultDueDateEnabled,
        defaultDueDay,
        setDefaultDueDateSettings,
        getComputedDefaultDueDate,
        voucherCopyOrder,
        setVoucherCopyOrder,
        voucherDefaultCopies,
        setVoucherDefaultCopies,
        institute,
        updateInstitute,
        sessionTimeoutMinutes,
        setSessionTimeoutMinutes,
        bankAccounts,
        addBankAccount,
        updateBankAccount,
        deleteBankAccount,
        setDefaultBankAccount,
        getMonthClosureStatus,
        lockedMonths,
        lockMonth,
        unlockMonth,
        isMonthLocked,
        cleanupDatabaseTables,
        auditLogs,
        logAuditEvent,
        clearAuditLogs,
        studentAccountHistory,
        addStudentAccountHistory,
        getStudentAccountHistory,
        updateStudentStatus,
        showToast,
      }}
    >
      {children}

      {/* Global In-App Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[9999] max-w-md animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div
            className={`flex items-start gap-3 p-4 rounded-2xl shadow-xl border text-xs font-medium ${
              toast.type === 'success'
                ? 'bg-emerald-950 text-emerald-100 border-emerald-800 shadow-emerald-950/20'
                : toast.type === 'error'
                ? 'bg-rose-950 text-rose-100 border-rose-800 shadow-rose-950/20'
                : toast.type === 'warning'
                ? 'bg-amber-950 text-amber-100 border-amber-800 shadow-amber-950/20'
                : 'bg-slate-900 text-slate-100 border-slate-700 shadow-slate-950/30'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
              {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
              {toast.type === 'info' && <Info className="w-4 h-4 text-sky-400" />}
            </div>
            <div className="flex-1 pr-2 leading-relaxed whitespace-pre-wrap">{toast.message}</div>
            <button
              onClick={() => setToast(null)}
              className="shrink-0 text-white/50 hover:text-white transition p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};