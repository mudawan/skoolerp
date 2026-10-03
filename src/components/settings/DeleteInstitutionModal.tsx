import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  Receipt,
  ShieldAlert,
  Trash2,
  Users,
  X,
  Bus,
  CreditCard,
  GraduationCap,
} from 'lucide-react';

export interface DeleteInstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeleteInstitutionModal: React.FC<DeleteInstitutionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentInstitution, currentUser, deleteInstitutionAndData, showToast } = useApp();

  const [confirmationInput, setConfirmationInput] = useState('');
  const [ackPermanent, setAckPermanent] = useState(false);
  const [ackSessions, setAckSessions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEscapeKey(() => {
    if (!isDeleting) {
      handleClose();
    }
  });

  if (!isOpen) return null;

  const instName = currentInstitution?.name || 'Institution';
  const instCode = currentInstitution?.code || '';
  const isAdmin = currentUser.role === 'Admin';

  const normalizedInput = confirmationInput.trim().toLowerCase();
  const isMatch =
    (instName && normalizedInput === instName.trim().toLowerCase()) ||
    (instCode && normalizedInput === instCode.trim().toLowerCase()) ||
    normalizedInput === 'delete institution';

  const isFormValid = isMatch && ackPermanent && ackSessions && !isDeleting && isAdmin;

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmationInput('');
    setAckPermanent(false);
    setAckSessions(false);
    setErrorMessage(null);
    onClose();
  };

  const handleDelete = async () => {
    if (!isFormValid) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const res = await deleteInstitutionAndData(confirmationInput.trim());
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to delete institution and server data.');
        setIsDeleting(false);
      } else {
        showToast(`Institution "${instName}" and all server data have been permanently deleted.`, 'success');
        // AppContext will have reset auth and session and updated notice.
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error occurred during institution deletion.');
      setIsDeleting(false);
    }
  };

  return (
    <div
      id="delete-institution-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) handleClose();
      }}
    >
      <div
        id="delete-institution-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-institution-modal-title"
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-rose-200 overflow-hidden my-6 transition-all"
      >
        {/* Top Danger Banner */}
        <div className="bg-rose-600 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 border border-white/20">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-black/20 text-rose-100 mb-0.5">
                Irreversible & Permanent
              </div>
              <h2 id="delete-institution-modal-title" className="text-base font-bold text-white leading-tight">
                Delete Institution Profile & All Data
              </h2>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-delete-modal"
            disabled={isDeleting}
            onClick={handleClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Target Institution Card */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold text-sm">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">{instName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] font-mono font-medium text-slate-500">
                    Code: {instCode || 'N/A'}
                  </span>
                  {currentInstitution?.registrationNo && (
                    <span className="text-[11px] text-slate-500">
                      • Reg: {currentInstitution.registrationNo}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-100 text-rose-700 border border-rose-200">
              Pending Purge
            </span>
          </div>

          {/* Admin Role Verification Notice */}
          {!isAdmin ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-800 text-xs">
              <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">Access Restricted:</strong>
                This operation is strictly gated to an authenticated Administrator of this institution. Your current role is <span className="font-bold underline">{currentUser.role}</span>.
              </div>
            </div>
          ) : (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-700">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>All server data will be wiped immediately</span>
              </div>
              <p className="text-rose-800 leading-relaxed text-[11px]">
                Deleting the institution profile completely wipes the tenant from the central database server. This is far more comprehensive than clearing a single table: it erases the entire institution entity, users, configurations, and all operational history.
              </p>
            </div>
          )}

          {/* Comprehensive List of Deleted Data */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">
              Items That Will Be Permanently Removed:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2 text-slate-700">
                <Building2 className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Institution Profile & Branding</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2 text-slate-700">
                <Users className="w-4 h-4 text-rose-500 shrink-0" />
                <span>All Users, Logins & Operator Invites</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2 text-slate-700">
                <GraduationCap className="w-4 h-4 text-rose-500 shrink-0" />
                <span>All Student Rosters & Classes</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2 text-slate-700">
                <Receipt className="w-4 h-4 text-rose-500 shrink-0" />
                <span>All Fee Vouchers & Collections</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2 text-slate-700">
                <Bus className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Transport Routes, Buses & Stops</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2 text-slate-700">
                <CreditCard className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Bank Accounts & Audit Trails</span>
              </div>
            </div>
          </div>

          {/* Double Checkbox Safeguards */}
          <div className="space-y-2.5 pt-1">
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/60 cursor-pointer select-none">
              <input
                type="checkbox"
                id="checkbox-ack-permanent"
                checked={ackPermanent}
                disabled={!isAdmin || isDeleting}
                onChange={(e) => setAckPermanent(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer mt-0.5 shrink-0"
              />
              <span className="text-xs text-slate-700 font-medium leading-relaxed">
                I understand that this action is <strong className="font-bold text-rose-700">permanent and completely irreversible</strong>. There is no backup recovery once initiated.
              </span>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/60 cursor-pointer select-none">
              <input
                type="checkbox"
                id="checkbox-ack-sessions"
                checked={ackSessions}
                disabled={!isAdmin || isDeleting}
                onChange={(e) => setAckSessions(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer mt-0.5 shrink-0"
              />
              <span className="text-xs text-slate-700 font-medium leading-relaxed">
                I understand all user logins (including this administrator session) will be terminated immediately and all client sessions invalidated.
              </span>
            </label>
          </div>

          {/* Confirmation Input Field */}
          <div className="space-y-1.5 pt-1">
            <label htmlFor="input-delete-institution-confirm" className="block text-xs font-semibold text-slate-700">
              To confirm, type the institution name <span className="font-bold text-rose-600">"{instName}"</span> or code <span className="font-mono font-bold text-rose-600">"{instCode}"</span> below:
            </label>
            <input
              type="text"
              id="input-delete-institution-confirm"
              value={confirmationInput}
              disabled={!isAdmin || isDeleting}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder={`Enter "${instName}" or "${instCode}"`}
              className={`w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 transition ${
                isMatch
                  ? 'border-emerald-500 ring-emerald-500/20 text-slate-900 font-bold'
                  : 'border-slate-300 ring-rose-500/20 text-slate-900'
              }`}
            />
            {confirmationInput && !isMatch && (
              <p className="text-[11px] text-rose-600 font-medium">
                Name or code does not match yet. Please type exactly as shown.
              </p>
            )}
            {isMatch && (
              <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirmation phrase verified.
              </p>
            )}
          </div>

          {/* Error Message Display */}
          {errorMessage && (
            <div className="p-3 bg-rose-100 border border-rose-300 text-rose-800 rounded-xl text-xs font-medium">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            id="btn-cancel-delete-institution"
            disabled={isDeleting}
            onClick={handleClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn-execute-delete-institution"
            disabled={!isFormValid}
            onClick={handleDelete}
            className={`px-4 py-2 text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer ${
              isFormValid
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? 'Purging All Server Data...' : 'Permanently Delete Institution & Data'}
          </button>
        </div>
      </div>
    </div>
  );
};
