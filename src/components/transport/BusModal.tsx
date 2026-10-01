import React from 'react';
import { TransportBus } from '../../types';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { X, Bus, AlertCircle } from 'lucide-react';

export interface BusModalProps {
  show: boolean;
  onClose: () => void;
  editingBus: TransportBus | null;
  busData: {
    busNumber: string;
    model: string;
    regNumber: string;
    driverName: string;
    driverPhone: string;
    routeName: string;
  };
  setBusData: React.Dispatch<React.SetStateAction<any>>;
  formError: string;
  onSubmit: (e: React.FormEvent) => void;
}

export const BusModal: React.FC<BusModalProps> = ({
  show,
  onClose,
  editingBus,
  busData,
  setBusData,
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
              <Bus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {editingBus ? `Edit Bus #${editingBus.busNumber}` : 'Add Bus / Route'}
              </h3>
              <p className="text-[11px] text-slate-500">Fleet vehicle and route configuration</p>
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
            <label className="block font-bold text-slate-700 mb-1">Bus / Van Number *</label>
            <input
              type="text"
              required
              value={busData.busNumber}
              onChange={(e) => setBusData((prev: any) => ({ ...prev, busNumber: e.target.value }))}
              placeholder="e.g. Bus-01, Van-04"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Route Name *</label>
              <input
                type="text"
                required
                value={busData.routeName}
                onChange={(e) => setBusData((prev: any) => ({ ...prev, routeName: e.target.value }))}
                placeholder="e.g. Gulberg Line"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Reg Number</label>
              <input
                type="text"
                value={busData.regNumber}
                onChange={(e) => setBusData((prev: any) => ({ ...prev, regNumber: e.target.value }))}
                placeholder="e.g. LEA-1234"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Vehicle Model</label>
              <input
                type="text"
                value={busData.model}
                onChange={(e) => setBusData((prev: any) => ({ ...prev, model: e.target.value }))}
                placeholder="e.g. Toyota Coaster"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Driver Name</label>
              <input
                type="text"
                value={busData.driverName}
                onChange={(e) => setBusData((prev: any) => ({ ...prev, driverName: e.target.value }))}
                placeholder="e.g. Muhammad Ali"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Driver Phone</label>
            <input
              type="text"
              value={busData.driverPhone}
              onChange={(e) => setBusData((prev: any) => ({ ...prev, driverPhone: e.target.value }))}
              placeholder="e.g. 0300-1234567"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
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
              {editingBus ? 'Save Changes' : 'Add Bus'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
