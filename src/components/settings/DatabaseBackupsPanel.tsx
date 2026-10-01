import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Database, Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const DatabaseBackupsPanel: React.FC = () => {
  const { isDbConnected } = useApp();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleExportBackup = async () => {
    setExporting(true);
    setStatus(null);
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error('Backup export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skooler-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('Backup downloaded successfully!');
    } catch (err: any) {
      setStatus(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    setStatus(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Restore failed');
      setStatus('Database restored successfully! Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setStatus(`Restore failed: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
      <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
        <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
          <Database className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Disaster Recovery & Database Backups</h3>
          <p className="text-xs text-slate-500">Download complete PostgreSQL JSON snapshots or restore previous backups</p>
        </div>
      </div>

      {status && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{status}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
          <h4 className="font-bold text-slate-800">Export Full Backup</h4>
          <p className="text-slate-500 text-[11px]">
            Generate an encrypted snapshot of all students, vouchers, collections, classes, and configuration data.
          </p>
          <button
            type="button"
            disabled={exporting || !isDbConnected}
            onClick={handleExportBackup}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Generating...' : 'Download Backup File'}
          </button>
        </div>

        <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
          <h4 className="font-bold text-slate-800">Restore From Backup</h4>
          <p className="text-slate-500 text-[11px]">
            Restore an existing JSON backup file to synchronize records across institutions.
          </p>
          <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-xs transition cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>{restoring ? 'Restoring...' : 'Upload & Restore File'}</span>
            <input type="file" accept=".json" onChange={handleRestoreFile} className="hidden" />
          </label>
        </div>
      </div>
    </div>
  );
};
