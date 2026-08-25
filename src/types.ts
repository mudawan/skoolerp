export type UserRole = 'Admin' | 'Accountant' | 'Viewer';

export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  permissions: string[];
  email?: string;
  avatarUrl?: string;
  lastLogin?: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  monthlyFee: number;
  sortOrder: number;
  active: boolean;
  studentCount?: number;
}

export type StudentStatus = 'Active' | 'Inactive' | 'AutoDeactivated';

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
  gender: 'Male' | 'Female'; // Gender
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
  netDue: number;
  amountPaid: number;
  status: VoucherStatus;
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
  | 'transport'
  | 'reports'
  | 'settings';

export type PriorMonthVoucherRule = 'strict' | 'warning' | 'recalculate';
export type SkippedMonthVoucherRule = 'strict' | 'warning' | 'allow';
export type VoucherDeletionResolution = 'auto-heal' | 'cascade' | 'manual';

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
}
