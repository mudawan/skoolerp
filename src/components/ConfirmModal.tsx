import React from 'react';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tertiaryLabel?: string;
  tertiaryVariant?: 'danger' | 'neutral';
  onTertiary?: () => void;
  variant?: 'danger' | 'warning' | 'info';
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tertiaryLabel,
  tertiaryVariant = 'neutral',
  onTertiary,
  variant = 'danger',
  confirmDisabled = false,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'warning':
        return {
          icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
          iconBg: 'bg-amber-50 border-amber-200',
          btnBg: 'bg-amber-600 hover:bg-amber-700 text-white',
        };
      case 'info':
        return {
          icon: <Info className="w-5 h-5 text-teal-600" />,
          iconBg: 'bg-teal-50 border-teal-200',
          btnBg: 'bg-teal-600 hover:bg-teal-700 text-white',
        };
      case 'danger':
      default:
        return {
          icon: <Trash2 className="w-5 h-5 text-rose-600" />,
          iconBg: 'bg-rose-50 border-rose-200',
          btnBg: 'bg-rose-600 hover:bg-rose-700 text-white',
        };
    }
  };

  const { icon, iconBg, btnBg } = getVariantStyles();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 my-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${iconBg}`}>
              {icon}
            </div>
            <h3 className="text-base font-bold text-slate-900 leading-snug">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="text-xs text-slate-600 leading-relaxed py-1">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-3.5">
          {tertiaryLabel && onTertiary && (
            <button
              type="button"
              onClick={onTertiary}
              className={`px-4 py-2 font-bold rounded-xl text-xs transition cursor-pointer ${
                tertiaryVariant === 'danger'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tertiaryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 ${btnBg} font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
