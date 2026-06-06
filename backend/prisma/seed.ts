// Seed script — standard master data for all category tables.
// Run via: pnpm seed (ts-node prisma/seed.ts)
//
// Requires env vars:
//   DATABASE_URL         — Postgres connection string
//   SEED_TENANT_ID       — UUID of the tenant to seed (default: dev tenant below)
//   SEED_CREATED_BY      — UUID of the seeding actor (default: system user below)
//
// All inserts use ON CONFLICT DO NOTHING — idempotent; safe to run multiple times.
// RLS bypass: each batch runs inside a transaction with SET LOCAL app.current_tenant_id.

import { PrismaClient } from '@prisma/client';
import { createLogger } from '@cos/logger';

const logger = createLogger('seed');

const SEED_TENANT_ID = process.env['SEED_TENANT_ID'] ?? '00000000-0000-4000-8000-000000000001';
const SEED_CREATED_BY = process.env['SEED_CREATED_BY'] ?? '00000000-0000-4000-8000-000000000000';

type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const prisma = new PrismaClient();

async function withTenantCtx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${SEED_TENANT_ID}'`);
    return fn(tx);
  });
}

// ─── work_categories ───────────────────────────────────────────────────────────

const WORK_CATEGORIES: ReadonlyArray<{ code: string; name: string; phase: string }> = [
  { code: 'EARTHWORK', name: 'Earthwork', phase: 'Site Preparation' },
  { code: 'FOUNDATION', name: 'Foundation', phase: 'Substructure' },
  { code: 'STRUCTURE', name: 'Structure', phase: 'Superstructure' },
  { code: 'MEP', name: 'MEP', phase: 'Mechanical Electrical Plumbing' },
  { code: 'ARCHITECTURE', name: 'Architecture', phase: 'Finishing' },
  { code: 'FINISHING', name: 'Finishing', phase: 'Finishing' },
  { code: 'LANDSCAPING', name: 'Landscaping', phase: 'External Works' },
  { code: 'COMMISSIONING', name: 'Commissioning', phase: 'Handover' },
];

async function seedWorkCategories(tx: Tx): Promise<void> {
  for (const wc of WORK_CATEGORIES) {
    await tx.$executeRaw`
      INSERT INTO site_ops.work_categories
        (tenant_id, name, code, phase, is_active, created_by)
      VALUES
        (${SEED_TENANT_ID}::uuid, ${wc.name}, ${wc.code}, ${wc.phase}, true, ${SEED_CREATED_BY}::uuid)
      ON CONFLICT (tenant_id, code) DO NOTHING
    `;
  }
  logger.info({ count: WORK_CATEGORIES.length }, 'seed: work_categories done');
}

// ─── issue_categories ──────────────────────────────────────────────────────────

const ISSUE_CATEGORIES: ReadonlyArray<{ name: string; severity_default: string }> = [
  { name: 'Safety', severity_default: 'HIGH' },
  { name: 'Quality', severity_default: 'MEDIUM' },
  { name: 'Delay', severity_default: 'MEDIUM' },
  { name: 'Material', severity_default: 'MEDIUM' },
  { name: 'Equipment', severity_default: 'LOW' },
  { name: 'Weather', severity_default: 'LOW' },
  { name: 'Design', severity_default: 'HIGH' },
  { name: 'Other', severity_default: 'MEDIUM' },
];

async function seedIssueCategories(tx: Tx): Promise<void> {
  for (const ic of ISSUE_CATEGORIES) {
    await tx.$executeRaw`
      INSERT INTO site_ops.issue_categories
        (tenant_id, name, severity_default, is_active, created_by)
      VALUES
        (${SEED_TENANT_ID}::uuid, ${ic.name}, ${ic.severity_default}::"IssueSeverityDefault", true, ${SEED_CREATED_BY}::uuid)
      ON CONFLICT (tenant_id, name) DO NOTHING
    `;
  }
  logger.info({ count: ISSUE_CATEGORIES.length }, 'seed: issue_categories done');
}

// ─── cost_categories ───────────────────────────────────────────────────────────

const COST_CATEGORIES: ReadonlyArray<{ name: string; type: string }> = [
  { name: 'Material', type: 'MATERIAL' },
  { name: 'Labor', type: 'LABOR' },
  { name: 'Equipment', type: 'EQUIPMENT' },
  { name: 'Overhead', type: 'OVERHEAD' },
];

async function seedCostCategories(tx: Tx): Promise<void> {
  for (const cc of COST_CATEGORIES) {
    await tx.$executeRaw`
      INSERT INTO finance.cost_categories
        (tenant_id, name, type, is_active, created_by)
      VALUES
        (${SEED_TENANT_ID}::uuid, ${cc.name}, ${cc.type}::"CostCategoryType", true, ${SEED_CREATED_BY}::uuid)
      ON CONFLICT (tenant_id, name) DO NOTHING
    `;
  }
  logger.info({ count: COST_CATEGORIES.length }, 'seed: cost_categories done');
}

// ─── inspection_types ──────────────────────────────────────────────────────────

interface ChecklistItem {
  item: string;
  required: boolean;
}

const INSPECTION_TYPES: ReadonlyArray<{ name: string; checklist: ReadonlyArray<ChecklistItem> }> = [
  {
    name: 'Foundation Inspection',
    checklist: [
      { item: 'Rebar placement correct', required: true },
      { item: 'Cover depth within tolerance', required: true },
      { item: 'Formwork plumb and aligned', required: true },
    ],
  },
  {
    name: 'Concrete Pour Inspection',
    checklist: [
      { item: 'Slump test passed', required: true },
      { item: 'Mix design verified', required: true },
      { item: 'Sample cubes taken', required: true },
    ],
  },
  {
    name: 'Safety Walkthrough',
    checklist: [
      { item: 'PPE in use on site', required: true },
      { item: 'Scaffolding certified and tagged', required: true },
      { item: 'Emergency exits clear', required: true },
      { item: 'Hazardous materials stored correctly', required: false },
    ],
  },
  {
    name: 'MEP Rough-In Inspection',
    checklist: [
      { item: 'Conduit routing matches drawings', required: true },
      { item: 'Pipe supports installed', required: true },
      { item: 'Access panels positioned', required: false },
    ],
  },
  {
    name: 'Pre-Handover Inspection',
    checklist: [
      { item: 'Snag list items resolved', required: true },
      { item: 'As-built drawings complete', required: true },
      { item: 'O&M manuals handed over', required: true },
      { item: 'Keys and access credentials transferred', required: true },
    ],
  },
];

async function seedInspectionTypes(tx: Tx): Promise<void> {
  for (const it of INSPECTION_TYPES) {
    const checklist = JSON.stringify(it.checklist);
    await tx.$executeRaw`
      INSERT INTO site_ops.inspection_types
        (tenant_id, name, checklist_template, is_active, created_by)
      VALUES
        (${SEED_TENANT_ID}::uuid, ${it.name}, ${checklist}::jsonb, true, ${SEED_CREATED_BY}::uuid)
      ON CONFLICT (tenant_id, name) DO NOTHING
    `;
  }
  logger.info({ count: INSPECTION_TYPES.length }, 'seed: inspection_types done');
}

// ─── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info({ tenantId: SEED_TENANT_ID, createdBy: SEED_CREATED_BY }, 'seed: starting');

  await withTenantCtx(async (tx) => {
    await seedWorkCategories(tx);
    await seedIssueCategories(tx);
    await seedCostCategories(tx);
    await seedInspectionTypes(tx);
  });

  logger.info('seed: complete');
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'seed: fatal error');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
