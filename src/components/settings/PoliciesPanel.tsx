import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  PriorMonthVoucherRule,
  SkippedMonthVoucherRule,
  VoucherDeletionResolution,
} from '../../types';
import {
  AlertTriangle,
  ArrowUp,
  Calculator,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  RefreshCw,
  Save,
  ShieldAlert,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';

const DUE_DAY_PRESETS: { day: number | null; label: string; shortLabel: string; description?: string }[] = [
  { day: null, label: 'No default (Leave blank)', shortLabel: 'None', description: 'Voucher generator leaves due date blank' },
  { day: 5, label: '5th of month', shortLabel: '5th', description: 'Due on 5th of voucher billing month' },
  { day: 10, label: '10th of month', shortLabel: '10th', description: 'Due on 10th of voucher billing month' },
  { day: 15, label: '15th of month', shortLabel: '15th', description: 'Due on 15th of voucher billing month' },
  { day: 20, label: '20th of month', shortLabel: '20th', description: 'Due on 20th of voucher billing month' },
  { day: 25, label: '25th of month', shortLabel: '25th', description: 'Due on 25th of voucher billing month' },
  { day: 31, label: '31st (End of month)', shortLabel: '31st', description: 'Due on last calendar day of month' },
];

const ROUNDING_QUICK_PRESETS: { value: number; label: string; description?: string }[] = [
  { value: 1, label: 'Exact (1)', description: 'Exact PKR billing (no round up)' },
  { value: 10, label: '10', description: 'Round up net due to nearest Rs. 10' },
  { value: 20, label: '20', description: 'Round up net due to nearest Rs. 20' },
  { value: 50, label: '50', description: 'Round up net due to nearest Rs. 50' },
];

export interface PoliciesPanelProps {
  selectedLateFeeRate: number;
  setSelectedLateFeeRate: (v: number) => void;
  defaultLateFeeRate: number;
  selectedRoundingMultiple: number;
  setSelectedRoundingMultiple: (v: number) => void;
  selectedRoundingEnabled: boolean;
  setSelectedRoundingEnabled: (v: boolean) => void;
  roundingMultiple: number;
  roundingEnabled: boolean;
  isDefaultDueDateModified: boolean;
  selectedDefaultDueDateEnabled: boolean;
  setSelectedDefaultDueDateEnabled: (v: boolean) => void;
  selectedDefaultDueDay: number;
  setSelectedDefaultDueDay: (v: number) => void;
  dueDayDropdownRef: React.RefObject<HTMLDivElement | null>;
  isDueDayDropdownOpen: boolean;
  setIsDueDayDropdownOpen: (v: boolean) => void;
  policyCategoryTab: 'prior' | 'skipped' | 'deletion';
  setPolicyCategoryTab: (t: 'prior' | 'skipped' | 'deletion') => void;
  selectedPriorRule: PriorMonthVoucherRule;
  setSelectedPriorRule: (r: PriorMonthVoucherRule) => void;
  selectedSkippedRule: SkippedMonthVoucherRule;
  setSelectedSkippedRule: (r: SkippedMonthVoucherRule) => void;
  selectedDeletionResolution: VoucherDeletionResolution;
  setSelectedDeletionResolution: (r: VoucherDeletionResolution) => void;
  hasPolicyChanges: boolean;
  handleResetPolicyDrafts: () => void;
  handleSavePolicyClick: () => void;
}

export const PoliciesPanel: React.FC<PoliciesPanelProps> = (props) => {
  const {
    selectedLateFeeRate,
    setSelectedLateFeeRate,
    defaultLateFeeRate,
    selectedRoundingMultiple,
    setSelectedRoundingMultiple,
    selectedRoundingEnabled,
    setSelectedRoundingEnabled,
    roundingMultiple,
    roundingEnabled,
    isDefaultDueDateModified,
    selectedDefaultDueDateEnabled,
    setSelectedDefaultDueDateEnabled,
    selectedDefaultDueDay,
    setSelectedDefaultDueDay,
    dueDayDropdownRef,
    isDueDayDropdownOpen,
    setIsDueDayDropdownOpen,
    policyCategoryTab,
    setPolicyCategoryTab,
    selectedPriorRule,
    setSelectedPriorRule,
    selectedSkippedRule,
    setSelectedSkippedRule,
    selectedDeletionResolution,
    setSelectedDeletionResolution,
    hasPolicyChanges,
    handleResetPolicyDrafts,
    handleSavePolicyClick,
  } = props;

  const { hasPermission } = useApp();

  const [dropdownPlacement, setDropdownPlacement] = React.useState<'bottom' | 'top'>('bottom');
  const [roundingPlacement, setRoundingPlacement] = React.useState<'bottom' | 'top'>('bottom');
  const [isRoundingDropdownOpen, setIsRoundingDropdownOpen] = React.useState<boolean>(false);
  const roundingDropdownRef = React.useRef<HTMLDivElement>(null);

  // Position calculation for due date dropdown
  React.useEffect(() => {
    if (!isDueDayDropdownOpen || !dueDayDropdownRef.current) return;
    const updatePlacement = () => {
      if (!dueDayDropdownRef.current) return;
      const rect = dueDayDropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const neededHeight = 260;
      if (spaceBelow < neededHeight && spaceAbove > spaceBelow) {
        setDropdownPlacement('top');
      } else {
        setDropdownPlacement('bottom');
      }
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isDueDayDropdownOpen, dueDayDropdownRef]);

  // Position calculation for rounding dropdown
  React.useEffect(() => {
    if (!isRoundingDropdownOpen || !roundingDropdownRef.current) return;
    const updatePlacement = () => {
      if (!roundingDropdownRef.current) return;
      const rect = roundingDropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const neededHeight = 260;
      if (spaceBelow < neededHeight && spaceAbove > spaceBelow) {
        setRoundingPlacement('top');
      } else {
        setRoundingPlacement('bottom');
      }
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isRoundingDropdownOpen]);

  // Click outside handling for rounding and due date dropdowns
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        roundingDropdownRef.current &&
        !roundingDropdownRef.current.contains(e.target as Node)
      ) {
        setIsRoundingDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-4">
      {/* Top Section: Default Late Payment Fine Rate */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-200/60 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                Default Late Payment Fine / Surcharge Rate
                {selectedLateFeeRate !== defaultLateFeeRate && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Modified
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pre-fills overdue late surcharge in voucher generation and defaulter carry-forwards.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <div className="relative w-36">
              <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Rs.</span>
              <input
                type="number"
                min="0"
                id="input-default-late-fee-rate"
                disabled={!hasPermission('settings.manage')}
                value={selectedLateFeeRate}
                onChange={(e) => setSelectedLateFeeRate(Math.max(0, Number(e.target.value) || 0))}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section: Net Due Rounding Multiple */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-200/60 shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                Round Net Due Up to Nearest Multiple
                {(selectedRoundingMultiple !== roundingMultiple || (selectedRoundingMultiple > 1 !== (roundingEnabled && roundingMultiple > 1))) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Modified
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Rounds net due and late fines up to the nearest multiple. Enter <strong>1</strong> or choose exact for no rounding.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {/* Integrated Text & Dropdown Combo */}
            <div ref={roundingDropdownRef} className="relative w-36">
              <span className="absolute left-3 top-2 text-xs font-bold text-slate-400 pointer-events-none select-none">
                Rs.
              </span>
              <input
                type="number"
                min="1"
                max="10000"
                id="input-rounding-multiple"
                disabled={!hasPermission('settings.manage')}
                value={selectedRoundingMultiple}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    const cleanVal = Math.min(10000, Math.max(1, val));
                    setSelectedRoundingMultiple(cleanVal);
                    setSelectedRoundingEnabled(cleanVal > 1);
                  } else if (e.target.value === '') {
                    setSelectedRoundingMultiple(1);
                    setSelectedRoundingEnabled(false);
                  }
                }}
                onFocus={() => {
                  if (hasPermission('settings.manage')) {
                    setIsRoundingDropdownOpen(true);
                  }
                }}
                className="w-full pl-9 pr-7 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition"
                placeholder="1"
              />
              <button
                type="button"
                id="btn-rounding-presets"
                tabIndex={-1}
                disabled={!hasPermission('settings.manage')}
                onClick={() => setIsRoundingDropdownOpen(!isRoundingDropdownOpen)}
                className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
                title="Open rounding presets dropdown"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-150 ${
                    isRoundingDropdownOpen ? 'rotate-180 text-indigo-600' : ''
                  }`}
                />
              </button>

              {/* Integrated Dropdown Menu */}
              {isRoundingDropdownOpen && (
                <div
                  className={`absolute ${
                    roundingPlacement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                  } right-0 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1 text-xs z-50 animate-in fade-in zoom-in-95 duration-100`}
                >
                  {/* Detailed List */}
                  <div className="max-h-56 overflow-y-auto py-0.5">
                    {ROUNDING_QUICK_PRESETS.map((preset) => {
                      const isSelected = selectedRoundingMultiple === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          id={`preset-rounding-${preset.value}`}
                          disabled={!hasPermission('settings.manage')}
                          onClick={() => {
                            setSelectedRoundingMultiple(preset.value);
                            setSelectedRoundingEnabled(preset.value > 1);
                            setIsRoundingDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 font-medium transition flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50 text-indigo-800 font-bold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <span className="font-bold font-mono">
                              {preset.value === 1 ? 'Exact (1)' : `Rs. ${preset.value}`}
                            </span>
                            {preset.description && (
                              <p className="text-[10px] text-slate-500">{preset.description}</p>
                            )}
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section: Default Voucher Due Date Policy */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl border border-teal-200/60 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                Default Fee Voucher Due Date
                {isDefaultDueDateModified && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Modified
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pre-fills the due date day in the voucher generator. Choose <strong>No default</strong> to leave blank or pick/type a day.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {/* Integrated Text & Dropdown Combo */}
            <div ref={dueDayDropdownRef} className="relative w-36">
              <span className="absolute left-3 top-2 text-xs font-bold text-slate-400 pointer-events-none select-none">
                {selectedDefaultDueDateEnabled ? 'Day' : ''}
              </span>
              <input
                type={selectedDefaultDueDateEnabled ? 'number' : 'text'}
                id="input-default-due-day"
                min="1"
                max="31"
                disabled={!hasPermission('settings.manage')}
                value={selectedDefaultDueDateEnabled ? selectedDefaultDueDay : ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val > 0) {
                    setSelectedDefaultDueDay(Math.min(31, Math.max(1, val)));
                    setSelectedDefaultDueDateEnabled(true);
                  } else if (e.target.value === '' || val === 0) {
                    setSelectedDefaultDueDateEnabled(false);
                  }
                }}
                onFocus={() => {
                  if (hasPermission('settings.manage')) {
                    setIsDueDayDropdownOpen(true);
                  }
                }}
                className={`w-full ${
                  selectedDefaultDueDateEnabled ? 'pl-11' : 'pl-3'
                } pr-7 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-teal-500 transition`}
                placeholder="No default"
              />
              <button
                type="button"
                id="btn-due-day-presets"
                tabIndex={-1}
                disabled={!hasPermission('settings.manage')}
                onClick={() => setIsDueDayDropdownOpen(!isDueDayDropdownOpen)}
                className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
                title="Open due day presets dropdown"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-150 ${
                    isDueDayDropdownOpen ? 'rotate-180 text-teal-600' : ''
                  }`}
                />
              </button>

              {/* Choices Combo Dropdown Menu */}
              {isDueDayDropdownOpen && (
                <div
                  className={`absolute ${
                    dropdownPlacement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                  } right-0 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1 text-xs z-50 animate-in fade-in zoom-in-95 duration-100`}
                >
                  {/* Detailed List */}
                  <div className="max-h-56 overflow-y-auto py-0.5">
                    {DUE_DAY_PRESETS.map((preset) => {
                      const isSelected = preset.day === null
                        ? !selectedDefaultDueDateEnabled
                        : selectedDefaultDueDateEnabled && selectedDefaultDueDay === preset.day;

                      return (
                        <button
                          key={preset.label}
                          type="button"
                          id={`preset-due-day-${preset.day === null ? 'none' : preset.day}`}
                          disabled={!hasPermission('settings.manage')}
                          onClick={() => {
                            if (preset.day === null) {
                              setSelectedDefaultDueDateEnabled(false);
                            } else {
                              setSelectedDefaultDueDateEnabled(true);
                              setSelectedDefaultDueDay(preset.day);
                            }
                            setIsDueDayDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 font-medium transition flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-teal-50 text-teal-800 font-bold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <span className={`font-bold ${preset.day === null ? 'text-slate-500 font-normal italic' : ''}`}>
                              {preset.label}
                            </span>
                            {preset.description && (
                              <p className="text-[10px] text-slate-500">{preset.description}</p>
                            )}
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-teal-600 shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Card: Three Category Tabs for Policies */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        {/* Category Tab Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
            <button
              type="button"
              id="tab-policy-prior"
              onClick={() => setPolicyCategoryTab('prior')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                policyCategoryTab === 'prior'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-teal-600" />
              <span>1. Prior Month Policy</span>
            </button>

            <button
              type="button"
              id="tab-policy-skipped"
              onClick={() => setPolicyCategoryTab('skipped')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                policyCategoryTab === 'skipped'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>2. Skipped Month Policy</span>
            </button>

            <button
              type="button"
              id="tab-policy-deletion"
              onClick={() => setPolicyCategoryTab('deletion')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                policyCategoryTab === 'deletion'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>3. Deletion & Sequence</span>
            </button>
          </div>
        </div>

        {/* Tab 1 Content: Prior Month Voucher Generation Rules */}
        {policyCategoryTab === 'prior' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-teal-600" />
                  Prior Month Generation Rule
                </h4>
                <p className="text-[11px] text-slate-500">
                  Handles generating a voucher for a month prior to student’s latest generated voucher (e.g. generating July when August exists).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Rule 1: Strict Chronological Rule */}
              <div
                onClick={() => setSelectedPriorRule('strict')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
                  selectedPriorRule === 'strict'
                    ? 'border-teal-600 bg-teal-50/40 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="priorMonthRule"
                      value="strict"
                      checked={selectedPriorRule === 'strict'}
                      onChange={() => setSelectedPriorRule('strict')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                        1. Strict Chronological
                      </span>
                      <span className="text-[10px] text-teal-700 font-semibold uppercase tracking-wider block">
                        (Prohibit Prior Months)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-5">
                    Blocks generating prior month vouchers if any newer month vouchers already exist for that student.
                  </p>
                </div>
                <div className="text-[10px] text-slate-600 bg-slate-100/90 p-2 rounded-lg mt-2.5">
                  ✓ Guarantees strict month-by-month accounting without arrears discrepancies.
                </div>
              </div>

              {/* Rule 2: Sequential Month Warning */}
              <div
                onClick={() => setSelectedPriorRule('warning')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
                  selectedPriorRule === 'warning'
                    ? 'border-teal-600 bg-teal-50/40 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="priorMonthRule"
                      value="warning"
                      checked={selectedPriorRule === 'warning'}
                      onChange={() => setSelectedPriorRule('warning')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        2. Warning Alert
                      </span>
                      <span className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider block">
                        (Allow with Alert)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-5">
                    Allows generating prior vouchers with a warning; downstream future vouchers keep static balances.
                  </p>
                </div>
                <div className="text-[10px] text-amber-900 bg-amber-50 p-2 rounded-lg mt-2.5 border border-amber-200/60">
                  ⚠️ Downstream vouchers will NOT automatically inherit newly added arrears.
                </div>
              </div>

              {/* Rule 3: Auto-Recalculate Future Arrears */}
              <div
                onClick={() => setSelectedPriorRule('recalculate')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
                  selectedPriorRule === 'recalculate'
                    ? 'border-teal-600 bg-teal-50/40 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="priorMonthRule"
                      value="recalculate"
                      checked={selectedPriorRule === 'recalculate'}
                      onChange={() => setSelectedPriorRule('recalculate')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        3. Auto-Recalculate
                      </span>
                      <span className="text-[10px] text-indigo-700 font-semibold uppercase tracking-wider block">
                        (Auto-Update Future Dues)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-5">
                    Generates prior voucher and automatically updates previous balances (`prevBalance`) across future vouchers.
                  </p>
                </div>
                <div className="text-[10px] text-indigo-900 bg-indigo-50 p-2 rounded-lg mt-2.5 border border-indigo-200/60">
                  🔄 Automatically updates all subsequent vouchers to reflect carry-over arrears.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2 Content: Skipped Month Fee Voucher Generation Rules */}
        {policyCategoryTab === 'skipped' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Skipped Month Generation Rule
                </h4>
                <p className="text-[11px] text-slate-500">
                  Handles generating a voucher when intermediate months were skipped (e.g. generating October when September was not generated).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Skipped Rule 1: Warning Prompt */}
              <div
                onClick={() => setSelectedSkippedRule('warning')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
                  selectedSkippedRule === 'warning'
                    ? 'border-teal-600 bg-teal-50/40 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="skippedMonthRule"
                      value="warning"
                      checked={selectedSkippedRule === 'warning'}
                      onChange={() => setSelectedSkippedRule('warning')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        1. Warning Alert
                      </span>
                      <span className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider block">
                        (Confirm Skipped Gaps)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-5">
                    Prompts the user with a warning explaining that intermediate months will remain unbilled.
                  </p>
                </div>
                <div className="text-[10px] text-amber-900 bg-amber-50 p-2 rounded-lg mt-2.5 border border-amber-200/60">
                  ⚠️ Allows generation after confirmation; missing months stay unbilled.
                </div>
              </div>

              {/* Skipped Rule 2: Strict Sequential */}
              <div
                onClick={() => setSelectedSkippedRule('strict')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
                  selectedSkippedRule === 'strict'
                    ? 'border-teal-600 bg-teal-50/40 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="skippedMonthRule"
                      value="strict"
                      checked={selectedSkippedRule === 'strict'}
                      onChange={() => setSelectedSkippedRule('strict')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                        2. Strict Sequential
                      </span>
                      <span className="text-[10px] text-teal-700 font-semibold uppercase tracking-wider block">
                        (Block Skipped Gaps)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-5">
                    Strictly blocks generating future months if any preceding billing month was never issued.
                  </p>
                </div>
                <div className="text-[10px] text-slate-600 bg-slate-100/90 p-2 rounded-lg mt-2.5">
                  ✓ Enforces unbroken billing continuity without missing monthly periods.
                </div>
              </div>

              {/* Skipped Rule 3: Allow Independent */}
              <div
                onClick={() => setSelectedSkippedRule('allow')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
                  selectedSkippedRule === 'allow'
                    ? 'border-teal-600 bg-teal-50/40 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="skippedMonthRule"
                      value="allow"
                      checked={selectedSkippedRule === 'allow'}
                      onChange={() => setSelectedSkippedRule('allow')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        3. Independent
                      </span>
                      <span className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider block">
                        (No Prompts / Unrestricted)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-5">
                    Generates vouchers for any chosen month regardless of whether prior months were generated.
                  </p>
                </div>
                <div className="text-[10px] text-emerald-900 bg-emerald-50 p-2 rounded-lg mt-2.5 border border-emerald-200/60">
                  ℹ️ Allows independent billing generation for custom schedule scenarios.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3 Content: Voucher Deletion & Chronological Sequence Resolution Policy */}
        {policyCategoryTab === 'deletion' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  Voucher Deletion & Chronological Resolution
                </h4>
                <p className="text-[11px] text-slate-500">
                  Handles balance continuity and dependencies when a voucher is deleted and newer vouchers already exist.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Option 1: Cascade Delete */}
              <div
                onClick={() => setSelectedDeletionResolution('cascade')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
                  selectedDeletionResolution === 'cascade'
                    ? 'border-teal-600 bg-teal-50/40 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="deletionResolution"
                      value="cascade"
                      checked={selectedDeletionResolution === 'cascade'}
                      onChange={() => setSelectedDeletionResolution('cascade')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        1. Cascade Delete
                      </span>
                      <span className="text-[10px] text-rose-700 font-semibold uppercase tracking-wider block">
                        (Purge Subsequent)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-5">
                    Deleting a voucher permanently deletes all subsequent newer month vouchers for that student.
                  </p>
                </div>
                <div className="text-[10px] text-rose-900 bg-rose-50 p-2 rounded-lg mt-2.5 border border-rose-200/60">
                  🗑️ Clean slate: deleting July 2026 also removes August 2026 vouchers.
                </div>
              </div>

              {/* Option 2: Auto-Heal */}
              <div
                onClick={() => setSelectedDeletionResolution('auto-heal')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
                  selectedDeletionResolution === 'auto-heal'
                    ? 'border-teal-600 bg-teal-50/40 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="deletionResolution"
                      value="auto-heal"
                      checked={selectedDeletionResolution === 'auto-heal'}
                      onChange={() => setSelectedDeletionResolution('auto-heal')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        2. Auto-Heal
                      </span>
                      <span className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider block">
                        (Recalculate Balances)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-5">
                    Removes target voucher and automatically heals subsequent vouchers with updated carry-over balances.
                  </p>
                </div>
                <div className="text-[10px] text-emerald-900 bg-emerald-50 p-2 rounded-lg mt-2.5 border border-emerald-200/60">
                  ✓ Seamlessly repairs future balances without deleting subsequent records.
                </div>
              </div>

              {/* Option 3: Strict Reverse Chronological */}
              <div
                onClick={() => setSelectedDeletionResolution('manual')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
                  selectedDeletionResolution === 'manual'
                    ? 'border-teal-600 bg-teal-50/40 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="deletionResolution"
                      value="manual"
                      checked={selectedDeletionResolution === 'manual'}
                      onChange={() => setSelectedDeletionResolution('manual')}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block flex items-center gap-1">
                        <ArrowUp className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                        3. Strict Reverse
                      </span>
                      <span className="text-[10px] text-slate-700 font-semibold uppercase tracking-wider block">
                        (Prohibit Gaps)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-5">
                    Blocks deleting prior vouchers until all newer future month vouchers are deleted in reverse order.
                  </p>
                </div>
                <div className="text-[10px] text-slate-700 bg-slate-100/90 p-2 rounded-lg mt-2.5 border border-slate-200/80">
                  🔒 Enforces manual reverse deletion: delete August before deleting July.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Unsaved Policy Modifications Alert Banner */}
        {hasPolicyChanges && (
          <div className="p-3 bg-amber-50/95 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-amber-900 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                You have unsaved policy changes. Review your selections and click save to apply.
              </span>
            </div>
            <button
              type="button"
              onClick={handleResetPolicyDrafts}
              className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg text-amber-800 font-semibold text-[11px] shrink-0 cursor-pointer self-end sm:self-auto"
            >
              Reset to Saved
            </button>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          {hasPolicyChanges && (
            <button
              type="button"
              onClick={handleResetPolicyDrafts}
              className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
            >
              Discard Changes
            </button>
          )}
          <button
            type="button"
            id="btn-save-voucher-policies"
            disabled={!hasPermission('settings.manage')}
            onClick={handleSavePolicyClick}
            className={`px-4 py-2 font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50 ${
              hasPolicyChanges
                ? 'bg-amber-600 hover:bg-amber-700 text-white ring-2 ring-amber-500/20'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {hasPolicyChanges ? 'Review & Save Policy Options' : 'Save Policy Options'}
          </button>
        </div>
      </div>
    </div>
  );
};
