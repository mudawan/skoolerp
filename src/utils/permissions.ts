import { PermissionDefinition, PermissionCategoryInfo, UserRole } from '../types';

export const PERMISSION_CATEGORIES: PermissionCategoryInfo[] = [
  {
    id: 'dashboard',
    label: 'Dashboard & KPIs',
    description: 'Financial overview, collection velocity, and monthly status',
  },
  {
    id: 'students',
    label: 'Students Management',
    description: 'Student directory, admissions, student records, and grade promotions',
  },
  {
    id: 'families',
    label: 'Families & Siblings',
    description: 'Family units, sibling linkages, and guardian contact records',
  },
  {
    id: 'classes',
    label: 'Classes & Curriculum',
    description: 'Academic grades, default tuition rates, and class priority sorting',
  },
  {
    id: 'fees',
    label: 'Fee Vouchers & Billing',
    description: 'Voucher generation, itemized particulars editor, and voucher cancellations',
  },
  {
    id: 'collections',
    label: 'Collections & Receipts',
    description: 'Payment collection, cash/bank receipts, and transaction reversals',
  },
  {
    id: 'defaulters',
    label: 'Defaulters & Month Close',
    description: 'Overdue aging analysis, arrears carry-forward, and late fee penalties',
  },
  {
    id: 'transport',
    label: 'Transport Fleet',
    description: 'Buses, drivers, route stops, fare rates, and student passenger allocations',
  },
  {
    id: 'reports',
    label: 'Financial Reports',
    description: 'Class matrix registers, outstanding arrears summaries, and student fee ledgers',
  },
  {
    id: 'settings',
    label: 'System Settings & Policies',
    description: 'Institute profile, bank accounts, voucher policies, and fee templates',
  },
  {
    id: 'users',
    label: 'User Management & Security',
    description: 'Operator accounts, credentials, and granular security permission assignments',
  },
  {
    id: 'system',
    label: 'Database Maintenance',
    description: 'Table cleanup, database resets, and factory baseline purges',
  },
];

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  // 1. Dashboard
  {
    id: 'dashboard.view',
    code: 'dashboard.view',
    name: 'View Financial Dashboard',
    description: 'Access real-time collection metrics, KPI summary cards, and monthly financial health.',
    category: 'dashboard',
    categoryLabel: 'Dashboard & KPIs',
    riskLevel: 'low',
  },

  // 2. Students
  {
    id: 'students.view',
    code: 'students.view',
    name: 'View Students Directory',
    description: 'Browse student roster, search records, filter by class/status, and view profile details.',
    category: 'students',
    categoryLabel: 'Students Management',
    riskLevel: 'low',
  },
  {
    id: 'students.manage',
    code: 'students.manage',
    name: 'Create & Edit Students',
    description: 'Register admissions, edit particulars, link families, and assign custom fee discounts.',
    category: 'students',
    categoryLabel: 'Students Management',
    riskLevel: 'medium',
  },
  {
    id: 'students.promote',
    code: 'students.promote',
    name: 'Promote & Transition Classes',
    description: 'Execute batch class promotions, grade migrations, and academic year rollover.',
    category: 'students',
    categoryLabel: 'Students Management',
    riskLevel: 'medium',
  },
  {
    id: 'students.delete',
    code: 'students.delete',
    name: 'Delete Student Records',
    description: 'Permanently delete student profiles (subject to voucher history checks).',
    category: 'students',
    categoryLabel: 'Students Management',
    riskLevel: 'high',
  },

  // 3. Families
  {
    id: 'families.view',
    code: 'families.view',
    name: 'View Families Directory',
    description: 'Inspect family units, linked sibling trees, and primary guardian details.',
    category: 'families',
    categoryLabel: 'Families & Siblings',
    riskLevel: 'low',
  },
  {
    id: 'families.manage',
    code: 'families.manage',
    name: 'Create & Manage Families',
    description: 'Create family units, link or unlink siblings, and update guardian contacts.',
    category: 'families',
    categoryLabel: 'Families & Siblings',
    riskLevel: 'medium',
  },
  {
    id: 'families.delete',
    code: 'families.delete',
    name: 'Delete Family Units',
    description: 'Disband family units and unlink registered siblings.',
    category: 'families',
    categoryLabel: 'Families & Siblings',
    riskLevel: 'medium',
  },

  // 4. Classes
  {
    id: 'classes.view',
    code: 'classes.view',
    name: 'View Classes Directory',
    description: 'Inspect school classes, sections, and student headcount statistics.',
    category: 'classes',
    categoryLabel: 'Classes & Curriculum',
    riskLevel: 'low',
  },
  {
    id: 'classes.manage',
    code: 'classes.manage',
    name: 'Create & Manage Classes',
    description: 'Add new grades, modify standard monthly tuition rates, and reorder curriculum priority.',
    category: 'classes',
    categoryLabel: 'Classes & Curriculum',
    riskLevel: 'medium',
  },
  {
    id: 'classes.delete',
    code: 'classes.delete',
    name: 'Delete Classes',
    description: 'Remove empty classes that currently have zero enrolled students.',
    category: 'classes',
    categoryLabel: 'Classes & Curriculum',
    riskLevel: 'high',
  },

  // 5. Fee Vouchers & Billing
  {
    id: 'fees.view',
    code: 'fees.view',
    name: 'View Fee Vouchers',
    description: 'Access monthly voucher registers, filter by class/status, and preview voucher documents.',
    category: 'fees',
    categoryLabel: 'Fee Vouchers & Billing',
    riskLevel: 'low',
  },
  {
    id: 'fees.generate',
    code: 'fees.generate',
    name: 'Generate & Issue Vouchers',
    description: 'Run bulk monthly voucher generation and calculate standard fee charges.',
    category: 'fees',
    categoryLabel: 'Fee Vouchers & Billing',
    riskLevel: 'medium',
  },
  {
    id: 'fees.edit',
    code: 'fees.edit',
    name: 'Edit Voucher Particulars',
    description: 'Customize fee heads, adjust concession discounts, and modify payment due dates.',
    category: 'fees',
    categoryLabel: 'Fee Vouchers & Billing',
    riskLevel: 'medium',
  },
  {
    id: 'fees.delete',
    code: 'fees.delete',
    name: 'Delete & Cancel Vouchers',
    description: 'Permanently delete unpaid fee vouchers (governed by deletion resolution rules).',
    category: 'fees',
    categoryLabel: 'Fee Vouchers & Billing',
    riskLevel: 'high',
  },

  // 6. Collections & Receipts
  {
    id: 'fees.collect',
    code: 'fees.collect',
    name: 'Collect & Deposit Fees',
    description: 'Record fee payments, issue collection receipts, and accept partial deposits.',
    category: 'collections',
    categoryLabel: 'Collections & Receipts',
    riskLevel: 'medium',
  },
  {
    id: 'fees.reverse',
    code: 'fees.reverse',
    name: 'Reverse & Void Receipts',
    description: 'Void payment transactions, reverse deposited receipts, and restore unpaid balances.',
    category: 'collections',
    categoryLabel: 'Collections & Receipts',
    riskLevel: 'high',
  },

  // 7. Defaulters & Month Close
  {
    id: 'defaulters.view',
    code: 'defaulters.view',
    name: 'View Defaulters & Arrears',
    description: 'Access overdue fee registers, defaulters aging analysis, and unpaid balances.',
    category: 'defaulters',
    categoryLabel: 'Defaulters & Month Close',
    riskLevel: 'low',
  },
  {
    id: 'defaulters.manage',
    code: 'defaulters.manage',
    name: 'Carry-Forward & Month Close',
    description: 'Roll unpaid arrears into subsequent months, apply late fee penalties, and finalize months.',
    category: 'defaulters',
    categoryLabel: 'Defaulters & Month Close',
    riskLevel: 'medium',
  },

  // 8. Transport Fleet
  {
    id: 'transport.view',
    code: 'transport.view',
    name: 'View Transport Fleet',
    description: 'Access bus routes, stop locations, vehicles, and student passenger rosters.',
    category: 'transport',
    categoryLabel: 'Transport Fleet',
    riskLevel: 'low',
  },
  {
    id: 'transport.manage',
    code: 'transport.manage',
    name: 'Manage Fleet, Routes & Stops',
    description: 'Add buses, configure route stops, assign student riders, and set fare rates.',
    category: 'transport',
    categoryLabel: 'Transport Fleet',
    riskLevel: 'medium',
  },
  {
    id: 'transport.delete',
    code: 'transport.delete',
    name: 'Delete Transport Entities',
    description: 'Remove buses, route stops, and transport rosters.',
    category: 'transport',
    categoryLabel: 'Transport Fleet',
    riskLevel: 'high',
  },

  // 9. Financial Reports
  {
    id: 'fees.report',
    code: 'fees.report',
    name: 'View & Export Financial Reports',
    description: 'Generate Class Matrices, Defaulters summaries, and detailed Student Fee Ledgers.',
    category: 'reports',
    categoryLabel: 'Financial Reports',
    riskLevel: 'low',
  },

  // 10. System Settings & Policies
  {
    id: 'settings.view',
    code: 'settings.view',
    name: 'View System Settings',
    description: 'Inspect institute profile, appearance themes, bank accounts, and policies.',
    category: 'settings',
    categoryLabel: 'System Settings & Policies',
    riskLevel: 'low',
  },
  {
    id: 'settings.manage',
    code: 'settings.manage',
    name: 'Configure Institutional Policies',
    description: 'Update branding, voucher due date / surcharge policies, bank accounts, and fee templates.',
    category: 'settings',
    categoryLabel: 'System Settings & Policies',
    riskLevel: 'high',
  },

  // 11. User Management & Security
  {
    id: 'users.manage',
    code: 'users.manage',
    name: 'Manage Users & Permissions',
    description: 'Create operator accounts, reset passwords, and assign granular security permissions.',
    category: 'users',
    categoryLabel: 'User Management & Security',
    riskLevel: 'high',
  },

  // 12. Database Maintenance
  {
    id: 'system.cleanup',
    code: 'system.cleanup',
    name: 'Database Reset & Table Purge',
    description: 'Execute selection-based table resets and factory database purges.',
    category: 'system',
    categoryLabel: 'Database Maintenance',
    riskLevel: 'high',
  },
];

export const ALL_PERMISSION_CODES = ALL_PERMISSIONS.map((p) => p.code);

export const ROLE_PRESET_PERMISSIONS: Record<UserRole, string[]> = {
  Admin: [...ALL_PERMISSION_CODES],
  Accountant: [
    'dashboard.view',
    'students.view',
    'students.manage',
    'families.view',
    'families.manage',
    'classes.view',
    'classes.manage',
    'fees.view',
    'fees.generate',
    'fees.edit',
    'fees.collect',
    'fees.delete',
    'fees.reverse',
    'defaulters.view',
    'defaulters.manage',
    'transport.view',
    'transport.manage',
    'fees.report',
    'settings.view',
  ],
  Viewer: [
    'dashboard.view',
    'students.view',
    'families.view',
    'classes.view',
    'fees.view',
    'defaulters.view',
    'transport.view',
    'fees.report',
    'settings.view',
  ],
  Custom: [],
};

export interface SpecialtyPreset {
  id: string;
  name: string;
  badge: string;
  role: UserRole;
  description: string;
  permissions: string[];
}

export const SPECIALTY_PRESETS: SpecialtyPreset[] = [
  {
    id: 'admin',
    name: 'Super Administrator',
    badge: 'Full Access',
    role: 'Admin',
    description: 'Unrestricted control over all billing, collections, policies, and operator credentials.',
    permissions: [...ALL_PERMISSION_CODES],
  },
  {
    id: 'accountant',
    name: 'Fee Accountant / Billing Officer',
    badge: 'Invoicing & Operations',
    role: 'Accountant',
    description: 'Handles day-to-day operations: student management, fee generation, collections, defaulters, and ledgers.',
    permissions: ROLE_PRESET_PERMISSIONS.Accountant,
  },
  {
    id: 'cashier',
    name: 'Cashier / Counter Desk',
    badge: 'Collections Only',
    role: 'Custom',
    description: 'Dedicated to front-desk teller operations: student lookups, fee deposits, and collection receipts.',
    permissions: ['dashboard.view', 'students.view', 'fees.view', 'fees.collect', 'fees.report'],
  },
  {
    id: 'admissions',
    name: 'Admissions & Student Registrar',
    badge: 'Student Records',
    role: 'Custom',
    description: 'Manages new admissions, student profile editing, family/sibling linkage, and class promotions.',
    permissions: [
      'dashboard.view',
      'students.view',
      'students.manage',
      'students.promote',
      'families.view',
      'families.manage',
      'classes.view',
    ],
  },
  {
    id: 'transport_manager',
    name: 'Transport Fleet Coordinator',
    badge: 'Transport',
    role: 'Custom',
    description: 'Oversees vehicles, drivers, route stops, passenger allocations, and transport manifests.',
    permissions: ['dashboard.view', 'students.view', 'transport.view', 'transport.manage'],
  },
  {
    id: 'auditor',
    name: 'Internal Auditor / Inspector',
    badge: 'Read-Only Audit',
    role: 'Viewer',
    description: 'Audits ledger entries, voucher details, collections, and financial reports without modification rights.',
    permissions: ROLE_PRESET_PERMISSIONS.Viewer,
  },
];

/**
 * Determine the most descriptive matching role for a given set of permissions.
 */
export function getEffectiveRole(permissions: string[]): UserRole {
  if (!permissions || permissions.length === 0) return 'Custom';

  const isSameSet = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const setB = new Set(b);
    return a.every((item) => setB.has(item));
  };

  if (isSameSet(permissions, ROLE_PRESET_PERMISSIONS.Admin)) return 'Admin';
  if (isSameSet(permissions, ROLE_PRESET_PERMISSIONS.Accountant)) return 'Accountant';
  if (isSameSet(permissions, ROLE_PRESET_PERMISSIONS.Viewer)) return 'Viewer';

  return 'Custom';
}

/**
 * Check whether a user has a specific permission, respecting Admin wildcards and backward-compatible aliases.
 */
export function isPermissionAllowed(
  user: { role?: UserRole; permissions?: string[] } | null | undefined,
  permission: string
): boolean {
  if (!user) return false;

  // Super Admin role or wildcard '*' grants full system access
  if (user.role === 'Admin' || user.permissions?.includes('*')) {
    return true;
  }

  const userPerms = user.permissions || [];

  // Direct match
  if (userPerms.includes(permission)) {
    return true;
  }

  // Permission alias resolution for backward compatibility
  if (permission.endsWith('.delete')) {
    const managePerm = permission.replace('.delete', '.manage');
    if (userPerms.includes(managePerm)) return true;
  }

  if (permission === 'fees.reverse' && userPerms.includes('fees.delete')) {
    return true;
  }

  if (permission === 'fees.edit' && (userPerms.includes('fees.generate') || userPerms.includes('fees.manage'))) {
    return true;
  }

  if (
    permission === 'vouchers:edit' &&
    (userPerms.includes('fees.collect') || userPerms.includes('fees.generate') || userPerms.includes('fees.edit'))
  ) {
    return true;
  }

  if (permission === 'defaulters.view' && (userPerms.includes('fees.view') || userPerms.includes('fees.report'))) {
    return true;
  }

  if (permission === 'defaulters.manage' && (userPerms.includes('fees.generate') || userPerms.includes('fees.manage'))) {
    return true;
  }

  if (permission === 'users.manage' && userPerms.includes('settings.manage')) {
    return true;
  }

  if (permission === 'dashboard.view') {
    return true; // Dashboard is standard overview for any logged-in user unless explicitly removed
  }

  return false;
}

export function getPermissionsByCategory(category: string): PermissionDefinition[] {
  return ALL_PERMISSIONS.filter((p) => p.category === category);
}

export function getGrantedCategoryCount(
  permissions: string[] = [],
  category: string
): { granted: number; total: number } {
  const categoryPerms = getPermissionsByCategory(category);
  const granted = categoryPerms.filter((p) => permissions.includes(p.code)).length;
  return { granted, total: categoryPerms.length };
}
