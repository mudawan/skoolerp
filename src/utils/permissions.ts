import { PermissionDefinition, UserRole } from '../types';

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  { id: 'dashboard.view', code: 'dashboard.view', name: 'View Dashboard', description: 'Access main KPI analytics and financial metrics', category: 'dashboard', categoryLabel: 'Dashboard' },
  { id: 'students.view', code: 'students.view', name: 'View Students', description: 'Browse and search student directory', category: 'students', categoryLabel: 'Students' },
  { id: 'students.manage', code: 'students.manage', name: 'Manage Students', description: 'Create and edit student profiles', category: 'students', categoryLabel: 'Students' },
  { id: 'students.delete', code: 'students.delete', name: 'Delete Students', description: 'Permanently remove student profiles', category: 'students', categoryLabel: 'Students', riskLevel: 'high' },
  { id: 'families.view', code: 'families.view', name: 'View Families', description: 'View family rosters and sibling groupings', category: 'families', categoryLabel: 'Families' },
  { id: 'families.manage', code: 'families.manage', name: 'Manage Families', description: 'Create and update family groupings', category: 'families', categoryLabel: 'Families' },
  { id: 'families.delete', code: 'families.delete', name: 'Delete Families', description: 'Remove family records', category: 'families', categoryLabel: 'Families', riskLevel: 'high' },
  { id: 'classes.view', code: 'classes.view', name: 'View Classes', description: 'View class rosters and standard tuition fees', category: 'classes', categoryLabel: 'Classes' },
  { id: 'classes.manage', code: 'classes.manage', name: 'Manage Classes', description: 'Create and update classes and fees', category: 'classes', categoryLabel: 'Classes' },
  { id: 'classes.delete', code: 'classes.delete', name: 'Delete Classes', description: 'Remove class records', category: 'classes', categoryLabel: 'Classes', riskLevel: 'high' },
  { id: 'fees.view', code: 'fees.view', name: 'View Fee Vouchers', description: 'View fee vouchers and collection records', category: 'fees', categoryLabel: 'Fee Vouchers' },
  { id: 'fees.generate', code: 'fees.generate', name: 'Generate Fee Vouchers', description: 'Batch generate monthly student fee vouchers', category: 'fees', categoryLabel: 'Fee Vouchers' },
  { id: 'fees.collect', code: 'fees.collect', name: 'Collect Fee Payments', description: 'Record voucher payments and print receipts', category: 'fees', categoryLabel: 'Fee Collections' },
  { id: 'fees.delete', code: 'fees.delete', name: 'Delete Fee Vouchers', description: 'Delete or reverse issued fee vouchers', category: 'fees', categoryLabel: 'Fee Vouchers', riskLevel: 'high' },
  { id: 'defaulters.view', code: 'defaulters.view', name: 'View Defaulters', description: 'Access unpaid defaulter rosters and aging lists', category: 'defaulters', categoryLabel: 'Defaulters' },
  { id: 'defaulters.manage', code: 'defaulters.manage', name: 'Manage Defaulters & Arrears', description: 'Carry forward arrears and apply late fines', category: 'defaulters', categoryLabel: 'Defaulters' },
  { id: 'transport.view', code: 'transport.view', name: 'View Transport', description: 'View buses, routes, stops, and assignments', category: 'transport', categoryLabel: 'Transport' },
  { id: 'transport.manage', code: 'transport.manage', name: 'Manage Transport', description: 'Configure buses, stops, and student transport', category: 'transport', categoryLabel: 'Transport' },
  { id: 'transport.delete', code: 'transport.delete', name: 'Delete Transport', description: 'Remove buses and stops', category: 'transport', categoryLabel: 'Transport', riskLevel: 'high' },
  { id: 'reports.view', code: 'reports.view', name: 'View Reports', description: 'Access student fee ledgers and financial audits', category: 'reports', categoryLabel: 'Reports' },
  { id: 'audit.view', code: 'audit.view', name: 'View Audit Trail', description: 'Inspect system-wide security and mutation logs', category: 'system', categoryLabel: 'Audit & System' },
  { id: 'settings.view', code: 'settings.view', name: 'View Settings', description: 'View institution rules, bank accounts, and policies', category: 'settings', categoryLabel: 'Settings' },
  { id: 'settings.manage', code: 'settings.manage', name: 'Manage Settings', description: 'Modify billing policies, fee rules, and bank accounts', category: 'settings', categoryLabel: 'Settings' },
  { id: 'users.manage', code: 'users.manage', name: 'Manage Users', description: 'Invite operators and configure role permissions', category: 'users', categoryLabel: 'Users', riskLevel: 'high' },
  { id: 'system.backup', code: 'system.backup', name: 'System Backup & Restore', description: 'Export and restore institution database snapshots', category: 'system', categoryLabel: 'Audit & System', riskLevel: 'high' },
];

export const ALL_PERMISSION_CODES: string[] = ALL_PERMISSIONS.map((p) => p.code);

export const ROLE_PRESET_PERMISSIONS: Record<UserRole, string[]> = {
  Admin: ALL_PERMISSION_CODES,
  Accountant: [
    'dashboard.view',
    'students.view',
    'families.view',
    'classes.view',
    'fees.view',
    'fees.generate',
    'fees.collect',
    'defaulters.view',
    'defaulters.manage',
    'transport.view',
    'reports.view',
    'settings.view',
  ],
  Viewer: [
    'dashboard.view',
    'students.view',
    'families.view',
    'classes.view',
    'fees.view',
    'transport.view',
    'reports.view',
  ],
  Custom: [],
};

export function isPermissionAllowed(
  userRole: UserRole | string,
  userPermissions: string[] | undefined,
  requiredPermission?: string
): boolean {
  if (!requiredPermission) return true;
  if (userRole === 'Admin') return true;
  const list = userPermissions || ROLE_PRESET_PERMISSIONS[userRole as UserRole] || [];
  return list.includes(requiredPermission);
}

export function getEffectiveRole(user: any): UserRole {
  return (user?.role as UserRole) || 'Viewer';
}

export const SPECIALTY_PRESETS: Record<string, { label: string; permissions: string[] }> = {
  fee_operator: {
    label: 'Fee Operator',
    permissions: ['fees.view', 'fees.generate', 'fees.collect'],
  },
  transport_manager: {
    label: 'Transport Manager',
    permissions: ['transport.view', 'transport.manage'],
  },
};


