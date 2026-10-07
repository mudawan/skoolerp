import { formatCurrency } from '../utils/feeMath';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AccountHistoryCategory, Student, StudentAccountHistoryEntry, StudentStatus } from '../types';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  ArrowRightLeft,
  Bus,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileCheck2,
  Filter,
  GraduationCap,
  History,
  Home,
  Info,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tag,
  User,
  UserCheck,
  UserMinus,
  UserX,
  X,
} from 'lucide-react';

interface StudentAccountHistoryViewProps {
  student: Student;
  onStatusUpdated?: (newStatus: StudentStatus) => void;
}

export const StudentAccountHistoryView: React.FC<StudentAccountHistoryViewProps> = ({
  student,
  onStatusUpdated,
}) => {
  const {
    getStudentAccountHistory,
    updateStudentStatus,
    showToast,
    classes,
    transportAssignments,
    stops,
    buses,
    hasPermission,
  } = useApp();

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AccountHistoryCategory | 'all'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [copied, setCopied] = useState(false);

  // Status Change Dialog state
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<StudentStatus>(student.status);
  const [statusReason, setStatusReason] = useState('');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);

  // Fetch full chronological account history
  const allEntries = useMemo(() => {
    return getStudentAccountHistory(student.id);
  }, [getStudentAccountHistory, student.id, student.status]);

  // Filtered & sorted entries
  const filteredEntries = useMemo(() => {
    let result = [...allEntries];

    // Category filter
    if (selectedCategory !== 'all') {
      result = result.filter((entry) => entry.category === selectedCategory);
    }

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter(
        (entry) =>
          entry.actionTitle.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q) ||
          entry.category.toLowerCase().includes(q) ||
          (entry.previousValue && entry.previousValue.toLowerCase().includes(q)) ||
          (entry.newValue && entry.newValue.toLowerCase().includes(q)) ||
          (entry.operatorName && entry.operatorName.toLowerCase().includes(q)) ||
          (entry.date && entry.date.includes(q))
      );
    }

    // Sort order
    result.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [allEntries, selectedCategory, searchTerm, sortOrder]);

  // Current transport assignment info for quick stats
  const activeTransport = useMemo(() => {
    const activeAsgn = transportAssignments.find(
      (a) => a.studentId === student.id && a.active !== false
    );
    if (!activeAsgn) return null;
    const stop = stops.find((s) => s.id === activeAsgn.stopId);
    const bus = buses.find((b) => b.id === activeAsgn.busId);
    return {
      stopName: stop?.name || 'Assigned Stop',
      busNumber: bus?.busNumber || 'Bus',
      routeName: bus?.routeName,
      fare: stop?.monthlyFare ? Math.max(0, stop.monthlyFare - (activeAsgn.discount || 0)) : 0,
      tripType: activeAsgn.tripType,
    };
  }, [transportAssignments, student.id, stops, buses]);

  // Quick category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allEntries.length,
      status: 0,
      transport: 0,
      academic: 0,
      discount: 0,
      enrollment: 0,
      family: 0,
    };
    for (const e of allEntries) {
      if (counts[e.category] !== undefined) {
        counts[e.category]++;
      }
    }
    return counts;
  }, [allEntries]);

  // Format date helper
  const formatEventDate = (timestamp: string, dateStr?: string) => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return dateStr || timestamp;
      }
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr || timestamp;
    }
  };

  const formatEventTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  // Handle status update submission
  const handleConfirmStatusChange = () => {
    if (targetStatus === student.status) {
      showToast(`Student is already ${student.status}.`, 'info');
      setIsStatusDialogOpen(false);
      return;
    }

    setIsSubmittingStatus(true);
    const res = updateStudentStatus(student.id, targetStatus, statusReason.trim() || undefined);
    setIsSubmittingStatus(false);

    if (res.success) {
      showToast(
        `Student status updated to '${targetStatus}' successfully.`,
        'success'
      );
      if (onStatusUpdated) {
        onStatusUpdated(targetStatus);
      }
      setIsStatusDialogOpen(false);
      setStatusReason('');
    } else {
      showToast(res.error || 'Failed to update student status.', 'error');
    }
  };

  // Export CSV of history
  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Date', 'Category', 'Action Title', 'Description', 'Previous Value', 'New Value', 'Operator', 'Role'];
    const rows = filteredEntries.map((e) => [
      `"${e.timestamp}"`,
      `"${e.date}"`,
      `"${e.category}"`,
      `"${e.actionTitle.replace(/"/g, '""')}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${(e.previousValue || '').replace(/"/g, '""')}"`,
      `"${(e.newValue || '').replace(/"/g, '""')}"`,
      `"${(e.operatorName || '').replace(/"/g, '""')}"`,
      `"${(e.operatorRole || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Account_History_${student.regNo}_${student.name.replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Account history exported to CSV.', 'success');
  };

  // Copy summary to clipboard
  const handleCopySummary = async () => {
    const lines = [
      `ACCOUNT HISTORY SUMMARY: ${student.name} (${student.regNo})`,
      `Current Status: ${student.status}`,
      `Total Logged Events: ${allEntries.length}`,
      `Generated on: ${new Date().toLocaleString()}`,
      `----------------------------------------------------`,
      ...filteredEntries.map(
        (e) =>
          `• [${e.date}] ${e.actionTitle}\n  ${e.description} (By: ${e.operatorName || 'System'})`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Account history copied to clipboard.', 'success');
    } catch {
      showToast('Unable to copy to clipboard.', 'error');
    }
  };

  // Helper to determine styling based on category and values
  const getCategoryTheme = (entry: StudentAccountHistoryEntry) => {
    switch (entry.category) {
      case 'status': {
        if (entry.newValue === 'Withdrawn') {
          return {
            badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
            dotBg: 'bg-rose-600 ring-rose-100',
            iconBg: 'bg-rose-50 text-rose-600 border-rose-200',
            icon: UserX,
            borderLeft: 'border-l-rose-500',
          };
        }
        if (entry.newValue === 'Active') {
          return {
            badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            dotBg: 'bg-emerald-600 ring-emerald-100',
            iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
            icon: UserCheck,
            borderLeft: 'border-l-emerald-500',
          };
        }
        if (entry.newValue === 'AutoDeactivated') {
          return {
            badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
            dotBg: 'bg-amber-600 ring-amber-100',
            iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
            icon: AlertTriangle,
            borderLeft: 'border-l-amber-500',
          };
        }
        return {
          badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
          dotBg: 'bg-slate-500 ring-slate-100',
          iconBg: 'bg-slate-50 text-slate-600 border-slate-200',
          icon: ArrowRightLeft,
          borderLeft: 'border-l-slate-400',
        };
      }
      case 'transport': {
        const isRemoved =
          entry.actionTitle.toLowerCase().includes('removed') ||
          entry.actionTitle.toLowerCase().includes('deactivated');
        if (isRemoved) {
          return {
            badgeBg: 'bg-red-100 text-red-800 border-red-200',
            dotBg: 'bg-red-600 ring-red-100',
            iconBg: 'bg-red-50 text-red-600 border-red-200',
            icon: Bus,
            borderLeft: 'border-l-red-500',
          };
        }
        return {
          badgeBg: 'bg-teal-100 text-teal-800 border-teal-200',
          dotBg: 'bg-teal-600 ring-teal-100',
          iconBg: 'bg-teal-50 text-teal-600 border-teal-200',
          icon: Bus,
          borderLeft: 'border-l-teal-500',
        };
      }
      case 'academic':
        return {
          badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
          dotBg: 'bg-indigo-600 ring-indigo-100',
          iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-200',
          icon: GraduationCap,
          borderLeft: 'border-l-indigo-500',
        };
      case 'discount':
        return {
          badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
          dotBg: 'bg-amber-600 ring-amber-100',
          iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
          icon: Tag,
          borderLeft: 'border-l-amber-500',
        };
      case 'enrollment':
        return {
          badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
          dotBg: 'bg-purple-600 ring-purple-100',
          iconBg: 'bg-purple-50 text-purple-600 border-purple-200',
          icon: FileCheck2,
          borderLeft: 'border-l-purple-500',
        };
      case 'family':
        return {
          badgeBg: 'bg-sky-100 text-sky-800 border-sky-200',
          dotBg: 'bg-sky-600 ring-sky-100',
          iconBg: 'bg-sky-50 text-sky-600 border-sky-200',
          icon: Home,
          borderLeft: 'border-l-sky-500',
        };
      default:
        return {
          badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
          dotBg: 'bg-slate-600 ring-slate-100',
          iconBg: 'bg-slate-50 text-slate-600 border-slate-200',
          icon: History,
          borderLeft: 'border-l-slate-400',
        };
    }
  };

  return (
    <div className="space-y-4 text-xs">
      {/* 1. Account Summary & Quick Transition Card */}
      <div className="bg-gradient-to-r from-slate-50 to-teal-50/40 border border-slate-200 rounded-xl p-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center shrink-0">
              <History className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">Account Lifecycle Log</span>
                <span
                  id="account-history-status-badge"
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                    student.status === 'Active'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : student.status === 'Graduated'
                      ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                      : student.status === 'Withdrawn'
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : student.status === 'AutoDeactivated'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  Status: {student.status}
                </span>
              </div>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Audit trail of student enrollment, lifecycle status transitions, and transport route modifications.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {hasPermission('students.manage') && (
              <button
                type="button"
                id="btn-open-change-status-modal"
                onClick={() => {
                  setTargetStatus(student.status);
                  setStatusReason('');
                  setIsStatusDialogOpen(true);
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Change Status
              </button>
            )}

            <button
              type="button"
              id="btn-copy-account-history"
              onClick={handleCopySummary}
              title="Copy history to clipboard"
              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg transition cursor-pointer shadow-2xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              id="btn-export-account-history-csv"
              onClick={handleExportCSV}
              title="Download history as CSV"
              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg transition cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick status attributes banner */}
        <div className="mt-3 pt-3 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="bg-white/80 p-2 rounded-lg border border-slate-200/70">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Registration</span>
            <span className="font-mono font-bold text-slate-800">{student.regNo}</span>
          </div>

          <div className="bg-white/80 p-2 rounded-lg border border-slate-200/70">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Current Transport</span>
            <span className="font-semibold text-slate-800 truncate block">
              {activeTransport ? (
                <span className="text-teal-700 flex items-center gap-1">
                  <Bus className="w-3 h-3 shrink-0" />
                  {activeTransport.busNumber} ({activeTransport.stopName})
                </span>
              ) : (
                <span className="text-slate-400 italic">No Active Transport</span>
              )}
            </span>
          </div>

          <div className="bg-white/80 p-2 rounded-lg border border-slate-200/70">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Class / Section</span>
            <span className="font-semibold text-slate-800 truncate block">
              {classes.find((c) => c.id === student.classId)?.name || 'Unassigned'}
            </span>
          </div>

          <div className="bg-white/80 p-2 rounded-lg border border-slate-200/70">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Monthly Concession</span>
            <span className="font-bold text-amber-700">
              {student.monthlyDiscount > 0 ? `${formatCurrency(student.monthlyDiscount)}/mo` : 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Filters & Search Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          {/* Search bar */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              id="input-account-history-search"
              placeholder="Search status, transport, operator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-teal-500 focus:bg-white transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Sort & Quick info */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <button
              type="button"
              id="btn-toggle-account-history-sort"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <ArrowDownUp className="w-3 h-3" />
              <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
            </button>

            <span className="text-[11px] text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{filteredEntries.length}</span> of {allEntries.length}
            </span>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filter:
          </span>

          <button
            type="button"
            id="filter-category-all"
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            All Events ({categoryCounts.all})
          </button>

          <button
            type="button"
            id="filter-category-status"
            onClick={() => setSelectedCategory('status')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
              selectedCategory === 'status'
                ? 'bg-rose-700 text-white shadow-2xs'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
            }`}
          >
            Status Changes ({categoryCounts.status})
          </button>

          <button
            type="button"
            id="filter-category-transport"
            onClick={() => setSelectedCategory('transport')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
              selectedCategory === 'transport'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200'
            }`}
          >
            Transport Routes ({categoryCounts.transport})
          </button>

          <button
            type="button"
            id="filter-category-academic"
            onClick={() => setSelectedCategory('academic')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
              selectedCategory === 'academic'
                ? 'bg-indigo-700 text-white shadow-2xs'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200'
            }`}
          >
            Class Transfers ({categoryCounts.academic})
          </button>

          <button
            type="button"
            id="filter-category-discount"
            onClick={() => setSelectedCategory('discount')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
              selectedCategory === 'discount'
                ? 'bg-amber-700 text-white shadow-2xs'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
            }`}
          >
            Discounts ({categoryCounts.discount})
          </button>

          <button
            type="button"
            id="filter-category-enrollment"
            onClick={() => setSelectedCategory('enrollment')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
              selectedCategory === 'enrollment'
                ? 'bg-purple-700 text-white shadow-2xs'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200'
            }`}
          >
            Enrollment ({categoryCounts.enrollment})
          </button>
        </div>
      </div>

      {/* 3. Chronological Event Timeline */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-10 px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <History className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">No account history entries found</h4>
            <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
              {searchTerm || selectedCategory !== 'all'
                ? 'Try adjusting your search query or removing the category filter to view logged records.'
                : 'No historical changes recorded yet for this student account.'}
            </p>
            {(searchTerm || selectedCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('all');
                }}
                className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {filteredEntries.map((entry, index) => {
              const theme = getCategoryTheme(entry);
              const CategoryIcon = theme.icon;

              return (
                <div
                  key={entry.id || index}
                  id={`account-history-entry-${entry.id}`}
                  className="relative group transition-all"
                >
                  {/* Timeline Dot */}
                  <div
                    className={`absolute -left-6 top-1 w-5 h-5 rounded-full ${theme.dotBg} ring-4 flex items-center justify-center text-white shadow-xs`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>

                  {/* Entry Card */}
                  <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 transition shadow-2xs space-y-2">
                    {/* Header line: Title, Category Badge & Timestamp */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`w-6 h-6 rounded-lg ${theme.iconBg} border flex items-center justify-center shrink-0`}
                        >
                          <CategoryIcon className="w-3.5 h-3.5" />
                        </span>
                        <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                          {entry.actionTitle}
                        </h5>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${theme.badgeBg}`}
                        >
                          {entry.category}
                        </span>
                      </div>

                      {/* Date & Time */}
                      <div className="flex items-center gap-2 text-slate-400 text-[11px] font-medium shrink-0">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {formatEventDate(entry.timestamp, entry.date)}
                        </span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formatEventTime(entry.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Detailed Description */}
                    <p className="text-slate-600 text-xs leading-relaxed pl-8">
                      {entry.description}
                    </p>

                    {/* Value Transition Visual Pill (if previous or new value exists) */}
                    {(entry.previousValue !== undefined || entry.newValue !== undefined) && (
                      <div className="pl-8 pt-1">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px]">
                          {entry.previousValue && (
                            <span className="font-medium text-slate-500 line-through">
                              {entry.previousValue}
                            </span>
                          )}
                          {entry.previousValue && entry.newValue && (
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                          )}
                          {entry.newValue && (
                            <span
                              className={`font-bold ${
                                entry.newValue === 'Withdrawn'
                                  ? 'text-rose-700'
                                  : entry.newValue === 'Active'
                                  ? 'text-emerald-700'
                                  : entry.newValue.toLowerCase().includes('removed')
                                  ? 'text-red-700'
                                  : 'text-slate-900'
                              }`}
                            >
                              {entry.newValue}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Footer: Operator & Context */}
                    <div className="pl-8 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>
                          Logged by:{' '}
                          <strong className="text-slate-700">{entry.operatorName || 'System'}</strong>
                          {entry.operatorRole && (
                            <span className="text-slate-400 ml-1">({entry.operatorRole})</span>
                          )}
                        </span>
                      </div>

                      {entry.month && (
                        <span className="font-medium text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 text-[10px]">
                          Billing Month: {entry.month}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Quick Status Change Modal */}
      {isStatusDialogOpen && (
        <div
          id="modal-change-student-status"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Update Student Status</h4>
                  <p className="text-[11px] text-slate-500">
                    {student.name} ({student.regNo})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStatusDialogOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current vs Target status selection */}
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  New Status
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(['Active', 'Withdrawn', 'Graduated', 'Inactive', 'AutoDeactivated'] as StudentStatus[]).map((st) => {
                    const isSelected = targetStatus === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        id={`btn-select-status-${st.toLowerCase()}`}
                        onClick={() => setTargetStatus(st)}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                          isSelected
                            ? st === 'Active'
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                              : st === 'Graduated'
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-950 font-bold ring-2 ring-indigo-500/20'
                              : st === 'Withdrawn'
                              ? 'bg-rose-50 border-rose-500 text-rose-950 font-bold ring-2 ring-rose-500/20'
                              : st === 'AutoDeactivated'
                              ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold ring-2 ring-amber-500/20'
                              : 'bg-slate-100 border-slate-400 text-slate-900 font-bold ring-2 ring-slate-400/20'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-xs">{st}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-current shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status explanation alert */}
              {targetStatus === 'Graduated' && (
                <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] flex items-start gap-2">
                  <GraduationCap className="w-4 h-4 shrink-0 text-indigo-600 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Graduation Notice</strong>
                    Marks student as graduated from the academy. Closes active billing cycles while preserving all historical fee records.
                  </div>
                </div>
              )}

              {targetStatus === 'Withdrawn' && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Withdrawn Notice</strong>
                    Marks student as withdrawn from the academy. Transport assignments and active tuition billing will be suspended.
                  </div>
                </div>
              )}

              {targetStatus === 'Active' && (student.status === 'Withdrawn' || student.status === 'Graduated') && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Re-activation Notice</strong>
                    Restores student account to active standing for fee voucher billing.
                  </div>
                </div>
              )}

              {/* Reason / Administrative remarks */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Reason / Administrative Note (Optional)
                </label>
                <textarea
                  id="input-status-change-reason"
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="e.g. Relocated out of city, fee clearance completed, medical absence, etc."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-teal-500 focus:bg-white resize-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsStatusDialogOpen(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-status-change"
                onClick={handleConfirmStatusChange}
                disabled={isSubmittingStatus}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isSubmittingStatus ? 'Updating...' : 'Record Status Change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
