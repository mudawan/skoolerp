import React from 'react';
import { ActiveTab } from '../types';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bus,
  FileText,
  FolderKanban,
  History,
  Receipt,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';

interface DomainSubNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

interface SubNavTab {
  id: ActiveTab;
  label: string;
  icon: React.FC<{ className?: string }>;
  permission?: string;
  secondaryPermission?: string;
  badge?: number | string;
}

interface DomainGroup {
  id: string;
  name: string;
  badgeLabel: string;
  colorClass: string;
  badgeBgClass: string;
  tabs: SubNavTab[];
}

export const DomainSubNav: React.FC<DomainSubNavProps> = ({ activeTab, setActiveTab }) => {
  const { vouchers, activeMonth, hasPermission, themeConfig } = useApp();
  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  const monthDefaulters = vouchers.filter(
    (v) => v.month === activeMonth && (v.status === 'Issued' || v.status === 'Partial')
  );

  const domainGroups: DomainGroup[] = [
    {
      id: 'academics',
      name: 'Directory & Academics',
      badgeLabel: 'Academic Hub',
      colorClass: 'text-teal-700',
      badgeBgClass: 'bg-teal-50 border-teal-200/80 text-teal-700',
      tabs: [
        { id: 'students', label: 'Students', icon: Users, permission: 'students.view' },
        { id: 'families', label: 'Families', icon: FolderKanban, permission: 'families.view' },
        { id: 'classes', label: 'Classes & Sections', icon: BookOpen, permission: 'classes.view' },
        { id: 'transport', label: 'Transport Routes', icon: Bus, permission: 'transport.view' },
      ],
    },
    {
      id: 'billing',
      name: 'Fee Operations',
      badgeLabel: 'Billing & Cashier',
      colorClass: 'text-indigo-700',
      badgeBgClass: 'bg-indigo-50 border-indigo-200/80 text-indigo-700',
      tabs: [
        { id: 'vouchers', label: 'Fee Vouchers', icon: FileText, permission: 'fees.view' },
        {
          id: 'collections',
          label: 'Counter Collections',
          icon: Receipt,
          permission: 'fees.collect',
          secondaryPermission: 'fees.view',
        },
        {
          id: 'defaulters',
          label: 'Defaulters & Month Close',
          icon: AlertTriangle,
          permission: 'defaulters.view',
          secondaryPermission: 'fees.view',
          badge: monthDefaulters.length > 0 ? monthDefaulters.length : undefined,
        },
      ],
    },
    {
      id: 'analytics',
      name: 'Reports & Governance',
      badgeLabel: 'Financial & Audit',
      colorClass: 'text-amber-700',
      badgeBgClass: 'bg-amber-50 border-amber-200/80 text-amber-700',
      tabs: [
        { id: 'reports', label: 'Financial Reports', icon: BarChart3, permission: 'fees.report' },
        { id: 'audit', label: 'Audit Trail', icon: History, permission: 'audit.view' },
      ],
    },
  ];

  // Find which domain group contains the current activeTab
  const currentGroup = domainGroups.find((g) => g.tabs.some((t) => t.id === activeTab));

  // If activeTab is dashboard or settings, do not render domain sub-nav
  if (!currentGroup) {
    return null;
  }

  // Filter tabs by permission
  const allowedTabs = currentGroup.tabs.filter((tab) => {
    if (!tab.permission) return true;
    if (tab.secondaryPermission) {
      return hasPermission(tab.permission) || hasPermission(tab.secondaryPermission);
    }
    return hasPermission(tab.permission);
  });

  // If only 1 tab is available in this domain for this user, skip rendering subnav
  if (allowedTabs.length <= 1) {
    return null;
  }

  return (
    <div className="mb-5 bg-white/90 backdrop-blur-sm border border-slate-200/90 rounded-2xl p-2 shadow-2xs print:hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Domain Group Identity */}
        <div className="flex items-center gap-2 px-2.5 py-1">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 ${currentGroup.badgeBgClass}`}
          >
            {currentGroup.badgeLabel}
          </span>
          <span className="text-xs font-bold text-slate-700 hidden md:inline">
            {currentGroup.name}
          </span>
        </div>

        {/* Segmented Sibling Switcher Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-0.5 bg-slate-100/90 rounded-xl border border-slate-200/60">
          {allowedTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? `${preset.activeNavBg} text-white shadow-xs ${preset.activeNavGlow}`
                    : 'text-slate-600 hover:text-slate-950 hover:bg-white/80'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{tab.label}</span>

                {tab.badge !== undefined && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                      isActive
                        ? 'bg-amber-400 text-slate-950 font-extrabold'
                        : 'bg-rose-100 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
