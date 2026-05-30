import { SetMetadata } from '@nestjs/common';
import { CosRole } from '@cos/types';

export const ROLES_KEY = 'cos_roles';
export const PERMISSIONS_KEY = 'cos_permissions';

/** Restrict endpoint to users with at least one of the specified roles. */
export const Roles = (...roles: CosRole[]) => SetMetadata(ROLES_KEY, roles);

/** Restrict endpoint to users with all of the specified permissions. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
