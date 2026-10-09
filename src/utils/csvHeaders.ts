// Single source of truth for CSV column headers (imports AND exports).
// One name per concept, matching the on-screen labels. No aliases, no positional
// fallback: importers find columns by these exact names only (case, spacing and
// punctuation are ignored, so "reg#" and "REG #" are the same header).

export interface CsvSpec<K extends string> {
  /** key -> the one accepted header text */
  columns: Record<K, string>;
  /** keys that must be present in the header row */
  required: readonly K[];
}

const normalizeHeader = (h: string): string =>
  String(h || '').replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Maps a header row to column indexes by exact header name. Absent columns get -1.
 * Rejects duplicate headers and a header row missing any required column. Unknown
 * headers are ignored.
 */
export function mapCsvHeader<K extends string>(
  headerCells: string[],
  spec: CsvSpec<K>,
): { map: Record<K, number>; error?: string } {
  const keys = Object.keys(spec.columns) as K[];
  const map = {} as Record<K, number>;
  keys.forEach((k) => (map[k] = -1));
  const keyByHeader = new Map<string, K>();
  keys.forEach((k) => keyByHeader.set(normalizeHeader(spec.columns[k]), k));

  for (let idx = 0; idx < headerCells.length; idx++) {
    const key = keyByHeader.get(normalizeHeader(headerCells[idx]));
    if (key === undefined) continue;
    if (map[key] !== -1) {
      return {
        map,
        error: `Duplicate column "${String(headerCells[idx]).trim()}" in the header row. Each column may appear only once.`,
      };
    }
    map[key] = idx;
  }

  const missing = spec.required.filter((k) => map[k] === -1);
  if (missing.length > 0) {
    const optional = keys.filter((k) => !spec.required.includes(k));
    return {
      map,
      error:
        `The first row must be a header row. Missing required column(s): ${missing.map((k) => spec.columns[k]).join(', ')}.` +
        (optional.length ? ` Optional columns: ${optional.map((k) => spec.columns[k]).join(', ')}.` : ''),
    };
  }
  return { map };
}

// --- Shared vocabulary (also used by report-style exports) -----------------
export const CSV_REG_NO = 'Reg #';
export const CSV_STUDENT_NAME = 'Student Name';
export const CSV_CLASS = 'Class';
export const CSV_FAMILY_NO = 'Family #';
export const CSV_VOUCHER_NO = 'Voucher #';
export const CSV_FEE_MONTH = 'Fee Month';
export const CSV_FATHER_NAME = 'Father Name';
export const CSV_PAYMENT_MODE = 'Payment Mode';
export const CSV_REFERENCE_NO = 'Reference #';

// --- Students ---------------------------------------------------------------
export type StudentCsvKey =
  | 'regNo' | 'name' | 'admissionDate' | 'firstBillingMonth' | 'class' | 'discount'
  | 'gender' | 'dob' | 'studentId' | 'mobile' | 'address'
  | 'fatherName' | 'fatherNationalId' | 'fatherPhone' | 'fatherOccupation'
  | 'motherName' | 'motherNationalId' | 'motherPhone';

export const STUDENT_CSV: CsvSpec<StudentCsvKey> = {
  columns: {
    regNo: CSV_REG_NO,
    name: CSV_STUDENT_NAME,
    admissionDate: 'Date of Admission',
    firstBillingMonth: 'First Fee Billing Month',
    class: CSV_CLASS,
    discount: 'Discount in Fee',
    gender: 'Gender',
    dob: 'Date of Birth',
    studentId: 'Student ID / Birth Cert. No.',
    mobile: 'Mobile Number',
    address: 'Address',
    fatherName: CSV_FATHER_NAME,
    fatherNationalId: "Father's National ID",
    fatherPhone: 'Father Mobile',
    fatherOccupation: 'Father Occupation',
    motherName: 'Mother Name',
    motherNationalId: "Mother's National ID",
    motherPhone: 'Mother Mobile',
  },
  required: ['regNo', 'name', 'admissionDate', 'firstBillingMonth', 'class', 'discount', 'fatherName', 'fatherNationalId', 'fatherPhone'],
};
/** Columns written by the student export that the import ignores. */
export const STUDENT_CSV_EXPORT_ONLY = {
  monthlyFee: 'Monthly Fee',
  netFee: 'Net Fee',
  status: 'Status',
  age: 'Age',
  familyNo: CSV_FAMILY_NO,
  documents: 'Documents Attached',
  notes: 'Other Notes',
} as const;

// --- Fee collections --------------------------------------------------------
export type CollectionCsvKey = 'regNo' | 'amount' | 'fine' | 'date' | 'paymentMode' | 'refNo';
export const COLLECTION_CSV: CsvSpec<CollectionCsvKey> = {
  columns: {
    regNo: CSV_REG_NO,
    amount: 'Amount',
    fine: 'Fine',
    date: 'Date',
    paymentMode: CSV_PAYMENT_MODE,
    refNo: CSV_REFERENCE_NO,
  },
  required: ['regNo', 'amount'],
};

// --- Transport --------------------------------------------------------------
export type TransportCsvKey = 'regNo' | 'bus' | 'stop' | 'tripType' | 'days' | 'discount';
export const TRANSPORT_CSV: CsvSpec<TransportCsvKey> = {
  columns: {
    regNo: CSV_REG_NO,
    bus: 'Bus Number',
    stop: 'Stop Name',
    tripType: 'Trip Type',
    days: 'Days Availed',
    discount: 'Discount',
  },
  required: ['regNo', 'bus', 'stop', 'tripType', 'days', 'discount'],
};

export type StopCsvKey = 'name' | 'area' | 'landmark' | 'fare' | 'sortOrder';
export const STOP_CSV: CsvSpec<StopCsvKey> = {
  columns: {
    name: 'Stop Name',
    area: 'Area / Sector',
    landmark: 'Landmark',
    fare: 'Monthly Fare',
    sortOrder: 'Sort Position #',
  },
  required: ['name'],
};

// --- Student fee-template overrides ----------------------------------------
export type TemplateCsvField =
  | 'id' | 'fine'
  | 'flex1Label' | 'flex1Value' | 'flex2Label' | 'flex2Value'
  | 'flex3Label' | 'flex3Value' | 'flex4Label' | 'flex4Value';

export const TEMPLATE_CSV: CsvSpec<TemplateCsvField> = {
  columns: {
    id: CSV_REG_NO,
    fine: 'Fine',
    flex1Label: 'Flex1 Label',
    flex1Value: 'Flex1 Value',
    flex2Label: 'Flex2 Label',
    flex2Value: 'Flex2 Value',
    flex3Label: 'Flex3 Label',
    flex3Value: 'Flex3 Value',
    flex4Label: 'Flex4 Label',
    flex4Value: 'Flex4 Value',
  },
  required: ['id'],
};

/** Same as mapCsvHeader for the template import, with absent columns left undefined. */
export const mapTemplateCsvHeader = (
  headerCells: string[],
): { map: Partial<Record<TemplateCsvField, number>>; error?: string } => {
  const res = mapCsvHeader(headerCells, TEMPLATE_CSV);
  const map: Partial<Record<TemplateCsvField, number>> = {};
  (Object.keys(res.map) as TemplateCsvField[]).forEach((k) => {
    if (res.map[k] !== -1) map[k] = res.map[k];
  });
  return { map, error: res.error };
};
