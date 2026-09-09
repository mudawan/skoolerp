import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { InstituteProfile } from '../../types';
import {
  AlertCircle,
  Building2,
  Check,
  Copy,
  Globe,
  Image as ImageIcon,
  Link as LinkIcon,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';

export interface ProfilePanelProps {
  profileData: InstituteProfile;
  setProfileData: React.Dispatch<React.SetStateAction<InstituteProfile>>;
  logoInputType: 'upload' | 'url';
  setLogoInputType: (t: 'upload' | 'url') => void;
  customLogoUrl: string;
  setCustomLogoUrl: (v: string) => void;
  logoDragActive: boolean;
  setLogoDragActive: (v: boolean) => void;
  logoError: string | null;
  setLogoError: (v: string | null) => void;
  logoFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleLogoFile: (file: File) => void;
  handleLogoDrop: (e: React.DragEvent) => void;
  handleApplyLogoUrl: () => void;
  handleRemoveLogo: () => void;
  handleSaveProfile: (e: React.FormEvent) => void;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = (props) => {
  const {
    profileData,
    setProfileData,
    logoInputType,
    setLogoInputType,
    customLogoUrl,
    setCustomLogoUrl,
    logoDragActive,
    setLogoDragActive,
    logoError,
    setLogoError,
    logoFileInputRef,
    handleLogoFile,
    handleLogoDrop,
    handleApplyLogoUrl,
    handleRemoveLogo,
    handleSaveProfile,
  } = props;

  const { hasPermission, currentInstitution, institute, showToast } = useApp();
  const [codeCopied, setCodeCopied] = useState(false);

  const activeSchoolCode = currentInstitution?.code || institute.code || 'SYS';
  const activeSchoolName = currentInstitution?.name || institute.name || 'School Workspace';

  return (
    <form onSubmit={handleSaveProfile} className="space-y-6">
      {/* Workspace Institution Code Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 rounded-2xl border border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-teal-600/30 border border-teal-500/50 flex items-center justify-center text-teal-300 shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-base">{activeSchoolName}</h3>
              <span className="font-mono text-xs text-teal-300 bg-teal-950 px-2 py-0.5 rounded border border-teal-800 uppercase font-semibold">
                {activeSchoolCode}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              School Workspace Code &bull; Share this code with teachers or accountants so they can connect their account
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(activeSchoolCode);
            setCodeCopied(true);
            showToast(`School code ${activeSchoolCode} copied to clipboard!`, 'success');
            setTimeout(() => setCodeCopied(false), 2500);
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer self-start sm:self-auto shrink-0 ${
            codeCopied
              ? 'bg-emerald-600 text-white'
              : 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs'
          }`}
        >
          {codeCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{codeCopied ? 'Code Copied' : 'Copy School Code'}</span>
        </button>
      </div>

      {/* Main Card: Logo & Identity */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-600" />
              School Logo & Identity
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload your institutional crest or logo. It will be showcased across the top navigation bar, collapsible sidebar, login portal, fee vouchers, and PDF statements.
            </p>
          </div>
          {profileData.logoUrl && (
            <button
              type="button"
              onClick={handleRemoveLogo}
              disabled={!hasPermission('settings.manage')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition cursor-pointer self-start sm:self-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Logo</span>
            </button>
          )}
        </div>

        {/* Logo Configuration Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Current Logo Emblem Preview */}
          <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-3">
            <div className="relative group">
              <div className="w-28 h-28 rounded-2xl bg-white border-2 border-slate-200 shadow-sm flex items-center justify-center p-2 overflow-hidden">
                {profileData.logoUrl ? (
                  <img
                    src={profileData.logoUrl}
                    alt={profileData.name || 'Institute Logo'}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-2">
                    <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-1" />
                    <span className="text-[10px] text-slate-400 font-bold block">No Logo Uploaded</span>
                  </div>
                )}
              </div>
              {profileData.logoUrl && (
                <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-1 rounded-full shadow-xs border-2 border-white">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Upload Tabs & Selection Controls */}
          <div className="lg:col-span-8 space-y-4">
            {/* Method Switcher Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setLogoInputType('upload');
                  setLogoError(null);
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  logoInputType === 'upload'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5 text-teal-600" />
                <span>Upload Image</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLogoInputType('url');
                  setLogoError(null);
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  logoInputType === 'url'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5 text-teal-600" />
                <span>Web URL</span>
              </button>
            </div>

            {/* Tab 1: File Upload & Drag-and-Drop */}
            {logoInputType === 'upload' && (
              <div className="space-y-3">
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleLogoFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setLogoDragActive(true);
                  }}
                  onDragLeave={() => setLogoDragActive(false)}
                  onDrop={handleLogoDrop}
                  onClick={() => {
                    if (hasPermission('settings.manage') && logoFileInputRef.current) {
                      logoFileInputRef.current.click();
                    }
                  }}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer flex flex-col items-center justify-center space-y-2 ${
                    logoDragActive
                      ? 'border-teal-500 bg-teal-50/50 scale-[0.99]'
                      : 'border-slate-300 hover:border-teal-500 bg-slate-50/50 hover:bg-teal-50/20'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Click to browse or drag and drop your logo file here
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      PNG, JPG, SVG, or WEBP (Max: 500KB). High resolution recommended.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Web URL Input */}
            {logoInputType === 'url' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Direct Image or Crest URL
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="url"
                        value={customLogoUrl}
                        onChange={(e) => setCustomLogoUrl(e.target.value)}
                        placeholder="https://example.com/school-logo.png"
                        disabled={!hasPermission('settings.manage')}
                        className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                      />
                      <LinkIcon className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyLogoUrl}
                      disabled={!hasPermission('settings.manage')}
                      className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shrink-0"
                    >
                      Apply URL
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Enter a publicly accessible HTTPS image link. The system will preload and embed it cleanly across vouchers and PDF statements.
                </p>
              </div>
            )}

            {/* Error Banner if any */}
            {logoError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{logoError}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card 2: Institute Information Fields */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-600" />
          Institutional Profile Information
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Institute Name *</label>
            <input
              type="text"
              required
              value={profileData.name}
              disabled={!hasPermission('settings.manage')}
              onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              placeholder="e.g. Cambridge High School"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Registration #</label>
            <input
              type="text"
              value={profileData.regNo}
              disabled={!hasPermission('settings.manage')}
              onChange={(e) => setProfileData({ ...profileData, regNo: e.target.value })}
              placeholder="e.g. REG-2026-981"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-slate-700 mb-1">Campus Address</label>
            <input
              type="text"
              value={profileData.address}
              disabled={!hasPermission('settings.manage')}
              onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
              placeholder="e.g. Sector F-8/4, Education Enclave, Islamabad"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
            <input
              type="text"
              value={profileData.phone}
              disabled={!hasPermission('settings.manage')}
              onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
              placeholder="e.g. +92 (51) 887-2341"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={profileData.email}
              disabled={!hasPermission('settings.manage')}
              onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
              placeholder="e.g. accounts@institute.edu"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-slate-700 mb-1">Official Website URL</label>
            <div className="relative">
              <input
                type="url"
                value={profileData.website || ''}
                disabled={!hasPermission('settings.manage')}
                onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}
                placeholder="https://www.institute.edu"
                className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
              <Globe className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
            </div>
          </div>
        </div>

        {hasPermission('settings.manage') && (
          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Save Profile & Branding
            </button>
          </div>
        )}
      </div>
    </form>
  );
};
