// Reconcile the derived :Contract nodes in Neo4j against PostgreSQL.
//
// WHY THIS EXISTS. Until 2026-08-29 kg-ingestion-worker created a :Contract on
// `procurement.po.created.v1` — every purchase order anyone ever started, including drafts and the
// ones a PM sent back. master:4156 defines the node as "po_id of APPROVED Purchase Orders (APPROVED
// PO = contractual agreement)". The mapper is fixed; the nodes it already wrote are not.
//
// WHY NOT JUST REBUILD. The kg worker's admin endpoint replays "all events from the beginning", but
// Kafka keeps 168 hours (docker-compose.yml KAFKA_LOG_RETENTION_HOURS, and master:3118's 7-day
// default), and `procurement.po.status_changed.v1` is not a compacted entity-state topic. Wiping the
// label and replaying would therefore DELETE every contract approved more than a week ago and be
// unable to recreate it. Reconciliation against PostgreSQL is the only correct direction, and it is
// the one master:4103 already prescribes: "Graph is NOT the source of truth — PostgreSQL is
// authoritative."
//
// WHY DELETION IS SUFFICIENT. The old bug OVER-created: one node per PO, unconditionally. The
// correct set — POs that reached APPROVED — is therefore a strict subset of what already exists, so
// the repair is pure pruning. No backfill is needed, and none is attempted; a script that also
// created nodes could not tell a genuinely missing contract from one this tool had just deleted.

/**
 * A purchase order in one of these has never been approved.
 *
 * The workflow is DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACKNOWLEDGED
 * (backend/src/modules/procurement/workflows/po.workflow.ts:3), and APPROVED → SENT is AUTOMATIC
 * (same file, line 296). So "currently APPROVED" is nearly empty in practice — a PO passes through
 * that status in the same workflow tick. Anything at SENT or beyond has been approved and keeps its
 * contract; a rejection reverts to DRAFT (lines 261, 284) and there is no REJECTED status in the
 * table's CHECK constraint at all.
 *
 * Selecting the never-approved set rather than negating an approved set is deliberate: it prunes
 * exactly what the bug created and leaves anything unexpected — a node whose PO row no longer exists
 * — untouched for a human to look at, rather than deleting it on an inference.
 */
export const NEVER_APPROVED_PO_STATUSES = ['DRAFT', 'PENDING_APPROVAL'] as const;

/** POs that have never been approved, for one tenant. Explicit predicate alongside RLS. */
export const NEVER_APPROVED_PO_SQL = `
  SELECT po_id::text AS po_id
    FROM procurement.purchase_orders
   WHERE tenant_id = $1::uuid
     AND status = ANY($2::text[])
`;

/**
 * Delete the contracts those POs should never have had.
 *
 * DETACH DELETE even though :Contract carries no relationship today (master's relationship list
 * names none, and the mapper writes none): if one is ever added, a plain DELETE would start throwing
 * on exactly the nodes this tool exists to remove.
 */
export const PRUNE_CONTRACTS_CYPHER = `
  MATCH (c:Contract {tenant_id: $tenantId})
  WHERE c.contract_id IN $poIds
  DETACH DELETE c
  RETURN count(c) AS deleted
`;

export interface ReconcilePlan {
  tenantId: string;
  /** po_ids whose :Contract must go. */
  toDelete: string[];
}

/**
 * Pure: given the tenant's never-approved po_ids and the contract_ids Neo4j currently holds, decide
 * what to delete.
 *
 * Intersecting rather than deleting the SQL list outright keeps the reported count honest — the
 * number of nodes that actually existed, not the number of draft POs — which is what makes a second
 * run visibly a no-op and the whole operation safe to repeat.
 */
export function planReconcile(
  tenantId: string,
  neverApprovedPoIds: readonly string[],
  existingContractIds: readonly string[],
): ReconcilePlan {
  const present = new Set(existingContractIds);
  return {
    tenantId,
    toDelete: [...new Set(neverApprovedPoIds)].filter((id) => present.has(id)).sort(),
  };
}
