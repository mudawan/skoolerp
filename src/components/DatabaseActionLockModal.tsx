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

    // Prevent tab or escape navigation while action is locked
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
      className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header matching main app dialogs */}
        <div className="flex items-start gap-3 border-b border-slate-100 pb-3.5">
          <div
            className={`p-2.5 rounded-xl border shrink-0 transition-colors duration-200 ${
              isCompleted
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-teal-50 text-teal-700 border-teal-200'
            }`}
          >
            {isCompleted ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600 animate-in zoom-in duration-200" />
            ) : (
              <Database className="w-5 h-5 text-teal-600 animate-pulse" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3
                id="action-lock-title"
                className="text-base font-bold text-slate-900 truncate leading-snug"
              >
                {title || 'Saving to Database'}
              </h3>
              {!isCompleted && (
                <Loader2 className="w-4 h-4 text-teal-600 animate-spin shrink-0" />
              )}
            </div>

            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              {message ||
                (isCompleted
                  ? 'All changes have been successfully saved.'
                  : 'Saving and verifying records on the server. Actions are paused until complete.')}
            </p>
          </div>
        </div>

        {/* Progress Section */}
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700 truncate">
              {isCompleted ? 'All changes saved' : 'Saving batch records'}
            </span>
            <span className="font-mono font-bold text-xs text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs shrink-0 tabular-nums">
              {total > 0 ? (
                <>
                  <span className="text-teal-700">{current}</span>
                  <span className="text-slate-400 font-normal"> / </span>
                  <span>{total}</span>
                  <span className="text-slate-500 font-normal ml-1">({percent}%)</span>
                </>
              ) : (
                `${percent}%`
              )}
            </span>
          </div>

          {/* Progress Bar with solid theme fill */}
          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                isCompleted ? 'bg-emerald-600' : 'bg-teal-600'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Footer Status & Safeguard Reminder */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5 font-medium">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isCompleted ? 'bg-emerald-500' : 'bg-teal-500 animate-pulse'
              }`}
            />
            <span>{isCompleted ? 'All Changes Saved' : 'Saving to Server'}</span>
          </div>
          <span className="text-slate-400 font-medium">Do not refresh or close</span>
        </div>
      </div>
    </div>
  );
};
