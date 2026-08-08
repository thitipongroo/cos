// Realistic demo dataset — one construction company (tenant) that has been operating on the
// platform for ~1 month across 5 live projects. Populated across every operational domain:
// projects, spatial hierarchy, BOQ, procurement (PR→RFQ→PO→delivery→invoice), finance
// (budgets, cost transactions, payments, contracts), site operations (daily reports, issues,
// inspections, incidents, permits, material use), workforce (attendance, timesheets),
// equipment, notifications and AI report history.
//
// Anchored to fixed calendar dates so re-runs are idempotent; all inserts use deterministic
// UUIDs + ON CONFLICT DO NOTHING. Runs as the `cos` role (RLS bypassed) but also sets
// app.current_tenant_id for correctness.
//
// Run:  DATABASE_URL=<direct pg url> pnpm exec ts-node prisma/seed-realistic.ts
import './load-root-env';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/shared/prisma/create-prisma-client';
import { createLogger } from '@cos/logger';

const logger = createLogger('seed-realistic');
const prisma = createPrismaClient();

// Deterministic UUID (v5-shaped) from a stable key → idempotent inserts.
function uid(key: string): string {
  const h = createHash('sha256').update(`cos-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Fixed "now" so the month of activity lands on stable calendar dates (today ≈ 2026-07-07).
const D = (s: string): string => s; // YYYY-MM-DD literal passthrough (documentation aid)
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isWeekend(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}
function workdays(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  while (cur <= endIso) {
    if (!isWeekend(cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
function ts(iso: string, hhmm: string): string {
  return `${iso}T${hhmm}:00+07:00`;
}

const TENANT_ID = uid('tenant/ekachai');
const REALM = 'construction-os-dev';
const THB = 'THB';
const SEED_END = D('2026-07-03'); // last working Friday of the ~1-month window

// ─── Users (one per role area; Thai names, company domain) ───────────────────
type SeedUser = { key: string; name: string; email: string; role: string; phone?: string };
// Every seeded user carries a phone_number so the React Native app (which renders BOTH auth paths for
// every role — master §Phase 10) can be driven through Path A (phone + SMS OTP) for per-role screen
// capture. Office/management roles still use Path B (Keycloak) in real usage per §5.4; the phone here
// is demo/test data only.
const USERS: SeedUser[] = [
  {
    key: 'exec',
    name: 'Wichai Ekachai',
    email: 'wichai.e@ekachai.co.th',
    role: 'EXECUTIVE',
    phone: '+66811000001',
  },
  {
    key: 'admin',
    name: 'Suphaporn Rattanakul',
    email: 'suphaporn.r@ekachai.co.th',
    role: 'TENANT_ADMIN',
    phone: '+66811000002',
  },
  {
    key: 'pm1',
    name: 'Thanawat Boonmee',
    email: 'thanawat.b@ekachai.co.th',
    role: 'PROJECT_MANAGER',
    phone: '+66811000003',
  },
  {
    key: 'pm2',
    name: 'Kanya Srisawat',
    email: 'kanya.s@ekachai.co.th',
    role: 'PROJECT_MANAGER',
    phone: '+66811000004',
  },
  {
    key: 'proc',
    name: 'Nattapong Wongchai',
    email: 'nattapong.w@ekachai.co.th',
    role: 'PROCUREMENT_OFFICER',
    phone: '+66811000005',
  },
  {
    key: 'procmgr',
    name: 'Rungnapa Chaiyo',
    email: 'rungnapa.c@ekachai.co.th',
    role: 'PROC_MANAGER',
    phone: '+66811000006',
  },
  {
    key: 'fin',
    name: 'Pimchanok Thongchai',
    email: 'pimchanok.t@ekachai.co.th',
    role: 'FINANCE',
    phone: '+66811000011',
  },
  {
    key: 'safety',
    name: 'Decha Phumipat',
    email: 'decha.p@ekachai.co.th',
    role: 'SAFETY_OFFICER',
    phone: '+66811000007',
  },
  {
    key: 'se1',
    name: 'Adisorn Meesap',
    email: 'adisorn.m@ekachai.co.th',
    role: 'SITE_ENGINEER',
    phone: '+66811000008',
  },
  {
    key: 'se2',
    name: 'Waraporn Klinhom',
    email: 'waraporn.k@ekachai.co.th',
    role: 'SITE_ENGINEER',
    phone: '+66811000009',
  },
  {
    key: 'sw1',
    name: 'Somsak Duangdee',
    email: 'somsak.d@ekachai.co.th',
    role: 'SITE_WORKER',
    phone: '+66811000010',
  },
  {
    key: 'crm',
    name: 'Chalermsak Nithat',
    email: 'chalermsak.n@ekachai.co.th',
    role: 'CRM_SALES_MANAGER',
    phone: '+66811000012',
  },
];
const U = (k: string): string => uid(`user/${k}`);

// Demo HR department per role (platform.users.department — supports future HR features).
function deptFor(role: string): string {
  switch (role) {
    case 'EXECUTIVE':
      return 'Executive Office';
    case 'TENANT_ADMIN':
      return 'Administration';
    case 'PROJECT_MANAGER':
      return 'Project Management';
    case 'PROCUREMENT_OFFICER':
    case 'PROC_MANAGER':
      return 'Procurement';
    case 'FINANCE':
      return 'Finance';
    case 'SAFETY_OFFICER':
      return 'Safety & Compliance';
    case 'SITE_ENGINEER':
      return 'Structural Engineering';
    case 'SITE_WORKER':
      return 'Field Operations';
    case 'CRM_SALES_MANAGER':
      return 'Sales & CRM';
    default:
      return 'General';
  }
}

// ─── Projects ────────────────────────────────────────────────────────────────
type SeedProject = {
  key: string;
  code: string;
  name: string;
  type: string;
  budget: number;
  start: string;
  end: string;
  pm: string;
  se: string;
  lat: number;
  lng: number;
  client: string;
  buildings?: { name: string; type: string; floors: number }[];
};
const PROJECTS: SeedProject[] = [
  {
    key: 'skv45',
    code: 'SKV45',
    name: 'The Sukhumvit 45 Residences',
    type: 'RESIDENTIAL',
    budget: 450_000_000,
    start: D('2026-06-02'),
    end: D('2028-05-31'),
    pm: 'pm1',
    se: 'se1',
    lat: 13.7308,
    lng: 100.5698,
    client: 'Sukhumvit Estate Co., Ltd.',
    buildings: [{ name: 'Tower A', type: 'Residential High-Rise', floors: 32 }],
  },
  {
    key: 'r9ct',
    code: 'R9CT',
    name: 'Rama IX Corporate Tower',
    type: 'COMMERCIAL',
    budget: 320_000_000,
    start: D('2026-06-05'),
    end: D('2028-02-28'),
    pm: 'pm2',
    se: 'se2',
    lat: 13.758,
    lng: 100.5654,
    client: 'Rama IX Holdings PCL',
    buildings: [{ name: 'Office Block', type: 'Office Building', floors: 24 }],
  },
  {
    key: 'bnw2',
    code: 'BNW2',
    name: 'Bangna Logistics Warehouse Phase 2',
    type: 'INDUSTRIAL',
    budget: 145_000_000,
    start: D('2026-06-08'),
    end: D('2027-04-30'),
    pm: 'pm1',
    se: 'se1',
    lat: 13.668,
    lng: 100.701,
    client: 'Bangna Logistics Park Co., Ltd.',
    buildings: [{ name: 'Warehouse Unit 2', type: 'Warehouse', floors: 1 }],
  },
  {
    key: 'cwrd',
    code: 'CWRD',
    name: 'Chaeng Watthana Access Road Upgrade',
    type: 'INFRASTRUCTURE',
    budget: 88_000_000,
    start: D('2026-06-01'),
    end: D('2027-01-31'),
    pm: 'pm2',
    se: 'se2',
    lat: 13.889,
    lng: 100.556,
    client: 'Department of Highways',
  },
  {
    key: 'lpgh',
    code: 'LPGH',
    name: 'Ladprao Garden Townhomes',
    type: 'RESIDENTIAL',
    budget: 210_000_000,
    start: D('2026-06-10'),
    end: D('2027-09-30'),
    pm: 'pm1',
    se: 'se1',
    lat: 13.816,
    lng: 100.575,
    client: 'Ladprao Property Development Co., Ltd.',
    buildings: [{ name: 'Block 1', type: 'Townhome', floors: 3 }],
  },
];

// ─── Shared reference data ───────────────────────────────────────────────────
const VENDORS = [
  {
    key: 'insee',
    code: 'V-INSEE',
    name: 'Siam City Cement (INSEE) PCL',
    tax: '0107536000123',
    email: 'sales@siamcitycement.com',
    phone: '+6626676000',
  },
  {
    key: 'tpi',
    code: 'V-TPI',
    name: 'TPI Polene PCL',
    tax: '0107537001234',
    email: 'order@tpipolene.co.th',
    phone: '+6622139000',
  },
  {
    key: 'millcon',
    code: 'V-MILLCON',
    name: 'Millcon Steel PCL',
    tax: '0107556002345',
    email: 'sales@millconsteel.com',
    phone: '+6627634000',
  },
  {
    key: 'scg',
    code: 'V-SCG',
    name: 'SCG Building Materials Co., Ltd.',
    tax: '0105537003456',
    email: 'contact@scgbuildingmaterials.com',
    phone: '+6625860000',
  },
  {
    key: 'crm',
    code: 'V-CPAC',
    name: 'CPAC Ready-Mix Concrete',
    tax: '0105537004567',
    email: 'rmc@cpac.co.th',
    phone: '+6625555000',
  },
  {
    key: 'boon',
    code: 'V-BOON',
    name: 'Boonthavorn Ceramic Co., Ltd.',
    tax: '0105530005678',
    email: 'sales@boonthavorn.com',
    phone: '+6627213000',
  },
];
const V = (k: string): string => uid(`vendor/${k}`);

const MATERIALS = [
  { key: 'rmc', name: 'Ready-Mixed Concrete 240 ksc', category: 'CONCRETE', unit: 'M3' },
  { key: 'db16', name: 'Deformed Steel Bar DB16 SD40', category: 'STEEL', unit: 'TON' },
  { key: 'db12', name: 'Deformed Steel Bar DB12 SD40', category: 'STEEL', unit: 'TON' },
  { key: 'cement', name: 'Portland Cement Type 1', category: 'CONCRETE', unit: 'BAG' },
  { key: 'ply', name: 'Film-Faced Plywood Formwork 15mm', category: 'FORMWORK', unit: 'M2' },
  { key: 'block', name: 'Lightweight Concrete Block Q-CON', category: 'CONCRETE', unit: 'UNIT' },
  { key: 'tile', name: 'Ceramic Floor Tile 60x60', category: 'FINISHES', unit: 'M2' },
  { key: 'conduit', name: 'EMT Electrical Conduit 20mm', category: 'ELECTRICAL', unit: 'M' },
  { key: 'pvc', name: 'PVC Pipe Class 8.5 4"', category: 'PLUMBING', unit: 'M' },
  { key: 'sand', name: 'Washed River Sand', category: 'CONCRETE', unit: 'M3' },
];
const M = (k: string): string => uid(`material/${k}`);

const WEATHER = [
  'แจ่มใส',
  'มีเมฆบางส่วน',
  'ร้อนชื้น',
  'ครึ้มฟ้าครึ้มฝน',
  'ฝนฟ้าคะนองช่วงบ่าย',
  'ฝนตกเล็กน้อย',
];
const TRADES = [
  'ช่างเหล็ก',
  'ช่างปูน',
  'ช่างไม้',
  'ช่างไฟฟ้า',
  'ช่างประปา',
  'กรรมกรทั่วไป',
  'ช่างเชื่อม',
  'ช่างสี',
];

// Worker pool (shared; allocated across projects).
const WORKERS = Array.from({ length: 18 }, (_, i) => {
  const first = [
    'Somchai',
    'Prasit',
    'Wirat',
    'Suriya',
    'Anucha',
    'Kittipong',
    'Boonlert',
    'Narong',
    'Sakchai',
    'Prayut',
    'Chatchai',
    'Weerayut',
    'Manop',
    'Adul',
    'Surachai',
    'Thawee',
    'Pichai',
    'Sompong',
  ][i];
  const last = [
    'Jaidee',
    'Sukjai',
    'Meesuk',
    'Thongdee',
    'Rakdee',
    'Boonsong',
    'Kaewkla',
    'Pintong',
    'Saengchan',
    'Duangkaew',
    'Yindee',
    'Chuenjai',
    'Wongsa',
    'Namwong',
    'Petchda',
    'Srimuang',
    'Chaidet',
    'Klahan',
  ][i];
  return {
    key: `w${i + 1}`,
    code: `EMP-${String(i + 1).padStart(3, '0')}`,
    name: `${first} ${last}`,
    trade: TRADES[i % TRADES.length],
  };
});
const W = (k: string): string => uid(`worker/${k}`);

// Equipment fleet (shared).
const EQUIPMENT = [
  {
    key: 'crane1',
    code: 'EQ-CR-01',
    name: 'Tower Crane Potain MDT 219',
    type: 'CRANE',
    cost: 18_500_000,
  },
  { key: 'crane2', code: 'EQ-CR-02', name: 'Mobile Crane 50T', type: 'CRANE', cost: 9_200_000 },
  { key: 'exc1', code: 'EQ-EX-01', name: 'Excavator CAT 320', type: 'EXCAVATOR', cost: 4_800_000 },
  {
    key: 'exc2',
    code: 'EQ-EX-02',
    name: 'Excavator Komatsu PC210',
    type: 'EXCAVATOR',
    cost: 5_100_000,
  },
  {
    key: 'mix1',
    code: 'EQ-MX-01',
    name: 'Concrete Mixer Truck 6m³',
    type: 'CONCRETE_MIXER',
    cost: 3_600_000,
  },
  {
    key: 'gen1',
    code: 'EQ-GN-01',
    name: 'Diesel Generator 250kVA',
    type: 'GENERATOR',
    cost: 850_000,
  },
  {
    key: 'scaf1',
    code: 'EQ-SC-01',
    name: 'Scaffolding System (set)',
    type: 'SCAFFOLD',
    cost: 1_200_000,
  },
  {
    key: 'veh1',
    code: 'EQ-VH-01',
    name: 'Isuzu Dump Truck 10-wheel',
    type: 'VEHICLE',
    cost: 2_400_000,
  },
];
const E = (k: string): string => uid(`equip/${k}`);

async function run(): Promise<void> {
  logger.info({ tenantId: TENANT_ID }, 'seed-realistic: start');

  // Platform (RLS-exempt) — tenant + users + memberships.
  await prisma.$executeRaw`
    INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
    VALUES (${TENANT_ID}::uuid, 'EKC', 'Ekachai Engineering & Construction Co., Ltd.', ${REALM}, 'PROFESSIONAL'::platform."PlanType", true)
    ON CONFLICT (tenant_id) DO NOTHING`;
  for (const u of USERS) {
    await prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name, phone_number, is_active, mfa_enabled, department)
      VALUES (${U(u.key)}::uuid, ${TENANT_ID}::uuid, ${uid(`kc/${u.key}`)}, ${u.email}, ${u.name}, ${u.phone ?? null}, true,
              ${u.role === 'TENANT_ADMIN' || u.role === 'FINANCE'}, ${deptFor(u.role)})
      ON CONFLICT (user_id) DO UPDATE SET department = EXCLUDED.department`;
    await prisma.$executeRaw`
      INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
      VALUES (${TENANT_ID}::uuid, ${U(u.key)}::uuid, ${u.role}::platform."CosRoleEnum")
      ON CONFLICT (tenant_id, user_id) DO NOTHING`;
  }
  // Multi-role demo (NIST RBAC / Keycloak union model — one person, several jobs): the Project Manager
  // Thanawat also serves as the site's Safety Officer, so he holds SAFETY_OFFICER as an additional role
  // on top of his primary PROJECT_MANAGER. Effective permissions = union of both roles.
  await prisma.$executeRaw`
    INSERT INTO platform.user_additional_roles (user_id, tenant_id, role, assigned_by)
    VALUES (${U('pm1')}::uuid, ${TENANT_ID}::uuid, 'SAFETY_OFFICER'::platform."CosRoleEnum", ${U('admin')}::uuid)
    ON CONFLICT (user_id, tenant_id, role) DO NOTHING`;
  logger.info({ users: USERS.length }, 'seed-realistic: tenant + users');

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${TENANT_ID}'`);
      // TimescaleDB telemetry hypertables have no PK/unique constraint, so ON CONFLICT cannot dedupe
      // them — clear this tenant's telemetry rows first to keep re-runs idempotent.
      await tx.$executeRawUnsafe(
        `DELETE FROM workforce_telemetry.attendance_logs WHERE tenant_id = '${TENANT_ID}'`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM workforce_telemetry.timesheets WHERE tenant_id = '${TENANT_ID}'`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM equipment_telemetry.equipment_utilization WHERE tenant_id = '${TENANT_ID}'`,
      );
      // Full reset of this tenant's domain rows so re-runs pick up edited (e.g. Thai) content —
      // deterministic-UUID rows are otherwise kept by ON CONFLICT DO NOTHING.
      await wipeTenant(tx);
      await seedMasterData(tx);
      await seedVendorsMaterials(tx);
      await seedWorkersEquipment(tx);
      for (const p of PROJECTS) await seedProject(tx, p);
      await seedCrm(tx);
      await seedNotifications(tx);
      await seedAiReports(tx);
    },
    { timeout: 180_000 },
  );

  logger.info('seed-realistic: complete');
}

type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

async function seedMasterData(tx: Tx): Promise<void> {
  const wc = [
    ['EARTHWORK', 'Earthwork', 'Site Preparation'],
    ['FOUNDATION', 'Foundation', 'Substructure'],
    ['STRUCTURE', 'Structure', 'Superstructure'],
    ['MEP', 'MEP', 'Mechanical Electrical Plumbing'],
    ['ARCHITECTURE', 'Architecture', 'Finishing'],
    ['FINISHING', 'Finishing', 'Finishing'],
  ];
  for (const [code, name, phase] of wc) {
    await tx.$executeRaw`INSERT INTO site_ops.work_categories (tenant_id, name, code, phase, is_active, created_by)
      VALUES (${TENANT_ID}::uuid, ${name}, ${code}, ${phase}, true, ${U('admin')}::uuid)
      ON CONFLICT (tenant_id, code) DO NOTHING`;
  }
  const ic = [
    ['Safety', 'HIGH'],
    ['Quality', 'MEDIUM'],
    ['Delay', 'MEDIUM'],
    ['Material', 'MEDIUM'],
    ['Design', 'HIGH'],
    ['Other', 'MEDIUM'],
  ];
  for (const [name, sev] of ic) {
    await tx.$executeRaw`INSERT INTO site_ops.issue_categories (tenant_id, name, severity_default, is_active, created_by)
      VALUES (${TENANT_ID}::uuid, ${name}, ${sev}::"IssueSeverityDefault", true, ${U('admin')}::uuid)
      ON CONFLICT (tenant_id, name) DO NOTHING`;
  }
  for (const [name, type] of [
    ['Material', 'MATERIAL'],
    ['Labor', 'LABOR'],
    ['Equipment', 'EQUIPMENT'],
    ['Overhead', 'OVERHEAD'],
  ]) {
    await tx.$executeRaw`INSERT INTO finance.cost_categories (tenant_id, name, type, is_active, created_by)
      VALUES (${TENANT_ID}::uuid, ${name}, ${type}::"CostCategoryType", true, ${U('admin')}::uuid)
      ON CONFLICT (tenant_id, name) DO NOTHING`;
  }
  const inspTypes = [
    [
      'Foundation Inspection',
      [
        { item: 'Rebar placement correct', required: true },
        { item: 'Cover depth within tolerance', required: true },
      ],
    ],
    [
      'Concrete Pour Inspection',
      [
        { item: 'Slump test passed', required: true },
        { item: 'Sample cubes taken', required: true },
      ],
    ],
    [
      'Safety Walkthrough',
      [
        { item: 'PPE in use on site', required: true },
        { item: 'Scaffolding certified and tagged', required: true },
      ],
    ],
    [
      'MEP Rough-In Inspection',
      [
        { item: 'Conduit routing matches drawings', required: true },
        { item: 'Pipe supports installed', required: true },
      ],
    ],
  ] as const;
  for (const [name, checklist] of inspTypes) {
    await tx.$executeRaw`INSERT INTO site_ops.inspection_types (tenant_id, name, checklist_template, is_active, created_by)
      VALUES (${TENANT_ID}::uuid, ${name}, ${JSON.stringify(checklist)}::jsonb, true, ${U('admin')}::uuid)
      ON CONFLICT (tenant_id, name) DO NOTHING`;
  }
}

async function seedVendorsMaterials(tx: Tx): Promise<void> {
  for (const v of VENDORS) {
    await tx.$executeRaw`INSERT INTO procurement.vendors (vendor_id, tenant_id, vendor_code, vendor_name, tax_id, contact_email, contact_phone, is_active)
      VALUES (${V(v.key)}::uuid, ${TENANT_ID}::uuid, ${v.code}, ${v.name}, ${v.tax}, ${v.email}, ${v.phone}, true)
      ON CONFLICT (vendor_id) DO NOTHING`;
  }
  for (const m of MATERIALS) {
    await tx.$executeRaw`INSERT INTO procurement.materials (material_id, tenant_id, name, category, unit, is_active, created_by)
      VALUES (${M(m.key)}::uuid, ${TENANT_ID}::uuid, ${m.name}, ${m.category}::"MaterialCategory", ${m.unit}::"MaterialUnit", true, ${U('proc')}::uuid)
      ON CONFLICT (material_id) DO NOTHING`;
  }
}

async function seedWorkersEquipment(tx: Tx): Promise<void> {
  const empType = ['PERMANENT', 'CONTRACT', 'SUBCONTRACT'];
  for (let i = 0; i < WORKERS.length; i++) {
    const w = WORKERS[i];
    await tx.$executeRaw`INSERT INTO workforce.workers (worker_id, tenant_id, employee_code, full_name, trade_type, employment_type, contact_phone, is_active)
      VALUES (${W(w.key)}::uuid, ${TENANT_ID}::uuid, ${w.code}, ${w.name}, ${w.trade},
              ${empType[i % 3]}::workforce.employment_type_enum, ${`+6689${String(1000000 + i).slice(-7)}`}, true)
      ON CONFLICT (worker_id) DO NOTHING`;
  }
  for (const eq of EQUIPMENT) {
    const status = eq.key === 'exc2' ? 'MAINTENANCE' : 'IN_USE';
    await tx.$executeRaw`INSERT INTO equipment.equipment (equipment_id, tenant_id, equipment_code, equipment_name, equipment_type, status, purchase_date, purchase_cost, currency_code)
      VALUES (${E(eq.key)}::uuid, ${TENANT_ID}::uuid, ${eq.code}, ${eq.name}, ${eq.type}::equipment.equipment_type_enum,
              ${status}::equipment.equipment_status_enum, ${'2024-01-15'}::date, ${eq.cost}, ${THB})
      ON CONFLICT (equipment_id) DO NOTHING`;
  }
  // Maintenance records
  await tx.$executeRaw`INSERT INTO equipment.equipment_maintenance (maintenance_id, equipment_id, tenant_id, maintenance_type, status, scheduled_at, completed_at, cost, currency_code, performed_by, notes)
    VALUES (${uid('maint/exc2')}::uuid, ${E('exc2')}::uuid, ${TENANT_ID}::uuid, 'REPAIR'::equipment.maintenance_type_enum, 'IN_PROGRESS'::equipment.maintenance_status_enum,
            ${ts('2026-07-01', '09:00')}::timestamptz, NULL, ${45000}, ${THB}, 'Komatsu Service Center', 'Hydraulic pump replacement')
    ON CONFLICT (maintenance_id) DO NOTHING`;
  await tx.$executeRaw`INSERT INTO equipment.equipment_maintenance (maintenance_id, equipment_id, tenant_id, maintenance_type, status, scheduled_at, completed_at, cost, currency_code, performed_by, notes)
    VALUES (${uid('maint/crane1')}::uuid, ${E('crane1')}::uuid, ${TENANT_ID}::uuid, 'SCHEDULED'::equipment.maintenance_type_enum, 'COMPLETED'::equipment.maintenance_status_enum,
            ${ts('2026-06-20', '08:00')}::timestamptz, ${ts('2026-06-20', '14:00')}::timestamptz, ${28000}, ${THB}, 'Potain Certified Inspector', 'Quarterly safety inspection')
    ON CONFLICT (maintenance_id) DO NOTHING`;
}

// BOQ category template (share, cost scaled per project).
const BOQ_TEMPLATE = [
  {
    cat: 'Earthwork',
    code: 'A',
    items: [
      ['Site clearing & excavation', 'M3', 8500, 320],
      ['Backfill & compaction', 'M3', 4200, 280],
    ],
  },
  {
    cat: 'Foundation',
    code: 'B',
    items: [
      ['Bored pile ø600mm', 'M', 1800, 3200],
      ['Pile cap concrete 240ksc', 'M3', 640, 2650],
    ],
  },
  {
    cat: 'Structure',
    code: 'C',
    items: [
      ['Reinforced concrete columns', 'M3', 1250, 4200],
      ['RC slab & beam', 'M3', 3800, 3900],
      ['Reinforcement steel', 'TON', 920, 24500],
    ],
  },
  {
    cat: 'Architecture',
    code: 'D',
    items: [
      ['Masonry wall (Q-CON)', 'M2', 12500, 480],
      ['Ceramic tile finishing', 'M2', 9800, 650],
    ],
  },
  {
    cat: 'MEP',
    code: 'E',
    items: [
      ['Electrical conduit & wiring', 'M', 14500, 180],
      ['Sanitary piping', 'M', 6800, 220],
    ],
  },
] as const;

async function seedProject(tx: Tx, p: SeedProject): Promise<void> {
  const pid = uid(`project/${p.key}`);
  await tx.$executeRaw`
    INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, budget_amount, budget_currency, start_date, end_date, work_hours_start, work_hours_end, created_by)
    VALUES (${pid}::uuid, ${TENANT_ID}::uuid, ${p.code}, ${p.name}, ${p.type}::"ProjectType", 'ACTIVE'::"ProjectStatus", ${p.budget}, ${THB}, ${p.start}::date, ${p.end}::date, '07:00'::time, '18:00'::time, ${U(p.pm)}::uuid)
    ON CONFLICT (project_id) DO NOTHING`;

  // Members: PM, site engineer, safety officer, finance, executive, site worker.
  //
  // `sw1` was missing until 2026-08-08 and its absence was not cosmetic: `GET /projects/mine` reads
  // projects.project_members, so the seeded SITE_WORKER belonged to nothing and every screen the role
  // owns — the project picker, tasks, the daily report, issue create — rendered an empty state on a
  // fully seeded database. A crew member IS a member of the project they work on, so seeding it is
  // the realistic fixture, not a convenience for screenshots (product-owner decision 2026-08-08).
  for (const [k, role] of [
    [p.pm, 'PROJECT_MANAGER'],
    [p.se, 'SITE_ENGINEER'],
    ['safety', 'SAFETY_OFFICER'],
    ['fin', 'FINANCE'],
    ['exec', 'EXECUTIVE'],
    ['sw1', 'SITE_WORKER'],
  ] as const) {
    await tx.$executeRaw`INSERT INTO projects.project_members (membership_id, project_id, tenant_id, user_id, role, assigned_by)
      VALUES (${uid(`pm/${p.key}/${k}`)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${U(k)}::uuid, ${role}::"ProjectMemberRole", ${U('admin')}::uuid)
      ON CONFLICT (membership_id) DO NOTHING`;
  }

  // Spatial hierarchy (buildings/floors/rooms) for vertical projects.
  if (p.buildings) {
    for (let bi = 0; bi < p.buildings.length; bi++) {
      const b = p.buildings[bi];
      const bid = uid(`bldg/${p.key}/${bi}`);
      await tx.$executeRaw`INSERT INTO projects.buildings (building_id, project_id, tenant_id, building_name, building_type, total_floors, location, status, created_by)
        VALUES (${bid}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${b.name}, ${b.type}, ${b.floors}, ${p.name}, 'UNDER_CONSTRUCTION', ${U(p.pm)}::uuid)
        ON CONFLICT (building_id) DO NOTHING`;
      const floorsToSeed = Math.min(b.floors, 4);
      for (let f = 1; f <= floorsToSeed; f++) {
        const fid = uid(`floor/${p.key}/${bi}/${f}`);
        await tx.$executeRaw`INSERT INTO projects.floors (floor_id, building_id, tenant_id, floor_number, gross_area_sqm, created_by)
          VALUES (${fid}::uuid, ${bid}::uuid, ${TENANT_ID}::uuid, ${f}, ${850 + f * 12}, ${U(p.pm)}::uuid)
          ON CONFLICT (floor_id) DO NOTHING`;
        for (let r = 1; r <= 2; r++) {
          await tx.$executeRaw`INSERT INTO projects.rooms (room_id, floor_id, tenant_id, room_number, room_type, area_sqm, created_by)
            VALUES (${uid(`room/${p.key}/${bi}/${f}/${r}`)}::uuid, ${fid}::uuid, ${TENANT_ID}::uuid, ${`${f}0${r}`}, ${r === 1 ? 'Unit' : 'Common Area'}, ${45 + r * 8}, ${U(p.pm)}::uuid)
            ON CONFLICT (room_id) DO NOTHING`;
        }
      }
    }
  }

  // BOQ — one APPROVED version, scaled to ~85% of budget.
  const scale = p.budget / 450_000_000;
  const vid = uid(`boqv/${p.key}`);
  let boqTotal = 0;
  await tx.$executeRaw`INSERT INTO boq.boq_versions (version_id, project_id, tenant_id, version_number, version_name, status, total_estimated_amount, total_estimated_currency, approved_by, approved_at, created_by)
    VALUES (${vid}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, 1, 'Tender BOQ Rev.1', 'APPROVED', 0, ${THB}, ${U(p.pm)}::uuid, ${ts(p.start, '10:00')}::timestamptz, ${U(p.pm)}::uuid)
    ON CONFLICT (version_id) DO NOTHING`;
  for (const grp of BOQ_TEMPLATE) {
    const cid = uid(`boqc/${p.key}/${grp.code}`);
    let subtotal = 0;
    await tx.$executeRaw`INSERT INTO boq.boq_categories (category_id, version_id, tenant_id, category_code, category_name, sort_order, subtotal_amount)
      VALUES (${cid}::uuid, ${vid}::uuid, ${TENANT_ID}::uuid, ${grp.code}, ${grp.cat}, ${grp.code.charCodeAt(0)}, 0)
      ON CONFLICT (category_id) DO NOTHING`;
    for (let ii = 0; ii < grp.items.length; ii++) {
      const [desc, unit, qty, unitCost] = grp.items[ii];
      const q = Math.round((qty as number) * scale);
      const total = q * (unitCost as number);
      subtotal += total;
      boqTotal += total;
      await tx.$executeRaw`INSERT INTO boq.boq_items (item_id, category_id, version_id, tenant_id, item_code, description, unit, quantity, unit_cost, estimated_total, currency_code, sort_order)
        VALUES (${uid(`boqi/${p.key}/${grp.code}/${ii}`)}::uuid, ${cid}::uuid, ${vid}::uuid, ${TENANT_ID}::uuid, ${`${grp.code}.${ii + 1}`}, ${desc}, ${unit}, ${q}, ${unitCost}, ${total}, ${THB}, ${ii})
        ON CONFLICT (item_id) DO NOTHING`;
    }
    await tx.$executeRaw`UPDATE boq.boq_categories SET subtotal_amount=${subtotal} WHERE category_id=${cid}::uuid`;
  }
  await tx.$executeRaw`UPDATE boq.boq_versions SET total_estimated_amount=${boqTotal} WHERE version_id=${vid}::uuid`;

  // Finance — customer, main contract, project budget + lines.
  const custId = uid(`cust/${p.key}`);
  await tx.$executeRaw`INSERT INTO finance.customers (customer_id, tenant_id, company_name, customer_type, status)
    VALUES (${custId}::uuid, ${TENANT_ID}::uuid, ${p.client}, 'DEVELOPER', 'ACTIVE') ON CONFLICT (customer_id) DO NOTHING`;
  await tx.$executeRaw`INSERT INTO finance.contracts (contract_id, tenant_id, project_id, contract_type, contract_value, customer_id, status)
    VALUES (${uid(`contract/${p.key}`)}::uuid, ${TENANT_ID}::uuid, ${pid}::uuid, 'MAIN_CONTRACT'::finance."ContractType", ${Math.round(p.budget * 1.12)}, ${custId}::uuid, 'ACTIVE')
    ON CONFLICT (contract_id) DO NOTHING`;
  const bid = uid(`budget/${p.key}`);
  await tx.$executeRaw`INSERT INTO finance.project_budgets (budget_id, project_id, tenant_id, total_budget_amount, total_budget_currency, allocated_amount, committed_amount, actual_amount)
    VALUES (${bid}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${p.budget}, ${THB}, ${Math.round(p.budget * 0.85)}, 0, 0)
    ON CONFLICT (budget_id) DO NOTHING`;
  for (const grp of BOQ_TEMPLATE) {
    await tx.$executeRaw`INSERT INTO finance.budget_lines (line_id, budget_id, project_id, tenant_id, line_name, allocated_amount, currency_code)
      VALUES (${uid(`bl/${p.key}/${grp.code}`)}::uuid, ${bid}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${grp.cat}, ${Math.round(p.budget * 0.15 * scale)}, ${THB})
      ON CONFLICT (line_id) DO NOTHING`;
  }

  // Procurement chain — 3 POs (concrete, rebar, formwork) per project with delivery + invoice.
  // Refresh this project's transactional procurement + finance rows so re-runs pick up updated
  // volumes (deterministic-UUID rows would otherwise be kept by ON CONFLICT DO NOTHING).
  await tx.$executeRawUnsafe(`DELETE FROM finance.payments WHERE project_id = '${pid}'`);
  await tx.$executeRawUnsafe(
    `DELETE FROM procurement.invoices WHERE po_id IN (SELECT po_id FROM procurement.purchase_orders WHERE project_id = '${pid}')`,
  );
  await tx.$executeRawUnsafe(
    `DELETE FROM procurement.deliveries WHERE po_id IN (SELECT po_id FROM procurement.purchase_orders WHERE project_id = '${pid}')`,
  );
  await tx.$executeRawUnsafe(
    `DELETE FROM procurement.po_line_items WHERE po_id IN (SELECT po_id FROM procurement.purchase_orders WHERE project_id = '${pid}')`,
  );
  await tx.$executeRawUnsafe(`DELETE FROM finance.cost_transactions WHERE project_id = '${pid}'`);
  await tx.$executeRawUnsafe(`DELETE FROM procurement.purchase_orders WHERE project_id = '${pid}'`);
  await tx.$executeRawUnsafe(
    `DELETE FROM procurement.quotations WHERE rfq_id IN (SELECT rfq_id FROM procurement.rfqs WHERE project_id = '${pid}')`,
  );
  await tx.$executeRawUnsafe(`DELETE FROM procurement.rfqs WHERE project_id = '${pid}'`);
  await tx.$executeRawUnsafe(
    `DELETE FROM procurement.purchase_requests WHERE project_id = '${pid}'`,
  );
  let committed = 0,
    actual = 0;
  // Volumes reflect ~1 month of substructure/superstructure works so committed/actual read as a
  // progressed month (most delivered + invoiced, several paid; a couple still in transit).
  const poDefs: {
    key: string;
    vendor: string;
    mat: string;
    qty: number;
    unit: string;
    price: number;
    days: number;
    delivered: boolean;
    paid: boolean;
  }[] = [
    {
      key: 'concrete',
      vendor: 'crm',
      mat: 'rmc',
      qty: Math.round(3200 * scale),
      unit: 'M3',
      price: 2650,
      days: 3,
      delivered: true,
      paid: true,
    },
    {
      key: 'rebar',
      vendor: 'millcon',
      mat: 'db16',
      qty: Math.round(340 * scale),
      unit: 'TON',
      price: 24500,
      days: 6,
      delivered: true,
      paid: true,
    },
    {
      key: 'rebar2',
      vendor: 'millcon',
      mat: 'db12',
      qty: Math.round(180 * scale),
      unit: 'TON',
      price: 23800,
      days: 8,
      delivered: true,
      paid: true,
    },
    {
      key: 'cement',
      vendor: 'insee',
      mat: 'cement',
      qty: Math.round(9500 * scale),
      unit: 'BAG',
      price: 185,
      days: 4,
      delivered: true,
      paid: true,
    },
    {
      key: 'formwork',
      vendor: 'scg',
      mat: 'ply',
      qty: Math.round(8500 * scale),
      unit: 'M2',
      price: 320,
      days: 5,
      delivered: true,
      paid: false,
    },
    {
      key: 'block',
      vendor: 'scg',
      mat: 'block',
      qty: Math.round(22000 * scale),
      unit: 'UNIT',
      price: 42,
      days: 11,
      delivered: true,
      paid: false,
    },
    {
      key: 'formwork2',
      vendor: 'scg',
      mat: 'ply',
      qty: Math.round(4200 * scale),
      unit: 'M2',
      price: 325,
      days: 14,
      delivered: false,
      paid: false,
    },
    {
      key: 'sand',
      vendor: 'crm',
      mat: 'sand',
      qty: Math.round(1800 * scale),
      unit: 'M3',
      price: 480,
      days: 16,
      delivered: false,
      paid: false,
    },
  ];
  for (const po of poDefs) {
    const prId = uid(`pr/${p.key}/${po.key}`);
    const rfqId = uid(`rfq/${p.key}/${po.key}`);
    const poId = uid(`po/${p.key}/${po.key}`);
    const total = po.qty * po.price;
    const orderedAt = addDays(p.start, po.days);
    await tx.$executeRaw`INSERT INTO procurement.purchase_requests (pr_id, project_id, tenant_id, pr_number, status, requested_by, required_date)
      VALUES (${prId}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${`PR-${p.code}-${po.key.toUpperCase()}`}, 'PO_CREATED', ${U('proc')}::uuid, ${addDays(orderedAt, 10)}::date)
      ON CONFLICT (pr_id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO procurement.rfqs (rfq_id, pr_id, project_id, tenant_id, rfq_number, status, deadline, created_by)
      VALUES (${rfqId}::uuid, ${prId}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${`RFQ-${p.code}-${po.key.toUpperCase()}`}, 'AWARDED', ${ts(addDays(orderedAt, 3), '17:00')}::timestamptz, ${U('proc')}::uuid)
      ON CONFLICT (rfq_id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO procurement.quotations (quotation_id, rfq_id, vendor_id, tenant_id, total_amount, currency_code, validity_days, submitted_at, is_selected)
      VALUES (${uid(`quo/${p.key}/${po.key}`)}::uuid, ${rfqId}::uuid, ${V(po.vendor)}::uuid, ${TENANT_ID}::uuid, ${total}, ${THB}, 30, ${ts(addDays(orderedAt, 2), '11:00')}::timestamptz, true)
      ON CONFLICT (quotation_id) DO NOTHING`;
    const poStatus = po.delivered ? 'INVOICED' : 'ACKNOWLEDGED';
    await tx.$executeRaw`INSERT INTO procurement.purchase_orders (po_id, rfq_id, vendor_id, project_id, tenant_id, po_number, status, total_amount, currency_code, delivery_date, created_by)
      VALUES (${poId}::uuid, ${rfqId}::uuid, ${V(po.vendor)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${`PO-${p.code}-${po.key.toUpperCase()}`}, ${poStatus}, ${total}, ${THB}, ${addDays(orderedAt, 12)}::date, ${U('procmgr')}::uuid)
      ON CONFLICT (po_id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO procurement.po_line_items (line_id, po_id, tenant_id, boq_item_id, description, quantity, unit, unit_price, line_total)
      VALUES (${uid(`poli/${p.key}/${po.key}`)}::uuid, ${poId}::uuid, ${TENANT_ID}::uuid, NULL, ${MATERIALS.find((m) => m.key === po.mat)?.name ?? po.key}, ${po.qty}, ${po.unit}, ${po.price}, ${total})
      ON CONFLICT (line_id) DO NOTHING`;
    committed += total;
    // committed cost transaction (from PO)
    await tx.$executeRaw`INSERT INTO finance.cost_transactions (transaction_id, project_id, tenant_id, source_type, source_id, amount, currency_code, transaction_date, description, recorded_by)
      VALUES (${uid(`ct-po/${p.key}/${po.key}`)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, 'PURCHASE_ORDER'::finance."CostSourceType", ${poId}::uuid, ${total}, ${THB}, ${addDays(orderedAt, 3)}::date, ${`Committed: ${po.key}`}, ${U('fin')}::uuid)
      ON CONFLICT (transaction_id) DO NOTHING`;
    if (po.delivered) {
      const invId = uid(`inv/${p.key}/${po.key}`);
      await tx.$executeRaw`INSERT INTO procurement.deliveries (delivery_id, po_id, tenant_id, delivery_note, delivered_at, received_by, notes)
        VALUES (${uid(`del/${p.key}/${po.key}`)}::uuid, ${poId}::uuid, ${TENANT_ID}::uuid, ${`DN-${p.code}-${po.key.toUpperCase()}`}, ${ts(addDays(orderedAt, 12), '10:30')}::timestamptz, ${U(p.se)}::uuid, 'รับครบตามจำนวน ตรวจสอบปริมาณเรียบร้อย')
        ON CONFLICT (delivery_id) DO NOTHING`;
      await tx.$executeRaw`INSERT INTO procurement.invoices (invoice_id, po_id, vendor_id, tenant_id, invoice_number, amount, currency_code, invoice_date, due_date, status)
        VALUES (${invId}::uuid, ${poId}::uuid, ${V(po.vendor)}::uuid, ${TENANT_ID}::uuid, ${`INV-${p.code}-${po.key.toUpperCase()}`}, ${total}, ${THB}, ${addDays(orderedAt, 14)}::date, ${addDays(orderedAt, 44)}::date, 'APPROVED')
        ON CONFLICT (invoice_id) DO NOTHING`;
      actual += total;
      await tx.$executeRaw`INSERT INTO finance.cost_transactions (transaction_id, project_id, tenant_id, source_type, source_id, amount, currency_code, transaction_date, description, recorded_by)
        VALUES (${uid(`ct-inv/${p.key}/${po.key}`)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, 'INVOICE'::finance."CostSourceType", ${invId}::uuid, ${total}, ${THB}, ${addDays(orderedAt, 14)}::date, ${`Actual: ${po.key} delivered`}, ${U('fin')}::uuid)
        ON CONFLICT (transaction_id) DO NOTHING`;
      // Payment recorded for the paid invoices (rest remain outstanding / AP queue).
      if (po.paid) {
        await tx.$executeRaw`INSERT INTO finance.payments (payment_id, invoice_id, project_id, tenant_id, amount, currency_code, payment_date, payment_reference, status, recorded_by)
          VALUES (${uid(`pay/${p.key}/${po.key}`)}::uuid, ${invId}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${total}, ${THB}, ${addDays(orderedAt, 20)}::date, ${`TT-${p.code}-${po.key.toUpperCase()}`}, 'PROCESSED'::finance."PaymentStatus", ${U('fin')}::uuid)
          ON CONFLICT (payment_id) DO NOTHING`;
      }
    }
  }
  await tx.$executeRaw`UPDATE finance.project_budgets SET committed_amount=${committed}, actual_amount=${actual} WHERE budget_id=${bid}::uuid`;

  // Tasks (a handful with progress).
  //
  // The last column is the BOQ_TEMPLATE line each task delivers (`<group code>/<item index>`), which
  // is what gives the project-progress metric its weights: §32.12 weights progress_percent by the
  // linked item's estimated_total and EXCLUDES tasks with boq_item_id = null. Without these links the
  // metric has nothing to sum and reports "not computable" for every project.
  //
  // Waterproofing maps to null on purpose — BOQ_TEMPLATE has no waterproofing line, and inventing a
  // link to an unrelated item would silently mis-weight the figure. It is real, unmeasured scope.
  const taskDefs = [
    ['งานเสาเข็ม โซน A', 'FOUNDATION', 'COMPLETED', 100, 'B/0'], // Bored pile ø600mm
    ['ฐานรากและคานคอดิน', 'FOUNDATION', 'IN_PROGRESS', 65, 'B/1'], // Pile cap concrete 240ksc
    ['เสาคอนกรีตชั้นล่าง', 'STRUCTURE', 'IN_PROGRESS', 40, 'C/0'], // Reinforced concrete columns
    ['งานกันซึมชั้นใต้ดิน', 'STRUCTURE', 'NOT_STARTED', 0, null], // no BOQ line for waterproofing
    ['ระบบไฟฟ้าชั่วคราวหน้างาน', 'MEP', 'COMPLETED', 100, 'E/0'], // Electrical conduit & wiring
  ] as const;
  for (let ti = 0; ti < taskDefs.length; ti++) {
    const [tname, wt, status, prog, boqKey] = taskDefs[ti];
    const boqItemId = boqKey === null ? null : uid(`boqi/${p.key}/${boqKey}`);
    // DO UPDATE on boq_item_id, not DO NOTHING: these tasks predate the link, so a plain
    // insert-or-skip would leave every existing database with the metric still unusable.
    await tx.$executeRaw`INSERT INTO projects.tasks (task_id, tenant_id, project_id, task_name, work_type, status, assigned_to, planned_start, planned_end, progress_percent, qc_status, boq_item_id)
      VALUES (${uid(`task/${p.key}/${ti}`)}::uuid, ${TENANT_ID}::uuid, ${pid}::uuid, ${tname}, ${wt}, ${status}, ${U(p.se)}::uuid, ${addDays(p.start, ti * 3)}::date, ${addDays(p.start, ti * 3 + 20)}::date, ${prog}, ${prog === 100 ? 'QC_PASSED' : 'NONE'}, ${boqItemId}::uuid)
      ON CONFLICT (task_id) DO UPDATE SET boq_item_id = EXCLUDED.boq_item_id`;
  }

  // Project phases (ADR-070) — the construction execution stages the SITE_ENGINEER dashboard's phase
  // card reads. phase.status is PM-set here (phases are not linked to tasks in this increment, so it is
  // not rolled up) but is kept coherent with the seeded tasks: the foundation tasks are still in
  // progress (piles done, pile-caps ~65%) and the columns have started, so Foundation and Structure
  // are both IN_PROGRESS and the DERIVED current phase — the lowest-seq IN_PROGRESS one (ADR-070) — is
  // Foundation. actual_end stays null on both (only COMPLETED phases are signed off).
  const phaseDefs = [
    ['งานฐานราก (Foundation)', 'IN_PROGRESS', 0, 45, 0, null],
    ['งานโครงสร้าง (Structure)', 'IN_PROGRESS', 40, 140, 45, null],
    ['งานระบบประกอบอาคาร (MEP)', 'NOT_STARTED', 130, 210, null, null],
    ['งานสถาปัตยกรรม (Architecture)', 'NOT_STARTED', 200, 290, null, null],
    ['ส่งมอบงาน (Handover)', 'NOT_STARTED', 285, 300, null, null],
  ] as const;
  for (let phi = 0; phi < phaseDefs.length; phi++) {
    const [pname, pstatus, ps, pe, astart, aend] = phaseDefs[phi];
    await tx.$executeRaw`INSERT INTO projects.project_phases (phase_id, tenant_id, project_id, seq, name, status, planned_start, planned_end, actual_start, actual_end, created_by)
      VALUES (${uid(`phase/${p.key}/${phi}`)}::uuid, ${TENANT_ID}::uuid, ${pid}::uuid, ${phi + 1}, ${pname}, ${pstatus}, ${addDays(p.start, ps)}::date, ${addDays(p.start, pe)}::date, ${astart === null ? null : addDays(p.start, astart)}::date, ${aend === null ? null : addDays(p.start, aend)}::date, ${U(p.pm)}::uuid)
      ON CONFLICT (phase_id) DO NOTHING`;
  }

  // Permit (active work permit).
  await tx.$executeRaw`INSERT INTO site_ops.permits (permit_id, tenant_id, project_id, permit_type, permit_number, issued_by, valid_from, valid_until, status, created_by)
    VALUES (${uid(`permit/${p.key}`)}::uuid, ${TENANT_ID}::uuid, ${pid}::uuid, 'WORK_PERMIT', ${`WP-${p.code}-001`}, ${U('safety')}::uuid, ${p.start}::date, ${addDays(p.start, 90)}::date, 'ACTIVE', ${U('safety')}::uuid)
    ON CONFLICT (permit_id) DO NOTHING`;

  // Daily site reports across the ~1-month window (weekdays).
  const days = workdays(addDays(p.start, 1), SEED_END);
  const summaries = [
    'ขุดดินโซน A ต่อเนื่อง เครื่องเจาะเสาเข็มทำงานตามแผน',
    'ผูกเหล็กฐานรากเสร็จ เตรียมเทคอนกรีตวันพรุ่งนี้',
    'ตั้งแบบเสาชั้นล่าง QC ตรวจเหล็กเสริมเรียบร้อย',
    'เทคอนกรีตพื้นส่วน B และเก็บตัวอย่างลูกปูนทดสอบ',
    'งานก่ออิฐชั้น 1 คืบหน้า เริ่มเดินท่อร้อยสายระบบ MEP',
    'ถมดินบดอัดฝั่งทิศเหนือเสร็จ ผ่านการทดสอบความหนาแน่น',
    'รับเหล็กเข้าไซต์และจัดเก็บ ถอดแบบเสาบางส่วน',
  ];
  for (let di = 0; di < days.length; di++) {
    const day = days[di];
    const rid = uid(`report/${p.key}/${day}`);
    const manpower = 32 + ((di * 7) % 28);
    const blockers = di % 9 === 4 ? 'คอนกรีตผสมเสร็จส่งล่าช้า 2 ชั่วโมง เนื่องจากการจราจร' : null;
    await tx.$executeRaw`INSERT INTO site_ops.site_reports (report_id, project_id, tenant_id, report_date, submitted_by, status, summary, weather, manpower_count, client_submitted_at, latitude, longitude, blockers)
      VALUES (${rid}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${day}::date, ${U(p.se)}::uuid, 'SUBMITTED', ${summaries[di % summaries.length]}, ${WEATHER[di % WEATHER.length]}, ${manpower}, ${ts(day, '17:30')}::timestamptz, ${p.lat}, ${p.lng}, ${blockers})
      ON CONFLICT (report_id) DO NOTHING`;
    // manpower breakdown (2 trades per report)
    for (let mi = 0; mi < 2; mi++) {
      const trade = TRADES[(di + mi) % TRADES.length];
      await tx.$executeRaw`INSERT INTO site_ops.manpower_logs (log_id, report_id, tenant_id, trade_type, worker_count, hours_worked)
        VALUES (${uid(`mp/${p.key}/${day}/${mi}`)}::uuid, ${rid}::uuid, ${TENANT_ID}::uuid, ${trade}, ${8 + ((di + mi) % 12)}, ${8 + (mi === 1 ? 1.5 : 0)})
        ON CONFLICT (log_id) DO NOTHING`;
    }
  }

  // Issues (mix of open/resolved).
  const issueDefs = [
    ['ระยะเหล็กเสริมเกินพิกัดที่แนวเสา C3', 'Quality', 'MEDIUM', 'RESOLVED', 'DEFECT'],
    ['มีน้ำซึมบริเวณบ่อพักชั้นใต้ดิน', 'Design', 'HIGH', 'IN_PROGRESS', 'DEFECT'],
    ['ไม้แบบส่งล่าช้า กระทบการเทพื้น', 'Delay', 'MEDIUM', 'OPEN', 'GENERAL'],
    ['พบกระเบื้องชำรุดในล็อตที่ส่งมอบ', 'Material', 'LOW', 'RESOLVED', 'GENERAL'],
    ['ขาดราวกันตกบริเวณชั้น 2', 'Safety', 'HIGH', 'OPEN', 'PUNCH'],
  ] as const;
  for (let ai = 0; ai < issueDefs.length; ai++) {
    const [title, , sev, status, itype] = issueDefs[ai];
    await tx.$executeRaw`INSERT INTO site_ops.issues (issue_id, project_id, tenant_id, title, description, severity, status, assigned_to, issue_type, client_submitted_at, latitude, longitude)
      VALUES (${uid(`issue/${p.key}/${ai}`)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${title}, ${`${title} — พบระหว่างการตรวจงานประจำวัน`}, ${sev}, ${status}, ${U(p.se)}::uuid, ${itype}, ${ts(addDays(p.start, 5 + ai * 3), '14:00')}::timestamptz, ${p.lat}, ${p.lng})
      ON CONFLICT (issue_id) DO NOTHING`;
  }

  // Safety checklists — the TEMPLATES the inspections below are recorded against.
  //
  // This block was missing until 2026-08-08, and the omission was not cosmetic: the loop underneath
  // has always inserted `checklist_id = uid('chk/…')` and its comment has always claimed the
  // inspections ran "against seeded checklists", but nothing ever wrote a row to
  // site_ops.safety_checklists — so every seeded inspection pointed at a checklist that did not
  // exist, and `GET /safety/checklists` returned `[]` on a fully seeded database. That is also what
  // the Site Worker safety screen reads, so the screen had nothing to render.
  //
  // Item shape is the one master §Phase 6 specifies for this column — { item_id, description,
  // is_required } — not the { item, required } shape site_ops.inspection_types uses for its
  // `checklist_template`. The two are different columns on different tables and are not interchanged.
  const checklistDefs = [
    [
      'Foundation Inspection',
      [
        ['rebar', 'ตรวจการวางเหล็กเสริมตามแบบ', true],
        ['cover', 'ระยะหุ้มคอนกรีตอยู่ในเกณฑ์', true],
      ],
    ],
    [
      'Concrete Pour Inspection',
      [
        ['slump', 'ทดสอบค่ายุบตัวผ่านเกณฑ์', true],
        ['cubes', 'เก็บตัวอย่างลูกปูนครบ', true],
      ],
    ],
    // The pre-shift verification the SITE_WORKER files — three items, matching what the safety
    // mockup draws (PPE, live electrical hazards, exclusion-zone signage).
    [
      'Safety Walkthrough',
      [
        ['ppe', 'สวมใส่หมวกนิรภัยและรองเท้าเซฟตี้', true],
        ['electrical', 'ตรวจสอบพื้นที่ทำงานไม่มีสายไฟรั่ว', true],
        ['signage', 'ติดตั้งป้ายเตือนพื้นที่เขตก่อสร้าง', false],
      ],
    ],
    [
      'MEP Rough-In Inspection',
      [
        ['conduit', 'การเดินท่อร้อยสายตรงตามแบบ', true],
        ['supports', 'ติดตั้งอุปกรณ์รองรับท่อครบถ้วน', true],
      ],
    ],
  ] as const;
  for (let ci = 0; ci < checklistDefs.length; ci++) {
    const [name, items] = checklistDefs[ci]!;
    const payload = items.map(([itemId, description, isRequired]) => ({
      item_id: itemId,
      description,
      is_required: isRequired,
    }));
    await tx.$executeRaw`INSERT INTO site_ops.safety_checklists (checklist_id, project_id, tenant_id, checklist_name, version, items)
      VALUES (${uid(`chk/${p.key}/${ci}`)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${name}, 1, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (checklist_id) DO NOTHING`;
  }

  // Inspections (against the checklists seeded immediately above — same uid('chk/…') keys).
  const inspNames = [
    'Foundation Inspection',
    'Concrete Pour Inspection',
    'Safety Walkthrough',
    'MEP Rough-In Inspection',
  ];
  for (let ni = 0; ni < inspNames.length; ni++) {
    const status = ni === 1 ? 'FAILED' : 'PASSED';
    await tx.$executeRaw`INSERT INTO site_ops.inspections (inspection_id, project_id, tenant_id, checklist_id, status, inspected_by, inspected_at, notes, issue_severity)
      VALUES (${uid(`insp/${p.key}/${ni}`)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${uid(`chk/${p.key}/${ni}`)}::uuid, ${status}, ${U(p.se)}::uuid, ${ts(addDays(p.start, 8 + ni * 4), '11:00')}::timestamptz, ${status === 'FAILED' ? 'ค่ายุบตัวคอนกรีตเกินพิกัด ต้องเทใหม่' : 'ผ่านทุกรายการตรวจสอบ'}, ${status === 'FAILED' ? 'HIGH' : null})
      ON CONFLICT (inspection_id) DO NOTHING`;
  }

  // Material consumption.
  for (let ci = 0; ci < 4; ci++) {
    const mat = MATERIALS[ci % MATERIALS.length];
    await tx.$executeRaw`INSERT INTO site_ops.material_consumptions (consumption_id, project_id, tenant_id, material_name, quantity, unit, consumed_by, consumed_at)
      VALUES (${uid(`mc/${p.key}/${ci}`)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${mat.name}, ${20 + ci * 15}, ${mat.unit}, ${U('sw1')}::uuid, ${ts(addDays(p.start, 6 + ci * 4), '16:00')}::timestamptz)
      ON CONFLICT (consumption_id) DO NOTHING`;
  }

  // Safety incident (one acknowledged).
  await tx.$executeRaw`INSERT INTO site_ops.incidents (incident_id, tenant_id, project_id, incident_type, severity, reported_by, status, acknowledged_by, acknowledged_at, latitude, longitude)
    VALUES (${uid(`inc/${p.key}`)}::uuid, ${TENANT_ID}::uuid, ${pid}::uuid, 'เกือบเกิดอุบัติเหตุ (Near Miss)', 'MEDIUM', ${U(p.se)}::uuid, 'IN_PROGRESS', ${U('safety')}::uuid, ${ts(addDays(p.start, 12), '15:20')}::timestamptz, ${p.lat}, ${p.lng})
    ON CONFLICT (incident_id) DO NOTHING`;

  // Sync-failure conflict records (site_ops.conflict_records) — the Tenant Admin "Alerts" sync-review
  // queue (mockup 04_tenant_admin/03_alerts). A realistic tenant accumulates field-sync conflicts, so
  // seed a handful of varied entity + conflict types (unresolved: reviewed_at NULL) once — they are
  // tenant-level, not project-scoped — so the review queue is demonstrable. conflict_type is the real
  // enum (FIELD_CONFLICT | STATUS_CONFLICT | REJECTED); client/server payloads carry the actual diff.
  if (PROJECTS.indexOf(p) === 0) {
    const CONFLICTS = [
      {
        et: 'site_report',
        ct: 'FIELD_CONFLICT',
        hrs: 2,
        client: { manpower_count: 25, weather: 'sunny', summary: 'เทพื้นชั้น 3 เสร็จ 80%' },
        server: { manpower_count: 22, weather: 'cloudy', summary: 'เทพื้นชั้น 3 เสร็จ 75%' },
      },
      {
        et: 'issue',
        ct: 'STATUS_CONFLICT',
        hrs: 5,
        client: { status: 'in_progress', title: 'รอยแตกผนังชั้น 2' },
        server: { status: 'resolved', title: 'รอยแตกผนังชั้น 2' },
      },
      {
        et: 'inspection',
        ct: 'REJECTED',
        hrs: 8,
        client: { result: 'pass', notes: 'ผ่านการตรวจ' },
        server: { result: 'fail', notes: 'ค่ายุบตัวคอนกรีตเกินพิกัด' },
      },
      {
        et: 'manpower_log',
        ct: 'FIELD_CONFLICT',
        hrs: 13,
        client: { worker_count: 12, trade_type: 'concrete' },
        server: { worker_count: 10, trade_type: 'concrete' },
      },
      {
        et: 'material_consumption',
        ct: 'REJECTED',
        hrs: 26,
        client: { material_name: 'ปูนซีเมนต์', quantity: 50 },
        server: { material_name: 'ปูนซีเมนต์', quantity: 45 },
      },
    ] as const;
    for (let ci = 0; ci < CONFLICTS.length; ci++) {
      const c = CONFLICTS[ci];
      const createdAt = new Date(Date.now() - c.hrs * 3600 * 1000).toISOString();
      await tx.$executeRaw`INSERT INTO site_ops.conflict_records (conflict_id, tenant_id, entity_type, entity_id, client_payload, server_payload, conflict_type, created_at)
        VALUES (${uid(`conflict/${ci}`)}::uuid, ${TENANT_ID}::uuid, ${c.et}, ${uid(`conflict-entity/${ci}`)}::uuid, ${JSON.stringify(c.client)}::jsonb, ${JSON.stringify(c.server)}::jsonb, ${c.ct}, ${createdAt}::timestamptz)
        ON CONFLICT (conflict_id) DO NOTHING`;
    }
  }

  // Workforce allocation + attendance + timesheets for a subset of workers.
  const projWorkers = WORKERS.slice(
    (PROJECTS.indexOf(p) * 3) % WORKERS.length,
    ((PROJECTS.indexOf(p) * 3) % WORKERS.length) + 4,
  );
  for (const w of projWorkers) {
    await tx.$executeRaw`INSERT INTO workforce.project_workforce (allocation_id, project_id, worker_id, tenant_id, role_on_project, start_date, daily_rate, currency_code)
      VALUES (${uid(`alloc/${p.key}/${w.key}`)}::uuid, ${pid}::uuid, ${W(w.key)}::uuid, ${TENANT_ID}::uuid, ${w.trade}, ${p.start}::date, ${450 + TRADES.indexOf(w.trade) * 40}, ${THB})
      ON CONFLICT (allocation_id) DO NOTHING`;
    const attDays = days.slice(0, 18);
    for (const day of attDays) {
      await tx.$executeRaw`INSERT INTO workforce_telemetry.attendance_logs (log_id, recorded_at, worker_id, project_id, tenant_id, check_in_at, check_out_at, hours_worked, latitude, longitude)
        VALUES (${uid(`att/${p.key}/${w.key}/${day}`)}::uuid, ${ts(day, '08:00')}::timestamptz, ${W(w.key)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${ts(day, '08:00')}::timestamptz, ${ts(day, '17:00')}::timestamptz, 8.5, ${p.lat}, ${p.lng})
        ON CONFLICT DO NOTHING`;
    }
    await tx.$executeRaw`INSERT INTO workforce_telemetry.timesheets (timesheet_id, period_date, worker_id, project_id, tenant_id, regular_hours, overtime_hours, status)
      VALUES (${uid(`ts/${p.key}/${w.key}`)}::uuid, ${SEED_END}::date, ${W(w.key)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, 160, ${12 + (TRADES.indexOf(w.trade) % 6)}, 'APPROVED'::workforce_telemetry.timesheet_status_enum)
      ON CONFLICT DO NOTHING`;
  }

  // Equipment assignment + utilization.
  const eqForProject = EQUIPMENT[PROJECTS.indexOf(p) % EQUIPMENT.length];
  await tx.$executeRaw`INSERT INTO equipment.equipment_assignments (assignment_id, equipment_id, project_id, tenant_id, assigned_by, assigned_at, notes)
    VALUES (${uid(`eqa/${p.key}`)}::uuid, ${E(eqForProject.key)}::uuid, ${pid}::uuid, ${TENANT_ID}::uuid, ${U(p.pm)}::uuid, ${ts(p.start, '08:00')}::timestamptz, ${`Assigned to ${p.name}`})
    ON CONFLICT (assignment_id) DO NOTHING`;
  for (const day of days.slice(0, 10)) {
    await tx.$executeRaw`INSERT INTO equipment_telemetry.equipment_utilization (recorded_at, equipment_id, tenant_id, project_id, hours_operated, fuel_consumed, operator_id)
      VALUES (${ts(day, '18:00')}::timestamptz, ${E(eqForProject.key)}::uuid, ${TENANT_ID}::uuid, ${pid}::uuid, ${6.5 + (day.charCodeAt(9) % 4)}, ${45 + (day.charCodeAt(9) % 20)}, ${U(p.se)}::uuid)
      ON CONFLICT DO NOTHING`;
  }

  logger.info({ project: p.code, reports: days.length }, 'seed-realistic: project done');
}

async function seedNotifications(tx: Tx): Promise<void> {
  const notes = [
    {
      key: 'n1',
      to: 'exec',
      ch: 'IN_APP',
      evt: 'finance.variance.alert.v1',
      subj: 'แจ้งเตือนงบประมาณเกินเกณฑ์ — Rama IX Corporate Tower',
      body: 'ค่าใช้จ่ายจริงถึง 82% ของงบหมวดคอนกรีตที่จัดสรรไว้',
      status: 'READ',
    },
    {
      key: 'n2',
      to: 'pm2',
      ch: 'IN_APP',
      evt: 'site.inspection.failed.v1',
      subj: 'ตรวจงานไม่ผ่าน — การเทคอนกรีต',
      body: 'ค่ายุบตัวคอนกรีตพื้นส่วน B เกินพิกัด ต้องเทใหม่',
      status: 'SENT',
    },
    {
      key: 'n3',
      to: 'safety',
      ch: 'IN_APP',
      evt: 'site.incident.reported.v1',
      subj: 'แจ้งเหตุเกือบเกิดอุบัติเหตุ',
      body: 'มีการแจ้งเหตุเกือบเกิดอุบัติเหตุที่โครงการ The Sukhumvit 45 Residences',
      status: 'READ',
    },
    {
      key: 'n4',
      to: 'proc',
      ch: 'EMAIL',
      evt: 'procurement.po.status_changed.v1',
      subj: 'ผู้ขายยืนยันรับใบสั่งซื้อ',
      body: 'Millcon Steel ยืนยันรับใบสั่งซื้อ PO-SKV45-REBAR',
      status: 'SENT',
    },
    {
      key: 'n5',
      to: 'fin',
      ch: 'IN_APP',
      evt: 'procurement.invoice.received.v1',
      subj: 'ได้รับใบแจ้งหนี้จากผู้ขายรายใหม่',
      body: 'ใบแจ้งหนี้ CPAC เลขที่ INV-R9CT-CONCRETE รอการอนุมัติ',
      status: 'PENDING',
    },
  ];
  for (const n of notes) {
    await tx.$executeRaw`INSERT INTO notifications.notifications (notification_id, tenant_id, recipient_id, channel, event_type, subject, body, status)
      VALUES (${uid(`notif/${n.key}`)}::uuid, ${TENANT_ID}::uuid, ${U(n.to)}::uuid, ${n.ch}::notifications."NotificationChannel", ${n.evt}, ${n.subj}, ${n.body}, ${n.status}::notifications."NotificationStatus")
      ON CONFLICT (notification_id) DO NOTHING`;
  }
}

async function seedAiReports(tx: Tx): Promise<void> {
  for (const p of PROJECTS.slice(0, 3)) {
    const pid = uid(`project/${p.key}`);
    const content = {
      summary: `เดือนที่ผ่านมา โครงการ ${p.name} มีความคืบหน้าอย่างต่อเนื่อง งานฐานรากเสร็จเป็นส่วนใหญ่และเริ่มงานโครงสร้างส่วนบนแล้ว การจัดซื้อคอนกรีตและเหล็กเป็นไปตามแผน มีการตรวจงานไม่ผ่าน 1 ครั้ง (การเทคอนกรีต) ซึ่งได้แก้ไขเรียบร้อยแล้ว`,
      key_issues: [
        'อยู่ระหว่างแก้ไขปัญหาน้ำซึมบริเวณบ่อพักชั้นใต้ดิน',
        'ไม้แบบส่งล่าช้า กระทบการเทพื้น 1 จุด',
      ],
      confidence: 0.82,
      data_gaps: [],
    };
    await tx.$executeRaw`INSERT INTO ai.ai_generated_reports (report_id, tenant_id, project_id, report_type, content, confidence, model_used, tokens_used, generated_by)
      VALUES (${uid(`ai/${p.key}`)}::uuid, ${TENANT_ID}::uuid, ${pid}::uuid, 'SITE_SUMMARY'::ai.report_type_enum, ${JSON.stringify(content)}::jsonb, 0.82, 'gpt-4o', 1450, ${U('pm1')}::uuid)
      ON CONFLICT (report_id) DO NOTHING`;
  }
}

// Delete this tenant's domain rows in FK-safe (children-first) order.
async function wipeTenant(tx: Tx): Promise<void> {
  const tables = [
    'site_ops.manpower_logs',
    'finance.payments',
    'procurement.invoices',
    'procurement.deliveries',
    'procurement.po_line_items',
    'finance.cost_transactions',
    'procurement.purchase_orders',
    'procurement.quotations',
    'procurement.rfqs',
    'procurement.purchase_requests',
    'site_ops.issues',
    'site_ops.inspections',
    'site_ops.incidents',
    'site_ops.material_consumptions',
    'site_ops.permits',
    'site_ops.site_reports',
    'projects.tasks',
    'workforce_telemetry.attendance_logs',
    'workforce_telemetry.timesheets',
    'workforce.project_workforce',
    'equipment_telemetry.equipment_utilization',
    'equipment.equipment_maintenance',
    'equipment.equipment_assignments',
    'boq.boq_items',
    'boq.boq_categories',
    'boq.boq_versions',
    'projects.rooms',
    'projects.floors',
    'projects.buildings',
    'projects.project_members',
    'finance.budget_lines',
    'finance.project_budgets',
    'finance.contracts',
    'finance.customers',
    'crm.contacts',
    'crm.opportunities',
    'crm.leads',
    'notifications.notifications',
    'ai.ai_generated_reports',
    'workforce.workers',
    'equipment.equipment',
    'procurement.materials',
    'projects.projects',
  ];
  for (const t of tables) {
    await tx.$executeRawUnsafe(`DELETE FROM ${t} WHERE tenant_id = '${TENANT_ID}'`);
  }
}

// CRM pipeline (sales) — leads → opportunities → contacts. Thai company/contact details.
async function seedCrm(tx: Tx): Promise<void> {
  const leads = [
    {
      key: 'l1',
      contact: 'คุณสมชาย วัฒนกิจ',
      company: 'บริษัท ริเวอร์ไซด์ ดีเวลลอปเมนท์ จำกัด',
      status: 'QUALIFIED',
      source: 'อ้างอิงจากลูกค้าเดิม',
    },
    {
      key: 'l2',
      contact: 'คุณอรุณี พาณิชย์',
      company: 'บริษัท กรีนพาร์ค พร็อพเพอร์ตี้ จำกัด',
      status: 'NEW',
      source: 'งานแสดงสินค้าอสังหาริมทรัพย์',
    },
    {
      key: 'l3',
      contact: 'คุณวีรพงษ์ ศรีสุข',
      company: 'ห้างหุ้นส่วนจำกัด เมืองทองการโยธา',
      status: 'QUALIFIED',
      source: 'เว็บไซต์บริษัท',
    },
    {
      key: 'l4',
      contact: 'คุณนภัสสร ทองใบ',
      company: 'บริษัท เดอะเมทริกซ์ เรสซิเดนซ์ จำกัด',
      status: 'NEW',
      source: 'โทรศัพท์เข้าสอบถาม',
    },
    {
      key: 'l5',
      contact: 'คุณกิตติ ชาญวิทย์',
      company: 'บริษัท อีสเทิร์น โลจิสติกส์ จำกัด',
      status: 'DISQUALIFIED',
      source: 'อีเมล',
    },
  ];
  for (const l of leads) {
    await tx.$executeRaw`INSERT INTO crm.leads (lead_id, tenant_id, contact_name, company, status, source, assigned_to, created_by)
      VALUES (${uid(`lead/${l.key}`)}::uuid, ${TENANT_ID}::uuid, ${l.contact}, ${l.company}, ${l.status}, ${l.source}, ${U('crm')}::uuid, ${U('crm')}::uuid)
      ON CONFLICT (lead_id) DO NOTHING`;
  }
  const opps = [
    {
      key: 'o1',
      lead: 'l1',
      title: 'อาคารชุดพักอาศัยริมแม่น้ำ 28 ชั้น',
      value: 520_000_000,
      status: 'OPEN',
      close: '2026-09-30',
    },
    {
      key: 'o2',
      lead: 'l3',
      title: 'อาคารสำนักงานให้เช่า 12 ชั้น ย่านรัชดาภิเษก',
      value: 180_000_000,
      status: 'WON',
      close: '2026-06-15',
    },
    {
      key: 'o3',
      lead: 'l1',
      title: 'งานปรับปรุงสโมสรและสระว่ายน้ำส่วนกลาง',
      value: 35_000_000,
      status: 'OPEN',
      close: '2026-10-31',
    },
  ];
  for (const o of opps) {
    await tx.$executeRaw`INSERT INTO crm.opportunities (opportunity_id, tenant_id, lead_id, title, value, status, expected_close_date, assigned_to, created_by)
      VALUES (${uid(`opp/${o.key}`)}::uuid, ${TENANT_ID}::uuid, ${uid(`lead/${o.lead}`)}::uuid, ${o.title}, ${o.value}, ${o.status}, ${o.close}::date, ${U('crm')}::uuid, ${U('crm')}::uuid)
      ON CONFLICT (opportunity_id) DO NOTHING`;
  }
  const contacts = [
    {
      key: 'c1',
      lead: 'l1',
      name: 'คุณสมชาย วัฒนกิจ',
      email: 'somchai@riverside-dev.co.th',
      phone: '+66818880001',
      role: 'กรรมการผู้จัดการ',
    },
    {
      key: 'c2',
      lead: 'l3',
      name: 'คุณวีรพงษ์ ศรีสุข',
      email: 'weerapong@mtcivil.co.th',
      phone: '+66818880003',
      role: 'ผู้จัดการโครงการ',
    },
  ];
  for (const c of contacts) {
    await tx.$executeRaw`INSERT INTO crm.contacts (contact_id, tenant_id, lead_id, name, email, phone, role, created_by)
      VALUES (${uid(`contact/${c.key}`)}::uuid, ${TENANT_ID}::uuid, ${uid(`lead/${c.lead}`)}::uuid, ${c.name}, ${c.email}, ${c.phone}, ${c.role}, ${U('crm')}::uuid)
      ON CONFLICT (contact_id) DO NOTHING`;
  }
  logger.info({ leads: leads.length, opps: opps.length }, 'seed-realistic: CRM done');
}

run()
  .catch((err: unknown) => {
    logger.error({ err }, 'seed-realistic: fatal');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
