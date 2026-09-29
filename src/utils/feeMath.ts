import {
  FeeTemplate,
  FeeVoucher,
  ParticularKind,
  PriorMonthVoucherRule,
  SchoolClass,
  SkippedMonthVoucherRule,
  Student,
  TransportAssignment,
  TransportStop,
  VoucherItem,
} from '../types';

/**
 * Rounds a positive amount UP to the nearest multiple (e.g. 3042/10 -> 3050,
 * 1273.5/10 -> 1280). Negative amounts and zero are returned unchanged: a
 * family credit / advance is never rounded up.
 */
export function roundUpToMultiple(amount: number, multiple: number): number {
  if (amount <= 0) return amount;
  const m = multiple > 0 ? multiple : 1;
  const remainder = amount % m;
  if (remainder === 0) return amount;
  return amount + (m - remainder);
}

export function formatCurrency(amount: number): string {
  const isNegative = amount < 0;
  const absVal = Math.round(Math.abs(amount)).toLocaleString('en-PK');
  return isNegative ? `Rs. -${absVal}` : `Rs. ${absVal}`;
}

/**
 * The late fine that is actually applied to a voucher: the Fine line item(s)
 * present in its particulars (already rounded up), otherwise the voucher's
 * late-fee rate rounded up to its rounding multiple.
 */
export function getAppliedFineAmount(voucher: FeeVoucher, defaultMultiple = 10): number {
  const fineLines = voucher.particulars.filter((p) => p.kind === 'Fine');
  const boundFine = fineLines.reduce((sum, p) => sum + p.amount, 0);
  if (boundFine > 0) {
    return boundFine;
  }
  return roundUpToMultiple(voucher.lateFeeRate || 0, voucher.roundingMultiple ?? defaultMultiple);
}

/**
 * The multiple actually used for a voucher's net due rounding.
 * A voucher's own stored multiple (when > 1) always wins so that
 * historical vouchers keep their original rounding; otherwise the global
 * rounding switch decides: enabled -> configured multiple, disabled -> 1.
 */
export function getEffectiveMultiple(roundingEnabled: boolean, configuredMultiple: number, storedMultiple?: number): number {
  if (storedMultiple && storedMultiple > 1) return storedMultiple;
  return roundingEnabled ? configuredMultiple : 1;
}

export interface StudentAgeResult {
  years: number;
  months: number;
  days: number;
  totalMonths: number;
  text: string;
  fullText: string;
}

/**
 * Robust date normalizer that parses almost any user, form, or CSV date input
 * and returns standard ISO format 'YYYY-MM-DD', or null if invalid.
 *
 * Handles:
 *  - Standard ISO: 'YYYY-MM-DD' (e.g. '2015-08-15', '2026-9-1')
 *  - Commonwealth / Asian / UK slash or hyphen: 'DD/MM/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY' (e.g. '15/08/2015', '15-08-2015')
 *  - Single digit day/month: '1/9/2026', '5-8-2015'
 *  - US format when day > 12 in middle: '08/15/2015'
 *  - Month names: '15 Aug 2015', '15-Aug-2015', 'August 15, 2015', '15 August 2015'
 *  - ISO strings with timestamps: '2015-08-15T00:00:00.000Z', '2015-08-15 00:00:00'
 *  - Excel serial numbers: e.g. 42231
 */
export function normalizeDateToISO(dateStr: string | number | undefined | null): string | null {
  if (dateStr === undefined || dateStr === null) return null;

  // Handle number (e.g. Excel serial date)
  if (typeof dateStr === 'number') {
    if (isNaN(dateStr) || dateStr <= 0) return null;
    if (dateStr > 20000 && dateStr < 80000) {
      const utcDays = Math.floor(dateStr - 25569);
      const d = new Date(utcDays * 86400 * 1000);
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
  }

  const str = String(dateStr).trim();
  if (!str) return null;

  // 1. If already standard YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // 2. Handle DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, or MM/DD/YYYY with 4-digit or 2-digit year at the end
  const endYearMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (endYearMatch) {
    const p1 = parseInt(endYearMatch[1], 10);
    const p2 = parseInt(endYearMatch[2], 10);
    let rawYear = parseInt(endYearMatch[3], 10);
    if (rawYear < 100) {
      rawYear = rawYear >= 50 ? 1900 + rawYear : 2000 + rawYear;
    }

    let day = p1;
    let month = p2;

    // Disambiguate day vs month
    if (p1 > 12 && p2 <= 12) {
      // Clearly DD/MM/YYYY (e.g. 15/08/2015)
      day = p1;
      month = p2;
    } else if (p2 > 12 && p1 <= 12) {
      // Clearly MM/DD/YYYY (e.g. 08/15/2015)
      month = p1;
      day = p2;
    } else {
      // Both <= 12 (e.g. 05/08/2015 or 01/09/2026): Default to DD/MM/YYYY as standard in Pakistan & school records
      day = p1;
      month = p2;
    }

    if (rawYear >= 1900 && rawYear <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${rawYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 3. Check for textual month representations, e.g. '15 Aug 2015', '15-Aug-2015', 'August 15, 2015'
  const MONTH_MAP: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  const textMonthMatch = str.match(/(\d{1,2})[-/\s]+([a-zA-Z]+)[-/\s,]+(\d{2,4})/) ||
                         str.match(/([a-zA-Z]+)[-/\s]+(\d{1,2})[-/\s,]+(\d{2,4})/);
  if (textMonthMatch) {
    let dayStr: string;
    let monthWord: string;
    let yrStr: string;

    if (isNaN(Number(textMonthMatch[1]))) {
      // [MonthName, Day, Year]
      monthWord = textMonthMatch[1].toLowerCase();
      dayStr = textMonthMatch[2];
      yrStr = textMonthMatch[3];
    } else {
      // [Day, MonthName, Year]
      dayStr = textMonthMatch[1];
      monthWord = textMonthMatch[2].toLowerCase();
      yrStr = textMonthMatch[3];
    }

    const monthNum = MONTH_MAP[monthWord] || MONTH_MAP[monthWord.substring(0, 3)];
    let yr = parseInt(yrStr, 10);
    if (yr < 100) yr = yr >= 50 ? 1900 + yr : 2000 + yr;
    const dayNum = parseInt(dayStr, 10);

    if (monthNum && yr >= 1900 && yr <= 2100 && dayNum >= 1 && dayNum <= 31) {
      return `${yr}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }
  }

  // 4. Fallback to JS Date.parse if it can extract a valid date
  const parsedTs = Date.parse(str);
  if (!isNaN(parsedTs)) {
    const d = new Date(parsedTs);
    const yr = d.getFullYear();
    if (yr >= 1900 && yr <= 2100) {
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${yr}-${m}-${day}`;
    }
  }

  return null;
}

/**
 * Calculates student age accurately from Date of Birth in any common format
 * (e.g. YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, 15 Aug 2015)
 */
export function calculateAge(
  dob: string | undefined | null,
  asOfDate: Date = new Date()
): StudentAgeResult | null {
  if (!dob || typeof dob !== 'string' || dob.trim() === '') return null;
  const iso = normalizeDateToISO(dob);
  if (!iso) return null;

  const parts = iso.split('-');
  if (parts.length < 3) return null;

  const birthYear = parseInt(parts[0], 10);
  const birthMonth = parseInt(parts[1], 10) - 1; // 0-indexed
  const birthDay = parseInt(parts[2], 10);

  if (isNaN(birthYear) || isNaN(birthMonth) || isNaN(birthDay)) return null;

  const birthDate = new Date(birthYear, birthMonth, birthDay);
  if (isNaN(birthDate.getTime())) return null;

  let years = asOfDate.getFullYear() - birthYear;
  let months = asOfDate.getMonth() - birthMonth;
  let days = asOfDate.getDate() - birthDay;

  if (days < 0) {
    months -= 1;
    // days in previous month of asOfDate
    const prevMonthLastDay = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years < 0) {
    return { years: 0, months: 0, days: 0, totalMonths: 0, text: '0 yrs', fullText: '0 Years' };
  }

  const totalMonths = years * 12 + months;

  let text = '';
  if (years === 0) {
    text = months === 1 ? '1 mo' : `${months} mos`;
  } else if (months > 0) {
    text = `${years}y ${months}m`;
  } else {
    text = `${years} yrs`;
  }

  let fullText = '';
  if (years === 0) {
    fullText = months === 1 ? '1 Month' : `${months} Months`;
  } else if (months > 0) {
    fullText = `${years} Year${years > 1 ? 's' : ''}, ${months} Month${months > 1 ? 's' : ''}`;
  } else {
    fullText = `${years} Year${years > 1 ? 's' : ''}`;
  }

  return { years, months, days, totalMonths, text, fullText };
}

/**
 * Returns formatted age string for UI display and exports (e.g. "8 yrs" or "8y 6m" or "-")
 */
export function formatStudentAge(dob: string | undefined | null, format: 'short' | 'full' | 'yearsOnly' = 'short'): string {
  const age = calculateAge(dob);
  if (!age) return '—';
  if (format === 'full') return age.fullText;
  if (format === 'yearsOnly') return `${age.years} yrs`;
  return age.text;
}

/**
 * Normalizes a Pakistani CNIC / B-Form string by stripping non-alphanumeric characters.
 */
export function normalizeCnic(cnic: string | undefined | null): string {
  if (!cnic) return '';
  return String(cnic).replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

/**
 * Helper to get total calendar days in a given YYYY-MM month string (e.g. 2026-08 -> 31)
 */
export function getDaysInMonth(month: string): number {
  if (!month || !month.includes('-')) return 30;
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(monthNum)) return 30;
  return new Date(year, monthNum, 0).getDate();
}

/**
 * Calculates transport fee for a student in a month based on assignment & stop fare.
 * Exact formula: (baseStopFare - discount) * (daysAvailed / daysInMonth) * tripFactor
 * User selectable transport rounding is applied to this line item before it becomes
 * part of the voucher particulars. A multiple of 1 means exact PKR (no rounding).
 */
export function calculateTransportFee(
  assignment: TransportAssignment | undefined,
  stop: TransportStop | undefined,
  transportRoundingMultiple: number = 10
): number {
  if (!assignment || !assignment.active || !stop) return 0;

  const baseFare = stop.monthlyFare || 0;
  const discount = assignment.discount || 0;
  const baseDiscounted = Math.max(0, baseFare - discount);

  const daysInMonth = getDaysInMonth(assignment.month);
  const daysCharged = assignment.daysCharged !== undefined ? assignment.daysCharged : daysInMonth;
  const clampedDays = Math.min(Math.max(daysCharged, 0), daysInMonth);
  const daysRatio = daysInMonth > 0 ? clampedDays / daysInMonth : 1;

  const tripFactor = assignment.tripType === 'OneWay' ? 0.5 : 1.0;

  const rawFare = baseDiscounted * daysRatio * tripFactor;
  return roundUpToMultiple(rawFare, transportRoundingMultiple > 0 ? transportRoundingMultiple : 1);
}

export interface VoucherPreviewCalculation {
  student: Student;
  schoolClass?: SchoolClass;
  particulars: VoucherItem[];
  grossTotal: number;
  discountTotal: number;
  prevBalance: number;
  netDue: number;
  existingVoucherId?: string;
  isAlreadyGenerated: boolean;
  isBlockedByPriorRule?: boolean;
  blockReason?: string;
  hasFutureVouchers?: boolean;
  latestFutureMonth?: string;
  hasSkippedMonths?: boolean;
  skippedMonths?: string[];
  isBlockedBySkippedRule?: boolean;
  skippedBlockReason?: string;
  isBeforeFirstBillingMonth?: boolean;
  firstBillingMonthBlockReason?: string;
  // The prior voucher (if any) whose balance was folded into this preview's
  // prevBalance. Exposed so the commit step can mark it Carried -- without
  // this, a source voucher (e.g. an unpaid pre-billing-start Admission
  // voucher) has its balance folded into the new voucher's total but is
  // itself never updated, leaving it as a permanent unpaid "ghost" record
  // even after the debt has effectively been collected via the new voucher.
  priorVoucherId?: string;
  // True only when priorVoucherId represents actual unpaid/partial debt
  // being folded forward (not an already-Paid voucher's advance-credit case,
  // which shouldn't be marked Carried since nothing is owed on it).
  priorVoucherShouldCarry?: boolean;
}

/**
 * Calculates skipped intermediate months for a student prior to targetMonth.
 */
export function getSkippedMonths(
  existingVouchers: FeeVoucher[],
  studentId: string,
  targetMonth: string,
  firstBillingMonth?: string
): string[] {
  const priorVouchers = existingVouchers
    .filter((v) => v.studentId === studentId && v.month < targetMonth && v.status !== 'Reversed')
    .sort((a, b) => b.month.localeCompare(a.month));

  let startMonthStr: string;
  if (priorVouchers.length > 0) {
    startMonthStr = priorVouchers[0].month;
  } else if (firstBillingMonth && firstBillingMonth < targetMonth) {
    startMonthStr = getPreviousMonthString(firstBillingMonth);
  } else {
    return [];
  }

  const skipped: string[] = [];

  let [year, monthNum] = startMonthStr.split('-').map(Number);

  monthNum++;
  if (monthNum > 12) {
    monthNum = 1;
    year++;
  }

  while (true) {
    const curMonthStr = `${year}-${String(monthNum).padStart(2, '0')}`;
    if (curMonthStr >= targetMonth) break;

    if (!firstBillingMonth || curMonthStr >= firstBillingMonth) {
      const exists = existingVouchers.some(
        (v) => v.studentId === studentId && v.month === curMonthStr && v.status !== 'Reversed'
      );
      if (!exists) {
        skipped.push(curMonthStr);
      }
    }

    monthNum++;
    if (monthNum > 12) {
      monthNum = 1;
      year++;
    }
  }

  return skipped;
}

export interface ResolvedTemplateItem {
  label: string;
  amount: number;
  source: 'student_month' | 'student_all' | 'class_month' | 'class_all' | 'global_month' | 'global_all';
  tier: 'student' | 'class' | 'global';
  scope: 'month' | 'all';
  isStudentOverride: boolean;
  isClassOverride: boolean;
  isGlobalMonthOverride: boolean;
  activeTpl?: FeeTemplate;
}

/**
 * Resolves a single fee particular kind through the 6-tier cascade:
 * 1. Student Override (Specific Month)
 * 2. Student Override (All Months)
 * 3. Class Override (Specific Month)
 * 4. Class Override (All Months)
 * 5. Global Override (Specific Month)
 * 6. Global Default (All Months)
 */
export function resolveTemplateParticular(
  templates: FeeTemplate[],
  kind: ParticularKind,
  month: string,
  studentId?: string,
  classId?: string,
  defaultLabel: string = ''
): ResolvedTemplateItem {
  const isMonthMatch = (tplMonth?: string) => tplMonth && tplMonth !== 'all' && tplMonth === month;
  const isAllMatch = (tplMonth?: string) => !tplMonth || tplMonth === 'all';

  const sMonth = studentId
    ? templates.find((t) => t.studentId === studentId && t.kind === kind && isMonthMatch(t.month))
    : undefined;
  const sAll = studentId
    ? templates.find((t) => t.studentId === studentId && t.kind === kind && isAllMatch(t.month))
    : undefined;

  const cMonth = classId
    ? templates.find((t) => !t.studentId && t.classId === classId && t.kind === kind && isMonthMatch(t.month))
    : undefined;
  const cAll = classId
    ? templates.find((t) => !t.studentId && t.classId === classId && t.kind === kind && isAllMatch(t.month))
    : undefined;

  const gMonth = templates.find(
    (t) => !t.studentId && !t.classId && t.kind === kind && isMonthMatch(t.month)
  );
  const gAll = templates.find(
    (t) => !t.studentId && !t.classId && t.kind === kind && isAllMatch(t.month)
  );

  if (sMonth) {
    return {
      label: sMonth.label || defaultLabel,
      amount: sMonth.defaultAmount ?? 0,
      source: 'student_month',
      tier: 'student',
      scope: 'month',
      isStudentOverride: true,
      isClassOverride: false,
      isGlobalMonthOverride: false,
      activeTpl: sMonth,
    };
  }
  if (sAll) {
    return {
      label: sAll.label || defaultLabel,
      amount: sAll.defaultAmount ?? 0,
      source: 'student_all',
      tier: 'student',
      scope: 'all',
      isStudentOverride: true,
      isClassOverride: false,
      isGlobalMonthOverride: false,
      activeTpl: sAll,
    };
  }
  if (cMonth) {
    return {
      label: cMonth.label || defaultLabel,
      amount: cMonth.defaultAmount ?? 0,
      source: 'class_month',
      tier: 'class',
      scope: 'month',
      isStudentOverride: false,
      isClassOverride: true,
      isGlobalMonthOverride: false,
      activeTpl: cMonth,
    };
  }
  if (cAll) {
    return {
      label: cAll.label || defaultLabel,
      amount: cAll.defaultAmount ?? 0,
      source: 'class_all',
      tier: 'class',
      scope: 'all',
      isStudentOverride: false,
      isClassOverride: true,
      isGlobalMonthOverride: false,
      activeTpl: cAll,
    };
  }
  if (gMonth) {
    return {
      label: gMonth.label || defaultLabel,
      amount: gMonth.defaultAmount ?? 0,
      source: 'global_month',
      tier: 'global',
      scope: 'month',
      isStudentOverride: false,
      isClassOverride: false,
      isGlobalMonthOverride: true,
      activeTpl: gMonth,
    };
  }
  return {
    label: gAll?.label || defaultLabel,
    amount: gAll?.defaultAmount ?? 0,
    source: 'global_all',
    tier: 'global',
    scope: 'all',
    isStudentOverride: false,
    isClassOverride: false,
    isGlobalMonthOverride: false,
    activeTpl: gAll,
  };
}

/**
 * Calculates pre-generation preview for a single student for a target month.
 */
export function calculateStudentVoucherPreview(
  student: Student,
  schoolClass: SchoolClass | undefined,
  month: string,
  templates: FeeTemplate[],
  assignments: TransportAssignment[],
  stops: TransportStop[],
  existingVouchers: FeeVoucher[],
  priorMonthRule: PriorMonthVoucherRule = 'strict',
  skippedMonthRule: SkippedMonthVoucherRule = 'warning',
  roundingMultiple: number = 10,
  transportRoundingMultiple: number = 10
): VoucherPreviewCalculation {
  const existingVoucher = existingVouchers.find(
    (v) => v.studentId === student.id && v.month === month && v.status !== 'Reversed'
  );

  if (existingVoucher) {
    return {
      student,
      schoolClass,
      particulars: existingVoucher.particulars,
      grossTotal: existingVoucher.grossTotal,
      discountTotal: existingVoucher.discountTotal,
      prevBalance: existingVoucher.prevBalance,
      netDue: existingVoucher.netDue,
      existingVoucherId: existingVoucher.id,
      isAlreadyGenerated: true,
    };
  }

  // Check First Fee Billing Month eligibility:
  // "Generate voucher only if current month is same or later than the first billing month, subject to other existing conditions"
  const isBeforeFirstBillingMonth = !!(
    student.firstBillingMonth && month < student.firstBillingMonth
  );
  const firstBillingMonthBlockReason = isBeforeFirstBillingMonth
    ? `First billing month is ${formatMonthName(student.firstBillingMonth)}. Target month (${formatMonthName(month)}) is prior to billing start.`
    : undefined;

  if (isBeforeFirstBillingMonth) {
    return {
      student,
      schoolClass,
      particulars: [],
      grossTotal: 0,
      discountTotal: 0,
      prevBalance: 0,
      netDue: 0,
      isAlreadyGenerated: false,
      isBeforeFirstBillingMonth: true,
      firstBillingMonthBlockReason,
    };
  }

  // Check if any vouchers exist for this student in months LATER than target month
  const futureVouchers = existingVouchers
    .filter((v) => v.studentId === student.id && v.month > month && v.status !== 'Reversed')
    .sort((a, b) => b.month.localeCompare(a.month)); // newest future month first

  const hasFutureVouchers = futureVouchers.length > 0;
  const latestFutureMonth = hasFutureVouchers ? futureVouchers[0].month : undefined;

  let isBlockedByPriorRule = false;
  let blockReason: string | undefined = undefined;

  if (hasFutureVouchers && latestFutureMonth) {
    const formattedFutMonth = formatMonthName(latestFutureMonth);
    if (priorMonthRule === 'strict') {
      isBlockedByPriorRule = true;
      blockReason = `Blocked: Voucher for ${formattedFutMonth} already generated (Strict Chronological Policy)`;
    } else if (priorMonthRule === 'warning') {
      blockReason = `Warning: Future voucher exists for ${formattedFutMonth}`;
    } else if (priorMonthRule === 'recalculate') {
      blockReason = `Auto-Recalculate: Future voucher (${formattedFutMonth}) will be updated`;
    }
  }

  // Check if any intermediate prior months were skipped
  const skippedMonths = getSkippedMonths(existingVouchers, student.id, month, student.firstBillingMonth);
  const hasSkippedMonths = skippedMonths.length > 0;

  let isBlockedBySkippedRule = false;
  let skippedBlockReason: string | undefined = undefined;

  if (hasSkippedMonths) {
    const formattedSkippedStr = skippedMonths.map(formatMonthName).join(', ');
    if (skippedMonthRule === 'strict') {
      isBlockedBySkippedRule = true;
      skippedBlockReason = `Blocked: Skipped month(s) detected (${formattedSkippedStr}). Strict Sequential Policy Active.`;
    } else if (skippedMonthRule === 'warning') {
      skippedBlockReason = `Warning: Skipped month(s) detected (${formattedSkippedStr}).`;
    } else if (skippedMonthRule === 'allow') {
      skippedBlockReason = `Skipped month(s): ${formattedSkippedStr}`;
    }
  }

  const particulars: VoucherItem[] = [];

  const isMonthMatch = (tplMonth?: string) => tplMonth && tplMonth !== 'all' && tplMonth === month;
  const isAllMatch = (tplMonth?: string) => !tplMonth || tplMonth === 'all';

  // Helper using the 6-tier waterfall resolver
  const getTemplateInfo = (kind: ParticularKind, defaultLabel: string) => {
    return resolveTemplateParticular(templates, kind, month, student.id, student.classId, defaultLabel);
  };

  // 1. Tuition Fee (Student Override [Month > All] > Class Override [Month > All] > Class Monthly Fee > Global [Month > All])
  const tuitionInfo = getTemplateInfo('Tuition', 'Tuition Fee');
  const studentTuitionOverride =
    templates.find((t) => t.studentId === student.id && t.kind === 'Tuition' && isMonthMatch(t.month)) ||
    templates.find((t) => t.studentId === student.id && t.kind === 'Tuition' && isAllMatch(t.month));

  const classTuitionOverride =
    templates.find((t) => !t.studentId && t.classId === student.classId && t.kind === 'Tuition' && isMonthMatch(t.month)) ||
    templates.find((t) => !t.studentId && t.classId === student.classId && t.kind === 'Tuition' && isAllMatch(t.month));

  let rawTuitionAmount = 0;
  if (studentTuitionOverride && studentTuitionOverride.defaultAmount > 0) {
    rawTuitionAmount = studentTuitionOverride.defaultAmount;
  } else if (classTuitionOverride && classTuitionOverride.defaultAmount > 0) {
    rawTuitionAmount = classTuitionOverride.defaultAmount;
  } else if (schoolClass?.monthlyFee && schoolClass.monthlyFee > 0) {
    rawTuitionAmount = schoolClass.monthlyFee;
  } else {
    rawTuitionAmount = tuitionInfo.amount || 0;
  }
  const tuitionAmount = rawTuitionAmount;

  particulars.push({
    kind: 'Tuition',
    label: tuitionInfo.label || 'Tuition Fee',
    amount: tuitionAmount,
  });

  // 2. Flex1 (Admission Fee)
  const flex1Info = getTemplateInfo('Flex1', 'Admission Fee');
  particulars.push({
    kind: 'Flex1',
    label: flex1Info.label,
    amount: flex1Info.amount ?? 0,
  });

  // 3. Flex2 (Registration Fee)
  const flex2Info = getTemplateInfo('Flex2', 'Registration Fee');
  particulars.push({
    kind: 'Flex2',
    label: flex2Info.label,
    amount: flex2Info.amount ?? 0,
  });

  // 4. Transport Fee (Derived dynamically from active TransportAssignment + TransportStop)
  const assignment = assignments.find(
    (a) => a.studentId === student.id && a.month === month && a.active
  );
  const stop = assignment ? stops.find((s) => s.id === assignment.stopId) : undefined;
  const transportFee = calculateTransportFee(assignment, stop, transportRoundingMultiple);

  const transportInfo = getTemplateInfo('Transport', 'Transport Fee');
  particulars.push({
    kind: 'Transport',
    label: transportInfo.label || 'Transport Fee',
    amount: transportFee,
  });

  // 8. Previous Balance & Carried Fine
  // Search for either a voucher explicitly carried-forward to this month, OR
  // the most-recent non-reversed prior voucher for this student regardless of
  // how many months back it sits (handles June admission voucher → August gap).
  const carriedToThisMonth = existingVouchers.find(
    (v) => v.studentId === student.id && v.carryForwardMonth === month && v.status !== 'Reversed'
  );

  const latestPriorVoucher = existingVouchers
    .filter((v) => v.studentId === student.id && v.month < month && v.status !== 'Reversed')
    .sort((a, b) => b.month.localeCompare(a.month))[0]; // newest-first → [0] is the closest prior

  const priorVoucher = carriedToThisMonth ?? latestPriorVoucher;

  let prevBalance = 0;
  let carriedFine = 0;

  if (priorVoucher) {
    if (priorVoucher.status === 'Carried') {
      // Unpaid balance carried forward (or credit carried forward)
      prevBalance = priorVoucher.netDue - priorVoucher.amountPaid;
      if (priorVoucher.carriedLateFine && priorVoucher.carriedLateFine > 0) {
        carriedFine = priorVoucher.carriedLateFine;
      }
    } else if (
      priorVoucher.status === 'Issued' ||
      priorVoucher.status === 'Partial'
    ) {
      // Outstanding debt (positive) or unapplied credit (negative) from prior month
      prevBalance = priorVoucher.netDue - priorVoucher.amountPaid;
    } else if (priorVoucher.status === 'Paid') {
      // If overpaid in prior voucher, excess is negative balance (advance credit)
      const excess = priorVoucher.amountPaid - priorVoucher.netDue;
      if (excess > 0) {
        prevBalance = -excess;
      }
    }
  }

  // 5. Fine
  const fineInfo = getTemplateInfo('Fine', 'Fine');
  const fineStudentOverride =
    templates.find((t) => t.studentId === student.id && t.kind === 'Fine' && isMonthMatch(t.month)) ||
    templates.find((t) => t.studentId === student.id && t.kind === 'Fine' && isAllMatch(t.month));

  const fineClassOverride =
    templates.find((t) => !t.studentId && t.classId === student.classId && t.kind === 'Fine' && isMonthMatch(t.month)) ||
    templates.find((t) => !t.studentId && t.classId === student.classId && t.kind === 'Fine' && isAllMatch(t.month));

  let baseFine = 0;
  if (fineStudentOverride && fineStudentOverride.defaultAmount > 0) {
    baseFine = fineStudentOverride.defaultAmount;
  } else if (fineClassOverride && fineClassOverride.defaultAmount > 0) {
    baseFine = fineClassOverride.defaultAmount;
  } else {
    baseFine = fineInfo.amount || 0;
  }
  const totalFine = roundUpToMultiple(baseFine + carriedFine, roundingMultiple);
  particulars.push({
    kind: 'Fine',
    label: carriedFine > 0 && baseFine === 0 ? 'Late Payment Carry Fine' : (fineInfo.label || 'Fine / Late Fee'),
    amount: totalFine,
  });

  // 6. Flex3 (Exam Fee)
  const flex3Info = getTemplateInfo('Flex3', 'Exam Fee');
  particulars.push({
    kind: 'Flex3',
    label: flex3Info.label,
    amount: flex3Info.amount ?? 0,
  });

  // 7. Flex4 (Other)
  const flex4Info = getTemplateInfo('Flex4', 'Other');
  particulars.push({
    kind: 'Flex4',
    label: flex4Info.label,
    amount: flex4Info.amount ?? 0,
  });

  // Push Previous Balance
  particulars.push({
    kind: 'PreviousBalance',
    label: prevBalance >= 0 ? 'Previous Balance' : 'Advance Payment Credit',
    amount: prevBalance,
  });

  // 9. Monthly Discount (Student Override [Month > All] > Class Override [Month > All] > Student Profile Discount > Global [Month > All])
  const discountStudentOverride =
    templates.find((t) => t.studentId === student.id && t.kind === 'Discount' && isMonthMatch(t.month)) ||
    templates.find((t) => t.studentId === student.id && t.kind === 'Discount' && isAllMatch(t.month));

  const discountClassOverride =
    templates.find((t) => !t.studentId && t.classId === student.classId && t.kind === 'Discount' && isMonthMatch(t.month)) ||
    templates.find((t) => !t.studentId && t.classId === student.classId && t.kind === 'Discount' && isAllMatch(t.month));

  const discountInfo = getTemplateInfo('Discount', 'Discount in Fee');

  let rawDiscount = 0;
  if (discountStudentOverride && discountStudentOverride.defaultAmount > 0) {
    rawDiscount = discountStudentOverride.defaultAmount;
  } else if (discountClassOverride && discountClassOverride.defaultAmount > 0) {
    rawDiscount = discountClassOverride.defaultAmount;
  } else if (student.monthlyDiscount && student.monthlyDiscount > 0) {
    rawDiscount = student.monthlyDiscount;
  } else {
    rawDiscount = discountInfo.amount || 0;
  }
  particulars.push({
    kind: 'Discount',
    label: discountInfo.label || 'Discount in Fee',
    amount: -rawDiscount,
  });

  // Sort particulars according to the templates sort order (or standard order)
  const sortMap = new Map<ParticularKind, number>();
  templates.forEach((t) => {
    if (t.sortOrder !== undefined) {
      sortMap.set(t.kind, t.sortOrder);
    }
  });
  particulars.sort((a, b) => {
    const orderA = sortMap.get(a.kind) ?? 99;
    const orderB = sortMap.get(b.kind) ?? 99;
    return orderA - orderB;
  });

  const grossTotal = particulars
    .filter((p) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
    .reduce((sum, p) => sum + p.amount, 0);

  const discountTotal = particulars
    .filter((p) => p.kind === 'Discount')
    .reduce((sum, p) => sum + Math.abs(p.amount), 0);

  const netDue = roundUpToMultiple(
    particulars.reduce((sum, p) => sum + p.amount, 0),
    roundingMultiple
  );

  return {
    student,
    schoolClass,
    particulars,
    grossTotal,
    discountTotal,
    prevBalance,
    netDue,
    isAlreadyGenerated: false,
    isBlockedByPriorRule,
    blockReason,
    hasFutureVouchers,
    latestFutureMonth,
    hasSkippedMonths,
    skippedMonths,
    isBlockedBySkippedRule,
    skippedBlockReason,
    priorVoucherId: priorVoucher?.id,
    priorVoucherShouldCarry:
      !!priorVoucher && (priorVoucher.status === 'Issued' || priorVoucher.status === 'Partial'),
  };
}

export function getPreviousMonthString(monthStr: string): string {
  const [yearStr, monthNumStr] = monthStr.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthNumStr, 10);

  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }

  return `${year}-${month.toString().padStart(2, '0')}`;
}

export function getNextMonthString(monthStr: string): string {
  const [yearStr, monthNumStr] = monthStr.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthNumStr, 10);

  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }

  return `${year}-${month.toString().padStart(2, '0')}`;
}

export function normalizeMonthString(monthStr: string | undefined | null): string {
  if (!monthStr || typeof monthStr !== 'string') return '';
  const trimmed = monthStr.trim();
  if (!trimmed || trimmed === 'all') return trimmed;

  const standardMatch = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (standardMatch) {
    const y = standardMatch[1];
    const m = standardMatch[2].padStart(2, '0');
    return `${y}-${m}`;
  }

  // Attempt parse if date string like "2026-09-01" or "September 2026"
  const parsed = new Date(trimmed.includes('-') ? trimmed : `${trimmed} 1`);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  return trimmed;
}

export function formatMonthName(monthStr: string): string {
  if (!monthStr || monthStr === 'all') return 'All Months';
  const normalized = normalizeMonthString(monthStr);
  const parts = normalized.split('-');
  if (parts.length >= 2) {
    const year = parseInt(parts[0], 10);
    const monthNum = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      const date = new Date(year, monthNum - 1, 1);
      return date.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
  }
  return monthStr;
}

export function getCurrentMonthString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

export function shiftMonth(monthStr: string, delta: number): string {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const total = parseInt(yearStr, 10) * 12 + (parseInt(monthNumStr, 10) - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${month.toString().padStart(2, '0')}`;
}

export function getMonthPickerWindow(backCount: number = 11, forwardCount: number = 6): string[] {
  const start = shiftMonth(getCurrentMonthString(), -backCount);
  const months: string[] = [];
  for (let i = 0; i <= backCount + forwardCount; i++) {
    months.push(shiftMonth(start, i));
  }
  return months;
}

export function mergeWithDataMonths(pickerMonths: string[], dataMonths: string[]): string[] {
  return Array.from(new Set([...pickerMonths, ...dataMonths])).sort();
}

export function getRecentMonthsEndingAt(endMonthStr: string, count: number): string[] {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(shiftMonth(endMonthStr, -i));
  }
  return months;
}

/**
 * Converts a numeric amount into standard words format (e.g. 5,450 -> "Five Thousand Four Hundred Fifty Rupees Only")
 */
export function numberToWords(num: number): string {
  if (num === 0) return 'Zero Rupees Only';
  if (isNaN(num)) return '';

  const units = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertLessThanOneThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return units[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
    return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanOneThousand(n % 100) : '');
  };

  const convertPakistaniNumber = (n: number): string => {
    if (n === 0) return 'Zero';
    let result = '';
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const remainder = n;

    if (crore > 0) {
      result += convertLessThanOneThousand(crore) + ' Crore ';
    }
    if (lakh > 0) {
      result += convertLessThanOneThousand(lakh) + ' Lakh ';
    }
    if (thousand > 0) {
      result += convertLessThanOneThousand(thousand) + ' Thousand ';
    }
    if (remainder > 0) {
      result += convertLessThanOneThousand(remainder);
    }
    return result.trim();
  };

  const whole = Math.floor(Math.abs(num));
  const words = convertPakistaniNumber(whole);
  return `${words} Rupees Only`;
}

