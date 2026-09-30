import React, { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useApp } from '../../context/AppContext';
import { X, AlertTriangle, Trash2 } from 'lucide-react';

export interface DeleteInstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DeleteInstitutionModal: React.FC<DeleteInstitutionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  useEscapeKey(onClose, isOpen);
  const { institute, deleteInstitution } = useApp();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetCode = institute?.regNo || institute?.name || 'DELETE';

  const handleDelete = async () => {
    if (confirmText !== targetCode) {
      setError(`Please type "${targetCode}" exactly to confirm.`);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteInstitution();
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete institution');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-4 border-b border-rose-100 bg-rose-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Delete Entire Institution</h3>
              <p className="text-[11px] text-rose-600 font-semibold">Irreversible disaster action</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            This will permanently delete <strong>{institute?.name}</strong> and all associated students, vouchers, fee
            collections, classes, and bank accounts. This cannot be undone.
          </p>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Type <span className="font-mono text-rose-600 select-all">{targetCode}</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-rose-500"
              placeholder={targetCode}
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting || confirmText !== targetCode}
              onClick={handleDelete}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
