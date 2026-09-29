// School Management System - Dashboard Overview View
import React from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatMonthName, getPreviousMonthString, getRecentMonthsEndingAt } from '../utils/feeMath';
import { ActiveTab } from '../types';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  PlusCircle,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface DashboardViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  onOpenMonthEndWizard?: (month?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  setActiveTab,
  onOpenMonthEndWizard,
}) => {
  const {
    activeMonth,
    students,
    classes,
    vouchers,
    collections,
    transactions,
    getMonthClosureStatus,
    themeConfig,
  } = useApp();

  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  const monthVouchers = vouchers.filter((v) => v.month === activeMonth && v.status !== 'Reversed');
  const activeStudents = students.filter((s) => s.status === 'Active');

  const totalGrossTarget = monthVouchers.reduce((sum, v) => sum + v.netDue, 0);
  const totalCollected = monthVouchers.reduce((sum, v) => sum + v.amountPaid, 0);
  const totalOutstanding = totalGrossTarget - totalCollected;

  const collectionPercentage =
    totalGrossTarget > 0 ? Math.round((totalCollected / totalGrossTarget) * 100) : 0;

  const defaultersCount = monthVouchers.filter(
    (v) => (v.status === 'Issued' || v.status === 'Partial') && v.amountPaid < v.netDue
  ).length;

  const paidVouchersCount = monthVouchers.filter((v) => v.status === 'Paid').length;

  // Previous month closure status check
  const prevMonthStr = getPreviousMonthString(activeMonth);
  const prevMonthStatus = getMonthClosureStatus(prevMonthStr);

  // 6-Month Fee Collection Trend Data
  const monthList = getRecentMonthsEndingAt(activeMonth, 6);

  const trendData = monthList.map((m) => {
    const vchs = vouchers.filter((v) => v.month === m && v.status !== 'Reversed');
    const target = vchs.reduce((sum, v) => sum + v.netDue, 0);
    const collected = vchs.reduce((sum, v) => sum + v.amountPaid, 0);
    return {
      month: formatMonthName(m).split(' ')[0], // e.g. "August"
      Target: target,
      Collected: collected,
    };
  });

  // Per-Class Collection Breakdown
  const classBreakdown = classes.map((cls) => {
    const clsVchs = monthVouchers.filter((v) => v.classId === cls.id);
    const target = clsVchs.reduce((sum, v) => sum + v.netDue, 0);
    const collected = clsVchs.reduce((sum, v) => sum + v.amountPaid, 0);
    const pct = target > 0 ? Math.round((collected / target) * 100) : 0;
    return {
      name: cls.name,
      studentCount: students.filter((s) => s.classId === cls.id && s.status === 'Active').length,
      vouchersCount: clsVchs.length,
      target,
      collected,
      pct,
    };
  });

  // Pie chart data for status
  const pieData = [
    { name: 'Paid Full', value: paidVouchersCount, color: '#10B981' },
    {
      name: 'Partial Paid',
      value: monthVouchers.filter((v) => v.status === 'Partial').length,
      color: '#F59E0B',
    },
    {
      name: 'Unpaid Defaulters',
      value: monthVouchers.filter((v) => v.status === 'Issued').length,
      color: '#EF4444',
    },
    {
      name: 'Carried Over',
      value: monthVouchers.filter((v) => v.status === 'Carried').length,
      color: '#6B7280',
    },
  ].filter((d) => d.value > 0);

  const recentCollections = collections.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Action Buttons */}
      <div className={`bg-gradient-to-r ${preset.headerGradient} rounded-2xl px-5 py-4 text-white shadow-md relative overflow-hidden border border-white/10`}>
        {/* Themed Glow Flare */}
        <div
          style={{ backgroundColor: preset.primaryColor }}
          className="absolute -right-10 -top-10 w-44 h-44 rounded-full opacity-25 blur-3xl pointer-events-none"
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center flex-wrap gap-2.5">
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                Fee Collection Dashboard
              </h2>
              <span
                style={{
                  backgroundColor: preset.primaryColor + '30',
                  borderColor: preset.primaryColor + '70',
                  color: preset.lightBorder,
                }}
                className="text-[11px] font-bold tracking-wide px-2.5 py-0.5 rounded-lg border backdrop-blur-xs flex items-center gap-1.5 shadow-2xs"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatMonthName(activeMonth)}</span>
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Track voucher issuance, daily collections, carry-forwards, and class performance.
            </p>
          </div>

          {/* Quick Actions with Month Close button */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-dashboard-generate-vouchers"
              onClick={() => setActiveTab('vouchers')}
              style={{
                backgroundColor: preset.primaryColor,
              }}
              className="flex items-center gap-1.5 hover:opacity-90 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-md transition cursor-pointer whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Generate Vouchers</span>
            </button>
            <button
              id="btn-dashboard-collect-fees"
              onClick={() => setActiveTab('collections')}
              className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-white font-medium px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              <span>Collect Fees</span>
            </button>
            <button
              id="btn-dashboard-defaulters"
              onClick={() => setActiveTab('defaulters')}
              className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-white font-medium px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Defaulters</span>
              <span className="bg-amber-400/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-amber-400/30">
                {defaultersCount}
              </span>
            </button>
            <button
              id="btn-dashboard-month-close"
              onClick={() => {
                if (onOpenMonthEndWizard) {
                  onOpenMonthEndWizard(activeMonth);
                } else {
                  setActiveTab('monthEnd');
                }
              }}
              title="Open Month End Reconciliation & Defaulter Wizard"
              className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-white font-medium px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <CalendarCheck className="w-3.5 h-3.5 text-indigo-200" />
              <span>Month End Wizard</span>
            </button>
          </div>
        </div>
      </div>

      {/* Month Closure Gate Warning Card - DefaultersView Styled */}
      {!prevMonthStatus.isClosed && prevMonthStatus.totalVouchers > 0 && (
        <div
          style={{
            background: 'linear-gradient(160deg, #fffbeb 0%, #ffffff 40%, #ffffff 100%)',
            borderColor: '#fde68a',
          }}
          className="p-4 sm:p-5 rounded-2xl border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 transition-all shadow-xs"
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl border shrink-0 bg-amber-100 border-amber-300 text-amber-800">
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">
                  Month Closure Gate for {formatMonthName(prevMonthStr)}:
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide inline-flex items-center gap-1 bg-amber-200 text-amber-950">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-800" />
                  <span>ACTION REQUIRED</span>
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                <span>
                  <strong>{prevMonthStatus.uncarriedUnpaidCount} uncarried outstanding voucher(s)</strong> require collection or carry forward before closing.
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              id="btn-warning-manage-defaulters"
              type="button"
              onClick={() => setActiveTab('defaulters')}
              className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold text-xs rounded-xl transition shadow-2xs cursor-pointer whitespace-nowrap flex items-center gap-1"
            >
              Manage Defaulters
            </button>
            <button
              id="btn-warning-month-end-wizard"
              type="button"
              onClick={() => {
                if (onOpenMonthEndWizard) {
                  onOpenMonthEndWizard(prevMonthStr);
                } else {
                  setActiveTab('monthEnd');
                }
              }}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl transition shadow-xs cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Month End Wizard &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* Primary KPI Status Cards - DefaultersView Design Language */}
      {/* Primary KPI Status Cards - Redesigned Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Fee Target */}
        <button
          id="kpi-card-fee-target"
          type="button"
          onClick={() => setActiveTab('vouchers')}
          style={{
            background: `linear-gradient(160deg, ${preset.lightBg}40 0%, #ffffff 45%, #ffffff 100%)`,
            borderColor: '#e2e8f0',
          }}
          className="text-left rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer shadow-2xs hover:shadow-sm hover:-translate-y-0.5 hover:border-slate-300 group flex flex-col justify-between"
        >
          <div
            className="h-1 w-full transition-all duration-300 shrink-0"
            style={{
              background: `linear-gradient(90deg, ${preset.primaryColor} 0%, ${preset.hoverColor} 100%)`,
            }}
          />
          <div className="p-3 sm:p-3.5 space-y-2 flex flex-col justify-between flex-1">
            {/* Top Row: Icon & Pill Badge */}
            <div className="flex items-center justify-between gap-2">
              <div
                style={{
                  backgroundColor: preset.lightBg,
                  color: preset.primaryColor,
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs"
              >
                <Coins className="w-3.5 h-3.5" />
              </div>
              <span
                style={{
                  backgroundColor: preset.lightBg,
                  color: preset.primaryColor,
                }}
                className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0"
              >
                {monthVouchers.length} Vouchers
              </span>
            </div>

            {/* Middle: Title & Metric Value */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Total Fee Target
              </p>
              <p
                style={{ color: preset.primaryColor }}
                className="text-lg sm:text-xl font-mono font-extrabold tracking-tight mt-0.5"
              >
                {formatCurrency(totalGrossTarget)}
              </p>
            </div>

            {/* Footer Action Ribbon */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
              <span style={{ color: preset.primaryColor }}>
                View Vouchers
              </span>
              <ArrowRight
                className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-1 shrink-0"
                style={{ color: preset.primaryColor }}
              />
            </div>
          </div>
        </button>

        {/* Card 2: Collected Amount */}
        <button
          id="kpi-card-collected-amount"
          type="button"
          onClick={() => setActiveTab('collections')}
          style={{
            background: 'linear-gradient(160deg, #ecfdf5 0%, #ffffff 45%, #ffffff 100%)',
            borderColor: '#e2e8f0',
          }}
          className="text-left rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer shadow-2xs hover:shadow-sm hover:-translate-y-0.5 hover:border-slate-300 group flex flex-col justify-between"
        >
          <div
            className="h-1 w-full transition-all duration-300 shrink-0"
            style={{
              background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
            }}
          />
          <div className="p-3 sm:p-3.5 space-y-2 flex flex-col justify-between flex-1">
            {/* Top Row: Icon & Pill Badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-emerald-100 text-emerald-700 shrink-0 shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 shrink-0">
                {collectionPercentage}% Realized
              </span>
            </div>

            {/* Middle: Title & Metric Value */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Collected Amount
              </p>
              <p className="text-lg sm:text-xl font-mono font-extrabold tracking-tight text-emerald-600 mt-0.5">
                {formatCurrency(totalCollected)}
              </p>
            </div>

            {/* Footer Action Ribbon */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-emerald-700">
              <span>Record & Receipts</span>
              <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-1 shrink-0" />
            </div>
          </div>
        </button>

        {/* Card 3: Outstanding Defaulters */}
        <button
          id="kpi-card-outstanding-defaulters"
          type="button"
          onClick={() => setActiveTab('defaulters')}
          style={{
            background: 'linear-gradient(160deg, #fff1f2 0%, #ffffff 45%, #ffffff 100%)',
            borderColor: '#e2e8f0',
          }}
          className="text-left rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer shadow-2xs hover:shadow-sm hover:-translate-y-0.5 hover:border-slate-300 group flex flex-col justify-between"
        >
          <div
            className="h-1 w-full transition-all duration-300 shrink-0"
            style={{
              background: 'linear-gradient(90deg, #f43f5e 0%, #fb7185 100%)',
            }}
          />
          <div className="p-3 sm:p-3.5 space-y-2 flex flex-col justify-between flex-1">
            {/* Top Row: Icon & Pill Badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-rose-100 text-rose-700 shrink-0 shadow-2xs">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 shrink-0">
                {defaultersCount} Unpaid
              </span>
            </div>

            {/* Middle: Title & Metric Value */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Outstanding Defaulters
              </p>
              <p className="text-lg sm:text-xl font-mono font-extrabold tracking-tight text-rose-600 mt-0.5">
                {formatCurrency(totalOutstanding)}
              </p>
            </div>

            {/* Footer Action Ribbon */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-rose-700">
              <span>Collect or Carry</span>
              <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-1 shrink-0" />
            </div>
          </div>
        </button>

        {/* Card 4: Active Enrolled Students */}
        <button
          id="kpi-card-active-students"
          type="button"
          onClick={() => setActiveTab('students')}
          style={{
            background: 'linear-gradient(160deg, #eef2ff 0%, #ffffff 45%, #ffffff 100%)',
            borderColor: '#e2e8f0',
          }}
          className="text-left rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer shadow-2xs hover:shadow-sm hover:-translate-y-0.5 hover:border-slate-300 group flex flex-col justify-between"
        >
          <div
            className="h-1 w-full transition-all duration-300 shrink-0"
            style={{
              background: 'linear-gradient(90deg, #6366f1 0%, #818cf8 100%)',
            }}
          />
          <div className="p-3 sm:p-3.5 space-y-2 flex flex-col justify-between flex-1">
            {/* Top Row: Icon & Pill Badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-indigo-100 text-indigo-700 shrink-0 shadow-2xs">
                <Users className="w-3.5 h-3.5" />
              </div>
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 shrink-0">
                {classes.filter((c) => c.active).length} Classes
              </span>
            </div>

            {/* Middle: Title & Metric Value */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Enrolled Students
              </p>
              <p className="text-lg sm:text-xl font-mono font-extrabold tracking-tight text-indigo-700 mt-0.5">
                {activeStudents.length.toLocaleString()} Students
              </p>
            </div>

            {/* Footer Action Ribbon */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-indigo-700">
              <span>Student Profiles</span>
              <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-1 shrink-0" />
            </div>
          </div>
        </button>
      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 6-Month Trend Chart */}
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                style={{
                  backgroundColor: preset.lightBg,
                  color: preset.primaryColor,
                  borderColor: preset.lightBorder,
                }}
                className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs"
              >
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  6-Month Fee Collection Trend
                </h3>
                <p className="text-xs text-slate-500">
                  Target vs Actual Collections over the past 6 months
                </p>
              </div>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTarget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94A3B8" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#94A3B8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={preset.chartColor} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={preset.chartColor} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(val) => `Rs.${val / 1000}k`} />
                <Tooltip
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Amount']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="Target" stroke="#64748B" fillOpacity={1} fill="url(#colorTarget)" />
                <Area type="monotone" dataKey="Collected" stroke={preset.chartColor} strokeWidth={2.5} fillOpacity={1} fill="url(#colorCollected)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Voucher Payment Status Pie Chart */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                backgroundColor: preset.lightBg,
                color: preset.primaryColor,
                borderColor: preset.lightBorder,
              }}
              className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Voucher Status Breakdown
              </h3>
              <p className="text-xs text-slate-500">
                Status of {monthVouchers.length} vouchers for {formatMonthName(activeMonth)}
              </p>
            </div>
          </div>

          <div className="h-52 w-full flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} Vouchers`, 'Quantity']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-400 italic">No vouchers generated yet for this month</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-600 truncate">{item.name}:</span>
                <span className="font-bold text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Class Collection Performance & Recent Ledger Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Class Collection Progress Bars */}
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                style={{
                  backgroundColor: preset.lightBg,
                  color: preset.primaryColor,
                  borderColor: preset.lightBorder,
                }}
                className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs"
              >
                <GraduationCap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Class-Wise Fee Collection Performance
                </h3>
                <p className="text-xs text-slate-500">
                  Issued vs collected progress across all active classes for {formatMonthName(activeMonth)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('reports')}
              className="text-xs font-semibold flex items-center gap-1 cursor-pointer hover:underline"
              style={{ color: preset.primaryColor }}
            >
              Full Report &rarr;
            </button>
          </div>

          <div className="space-y-3">
            {classBreakdown.slice(0, 6).map((cls) => (
              <div key={cls.name} className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{cls.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">
                      {formatCurrency(cls.collected)} / {formatCurrency(cls.target)}
                    </span>
                    <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {cls.pct}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${
                      cls.pct >= 80 ? 'bg-emerald-500' : cls.pct >= 40 ? 'bg-teal-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, cls.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Collections Feed */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                style={{
                  backgroundColor: preset.lightBg,
                  color: preset.primaryColor,
                  borderColor: preset.lightBorder,
                }}
                className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs"
              >
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Recent Collections Ledger
                </h3>
                <p className="text-xs text-slate-500">
                  Latest payment transactions
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('collections')}
              className="text-xs font-semibold cursor-pointer hover:underline"
              style={{ color: preset.primaryColor }}
            >
              View All
            </button>
          </div>

          <div className="space-y-3">
            {recentCollections.length > 0 ? (
              recentCollections.map((col) => (
                <div
                  key={col.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 block">{col.collectionNo}</span>
                    <span className="text-slate-500 text-[11px] block">{col.date}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-emerald-600 block text-sm">
                      {formatCurrency(col.totalAmount)}
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium">
                      {col.transactionCount} Voucher(s)
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic py-4 text-center">No collections logged yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
