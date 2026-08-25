import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ConfirmModal } from './ConfirmModal';
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  LogOut,
  RefreshCw,
  Shield,
  UserCheck,
} from 'lucide-react';

export const HeaderBar: React.FC = () => {
  const {
    currentUser,
    activeMonth,
    setActiveMonth,
    institute,
    resetToDemoData,
    logout,
    showToast,
  } = useApp();

  const [showResetModal, setShowResetModal] = useState(false);

  const availableMonths = [
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
  ];

  const currentIdx = availableMonths.indexOf(activeMonth);

  return (
    <header className="bg-slate-900 text-slate-100 border-b border-slate-800 sticky top-0 z-30 shadow-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Institute Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-xl shadow-sm border border-teal-500 overflow-hidden">
            {institute.logoUrl ? (
              <img
                src={institute.logoUrl}
                alt={institute.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Building2 className="w-6 h-6" />
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              {institute.name}
            </h1>
            <p className="text-xs text-slate-400">
              School Fee Management System &bull; {institute.regNo}
            </p>
          </div>
        </div>

        {/* Right: Controls & Role Switcher */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Working Month Selector */}
          <div className="flex items-center bg-teal-950/70 border border-teal-600/60 rounded-xl px-2.5 py-1.5 gap-1.5 text-xs shadow-inner">
            <Calendar className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="text-teal-200 font-bold hidden sm:inline">Working Month:</span>
            
            <button
              type="button"
              onClick={() => {
                if (currentIdx > 0) setActiveMonth(availableMonths[currentIdx - 1]);
              }}
              disabled={currentIdx <= 0}
              title="Previous Month"
              className="p-1 rounded text-teal-300 hover:bg-teal-800/60 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <select
              value={activeMonth}
              onChange={(e) => setActiveMonth(e.target.value)}
              className="bg-transparent text-white font-extrabold focus:outline-none cursor-pointer tracking-wide"
            >
              {availableMonths.map((m) => {
                const date = new Date(m + '-01');
                const label = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                return (
                  <option key={m} value={m} className="bg-slate-900 text-white font-medium">
                    {label} ({m})
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              onClick={() => {
                if (currentIdx >= 0 && currentIdx < availableMonths.length - 1) {
                  setActiveMonth(availableMonths[currentIdx + 1]);
                }
              }}
              disabled={currentIdx < 0 || currentIdx >= availableMonths.length - 1}
              title="Next Month"
              className="p-1 rounded text-teal-300 hover:bg-teal-800/60 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Integrated User Profile, Role Badge & Logout Chip */}
          <div
            id="header-user-profile-card"
            className="flex items-center gap-2.5 bg-slate-800/90 border border-slate-700/80 rounded-xl pl-2.5 pr-1.5 py-1.5 shadow-sm"
          >
            {/* User Avatar / Status */}
            <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-slate-700/80 border border-slate-600/60 text-emerald-400 shrink-0">
              <UserCheck className="w-4 h-4" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-slate-800" />
            </div>

            {/* Name & Username */}
            <div className="flex flex-col text-left leading-tight min-w-0">
              <span className="truncate max-w-[120px] font-semibold text-slate-200 text-xs">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                @{currentUser.username}
              </span>
            </div>

            {/* Integrated Role Badge */}
            <div
              id="header-role-badge"
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border ${
                currentUser.role === 'Admin'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : currentUser.role === 'Accountant'
                  ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                  : 'bg-slate-700/50 text-slate-300 border-slate-600/50'
              }`}
              title={`Role: ${currentUser.role}`}
            >
              <Shield className="w-3 h-3 shrink-0" />
              <span>{currentUser.role}</span>
            </div>

            {/* Divider */}
            <div className="h-4 w-px bg-slate-700/80 mx-0.5" />

            {/* Logout Button */}
            <button
              type="button"
              id="header-logout-btn"
              onClick={() => {
                logout();
              }}
              title="Sign Out of Session"
              aria-label="Sign Out"
              className="flex items-center gap-1 px-2 py-1 bg-slate-700/80 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg text-[11px] font-medium transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>

          {/* Reset Demo Data */}
          <button
            onClick={() => setShowResetModal(true)}
            title="Reset system data to initial demo state"
            className="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Reset System Data Confirmation Modal */}
      <ConfirmModal
        isOpen={showResetModal}
        title="Reset System Data"
        message={
          <div className="space-y-2">
            <p>
              Are you sure you want to reset all fee vouchers, collections, and records back to the initial demo state?
            </p>
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800">
              Any newly created students, custom fee modifications, or collection receipts will be reverted to factory demo values.
            </div>
          </div>
        }
        confirmLabel="Reset Everything"
        variant="danger"
        onConfirm={() => {
          resetToDemoData();
          setShowResetModal(false);
          showToast('System data successfully reset to demo baseline.', 'info');
        }}
        onClose={() => setShowResetModal(false)}
      />
    </header>
  );
};
