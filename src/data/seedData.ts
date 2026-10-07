import {
  AuditLogEntry,
  BankAccount,
  Family,
  FeeCollection,
  FeeTemplate,
  FeeVoucher,
  InstituteProfile,
  PaymentTransaction,
  SchoolClass,
  Student,
  StudentAccountHistoryEntry,
  TransportBus,
  TransportStop,
  User,
} from '../types';

/**
 * Production Initial State Provider
 * Clean, production-ready defaults with zero hardcoded credentials, mock entities, or branding.
 */

// Production Release: No seeded user accounts. Users register institution workspaces or join via operator invites.
export const SEEDED_USERS: User[] = [];

// Production Release: Clean, unconfigured institutional profile template.
export const INITIAL_INSTITUTE: InstituteProfile = {
  name: '',
  logoUrl: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  regNo: '',
  currency: 'USD',
  sessionTimeoutMinutes: 10,
};

// Production Release: Clean, empty bank accounts list. Institutions configure their own banks in Settings.
export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [];

// Production Release: Clean, empty academic and transport structures.
export const INITIAL_CLASSES: SchoolClass[] = [];
export const INITIAL_BUSES: TransportBus[] = [];
export const INITIAL_STOPS: TransportStop[] = [];

// Production Release: Standard 9-category fee particulars schema with default zero balances.
export function createDefaultGlobalTemplates(institutionId?: string): FeeTemplate[] {
  const prefix = institutionId ? `${institutionId}_` : '';
  return [
    { id: `${prefix}tpl_1`, kind: 'Tuition', label: 'Tuition Fee', defaultAmount: 0, sortOrder: 1 },
    { id: `${prefix}tpl_2`, kind: 'Flex1', label: 'Admission Fee', defaultAmount: 0, sortOrder: 2 },
    { id: `${prefix}tpl_3`, kind: 'Flex2', label: 'Registration Fee', defaultAmount: 0, sortOrder: 3 },
    { id: `${prefix}tpl_4`, kind: 'Transport', label: 'Transport Fee', defaultAmount: 0, sortOrder: 4 },
    { id: `${prefix}tpl_5`, kind: 'Fine', label: 'Fine', defaultAmount: 0, sortOrder: 5 },
    { id: `${prefix}tpl_6`, kind: 'Flex3', label: 'Exam Fee', defaultAmount: 0, sortOrder: 6 },
    { id: `${prefix}tpl_7`, kind: 'Flex4', label: 'Other', defaultAmount: 0, sortOrder: 7 },
    { id: `${prefix}tpl_8`, kind: 'PreviousBalance', label: 'Previous Balance', defaultAmount: 0, sortOrder: 8 },
    { id: `${prefix}tpl_9`, kind: 'Discount', label: 'Discount in Fee', defaultAmount: 0, sortOrder: 9 },
  ];
}

export const INITIAL_GLOBAL_TEMPLATES: FeeTemplate[] = createDefaultGlobalTemplates();

// Production Release: Clean, empty rosters and financial ledgers.
export const INITIAL_FAMILIES: Family[] = [];
export const INITIAL_STUDENTS: Student[] = [];
export const INITIAL_VOUCHERS: FeeVoucher[] = [];
export const INITIAL_COLLECTIONS: FeeCollection[] = [];
export const INITIAL_TRANSACTIONS: PaymentTransaction[] = [];
export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [];
export const INITIAL_STUDENT_ACCOUNT_HISTORY: StudentAccountHistoryEntry[] = [];
