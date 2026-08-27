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
 * Charges round UP to nearest multiple of 10 (e.g. 3042 -> 3050)
 */
export function roundChargeUp(amount: number): number {
  if (amount <= 0) return 0;
  const remainder = amount % 10;
  if (remainder === 0) return amount;
  return amount + (10 - remainder);
}

/**
 * Bus / Transport Fare rounds UP to nearest multiple of 50 (e.g. 1205 -> 1250, 1200 -> 1200, 1251 -> 1300)
 */
export function roundBusFareUp(amount: number): number {
  if (amount <= 0) return 0;
  return Math.ceil(amount / 50) * 50;
}

/**
 * Discounts round DOWN to nearest multiple of 10 (e.g. 255 -> 250)
 */
export function roundDiscountDown(amount: number): number {
  if (amount <= 0) return 0;
  return Math.floor(amount / 10) * 10;
}

export function formatCurrency(amount: number): string {
  const isNegative = amount < 0;
  const absVal = Math.abs(amount).toLocaleString('en-PK');
  return isNegative ? `- Rs. ${absVal}` : `Rs. ${absVal}`;
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
 * Calculates student age accurately from Date of Birth (YYYY-MM-DD)
 */
export function calculateAge(
  dob: string | undefined | null,
  asOfDate: Date = new Date()
): StudentAgeResult | null {
  if (!dob || typeof dob !== 'string' || dob.trim() === '') return null;
  const parts = dob.trim().split('-');
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
 * Result is rounded up to the nearest multiple of 50.
 */
export function calculateTransportFee(
  assignment: TransportAssignment | undefined,
  stop: TransportStop | undefined
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

  const calculatedFee = baseDiscounted * daysRatio * tripFactor;

  return roundBusFareUp(calculatedFee);
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
  skippedMonthRule: SkippedMonthVoucherRule = 'warning'
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
    ? `First billing month is ${formatMonthName(student.firstBillingMonth)} (${student.firstBillingMonth}). Target month (${formatMonthName(month)}) is prior to billing start.`
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

  // 3-Way Hierarchy Template Partition:
  // 1. Student-level overrides (highest precedence)
  const studentTemplates = templates.filter(
    (t) => t.studentId === student.id && (!t.month || t.month === month)
  );
  // 2. Class-level overrides (middle precedence, overrides global)
  const classTemplates = templates.filter(
    (t) => !t.studentId && t.classId === student.classId && (!t.month || t.month === month)
  );
  // 3. Global default templates (baseline)
  const globalTemplates = templates.filter((t) => !t.studentId && !t.classId);

  // Helper to get active label, amount and origin for a template kind in 3-tier cascade:
  // Student Override > Class Override > Global Default
  const getTemplateInfo = (kind: ParticularKind, defaultLabel: string) => {
    const studentOverride = studentTemplates.find((t) => t.kind === kind);
    const classOverride = classTemplates.find((t) => t.kind === kind);
    const globalTpl = globalTemplates.find((t) => t.kind === kind);

    let activeTpl: FeeTemplate | undefined;
    let source: 'student' | 'class' | 'global' = 'global';

    if (studentOverride) {
      activeTpl = studentOverride;
      source = 'student';
    } else if (classOverride) {
      activeTpl = classOverride;
      source = 'class';
    } else {
      activeTpl = globalTpl;
      source = 'global';
    }

    return {
      label: activeTpl?.label || defaultLabel,
      amount: activeTpl?.defaultAmount || 0,
      source,
      isStudentOverride: !!studentOverride,
      isClassOverride: !studentOverride && !!classOverride,
    };
  };

  // 1. Tuition Fee (Student Override > Class Override / Class Monthly Fee > Global Template)
  const tuitionInfo = getTemplateInfo('Tuition', 'Tuition Fee');
  const studentTuitionOverride = studentTemplates.find((t) => t.kind === 'Tuition');
  const classTuitionOverride = classTemplates.find((t) => t.kind === 'Tuition');

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
  const tuitionAmount = roundChargeUp(rawTuitionAmount);

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
    amount: roundChargeUp(flex1Info.amount || 0),
  });

  // 3. Flex2 (Registration Fee)
  const flex2Info = getTemplateInfo('Flex2', 'Registration Fee');
  particulars.push({
    kind: 'Flex2',
    label: flex2Info.label,
    amount: roundChargeUp(flex2Info.amount || 0),
  });

  // 4. Transport Fee (Student Override > Class Override > Stop Calculation)
  const assignment = assignments.find(
    (a) => a.studentId === student.id && a.month === month && a.active
  );
  const stop = assignment ? stops.find((s) => s.id === assignment.stopId) : undefined;
  const transportStudentOverride = studentTemplates.find((t) => t.kind === 'Transport');
  const transportClassOverride = classTemplates.find((t) => t.kind === 'Transport');
  const calculatedTransportFee = calculateTransportFee(assignment, stop);

  let transportFee = calculatedTransportFee;
  if (transportStudentOverride && transportStudentOverride.defaultAmount > 0) {
    transportFee = roundBusFareUp(transportStudentOverride.defaultAmount);
  } else if (transportClassOverride && transportClassOverride.defaultAmount > 0) {
    transportFee = roundBusFareUp(transportClassOverride.defaultAmount);
  }

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
      // Unpaid balance carried forward
      prevBalance = Math.max(0, priorVoucher.netDue - priorVoucher.amountPaid);
      if (priorVoucher.carriedLateFine && priorVoucher.carriedLateFine > 0) {
        carriedFine = priorVoucher.carriedLateFine;
      }
    } else if (
      priorVoucher.status === 'Issued' ||
      priorVoucher.status === 'Partial'
    ) {
      // Still outstanding from prior month
      prevBalance = Math.max(0, priorVoucher.netDue - priorVoucher.amountPaid);
    } else if (priorVoucher.status === 'Paid') {
      // If overpaid in prior voucher, excess is negative balance (advance)
      const excess = priorVoucher.amountPaid - priorVoucher.netDue;
      if (excess > 0) {
        prevBalance = -excess;
      }
    }
  }

  // 5. Fine
  const fineInfo = getTemplateInfo('Fine', 'Fine');
  const fineStudentOverride = studentTemplates.find((t) => t.kind === 'Fine');
  const fineClassOverride = classTemplates.find((t) => t.kind === 'Fine');

  let baseFine = 0;
  if (fineStudentOverride && fineStudentOverride.defaultAmount > 0) {
    baseFine = roundChargeUp(fineStudentOverride.defaultAmount);
  } else if (fineClassOverride && fineClassOverride.defaultAmount > 0) {
    baseFine = roundChargeUp(fineClassOverride.defaultAmount);
  } else {
    baseFine = roundChargeUp(fineInfo.amount || 0);
  }
  const totalFine = baseFine + carriedFine;
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
    amount: roundChargeUp(flex3Info.amount || 0),
  });

  // 7. Flex4 (Other)
  const flex4Info = getTemplateInfo('Flex4', 'Other');
  particulars.push({
    kind: 'Flex4',
    label: flex4Info.label,
    amount: roundChargeUp(flex4Info.amount || 0),
  });

  // Push Previous Balance
  particulars.push({
    kind: 'PreviousBalance',
    label: prevBalance >= 0 ? 'Previous Balance' : 'Advance Payment Credit',
    amount: prevBalance,
  });

  // 9. Monthly Discount (Student Override > Class Override > Student Profile Discount)
  const discountStudentOverride = studentTemplates.find((t) => t.kind === 'Discount');
  const discountClassOverride = classTemplates.find((t) => t.kind === 'Discount');
  const discountInfo = getTemplateInfo('Discount', 'Discount in Fee');

  let rawDiscount = 0;
  if (discountStudentOverride && discountStudentOverride.defaultAmount > 0) {
    rawDiscount = discountStudentOverride.defaultAmount;
  } else if (discountClassOverride && discountClassOverride.defaultAmount > 0) {
    rawDiscount = discountClassOverride.defaultAmount;
  } else {
    rawDiscount = student.monthlyDiscount || 0;
  }
  const discountAmount = roundDiscountDown(rawDiscount);
  particulars.push({
    kind: 'Discount',
    label: discountInfo.label || 'Discount in Fee',
    amount: -discountAmount,
  });

  // Sort particulars according to the templates sort order (or standard order)
  const sortMap = new Map<ParticularKind, number>();
  globalTemplates.forEach((t) => sortMap.set(t.kind, t.sortOrder));
  classTemplates.forEach((t) => {
    if (t.sortOrder !== undefined) {
      sortMap.set(t.kind, t.sortOrder);
    }
  });
  studentTemplates.forEach((t) => {
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
    .filter((p) => p.amount > 0)
    .reduce((sum, p) => sum + p.amount, 0);

  const discountTotal = particulars
    .filter((p) => p.amount < 0 && p.kind === 'Discount')
    .reduce((sum, p) => sum + Math.abs(p.amount), 0);

  const netDue = particulars.reduce((sum, p) => sum + p.amount, 0);

  return {
    student,
    schoolClass,
    particulars,
    grossTotal,
    discountTotal,
    prevBalance,
    netDue: Math.max(0, netDue),
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

export function formatMonthName(monthStr: string): string {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const date = new Date(parseInt(yearStr, 10), parseInt(monthNumStr, 10) - 1, 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
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
