import React from 'react';
import { User, UserRole } from '../types';
import { UserModal, UserModalProps, UserModalSaveData } from './UserModal';

export { UserModal };
export type { UserModalProps, UserModalSaveData };

export interface UserPermissionsModalProps {
  isOpen: boolean;
  user:
    | User
    | { id: string; name: string; username: string; role: UserRole; permissions: string[]; email?: string }
    | null;
  onClose: () => void;
  onSave: (userId: string, permissions: string[], role: UserRole) => Promise<void> | void;
}

/**
 * Backward-compatibility wrapper for UserPermissionsModal.
 * Routes directly to the unified UserModal opening directly on the 'permissions' tab.
 */
export const UserPermissionsModal: React.FC<UserPermissionsModalProps> = ({
  isOpen,
  user,
  onClose,
  onSave,
}) => {
  if (!isOpen || !user) return null;

  // Adapt user object to User type if needed
  const normalizedUser: User = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    email: user.email,
  };

  const handleSave = async (data: UserModalSaveData) => {
    await onSave(user.id, data.permissions, data.role);
  };

  return (
    <UserModal
      isOpen={isOpen}
      user={normalizedUser}
      initialTab="permissions"
      onClose={onClose}
      onSave={handleSave}
    />
  );
};
