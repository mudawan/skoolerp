import { AppThemeConfig, ThemeColor, SidebarTheme, UiDensity } from '../types';

export interface ThemeColorPreset {
  id: ThemeColor;
  name: string;
  subtitle: string;
  primaryColor: string; // Primary brand hex
  hoverColor: string;
  lightBg: string;
  lightBorder: string;
  textColor: string;
  activeNavBg: string;
  activeNavGlow: string;
  previewGradient: string;
  sampleBadgeClass: string;
  headerGradient: string; // Tailored rich gradient for top banners
  chartColor: string; // Hex for charts & metrics
}

export const THEME_COLOR_PRESETS: Record<ThemeColor, ThemeColorPreset> = {
  teal: {
    id: 'teal',
    name: 'Academic Teal',
    subtitle: 'Classic balanced turquoise & slate',
    primaryColor: '#0d9488',
    hoverColor: '#0f766e',
    lightBg: '#f0fdfa',
    lightBorder: '#99f6e4',
    textColor: '#115e59',
    activeNavBg: 'bg-teal-600',
    activeNavGlow: 'shadow-teal-950/40',
    previewGradient: 'from-teal-500 to-teal-700',
    sampleBadgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    headerGradient: 'from-slate-950 via-slate-900 to-[#042424]',
    chartColor: '#0d9488',
  },
  navy: {
    id: 'navy',
    name: 'Oxford Royal Navy',
    subtitle: 'Prestige collegiate cobalt & blue',
    primaryColor: '#2563eb',
    hoverColor: '#1d4ed8',
    lightBg: '#eff6ff',
    lightBorder: '#bfdbfe',
    textColor: '#1e40af',
    activeNavBg: 'bg-blue-600',
    activeNavGlow: 'shadow-blue-950/40',
    previewGradient: 'from-blue-500 to-indigo-700',
    sampleBadgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    headerGradient: 'from-slate-950 via-slate-900 to-[#081d45]',
    chartColor: '#2563eb',
  },
  indigo: {
    id: 'indigo',
    name: 'Regal Indigo',
    subtitle: 'Modern executive violet & purple',
    primaryColor: '#6366f1',
    hoverColor: '#4f46e5',
    lightBg: '#eef2ff',
    lightBorder: '#c7d2fe',
    textColor: '#3730a3',
    activeNavBg: 'bg-indigo-600',
    activeNavGlow: 'shadow-indigo-950/40',
    previewGradient: 'from-indigo-500 to-purple-700',
    sampleBadgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    headerGradient: 'from-slate-950 via-slate-900 to-[#191147]',
    chartColor: '#6366f1',
  },
  emerald: {
    id: 'emerald',
    name: 'Forest Ivy',
    subtitle: 'Prestige evergreen & campus pine',
    primaryColor: '#059669',
    hoverColor: '#047857',
    lightBg: '#ecfdf5',
    lightBorder: '#a7f3d0',
    textColor: '#065f46',
    activeNavBg: 'bg-emerald-600',
    activeNavGlow: 'shadow-emerald-950/40',
    previewGradient: 'from-emerald-500 to-green-700',
    sampleBadgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    headerGradient: 'from-slate-950 via-slate-900 to-[#03291d]',
    chartColor: '#059669',
  },
  amber: {
    id: 'amber',
    name: 'Harvard Amber',
    subtitle: 'Warm institutional bronze & gold',
    primaryColor: '#d97706',
    hoverColor: '#b45309',
    lightBg: '#fffbeb',
    lightBorder: '#fde68a',
    textColor: '#92400e',
    activeNavBg: 'bg-amber-600',
    activeNavGlow: 'shadow-amber-950/40',
    previewGradient: 'from-amber-500 to-orange-700',
    sampleBadgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    headerGradient: 'from-slate-950 via-slate-900 to-[#3b1802]',
    chartColor: '#d97706',
  },
  rose: {
    id: 'rose',
    name: 'Crimson Ruby',
    subtitle: 'High energy ruby & velvet burgundy',
    primaryColor: '#e11d48',
    hoverColor: '#be123c',
    lightBg: '#fff1f2',
    lightBorder: '#fecdd3',
    textColor: '#9f1239',
    activeNavBg: 'bg-rose-600',
    activeNavGlow: 'shadow-rose-950/40',
    previewGradient: 'from-rose-500 to-pink-700',
    sampleBadgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    headerGradient: 'from-slate-950 via-slate-900 to-[#3d061e]',
    chartColor: '#e11d48',
  },
  slate: {
    id: 'slate',
    name: 'Nordic Charcoal',
    subtitle: 'Minimalist high-contrast monochrome',
    primaryColor: '#334155',
    hoverColor: '#1e293b',
    lightBg: '#f8fafc',
    lightBorder: '#cbd5e1',
    textColor: '#0f172a',
    activeNavBg: 'bg-slate-700',
    activeNavGlow: 'shadow-slate-950/40',
    previewGradient: 'from-slate-600 to-zinc-800',
    sampleBadgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    headerGradient: 'from-slate-950 via-slate-900 to-[#1e293b]',
    chartColor: '#334155',
  },
};

export const DEFAULT_THEME_CONFIG: AppThemeConfig = {
  color: 'teal',
  sidebarTheme: 'dark',
  density: 'comfortable',
};

/**
 * Applies CSS custom variables and data attributes to the document root
 */
export function applyThemeToDom(theme: AppThemeConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const preset = THEME_COLOR_PRESETS[theme.color] || THEME_COLOR_PRESETS.teal;

  root.setAttribute('data-theme-color', theme.color);
  root.setAttribute('data-sidebar-theme', theme.sidebarTheme);
  root.setAttribute('data-ui-density', theme.density);

  root.style.setProperty('--color-primary', preset.primaryColor);
  root.style.setProperty('--color-primary-hover', preset.hoverColor);
  root.style.setProperty('--color-primary-light', preset.lightBg);
  root.style.setProperty('--color-primary-border', preset.lightBorder);
  root.style.setProperty('--color-primary-text', preset.textColor);
}
