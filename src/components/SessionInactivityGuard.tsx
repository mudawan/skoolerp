import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, ShieldAlert, LogOut, RefreshCw } from 'lucide-react';

const LAST_ACTIVITY_STORAGE_KEY = 'quickfees_last_activity_timestamp';
const WARNING_THRESHOLD_SECONDS = 60; // Show countdown 60s before auto-logout

export const SessionInactivityGuard: React.FC = () => {
  const { isAuthenticated, sessionTimeoutMinutes, logout, showToast } = useApp();
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const isWarningOpenRef = useRef<boolean>(false);

  // Synchronize with local storage & refresh activity timestamp
  const recordActivity = useCallback((updateStorage = true) => {
    const now = Date.now();
    lastActivityRef.current = now;
    if (updateStorage) {
      try {
        localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
      } catch {}
    }
    if (isWarningOpenRef.current) {
      isWarningOpenRef.current = false;
      setShowWarning(false);
      setSecondsRemaining(null);
    }
  }, []);

  // Stay logged in button handler
  const handleStayLoggedIn = () => {
    recordActivity(true);
    showToast('Session refreshed. You remain securely logged in.', 'info');
  };

  // Immediate logout handler
  const handleManualLock = () => {
    setShowWarning(false);
    isWarningOpenRef.current = false;
    try {
      sessionStorage.setItem(
        'school_timeout_notice',
        'Session locked. Please sign in with your credentials to resume.'
      );
    } catch {}
    logout();
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setShowWarning(false);
      isWarningOpenRef.current = false;
      return;
    }

    const timeoutMs = (sessionTimeoutMinutes || 10) * 60 * 1000;

    // Initialize with current time or last recorded time across tabs
    try {
      const stored = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
      if (stored) {
        const parsed = Number(stored);
        // Only accept the stored timestamp if it is recent (within the current timeout window).
        // If it is older than timeoutMs (e.g. from yesterday or prior session before browser close),
        // it is stale and must be refreshed to Date.now() so fresh logins are never immediately kicked out.
        if (!isNaN(parsed) && parsed > 0 && parsed <= Date.now() && Date.now() - parsed < timeoutMs) {
          lastActivityRef.current = parsed;
        } else {
          recordActivity(true);
        }
      } else {
        recordActivity(true);
      }
    } catch {
      recordActivity(false);
    }

    // Listen to storage events so user activity in any tab resets timer in all tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_STORAGE_KEY && e.newValue) {
        const remoteTime = Number(e.newValue);
        if (!isNaN(remoteTime) && remoteTime > lastActivityRef.current && Date.now() - remoteTime < timeoutMs) {
          lastActivityRef.current = remoteTime;
          if (isWarningOpenRef.current) {
            isWarningOpenRef.current = false;
            setShowWarning(false);
            setSecondsRemaining(null);
          }
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    // Throttled user activity listener on window
    let lastThrottle = 0;
    const onUserInteraction = () => {
      // While the warning is showing, page activity must not dismiss it: a mouse move (or the
      // mousedown that starts a click on "Lock Now") would close the dialog before the button
      // could be used. Only the dialog's own "Stay Logged In" button refreshes the session.
      if (isWarningOpenRef.current) return;
      const now = Date.now();
      if (now - lastThrottle > 1500) {
        lastThrottle = now;
        recordActivity(true);
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => {
      window.addEventListener(evt, onUserInteraction, { passive: true });
    });

    // Check interval every 1 second
    const interval = setInterval(() => {
      const timeoutMs = (sessionTimeoutMinutes || 10) * 60 * 1000;
      const elapsedMs = Date.now() - lastActivityRef.current;
      const remainingMs = timeoutMs - elapsedMs;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

      if (remainingSec <= 0) {
        // Inactivity timeout reached!
        clearInterval(interval);
        setShowWarning(false);
        isWarningOpenRef.current = false;
        try {
          sessionStorage.setItem(
            'school_timeout_notice',
            `Your session timed out after ${sessionTimeoutMinutes || 10} minutes of inactivity to safeguard financial data. Please sign in again.`
          );
        } catch {}
        logout();
      } else if (remainingSec <= WARNING_THRESHOLD_SECONDS) {
        setSecondsRemaining(remainingSec);
        if (!isWarningOpenRef.current) {
          isWarningOpenRef.current = true;
          setShowWarning(true);
        }
      } else {
        if (isWarningOpenRef.current) {
          isWarningOpenRef.current = false;
          setShowWarning(false);
          setSecondsRemaining(null);
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
      events.forEach((evt) => {
        window.removeEventListener(evt, onUserInteraction);
      });
    };
  }, [isAuthenticated, sessionTimeoutMinutes, logout, recordActivity]);

  if (!isAuthenticated || !showWarning || secondsRemaining === null) {
    return null;
  }

  return (
    <div
      id="inactivity-warning-overlay"
      className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-dialog-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-amber-200 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Amber Alert Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h3 id="inactivity-dialog-title" className="font-bold text-base text-white">
              Session Inactivity Warning
            </h3>
            <p className="text-xs text-amber-100 mt-0.5">
              Strict Banking Security Protection
            </p>
          </div>
        </div>

        {/* Dialog Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="leading-relaxed">
              You have been inactive. To protect student ledger and fee records, your session will automatically lock in:
            </p>
          </div>

          {/* Countdown Clock Display */}
          <div className="py-4 text-center">
            <div className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-slate-900 text-amber-400 font-mono text-3xl font-bold tracking-wider shadow-inner">
              00:{secondsRemaining < 10 ? `0${secondsRemaining}` : secondsRemaining}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Configured Timeout: {sessionTimeoutMinutes} minutes
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
            <button
              type="button"
              id="btn-inactivity-logout-now"
              onClick={handleManualLock}
              className="w-full sm:w-auto sm:flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Lock Now</span>
            </button>
            <button
              type="button"
              id="btn-inactivity-stay-logged-in"
              onClick={handleStayLoggedIn}
              className="w-full sm:w-auto sm:flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Stay Logged In</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
