import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { ALL_PERMISSIONS, ROLE_PRESET_PERMISSIONS } from '../utils/permissions';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { X, Shield, User as UserIcon, Check } from 'lucide-react';

export interface UserModalSaveData {
  id?: string;
  username?: string;
  name: string;
  email?: string;
  role: UserRole;
  permissions: string[];
  password?: string;
}

export interface UserModalProps {
  isOpen: boolean;
  user: User | null;
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
  useEscapeKey(onClose, isOpen);

  const [activeTab, setActiveTab] = useState<'profile' | 'permissions'>(initialTab);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('Accountant');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setUsername(user.username || '');
      setEmail(user.email || '');
      setRole(user.role || 'Accountant');
      setPermissions(Array.isArray(user.permissions) ? user.permissions : []);
    } else {
      setName('');
      setUsername('');
      setEmail('');
      setPassword('');
      setRole('Accountant');
      setPermissions(ROLE_PRESET_PERMISSIONS.Accountant || []);
    }
    setActiveTab(initialTab);
  }, [user, initialTab, isOpen]);

  if (!isOpen) return null;

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    if (newRole !== 'Custom') {
      setPermissions(ROLE_PRESET_PERMISSIONS[newRole] || []);
    }
  };

  const togglePermission = (code: string) => {
    setPermissions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
    setRole('Custom');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        id: user?.id,
        name,
        username,
        email,
        role,
        permissions,
        password: password ? password : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {user ? `Edit Operator: ${user.name}` : 'Create New Operator'}
              </h3>
              <p className="text-[11px] text-slate-500">Configure operator account and permissions</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 px-4 bg-slate-50/30">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`py-2 px-3 text-xs font-bold border-b-2 transition ${
              activeTab === 'profile'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Profile & Role
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={`py-2 px-3 text-xs font-bold border-b-2 transition ${
              activeTab === 'permissions'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Permissions ({permissions.length})
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {activeTab === 'profile' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Username *</label>
                <input
                  type="text"
                  required
                  disabled={!!user}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
                  placeholder="e.g. jdoe"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500"
                  placeholder="optional email"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {user ? 'New Password (leave blank to keep current)' : 'Password *'}
                </label>
                <input
                  type="password"
                  required={!user}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500"
                  placeholder={user ? '••••••••' : 'Minimum 6 characters'}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Admin', 'Accountant', 'Viewer', 'Custom'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRoleChange(r)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition text-left cursor-pointer ${
                        role === r
                          ? 'border-teal-600 bg-teal-50 text-teal-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {ALL_PERMISSIONS.map((p) => {
                const checked = role === 'Admin' || permissions.includes(p.code);
                return (
                  <label
                    key={p.code}
                    className={`flex items-start gap-2.5 p-2 rounded-xl border transition cursor-pointer ${
                      checked
                        ? 'bg-teal-50/50 border-teal-200'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={role === 'Admin'}
                      checked={checked}
                      onChange={() => togglePermission(p.code)}
                      className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">{p.name}</div>
                      <div className="text-[10px] text-slate-500">{p.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

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
              disabled={saving}
              className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Operator'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
