import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { User, UserRole } from '../../types';
import { ALL_PERMISSIONS } from '../../utils/permissions';
import {
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Shield,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

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
  const {
    users,
    currentUser,
    currentInstitution,
    institute,
    invites,
    createInvite,
    refreshInvites,
    hasPermission,
    showToast,
  } = useApp();

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteRole, setInviteRole] = useState<'Accountant' | 'Viewer' | 'Admin'>('Accountant');
  const [customInviteCode, setCustomInviteCode] = useState('');
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // User management requires users.manage specifically; settings.manage is a
  // separate, lower-stakes permission and must not imply it.
  const canManageUsers =
    currentUser?.role === 'Admin' ||
    hasPermission('users.manage');

  const activeSchoolName = currentInstitution?.name || institute.name || 'School Workspace';
  const activeSchoolCode = currentInstitution?.code || institute.code || 'SYS';

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteFullName.trim()) return;

    setIsCreatingInvite(true);
    const res = await createInvite({
      fullName: inviteFullName.trim(),
      assignedRole: inviteRole,
      inviteCode: customInviteCode.trim() || undefined,
    });
    setIsCreatingInvite(false);

    if (res.success && res.invite) {
      setCreatedInviteCode(res.invite.invite_code);
      showToast(`Invite code ${res.invite.invite_code} generated for ${res.invite.full_name}`, 'success');
      await refreshInvites();
    } else {
      showToast(res.error || 'Failed to generate staff invite.', 'error');
    }
  };

  const copyInviteInstructions = (inviteCode: string, name: string, role: string) => {
    const text = `School Portal Activation for ${name}:
You have been granted access as "${role}" in workspace "${activeSchoolName}" (Code: ${activeSchoolCode}).
To activate your account:
1. Open the School Fee Portal sign-in screen.
2. Select "Connect to Existing School".
3. Enter Invite Code: ${inviteCode}
4. Create your username and password to log in.`;

    navigator.clipboard.writeText(text);
    setCopiedInviteId(inviteCode);
    showToast(`Activation instructions for ${name} copied to clipboard!`, 'success');
    setTimeout(() => setCopiedInviteId(null), 3000);
  };

  // User list sorting
  type UserSortField = 'name' | 'role' | 'email' | 'permissions' | 'status';
  const [userSortField, setUserSortField] = useState<UserSortField>('name');
  const [userSortDir, setUserSortDir] = useState<'asc' | 'desc'>('asc');

  const handleUserSort = (field: UserSortField) => {
    if (userSortField === field) {
      setUserSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setUserSortField(field);
      setUserSortDir('asc');
    }
  };

  const renderUserSortIcon = (field: UserSortField) => {
    if (userSortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition shrink-0" />;
    }
    return userSortDir === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-teal-700 shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-teal-700 shrink-0 font-bold" />
    );
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      let cmp = 0;
      switch (userSortField) {
        case 'name':
          cmp = (a.name || '').localeCompare(b.name || '');
          break;
        case 'role':
          cmp = (a.role || '').localeCompare(b.role || '');
          break;
        case 'email':
          cmp = (a.email || '').localeCompare(b.email || '');
          break;
        case 'permissions': {
          const permsA = Array.isArray(a.permissions) ? a.permissions.length : 0;
          const permsB = Array.isArray(b.permissions) ? b.permissions.length : 0;
          cmp = permsA - permsB;
          break;
        }
        case 'status': {
          const statusA = a.isActive !== false ? 1 : 0;
          const statusB = b.isActive !== false ? 1 : 0;
          cmp = statusA - statusB;
          break;
        }
      }
      return userSortDir === 'asc' ? cmp : -cmp;
    });
  }, [users, userSortField, userSortDir]);

  // Invites sorting
  type InviteSortField = 'name' | 'role' | 'code' | 'expires' | 'status';
  const [inviteSortField, setInviteSortField] = useState<InviteSortField>('expires');
  const [inviteSortDir, setInviteSortDir] = useState<'asc' | 'desc'>('desc');

  const handleInviteSort = (field: InviteSortField) => {
    if (inviteSortField === field) {
      setInviteSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setInviteSortField(field);
      setInviteSortDir('asc');
    }
  };

  const renderInviteSortIcon = (field: InviteSortField) => {
    if (inviteSortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition shrink-0" />;
    }
    return inviteSortDir === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-teal-700 shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-teal-700 shrink-0 font-bold" />
    );
  };

  const sortedInvites = useMemo(() => {
    return [...invites].sort((a, b) => {
      let cmp = 0;
      switch (inviteSortField) {
        case 'name':
          cmp = (a.full_name || '').localeCompare(b.full_name || '');
          break;
        case 'role':
          cmp = (a.assigned_role || '').localeCompare(b.assigned_role || '');
          break;
        case 'code':
          cmp = (a.invite_code || '').localeCompare(b.invite_code || '');
          break;
        case 'expires':
          cmp = (a.expires_at || '').localeCompare(b.expires_at || '');
          break;
        case 'status':
          cmp = (a.status || '').localeCompare(b.status || '');
          break;
      }
      return inviteSortDir === 'asc' ? cmp : -cmp;
    });
  }, [invites, inviteSortField, inviteSortDir]);

  return (
    <div className="space-y-6">
      {/* Workspace Institution Header Badge */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 rounded-2xl border border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-teal-600/30 border border-teal-500/50 flex items-center justify-center text-teal-300">
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
              Multi-Tenant Institution Workspace &bull; Managed by{' '}
              <span className="text-slate-200 font-semibold">{currentUser.name}</span> ({currentUser.role})
            </p>
          </div>
        </div>

        {canManageUsers && (
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              id="btn-create-staff-invite"
              onClick={() => {
                setCreatedInviteCode(null);
                setInviteFullName('');
                setCustomInviteCode('');
                setInviteRole('Accountant');
                setIsInviteModalOpen(true);
              }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Invite Staff Member</span>
            </button>
            <button
              type="button"
              id="btn-add-system-user"
              onClick={() => handleOpenUserModal()}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Operator Account</span>
            </button>
          </div>
        )}
      </div>

      {/* Section 1: Active Operators Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-600" />
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Active Authorized Operators ({users.length})
            </h4>
          </div>
          <span className="text-[11px] text-slate-500">
            Current system accounts with active portal credentials
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider select-none">
              <tr>
                <th
                  onClick={() => handleUserSort('name')}
                  className="p-3 cursor-pointer hover:bg-slate-100/80 transition group whitespace-nowrap"
                  title="Click to sort by User & Username"
                >
                  <div className="flex items-center gap-1">
                    <span>User & Username</span>
                    {renderUserSortIcon('name')}
                  </div>
                </th>
                <th
                  onClick={() => handleUserSort('role')}
                  className="p-3 cursor-pointer hover:bg-slate-100/80 transition group whitespace-nowrap"
                  title="Click to sort by Role"
                >
                  <div className="flex items-center gap-1">
                    <span>Role</span>
                    {renderUserSortIcon('role')}
                  </div>
                </th>
                <th
                  onClick={() => handleUserSort('email')}
                  className="p-3 cursor-pointer hover:bg-slate-100/80 transition group whitespace-nowrap"
                  title="Click to sort by Email Address"
                >
                  <div className="flex items-center gap-1">
                    <span>Email Address</span>
                    {renderUserSortIcon('email')}
                  </div>
                </th>
                <th
                  onClick={() => handleUserSort('permissions')}
                  className="p-3 cursor-pointer hover:bg-slate-100/80 transition group whitespace-nowrap"
                  title="Click to sort by Permissions Scope"
                >
                  <div className="flex items-center gap-1">
                    <span>Permissions Scope</span>
                    {renderUserSortIcon('permissions')}
                  </div>
                </th>
                <th
                  onClick={() => handleUserSort('status')}
                  className="p-3 cursor-pointer hover:bg-slate-100/80 transition group whitespace-nowrap"
                  title="Click to sort by Active Status"
                >
                  <div className="flex items-center gap-1">
                    <span>Active Status</span>
                    {renderUserSortIcon('status')}
                  </div>
                </th>
                <th className="p-3 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedUsers.map((u) => {
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

      {/* Section 2: Staff Invites & Activation Codes */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-600" />
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Staff Invites & Activation Codes ({invites.length})
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshInvites()}
              className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium transition cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh Invites</span>
            </button>
          </div>
        </div>

        {invites.length === 0 ? (
          <div className="p-8 text-center text-slate-500 space-y-2">
            <UserPlus className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-medium">No pending staff invites.</p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Click &ldquo;Invite Staff Member&rdquo; above to generate an activation code for an Accountant, Viewer, or Staff Operator.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider select-none">
                <tr>
                  <th
                    onClick={() => handleInviteSort('name')}
                    className="p-3 cursor-pointer hover:bg-slate-100/80 transition group whitespace-nowrap"
                    title="Click to sort by Staff Name"
                  >
                    <div className="flex items-center gap-1">
                      <span>Staff Name</span>
                      {renderInviteSortIcon('name')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleInviteSort('role')}
                    className="p-3 cursor-pointer hover:bg-slate-100/80 transition group whitespace-nowrap"
                    title="Click to sort by Assigned Role"
                  >
                    <div className="flex items-center gap-1">
                      <span>Assigned Role</span>
                      {renderInviteSortIcon('role')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleInviteSort('code')}
                    className="p-3 cursor-pointer hover:bg-slate-100/80 transition group whitespace-nowrap"
                    title="Click to sort by Invite Code"
                  >
                    <div className="flex items-center gap-1">
                      <span>Invite Code</span>
                      {renderInviteSortIcon('code')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleInviteSort('expires')}
                    className="p-3 cursor-pointer hover:bg-slate-100/80 transition group whitespace-nowrap"
                    title="Click to sort by Expiration Date"
                  >
                    <div className="flex items-center gap-1">
                      <span>Expires</span>
                      {renderInviteSortIcon('expires')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleInviteSort('status')}
                    className="p-3 cursor-pointer hover:bg-slate-100/80 transition group whitespace-nowrap"
                    title="Click to sort by Status"
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      {renderInviteSortIcon('status')}
                    </div>
                  </th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedInvites.map((inv) => {
                  const isClaimed = inv.status === 'claimed';
                  const isPending = inv.status === 'pending';
                  const isCopied = copiedInviteId === inv.invite_code;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-semibold text-slate-900">
                        {inv.full_name}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                          {inv.assigned_role}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-mono font-bold text-xs bg-slate-100 px-2.5 py-1 rounded-md text-slate-800 border border-slate-200 tracking-wider">
                          {inv.invite_code}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">
                        {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '14 Days'}
                      </td>
                      <td className="p-3">
                        {isClaimed ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Claimed</span>
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            <Clock className="w-3 h-3" />
                            <span>Pending</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            <span>Expired</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => copyInviteInstructions(inv.invite_code, inv.full_name, inv.assigned_role)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                            isCopied
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isCopied ? 'Copied' : 'Copy Instructions'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff Invite Generation Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600/30 border border-indigo-400/40 text-indigo-300">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Invite Staff Member</h3>
                  <p className="text-xs text-indigo-200">
                    Workspace: {activeSchoolName} ({activeSchoolCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdInviteCode ? (
              <div className="p-6 space-y-4 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Invite Created Successfully!</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Provide this activation code to <strong>{inviteFullName}</strong> to join as <strong>{inviteRole}</strong>.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Activation Invite Code
                  </span>
                  <div className="font-mono text-xl font-extrabold text-indigo-700 tracking-wider">
                    {createdInviteCode}
                  </div>
                </div>

                <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-left text-xs text-indigo-950 space-y-1">
                  <span className="font-bold block">Next Step for Admin:</span>
                  <p className="text-indigo-800 text-[11px]">
                    Notify <strong>{inviteFullName}</strong> with this code. They should click <em>&ldquo;Connect to Existing School&rdquo;</em> on the login screen to complete their registration.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => copyInviteInstructions(createdInviteCode, inviteFullName, inviteRole)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Instructions</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Staff Member Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jordan Lee (Accountant)"
                    value={inviteFullName}
                    onChange={(e) => setInviteFullName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Assigned Role <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Accountant">Accountant (Billing, Collections, Defaulters, Reports)</option>
                    <option value="Viewer">Viewer (Read-Only access to records and reports)</option>
                    <option value="Admin">Administrator (Full institution administration access)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Custom Invite Code</span>
                    <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Leave blank to auto-generate (e.g. INV-7K4QF-M2XHD)"
                    value={customInviteCode}
                    onChange={(e) => setCustomInviteCode(e.target.value.toUpperCase())}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase font-mono"
                  />
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
                  Invites remain valid for 14 days. Once the user joins, their role and permissions will be applied automatically.
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingInvite || !inviteFullName.trim()}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isCreatingInvite ? 'Generating...' : 'Generate Invite Code'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
