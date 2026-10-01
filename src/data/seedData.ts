import {
  BankAccount,
  Class,
  Family,
  FeeCollection,
  FeeTemplate,
  FeeVoucher,
  InstituteProfile,
  PaymentTransaction,
  Student,
  TransportBus,
  TransportStop,
  User,
} from '../types';

export function createDefaultGlobalTemplates(): FeeTemplate[] {
  return [
    { id: 'tmpl-fine', kind: 'Fine', label: 'Late Fine', defaultAmount: 100, sortOrder: 1 },
    { id: 'tmpl-flex1', kind: 'Flex1', label: 'Admission Fee', defaultAmount: 5000, sortOrder: 2 },
    { id: 'tmpl-flex2', kind: 'Flex2', label: 'Annual Charges', defaultAmount: 2500, sortOrder: 3 },
    { id: 'tmpl-flex3', kind: 'Flex3', label: 'Examination Fee', defaultAmount: 1500, sortOrder: 4 },
    { id: 'tmpl-flex4', kind: 'Flex4', label: 'Miscellaneous', defaultAmount: 500, sortOrder: 5 },
  ];
}

export const INITIAL_GLOBAL_TEMPLATES: FeeTemplate[] = createDefaultGlobalTemplates();

export const INITIAL_INSTITUTE: InstituteProfile = {
  name: 'Default Grammar School',
  logoUrl: '',
  address: '123 Education Street, Lahore, Pakistan',
  phone: '+92 42 1234567',
  email: 'admin@school.edu.pk',
  website: 'www.school.edu.pk',
  regNo: 'DGS-7890',
  sessionTimeoutMinutes: 15,
  settings: {
    priorMonthRule: 'recalculate',
    skippedMonthRule: 'allow',
    voucherDeletionResolution: 'auto-heal',
    defaultLateFeeRate: 100,
    roundingMultiple: 10,
    roundingEnabled: true,
    transportRoundingMultiple: 10,
    defaultDueDateEnabled: true,
    defaultDueDay: 10,
  },
};

export const INITIAL_CLASSES: Class[] = [];
export const INITIAL_STUDENTS: Student[] = [];
export const INITIAL_FAMILIES: Family[] = [];
export const INITIAL_BUSES: TransportBus[] = [];
export const INITIAL_STOPS: TransportStop[] = [];
export const INITIAL_VOUCHERS: FeeVoucher[] = [];
export const INITIAL_COLLECTIONS: FeeCollection[] = [];
export const INITIAL_TRANSACTIONS: PaymentTransaction[] = [];
export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [];
export const INITIAL_STUDENT_ACCOUNT_HISTORY: any[] = [];
export const SEEDED_USERS: User[] = [];
export const INITIAL_AUDIT_LOGS: any[] = [];
