// The one query for "this tenant's vendor exists and is ACTIVE". `is_active = false` is the vendor soft delete
// (DELETE /procurement/vendors/:id), which the vendor lists already hide. The vendors table is procurement's, so the
// query is published here (§module boundaries: tests/conformance/foundation/09-module-boundaries.spec.ts) for the
// modules that must check a vendor they are handed:
//   - vendor-portal: VendorPortalRepository (invitations, Tier 1) and VendorAuthGuard (Tier 2)
//     (fix/vendor-invite-inactive, fix/vendor-portal-inactive-vendor);
//   - finance: a contract's vendor_id, which has no foreign key at all (fix/finance-contract-foreign-ids).
// It runs in the caller's tenant transaction: the vendor row lives in the tenant's database (a separate one for a
// dedicated tenant, D56), never beside the platform's rows. The tenant is filtered explicitly as well as by RLS, as
// the other existence checks are (projectExistsInTenant, findVendorById): a connection that bypasses RLS — the
// integration harness's superuser, for one — would otherwise take another tenant's vendor
// (fix/finance-contract-foreign-ids).

import type { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

type TenantTx = Pick<Parameters<Parameters<TenantPrismaService['run']>[0]>[0], '$queryRaw'>;

/** In the caller's tenant transaction. */
export async function activeVendorExists(
  tx: TenantTx,
  vendorId: string,
  tenantId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ found: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM procurement.vendors
      WHERE vendor_id = ${vendorId}::uuid AND tenant_id = ${tenantId}::uuid AND is_active = true
    ) AS found
  `;
  return rows[0]?.found === true;
}

/** In a transaction of its own, under the tenant context already set (CLS). */
export function activeVendorExistsInTenant(
  tenantPrisma: TenantPrismaService,
  vendorId: string,
  tenantId: string,
): Promise<boolean> {
  return tenantPrisma.run((tx) => activeVendorExists(tx, vendorId, tenantId));
}
