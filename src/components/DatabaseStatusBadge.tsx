import React, { useEffect, useState } from 'react';
import { Database, CheckCircle2, RefreshCw, AlertCircle, Users } from 'lucide-react';
import { subscribeDbStatus, checkBackendHealth, DbStatus } from '../services/apiSync';

export const DatabaseStatusBadge: React.FC = () => {
  const [status, setStatus] = useState<DbStatus>({
    isConnected: true,
    isSyncing: false,
    engine: 'sqlite',
    revision: 1,
    activePeers: 1,
  });

  useEffect(() => {
    // Initial health check
    checkBackendHealth();

    // Subscribe to status updates
    const unsubscribe = subscribeDbStatus((newStatus) => {
      setStatus(newStatus);
    });

    // Periodic heartbeat every 30s
    const interval = setInterval(() => {
      checkBackendHealth();
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      id="database-status-indicator"
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
        status.isSyncing
          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
          : status.isConnected
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
          : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
      }`}
      title={
        status.isSyncing
          ? 'Synchronizing state with database...'
          : status.isConnected
          ? `Connected to ${status.engine.toUpperCase()} database (rev ${status.revision}). ${
              status.activePeers > 1 ? `${status.activePeers} concurrent sessions active.` : 'Single session.'
            }`
          : 'Database connection offline. Changes stored in cache.'
      }
    >
      <div className="flex items-center gap-1.5">
        <Database className="w-3.5 h-3.5 shrink-0" />
        <span className="capitalize">{status.engine}</span>
      </div>

      {status.activePeers > 1 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900/60 rounded-full text-emerald-800 dark:text-emerald-200">
          <Users className="w-2.5 h-2.5" />
          {status.activePeers}
        </span>
      )}

      {status.isSyncing ? (
        <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
      ) : status.isConnected ? (
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
      ) : (
        <AlertCircle className="w-3 h-3 text-rose-600" />
      )}
    </div>
  );
};
