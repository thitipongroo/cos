'use client';

import { useSession } from 'next-auth/react';
import { CosRole } from '@cos/types';

/**
 * VIEWER read-only mode (§20.7.9): a viewer has read-only access to the pages of
 * its assigned modules — "no create/edit/approve actions are rendered". Backend RBAC
 * already blocks writes; this hook lets pages hide the action UI for that role.
 */
export function useReadOnly(): boolean {
  const { data } = useSession();
  return data?.user?.role === CosRole.VIEWER;
}
