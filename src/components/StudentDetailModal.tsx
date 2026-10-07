import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { ParticularKind, Student } from '../types';
import { formatCurrency, calculateAge, formatStudentAge, formatMonthName, getCurrentMonthString, getPreviousMonthString, resolveTemplateParticular, normalizeDateToISO, getCurrencyCode } from '../utils/feeMath';
import { StudentAvatar } from './StudentAvatar';
import { MonthPicker } from './MonthPicker';
import { DatePicker } from './DatePicker';
import { StudentAccountHistoryView } from './StudentAccountHistoryView';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CreditCard,
  Download,
  Edit2,
  Eye,
  FileCheck2,
  FileText,
  FolderKanban,
  History,
  Home,
  IdCard,
  Info,
  Phone,
  Receipt,
  Sparkles,
  User,
  X,
} from 'lucide-react';

interface StudentDetailModalProps {
  student: Student;
  onClose: () => void;
  onEdit: (student: Student) => void;
  onViewLedger: (studentId: string) => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  student,
  onClose,
  onEdit,
  onViewLedger,
}) => {
  const {
    students,
    classes,
    families,
    hasPermission,
    generateAdmissionVoucher,
    showToast,
    vouchers,
    activeMonth,
    templates,
    saveStudentTemplateOverrides,
    getComputedDefaultDueDate,
    themeConfig,
    getStudentAccountHistory,
    ensureStudentHistory,
  } = useApp();

  // The admission-voucher check below looks at this student's own history, which
  // may sit in closed (not yet loaded) months.
  useEffect(() => {
    void ensureStudentHistory(student.id);
  }, [student.id, ensureStudentHistory]);

  // Tab state: 'profile' (Information & Particulars) or 'history' (Account History Log)
  const [activeTab, setActiveTab] = useState<'profile' | 'history'>('profile');

  // Reactively track the student record in case status changes while modal is open
  const currentStudent = useMemo(() => {
    return students.find((s) => s.id === student.id) || student;
  }, [students, student]);

  // Total history entries count for the tab badge
  const historyEntriesCount = useMemo(() => {
    return getStudentAccountHistory(student.id).length;
  }, [getStudentAccountHistory, student.id, currentStudent.status]);

  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    fileData?: string;
    fileType?: string;
  } | null>(null);

  // Admission Voucher mini-modal state
  const [showAdmVoucherModal, setShowAdmVoucherModal] = useState(false);
  const [admMonth, setAdmMonth] = useState<string>(() => {
    // Default to the month of admission, or the current active month
    if (student.admissionDate) {
      const norm = normalizeDateToISO(student.admissionDate);
      if (norm) return norm.substring(0, 7);
      if (student.admissionDate.length >= 7) return student.admissionDate.substring(0, 7);
    }
    return getCurrentMonthString();
  });

  // The 4 admission-charge heads (Flex1..Flex4) editable directly in the modal.
  const ADM_FLEX_KINDS: { kind: ParticularKind; defaultLabel: string }[] = [
    { kind: 'Flex1', defaultLabel: 'Admission Fee' },
    { kind: 'Flex2', defaultLabel: 'Registration Fee' },
    { kind: 'Flex3', defaultLabel: 'Exam Fee' },
    { kind: 'Flex4', defaultLabel: 'Other' },
  ];
  const [admItems, setAdmItems] = useState<Array<{ kind: ParticularKind; label: string; amount: string }>>(
    ADM_FLEX_KINDS.map(({ kind, defaultLabel }) => ({ kind, label: defaultLabel, amount: '' }))
  );

  // Optional overridable due date for the admission voucher.
  const [admDueDate, setAdmDueDate] = useState<string>('');
  const [admDueDateTouched, setAdmDueDateTouched] = useState(false);

  // Resolve the admission head label for this student in a given month using
  // 6-tier waterfall precedence (matches fee template resolution).
  const resolveAdmLabel = (kind: ParticularKind, defaultLabel: string, month: string) => {
    return resolveTemplateParticular(templates, kind, month, student.id, student.classId, defaultLabel).label;
  };

  // Seed the editable heads: label from student -> class -> global template
  // precedence; amount only from the student's template (class/global labels
  // seed with zero so they're entered fresh).
  const seedAdmItems = (month: string) => {
    setAdmItems(
      ADM_FLEX_KINDS.map(({ kind, defaultLabel }) => {
        const resolved = resolveTemplateParticular(templates, kind, month, student.id, student.classId, defaultLabel);
        return {
          kind,
          label: resolved.label,
          amount: resolved.isStudentOverride && resolved.amount > 0 ? String(resolved.amount) : '',
        };
      })
    );
  };

  const admTotal = admItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  // True when student has a future firstBillingMonth (i.e. admitted before classes start)
  const hasFutureBilling = !!(student.firstBillingMonth && student.firstBillingMonth > getCurrentMonthString());

  // Admission voucher month range: cannot be earlier than admission month,
  // and must fall strictly before the first regular tuition (billing) month
  // -- once billing starts, that month's balance belongs on the regular
  // monthly voucher instead.
  const admMonthMin = (() => {
    if (!student.admissionDate) return undefined;
    const norm = normalizeDateToISO(student.admissionDate);
    return norm ? norm.substring(0, 7) : (student.admissionDate.length >= 7 ? student.admissionDate.substring(0, 7) : undefined);
  })();
  const admMonthMax = student.firstBillingMonth ? getPreviousMonthString(student.firstBillingMonth) : undefined;
  const admRangeInvalid = Boolean(admMonthMin && admMonthMax && admMonthMin > admMonthMax);

  // Check if admission voucher already issued for this student in chosen month
  const existingAdmVoucher = useMemo(
    () => vouchers.find((v) => v.studentId === student.id && v.month === admMonth && v.status !== 'Reversed'),
    [vouchers, student.id, admMonth]
  );

  const handleOpenAdmVoucher = () => {
    seedAdmItems(admMonth);
    setAdmDueDate(getComputedDefaultDueDate(admMonth));
    setAdmDueDateTouched(false);
    setShowAdmVoucherModal(true);
  };

  const handleAdmMonthChange = (month: string) => {
    setAdmMonth(month);
    seedAdmItems(month);
    // Re-seed the due date from settings unless the user already picked one.
    if (!admDueDateTouched) setAdmDueDate(getComputedDefaultDueDate(month));
  };

  const admGenerateDisabled =
    !!existingAdmVoucher ||
    admRangeInvalid ||
    (!!admMonthMin && admMonth < admMonthMin) ||
    (!!admMonthMax && admMonth > admMonthMax) ||
    admTotal <= 0;

  const handleGenerateAdmVoucher = () => {
    if (admGenerateDisabled) return;
    const items = admItems
      .filter((it) => (Number(it.amount) || 0) > 0)
      .map((it) => ({
        kind: it.kind,
        label: it.label.trim() || resolveAdmLabel(it.kind, 'Head', admMonth),
        defaultAmount: Number(it.amount) || 0,
        sortOrder: ADM_FLEX_KINDS.findIndex((k) => k.kind === it.kind) + 2,
      }));
    if (items.length === 0) {
      showToast('Please enter at least one admission charge amount.', 'error');
      return;
    }
    // Persist the edited heads as this student's template for the chosen month,
    // so they are reused next time. Generation below uses these exact items
    // directly (not the possibly-just-updated template state), avoiding a
    // stale-closure "no template" failure on the first click.
    saveStudentTemplateOverrides(student.id, admMonth, items);
    const res = generateAdmissionVoucher(student.id, admMonth, {
      dueDate: admDueDate || undefined,
      items: items.map((it) => ({ kind: it.kind, label: it.label, amount: it.defaultAmount })),
    });
    if (res.success && res.voucher) {
      showToast(`Admission Voucher ${res.voucher.voucherNo} generated for ${formatMonthName(admMonth)}!`, 'success');
      setShowAdmVoucherModal(false);
    } else {
      showToast(res.error || 'Failed to generate admission voucher', 'error');
    }
  };

  // Handle escape key: inner sub-modals take precedence, then close main modal
  useEscapeKey(() => {
    if (previewDoc) {
      setPreviewDoc(null);
    } else if (showAdmVoucherModal) {
      setShowAdmVoucherModal(false);
    } else {
      onClose();
    }
  }, true, 1);

  const studentClass = classes.find((c) => c.id === student.classId);
  const studentFamily = families.find((f) => f.id === student.familyId);

  const modalContent = (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-4 shrink-0">
          <div className="flex items-center gap-3.5">
            <StudentAvatar
              photoUrl={currentStudent.photoUrl}
              name={currentStudent.name}
              size="lg"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-slate-900">{currentStudent.name}</h3>
                <span className="font-mono bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-xs border border-slate-200">
                  {currentStudent.regNo}
                </span>
                <span
                  id="student-detail-header-status-badge"
                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    currentStudent.status === 'Active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : currentStudent.status === 'Graduated'
                      ? 'bg-indigo-100 text-indigo-800'
                      : currentStudent.status === 'Withdrawn'
                      ? 'bg-rose-100 text-rose-800'
                      : currentStudent.status === 'AutoDeactivated'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {currentStudent.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700">
                  Class: {studentClass?.name || 'Unassigned'}
                </span>
                <span>&bull;</span>
                <span>Enrolled: {currentStudent.admissionDate || 'N/A'}</span>
                {currentStudent.firstBillingMonth && (
                  <>
                    <span>&bull;</span>
                    <span className="text-teal-700 font-medium">
                      Billing from: {formatMonthName(currentStudent.firstBillingMonth)}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 shrink-0">
          <button
            type="button"
            id="tab-btn-student-details"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 py-2 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'border-teal-600 text-teal-700 bg-teal-50/40 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile & Particulars</span>
          </button>

          <button
            type="button"
            id="tab-btn-student-account-history"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 py-2 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'border-teal-600 text-teal-700 bg-teal-50/40 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Account History</span>
            {historyEntriesCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'history'
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {historyEntriesCount}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 pr-1 text-xs">
          {activeTab === 'profile' ? (
            <div className="space-y-4">
              {/* 1. Basic Information */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200/80 pb-2">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">1</span>
              Basic Information
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Student Name</span>
                <span className="font-bold text-slate-900 text-xs">{student.name}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Registration #</span>
                <span className="font-mono font-bold text-slate-900 text-xs">{student.regNo}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Date of Admission</span>
                <span className="font-bold text-slate-900 text-xs">{student.admissionDate || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">First Billing Month</span>
                <span className="font-bold text-teal-800 text-xs">
                  {student.firstBillingMonth ? formatMonthName(student.firstBillingMonth) : 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Class & Fee</span>
                <span className="font-bold text-slate-900 text-xs">
                  {studentClass?.name || 'N/A'} ({formatCurrency(studentClass?.monthlyFee || 0)}/mo)
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Discount in Fee</span>
                <span className="font-bold text-emerald-700 text-xs">
                  {formatCurrency(student.monthlyDiscount || 0)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Student Mobile</span>
                <span className="font-medium text-slate-900 text-xs">
                  {student.mobileNumber || 'Not provided'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Enrollment Status</span>
                <span className="font-bold text-slate-800 text-xs">{student.status}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Net Monthly Tuition</span>
                <span className="font-bold text-teal-800 text-xs">
                  {formatCurrency(Math.max(0, (studentClass?.monthlyFee || 0) - (student.monthlyDiscount || 0)))}
                </span>
              </div>
              {student.notes && (
                <div className="col-span-2 sm:col-span-4 pt-1 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Other Notes</span>
                  <p className="text-slate-700 text-xs mt-0.5 italic">{student.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* 2. Other Information */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200/80 pb-2">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">2</span>
              Other Information
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Date of Birth & Age</span>
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                  {student.dob}
                  {student.dob && (
                    <span className="text-teal-700 bg-teal-50 border border-teal-200/80 px-1.5 py-0.5 rounded font-semibold text-[11px]">
                      {calculateAge(student.dob)?.fullText || formatStudentAge(student.dob)}
                    </span>
                  )}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Gender</span>
                <span className="font-bold text-slate-900 text-xs">{student.gender || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Student ID / Birth Cert. No.</span>
                <span className="font-mono font-semibold text-slate-800 text-xs">
                  {student.studentNationalId || 'Not provided'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Family Link</span>
                {studentFamily ? (
                  <span className="inline-flex items-center gap-1 font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-xs mt-0.5">
                    <FolderKanban className="w-3 h-3" />
                    {studentFamily.familyNo} ({studentFamily.headName})
                  </span>
                ) : (
                  <span className="text-slate-400 italic text-xs">No Family Linked</span>
                )}
              </div>
              <div className="col-span-2 sm:col-span-4 pt-1 border-t border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Residential Address</span>
                <span className="text-slate-800 text-xs font-medium">
                  {student.address || 'Address not recorded'}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Father’s / Guardian’s Information */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200/80 pb-2">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">3</span>
              Father’s / Guardian’s Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Father Name</span>
                <span className="font-bold text-slate-900 text-xs">{student.fatherName}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Father’s National ID</span>
                <span className="font-mono font-semibold text-slate-800 text-xs">
                  {student.fatherNationalId || 'Not provided'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Mobile No</span>
                <span className="font-medium text-slate-900 text-xs">{student.fatherPhone}</span>
              </div>
            </div>
          </div>

          {/* 4. Mother’s Information */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200/80 pb-2">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">4</span>
              Mother’s Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Mother Name</span>
                <span className="font-bold text-slate-900 text-xs">
                  {student.motherName || 'Not recorded'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Mother’s National ID</span>
                <span className="font-mono font-semibold text-slate-800 text-xs">
                  {student.motherNationalId || 'Not provided'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Mobile No</span>
                <span className="font-medium text-slate-900 text-xs">
                  {student.motherPhone || 'Not recorded'}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Documents Upload */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200/80 pb-2">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">5</span>
              Documents Upload
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Document 1 */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">Document 1</span>
                  {student.document1?.fileData || student.document1?.name ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Uploaded
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Empty</span>
                  )}
                </div>
                <p className="font-semibold text-slate-700 truncate text-[11px]">
                  {student.document1?.name || 'Birth Certificate / Student ID'}
                </p>
                {student.document1?.fileData ? (
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() =>
                        setPreviewDoc({
                          title: student.document1?.name || 'Document 1',
                          fileData: student.document1?.fileData,
                          fileType: student.document1?.fileType,
                        })
                      }
                      className="px-2 py-1 bg-teal-50 text-teal-800 hover:bg-teal-100 rounded text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      Preview
                    </button>
                    <a
                      href={student.document1.fileData}
                      download={student.document1.name}
                      className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No file attached</p>
                )}
              </div>

              {/* Document 2 */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">Document 2</span>
                  {student.document2?.fileData || student.document2?.name ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Uploaded
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Empty</span>
                  )}
                </div>
                <p className="font-semibold text-slate-700 truncate text-[11px]">
                  {student.document2?.name || 'Leaving Certificate'}
                </p>
                {student.document2?.fileData ? (
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() =>
                        setPreviewDoc({
                          title: student.document2?.name || 'Document 2',
                          fileData: student.document2?.fileData,
                          fileType: student.document2?.fileType,
                        })
                      }
                      className="px-2 py-1 bg-teal-50 text-teal-800 hover:bg-teal-100 rounded text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      Preview
                    </button>
                    <a
                      href={student.document2.fileData}
                      download={student.document2.name}
                      className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No file attached</p>
                )}
              </div>

              {/* Document 3 */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">Document 3</span>
                  {student.document3?.fileData || student.document3?.name ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Uploaded
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Empty</span>
                  )}
                </div>
                <p className="font-semibold text-slate-700 truncate text-[11px]">
                  {student.document3?.name || 'National ID Copy / Other'}
                </p>
                {student.document3?.fileData ? (
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() =>
                        setPreviewDoc({
                          title: student.document3?.name || 'Document 3',
                          fileData: student.document3?.fileData,
                          fileType: student.document3?.fileType,
                        })
                      }
                      className="px-2 py-1 bg-teal-50 text-teal-800 hover:bg-teal-100 rounded text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      Preview
                    </button>
                    <a
                      href={student.document3.fileData}
                      download={student.document3.name}
                      className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No file attached</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <StudentAccountHistoryView student={currentStudent} />
      )}
    </div>

    {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                onClose();
                onViewLedger(student.id);
              }}
              className="px-3.5 py-2 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-teal-200"
            >
              <History className="w-3.5 h-3.5" />
              View Collections & Ledger
            </button>
            {hasPermission('fees.generate') && student.firstBillingMonth && (
              <button
                onClick={handleOpenAdmVoucher}
                className="px-3.5 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-amber-200"
              >
                <Receipt className="w-3.5 h-3.5" />
                Admission Voucher
              </button>
            )}
            {hasPermission('students.manage') && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(currentStudent);
                }}
                className="px-3.5 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-indigo-200"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit Profile
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Admission Voucher Modal */}
      {showAdmVoucherModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-2xl space-y-3.5 my-auto border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/80 shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      Generate Admission Voucher
                    </h3>
                    <span className="font-mono bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[11px] border border-slate-200">
                      {student.regNo}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Issue a one-time admission fee voucher for{' '}
                    <span className="font-semibold text-slate-700">{student.name}</span>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdmVoucherModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {admRangeInvalid ? (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold block text-amber-900 mb-0.5">
                      Admission Voucher Not Required
                    </span>
                    This student's admission date ({student.admissionDate || 'N/A'}) falls on or after their first billing month ({student.firstBillingMonth ? formatMonthName(student.firstBillingMonth) : ''}). Admission charges belong on regular monthly vouchers instead.
                  </div>
                </div>

                <div className="flex items-center justify-end border-t border-slate-100 pt-3.5">
                  <button
                    type="button"
                    onClick={() => setShowAdmVoucherModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Date & Due Date (compact two-column) */}
                <div className="bg-slate-50/70 rounded-xl border border-slate-200 p-3 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between h-5">
                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          Issue Month
                        </label>
                      </div>
                      <MonthPicker
                        value={admMonth}
                        onChange={handleAdmMonthChange}
                        variant="input"
                        minMonth={admMonthMin}
                        maxMonth={admMonthMax}
                        disabled={admRangeInvalid}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between h-5">
                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          Due Date
                        </label>
                        {admDueDate && (
                          <span className="text-[10px] leading-none font-semibold text-teal-700 bg-teal-50 px-1.5 py-0 rounded border border-teal-200/80 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            Default
                          </span>
                        )}
                      </div>
                      <DatePicker
                        value={admDueDate}
                        size="sm"
                        themeColor={themeConfig?.color || 'teal'}
                        onChange={(d) => {
                          setAdmDueDateTouched(true);
                          setAdmDueDate(d);
                        }}
                        idPrefix="adm-due-date-picker"
                        placeholder="Select Due Date"
                      />
                    </div>
                  </div>
                </div>

                {/* Existing Voucher Warning Banner */}
                {existingAdmVoucher && (
                  <div className="bg-rose-50 border border-rose-200/80 rounded-xl p-3 text-xs text-rose-800 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <span className="font-bold">Voucher Already Generated:</span> Voucher{' '}
                      <span className="font-mono font-bold">{existingAdmVoucher.voucherNo}</span> already exists
                      for {formatMonthName(admMonth)}. Please delete or reverse it before generating a new one.
                    </div>
                  </div>
                )}

                {/* Fee Particulars & Amounts */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Fee Particulars
                    </label>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      Saved as this student's template for {formatMonthName(admMonth)}
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <div className="px-3 py-1.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      <span>Particular Description</span>
                      <span className="w-28 text-right">Amount ({getCurrencyCode()})</span>
                    </div>
                    <div className="divide-y divide-slate-100 p-2 space-y-1.5">
                      {admItems.map((it) => (
                        <div key={it.kind} className="flex items-center gap-2 first:pt-0">
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={it.label}
                              onChange={(e) =>
                                setAdmItems((prev) =>
                                  prev.map((p) => (p.kind === it.kind ? { ...p, label: e.target.value } : p))
                                )
                              }
                              placeholder={it.defaultLabel}
                              className="w-full px-2.5 py-1 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 placeholder:text-slate-400 transition"
                            />
                          </div>
                          <div className="relative w-28 shrink-0">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                              {getCurrencyCode()}
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={it.amount}
                              onWheel={(e) => (e.target as HTMLElement).blur()}
                              onChange={(e) =>
                                setAdmItems((prev) =>
                                  prev.map((p) => (p.kind === it.kind ? { ...p, amount: e.target.value } : p))
                                )
                              }
                              placeholder="0"
                              className="w-full pl-8 pr-2.5 py-1 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 placeholder:text-slate-300 transition"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        Total Voucher Amount
                      </span>
                      <span className="font-mono font-extrabold text-amber-700 text-sm">
                        {formatCurrency(admTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAdmVoucherModal(false)}
                    className="px-3.5 py-1.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateAdmVoucher}
                    disabled={admGenerateDisabled}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-xs"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    {admTotal <= 0
                      ? 'Enter an Amount'
                      : existingAdmVoucher
                      ? 'Voucher Already Exists'
                      : 'Generate Voucher'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto border border-slate-200 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
              <h4 className="font-bold text-slate-900 text-sm truncate flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                {previewDoc.title}
              </h4>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center min-h-[300px] bg-slate-50 rounded-xl p-4 border border-slate-200">
              {previewDoc.fileData ? (
                previewDoc.fileType?.startsWith('image/') ? (
                  <img
                    src={previewDoc.fileData}
                    alt={previewDoc.title}
                    className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-xs"
                  />
                ) : (
                  <iframe
                    src={previewDoc.fileData}
                    title={previewDoc.title}
                    className="w-full h-[60vh] rounded-lg border border-slate-200"
                  />
                )
              ) : (
                <p className="text-slate-400 italic">No document file data attached to preview.</p>
              )}
            </div>

            <div className="flex justify-between items-center border-t border-slate-200 pt-3 shrink-0">
              {previewDoc.fileData ? (
                <a
                  href={previewDoc.fileData}
                  download={previewDoc.title}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                >
                  <Download className="w-4 h-4" />
                  Download File
                </a>
              ) : (
                <div />
              )}
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
