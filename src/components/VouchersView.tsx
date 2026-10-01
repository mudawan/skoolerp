import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { FeeVoucher, Student, Class, VoucherItem, VoucherStatus } from '../types';
import {
  formatCurrency,
  formatMonthName,
  getCurrentMonthString,
  roundUpToMultiple,
} from '../utils/feeMath';
import { RecordsPerPageSelector } from './RecordsPerPageSelector';
import { PrintVoucherModal } from './PrintVoucherModal';
import { VoucherParticularsEditor } from './VoucherParticularsEditor';
import { ExportPdfModal } from './ExportPdfModal';
import { CarryForwardModal } from './vouchers/CarryForwardModal';
import {
  FileText,
  Search,
  Filter,
  Plus,
  Printer,
  Edit2,
  Trash2,
  ArrowRight,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronDown,
  Layers,
} from 'lucide-react';

export const VouchersView: React.FC = () => {
  const {
    activeMonth,
    vouchers,
    students,
    classes,
    institute,
    bankAccounts,
    generateVouchers,
    deleteVoucher,
    updateVoucherParticulars,
    carryForwardDefaulter,
    revertCarryForward,
    roundingEnabled,
    roundingMultiple,
    defaultLateFeeRate,
    showToast,
  } = useApp();

  // Generation Controls
  const [isGenerating, setIsGenerating] = useState(false);
  const [genScope, setGenScope] = useState<'all' | 'class'>('all');
  const [genClassId, setGenClassId] = useState<string>('');
  const [genDueDate, setGenDueDate] = useState<string>('');

  // Table Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [recordsPerPage, setRecordsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortField, setSortField] = useState<'voucherNo' | 'regNo' | 'name' | 'class' | 'netDue' | 'status'>('voucherNo');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Modals State
  const [printModalVoucher, setPrintModalVoucher] = useState<FeeVoucher | null>(null);
  const [editingParticularsVoucher, setEditingParticularsVoucher] = useState<FeeVoucher | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [carryModalVoucher, setCarryModalVoucher] = useState<FeeVoucher | null>(null);

  // Active Month Vouchers
  const activeMonthVouchers = useMemo(() => {
    return vouchers.filter((v) => v.month === activeMonth);
  }, [vouchers, activeMonth]);

  // Students eligible for generation in activeMonth
  const ungeneratedStudents = useMemo(() => {
    const existingStudentIds = new Set(
      activeMonthVouchers.filter((v) => v.status !== 'Reversed').map((v) => v.studentId)
    );

    return students.filter((s) => {
      if (s.status !== 'Active') return false;
      if (existingStudentIds.has(s.id)) return false;
      if (genScope === 'class' && genClassId && s.classId !== genClassId) return false;
      if (s.firstBillingMonth && activeMonth < s.firstBillingMonth) return false;
      return true;
    });
  }, [students, activeMonthVouchers, activeMonth, genScope, genClassId]);

  // Filtered & Sorted Vouchers
  const filteredVouchers = useMemo(() => {
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const classMap = new Map(classes.map((c) => [c.id, c]));

    return activeMonthVouchers.filter((v) => {
      const student = studentMap.get(v.studentId);
      const classObj = classMap.get(v.classId);

      if (filterClassId !== 'all' && v.classId !== filterClassId) return false;
      if (filterStatus !== 'all' && v.status !== filterStatus) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesNo = v.voucherNo.toLowerCase().includes(q);
        const matchesName = (student?.name || '').toLowerCase().includes(q);
        const matchesReg = (student?.regNo || '').toLowerCase().includes(q);
        const matchesClass = (classObj?.name || '').toLowerCase().includes(q);
        if (!matchesNo && !matchesName && !matchesReg && !matchesClass) return false;
      }

      return true;
    }).sort((a, b) => {
      const sA = studentMap.get(a.studentId);
      const sB = studentMap.get(b.studentId);
      const cA = classMap.get(a.classId)?.name || '';
      const cB = classMap.get(b.classId)?.name || '';

      let comp = 0;
      if (sortField === 'voucherNo') comp = a.voucherNo.localeCompare(b.voucherNo, undefined, { numeric: true });
      else if (sortField === 'regNo') comp = (sA?.regNo || '').localeCompare(sB?.regNo || '', undefined, { numeric: true });
      else if (sortField === 'name') comp = (sA?.name || '').localeCompare(sB?.name || '');
      else if (sortField === 'class') comp = cA.localeCompare(cB);
      else if (sortField === 'netDue') comp = a.netDue - b.netDue;
      else if (sortField === 'status') comp = a.status.localeCompare(b.status);

      return sortAsc ? comp : -comp;
    });
  }, [activeMonthVouchers, students, classes, filterClassId, filterStatus, searchTerm, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredVouchers.length / recordsPerPage));
  const paginatedVouchers = useMemo(() => {
    const start = (currentPage - 1) * recordsPerPage;
    return filteredVouchers.slice(start, start + recordsPerPage);
  }, [filteredVouchers, currentPage, recordsPerPage]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await generateVouchers({
        month: activeMonth,
        scope: genScope,
        classId: genScope === 'class' ? genClassId : undefined,
        dueDate: genDueDate || undefined,
      });
      if (res?.success) {
        showToast(`Successfully generated ${res.generatedCount} fee voucher(s)!`, 'success');
      } else {
        showToast(res?.error || 'Failed to generate vouchers', 'error');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card: Generation & Stats */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-600" />
              <h2 className="text-base font-bold text-slate-900">
                Fee Vouchers &bull; {formatMonthName(activeMonth)}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Generate, print, audit, and manage student fee vouchers with strict monotonic numbering.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDFs
            </button>
          </div>
        </div>

        {/* Generation Action Bar */}
        <div className="bg-teal-50/50 p-4 rounded-xl border border-teal-200/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-teal-950 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-teal-600" />
              Generate Vouchers:
            </span>

            <select
              value={genScope}
              onChange={(e) => setGenScope(e.target.value as any)}
              className="px-2.5 py-1.5 bg-white border border-teal-300 rounded-lg font-bold text-teal-900 focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Classes</option>
              <option value="class">Specific Class</option>
            </select>

            {genScope === 'class' && (
              <select
                value={genClassId}
                onChange={(e) => setGenClassId(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-teal-300 rounded-lg font-bold text-teal-900 focus:ring-2 focus:ring-teal-500"
              >
                <option value="">-- Select Class --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="font-semibold text-[11px]">Due Date:</span>
              <input
                type="date"
                value={genDueDate}
                onChange={(e) => setGenDueDate(e.target.value)}
                className="px-2 py-1 bg-white border border-teal-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={isGenerating || ungeneratedStudents.length === 0}
            onClick={handleGenerate}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>
              {isGenerating
                ? 'Generating...'
                : ungeneratedStudents.length > 0
                ? `Generate ${ungeneratedStudents.length} Voucher(s)`
                : 'All Generated'}
            </span>
          </button>
        </div>
      </div>

      {/* Vouchers Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by student, reg #, or voucher #..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterClassId}
              onChange={(e) => {
                setFilterClassId(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Statuses</option>
              <option value="Issued">Issued (Unpaid)</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Fully Paid</option>
              <option value="Carried">Carried Forward</option>
              <option value="Reversed">Reversed</option>
            </select>

            <RecordsPerPageSelector
              value={recordsPerPage}
              onChange={(v) => {
                setRecordsPerPage(v);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 select-none">
              <tr>
                <th onClick={() => handleSort('voucherNo')} className="p-3 cursor-pointer hover:text-teal-700">
                  Voucher #
                </th>
                <th onClick={() => handleSort('regNo')} className="p-3 cursor-pointer hover:text-teal-700">
                  Reg #
                </th>
                <th onClick={() => handleSort('name')} className="p-3 cursor-pointer hover:text-teal-700">
                  Student Name
                </th>
                <th onClick={() => handleSort('class')} className="p-3 cursor-pointer hover:text-teal-700">
                  Class
                </th>
                <th onClick={() => handleSort('netDue')} className="p-3 text-right cursor-pointer hover:text-teal-700">
                  Net Due
                </th>
                <th className="p-3 text-right">Paid</th>
                <th onClick={() => handleSort('status')} className="p-3 cursor-pointer hover:text-teal-700">
                  Status
                </th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedVouchers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No fee vouchers found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedVouchers.map((v) => {
                  const student = students.find((s) => s.id === v.studentId);
                  const classObj = classes.find((c) => c.id === v.classId);
                  const isCarried = v.status === 'Carried';
                  const isPaid = v.status === 'Paid';

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-3 font-mono font-bold text-teal-800">{v.voucherNo}</td>
                      <td className="p-3 font-mono text-slate-600">{student?.regNo || '—'}</td>
                      <td className="p-3 font-bold text-slate-900">{student?.name || 'Unknown'}</td>
                      <td className="p-3 text-slate-700">{classObj?.name || '—'}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(v.netDue)}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-emerald-700">
                        {v.amountPaid > 0 ? formatCurrency(v.amountPaid) : '—'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800'
                              : v.status === 'Partial'
                              ? 'bg-blue-100 text-blue-800'
                              : isCarried
                              ? 'bg-indigo-100 text-indigo-800'
                              : v.status === 'Reversed'
                              ? 'bg-slate-100 text-slate-600 line-through'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setPrintModalVoucher(v)}
                            title="Print Voucher"
                            className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-teal-700 transition cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {!isCarried && v.status !== 'Reversed' && (
                            <button
                              onClick={() => setEditingParticularsVoucher(v)}
                              title="Edit Particulars"
                              className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!isPaid && !isCarried && v.status !== 'Reversed' && (
                            <button
                              onClick={() => setCarryModalVoucher(v)}
                              title="Carry Forward Balance"
                              className="p-1 rounded-lg hover:bg-amber-100 text-amber-600 hover:text-amber-800 transition cursor-pointer"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isCarried && (
                            <button
                              onClick={() => {
                                revertCarryForward(v.id);
                                showToast(`Reverted carry forward for #${v.voucherNo}`, 'success');
                              }}
                              title="Revert Carry Forward"
                              className="p-1 rounded-lg hover:bg-indigo-100 text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {v.amountPaid === 0 && (
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete voucher #${v.voucherNo}?`)) {
                                  deleteVoucher(v.id);
                                  showToast(`Voucher #${v.voucherNo} deleted`, 'info');
                                }
                              }}
                              title="Delete Voucher"
                              className="p-1 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredVouchers.length > 0 && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing {(currentPage - 1) * recordsPerPage + 1} to{' '}
              {Math.min(currentPage * recordsPerPage, filteredVouchers.length)} of {filteredVouchers.length} vouchers
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition cursor-pointer"
              >
                Previous
              </button>
              <span className="px-2 text-slate-700 font-bold">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Print Voucher Modal */}
      {printModalVoucher && (
        <PrintVoucherModal
          voucher={printModalVoucher}
          onClose={() => setPrintModalVoucher(null)}
        />
      )}

      {/* Particulars Editor Modal */}
      {editingParticularsVoucher && (
        <VoucherParticularsEditor
          voucher={editingParticularsVoucher}
          onClose={() => setEditingParticularsVoucher(null)}
          onSave={(items) => {
            updateVoucherParticulars(editingParticularsVoucher.id, items);
            setEditingParticularsVoucher(null);
            showToast('Voucher particulars updated successfully!', 'success');
          }}
        />
      )}

      {/* Carry Forward Modal */}
      {carryModalVoucher && (
        <CarryForwardModal
          isOpen={!!carryModalVoucher}
          voucher={carryModalVoucher}
          student={students.find((s) => s.id === carryModalVoucher.studentId)}
          onClose={() => setCarryModalVoucher(null)}
          onConfirm={(targetMonth, addLateFine, customFine) => {
            carryForwardDefaulter(carryModalVoucher.id, targetMonth, addLateFine, customFine);
            setCarryModalVoucher(null);
            showToast(`Voucher #${carryModalVoucher.voucherNo} carried forward to ${formatMonthName(targetMonth)}!`, 'success');
          }}
        />
      )}

      {/* Bulk PDF Export Modal */}
      {showExportModal && (
        <ExportPdfModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
};
