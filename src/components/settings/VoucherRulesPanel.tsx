import { getCurrencyCode } from '../../utils/feeMath';
import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  PriorMonthVoucherRule,
  SkippedMonthVoucherRule,
  VoucherCopyType,
  VoucherDeletionResolution,
} from '../../types';
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

import { PolicySaveBar } from './PolicySaveBar';

type RulesTab = 'prior' | 'skipped' | 'deletion';

const PRIOR_LABELS: Record<PriorMonthVoucherRule, string> = {
  strict: 'Strict',
  recalculate: 'Recalculate',
};
const SKIPPED_LABELS: Record<SkippedMonthVoucherRule, string> = {
  strict: 'Strict',
  warning: 'Warn',
  allow: 'Allow',
};
const DELETION_LABELS: Record<VoucherDeletionResolution, string> = {
  cascade: 'Cascade',
  'auto-heal': 'Auto-heal',
  manual: 'Reverse order',
};

export interface VoucherRulesPanelProps {
  priorMonthRule: PriorMonthVoucherRule;
  skippedMonthRule: SkippedMonthVoucherRule;
  voucherDeletionResolution: VoucherDeletionResolution;
  selectedPriorRule: PriorMonthVoucherRule;
  setSelectedPriorRule: (r: PriorMonthVoucherRule) => void;
  selectedSkippedRule: SkippedMonthVoucherRule;
  setSelectedSkippedRule: (r: SkippedMonthVoucherRule) => void;
  selectedDeletionResolution: VoucherDeletionResolution;
  setSelectedDeletionResolution: (r: VoucherDeletionResolution) => void;
  hasChanges: boolean;
  otherUnsaved: string[];
  onReset: () => void;
  onSave: () => void;
}

export const VoucherRulesPanel: React.FC<VoucherRulesPanelProps> = (props) => {
  const {
    priorMonthRule,
    skippedMonthRule,
    voucherDeletionResolution,
    selectedPriorRule,
    setSelectedPriorRule,
    selectedSkippedRule,
    setSelectedSkippedRule,
    selectedDeletionResolution,
    setSelectedDeletionResolution,
    hasChanges,
    otherUnsaved,
    onReset,
    onSave,
  } = props;

  const { hasPermission } = useApp();
  const [policyCategoryTab, setPolicyCategoryTab] = React.useState<RulesTab>('prior');

  const tabs: { id: RulesTab; label: string; icon: React.ReactNode; saved: string }[] = [
    { id: 'prior', label: '1. Prior Month Policy', icon: <Sliders className="w-3.5 h-3.5 text-teal-600" />, saved: PRIOR_LABELS[priorMonthRule] },
    { id: 'skipped', label: '2. Skipped Month Policy', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />, saved: SKIPPED_LABELS[skippedMonthRule] },
    { id: 'deletion', label: '3. Deletion & Sequence', icon: <Trash2 className="w-3.5 h-3.5 text-rose-600" />, saved: DELETION_LABELS[voucherDeletionResolution] },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                id={`tab-policy-${t.id}`}
                onClick={() => setPolicyCategoryTab(t.id)}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition flex flex-col items-start gap-0.5 cursor-pointer whitespace-nowrap ${
                  policyCategoryTab === t.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {t.icon}
                  {t.label}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">Saved: {t.saved}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab 2 Content: Prior Month Voucher Generation Rules */}
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

            <p className="text-[11px] text-slate-500 leading-relaxed">
              A charge missed for an earlier month can be added to the current voucher as a labelled fee head instead of backdating a voucher.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

              {/* Rule 2: Auto-Recalculate Future Arrears */}
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
                        2. Auto-Recalculate
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

        <PolicySaveBar
          hasChanges={hasChanges}
          otherUnsaved={otherUnsaved}
          onReset={onReset}
          onSave={onSave}
          saveId="btn-save-voucher-rules"
          scopeLabel="voucher rule"
        />
      </div>
    </div>
  );
};
