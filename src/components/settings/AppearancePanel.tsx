import React from 'react';
import { useApp } from '../../context/AppContext';
import { SidebarTheme, ThemeColor, UiDensity } from '../../types';
import { THEME_COLOR_PRESETS } from '../../utils/themeConfig';
import {
  Check,
  CheckCircle,
  Palette,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';

export const AppearancePanel: React.FC = () => {
  const {
    themeConfig,
    updateThemeConfig,
    resetThemeConfig,
    showToast,
  } = useApp();

  return (
    <div className="space-y-6">
      {/* Main Appearance Configuration Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Palette className="w-4 h-4 text-teal-600" />
              Visual Theme & Workspace Aesthetics
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Customize the system color palette, navigation style, and visual layout density to match your preferences.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              resetThemeConfig();
              showToast('Theme reset to default Ocean Teal palette', 'info');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer self-start sm:self-auto shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset to Defaults</span>
          </button>
        </div>

        {/* Section 1: Color Palette Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Primary Accent Color Palette
              </h4>
              <p className="text-[11px] text-slate-500">
                Applied to active navigation tabs, buttons, focus rings, and highlighted metrics.
              </p>
            </div>
            <span className="text-xs font-extrabold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-full">
              {THEME_COLOR_PRESETS[themeConfig?.color || 'teal']?.name}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {(Object.entries(THEME_COLOR_PRESETS) as [ThemeColor, typeof THEME_COLOR_PRESETS['teal']][]).map(([key, preset]) => {
              const isSelected = (themeConfig?.color || 'teal') === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    updateThemeConfig({ color: key });
                    showToast(`Applied ${preset.name} theme`, 'success');
                  }}
                  className={`relative p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between group ${
                    isSelected
                      ? 'border-slate-900 ring-2 ring-slate-900/10 bg-slate-50/70 shadow-sm'
                      : 'border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/40 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        style={{ backgroundColor: preset.primaryColor }}
                        className="w-7 h-7 rounded-xl shadow-xs flex items-center justify-center text-white shrink-0 border border-black/10 transition-transform group-hover:scale-105"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="font-bold text-xs text-slate-900 block leading-tight">
                          {preset.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block">
                          {preset.subtitle}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <span
                        style={{ backgroundColor: preset.primaryColor }}
                        className="w-5 h-5 rounded-full text-white flex items-center justify-center shrink-0 shadow-2xs"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  {/* Swatch & Pill Preview */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{ backgroundColor: preset.primaryColor }}
                        className="w-3 h-3 rounded-full border border-black/10"
                        title="Primary Accent"
                      />
                      <span
                        style={{ backgroundColor: preset.hoverColor }}
                        className="w-3 h-3 rounded-full border border-black/10"
                        title="Hover State"
                      />
                      <span
                        style={{ backgroundColor: preset.lightBg }}
                        className="w-3 h-3 rounded-full border border-slate-300"
                        title="Light Background"
                      />
                    </div>

                    <span
                      style={{
                        backgroundColor: preset.lightBg,
                        borderColor: preset.lightBorder,
                        color: preset.textColor,
                      }}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    >
                      Sample Pill
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Sidebar Mode & Density */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
          {/* Sidebar Theme Selector */}
          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Sidebar Navigation Mode
              </h4>
              <p className="text-[11px] text-slate-500">
                Choose the appearance and contrast of the persistent side navigation bar.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                {
                  id: 'dark' as SidebarTheme,
                  name: 'Dark Slate',
                  desc: 'Classic deep contrast',
                  bgClass: 'bg-slate-900 text-white',
                },
                {
                  id: 'light' as SidebarTheme,
                  name: 'Clean Light',
                  desc: 'Minimalist white',
                  bgClass: 'bg-white text-slate-900 border border-slate-200',
                },
                {
                  id: 'branded' as SidebarTheme,
                  name: 'Branded',
                  desc: 'Palette tinted',
                  bgClass: 'bg-slate-800 text-teal-300',
                },
              ].map((mode) => {
                const isSelected = (themeConfig?.sidebarTheme || 'dark') === mode.id;

                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      updateThemeConfig({ sidebarTheme: mode.id });
                      showToast(`Sidebar mode set to ${mode.name}`, 'info');
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-slate-900 ring-2 ring-slate-900/10 bg-slate-50 shadow-2xs font-bold'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shadow-2xs ${mode.bgClass}`}>
                        NAV
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-slate-900" />}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        {mode.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium block">
                        {mode.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* UI Density Selector */}
          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Interface Layout Density
              </h4>
              <p className="text-[11px] text-slate-500">
                Adjust the spacing, padding, and row heights across tables and form cards.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                {
                  id: 'comfortable' as UiDensity,
                  name: 'Comfortable',
                  desc: 'Standard balanced spacing',
                },
                {
                  id: 'compact' as UiDensity,
                  name: 'Compact',
                  desc: 'Dense data-first view',
                },
              ].map((density) => {
                const isSelected = (themeConfig?.density || 'comfortable') === density.id;

                return (
                  <button
                    key={density.id}
                    type="button"
                    onClick={() => {
                      updateThemeConfig({ density: density.id });
                      showToast(`Layout density set to ${density.name}`, 'info');
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-slate-900 ring-2 ring-slate-900/10 bg-slate-50 shadow-2xs font-bold'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex flex-col gap-0.5 w-6">
                        <span className={`h-1 rounded-full bg-slate-400 ${density.id === 'compact' ? 'w-4' : 'w-6'}`} />
                        <span className={`h-1 rounded-full bg-slate-300 ${density.id === 'compact' ? 'w-3' : 'w-5'}`} />
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-slate-900" />}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        {density.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium block">
                        {density.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Section 3: Live Interactive Theme Preview */}
        <div className="pt-3 border-t border-slate-100 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                Live Theme & Layout Density Component Preview
              </h4>
              <p className="text-[11px] text-slate-500">
                Real-time interactive preview of action buttons, form inputs, status badges, and table rows reflecting your active palette and layout density.
              </p>
            </div>

            {/* Density HUD Tag */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                  themeConfig?.density === 'compact'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${themeConfig?.density === 'compact' ? 'bg-amber-500' : 'bg-slate-500'}`} />
                Density: {themeConfig?.density === 'compact' ? 'Compact View' : 'Comfortable View'}
              </span>
            </div>
          </div>

          {(() => {
            const currentPreset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;
            const isCompact = themeConfig?.density === 'compact';

            return (
              <div
                className={`rounded-2xl border border-slate-200/80 bg-slate-50 transition-all duration-200 space-y-3.5 ${
                  isCompact ? 'p-3 sm:p-4' : 'p-4 sm:p-6'
                }`}
              >
                {/* Top Row: Interactive Buttons, Inputs & Badges */}
                <div className={`flex flex-wrap items-center justify-between transition-all ${isCompact ? 'gap-2' : 'gap-3.5'}`}>
                  <div className={`flex flex-wrap items-center transition-all ${isCompact ? 'gap-2' : 'gap-3'}`}>
                    {/* Primary Button */}
                    <button
                      type="button"
                      style={{ backgroundColor: currentPreset.primaryColor }}
                      className={`rounded-xl text-white font-bold shadow-xs cursor-pointer hover:opacity-90 active:scale-95 transition-all ${
                        isCompact ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-xs'
                      }`}
                    >
                      Primary Action
                    </button>

                    {/* Subtle Accent Button */}
                    <button
                      type="button"
                      style={{
                        backgroundColor: currentPreset.lightBg,
                        borderColor: currentPreset.lightBorder,
                        color: currentPreset.textColor,
                      }}
                      className={`rounded-xl border font-bold shadow-2xs cursor-pointer hover:opacity-90 active:scale-95 transition-all ${
                        isCompact ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-xs'
                      }`}
                    >
                      Subtle Accent
                    </button>

                    {/* Sample Search Input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Interactive search..."
                        defaultValue="Grade 5-A"
                        style={{
                          borderColor: currentPreset.lightBorder,
                        }}
                        className={`bg-white border rounded-xl pl-8 pr-3 font-medium text-slate-800 focus:outline-none focus:ring-2 transition-all ${
                          isCompact ? 'py-1 text-[11px] w-36 sm:w-44' : 'py-1.5 text-xs w-40 sm:w-52'
                        }`}
                      />
                    </div>

                    {/* Active Badge */}
                    <span
                      style={{
                        backgroundColor: currentPreset.lightBg,
                        borderColor: currentPreset.lightBorder,
                        color: currentPreset.textColor,
                      }}
                      className={`inline-flex items-center gap-1 rounded-full font-extrabold border transition-all ${
                        isCompact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
                      }`}
                    >
                      <CheckCircle className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                      <span>Active Status</span>
                    </span>
                  </div>

                  {/* Palette Pill */}
                  <span className="text-[11px] text-slate-500 font-medium ml-auto">
                    Palette: <strong className="text-slate-700">{currentPreset.name}</strong>
                  </span>
                </div>

                {/* Middle Section: Live Simulated Table Row Comparison */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs transition-all">
                  <div
                    className={`bg-slate-100/80 border-b border-slate-200 grid grid-cols-12 font-bold text-slate-600 uppercase tracking-wider transition-all ${
                      isCompact ? 'py-1 px-3 text-[10px]' : 'py-2 px-4 text-[11px]'
                    }`}
                  >
                    <div className="col-span-4">Student & ID</div>
                    <div className="col-span-3">Class</div>
                    <div className="col-span-3 text-right">Fee Due</div>
                    <div className="col-span-2 text-center">Status</div>
                  </div>

                  {/* Sample Row 1 */}
                  <div
                    className={`grid grid-cols-12 items-center border-b border-slate-100 hover:bg-slate-50/70 transition-all ${
                      isCompact ? 'py-1.5 px-3 text-[11px]' : 'py-3 px-4 text-xs'
                    }`}
                  >
                    <div className="col-span-4 font-bold text-slate-900 flex items-center gap-2">
                      <span
                        style={{ backgroundColor: currentPreset.lightBg, color: currentPreset.textColor }}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0"
                      >
                        FN
                      </span>
                      <span className="truncate">Fatima Noor <span className="text-slate-400 font-normal text-[10px] ml-1">(REG-2024-009)</span></span>
                    </div>
                    <div className="col-span-3 text-slate-600 font-medium">Class 5-A</div>
                    <div className="col-span-3 text-right font-bold text-slate-900">$3,500</div>
                    <div className="col-span-2 text-center">
                      <span
                        style={{
                          backgroundColor: currentPreset.lightBg,
                          borderColor: currentPreset.lightBorder,
                          color: currentPreset.textColor,
                        }}
                        className={`inline-block rounded-full font-bold border ${
                          isCompact ? 'px-1.5 py-0.2 text-[9px]' : 'px-2 py-0.5 text-[10px]'
                        }`}
                      >
                        Paid Full
                      </span>
                    </div>
                  </div>

                  {/* Sample Row 2 */}
                  <div
                    className={`grid grid-cols-12 items-center hover:bg-slate-50/70 transition-all ${
                      isCompact ? 'py-1.5 px-3 text-[11px]' : 'py-3 px-4 text-xs'
                    }`}
                  >
                    <div className="col-span-4 font-bold text-slate-900 flex items-center gap-2">
                      <span
                        style={{ backgroundColor: currentPreset.lightBg, color: currentPreset.textColor }}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0"
                      >
                        AA
                      </span>
                      <span className="truncate">Ayan Ahmed <span className="text-slate-400 font-normal text-[10px] ml-1">(REG-2024-012)</span></span>
                    </div>
                    <div className="col-span-3 text-slate-600 font-medium">Class 5-A</div>
                    <div className="col-span-3 text-right font-bold text-amber-700">$1,200</div>
                    <div className="col-span-2 text-center">
                      <span className={`inline-block rounded-full font-bold border border-amber-200 bg-amber-50 text-amber-800 ${
                        isCompact ? 'px-1.5 py-0.2 text-[9px]' : 'px-2 py-0.5 text-[10px]'
                      }`}>
                        Partial
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Specs Note */}
                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-medium pt-1">
                  <div className="flex items-center gap-3">
                    <span>Row Height: <strong className="text-slate-700">{isCompact ? '~32px (Compact)' : '~46px (Spacious)'}</strong></span>
                    <span>•</span>
                    <span>Padding: <strong className="text-slate-700">{isCompact ? '6px Vertical' : '12px Vertical'}</strong></span>
                  </div>
                  <span className="text-slate-400">Theme & layout preferences are persisted across sessions.</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
