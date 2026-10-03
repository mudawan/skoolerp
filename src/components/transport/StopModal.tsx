import React from 'react';
import { TransportStop } from '../../types';
import { X } from 'lucide-react';

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
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-base font-bold text-slate-900">
            {editingStop ? 'Edit Bus Stop' : 'Add Bus Stop'}
          </h3>
          <button onClick={onClose} className="text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {formError && <p className="text-xs text-rose-600">{formError}</p>}

        <form onSubmit={onSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold mb-1">Stop Name *</label>
            <input
              type="text"
              required
              value={stopData.name}
              onChange={(e) => setStopData({ ...stopData, name: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-bold mb-1">Area / Sector</label>
            <input
              type="text"
              value={stopData.area}
              onChange={(e) => setStopData({ ...stopData, area: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-bold mb-1">Landmark</label>
            <input
              type="text"
              value={stopData.landmark}
              onChange={(e) => setStopData({ ...stopData, landmark: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-bold mb-1">Monthly Fare (Rs.) *</label>
            <input
              type="number"
              required
              min="0"
              value={stopData.monthlyFare}
              onWheel={(e) => (e.target as HTMLElement).blur()}
              onChange={(e) =>
                setStopData({ ...stopData, monthlyFare: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
            />
          </div>

          <div>
            <label className="block font-bold mb-1">Sort Position #</label>
            <input
              type="number"
              min="1"
              value={stopData.sortOrder}
              onWheel={(e) => (e.target as HTMLElement).blur()}
              onChange={(e) => setStopData({ ...stopData, sortOrder: Number(e.target.value) })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-xl"
            >
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white font-bold rounded-xl">
              {editingStop ? 'Update Stop' : 'Save Stop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
