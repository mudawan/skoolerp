import React from 'react';
import { ActiveTab } from '../types';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bus,
  CreditCard,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  Receipt,
  Settings,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const { vouchers, activeMonth, getMonthClosureStatus, hasPermission } = useApp();

  const monthStatus = getMonthClosureStatus(activeMonth);
  const monthDefaulters = vouchers.filter(
    (v) => v.month === activeMonth && (v.status === 'Issued' || v.status === 'Partial')
  );

  const navItems: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }>; badge?: number | string }[] = [
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
    { id: 'audit', label: 'Audit Trail', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const visibleNavItems = navItems.filter((item) => {
    switch (item.id) {
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
      case 'transport':
        return hasPermission('transport.view');
      case 'reports':
        return hasPermission('fees.report');
      case 'audit':
        return hasPermission('audit.view');
      case 'settings':
        return (
          hasPermission('settings.view') ||
          hasPermission('settings.manage') ||
          hasPermission('users.manage') ||
          hasPermission('system.cleanup')
        );
      default:
        return true;
    }
  });

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-[61px] z-20 shadow-xs print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex overflow-x-auto space-x-1 py-2 no-scrollbar">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id ||
              (item.id === 'settings' &&
                ['profile', 'banks', 'users', 'appearance', 'database', 'cleanup'].includes(activeTab));
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-teal-400' : 'text-slate-500'}`} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`ml-1 text-[11px] font-bold px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-amber-400 text-slate-950' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
