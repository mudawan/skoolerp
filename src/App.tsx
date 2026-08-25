import React, { useState } from 'react';
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
import { SettingsView } from './components/SettingsView';
import { LoginView } from './components/LoginView';
import { ActiveTab } from './types';
import { Building2, Menu } from 'lucide-react';

function MainApp() {
  const { isAuthenticated, isSidebarCollapsed, institute, activeMonth } = useApp();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (!isAuthenticated) {
    return <LoginView />;
  }

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
        <div className="md:hidden sticky top-0 z-30 bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-sm border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="p-1.5 -ml-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
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
              <span className="font-bold text-sm text-white truncate">
                {institute.name}
              </span>
            </div>
          </div>
          <div className="text-[11px] font-bold text-teal-300 bg-teal-950/80 px-2.5 py-1 rounded-lg border border-teal-700/60 shrink-0">
            {activeMonth}
          </div>
        </div>

        {/* Main Viewport Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-16 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && <DashboardView setActiveTab={setActiveTab} />}
          {activeTab === 'students' && <StudentsView />}
          {activeTab === 'families' && <FamiliesView />}
          {activeTab === 'classes' && <ClassesView />}
          {activeTab === 'vouchers' && <VouchersView />}
          {activeTab === 'collections' && <CollectionsView />}
          {activeTab === 'defaulters' && <DefaultersView />}
          {activeTab === 'transport' && <TransportView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
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
