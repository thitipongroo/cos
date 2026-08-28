import { missingEnv, parseArgs } from '../maintenance/reconcile-contracts.script';
import {
  NEVER_APPROVED_PO_SQL,
  NEVER_APPROVED_PO_STATUSES,
  PRUNE_CONTRACTS_CYPHER,
  planReconcile,
} from '../maintenance/contract-reconcile';

describe('contract reconcile — which POs never became contracts', () => {
  it('treats exactly DRAFT and PENDING_APPROVAL as never approved', () => {
    expect([...NEVER_APPROVED_PO_STATUSES]).toEqual(['DRAFT', 'PENDING_APPROVAL']);
  });

  it.each([
    'APPROVED',
    'SENT',
    'ACKNOWLEDGED',
    'PARTIALLY_DELIVERED',
    'FULLY_DELIVERED',
    'INVOICED',
    'PAID',
    'DISPUTED',
  ])('%s keeps its contract — the PO passed through APPROVED to reach it', (status) => {
    // The load-bearing case. APPROVED → SENT is automatic (po.workflow.ts:296), so a PO sits in
    // APPROVED for one workflow tick and then leaves. A reconcile written as "delete everything
    // whose status is not APPROVED" would wipe essentially every real contract in the graph.
    expect([...NEVER_APPROVED_PO_STATUSES]).not.toContain(status);
  });

  it('does not invent a REJECTED status', () => {
    // purchase_orders' CHECK constraint has no REJECTED; a rejection reverts the PO to DRAFT
    // (po.workflow.ts:261, 284), which the DRAFT entry above already covers. Adding REJECTED here
    // would look thorough and match nothing.
    expect([...NEVER_APPROVED_PO_STATUSES]).not.toContain('REJECTED');
  });
});

describe('contract reconcile — the statements', () => {
  it('scopes the SQL to one tenant and to the status list', () => {
    expect(NEVER_APPROVED_PO_SQL).toContain('procurement.purchase_orders');
    expect(NEVER_APPROVED_PO_SQL).toContain('tenant_id = $1::uuid');
    expect(NEVER_APPROVED_PO_SQL).toContain('status = ANY($2::text[])');
  });

  it('scopes the Cypher to one tenant and to the listed ids', () => {
    // Without `tenant_id` in the MATCH, one tenant's draft PO ids would delete another tenant's
    // contracts wherever a uuid collided — and the ids come from a different database.
    expect(PRUNE_CONTRACTS_CYPHER).toContain('(c:Contract {tenant_id: $tenantId})');
    expect(PRUNE_CONTRACTS_CYPHER).toContain('c.contract_id IN $poIds');
  });

  it('uses DETACH DELETE', () => {
    // :Contract has no relationships today. If one is ever added, a plain DELETE starts throwing on
    // exactly the nodes this tool exists to remove.
    expect(PRUNE_CONTRACTS_CYPHER).toContain('DETACH DELETE');
  });

  it('deletes nothing outside the id list', () => {
    // Absence: no bare `MATCH (c:Contract)` that could sweep the label.
    expect(PRUNE_CONTRACTS_CYPHER).not.toMatch(/MATCH \(c:Contract\)\s*\n\s*DETACH/);
  });
});

describe('planReconcile', () => {
  it('deletes only ids that are both never-approved and actually present', () => {
    const plan = planReconcile(
      't-1',
      ['po-draft', 'po-pending', 'po-gone'],
      ['po-draft', 'po-approved'],
    );
    expect(plan).toEqual({ tenantId: 't-1', toDelete: ['po-draft'] });
  });

  it('reports an empty plan when the graph is already clean', () => {
    // What a second run must look like. A tool whose repeat run reports work it did not do teaches
    // the operator to ignore its output.
    expect(planReconcile('t-1', ['po-draft'], ['po-approved']).toDelete).toEqual([]);
  });

  it('is a no-op when there are no draft POs at all', () => {
    expect(planReconcile('t-1', [], ['po-approved']).toDelete).toEqual([]);
  });

  it('is a no-op against an empty graph', () => {
    expect(planReconcile('t-1', ['po-draft'], []).toDelete).toEqual([]);
  });

  it('never deletes a contract whose PO row is missing entirely', () => {
    // Deleting on "not in the approved set" would sweep these. They are left for a human: a node
    // with no PO behind it is a different fault from the one this tool repairs.
    expect(planReconcile('t-1', ['po-draft'], ['po-orphan', 'po-draft']).toDelete).toEqual([
      'po-draft',
    ]);
  });

  it('deduplicates and sorts, so two runs produce comparable output', () => {
    const plan = planReconcile('t-1', ['b', 'a', 'b'], ['a', 'b']);
    expect(plan.toDelete).toEqual(['a', 'b']);
  });

  it('carries the tenant through untouched', () => {
    expect(planReconcile('tenant-9', [], []).tenantId).toBe('tenant-9');
  });
});

describe('reconcile script — argument and environment contract', () => {
  it('requires a tenant', () => {
    // A run with no tenant must not fall through to "reconcile everything": the Cypher is scoped by
    // tenant_id, and an undefined one matches no node — which would report a confident clean bill.
    expect(parseArgs([])).toEqual({ error: expect.stringContaining('--tenant') });
  });

  it('rejects a missing value after --tenant', () => {
    expect(parseArgs(['--tenant'])).toEqual({ error: expect.any(String) });
  });

  it('rejects the next flag being swallowed as the tenant id', () => {
    // `--tenant --apply` would otherwise reconcile a tenant literally called "--apply" and, worse,
    // lose the --apply flag so the operator believes a dry run deleted nothing.
    expect(parseArgs(['--tenant', '--apply'])).toEqual({ error: expect.any(String) });
  });

  it('defaults to a dry run', () => {
    // The whole safety property of the tool.
    expect(parseArgs(['--tenant', 't-1'])).toEqual({ tenantId: 't-1', apply: false });
  });

  it('applies only when asked, in either argument order', () => {
    expect(parseArgs(['--tenant', 't-1', '--apply'])).toEqual({ tenantId: 't-1', apply: true });
    expect(parseArgs(['--apply', '--tenant', 't-1'])).toEqual({ tenantId: 't-1', apply: true });
  });

  it('names every connection variable it needs', () => {
    expect(missingEnv({})).toEqual([
      'DATABASE_URL',
      'NEO4J_URI',
      'NEO4J_USERNAME',
      'NEO4J_PASSWORD',
    ]);
  });

  it('reports only what is actually missing', () => {
    expect(
      missingEnv({ DATABASE_URL: 'x', NEO4J_URI: 'y', NEO4J_USERNAME: 'z', NEO4J_PASSWORD: '' }),
    ).toEqual(['NEO4J_PASSWORD']);
  });

  it('is satisfied when all four are set', () => {
    expect(
      missingEnv({ DATABASE_URL: 'a', NEO4J_URI: 'b', NEO4J_USERNAME: 'c', NEO4J_PASSWORD: 'd' }),
    ).toEqual([]);
  });
});
