// The project a vendor invoice belongs to — the project of the purchase order it is for. The invoices and purchase
// orders are procurement's tables, so the query is published here (§module boundaries:
// tests/conformance/foundation/09-module-boundaries.spec.ts) for the module that must check an invoice it is handed:
//   - finance: an AP payment's invoice_id, which has no foreign key at all (plan DB).
// The tenant is filtered explicitly as well as by RLS, as the other existence checks are (active-vendor.ts): a
// connection that bypasses RLS — the integration harness's superuser, for one — would otherwise take another
// tenant's invoice.

import type { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

/** The invoice's PO's project_id, or null when there is no such invoice in the tenant. */
export async function invoiceProjectInTenant(
  tenantPrisma: TenantPrismaService,
  invoiceId: string,
  tenantId: string,
): Promise<string | null> {
  const rows = await tenantPrisma.run(
    async (tx) =>
      await tx.$queryRaw<Array<{ project_id: string }>>`
        SELECT po.project_id::text AS project_id
        FROM procurement.invoices i
        JOIN procurement.purchase_orders po ON po.po_id = i.po_id AND po.tenant_id = i.tenant_id
        WHERE i.invoice_id = ${invoiceId}::uuid AND i.tenant_id = ${tenantId}::uuid
      `,
  );
  return rows[0]?.project_id ?? null;
}
