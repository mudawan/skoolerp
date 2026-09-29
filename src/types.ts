export type UserRole = 'Admin' | 'Accountant' | 'Viewer' | 'Custom';

export type PermissionCategory =
  | 'dashboard'
  | 'students'
  | 'families'
  | 'classes'
  | 'fees'
  | 'collections'
  | 'defaulters'
  | 'transport'
  | 'reports'
  | 'settings'
  | 'users'
  | 'system';

export interface PermissionDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  category: PermissionCategory;
  categoryLabel: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface PermissionCategoryInfo {
  id: PermissionCategory;
  label: string;
  description: string;
}

export interface Institution {
  id: string;
  name: string;
  code: string; // unique shortcode e.g. "DPS-101"
  registrationNo?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  logoUrl?: string;
  settings?: any;
  status: 'active' | 'suspended' | 'trial';
  createdAt: string;
  updatedAt?: string;
}

export interface OperatorInvite {
  id: string;
  institutionId: string;
  institutionName?: string;
  institutionCode?: string;
  inviteCode: string; // e.g. "INV-7K4QF-M2XHD"
  fullName: string;
  assignedRole: UserRole;
  permissions?: string[];
  expiresAt: string;
  status: 'pending' | 'claimed' | 'expired';
  createdBy: string;
  createdAt: string;
}

export interface User {
  id: string;
  institutionId?: string;
  institutionName?: string;
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  permissions: string[];
  email?: string;
  avatarUrl?: string;
  lastLogin?: string;
  status?: 'active' | 'invited' | 'deactivated';
}

export interface SchoolClass {
  id: string;
  name: string;
  monthlyFee: number;
  sortOrder: number;
  active: boolean;
  studentCount?: number;
}

export type StudentStatus = 'Active' | 'Inactive' | 'AutoDeactivated' | 'Withdrawn' | 'Graduated';

export interface StudentDocument {
  name: string;
  fileData?: string; // Base64 data URL or external URL
  fileType?: string;
  fileSize?: string;
  uploadDate?: string;
}

export interface Student {
  id: string;
  studentNo: string;
  regNo: string;
  name: string;
  admissionDate?: string; // 1. Date of Admission (required in form)
  firstBillingMonth?: string; // 1. First Fee Billing Month (YYYY-MM) - Voucher generation starts from this month
  classId: string; // 1. Class
  monthlyDiscount: number; // 1. Discount in Fee (required)
  mobileNumber?: string; // 1. Student Mobile Number
  notes?: string; // 1. Other Notes
  photoUrl?: string; // 1. Picture

  // 2. Other Information
  dob: string; // Date of Birth
  gender?: 'Male' | 'Female' | ''; // Gender
  bFormNo?: string; // Student CNIC / Birth Form ID
  familyId?: string; // Family
  address?: string; // Address

  // 3. Father’s/ Guardian’s Information
  fatherName: string; // Father Name
  fatherCnic: string; // Father’s CNIC
  fatherPhone: string; // Mobile No
  fatherOccupation?: string; // Optional occupation

  // 4. Mother’s Information
  motherName: string; // Mother Name
  motherCnic?: string; // Mother’s CNIC
  motherPhone: string; // Mobile No

  // 5. Documents Upload
  document1?: StudentDocument;
  document2?: StudentDocument;
  document3?: StudentDocument;

  status: StudentStatus;
  createdDate: string;
}

export interface Family {
  id: string;
  familyNo: string;
  headName: string;
  contactPhone: string;
  fatherCnic?: string;
  address: string;
  notes?: string;
  memberStudentIds: string[];
}

export interface TransportBus {
  id: string;
  busNumber: string;
  model: string;
  regNumber: string;
  driverName: string;
  driverPhone: string;
  routeName: string;
  active: boolean;
  sortOrder: number;
}

export interface TransportStop {
  id: string;
  name: string;
  area: string;
  landmark: string;
  monthlyFare: number;
  sortOrder: number;
}

export interface TransportAssignment {
  id: string;
  studentId: string;
  month: string; // YYYY-MM
  busId: string;
  stopId: string;
  tripType: 'RoundTrip' | 'OneWay';
  daysCharged: number;
  discount: number;
  active: boolean;
}

export type ParticularKind =
  | 'Tuition'
  | 'Transport'
  | 'Flex1'
  | 'Flex2'
  | 'Flex3'
  | 'Flex4'
  | 'Discount'
  | 'PreviousBalance'
  | 'Fine';

export interface FeeTemplate {
  id: string;
  kind: ParticularKind;
  label: string;
  defaultAmount: number;
  sortOrder: number;
  classId?: string; // If set without studentId, this is a per-class override (Class Level)
  studentId?: string; // If set, this is a per-student override (Student Level - highest precedence)
  month?: string; // Optional working month (e.g. '2026-08') for month-scoped overrides
}

export interface VoucherItem {
  kind: ParticularKind;
  label: string;
  amount: number; // Positive for charges, negative for discounts/advances
}

export type VoucherStatus = 'Issued' | 'Partial' | 'Paid' | 'Carried' | 'Reversed';

export interface FeeVoucher {
  id: string;
  voucherNo: string; // e.g. FE2026-000001
  studentId: string;
  month: string; // YYYY-MM
  classId: string;
  issueDate: string;
  dueDate: string;
  particulars: VoucherItem[];
  grossTotal: number;
  discountTotal: number;
  prevBalance: number; // Can be negative if student has advance
  lateFeeRate: number; // e.g. 200 / 500
  roundingMultiple?: number; // The "round net due up to nearest multiple" setting used when this voucher's netDue was computed
  netDue: number;
  amountPaid: number;
  status: VoucherStatus;
  voucherType?: 'Monthly' | 'Admission'; // 'Admission' = one-time pre-billing-start voucher
  carryForwardMonth?: string;
  carriedLateFine?: number; // Late fine amount applied at carry forward to be charged in targetMonth
  notes?: string;
  createdDate: string;
}

export type PaymentMode = 'Cash' | 'BankTransfer' | 'Cheque' | 'Online';

export interface PaymentTransaction {
  id: string;
  txnNo: string; // TXN2026-000001
  collectionId: string;
  voucherId: string;
  studentId: string;
  month: string;
  amount: number;
  fineAdded?: number;
  paymentMode: PaymentMode;
  referenceNo?: string;
  notes?: string;
  date: string;
}

export interface FeeCollection {
  id: string;
  collectionNo: string; // COL2026-000001
  date: string;
  totalAmount: number;
  transactionCount: number;
  notes?: string;
  isBulkImport?: boolean;
}

export interface InstituteProfile {
  name: string;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  regNo: string;
  sessionTimeoutMinutes?: number; // Inactivity auto-logout timeout in minutes (Default: 10)
  settings?: Record<string, any>;
}

export interface BankAccount {
  id: string;
  bankName: string;
  title: string;
  accountNumber: string;
  branchCode: string;
  instructionsLtr?: string; // English / Left-to-Right reading instructions
  instructionsRtl?: string; // Urdu / Right-to-Left reading instructions
  instructionsLine1: string;
  instructionsLine2: string;
  logoUrl?: string;
  active: boolean;
  isDefault: boolean;
}

export interface MonthClosureStatus {
  month: string; // YYYY-MM
  isClosed: boolean;
  isLocked?: boolean;
  totalVouchers: number;
  uncarriedUnpaidCount: number;
  paidCount: number;
  carriedCount: number;
  reversedCount: number;
}

export type ActiveTab =
  | 'dashboard'
  | 'students'
  | 'families'
  | 'classes'
  | 'vouchers'
  | 'collections'
  | 'defaulters'
  | 'monthEnd'
  | 'policies'
  | 'templates'
  | 'transport'
  | 'reports'
  | 'audit'
  | 'settings'
  | 'profile'
  | 'banks'
  | 'users'
  | 'appearance'
  | 'database'
  | 'cleanup';

export type ThemeColor = 'teal' | 'navy' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
export type SidebarTheme = 'dark' | 'light' | 'branded';

export interface AppThemeConfig {
  color: ThemeColor;
  sidebarTheme: SidebarTheme;
}

export type PriorMonthVoucherRule = 'strict' | 'warning' | 'recalculate';
export type SkippedMonthVoucherRule = 'strict' | 'warning' | 'allow';
export type VoucherDeletionResolution = 'auto-heal' | 'cascade' | 'manual';
export type VoucherCopyType = 'bank' | 'institute' | 'student';

export interface DataCleanupOptions {
  students?: boolean;
  vouchers?: boolean;
  collections?: boolean;
  classes?: boolean;
  families?: boolean;
  templates?: boolean;
  transport?: boolean;
  transportAssignments?: boolean;
  transportStops?: boolean;
  transportBuses?: boolean;
  bankAccounts?: boolean;
  users?: boolean;
}

export interface CleanupResult {
  success: boolean;
  clearedTables: string[];
  recordsClearedCount: number;
  error?: string;
}

export interface PaymentReceiptData {
  transaction: PaymentTransaction;
  voucher: FeeVoucher;
  student: Student;
  schoolClass?: SchoolClass;
  bankAccount?: BankAccount;
  collectorName?: string;
  previousBalance?: number;
  remainingBalance?: number;
  collectionDate?: string;
}

export type AuditActionType =
  | 'fine_modification'
  | 'bulk_collection'
  | 'collection_payment'
  | 'collection_reversal'
  | 'voucher_generation'
  | 'voucher_edit'
  | 'voucher_deletion'
  | 'carry_forward'
  | 'month_closure'
  | 'student_discount'
  | 'student_created'
  | 'student_updated'
  | 'student_deletion'
  | 'operator_security'
  | 'system_cleanup'
  | 'system_restore'
  | 'settings_change';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  operatorId: string;
  operatorUsername: string;
  operatorName: string;
  operatorRole: UserRole;
  actionType: AuditActionType;
  actionTitle: string;
  description: string;
  module: 'Collections' | 'Vouchers' | 'Defaulters' | 'Students' | 'Settings' | 'Security' | 'System';
  targetId?: string; // Voucher No, Collection No, Student RegNo, User ID, etc.
  targetLabel?: string; // Student Name / Voucher / Batch / etc.
  month?: string; // YYYY-MM
  amount?: number; // Primary financial impact
  previousValue?: string | number;
  newValue?: string | number;
  metadata?: Record<string, any>; // Extra contextual details
}

export type AccountHistoryCategory =
  | 'status'
  | 'transport'
  | 'academic'
  | 'discount'
  | 'family'
  | 'enrollment';

export interface StudentAccountHistoryEntry {
  id: string;
  studentId: string;
  timestamp: string; // ISO 8601
  date: string; // YYYY-MM-DD
  category: AccountHistoryCategory;
  actionTitle: string; // e.g. "Status Changed: Active → Withdrawn", "Transport Added"
  description: string;
  previousValue?: string;
  newValue?: string;
  operatorName?: string;
  operatorRole?: string;
  month?: string; // Optional billing month if applicable
  metadata?: Record<string, any>;
}


