// The one query for "this tenant's vendor exists and is ACTIVE", shared by the request-scoped
// VendorPortalRepository (invitations, Tier 1) and the singleton VendorAuthGuard (Tier 2) so the two cannot drift
// (fix/vendor-portal-inactive-vendor). `is_active = false` is the vendor soft delete (DELETE
// /procurement/vendors/:id). Runs in the caller's tenant transaction: the vendor row lives in the tenant's database
// (a separate one for a dedicated tenant, D56), never beside the platform's relationship rows.

import type { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';

type TenantTx = Pick<Parameters<Parameters<TenantPrismaService['run']>[0]>[0], '$queryRaw'>;

export async function activeVendorExists(tx: TenantTx, vendorId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ found: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM procurement.vendors WHERE vendor_id = ${vendorId}::uuid AND is_active = true
    ) AS found
  `;
  return rows[0]?.found === true;
}
