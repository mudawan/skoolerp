import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRole, PermissionCategory } from '../types';
import {
  ALL_PERMISSIONS,
  PERMISSION_CATEGORIES,
  ROLE_PRESET_PERMISSIONS,
  SPECIALTY_PRESETS,
  getEffectiveRole,
  getGrantedCategoryCount,
} from '../utils/permissions';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bus,
  Check,
  CheckSquare,
  Database,
  FileText,
  FolderKanban,
  Info,
  KeyRound,
  LayoutDashboard,
  Receipt,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
  X,
} from 'lucide-react';

interface UserPermissionsModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSave: (userId: string, permissions: string[], role: UserRole) => Promise<void>;
}

export const UserPermissionsModal: React.FC<UserPermissionsModalProps> = ({
  isOpen,
  user,
  onClose,
  onSave,
}) => {
  if (!isOpen || !user) return null;

  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<UserRole>('Custom');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize from user prop
  useEffect(() => {
    if (user) {
      const initialPerms = Array.isArray(user.permissions) ? [...user.permissions] : [];
      setSelectedPermissions(initialPerms);
      setSelectedRole(user.role);
      setSearchQuery('');
      setActiveCategoryFilter('all');
    }
  }, [user]);

  // Sync role when permissions change
  const handlePermissionsChange = (newPerms: string[]) => {
    setSelectedPermissions(newPerms);
    const effective = getEffectiveRole(newPerms);
    setSelectedRole(effective);
  };

  const togglePermission = (code: string) => {
    if (selectedPermissions.includes(code)) {
      handlePermissionsChange(selectedPermissions.filter((c) => c !== code));
    } else {
      handlePermissionsChange([...selectedPermissions, code]);
    }
  };

  const toggleCategoryAll = (categoryId: PermissionCategory) => {
    const categoryPerms = ALL_PERMISSIONS.filter((p) => p.category === categoryId).map((p) => p.code);
    const allSelected = categoryPerms.every((code) => selectedPermissions.includes(code));

    if (allSelected) {
      // Remove all in category
      handlePermissionsChange(selectedPermissions.filter((code) => !categoryPerms.includes(code)));
    } else {
      // Add all missing in category
      const merged = Array.from(new Set([...selectedPermissions, ...categoryPerms]));
      handlePermissionsChange(merged);
    }
  };

  const handleApplyPreset = (presetPerms: string[], roleHint?: UserRole) => {
    setSelectedPermissions([...presetPerms]);
    setSelectedRole(roleHint || getEffectiveRole(presetPerms));
  };

  const handleSelectAll = () => {
    handleApplyPreset(ALL_PERMISSIONS.map((p) => p.code), 'Admin');
  };

  const handleDeselectAll = () => {
    handleApplyPreset([], 'Custom');
  };

  const handleResetToCurrent = () => {
    if (user) {
      setSelectedPermissions([...(user.permissions || [])]);
      setSelectedRole(user.role);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(user.id, selectedPermissions, selectedRole);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered list based on search and category tab
  const filteredPermissions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return ALL_PERMISSIONS.filter((p) => {
      if (activeCategoryFilter !== 'all' && p.category !== activeCategoryFilter) {
        return false;
      }
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.code.toLowerCase().includes(query) ||
        p.categoryLabel.toLowerCase().includes(query)
      );
    });
  }, [searchQuery, activeCategoryFilter]);

  // Group filtered permissions by category
  const groupedCategories = useMemo(() => {
    const map = new Map<PermissionCategory, typeof ALL_PERMISSIONS>();
    filteredPermissions.forEach((p) => {
      const existing = map.get(p.category) || [];
      existing.push(p);
      map.set(p.category, existing);
    });
    return map;
  }, [filteredPermissions]);

  const totalCount = ALL_PERMISSIONS.length;
  const grantedCount = selectedPermissions.length;
  const percentGranted = Math.round((grantedCount / totalCount) * 100);

  const getCategoryIcon = (catId: PermissionCategory) => {
    switch (catId) {
      case 'dashboard':
        return LayoutDashboard;
      case 'students':
        return Users;
      case 'families':
        return FolderKanban;
      case 'classes':
        return BookOpen;
      case 'fees':
        return FileText;
      case 'collections':
        return Receipt;
      case 'defaulters':
        return AlertTriangle;
      case 'transport':
        return Bus;
      case 'reports':
        return BarChart3;
      case 'settings':
        return Settings;
      case 'users':
        return Shield;
      case 'system':
        return Database;
      default:
        return KeyRound;
    }
  };

  return (
    <div
      id="user-permissions-modal"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 border-b border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center font-bold text-base shrink-0 shadow-inner">
              {user.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight text-white truncate">{user.name}</h2>
                <span className="font-mono text-xs text-teal-300 bg-teal-950/60 border border-teal-800/80 px-2 py-0.5 rounded-md">
                  @{user.username}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    selectedRole === 'Admin'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : selectedRole === 'Accountant'
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                      : selectedRole === 'Viewer'
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {selectedRole === 'Custom' ? 'Custom Permissions' : `${selectedRole} Role`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Configure granular module permissions and security privileges for this operator account.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer shrink-0"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Role & Specialty Presets Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 shrink-0">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>Apply Operational Presets:</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] font-bold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer"
              >
                Grant All ({totalCount})
              </button>
              <span className="text-slate-300">&bull;</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
              >
                Clear All
              </button>
              <span className="text-slate-300">&bull;</span>
              <button
                type="button"
                onClick={handleResetToCurrent}
                className="text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 hover:underline cursor-pointer"
                title="Revert to saved permissions"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>
          </div>

          {/* Specialty Preset Chips */}
          <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar">
            {SPECIALTY_PRESETS.map((preset) => {
              const isMatch =
                preset.permissions.length === selectedPermissions.length &&
                preset.permissions.every((p) => selectedPermissions.includes(p));

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset.permissions, preset.role)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isMatch
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
                  }`}
                  title={preset.description}
                >
                  <span>{preset.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                      isMatch ? 'bg-teal-500 text-slate-950' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {preset.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Access Metrics & Search Filter */}
        <div className="p-4 sm:px-6 bg-white border-b border-slate-200 shrink-0 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Progress Meter */}
            <div className="flex-1 max-w-sm">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                <span>Active Scope:</span>
                <span className="text-teal-700 font-mono">
                  {grantedCount} of {totalCount} ({percentGranted}%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div
                  className={`h-full transition-all duration-300 ${
                    percentGranted >= 90
                      ? 'bg-amber-500'
                      : percentGranted >= 50
                      ? 'bg-teal-600'
                      : percentGranted > 0
                      ? 'bg-indigo-600'
                      : 'bg-slate-300'
                  }`}
                  style={{ width: `${percentGranted}%` }}
                />
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search permissions (e.g. fees, delete)..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex overflow-x-auto gap-1.5 pt-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('all')}
              className={`text-xs px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                activeCategoryFilter === 'all'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Modules ({totalCount})
            </button>
            {PERMISSION_CATEGORIES.map((cat) => {
              const { granted, total } = getGrantedCategoryCount(selectedPermissions, cat.id);
              const isActive = activeCategoryFilter === cat.id;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategoryFilter(cat.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isActive
                        ? 'bg-teal-800 text-white'
                        : granted === total
                        ? 'bg-emerald-100 text-emerald-800'
                        : granted > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {granted}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Permissions Matrix */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/50">
          {groupedCategories.size === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-sm text-slate-700">No permissions match your search</p>
              <p className="text-xs text-slate-400 mt-1">
                Try clearing your search query or switching to "All Modules".
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategoryFilter('all');
                }}
                className="mt-3 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            Array.from(groupedCategories.entries()).map(([catId, permissions]) => {
              const catInfo = PERMISSION_CATEGORIES.find((c) => c.id === catId);
              const CatIcon = getCategoryIcon(catId);
              const { granted, total } = getGrantedCategoryCount(selectedPermissions, catId);
              const allCategoryGranted = granted === total;
              const someCategoryGranted = granted > 0 && granted < total;

              return (
                <div
                  key={catId}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden"
                >
                  {/* Category Header */}
                  <div className="p-4 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 border border-teal-200/80 flex items-center justify-center shrink-0">
                        <CatIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-sm">
                            {catInfo?.label || catId}
                          </h3>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              allCategoryGranted
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : someCategoryGranted
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {granted} of {total} enabled
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {catInfo?.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleCategoryAll(catId)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
                    >
                      {allCategoryGranted ? (
                        <>
                          <CheckSquare className="w-3.5 h-3.5 text-teal-600" />
                          <span>Deselect All</span>
                        </>
                      ) : (
                        <>
                          <Square className="w-3.5 h-3.5 text-slate-400" />
                          <span>Select All in Module</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Permissions Grid */}
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {permissions.map((perm) => {
                      const isChecked = selectedPermissions.includes(perm.code);

                      return (
                        <div
                          key={perm.code}
                          onClick={() => togglePermission(perm.code)}
                          className={`p-3 rounded-xl border transition flex items-start gap-3 cursor-pointer select-none ${
                            isChecked
                              ? 'bg-teal-50/40 border-teal-300 ring-1 ring-teal-400/30'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                          }`}
                        >
                          <div className="pt-0.5 shrink-0">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                                isChecked
                                  ? 'bg-teal-600 border-teal-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-xs font-bold truncate ${
                                  isChecked ? 'text-slate-900' : 'text-slate-700'
                                }`}
                              >
                                {perm.name}
                              </span>

                              {perm.riskLevel === 'high' ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
                                  High Risk
                                </span>
                              ) : perm.riskLevel === 'medium' ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                  Manage
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                  View
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                              {perm.description}
                            </p>

                            <div className="mt-1.5">
                              <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {perm.code}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex items-center justify-between gap-4 shrink-0 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="w-4 h-4 text-teal-600 shrink-0" />
            <span>
              Changes take effect immediately on the operator's next page interaction.
            </span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              id="btn-save-user-permissions"
              disabled={isSaving}
              onClick={handleSave}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSaving ? 'Saving Changes...' : 'Save Permissions'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
