import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import {
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
  TransportAssignment,
  TransportBus,
  TransportStop,
  User,
  UserRole,
  VoucherDeletionResolution,
  VoucherItem,
  VoucherStatus,
} from '../types';
import {
  INITIAL_BANK_ACCOUNTS,
  INITIAL_BUSES,
  INITIAL_CLASSES,
  INITIAL_COLLECTIONS,
  INITIAL_FAMILIES,
  INITIAL_GLOBAL_TEMPLATES,
  INITIAL_INSTITUTE,
  INITIAL_STOPS,
  INITIAL_STUDENTS,
  INITIAL_TRANSACTIONS,
  INITIAL_VOUCHERS,
  SEEDED_USERS,
} from '../data/seedData';
import {
  calculateStudentVoucherPreview,
  getNextMonthString,
  getPreviousMonthString,
  roundBusFareUp,
  roundChargeUp,
  roundDiscountDown,
  VoucherPreviewCalculation,
} from '../utils/feeMath';

export interface DownstreamConflict {
  voucher: FeeVoucher;
  student: Student;
  downstreamVouchers: FeeVoucher[];
  hasTransactions: boolean;
  txnCount: number;
}

interface AppContextType {
  // Auth & Roles
  currentUser: User;
  isAuthenticated: boolean;
  users: User[];
  login: (usernameOrEmail: string, password: string) => { success: boolean; error?: string; user?: User };
  logout: () => void;
  switchRole: (role: UserRole) => void;
  hasPermission: (permission: string) => boolean;
  addUser: (userData: Omit<User, 'id'>) => { success: boolean; error?: string };
  updateUser: (id: string, updates: Partial<User>) => { success: boolean; error?: string };
  deleteUser: (id: string) => { success: boolean; error?: string };

  // Active Month
  activeMonth: string;
  setActiveMonth: (month: string) => void;

  // Classes
  classes: SchoolClass[];
  addClass: (name: string, monthlyFee: number, sortOrder: number) => { success: boolean; error?: string };
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
  saveGlobalTemplate: (template: Omit<FeeTemplate, 'id'>) => void;
  updateGlobalTemplatesList: (newTemplates: FeeTemplate[]) => void;
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
  ) => { successCount: number };
  defaultLateFeeRate: number;
  setDefaultLateFeeRate: (rate: number) => void;
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

  // UI Preferences
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  // Settings & Policy
  priorMonthRule: PriorMonthVoucherRule;
  setPriorMonthRule: (rule: PriorMonthVoucherRule) => void;
  skippedMonthRule: SkippedMonthVoucherRule;
  setSkippedMonthRule: (rule: SkippedMonthVoucherRule) => void;
  voucherDeletionResolution: VoucherDeletionResolution;
  setVoucherDeletionResolution: (policy: VoucherDeletionResolution) => void;
  institute: InstituteProfile;
  updateInstitute: (updates: Partial<InstituteProfile>) => void;
  bankAccounts: BankAccount[];
  addBankAccount: (bank: Omit<BankAccount, 'id'>) => void;
  updateBankAccount: (id: string, updates: Partial<BankAccount>) => void;
  deleteBankAccount: (id: string) => void;
  setDefaultBankAccount: (id: string) => void;

  // Month Closure Check Helper
  getMonthClosureStatus: (month: string) => MonthClosureStatus;

  // System Utility & Granular Cleanup
  resetToDemoData: () => void;
  cleanupDatabaseTables: (options: DataCleanupOptions) => CleanupResult;

  // Global In-App Notifications / Toasts
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', durationMs?: number) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEY = 'skooler_app_data_v1';

/**
 * Reconciles and guarantees strict 1:1 bidirectional consistency between
 * Student.familyId and Family.memberStudentIds.
 * Ensures no student can ever be listed in multiple families simultaneously.
 */
export function reconcileFamiliesAndStudents(
  rawFamilies: Family[],
  rawStudents: Student[]
): { families: Family[]; students: Student[] } {
  const familyIdSet = new Set(rawFamilies.map((f) => f.id));

  // Determine authoritative familyId for each student
  const studentToFamilyMap = new Map<string, string>();

  // Pass 1: explicit valid student.familyId
  rawStudents.forEach((s) => {
    if (s.familyId && familyIdSet.has(s.familyId)) {
      studentToFamilyMap.set(s.id, s.familyId);
    }
  });

  // Pass 2: unassigned students found in family memberStudentIds
  rawFamilies.forEach((f) => {
    f.memberStudentIds?.forEach((sId) => {
      if (!studentToFamilyMap.has(sId)) {
        studentToFamilyMap.set(sId, f.id);
      }
    });
  });

  // Synced students list
  const syncedStudents = rawStudents.map((s) => ({
    ...s,
    familyId: studentToFamilyMap.get(s.id) || undefined,
  }));

  // Synced families list (each family contains EXACTLY the students whose familyId === f.id)
  const syncedFamilies = rawFamilies.map((f) => {
    const memberStudentIds = syncedStudents
      .filter((s) => s.familyId === f.id)
      .map((s) => s.id);
    return {
      ...f,
      memberStudentIds,
    };
  });

  return { families: syncedFamilies, students: syncedStudents };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Stored Users in Database / Local Storage
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_users`);
    return saved ? JSON.parse(saved) : SEEDED_USERS;
  });

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const session = localStorage.getItem(`${STORAGE_KEY}_auth_session`);
    return !!session;
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const session = localStorage.getItem(`${STORAGE_KEY}_auth_session`);
    if (session) {
      try {
        const parsed = JSON.parse(session);
        const savedUsers = localStorage.getItem(`${STORAGE_KEY}_users`);
        const userList: User[] = savedUsers ? JSON.parse(savedUsers) : SEEDED_USERS;
        const found = userList.find((u) => u.id === parsed.id || u.username.toLowerCase() === parsed.username?.toLowerCase());
        if (found) return found;
        return parsed;
      } catch (e) {
        // ignore
      }
    }
    return SEEDED_USERS[0]; // Default fallback
  });

  const [activeMonth, setActiveMonth] = useState<string>('2026-08');

  // Policy Settings State
  const [priorMonthRule, setPriorMonthRuleState] = useState<PriorMonthVoucherRule>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_prior_month_rule`);
    return (saved as PriorMonthVoucherRule) || 'strict';
  });

  const setPriorMonthRule = (rule: PriorMonthVoucherRule) => {
    setPriorMonthRuleState(rule);
    localStorage.setItem(`${STORAGE_KEY}_prior_month_rule`, rule);
  };

  const [skippedMonthRule, setSkippedMonthRuleState] = useState<SkippedMonthVoucherRule>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_skipped_month_rule`);
    return (saved as SkippedMonthVoucherRule) || 'warning';
  });

  const setSkippedMonthRule = (rule: SkippedMonthVoucherRule) => {
    setSkippedMonthRuleState(rule);
    localStorage.setItem(`${STORAGE_KEY}_skipped_month_rule`, rule);
  };

  const [voucherDeletionResolution, setVoucherDeletionResolutionState] = useState<VoucherDeletionResolution>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_voucher_deletion_resolution`);
    return (saved as VoucherDeletionResolution) || 'cascade';
  });

  const setVoucherDeletionResolution = (resolution: VoucherDeletionResolution) => {
    setVoucherDeletionResolutionState(resolution);
    localStorage.setItem(`${STORAGE_KEY}_voucher_deletion_resolution`, resolution);
  };

  const [defaultLateFeeRate, setDefaultLateFeeRateState] = useState<number>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_default_late_fee_rate`);
    return saved ? Number(saved) : 500;
  });

  const setDefaultLateFeeRate = (rate: number) => {
    setDefaultLateFeeRateState(rate);
    localStorage.setItem(`${STORAGE_KEY}_default_late_fee_rate`, String(rate));
  };

  // Core domain state
  const [classes, setClasses] = useState<SchoolClass[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_classes`);
    return saved ? JSON.parse(saved) : INITIAL_CLASSES;
  });

  const [students, setStudents] = useState<Student[]>(() => {
    const savedStudents = localStorage.getItem(`${STORAGE_KEY}_students`);
    const rawStudents: Student[] = savedStudents ? JSON.parse(savedStudents) : INITIAL_STUDENTS;
    const savedFamilies = localStorage.getItem(`${STORAGE_KEY}_families`);
    const rawFamilies: Family[] = savedFamilies ? JSON.parse(savedFamilies) : INITIAL_FAMILIES;
    return reconcileFamiliesAndStudents(rawFamilies, rawStudents).students;
  });

  const [families, setFamilies] = useState<Family[]>(() => {
    const savedStudents = localStorage.getItem(`${STORAGE_KEY}_students`);
    const rawStudents: Student[] = savedStudents ? JSON.parse(savedStudents) : INITIAL_STUDENTS;
    const savedFamilies = localStorage.getItem(`${STORAGE_KEY}_families`);
    const rawFamilies: Family[] = savedFamilies ? JSON.parse(savedFamilies) : INITIAL_FAMILIES;
    return reconcileFamiliesAndStudents(rawFamilies, rawStudents).families;
  });

  // Loop-safe sequence counters for auto-generated codes (Reg #, Family #).
  // `useRef` initial values are only applied on the very first render, so these
  // start in sync with the students/families arrays computed above, then
  // increment independently of React's (batched, async) state updates.
  const studentSeqRef = useRef<number>(students.length);
  const familySeqRef = useRef<number>(families.length);

  // Monotonic counter backing generateUniqueId below. Guarantees uniqueness
  // even when several ids are minted within the same millisecond (e.g. a
  // bulk CSV import calling addStudent()/addFamily() in a synchronous loop),
  // where Date.now() alone can return an identical value on every call.
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

  const [buses, setBuses] = useState<TransportBus[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_buses`);
    return saved ? JSON.parse(saved) : INITIAL_BUSES;
  });

  const [stops, setStops] = useState<TransportStop[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_stops`);
    return saved ? JSON.parse(saved) : INITIAL_STOPS;
  });

  const [transportAssignments, setTransportAssignments] = useState<TransportAssignment[]>(() => {
    const savedStudents = localStorage.getItem(`${STORAGE_KEY}_students`);
    const rawStudents: Student[] = savedStudents ? JSON.parse(savedStudents) : INITIAL_STUDENTS;
    const studentIdSet = new Set(rawStudents.map((s) => s.id));

    const saved = localStorage.getItem(`${STORAGE_KEY}_assignments`);
    const rawAssignments: TransportAssignment[] = saved
      ? JSON.parse(saved)
      : [
          {
            id: 'asgn-0',
            studentId: 'stu-102',
            month: '2026-07',
            busId: 'bus-1',
            stopId: 'stop-2',
            tripType: 'RoundTrip',
            daysCharged: 31,
            discount: 200,
            active: true,
          },
          {
            id: 'asgn-0b',
            studentId: 'stu-104',
            month: '2026-07',
            busId: 'bus-2',
            stopId: 'stop-4',
            tripType: 'OneWay',
            daysCharged: 31,
            discount: 0,
            active: true,
          },
          {
            id: 'asgn-1',
            studentId: 'stu-101',
            month: '2026-08',
            busId: 'bus-1',
            stopId: 'stop-1',
            tripType: 'RoundTrip',
            daysCharged: 31,
            discount: 0,
            active: true,
          },
          {
            id: 'asgn-2',
            studentId: 'stu-103',
            month: '2026-08',
            busId: 'bus-2',
            stopId: 'stop-3',
            tripType: 'RoundTrip',
            daysCharged: 31,
            discount: 0,
            active: true,
          },
        ];
    return rawAssignments.filter((a) => studentIdSet.has(a.studentId));
  });

  const [templates, setTemplates] = useState<FeeTemplate[]>(() => {
    const savedStudents = localStorage.getItem(`${STORAGE_KEY}_students`);
    const rawStudents: Student[] = savedStudents ? JSON.parse(savedStudents) : INITIAL_STUDENTS;
    const studentIdSet = new Set(rawStudents.map((s) => s.id));

    const saved = localStorage.getItem(`${STORAGE_KEY}_templates`);
    const rawTpls: FeeTemplate[] = saved ? JSON.parse(saved) : INITIAL_GLOBAL_TEMPLATES;
    return rawTpls
      .filter((t) => !t.studentId || studentIdSet.has(t.studentId))
      .map((t) => {
        if (
          t.kind === 'Transport' &&
          (t.label === 'Transport' ||
            t.label === 'School Bus Transport Fee' ||
            /school bus/i.test(t.label) ||
            /transport charge/i.test(t.label))
        ) {
          return { ...t, label: 'Transport Fee' };
        }
        return t;
      });
  });

  const [vouchers, setVouchers] = useState<FeeVoucher[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_vouchers`);
    const rawVouchers: FeeVoucher[] = saved ? JSON.parse(saved) : INITIAL_VOUCHERS;
    return rawVouchers.map((v) => ({
      ...v,
      particulars: v.particulars.map((p) => {
        if (
          p.kind === 'Transport' ||
          /transport/i.test(p.label) ||
          /school bus/i.test(p.label)
        ) {
          return { ...p, kind: 'Transport' as const, label: 'Transport Fee' };
        }
        return p;
      }),
    }));
  });

  const [collections, setCollections] = useState<FeeCollection[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_collections`);
    return saved ? JSON.parse(saved) : INITIAL_COLLECTIONS;
  });

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

  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_transactions`);
    return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
  });

  const [institute, setInstitute] = useState<InstituteProfile>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_institute`);
    return saved ? JSON.parse(saved) : INITIAL_INSTITUTE;
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_banks`);
    return saved ? JSON.parse(saved) : INITIAL_BANK_ACCOUNTS;
  });

  // Sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_sidebar_collapsed`);
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_sidebar_collapsed`, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(users));
    localStorage.setItem(`${STORAGE_KEY}_classes`, JSON.stringify(classes));
    localStorage.setItem(`${STORAGE_KEY}_students`, JSON.stringify(students));
    localStorage.setItem(`${STORAGE_KEY}_families`, JSON.stringify(families));
    localStorage.setItem(`${STORAGE_KEY}_buses`, JSON.stringify(buses));
    localStorage.setItem(`${STORAGE_KEY}_stops`, JSON.stringify(stops));
    localStorage.setItem(`${STORAGE_KEY}_assignments`, JSON.stringify(transportAssignments));
    localStorage.setItem(`${STORAGE_KEY}_templates`, JSON.stringify(templates));
    localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(vouchers));
    localStorage.setItem(`${STORAGE_KEY}_collections`, JSON.stringify(collections));
    localStorage.setItem(`${STORAGE_KEY}_transactions`, JSON.stringify(transactions));
    localStorage.setItem(`${STORAGE_KEY}_institute`, JSON.stringify(institute));
    localStorage.setItem(`${STORAGE_KEY}_banks`, JSON.stringify(bankAccounts));
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
  ]);

  // Auth & Roles
  const login = (usernameOrEmail: string, password: string): { success: boolean; error?: string; user?: User } => {
    const trimmed = usernameOrEmail.trim().toLowerCase();
    if (!trimmed) {
      return { success: false, error: 'Please enter your username or registered email address.' };
    }
    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }

    const matchedUser = users.find(
      (u) =>
        u.username.toLowerCase() === trimmed ||
        (u.email && u.email.toLowerCase() === trimmed)
    );

    if (!matchedUser) {
      return {
        success: false,
        error: `User '${usernameOrEmail.trim()}' not found in authorization database. Please check username or email.`,
      };
    }

    // Password validation - match against stored user password or standard demo passwords
    const validPassword = matchedUser.password || 'password123';
    const isPasswordValid =
      password === validPassword ||
      password === 'password123' ||
      password === `${matchedUser.username}123` ||
      password === matchedUser.username;

    if (!isPasswordValid) {
      return {
        success: false,
        error: 'Invalid password. Please check your credentials and try again.',
      };
    }

    const updatedUser: User = {
      ...matchedUser,
      lastLogin: new Date().toISOString(),
    };

    setUsers((prev) => prev.map((u) => (u.id === matchedUser.id ? updatedUser : u)));
    setCurrentUser(updatedUser);
    setIsAuthenticated(true);
    localStorage.setItem(`${STORAGE_KEY}_auth_session`, JSON.stringify(updatedUser));

    return { success: true, user: updatedUser };
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(`${STORAGE_KEY}_auth_session`);
  };

  const switchRole = (role: UserRole) => {
    const found = users.find((u) => u.role === role) || SEEDED_USERS.find((u) => u.role === role);
    if (found) {
      setCurrentUser(found);
      if (isAuthenticated) {
        localStorage.setItem(`${STORAGE_KEY}_auth_session`, JSON.stringify(found));
      }
    }
  };

  const hasPermission = (permission: string) => {
    return currentUser?.permissions?.includes(permission) ?? true;
  };

  const addUser = (userData: Omit<User, 'id'>) => {
    if (!userData.username.trim()) return { success: false, error: 'Username is required.' };
    if (users.some((u) => u.username.toLowerCase() === userData.username.trim().toLowerCase())) {
      return { success: false, error: 'A user with this username already exists.' };
    }

    const newUser: User = {
      ...userData,
      id: `usr-${Date.now()}`,
      username: userData.username.trim(),
      name: userData.name.trim() || userData.username.trim(),
      password: userData.password || 'password123',
      permissions: userData.permissions || (
        userData.role === 'Admin'
          ? SEEDED_USERS[0].permissions
          : userData.role === 'Accountant'
          ? SEEDED_USERS[1].permissions
          : SEEDED_USERS[2].permissions
      ),
    };

    setUsers((prev) => [...prev, newUser]);
    return { success: true };
  };

  const updateUser = (id: string, updates: Partial<User>) => {
    if (updates.username) {
      const exists = users.some(
        (u) => u.id !== id && u.username.toLowerCase() === updates.username?.trim().toLowerCase()
      );
      if (exists) return { success: false, error: 'Username is already taken by another user.' };
    }

    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)));
    if (currentUser.id === id) {
      const updatedCurrent = { ...currentUser, ...updates };
      setCurrentUser(updatedCurrent);
      if (isAuthenticated) {
        localStorage.setItem(`${STORAGE_KEY}_auth_session`, JSON.stringify(updatedCurrent));
      }
    }
    return { success: true };
  };

  const deleteUser = (id: string) => {
    if (users.length <= 1) {
      return { success: false, error: 'Cannot delete the only remaining user in the system.' };
    }
    if (currentUser.id === id) {
      return { success: false, error: 'Cannot delete the currently logged in active user.' };
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    return { success: true };
  };

  // Class Management
  const addClass = (name: string, monthlyFee: number, sortOrder: number) => {
    if (!name.trim()) return { success: false, error: 'Class name is required.' };
    if (classes.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return { success: false, error: 'A class with this name already exists.' };
    }
    const newClass: SchoolClass = {
      id: `cls-${Date.now()}`,
      name: name.trim(),
      monthlyFee: roundChargeUp(monthlyFee),
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
    return { success: true };
  };

  const updateClass = (id: string, updates: Partial<SchoolClass>) => {
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
      monthlyFee: updates.monthlyFee !== undefined ? roundChargeUp(updates.monthlyFee) : current.monthlyFee,
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
    const enrolledStudents = students.filter((s) => s.classId === id && s.status === 'Active');
    if (enrolledStudents.length > 0) {
      return {
        success: false,
        error: `Cannot delete class. ${enrolledStudents.length} active students are currently enrolled. Reassign them first.`,
      };
    }
    setClasses((prev) => prev.filter((c) => c.id !== id));
    return { success: true };
  };

  const toggleClassActive = (id: string) => {
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
    const updated = reorderedClasses.map((cls, idx) => ({
      ...cls,
      sortOrder: idx + 1,
    }));
    setClasses(updated);
    return { success: true };
  };

  // Student Management
  const addStudent = (studentData: Omit<Student, 'id' | 'studentNo' | 'regNo' | 'createdDate'> & { regNo?: string; studentNo?: string }) => {
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

    // Auto family linking by Father CNIC (reads via refs so a family created
    // for an earlier row of the same bulk import is matched instead of
    // duplicated)
    let familyId = studentData.familyId;
    if (!familyId && studentData.fatherCnic?.trim()) {
      const existingFamily = familiesRef.current.find((f) => {
        const memberStudents = studentsRef.current.filter((s) => f.memberStudentIds.includes(s.id));
        return memberStudents.some((s) => s.fatherCnic === studentData.fatherCnic.trim());
      });
      if (existingFamily) {
        familyId = existingFamily.id;
      } else {
        // Create auto family
        // generateUniqueId (not `fam-${Date.now()}`) prevents collisions when
        // multiple new families are minted within the same millisecond, e.g.
        // several rows of a bulk CSV import each introducing a new father CNIC.
        const newFamId = generateUniqueId('fam');
        familySeqRef.current += 1;
        const newFamNo = `FAM${year}-${familySeqRef.current.toString().padStart(4, '0')}`;
        const newFam: Family = {
          id: newFamId,
          familyNo: newFamNo,
          headName: studentData.fatherName,
          contactPhone: studentData.fatherPhone,
          address: '',
          memberStudentIds: [],
        };
        setFamilies((prev) => [...prev, newFam]);
        familiesRef.current = [...familiesRef.current, newFam];
        familyId = newFamId;
      }
    }

    const newStudent: Student = {
      ...studentData,
      id: generateUniqueId('stu'),
      studentNo,
      regNo,
      monthlyDiscount: roundDiscountDown(studentData.monthlyDiscount || 0),
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

    return { success: true, student: newStudent };
  };

  const updateStudent = (id: string, updates: Partial<Student>) => {
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
    }

    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const updatedDiscount =
          updates.monthlyDiscount !== undefined
            ? roundDiscountDown(updates.monthlyDiscount)
            : s.monthlyDiscount;
        return {
          ...s,
          ...updates,
          familyId: newFamilyId,
          monthlyDiscount: updatedDiscount,
        };
      })
    );
    return { success: true };
  };

  const deleteStudent = (id: string) => {
    const studentVouchers = vouchers.filter((v) => v.studentId === id);
    if (studentVouchers.length > 0) {
      return {
        success: false,
        error: `Cannot delete student. ${studentVouchers.length} fee voucher records exist for this student. Delete vouchers first.`,
      };
    }

    setStudents((prev) => prev.filter((s) => s.id !== id));
    setFamilies((prev) =>
      prev.map((f) => ({ ...f, memberStudentIds: f.memberStudentIds.filter((mId) => mId !== id) }))
    );
    setTransportAssignments((prev) => prev.filter((a) => a.studentId !== id));
    setTemplates((prev) => prev.filter((t) => t.studentId !== id));
    return { success: true };
  };

  const bulkDeleteStudents = (ids: string[]) => {
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
    const year = new Date().getFullYear();
    familySeqRef.current += 1;
    const familyNo = `FAM${year}-${familySeqRef.current.toString().padStart(4, '0')}`;
    const newFamily: Family = {
      ...familyData,
      id: generateUniqueId('fam'),
      familyNo,
    };
    setFamilies((prev) => [...prev, newFamily]);
    return { success: true, family: newFamily };
  };

  const updateFamily = (id: string, updates: Partial<Family>) => {
    setFamilies((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
    return { success: true };
  };

  const deleteFamily = (id: string) => {
    const fam = families.find((f) => f.id === id);
    if (fam && fam.memberStudentIds.length > 0) {
      return {
        success: false,
        error: `Cannot delete family. It currently has ${fam.memberStudentIds.length} linked student members. Remove student members first.`,
      };
    }
    setFamilies((prev) => prev.filter((f) => f.id !== id));
    setStudents((prev) =>
      prev.map((s) => (s.familyId === id ? { ...s, familyId: undefined } : s))
    );
    return { success: true };
  };

  const addStudentToFamily = (familyId: string, studentId: string) => {
    // 1. Update student's familyId
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, familyId } : s))
    );
    // 2. Add to target family and remove from any previous family
    setFamilies((prev) =>
      prev.map((f) => {
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
      })
    );
  };

  const removeStudentFromFamily = (familyId: string, studentId: string) => {
    // 1. Unset student's familyId if it matches this family
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId && s.familyId === familyId ? { ...s, familyId: undefined } : s))
    );
    // 2. Remove student ID from this family
    setFamilies((prev) =>
      prev.map((f) =>
        f.id === familyId
          ? { ...f, memberStudentIds: f.memberStudentIds.filter((id) => id !== studentId) }
          : f
      )
    );
  };

  // Transport Management
  const addBus = (bus: Omit<TransportBus, 'id'>) => {
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
    const activeAssignments = transportAssignments.filter(
      (a) => a.busId === id && a.active && students.some((s) => s.id === a.studentId)
    );
    if (activeAssignments.length > 0) {
      return {
        success: false,
        error: `Cannot delete bus. ${activeAssignments.length} active student transport assignments refer to this bus.`,
      };
    }
    setBuses((prev) => prev.filter((b) => b.id !== id));
    return { success: true };
  };

  const reorderBuses = (reorderedBuses: TransportBus[]) => {
    const updated = reorderedBuses.map((bus, idx) => ({
      ...bus,
      sortOrder: idx + 1,
    }));
    setBuses(updated);
    return { success: true };
  };

  const addStop = (stop: Omit<TransportStop, 'id'>) => {
    if (stops.some((s) => s.name.toLowerCase() === stop.name.toLowerCase())) {
      return { success: false, error: 'Bus stop name already exists.' };
    }
    const newStop: TransportStop = {
      ...stop,
      id: `stop-${Date.now()}`,
      monthlyFare: roundBusFareUp(stop.monthlyFare),
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
      monthlyFare: updates.monthlyFare !== undefined ? roundBusFareUp(updates.monthlyFare) : current.monthlyFare,
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
    const activeAssignments = transportAssignments.filter(
      (a) => a.stopId === id && a.active && students.some((s) => s.id === a.studentId)
    );
    if (activeAssignments.length > 0) {
      return {
        success: false,
        error: `Cannot delete bus stop. ${activeAssignments.length} active student transport assignments refer to this stop.`,
      };
    }
    setStops((prev) => prev.filter((s) => s.id !== id));
    return { success: true };
  };

  const reorderStops = (reorderedStops: TransportStop[]) => {
    const updated = reorderedStops.map((stop, idx) => ({
      ...stop,
      sortOrder: idx + 1,
    }));
    setStops(updated);
    return { success: true };
  };

  const saveTransportAssignment = (
    assignment: Omit<TransportAssignment, 'id'> & { id?: string }
  ) => {
    if (assignment.id) {
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
      setTransportAssignments((prev) =>
        prev.map((a) => (a.id === existing.id ? { ...a, ...assignment } : a))
      );
    } else {
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
            id: `asgn-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          });
        }
      }
      return updated;
    });
    return { success: true, count: assignments.length };
  };

  const deleteTransportAssignment = (id: string) => {
    setTransportAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  const copyTransportAssignmentsFromPreviousMonth = (
    targetMonth: string,
    daysChargedOverride?: number
  ) => {
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
        id: `asgn-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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
    if (!targetMonth || !targetMonth.includes('-')) return { success: false, updatedCount: 0 };
    const [yStr, mStr] = targetMonth.split('-');
    const maxDays = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
    const clampedDays = Math.min(Math.max(daysCharged, 0), maxDays);

    let count = 0;
    setTransportAssignments((prev) =>
      prev.map((a) => {
        if (a.month === targetMonth) {
          count++;
          return { ...a, daysCharged: clampedDays };
        }
        return a;
      })
    );

    return { success: true, updatedCount: count };
  };

  // Fee Particular Templates
  const saveGlobalTemplate = (template: Omit<FeeTemplate, 'id'>) => {
    const existing = templates.find((t) => !t.studentId && !t.classId && t.kind === template.kind);
    if (existing) {
      setTemplates((prev) => prev.map((t) => (t.id === existing.id ? { ...t, ...template } : t)));
    } else {
      const newTpl: FeeTemplate = {
        ...template,
        id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        defaultAmount: roundChargeUp(template.defaultAmount),
      };
      setTemplates((prev) => [...prev, newTpl].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  };

  const updateGlobalTemplatesList = (newTemplates: FeeTemplate[]) => {
    setTemplates((prev) => {
      // Keep per-student and per-class overrides, replace global templates
      const nonGlobalOverrides = prev.filter((t) => !!t.studentId || !!t.classId);
      return [...newTemplates, ...nonGlobalOverrides];
    });
  };

  const saveStudentTemplateOverride = (
    studentId: string,
    kind: ParticularKind,
    label: string,
    amount: number,
    month?: string
  ) => {
    const existing = templates.find(
      (t) => t.studentId === studentId && t.kind === kind && (!month || !t.month || t.month === month)
    );
    if (existing) {
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === existing.id
            ? { ...t, label, defaultAmount: roundChargeUp(amount), month: month || t.month }
            : t
        )
      );
    } else {
      const newTpl: FeeTemplate = {
        id: `tpl-override-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        studentId,
        month,
        kind,
        label,
        defaultAmount: roundChargeUp(amount),
        sortOrder: 10,
      };
      setTemplates((prev) => [...prev, newTpl]);
    }
  };

  const saveClassTemplateOverrides = (
    classId: string,
    month: string,
    items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>
  ) => {
    setTemplates((prev) => {
      // Remove any existing overrides for this class for this month (or without month)
      const filtered = prev.filter(
        (t) => !(t.classId === classId && !t.studentId && (!t.month || t.month === month))
      );
      const newOverrides: FeeTemplate[] = items.map((item, idx) => ({
        id: `tpl-class-override-${classId}-${item.kind}-${month}-${Date.now()}-${idx}`,
        classId,
        month,
        kind: item.kind,
        label: item.label,
        defaultAmount: roundChargeUp(item.defaultAmount),
        sortOrder: item.sortOrder,
      }));
      return [...filtered, ...newOverrides];
    });
  };

  const deleteClassTemplates = (classId: string, month?: string) => {
    setTemplates((prev) =>
      prev.filter(
        (t) => !(t.classId === classId && !t.studentId && (!month || !t.month || t.month === month))
      )
    );
  };

  const saveStudentTemplateOverrides = (
    studentId: string,
    month: string,
    items: Array<{ kind: ParticularKind; label: string; defaultAmount: number; sortOrder: number }>
  ) => {
    setTemplates((prev) => {
      // Remove any existing overrides for this student for this month (or without month)
      const filtered = prev.filter(
        (t) => !(t.studentId === studentId && (!t.month || t.month === month))
      );
      const newOverrides: FeeTemplate[] = items.map((item, idx) => ({
        id: `tpl-override-${studentId}-${item.kind}-${month}-${Date.now()}-${idx}`,
        studentId,
        month,
        kind: item.kind,
        label: item.label,
        defaultAmount: roundChargeUp(item.defaultAmount),
        sortOrder: item.sortOrder,
      }));
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
    setTemplates((prev) => {
      const studentIdsSet = new Set(entries.map((e) => e.studentId));
      // Remove existing overrides for these students for this month (or without month)
      const filtered = prev.filter(
        (t) => !(t.studentId && studentIdsSet.has(t.studentId) && (!t.month || t.month === month))
      );
      const newOverrides: FeeTemplate[] = [];
      const timestamp = Date.now();
      entries.forEach(({ studentId, items }, sIdx) => {
        items.forEach((item, idx) => {
          newOverrides.push({
            id: `tpl-override-${studentId}-${item.kind}-${month}-${timestamp}-${sIdx}-${idx}`,
            studentId,
            month,
            kind: item.kind,
            label: item.label,
            defaultAmount: roundChargeUp(item.defaultAmount),
            sortOrder: item.sortOrder,
          });
        });
      });
      return [...filtered, ...newOverrides];
    });
  };

  const deleteStudentTemplates = (studentId: string, month?: string) => {
    setTemplates((prev) =>
      prev.filter(
        (t) => !(t.studentId === studentId && (!month || !t.month || t.month === month))
      )
    );
  };

  const resetAllTemplates = (month?: string) => {
    setTemplates((prev) => {
      if (month) {
        // Keep student overrides that are specifically for other months
        const remainingOtherMonthStudentOverrides = prev.filter(
          (t) => !!t.studentId && t.month && t.month !== month
        );
        return [...INITIAL_GLOBAL_TEMPLATES, ...remainingOtherMonthStudentOverrides];
      }
      return [...INITIAL_GLOBAL_TEMPLATES];
    });
  };

  const deleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  // Month Closure Check Helper
  const getMonthClosureStatus = (month: string): MonthClosureStatus => {
    const monthVouchers = vouchers.filter((v) => v.month === month);
    const totalVouchers = monthVouchers.length;

    // Uncarried unpaid vouchers are Issued or Partial vouchers that haven't been carried forward
    const uncarriedUnpaid = monthVouchers.filter(
      (v) => (v.status === 'Issued' || v.status === 'Partial') && v.amountPaid < v.netDue
    );

    const paidCount = monthVouchers.filter((v) => v.status === 'Paid').length;
    const carriedCount = monthVouchers.filter((v) => v.status === 'Carried').length;
    const reversedCount = monthVouchers.filter((v) => v.status === 'Reversed').length;

    // A month is closed if there are NO uncarried unpaid vouchers
    const isClosed = totalVouchers > 0 && uncarriedUnpaid.length === 0;

    return {
      month,
      isClosed,
      totalVouchers,
      uncarriedUnpaidCount: uncarriedUnpaid.length,
      paidCount,
      carriedCount,
      reversedCount,
    };
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
        skippedMonthRule
      );
    });

    return { previews, monthClosureBlocked, closureMessage };
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

    const defaultDueDate =
      dueDate || `${month}-${new Date(month + '-01').getDate() > 15 ? '20' : '15'}`;
    const issueDate = new Date().toISOString().split('T')[0];

    const yearStr = month.split('-')[0];
    let seqStart = vouchers.length + 1;

    const newVouchers: FeeVoucher[] = ungenerated.map((prev) => {
      const voucherNo = `FE${yearStr}-${seqStart.toString().padStart(6, '0')}`;
      seqStart++;

      return {
        id: `vch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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
        netDue: prev.netDue,
        amountPaid: 0,
        status: 'Issued',
        createdDate: issueDate,
      };
    });

    if (priorMonthRule === 'recalculate' && newVouchers.length > 0) {
      const affectedStudentIds = new Set(newVouchers.map((v) => v.studentId));

      setVouchers((prevVouchers) => {
        let allVouchers = [...prevVouchers, ...newVouchers];

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
              .filter((p) => p.amount > 0)
              .reduce((sum, p) => sum + p.amount, 0);

            const discountTotal = cleanParticulars
              .filter((p) => p.amount < 0 && p.kind === 'Discount')
              .reduce((sum, p) => sum + Math.abs(p.amount), 0);

            const netDue = Math.max(0, cleanParticulars.reduce((sum, p) => sum + p.amount, 0));

            let status = v.status;
            if (v.amountPaid >= netDue) {
              status = 'Paid';
            } else if (v.amountPaid > 0) {
              status = 'Partial';
            } else if (v.status === 'Carried') {
              status = 'Carried';
            } else {
              status = 'Issued';
            }

            const updatedVoucher: FeeVoucher = {
              ...v,
              particulars: cleanParticulars,
              grossTotal,
              discountTotal,
              prevBalance: newPrevBalance,
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
      setVouchers((prev) => [...prev, ...newVouchers]);
    }
    return { success: true, generatedCount: newVouchers.length };
  };

  // Update Voucher Particulars & Recalculate Totals
  const updateVoucherParticulars = (
    voucherId: string,
    updatedParticulars: VoucherItem[]
  ): { success: boolean; voucher?: FeeVoucher; error?: string } => {
    const voucher = vouchers.find((v) => v.id === voucherId);
    if (!voucher) return { success: false, error: 'Voucher not found' };

    const cleanParticulars = updatedParticulars.map((p) => ({
      ...p,
      amount: Number(p.amount) || 0,
    }));

    const grossTotal = cleanParticulars
      .filter((p) => p.amount > 0)
      .reduce((sum, p) => sum + p.amount, 0);

    const discountTotal = cleanParticulars
      .filter((p) => p.amount < 0 && p.kind === 'Discount')
      .reduce((sum, p) => sum + Math.abs(p.amount), 0);

    const netDue = Math.max(0, cleanParticulars.reduce((sum, p) => sum + p.amount, 0));

    let newStatus = voucher.status;
    if (voucher.amountPaid >= netDue && netDue > 0) {
      newStatus = 'Paid';
    } else if (voucher.amountPaid > 0) {
      newStatus = 'Partial';
    } else if (netDue === 0 && voucher.amountPaid === 0) {
      newStatus = 'Paid';
    } else {
      newStatus = 'Issued';
    }

    const updatedVoucher: FeeVoucher = {
      ...voucher,
      particulars: cleanParticulars,
      grossTotal,
      discountTotal,
      netDue,
      status: newStatus,
    };

    setVouchers((prev) => prev.map((v) => (v.id === voucherId ? updatedVoucher : v)));

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
    const voucher = vouchers.find((v) => v.id === voucherId);
    if (!voucher) return { success: false, error: 'Voucher not found' };
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
        .filter((p) => p.amount > 0)
        .reduce((sum, p) => sum + p.amount, 0);
      discountTotal = cleanParticulars
        .filter((p) => p.amount < 0 && p.kind === 'Discount')
        .reduce((sum, p) => sum + Math.abs(p.amount), 0);
      netDue = Math.max(0, cleanParticulars.reduce((sum, p) => sum + p.amount, 0));
    }

    const yearStr = new Date().getFullYear().toString();
    const colSeq = collections.length + 1;
    const txnSeq = transactions.length + 1;

    const collectionNo = `COL${yearStr}-${colSeq.toString().padStart(6, '0')}`;
    const txnNo = `TXN${yearStr}-${txnSeq.toString().padStart(6, '0')}`;

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

    const newTxn: PaymentTransaction = {
      id: `txn-${Date.now()}`,
      txnNo,
      collectionId,
      voucherId,
      studentId: voucher.studentId,
      month: voucher.month,
      amount,
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
    } else if (netDue === 0 && updatedPaid === 0) {
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
      paymentMode?: string;
      refNo?: string;
      date?: string;
    }[],
    month: string,
    defaultDate: string = new Date().toISOString().split('T')[0]
  ) => {
    let successCount = 0;
    const errors: string[] = [];

    const newTxns: PaymentTransaction[] = [];
    let batchTotal = 0;

    const yearStr = new Date().getFullYear().toString();
    const collectionId = `col-bulk-${Date.now()}`;
    const collectionNo = `COL${yearStr}-${(collections.length + 1).toString().padStart(6, '0')}`;

    const updatedVouchersMap = new Map<string, { paid: number; status: FeeVoucher['status'] }>();

    rows.forEach((row, idx) => {
      // Find voucher by voucherId, studentId, or by matching student's regNo in target month
      let voucher: FeeVoucher | undefined;
      let matchedStudent = students.find((s) => s.id === row.studentId);

      if (row.voucherId) {
        voucher = vouchers.find((v) => v.id === row.voucherId && v.status !== 'Reversed');
        if (voucher && !matchedStudent) {
          matchedStudent = students.find((s) => s.id === voucher.studentId);
        }
      } else if (row.studentId) {
        voucher = vouchers.find(
          (v) => v.studentId === row.studentId && v.month === month && v.status !== 'Reversed'
        );
      } else {
        const cleanReg = (row.regNo || row.identifier || '').trim().toLowerCase();
        matchedStudent = students.find(
          (s) =>
            s.regNo.trim().toLowerCase() === cleanReg ||
            s.studentNo.trim().toLowerCase() === cleanReg
        );

        if (matchedStudent) {
          voucher = vouchers.find(
            (v) => v.studentId === matchedStudent.id && v.month === month && v.status !== 'Reversed'
          );
        }
      }

      if (!voucher) {
        const regDisplay = row.regNo || row.identifier || (matchedStudent ? matchedStudent.regNo : 'Unknown');
        if (matchedStudent) {
          errors.push(
            `Row ${idx + 1}: No active fee voucher found for student ${matchedStudent.name} (Reg # ${regDisplay}) in month ${month}.`
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

      const mode: PaymentTransaction['paymentMode'] =
        (row.paymentMode as any) === 'BankTransfer' || (row.paymentMode as any) === 'Cheque' || (row.paymentMode as any) === 'Online'
          ? (row.paymentMode as any)
          : 'BankTransfer';

      const currentPaid = updatedVouchersMap.get(voucher.id)?.paid ?? voucher.amountPaid;
      const newPaid = currentPaid + row.amount;

      let newStatus: FeeVoucher['status'] = voucher.status;
      if (newPaid >= voucher.netDue) {
        newStatus = 'Paid';
      } else if (newPaid > 0) {
        newStatus = 'Partial';
      }

      updatedVouchersMap.set(voucher.id, { paid: newPaid, status: newStatus });

      const txnNo = `TXN${yearStr}-${(transactions.length + newTxns.length + 1)
        .toString()
        .padStart(6, '0')}`;

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
          return upd ? { ...v, amountPaid: upd.paid, status: upd.status } : v;
        })
      );
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

    if (voucher.status === 'Paid' || voucher.status === 'Carried') {
      return { success: false, error: `Voucher is already in '${voucher.status}' status.` };
    }

    const outstandingBalance = voucher.netDue - voucher.amountPaid;
    if (outstandingBalance <= 0) {
      return { success: false, error: 'Voucher has no outstanding balance to carry forward.' };
    }

    const fineAmountToApply = addLateFine
      ? (customFineAmount !== undefined ? customFineAmount : (voucher.lateFeeRate || defaultLateFeeRate))
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

    // Check if target month voucher already exists for this student
    const existingTargetVoucher = updatedList.find(
      (v) => v.studentId === voucher.studentId && v.month === targetMonth && v.status !== 'Reversed'
    );

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
        .filter((p) => p.amount > 0)
        .reduce((sum, p) => sum + p.amount, 0);

      const discountTotal = targetParticulars
        .filter((p) => p.amount < 0 && p.kind === 'Discount')
        .reduce((sum, p) => sum + Math.abs(p.amount), 0);

      const netDue = Math.max(0, targetParticulars.reduce((sum, p) => sum + p.amount, 0));

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
        netDue,
        status: targetStatus,
      };

      const targetIdx = updatedList.findIndex((item) => item.id === existingTargetVoucher.id);
      if (targetIdx !== -1) {
        updatedList[targetIdx] = updatedTargetVoucher;
      }

      updatedList = recalculateVouchersSequence(updatedList, [voucher.studentId]);
    }

    vouchersRef.current = updatedList;
    setVouchers(updatedList);

    return { success: true };
  };

  const bulkCarryForwardDefaulters = (
    voucherIds: string[],
    targetMonth: string,
    addLateFine: boolean,
    customFineAmount?: number,
    perVoucherFines?: Record<string, number>
  ) => {
    let successCount = 0;
    voucherIds.forEach((vId) => {
      const fineToUse = perVoucherFines?.[vId] ?? customFineAmount;
      const res = carryForwardDefaulter(vId, targetMonth, addLateFine, fineToUse);
      if (res.success) successCount++;
    });
    return { successCount };
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

        if (idx > 0) {
          const prevVoucher = studentVouchers[idx - 1];
          if (
            prevVoucher.status === 'Carried' ||
            prevVoucher.status === 'Issued' ||
            prevVoucher.status === 'Partial'
          ) {
            newPrevBalance = Math.max(0, prevVoucher.netDue - prevVoucher.amountPaid);
            if (prevVoucher.status === 'Carried' && prevVoucher.carriedLateFine && prevVoucher.carriedLateFine > 0) {
              carriedFine = prevVoucher.carriedLateFine;
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
          .filter((p) => p.amount > 0)
          .reduce((sum, p) => sum + p.amount, 0);

        const discountTotal = cleanParticulars
          .filter((p) => p.amount < 0 && p.kind === 'Discount')
          .reduce((sum, p) => sum + Math.abs(p.amount), 0);

        const netDue = Math.max(0, cleanParticulars.reduce((sum, p) => sum + p.amount, 0));

        let status = v.status;
        if (v.amountPaid >= netDue) {
          status = 'Paid';
        } else if (v.amountPaid > 0) {
          status = 'Partial';
        } else if (v.status === 'Carried') {
          status = 'Carried';
        } else {
          status = 'Issued';
        }

        const updatedVoucher: FeeVoucher = {
          ...v,
          particulars: cleanParticulars,
          grossTotal,
          discountTotal,
          prevBalance: newPrevBalance,
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

    if (voucherTxns.length > 0 && force) {
      const colIds = [...new Set(voucherTxns.map((t) => t.collectionId))];
      setTransactions((prev) => prev.filter((t) => !idsToDelete.includes(t.voucherId)));

      setCollections((prev) =>
        prev
          .map((c) => {
            if (colIds.includes(c.id)) {
              const remainingTxns = transactions.filter(
                (t) => t.collectionId === c.id && !idsToDelete.includes(t.voucherId)
              );
              const newTotal = remainingTxns.reduce((sum, t) => sum + t.amount, 0);
              return {
                ...c,
                totalAmount: newTotal,
                transactionCount: remainingTxns.length,
              };
            }
            return c;
          })
          .filter((c) => c.transactionCount > 0)
      );
    }

    setVouchers((prev) => {
      let remaining = prev.filter((v) => !idsToDelete.includes(v.id));
      if (effectiveMode === 'auto-heal') {
        remaining = recalculateVouchersSequence(remaining, affectedStudentIds);
      }
      return remaining;
    });

    return { success: true, deletedCount: idsToDelete.length };
  };

  const bulkDeleteVouchers = (
    ids: string[],
    force: boolean = false,
    mode?: VoucherDeletionResolution
  ) => {
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

    if (voucherTxns.length > 0 && force) {
      const colIds = [...new Set(voucherTxns.map((t) => t.collectionId))];
      setTransactions((prev) => prev.filter((t) => !idsToDelete.includes(t.voucherId)));

      setCollections((prev) =>
        prev
          .map((c) => {
            if (colIds.includes(c.id)) {
              const remainingTxns = transactions.filter(
                (t) => t.collectionId === c.id && !idsToDelete.includes(t.voucherId)
              );
              const newTotal = remainingTxns.reduce((sum, t) => sum + t.amount, 0);
              return {
                ...c,
                totalAmount: newTotal,
                transactionCount: remainingTxns.length,
              };
            }
            return c;
          })
          .filter((c) => c.transactionCount > 0)
      );
    }

    setVouchers((prev) => {
      let remaining = prev.filter((v) => !idsToDelete.includes(v.id));
      if (effectiveMode === 'auto-heal') {
        remaining = recalculateVouchersSequence(remaining, affectedStudentIds);
      }
      return remaining;
    });

    return { success: true, deletedCount: idsToDelete.length };
  };

  // Collections Ledger Delete
  const deleteCollection = (id: string) => {
    const colTxns = transactions.filter((t) => t.collectionId === id);

    // Group deductions per voucher
    const deductions = new Map<string, number>();
    colTxns.forEach((t) => {
      deductions.set(t.voucherId, (deductions.get(t.voucherId) || 0) + t.amount);
    });

    setCollections((prev) => prev.filter((c) => c.id !== id));
    setTransactions((prev) => prev.filter((t) => t.collectionId !== id));

    // Recalculate vouchers
    setVouchers((prev) =>
      prev.map((v) => {
        const deduct = deductions.get(v.id);
        if (!deduct) return v;
        const newPaid = Math.max(0, v.amountPaid - deduct);
        let newStatus = v.status;
        if (newStatus === 'Paid' || newStatus === 'Partial') {
          if (newPaid >= v.netDue) {
            newStatus = 'Paid';
          } else if (newPaid > 0) {
            newStatus = 'Partial';
          } else {
            newStatus = 'Issued';
          }
        }
        return { ...v, amountPaid: newPaid, status: newStatus };
      })
    );
  };

  // Settings
  const updateInstitute = (updates: Partial<InstituteProfile>) => {
    setInstitute((prev) => ({ ...prev, ...updates }));
  };

  const addBankAccount = (bank: Omit<BankAccount, 'id'>) => {
    const newBank: BankAccount = { ...bank, id: `bank-${Date.now()}` };
    if (newBank.isDefault) {
      setBankAccounts((prev) => prev.map((b) => ({ ...b, isDefault: false })).concat(newBank));
    } else {
      setBankAccounts((prev) => [...prev, newBank]);
    }
  };

  const updateBankAccount = (id: string, updates: Partial<BankAccount>) => {
    if (updates.isDefault) {
      setBankAccounts((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...updates, isDefault: true } : { ...b, isDefault: false }))
      );
    } else {
      setBankAccounts((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
    }
  };

  const deleteBankAccount = (id: string) => {
    setBankAccounts((prev) => prev.filter((b) => b.id !== id));
  };

  const setDefaultBankAccount = (id: string) => {
    setBankAccounts((prev) => prev.map((b) => ({ ...b, isDefault: b.id === id })));
  };

  // Reset Demo Data
  const resetToDemoData = () => {
    localStorage.clear();
    const synced = reconcileFamiliesAndStudents(INITIAL_FAMILIES, INITIAL_STUDENTS);
    setClasses(INITIAL_CLASSES);
    setStudents(synced.students);
    setFamilies(synced.families);
    setBuses(INITIAL_BUSES);
    setStops(INITIAL_STOPS);
    setTemplates(INITIAL_GLOBAL_TEMPLATES);
    setVouchers(INITIAL_VOUCHERS);
    setCollections(INITIAL_COLLECTIONS);
    setTransactions(INITIAL_TRANSACTIONS);
    setInstitute(INITIAL_INSTITUTE);
    setBankAccounts(INITIAL_BANK_ACCOUNTS);
    setActiveMonth('2026-08');
  };

  // Selection-based database cleanup with cascading integrity awareness
  const cleanupDatabaseTables = (options: DataCleanupOptions): CleanupResult => {
    const clearedTables: string[] = [];
    let recordsClearedCount = 0;

    // 1. Students
    if (options.students) {
      recordsClearedCount += students.length;
      setStudents([]);
      localStorage.setItem(`${STORAGE_KEY}_students`, JSON.stringify([]));
      // Remove student members from families
      setFamilies((prev) => prev.map((f) => ({ ...f, memberStudentIds: [] })));
      // Clear transport assignments for students
      setTransportAssignments([]);
      localStorage.setItem(`${STORAGE_KEY}_assignments`, JSON.stringify([]));
      // Clear student fee template overrides
      setTemplates((prev) => prev.filter((t) => !t.studentId));
      clearedTables.push(`Students & Profiles (${students.length} records)`);
    }

    // 2. Fee Vouchers
    if (options.vouchers) {
      recordsClearedCount += vouchers.length;
      setVouchers([]);
      localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify([]));
      clearedTables.push(`Fee Vouchers (${vouchers.length} records)`);
    }

    // 3. Fee Collections & Payment Transactions
    if (options.collections) {
      const collCount = collections.length + transactions.length;
      recordsClearedCount += collCount;
      setCollections([]);
      setTransactions([]);
      localStorage.setItem(`${STORAGE_KEY}_collections`, JSON.stringify([]));
      localStorage.setItem(`${STORAGE_KEY}_transactions`, JSON.stringify([]));
      clearedTables.push(`Collections & Transactions (${collCount} records)`);
    }

    // 4. Classes
    if (options.classes) {
      recordsClearedCount += classes.length;
      setClasses([]);
      localStorage.setItem(`${STORAGE_KEY}_classes`, JSON.stringify([]));
      // Clear class fee template overrides
      setTemplates((prev) => prev.filter((t) => !t.classId));
      clearedTables.push(`Classes & Sections (${classes.length} records)`);
    }

    // 5. Families
    if (options.families) {
      recordsClearedCount += families.length;
      setFamilies([]);
      localStorage.setItem(`${STORAGE_KEY}_families`, JSON.stringify([]));
      // Remove familyId links from students if students were not already wiped
      if (!options.students) {
        setStudents((prev) => prev.map((s) => ({ ...s, familyId: undefined })));
      }
      clearedTables.push(`Families & Guardians (${families.length} records)`);
    }

    // 6. Fee Templates & Overrides
    if (options.templates) {
      const overrideCount = templates.filter((t) => !!t.studentId || !!t.classId).length;
      recordsClearedCount += (overrideCount || templates.length);
      setTemplates(INITIAL_GLOBAL_TEMPLATES);
      localStorage.setItem(`${STORAGE_KEY}_templates`, JSON.stringify(INITIAL_GLOBAL_TEMPLATES));
      clearedTables.push(`Fee Particular Templates (Reset to standard 9-item baseline)`);
    }

    // 7. Granular Transport Cleanup & Complete Transport Wipe
    const isFullTransportWipe = Boolean(options.transport);

    // 7a. Student Transport Assignments (only count if students table not already wiping assignments)
    if ((options.transportAssignments || isFullTransportWipe) && !options.students) {
      recordsClearedCount += transportAssignments.length;
      setTransportAssignments([]);
      localStorage.setItem(`${STORAGE_KEY}_assignments`, JSON.stringify([]));
      if (!isFullTransportWipe) {
        clearedTables.push(`Student Transport Assignments (${transportAssignments.length} records)`);
      }
    }

    // 7b. Bus Stops & Monthly Fare Rates
    if (options.transportStops || isFullTransportWipe) {
      recordsClearedCount += stops.length;
      setStops([]);
      localStorage.setItem(`${STORAGE_KEY}_stops`, JSON.stringify([]));
      if (!isFullTransportWipe) {
        clearedTables.push(`Bus Stops & Fare Rates (${stops.length} stops)`);
      }
    }

    // 7c. Buses Fleet Directory
    if (options.transportBuses || isFullTransportWipe) {
      recordsClearedCount += buses.length;
      setBuses([]);
      localStorage.setItem(`${STORAGE_KEY}_buses`, JSON.stringify([]));
      if (!isFullTransportWipe) {
        clearedTables.push(`Buses Fleet Directory (${buses.length} buses)`);
      }
    }

    if (isFullTransportWipe) {
      const transCount = buses.length + stops.length + (!options.students ? transportAssignments.length : 0);
      clearedTables.push(`Complete Transport System (${transCount} buses, stops & assignments)`);
    }

    // 8. Bank Accounts
    if (options.bankAccounts) {
      recordsClearedCount += bankAccounts.length;
      setBankAccounts([]);
      localStorage.setItem(`${STORAGE_KEY}_banks`, JSON.stringify([]));
      clearedTables.push(`Bank Accounts (${bankAccounts.length} accounts)`);
    }

    // 9. Secondary Users (keep currently logged-in user safe)
    if (options.users) {
      const secondaryUsers = users.filter((u) => u.id !== currentUser.id);
      recordsClearedCount += secondaryUsers.length;
      const preserved = users.filter((u) => u.id === currentUser.id);
      setUsers(preserved);
      localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(preserved));
      clearedTables.push(`Secondary Users (${secondaryUsers.length} users removed, current session preserved)`);
    }

    return {
      success: true,
      clearedTables,
      recordsClearedCount,
    };
  };

  // Toast System
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

  return (
    <AppContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        users,
        login,
        logout,
        switchRole,
        hasPermission,
        addUser,
        updateUser,
        deleteUser,
        activeMonth,
        setActiveMonth,
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
        saveTransportAssignment,
        bulkSaveTransportAssignments,
        deleteTransportAssignment,
        copyTransportAssignmentsFromPreviousMonth,
        bulkUpdateTransportDaysForMonth,
        templates,
        saveGlobalTemplate,
        updateGlobalTemplatesList,
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
        collectVoucherPayment,
        updateVoucherParticulars,
        bulkCsvCollection,
        carryForwardDefaulter,
        bulkCarryForwardDefaulters,
        getDownstreamVouchersInfo,
        deleteVoucher,
        bulkDeleteVouchers,
        collections,
        transactions,
        deleteCollection,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        priorMonthRule,
        setPriorMonthRule,
        skippedMonthRule,
        setSkippedMonthRule,
        voucherDeletionResolution,
        setVoucherDeletionResolution,
        defaultLateFeeRate,
        setDefaultLateFeeRate,
        institute,
        updateInstitute,
        bankAccounts,
        addBankAccount,
        updateBankAccount,
        deleteBankAccount,
        setDefaultBankAccount,
        getMonthClosureStatus,
        resetToDemoData,
        cleanupDatabaseTables,
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