// Populate the Neo4j knowledge graph from the seeded Postgres data, matching the exact node /
// relationship structure the Phase-13 GraphService queries expect (graph.service.ts):
//   (:Project {project_id, tenant_id, project_name})
//   (:Vendor  {vendor_id, tenant_id, vendor_name})
//   (:Material {material_id, description})
//   (:Inspection {inspection_id, status, inspected_at})
//   (:Invoice {invoice_id, amount, currency, status})
//   (Project)-[:HAS_MATERIAL]->(Material)-[:SUPPLIED_BY|DELIVERED_BY]->(Vendor)
//   (Project)-[:HAS_INSPECTION]->(Inspection)
//   (Vendor)-[:SUBMITTED]->(Invoice)
// Normally the kg-ingestion-worker builds this from Kafka events; the seed writes straight to
// Postgres (no events), so this derives the same graph directly. Idempotent (MERGE).
//
// Run: DATABASE_URL=<direct pg url> NEO4J_PASSWORD=... pnpm exec ts-node prisma/populate-neo4j.ts
import 'dotenv/config';
import neo4j from 'neo4j-driver';
import { createPrismaClient } from '../src/shared/prisma/create-prisma-client';
import { createLogger } from '@cos/logger';

const logger = createLogger('populate-neo4j');
const prisma = createPrismaClient();

const NEO4J_URI = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env['NEO4J_USER'] ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'cos_neo4j_password';

async function main(): Promise<void> {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();
  const q = <T = Record<string, unknown>>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql);

  try {
    // Fresh graph for the demo tenants (idempotent full rebuild).
    await session.run(
      `MATCH (n) WHERE n:Project OR n:Vendor OR n:Material OR n:Inspection OR n:Invoice DETACH DELETE n`,
    );

    const projects = await q<{ project_id: string; tenant_id: string; project_name: string }>(
      `SELECT project_id::text, tenant_id::text, project_name FROM projects.projects`,
    );
    for (const p of projects) {
      await session.run(
        `MERGE (p:Project {project_id: $id}) SET p.tenant_id = $t, p.project_name = $n`,
        { id: p.project_id, t: p.tenant_id, n: p.project_name },
      );
    }

    const vendors = await q<{ vendor_id: string; tenant_id: string; vendor_name: string }>(
      `SELECT vendor_id::text, tenant_id::text, vendor_name FROM procurement.vendors`,
    );
    for (const v of vendors) {
      await session.run(
        `MERGE (v:Vendor {vendor_id: $id}) SET v.tenant_id = $t, v.vendor_name = $n`,
        { id: v.vendor_id, t: v.tenant_id, n: v.vendor_name },
      );
    }

    // Materials = PO line items; each links its project → material → supplying vendor
    // (and DELIVERED_BY when the PO reached a delivered/invoiced state).
    const lines = await q<{
      line_id: string;
      description: string;
      project_id: string;
      vendor_id: string;
      status: string;
    }>(
      `SELECT li.line_id::text, li.description, po.project_id::text, po.vendor_id::text, po.status
       FROM procurement.po_line_items li JOIN procurement.purchase_orders po ON po.po_id = li.po_id`,
    );
    const delivered = new Set([
      'ACKNOWLEDGED',
      'PARTIALLY_DELIVERED',
      'FULLY_DELIVERED',
      'INVOICED',
      'PAID',
    ]);
    for (const l of lines) {
      await session.run(
        `MATCH (p:Project {project_id: $pid}), (v:Vendor {vendor_id: $vid})
         MERGE (m:Material {material_id: $mid}) SET m.description = $desc
         MERGE (p)-[:HAS_MATERIAL]->(m)
         MERGE (m)-[:SUPPLIED_BY]->(v)`,
        { pid: l.project_id, vid: l.vendor_id, mid: l.line_id, desc: l.description },
      );
      if (delivered.has(l.status)) {
        await session.run(
          `MATCH (m:Material {material_id: $mid}), (v:Vendor {vendor_id: $vid})
           MERGE (m)-[:DELIVERED_BY]->(v)`,
          { mid: l.line_id, vid: l.vendor_id },
        );
      }
    }

    const inspections = await q<{
      inspection_id: string;
      project_id: string;
      status: string;
      inspected_at: string;
    }>(
      `SELECT inspection_id::text, project_id::text, status, inspected_at::text FROM site_ops.inspections`,
    );
    for (const i of inspections) {
      await session.run(
        `MATCH (p:Project {project_id: $pid})
         MERGE (ins:Inspection {inspection_id: $id}) SET ins.status = $s, ins.inspected_at = $at
         MERGE (p)-[:HAS_INSPECTION]->(ins)`,
        { pid: i.project_id, id: i.inspection_id, s: i.status, at: i.inspected_at },
      );
    }

    const invoices = await q<{
      invoice_id: string;
      vendor_id: string;
      amount: string;
      currency: string;
      status: string;
    }>(
      `SELECT invoice_id::text, vendor_id::text, amount::text AS amount, currency_code AS currency, status
       FROM procurement.invoices`,
    );
    for (const inv of invoices) {
      await session.run(
        `MATCH (v:Vendor {vendor_id: $vid})
         MERGE (i:Invoice {invoice_id: $id}) SET i.amount = $amt, i.currency = $cur, i.status = $st
         MERGE (v)-[:SUBMITTED]->(i)`,
        {
          vid: inv.vendor_id,
          id: inv.invoice_id,
          amt: inv.amount,
          cur: inv.currency,
          st: inv.status,
        },
      );
    }

    const counts = await session.run(
      `MATCH (n) WHERE n:Project OR n:Vendor OR n:Material OR n:Inspection OR n:Invoice
       RETURN labels(n)[0] AS label, count(*) AS c ORDER BY label`,
    );
    logger.info(
      { nodes: counts.records.map((r) => `${r.get('label')}=${r.get('c').toNumber()}`).join(' ') },
      'populate-neo4j: complete',
    );
  } finally {
    await session.close();
    await driver.close();
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'populate-neo4j: fatal');
  process.exit(1);
});
