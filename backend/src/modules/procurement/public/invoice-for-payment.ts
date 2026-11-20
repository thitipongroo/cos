// What finance needs to know about a vendor invoice it is asked to pay: the project of the purchase order it is for,
// its status and its currency. The invoices and purchase orders are procurement's tables, so the query is published
// here (§module boundaries: tests/conformance/foundation/09-module-boundaries.spec.ts) for the module that must
// check an invoice it is handed:
//   - finance: an AP payment's invoice_id, which has no foreign key at all — the tenant's, under the payment's
//     project (plan DB), APPROVED and in the payment's currency (plan DD), and never paid beyond its amount (plan DE).
// The tenant is filtered explicitly as well as by RLS, as the other existence checks are (active-vendor.ts): a
// connection that bypasses RLS — the integration harness's superuser, for one — would otherwise take another
// tenant's invoice.

import type { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

export interface InvoiceForPayment {
  /** The invoice's PO's project. */
  project_id: string;
  status: 'RECEIVED' | 'VERIFIED' | 'APPROVED' | 'PAID' | 'DISPUTED';
  currency_code: string;
  /** DECIMAL as text — the cap on the invoice's PENDING + PROCESSED payments (plan DE). */
  amount: string;
}

/** The invoice as finance pays it, or null when there is no such invoice in the tenant. */
export async function invoiceForPaymentInTenant(
  tenantPrisma: TenantPrismaService,
  invoiceId: string,
  tenantId: string,
): Promise<InvoiceForPayment | null> {
  const rows = await tenantPrisma.run(
    async (tx) =>
      await tx.$queryRaw<InvoiceForPayment[]>`
        SELECT po.project_id::text AS project_id, i.status::text AS status, i.currency_code,
               i.amount::text AS amount
        FROM procurement.invoices i
        JOIN procurement.purchase_orders po ON po.po_id = i.po_id AND po.tenant_id = i.tenant_id
        WHERE i.invoice_id = ${invoiceId}::uuid AND i.tenant_id = ${tenantId}::uuid
      `,
  );
  return rows[0] ?? null;
}
