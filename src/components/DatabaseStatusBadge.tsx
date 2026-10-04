import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { subscribeDbStatus, checkBackendHealth, DbStatus } from '../services/apiSync';

export const DatabaseStatusBadge: React.FC = () => {
  const [status, setStatus] = useState<DbStatus>({
    isConnected: true,
    isSyncing: false,
    engine: 'postgres',
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

  const isOnline = status.isConnected;
  const isSyncing = status.isSyncing;

  return (
    <div
      id="database-status-indicator"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors select-none ${
        isSyncing
          ? 'bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
          : isOnline
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
          : 'bg-rose-50 text-rose-800 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
      }`}
      title={
        isSyncing
          ? 'Saving changes to server...'
          : isOnline
          ? 'Connected • All records saved in real time'
          : 'Server Offline • Check network connection. Modifications and financial actions are paused until reconnected.'
      }
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {isSyncing ? (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        ) : isOnline ? (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
        ) : (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isSyncing
              ? 'bg-amber-500'
              : isOnline
              ? 'bg-emerald-500'
              : 'bg-rose-500'
          }`}
        />
      </span>

      <span className="text-[11px] font-semibold tracking-tight">
        {isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline'}
      </span>

      {isSyncing && (
        <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-600 shrink-0" />
      )}
      {!isOnline && !isSyncing && (
        <WifiOff className="w-3 h-3 text-rose-600 shrink-0" />
      )}
    </div>
  );
};

