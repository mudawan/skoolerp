import { AppThemeConfig, ThemeColor } from '../types';

export interface ThemePreset {
  name: string;
  primaryColor: string;
  primaryBg: string;
  primaryHover: string;
  primaryText: string;
  primaryBorder: string;
  primaryRing: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentBg: string;
  hex: string;
  lightHex: string;
  chartColor: string;
  headerGradient: string;
  textColor?: string;
  lightBg?: string;
  lightBorder?: string;
  hoverColor?: string;
  activeNavBg?: string;
  activeNavGlow?: string;
  sampleBadgeClass?: string;
}

export const THEME_COLOR_PRESETS: Record<string, ThemePreset> = {
  teal: {
    name: 'Teal',
    primaryColor: 'teal',
    primaryBg: 'bg-teal-600',
    primaryHover: 'hover:bg-teal-700',
    primaryText: 'text-teal-700',
    primaryBorder: 'border-teal-500',
    primaryRing: 'ring-teal-500',
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-800',
    badgeBorder: 'border-teal-200',
    accentBg: 'bg-teal-500/10',
    hex: '#0d9488',
    lightHex: '#2dd4bf',
    chartColor: '#0d9488',
    headerGradient: 'from-slate-950 via-slate-900 to-teal-900',
    textColor: 'text-teal-700',
    lightBg: 'bg-teal-50',
    lightBorder: 'border-teal-200',
    hoverColor: 'hover:bg-teal-700',
    activeNavBg: 'bg-teal-600',
    activeNavGlow: 'shadow-teal-500/20',
    sampleBadgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  navy: {
    name: 'Navy',
    primaryColor: 'blue',
    primaryBg: 'bg-blue-800',
    primaryHover: 'hover:bg-blue-900',
    primaryText: 'text-blue-800',
    primaryBorder: 'border-blue-700',
    primaryRing: 'ring-blue-700',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-900',
    badgeBorder: 'border-blue-200',
    accentBg: 'bg-blue-800/10',
    hex: '#1e3a8a',
    lightHex: '#60a5fa',
    chartColor: '#1e3a8a',
    headerGradient: 'from-slate-950 via-slate-900 to-blue-900',
    textColor: 'text-blue-800',
    lightBg: 'bg-blue-50',
    lightBorder: 'border-blue-200',
    hoverColor: 'hover:bg-blue-900',
    activeNavBg: 'bg-blue-800',
    activeNavGlow: 'shadow-blue-500/20',
    sampleBadgeClass: 'bg-blue-50 text-blue-900 border-blue-200',
  },
  indigo: {
    name: 'Indigo',
    primaryColor: 'indigo',
    primaryBg: 'bg-indigo-600',
    primaryHover: 'hover:bg-indigo-700',
    primaryText: 'text-indigo-700',
    primaryBorder: 'border-indigo-500',
    primaryRing: 'ring-indigo-500',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    badgeBorder: 'border-indigo-200',
    accentBg: 'bg-indigo-500/10',
    hex: '#4f46e5',
    lightHex: '#818cf8',
    chartColor: '#4f46e5',
    headerGradient: 'from-slate-950 via-slate-900 to-indigo-900',
    textColor: 'text-indigo-700',
    lightBg: 'bg-indigo-50',
    lightBorder: 'border-indigo-200',
    hoverColor: 'hover:bg-indigo-700',
    activeNavBg: 'bg-indigo-600',
    activeNavGlow: 'shadow-indigo-500/20',
    sampleBadgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  emerald: {
    name: 'Emerald',
    primaryColor: 'emerald',
    primaryBg: 'bg-emerald-600',
    primaryHover: 'hover:bg-emerald-700',
    primaryText: 'text-emerald-700',
    primaryBorder: 'border-emerald-500',
    primaryRing: 'ring-emerald-500',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-200',
    accentBg: 'bg-emerald-500/10',
    hex: '#059669',
    lightHex: '#34d399',
    chartColor: '#059669',
    headerGradient: 'from-slate-950 via-slate-900 to-emerald-900',
    textColor: 'text-emerald-700',
    lightBg: 'bg-emerald-50',
    lightBorder: 'border-emerald-200',
    hoverColor: 'hover:bg-emerald-700',
    activeNavBg: 'bg-emerald-600',
    activeNavGlow: 'shadow-emerald-500/20',
    sampleBadgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  amber: {
    name: 'Amber',
    primaryColor: 'amber',
    primaryBg: 'bg-amber-600',
    primaryHover: 'hover:bg-amber-700',
    primaryText: 'text-amber-800',
    primaryBorder: 'border-amber-500',
    primaryRing: 'ring-amber-500',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-900',
    badgeBorder: 'border-amber-200',
    accentBg: 'bg-amber-500/10',
    hex: '#d97706',
    lightHex: '#fbbf24',
    chartColor: '#d97706',
    headerGradient: 'from-slate-950 via-slate-900 to-amber-900',
    textColor: 'text-amber-800',
    lightBg: 'bg-amber-50',
    lightBorder: 'border-amber-200',
    hoverColor: 'hover:bg-amber-700',
    activeNavBg: 'bg-amber-600',
    activeNavGlow: 'shadow-amber-500/20',
    sampleBadgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  rose: {
    name: 'Rose',
    primaryColor: 'rose',
    primaryBg: 'bg-rose-600',
    primaryHover: 'hover:bg-rose-700',
    primaryText: 'text-rose-700',
    primaryBorder: 'border-rose-500',
    primaryRing: 'ring-rose-500',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    badgeBorder: 'border-rose-200',
    accentBg: 'bg-rose-500/10',
    hex: '#e11d48',
    lightHex: '#fb7185',
    chartColor: '#e11d48',
    headerGradient: 'from-slate-950 via-slate-900 to-rose-900',
    textColor: 'text-rose-700',
    lightBg: 'bg-rose-50',
    lightBorder: 'border-rose-200',
    hoverColor: 'hover:bg-rose-700',
    activeNavBg: 'bg-rose-600',
    activeNavGlow: 'shadow-rose-500/20',
    sampleBadgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  slate: {
    name: 'Slate',
    primaryColor: 'slate',
    primaryBg: 'bg-slate-700',
    primaryHover: 'hover:bg-slate-800',
    primaryText: 'text-slate-800',
    primaryBorder: 'border-slate-600',
    primaryRing: 'ring-slate-600',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    badgeBorder: 'border-slate-300',
    accentBg: 'bg-slate-500/10',
    hex: '#334155',
    lightHex: '#94a3b8',
    chartColor: '#334155',
    headerGradient: 'from-slate-950 via-slate-900 to-slate-800',
    textColor: 'text-slate-800',
    lightBg: 'bg-slate-100',
    lightBorder: 'border-slate-300',
    hoverColor: 'hover:bg-slate-800',
    activeNavBg: 'bg-slate-700',
    activeNavGlow: 'shadow-slate-500/20',
    sampleBadgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
};

export const DEFAULT_THEME_CONFIG: AppThemeConfig = {
  color: 'teal',
  sidebarTheme: 'dark',
};

export function applyThemeToDom(config: AppThemeConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme-color', config.color || 'teal');
  root.setAttribute('data-sidebar-theme', config.sidebarTheme || 'dark');
}
