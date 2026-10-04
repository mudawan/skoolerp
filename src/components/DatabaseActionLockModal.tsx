import React, { useEffect } from 'react';
import { Database, ShieldCheck, Loader2 } from 'lucide-react';
import { ActionLockState } from '../context/AppContext';

interface DatabaseActionLockModalProps {
  actionLock: ActionLockState | null;
}

export const DatabaseActionLockModal: React.FC<DatabaseActionLockModalProps> = ({ actionLock }) => {
  useEffect(() => {
    if (!actionLock) return;

    // Prevent background scrolling while database transaction is locking actions
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Prevent tab navigation escaping the modal
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [actionLock]);

  if (!actionLock || !actionLock.active) {
    return null;
  }

  const { title, current, total, message, phase = 'processing' } = actionLock;
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 100;
  const isCompleted = phase === 'completed';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-lock-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none animate-in fade-in duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-7 relative overflow-hidden transition-all duration-300">
        {/* Top Accent Strip */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600" />

        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300 ${
              isCompleted
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400'
            }`}
          >
            {isCompleted ? (
              <ShieldCheck className="w-6 h-6 animate-in zoom-in duration-200" />
            ) : (
              <Database className="w-6 h-6 animate-pulse" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3
                id="action-lock-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
              >
                {title || 'Saving to Database'}
              </h3>
              {!isCompleted && (
                <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {message || (isCompleted ? 'Transaction committed successfully.' : 'Synchronizing records with PostgreSQL. Actions are locked until complete.')}
            </p>
          </div>
        </div>

        {/* Progress Bar & Numeric Counters */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              {isCompleted ? 'All changes saved' : 'Transaction progress'}
            </span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 font-medium">
              {total > 0 ? (
                <>
                  <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{current}</span>
                  <span className="text-slate-400"> / </span>
                  <span>{total}</span>
                  <span className="text-slate-400 ml-1.5">({percent}%)</span>
                </>
              ) : (
                `${percent}%`
              )}
            </span>
          </div>

          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ease-out rounded-full ${
                isCompleted
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-indigo-500 to-teal-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Quiet Footer Note with Typographic Separator (Zero-Pill) */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
          <span>Transactional Database Lock</span>
          <span aria-hidden="true">·</span>
          <span>Do not refresh or close</span>
          <span aria-hidden="true">·</span>
          <span>PostgreSQL Active</span>
        </div>
      </div>
    </div>
  );
};
