import React from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface PolicySaveBarProps {
  hasChanges: boolean;
  onReset: () => void;
  onSave: () => void;
  saveId: string;
  scopeLabel: string; // e.g. "fee defaults"
  otherUnsaved?: string[]; // names of other policy views holding unsaved changes
}

/** Unsaved-changes banner and Save / Discard bar shared by the three policy views. */
export const PolicySaveBar: React.FC<PolicySaveBarProps> = ({ hasChanges, onReset, onSave, saveId, scopeLabel, otherUnsaved = [] }) => {
  const { hasPermission } = useApp();
  return (
    <>
      {hasChanges && (
        <div className="p-3 bg-amber-50/95 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-amber-900 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>You have unsaved {scopeLabel} changes. Review your selections and click save to apply.</span>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg text-amber-800 font-semibold text-[11px] shrink-0 cursor-pointer self-end sm:self-auto"
          >
            Reset to Saved
          </button>
        </div>
      )}

      {otherUnsaved.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Unsaved changes also exist in: <strong className="text-slate-700">{otherUnsaved.join(', ')}</strong>. Each view saves on its own.
        </p>
      )}

      <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
        {hasChanges && (
          <button
            type="button"
            onClick={onReset}
            className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
          >
            Discard Changes
          </button>
        )}
        <button
          type="button"
          id={saveId}
          disabled={!hasPermission('settings.manage')}
          onClick={onSave}
          className={`px-4 py-2 font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50 ${
            hasChanges
              ? 'bg-amber-600 hover:bg-amber-700 text-white ring-2 ring-amber-500/20'
              : 'bg-teal-600 hover:bg-teal-700 text-white'
          }`}
        >
          <Save className="w-3.5 h-3.5" />
          {hasChanges ? 'Review & Save Changes' : 'Save'}
        </button>
      </div>
    </>
  );
};
