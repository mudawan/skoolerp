import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Student } from '../types';
import { formatCurrency, calculateAge, formatStudentAge, formatMonthName, getCurrentMonthString, getPreviousMonthString } from '../utils/feeMath';
import { StudentAvatar } from './StudentAvatar';
import { MonthPicker } from './MonthPicker';
import {
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
  const { classes, families, hasPermission, generateAdmissionVoucher, showToast, vouchers, activeMonth } = useApp();
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    fileData?: string;
    fileType?: string;
  } | null>(null);

  // Admission Voucher mini-modal state
  const [showAdmVoucherModal, setShowAdmVoucherModal] = useState(false);
  const [admMonth, setAdmMonth] = useState<string>(() => {
    // Default to the month of admission, or the current active month
    if (student.admissionDate) return student.admissionDate.substring(0, 7);
    return getCurrentMonthString();
  });

  // True when student has a future firstBillingMonth (i.e. admitted before classes start)
  const hasFutureBilling = !!(student.firstBillingMonth && student.firstBillingMonth > getCurrentMonthString());

  // Admission voucher month range: cannot be earlier than admission month,
  // and must fall strictly before the first regular tuition (billing) month
  // -- once billing starts, that month's balance belongs on the regular
  // monthly voucher instead.
  const admMonthMin = student.admissionDate ? student.admissionDate.substring(0, 7) : undefined;
  const admMonthMax = student.firstBillingMonth ? getPreviousMonthString(student.firstBillingMonth) : undefined;
  const admRangeInvalid = Boolean(admMonthMin && admMonthMax && admMonthMin > admMonthMax);

  // Check if admission voucher already issued for this student in chosen month
  const existingAdmVoucher = useMemo(
    () => vouchers.find((v) => v.studentId === student.id && v.month === admMonth && v.status !== 'Reversed'),
    [vouchers, student.id, admMonth]
  );

  const handleGenerateAdmVoucher = () => {
    const res = generateAdmissionVoucher(student.id, admMonth);
    if (res.success && res.voucher) {
      showToast(`Admission Voucher ${res.voucher.voucherNo} generated for ${formatMonthName(admMonth)}!`, 'success');
      setShowAdmVoucherModal(false);
    } else {
      showToast(res.error || 'Failed to generate admission voucher', 'error');
    }
  };

  const studentClass = classes.find((c) => c.id === student.classId);
  const studentFamily = families.find((f) => f.id === student.familyId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl space-y-5 my-6 max-h-[92vh] flex flex-col border border-slate-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-4 shrink-0">
          <div className="flex items-center gap-3.5">
            <StudentAvatar
              photoUrl={student.photoUrl}
              name={student.name}
              size="lg"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-slate-900">{student.name}</h3>
                <span className="font-mono bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-xs border border-slate-200">
                  {student.regNo}
                </span>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    student.status === 'Active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : student.status === 'AutoDeactivated'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {student.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700">
                  Class: {studentClass?.name || 'Unassigned'}
                </span>
                <span>&bull;</span>
                <span>Enrolled: {student.admissionDate || 'N/A'}</span>
                {student.firstBillingMonth && (
                  <>
                    <span>&bull;</span>
                    <span className="text-teal-700 font-medium">
                      Billing from: {formatMonthName(student.firstBillingMonth)}
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

        {/* Scrollable Content - 5 Boxed Sections */}
        <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
          
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
                  {student.firstBillingMonth ? `${formatMonthName(student.firstBillingMonth)} (${student.firstBillingMonth})` : 'Not specified'}
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
                <span className="font-bold text-slate-900 text-xs">{student.gender}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Student CNIC / B-Form</span>
                <span className="font-mono font-semibold text-slate-800 text-xs">
                  {student.bFormNo || 'Not provided'}
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
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Father’s CNIC</span>
                <span className="font-mono font-semibold text-slate-800 text-xs">
                  {student.fatherCnic || 'Not provided'}
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
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Mother’s CNIC</span>
                <span className="font-mono font-semibold text-slate-800 text-xs">
                  {student.motherCnic || 'Not provided'}
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
                  {student.document1?.name || 'Birth Certificate / B-Form'}
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
                  {student.document3?.name || 'CNIC Copy / Other'}
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
                onClick={() => setShowAdmVoucherModal(true)}
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
                  onEdit(student);
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
        <div className="fixed inset-0 z-70 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-600" />
              Generate Admission Voucher
            </h3>
            <p className="text-slate-500 text-xs leading-relaxed">
              Issue a one-time admission fee voucher for{' '}
              <span className="font-bold text-slate-700">{student.name}</span>. This voucher contains
              only admission charges (Admission Fee, Registration Fee, etc.) — no tuition or transport.
              Any unpaid balance will automatically carry forward to the first regular billing month.
            </p>

            {/* Month Picker */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                Issue for Month
              </label>
              <MonthPicker
                value={admMonth}
                onChange={setAdmMonth}
                variant="input"
                minMonth={admMonthMin}
                maxMonth={admMonthMax}
                disabled={admRangeInvalid}
              />
            </div>

            {/* Explain the allowed range */}
            {!admRangeInvalid && (admMonthMin || admMonthMax) && (
              <p className="text-[11px] text-slate-500">
                Allowed range:{' '}
                <span className="font-semibold text-slate-700">
                  {admMonthMin ? formatMonthName(admMonthMin) : 'Any month'}
                </span>{' '}
                through{' '}
                <span className="font-semibold text-slate-700">
                  {admMonthMax ? formatMonthName(admMonthMax) : 'Any month'}
                </span>
                {' '}(before {student.firstBillingMonth ? formatMonthName(student.firstBillingMonth) : 'billing starts'}).
              </p>
            )}

            {/* Range is empty: admission month is on/after first billing month, so
                there's no month left where a standalone admission voucher makes
                sense -- the regular monthly voucher already covers it. */}
            {admRangeInvalid && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <span className="font-bold">Not needed:</span> This student's admission month is on or
                after their first billing month ({formatMonthName(student.firstBillingMonth!)}). Use the
                regular monthly voucher generation for this student instead.
              </div>
            )}

            {/* Warn if voucher already exists */}
            {existingAdmVoucher && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800">
                <span className="font-bold">Blocked:</span> Voucher{' '}
                <span className="font-mono font-bold">{existingAdmVoucher.voucherNo}</span> already
                exists for {formatMonthName(admMonth)}. Delete or reverse it first.
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowAdmVoucherModal(false)}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateAdmVoucher}
                disabled={
                  !!existingAdmVoucher ||
                  admRangeInvalid ||
                  (!!admMonthMin && admMonth < admMonthMin) ||
                  (!!admMonthMax && admMonth > admMonthMax)
                }
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                {existingAdmVoucher ? 'Already Generated' : 'Confirm & Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
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
};
