// src/shared/utils/permissions.ts
import { User } from '@/entities/user/User';

export const ROLES = {
  USER: 'user',
  MODERATOR: 'moderator',
  ADMIN: 'admin'
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const PERMISSIONS = {
  'users:view': [ROLES.ADMIN, ROLES.MODERATOR] as Role[],
  'users:create': [ROLES.ADMIN] as Role[],
  'users:update': [ROLES.ADMIN, ROLES.MODERATOR] as Role[],
  'users:delete': [ROLES.ADMIN] as Role[],
  'users:change-role': [ROLES.ADMIN] as Role[],
  'users:activate': [ROLES.ADMIN] as Role[],
  'admin:access': [ROLES.ADMIN] as Role[],
  'moderator:access': [ROLES.MODERATOR, ROLES.ADMIN] as Role[],
  'dashboard:view': [ROLES.ADMIN, ROLES.MODERATOR] as Role[],
  'profile:view': [ROLES.USER, ROLES.MODERATOR, ROLES.ADMIN] as Role[],
  'profile:update': [ROLES.USER, ROLES.MODERATOR, ROLES.ADMIN] as Role[],
} as const;

export type Permission = keyof typeof PERMISSIONS;

// Проверка прав
export const hasPermission = (
  user: User | null,
  permission: Permission
): boolean => {
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) return false;
  
  return allowedRoles.includes(user.role);
};

// Алиас
export const can = hasPermission;