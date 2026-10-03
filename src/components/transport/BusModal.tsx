import React from 'react';
import { TransportBus } from '../../types';
import { X } from 'lucide-react';

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
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-base font-bold text-slate-900">
            {editingBus ? 'Edit School Bus' : 'Add School Bus'}
          </h3>
          <button onClick={onClose} className="text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {formError && <p className="text-xs text-rose-600">{formError}</p>}

        <form onSubmit={onSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold mb-1">Bus Number *</label>
            <input
              type="text"
              required
              value={busData.busNumber}
              onChange={(e) => setBusData({ ...busData, busNumber: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-bold mb-1">Model & Registration</label>
            <input
              type="text"
              value={busData.model}
              onChange={(e) => setBusData({ ...busData, model: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-bold mb-1">Driver Name & Phone</label>
            <input
              type="text"
              value={busData.driverName}
              onChange={(e) => setBusData({ ...busData, driverName: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-bold mb-1">Route Description</label>
            <input
              type="text"
              value={busData.routeName}
              onChange={(e) => setBusData({ ...busData, routeName: e.target.value })}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-bold mb-1">Sort Position #</label>
            <input
              type="number"
              min="1"
              value={busData.sortOrder}
              onChange={(e) => setBusData({ ...busData, sortOrder: Number(e.target.value) })}
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
              {editingBus ? 'Update Bus' : 'Save Bus'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
