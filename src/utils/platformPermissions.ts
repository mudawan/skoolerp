// Permissions for the platform (app-owner) area. These are completely separate from the
// school permissions in permissions.ts: a school role never carries a platform permission,
// and a platform role never grants access to a school's own screens.

export type PlatformRole = 'owner' | 'support' | 'observer';

export const PLATFORM_PERMISSIONS = {
  'platform.monitor.view': 'See the API, database and error dashboards',
  'platform.schools.view': 'See the list of schools and their status',
  'platform.schools.suspend': 'Suspend or reactivate a school',
  'platform.users.manage': 'Reset school users\' passwords, deactivate or reactivate them, end their sessions',
  'platform.audit.view': 'Read the platform audit log',
  'platform.admins.manage': 'Create platform admins, change their role, reset their password',
} as const;

export type PlatformPermission = keyof typeof PLATFORM_PERMISSIONS;
export const ALL_PLATFORM_PERMISSION_CODES = Object.keys(PLATFORM_PERMISSIONS) as PlatformPermission[];

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  owner: [...ALL_PLATFORM_PERMISSION_CODES],
  support: [
    'platform.monitor.view',
    'platform.schools.view',
    'platform.schools.suspend',
    'platform.users.manage',
    'platform.audit.view',
  ],
  observer: ['platform.monitor.view', 'platform.schools.view', 'platform.audit.view'],
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  owner: 'Owner',
  support: 'Support',
  observer: 'Observer',
};

export function isPlatformRole(v: unknown): v is PlatformRole {
  return v === 'owner' || v === 'support' || v === 'observer';
}

export function platformCan(role: string | undefined, permission: PlatformPermission): boolean {
  return isPlatformRole(role) && PLATFORM_ROLE_PERMISSIONS[role].includes(permission);
}
