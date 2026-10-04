import React from 'react';
import { TransportBus } from '../../types';
import { X, Bus, AlertCircle } from 'lucide-react';

export interface BusFormData {
  busNumber: string;
  model: string;
  regNumber: string;
  driverName: string;
  driverPhone: string;
  routeName: string;
  active: boolean;
  sortOrder: number;
}

interface BusModalProps {
  show: boolean;
  onClose: () => void;
  editingBus: TransportBus | null;
  busData: BusFormData;
  setBusData: React.Dispatch<React.SetStateAction<BusFormData>>;
  formError: string;
  onSubmit: (e: React.FormEvent) => void;
}

const inputClass =
  'w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';

export const BusModal: React.FC<BusModalProps> = ({
  show,
  onClose,
  editingBus,
  busData,
  setBusData,
  formError,
  onSubmit,
}) => {
  if (!show) return null;

  const set = <K extends keyof BusFormData>(key: K, value: BusFormData[K]) =>
    setBusData((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <Bus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {editingBus ? `Edit Bus ${editingBus.busNumber}` : 'Add School Bus'}
              </h3>
              <p className="text-[11px] text-slate-500">Fleet vehicle, driver and route</p>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Bus / Van Number *</label>
              <input
                type="text"
                required
                value={busData.busNumber}
                onChange={(e) => set('busNumber', e.target.value)}
                placeholder="e.g. Bus-01"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Registration Number</label>
              <input
                type="text"
                value={busData.regNumber}
                onChange={(e) => set('regNumber', e.target.value)}
                placeholder="e.g. LEA-1234"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Vehicle Model</label>
              <input
                type="text"
                value={busData.model}
                onChange={(e) => set('model', e.target.value)}
                placeholder="e.g. Toyota Coaster"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Route Name</label>
              <input
                type="text"
                value={busData.routeName}
                onChange={(e) => set('routeName', e.target.value)}
                placeholder="e.g. Gulberg Line"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Driver Name</label>
              <input
                type="text"
                value={busData.driverName}
                onChange={(e) => set('driverName', e.target.value)}
                placeholder="e.g. Muhammad Ali"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Driver Phone</label>
              <input
                type="tel"
                value={busData.driverPhone}
                onChange={(e) => set('driverPhone', e.target.value)}
                placeholder="e.g. 0300-1234567"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Sort Position #</label>
              <input
                type="number"
                min="1"
                value={busData.sortOrder}
                onChange={(e) => set('sortOrder', Number(e.target.value))}
                onWheel={(e) => (e.target as HTMLElement).blur()}
                className={`${inputClass} font-mono font-bold`}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={busData.active}
                onChange={(e) => set('active', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Active (in service)
            </label>
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
              {editingBus ? 'Update Bus' : 'Save Bus'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
