// Second demo tenant — a distinct construction company, used to exercise tenant isolation
// (a user/query scoped to tenant A must never see tenant B's data). Smaller than the primary
// Ekachai tenant but real across the core domains (projects, BOQ, budget, procurement, site
// reports, workforce). Deterministic UUIDs + ON CONFLICT DO NOTHING → idempotent.
//
// Run: DATABASE_URL=<direct pg url> pnpm exec ts-node prisma/seed-tenant2.ts
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/shared/prisma/create-prisma-client';
import { createLogger } from '@cos/logger';

const logger = createLogger('seed-tenant2');
const prisma = createPrismaClient();
type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

function uid(key: string): string {
  const h = createHash('sha256').update(`cos-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isWeekend(iso: string): boolean {
  const g = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return g === 0 || g === 6;
}
function workdays(s: string, e: string): string[] {
  const out: string[] = [];
  let c = s;
  while (c <= e) {
    if (!isWeekend(c)) out.push(c);
    c = addDays(c, 1);
  }
  return out;
}
const ts = (iso: string, hhmm: string): string => `${iso}T${hhmm}:00+07:00`;

const TID = uid('tenant/thavorn');
const THB = 'THB';
const SEED_END = '2026-07-03';
const U = (k: string): string => uid(`t2/user/${k}`);

const USERS = [
  { key: 'admin', name: 'Nopadol Thavorn', email: 'nopadol.t@thavorn.co.th', role: 'TENANT_ADMIN' },
  { key: 'pm', name: 'Siriwan Ketkaew', email: 'siriwan.k@thavorn.co.th', role: 'PROJECT_MANAGER' },
  {
    key: 'se',
    name: 'Kittisak Phrom',
    email: 'kittisak.p@thavorn.co.th',
    role: 'SITE_ENGINEER',
    phone: '+66822000003',
  },
  { key: 'fin', name: 'Orawan Chidchob', email: 'orawan.c@thavorn.co.th', role: 'FINANCE' },
];
const PROJECTS = [
  {
    key: 'pkv',
    code: 'PKBV',
    name: 'Phuket Beachfront Villas',
    type: 'RESIDENTIAL',
    budget: 180_000_000,
    start: '2026-06-03',
    end: '2027-08-31',
    lat: 7.8804,
    lng: 98.3923,
    client: 'Andaman Estate Co., Ltd.',
  },
  {
    key: 'cmp',
    code: 'CMRP',
    name: 'Chiang Mai Retail Plaza',
    type: 'COMMERCIAL',
    budget: 240_000_000,
    start: '2026-06-06',
    end: '2027-12-31',
    lat: 18.7883,
    lng: 98.9853,
    client: 'Northern Retail Holdings PCL',
  },
];

const BOQ_T = [
  { code: 'A', cat: 'Earthwork', items: [['Site clearing & excavation', 'M3', 6200, 320]] },
  {
    code: 'B',
    cat: 'Foundation',
    items: [
      ['Bored pile ø600mm', 'M', 1400, 3200],
      ['Pile cap concrete', 'M3', 520, 2650],
    ],
  },
  {
    code: 'C',
    cat: 'Structure',
    items: [
      ['RC columns & slab', 'M3', 2900, 3950],
      ['Reinforcement steel', 'TON', 680, 24500],
    ],
  },
] as const;
const WEATHER = ['Clear', 'Partly cloudy', 'Hot and humid', 'Light rain', 'Overcast'];
const TRADES = ['Steel Fixer', 'Mason', 'Carpenter', 'Electrician', 'General Labour', 'Welder'];

async function main(): Promise<void> {
  logger.info({ TID }, 'seed-tenant2: start');
  await prisma.$executeRaw`
    INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
    VALUES (${TID}::uuid, 'TVN', 'Thavorn Construction Group Co., Ltd.', 'construction-os-tvn', 'PROFESSIONAL'::platform."PlanType", true)
    ON CONFLICT (tenant_id) DO NOTHING`;
  for (const u of USERS) {
    await prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name, phone_number, is_active, mfa_enabled)
      VALUES (${U(u.key)}::uuid, ${TID}::uuid, ${uid(`t2/kc/${u.key}`)}, ${u.email}, ${u.name}, ${(u as { phone?: string }).phone ?? null}, true, false)
      ON CONFLICT (user_id) DO NOTHING`;
    await prisma.$executeRaw`
      INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
      VALUES (${TID}::uuid, ${U(u.key)}::uuid, ${u.role}::platform."CosRoleEnum") ON CONFLICT (tenant_id, user_id) DO NOTHING`;
  }

  await prisma.$transaction(
    async (tx: Tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${TID}'`);
      await tx.$executeRawUnsafe(
        `DELETE FROM workforce_telemetry.attendance_logs WHERE tenant_id = '${TID}'`,
      );
      // Master data (work + cost categories) so the tenant is self-sufficient.
      for (const [code, name, phase] of [
        ['STRUCTURE', 'Structure', 'Superstructure'],
        ['FOUNDATION', 'Foundation', 'Substructure'],
      ]) {
        await tx.$executeRaw`INSERT INTO site_ops.work_categories (tenant_id, name, code, phase, is_active, created_by)
        VALUES (${TID}::uuid, ${name}, ${code}, ${phase}, true, ${U('admin')}::uuid) ON CONFLICT (tenant_id, code) DO NOTHING`;
      }
      // Vendors (tenant-scoped).
      const vendors = [
        { key: 'v1', code: 'V-SCG', name: 'SCG Building Materials Co., Ltd.' },
        { key: 'v2', code: 'V-CPAC', name: 'CPAC Ready-Mix Concrete' },
      ];
      for (const v of vendors) {
        await tx.$executeRaw`INSERT INTO procurement.vendors (vendor_id, tenant_id, vendor_code, vendor_name, is_active)
        VALUES (${uid(`t2/vendor/${v.key}`)}::uuid, ${TID}::uuid, ${v.code}, ${v.name}, true) ON CONFLICT (vendor_id) DO NOTHING`;
      }
      // Workers.
      for (let i = 0; i < 8; i++) {
        const nm = [
          'Prasert Meechai',
          'Wichit Saeng',
          'Bancha Rungroj',
          'Somkiat Nak',
          'Piya Duang',
          'Chalor Kaew',
          'Nirun Pol',
          'Sanan Tho',
        ][i];
        await tx.$executeRaw`INSERT INTO workforce.workers (worker_id, tenant_id, employee_code, full_name, trade_type, employment_type, is_active)
        VALUES (${uid(`t2/worker/${i}`)}::uuid, ${TID}::uuid, ${`TVN-${String(i + 1).padStart(3, '0')}`}, ${nm}, ${TRADES[i % TRADES.length]}, 'CONTRACT'::workforce.employment_type_enum, true)
        ON CONFLICT (worker_id) DO NOTHING`;
      }

      for (const p of PROJECTS) {
        const pid = uid(`t2/project/${p.key}`);
        await tx.$executeRaw`INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, budget_amount, budget_currency, start_date, end_date, created_by)
        VALUES (${pid}::uuid, ${TID}::uuid, ${p.code}, ${p.name}, ${p.type}::"ProjectType", 'ACTIVE'::"ProjectStatus", ${p.budget}, ${THB}, ${p.start}::date, ${p.end}::date, ${U('pm')}::uuid)
        ON CONFLICT (project_id) DO NOTHING`;
        for (const [k, role] of [
          ['pm', 'PROJECT_MANAGER'],
          ['se', 'SITE_ENGINEER'],
          ['fin', 'FINANCE'],
        ] as const) {
          await tx.$executeRaw`INSERT INTO projects.project_members (membership_id, project_id, tenant_id, user_id, role, assigned_by)
          VALUES (${uid(`t2/pm/${p.key}/${k}`)}::uuid, ${pid}::uuid, ${TID}::uuid, ${U(k)}::uuid, ${role}::"ProjectMemberRole", ${U('admin')}::uuid)
          ON CONFLICT (membership_id) DO NOTHING`;
        }
        // BOQ
        const vid = uid(`t2/boqv/${p.key}`);
        let boqTotal = 0;
        await tx.$executeRaw`INSERT INTO boq.boq_versions (version_id, project_id, tenant_id, version_number, version_name, status, total_estimated_amount, total_estimated_currency, approved_by, approved_at, created_by)
        VALUES (${vid}::uuid, ${pid}::uuid, ${TID}::uuid, 1, 'Tender BOQ Rev.1', 'APPROVED', 0, ${THB}, ${U('pm')}::uuid, ${ts(p.start, '10:00')}::timestamptz, ${U('pm')}::uuid)
        ON CONFLICT (version_id) DO NOTHING`;
        for (const grp of BOQ_T) {
          const cid = uid(`t2/boqc/${p.key}/${grp.code}`);
          let sub = 0;
          await tx.$executeRaw`INSERT INTO boq.boq_categories (category_id, version_id, tenant_id, category_code, category_name, sort_order, subtotal_amount)
          VALUES (${cid}::uuid, ${vid}::uuid, ${TID}::uuid, ${grp.code}, ${grp.cat}, ${grp.code.charCodeAt(0)}, 0) ON CONFLICT (category_id) DO NOTHING`;
          for (let ii = 0; ii < grp.items.length; ii++) {
            const [desc, unit, qty, uc] = grp.items[ii];
            const total = (qty as number) * (uc as number);
            sub += total;
            boqTotal += total;
            await tx.$executeRaw`INSERT INTO boq.boq_items (item_id, category_id, version_id, tenant_id, item_code, description, unit, quantity, unit_cost, estimated_total, currency_code, sort_order)
            VALUES (${uid(`t2/boqi/${p.key}/${grp.code}/${ii}`)}::uuid, ${cid}::uuid, ${vid}::uuid, ${TID}::uuid, ${`${grp.code}.${ii + 1}`}, ${desc}, ${unit}, ${qty}, ${uc}, ${total}, ${THB}, ${ii})
            ON CONFLICT (item_id) DO NOTHING`;
          }
          await tx.$executeRaw`UPDATE boq.boq_categories SET subtotal_amount=${sub} WHERE category_id=${cid}::uuid`;
        }
        await tx.$executeRaw`UPDATE boq.boq_versions SET total_estimated_amount=${boqTotal} WHERE version_id=${vid}::uuid`;
        // Budget + procurement (2 POs delivered/paid)
        const budgetId = uid(`t2/budget/${p.key}`);
        let committed = 0,
          actual = 0;
        await tx.$executeRaw`INSERT INTO finance.project_budgets (budget_id, project_id, tenant_id, total_budget_amount, total_budget_currency, allocated_amount, committed_amount, actual_amount)
        VALUES (${budgetId}::uuid, ${pid}::uuid, ${TID}::uuid, ${p.budget}, ${THB}, ${Math.round(p.budget * 0.85)}, 0, 0) ON CONFLICT (budget_id) DO NOTHING`;
        const pos = [
          {
            key: 'concrete',
            vendor: 'v2',
            qty: 1600,
            unit: 'M3',
            price: 2650,
            desc: 'Ready-Mixed Concrete 240 ksc',
          },
          {
            key: 'rebar',
            vendor: 'v1',
            qty: 210,
            unit: 'TON',
            price: 24500,
            desc: 'Deformed Steel Bar DB16 SD40',
          },
        ];
        for (const po of pos) {
          const poId = uid(`t2/po/${p.key}/${po.key}`);
          const total = po.qty * po.price;
          committed += total;
          actual += total;
          const ordered = addDays(p.start, 5);
          await tx.$executeRaw`INSERT INTO procurement.purchase_orders (po_id, vendor_id, project_id, tenant_id, po_number, status, total_amount, currency_code, delivery_date, created_by)
          VALUES (${poId}::uuid, ${uid(`t2/vendor/${po.vendor}`)}::uuid, ${pid}::uuid, ${TID}::uuid, ${`PO-${p.code}-${po.key.toUpperCase()}`}, 'INVOICED', ${total}, ${THB}, ${addDays(ordered, 12)}::date, ${U('pm')}::uuid)
          ON CONFLICT (po_id) DO NOTHING`;
          await tx.$executeRaw`INSERT INTO procurement.po_line_items (line_id, po_id, tenant_id, description, quantity, unit, unit_price, line_total)
          VALUES (${uid(`t2/poli/${p.key}/${po.key}`)}::uuid, ${poId}::uuid, ${TID}::uuid, ${po.desc}, ${po.qty}, ${po.unit}, ${po.price}, ${total}) ON CONFLICT (line_id) DO NOTHING`;
          const invId = uid(`t2/inv/${p.key}/${po.key}`);
          await tx.$executeRaw`INSERT INTO procurement.invoices (invoice_id, po_id, vendor_id, tenant_id, invoice_number, amount, currency_code, invoice_date, due_date, status)
          VALUES (${invId}::uuid, ${poId}::uuid, ${uid(`t2/vendor/${po.vendor}`)}::uuid, ${TID}::uuid, ${`INV-${p.code}-${po.key.toUpperCase()}`}, ${total}, ${THB}, ${addDays(ordered, 14)}::date, ${addDays(ordered, 44)}::date, 'APPROVED')
          ON CONFLICT (invoice_id) DO NOTHING`;
          await tx.$executeRaw`INSERT INTO finance.cost_transactions (transaction_id, project_id, tenant_id, source_type, source_id, amount, currency_code, transaction_date, description, recorded_by)
          VALUES (${uid(`t2/ct/${p.key}/${po.key}`)}::uuid, ${pid}::uuid, ${TID}::uuid, 'INVOICE'::finance."CostSourceType", ${invId}::uuid, ${total}, ${THB}, ${addDays(ordered, 14)}::date, ${`Actual: ${po.key}`}, ${U('fin')}::uuid)
          ON CONFLICT (transaction_id) DO NOTHING`;
          await tx.$executeRaw`INSERT INTO finance.payments (payment_id, invoice_id, project_id, tenant_id, amount, currency_code, payment_date, payment_reference, status, recorded_by)
          VALUES (${uid(`t2/pay/${p.key}/${po.key}`)}::uuid, ${invId}::uuid, ${pid}::uuid, ${TID}::uuid, ${total}, ${THB}, ${addDays(ordered, 20)}::date, ${`TT-${p.code}-${po.key.toUpperCase()}`}, 'PROCESSED'::finance."PaymentStatus", ${U('fin')}::uuid)
          ON CONFLICT (payment_id) DO NOTHING`;
        }
        await tx.$executeRaw`UPDATE finance.project_budgets SET committed_amount=${committed}, actual_amount=${actual} WHERE budget_id=${budgetId}::uuid`;
        // Site reports + manpower + workers attendance
        const days = workdays(addDays(p.start, 1), SEED_END);
        const summaries = [
          'Excavation ongoing; pile rig on schedule.',
          'Pile cap reinforcement fixed.',
          'Column formwork erected; rebar QC checked.',
          'Concrete poured for slab; cube samples taken.',
          'Backfill compaction completed; density test passed.',
        ];
        for (let di = 0; di < days.length; di++) {
          const day = days[di];
          await tx.$executeRaw`INSERT INTO site_ops.site_reports (report_id, project_id, tenant_id, report_date, submitted_by, status, summary, weather, manpower_count, client_submitted_at, latitude, longitude)
          VALUES (${uid(`t2/report/${p.key}/${day}`)}::uuid, ${pid}::uuid, ${TID}::uuid, ${day}::date, ${U('se')}::uuid, 'SUBMITTED', ${summaries[di % summaries.length]}, ${WEATHER[di % WEATHER.length]}, ${28 + ((di * 5) % 22)}, ${ts(day, '17:30')}::timestamptz, ${p.lat}, ${p.lng})
          ON CONFLICT (report_id) DO NOTHING`;
        }
        // A couple of issues
        for (const [ai, [title, sev, status]] of (
          [
            ['Formwork alignment out of tolerance', 'MEDIUM', 'RESOLVED'],
            ['Delayed steel delivery from supplier', 'HIGH', 'OPEN'],
          ] as const
        ).entries()) {
          await tx.$executeRaw`INSERT INTO site_ops.issues (issue_id, project_id, tenant_id, title, description, severity, status, assigned_to, issue_type, client_submitted_at, latitude, longitude)
          VALUES (${uid(`t2/issue/${p.key}/${ai}`)}::uuid, ${pid}::uuid, ${TID}::uuid, ${title}, ${`${title}.`}, ${sev}, ${status}, ${U('se')}::uuid, 'GENERAL', ${ts(addDays(p.start, 6 + ai * 4), '14:00')}::timestamptz, ${p.lat}, ${p.lng})
          ON CONFLICT (issue_id) DO NOTHING`;
        }
        // Attendance for 3 workers over first 15 workdays
        for (let wi = 0; wi < 3; wi++) {
          await tx.$executeRaw`INSERT INTO workforce.project_workforce (allocation_id, project_id, worker_id, tenant_id, role_on_project, start_date, daily_rate, currency_code)
          VALUES (${uid(`t2/alloc/${p.key}/${wi}`)}::uuid, ${pid}::uuid, ${uid(`t2/worker/${wi}`)}::uuid, ${TID}::uuid, ${TRADES[wi % TRADES.length]}, ${p.start}::date, ${480 + wi * 40}, ${THB})
          ON CONFLICT (allocation_id) DO NOTHING`;
          for (const day of days.slice(0, 15)) {
            await tx.$executeRaw`INSERT INTO workforce_telemetry.attendance_logs (log_id, recorded_at, worker_id, project_id, tenant_id, check_in_at, check_out_at, hours_worked, latitude, longitude)
            VALUES (${uid(`t2/att/${p.key}/${wi}/${day}`)}::uuid, ${ts(day, '08:00')}::timestamptz, ${uid(`t2/worker/${wi}`)}::uuid, ${pid}::uuid, ${TID}::uuid, ${ts(day, '08:00')}::timestamptz, ${ts(day, '17:00')}::timestamptz, 8.5, ${p.lat}, ${p.lng})
            ON CONFLICT DO NOTHING`;
          }
        }
        logger.info({ project: p.code, reports: days.length }, 'seed-tenant2: project done');
      }
    },
    { timeout: 120_000 },
  );
  logger.info('seed-tenant2: complete');
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'seed-tenant2: fatal');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
