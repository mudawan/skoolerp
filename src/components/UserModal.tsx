import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
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
  ChevronDown,
  Copy,
  Database,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  Info,
  KeyRound,
  LayoutDashboard,
  Lock,
  Mail,
  Receipt,
  RotateCcw,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Square,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';

export interface UserModalSaveData {
  id?: string;
  username: string;
  name: string;
  email?: string;
  password?: string;
  role: UserRole;
  permissions: string[];
}

export interface UserModalProps {
  isOpen: boolean;
  user: User | null; // null indicates creating a new user
  initialTab?: 'profile' | 'permissions';
  onClose: () => void;
  onSave: (data: UserModalSaveData) => Promise<void> | void;
}

export const UserModal: React.FC<UserModalProps> = ({
  isOpen,
  user,
  initialTab = 'profile',
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  // Active Tab: 'profile' (Credentials & Account) | 'permissions' (Role & Granular Matrix)
  const [activeTab, setActiveTab] = useState<'profile' | 'permissions'>(initialTab);

  const { currentInstitution, institute, showToast } = useApp();
  const [copiedNotice, setCopiedNotice] = useState(false);

  // Form Fields
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Permissions & Role State
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<UserRole>('Accountant');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize or reset form whenever user or isOpen changes
  useEffect(() => {
    setActiveTab(initialTab);
    setFormError(null);
    setSearchQuery('');
    setActiveCategoryFilter('all');
    setShowPassword(false);

    if (user) {
      setUsername(user.username || '');
      setName(user.name || '');
      setEmail(user.email || '');
      setPassword('');
      const perms =
        Array.isArray(user.permissions)
          ? [...user.permissions]
          : user.role && ROLE_PRESET_PERMISSIONS[user.role]
          ? [...ROLE_PRESET_PERMISSIONS[user.role]]
          : [];
      setSelectedPermissions(perms);
      setSelectedRole(user.role || (perms.length > 0 ? getEffectiveRole(perms) : 'Custom'));
    } else {
      setUsername('');
      setName('');
      setEmail('');
      setPassword('');
      setSelectedPermissions([]);
      setSelectedRole('Custom');
    }
  }, [user, isOpen, initialTab]);

  // Derived current role preset selection ID (empty string if 0 permissions / unchosen)
  const currentPresetValue = useMemo(() => {
    if (selectedPermissions.length === 0) return '';
    const match = SPECIALTY_PRESETS.find(
      (p) =>
        p.permissions.length === selectedPermissions.length &&
        p.permissions.every((code) => selectedPermissions.includes(code))
    );
    if (match) return match.id;
    return 'custom';
  }, [selectedPermissions]);

  // Handle dropdown selection: unchosen ("") means no permission
  const handleRolePresetSelect = (presetId: string) => {
    if (!presetId) {
      // Unchosen / None -> 0 permissions (no permission)
      setSelectedPermissions([]);
      setSelectedRole('Custom');
      return;
    }
    if (presetId === 'viewer') {
      presetId = 'auditor';
    }
    const preset = SPECIALTY_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSelectedPermissions([...preset.permissions]);
      setSelectedRole(preset.role);
    }
  };

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
      handlePermissionsChange(selectedPermissions.filter((code) => !categoryPerms.includes(code)));
    } else {
      const merged = Array.from(new Set([...selectedPermissions, ...categoryPerms]));
      handlePermissionsChange(merged);
    }
  };

  const handleApplyPreset = (presetPerms: string[], roleHint?: UserRole) => {
    setSelectedPermissions([...presetPerms]);
    setSelectedRole(roleHint || getEffectiveRole(presetPerms));
  };

  const handleSelectAll = () => {
    handleApplyPreset(
      ALL_PERMISSIONS.map((p) => p.code),
      'Admin'
    );
  };

  const handleDeselectAll = () => {
    handleApplyPreset([], 'Custom');
  };

  const handleResetToInitial = () => {
    if (user) {
      const perms =
        Array.isArray(user.permissions)
          ? [...user.permissions]
          : user.role && ROLE_PRESET_PERMISSIONS[user.role]
          ? [...ROLE_PRESET_PERMISSIONS[user.role]]
          : [];
      setSelectedPermissions(perms);
      setSelectedRole(user.role || (perms.length > 0 ? getEffectiveRole(perms) : 'Custom'));
    } else {
      setSelectedPermissions([]);
      setSelectedRole('Custom');
    }
  };

  // Submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setFormError('Username (Login ID) is required.');
      setActiveTab('profile');
      return;
    }

    const trimmedName = name.trim() || trimmedUsername;
    const trimmedPassword = password.trim();

    // Validation for new user password
    if (!user) {
      if (!trimmedPassword || trimmedPassword.length < 6) {
        setFormError('Password is required (minimum 6 characters).');
        setActiveTab('profile');
        return;
      }
    } else if (trimmedPassword && trimmedPassword.length < 6) {
      setFormError('New password must be at least 6 characters.');
      setActiveTab('profile');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        id: user?.id,
        username: trimmedUsername,
        name: trimmedName,
        email: email.trim() || undefined,
        password: trimmedPassword || undefined,
        role: selectedRole,
        permissions: selectedPermissions,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save operator changes.';
      setFormError(msg);
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

  // Module summaries for Profile tab
  const activeModules = useMemo(() => {
    const list: string[] = [];
    if (selectedPermissions.some((p) => p.startsWith('students.'))) list.push('Students');
    if (selectedPermissions.some((p) => p.startsWith('families.'))) list.push('Families');
    if (selectedPermissions.some((p) => p.startsWith('classes.'))) list.push('Classes');
    if (
      selectedPermissions.some(
        (p) => p.startsWith('fees.view') || p.startsWith('fees.generate') || p.startsWith('fees.edit')
      )
    )
      list.push('Billing');
    if (selectedPermissions.some((p) => p.startsWith('fees.collect') || p.startsWith('fees.reverse')))
      list.push('Collections');
    if (selectedPermissions.some((p) => p.startsWith('defaulters.'))) list.push('Defaulters');
    if (selectedPermissions.some((p) => p.startsWith('transport.'))) list.push('Transport');
    if (selectedPermissions.some((p) => p.startsWith('fees.report') || p.startsWith('audit.')))
      list.push('Reports & Audits');
    if (selectedPermissions.some((p) => p.startsWith('settings.'))) list.push('Settings');
    if (selectedPermissions.some((p) => p.startsWith('users.'))) list.push('User Admin');
    return list;
  }, [selectedPermissions]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      id="unified-user-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs overflow-y-auto p-2 sm:p-4 md:p-6 flex flex-col items-center justify-start sm:justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col min-h-0 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        style={{
          maxHeight: 'min(calc(100dvh - 1.5rem), calc(100vh - 1.5rem), 820px)',
        }}
      >
        {/* Pinned Top Header */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4.5 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center font-bold text-sm shrink-0 shadow-inner">
              {user ? (user.name || user.username).substring(0, 2).toUpperCase() : <Users className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {user ? `Edit Operator: @${user.username}` : 'Add New System Operator'}
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    selectedPermissions.length === 0
                      ? 'bg-slate-700/60 text-slate-300 border-slate-600/70'
                      : selectedRole === 'Admin'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : selectedRole === 'Accountant'
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                      : selectedRole === 'Viewer'
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {selectedPermissions.length === 0
                    ? 'No Permissions'
                    : selectedRole === 'Custom'
                    ? 'Custom Permissions'
                    : `${selectedRole} Role`}
                </span>
                <span className="text-[10px] font-mono text-teal-300 bg-teal-950/60 border border-teal-800/80 px-1.5 py-0.5 rounded-md">
                  {grantedCount}/{totalCount} Privileges
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {user ? user.name : 'Create credentials and configure authorization privileges.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            id="btn-close-user-modal"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Switcher */}
        <div className="bg-slate-100/90 border-b border-slate-200 px-3.5 sm:px-5 py-2 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 rounded-xl">
            <button
              type="button"
              id="user-modal-tab-profile"
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5 text-teal-600" />
              <span>Account & Credentials</span>
            </button>

            <button
              type="button"
              id="user-modal-tab-permissions"
              onClick={() => setActiveTab('permissions')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'permissions'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-teal-600" />
              <span>Role & Permissions</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  activeTab === 'permissions'
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-slate-300/70 text-slate-700'
                }`}
              >
                {grantedCount}
              </span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 font-medium">
            <span>Scope:</span>
            <strong className="text-teal-700 font-mono">{percentGranted}%</strong>
          </div>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {formError && (
            <div className="m-3 sm:mx-5 mb-0 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Tab 1: Account Details */}
          {activeTab === 'profile' && (
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0 custom-scrollbar overscroll-contain">
              {/* Row 1: Username & Full Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">
                    Username (Login ID) <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-xs">@</span>
                    <input
                      type="text"
                      id="input-user-username"
                      required
                      placeholder="e.g. lead_accountant"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-7 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Unique identifier used to sign in to the billing console.
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">
                    Full Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    id="input-user-name"
                    required
                    placeholder="e.g. Staff Member Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Displayed on printed collection receipts and audit trails.
                  </span>
                </div>
              </div>

              {/* Row 2: Email Address & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="email"
                      id="input-user-email"
                      placeholder="e.g. staff@school.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Optional contact address for notifications and reports.
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">
                    {user ? 'New Password' : 'Password'} <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="input-user-password"
                      placeholder={user ? 'Leave blank to preserve current' : 'Min 6 characters'}
                      required={!user}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {user ? 'Only fill if you wish to reset or change the password.' : 'Minimum 6 characters required.'}
                  </span>
                </div>
              </div>

              {/* Administrator Credential Notification Helper */}
              {username && password && (
                <div className="p-3 bg-teal-50/80 border border-teal-200 rounded-xl flex items-center justify-between gap-3 text-xs text-teal-900">
                  <div>
                    <span className="font-bold flex items-center gap-1.5 text-teal-800">
                      <Send className="w-3.5 h-3.5" />
                      Notify Operator Directly
                    </span>
                    <p className="text-[11px] text-teal-700 mt-0.5">
                      Since automated emails are not yet enabled, copy these credentials to notify <strong>{name || username}</strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const text = `School Portal Login Credentials for ${name || username}:
Workspace: ${currentInstitution?.name || institute.name} (Code: ${currentInstitution?.code || institute.code || 'SYS'})
Username: @${username}
Password: ${password}
Assigned Role: ${selectedRole}
Login portal: Sign in under School Fee Portal with these credentials.`;
                      navigator.clipboard.writeText(text);
                      setCopiedNotice(true);
                      showToast(`Credentials for ${name || username} copied to clipboard!`, 'success');
                      setTimeout(() => setCopiedNotice(false), 3000);
                    }}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                      copiedNotice
                        ? 'bg-emerald-600 text-white'
                        : 'bg-teal-700 hover:bg-teal-800 text-white shadow-xs'
                    }`}
                  >
                    {copiedNotice ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedNotice ? 'Copied' : 'Copy Notice'}</span>
                  </button>
                </div>
              )}

              {/* Assigned Authorization Profile with Role Preset Dropdown Picker */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-600" />
                    <label htmlFor="select-user-role-preset" className="font-bold text-xs text-slate-800">
                      Assigned Authorization Profile
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('permissions')}
                    className="text-xs text-teal-700 hover:text-teal-900 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <span>Configure Granular Permissions</span>
                    <span>&rarr;</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <select
                      id="select-user-role-preset"
                      value={currentPresetValue}
                      onChange={(e) => handleRolePresetSelect(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs appearance-none cursor-pointer"
                    >
                      <option value="">-- Select Role Preset (No Permission) --</option>
                      {currentPresetValue === 'custom' && (
                        <option value="custom">
                          Custom Permissions Matrix ({grantedCount} of {totalCount} Active)
                        </option>
                      )}
                      <optgroup label="Standard Roles">
                        <option value="admin">Super Administrator (Full Access - All {totalCount} Privileges)</option>
                        <option value="accountant">Fee Accountant / Billing Officer (Invoicing & Operations - 20 Privileges)</option>
                        <option value="auditor">Internal Auditor / Inspector (Read-Only Audit - 11 Privileges)</option>
                      </optgroup>
                      <optgroup label="Specialty Presets">
                        <option value="cashier">Cashier / Counter Desk (Collections Only - 5 Privileges)</option>
                        <option value="admissions">Admissions & Registrar (Student Records - 7 Privileges)</option>
                        <option value="transport_manager">Transport Fleet Coordinator (Fleet & Routes - 4 Privileges)</option>
                      </optgroup>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
                    <span className="truncate">
                      {currentPresetValue === '' ? (
                        <span className="text-amber-700 font-medium">
                          No preset chosen — this operator currently has 0 permissions (no access).
                        </span>
                      ) : currentPresetValue === 'custom' ? (
                        <span className="text-teal-700 font-medium">
                          Custom permission matrix configured for this account.
                        </span>
                      ) : (
                        SPECIALTY_PRESETS.find((p) => p.id === currentPresetValue)?.description || ''
                      )}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold shrink-0 ml-2 ${
                        grantedCount > 0
                          ? 'bg-teal-50 text-teal-800 border border-teal-200'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {grantedCount} of {totalCount} Active
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Role & Granular Permissions Matrix */}
          {activeTab === 'permissions' && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Presets & Role Quick Actions Bar */}
              <div className="bg-slate-50 border-b border-slate-200 px-3.5 sm:px-5 py-2.5 shrink-0 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Role Presets & Quick Templates:</span>
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
                      Clear (0)
                    </button>
                    <span className="text-slate-300">&bull;</span>
                    <button
                      type="button"
                      onClick={handleResetToInitial}
                      className="text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 hover:underline cursor-pointer"
                      title="Revert to original saved permissions"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* Preset Chips */}
                <div className="flex overflow-x-auto gap-1.5 pb-0.5 no-scrollbar -mx-1 px-1">
                  {SPECIALTY_PRESETS.map((preset) => {
                    const isMatch =
                      preset.permissions.length === selectedPermissions.length &&
                      preset.permissions.every((p) => selectedPermissions.includes(p));

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset.permissions, preset.role)}
                        className={`text-xs px-2.5 py-1 rounded-xl font-semibold border transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                          isMatch
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
                        }`}
                        title={preset.description}
                      >
                        <span>{preset.name.split('/')[0].trim()}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                            isMatch ? 'bg-teal-400 text-slate-950' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {preset.badge}
                        </span>
                      </button>
                    );
                  })}

                  {!SPECIALTY_PRESETS.some(
                    (p) =>
                      p.permissions.length === selectedPermissions.length &&
                      p.permissions.every((code) => selectedPermissions.includes(code))
                  ) && (
                    <div
                      className="text-xs px-2.5 py-1 rounded-xl font-semibold border bg-teal-950 text-teal-200 border-teal-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
                      title="Granular permissions have been individually customized for this account"
                    >
                      <Sparkles className="w-3 h-3 text-teal-400" />
                      <span>Custom Matrix</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-md font-bold bg-teal-500/30 text-teal-200">
                        {grantedCount} Active
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Search & Category Filter */}
              <div className="p-3 bg-white border-b border-slate-200 shrink-0 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  {/* Progress Meter */}
                  <div className="flex-1 max-w-xs">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-0.5">
                      <span>Active Scope:</span>
                      <span className="text-teal-700 font-mono">
                        {grantedCount} / {totalCount} ({percentGranted}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
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
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search permissions..."
                      className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Category Filter Pills */}
                <div className="flex overflow-x-auto gap-1.5 no-scrollbar -mx-1 px-1">
                  <button
                    type="button"
                    onClick={() => setActiveCategoryFilter('all')}
                    className={`text-xs px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${
                      activeCategoryFilter === 'all'
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All ({totalCount})
                  </button>
                  {PERMISSION_CATEGORIES.map((cat) => {
                    const { granted, total } = getGrantedCategoryCount(selectedPermissions, cat.id);
                    const isActive = activeCategoryFilter === cat.id;

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCategoryFilter(cat.id)}
                        className={`text-xs px-2 py-1 rounded-lg font-semibold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                          isActive
                            ? 'bg-teal-600 text-white font-bold shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <span>{cat.label.split('&')[0].trim()}</span>
                        <span
                          className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold ${
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

              {/* Scrollable Matrix */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-4 bg-slate-50/50 custom-scrollbar overscroll-contain">
                {groupedCategories.size === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-xs text-slate-700">No permissions match your search</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Try clearing your search query or switching to "All".
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setActiveCategoryFilter('all');
                      }}
                      className="mt-2.5 px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
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

                    return (
                      <div
                        key={catId}
                        className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden"
                      >
                        {/* Category Header */}
                        <div className="p-3 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/80 flex items-center justify-center shrink-0">
                              <CatIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-slate-900 text-xs truncate">
                                  {catInfo?.label || catId}
                                </h4>
                                <span
                                  className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border ${
                                    allCategoryGranted
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                      : granted > 0
                                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {granted}/{total}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleCategoryAll(catId)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[10.5px] font-semibold transition cursor-pointer shrink-0"
                          >
                            {allCategoryGranted ? (
                              <>
                                <CheckSquare className="w-3 h-3 text-teal-600" />
                                <span>Deselect All</span>
                              </>
                            ) : (
                              <>
                                <Square className="w-3 h-3 text-slate-400" />
                                <span>Select All</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Category Permissions Grid */}
                        <div className="p-2 sm:p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {permissions.map((perm) => {
                            const isChecked = selectedPermissions.includes(perm.code);

                            return (
                              <div
                                key={perm.code}
                                onClick={() => togglePermission(perm.code)}
                                className={`p-2.5 rounded-xl border transition flex items-start gap-2.5 cursor-pointer select-none ${
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
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span
                                      className={`text-xs font-bold truncate ${
                                        isChecked ? 'text-slate-900' : 'text-slate-700'
                                      }`}
                                    >
                                      {perm.name}
                                    </span>

                                    {perm.riskLevel === 'high' ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
                                        High Risk
                                      </span>
                                    ) : perm.riskLevel === 'medium' ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                        Manage
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                        View
                                      </span>
                                    )}
                                  </div>

                                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                    {perm.description}
                                  </p>

                                  <div className="mt-1">
                                    <span className="font-mono text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
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
            </div>
          )}

          {/* Sticky Pinned Footer */}
          <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 z-10">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>
                Role: <strong className="text-slate-800 font-bold">{selectedRole}</strong> ({grantedCount} permissions active).
              </span>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                id="btn-cancel-user-modal"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 rounded-xl font-semibold text-slate-600 hover:bg-white text-xs cursor-pointer shadow-2xs transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="btn-save-operator"
                disabled={isSaving}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {isSaving
                    ? 'Saving...'
                    : user
                    ? 'Update Operator'
                    : 'Create Operator'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
