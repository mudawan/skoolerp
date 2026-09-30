import React from 'react';
import { TransportStop } from '../../types';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { X, MapPin, AlertCircle } from 'lucide-react';

export interface StopModalProps {
  show: boolean;
  onClose: () => void;
  editingStop: TransportStop | null;
  stopData: {
    name: string;
    area: string;
    landmark: string;
    monthlyFare: number;
    sortOrder: number;
  };
  setStopData: React.Dispatch<React.SetStateAction<any>>;
  formError: string;
  onSubmit: (e: React.FormEvent) => void;
}

export const StopModal: React.FC<StopModalProps> = ({
  show,
  onClose,
  editingStop,
  stopData,
  setStopData,
  formError,
  onSubmit,
}) => {
  useEscapeKey(onClose, show);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {editingStop ? `Edit Stop: ${editingStop.name}` : 'Add Bus Stop'}
              </h3>
              <p className="text-[11px] text-slate-500">Pick-up and drop-off point with fare</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition">
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
              onChange={(e) => setStopData((prev: any) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Liberty Chowk, Main Market"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Area / Neighborhood</label>
              <input
                type="text"
                value={stopData.area}
                onChange={(e) => setStopData((prev: any) => ({ ...prev, area: e.target.value }))}
                placeholder="e.g. Gulberg III"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Landmark</label>
              <input
                type="text"
                value={stopData.landmark}
                onChange={(e) => setStopData((prev: any) => ({ ...prev, landmark: e.target.value }))}
                placeholder="e.g. Near Shell Pump"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Monthly Fare (Rs.) *</label>
            <input
              type="number"
              min="0"
              required
              value={stopData.monthlyFare || ''}
              onChange={(e) => setStopData((prev: any) => ({ ...prev, monthlyFare: Number(e.target.value) || 0 }))}
              placeholder="0"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold font-mono focus:ring-2 focus:ring-amber-500"
            />
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
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              {editingStop ? 'Save Changes' : 'Add Stop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
