import React from 'react';
import { InstituteProfile } from '../../types';
import { Building2, Save } from 'lucide-react';

export interface ProfilePanelProps {
  profileData: InstituteProfile;
  setProfileData: React.Dispatch<React.SetStateAction<InstituteProfile>>;
  logoInputType?: any;
  setLogoInputType?: any;
  customLogoUrl?: any;
  setCustomLogoUrl?: any;
  logoDragActive?: any;
  setLogoDragActive?: any;
  logoError?: any;
  setLogoError?: any;
  logoFileInputRef?: any;
  handleLogoFile?: any;
  handleLogoDrop?: any;
  handleApplyLogoUrl?: any;
  handleRemoveLogo?: any;
  handleSaveProfile: (e: React.FormEvent) => void;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({
  profileData,
  setProfileData,
  handleSaveProfile,
}) => {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
      <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
        <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Institution Information</h3>
          <p className="text-xs text-slate-500">School name, contact details, registration, and logo for vouchers</p>
        </div>
      </div>

      <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Institution Name *</label>
            <input
              type="text"
              required
              value={profileData.name}
              onChange={(e) => setProfileData((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Registration # / Code</label>
            <input
              type="text"
              value={profileData.regNo}
              onChange={(e) => setProfileData((prev) => ({ ...prev, regNo: e.target.value }))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Phone</label>
            <input
              type="text"
              value={profileData.phone}
              onChange={(e) => setProfileData((prev) => ({ ...prev, phone: e.target.value }))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={profileData.email}
              onChange={(e) => setProfileData((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Website</label>
            <input
              type="text"
              value={profileData.website}
              onChange={(e) => setProfileData((prev) => ({ ...prev, website: e.target.value }))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Address</label>
          <textarea
            rows={2}
            value={profileData.address}
            onChange={(e) => setProfileData((prev) => ({ ...prev, address: e.target.value }))}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Session Inactivity Timeout (Minutes)</label>
          <input
            type="number"
            min="1"
            max="120"
            value={profileData.sessionTimeoutMinutes || 15}
            onChange={(e) => setProfileData((prev) => ({ ...prev, sessionTimeoutMinutes: Number(e.target.value) || 15 }))}
            className="w-36 px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button
            type="submit"
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Save Profile Changes
          </button>
        </div>
      </form>
    </div>
  );
};
