import React from 'react';
import { useApp } from '../../context/AppContext';
import { THEME_COLOR_PRESETS } from '../../utils/themeConfig';
import { ThemeColor, SidebarTheme } from '../../types';
import { Palette, Check, Layout } from 'lucide-react';

export const AppearancePanel: React.FC = () => {
  const { themeConfig, updateThemeConfig } = useApp();

  const handleColorChange = (color: ThemeColor) => {
    updateThemeConfig({ color });
  };

  const handleSidebarChange = (sidebarTheme: SidebarTheme) => {
    updateThemeConfig({ sidebarTheme });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Theme Accent Color</h3>
            <p className="text-xs text-slate-500">Select the primary accent color across buttons, highlights, and tabs</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {(Object.keys(THEME_COLOR_PRESETS) as ThemeColor[]).map((key) => {
            const preset = THEME_COLOR_PRESETS[key];
            const isSelected = (themeConfig?.color || 'teal') === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleColorChange(key)}
                className={`p-3 rounded-xl border transition flex flex-col items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'border-slate-900 bg-slate-50 shadow-xs ring-2 ring-slate-900/10'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full shadow-inner flex items-center justify-center text-white"
                  style={{ backgroundColor: preset.hex }}
                >
                  {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
                <span className="text-xs font-bold text-slate-700">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <div className="p-2 bg-slate-100 text-slate-700 rounded-xl">
            <Layout className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Navigation Sidebar Style</h3>
            <p className="text-xs text-slate-500">Configure visual appearance of navigation bar</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { id: 'dark' as SidebarTheme, label: 'Dark Navy (Default)', desc: 'Professional high-contrast dark theme' },
            { id: 'light' as SidebarTheme, label: 'Clean Light', desc: 'Minimal soft slate clean interface' },
            { id: 'branded' as SidebarTheme, label: 'Brand Colored', desc: 'Accented matching institution color' },
          ].map((item) => {
            const isSelected = (themeConfig?.sidebarTheme || 'dark') === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSidebarChange(item.id)}
                className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                  isSelected
                    ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{item.label}</span>
                  {isSelected && <Check className="w-4 h-4 text-teal-600" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{item.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
