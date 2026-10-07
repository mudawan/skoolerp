import React from 'react';
import { SchoolClass, Student, TransportAssignment, TransportBus, TransportStop } from '../../types';
import { formatCurrency, getDaysInMonth, getCurrencyCode } from '../../utils/feeMath';
import { StudentAvatar } from '../StudentAvatar';
import { Bus, X, Search, Check, ChevronsUpDown, CalendarDays } from 'lucide-react';

export interface AsgnFormData {
  studentId: string;
  busId: string;
  stopId: string;
  tripType: 'RoundTrip' | 'OneWay';
  daysCharged: number;
  discount: number;
  active: boolean;
}

interface AssignmentModalProps {
  show: boolean;
  onClose: () => void;
  editingAsgn: TransportAssignment | null;
  activeMonth: string;
  students: Student[];
  classes: SchoolClass[];
  transportAssignments: TransportAssignment[];
  buses: TransportBus[];
  stops: TransportStop[];
  asgnData: AsgnFormData;
  setAsgnData: React.Dispatch<React.SetStateAction<AsgnFormData>>;
  studentSearchQuery: string;
  setStudentSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  isStudentComboOpen: boolean;
  setIsStudentComboOpen: React.Dispatch<React.SetStateAction<boolean>>;
  studentComboRef: React.RefObject<HTMLDivElement>;
  onSelectStudent: (studentId: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({
  show,
  onClose,
  editingAsgn,
  activeMonth,
  students,
  classes,
  transportAssignments,
  buses,
  stops,
  asgnData,
  setAsgnData,
  studentSearchQuery,
  setStudentSearchQuery,
  isStudentComboOpen,
  setIsStudentComboOpen,
  studentComboRef,
  onSelectStudent,
  onSubmit,
}) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-fadeIn">
        {/* Modal Header */}
        <div className="px-6 py-3.5 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700 shrink-0">
              <Bus className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 leading-none">
                  {editingAsgn ? 'Edit Transport Assignment' : 'Assign Student Transport'}
                </h3>
                <span className="bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {editingAsgn ? editingAsgn.month : activeMonth}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Configure student route, stop fare, trip type, and monthly proration.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col text-xs">
          {/* Form Body - 2 Columns */}
          <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Column: Student & Fleet Configuration */}
            <div className="space-y-3.5">
              {/* Student Grouped Combobox */}
              {(() => {
                const targetMonth = editingAsgn ? editingAsgn.month : activeMonth;
                const activeStudentsList = students.filter((s) => s.status === 'Active');
                const q = studentSearchQuery.toLowerCase().trim();
                const filteredStudents = activeStudentsList.filter((s) => {
                  if (!q) return true;
                  const cls = classes.find((c) => c.id === s.classId);
                  return (
                    s.name.toLowerCase().includes(q) ||
                    s.regNo.toLowerCase().includes(q) ||
                    (cls?.name && cls.name.toLowerCase().includes(q))
                  );
                });

                const unassignedStudents = filteredStudents.filter(
                  (s) =>
                    !transportAssignments.some(
                      (a) => a.studentId === s.id && a.month === targetMonth && a.id !== editingAsgn?.id
                    )
                );

                const assignedStudents = filteredStudents.filter(
                  (s) =>
                    transportAssignments.some(
                      (a) => a.studentId === s.id && a.month === targetMonth && a.id !== editingAsgn?.id
                    )
                );

                const selectedStudent = students.find((s) => s.id === asgnData.studentId);
                const selectedClass = classes.find((c) => c.id === selectedStudent?.classId);
                const isSelectedAssigned = selectedStudent
                  ? transportAssignments.some(
                      (a) => a.studentId === selectedStudent.id && a.month === targetMonth && a.id !== editingAsgn?.id
                    )
                  : false;

                return (
                  <div className="relative space-y-1" ref={studentComboRef}>
                    <div className="flex items-center justify-between">
                      <label className="block font-bold text-slate-800">Student *</label>
                      {selectedStudent && (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            isSelectedAssigned
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {isSelectedAssigned ? 'Assigned' : 'Unassigned'}
                        </span>
                      )}
                    </div>

                    {/* Combobox Trigger Button */}
                    <button
                      type="button"
                      onClick={() => !editingAsgn && setIsStudentComboOpen((prev) => !prev)}
                      disabled={!!editingAsgn}
                      className={`w-full flex items-center justify-between p-2 bg-slate-50 border rounded-xl text-left transition cursor-pointer shadow-2xs ${
                        editingAsgn
                          ? 'border-slate-200 opacity-80 cursor-not-allowed bg-slate-100'
                          : isStudentComboOpen
                          ? 'border-teal-500 ring-2 ring-teal-500/20 bg-white'
                          : 'border-slate-200 hover:border-teal-400 hover:bg-white'
                      }`}
                    >
                      {selectedStudent ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <StudentAvatar photoUrl={selectedStudent.photoUrl} name={selectedStudent.name} size="xs" />
                          <div className="truncate">
                            <span className="font-bold text-slate-900 block truncate leading-tight">
                              {selectedStudent.name}
                            </span>
                            <span className="text-[10px] text-slate-500 leading-tight">
                              {selectedStudent.regNo} &bull; {selectedClass?.name || 'Class'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-500 py-0.5">
                          <Search className="w-4 h-4 text-teal-600 shrink-0" />
                          <span className="text-xs font-medium text-slate-600">
                            Select student here...
                          </span>
                        </div>
                      )}
                      {!editingAsgn && (
                        <ChevronsUpDown
                          className={`w-4 h-4 text-slate-400 shrink-0 ml-1 transition-transform duration-200 ${
                            isStudentComboOpen ? 'text-teal-600 rotate-180' : ''
                          }`}
                        />
                      )}
                    </button>

                    {/* Combobox Dropdown Popover */}
                    {isStudentComboOpen && !editingAsgn && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-fadeIn">
                        {/* Search Input Box */}
                        <div className="p-2 border-b border-slate-100 bg-slate-50/80">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search by name, roll # (e.g. 1001), class..."
                              value={studentSearchQuery}
                              onChange={(e) => setStudentSearchQuery(e.target.value)}
                              className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                            />
                            {studentSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setStudentSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Grouped Options List */}
                        <div className="max-h-48 overflow-y-auto scroll-smooth p-1 divide-y divide-slate-100">
                          {/* Group 1: Unassigned */}
                          <div className="sticky top-0 bg-slate-100/95 backdrop-blur-xs px-2.5 py-1 text-[11px] font-bold text-emerald-800 rounded-md flex items-center justify-between z-10 my-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              <span>Unassigned</span>
                            </div>
                            <span className="bg-emerald-200/80 text-emerald-900 px-1.5 py-0.2 text-[10px] rounded-full font-bold">
                              {unassignedStudents.length}
                            </span>
                          </div>

                          {unassignedStudents.length === 0 ? (
                            <div className="p-2 text-center text-slate-400 text-[11px] italic">
                              No unassigned students {studentSearchQuery ? 'matching search' : 'available'}
                            </div>
                          ) : (
                            unassignedStudents.map((s) => {
                              const cls = classes.find((c) => c.id === s.classId);
                              const isSelected = asgnData.studentId === s.id;
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    onSelectStudent(s.id);
                                    setIsStudentComboOpen(false);
                                  }}
                                  className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition cursor-pointer text-xs ${
                                    isSelected
                                      ? 'bg-teal-50 border border-teal-300 font-bold text-teal-950 shadow-2xs'
                                      : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <StudentAvatar photoUrl={s.photoUrl} name={s.name} size="xs" />
                                    <div className="truncate">
                                      <span className="font-semibold block truncate text-slate-900">{s.name}</span>
                                      <span className="text-[10px] text-slate-500">
                                        {s.regNo} &bull; {cls?.name || 'No Class'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 ml-2">
                                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-1.5 py-0.5 rounded font-medium">
                                      Unassigned
                                    </span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 ml-1" />}
                                  </div>
                                </button>
                              );
                            })
                          )}

                          {/* Group 2: Assigned - Update Assignment */}
                          <div className="sticky top-0 bg-slate-100/95 backdrop-blur-xs px-2.5 py-1 text-[11px] font-bold text-amber-800 rounded-md flex items-center justify-between z-10 my-0.5 mt-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              <span>Assigned</span>
                            </div>
                            <span className="bg-amber-200/80 text-amber-900 px-1.5 py-0.2 text-[10px] rounded-full font-bold">
                              {assignedStudents.length}
                            </span>
                          </div>

                          {assignedStudents.length === 0 ? (
                            <div className="p-2 text-center text-slate-400 text-[11px] italic">
                              No assigned students {studentSearchQuery ? 'matching search' : ''}
                            </div>
                          ) : (
                            assignedStudents.map((s) => {
                              const cls = classes.find((c) => c.id === s.classId);
                              const isSelected = asgnData.studentId === s.id;
                              const currentAsgn = transportAssignments.find(
                                (a) => a.studentId === s.id && a.month === targetMonth && a.id !== editingAsgn?.id
                              );
                              const bus = buses.find((b) => b.id === currentAsgn?.busId);
                              const stop = stops.find((sp) => sp.id === currentAsgn?.stopId);

                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    onSelectStudent(s.id);
                                    setIsStudentComboOpen(false);
                                  }}
                                  className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition cursor-pointer text-xs ${
                                    isSelected
                                      ? 'bg-amber-50 border border-amber-300 font-bold text-amber-950 shadow-2xs'
                                      : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <StudentAvatar photoUrl={s.photoUrl} name={s.name} size="xs" />
                                    <div className="truncate">
                                      <span className="font-semibold block truncate text-slate-900">{s.name}</span>
                                      <span className="text-[10px] text-slate-500">
                                        {s.regNo} &bull; {cls?.name || 'Class'} &bull;{' '}
                                        <span className="text-amber-700 font-medium">
                                          {bus?.busNumber || 'Bus'} ({stop?.name || 'Stop'})
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 ml-2">
                                    <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0.5 rounded font-medium">
                                      Assigned
                                    </span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-600 ml-1" />}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Bus & Stop Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bus *</label>
                  <select
                    value={asgnData.busId}
                    onChange={(e) => setAsgnData({ ...asgnData, busId: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  >
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.busNumber} - {b.routeName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Stop & Fare *</label>
                  <select
                    value={asgnData.stopId}
                    onChange={(e) => setAsgnData({ ...asgnData, stopId: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium"
                  >
                    {stops.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name} ({formatCurrency(sp.monthlyFare)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Trip Type Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Trip Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAsgnData({ ...asgnData, tripType: 'RoundTrip' })}
                    className={`p-2 rounded-xl border text-center font-semibold transition cursor-pointer text-xs ${
                      asgnData.tripType === 'RoundTrip'
                        ? 'bg-teal-50 border-teal-500 text-teal-900 ring-1 ring-teal-500'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    🔄 Round Trip (1.0×)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAsgnData({ ...asgnData, tripType: 'OneWay' })}
                    className={`p-2 rounded-xl border text-center font-semibold transition cursor-pointer text-xs ${
                      asgnData.tripType === 'OneWay'
                        ? 'bg-teal-50 border-teal-500 text-teal-900 ring-1 ring-teal-500'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    ➡️ One Way (0.5×)
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Billing, Proration & Calculation Summary */}
            {(() => {
              const targetMonth = editingAsgn ? editingAsgn.month : activeMonth;
              const totalDaysInMonth = getDaysInMonth(targetMonth);
              const selectedStop = stops.find((s) => s.id === asgnData.stopId);
              const baseFare = selectedStop ? selectedStop.monthlyFare : 0;
              const discount = Math.max(0, Number(asgnData.discount) || 0);
              const baseDiscounted = Math.max(0, baseFare - discount);
              const daysAvailed = Math.min(Math.max(Number(asgnData.daysCharged) || 0, 0), totalDaysInMonth);
              const tripFactor = asgnData.tripType === 'OneWay' ? 0.5 : 1.0;
              const calculatedFare = baseDiscounted * (daysAvailed / totalDaysInMonth) * tripFactor;

              return (
                <div className="space-y-3 flex flex-col justify-between">
                  {/* Days Availed & Discount Row */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block font-bold text-slate-700">Days Availed *</label>
                        <span className="text-[10px] text-slate-400 font-mono">Max: {totalDaysInMonth}d</span>
                      </div>
                      <div className="space-y-1">
                        <input
                          type="number"
                          min="0"
                          max={totalDaysInMonth}
                          value={asgnData.daysCharged}
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          onChange={(e) =>
                            setAsgnData({
                              ...asgnData,
                              daysCharged: Math.min(Math.max(Number(e.target.value) || 0, 0), totalDaysInMonth),
                            })
                          }
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                          placeholder="Days"
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setAsgnData({ ...asgnData, daysCharged: totalDaysInMonth })}
                            className={`flex-1 py-0.5 text-[10px] font-bold rounded border transition cursor-pointer ${
                              asgnData.daysCharged === totalDaysInMonth
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                            }`}
                          >
                            Full ({totalDaysInMonth}d)
                          </button>
                          <button
                            type="button"
                            onClick={() => setAsgnData({ ...asgnData, daysCharged: Math.round(totalDaysInMonth / 2) })}
                            className={`flex-1 py-0.5 text-[10px] font-bold rounded border transition cursor-pointer ${
                              asgnData.daysCharged === Math.round(totalDaysInMonth / 2)
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                            }`}
                          >
                            Half ({Math.round(totalDaysInMonth / 2)}d)
                          </button>
                          <button
                            type="button"
                            onClick={() => setAsgnData({ ...asgnData, daysCharged: 0 })}
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition cursor-pointer ${
                              asgnData.daysCharged === 0
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                            }`}
                          >
                            0d
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Discount ({getCurrencyCode()})</label>
                      <input
                        type="number"
                        min="0"
                        value={asgnData.discount}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) =>
                          setAsgnData({
                            ...asgnData,
                            discount: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        placeholder="0"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Pre-proration deduction</p>
                    </div>
                  </div>

                  {/* Live Calculation Summary Card */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-[11px] space-y-2">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600">
                      <div className="flex justify-between">
                        <span>Base Stop:</span>
                        <span className="font-semibold text-slate-800">{formatCurrency(baseFare)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Discount:</span>
                        <span className={`font-semibold ${discount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                          {discount > 0 ? formatCurrency(-discount) : formatCurrency(0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Days Prorated:</span>
                        <span className="font-semibold text-slate-800">
                          {daysAvailed}/{totalDaysInMonth}d ({((daysAvailed / totalDaysInMonth) * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trip Factor:</span>
                        <span className="font-semibold text-slate-800">
                          {asgnData.tripType === 'OneWay' ? '0.5×' : '1.0×'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-xs">Effective Monthly Fare:</span>
                      <span className="text-base font-extrabold text-teal-700">{formatCurrency(calculatedFare)}</span>
                    </div>
                    <div className="text-[9.5px] text-slate-400 font-mono text-center truncate">
                      ({baseFare} − {discount}) × ({daysAvailed}/{totalDaysInMonth}) × {tripFactor} = {formatCurrency(Math.round(calculatedFare))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-3 bg-slate-50/90 border-t border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
              <CalendarDays className="w-3.5 h-3.5 text-teal-600" />
              <span>Target Month: <strong className="text-slate-800">{editingAsgn ? editingAsgn.month : activeMonth}</strong></span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 transition cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{editingAsgn ? 'Update Assignment' : 'Save Assignment'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
