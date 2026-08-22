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

// Load .env before reading DATABASE_URL: Prisma 7's driver adapter (createPrismaClient) reads
// process.env directly and — unlike the old @prisma/client — does not auto-load .env (ADR-041).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/shared/prisma/create-prisma-client';
import { createLogger } from '@cos/logger';
import { KafkaTopicProvisioner } from '@cos/kafka';

const logger = createLogger('seed');

const SEED_TENANT_ID = process.env['SEED_TENANT_ID'] ?? '00000000-0000-4000-8000-000000000001';
const SEED_CREATED_BY = process.env['SEED_CREATED_BY'] ?? '00000000-0000-4000-8000-000000000000';

// Dev login identity — mirrors the dev@cos.local user baked into the Keycloak realm import
// (infrastructure/keycloak/realms/construction-os-realm.json). SEED_KEYCLOAK_USER_ID must
// match that user's id so platform.users links to the Keycloak account. user_id matches the
// `user_id` attribute on the Keycloak user (→ JWT claim). Login: dev@cos.local / Dev12345!
const SEED_USER_ID = process.env['SEED_USER_ID'] ?? '00000000-0000-4000-8000-000000000010';
const SEED_KEYCLOAK_USER_ID =
  process.env['SEED_KEYCLOAK_USER_ID'] ?? 'c69cd999-42f2-4268-ae8f-328bbb9e6cf8';

type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const prisma = createPrismaClient();

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

// Dev tenant + dev user (platform schema). Required for the dev@cos.local Keycloak login to
// resolve a valid, active tenant on the backend. Runs as the seed superuser (RLS bypassed).
async function seedPlatformDevTenant(): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO platform.tenants
      (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
    VALUES
      (${SEED_TENANT_ID}::uuid, 'DEV', 'Dev Tenant', 'construction-os', 'PROFESSIONAL', true)
    ON CONFLICT (tenant_id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO platform.users
      (user_id, tenant_id, keycloak_user_id, email, display_name, is_active, mfa_enabled)
    VALUES
      (${SEED_USER_ID}::uuid, ${SEED_TENANT_ID}::uuid, ${SEED_KEYCLOAK_USER_ID}::uuid,
       'dev@cos.local', 'Dev User', true, false)
    ON CONFLICT (user_id) DO NOTHING
  `;

  // Field-staff users for SMS-OTP (Path A) login. Phone numbers match the Detox e2e specs
  // (apps/mobile/e2e/*); keycloak_user_id / user_id / role mirror the realm users in
  // construction-os-realm.json so the post-OTP Keycloak Direct Grant resolves a real account.
  const FIELD_USERS = [
    {
      userId: '00000000-0000-4000-8000-000000000011',
      kcId: '00000000-0000-4000-8000-000000000021',
      phone: '+66800000001',
      email: 'somchai.jaidee@devtenant.co.th',
      name: 'Somchai Jaidee',
      role: 'SITE_WORKER',
    },
    {
      userId: '00000000-0000-4000-8000-000000000012',
      kcId: '00000000-0000-4000-8000-000000000022',
      phone: '+66800000002',
      email: 'pranee.suksai@devtenant.co.th',
      name: 'Pranee Suksai',
      role: 'SITE_ENGINEER',
    },
    {
      // User A for the sync-conflict E2E (task progress Max-wins). SITE_WORKER because the Tasks tab
      // (task detail + progress update) is a SITE_WORKER screen.
      userId: '00000000-0000-4000-8000-000000000013',
      kcId: '00000000-0000-4000-8000-000000000023',
      phone: '+66800000003',
      email: 'anan.thongdee@devtenant.co.th',
      name: 'Anan Thongdee',
      role: 'SITE_WORKER',
    },
  ] as const;
  for (const u of FIELD_USERS) {
    await prisma.$executeRaw`
      INSERT INTO platform.users
        (user_id, tenant_id, keycloak_user_id, email, display_name, phone_number, is_active, mfa_enabled)
      VALUES
        (${u.userId}::uuid, ${SEED_TENANT_ID}::uuid, ${u.kcId}::uuid,
         ${u.email}, ${u.name}, ${u.phone}, true, false)
      ON CONFLICT (user_id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
      VALUES (${SEED_TENANT_ID}::uuid, ${u.userId}::uuid, ${u.role}::platform."CosRoleEnum")
      ON CONFLICT (tenant_id, user_id) DO NOTHING
    `;
  }

  // Workforce profile for the SITE_WORKER field user, so GET /workers/me (self check-in, option A)
  // resolves a worker. Linked via user_id to the +66800000001 account. Superuser insert (RLS bypass).
  await prisma.$executeRaw`
    INSERT INTO workforce.workers
      (worker_id, tenant_id, employee_code, full_name, trade_type, employment_type, is_active, user_id)
    VALUES
      ('00000000-0000-4000-8000-000000000031'::uuid, ${SEED_TENANT_ID}::uuid, 'EMP-001',
       'Somchai Jaidee', 'General Labour', 'PERMANENT'::workforce.employment_type_enum, true,
       '00000000-0000-4000-8000-000000000011'::uuid)
    ON CONFLICT (worker_id) DO NOTHING
  `;

  // One inspection for the SITE_ENGINEER, so GET /site/inspections returns a row and the offline
  // inspection E2E has an item to open. inspected_by = the +66800000002 user. Superuser insert.
  await prisma.$executeRaw`
    INSERT INTO site_ops.inspections
      (inspection_id, project_id, tenant_id, checklist_id, status, inspected_by, inspected_at, notes)
    VALUES
      ('00000000-0000-4000-8000-000000000041'::uuid, '00000000-0000-4000-8000-000000000061'::uuid,
       ${SEED_TENANT_ID}::uuid, '00000000-0000-4000-8000-000000000051'::uuid, 'PENDING',
       '00000000-0000-4000-8000-000000000012'::uuid, now(), 'E2E seed inspection')
    ON CONFLICT (inspection_id) DO NOTHING
  `;

  logger.info({ tenantId: SEED_TENANT_ID, userId: SEED_USER_ID }, 'seed: dev tenant + user done');
}

async function main(): Promise<void> {
  logger.info({ tenantId: SEED_TENANT_ID, createdBy: SEED_CREATED_BY }, 'seed: starting');

  await seedPlatformDevTenant();

  await withTenantCtx(async (tx) => {
    await seedWorkCategories(tx);
    await seedIssueCategories(tx);
    await seedCostCategories(tx);
    await seedInspectionTypes(tx);
  });

  // Provision the dev tenant's Kafka topics (per-tenant model, spec §7.3) + the shared
  // platform topics, so producers/consumers have their topics in local dev. Idempotent.
  const provisioner = new KafkaTopicProvisioner();
  await provisioner.connect();
  try {
    await provisioner.ensurePlatformTopics();
    await provisioner.provisionTenant(SEED_TENANT_ID);
    // Tenant-lifecycle events (identity.*) are emitted with tenant_id='platform' by
    // TenantService.publishEvent — provision that pseudo-tenant's topics too.
    await provisioner.provisionTenant('platform');
    logger.info({ tenantId: SEED_TENANT_ID }, 'seed: kafka topics provisioned');
  } finally {
    await provisioner.disconnect();
  }

  logger.info('seed: complete');
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'seed: fatal error');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
