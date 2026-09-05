import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { AuditActionType, AuditLogEntry } from '../types';
import { formatCurrency, formatMonthName } from '../utils/feeMath';
import { downloadCsv } from '../utils/csv';
import { ConfirmModal } from './ConfirmModal';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coins,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  History,
  KeyRound,
  Layers,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

interface AuditTrailViewProps {
  initialFilter?: 'all' | 'fines' | 'bulk' | 'reversals' | 'security';
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({ initialFilter = 'all' }) => {
  const {
    auditLogs,
    users,
    currentUser,
    hasPermission,
    clearAuditLogs,
    institute,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActionType, setSelectedActionType] = useState<string>('all');
  const [selectedOperator, setSelectedOperator] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'fines' | 'bulk' | 'reversals' | 'security'>(initialFilter);
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLogEntry | null>(null);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sorting
  type SortField = 'timestamp' | 'operator' | 'action' | 'target' | 'amount';
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Distinct Filter Options
  const distinctOperators = useMemo(() => {
    const map = new Map<string, { id: string; username: string; name: string }>();
    auditLogs.forEach((log) => {
      if (!map.has(log.operatorUsername)) {
        map.set(log.operatorUsername, {
          id: log.operatorId,
          username: log.operatorUsername,
          name: log.operatorName,
        });
      }
    });
    return Array.from(map.values());
  }, [auditLogs]);

  const distinctMonths = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach((log) => {
      if (log.month) set.add(log.month);
    });
    return Array.from(set).sort().reverse();
  }, [auditLogs]);

  // Filtered & Sorted Audit Logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      // Quick filter
      if (quickFilter === 'fines' && log.actionType !== 'fine_modification') return false;
      if (quickFilter === 'bulk' && log.actionType !== 'bulk_collection') return false;
      if (quickFilter === 'reversals' && log.actionType !== 'collection_reversal' && log.actionType !== 'carry_forward') return false;
      if (quickFilter === 'security' && log.actionType !== 'operator_security' && log.actionType !== 'system_cleanup') return false;

      // Dropdown filters
      if (selectedActionType !== 'all' && log.actionType !== selectedActionType) return false;
      if (selectedOperator !== 'all' && log.operatorUsername !== selectedOperator && log.operatorId !== selectedOperator) return false;
      if (selectedModule !== 'all' && log.module !== selectedModule) return false;
      if (selectedMonth !== 'all' && log.month !== selectedMonth) return false;

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesQuery =
          log.actionTitle.toLowerCase().includes(query) ||
          log.description.toLowerCase().includes(query) ||
          log.operatorName.toLowerCase().includes(query) ||
          log.operatorUsername.toLowerCase().includes(query) ||
          (log.targetId && log.targetId.toLowerCase().includes(query)) ||
          (log.targetLabel && log.targetLabel.toLowerCase().includes(query)) ||
          (log.month && log.month.toLowerCase().includes(query));

        if (!matchesQuery) return false;
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'timestamp') {
        comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else if (sortField === 'operator') {
        comparison = a.operatorName.localeCompare(b.operatorName);
      } else if (sortField === 'action') {
        comparison = a.actionTitle.localeCompare(b.actionTitle);
      } else if (sortField === 'target') {
        comparison = (a.targetLabel || '').localeCompare(b.targetLabel || '');
      } else if (sortField === 'amount') {
        comparison = (a.amount || 0) - (b.amount || 0);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [auditLogs, quickFilter, selectedActionType, selectedOperator, selectedModule, selectedMonth, searchTerm, sortField, sortDirection]);

  // Summary Metrics
  const stats = useMemo(() => {
    const fineModCount = auditLogs.filter((l) => l.actionType === 'fine_modification').length;
    const fineModTotal = auditLogs
      .filter((l) => l.actionType === 'fine_modification')
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    const bulkCount = auditLogs.filter((l) => l.actionType === 'bulk_collection').length;
    const bulkTotalAmount = auditLogs
      .filter((l) => l.actionType === 'bulk_collection')
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    const collectionCount = auditLogs.filter((l) => l.actionType === 'collection_payment').length;
    const securityCount = auditLogs.filter((l) => l.actionType === 'operator_security').length;

    return {
      total: auditLogs.length,
      fineModCount,
      fineModTotal,
      bulkCount,
      bulkTotalAmount,
      collectionCount,
      securityCount,
    };
  }, [auditLogs]);

  // Export to CSV
  const handleExportCsv = () => {
    if (!hasPermission('audit.export') && !hasPermission('audit.view')) return;

    const headers = [
      'Log ID',
      'Timestamp (ISO)',
      'Timestamp (Formatted)',
      'Action Type',
      'Action Title',
      'Operator Name',
      'Operator Username',
      'Operator Role',
      'Module',
      'Target ID',
      'Target Label',
      'Billing Month',
      'Amount (PKR)',
      'Previous Value',
      'New Value',
      'Description',
    ];

    const rows = filteredLogs.map((log) => [
      log.id,
      log.timestamp,
      new Date(log.timestamp).toLocaleString(),
      log.actionType,
      log.actionTitle,
      log.operatorName,
      log.operatorUsername,
      log.operatorRole,
      log.module,
      log.targetId || '',
      log.targetLabel || '',
      log.month || '',
      log.amount !== undefined ? String(log.amount) : '',
      log.previousValue !== undefined ? String(log.previousValue) : '',
      log.newValue !== undefined ? String(log.newValue) : '',
      log.description.replace(/"/g, '""'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const filename = `audit_trail_export_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCsv(csvContent, filename);
  };

  // Helper badge color & icon for Action Types
  const getActionBadge = (type: AuditActionType) => {
    switch (type) {
      case 'fine_modification':
        return {
          icon: <Coins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
          label: 'Fine Modification',
          badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        };
      case 'bulk_collection':
        return {
          icon: <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
          label: 'Bulk CSV Collection',
          badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        };
      case 'collection_payment':
        return {
          icon: <Receipt className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />,
          label: 'Payment Collection',
          badgeClass: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
        };
      case 'collection_reversal':
        return {
          icon: <RotateCcw className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
          label: 'Collection Reversal',
          badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        };
      case 'carry_forward':
        return {
          icon: <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />,
          label: 'Carry Forward',
          badgeClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        };
      case 'voucher_edit':
        return {
          icon: <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />,
          label: 'Voucher Edit',
          badgeClass: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        };
      case 'voucher_generation':
        return {
          icon: <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />,
          label: 'Voucher Generation',
          badgeClass: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        };
      case 'voucher_deletion':
        return {
          icon: <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
          label: 'Voucher Deletion',
          badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        };
      case 'operator_security':
        return {
          icon: <Shield className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />,
          label: 'Operator Security',
          badgeClass: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
        };
      case 'system_cleanup':
        return {
          icon: <Activity className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />,
          label: 'System Cleanup',
          badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
        };
      default:
        return {
          icon: <Activity className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />,
          label: type,
          badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
        };
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'Accountant':
        return 'bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800';
      case 'Viewer':
        return 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  const formatLogDate = (timestamp: string) => {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return timestamp;
    return {
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  };

  return (
    <div id="audit-trail-container" className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-6 h-6 text-teal-600 dark:text-teal-400 shrink-0" />
            Audit Trail & Operator Accountability
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Forensic tracking for manual fine adjustments, bulk CSV collections, reversals, and operator authorization privileges.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasPermission('audit.export') && (
            <button
              id="btn-export-audit-csv"
              onClick={handleExportCsv}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition disabled:opacity-50 cursor-pointer shadow-2xs"
              title="Export filtered audit logs to CSV"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export CSV ({filteredLogs.length})</span>
            </button>
          )}

          <button
            id="btn-print-audit-report"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer shadow-2xs"
            title="Print Audit Report"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Print</span>
          </button>

          {currentUser.role === 'Admin' && (
            <button
              id="btn-clear-audit-logs"
              onClick={() => setShowClearConfirmModal(true)}
              disabled={auditLogs.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-rose-700 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800 transition disabled:opacity-40 cursor-pointer shadow-2xs"
              title="Purge audit logs (Admin only)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Purge</span>
            </button>
          )}
        </div>
      </div>

      {/* Accountability KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div
            onClick={() => setQuickFilter('fines')}
            className={`p-4 rounded-xl border transition cursor-pointer ${
              quickFilter === 'fines'
                ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 ring-2 ring-amber-500/20'
                : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:bg-amber-50/40 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Manual Fine Mod.</span>
              <Coins className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
              {stats.fineModCount} <span className="text-xs font-normal text-slate-500">events</span>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 font-medium">
              Rs {stats.fineModTotal.toLocaleString()} adjusted
            </p>
          </div>

          <div
            onClick={() => setQuickFilter('bulk')}
            className={`p-4 rounded-xl border transition cursor-pointer ${
              quickFilter === 'bulk'
                ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-500/20'
                : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:bg-emerald-50/40 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Bulk Collections</span>
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
              {stats.bulkCount} <span className="text-xs font-normal text-slate-500">batches</span>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
              Rs {stats.bulkTotalAmount.toLocaleString()} imported
            </p>
          </div>

          <div
            onClick={() => setQuickFilter('reversals')}
            className={`p-4 rounded-xl border transition cursor-pointer ${
              quickFilter === 'reversals'
                ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 ring-2 ring-rose-500/20'
                : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:bg-rose-50/40 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Reversals & Carry</span>
              <RotateCcw className="w-4 h-4 text-rose-500" />
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
              {auditLogs.filter((l) => l.actionType === 'collection_reversal' || l.actionType === 'carry_forward').length}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ledger adjustments
            </p>
          </div>

          <div
            onClick={() => setQuickFilter('security')}
            className={`p-4 rounded-xl border transition cursor-pointer ${
              quickFilter === 'security'
                ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700 ring-2 ring-purple-500/20'
                : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:bg-purple-50/40 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Security & Roles</span>
              <Shield className="w-4 h-4 text-purple-500" />
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
              {stats.securityCount}
            </div>
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5 font-medium">
              Operator changes
            </p>
          </div>
        </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
        {/* Quick Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-b border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setQuickFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
              quickFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-teal-600 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            All Activity ({auditLogs.length})
          </button>
          <button
            onClick={() => setQuickFilter('fines')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              quickFilter === 'fines'
                ? 'bg-amber-600 text-white'
                : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            Manual Fine Modifications ({stats.fineModCount})
          </button>
          <button
            onClick={() => setQuickFilter('bulk')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              quickFilter === 'bulk'
                ? 'bg-emerald-600 text-white'
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Bulk CSV Collections ({stats.bulkCount})
          </button>
          <button
            onClick={() => setQuickFilter('reversals')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              quickFilter === 'reversals'
                ? 'bg-rose-600 text-white'
                : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reversals & Defaulters
          </button>
          <button
            onClick={() => setQuickFilter('security')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              quickFilter === 'security'
                ? 'bg-purple-600 text-white'
                : 'text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Security & Permissions ({stats.securityCount})
          </button>
        </div>

        {/* Detailed Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Search Box */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-audit-search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by student, voucher, operator, description..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Type Filter */}
          <div>
            <select
              id="select-audit-action-type"
              value={selectedActionType}
              onChange={(e) => setSelectedActionType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All Action Types</option>
              <option value="fine_modification">Fine Modification</option>
              <option value="bulk_collection">Bulk CSV Collection</option>
              <option value="collection_payment">Single Payment Received</option>
              <option value="collection_reversal">Collection Reversal</option>
              <option value="carry_forward">Defaulter Carry Forward</option>
              <option value="voucher_generation">Voucher Generation</option>
              <option value="voucher_edit">Voucher Edit</option>
              <option value="voucher_deletion">Voucher Deletion</option>
              <option value="operator_security">Operator Security</option>
              <option value="system_cleanup">System Cleanup</option>
            </select>
          </div>

          {/* Operator Filter */}
          <div>
            <select
              id="select-audit-operator"
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All Operators ({distinctOperators.length})</option>
              {distinctOperators.map((op) => (
                <option key={op.username} value={op.username}>
                  @{op.username} ({op.name})
                </option>
              ))}
            </select>
          </div>

          {/* Billing Month Filter */}
          <div>
            <select
              id="select-audit-month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All Months</option>
              {distinctMonths.map((m) => (
                <option key={m} value={m}>
                  {formatMonthName(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Audit Logs Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Activity Log Entries ({filteredLogs.length} matching)
          </div>
          {(quickFilter !== 'all' || selectedActionType !== 'all' || selectedOperator !== 'all' || selectedMonth !== 'all' || searchTerm) && (
            <button
              onClick={() => {
                setQuickFilter('all');
                setSelectedActionType('all');
                setSelectedOperator('all');
                setSelectedMonth('all');
                setSearchTerm('');
              }}
              className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 font-medium flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Reset Filters
            </button>
          )}
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <History className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No Activity Logs Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
              {searchTerm || quickFilter !== 'all' || selectedActionType !== 'all'
                ? 'No audit log entries match your selected filter criteria. Try clearing some filters.'
                : 'No system activity has been logged yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-medium select-none">
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-white"
                    onClick={() => handleSort('timestamp')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Date & Time</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-white"
                    onClick={() => handleSort('operator')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Attributed Operator</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-white"
                    onClick={() => handleSort('action')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Action & Type</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-white"
                    onClick={() => handleSort('target')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Subject / Target</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4">Summary & Description</th>
                  <th
                    className="py-3 px-4 text-right cursor-pointer hover:text-slate-800 dark:hover:text-white"
                    onClick={() => handleSort('amount')}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Amount / Value</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredLogs.map((log) => {
                  const badge = getActionBadge(log.actionType);
                  const formattedDate = formatLogDate(log.timestamp);

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition group"
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {typeof formattedDate === 'object' ? formattedDate.date : formattedDate}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {typeof formattedDate === 'object' ? formattedDate.time : ''}
                        </div>
                      </td>

                      {/* Operator */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center text-xs">
                            {log.operatorName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                              {log.operatorName}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                @{log.operatorUsername}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${getRoleBadge(
                                  log.operatorRole
                                )}`}
                              >
                                {log.operatorRole}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Action & Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${badge.badgeClass}`}
                        >
                          {badge.icon}
                          {badge.label}
                        </span>
                      </td>

                      {/* Subject / Target */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.targetLabel ? (
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">
                              {log.targetLabel}
                            </div>
                            {log.targetId && log.targetId !== log.targetLabel && (
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                {log.targetId}
                              </div>
                            )}
                          </div>
                        ) : log.targetId ? (
                          <div className="font-mono text-slate-700 dark:text-slate-300 font-medium">
                            {log.targetId}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                        {log.month && (
                          <span className="inline-block mt-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 px-1.5 py-0.2 rounded border border-teal-200 dark:border-teal-800">
                            {formatMonthName(log.month)}
                          </span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="py-3 px-4 min-w-[240px] max-w-md">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {log.actionTitle}
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                          {log.description}
                        </p>
                      </td>

                      {/* Amount / Value */}
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-semibold">
                        {log.amount !== undefined ? (
                          <div
                            className={
                              log.actionType === 'fine_modification'
                                ? 'text-amber-600 dark:text-amber-400'
                                : log.actionType === 'collection_reversal'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }
                          >
                            Rs {log.amount.toLocaleString()}
                          </div>
                        ) : log.newValue !== undefined ? (
                          <div className="text-slate-700 dark:text-slate-300 text-xs">
                            {String(log.newValue)}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-normal">—</span>
                        )}
                      </td>

                      {/* Inspect Button */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLogForDetails(log)}
                          className="p-1.5 text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50 rounded-lg transition cursor-pointer"
                          title="View forensic audit details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Forensic Event Detail Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-600 dark:text-teal-400">
                  {getActionBadge(selectedLogForDetails.actionType).icon}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedLogForDetails.actionTitle}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                    <span className="font-mono">{selectedLogForDetails.id}</span>
                    <button
                      onClick={() => copyToClipboard(selectedLogForDetails.id, 'modal-id')}
                      className="text-slate-400 hover:text-slate-600 transition"
                      title="Copy Log ID"
                    >
                      {copiedId === 'modal-id' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Operator & Time Attribution Header Card */}
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl p-3.5 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 text-[11px] block">Responsible Operator</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 block mt-0.5">
                  {selectedLogForDetails.operatorName} (@{selectedLogForDetails.operatorUsername})
                </span>
                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">
                  {selectedLogForDetails.operatorRole} Role
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Exact Timestamp</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 block mt-0.5">
                  {new Date(selectedLogForDetails.timestamp).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {selectedLogForDetails.timestamp}
                </span>
              </div>
            </div>

            {/* Event Description */}
            <div className="space-y-1.5 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Action Narrative & Attribution
              </span>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 leading-relaxed">
                {selectedLogForDetails.description}
              </div>
            </div>

            {/* Before / After comparison if available */}
            {(selectedLogForDetails.previousValue !== undefined ||
              selectedLogForDetails.newValue !== undefined) && (
              <div className="space-y-1.5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Value Transition
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
                      Prior Value
                    </span>
                    <span className="text-sm font-bold text-rose-800 dark:text-rose-300 mt-1 block">
                      {selectedLogForDetails.previousValue !== undefined
                        ? String(selectedLogForDetails.previousValue)
                        : 'None / Initial'}
                    </span>
                  </div>
                  <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                      Updated Value
                    </span>
                    <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mt-1 block">
                      {selectedLogForDetails.newValue !== undefined
                        ? String(selectedLogForDetails.newValue)
                        : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Structured Metadata JSON */}
            {selectedLogForDetails.metadata && (
              <div className="space-y-1.5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Technical Payload & Audit Metadata
                </span>
                <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl text-[11px] font-mono overflow-x-auto max-h-48">
                  {JSON.stringify(selectedLogForDetails.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 transition cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purge / Clear Confirm Modal */}
      <ConfirmModal
        isOpen={showClearConfirmModal}
        title="Purge System Audit Trail?"
        message="Are you sure you want to permanently clear all audit activity logs? This action is irreversible and should only be performed for archival resets."
        confirmText="Permanently Purge Logs"
        confirmVariant="danger"
        onConfirm={() => {
          clearAuditLogs();
          setShowClearConfirmModal(false);
        }}
        onCancel={() => setShowClearConfirmModal(false)}
      />
    </div>
  );
};
