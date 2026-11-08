'use client';

import { useSession } from 'next-auth/react';
import { CosRole } from '@cos/types';
import { isReadOnlyStatus } from '@cos/ui-logic';
import { useMyTenant } from '../api/queries';

/** The VIEWER role (§20.7.9): read-only access to its assigned modules. */
export function useViewerRole(): boolean {
  const { data } = useSession();
  return data?.user?.role === CosRole.VIEWER;
}

/**
 * Whether this page must hide its create / edit / approve actions. Two reasons, either is enough:
 *  - the VIEWER role (§20.7.9) — "no create/edit/approve actions are rendered";
 *  - the tenant's free trial has ended (§7.10, ADR-109) — EXPIRED or PENDING_DELETION; every write would be
 *    refused with 403 COS-PLAN-003, so offering the button only produces an error. The trial banner says why.
 * The server enforces both regardless; this only keeps the UI honest. GET /tenant is one cached query shared with
 * the banner, not a request per page.
 */
export function useReadOnly(): boolean {
  const { status } = useSession();
  const viewer = useViewerRole();
  const tenant = useMyTenant(status === 'authenticated');
  return viewer || isReadOnlyStatus(tenant.data?.subscription_status);
}
