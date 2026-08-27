import React from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import {
  AlertTriangle,
  Bus,
  FileText,
  History,
  Info,
  ShieldAlert,
  Trash2,
  Users,
  UserX,
  X,
} from 'lucide-react';

interface DeleteStudentModalProps {
  student: Student | null;
  bulkStudents?: Student[];
  onClose: () => void;
  onConfirmDelete: (studentId: string) => void;
  onConfirmBulkDelete?: (studentIds: string[]) => void;
  onViewLedger?: (studentId: string) => void;
}

export const DeleteConfirmationModal: React.FC<DeleteStudentModalProps> = ({
  student,
  bulkStudents,
  onClose,
  onConfirmDelete,
  onConfirmBulkDelete,
  onViewLedger,
}) => {
  const { vouchers, classes, transportAssignments, families, templates, updateStudent } = useApp();

  const isBulk = !!bulkStudents && bulkStudents.length > 0;

  // For single student
  const studentVouchers = student ? vouchers.filter((v) => v.studentId === student.id) : [];
  const hasVouchers = studentVouchers.length > 0;
  const studentClass = student ? classes.find((c) => c.id === student.classId) : null;
  
  // Linked Family Details
  const linkedFamily = student
    ? families.find((f) => f.memberStudentIds?.includes(student.id) || f.id === student.familyId)
    : null;
  const siblingCount = linkedFamily
    ? linkedFamily.memberStudentIds.filter((id) => id !== student?.id).length
    : 0;

  // Linked Transport Details
  const studentTransportAssignments = student
    ? transportAssignments.filter((a) => a.studentId === student.id)
    : [];
  const studentTransportCount = studentTransportAssignments.length;

  // Linked Fee Template Overrides
  const studentTemplateCount = student
    ? templates.filter((t) => t.studentId === student.id).length
    : 0;

  // For bulk students
  const bulkWithVouchers = isBulk
    ? bulkStudents.filter((s) => vouchers.some((v) => v.studentId === s.id))
    : [];
  const bulkDeletable = isBulk
    ? bulkStudents.filter((s) => !vouchers.some((v) => v.studentId === s.id))
    : [];

  const bulkLinkedFamilyCount = isBulk
    ? bulkDeletable.filter((s) =>
        families.some((f) => f.memberStudentIds?.includes(s.id) || f.id === s.familyId)
      ).length
    : 0;

  const bulkTransportAssignmentCount = isBulk
    ? transportAssignments.filter((a) => bulkDeletable.some((s) => s.id === a.studentId)).length
    : 0;

  const handleDeactivateInstead = () => {
    if (student) {
      updateStudent(student.id, { status: 'Inactive' });
      onClose();
    }
  };

  useEscapeKey(onClose, true);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 my-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isBulk ? `Delete ${bulkStudents.length} Students` : 'Delete Student Record'}
              </h3>
              <p className="text-xs text-slate-500">
                {isBulk
                  ? 'Confirm removal of selected student records'
                  : 'Permanently remove this student from the system'}
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

        {/* Single Student View */}
        {!isBulk && student && (
          <div className="space-y-4 text-xs">
            {/* Student Preview Card */}
            <div className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <StudentAvatar
                photoUrl={student.photoUrl}
                name={student.name}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-900 truncate text-sm">
                    {student.name}
                  </h4>
                  <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 font-bold text-[11px]">
                    {student.regNo}
                  </span>
                </div>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Class: <span className="font-semibold text-slate-700">{studentClass?.name || 'Unassigned'}</span> &bull; Father: <span className="font-semibold text-slate-700">{student.fatherName}</span>
                </p>
              </div>
            </div>

            {/* If vouchers exist -> Block deletion with clear explanation & alternatives */}
            {hasVouchers ? (
              <div className="space-y-3">
                <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl space-y-2">
                  <div className="flex items-start gap-2 text-amber-900 font-bold text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>Cannot Delete: Active Financial Records Exist</span>
                  </div>
                  <p className="text-amber-800 text-[11px] leading-relaxed">
                    This student has <strong>{studentVouchers.length} fee voucher record(s)</strong> attached in the system. To preserve audit and financial ledger integrity, students with existing vouchers cannot be permanently deleted.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="font-bold text-slate-800 text-xs block">
                    Recommended Actions:
                  </span>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleDeactivateInstead}
                      className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                    >
                      <UserX className="w-4 h-4 text-amber-600" />
                      Set Student Status to Inactive
                    </button>
                    {onViewLedger && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onViewLedger(student.id);
                        }}
                        className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <History className="w-4 h-4 text-teal-600" />
                        View Fee Collections & Ledger
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* No vouchers -> Safe to delete, show detailed Caution & Impact Summary */
              <div className="space-y-3">
                {/* Primary Alert */}
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-xs text-rose-950">
                      Permanent Deletion Warning
                    </p>
                    <p className="text-[11px] text-rose-800/90 leading-relaxed mt-0.5">
                      This action will permanently delete <strong>{student.name}</strong> from the student directory. This operation cannot be reversed.
                    </p>
                  </div>
                </div>

                {/* Structured Cascade Impact Caution Summary */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs uppercase tracking-wider">
                    <Info className="w-3.5 h-3.5 text-teal-700" />
                    <span>Cascade Deletion & Cleanup Summary</span>
                  </div>

                  <div className="space-y-2">
                    {/* Family Impact Note */}
                    <div className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-slate-200/80">
                      <div className="p-1 rounded-md bg-indigo-50 text-indigo-700 shrink-0 mt-0.5">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 text-[11px]">Linked Family Record</span>
                          {linkedFamily ? (
                            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                              Will Be Unlinked
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              Not Linked
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {linkedFamily ? (
                            <>
                              Student is enrolled in family <strong>{linkedFamily.headName || linkedFamily.familyNo}</strong>
                              {siblingCount > 0 && ` alongside ${siblingCount} sibling(s)`}. Deleting will remove this student from the family roster without deleting the family unit or other siblings.
                            </>
                          ) : (
                            'Student is not assigned to any multi-sibling family group.'
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Transport Assignment Impact Note */}
                    <div className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-slate-200/80">
                      <div className="p-1 rounded-md bg-amber-50 text-amber-700 shrink-0 mt-0.5">
                        <Bus className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 text-[11px]">Transport Assignments</span>
                          {studentTransportCount > 0 ? (
                            <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                              {studentTransportCount} Assignment(s) Purged
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              None Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {studentTransportCount > 0 ? (
                            <>
                              All <strong>{studentTransportCount} monthly bus/stop assignment(s)</strong> will be automatically purged so no orphan records or unassigned seats remain in the transport module.
                            </>
                          ) : (
                            'No active bus routes, vehicle stops, or transport fee allocations are assigned to this student.'
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Fee Structure / Override Note */}
                    {studentTemplateCount > 0 && (
                      <div className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-slate-200/80">
                        <div className="p-1 rounded-md bg-teal-50 text-teal-700 shrink-0 mt-0.5">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 text-[11px]">Custom Fee Overrides</span>
                            <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">
                              {studentTemplateCount} Override(s) Removed
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                            All custom student-specific fee particular overrides will be cleaned up.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bulk Students View */}
        {isBulk && bulkStudents && (
          <div className="space-y-4 text-xs">
            <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50 p-2">
              {bulkStudents.map((s) => {
                const sVouchers = vouchers.filter((v) => v.studentId === s.id);
                const hasV = sVouchers.length > 0;
                return (
                  <div key={s.id} className="py-1.5 flex items-center justify-between gap-2 px-1">
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 block truncate">{s.name}</span>
                      <span className="text-[10px] font-mono text-slate-500">{s.regNo}</span>
                    </div>
                    {hasV ? (
                      <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                        {sVouchers.length} vouchers (Blocked)
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                        Ready to delete
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {bulkWithVouchers.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  <span>{bulkWithVouchers.length} student(s) have linked fee vouchers</span>
                </div>
                <p>
                  Only students with 0 vouchers ({bulkDeletable.length}) can be permanently removed.
                </p>
              </div>
            )}

            {/* Bulk Cascade Caution Summary */}
            {bulkDeletable.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs uppercase tracking-wider">
                  <Info className="w-3.5 h-3.5 text-teal-700" />
                  <span>Bulk Deletion Caution Summary</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>
                      <strong>{bulkLinkedFamilyCount}</strong> student(s) will be unlinked from their respective family groups.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      <strong>{bulkTransportAssignmentCount}</strong> total transport assignment(s) will be automatically purged across all vehicles and stops.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
          >
            Cancel
          </button>

          {!isBulk && student && !hasVouchers && (
            <button
              type="button"
              onClick={() => {
                onConfirmDelete(student.id);
                onClose();
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Confirm Delete
            </button>
          )}

          {!isBulk && student && hasVouchers && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Close
            </button>
          )}

          {isBulk && onConfirmBulkDelete && (
            <button
              type="button"
              disabled={bulkDeletable.length === 0}
              onClick={() => {
                onConfirmBulkDelete(bulkDeletable.map((s) => s.id));
                onClose();
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Delete {bulkDeletable.length} Eligible
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
