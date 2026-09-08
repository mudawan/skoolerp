import React from 'react';
import { useApp } from '../../context/AppContext';
import { User } from '../../types';
import { ALL_PERMISSIONS } from '../../utils/permissions';
import { Edit2, KeyRound, Plus, Shield, Trash2, Users } from 'lucide-react';

export interface UsersPanelProps {
  handleOpenUserModal: (user?: User, initialTab?: 'profile' | 'permissions') => void;
  handleOpenPermissionsModal: (user: User) => void;
  handleDeleteUser: (id: string, name: string) => void;
}

export const UsersPanel: React.FC<UsersPanelProps> = ({
  handleOpenUserModal,
  handleOpenPermissionsModal,
  handleDeleteUser,
}) => {
  const { users, currentUser, hasPermission } = useApp();
  const canManageUsers =
    currentUser?.role === 'Admin' ||
    hasPermission('users.manage') ||
    hasPermission('settings.manage');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-600" />
            Authorized System Operators & Passwords
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage accounts, assign roles (Admin, Accountant, Viewer, Custom), and configure granular module permissions.
          </p>
        </div>
        {canManageUsers && (
          <button
            type="button"
            id="btn-add-system-user"
            onClick={() => handleOpenUserModal()}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Add System User
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="p-3">User & Username</th>
                <th className="p-3">Role</th>
                <th className="p-3">Email Address</th>
                <th className="p-3">Permissions Scope</th>
                <th className="p-3">Active Status</th>
                <th className="p-3 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelf = currentUser.id === u.id;
                const isOnlyUser = users.length <= 1;
                const roleBadgeClass =
                  u.role === 'Admin'
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : u.role === 'Accountant'
                    ? 'bg-teal-100 text-teal-800 border-teal-200'
                    : u.role === 'Viewer'
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200';

                const userPerms = Array.isArray(u.permissions) ? u.permissions : [];
                const permCount = userPerms.length;
                const totalPerms = ALL_PERMISSIONS.length;
                const isFullAccess = u.role === 'Admin' || permCount === totalPerms;

                // Module access tags
                const activeModules: string[] = [];
                if (userPerms.some((p) => p.startsWith('students.'))) activeModules.push('Students');
                if (userPerms.some((p) => p.startsWith('families.'))) activeModules.push('Families');
                if (userPerms.some((p) => p.startsWith('classes.'))) activeModules.push('Classes');
                if (userPerms.some((p) => p.startsWith('fees.view') || p.startsWith('fees.generate') || p.startsWith('fees.edit'))) activeModules.push('Billing');
                if (userPerms.some((p) => p.startsWith('fees.collect') || p.startsWith('fees.reverse'))) activeModules.push('Collections');
                if (userPerms.some((p) => p.startsWith('defaulters.'))) activeModules.push('Defaulters');
                if (userPerms.some((p) => p.startsWith('transport.'))) activeModules.push('Transport');
                if (userPerms.some((p) => p.startsWith('fees.report'))) activeModules.push('Reports');
                if (userPerms.some((p) => p.startsWith('settings.'))) activeModules.push('Settings');
                if (userPerms.some((p) => p.startsWith('users.'))) activeModules.push('User Admin');

                // Delete availability & tooltip
                const canDeleteThisUser = canManageUsers && !isSelf && !isOnlyUser;
                let deleteTooltip = `Delete Operator Account (${u.name})`;
                if (!canManageUsers) {
                  deleteTooltip = 'Delete Operator (Permission Required)';
                } else if (isSelf) {
                  deleteTooltip = 'Cannot delete your own active session account';
                } else if (isOnlyUser) {
                  deleteTooltip = 'Cannot delete the only system operator account';
                }

                return (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-teal-400 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                          {u.name.substring(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {u.name}
                            {isSelf && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-md">
                                Current Session
                              </span>
                            )}
                          </div>
                          <span className="text-slate-500 font-mono text-[11px]">@{u.username}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${roleBadgeClass}`}
                      >
                        <Shield className="w-3 h-3" />
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 font-medium">
                      {u.email || <span className="text-slate-400 italic">Not specified</span>}
                    </td>
                    <td className="p-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 font-bold text-[11px] px-2 py-0.5 rounded-md border ${
                              isFullAccess
                                ? 'bg-amber-50 text-amber-900 border-amber-200'
                                : permCount > 0
                                ? 'bg-teal-50 text-teal-800 border-teal-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}
                          >
                            <KeyRound className="w-3 h-3 text-teal-600" />
                            {isFullAccess
                              ? `Full Access (${totalPerms}/${totalPerms})`
                              : `${permCount} of ${totalPerms} permissions`}
                          </span>
                          {u.role === 'Custom' && (
                            <span className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-1.5 py-0.2 rounded border border-slate-200">
                              Customized
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {activeModules.slice(0, 5).map((mod) => (
                            <span
                              key={mod}
                              className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200/80"
                            >
                              {mod}
                            </span>
                          ))}
                          {activeModules.length > 5 && (
                            <span className="text-[10px] text-slate-400 font-semibold">
                              +{activeModules.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 text-emerald-600 font-medium text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Active
                      </div>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        {/* Permissions Icon Button */}
                        <button
                          type="button"
                          id={`btn-perms-user-${u.id}`}
                          disabled={!canManageUsers}
                          onClick={() => canManageUsers && handleOpenPermissionsModal(u)}
                          title={
                            canManageUsers
                              ? `Configure Granular Permissions for ${u.name}`
                              : 'Configure Granular Permissions (Permission Required)'
                          }
                          className={`p-1.5 rounded-lg transition ${
                            canManageUsers
                              ? 'text-slate-500 hover:text-teal-700 hover:bg-teal-50 cursor-pointer'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Operator & Password Icon Button */}
                        <button
                          type="button"
                          id={`btn-edit-user-${u.id}`}
                          disabled={!canManageUsers}
                          onClick={() => canManageUsers && handleOpenUserModal(u)}
                          title={
                            canManageUsers
                              ? `Edit Operator Account & Password for ${u.name}`
                              : 'Edit Operator Account & Password (Permission Required)'
                          }
                          className={`p-1.5 rounded-lg transition ${
                            canManageUsers
                              ? 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Operator Icon Button */}
                        <button
                          type="button"
                          id={`btn-delete-user-${u.id}`}
                          disabled={!canDeleteThisUser}
                          onClick={() => canDeleteThisUser && handleDeleteUser(u.id, u.name)}
                          title={deleteTooltip}
                          className={`p-1.5 rounded-lg transition ${
                            canDeleteThisUser
                              ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

