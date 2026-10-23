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
  ServerInvite,
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
import { calculateStudentVoucherPreview, formatMonthName, getCurrentMonthString, getDaysInMonth, getEffectiveMultiple, getNextMonthString, getPreviousMonthString, roundUpToMultiple, recalculateVoucherChain, getChangedVouchers, getLockedMonthsTouched, formatLockedImpactMessage, VoucherPreviewCalculation, normalizeDateToISO, normalizeNationalId, formatCurrency, DEFAULT_CURRENCY, setActiveCurrency } from '../utils/feeMath';
import { reconcileFamiliesAndStudents } from '../utils/familyReconcile';
import {
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
  apiCarryForwardBatch,
  apiVoucherBatchUpdate,
  apiFetchHistory,
  apiFetchAllFinancialIds,
  apiLockMonth,
  apiUnlockMonth,
  subscribeAuditWarnings,
  apiCommitBatch,
  checkMutationAllowed,
  subscribeDbStatus,
  apiUpdateInstituteSettings,
  apiPostAuditEvent,
  setActionLockActive,
} from '../services/apiSync';
import type { CommitEntity, CommitResult } from '../services/apiSync';

// Marker for a family number that the server has not issued yet.
const PENDING_FAMILY_NO = 'FAM-PENDING';
import { DatabaseActionLockModal } from '../components/DatabaseActionLockModal';

export interface LockedMonthInfo {
  notes: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: string;
}

export interface ActionLockState {
  active: boolean;
  title: string;
  current: number;
  total: number;
  message?: string;
  phase?: 'processing' | 'persisting' | 'completed';
}

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
  invites: ServerInvite[];
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
    inviteCode?: string;
  }) => Promise<{ success: boolean; invite?: ServerInvite; error?: string }>;
  refreshInvites: () => Promise<void>;
  login: (usernameOrEmail: string, password: string, institutionCode?: string) => Promise<{ success: boolean; error?: string; user?: User; mustChangePassword?: boolean }>;
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
  addClass: (name: string, monthlyFee: number, sortOrder: number) => Promise<{ success: boolean; error?: string; newClass?: SchoolClass }>;
  updateClass: (id: string, updates: Partial<SchoolClass>) => Promise<{ success: boolean; error?: string }>;
  deleteClass: (id: string) => Promise<{ success: boolean; error?: string }>;
  toggleClassActive: (id: string) => Promise<{ success: boolean; error?: string }>;
  reorderClasses: (reorderedClasses: SchoolClass[]) => Promise<{ success: boolean; error?: string }>;

  // Students
  students: Student[];
  addStudent: (student: Omit<Student, 'id' | 'studentNo' | 'regNo' | 'createdDate'> & { regNo?: string; studentNo?: string }) => Promise<{
    success: boolean;
    student?: Student;
    error?: string;
  }>;
  bulkAddStudents: (
    students: Array<Omit<Student, 'id' | 'studentNo' | 'regNo' | 'createdDate'> & { regNo?: string; studentNo?: string }>
  ) => Promise<{ success: boolean; importedCount: number; error?: string }>;
  updateStudent: (id: string, updates: Partial<Student>) => Promise<{ success: boolean; error?: string }>;
  deleteStudent: (id: string) => Promise<{ success: boolean; error?: string }>;
  bulkDeleteStudents: (ids: string[]) => Promise<{ deletedCount: number; skippedIds: string[]; error?: string }>;

  // Families
  families: Family[];
  addFamily: (family: Omit<Family, 'id' | 'familyNo'>) => Promise<{ success: boolean; family?: Family; error?: string }>;
  updateFamily: (id: string, updates: Partial<Family>) => Promise<{ success: boolean; error?: string }>;
  deleteFamily: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteFamilies: (ids: string[]) => Promise<{ success: boolean; error?: string }>;
  addStudentToFamily: (familyId: string, studentId: string) => Promise<{ success: boolean; error?: string }>;
  removeStudentFromFamily: (familyId: string, studentId: string) => Promise<{ success: boolean; error?: string }>;

  // Transport
  buses: TransportBus[];
  stops: TransportStop[];
  transportAssignments: TransportAssignment[];
  addBus: (bus: Omit<TransportBus, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateBus: (id: string, updates: Partial<TransportBus>) => Promise<{ success: boolean; error?: string }>;
  deleteBus: (id: string) => Promise<{ success: boolean; error?: string }>;
  reorderBuses: (reorderedBuses: TransportBus[]) => Promise<{ success: boolean; error?: string }>;
  addStop: (stop: Omit<TransportStop, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateStop: (id: string, updates: Partial<TransportStop>) => Promise<{ success: boolean; error?: string }>;
  deleteStop: (id: string) => Promise<{ success: boolean; error?: string }>;
  reorderStops: (reorderedStops: TransportStop[]) => Promise<{ success: boolean; error?: string }>;
  bulkSaveTransportStops: (
    stopsList: Array<Omit<TransportStop, 'id'> & { id?: string }>
  ) => Promise<{ success: boolean; count: number; addedCount: number; updatedCount: number; error?: string }>;
  saveTransportAssignment: (
    assignment: Omit<TransportAssignment, 'id'> & { id?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  bulkSaveTransportAssignments: (
    assignments: Array<Omit<TransportAssignment, 'id'> & { id?: string }>,
    options?: { deleteIds?: string[]; history?: any[] }
  ) => Promise<{ success: boolean; count: number; error?: string }>;
  deleteTransportAssignment: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteTransportAssignments: (ids: string[]) => Promise<{ success: boolean; error?: string }>;
  bulkUpdateTransportDaysForMonth: (
    targetMonth: string,
    daysCharged: number
  ) => Promise<{ success: boolean; updatedCount: number; error?: string }>;

  // Fee Particular Templates
  templates: FeeTemplate[];
  saveGlobalTemplate: (template: Omit<FeeTemplate, 'id'>, month?: string) => Promise<{ success: boolean; error?: string }>;
  updateGlobalTemplatesList: (newTemplates: FeeTemplate[], month?: string) => Promise<{ success: boolean; error?: string }>;
  deleteGlobalTemplates: (month?: string) => Promise<{ success: boolean; error?: string }>;
  saveClassTemplateOverrides: (
    classId: string,
    month: string,
    items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>
  ) => Promise<{ success: boolean; error?: string }>;
  deleteClassTemplates: (classId: string, month?: string) => Promise<{ success: boolean; error?: string }>;
  saveStudentTemplateOverride: (
    studentId: string,
    kind: ParticularKind,
    label: string,
    amount: number,
    month?: string
  ) => Promise<{ success: boolean; error?: string }>;
  saveStudentTemplateOverrides: (
    studentId: string,
    month: string,
    items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>
  ) => Promise<{ success: boolean; error?: string }>;
  bulkSaveMultipleStudentTemplateOverrides: (
    entries: Array<{
      studentId: string;
      items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>;
    }>,
    month: string
  ) => Promise<{ success: boolean; error?: string }>;
  deleteStudentTemplates: (studentId: string, month?: string) => Promise<{ success: boolean; error?: string }>;
  deleteStudentTemplateScopes: (scopes: Array<{ studentId: string; month?: string }>) => Promise<{ success: boolean; error?: string }>;
  resetAllTemplates: () => Promise<{ success: boolean; error?: string }>;
  deleteTemplate: (id: string) => Promise<{ success: boolean; error?: string }>;

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
  ) => Promise<{ success: boolean; generatedCount: number; error?: string; warning?: string }>;
  generateAdmissionVoucher: (
    studentId: string,
    month: string,
    options?: {
      dueDate?: string;
      lateFeeRate?: number;
      notes?: string;
      items?: { kind: ParticularKind; label: string; amount: number }[];
    }
  ) => Promise<{ success: boolean; voucher?: FeeVoucher; error?: string }>;
  collectVoucherPayment: (
    voucherId: string,
    amount: number,
    paymentMode: PaymentTransaction['paymentMode'],
    referenceNo?: string,
    notes?: string,
    date?: string,
    updatedParticulars?: VoucherItem[]
  ) => Promise<{ success: boolean; transaction?: PaymentTransaction; voucher?: FeeVoucher; error?: string }>;
  updateVoucherParticulars: (
    voucherId: string,
    updatedParticulars: VoucherItem[]
  ) => Promise<{ success: boolean; voucher?: FeeVoucher; error?: string }>;
  reissueVoucher: (voucherId: string) => Promise<{ success: boolean; voucher?: FeeVoucher; changedCount?: number; error?: string }>;
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
  ) => Promise<{ success: boolean; successCount: number; errors: string[] }>;
  bulkCarryForwardDefaulters: (
    voucherIds: string[],
    targetMonth: string,
    addLateFine: boolean,
    customFineAmount?: number,
    perVoucherFines?: Record<string, number>
  ) => Promise<{ success: boolean; successCount: number; errors: string[] }>;
  undoCarryForwardVoucher: (voucherId: string) => Promise<{ success: boolean; error?: string }>;
  /** True while any voucher or collection write is waiting for the server. */
  financialSaving: boolean;
  defaultLateFeeRate: number;
  setDefaultLateFeeRate: (rate: number) => Promise<{ success: boolean; error?: string }>;
  roundingMultiple: number;
  setRoundingMultiple: (multiple: number) => Promise<{ success: boolean; error?: string }>;
  roundingEnabled: boolean;
  setRoundingEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  transportRoundingMultiple: number;
  setTransportRoundingMultiple: (multiple: number) => Promise<{ success: boolean; error?: string }>;
  defaultDueDateEnabled: boolean;
  defaultDueDay: number;
  setDefaultDueDateSettings: (settings: {
    enabled: boolean;
    day?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  getComputedDefaultDueDate: (month: string) => string;
  voucherCopyOrder: VoucherCopyType[];
  setVoucherCopyOrder: (order: VoucherCopyType[]) => Promise<{ success: boolean; error?: string }>;
  voucherDefaultCopies: VoucherCopyType[];
  setVoucherDefaultCopies: (copies: VoucherCopyType[]) => Promise<{ success: boolean; error?: string }>;
  getDownstreamVouchersInfo: (ids: string[]) => {
    hasDownstream: boolean;
    conflicts: DownstreamConflict[];
    totalDownstreamCount: number;
  };
  deleteVoucher: (
    id: string,
    force?: boolean,
    mode?: VoucherDeletionResolution
  ) => Promise<{ success: boolean; error?: string; hasTxns?: boolean; deletedCount?: number; transactionCount?: number }>;
  bulkDeleteVouchers: (
    ids: string[],
    force?: boolean,
    mode?: VoucherDeletionResolution
  ) => Promise<{ success: boolean; deletedCount: number; error?: string; hasTxns?: boolean; transactionCount?: number }>;

  // Collections & Transactions
  collections: FeeCollection[];
  transactions: PaymentTransaction[];
  deleteCollection: (id: string) => Promise<{ success: boolean; error?: string }>;

  // UI Preferences & Themes
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  themeConfig: AppThemeConfig;
  updateThemeConfig: (updates: Partial<AppThemeConfig>) => void;
  resetThemeConfig: () => void;

  // Settings & Policy
  priorMonthRule: PriorMonthVoucherRule;
  setPriorMonthRule: (rule: PriorMonthVoucherRule) => Promise<{ success: boolean; error?: string }>;
  /** Saves several policy settings in one request; applied on screen only after the server accepts. */
  savePolicySettings: (patch: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
  skippedMonthRule: SkippedMonthVoucherRule;
  setSkippedMonthRule: (rule: SkippedMonthVoucherRule) => Promise<{ success: boolean; error?: string }>;
  voucherDeletionResolution: VoucherDeletionResolution;
  setVoucherDeletionResolution: (policy: VoucherDeletionResolution) => Promise<{ success: boolean; error?: string }>;
  institute: InstituteProfile;
  updateInstitute: (updates: Partial<InstituteProfile>) => Promise<{ success: boolean; error?: string }>;
  sessionTimeoutMinutes: number;
  setSessionTimeoutMinutes: (minutes: number) => Promise<{ success: boolean; error?: string }>;
  bankAccounts: BankAccount[];
  addBankAccount: (bank: Omit<BankAccount, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateBankAccount: (id: string, updates: Partial<BankAccount>) => Promise<{ success: boolean; error?: string }>;
  deleteBankAccount: (id: string) => Promise<{ success: boolean; error?: string }>;
  setDefaultBankAccount: (id: string) => Promise<{ success: boolean; error?: string }>;

  // Month Closure Check Helper & Lock Management
  getMonthClosureStatus: (month: string) => MonthClosureStatus;
  lockedMonths: string[];
  /** Earliest billing month whose vouchers/collections/transactions are loaded ('' until first load). */
  historyFrom: string;
  /** Load closed history down to `fromMonth` (YYYY-MM; '0000-01' = everything). Resolves when merged. */
  ensureHistoryLoaded: (fromMonth: string) => Promise<void>;
  /** Load one student's full voucher/collection/transaction history. */
  ensureStudentHistory: (studentId: string) => Promise<void>;
  lockedMonthDetails: Record<string, LockedMonthInfo>;
  lockMonth: (month: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
  unlockMonth: (month: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  isMonthLocked: (month: string) => boolean;
  /** Reloads vouchers, collections and the rest from the server (read-only; used after server-side postings). */
  refreshFromServer: () => Promise<void>;

  // System Utility & Granular Cleanup
  cleanupDatabaseTables: (options: DataCleanupOptions) => Promise<CleanupResult>;

  // Audit Trail & Activity Logs
  logAuditEvent: (
    entry: Omit<
      AuditLogEntry,
      'id' | 'timestamp' | 'operatorId' | 'operatorUsername' | 'operatorName' | 'operatorRole'
    > &
      Partial<Pick<AuditLogEntry, 'operatorId' | 'operatorUsername' | 'operatorName' | 'operatorRole' | 'timestamp'>>
  ) => void;
  auditRetentionMonths: number;
  setAuditRetentionMonths: (months: number) => Promise<{ success: boolean; error?: string }>;

  // Student Account History (Chronological Status & Transport Log)
  studentAccountHistory: StudentAccountHistoryEntry[];
  getStudentAccountHistory: (studentId: string) => StudentAccountHistoryEntry[];
  updateStudentStatus: (
    studentId: string,
    newStatus: StudentStatus,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;

  // Global In-App Notifications / Toasts
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', durationMs?: number) => void;

  // Transactional Action Lock
  actionLock: ActionLockState | null;
  startActionLock: (title: string, total: number, message?: string) => void;
  updateActionLock: (updates: Partial<Omit<ActionLockState, 'active'>>) => void;
  stopActionLock: (completionMessage?: string, delayMs?: number) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEY = 'skooler_app_data_v1';

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

  const [invites, setInvites] = useState<ServerInvite[]>([]);

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

  // Central Database Action Lock (guards in-process transactions and UI operations)
  const [actionLock, setActionLock] = useState<ActionLockState | null>(null);
  const actionLockSafetyTimerRef = useRef<any>(null);

  const startActionLock = useCallback(
    (title: string, total: number, message?: string) => {
      if (actionLockSafetyTimerRef.current) {
        clearTimeout(actionLockSafetyTimerRef.current);
      }
      setActionLockActive(true);
      setActionLock({
        active: true,
        title,
        current: 0,
        total: Math.max(1, total),
        message,
        phase: 'processing',
      });
      // Safety auto-unlock after 35 seconds to prevent permanent UI lockup if an unhandled network error occurs
      actionLockSafetyTimerRef.current = setTimeout(() => {
        setActionLockActive(false);
        setActionLock(null);
      }, 35000);
    },
    []
  );

  const updateActionLock = useCallback(
    (updates: Partial<Omit<ActionLockState, 'active'>>) => {
      setActionLock((prev) => (prev && prev.active ? { ...prev, ...updates } : prev));
    },
    []
  );

  const stopActionLock = useCallback(
    async (completionMessage?: string, delayMs: number = 300) => {
      if (actionLockSafetyTimerRef.current) {
        clearTimeout(actionLockSafetyTimerRef.current);
        actionLockSafetyTimerRef.current = null;
      }
      if (completionMessage) {
        setActionLock((prev) =>
          prev && prev.active
            ? {
                ...prev,
                current: prev.total,
                message: completionMessage,
                phase: 'completed',
              }
            : null
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      setActionLockActive(false);
      setActionLock(null);
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

  // Policy settings are confirm-first: one request, and the screen (and the
  // values the rest of the app reads) change only after the server accepted it.
  // On refusal nothing changes and the server's reason is returned.
  const cleanPolicySettings = (p: Record<string, any>): Record<string, any> => {
    const o: Record<string, any> = {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k) && p[k] !== undefined;
    if (has('priorMonthRule')) o.priorMonthRule = p.priorMonthRule;
    if (has('skippedMonthRule')) o.skippedMonthRule = p.skippedMonthRule;
    if (has('voucherDeletionResolution')) o.voucherDeletionResolution = p.voucherDeletionResolution;
    if (has('sessionTimeoutMinutes')) o.sessionTimeoutMinutes = Math.max(1, Math.min(180, Number(p.sessionTimeoutMinutes) || 10));
    if (has('defaultLateFeeRate')) o.defaultLateFeeRate = Number(p.defaultLateFeeRate) || 0;
    if (has('roundingMultiple')) o.roundingMultiple = p.roundingMultiple > 0 && Number.isInteger(p.roundingMultiple) ? p.roundingMultiple : 1;
    if (has('roundingEnabled')) o.roundingEnabled = !!p.roundingEnabled;
    if (has('transportRoundingMultiple')) o.transportRoundingMultiple = p.transportRoundingMultiple > 0 && Number.isInteger(p.transportRoundingMultiple) ? p.transportRoundingMultiple : 10;
    if (has('defaultDueDateEnabled')) o.defaultDueDateEnabled = !!p.defaultDueDateEnabled;
    if (has('defaultDueDay')) o.defaultDueDay = Math.min(Math.max(1, Number(p.defaultDueDay) || 15), 31);
    if (has('voucherCopyOrder')) o.voucherCopyOrder = Array.isArray(p.voucherCopyOrder) && p.voucherCopyOrder.length > 0 ? p.voucherCopyOrder : ['bank', 'institute', 'student'];
    if (has('voucherDefaultCopies')) o.voucherDefaultCopies = Array.isArray(p.voucherDefaultCopies) && p.voucherDefaultCopies.length > 0 ? p.voucherDefaultCopies : ['bank', 'institute', 'student'];
    if (has('auditRetentionMonths')) o.auditRetentionMonths = Number.isFinite(Number(p.auditRetentionMonths)) && Number(p.auditRetentionMonths) >= 0 ? Math.min(120, Math.floor(Number(p.auditRetentionMonths))) : 6;
    return o;
  };

  const applyPolicySettings = (c: Record<string, any>) => {
    if ('priorMonthRule' in c) setPriorMonthRuleState(c.priorMonthRule);
    if ('skippedMonthRule' in c) setSkippedMonthRuleState(c.skippedMonthRule);
    if ('voucherDeletionResolution' in c) setVoucherDeletionResolutionState(c.voucherDeletionResolution);
    if ('sessionTimeoutMinutes' in c) {
      const m = c.sessionTimeoutMinutes;
      setSessionTimeoutMinutesState(m);
      try {
        localStorage.setItem('quickfees_session_timeout_minutes', String(m));
        localStorage.setItem('quickfees_inactivity_duration', String(m));
      } catch {}
      setCurrentInstitution((prev) => {
        if (!prev) return prev;
        const cur = prev.settings ? (typeof prev.settings === 'string' ? JSON.parse(prev.settings) : prev.settings) : {};
        return { ...prev, settings: { ...cur, sessionTimeoutMinutes: m } };
      });
    }
    if ('defaultLateFeeRate' in c) setDefaultLateFeeRateState(c.defaultLateFeeRate);
    if ('roundingMultiple' in c) setRoundingMultipleState(c.roundingMultiple);
    if ('roundingEnabled' in c) setRoundingEnabledState(c.roundingEnabled);
    if ('transportRoundingMultiple' in c) setTransportRoundingMultipleState(c.transportRoundingMultiple);
    if ('defaultDueDateEnabled' in c) setDefaultDueDateEnabledState(c.defaultDueDateEnabled);
    if ('defaultDueDay' in c) setDefaultDueDayState(c.defaultDueDay);
    if ('voucherCopyOrder' in c) setVoucherCopyOrderState(c.voucherCopyOrder);
    if ('voucherDefaultCopies' in c) setVoucherDefaultCopiesState(c.voucherDefaultCopies);
    setInstitute((prev) => ({
      ...prev,
      ...('sessionTimeoutMinutes' in c ? { sessionTimeoutMinutes: c.sessionTimeoutMinutes } : {}),
      settings: { ...prev.settings, ...c },
    }));
  };

  const savePolicySettings = async (patch: Record<string, any>): Promise<{ success: boolean; error?: string }> => {
    const perm = ensureMutationAllowed('Change settings');
    if (!perm.allowed) return { success: false, error: perm.error };
    const clean = cleanPolicySettings(patch);
    if (Object.keys(clean).length === 0) return { success: true };
    const res = await apiUpdateInstituteSettings(clean);
    if (!res.success) return { success: false, error: res.error || 'The server did not accept the settings change.' };
    applyPolicySettings(clean);
    return { success: true };
  };

  const setPriorMonthRule = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ priorMonthRule: v });

  const [skippedMonthRule, setSkippedMonthRuleState] = useState<SkippedMonthVoucherRule>('warning');

  const setSkippedMonthRule = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ skippedMonthRule: v });

  const [voucherDeletionResolution, setVoucherDeletionResolutionState] = useState<VoucherDeletionResolution>('cascade');

  const setVoucherDeletionResolution = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ voucherDeletionResolution: v });

  // Option B: Inactivity Auto-Logout Timeout (Default: 10 minutes, configurable in Settings & persisted in PostgreSQL & localStorage)
  const [sessionTimeoutMinutes, setSessionTimeoutMinutesState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('quickfees_session_timeout_minutes');
      if (stored) {
        const parsed = Number(stored);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 180) return parsed;
      }
    } catch {}
    return 10;
  });

  const setSessionTimeoutMinutes = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ sessionTimeoutMinutes: v });

  const [defaultLateFeeRate, setDefaultLateFeeRateState] = useState<number>(500);

  const setDefaultLateFeeRate = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ defaultLateFeeRate: v });

  const [roundingMultiple, setRoundingMultipleState] = useState<number>(1);

  const setRoundingMultiple = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ roundingMultiple: v });

  const [roundingEnabled, setRoundingEnabledState] = useState<boolean>(true);

  const setRoundingEnabled = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ roundingEnabled: v });

  const [transportRoundingMultiple, setTransportRoundingMultipleState] = useState<number>(10);

  const setTransportRoundingMultiple = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ transportRoundingMultiple: v });

  const [defaultDueDateEnabled, setDefaultDueDateEnabledState] = useState<boolean>(false);

  const [defaultDueDay, setDefaultDueDayState] = useState<number>(15);

  const setDefaultDueDateSettings = (settings: { enabled: boolean; day?: number }): Promise<{ success: boolean; error?: string }> =>
    savePolicySettings({ defaultDueDateEnabled: settings.enabled, ...(settings.day !== undefined ? { defaultDueDay: settings.day } : {}) });

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

  const setVoucherCopyOrder = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ voucherCopyOrder: v });

  const [voucherDefaultCopies, setVoucherDefaultCopiesState] = useState<VoucherCopyType[]>(['bank', 'institute', 'student']);

  const setVoucherDefaultCopies = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ voucherDefaultCopies: v });

  // Core domain state
  const [classes, setClasses] = useState<SchoolClass[]>(() => []);

  const [students, setStudents] = useState<Student[]>(() => []);

  const [families, setFamilies] = useState<Family[]>(() => []);

  // Loop-safe sequence counters for auto-generated codes (Reg #, Family #).
  // `useRef` initial values are only applied on the very first render, so these
  // start in sync with the students/families arrays computed above, then
  // increment independently of React's (batched, async) state updates.
  const studentSeqRef = useRef<number>(students.length);

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
  // grouping siblings under a shared father National ID. These refs are updated
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
  // above: lets synchronous callbacks (bulk carry-forward result merge, undo)
  // read the latest vouchers instead of a stale render snapshot. Re-synced from
  // state after every commit so it never drifts stale between unrelated actions.
  const vouchersRef = useRef<FeeVoucher[]>(vouchers);

  useEffect(() => {
    vouchersRef.current = vouchers;
  }, [vouchers]);

  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() => []);
  const transactionsRef = useRef<PaymentTransaction[]>(transactions);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);
  const collectionsRef = useRef<FeeCollection[]>(collections);
  useEffect(() => {
    collectionsRef.current = collections;
  }, [collections]);

  // Working-set loading: the server sends the oldest-unlocked-month-onward set
  // (plus each student's latest voucher and every open voucher). Older, locked
  // history can never change, so it is fetched on demand and retained.
  const [historyFrom, setHistoryFrom] = useState<string>('');
  const historyFromRef = useRef<string>('');
  const historyTenantRef = useRef<string>('');
  const historyInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const studentHistoryLoadedRef = useRef<Set<string>>(new Set());
  // Whenever the loaded voucher/collection/transaction rows are cleared (logout,
  // institution switch, re-login), the record of how far back history was loaded
  // must be cleared too; otherwise older months are believed to be in memory and
  // are never fetched again (blank dashboard/vouchers for an older active month).
  const resetHistoryTracking = () => {
    historyTenantRef.current = '';
    historyFromRef.current = '';
    historyInFlightRef.current = new Map();
    studentHistoryLoadedRef.current = new Set();
    setHistoryFrom('');
  };

  const [institute, setInstitute] = useState<InstituteProfile>(() => INITIAL_INSTITUTE);
  // Keep the shared money formatter on the institution's currency. Done during
  // render (idempotent) so children format with the right code on first paint.
  setActiveCurrency(institute.currency);

  // Audit log retention (months; 0 = keep forever). Enforced by the server.
  const auditRetentionMonths = (() => {
    const raw = Number((institute as any)?.settings?.auditRetentionMonths);
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 6;
  })();

  const setAuditRetentionMonths = (v: any): Promise<{ success: boolean; error?: string }> => savePolicySettings({ auditRetentionMonths: v });


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

  // Display preferences (theme, sidebar) are the one deliberate exception to confirm-first:
  // they change the screen at once because they are personal and cosmetic, and flipping a
  // colour back after a slow save would feel broken. A failed save is NOT silent, though:
  // the operator is told (at most once every 30 seconds) that the choice will not be
  // remembered after reload.
  const lastPrefWarningRef = useRef(0);
  const savePreferences = useCallback(
    (patch: Parameters<typeof apiSavePreferences>[0]) => {
      apiSavePreferences(patch)
        .then((res) => {
          if (res?.success) return;
          const now = Date.now();
          if (now - lastPrefWarningRef.current < 30000) return;
          lastPrefWarningRef.current = now;
          showToast('Your display preference could not be saved and will reset when you reload the page.', 'error', 7000);
        })
        .catch(() => {});
    },
    [showToast]
  );

  useEffect(() => {
    if (!prefsReadyRef.current || savedSidebarRef.current === isSidebarCollapsed) return;
    savedSidebarRef.current = isSidebarCollapsed;
    savePreferences({ sidebarCollapsed: isSidebarCollapsed });
  }, [isSidebarCollapsed, savePreferences]);

  const updateThemeConfig = useCallback((updates: Partial<AppThemeConfig>) => {
    const next = { ...themeConfigRef.current, ...updates };
    themeConfigRef.current = next;
    setThemeConfig(next);
    applyThemeToDom(next);
    savePreferences({ themeConfig: next });
  }, [savePreferences]);

  const resetThemeConfig = useCallback(() => {
    themeConfigRef.current = DEFAULT_THEME_CONFIG;
    setThemeConfig(DEFAULT_THEME_CONFIG);
    applyThemeToDom(DEFAULT_THEME_CONFIG);
    savePreferences({ themeConfig: DEFAULT_THEME_CONFIG });
  }, [savePreferences]);

  // Ensure DOM is updated on initial mount and theme changes
  useEffect(() => {
    applyThemeToDom(themeConfig);
  }, [themeConfig]);

  // Audit Trail & Activity Logs

  const currentUserRef = useRef<User>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Audit entries are stored and served by the server only, and the server
  // writes them itself for every operation it performs (students, vouchers,
  // collections, settings, restore, backup export ...). Doing it there means the
  // entry is written together with the change and cannot be skipped by a client.
  //
  // Only three kinds are still forwarded from the browser, because the action
  // they describe is made of several server calls (or a client-side calculation)
  // and no single endpoint sees the whole operation:
  //   - fine_modification : a fine waived or changed while recording a payment
  //   - system_cleanup    : the multi-step data cleanup (one entry for the run)
  //   - carry_forward     : reverting a carry-forward (the carry-forward itself
  //                         is audited by the server)
  // The server accepts only these (CLIENT_AUDIT_EVENTS in server.ts); anything
  // else is dropped here so the same action is never recorded twice. Do not add
  // a call to logAuditEvent for a new operation — audit it in its endpoint.
  const logAuditEvent = useCallback(
    (
      entry: Omit<
        AuditLogEntry,
        'id' | 'timestamp' | 'operatorId' | 'operatorUsername' | 'operatorName' | 'operatorRole'
      > &
        Partial<Pick<AuditLogEntry, 'operatorId' | 'operatorUsername' | 'operatorName' | 'operatorRole' | 'timestamp'>>
    ) => {
      const forwarded =
        entry.actionType === 'fine_modification' ||
        (entry.actionType === 'system_cleanup' && entry.module === 'System') ||
        (entry.actionType === 'carry_forward' && entry.actionTitle === 'Carry Forward Operation Reverted');
      if (!forwarded) return;
      apiPostAuditEvent({
        actionType: entry.actionType,
        actionTitle: entry.actionTitle,
        module: entry.module,
        description: entry.description,
        targetId: entry.targetId,
        targetLabel: entry.targetLabel,
        month: entry.month,
        amount: entry.amount,
        previousValue: entry.previousValue,
        newValue: entry.newValue,
        metadata: entry.metadata,
      });
    },
    []
  );

  // Student Account History (Chronological Status, Transport & Academic Event Log)
  const [studentAccountHistory, setStudentAccountHistory] = useState<StudentAccountHistoryEntry[]>(() => []);

  type HistoryInput = Omit<StudentAccountHistoryEntry, 'id' | 'timestamp' | 'date'> & {
    id?: string;
    timestamp?: string;
    date?: string;
  };

  // Builds a complete history entry (id, time, operator) without storing it, so it can
  // be sent to the server inside the same batch as the change it describes.
  const buildHistoryEntry = useCallback((entry: HistoryInput): StudentAccountHistoryEntry => {
    const activeUser = currentUserRef.current;
    return {
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
  }, []);


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

      // Check for transport assignments that might not have an explicit history record.
      // Sort chronologically (oldest month first) to evaluate transitions accurately.
      const studentAssignments = transportAssignments
        .filter((a) => a.studentId === studentId && a.active !== false)
        .sort((a, b) => a.month.localeCompare(b.month));

      let priorSynthesizedAsgn: TransportAssignment | null = null;
      for (const asgn of studentAssignments) {
        const hasMatchingTransport = explicitEntries.some(
          (e) => e.category === 'transport' && e.month === asgn.month
        );
        if (hasMatchingTransport) {
          priorSynthesizedAsgn = asgn;
          continue;
        }

        // CSV transport assignments should be smart: do not make new entry if exact same assignment already exists in any prior month
        if (priorSynthesizedAsgn) {
          const isIdentical =
            priorSynthesizedAsgn.stopId === asgn.stopId &&
            priorSynthesizedAsgn.busId === asgn.busId &&
            priorSynthesizedAsgn.tripType === asgn.tripType &&
            (priorSynthesizedAsgn.discount || 0) === (asgn.discount || 0);

          if (isIdentical) {
            // Unchanged ongoing assignment: skip redundant entry
            priorSynthesizedAsgn = asgn;
            continue;
          }
        }

        const stop = stops.find((s) => s.id === asgn.stopId);
        const bus = buses.find((b) => b.id === asgn.busId);
        const monthName = formatMonthName(asgn.month);
        const fare = stop?.monthlyFare ? Math.max(0, stop.monthlyFare - (asgn.discount || 0)) : 0;
        // Use actual timestamp of event rather than static time
        const eventTimestamp = asgn.createdAt || (student?.admissionDate ? `${student.admissionDate}T08:00:00.000Z` : new Date().toISOString());
        const eventDate = asgn.createdAt ? asgn.createdAt.split('T')[0] : (student?.admissionDate || `${asgn.month}-01`);

        if (!priorSynthesizedAsgn) {
          synthesized.push({
            id: `synth-tr-${asgn.id}`,
            studentId: asgn.studentId,
            timestamp: eventTimestamp,
            date: eventDate,
            category: 'transport',
            actionTitle: `Transport Added (${monthName})`,
            description: `Transport assigned for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'} (${bus?.routeName || 'Route'}) - ${asgn.tripType === 'OneWay' ? 'One Way' : 'Round Trip'}. Net fare: ${formatCurrency(fare)}.`,
            previousValue: 'No Transport',
            newValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
            month: asgn.month,
            operatorName: 'Transport Incharge',
            operatorRole: 'Accountant',
            metadata: { isSynthesized: true, assignmentId: asgn.id },
          });
        } else {
          const prevStop = stops.find((s) => s.id === priorSynthesizedAsgn!.stopId);
          const prevBus = buses.find((b) => b.id === priorSynthesizedAsgn!.busId);
          synthesized.push({
            id: `synth-tr-${asgn.id}`,
            studentId: asgn.studentId,
            timestamp: eventTimestamp,
            date: eventDate,
            category: 'transport',
            actionTitle: `Transport Route Updated (${monthName})`,
            description: `Transport route updated for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'} (${asgn.tripType === 'OneWay' ? 'One Way' : 'Round Trip'}). Previous: ${prevStop?.name || 'Stop'} via ${prevBus?.busNumber || 'Bus'}. Net fare: ${formatCurrency(fare)}.`,
            previousValue: `${prevStop?.name || 'Stop'} (${prevBus?.busNumber || 'Bus'})`,
            newValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
            month: asgn.month,
            operatorName: 'Transport Incharge',
            operatorRole: 'Accountant',
            metadata: { isSynthesized: true, assignmentId: asgn.id },
          });
        }

        priorSynthesizedAsgn = asgn;
      }

      // Sort descending (newest first)
      return synthesized.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    [studentAccountHistory, students, classes, transportAssignments, stops, buses]
  );


  const [lockedMonths, setLockedMonths] = useState<string[]>(() => []);
  const [lockedMonthDetails, setLockedMonthDetails] = useState<Record<string, LockedMonthInfo>>({});

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
    // Working-set payloads (windowStart present) keep the closed history that was
    // already loaded on demand: months before the window are locked, so those
    // rows cannot have changed. A different institution drops it.
    const ws: string | undefined = typeof d.windowStart === 'string' ? d.windowStart : undefined;
    if (d.institutionId && historyTenantRef.current !== d.institutionId) {
      historyTenantRef.current = d.institutionId;
      historyFromRef.current = '';
      studentHistoryLoadedRef.current = new Set();
      historyInFlightRef.current = new Map();
      setHistoryFrom('');
    }
    if (ws !== undefined) {
      const nextFrom = historyFromRef.current && historyFromRef.current < ws ? historyFromRef.current : ws;
      historyFromRef.current = nextFrom;
      setHistoryFrom(nextFrom);
    }
    const keepOlder = <T,>(prev: T[], next: T[], isOlder: (x: T) => boolean, idOf: (x: T) => string): T[] => {
      if (ws === undefined) return next;
      const have = new Set(next.map(idOf));
      return [...next, ...prev.filter((x) => isOlder(x) && !have.has(idOf(x)))];
    };
    if (Array.isArray(d.vouchers)) setVouchers((prev) => keepOlder<FeeVoucher>(prev, d.vouchers, (v) => v.month < (ws as string), (v) => v.id));
    if (Array.isArray(d.collections)) {
      setCollections((prev) => keepOlder<FeeCollection>(prev, d.collections, (c) => String(c.date || '') < `${ws}-01`, (c) => c.id));
    }
    if (Array.isArray(d.transactions)) {
      setTransactions((prev) => keepOlder<PaymentTransaction>(prev, d.transactions, (t) => String(t.month || '') < (ws as string), (t) => t.id));
    }
    if (Array.isArray(d.bankAccounts)) setBankAccounts(d.bankAccounts);
    if (Array.isArray(d.studentAccountHistory)) setStudentAccountHistory(d.studentAccountHistory);
    if (Array.isArray(d.lockedMonths)) setLockedMonths(d.lockedMonths);
    if (Array.isArray(d.lockedMonthDetails)) {
      const map: Record<string, LockedMonthInfo> = {};
      for (const x of d.lockedMonthDetails) {
        if (x?.month) map[x.month] = { notes: x.notes || '', lockedBy: x.lockedBy || '', lockedByName: x.lockedByName || '', lockedAt: x.lockedAt || '' };
      }
      setLockedMonthDetails(map);
    }
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
    setTimeout(() => {
      isRemoteUpdateRef.current = false;
    }, 150);
  }, []);

  // --- On-demand closed history -------------------------------------------
  const mergeHistory = useCallback(
    (h: { vouchers: FeeVoucher[]; collections: FeeCollection[]; transactions: PaymentTransaction[] }) => {
      isRemoteUpdateRef.current = true;
      const add = <T,>(prev: T[], inc: T[], idOf: (x: T) => string): T[] => {
        if (inc.length === 0) return prev;
        const have = new Set(prev.map(idOf));
        return [...prev, ...inc.filter((x) => !have.has(idOf(x)))];
      };
      setVouchers((prev) => add<FeeVoucher>(prev, h.vouchers, (v) => v.id));
      setCollections((prev) => add<FeeCollection>(prev, h.collections, (c) => c.id));
      setTransactions((prev) => add<PaymentTransaction>(prev, h.transactions, (t) => t.id));
      setTimeout(() => {
        isRemoteUpdateRef.current = false;
      }, 150);
    },
    []
  );

  const ensureHistoryLoaded = useCallback(
    async (fromMonth: string): Promise<void> => {
      const cur = historyFromRef.current;
      if (!cur || !fromMonth || fromMonth >= cur) return;
      // Reuse any in-flight load that already reaches this far back.
      for (const [k, p] of historyInFlightRef.current) {
        if (k <= fromMonth) {
          await p;
          if (fromMonth >= historyFromRef.current) return;
          break;
        }
      }
      const job = (async () => {
        const res = await apiFetchHistory({ monthFrom: fromMonth, monthBefore: historyFromRef.current });
        if (!res.success) {
          console.warn('[History] Failed to load closed history:', res.error);
          return;
        }
        mergeHistory(res as any);
        historyFromRef.current = fromMonth;
        setHistoryFrom(fromMonth);
      })();
      historyInFlightRef.current.set(fromMonth, job);
      try {
        await job;
      } finally {
        historyInFlightRef.current.delete(fromMonth);
      }
    },
    [mergeHistory]
  );

  const ensureStudentHistory = useCallback(
    async (studentId: string): Promise<void> => {
      const cur = historyFromRef.current;
      if (!cur || !studentId || studentHistoryLoadedRef.current.has(studentId)) return;
      const res = await apiFetchHistory({ studentId, monthBefore: cur });
      if (!res.success) {
        console.warn('[History] Failed to load student history:', res.error);
        return;
      }
      mergeHistory(res as any);
      studentHistoryLoadedRef.current.add(studentId);
    },
    [mergeHistory]
  );

  // Working on an older month than the loaded window: bring it (and the month
  // before it, for Previous Balance context) in.
  useEffect(() => {
    if (!historyFrom || !activeMonth) return;
    void ensureHistoryLoaded(getPreviousMonthString(activeMonth));
  }, [activeMonth, historyFrom, ensureHistoryLoaded]);

  // Hydrate directly from authoritative PostgreSQL database on mount & subscribe to live SSE real-time sync
  useEffect(() => {
    isHydratedRef.current = false;
    fetchServerState().then((res) => {
      if (res?.success && res.data) {
        setIsDbConnected(true);
        applyServerState(res.data);
      } else {
        // null means nobody is signed in yet (page just loaded, or just logged out):
        // there is nothing to load, so that is neither an error nor an offline server.
        if (res) setIsDbConnected(false);
        if (res) showToast(res.error || 'Could not load data from the server. Please reload or try again.', 'error', 10000);
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
        logoUrl: '',
        website: '',
        regNo: res.institution.registrationNo || '',
        address: res.institution.address || '',
        phone: res.institution.phone || '',
        email: res.institution.email || '',
        currency: res.institution.currency || DEFAULT_CURRENCY,
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
      resetHistoryTracking();
      setCollections([]);
      setTransactions([]);
      setBankAccounts([]);
      setStudentAccountHistory([]);
      setLockedMonths([]);
      setInvites([]);
      isHydratedRef.current = true;

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
      resetHistoryTracking();
      setCollections([]);
      setTransactions([]);
      setBankAccounts([]);
      setStudentAccountHistory([]);
      setLockedMonths([]);
      setInvites([]);

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
      } else {
        showToast(serverState?.error || 'Could not load data from the server. Please reload or try again.', 'error', 10000);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error connecting to institution.' };
    }
  };

  const createInvite = async (params: {
    fullName: string;
    assignedRole: UserRole;
    permissions?: string[];
    inviteCode?: string;
  }): Promise<{ success: boolean; invite?: ServerInvite; error?: string }> => {
    const targetInstId = currentInstitution?.id;
    if (!targetInstId) return { success: false, error: 'No active institution.' };
    try {
      const res = await apiCreateInvite(targetInstId, {
        fullName: params.fullName,
        assignedRole: params.assignedRole,
        permissions: params.permissions || [],
        createdBy: currentUser.username,
        inviteCode: params.inviteCode,
      });

      if (!res.success || !res.invite) {
        return { success: false, error: res.error || 'Failed to generate staff invite code.' };
      }

      setInvites((prev) => [res.invite!, ...prev.filter((i) => i.invite_code !== res.invite!.invite_code)]);

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
      // A session that is still waiting for a reset password to be replaced is not an app session:
      // it falls through to the sign-in screen, which handles that step.
      if (me.success && me.user && !me.user.mustChangePassword) {
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
            const timeout = Number(instSettings.sessionTimeoutMinutes) || 10;
            if (instSettings.sessionTimeoutMinutes) {
              const parsed = Number(instSettings.sessionTimeoutMinutes);
              if (!isNaN(parsed) && parsed >= 1 && parsed <= 180) {
                setSessionTimeoutMinutesState(parsed);
              }
            }
            const instAny = me.institution as any;
            setInstitute((prev) => ({
              ...prev,
              name: instAny.name || prev.name,
              logoUrl: instAny.logo_url || instAny.logoUrl || prev.logoUrl,
              address: instAny.address || prev.address,
              phone: instAny.phone || prev.phone,
              email: instAny.email || prev.email,
              website: instAny.website || prev.website,
              regNo: instAny.registration_no || instAny.regNo || prev.regNo,
              currency: instAny.currency || prev.currency,
              sessionTimeoutMinutes: timeout,
              settings: {
                ...prev.settings,
                ...instSettings,
                sessionTimeoutMinutes: timeout,
              },
            }));
          } catch {}
        }
      } else {
        if (me.success && me.user?.mustChangePassword) apiLogout().catch(() => {});
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
        resetHistoryTracking();
        setCollections([]);
        setTransactions([]);
        setBankAccounts([]);
        setStudentAccountHistory([]);
        setLockedMonths([]);
        setInvites([]);
        try {
          sessionStorage.removeItem(`${STORAGE_KEY}_browser_session_active`);
        } catch {}
        resetPreferencesState();
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
  ): Promise<{ success: boolean; error?: string; user?: User; mustChangePassword?: boolean }> => {
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
      if (apiRes.success && apiRes.user && apiRes.user.mustChangePassword) {
        // The server has opened a restricted session. Nothing is loaded until the new password is set.
        return { success: false, mustChangePassword: true };
      }
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
        resetHistoryTracking();
        setCollections([]);
        setTransactions([]);
        setBankAccounts([]);
        setStudentAccountHistory([]);
        setLockedMonths([]);
        setInvites([]);

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
          } else {
            showToast(stateRes?.error || 'Could not load data from the server. Please reload or try again.', 'error', 10000);
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
    resetHistoryTracking();
    setCollections([]);
    setTransactions([]);
    setBankAccounts([]);
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
      resetHistoryTracking();
      setCollections([]);
      setTransactions([]);
      setBankAccounts([]);
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
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error deleting institution.' };
    }
  };

  const updateStudentStatus = async (studentId: string, newStatus: StudentStatus, reason?: string) => {
    const perm = ensureMutationAllowed('Student status change');
    if (!perm.allowed) return { success: false, error: perm.error };

    const target = (listsRef.current.students as Student[]).find((s) => s.id === studentId);
    if (!target) return { success: false, error: 'Student not found.' };
    if (target.status === newStatus) {
      return { success: false, error: `Student is already in '${newStatus}' status.` };
    }

    const oldStatus = target.status;
    const reasonText = reason?.trim() ? `. Note/Reason: ${reason.trim()}` : '';
    const res = await commitEntity(
      'students',
      (cur: Student[]) => cur.map((s) => (s.id === studentId ? { ...s, status: newStatus } : s)),
      {
        history: [
          {
            studentId,
            category: 'status',
            actionTitle: `Status Changed: ${oldStatus} → ${newStatus}`,
            description: `Student enrollment status changed from ${oldStatus} to ${newStatus}${reasonText}.`,
            previousValue: oldStatus,
            newValue: newStatus,
            metadata: { oldStatus, newStatus, reason: reason?.trim() || undefined },
          },
        ],
      }
    );
    if (!res.success) return { success: false, error: res.error };


    return { success: true };
  };

  // Class Management (every change is confirmed by the server before it is shown)
  const addClass = async (name: string, monthlyFee: number, sortOrder: number) => {
    const perm = ensureMutationAllowed('Class creation');
    if (!perm.allowed) return { success: false, error: perm.error };

    if (!name.trim()) return { success: false, error: 'Class name is required.' };
    let created: SchoolClass | undefined;
    const res = await commitEntity('classes', (cur: SchoolClass[]) => {
      if (cur.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
        return { error: 'A class with this name already exists.' };
      }
      const newClass: SchoolClass = {
        id: generateUniqueId('cls'),
        name: name.trim(),
        monthlyFee,
        sortOrder,
        active: true,
      };
      created = newClass;
      // Insert at the requested position and resequence everyone, rather than a plain
      // sort: if the position is taken, sort() alone would leave two classes sharing it.
      const existing = [...cur].sort((a, b) => a.sortOrder - b.sortOrder);
      const clampedIndex = Math.min(Math.max(sortOrder - 1, 0), existing.length);
      existing.splice(clampedIndex, 0, newClass);
      return resequence(existing);
    });
    if (!res.success) return res;
    const saved = (listsRef.current.classes as SchoolClass[]).find((c) => c.id === created?.id);
    return { success: true, newClass: saved || created };
  };

  const updateClass = async (id: string, updates: Partial<SchoolClass>) => {
    const perm = ensureMutationAllowed('Class update');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('classes', (cur: SchoolClass[]) => {
      if (updates.name) {
        const exists = cur.some((c) => c.id !== id && c.name.toLowerCase() === updates.name?.trim().toLowerCase());
        if (exists) return { error: 'A class with this name already exists.' };
      }
      const current = cur.find((c) => c.id === id);
      if (!current) return { error: 'Class not found.' };

      const patchedFields: Partial<SchoolClass> = {
        ...updates,
        monthlyFee: updates.monthlyFee !== undefined ? updates.monthlyFee : current.monthlyFee,
      };

      // A manually changed Sort Position # resequences the whole list around the new
      // position, the same way drag-and-drop does.
      if (updates.sortOrder !== undefined && updates.sortOrder !== current.sortOrder) {
        const others = cur.filter((c) => c.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
        const clampedIndex = Math.min(Math.max(updates.sortOrder - 1, 0), others.length);
        others.splice(clampedIndex, 0, { ...current, ...patchedFields });
        return resequence(others);
      }
      return cur.map((c) => (c.id === id ? { ...c, ...patchedFields } : c));
    });
  };

  const deleteClass = async (id: string) => {
    const perm = ensureMutationAllowed('Class deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    const enrolledStudents = students.filter((s) => s.classId === id);
    if (enrolledStudents.length > 0) {
      return {
        success: false,
        error: `Cannot delete class. ${enrolledStudents.length} student record(s) still reference it (including inactive ones). Reassign them first.`,
      };
    }
    return commitEntity('classes', (cur: SchoolClass[]) => cur.filter((c) => c.id !== id), {
      afterSuccess: () => dropLocalTemplates((t) => t.classId === id),
    });
  };

  const toggleClassActive = async (id: string) => {
    const perm = ensureMutationAllowed('Class status update');
    if (!perm.allowed) return { success: false, error: perm.error };

    const cls = (listsRef.current.classes as SchoolClass[]).find((c) => c.id === id);
    if (!cls) return { success: false, error: 'Class not found' };
    const newActiveState = !cls.active;

    const res = await commitEntity('classes', (cur: SchoolClass[]) =>
      cur.map((c) => (c.id === id ? { ...c, active: newActiveState } : c))
    );
    if (!res.success) return res;

    // Deactivating sets enrolled active students to AutoDeactivated; reactivating restores them.
    const res2 = await commitEntity('students', (cur: Student[]) =>
      cur.map((s) => {
        if (s.classId !== id) return s;
        if (!newActiveState && s.status === 'Active') return { ...s, status: 'AutoDeactivated' as const };
        if (newActiveState && s.status === 'AutoDeactivated') return { ...s, status: 'Active' as const };
        return s;
      })
    );
    if (!res2.success) {
      reloadSavedState();
      return {
        success: false,
        error: `The class was ${newActiveState ? 'reactivated' : 'deactivated'}, but its students could not be updated: ${res2.error || 'save failed'}. The saved data has been reloaded; please check the class's students.`,
      };
    }
    return { success: true };
  };

  const reorderClasses = async (reorderedClasses: SchoolClass[]) => {
    const perm = ensureMutationAllowed('Class reordering');
    if (!perm.allowed) return { success: false, error: perm.error };
    return commitEntity('classes', (cur: SchoolClass[]) => {
      const byId = new Map(cur.map((c) => [c.id, c]));
      return resequence(reorderedClasses.map((c) => ({ ...(byId.get(c.id) || c), ...c })));
    });
  };

  // Student Management
  type NewStudentInput = Omit<Student, 'id' | 'studentNo' | 'regNo' | 'createdDate'> & { regNo?: string; studentNo?: string };

  // Prepares one admission against a working copy of the lists (so a bulk import sees
  // the families and students created by its earlier rows). Nothing is stored here: the
  // caller sends the working copy to the server and shows it only once it is confirmed.
  const prepareStudentAddition = (
    studentData: NewStudentInput,
    work: { students: Student[]; families: Family[]; history: HistoryInput[] }
  ): { error?: string; student?: Student } => {
    const regNo = (studentData.regNo || '').trim();
    if (!regNo) return { error: 'Student registration number (Reg #) is required.' };

    const targetReg = regNo.toLowerCase();
    const existing = work.students.find(
      (st) => st.regNo.toLowerCase() === targetReg || st.studentNo.toLowerCase() === targetReg
    );
    if (existing) return { error: `Registration No. '${regNo}' is already assigned.` };

    studentSeqRef.current += 1;
    const studentNo = studentData.studentNo?.trim() || regNo;

    // Auto family linking strictly by Father National ID.
    let familyId = studentData.familyId;
    if (!familyId && studentData.fatherNationalId?.trim()) {
      const rawNationalId = studentData.fatherNationalId.trim();
      const normNationalId = normalizeNationalId(rawNationalId);

      const existingFamily = work.families.find((f) => {
        if (!f.fatherNationalId?.trim()) return false;
        const fNorm = normalizeNationalId(f.fatherNationalId);
        return (
          f.fatherNationalId.trim().toLowerCase() === rawNationalId.toLowerCase() ||
          (normNationalId.length >= 5 && fNorm === normNationalId)
        );
      });

      if (existingFamily) {
        familyId = existingFamily.id;
        // Re-adopt an existing family: fill headName/contactPhone if currently blank.
        const updatedHeadName = existingFamily.headName || studentData.fatherName;
        const updatedPhone = existingFamily.contactPhone || studentData.fatherPhone || '';
        if (updatedHeadName !== existingFamily.headName || updatedPhone !== existingFamily.contactPhone) {
          work.families = work.families.map((f) =>
            f.id === existingFamily.id ? { ...existingFamily, headName: updatedHeadName, contactPhone: updatedPhone } : f
          );
        }
      } else {
        const newFamId = generateUniqueId('fam');
        const newFam: Family = {
          id: newFamId,
          // Provisional number; the server issues the real, unique one when the family is saved.
          familyNo: PENDING_FAMILY_NO,
          headName: studentData.fatherName,
          contactPhone: studentData.fatherPhone || '',
          fatherNationalId: rawNationalId,
          address: '',
          memberStudentIds: [],
        };
        work.families = [...work.families, newFam];
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
    work.students = [...work.students, newStudent];

    const studentClass = classes.find((c) => c.id === newStudent.classId);
    work.history.push({
      studentId: newStudent.id,
      date: newStudent.admissionDate || newStudent.createdDate || new Date().toISOString().split('T')[0],
      category: 'enrollment',
      actionTitle: 'Student Admission & Account Registered',
      description: `Student admitted in Class ${studentClass?.name || 'Unassigned'} with status '${newStudent.status}'. Registration #: ${newStudent.regNo}.`,
      previousValue: 'None',
      newValue: newStudent.status,
    });
    return { student: newStudent };
  };

  // Admits one or many students (and any families they create) in one all-or-nothing save.
  const commitStudentAdditions = async (inputs: NewStudentInput[]) => {
    let out: Student[] = [];
    let work: { students: Student[]; families: Family[]; history: HistoryInput[] } = { students: [], families: [], history: [] };
    const res = await commitEntity(
      'students',
      (cur: Student[]) => {
        work = { students: [...cur], families: [...(listsRef.current.families as Family[])], history: [] };
        out = [];
        for (const input of inputs) {
          const prep = prepareStudentAddition(input, work);
          if (prep.error) {
            return { error: inputs.length > 1 ? `${prep.error} (${input.name || 'unnamed student'}). Nothing was saved.` : prep.error };
          }
          out.push(prep.student as Student);
        }
        return work.students;
      },
      { familyBuild: () => work.families, history: () => work.history }
    );
    return { res, out };
  };

  const addStudent = async (studentData: NewStudentInput) => {
    const perm = ensureMutationAllowed('Student registration');
    if (!perm.allowed) return { success: false, error: perm.error };
    const { res, out } = await commitStudentAdditions([studentData]);
    if (!res.success) return { success: false, error: res.error };
    // Return the saved record (it carries the server's version).
    const saved = (listsRef.current.students as Student[]).find((st) => st.id === out[0].id) || out[0];
    return { success: true, student: saved };
  };

  const bulkAddStudents = async (inputs: NewStudentInput[]) => {
    const perm = ensureMutationAllowed('Student registration');
    if (!perm.allowed) return { success: false, importedCount: 0, error: perm.error };
    if (inputs.length === 0) return { success: true, importedCount: 0 };
    const { res, out } = await commitStudentAdditions(inputs);
    if (!res.success) return { success: false, importedCount: 0, error: res.error };
    return { success: true, importedCount: out.length };
  };

  const updateStudent = async (id: string, updates: Partial<Student>) => {
    const perm = ensureMutationAllowed('Student update');
    if (!perm.allowed) return { success: false, error: perm.error };

    let history: HistoryInput[] = [];
    const res = await commitEntity(
      'students',
      (cur: Student[]) => {
        history = [];
        const target = cur.find((st) => st.id === id);
        if (!target) return { error: 'Student not found.' };

        const oldFamilyId = target.familyId;
        const newFamilyId = updates.familyId !== undefined ? updates.familyId || undefined : oldFamilyId;

        if (updates.familyId !== undefined && newFamilyId !== oldFamilyId) {
          const fams = listsRef.current.families as Family[];
          const oldFam = fams.find((f) => f.id === oldFamilyId);
          const newFam = fams.find((f) => f.id === newFamilyId);
          history.push({
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

        if (updates.status !== undefined && updates.status !== target.status) {
          const oldStatus = target.status;
          const newStatus = updates.status;
          const timestamp = new Date().toISOString();
          const reasonText = updates.notes ? `. Note: ${updates.notes}` : '';
          history.push({
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
        }

        if (updates.classId !== undefined && updates.classId !== target.classId) {
          const oldClass = classes.find((c) => c.id === target.classId)?.name || 'Previous Class';
          const newClass = classes.find((c) => c.id === updates.classId)?.name || 'New Class';
          history.push({
            studentId: id,
            category: 'academic',
            actionTitle: `Class Transferred: ${oldClass} → ${newClass}`,
            description: `Student class transferred from ${oldClass} to ${newClass}.`,
            previousValue: oldClass,
            newValue: newClass,
          });
        }

        if (updates.monthlyDiscount !== undefined && updates.monthlyDiscount !== target.monthlyDiscount) {
          history.push({
            studentId: id,
            category: 'discount',
            actionTitle: `Monthly Discount Updated: ${formatCurrency(target.monthlyDiscount)} → ${formatCurrency(updates.monthlyDiscount)}`,
            description: `Monthly fee concession adjusted from ${formatCurrency(target.monthlyDiscount)} to ${formatCurrency(updates.monthlyDiscount)}.`,
            previousValue: formatCurrency(target.monthlyDiscount),
            newValue: formatCurrency(updates.monthlyDiscount),
          });
        }

        const sanitizedUpdates = { ...updates };
        if (sanitizedUpdates.dob !== undefined) {
          sanitizedUpdates.dob = sanitizedUpdates.dob ? (normalizeDateToISO(sanitizedUpdates.dob) || sanitizedUpdates.dob) : '';
        }
        if (sanitizedUpdates.admissionDate !== undefined) {
          sanitizedUpdates.admissionDate = sanitizedUpdates.admissionDate ? (normalizeDateToISO(sanitizedUpdates.admissionDate) || sanitizedUpdates.admissionDate) : '';
        }
        return cur.map((st) => (st.id === id ? { ...st, ...sanitizedUpdates, familyId: newFamilyId } : st));
      },
      { history: () => history }
    );
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  const deleteStudents = async (ids: string[]) => {
    const idSet = new Set(ids);
    const res = await commitEntity('students', (cur: Student[]) => cur.filter((st) => !idSet.has(st.id)), {
      afterSuccess: () => {
        // The server removed these students' assignments and fee templates with them.
        dropLocalAssignments((a) => idSet.has(a.studentId));
        dropLocalTemplates((t) => !!t.studentId && idSet.has(t.studentId));
      },
    });
    return res;
  };

  const deleteStudent = async (id: string) => {
    const perm = ensureMutationAllowed('Student deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    const studentVouchers = vouchers.filter((v) => v.studentId === id);
    if (studentVouchers.length > 0) {
      return {
        success: false,
        error: `Cannot delete student. ${studentVouchers.length} fee voucher records exist for this student. Delete vouchers first.`,
      };
    }
    const res = await deleteStudents([id]);
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  const bulkDeleteStudents = async (ids: string[]) => {
    const perm = ensureMutationAllowed('Bulk student deletion');
    if (!perm.allowed) return { deletedCount: 0, skippedIds: ids, error: perm.error };

    const withVouchers = new Set(vouchers.map((v) => v.studentId));
    const deletable = ids.filter((id) => !withVouchers.has(id));
    const skippedIds = ids.filter((id) => withVouchers.has(id));
    if (deletable.length === 0) return { deletedCount: 0, skippedIds };

    const res = await deleteStudents(deletable);
    if (!res.success) return { deletedCount: 0, skippedIds: ids, error: res.error };
    return { deletedCount: deletable.length, skippedIds };
  };

  // Family Management
  // Father National ID identifies a family: it is required and must be unique.
  // Returns an error message, or '' when the value is acceptable.
  const validateFamilyNationalId = (value: string | undefined, excludeFamilyId?: string): string => {
    const raw = (value || '').trim();
    if (!raw) return 'Father National ID is required.';
    const norm = normalizeNationalId(raw);
    const clash = (listsRef.current.families as Family[]).find((f) => {
      if (f.id === excludeFamilyId || !f.fatherNationalId?.trim()) return false;
      return (
        f.fatherNationalId.trim().toLowerCase() === raw.toLowerCase() ||
        (norm.length >= 5 && normalizeNationalId(f.fatherNationalId) === norm)
      );
    });
    return clash ? `This Father National ID already belongs to family ${clash.familyNo} (${clash.headName}).` : '';
  };

  const addFamily = async (familyData: Omit<Family, 'id' | 'familyNo'>) => {
    const perm = ensureMutationAllowed('Family creation');
    if (!perm.allowed) return { success: false, error: perm.error };

    let created: Family | undefined;
    const res = await commitEntity('families', (cur: Family[]) => {
      const idCheck = validateFamilyNationalId(familyData.fatherNationalId);
      if (idCheck) return { error: idCheck };
      created = {
        ...familyData,
        id: generateUniqueId('fam'),
        // Provisional number; the server issues the real, unique one when the family is saved.
        familyNo: PENDING_FAMILY_NO,
        fatherNationalId: familyData.fatherNationalId?.trim() || '',
      };
      return [...cur, created];
    });
    if (!res.success || !created) return { success: false, error: res.error };
    const saved = (listsRef.current.families as Family[]).find((f) => f.id === created!.id) || created;
    return { success: true, family: saved };
  };

  const updateFamily = async (id: string, updates: Partial<Family>) => {
    const perm = ensureMutationAllowed('Family update');
    if (!perm.allowed) return { success: false, error: perm.error };

    const sanitized = { ...updates };
    if (sanitized.fatherNationalId !== undefined) sanitized.fatherNationalId = sanitized.fatherNationalId.trim();
    const res = await commitEntity('families', (cur: Family[]) => {
      if (sanitized.fatherNationalId !== undefined) {
        const idCheck = validateFamilyNationalId(sanitized.fatherNationalId, id);
        if (idCheck) return { error: idCheck };
      }
      if (!cur.some((f) => f.id === id)) return { error: 'Family not found.' };
      return cur.map((f) => (f.id === id ? { ...f, ...sanitized } : f));
    });
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  const deleteFamily = (id: string) => deleteFamilies([id]);

  // One all-or-nothing call: either every family is removed or none is.
  const deleteFamilies = async (ids: string[]) => {
    const perm = ensureMutationAllowed('Family deletion');
    if (!perm.allowed) return { success: false, error: perm.error };
    const idSet = new Set(ids);

    const res = await commitEntity('families', (cur: Family[]) => cur.filter((f) => !idSet.has(f.id)), {
      afterSuccess: () => {
        // The server cleared the link on this family's students; mirror that locally.
        const cleared = (listsRef.current.students as Student[]).map((st) =>
          st.familyId && idSet.has(st.familyId) ? { ...st, familyId: undefined } : st
        );
        listsRef.current = { ...listsRef.current, students: cleared };
        setStudents(cleared);
        studentsRef.current = cleared;
      },
    });
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  const addStudentToFamily = async (familyId: string, studentId: string) => {
    const perm = ensureMutationAllowed('Family student assignment');
    if (!perm.allowed) return { success: false, error: perm.error };
    return updateStudent(studentId, { familyId });
  };

  const removeStudentFromFamily = async (familyId: string, studentId: string) => {
    const perm = ensureMutationAllowed('Family student removal');
    if (!perm.allowed) return { success: false, error: perm.error };
    const student = (listsRef.current.students as Student[]).find((st) => st.id === studentId);
    if (!student || student.familyId !== familyId) return { success: true };
    return updateStudent(studentId, { familyId: '' });
  };

  // Transport Management
  const resequence = <T extends { sortOrder: number }>(list: T[]): T[] => list.map((x, idx) => ({ ...x, sortOrder: idx + 1 }));

  const addBus = async (bus: Omit<TransportBus, 'id'>) => {
    const perm = ensureMutationAllowed('Bus addition');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('buses', (cur: TransportBus[]) => {
      if (cur.some((b) => b.busNumber.toLowerCase() === bus.busNumber.toLowerCase())) {
        return { error: 'Bus number already exists.' };
      }
      const newBus: TransportBus = { ...bus, id: generateUniqueId('bus') };
      // Insert at the requested position and resequence everyone, rather than a plain
      // sort: if the position is taken, sort() alone would leave two buses sharing it.
      const existing = [...cur].sort((a, b) => a.sortOrder - b.sortOrder);
      const clampedIndex = Math.min(Math.max(newBus.sortOrder - 1, 0), existing.length);
      existing.splice(clampedIndex, 0, newBus);
      return resequence(existing);
    });
  };

  const updateBus = async (id: string, updates: Partial<TransportBus>) => {
    const perm = ensureMutationAllowed('Bus update');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('buses', (cur: TransportBus[]) => {
      if (updates.busNumber) {
        const exists = cur.some((b) => b.id !== id && b.busNumber.toLowerCase() === updates.busNumber?.trim().toLowerCase());
        if (exists) return { error: 'Bus number already exists.' };
      }
      const current = cur.find((b) => b.id === id);
      if (!current) return { error: 'Bus not found.' };
      // A manually changed Sort Position resequences the whole fleet, like drag-and-drop.
      if (updates.sortOrder !== undefined && updates.sortOrder !== current.sortOrder) {
        const others = cur.filter((b) => b.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
        const clampedIndex = Math.min(Math.max(updates.sortOrder - 1, 0), others.length);
        others.splice(clampedIndex, 0, { ...current, ...updates });
        return resequence(others);
      }
      return cur.map((b) => (b.id === id ? { ...b, ...updates } : b));
    });
  };

  // Removes assignments from local state (the server already removed them) so the
  // screen matches without waiting for a reload.
  const dropLocalAssignments = (shouldDrop: (a: TransportAssignment) => boolean) => {
    const kept = (listsRef.current.transportAssignments as TransportAssignment[]).filter((a) => !shouldDrop(a));
    listsRef.current = { ...listsRef.current, transportAssignments: kept };
    setTransportAssignments(kept);
  };

  const dropLocalTemplates = (shouldDrop: (t: FeeTemplate) => boolean) => {
    const kept = (listsRef.current.templates as FeeTemplate[]).filter((t) => !shouldDrop(t));
    listsRef.current = { ...listsRef.current, templates: kept };
    setTemplates(kept);
  };

  const deleteBus = async (id: string) => {
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
    return commitEntity('buses', (cur: TransportBus[]) => cur.filter((b) => b.id !== id), {
      afterSuccess: () => dropLocalAssignments((a) => a.busId === id),
    });
  };

  const reorderBuses = async (reorderedBuses: TransportBus[]) => {
    const perm = ensureMutationAllowed('Bus reordering');
    if (!perm.allowed) return { success: false, error: perm.error };
    return commitEntity('buses', (cur: TransportBus[]) => {
      const byId = new Map(cur.map((b) => [b.id, b]));
      return resequence(reorderedBuses.map((b) => ({ ...(byId.get(b.id) || b), ...b })));
    });
  };

  const reloadSavedState = () => {
    fetchServerState()
      .then((res) => {
        if (res?.success && res.data) applyServerState(res.data);
      })
      .catch(() => {});
  };

  // ---- Confirmed writes ------------------------------------------------------
  // The server is the only authority. A change to an entity collection is sent as one
  // all-or-nothing batch; local state (and the success message the caller shows) follows
  // only once the server has confirmed it. A rejected change leaves the screen untouched.
  const listsRef = useRef<Record<CommitEntity, any[]>>({
    classes: [], families: [], students: [], buses: [], stops: [], transportAssignments: [], templates: [], bankAccounts: [],
  });
  listsRef.current = { classes, families, students, buses, stops, transportAssignments, templates, bankAccounts };

  const entitySetters: Record<CommitEntity, (next: any[]) => void> = {
    classes: setClasses, families: setFamilies, students: setStudents, buses: setBuses, stops: setStops,
    transportAssignments: setTransportAssignments, templates: setTemplates, bankAccounts: setBankAccounts,
  };

  const rebuildFamilyMembers = (fams: Family[], studs: Student[]): Family[] =>
    fams.map((f) => ({ ...f, memberStudentIds: studs.filter((st) => st.familyId === f.id).map((st) => st.id) }));

  const commitChain = useRef<Promise<unknown>>(Promise.resolve());

  const diffForCommit = (cur: any[], next: any[]) => {
    const curById = new Map<string, any>(cur.map((c) => [c.id, c]));
    const strip = (o: any) => {
      const { memberStudentIds: _m, ...rest } = o || {};
      return JSON.stringify(rest);
    };
    const upserts: any[] = [];
    for (const n of next) {
      const c = curById.get(n.id);
      if (!c) upserts.push(n);
      else if (strip(c) !== strip(n)) upserts.push({ ...n, expectedVersion: c.version });
    }
    const nextIds = new Set(next.map((n) => n.id));
    const deleteIds = cur.filter((c) => !nextIds.has(c.id)).map((c) => c.id);
    return { upserts, deleteIds };
  };

  /**
   * Saves the new state of one collection. `build` receives the latest confirmed list
   * and returns the desired list (or { error }). Changed rows are sent as upserts, rows
   * that are gone as deletes, plus optional account-history entries and, for students,
   * the family rows to create or update in the same transaction. Calls are serialised so
   * two quick actions never build on a stale list.
   */
  const commitEntity = (
    entity: CommitEntity,
    build: (current: any[]) => any[] | { error: string },
    opts?: {
      history?: HistoryInput[] | (() => HistoryInput[]);
      familyBuild?: (families: Family[]) => Family[];
      afterSuccess?: (merged: any[]) => void;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    const run = async (): Promise<{ success: boolean; error?: string }> => {
      const cur = listsRef.current[entity];
      const built = build(cur);
      if (!Array.isArray(built)) return { success: false, error: built.error };
      const next = built;

      const { upserts, deleteIds } = diffForCommit(cur, next);
      let famNext: Family[] | null = null;
      let familyUpserts: any[] = [];
      if (entity === 'students' && opts?.familyBuild) {
        famNext = opts.familyBuild(listsRef.current.families as Family[]);
        familyUpserts = diffForCommit(listsRef.current.families, famNext).upserts;
      }
      const historyInput = typeof opts?.history === 'function' ? opts.history() : opts?.history || [];
      const history: StudentAccountHistoryEntry[] = historyInput.map((h) => buildHistoryEntry(h));
      if (upserts.length === 0 && deleteIds.length === 0 && familyUpserts.length === 0 && history.length === 0) {
        return { success: true };
      }

      const result: CommitResult = await apiCommitBatch(entity, {
        upserts,
        deleteIds,
        history,
        ...(entity === 'students' ? { familyUpserts } : {}),
      });
      if (!result.success) {
        if (result.code === 'STALE_VERSION' || result.code === 'IN_USE') reloadSavedState();
        return { success: false, error: result.error };
      }

      const saved = new Map<string, any>((result.items || []).map((i) => [i.id, i]));
      const merged = next.map((n) => (saved.has(n.id) ? { ...n, ...saved.get(n.id) } : n));
      let mergedFamilies: Family[] | null = null;
      if (famNext) {
        const savedFam = new Map<string, any>((result.families || []).map((f) => [f.id, f]));
        mergedFamilies = famNext.map((f) => (savedFam.has(f.id) ? { ...f, ...savedFam.get(f.id) } : f));
      }

      listsRef.current = { ...listsRef.current, [entity]: merged };
      entitySetters[entity](merged);
      if (entity === 'students') studentsRef.current = merged;
      if (entity === 'families') familiesRef.current = merged;

      if (mergedFamilies || entity === 'students' || entity === 'families') {
        const studs = (entity === 'students' ? merged : listsRef.current.students) as Student[];
        const fams = rebuildFamilyMembers((mergedFamilies || (entity === 'families' ? merged : listsRef.current.families)) as Family[], studs);
        listsRef.current = { ...listsRef.current, families: fams };
        setFamilies(fams);
        familiesRef.current = fams;
      }
      if (history.length > 0) {
        setStudentAccountHistory((prev) => [...history, ...prev]);
      }
      opts?.afterSuccess?.(merged);
      return { success: true };
    };
    const p = commitChain.current.then(run, run);
    commitChain.current = p.catch(() => undefined);
    return p;
  };

  const addStop = async (stop: Omit<TransportStop, 'id'>) => {
    const perm = ensureMutationAllowed('Stop addition');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('stops', (cur: TransportStop[]) => {
      if (cur.some((s) => s.name.toLowerCase() === stop.name.toLowerCase())) {
        return { error: 'Bus stop name already exists.' };
      }
      const newStop: TransportStop = { ...stop, id: generateUniqueId('stop'), monthlyFare: stop.monthlyFare };
      const existing = [...cur].sort((a, b) => a.sortOrder - b.sortOrder);
      const clampedIndex = Math.min(Math.max(newStop.sortOrder - 1, 0), existing.length);
      existing.splice(clampedIndex, 0, newStop);
      return resequence(existing);
    });
  };

  const updateStop = async (id: string, updates: Partial<TransportStop>) => {
    const perm = ensureMutationAllowed('Stop update');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('stops', (cur: TransportStop[]) => {
      if (updates.name) {
        const exists = cur.some((s) => s.id !== id && s.name.toLowerCase() === updates.name?.trim().toLowerCase());
        if (exists) return { error: 'Bus stop name already exists.' };
      }
      const current = cur.find((s) => s.id === id);
      if (!current) return { error: 'Bus stop not found.' };
      const patched: Partial<TransportStop> = {
        ...updates,
        monthlyFare: updates.monthlyFare !== undefined ? updates.monthlyFare : current.monthlyFare,
      };
      if (updates.sortOrder !== undefined && updates.sortOrder !== current.sortOrder) {
        const others = cur.filter((s) => s.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
        const clampedIndex = Math.min(Math.max(updates.sortOrder - 1, 0), others.length);
        others.splice(clampedIndex, 0, { ...current, ...patched });
        return resequence(others);
      }
      return cur.map((s) => (s.id === id ? { ...s, ...patched } : s));
    });
  };

  const deleteStop = async (id: string) => {
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
    return commitEntity('stops', (cur: TransportStop[]) => cur.filter((s) => s.id !== id), {
      afterSuccess: () => dropLocalAssignments((a) => a.stopId === id),
    });
  };

  const reorderStops = async (reorderedStops: TransportStop[]) => {
    const perm = ensureMutationAllowed('Stop reordering');
    if (!perm.allowed) return { success: false, error: perm.error };
    return commitEntity('stops', (cur: TransportStop[]) => {
      const byId = new Map(cur.map((s) => [s.id, s]));
      return resequence(reorderedStops.map((s) => ({ ...(byId.get(s.id) || s), ...s })));
    });
  };

  const bulkSaveTransportStops = async (
    stopsList: Array<Omit<TransportStop, 'id'> & { id?: string }>
  ) => {
    const perm = ensureMutationAllowed('Bulk stop save');
    if (!perm.allowed) return { success: false, count: 0, addedCount: 0, updatedCount: 0, error: perm.error };
    let addedCount = 0;
    let updatedCount = 0;
    const res = await commitEntity('stops', (cur: TransportStop[]) => {
      addedCount = 0;
      updatedCount = 0;
      const currentStops = [...cur];
      for (const item of stopsList) {
        const cleanName = item.name.trim();
        const existingIdx = currentStops.findIndex(
          (s) => (item.id && s.id === item.id) || s.name.toLowerCase() === cleanName.toLowerCase()
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
          currentStops.push({
            id: item.id || generateUniqueId('stop'),
            name: cleanName,
            area: (item.area || '').trim(),
            landmark: (item.landmark || '').trim(),
            monthlyFare: fare,
            sortOrder: item.sortOrder || currentStops.length + 1,
          });
          addedCount++;
        }
      }
      currentStops.sort((a, b) => a.sortOrder - b.sortOrder);
      return resequence(currentStops);
    });
    if (!res.success) return { success: false, count: 0, addedCount: 0, updatedCount: 0, error: res.error };
    return { success: true, count: stopsList.length, addedCount, updatedCount };
  };

  const saveTransportAssignment = async (
    assignment: Omit<TransportAssignment, 'id'> & { id?: string }
  ) => {
    const perm = ensureMutationAllowed('Transport assignment save');
    if (!perm.allowed) return { success: false, error: perm.error };

    if (!assignment.studentId || !students.some((s) => s.id === assignment.studentId)) {
      return { success: false, error: 'Select a student.' };
    }
    if (!assignment.busId || !buses.some((b) => b.id === assignment.busId)) {
      return { success: false, error: 'Select a bus.' };
    }
    if (!assignment.stopId || !stops.some((s) => s.id === assignment.stopId)) {
      return { success: false, error: 'Select a stop.' };
    }

    const stop = stops.find((s) => s.id === assignment.stopId);
    const bus = buses.find((b) => b.id === assignment.busId);
    const monthName = formatMonthName(assignment.month);
    const fare = stop?.monthlyFare ? Math.max(0, stop.monthlyFare - (assignment.discount || 0)) : 0;

    let pendingHistory: HistoryInput | null = null;
    if (assignment.id) {
      const existing = transportAssignments.find((a) => a.id === assignment.id);
      const isDeactivated = assignment.active === false && existing?.active !== false;
      pendingHistory = {
        studentId: assignment.studentId,
        date: new Date().toISOString().split('T')[0],
        category: 'transport',
        actionTitle: isDeactivated ? `Transport Deactivated (${monthName})` : `Transport Updated (${monthName})`,
        description: isDeactivated
          ? `Transport route deactivated for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'}.`
          : `Transport route updated for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'} (${assignment.tripType === 'OneWay' ? 'One Way' : 'Round Trip'}). Monthly fare: ${formatCurrency(fare)}.`,
        previousValue: existing ? `${stops.find((s) => s.id === existing.stopId)?.name || 'Stop'} (${buses.find((b) => b.id === existing.busId)?.busNumber || 'Bus'})` : undefined,
        newValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
        month: assignment.month,
      };

      return commitEntity(
        'transportAssignments',
        (cur: TransportAssignment[]) => cur.map((a) => (a.id === assignment.id ? { ...a, ...assignment } : a)),
        { history: pendingHistory ? [pendingHistory] : [] }
      );
    }

    let build: (cur: TransportAssignment[]) => TransportAssignment[] = (cur) => cur;
    // Check if assignment already exists for student + month
    const existing = transportAssignments.find(
      (a) => a.studentId === assignment.studentId && a.month === assignment.month
    );

    if (existing) {
      pendingHistory = {
        studentId: assignment.studentId,
        date: new Date().toISOString().split('T')[0],
        category: 'transport',
        actionTitle: `Transport Updated (${monthName})`,
        description: `Transport assignment updated for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'}. Monthly fare: ${formatCurrency(fare)}.`,
        previousValue: `${stops.find((s) => s.id === existing.stopId)?.name || 'Stop'} (${buses.find((b) => b.id === existing.busId)?.busNumber || 'Bus'})`,
        newValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
        month: assignment.month,
      };
      build = (cur) => cur.map((a) => (a.id === existing.id ? { ...a, ...assignment } : a));
    } else {
      pendingHistory = {
        studentId: assignment.studentId,
        date: new Date().toISOString().split('T')[0],
        category: 'transport',
        actionTitle: `Transport Added (${monthName})`,
        description: `Transport route assigned for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'} (${bus?.routeName || 'Route'}) - ${assignment.tripType === 'OneWay' ? 'One Way' : 'Round Trip'}. Monthly fare: ${formatCurrency(fare)}.`,
        previousValue: 'No Transport',
        newValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
        month: assignment.month,
      };
      const newAsgn: TransportAssignment = {
        ...assignment,
        id: generateUniqueId('asgn'),
        createdAt: new Date().toISOString(),
      };
      build = (cur) => [...cur, newAsgn];
    }
    return commitEntity('transportAssignments', build, { history: pendingHistory ? [pendingHistory] : [] });
  };

  const bulkSaveTransportAssignments = async (
    assignments: Array<Omit<TransportAssignment, 'id'> & { id?: string }>,
    options?: { deleteIds?: string[]; history?: HistoryInput[] }
  ) => {
    const perm = ensureMutationAllowed('Bulk transport assignments save');
    if (!perm.allowed) return { success: false, count: 0, error: perm.error };

    // Never store an assignment without a real student, bus and stop. Callers are
    // expected to pass only qualifying rows; if any slips through, reject the whole
    // batch loudly rather than saving a partial set.
    const bad = assignments.filter(
      (a) =>
        !a.studentId ||
        !students.some((s) => s.id === a.studentId) ||
        !buses.some((b) => b.id === a.busId) ||
        !stops.some((sp) => sp.id === a.stopId)
    );
    if (bad.length > 0) {
      return {
        success: false,
        count: 0,
        error: `${bad.length} assignment${bad.length === 1 ? '' : 's'} had a missing student, bus or stop. Nothing was saved.`,
      };
    }

    const res = await commitEntity(
      'transportAssignments',
      (cur: TransportAssignment[]) => {
        const removed = new Set(options?.deleteIds || []);
        const updated = cur.filter((a) => !removed.has(a.id));
        for (const asgn of assignments) {
          if (asgn.id) {
            const idx = updated.findIndex((a) => a.id === asgn.id);
            if (idx >= 0) {
              updated[idx] = { ...updated[idx], ...asgn };
              continue;
            }
          }
          const existingIdx = updated.findIndex((a) => a.studentId === asgn.studentId && a.month === asgn.month);
          if (existingIdx >= 0) {
            updated[existingIdx] = { ...updated[existingIdx], ...asgn };
          } else {
            updated.push({
              ...asgn,
              id: generateUniqueId('asgn'),
              createdAt: asgn.createdAt || new Date().toISOString(),
            } as TransportAssignment);
          }
        }
        return updated;
      },
      { history: options?.history }
    );
    if (!res.success) return { success: false, count: 0, error: res.error };
    return { success: true, count: assignments.length };
  };

  const deleteTransportAssignments = async (ids: string[]) => {
    const perm = ensureMutationAllowed('Transport assignment deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    const idSet = new Set(ids);
    const targets = transportAssignments.filter((a) => idSet.has(a.id));
    if (targets.length === 0) return { success: true };

    const history: HistoryInput[] = targets.map((targetAsgn) => {
      const stop = stops.find((s) => s.id === targetAsgn.stopId);
      const bus = buses.find((b) => b.id === targetAsgn.busId);
      const monthName = formatMonthName(targetAsgn.month);
      return {
        studentId: targetAsgn.studentId,
        date: new Date().toISOString().split('T')[0],
        category: 'transport',
        actionTitle: `Transport Removed (${monthName})`,
        description: `Transport assignment removed for ${monthName}: ${stop?.name || 'Stop'} via ${bus?.busNumber || 'Bus'}. Transport fee will not be billed.`,
        previousValue: `${stop?.name || 'Stop'} (${bus?.busNumber || 'Bus'})`,
        newValue: 'Removed / None',
        month: targetAsgn.month,
      };
    });
    return commitEntity('transportAssignments', (cur: TransportAssignment[]) => cur.filter((a) => !idSet.has(a.id)), { history });
  };

  const deleteTransportAssignment = (id: string) => deleteTransportAssignments([id]);

  const bulkUpdateTransportDaysForMonth = async (targetMonth: string, daysCharged: number) => {
    const perm = ensureMutationAllowed('Bulk update transport days');
    if (!perm.allowed) return { success: false, updatedCount: 0 };

    if (!targetMonth || !targetMonth.includes('-')) return { success: false, updatedCount: 0 };
    const [yStr, mStr] = targetMonth.split('-');
    const maxDays = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
    const clampedDays = Math.min(Math.max(daysCharged, 0), maxDays);

    let matchedCount = 0;
    const saved = await commitEntity('transportAssignments', (cur: TransportAssignment[]) => {
      matchedCount = cur.filter((a) => a.month === targetMonth).length;
      return cur.map((a) => (a.month === targetMonth ? { ...a, daysCharged: clampedDays } : a));
    });
    if (!saved.success) return { success: false, updatedCount: 0, error: saved.error };
    return { success: true, updatedCount: matchedCount };
  };

  // Fee Particular Templates
  const saveGlobalTemplate = async (template: Omit<FeeTemplate, 'id'>, month?: string) => {
    const perm = ensureMutationAllowed('Save global fee template');
    if (!perm.allowed) return { success: false, error: perm.error };

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    return commitEntity('templates', (prev: FeeTemplate[]) => {
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

  const updateGlobalTemplatesList = async (newTemplates: FeeTemplate[], month?: string) => {
    const perm = ensureMutationAllowed('Update global fee templates');
    if (!perm.allowed) return { success: false, error: perm.error };

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    return commitEntity('templates', (prev: FeeTemplate[]) => {
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

  const deleteGlobalTemplates = async (month?: string) => {
    const perm = ensureMutationAllowed('Delete global fee templates');
    if (!perm.allowed) return { success: false, error: perm.error };

    const isAll = !month || month === 'all';
    return commitEntity('templates', (prev: FeeTemplate[]) => {
      if (isAll) {
        // Reset all-months global templates to defaults, keeping specific-month global & overrides
        const preserved = prev.filter((t) => (t.studentId || t.classId) || (t.month && t.month !== 'all'));
        return [...createDefaultGlobalTemplates(currentInstitution?.id || ''), ...preserved];
      } else {
        // Delete the global override for this specific month
        return prev.filter((t) => !(!t.studentId && !t.classId && t.month === month));
      }
    });
  };

  const saveStudentTemplateOverride = async (
    studentId: string,
    kind: ParticularKind,
    label: string,
    amount: number,
    month?: string
  ) => {
    const perm = ensureMutationAllowed('Save student fee template override');
    if (!perm.allowed) return { success: false, error: perm.error };

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    return commitEntity('templates', (prev: FeeTemplate[]) => {
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

  const saveClassTemplateOverrides = async (
    classId: string,
    month: string,
    items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>
  ) => {
    const perm = ensureMutationAllowed('Save class fee template overrides');
    if (!perm.allowed) return { success: false, error: perm.error };

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    return commitEntity('templates', (prev: FeeTemplate[]) => {
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

  const deleteClassTemplates = async (classId: string, month?: string) => {
    const perm = ensureMutationAllowed('Delete class fee templates');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('templates', (prev: FeeTemplate[]) =>
      prev.filter((t) => {
        if (t.studentId || t.classId !== classId) return true;
        if (!month || month === 'both') return false; // remove all overrides for this class
        const tplIsAll = !t.month || t.month === 'all';
        if (month === 'all') return !tplIsAll;
        return t.month !== month;
      })
    );
  };

  const saveStudentTemplateOverrides = async (
    studentId: string,
    month: string,
    items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>
  ) => {
    const perm = ensureMutationAllowed('Save student fee template overrides');
    if (!perm.allowed) return { success: false, error: perm.error };

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    return commitEntity('templates', (prev: FeeTemplate[]) => {
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

  const bulkSaveMultipleStudentTemplateOverrides = async (
    entries: Array<{
      studentId: string;
      items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>;
    }>,
    month: string
  ) => {
    const perm = ensureMutationAllowed('Bulk save student fee template overrides');
    if (!perm.allowed) return { success: false, error: perm.error };

    const isAll = !month || month === 'all';
    const targetMonth = isAll ? 'all' : month;
    return commitEntity('templates', (prev: FeeTemplate[]) => {
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

  const deleteStudentTemplates = async (studentId: string, month?: string) => {
    const perm = ensureMutationAllowed('Delete student fee templates');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('templates', (prev: FeeTemplate[]) =>
      prev.filter((t) => {
        if (t.studentId !== studentId) return true;
        if (!month || month === 'both') return false;
        const tplIsAll = !t.month || t.month === 'all';
        if (month === 'all') return !tplIsAll;
        return t.month !== month;
      })
    );
  };

  // Deletes several student override scopes in one all-or-nothing save.
  const deleteStudentTemplateScopes = async (scopes: Array<{ studentId: string; month?: string }>) => {
    const perm = ensureMutationAllowed('Delete student fee templates');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('templates', (prev: FeeTemplate[]) =>
      prev.filter((t) => {
        if (!t.studentId) return true;
        return !scopes.some(({ studentId, month }) => {
          if (t.studentId !== studentId) return false;
          if (!month || month === 'both') return true;
          const tplIsAll = !t.month || t.month === 'all';
          if (month === 'all') return tplIsAll;
          return t.month === month;
        });
      })
    );
  };

  // Full reset: global defaults back to system defaults and EVERY override removed
  // (month-specific global templates, class overrides and student overrides, all months).
  const resetAllTemplates = async () => {
    const perm = ensureMutationAllowed('Reset fee templates');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('templates', () => createDefaultGlobalTemplates(currentInstitution?.id || ''));
  };

  const deleteTemplate = async (id: string) => {
    const perm = ensureMutationAllowed('Delete fee template');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('templates', (prev: FeeTemplate[]) => prev.filter((t) => t.id !== id));
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

  const refreshFromServer = async (): Promise<void> => {
    const res = await fetchServerState();
    if (res?.success && res.data) applyServerState(res.data);
  };

  const isMonthLocked = (month: string): boolean => {
    return lockedMonths.includes(month);
  };

  const refreshLockState = async () => {
    const fresh = await fetchServerState();
    if (fresh?.success && fresh.data) {
      isRemoteUpdateRef.current = true;
      setLockedMonths(fresh.data.lockedMonths || []);
      const map: Record<string, LockedMonthInfo> = {};
      for (const x of fresh.data.lockedMonthDetails || []) {
        if (x?.month) map[x.month] = { notes: x.notes || '', lockedBy: x.lockedBy || '', lockedByName: x.lockedByName || '', lockedAt: x.lockedAt || '' };
      }
      setLockedMonthDetails(map);
    }
  };

  const lockMonth = async (month: string, notes?: string): Promise<{ success: boolean; error?: string }> => {
    const perm = ensureMutationAllowed('Lock fee books');
    if (!perm.allowed) return { success: false, error: perm.error };
    if (!month) return { success: false, error: 'Month parameter is required' };
    if (!hasPermission('defaulters.manage')) {
      return { success: false, error: 'Unauthorized: insufficient permissions to lock fee books.' };
    }
    const res = await apiLockMonth(month, (notes || '').trim());
    if (!res.success) {
      showToast(res.error || 'Failed to lock fee books.', 'error');
      return res;
    }
    await refreshLockState();
    showToast(`Fee books for ${formatMonthName(month)} (${month}) locked successfully.`, 'success');
    return { success: true };
  };

  const unlockMonth = async (month: string, reason: string): Promise<{ success: boolean; error?: string }> => {
    const perm = ensureMutationAllowed('Unlock fee books');
    if (!perm.allowed) return { success: false, error: perm.error };
    if (!month) return { success: false, error: 'Month parameter is required' };
    if (currentUser.role !== 'Admin') {
      return { success: false, error: 'Unauthorized: only Administrators can unlock historical fee books.' };
    }
    if (!reason.trim()) return { success: false, error: 'A reason is required to unlock fee books.' };
    const res = await apiUnlockMonth(month, reason.trim());
    if (!res.success) {
      showToast(res.error || 'Failed to unlock fee books.', 'error');
      return res;
    }
    await refreshLockState();
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
    const vouchers = vouchersRef.current;
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
  ): Promise<{ success: boolean; voucher?: FeeVoucher; error?: string }> =>
    runFinancialWrite('Admission voucher creation', async () => {
    const vouchers = vouchersRef.current;
    const perm = ensureMutationAllowed('Admission voucher generation');
    if (!perm.allowed) return { success: false, error: perm.error };

    const student = students.find((s) => s.id === studentId);
    if (!student) return { success: false, error: 'Student not found.' };
    if (student.status !== 'Active') return { success: false, error: 'Student is not active.' };

    // An admission voucher is only issuable before any regular voucher.
    const otherVoucher = vouchers.find((v) => v.studentId === studentId && v.status !== 'Reversed');
    if (otherVoucher) {
      return { success: false, error: 'This student already has a voucher. Admission vouchers can only be issued before the first regular voucher.' };
    }

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

      const built = buildAdmissionVoucher(student, month, particulars, grossTotal, netDue, generationMult, options);
      return saveAdmissionVoucher(built);
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

    const built = buildAdmissionVoucher(student, month, particulars, grossTotal, netDue, generationMult, options);
    return saveAdmissionVoucher(built);
  });

  // Saves a built admission voucher; the screen shows it only once the server has stored it,
  // under the voucher number the server minted.
  const saveAdmissionVoucher = async (
    built: FeeVoucher
  ): Promise<{ success: boolean; voucher?: FeeVoucher; error?: string; fromServer?: boolean }> => {
    const res = await apiVoucherBatchUpdate({ voucherUpserts: [built] });
    if (!res.success) {
      return {
        success: false,
        fromServer: true,
        error: res.error || 'The server did not accept the admission voucher. Nothing was created.',
      };
    }
    const serverNo = (res.vouchers || []).find((v) => v?.id === built.id)?.voucherNo;
    const saved = serverNo ? { ...built, voucherNo: serverNo } : built;
    const next = [...vouchersRef.current, saved];
    vouchersRef.current = next;
    setVouchers(next);
    return { success: true, voucher: saved };
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
  ): Promise<{ success: boolean; generatedCount: number; error?: string; warning?: string }> =>
    runFinancialWrite('Voucher generation', async () => {
    const vouchers = vouchersRef.current;
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

    // The full result of this generation: new vouchers, Carried marks on the
    // vouchers they absorb and, under the 'recalculate' rule, the re-derived
    // vouchers of each affected student from the first new month onward.
    const buildAfterGeneration = (prevList: FeeVoucher[]): FeeVoucher[] => {
      let list = applyCarryMarks([...prevList, ...newVouchers]);
      if (priorMonthRule === 'recalculate' && newVouchers.length > 0) {
        const fromMonths: Record<string, string> = {};
        newVouchers.forEach((nv) => {
          if (!fromMonths[nv.studentId] || nv.month < fromMonths[nv.studentId]) fromMonths[nv.studentId] = nv.month;
        });
        list = recalculateVouchersSequence(list, Object.keys(fromMonths), fromMonths);
      }
      return list;
    };

    // Dry run: a locked month must never be changed by generation (a new
    // voucher in it, a Carried mark on one of its vouchers, or a recalculated
    // balance). Refuse up front with the months named.
    const dryAfterGeneration = buildAfterGeneration(vouchers);
    {
      const lockedHit = getLockedMonthsTouched(vouchers, dryAfterGeneration, lockedMonths);
      if (lockedHit.length > 0) {
        return { success: false, generatedCount: 0, error: formatLockedImpactMessage(lockedHit, 'voucher generation') };
      }
    }
    const dryById = new Map(dryAfterGeneration.map((v) => [v.id, v]));
    const finalNewVouchers = newVouchers.map((nv) => dryById.get(nv.id) || nv);
    const newIdSet = new Set(newVouchers.map((nv) => nv.id));
    // Existing vouchers the recalculation re-derived (not new, not marked Carried by the server call).
    const downstreamUpserts = getChangedVouchers(vouchers, dryAfterGeneration).filter(
      (v) => !newIdSet.has(v.id) && !priorVouchersToCarry.has(v.id)
    );

    let warning: string | undefined;
    if (newVouchers.length > 0) {
      const carriedPriorList = Array.from(priorVouchersToCarry.entries()).map(([id, targetMonth]) => ({
        id,
        targetMonth,
      }));
      const generated = await apiGenerateVouchers(finalNewVouchers, carriedPriorList);
      if (!generated?.success) {
        return {
          success: false,
          generatedCount: 0,
          fromServer: true,
          error: generated?.error || 'The server did not accept the voucher generation. No vouchers were created.',
        };
      }

      // Confirmed: show the new vouchers under the numbers the server issued.
      const numberById = new Map<string, string>();
      (generated.vouchers || []).forEach((sv: any) => {
        if (sv?.id && sv?.voucherNo) numberById.set(sv.id, sv.voucherNo);
      });
      const afterList = buildAfterGeneration(vouchersRef.current).map((v) => {
        const no = numberById.get(v.id);
        return no && no !== v.voucherNo ? { ...v, voucherNo: no } : v;
      });
      vouchersRef.current = afterList;
      setVouchers(afterList);

      if (downstreamUpserts.length > 0) {
        const r2 = await apiVoucherBatchUpdate({ voucherUpserts: downstreamUpserts });
        if (!r2.success) {
          // The vouchers exist, but the balance recalculation of later months was not saved.
          // Show what the server really holds and tell the operator.
          warning = `Vouchers were generated, but recalculating later months failed (${r2.error || 'server refused'}). The screen was reloaded from the server; please review the affected students.`;
          fetchServerState()
            .then((r) => {
              if (r?.success && r.data) applyServerState(r.data);
            })
            .catch(() => {});
        }
      }

      const classObj = classId ? classes.find((c) => c.id === classId) : undefined;

    }

    return { success: true, generatedCount: newVouchers.length, warning };
    });

  // Replace (re-issue) a voucher in place: rebuild its particulars from the
  // current fee templates / transport / discounts, keep its id, number, dates and
  // recorded payments, and re-derive its status. Later vouchers are recalculated
  // once, starting at this month and stopping as soon as balances stop changing.
  // Refused up front if any locked month would change.
  const reissueVoucher = (
    voucherId: string
  ): Promise<{ success: boolean; voucher?: FeeVoucher; changedCount?: number; error?: string }> =>
    runFinancialWrite('Voucher reissue', async () => {
    const vouchers = vouchersRef.current;
    const transactions = transactionsRef.current;
    const perm = ensureMutationAllowed('Voucher reissue');
    if (!perm.allowed) return { success: false, error: perm.error };
    if (!hasPermission('fees.generate')) {
      return { success: false, error: 'Unauthorized: insufficient permissions to reissue vouchers.' };
    }

    const voucher = vouchers.find((v) => v.id === voucherId);
    if (!voucher) return { success: false, error: 'Voucher not found' };
    if (isMonthLocked(voucher.month)) {
      return { success: false, error: `Fee books for ${formatMonthName(voucher.month)} are locked. Ask an Admin to unlock the month first.` };
    }
    if (voucher.status === 'Reversed') return { success: false, error: 'This voucher is reversed and cannot be reissued.' };
    if (voucher.status === 'Carried') {
      return { success: false, error: 'This voucher was carried forward. Undo the carry forward before reissuing it.' };
    }
    if (voucher.voucherType === 'Admission') {
      return { success: false, error: 'Admission vouchers use entered amounts and cannot be rebuilt from templates. Edit its items instead.' };
    }
    if (transactions.some((t) => t.voucherId === voucher.id && Number(t.fineAdded) > 0)) {
      return { success: false, error: 'A payment on this voucher added a late fine. Reverse that collection before reissuing the voucher.' };
    }

    const student = students.find((s) => s.id === voucher.studentId);
    if (!student) return { success: false, error: 'Student not found.' };
    const cls = classes.find((c) => c.id === student.classId);

    const others = vouchers.filter((v) => v.id !== voucherId);
    const preview = calculateStudentVoucherPreview(
      student,
      cls,
      voucher.month,
      templates,
      transportAssignments,
      stops,
      others,
      'recalculate',
      'allow',
      roundingEnabled ? roundingMultiple : 1,
      transportRoundingMultiple
    );
    if (preview.isBeforeFirstBillingMonth) {
      return { success: false, error: preview.firstBillingMonthBlockReason || 'This month is before the student\'s first billing month.' };
    }

    const mult = getEffectiveMultiple(roundingEnabled, roundingMultiple, voucher.roundingMultiple);
    const netDue = preview.netDue;
    const status: FeeVoucher['status'] =
      voucher.amountPaid >= netDue && netDue > 0 ? 'Paid' : voucher.amountPaid > 0 ? 'Partial' : netDue <= 0 ? 'Paid' : 'Issued';

    const rebuilt: FeeVoucher = {
      ...voucher,
      particulars: preview.particulars,
      grossTotal: preview.grossTotal,
      discountTotal: preview.discountTotal,
      prevBalance: preview.prevBalance,
      roundingMultiple: mult,
      netDue,
      status,
    };

    // One recalculation from this month on (stops when balances stop changing).
    const afterList = recalculateVouchersSequence(
      vouchers.map((v) => (v.id === voucherId ? rebuilt : v)),
      [voucher.studentId],
      { [voucher.studentId]: voucher.month }
    );

    const lockedHit = getLockedMonthsTouched(vouchers, afterList, lockedMonths);
    if (lockedHit.length > 0) {
      return { success: false, error: formatLockedImpactMessage(lockedHit, 'reissue') };
    }

    const changed = getChangedVouchers(vouchers, afterList);
    if (changed.length === 0) {
      return { success: true, voucher, changedCount: 0 };
    }

    const reissued = await apiVoucherBatchUpdate({ voucherUpserts: changed });
    if (!reissued.success) {
      return {
        success: false,
        fromServer: true,
        error: reissued.error || 'The server did not accept the reissued voucher. Nothing was changed.',
      };
    }
    {
      const byId = new Map(changed.map((v) => [v.id, v]));
      const next = vouchersRef.current.map((v) => byId.get(v.id) || v);
      vouchersRef.current = next;
      setVouchers(next);
    }

    const final = afterList.find((v) => v.id === voucherId) || rebuilt;


    return { success: true, voucher: final, changedCount: changed.length };
    });

  // Update Voucher Particulars & Recalculate Totals
  const updateVoucherParticulars = (
    voucherId: string,
    updatedParticulars: VoucherItem[]
  ): Promise<{ success: boolean; voucher?: FeeVoucher; error?: string }> =>
    runFinancialWrite('Voucher edit', async () => {
    const vouchers = vouchersRef.current;
    const perm = ensureMutationAllowed('Voucher modification');
    if (!perm.allowed) return { success: false, error: perm.error };

    const voucher = vouchers.find((v) => v.id === voucherId);
    if (!voucher) return { success: false, error: 'Voucher not found' };
    if (isMonthLocked(voucher.month)) {
      return { success: false, error: `Fee books for ${formatMonthName(voucher.month)} are locked. Ask an Admin to unlock the month first.` };
    }
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

    const edited = await apiVoucherBatchUpdate({ voucherUpserts: [updatedVoucher] });
    if (!edited.success) {
      return {
        success: false,
        fromServer: true,
        error: edited.error || 'The server did not accept the voucher changes. Nothing was changed.',
      };
    }
    {
      const next = vouchersRef.current.map((v) => (v.id === voucherId ? updatedVoucher : v));
      vouchersRef.current = next;
      setVouchers(next);
    }

    // Audit Logging: Fine modifications and voucher line item adjustments
    const student = students.find((s) => s.id === voucher.studentId);
    const oldFine = voucher.particulars.find((p) => p.kind === 'Fine')?.amount || 0;
    const newFine = cleanParticulars.find((p) => p.kind === 'Fine')?.amount || 0;
    const fineDiff = newFine - oldFine;

    if (fineDiff !== 0) {
      logAuditEvent({
        actionType: 'fine_modification',
        actionTitle: fineDiff > 0 ? 'Manual Late Fine Added/Increased' : 'Manual Fine Reduced/Waived',
        description: `Manual fine adjustment of ${fineDiff > 0 ? '+' : ''}${formatCurrency(fineDiff)} (from ${formatCurrency(oldFine)} to ${formatCurrency(newFine)}) on voucher ${voucher.voucherNo} for ${student?.name || 'Unknown'}.`,
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

    }

    return { success: true, voucher: updatedVoucher };
    });

  // Adopts what the server stored for a confirmed collection: the collection and
  // transactions (with the numbers the server minted) and the recalculated vouchers.
  const adoptConfirmedCollection = (
    res: { collection?: any; transactions?: any[]; updatedVouchers?: any[] },
    localCollection: FeeCollection,
    localTxns: PaymentTransaction[]
  ) => {
    const serverCol = res.collection ? { ...localCollection, ...res.collection } : localCollection;
    const serverTxns = new Map<string, any>((res.transactions || []).map((t: any) => [t.id, t]));
    const txns = localTxns.map((t) => (serverTxns.has(t.id) ? { ...t, ...serverTxns.get(t.id) } : t));
    const vById = new Map<string, FeeVoucher>((res.updatedVouchers || []).map((v: any) => [v.id, v]));

    const nextCollections = [serverCol as FeeCollection, ...collectionsRef.current.filter((c) => c.id !== serverCol.id)];
    const nextTxns = [...txns, ...transactionsRef.current.filter((t) => !txns.some((n) => n.id === t.id))];
    const nextVouchers = vouchersRef.current.map((v) => (vById.has(v.id) ? { ...v, ...vById.get(v.id)! } : v));
    collectionsRef.current = nextCollections;
    transactionsRef.current = nextTxns;
    vouchersRef.current = nextVouchers;
    setCollections(nextCollections);
    setTransactions(nextTxns);
    setVouchers(nextVouchers);
    return { collection: serverCol as FeeCollection, transactions: txns };
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
  ): Promise<{ success: boolean; transaction?: PaymentTransaction; voucher?: FeeVoucher; error?: string }> =>
    runFinancialWrite('Fee payment collection', async () => {
    const vouchers = vouchersRef.current;
    const perm = ensureMutationAllowed('Payment collection');
    if (!perm.allowed) return { success: false, error: perm.error };

    const voucher = vouchers.find((v) => v.id === voucherId);
    if (!voucher) return { success: false, error: 'Voucher not found' };
    if (isMonthLocked(voucher.month)) {
      return { success: false, error: `Fee books for ${formatMonthName(voucher.month)} are locked. Payments cannot be recorded until an Admin unlocks the month.` };
    }
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
    if (vouchers.some((v) => v.studentId === voucher.studentId && v.status !== 'Reversed' && v.month > voucher.month)) {
      return { success: false, error: `Voucher ${voucher.voucherNo} is not the student's latest voucher. Record the payment against the latest voucher.` };
    }

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

    const pendingCollectionNo = pendingDocumentNumber();
    const pendingTxnNo = pendingDocumentNumber();

    const collectionId = `col-${Date.now()}`;

    const newCollection: FeeCollection = {
      id: collectionId,
      collectionNo: pendingCollectionNo,
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
      txnNo: pendingTxnNo,
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

    const confirmed = await apiReceiveCollection({
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
    });
    if (!confirmed.success) {
      return {
        success: false,
        fromServer: true,
        error: confirmed.error || 'The server did not accept the payment. Nothing was recorded.',
      };
    }
    // Confirmed: the screen now shows what the server stored, under the server's numbers.
    const adopted = adoptConfirmedCollection(confirmed, newCollection, [newTxn]);
    const savedTxn = adopted.transactions[0];
    const collectionNo = adopted.collection.collectionNo;
    const txnNo = savedTxn.txnNo;

    // Audit Logging: Fine adjustment at payment collection and collection receipt event
    const student = students.find((s) => s.id === voucher.studentId);
    if (fineDiff !== 0) {
      logAuditEvent({
        actionType: 'fine_modification',
        actionTitle: fineDiff > 0 ? 'Late Fine Added at Collection' : 'Fine Waived/Reduced at Collection',
        description: `Fine adjusted by ${fineDiff > 0 ? '+' : ''}${formatCurrency(fineDiff)} (from ${formatCurrency(originalFine)} to ${formatCurrency(newFine)}) during payment collection for voucher ${voucher.voucherNo} (${student?.name || 'Unknown'}).`,
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



    return { success: true, transaction: savedTxn, voucher: vouchersRef.current.find((v) => v.id === voucherId) };
    });

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
  ): Promise<{ success: boolean; successCount: number; errors: string[] }> =>
    runFinancialWrite('Bulk CSV payment collection', async () => {
    const vouchers = vouchersRef.current;
    const perm = ensureMutationAllowed('Bulk CSV payment collection');
    if (!perm.allowed) return { success: false, successCount: 0, errors: [perm.error || 'Blocked'] };

    let successCount = 0;
    const errors: string[] = [];

    const newTxns: PaymentTransaction[] = [];
    let batchTotal = 0;

    const collectionId = `col-bulk-${Date.now()}`;
    const pendingCollectionNo = pendingDocumentNumber();

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
        const tv = targetVoucherRaw;
        const later = vouchers
          .filter((v) => v.studentId === tv.studentId && v.status !== 'Reversed' && v.month > tv.month)
          .sort((a, b) => b.month.localeCompare(a.month))[0];
        if (later) {
          errors.push(`Row ${idx + 1}: Voucher ${tv.voucherNo} is not the latest voucher for this student. Pay against ${later.voucherNo} (${later.month}).`);
          return;
        }
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

      const pendingTxnNo = pendingDocumentNumber();

      const rowDate = row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : defaultDate;
      const studentRegText = matchedStudent?.regNo ? ` [Reg #${matchedStudent.regNo}]` : '';
      newTxns.push({
        id: `txn-bulk-${Date.now()}-${idx}`,
        txnNo: pendingTxnNo,
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

    // All-or-nothing: any row error means nothing is recorded.
    if (errors.length > 0) return { success: false, successCount: 0, errors };

    if (successCount > 0) {
      const primaryCollectionDate =
        newTxns[0]?.date || defaultDate || new Date().toISOString().split('T')[0];

      const newCollection: FeeCollection = {
        id: collectionId,
        collectionNo: pendingCollectionNo,
        date: primaryCollectionDate,
        totalAmount: batchTotal,
        transactionCount: successCount,
        notes: `Bulk CSV Payment Collection (${successCount} rows)`,
        isBulkImport: true,
      };

      // The whole file is saved by the server in one transaction, or not at all.
      // Nothing changes on screen until the server confirms.
      const confirmed = await apiReceiveCollection({
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
      });
      if (!confirmed.success) {
        return {
          success: false,
          fromServer: true,
          successCount: 0,
          errors: [confirmed.error || 'The server did not accept the import. Nothing was recorded.'],
        };
      }
      const adopted = adoptConfirmedCollection(confirmed, newCollection, newTxns);
      const collectionNo = adopted.collection.collectionNo;
      newTxns.splice(0, newTxns.length, ...adopted.transactions);

      // Audit Logging: Bulk CSV Collection


      // Audit Logging: Record fine additions if any were in CSV
      const fineTxns = newTxns.filter((t) => t.fineAdded && t.fineAdded > 0);
      if (fineTxns.length > 0) {
        const totalFineAdded = fineTxns.reduce((s, t) => s + (t.fineAdded || 0), 0);
        logAuditEvent({
          actionType: 'fine_modification',
          actionTitle: 'Bulk Collection Late Fines Applied',
          description: `Applied ${formatCurrency(totalFineAdded)} in manual/custom late fines across ${fineTxns.length} records during CSV bulk collection import.`,
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
    });

  // Bulk carry-forward. The whole batch is executed atomically by the server
  // (one PostgreSQL transaction, vouchers locked FOR UPDATE, any new Admission
  // destination vouchers numbered by the server) using the shared
  // applyCarryForward() rules. The client only sends the operator's choices and
  // the school policy, then adopts the vouchers the server returns -- it never
  // recomputes or writes the ledger itself.
  const bulkCarryForwardDefaulters = (
    voucherIds: string[],
    targetMonth: string,
    addLateFine: boolean,
    customFineAmount?: number,
    perVoucherFines?: Record<string, number>
  ): Promise<{ success: boolean; successCount: number; errors: string[] }> =>
    runFinancialWrite('Bulk carry forward', async () => {
    const vouchers = vouchersRef.current;
    const perm = ensureMutationAllowed('Bulk carry forward defaulters');
    if (!perm.allowed) return { success: false, successCount: 0, errors: [perm.error || 'Blocked'] };
    if (!voucherIds || voucherIds.length === 0) return { success: true, successCount: 0, errors: [] };
    {
      const lockedSrc = vouchers.find((v) => voucherIds.includes(v.id) && isMonthLocked(v.month));
      if (lockedSrc || isMonthLocked(targetMonth)) {
        const m = lockedSrc ? lockedSrc.month : targetMonth;
        const err = `Fee books for ${formatMonthName(m)} are locked. Carry forward is blocked until an Admin unlocks the month.`;
        return { success: false, successCount: 0, errors: [err] };
      }
    }

    startActionLock(
      'Carrying Forward Defaulter Balances',
      voucherIds.length,
      `Preparing ${voucherIds.length} defaulter vouchers for carry-forward...`
    );

    try {
      updateActionLock({
        current: Math.max(1, Math.round(voucherIds.length * 0.2)),
        message: `Processing and updating ${voucherIds.length} vouchers on the server...`,
      });

      const batchRes = await apiCarryForwardBatch({
        voucherIds,
        targetMonth,
        addLateFine,
        customFineAmount,
        perVoucherFines,
        policy: {
          roundingEnabled,
          roundingMultiple,
          defaultLateFeeRate,
          settingsDueDate: getComputedDefaultDueDate(targetMonth),
        },
      });

      if (!batchRes.success) {
        throw new Error(batchRes.error || 'Bulk carry-forward transaction failed on server.');
      }

      updateActionLock({
        current: Math.round(voucherIds.length * 0.85),
        message: `Applying ${batchRes.count ?? 0} updated vouchers to ledger...`,
      });

      // Adopt the server's finished vouchers (carried sources, updated targets,
      // recalculated downstream vouchers and any new destination vouchers).
      const updates = Array.isArray(batchRes.updatedVouchers) ? batchRes.updatedVouchers : [];
      const updateMap = new Map<string, FeeVoucher>();
      updates.forEach((uv: any) => {
        if (uv && uv.id) updateMap.set(uv.id, uv);
      });
      const currentList = vouchersRef.current;
      const mergedList = currentList.map((v) => updateMap.get(v.id) || v);
      updates.forEach((uv: any) => {
        if (uv && uv.id && !currentList.some((v) => v.id === uv.id)) mergedList.push(uv);
      });
      vouchersRef.current = mergedList;
      setVouchers(mergedList);

      const successCount = batchRes.count ?? 0;
      updateActionLock({
        current: voucherIds.length,
        message: `Successfully saved ${successCount} carried vouchers in database.`,
        phase: 'completed',
      });

      await stopActionLock(`Completed: ${successCount} defaulters carried forward`, 350);

      return { success: true, successCount, errors: batchRes.errors || [] };
    } catch (err: any) {
      console.error('[BulkCarryForward] Error:', err);
      await stopActionLock();
      showToast(err?.message || 'Failed to carry forward defaulters', 'error');
      return {
        success: false,
        successCount: 0,
        errors: [err?.message || 'Carry-forward failed'],
      };
    }
  });

  const undoCarryForwardVoucher = (
    voucherId: string
  ): Promise<{ success: boolean; error?: string }> =>
    runFinancialWrite('Carry-forward undo', async () => {
    const perm = ensureMutationAllowed('Undo carry forward');
    if (!perm.allowed) return { success: false, error: perm.error };

    const baseList = vouchersRef.current;
    const voucher = baseList.find((v) => v.id === voucherId);
    if (!voucher) {
      return { success: false, error: 'Voucher not found.' };
    }
    {
      const [cy, cm] = voucher.month.split('-').map(Number);
      const nextMonth = cm === 12 ? `${cy + 1}-01` : `${cy}-${String(cm + 1).padStart(2, '0')}`;
      const lockedM = isMonthLocked(voucher.month) ? voucher.month : isMonthLocked(nextMonth) ? nextMonth : '';
      if (lockedM) {
        return { success: false, error: `Fee books for ${formatMonthName(lockedM)} are locked. Undoing a carry forward is blocked until an Admin unlocks the month.` };
      }
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

    updatedList = recalculateVouchersSequence(updatedList, [voucher.studentId], voucher.month);

    const saved = await apiVoucherBatchUpdate({
      voucherUpserts: updatedList.filter((v) => v.studentId === voucher.studentId),
    });
    if (!saved.success) {
      return {
        success: false,
        fromServer: true,
        error: saved.error || 'The server did not accept the change. The carry-forward was not undone.',
      };
    }
    vouchersRef.current = updatedList;
    setVouchers(updatedList);

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
    });

  // Thin wrapper: the chain math lives in feeMath.recalculateVoucherChain so the
  // server's atomic carry-forward uses exactly the same rules.
  const recalculateVouchersSequence = (
    allVouchers: FeeVoucher[],
    affectedStudentIds: string[],
    fromMonth?: string | Record<string, string>
  ): FeeVoucher[] =>
    recalculateVoucherChain(allVouchers, affectedStudentIds, { roundingEnabled, roundingMultiple }, fromMonth);

  const getDownstreamVouchersInfo = (ids: string[]) => {
    const vouchers = vouchersRef.current;
    const transactions = transactionsRef.current;
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
  ) =>
    runFinancialWrite('Voucher deletion', async () => {
    const vouchers = vouchersRef.current;
    const transactions = transactionsRef.current;
    const perm = ensureMutationAllowed('Voucher deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    const effectiveMode = mode || voucherDeletionResolution;
    const target = vouchers.find((v) => v.id === id);
    if (!target) return { success: false, error: 'Voucher not found' };
    if (isMonthLocked(target.month)) {
      return { success: false, error: `Fee books for ${formatMonthName(target.month)} are locked. Vouchers cannot be deleted until an Admin unlocks the month.` };
    }

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

    // Dry run: work out exactly which vouchers this deletion (and the auto-heal
    // recalculation) would change, and refuse up front if any is in a locked
    // month. Recalculation starts at each student's earliest deleted month and
    // stops as soon as balances stop changing.
    const healFromMonths: Record<string, string> = {};
    vouchers.forEach((v) => {
      if (idsToDelete.includes(v.id) && (!healFromMonths[v.studentId] || v.month < healFromMonths[v.studentId])) {
        healFromMonths[v.studentId] = v.month;
      }
    });
    const baselineRemaining = vouchers.filter((v) => !idsToDelete.includes(v.id));
    const dryRemaining =
      effectiveMode === 'auto-heal'
        ? recalculateVouchersSequence(baselineRemaining, affectedStudentIds, healFromMonths)
        : baselineRemaining;
    const lockedHit = getLockedMonthsTouched(vouchers, dryRemaining, lockedMonths);
    if (lockedHit.length > 0) {
      return { success: false, error: formatLockedImpactMessage(lockedHit, 'deletion') };
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

    }

    let remainingList = vouchers.filter((v) => !idsToDelete.includes(v.id));
    const baselineForUpsert = remainingList;
    if (effectiveMode === 'auto-heal') {
      remainingList = recalculateVouchersSequence(remainingList, affectedStudentIds, healFromMonths);
    }

    const saved = await apiVoucherBatchUpdate({
      voucherUpserts:
        effectiveMode === 'auto-heal' ? getChangedVouchers(baselineForUpsert, remainingList) : [],
      deleteVoucherIds: idsToDelete,
      deleteTransactionIds: voucherTxnIds,
      collectionUpdates: collectionUpdatesForApi,
      deleteCollectionIds: deleteCollectionIdsForApi,});
    if (!saved.success) {
      return { success: false, deletedCount: 0, fromServer: true, error: saved.error || 'The server did not accept the deletion. Nothing was deleted.' };
    }

    // Confirmed: now the screen changes.
    setTransactions((prev) => {
      const next = prev.filter((t) => !idsToDelete.includes(t.voucherId));
      transactionsRef.current = next;
      return next;
    });
    setCollections((prev) => {
      const next = prev
        .filter((c) => !deleteCollectionIdsForApi.includes(c.id))
        .map((c) => {
          const u = collectionUpdatesForApi.find((x) => x.id === c.id);
          return u ? { ...c, totalAmount: u.totalAmount, transactionCount: u.transactionCount } : c;
        });
      collectionsRef.current = next;
      return next;
    });
    vouchersRef.current = remainingList;
    setVouchers(remainingList);

    const student = students.find((s) => s.id === target.studentId);


    return { success: true, deletedCount: idsToDelete.length };
  });
  const bulkDeleteVouchers = (
    ids: string[],
    force: boolean = false,
    mode?: VoucherDeletionResolution
  ) =>
    runFinancialWrite('Bulk voucher deletion', async () => {
    const vouchers = vouchersRef.current;
    const transactions = transactionsRef.current;
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

    // Dry run: work out exactly which vouchers this deletion (and the auto-heal
    // recalculation) would change, and refuse up front if any is in a locked
    // month. Recalculation starts at each student's earliest deleted month and
    // stops as soon as balances stop changing.
    const healFromMonths: Record<string, string> = {};
    vouchers.forEach((v) => {
      if (idsToDelete.includes(v.id) && (!healFromMonths[v.studentId] || v.month < healFromMonths[v.studentId])) {
        healFromMonths[v.studentId] = v.month;
      }
    });
    const baselineRemaining = vouchers.filter((v) => !idsToDelete.includes(v.id));
    const dryRemaining =
      effectiveMode === 'auto-heal'
        ? recalculateVouchersSequence(baselineRemaining, affectedStudentIds, healFromMonths)
        : baselineRemaining;
    const lockedHit = getLockedMonthsTouched(vouchers, dryRemaining, lockedMonths);
    if (lockedHit.length > 0) {
      return { success: false, deletedCount: 0, error: formatLockedImpactMessage(lockedHit, 'deletion') };
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

    }

    let remainingList = vouchers.filter((v) => !idsToDelete.includes(v.id));
    const baselineForUpsert = remainingList;
    if (effectiveMode === 'auto-heal') {
      remainingList = recalculateVouchersSequence(remainingList, affectedStudentIds, healFromMonths);
    }

    const saved = await apiVoucherBatchUpdate({
      voucherUpserts:
        effectiveMode === 'auto-heal' ? getChangedVouchers(baselineForUpsert, remainingList) : [],
      deleteVoucherIds: idsToDelete,
      deleteTransactionIds: voucherTxnIds,
      collectionUpdates: collectionUpdatesForApi,
      deleteCollectionIds: deleteCollectionIdsForApi,});
    if (!saved.success) {
      return { success: false, deletedCount: 0, fromServer: true, error: saved.error || 'The server did not accept the deletion. Nothing was deleted.' };
    }

    // Confirmed: now the screen changes.
    setTransactions((prev) => {
      const next = prev.filter((t) => !idsToDelete.includes(t.voucherId));
      transactionsRef.current = next;
      return next;
    });
    setCollections((prev) => {
      const next = prev
        .filter((c) => !deleteCollectionIdsForApi.includes(c.id))
        .map((c) => {
          const u = collectionUpdatesForApi.find((x) => x.id === c.id);
          return u ? { ...c, totalAmount: u.totalAmount, transactionCount: u.transactionCount } : c;
        });
      collectionsRef.current = next;
      return next;
    });
    vouchersRef.current = remainingList;
    setVouchers(remainingList);



    return { success: true, deletedCount: idsToDelete.length };
  });
  // Collections Ledger Delete
  const deleteCollection = (id: string): Promise<{ success: boolean; error?: string }> =>
    runFinancialWrite('Collection deletion', async () => {
    const vouchers = vouchersRef.current;
    const transactions = transactionsRef.current;
    const collections = collectionsRef.current;
    const perm = ensureMutationAllowed('Collection deletion');
    if (!perm.allowed) return { success: false, error: perm.error };

    const colToDelete = collections.find((c) => c.id === id);
    const colTxns = transactions.filter(
      (t) => t.collectionId === id || (colToDelete && t.collectionId === colToDelete.collectionNo)
    );
    {
      const lockedV = colTxns
        .map((t) => vouchers.find((v) => v.id === t.voucherId))
        .find((v) => v && isMonthLocked(v.month));
      if (lockedV) {
        return { success: false, error: `Fee books for ${formatMonthName(lockedV.month)} are locked. Collections cannot be reversed until an Admin unlocks the month.` };
      }
    }
    if (colTxns.length === 0) {
      const emptyRes = await apiVoucherBatchUpdate({ deleteCollectionIds: [id] });
      if (!emptyRes.success) {
        return { success: false, fromServer: true, error: emptyRes.error || 'The server did not accept the deletion. Nothing was deleted.' };
      }
      const nextCols = collectionsRef.current.filter((c) => c.id !== id);
      collectionsRef.current = nextCols;
      setCollections(nextCols);
      return { success: true };
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

    // Recalculate vouchers with payment deduction and fine reversal. Kept as a
    // pure function so it can be dry-run against the current snapshot (to refuse
    // up front when a locked month would change) and then applied for real.
    const reverseCollectionOn = (prev: FeeVoucher[]): FeeVoucher[] => {
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

      // Recalculate downstream student voucher sequence if previous balance / arrears are affected.
      // Each student's walk starts at their earliest reversed voucher's month
      // and stops once balances stop changing.
      if (affectedStudentIds.size > 0) {
        const reverseFrom: Record<string, string> = {};
        prev.forEach((pv) => {
          if (deductions.has(pv.id) || fineReversals.has(pv.id)) {
            if (!reverseFrom[pv.studentId] || pv.month < reverseFrom[pv.studentId]) reverseFrom[pv.studentId] = pv.month;
          }
        });
        updatedVouchers = recalculateVouchersSequence(updatedVouchers, Array.from(affectedStudentIds), reverseFrom);
      }

      return updatedVouchers;
    };

    {
      const dry = reverseCollectionOn(vouchers);
      const lockedHit = getLockedMonthsTouched(vouchers, dry, lockedMonths);
      if (lockedHit.length > 0) {
        return { success: false, error: formatLockedImpactMessage(lockedHit, 'collection reversal') };
      }
    }

    const preReversalVouchers = vouchers;
    const recalculatedVouchers = reverseCollectionOn(vouchers);

    // Persist: delete the collection + its transactions, and upsert every
    // voucher belonging to an affected student (recalculateVouchersSequence
    // can touch a student's whole voucher chain, not just the directly
    // deducted voucher, via the prevBalance cascade — sending the student's
    // full chain is simplest and safe given per-student voucher counts are
    // naturally small).
    const reversed = await apiVoucherBatchUpdate({
      voucherUpserts: getChangedVouchers(preReversalVouchers, recalculatedVouchers),
      deleteTransactionIds: colTxns.map((t) => t.id),
      deleteCollectionIds: [id],
    });
    if (!reversed.success) {
      return {
        success: false,
        fromServer: true,
        error: reversed.error || 'The server did not accept the reversal. Nothing was changed.',
      };
    }

    // Confirmed: now the screen changes.
    const nextCols = collectionsRef.current.filter((c) => c.id !== id);
    const nextTxns = transactionsRef.current.filter(
      (t) => t.collectionId !== id && (!colToDelete || t.collectionId !== colToDelete.collectionNo)
    );
    collectionsRef.current = nextCols;
    transactionsRef.current = nextTxns;
    vouchersRef.current = recalculatedVouchers;
    setCollections(nextCols);
    setTransactions(nextTxns);
    setVouchers(recalculatedVouchers);

    // Audit Logging: Collection deletion and reversals
    const totalReverted = colToDelete?.totalAmount || colTxns.reduce((s, t) => s + t.amount, 0);
    const totalFinesReverted = Array.from(fineReversals.values()).reduce((a, b) => a + b, 0);



    if (totalFinesReverted > 0) {
      logAuditEvent({
        actionType: 'fine_modification',
        actionTitle: 'Collection Late Fines Reverted',
        description: `Reverted ${formatCurrency(totalFinesReverted)} in late fines across ${fineReversals.size} vouchers upon deleting collection ${colToDelete?.collectionNo || id}.`,
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
    return { success: true };
    });

  // Settings
  const updateInstitute = async (updates: Partial<InstituteProfile>) => {
    const perm = ensureMutationAllowed('Update institute profile');
    if (!perm.allowed) return { success: false, error: perm.error };

    let timeout: number | undefined = undefined;
    if (updates.sessionTimeoutMinutes !== undefined) {
      timeout = Math.max(1, Math.min(180, Number(updates.sessionTimeoutMinutes) || 10));
    } else if (updates.settings?.sessionTimeoutMinutes !== undefined) {
      timeout = Math.max(1, Math.min(180, Number(updates.settings.sessionTimeoutMinutes) || 10));
    }

    const currentTimeout = timeout !== undefined ? timeout : (institute.sessionTimeoutMinutes ?? sessionTimeoutMinutes ?? 10);
    const mergedSettings = {
      ...(institute.settings || {}),
      ...(updates.settings || {}),
      sessionTimeoutMinutes: currentTimeout,
    };

    const newInst: InstituteProfile = {
      ...institute,
      ...updates,
      sessionTimeoutMinutes: currentTimeout,
      settings: mergedSettings,
    };

    // Confirm-first: the screen changes only after the server accepts the update.
    const targetInstId = currentInstitution?.id || 'default';
    try {
      const res = await fetch('/api/institute', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-institution-id': targetInstId,
        },
        body: JSON.stringify({
          name: newInst.name,
          logoUrl: newInst.logoUrl,
          address: newInst.address,
          phone: newInst.phone,
          email: newInst.email,
          website: newInst.website,
          registrationNo: newInst.regNo,
          currency: newInst.currency || 'USD',
          settings: mergedSettings,
        }),
      });
      if (!res.ok) {
        let msg = `The server rejected the institute update (HTTP ${res.status}).`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {}
        return { success: false, error: msg };
      }
    } catch (err) {
      console.warn('[Institute] Failed to persist institute updates:', err);
      return { success: false, error: 'Could not reach the server. The institute profile was not changed.' };
    }

    setInstitute(newInst);
    if (timeout !== undefined) {
      setSessionTimeoutMinutesState(timeout);
      try {
        localStorage.setItem('quickfees_session_timeout_minutes', String(timeout));
        localStorage.setItem('quickfees_inactivity_duration', String(timeout));
      } catch {}
    }

    return { success: true };
  };

  const addBankAccount = async (bank: Omit<BankAccount, 'id'>) => {
    const perm = ensureMutationAllowed('Add bank account');
    if (!perm.allowed) return { success: false, error: perm.error };

    const newBank: BankAccount = { ...bank, id: generateUniqueId('bank') };
    return commitEntity('bankAccounts', (cur: BankAccount[]) =>
      newBank.isDefault ? cur.map((b) => ({ ...b, isDefault: false })).concat(newBank) : [...cur, newBank]
    );
  };

  const updateBankAccount = async (id: string, updates: Partial<BankAccount>) => {
    const perm = ensureMutationAllowed('Update bank account');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('bankAccounts', (cur: BankAccount[]) => {
      if (!cur.some((b) => b.id === id)) return { error: 'Bank account not found.' };
      return updates.isDefault
        ? cur.map((b) => (b.id === id ? { ...b, ...updates, isDefault: true } : { ...b, isDefault: false }))
        : cur.map((b) => (b.id === id ? { ...b, ...updates } : b));
    });
  };

  const deleteBankAccount = async (id: string) => {
    const perm = ensureMutationAllowed('Delete bank account');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('bankAccounts', (cur: BankAccount[]) => cur.filter((b) => b.id !== id));
  };

  const setDefaultBankAccount = async (id: string) => {
    const perm = ensureMutationAllowed('Set default bank account');
    if (!perm.allowed) return { success: false, error: perm.error };

    return commitEntity('bankAccounts', (cur: BankAccount[]) => cur.map((b) => ({ ...b, isDefault: b.id === id })));
  };

  // Selection-based database cleanup. Confirm-first like every other write: nothing on the
  // screen is emptied until the server has deleted it. The steps run in the order the
  // database's foreign keys require (vouchers, then assignments and templates, then students,
  // then everything else) and stop at the first refusal. Each step is all-or-nothing, but the
  // steps are separate transactions, so after any outcome the screen is reloaded from the
  // server and the message says exactly what was completed and what was not.
  const cleanupDatabaseTables = (options: DataCleanupOptions): Promise<CleanupResult> =>
    runFinancialWrite('Data cleanup', async () => {
    const perm = ensureMutationAllowed('Database cleanup');
    if (!perm.allowed) return { success: false, recordsClearedCount: 0, clearedTables: [], error: perm.error };

    const L = listsRef.current;
    const fullTransportWipe = Boolean(options.transport);
    const clearedTables: string[] = [];
    let recordsClearedCount = 0;

    type Step = { label: string; count: number; run: () => Promise<{ success: boolean; error?: string }> };
    const steps: Step[] = [];
    const clear = (entity: CommitEntity, build: (cur: any[]) => any[]) => () => commitEntity(entity, build);

    // 1. Fee vouchers and collections (the server lists every record, including closed history).
    if (options.vouchers || options.collections) {
      const count = (options.vouchers ? vouchersRef.current.length : 0) + (options.collections ? collectionsRef.current.length + transactionsRef.current.length : 0);
      steps.push({
        label: 'Fee Vouchers / Collections & Transactions',
        count,
        run: async () => {
          const allIds = await apiFetchAllFinancialIds();
          if (!allIds.success) return { success: false, error: allIds.error || 'could not list all records on the server' };
          const r = await apiVoucherBatchUpdate({
            deleteVoucherIds: options.vouchers ? allIds.voucherIds : [],
            deleteTransactionIds: options.collections ? allIds.transactionIds : [],
            deleteCollectionIds: options.collections ? allIds.collectionIds : [],
          });
          return r.success ? { success: true } : { success: false, error: r.error || 'the server refused the deletion' };
        },
      });
    }

    // 2. Transport assignments and fee-template overrides (children of students, classes, buses, stops).
    if (options.students || options.transportAssignments || fullTransportWipe) {
      steps.push({ label: 'Student Transport Assignments', count: L.transportAssignments.length, run: clear('transportAssignments', () => []) });
    }
    const keepTemplate = (t: FeeTemplate) =>
      !((options.students && t.studentId) || (options.classes && t.classId));
    if (options.templates) {
      steps.push({ label: 'Fee Particular Templates (reset to the standard baseline)', count: L.templates.filter((t: FeeTemplate) => !!t.studentId || !!t.classId).length || L.templates.length, run: clear('templates', () => INITIAL_GLOBAL_TEMPLATES) });
    } else if (options.students || options.classes) {
      steps.push({ label: 'Fee Template Overrides', count: L.templates.filter((t: FeeTemplate) => !keepTemplate(t)).length, run: clear('templates', (cur) => cur.filter(keepTemplate)) });
    }

    // 3. Students, then classes, families, buses, stops and bank accounts.
    if (options.students) steps.push({ label: 'Students & Profiles', count: L.students.length, run: clear('students', () => []) });
    if (options.classes) steps.push({ label: 'Classes & Sections', count: L.classes.length, run: clear('classes', () => []) });
    if (options.families) steps.push({ label: 'Families & Guardians', count: L.families.length, run: clear('families', () => []) });
    if (options.transportBuses || fullTransportWipe) steps.push({ label: 'Buses Fleet Directory', count: L.buses.length, run: clear('buses', () => []) });
    if (options.transportStops || fullTransportWipe) steps.push({ label: 'Bus Stops & Fare Rates', count: L.stops.length, run: clear('stops', () => []) });
    if (options.bankAccounts) steps.push({ label: 'Bank Accounts', count: L.bankAccounts.length, run: clear('bankAccounts', () => []) });

    // 4. Secondary users (the signed-in user is always kept).
    const secondaryUsers = options.users ? users.filter((u) => u.id !== currentUser?.id) : [];
    if (options.users) {
      steps.push({
        label: 'Secondary Users',
        count: secondaryUsers.length,
        run: async () => {
          for (const u of secondaryUsers) {
            const r = await apiDeleteUser(u.id);
            if (!r.success) return { success: false, error: `${u.name || u.username}: ${r.error || 'could not be deleted'}` };
          }
          return { success: true };
        },
      });
    }

    let failure: { label: string; error?: string } | null = null;
    for (const step of steps) {
      const r = await step.run();
      if (!r.success) {
        failure = { label: step.label, error: r.error };
        break;
      }
      clearedTables.push(`${step.label} (${step.count} records)`);
      recordsClearedCount += step.count;
    }

    // Show what the server really holds now, whatever happened.
    const fresh = await fetchServerState();
    if (fresh?.success && fresh.data) applyServerState(fresh.data);

    if (failure) {
      return {
        success: false,
        fromServer: true,
        clearedTables,
        recordsClearedCount,
        error:
          `Cleanup stopped at "${failure.label}": ${failure.error || 'the server refused the deletion'}. ` +
          (clearedTables.length > 0 ? `Already removed: ${clearedTables.join('; ')}.` : 'Nothing was removed.'),
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

    return { success: true, clearedTables, recordsClearedCount };
    });

  // Confirm-first financial writes. Every voucher / collection write runs through this
  // helper: one queue (so two writes never overlap and each one works from the state the
  // previous one left), a "saving" flag for the screen, and a rule the task must follow:
  // compute from the latest lists, await the server, and change the screen ONLY after the
  // server confirmed. A failed task returns { success: false, error } and changes nothing;
  // when the server itself refused (fromServer), the latest saved data is reloaded quietly
  // so a stale screen cannot cause the same refusal again.
  type FinancialResult = { success: boolean; error?: string; fromServer?: boolean };
  const financialQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [financialPending, setFinancialPending] = useState(0);
  const runFinancialWrite = <R extends FinancialResult>(label: string, task: () => Promise<R>): Promise<R> => {
    setFinancialPending((n) => n + 1);
    const run = financialQueue.current.then(async () => {
      try {
        const res = await task();
        if (!res.success && res.fromServer) {
          fetchServerState()
            .then((r) => {
              if (r?.success && r.data) applyServerState(r.data);
            })
            .catch(() => {});
        }
        return res;
      } catch (err: any) {
        console.error(`[API] ${label} failed:`, err);
        return {
          success: false,
          error: `${label} could not be completed: ${err?.message || 'unexpected error'}. Nothing was changed.`,
        } as unknown as R;
      } finally {
        setFinancialPending((n) => n - 1);
      }
    });
    financialQueue.current = run.catch(() => undefined);
    return run;
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

  useEffect(() => {
    let last = 0;
    return subscribeAuditWarnings(() => {
      const now = Date.now();
      if (now - last < 15000) return;
      last = now;
      showToast('The action was saved, but the audit log entry could not be recorded. Please tell an administrator.', 'error', 10000);
    });
  }, []);

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
        bulkAddStudents,
        families,
        addFamily,
        updateFamily,
        deleteFamily,
        deleteFamilies,
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
        deleteTransportAssignments,
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
        deleteStudentTemplateScopes,
        resetAllTemplates,
        deleteTemplate,
        vouchers,
        previewVoucherGeneration,
        commitVoucherGeneration,
        generateAdmissionVoucher,
        collectVoucherPayment,
        updateVoucherParticulars,
        reissueVoucher,
        bulkCsvCollection,
        bulkCarryForwardDefaulters,
        undoCarryForwardVoucher,
        financialSaving: financialPending > 0,
        actionLock,
        startActionLock,
        updateActionLock,
        stopActionLock,
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
        savePolicySettings,
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
        lockedMonthDetails,
        lockMonth,
        unlockMonth,
        historyFrom,
        ensureHistoryLoaded,
        ensureStudentHistory,
        isMonthLocked,
        cleanupDatabaseTables,
        logAuditEvent,
        auditRetentionMonths,
        setAuditRetentionMonths,
        studentAccountHistory,
        getStudentAccountHistory,
        updateStudentStatus,
        showToast,
        refreshFromServer,
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

      {/* Global Database Action Lock Modal */}
      <DatabaseActionLockModal actionLock={actionLock} />
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