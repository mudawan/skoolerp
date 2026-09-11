import React from 'react';
import { ActiveTab } from '../types';
import { useApp } from '../context/AppContext';
import { getMonthPickerWindow, mergeWithDataMonths } from '../utils/feeMath';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';
import { MonthPicker } from './MonthPicker';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  Bus,
  Calendar,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Database,
  FileText,
  FolderKanban,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Shield,
  Sliders,
  UserCheck,
  Users,
  Wrench,
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
    currentInstitution,
    currentUser,
    activeMonth,
    setActiveMonth,
    beforeMonthChange,
    vouchers,
    getMonthClosureStatus,
    logout,
    hasPermission,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    themeConfig,
  } = useApp();

  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;
  const isLight = themeConfig?.sidebarTheme === 'light';

  const sidebarBgClass =
    themeConfig?.sidebarTheme === 'light'
      ? 'bg-white text-slate-800 border-slate-200 shadow-md'
      : themeConfig?.sidebarTheme === 'branded'
      ? themeConfig.color === 'teal'
        ? 'bg-[#042424] text-teal-50 border-teal-900/80'
        : themeConfig.color === 'navy'
        ? 'bg-[#081734] text-blue-50 border-blue-900/80'
        : themeConfig.color === 'indigo'
        ? 'bg-[#130f2c] text-indigo-50 border-indigo-950'
        : themeConfig.color === 'emerald'
        ? 'bg-[#022319] text-emerald-50 border-emerald-950'
        : themeConfig.color === 'amber'
        ? 'bg-[#241004] text-amber-50 border-amber-950'
        : themeConfig.color === 'rose'
        ? 'bg-[#240614] text-rose-50 border-rose-950'
        : 'bg-[#131416] text-zinc-50 border-zinc-800'
      : 'bg-slate-900 text-slate-100 border-slate-800';

  // See HeaderBar.tsx for why these are kept separate: the picker window
  // alone doesn't mean data exists for those months, so it must not feed the
  // "Vouchers / Records Exist" indicator dot.
  const pickerWindowMonths = mergeWithDataMonths(
    getMonthPickerWindow(),
    vouchers.map((v) => v.month)
  );
  const monthsWithData = Array.from(new Set(vouchers.map((v) => v.month)));

  // Route month switches through the shared guard (SettingsView may veto while
  // it has unsaved template drafts open).
  const changeMonth = (next: string) => {
    if (!next || next === activeMonth) return;
    if (beforeMonthChange.current && beforeMonthChange.current(next)) return;
    setActiveMonth(next);
  };

  const monthDefaulters = vouchers.filter(
    (v) => v.month === activeMonth && (v.status === 'Issued' || v.status === 'Partial')
  );

  interface NavItemDef {
    id: ActiveTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number | string;
    permission: () => boolean;
  }

  interface NavSectionDef {
    id: string;
    label: string;
    items: NavItemDef[];
  }

  const navSections: NavSectionDef[] = [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          permission: () => hasPermission('dashboard.view'),
        },
      ],
    },
    {
      id: 'academics',
      label: 'Directory & Academics',
      items: [
        {
          id: 'students',
          label: 'Students',
          icon: Users,
          permission: () => hasPermission('students.view'),
        },
        {
          id: 'families',
          label: 'Families',
          icon: FolderKanban,
          permission: () => hasPermission('families.view'),
        },
        {
          id: 'classes',
          label: 'Classes & Sections',
          icon: BookOpen,
          permission: () => hasPermission('classes.view'),
        },
        {
          id: 'transport',
          label: 'Transport Routes',
          icon: Bus,
          permission: () => hasPermission('transport.view'),
        },
      ],
    },
    {
      id: 'billing',
      label: 'Fee Operations',
      items: [
        {
          id: 'vouchers',
          label: 'Fee Vouchers',
          icon: FileText,
          permission: () => hasPermission('fees.view'),
        },
        {
          id: 'collections',
          label: 'Collections',
          icon: Receipt,
          permission: () => hasPermission('fees.collect') || hasPermission('fees.view'),
        },
        {
          id: 'defaulters',
          label: 'Defaulters & Arrears',
          icon: AlertTriangle,
          badge: monthDefaulters.length > 0 ? monthDefaulters.length : undefined,
          permission: () => hasPermission('defaulters.view') || hasPermission('fees.view'),
        },
        {
          id: 'monthEnd',
          label: 'Month End Wizard',
          icon: CalendarCheck,
          permission: () =>
            hasPermission('defaulters.manage') ||
            hasPermission('defaulters.view') ||
            hasPermission('fees.view') ||
            hasPermission('settings.manage'),
        },
        {
          id: 'policies',
          label: 'Financial Policies',
          icon: Sliders,
          permission: () =>
            hasPermission('settings.view') ||
            hasPermission('settings.manage') ||
            hasPermission('fees.manage') ||
            hasPermission('fees.view'),
        },
      ],
    },
    {
      id: 'reports_audit',
      label: 'Reports & Governance',
      items: [
        {
          id: 'reports',
          label: 'Financial Reports',
          icon: BarChart3,
          permission: () => hasPermission('fees.report'),
        },
        {
          id: 'audit',
          label: 'Audit Trail',
          icon: History,
          permission: () => hasPermission('audit.view'),
        },
      ],
    },
    {
      id: 'system',
      label: 'Administration & Settings',
      items: [
        {
          id: 'profile',
          label: 'Campus Profile',
          icon: Building2,
          permission: () => hasPermission('settings.view') || hasPermission('settings.manage'),
        },
        {
          id: 'banks',
          label: 'Bank Accounts',
          icon: Landmark,
          permission: () =>
            hasPermission('settings.view') ||
            hasPermission('settings.manage') ||
            hasPermission('fees.manage'),
        },
        {
          id: 'users',
          label: 'Users & Permissions',
          icon: UserCheck,
          permission: () =>
            currentUser?.role === 'Admin' ||
            hasPermission('users.manage') ||
            hasPermission('settings.manage'),
        },
        {
          id: 'appearance',
          label: 'Appearance & Theme',
          icon: Palette,
          permission: () => hasPermission('settings.view') || hasPermission('settings.manage'),
        },
        {
          id: 'database',
          label: 'Database & Backups',
          icon: Database,
          permission: () =>
            currentUser?.role === 'Admin' ||
            hasPermission('database.manage') ||
            hasPermission('settings.manage'),
        },
        {
          id: 'cleanup',
          label: 'Data Maintenance',
          icon: Wrench,
          permission: () => currentUser?.role === 'Admin' || hasPermission('system.cleanup'),
        },
      ],
    },
  ];

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.permission()),
    }))
    .filter((section) => section.items.length > 0);

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
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 ${
          mobileOpen ? 'z-50' : 'z-40'
        } flex flex-col ${sidebarBgClass} transition-all duration-300 ease-in-out print:hidden ${
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
        <div
          className={`relative flex items-center ${
            isSidebarCollapsed && !mobileOpen ? 'justify-center px-2 py-3.5' : 'justify-between p-4'
          } border-b ${isLight ? 'border-slate-200' : 'border-slate-800/80'} shrink-0 min-h-[68px]`}
        >
          <div
            onClick={() => {
              if (isSidebarCollapsed && !mobileOpen) {
                setIsSidebarCollapsed(false);
              }
            }}
            className={`flex items-center gap-3 min-w-0 ${
              isSidebarCollapsed && !mobileOpen ? 'cursor-pointer' : ''
            }`}
            title={isSidebarCollapsed && !mobileOpen ? 'Click to expand sidebar' : undefined}
          >
            <div
              style={{ backgroundColor: preset.primaryColor }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-md overflow-hidden shrink-0 transition-transform ${
                isSidebarCollapsed && !mobileOpen ? 'hover:scale-105 ring-1 ring-white/20' : ''
              }`}
            >
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
                <h1 className={`text-sm font-bold tracking-tight truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {currentInstitution?.name || institute.name}
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`font-mono text-[9px] uppercase font-bold px-1.5 py-0.2 rounded border shrink-0 ${
                    isLight
                      ? 'bg-teal-50 text-teal-700 border-teal-200'
                      : 'bg-teal-950 text-teal-300 border-teal-800'
                  }`}>
                    {currentInstitution?.code || institute.code || 'SYS'}
                  </span>
                  <p className={`text-[10px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {institute.regNo || 'Fee Portal'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className={`md:hidden p-1.5 rounded-lg cursor-pointer ${
              isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Desktop Collapse Button (Shown when sidebar is expanded) */}
          {(!isSidebarCollapsed || mobileOpen) && (
            <button
              type="button"
              id="btn-collapse-sidebar"
              onClick={() => setIsSidebarCollapsed(true)}
              title="Collapse Sidebar"
              className={`hidden md:flex items-center justify-center w-7 h-7 rounded-lg transition cursor-pointer shrink-0 ${
                isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            </button>
          )}

          {/* Desktop Expand Button (Floating edge toggle when collapsed - clean separation from school icon) */}
          {isSidebarCollapsed && !mobileOpen && (
            <button
              type="button"
              id="btn-expand-sidebar"
              onClick={() => setIsSidebarCollapsed(false)}
              title="Expand Sidebar"
              className={`hidden md:flex absolute -right-3.5 top-1/2 -translate-y-1/2 z-50 w-7 h-7 rounded-full border shadow-md items-center justify-center transition-all cursor-pointer ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-700 hover:text-teal-600 hover:border-teal-500 hover:scale-110 shadow-slate-200'
                  : 'bg-slate-800 border-slate-600 text-slate-200 hover:text-teal-400 hover:border-teal-400 hover:scale-110 shadow-black/60'
              }`}
            >
              <ChevronRight className="w-4 h-4 text-teal-400" />
            </button>
          )}
        </div>

        {/* Working Month Selector in Sidebar */}
        {(!isSidebarCollapsed || mobileOpen) ? (
          <div className={`px-3.5 py-3 border-b shrink-0 ${isLight ? 'border-slate-200 bg-slate-50/70' : 'border-slate-800/80 bg-slate-950/40'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1.5 px-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Active Billing Month
            </span>
            <MonthPicker
              value={activeMonth}
              onChange={changeMonth}
              availableMonths={monthsWithData}
              closedMonths={pickerWindowMonths.filter((m) => getMonthClosureStatus(m).isClosed)}
              themeColor={themeConfig?.color || 'teal'}
              isLight={isLight}
              className="w-full"
              idPrefix="sidebar-month-picker"
              align="left"
            />
          </div>
        ) : (
          <div className={`py-2.5 px-2 flex justify-center border-b shrink-0 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800/80 bg-slate-950/40'}`}>
            <MonthPicker
              value={activeMonth}
              onChange={changeMonth}
              availableMonths={monthsWithData}
              closedMonths={pickerWindowMonths.filter((m) => getMonthClosureStatus(m).isClosed)}
              themeColor={themeConfig?.color || 'teal'}
              isLight={isLight}
              variant="icon"
              idPrefix="sidebar-collapsed-month-picker"
              align="left"
            />
          </div>
        )}

        {/* Navigation Items Links with Group Boundaries */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4 sidebar-scrollbar">
          {visibleSections.map((section, sIdx) => {
            const isCollapsed = isSidebarCollapsed && !mobileOpen;

            return (
              <div key={section.id} className="space-y-1">
                {/* Section Header (when expanded) or subtle divider (when collapsed) */}
                {!isCollapsed ? (
                  <div className="px-2 pt-1 pb-1 flex items-center justify-between">
                    <span
                      className={`text-[10px] font-bold tracking-wider uppercase select-none ${
                        isLight ? 'text-slate-400' : 'text-slate-400'
                      }`}
                    >
                      {section.label}
                    </span>
                  </div>
                ) : (
                  sIdx > 0 && (
                    <div
                      className={`my-2 mx-1 border-t ${
                        isLight ? 'border-slate-200' : 'border-slate-800'
                      }`}
                    />
                  )
                )}

                {/* Section Items */}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id || (activeTab === 'settings' && item.id === 'profile');

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNavClick(item.id)}
                        title={isCollapsed ? `${section.label}: ${item.label}` : undefined}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer group relative ${
                          isActive
                            ? `${preset.activeNavBg} text-white shadow-md ${preset.activeNavGlow} font-bold`
                            : isLight
                            ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                        } ${isCollapsed ? 'justify-center px-2' : 'justify-between'}`}
                      >
                        <div
                          className={`flex items-center gap-2.5 min-w-0 ${
                            isCollapsed ? 'justify-center' : ''
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                              isActive
                                ? 'text-white'
                                : isLight
                                ? 'text-slate-400 group-hover:text-slate-900'
                                : 'text-slate-400 group-hover:text-slate-200'
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
                </div>
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer: User Profile & Role Info */}
        <div className={`p-3 border-t shrink-0 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/50'}`}>
          {(!isSidebarCollapsed || mobileOpen) ? (
            <div className="space-y-2">
              <div className={`flex items-center justify-between gap-2 p-2 rounded-xl border ${
                isLight ? 'bg-white border-slate-200 shadow-2xs' : 'bg-slate-800/70 border-slate-700/60'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`relative flex items-center justify-center w-8 h-8 rounded-lg border text-emerald-400 shrink-0 ${
                    isLight ? 'bg-slate-100 border-slate-200 text-emerald-600' : 'bg-slate-700 border-slate-600'
                  }`}>
                    <UserCheck className="w-4 h-4" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-slate-800" />
                  </div>
                  <div className="min-w-0">
                    <span className={`block text-xs font-bold truncate ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                      {currentUser.name}
                    </span>
                    <span className={`block text-[10px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      @{currentUser.username}
                    </span>
                  </div>
                </div>

                <div
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                    currentUser.role === 'Admin'
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                      : currentUser.role === 'Accountant'
                      ? `${preset.sampleBadgeClass}`
                      : currentUser.role === 'Custom'
                      ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                      : isLight
                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600/50'
                  }`}
                >
                  {currentUser.role}
                </div>
              </div>

              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div
                title={`${currentUser.name} (${currentUser.role})`}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                  isLight ? 'bg-white border-slate-200 text-emerald-600' : 'bg-slate-800 border-slate-700 text-emerald-400'
                }`}
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
