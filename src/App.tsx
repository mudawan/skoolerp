import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { VerticalSidebar } from './components/VerticalSidebar';
import { DashboardView } from './components/DashboardView';
import { StudentsView } from './components/StudentsView';
import { FamiliesView } from './components/FamiliesView';
import { ClassesView } from './components/ClassesView';
import { VouchersView } from './components/VouchersView';
import { CollectionsView } from './components/CollectionsView';
import { DefaultersView } from './components/DefaultersView';
import { TransportView } from './components/TransportView';
import { ReportsView } from './components/ReportsView';
import { AuditTrailView } from './components/AuditTrailView';
import { SettingsView } from './components/SettingsView';
import { MonthEndWizardView } from './components/MonthEndWizardView';
import { LoginView } from './components/LoginView';
import { SessionInactivityGuard } from './components/SessionInactivityGuard';
import { MonthPicker } from './components/MonthPicker';
import { GlobalStudentSearch } from './components/GlobalStudentSearch';
import { DatabaseStatusBadge } from './components/DatabaseStatusBadge';
import { ActiveTab } from './types';
import { THEME_COLOR_PRESETS } from './utils/themeConfig';
import { getMonthPickerWindow, mergeWithDataMonths } from './utils/feeMath';
import { Building2, Calendar, Menu, ShieldAlert } from 'lucide-react';

function MainApp() {
  const {
    currentUser,
    hasPermission,
    isAuthenticated,
    isSidebarCollapsed,
    currentInstitution,
    institute,
    activeMonth,
    setActiveMonth,
    beforeMonthChange,
    vouchers,
    getMonthClosureStatus,
    themeConfig,
  } = useApp();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [reportStudentId, setReportStudentId] = useState<string | undefined>(undefined);
  const [reportType, setReportType] = useState<'feeCollection' | 'studentLedger' | 'outstanding'>('feeCollection');
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'profile' | 'appearance' | 'policies' | 'banks' | 'templates' | 'users' | 'cleanup' | 'monthEnd'
  >('profile');
  const [settingsTargetMonth, setSettingsTargetMonth] = useState<string | undefined>(undefined);

  const [monthEndInitialMonth, setMonthEndInitialMonth] = useState<string | undefined>(undefined);

  const handleOpenMonthEndWizard = (month?: string) => {
    setMonthEndInitialMonth(month || activeMonth);
    setActiveTab('monthEnd');
  };

  const handleNavigateToLedger = (studentId: string) => {
    setReportStudentId(studentId);
    setReportType('studentLedger');
    setActiveTab('reports');
  };

  const isTabAllowed = (tab: ActiveTab): boolean => {
    switch (tab) {
      case 'dashboard':
        return hasPermission('dashboard.view');
      case 'students':
        return hasPermission('students.view');
      case 'families':
        return hasPermission('families.view');
      case 'classes':
        return hasPermission('classes.view');
      case 'vouchers':
        return hasPermission('fees.view');
      case 'collections':
        return hasPermission('fees.collect') || hasPermission('fees.view');
      case 'defaulters':
        return hasPermission('defaulters.view') || hasPermission('fees.view');
      case 'monthEnd':
        return (
          hasPermission('defaulters.manage') ||
          hasPermission('defaulters.view') ||
          hasPermission('fees.view') ||
          hasPermission('settings.manage')
        );
      case 'policies':
      case 'templates':
        return (
          hasPermission('settings.view') ||
          hasPermission('settings.manage') ||
          hasPermission('fees.edit') ||
          hasPermission('fees.view')
        );
      case 'transport':
        return hasPermission('transport.view');
      case 'reports':
        return hasPermission('fees.report');
      case 'audit':
        return hasPermission('audit.view');
      case 'settings':
      case 'profile':
        return hasPermission('settings.view') || hasPermission('settings.manage');
      case 'banks':
        return (
          hasPermission('settings.view') ||
          hasPermission('settings.manage') ||
          hasPermission('fees.edit')
        );
      case 'users':
        // Deliberately does NOT accept 'settings.manage' — that permission
        // must never grant access to user/permission management (this was
        // the exact settings.manage -> users.manage privilege escalation).
        return currentUser?.role === 'Admin' || hasPermission('users.manage');
      case 'appearance':
        return hasPermission('settings.view') || hasPermission('settings.manage');
      case 'database':
        // Deliberately does NOT accept 'settings.manage' — backup/restore
        // is a distinct, higher-risk capability gated by 'system.backup'.
        return currentUser?.role === 'Admin' || hasPermission('system.backup');
      case 'cleanup':
        return currentUser?.role === 'Admin' || hasPermission('system.cleanup');
      default:
        return true;
    }
  };

  const allTabs: ActiveTab[] = [
    'dashboard',
    'students',
    'families',
    'classes',
    'vouchers',
    'collections',
    'defaulters',
    'monthEnd',
    'policies',
    'templates',
    'transport',
    'reports',
    'audit',
    'profile',
    'banks',
    'users',
    'appearance',
    'database',
    'cleanup',
    'settings',
  ];

  const firstAllowedTab = allTabs.find((t) => isTabAllowed(t)) || 'dashboard';

  // Automatically adjust activeTab if the current tab is not allowed
  useEffect(() => {
    if (currentUser && !isTabAllowed(activeTab)) {
      setActiveTab(firstAllowedTab);
    }
  }, [currentUser?.id, currentUser?.permissions, activeTab]);

  if (!isAuthenticated) {
    return <LoginView />;
  }

  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;
  const isLight = themeConfig?.sidebarTheme === 'light';

  const availableMonths = mergeWithDataMonths(
    getMonthPickerWindow(),
    vouchers.map((v) => v.month)
  );

  const changeMonth = (next: string) => {
    if (!next || next === activeMonth) return;
    if (beforeMonthChange.current && beforeMonthChange.current(next)) return;
    setActiveMonth(next);
  };

  const mobileHeaderBgClass =
    themeConfig?.sidebarTheme === 'light'
      ? 'bg-white text-slate-800 border-slate-200'
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
      : 'bg-slate-900 text-white border-slate-800';

  return (
    <div className="min-w-[320px] min-h-screen bg-slate-100/70 text-slate-900 font-sans antialiased selection:bg-teal-500 selection:text-white flex flex-col md:flex-row">
      {/* Collapsible Left Sidebar */}
      <VerticalSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
      />

      {/* Main Content Container (shifted dynamically based on desktop sidebar collapsed/expanded state) */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'
        }`}
      >
        {/* Mobile-Only Header Bar (Drawer Toggle & Active School info) */}
        <div className={`md:hidden sticky top-0 z-30 ${mobileHeaderBgClass} px-4 py-3 flex items-center justify-between shadow-sm border-b print:hidden`}>
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className={`p-1.5 -ml-1.5 rounded-lg cursor-pointer ${
                isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div
                style={{ backgroundColor: preset.primaryColor }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden shadow-2xs"
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
                  <Building2 className="w-3.5 h-3.5 text-white" />
                )}
              </div>
              <span className={`font-bold text-sm truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {institute.name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DatabaseStatusBadge />
            <MonthPicker
              value={activeMonth}
              onChange={changeMonth}
              availableMonths={availableMonths}
              closedMonths={availableMonths.filter((m) => getMonthClosureStatus(m).isClosed)}
              themeColor={themeConfig?.color || 'teal'}
              isLight={isLight}
              compact={true}
              idPrefix="mobile-header-month-picker"
              align="right"
            />
          </div>
        </div>

        {/* Mobile Search Bar Wrapper */}
        <div className="md:hidden sticky top-[57px] z-25 px-4 py-2 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs print:hidden">
          <GlobalStudentSearch
            onNavigateToLedger={handleNavigateToLedger}
            onNavigateToStudents={() => setActiveTab('students')}
          />
        </div>

        {/* Desktop Top Header Bar (Global Search + Quick Actions + Workspace Indicator) */}
        <header className="hidden md:flex sticky top-0 z-30 bg-slate-100/95 backdrop-blur-md px-6 lg:px-8 py-2.5 border-b border-slate-200/80 items-center justify-between gap-4 print:hidden">
          {/* Global Search Bar */}
          <div className="flex-1 max-w-xl">
            <GlobalStudentSearch
              onNavigateToLedger={handleNavigateToLedger}
              onNavigateToStudents={() => setActiveTab('students')}
            />
          </div>

          {/* Right Header Status / Indicators */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Multi-Tenant Workspace Badge */}
            <div
              id="header-workspace-badge"
              className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs"
              title={`Active Workspace: ${currentInstitution?.name || institute.name} (${currentInstitution?.code || institute.code || 'SYS'})`}
            >
              <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                {currentInstitution?.name || institute.name}
              </span>
              <span className="font-mono text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 font-bold uppercase">
                {currentInstitution?.code || institute.code || 'SYS'}
              </span>
            </div>

            <DatabaseStatusBadge />

            {/* Operator info pill */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-bold text-slate-700">@{currentUser.username}</span>
              <span className="text-slate-400">&bull;</span>
              <span className="text-slate-500 font-medium capitalize">{currentUser.role}</span>
            </div>
          </div>
        </header>

        {/* Main Viewport Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-16 max-w-7xl w-full mx-auto">
          {!isTabAllowed(activeTab) ? (
            <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 shadow-xs max-w-lg mx-auto mt-12 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Module Access Restricted</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Your operator profile (@{currentUser.username} &bull; {currentUser.role}) is not granted access to the {activeTab} module.
                </p>
              </div>
              <button
                onClick={() => setActiveTab(firstAllowedTab)}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
              >
                Go to Accessible Module ({firstAllowedTab})
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  setActiveTab={setActiveTab}
                  onOpenMonthEndWizard={handleOpenMonthEndWizard}
                />
              )}
              {activeTab === 'students' && <StudentsView onNavigateToLedger={handleNavigateToLedger} />}
              {activeTab === 'families' && <FamiliesView />}
              {activeTab === 'classes' && <ClassesView />}
              {activeTab === 'vouchers' && <VouchersView />}
              {activeTab === 'collections' && <CollectionsView />}
              {activeTab === 'defaulters' && <DefaultersView />}
              {activeTab === 'monthEnd' && (
                <SettingsView
                  viewMode="settings"
                  initialSubTab="monthEnd"
                  targetMonth={monthEndInitialMonth || activeMonth}
                  onNavigateToTab={(tab) => {
                    setActiveTab(tab);
                  }}
                />
              )}
              {(activeTab === 'policies' || activeTab === 'templates') && (
                <SettingsView
                  viewMode="policies"
                  initialSubTab={activeTab}
                  onNavigateToTab={(tab) => {
                    setActiveTab(tab);
                  }}
                />
              )}
              {activeTab === 'transport' && <TransportView />}
              {activeTab === 'reports' && (
                <ReportsView
                  initialReportType={reportType}
                  initialStudentId={reportStudentId}
                  onReportTypeChange={setReportType}
                  onStudentIdChange={setReportStudentId}
                />
              )}
              {activeTab === 'audit' && <AuditTrailView />}
              {(activeTab === 'settings' ||
                activeTab === 'profile' ||
                activeTab === 'banks' ||
                activeTab === 'users' ||
                activeTab === 'appearance' ||
                activeTab === 'database' ||
                activeTab === 'cleanup') && (
                <SettingsView
                  viewMode="settings"
                  initialSubTab={
                    activeTab === 'settings'
                      ? settingsInitialTab
                      : (activeTab as any)
                  }
                  targetMonth={settingsTargetMonth}
                  onNavigateToTab={(tab) => {
                    setActiveTab(tab);
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>
      <SessionInactivityGuard />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
