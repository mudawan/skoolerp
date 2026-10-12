import React from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, FileText, Layers } from 'lucide-react';
import { getCurrencyCode } from '../../utils/feeMath';
import { VoucherCopyType } from '../../types';
import { PolicySaveBar } from './PolicySaveBar';

export interface VoucherPrintLayoutPanelProps {
  selectedVoucherCopyOrder: VoucherCopyType[];
  setSelectedVoucherCopyOrder: (order: VoucherCopyType[]) => void;
  selectedVoucherDefaultCopies: VoucherCopyType[];
  setSelectedVoucherDefaultCopies: (copies: VoucherCopyType[]) => void;
  hasChanges: boolean;
  otherUnsaved: string[];
  onReset: () => void;
  onSave: () => void;
}

const COPY_META: Record<VoucherCopyType, { name: string; badge: string; desc: string; mini: string }> = {
  bank: {
    name: 'Bank Copy',
    badge: 'bg-blue-900 text-white',
    desc: 'For collection branch or bank teller records',
    mini: 'bg-blue-900',
  },
  institute: {
    name: 'Institute Copy',
    badge: 'bg-teal-800 text-white',
    desc: 'For institute accounts office reconciliation & audit',
    mini: 'bg-teal-800',
  },
  student: {
    name: 'Student Copy',
    badge: 'bg-slate-800 text-white',
    desc: 'For student / parent acknowledgement & receipt',
    mini: 'bg-slate-800',
  },
};

export const VoucherPrintLayoutPanel: React.FC<VoucherPrintLayoutPanelProps> = ({
  selectedVoucherCopyOrder,
  setSelectedVoucherCopyOrder,
  selectedVoucherDefaultCopies,
  setSelectedVoucherDefaultCopies,
  hasChanges,
  otherUnsaved,
  onReset,
  onSave,
}) => {
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= selectedVoucherCopyOrder.length) return;
    const next = [...selectedVoucherCopyOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setSelectedVoucherCopyOrder(next);
  };

  const toggleDefault = (type: VoucherCopyType) => {
    if (selectedVoucherDefaultCopies.includes(type)) {
      // Keep at least one copy selected
      if (selectedVoucherDefaultCopies.length > 1) {
        setSelectedVoucherDefaultCopies(selectedVoucherDefaultCopies.filter((c) => c !== type));
      }
    } else {
      setSelectedVoucherDefaultCopies([...selectedVoucherDefaultCopies, type]);
    }
  };

  const activeCopies = selectedVoucherCopyOrder.filter((c) => selectedVoucherDefaultCopies.includes(c));

  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: order and default inclusion */}
        <div className="lg:col-span-7 space-y-6">
          <section className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Copy Print Sequence (left to right on the sheet)
            </h4>
            <div className="space-y-2">
              {selectedVoucherCopyOrder.map((copyType, index) => {
                const meta = COPY_META[copyType];
                return (
                  <div
                    key={copyType}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-white text-slate-700 font-extrabold text-[11px] flex items-center justify-center shrink-0 border border-slate-200">
                        {index + 1}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${meta.badge}`}>
                        {meta.name}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate hidden sm:inline">{meta.desc}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="Move earlier"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Move later"
                        disabled={index === selectedVoucherCopyOrder.length - 1}
                        onClick={() => move(index, 1)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-teal-600" />
              Copies Included by Default
              <span className="font-normal text-[11px] text-slate-500">(at least one)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['bank', 'institute', 'student'] as VoucherCopyType[]).map((type) => {
                const included = selectedVoucherDefaultCopies.includes(type);
                return (
                  <label
                    key={type}
                    className={`px-3 py-2.5 rounded-xl border transition cursor-pointer flex items-center gap-2.5 ${
                      included ? 'border-teal-600 bg-teal-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={() => toggleDefault(type)}
                      className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                    <span className="font-bold text-xs text-slate-900 truncate">{COPY_META[type].name}</span>
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right: dark live preview */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <span className="font-bold text-xs text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-400" />
                Live Layout Preview
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                {activeCopies.length} of 3 copies
              </span>
            </div>

            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/80">
              <div className="bg-white rounded-lg p-2.5 shadow-md grid grid-cols-3 gap-2 min-h-[140px] items-stretch">
                {activeCopies.map((copyType, idx) => {
                  const meta = COPY_META[copyType];
                  return (
                    <div
                      key={copyType}
                      className="bg-slate-50 border border-slate-300 rounded p-1.5 flex flex-col justify-between text-[9px] text-slate-700"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`px-1 py-0.5 rounded text-[7px] font-bold text-white uppercase ${meta.mini}`}>
                            {meta.name.replace(' Copy', '')}
                          </span>
                          <span className="text-[7px] font-mono font-bold text-slate-400">#{idx + 1}</span>
                        </div>
                        <div className="h-1 bg-slate-200 rounded w-3/4 mx-auto mt-1" />
                        <div className="h-0.5 bg-slate-200 rounded w-1/2 mx-auto" />
                        <div className="border-t border-dashed border-slate-300 my-1" />
                        <div className="space-y-0.5">
                          <div className="h-1 bg-slate-200 rounded w-full" />
                          <div className="h-1 bg-slate-200 rounded w-5/6" />
                          <div className="h-1 bg-slate-200 rounded w-4/5" />
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-[7px] font-bold text-teal-800">
                        <span>NET DUE:</span>
                        <span>{getCurrencyCode()} XXXX</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PolicySaveBar
        hasChanges={hasChanges}
        otherUnsaved={otherUnsaved}
        onReset={onReset}
        onSave={onSave}
        saveId="btn-save-voucher-print-layout"
        scopeLabel="print layout"
      />
    </div>
  );
};
