import React from 'react';
import { ActiveTab } from '../types';
import { useApp } from '../context/AppContext';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  Bus,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Shield,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

interface VerticalSidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const VerticalSidebar: React.FC<VerticalSidebarProps> = ({
  activeTab,
  setActiveTab,
  mobileOpen,
  setMobileOpen,
}) => {
  const {
    institute,
    currentUser,
    activeMonth,
    setActiveMonth,
    vouchers,
    getMonthClosureStatus,
    logout,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
  } = useApp();

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

  const monthDefaulters = vouchers.filter(
    (v) => v.month === activeMonth && (v.status === 'Issued' || v.status === 'Partial')
  );

  const navItems: {
    id: ActiveTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number | string;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'families', label: 'Families', icon: FolderKanban },
    { id: 'classes', label: 'Classes', icon: BookOpen },
    { id: 'vouchers', label: 'Fee Vouchers', icon: FileText },
    { id: 'collections', label: 'Collections', icon: Receipt },
    {
      id: 'defaulters',
      label: 'Defaulters & Month Close',
      icon: AlertTriangle,
      badge: monthDefaulters.length > 0 ? monthDefaulters.length : undefined,
    },
    { id: 'transport', label: 'Transport', icon: Bus },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (tabId: ActiveTab) => {
    setActiveTab(tabId);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col bg-slate-900 text-slate-100 border-r border-slate-800 transition-all duration-300 ease-in-out print:hidden ${
          // Mobile state: slide in / out
          mobileOpen
            ? 'translate-x-0 w-72 shadow-2xl'
            : '-translate-x-full md:translate-x-0'
        } ${
          // Desktop collapsed vs expanded
          isSidebarCollapsed ? 'md:w-20' : 'md:w-64'
        }`}
      >
        {/* Sidebar Header: School Logo & Title */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800/80 shrink-0 min-h-[68px]">
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white font-bold text-xl shadow-md border border-teal-500 overflow-hidden shrink-0">
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
                <Building2 className="w-5 h-5 text-white" />
              )}
            </div>

            {(!isSidebarCollapsed || mobileOpen) && (
              <div className="min-w-0 leading-tight">
                <h1 className="text-sm font-bold tracking-tight text-white truncate">
                  {institute.name}
                </h1>
                <p className="text-[11px] text-slate-400 truncate">
                  {institute.regNo || 'Fee Management'}
                </p>
              </div>
            )}
          </div>

          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Desktop Collapse / Expand Toggle */}
          <button
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className="hidden md:flex items-center justify-center w-7 h-7 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer shrink-0"
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4 text-teal-400" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>

        {/* Working Month Selector in Sidebar */}
        {(!isSidebarCollapsed || mobileOpen) ? (
          <div className="px-3.5 py-3 border-b border-slate-800/80 bg-slate-950/40 shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">
              Active Billing Month
            </span>
            <div className="flex items-center justify-between bg-teal-950/60 border border-teal-600/40 rounded-xl px-2 py-1 text-xs">
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
                className="bg-transparent text-teal-200 font-extrabold text-xs focus:outline-none cursor-pointer tracking-wide text-center"
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
          </div>
        ) : (
          <div className="py-2.5 flex justify-center border-b border-slate-800/80 bg-slate-950/40 shrink-0">
            <button
              onClick={() => {
                const next = (currentIdx + 1) % availableMonths.length;
                setActiveMonth(availableMonths[next]);
              }}
              title={`Active Month: ${activeMonth} (Click to advance)`}
              className="p-2 rounded-xl bg-teal-950/70 text-teal-400 border border-teal-600/40 hover:bg-teal-900/60 transition cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Navigation Items Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1.5 no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isCollapsed = isSidebarCollapsed && !mobileOpen;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group relative ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-md shadow-teal-950/40 font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                } ${isCollapsed ? 'justify-center px-2' : 'justify-between'}`}
              >
                <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? 'justify-center' : ''}`}>
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-teal-400'
                    }`}
                  />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </div>

                {!isCollapsed && item.badge !== undefined && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                      isActive
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {/* Badge Dot when collapsed */}
                {isCollapsed && item.badge !== undefined && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-900" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer: User Profile & Role Info */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50 shrink-0">
          {(!isSidebarCollapsed || mobileOpen) ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-800/70 border border-slate-700/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700 border border-slate-600 text-emerald-400 shrink-0">
                    <UserCheck className="w-4 h-4" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-slate-800" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-xs font-bold text-slate-200 truncate">
                      {currentUser.name}
                    </span>
                    <span className="block text-[10px] text-slate-400 truncate">
                      @{currentUser.username}
                    </span>
                  </div>
                </div>

                <div
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                    currentUser.role === 'Admin'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : currentUser.role === 'Accountant'
                      ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600/50'
                  }`}
                >
                  {currentUser.role}
                </div>
              </div>

              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div
                title={`${currentUser.name} (${currentUser.role})`}
                className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400"
              >
                <UserCheck className="w-4 h-4" />
              </div>
              <button
                onClick={logout}
                title="Sign Out"
                className="w-9 h-9 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 flex items-center justify-center transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
