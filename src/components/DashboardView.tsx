import React from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatMonthName, getPreviousMonthString, getRecentMonthsEndingAt } from '../utils/feeMath';
import { ActiveTab } from '../types';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';
import {
  AlertTriangle,
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
                  setActiveTab('settings');
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

      {/* Month Closure Gate Warning Banner */}
      {!prevMonthStatus.isClosed && prevMonthStatus.totalVouchers > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 py-2.5 px-3.5 rounded-xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold text-amber-900">
                Month Closure Required for {formatMonthName(prevMonthStr)} ({prevMonthStr}):{' '}
              </span>
              <span className="text-amber-800">
                {prevMonthStatus.uncarriedUnpaidCount} uncarried outstanding voucher(s).
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-warning-manage-defaulters"
              onClick={() => setActiveTab('defaulters')}
              className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold text-xs rounded-md transition shadow-2xs cursor-pointer whitespace-nowrap flex items-center gap-1"
            >
              Manage Defaulters
            </button>
            <button
              id="btn-warning-month-end-wizard"
              onClick={() => {
                if (onOpenMonthEndWizard) {
                  onOpenMonthEndWizard(prevMonthStr);
                } else {
                  setActiveTab('settings');
                }
              }}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-md transition shadow-xs cursor-pointer whitespace-nowrap flex items-center gap-1"
            >
              <CalendarCheck className="w-3 h-3" />
              Month End Wizard &rarr;
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Fee Target */}
        <div
          style={{
            background: `linear-gradient(160deg, ${preset.lightBg}65 0%, #ffffff 40%, #ffffff 100%)`,
          }}
          className="relative bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden group flex flex-col justify-between"
        >
          <div
            className="h-1 w-full shrink-0"
            style={{
              background: `linear-gradient(90deg, ${preset.primaryColor} 0%, ${preset.hoverColor} 100%)`,
            }}
          />
          <div className="p-5 flex flex-col justify-between flex-1">
            {/* Top Row: Title & Uniform Icon Box */}
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">
                  Total Fee Target
                </p>
              </div>
              <div
                style={{
                  backgroundColor: preset.lightBg,
                  color: preset.primaryColor,
                  borderColor: preset.lightBorder,
                }}
                className="w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform"
              >
                <Coins className="w-5.5 h-5.5" />
              </div>
            </div>

            {/* Metric Value */}
            <div className="my-2.5">
              <h3 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
                {formatCurrency(totalGrossTarget)}
              </h3>
            </div>

            {/* Bottom Row: Metadata & Badge */}
            <div className="pt-3 border-t border-slate-100/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="flex items-center gap-1.5 font-medium text-slate-600 truncate">
                <FileText style={{ color: preset.primaryColor }} className="w-3.5 h-3.5 shrink-0" />
                <span>{monthVouchers.length} Vouchers Issued</span>
              </span>
              <span className="text-[11px] font-medium text-slate-400 shrink-0">
                {formatMonthName(activeMonth)}
              </span>
            </div>
          </div>
        </div>

        {/* Collected Amount */}
        <div
          style={{
            background: 'linear-gradient(160deg, #ecfdf565 0%, #ffffff 40%, #ffffff 100%)',
          }}
          className="relative bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden group flex flex-col justify-between"
        >
          <div className="h-1 w-full shrink-0 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="p-5 flex flex-col justify-between flex-1">
            {/* Top Row: Title & Uniform Icon Box */}
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">
                  Collected Amount
                </p>
              </div>
              <div className="w-11 h-11 bg-emerald-50 border border-emerald-200/70 rounded-xl flex items-center justify-center text-emerald-600 shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                <CheckCircle2 className="w-5.5 h-5.5" />
              </div>
            </div>

            {/* Metric Value */}
            <div className="my-2.5">
              <h3 className="text-2xl lg:text-3xl font-bold tracking-tight text-emerald-600">
                {formatCurrency(totalCollected)}
              </h3>
            </div>

            {/* Bottom Row: Metadata & Progress Indicator */}
            <div className="pt-3 border-t border-slate-100/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="flex items-center gap-1.5 font-medium text-emerald-700 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{collectionPercentage}% Collected</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200/50">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, collectionPercentage)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Outstanding Defaulters */}
        <div
          style={{
            background: 'linear-gradient(160deg, #fff1f265 0%, #ffffff 40%, #ffffff 100%)',
          }}
          className="relative bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden group flex flex-col justify-between"
        >
          <div className="h-1 w-full shrink-0 bg-gradient-to-r from-rose-500 to-amber-500" />
          <div className="p-5 flex flex-col justify-between flex-1">
            {/* Top Row: Title & Uniform Icon Box */}
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">
                  Outstanding Defaulters
                </p>
              </div>
              <div className="w-11 h-11 bg-rose-50 border border-rose-200/70 rounded-xl flex items-center justify-center text-rose-600 shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                <Clock className="w-5.5 h-5.5" />
              </div>
            </div>

            {/* Metric Value */}
            <div className="my-2.5">
              <h3 className="text-2xl lg:text-3xl font-bold tracking-tight text-rose-600">
                {formatCurrency(totalOutstanding)}
              </h3>
            </div>

            {/* Bottom Row: Metadata & Badge */}
            <div className="pt-3 border-t border-slate-100/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="flex items-center gap-1.5 font-medium text-rose-600 truncate">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>{defaultersCount} Unpaid Vouchers</span>
              </span>
              <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200/60 shrink-0">
                {totalGrossTarget > 0 ? `${Math.round((totalOutstanding / totalGrossTarget) * 100)}%` : '0%'} Due
              </span>
            </div>
          </div>
        </div>

        {/* Active Enrolled Students */}
        <div
          style={{
            background: `linear-gradient(160deg, ${preset.lightBg}45 0%, #ffffff 40%, #ffffff 100%)`,
          }}
          className="relative bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden group flex flex-col justify-between"
        >
          <div
            className="h-1 w-full shrink-0"
            style={{
              background: `linear-gradient(90deg, ${preset.hoverColor} 0%, ${preset.primaryColor} 100%)`,
            }}
          />
          <div className="p-5 flex flex-col justify-between flex-1">
            {/* Top Row: Title & Uniform Icon Box */}
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">
                  Active Enrolled Students
                </p>
              </div>
              <div
                style={{
                  backgroundColor: preset.lightBg,
                  color: preset.primaryColor,
                  borderColor: preset.lightBorder,
                }}
                className="w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform"
              >
                <Users className="w-5.5 h-5.5" />
              </div>
            </div>

            {/* Metric Value (No redundant second 'Students' word) */}
            <div className="my-2.5">
              <h3 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
                {activeStudents.length.toLocaleString()}
              </h3>
            </div>

            {/* Bottom Row: Metadata & Badge */}
            <div className="pt-3 border-t border-slate-100/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="flex items-center gap-1.5 font-medium text-slate-600 truncate">
                <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{classes.filter((c) => c.active).length} Active Classes</span>
              </span>
              <span className="text-[11px] font-medium text-slate-400 shrink-0">
                All Sections
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 6-Month Trend Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp style={{ color: preset.primaryColor }} className="w-5 h-5" />
                6-Month Fee Collection Trend
              </h3>
              <p className="text-xs text-slate-500">
                Target vs Actual Collections over the past 6 months
              </p>
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
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet style={{ color: preset.primaryColor }} className="w-5 h-5" />
              Voucher Status Breakdown
            </h3>
            <p className="text-xs text-slate-500">
              Status of {monthVouchers.length} vouchers for {formatMonthName(activeMonth)}
            </p>
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
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap style={{ color: preset.primaryColor }} className="w-5 h-5" />
                Class-Wise Fee Collection Performance
              </h3>
              <p className="text-xs text-slate-500">
                Issued vs collected progress across all active classes for {formatMonthName(activeMonth)}
              </p>
            </div>
            <button
              onClick={() => setActiveTab('reports')}
              className="text-xs text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1 cursor-pointer"
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
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Receipt style={{ color: preset.primaryColor }} className="w-5 h-5" />
                Recent Collections Ledger
              </h3>
              <p className="text-xs text-slate-500">
                Latest payment transactions
              </p>
            </div>
            <button
              onClick={() => setActiveTab('collections')}
              className="text-xs text-teal-600 hover:text-teal-700 font-semibold cursor-pointer"
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
