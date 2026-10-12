import { getCurrencyCode } from '../../utils/feeMath';
import React from 'react';
import { PolicySaveBar } from './PolicySaveBar';
import { useApp } from '../../context/AppContext';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bus,
  Calculator,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  FileText,
  GripHorizontal,
  Layers,
  Printer,
  RefreshCw,
  RotateCcw,
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
  { value: 1, label: 'Exact (1)', description: 'Exact billing (no round up)' },
  { value: 10, label: '10', description: 'Round up net due to nearest 10' },
  { value: 20, label: '20', description: 'Round up net due to nearest 20' },
  { value: 50, label: '50', description: 'Round up net due to nearest 50' },
];

const TRANSPORT_ROUNDING_PRESETS: { value: number; label: string; description?: string }[] = [
  { value: 1, label: 'Exact (1)', description: 'Exact transport fare (no round up)' },
  { value: 10, label: '10', description: 'Round up transport fare to nearest 10' },
  { value: 20, label: '20', description: 'Round up transport fare to nearest 20' },
  { value: 50, label: '50', description: 'Round up transport fare to nearest 50' },
];

export interface FeeDefaultsPanelProps {
  selectedLateFeeRate: number;
  setSelectedLateFeeRate: (v: number) => void;
  defaultLateFeeRate: number;
  selectedRoundingMultiple: number;
  setSelectedRoundingMultiple: (v: number) => void;
  selectedRoundingEnabled: boolean;
  setSelectedRoundingEnabled: (v: boolean) => void;
  roundingMultiple: number;
  roundingEnabled: boolean;
  selectedTransportRoundingMultiple: number;
  setSelectedTransportRoundingMultiple: (v: number) => void;
  transportRoundingMultiple: number;
  isDefaultDueDateModified: boolean;
  selectedDefaultDueDateEnabled: boolean;
  setSelectedDefaultDueDateEnabled: (v: boolean) => void;
  selectedDefaultDueDay: number;
  setSelectedDefaultDueDay: (v: number) => void;
  dueDayDropdownRef: React.RefObject<HTMLDivElement | null>;
  isDueDayDropdownOpen: boolean;
  setIsDueDayDropdownOpen: (v: boolean) => void;
  hasChanges: boolean;
  otherUnsaved: string[];
  onReset: () => void;
  onSave: () => void;
}

export const FeeDefaultsPanel: React.FC<FeeDefaultsPanelProps> = (props) => {
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
    selectedTransportRoundingMultiple,
    setSelectedTransportRoundingMultiple,
    transportRoundingMultiple,
    isDefaultDueDateModified,
    selectedDefaultDueDateEnabled,
    setSelectedDefaultDueDateEnabled,
    selectedDefaultDueDay,
    setSelectedDefaultDueDay,
    dueDayDropdownRef,
    isDueDayDropdownOpen,
    setIsDueDayDropdownOpen,
    hasChanges,
    otherUnsaved,
    onReset,
    onSave,
  } = props;

  const { hasPermission } = useApp();

  const [dropdownPlacement, setDropdownPlacement] = React.useState<'bottom' | 'top'>('bottom');
  const [roundingPlacement, setRoundingPlacement] = React.useState<'bottom' | 'top'>('bottom');
  const [isRoundingDropdownOpen, setIsRoundingDropdownOpen] = React.useState<boolean>(false);
  const roundingDropdownRef = React.useRef<HTMLDivElement>(null);

  const [transportRoundingPlacement, setTransportRoundingPlacement] = React.useState<'bottom' | 'top'>('bottom');
  const [isTransportRoundingDropdownOpen, setIsTransportRoundingDropdownOpen] = React.useState<boolean>(false);
  const transportRoundingDropdownRef = React.useRef<HTMLDivElement>(null);

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

  // Position calculation for transport rounding dropdown
  React.useEffect(() => {
    if (!isTransportRoundingDropdownOpen || !transportRoundingDropdownRef.current) return;
    const updatePlacement = () => {
      if (!transportRoundingDropdownRef.current) return;
      const rect = transportRoundingDropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const neededHeight = 260;
      if (spaceBelow < neededHeight && spaceAbove > spaceBelow) {
        setTransportRoundingPlacement('top');
      } else {
        setTransportRoundingPlacement('bottom');
      }
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isTransportRoundingDropdownOpen]);

  // Click outside handling for rounding and due date dropdowns
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        roundingDropdownRef.current &&
        !roundingDropdownRef.current.contains(e.target as Node)
      ) {
        setIsRoundingDropdownOpen(false);
      }
      if (
        transportRoundingDropdownRef.current &&
        !transportRoundingDropdownRef.current.contains(e.target as Node)
      ) {
        setIsTransportRoundingDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Top Section: Default Late Payment Fine Rate */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row lg:flex-col sm:items-center lg:items-stretch justify-between gap-3">
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

          <div className="flex items-center gap-2 self-end sm:self-auto lg:self-start shrink-0">
            <div className="relative w-36">
              <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">{getCurrencyCode()}</span>
              <input
                type="number"
                min="0"
                id="input-default-late-fee-rate"
                disabled={!hasPermission('settings.manage')}
                value={selectedLateFeeRate}
                onWheel={(e) => (e.target as HTMLElement).blur()}
                onChange={(e) => setSelectedLateFeeRate(Math.max(0, Number(e.target.value) || 0))}
                className="w-full pl-11 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section: Default Voucher Due Date Policy */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row lg:flex-col sm:items-center lg:items-stretch justify-between gap-4">
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

          <div className="flex items-center gap-2 self-end sm:self-auto lg:self-start shrink-0">
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
                onWheel={(e) => (e.target as HTMLElement).blur()}
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

      {/* Section: Transport Fee Rounding Policy */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row lg:flex-col sm:items-center lg:items-stretch justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-200/60 shrink-0">
              <Bus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                Round Transport Fee Up to Nearest Multiple
                {selectedTransportRoundingMultiple !== transportRoundingMultiple && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Modified
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Rounds calculated transportation fares up to the nearest multiple before adding to the fee voucher. Enter <strong>1</strong> or choose exact for no rounding.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto lg:self-start shrink-0">
            {/* Integrated Text & Dropdown Combo */}
            <div ref={transportRoundingDropdownRef} className="relative w-36">
              <span className="absolute left-3 top-2 text-xs font-bold text-slate-400 pointer-events-none select-none">
                {getCurrencyCode()}
              </span>
              <input
                type="number"
                min="1"
                max="10000"
                id="input-transport-rounding-multiple"
                disabled={!hasPermission('settings.manage')}
                value={selectedTransportRoundingMultiple}
                onWheel={(e) => (e.target as HTMLElement).blur()}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    const cleanVal = Math.min(10000, Math.max(1, val));
                    setSelectedTransportRoundingMultiple(cleanVal);
                  } else if (e.target.value === '') {
                    setSelectedTransportRoundingMultiple(1);
                  }
                }}
                onFocus={() => {
                  if (hasPermission('settings.manage')) {
                    setIsTransportRoundingDropdownOpen(true);
                  }
                }}
                className="w-full pl-9 pr-7 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 transition"
                placeholder="1"
              />
              <button
                type="button"
                id="btn-transport-rounding-presets"
                tabIndex={-1}
                disabled={!hasPermission('settings.manage')}
                onClick={() => setIsTransportRoundingDropdownOpen(!isTransportRoundingDropdownOpen)}
                className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
                title="Open transport rounding presets dropdown"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-150 ${
                    isTransportRoundingDropdownOpen ? 'rotate-180 text-amber-600' : ''
                  }`}
                />
              </button>

              {/* Integrated Dropdown Menu */}
              {isTransportRoundingDropdownOpen && (
                <div
                  className={`absolute ${
                    transportRoundingPlacement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                  } right-0 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1 text-xs z-50 animate-in fade-in zoom-in-95 duration-100`}
                >
                  {/* Detailed List */}
                  <div className="max-h-56 overflow-y-auto py-0.5">
                    {TRANSPORT_ROUNDING_PRESETS.map((preset) => {
                      const isSelected = selectedTransportRoundingMultiple === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          id={`preset-transport-rounding-${preset.value}`}
                          disabled={!hasPermission('settings.manage')}
                          onClick={() => {
                            setSelectedTransportRoundingMultiple(preset.value);
                            setIsTransportRoundingDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 font-medium transition flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-amber-50 text-amber-800 font-bold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <span className="font-bold font-mono">
                              {preset.value === 1 ? 'Exact (1)' : `${getCurrencyCode()} ${preset.value}`}
                            </span>
                            {preset.description && (
                              <p className="text-[10px] text-slate-500">{preset.description}</p>
                            )}
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-600 shrink-0 ml-2" />}
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

      {/* Section: Net Due Rounding Multiple */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row lg:flex-col sm:items-center lg:items-stretch justify-between gap-4">
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

          <div className="flex items-center gap-2 self-end sm:self-auto lg:self-start shrink-0">
            {/* Integrated Text & Dropdown Combo */}
            <div ref={roundingDropdownRef} className="relative w-36">
              <span className="absolute left-3 top-2 text-xs font-bold text-slate-400 pointer-events-none select-none">
                {getCurrencyCode()}
              </span>
              <input
                type="number"
                min="1"
                max="10000"
                id="input-rounding-multiple"
                disabled={!hasPermission('settings.manage')}
                value={selectedRoundingMultiple}
                onWheel={(e) => (e.target as HTMLElement).blur()}
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
                className="w-full pl-9 pr-7 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition"
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
                              {preset.value === 1 ? 'Exact (1)' : `${getCurrencyCode()} ${preset.value}`}
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
      </div>

      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <PolicySaveBar
          hasChanges={hasChanges}
          otherUnsaved={otherUnsaved}
          onReset={onReset}
          onSave={onSave}
          saveId="btn-save-fee-defaults"
          scopeLabel="fee default"
        />
      </div>
    </div>
  );
};
