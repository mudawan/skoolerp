import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { User, UserRole } from '../../types';
import { Users, Plus, Shield, Trash2, Edit2, KeyRound } from 'lucide-react';

export interface UsersPanelProps {
  handleOpenUserModal: (user?: User) => void;
  handleOpenPermissionsModal: (user: User) => void;
  handleDeleteUser?: (user: User) => void;
}

export const UsersPanel: React.FC<UsersPanelProps> = ({
  handleOpenUserModal,
  handleOpenPermissionsModal,
  handleDeleteUser,
}) => {
  const { users, currentUser } = useApp();

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Operator Accounts & RBAC Roles</h3>
            <p className="text-xs text-slate-500">Manage administrator and operator accounts with granular permissions</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleOpenUserModal()}
          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Operator
        </button>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
            <tr>
              <th className="p-3">Operator Name</th>
              <th className="p-3">Username</th>
              <th className="p-3">Role</th>
              <th className="p-3">Permissions</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const isSelf = currentUser?.id === u.id;
              return (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-slate-900">
                    {u.name}
                    {isSelf && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-teal-100 text-teal-800">
                        You
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-slate-600">@{u.username}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full font-bold text-[11px] bg-slate-100 text-slate-800 border border-slate-200">
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 text-[11px]">
                    {u.role === 'Admin' ? 'Full Access' : `${(u.permissions || []).length} permissions`}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleOpenPermissionsModal(u)}
                        title="Permissions Matrix"
                        className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-teal-700 transition"
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenUserModal(u)}
                        title="Edit Account"
                        className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {handleDeleteUser && !isSelf && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          title="Delete Account"
                          className="p-1 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
