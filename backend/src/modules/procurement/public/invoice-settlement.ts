// A vendor invoice settled by finance's payments (plan DT): finance approves an AP payment, and when the invoice's
// PROCESSED payments reach its amount the invoice is PAID. The invoices are procurement's table, so the write is
// published here (§module boundaries: tests/conformance/foundation/09-module-boundaries.spec.ts) and runs in the
// caller's transaction — the approval's, under its per-invoice lock — so the payment and the invoice change together.
// Only an APPROVED invoice becomes PAID: one DISPUTED (or in any other state) is left as it is. The tenant is filtered
// explicitly as well as by RLS, as in invoice-for-payment.ts.

import type { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

type Tx = Parameters<Parameters<TenantPrismaService['run']>[0]>[0];

/** Sets the invoice PAID when `processed` (DECIMAL as text) reaches its amount; true when it did. */
export async function settleInvoiceIfPaid(
  tx: Tx,
  tenantId: string,
  invoiceId: string,
  processed: string,
): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE procurement.invoices SET status = 'PAID'
    WHERE invoice_id = ${invoiceId}::uuid AND tenant_id = ${tenantId}::uuid
      AND status = 'APPROVED' AND amount <= ${processed}::decimal`;
  return updated > 0;
}
