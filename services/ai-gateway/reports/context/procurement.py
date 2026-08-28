"""PROCUREMENT_SUMMARY context — master:3989 "rfqs (open), pos (pending delivery), invoices (overdue)"."""

from __future__ import annotations

from db.tenant_scope import tenant_scoped

# "Open" for an RFQ means it is still collecting or being decided: it has left DRAFT and has not
# reached a terminal state. AWARDED and CANCELLED are terminal; DRAFT was never opened.
OPEN_RFQ_STATUSES = ("PUBLISHED", "CLOSED", "EVALUATED")

# "Pending delivery" — issued to a vendor and not yet fully received. FULLY_DELIVERED, INVOICED and
# PAID are past delivery; DRAFT/PENDING_APPROVAL have not been issued; DISPUTED is its own problem
# and is counted separately rather than folded in as if delivery were merely late.
PENDING_DELIVERY_STATUSES = ("APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_DELIVERED")

# "Overdue" — past due_date and not yet settled. PAID is settled; DISPUTED is not overdue, it is
# contested, and calling it overdue would put a vendor dispute in a lateness count.
UNSETTLED_INVOICE_STATUSES = ("RECEIVED", "VERIFIED", "APPROVED")


def build_procurement_context(signals: dict) -> str:
    """Pure: render the fetched procurement signals into the status-summary prompt context."""
    lines = [
        f"RFQs: {signals['open_rfqs']} open, of which {signals['closing_soon']} close within 7 days.",
        f"Purchase orders: {signals['pending_delivery']} awaiting delivery,"
        f" {signals['late_pos']} of them past their delivery date.",
        f"Invoices: {signals['overdue_invoices']} overdue"
        f" (total {signals['overdue_amount']} {signals['currency'] or 'unspecified currency'}).",
    ]
    if signals["disputed_pos"]:
        # Not folded into late_pos: a disputed PO is a different conversation from a slow one, and
        # merging them would understate one and overstate the other.
        lines.append(f"Disputes: {signals['disputed_pos']} purchase orders are in DISPUTED state.")
    return "\n".join(lines)


async def fetch_procurement_signals(pool, tenant_id: str, project_id: str) -> dict:
    """Procurement signals for one project. Tenant-scoped by RLS and an explicit predicate."""
    async with tenant_scoped(pool, tenant_id) as conn:
        rfqs = await conn.fetchrow(
            """
            SELECT
              count(*)                                                                  AS open_count,
              count(*) FILTER (WHERE deadline < now() + INTERVAL '7 days')               AS closing_soon
            FROM procurement.rfqs
            WHERE tenant_id = $1 AND project_id = $2 AND status = ANY($3::text[])
            """,
            tenant_id,
            project_id,
            list(OPEN_RFQ_STATUSES),
        )
        pos = await conn.fetchrow(
            """
            SELECT
              count(*) FILTER (WHERE status = ANY($3::text[]))                            AS pending,
              count(*) FILTER (WHERE status = ANY($3::text[])
                                 AND delivery_date < CURRENT_DATE)                        AS late,
              count(*) FILTER (WHERE status = 'DISPUTED')                                 AS disputed
            FROM procurement.purchase_orders
            WHERE tenant_id = $1 AND project_id = $2
            """,
            tenant_id,
            project_id,
            list(PENDING_DELIVERY_STATUSES),
        )
        # invoices carries no project_id — it reaches the project only through its PO, so the scope
        # is the join. Summing across currencies would be meaningless, so the currency is reported
        # with the total and is NULL when the project's overdue invoices span more than one.
        invoices = await conn.fetchrow(
            """
            SELECT
              count(*)                                        AS overdue_count,
              COALESCE(sum(i.amount), 0)                      AS overdue_amount,
              CASE WHEN count(DISTINCT i.currency_code) = 1
                   THEN min(i.currency_code) END              AS currency
            FROM procurement.invoices i
            JOIN procurement.purchase_orders po ON po.po_id = i.po_id
            WHERE i.tenant_id = $1 AND po.project_id = $2
              AND i.due_date < CURRENT_DATE
              AND i.status = ANY($3::text[])
            """,
            tenant_id,
            project_id,
            list(UNSETTLED_INVOICE_STATUSES),
        )
    return {
        "open_rfqs": rfqs["open_count"],
        "closing_soon": rfqs["closing_soon"],
        "pending_delivery": pos["pending"],
        "late_pos": pos["late"],
        "disputed_pos": pos["disputed"],
        "overdue_invoices": invoices["overdue_count"],
        "overdue_amount": invoices["overdue_amount"],
        "currency": invoices["currency"],
    }


async def assemble_procurement_context(pool, tenant_id: str, project_id: str) -> str:
    return build_procurement_context(await fetch_procurement_signals(pool, tenant_id, project_id))
