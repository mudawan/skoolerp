import { getCurrencyCode } from '../../utils/feeMath';
import React from 'react';
import { TransportStop } from '../../types';
import { X, MapPin, AlertCircle } from 'lucide-react';

export interface StopFormData {
  name: string;
  area: string;
  landmark: string;
  monthlyFare: number;
  sortOrder: number;
}

interface StopModalProps {
  show: boolean;
  onClose: () => void;
  editingStop: TransportStop | null;
  stopData: StopFormData;
  setStopData: React.Dispatch<React.SetStateAction<StopFormData>>;
  formError: string;
  onSubmit: (e: React.FormEvent) => void;
}

const inputClass =
  'w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';

export const StopModal: React.FC<StopModalProps> = ({
  show,
  onClose,
  editingStop,
  stopData,
  setStopData,
  formError,
  onSubmit,
}) => {
  if (!show) return null;

  const set = <K extends keyof StopFormData>(key: K, value: StopFormData[K]) =>
    setStopData((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {editingStop ? `Edit Stop: ${editingStop.name}` : 'Add Bus Stop'}
              </h3>
              <p className="text-[11px] text-slate-500">Pick-up and drop-off point with monthly fare</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {formError && (
          <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="p-4 space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Stop Name *</label>
            <input
              type="text"
              required
              value={stopData.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Liberty Chowk, Main Market"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Area / Sector</label>
              <input
                type="text"
                value={stopData.area}
                onChange={(e) => set('area', e.target.value)}
                placeholder="e.g. Riverside"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Landmark</label>
              <input
                type="text"
                value={stopData.landmark}
                onChange={(e) => set('landmark', e.target.value)}
                placeholder="e.g. Near Shell Pump"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Monthly Fare ({getCurrencyCode()}) *</label>
              <input
                type="number"
                required
                min="0"
                value={stopData.monthlyFare}
                onChange={(e) => set('monthlyFare', Math.max(0, Number(e.target.value) || 0))}
                onWheel={(e) => (e.target as HTMLElement).blur()}
                className={`${inputClass} font-mono font-bold`}
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Sort Position #</label>
              <input
                type="number"
                min="1"
                value={stopData.sortOrder}
                onChange={(e) => set('sortOrder', Number(e.target.value))}
                onWheel={(e) => (e.target as HTMLElement).blur()}
                className={`${inputClass} font-mono font-bold`}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              {editingStop ? 'Update Stop' : 'Save Stop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
