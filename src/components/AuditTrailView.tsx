import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { AuditActionType, AuditLogEntry } from '../types';
import { formatCurrency, formatMonthName, getCurrencyCode } from '../utils/feeMath';
import { downloadCsv } from '../utils/csv';
import { RecordsPerPageSelector } from './RecordsPerPageSelector';
import { apiFetchAuditLogs, apiFetchAuditSummary, AuditLogQuery, AuditSummary } from '../services/apiSync';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';
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
  ChevronLeft,
  ChevronRight,
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
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

interface AuditTrailViewProps {
  initialFilter?: 'all' | 'fines' | 'bulk' | 'reversals' | 'security';
}

// Internal database ids (including those stored by older log entries) must
// never be shown as a subject. Readable references (usernames, student IDs,
// months, receipt numbers) are kept.
const isInternalId = (v?: string | null): boolean => {
  if (!v) return false;
  return (
    /^(usr|user|inst|op|bank|tpl|fee)_/i.test(v) ||
    /_tpl_\d+$/i.test(v) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
};
const readableTarget = (log: { targetId?: string | null; targetLabel?: string | null }) => ({
  label: log.targetLabel && !isInternalId(log.targetLabel) ? log.targetLabel : '',
  ref: log.targetId && !isInternalId(log.targetId) ? log.targetId : '',
});

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({ initialFilter = 'all' }) => {
  const {
    hasPermission,
    themeConfig,
    showToast,
    auditRetentionMonths,
  } = useApp();

  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActionType, setSelectedActionType] = useState<string>('all');
  const [selectedOperator, setSelectedOperator] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'fines' | 'bulk' | 'reversals' | 'security'>(initialFilter);
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLogEntry | null>(null);
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

  // --- Server-side data: one page of rows + a small summary, never the full table ---
  type DateRange = '7d' | '30d' | '90d' | 'all';
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const dateFrom = useMemo(() => {
    if (dateRange === 'all') return undefined;
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d.toISOString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, refreshKey]);

  const QUICK_FILTER_TYPES: Record<string, string[]> = {
    all: [],
    fines: ['fine_modification'],
    bulk: ['bulk_collection'],
    reversals: ['collection_reversal', 'carry_forward'],
    security: ['operator_security', 'system_cleanup', 'system_restore'],
  };

  const effectiveTypes = useMemo(() => {
    const quick = QUICK_FILTER_TYPES[quickFilter] || [];
    if (selectedActionType === 'all') return quick;
    if (quick.length === 0) return [selectedActionType];
    const both = quick.filter((t) => t === selectedActionType);
    return both.length > 0 ? both : ['__none__'];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickFilter, selectedActionType]);

  const baseQuery = useMemo<AuditLogQuery>(
    () => ({
      q: debouncedSearch || undefined,
      actionType: effectiveTypes,
      operator: selectedOperator !== 'all' ? selectedOperator : undefined,
      module: selectedModule !== 'all' ? selectedModule : undefined,
      month: selectedMonth !== 'all' ? selectedMonth : undefined,
      sort: sortField,
      dir: sortDirection,
      dateFrom,
    }),
    [debouncedSearch, effectiveTypes, selectedOperator, selectedModule, selectedMonth, sortField, sortDirection, dateFrom]
  );

  // Any filter/sort/range/page-size change returns to page 1
  useEffect(() => {
    setPage(1);
  }, [baseQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    const ctrl = new AbortController();
    setIsLoading(true);
    apiFetchAuditLogs({ ...baseQuery, page: safePage, pageSize }, ctrl.signal).then((r) => {
      if (ctrl.signal.aborted) return;
      if (r) {
        setLogs(r.logs);
        setTotal(r.total);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
      setIsLoading(false);
    });
    return () => ctrl.abort();
  }, [baseQuery, safePage, pageSize, refreshKey]);

  useEffect(() => {
    const ctrl = new AbortController();
    apiFetchAuditSummary({ dateFrom }, ctrl.signal).then((r) => {
      if (!ctrl.signal.aborted && r) setSummary(r);
    });
    return () => ctrl.abort();
  }, [dateFrom, refreshKey]);

  const filteredLogs = logs; // current page only
  const distinctOperators = summary?.operators || [];
  const distinctMonths = summary?.months || [];

  // Summary Metrics (from server aggregates)
  const stats = useMemo(() => {
    const t = summary?.byType || {};
    const c = (k: string) => t[k]?.count || 0;
    const a = (k: string) => t[k]?.amount || 0;
    return {
      total: summary?.total || 0,
      fineModCount: c('fine_modification'),
      fineModTotal: a('fine_modification'),
      bulkCount: c('bulk_collection'),
      bulkTotalAmount: a('bulk_collection'),
      collectionCount: c('collection_payment'),
      securityCount: c('operator_security'),
      reversalsCount: c('collection_reversal') + c('carry_forward'),
    };
  }, [summary]);

  // Metric cards configuration matching ReportsView style
  const auditMetrics = useMemo(() => {
    const reversalsCount = stats.reversalsCount;

    return [
      {
        key: 'fines' as const,
        label: 'Manual Fine Mod.',
        value: `${stats.fineModCount}`,
        hint: `${formatCurrency(stats.fineModTotal)} adjusted`,
        badge: `${stats.fineModCount} Events`,
        badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        icon: Coins,
        iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
        accent: 'text-amber-600 dark:text-amber-400',
      },
      {
        key: 'bulk' as const,
        label: 'Bulk Collections',
        value: `${stats.bulkCount}`,
        hint: `${formatCurrency(stats.bulkTotalAmount)} imported`,
        badge: `${stats.bulkCount} Batches`,
        badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        icon: FileSpreadsheet,
        iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
        accent: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        key: 'reversals' as const,
        label: 'Reversals & Carry',
        value: `${reversalsCount}`,
        hint: 'Ledger adjustments',
        badge: `${reversalsCount} Entries`,
        badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
        icon: RotateCcw,
        iconBg: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
        accent: 'text-rose-600 dark:text-rose-400',
      },
      {
        key: 'security' as const,
        label: 'Security & Roles',
        value: `${stats.securityCount}`,
        hint: 'Operator privileges',
        badge: `${stats.securityCount} Records`,
        badgeClass: 'bg-purple-50 text-purple-700 border border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
        icon: Shield,
        iconBg: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400',
        accent: 'text-purple-600 dark:text-purple-400',
      },
    ];
  }, [stats]);

  // Export to CSV: pulls the full filtered result from the server in chunks
  const handleExportCsv = async () => {
    if (!hasPermission('audit.export')) return;
    if (isExporting || total === 0) return;
    setIsExporting(true);
    try {
      const CHUNK = 1000;
      const MAX_ROWS = 100000;
      const all: AuditLogEntry[] = [];
      for (let pg = 1; all.length < Math.min(total, MAX_ROWS); pg++) {
        const r = await apiFetchAuditLogs({ ...baseQuery, page: pg, pageSize: CHUNK, export: true });
        if (!r) throw new Error('Export failed while fetching data.');
        if (r.logs.length === 0) break;
        all.push(...r.logs);
      }

      const headers = [
        'Log ID', 'Timestamp (ISO)', 'Timestamp (Formatted)', 'Action Type', 'Action Title',
        'Operator Name', 'Operator Username', 'Operator Role', 'Module', 'Target Reference', 'Target',
        'Billing Month', `Amount (${getCurrencyCode()})`, 'Previous Value', 'New Value', 'Description',
      ];
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = all.map((log) => [
        log.id,
        log.timestamp,
        new Date(log.timestamp).toLocaleString(),
        log.actionType,
        log.actionTitle,
        log.operatorName,
        log.operatorUsername,
        log.operatorRole,
        log.module,
        readableTarget(log).ref,
        readableTarget(log).label,
        log.month || '',
        log.amount !== undefined ? String(log.amount) : '',
        log.previousValue !== undefined ? String(log.previousValue) : '',
        log.newValue !== undefined ? String(log.newValue) : '',
        log.description || '',
      ]);
      const csvContent = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
      downloadCsv(`audit_trail_export_${new Date().toISOString().split('T')[0]}.csv`, '\uFEFF' + csvContent);
      if (all.length < total) {
        showToast(`Exported the first ${all.length} of ${total} entries. Narrow the date range to export the rest.`, 'warning');
      }
    } catch (err: any) {
      showToast(err?.message || 'Export failed.', 'error');
    } finally {
      setIsExporting(false);
    }
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
      case 'system_restore':
        return {
          icon: <RefreshCw className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
          label: 'Database Restored From Backup',
          badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
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
              disabled={total === 0 || isExporting}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
              title={total === 0 ? 'No audit logs to export' : 'Export all filtered audit logs to CSV'}
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>{isExporting ? 'Exporting…' : `Export CSV (${total})`}</span>
            </button>
          )}

          {hasPermission('audit.export') && (
            <button
              id="btn-print-audit-report"
              onClick={() => window.print()}
              disabled={logs.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
              title={logs.length === 0 ? 'No audit logs to print' : 'Print the entries on this page'}
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>Print</span>
            </button>
          )}

          <button
            id="btn-refresh-audit"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer shadow-2xs"
            title="Reload from server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Accountability KPI Summary */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-3.5 sm:p-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3.5">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                backgroundColor: `${preset.primaryColor}14`,
                color: preset.primaryColor,
              }}
              className="p-1.5 rounded-lg flex items-center justify-center shrink-0 shadow-2xs"
            >
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2">
                <span>Accountability & Forensic Metrics</span>
                <span className="text-[10px] font-normal normal-case text-slate-400 hidden sm:inline">
                  • Click any metric to filter audit logs
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/70 dark:border-slate-700">
              <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Total Activity Logs: <strong className="text-slate-800 dark:text-white font-semibold">{stats.total}</strong></span>
            </span>
            {quickFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setQuickFilter('all')}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 px-2.5 py-1 rounded-lg border border-teal-200 dark:border-teal-800 transition cursor-pointer"
              >
                <span>Reset Filter</span>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {auditMetrics.map((m) => {
            const Icon = m.icon;
            const isSelected = quickFilter === m.key;

            return (
              <button
                key={m.key}
                type="button"
                id={`audit-kpi-card-${m.key}`}
                onClick={() => setQuickFilter(quickFilter === m.key ? 'all' : m.key)}
                title={`Click to filter: ${m.label}`}
                style={
                  isSelected
                    ? {
                        borderColor: preset.primaryColor,
                        backgroundColor: `${preset.primaryColor}0d`,
                        boxShadow: `0 0 0 1px ${preset.primaryColor}33`,
                      }
                    : undefined
                }
                className={`group text-left rounded-xl p-3 border transition-all duration-150 cursor-pointer flex flex-col justify-between relative ${
                  isSelected
                    ? 'shadow-2xs'
                    : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/60 dark:hover:bg-slate-800 hover:shadow-2xs'
                }`}
              >
                {/* Top Row: Metric Label & Icon */}
                <div className="flex items-start justify-between gap-1.5 mb-1.5">
                  <span
                    style={isSelected ? { color: preset.textColor } : undefined}
                    className="text-[11px] font-bold text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors leading-tight line-clamp-1"
                  >
                    {m.label}
                  </span>
                  <span
                    style={
                      isSelected
                        ? {
                            backgroundColor: preset.primaryColor,
                            color: '#ffffff',
                          }
                        : undefined
                    }
                    className={`w-6 h-6 shrink-0 rounded-lg flex items-center justify-center transition-colors ${
                      isSelected ? 'shadow-2xs' : m.iconBg
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                </div>

                {/* Middle Row: Primary Value */}
                <div className="mb-2">
                  <div
                    className={`text-lg sm:text-xl font-black font-mono tracking-tight leading-none truncate ${
                      isSelected ? 'text-slate-900 dark:text-white' : m.accent
                    }`}
                  >
                    {m.value}
                  </div>
                </div>

                {/* Bottom Row: Context Hint & Status Badge */}
                <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 font-medium pt-1.5 border-t border-slate-100/90 dark:border-slate-700/60">
                  <span className="truncate text-slate-500 dark:text-slate-400">{m.hint}</span>
                  {m.badge && (
                    <span
                      style={
                        isSelected
                          ? {
                              backgroundColor: `${preset.primaryColor}18`,
                              color: preset.textColor,
                              borderColor: `${preset.primaryColor}40`,
                            }
                          : undefined
                      }
                      className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${
                        isSelected ? 'border' : m.badgeClass
                      }`}
                    >
                      {m.badge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
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
            All Activity ({stats.total})
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
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
              <option value="system_restore">Database Restored From Backup</option>
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

          {/* Date Range */}
          <div>
            <select
              id="select-audit-range"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time{auditRetentionMonths > 0 ? ` (kept ${auditRetentionMonths} mo)` : ''}</option>
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
            Activity Log Entries ({total} matching)
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

        {isLoading && logs.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500">Loading activity log…</div>
        ) : loadError ? (
          <div className="py-16 text-center text-xs text-rose-600">Could not load the audit trail. Use Refresh to retry.</div>
        ) : logs.length === 0 ? (
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
                {logs.map((log) => {
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
                        {(() => {
                          const t = readableTarget(log);
                          if (t.label) {
                            return (
                              <div>
                                <div className="font-medium text-slate-900 dark:text-white">{t.label}</div>
                                {t.ref && t.ref !== t.label && (
                                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{t.ref}</div>
                                )}
                              </div>
                            );
                          }
                          if (t.ref) {
                            return (
                              <div className="font-mono text-slate-700 dark:text-slate-300 font-medium">{t.ref}</div>
                            );
                          }
                          return <span className="text-slate-400 italic">—</span>;
                        })()}
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
                            {formatCurrency(log.amount)}
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

        {total > 0 && (
          <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 print:hidden">
            <RecordsPerPageSelector
              value={pageSize}
              onChange={(n) => setPageSize(n)}
              totalRecords={total}
              presetOptions={[25, 50, 100]}
              idPrefix="audit-per-page"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
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
    </div>
  );
};
