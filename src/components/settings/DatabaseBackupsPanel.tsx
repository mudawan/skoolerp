import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  subscribeDbStatus,
  checkBackendHealth,
  fetchServerState,
  queueDatabaseSync,
  DbStatus,
} from '../../services/apiSync';
import { THEME_COLOR_PRESETS } from '../../utils/themeConfig';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Users,
  Server,
  HardDrive,
  ShieldCheck,
  Clock,
  FileText,
  Check,
  Copy,
  Terminal,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
} from 'lucide-react';

export const DatabaseBackupsPanel: React.FC = () => {
  const {
    students,
    families,
    classes,
    buses,
    stops,
    templates,
    vouchers,
    collections,
    transactions,
    bankAccounts,
    auditLogs,
    themeConfig,
    hasPermission,
    logAuditEvent,
  } = useApp();

  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  const [dbStatus, setDbStatus] = useState<DbStatus>({
    isConnected: true,
    isSyncing: false,
    engine: 'postgres',
    revision: 1,
    activePeers: 1,
  });

  const [healthInfo, setHealthInfo] = useState<{
    uptime?: number;
    timestamp?: string;
  }>({});

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Restore state
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [parsedBackupData, setParsedBackupData] = useState<any | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkBackendHealth().then((info) => {
      if (info) {
        setHealthInfo({
          uptime: info.uptime,
          timestamp: info.timestamp,
        });
      }
    });

    const unsubscribe = subscribeDbStatus((newStatus) => {
      setDbStatus(newStatus);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleManualSync = async () => {
    setIsRefreshing(true);
    try {
      await checkBackendHealth();
      const res = await fetchServerState();
      if (res?.success) {
        setDbStatus((prev) => ({
          ...prev,
          revision: res.revision || prev.revision,
          isConnected: true,
        }));
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleDownloadBackup = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `skooler_backup_${timestamp}.json`;

    // Download directly from the authoritative API endpoint or generate client payload
    window.location.href = '/api/backup/export';

    logAuditEvent({
      actionType: 'settings_change',
      actionTitle: 'Database Backup Exported',
      module: 'Settings',
      description: `Manual database backup downloaded (${students.length} students, ${vouchers.length} vouchers)`,
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    setRestoreSuccess(false);
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedBackupFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json || typeof json !== 'object') {
          throw new Error('Invalid JSON format');
        }
        setParsedBackupData(json);
      } catch (err: any) {
        setParseError('Failed to parse backup file: ' + (err?.message || 'Invalid JSON'));
        setParsedBackupData(null);
      }
    };
    reader.readAsText(file);
  };

  const executeRestore = async () => {
    if (!parsedBackupData) return;
    setIsRestoring(true);
    setParseError(null);

    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedBackupData),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Restore failed');

      setRestoreSuccess(true);
      setShowRestoreConfirm(false);
      setSelectedBackupFile(null);
      setParsedBackupData(null);

      // Trigger rehydration
      const fresh = await fetchServerState();
      if (fresh?.data) {
        window.location.reload();
      }
    } catch (err: any) {
      setParseError('Restore error: ' + (err?.message || 'Server rejected backup'));
    } finally {
      setIsRestoring(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'Active';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="space-y-6">
      {/* 1. Database & Live Cluster Status Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              style={{ backgroundColor: `${preset.primaryColor}15`, color: preset.primaryColor }}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-slate-200/60"
            >
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Database & Storage Architecture
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    dbStatus.engine === 'postgres'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  <Server className="w-3 h-3" />
                  {dbStatus.engine} Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Centralized relational repository with live bi-directional multi-user synchronization.
              </p>
            </div>
          </div>

          <button
            id="btn-manual-db-sync"
            type="button"
            onClick={handleManualSync}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/80 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold shadow-2xs transition cursor-pointer self-start sm:self-auto shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-teal-600' : ''}`} />
            <span>{isRefreshing ? 'Checking Sync...' : 'Verify Live Sync'}</span>
          </button>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/60">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-medium">Cluster Connectivity</span>
              {dbStatus.isConnected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              )}
            </div>
            <div className="text-sm font-bold text-slate-900">
              {dbStatus.isConnected ? 'Connected & Healthy' : 'Offline / Reconnecting'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              SSE Real-Time Stream Active
            </div>
          </div>

          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/60">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-medium">Database Revision</span>
              <Layers className="w-4 h-4 text-teal-500" />
            </div>
            <div className="text-sm font-bold text-slate-900">
              Rev #{dbStatus.revision}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Atomic Mutation Sequence
            </div>
          </div>

          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/60">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-medium">Connected Peers</span>
              <Users className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-sm font-bold text-slate-900">
              {dbStatus.activePeers} {dbStatus.activePeers === 1 ? 'Session' : 'Sessions'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Simultaneous Operator Terminals
            </div>
          </div>

          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/60">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-medium">Server Uptime</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-sm font-bold text-slate-900">
              {formatUptime(healthInfo.uptime)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {dbStatus.engine === 'postgres' ? 'Cloud Run / PostgreSQL' : 'PostgreSQL Database'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Backup & Disaster Recovery Operations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Backup Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100">
                <ArrowDownToLine className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Download Database Backup</h4>
                <p className="text-xs text-slate-500">
                  Export complete snapshot of all school records as a portable JSON payload.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/60 text-xs space-y-1.5">
              <div className="font-semibold text-slate-700 flex items-center justify-between pb-1 border-b border-slate-200/60">
                <span>Dataset Contents</span>
                <span className="text-teal-700 font-bold">Ready for Export</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
                <div>• Students: <strong className="text-slate-800">{students.length}</strong></div>
                <div>• Families: <strong className="text-slate-800">{families.length}</strong></div>
                <div>• Classes: <strong className="text-slate-800">{classes.length}</strong></div>
                <div>• Vouchers: <strong className="text-slate-800">{vouchers.length}</strong></div>
                <div>• Collections: <strong className="text-slate-800">{collections.length}</strong></div>
                <div>• Audit Logs: <strong className="text-slate-800">{auditLogs.length}</strong></div>
              </div>
            </div>
          </div>

          <button
            id="btn-download-db-backup"
            type="button"
            onClick={handleDownloadBackup}
            style={{ backgroundColor: preset.primaryColor }}
            className="w-full flex items-center justify-center gap-2 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs hover:opacity-95 transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Generate & Download Backup (.json)</span>
          </button>
        </div>

        {/* Restore Backup Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100">
                <ArrowUpFromLine className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Restore Database from Backup</h4>
                <p className="text-xs text-slate-500">
                  Upload a previously saved `.json` snapshot to recover or migrate data.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!selectedBackupFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-4 text-center cursor-pointer transition bg-slate-50/50 hover:bg-indigo-50/20"
              >
                <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                <span className="text-xs font-semibold text-indigo-700">Click to browse backup file</span>
                <p className="text-[11px] text-slate-400 mt-0.5">Supports Skooler JSON export files</p>
              </div>
            ) : (
              <div className="bg-indigo-50/60 rounded-xl p-3 border border-indigo-200/60 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-indigo-900 truncate max-w-[200px]">
                    {selectedBackupFile.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBackupFile(null);
                      setParsedBackupData(null);
                      setParseError(null);
                    }}
                    className="text-indigo-600 hover:text-indigo-900 text-[11px] font-bold"
                  >
                    Change
                  </button>
                </div>

                {parsedBackupData && (
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-indigo-800 border-t border-indigo-200/60 pt-1.5">
                    <div>Students: <strong>{parsedBackupData.students?.length || 0}</strong></div>
                    <div>Vouchers: <strong>{parsedBackupData.vouchers?.length || 0}</strong></div>
                    <div>Collections: <strong>{parsedBackupData.collections?.length || 0}</strong></div>
                    <div>Users: <strong>{parsedBackupData.users?.length || 0}</strong></div>
                  </div>
                )}
              </div>
            )}

            {parseError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 text-rose-700 text-xs border border-rose-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {restoreSuccess && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Database restored successfully! Reloading...</span>
              </div>
            )}
          </div>

          <button
            id="btn-restore-db-backup"
            type="button"
            disabled={!parsedBackupData || isRestoring}
            onClick={() => setShowRestoreConfirm(true)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs transition cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>{isRestoring ? 'Restoring Database...' : 'Restore Selected Backup'}</span>
          </button>
        </div>
      </div>

      {/* 3. Production Deployment & Database Engine Quick Reference */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm">Self-Hosting & PostgreSQL Configuration</h4>
            <p className="text-xs text-slate-500">
              Instructions for configuring production databases and running automated nightly backups.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
            <div className="flex items-center justify-between font-bold text-slate-800">
              <span>Switch to PostgreSQL Engine</span>
              <button
                type="button"
                onClick={() => copyToClipboard('DATABASE_URL="postgres://postgres:password@localhost:5432/school_db"', 'db_url')}
                className="flex items-center gap-1 text-teal-600 hover:text-teal-800 text-[11px]"
              >
                {copiedSnippet === 'db_url' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet === 'db_url' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Add the <code className="px-1 py-0.5 bg-white border rounded text-slate-900 font-mono">DATABASE_URL</code> variable to your environment or <code className="px-1 py-0.5 bg-white border rounded text-slate-900 font-mono">.env</code> file. The server will automatically connect to PostgreSQL with connection pooling.
            </p>
            <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg font-mono text-[11px] overflow-x-auto">
              DATABASE_URL="postgres://postgres:password@localhost:5432/school_db"
            </div>
          </div>

          <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
            <div className="flex items-center justify-between font-bold text-slate-800">
              <span>Automated Cron Backup Script</span>
              <button
                type="button"
                onClick={() => copyToClipboard('0 2 * * * /var/www/skooler/scripts/backup.sh >> /var/log/skooler_backup.log 2>&1', 'cron')}
                className="flex items-center gap-1 text-teal-600 hover:text-teal-800 text-[11px]"
              >
                {copiedSnippet === 'cron' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet === 'cron' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Schedule <code className="px-1 py-0.5 bg-white border rounded text-slate-900 font-mono">scripts/backup.sh</code> to create daily timestamped gzip snapshots with automatic 30-day retention pruning.
            </p>
            <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg font-mono text-[11px] overflow-x-auto">
              0 2 * * * /var/www/skooler/scripts/backup.sh
            </div>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-600 pb-2 border-b border-slate-100">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0 border border-amber-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Confirm Database Restore</h3>
                <p className="text-xs text-slate-500">Destructive Replacement Operation</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Restoring will <strong>replace all existing records</strong> in the current database with the records from the uploaded backup file.
            </p>

            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800 space-y-1">
              <div className="font-bold">Backup Summary:</div>
              <div>• Students to load: {parsedBackupData?.students?.length || 0}</div>
              <div>• Fee Vouchers to load: {parsedBackupData?.vouchers?.length || 0}</div>
              <div>• Collections to load: {parsedBackupData?.collections?.length || 0}</div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowRestoreConfirm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeRestore}
                disabled={isRestoring}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer"
              >
                {isRestoring ? 'Restoring...' : 'Yes, Replace & Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
