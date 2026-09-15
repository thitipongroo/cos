/**
 * COMING SOON — every value the SYSTEM_ADMIN panel prints that no query produced (R19, product-owner decisions D16–D19,
 * 2026-09-15; ADR-099 amendment "web SYSTEM_ADMIN").
 *
 * READ ADR-099 BEFORE CHANGING ANYTHING HERE. Each value is copied from the Stitch drawing named beside it (project
 * 5714703984410484001, HTML as listed 2026-09-15) and is NOT computed. Until R19 these places read `—` (R17 decisions
 * D5–D7); the product owner reversed that: draw what Stitch draws, mark it COMING SOON in a code comment and never on
 * screen, and put a "coming soon" dialog behind a control with no process (components/admin/ComingSoon.tsx).
 *
 * THE CONDITION, as ADR-099 obligation 1: every drawn value lives in THIS module. Each use site carries a
 * `// COMING SOON` comment naming the entry it reads. A value whose source is built is deleted here, and the use site
 * then reads the source — grep this file's export names to find every place.
 *
 * THE RULES (plan R19):
 *   1. A real value always wins. Nothing here replaces a figure the platform has a source for.
 *   2. Drawn table rows (Cluster nodes, DB Fleet instances, Migration ledger — D17) follow the real rows and are never
 *      counted in a real figure.
 *   3. Tables whose rows ARE data (Tenant List, both audit logs, Central Prices) get no drawn rows; only their
 *      unsourced columns and cells are drawn.
 *   4. A drawn value that names a tenant takes the open tenant's own code (D19) — `{code}` in a template below.
 */

/**
 * The drawn value for the n-th real row, when a drawing gives a column a handful of example values and the table holds
 * however many real rows there are: the examples repeat in drawn order. `undefined` only for an empty list.
 */
export function drawnFor<T>(examples: readonly T[], index: number): T | undefined {
  if (examples.length === 0) return undefined;
  return examples[((index % examples.length) + examples.length) % examples.length];
}

/** A drawn template with the open tenant's code in place of the drawing's (D19). */
export function forTenant(template: string, tenantCode: string): string {
  return template.split('{code}').join(tenantCode);
}

// ── Shell — "Tenant List & DB Provisioning - SYSTEM_ADMIN" (013fc8f09450…) ───────────────────────────────────────────

export const SHELL = {
  /** Beside "Platform Operations". */
  version: 'v4.18.2',
  /** Central Prices nav entry — the current period. */
  centralPricesPeriod: 'Q2/2025',
  /** Cluster Pulse card. */
  pulse: { emqx: '99.98% ok', timescale: 'Healthy', mesh: '4.2ms avg', queue: '0 tasks' },
  /** Migration-gate banner eyebrow — the isolation tier tag. */
  gateTier: '[L-04]',
} as const;

// ── Tenant Detail & Provisioning Console (01955db7b7cd…) ─────────────────────────────────────────────────────────────
// No source: nothing measures a tenant's cluster, compute, sync queue, stream, token use, engine, storage, schema,
// Vault lease or certificates. The tenant's own fields (code, name, plan, host, region, created, run state) stay real.

export const DETAIL = {
  latency: '4.2ms',
  /** The line under DB CLUSTER STATE is the tenant's own host; for a tenant with none, the drawing's (2026-09-16). */
  cluster: { badge: '99.99%', host: 'db-ent-042.cos.internal:5432' },
  compute: { badge: '28% Load', active: '18 Active', max: '/ 128 Pool Max', barPercent: 28 },
  sync: { badge: 'Clean', pending: '0 Pending Tasks', emqx: '1.4k msg/s' },
  tokens: { badge: '36% Used', used: '1.8M', quota: '/ 5.0M', reset: 'in 14 days' },
  vpc: 'Port 5432 Open',
  reachability:
    'Valid PostgreSQL connection format. Target host is reachable with 0.1ms wire-delay.',
  engine: {
    replica: 'standby-042b',
    lag: { value: '0.00 ms', note: 'Synchronous commit' },
    chunks: { value: '94 Compress.', note: '8.4x ratio savings' },
    iops: { value: '1,020 / 3,000', note: 'Burst headroom: 66%' },
    storage: '412 GB / 1,000 GB (41.2%)',
    /** The allocation bar's three segments, widths as drawn (% of the bar), with their legend. */
    segments: [
      { percent: 28, tone: 'bg-cos-v3-cyan-500', label: 'Relational Data (280 GB)' },
      { percent: 10, tone: 'bg-cos-v3-blue-600', label: 'Sensor Telemetry (100 GB)' },
      { percent: 3.2, tone: 'bg-cos-v3-amber-500', label: 'WAL & Indexes (32 GB)' },
    ],
  },
  schema: {
    version: 'v4.18.2 (L-04 Tier)',
    /** D19 — the drawing's `tenant_bkk_metro` for its own tenant. */
    name: 'tenant_{code}',
    ddl: '2024-03-22 03:14:02 (4 days ago)',
    drift: '0 drift detected • Strict parity Master Template',
  },
  vault: {
    /** D19 — the drawing's path names its own tenant. */
    path: 'secret/data/production/tenants/{code}',
    lease: '18 days remaining (Auto-renew: ON)',
    fingerprint: '9F:A2:3B:49:81:E4:66:D1:43:08:92:CB:88:E1:92:40',
    validatedBy: 'Construction OS Internal Root CA',
  },
  policy: {
    compliance: 'PDPA Thailand & GDPR immutable audit hashing enabled.',
    retention: 'Point-in-time recovery (PITR) with 35-day replay log.',
  },
  footer: { mesh: 'Verified', snapshot: 'PDPA / GDPR Immutable Snapshot Synchronized' },
} as const;

// ── Tenant List — "Tenant List & DB Provisioning - SYSTEM_ADMIN" (013fc8f09450…) ───────────────────────────────────────
// No source: no EMQX scrape, no pool count, no encryption audit, no gate-time history, no compute metric, no zone.
// The tenant counts, dedicated count and gate count stay real.

export const TENANT_LIST = {
  emqx: '99.98%',
  pgPool: '128',
  isolation: '100% encrypted',
  avgGateTime: '14m',
  gateTier: 'Tier L-04',
  compute: { value: '28%', headroom: 'Headroom Ok', barPercent: 28 },
  clusterZone: 'ap-southeast-1a',
} as const;

// ── Tenant Audit Log — Modal Overlay (4578413eabff…) ────────────────────────────────────────────────────────────────
// No source: audit rows carry no security classification, no compliance regime, no hash chain and no retention rule.

export const TENANT_AUDIT = {
  securityFlagged: '1 Flagged',
  active: 'PDPA/GDPR',
  /** The Hash column's six drawn digests, repeated over the real rows (drawnFor). */
  hashes: [
    'e9f1...84c2',
    '4a7b...19e0',
    'b3d2...f098',
    '7c11...cc44',
    '90ef...23bb',
    '18ac...77d3',
  ],
  integrity: '100% VALIDATED (Chain Length: 1,842)',
  compliance: 'PDPA/GDPR Compliance:',
  retention: 'Point-in-Time Retention: 35 Days',
} as const;

// ── The row-action and create modals (R13, R17 D1: "the drawing's copy, every word") ────────────────────────────────
// Their drawn claims are UI copy, so they live in the i18n files; this index names every key that holds one, so this
// module stays the one place to look. Each modal's header comment says what the claim is and why it has no source.

export const MODALS = {
  /** "Target Dedicated Instance" on Mark as Contracted — no instance exists before the run creates one. The tenant has
   *  no host at this point (§20.4.4 prerequisite), so D19 has nothing to put in its place: the drawing's host. */
  markTargetInstance: 'db-ent-043.cos.internal',
  /** "Node:" in the Tenant Audit Log header, for a tenant with no host of its own (product owner 2026-09-16). */
  auditNode: 'db-ent-043.cos.internal',
  /** The compute node named in Deactivate's warning, for a tenant with no host of its own (product owner 2026-09-16). */
  deactivateNode: 'db-ent-043.cos.internal',
} as const;

/** i18n keys whose text is a drawn claim with no source (COMING SOON). */
export const DRAWN_COPY_KEYS = [
  'admin.centralPrices.sync.outcomeDrawn',
  'admin.centralPrices.failed.retriesDrawn',
  'admin.centralPrices.failed.impactDrawn',
  'admin.centralPrices.failed.fallbackDrawn',
  'admin.create.codeValid',
  'admin.create.dbUrlValid',
  'admin.create.lifecycleBody',
  'admin.create.zone',
  'admin.create.tierStarter',
  'admin.create.tierProfessional',
  'admin.create.tierEnterprise',
  'admin.markModal.safetyNotice',
  'admin.markModal.lifecycle',
  'admin.markModal.zone',
  'admin.markModal.meshValue',
  'admin.assignModal.hostValidated',
  'admin.assignModal.poolOption1',
  'admin.assignModal.poolOption2',
  'admin.assignModal.poolOption3',
  'admin.assignModal.poolNote',
  'admin.assignModal.proxyOption1',
  'admin.assignModal.proxyOption2',
  'admin.assignModal.proxyOption3',
  'admin.assignModal.proxyNote',
  'admin.assignModal.noticeBefore',
  'admin.assignModal.ready',
  'admin.deactivateModal.impactA',
  'admin.deactivateModal.impactSessions',
  'admin.deactivateModal.impactB',
  'admin.deactivateModal.impactC',
  'admin.deactivateModal.check',
  'admin.deactivateModal.footnote',
  'admin.deactivateModal.engaged',
] as const;

// ── Cluster Infrastructure & Fleet Telemetry (bc1de8c630e1…) ────────────────────────────────────────────────────────
// No source: nothing reads node inventory, Prometheus, the broker, PgBouncer, TimescaleDB or the integrations. The DB
// Fleet tile's dedicated / pooled / active counts stay real.

export type ClusterTone =
  'cyan' | 'blue' | 'primary' | 'neutral' | 'success' | 'warning' | 'white' | 'gray';

export const CLUSTER = {
  kpi: {
    cluster: {
      badge: '28% Headroom OK',
      value: '72%',
      pool: '192',
      mem: '244.2 GB / 384 GB',
      active: '16 Active',
      barPercent: 72,
    },
    iot: {
      badge: 'QoS 1 Strict',
      value: '18,420',
      cap: '25,000 msg/5..',
      p99: '0 (P99 < 8ms)',
      barPercent: 74,
    },
    fleet: { pgbouncer: '4,820 pool', saturation: 'Zero Satur..' },
    timescale: {
      badge: '25% Mem',
      value: '7 Days',
      nvme: '14.8 TB / 24 TB',
      alloc: '61% Alloc...',
      barPercent: 82,
    },
  },
  nodesHealth: 'ALL NODES HEALTHY',
  filterCounts: { all: 24, db: 12, compute: 6, iot: 4, gateway: 2 },
  live: '5s',
  /** The drawing's eight node rows (D17), in drawn order. */
  nodes: [
    {
      host: 'emqx-01',
      size: 'c6i.xlarge',
      ip: '10.0.12.14',
      service: 'EMQX MQTT',
      role: 'IoT Telemetry QoS1',
      roleInk: 'gray',
      chip: 'cyan',
      zone: 'ap-se-1a',
      statusIcon: 'check_circle',
      status: 'OPERATIONAL',
      cpu: '34%',
      cpuPercent: 34,
      vcpu: '1.36 vCPU',
      mem: '4.2 GB',
      memPercent: 26,
      cap: '/ 16 GB',
      bar: 'cyan',
      disk: '250 GB SSD',
      disk2: '1.8k IOPS',
      disk2Ink: 'gray',
      latency: '3.2 ms',
      latencyInk: 'success',
      latency2: 'P99 < 8ms',
      latency2Ink: 'gray',
      action: 'Metrics',
      highlight: false,
    },
    {
      host: 'time-pg-01',
      size: 'r6i.2xlarge',
      ip: '10.0.12.38',
      service: 'TimescaleDB',
      role: 'PG 16.4 Time-Se...',
      roleInk: 'gray',
      chip: 'blue',
      zone: 'ap-se-1a',
      statusIcon: 'check_circle',
      status: 'OPERATIONAL',
      cpu: '58%',
      cpuPercent: 58,
      vcpu: '4.64 vCPU',
      mem: '42.1 GB',
      memPercent: 65,
      cap: '/ 64 GB',
      bar: 'blue',
      disk: '3.2 TB NVMe',
      disk2: 'Chunk: 7d',
      disk2Ink: 'cyan',
      latency: '1.4 ms',
      latencyInk: 'white',
      latency2: '12.4k iops',
      latency2Ink: 'gray',
      action: 'Chunks',
      highlight: false,
    },
    {
      host: 'db-ent-042',
      size: 'm6i.xlarge',
      ip: '10.0.14.09',
      service: 'Dedicated PG',
      role: 'AES-256',
      roleInk: 'cyan',
      chip: 'primary',
      zone: 'ap-se-1b',
      statusIcon: 'verified',
      status: 'REPLICATING',
      cpu: '21%',
      cpuPercent: 21,
      vcpu: '0.84 vCPU',
      mem: '8.4 GB',
      memPercent: 26,
      cap: '/ 32 GB',
      bar: 'success',
      disk: '850 GB GP3',
      disk2: 'CDC Sync',
      disk2Ink: 'success',
      latency: '0 ms lag',
      latencyInk: 'white',
      latency2: 'Synced',
      latency2Ink: 'success',
      action: 'Inspect',
      highlight: false,
    },
    {
      host: 'p-se1-pg02',
      size: 'r6i.2xlarge',
      ip: '10.0.12.87',
      service: 'PgBouncer',
      role: 'RLS Isolation',
      roleInk: 'gray',
      chip: 'neutral',
      zone: 'ap-se-1a',
      statusIcon: 'check_circle',
      status: 'HEALTHY',
      cpu: '64%',
      cpuPercent: 64,
      vcpu: '5.12 vCPU',
      mem: '38.6',
      memPercent: 60,
      cap: '/ 64 GB',
      bar: 'warning',
      disk: '1.8 TB GP3',
      disk2: '128 / 500',
      disk2Ink: 'gray',
      latency: '0.9 ms',
      latencyInk: 'white',
      latency2: 'Local PgB',
      latency2Ink: 'gray',
      action: 'Tenants',
      highlight: true,
    },
    {
      host: 'click-01',
      size: 'm6i.2xlarge',
      ip: '10.0.12.55',
      service: 'ClickHouse OLAP',
      role: 'Finance Reporting',
      roleInk: 'gray',
      chip: 'blue',
      zone: 'ap-se-1a',
      statusIcon: 'check_circle',
      status: 'OPERATIONAL',
      cpu: '45%',
      cpuPercent: 45,
      vcpu: '3.60 vCPU',
      mem: '22.8',
      memPercent: 71,
      cap: '/ 32 GB',
      bar: 'blue',
      disk: '4.5 TB NVMe',
      disk2: 'Agg.',
      disk2Ink: 'gray',
      latency: '180 ms',
      latencyInk: 'white',
      latency2: 'Tar < 1s',
      latency2Ink: 'success',
      action: 'Queries',
      highlight: false,
    },
    {
      host: 'egp-01',
      size: 't4g.large',
      ip: '10.0.16.21',
      service: 'e-GP Gateway',
      role: 'CGD OpenData API',
      roleInk: 'gray',
      chip: 'cyan',
      zone: 'ap-se-1a',
      statusIcon: 'link',
      status: 'CONNECTED',
      cpu: '18%',
      cpuPercent: 18,
      vcpu: '0.36 vCPU',
      mem: '2.1 GB',
      memPercent: 26,
      cap: '/ 8 GB',
      bar: 'cyan',
      disk: '120 GB SSD',
      disk2: 'Audit Buffer',
      disk2Ink: 'gray',
      latency: '14 ms',
      latencyInk: 'white',
      latency2: 'Sync OK',
      latency2Ink: 'success',
      action: 'Logs',
      highlight: false,
    },
    {
      host: 'kafka-01',
      size: 'r6i.xlarge',
      ip: '10.0.12.72',
      service: 'Kafka Broker',
      role: 'Event Streaming',
      roleInk: 'gray',
      chip: 'blue',
      zone: 'ap-se-1b',
      statusIcon: 'check_circle',
      status: 'OPERATIONAL',
      cpu: '29%',
      cpuPercent: 29,
      vcpu: '1.16 vCPU',
      mem: '14.2 GB',
      memPercent: 44,
      cap: '/ 32 GB',
      bar: 'blue',
      disk: '1.5 TB NVMe',
      disk2: '3x Replicate',
      disk2Ink: 'gray',
      latency: '2.1 ms',
      latencyInk: 'white',
      latency2: 'Zero lag',
      latency2Ink: 'gray',
      action: 'Topics',
      highlight: false,
    },
    {
      host: 'redis-01',
      size: 'r6g.large',
      ip: '10.0.12.19',
      service: 'Cache Cluster',
      role: 'Redis Session',
      roleInk: 'cyan',
      chip: 'primary',
      zone: 'ap-se-1a',
      statusIcon: 'check_circle',
      status: 'OPERATIONAL',
      cpu: '12%',
      cpuPercent: 12,
      vcpu: '0.24 vCPU',
      mem: '9.6 GB',
      memPercent: 60,
      cap: '/ 16 GB',
      bar: 'cyan',
      disk: '50 GB',
      disk2: 'AOF',
      disk2Ink: 'gray',
      latency: '0.4 ms',
      latencyInk: 'white',
      latency2: '99.9% Hit',
      latency2Ink: 'success',
      action: 'Stats',
      highlight: false,
    },
  ],
  foot: {
    mesh: 'WireGuard TLS 1.3 Active',
    provisioned: '24 / 24 Nodes (100%)',
    memory: '384 GB Total',
    showing: 'Showing 1–8 of 24 nodes',
    page: '1 / 3',
  },
  integrationBadge: 'ALL LIVE',
  integrations: {
    egp: { status: 'CONNECTED', tone: 'success', line: 'Latency: 14ms • Rate: 60 req/min' },
    promptpay: { status: 'HEALTHY', tone: 'success', line: 'B2B ≤ 2M THB • T+1 Engine' },
    did: { status: 'SECURED', tone: 'cyan', line: 'Tree Root • Ephemeral:key Support' },
    line: { status: 'ACTIVE', tone: 'success', line: 'Rate: 340 msg/min • Failover...' },
  },
  envelopes: {
    chunk: { line: '✓ Verified: Sizing envelope adhered...', tone: 'success' },
    emqx: { line: 'Current load: 18.4K msg/s (73.6% of 4vCPU)', tone: 'cyan' },
    ha: { line: 'Automated Failover RPO: 0s, RTO: < 30s', tone: 'success' },
  },
} as const;

// ── Dedicated DB Fleet Management (3e635a2fb7e5…) ────────────────────────────────────────────────────────────────────
// No source: no instance inventory, telemetry, PgBouncer, KMS or replication reading exists. The rows of tenants with a
// dedicated host, their region and run state, the ALL FLEET / MAINTENANCE counts, paging and the code / date sorts are
// real. Real rows take their unsourced cells from the drawing's rows (drawnFor — the gate row for a tenant at the gate).

export const FLEET = {
  kpi: {
    compute: {
      value: '46.8%',
      unit: 'Headroom 53.2% OK',
      left: 'Allocate: 336 / 720 vCPU',
      right: '42 Active',
      barPercent: 46.8,
    },
    iops: {
      value: '28,450',
      unit: 'Total IOPS',
      left: 'RAM: 864 GB / 2.6 TB',
      right: 'Peak IOPS < 40%',
      barPercent: 32,
    },
    storage: {
      value: '18.4 TB',
      unit: '/ 36 TB Provision',
      left: 'KMS AES-256 GCM',
      right: '100% Snapshots Valid',
      barPercent: 51.1,
    },
    ha: {
      value: '42 / 42',
      unit: 'SYNCED (0ms lag)',
      left: 'Multi-AZ: 42',
      right: 'Auto-Fail: Armed',
      barPercent: 100,
    },
  },
  healthyCount: 41,
  failoverCount: 42,
  zone: 'ap-southeast-1',
  tls: 'Active',
  kms: '0x9f3e...881c',
  envelopeBadges: {
    boundary: 'HARD-ENFORCED',
    justification: 'SEALED TO AUDIT',
    standby: 'RPO: 0 SECONDS',
  },
  /** The drawing's six instance rows (D17), after the real rows on the last page, never counted. */
  instances: [
    {
      host: 'db-ent-042.infra.cos.internal',
      port: 'Port: 5432 (PgBouncer Strict: 480 conns)',
      tenant: 'Siam Infrastructure Eng.',
      code: 'siam_infra_eng',
      ent: '(ENT-9842)',
      archetype: 'r6i.2xlarge',
      archetypeNote: '8 vCPU / 64 GB RAM',
      zone: 'ap-se-1b',
      ha: '● MULTI-AZ',
      standby: 'Standby: ap-se-1c',
      cpu: '21%',
      cpuPercent: 21,
      cpuHigh: false,
      mem: '8.4 GB',
      storage: '48.2 GB / 500 GB',
      iops: '1,420 IOPS (NVMe)',
      iopsTone: 'emerald',
      cdc: '0 ms (CDC)',
      gate: false,
      actions: ['CONFIG', 'METRICS'],
    },
    {
      host: 'db-ent-018.bkkmetro.cos.internal',
      port: 'Port: 5432 (PgBouncer Strict: 920 conns)',
      tenant: 'Bangkok Metro Transit Rail',
      code: 'bkk_metro_corp',
      ent: '(ENT-1044)',
      archetype: 'r6i.4xlarge',
      archetypeNote: '16 vCPU / 128 GB RAM',
      zone: 'ap-se-1a',
      ha: '● MULTI-AZ',
      standby: 'Standby: ap-se-1b',
      cpu: '74%',
      cpuPercent: 74,
      cpuHigh: true,
      mem: '94.7 GB',
      storage: '418.6 GB / 1 TB',
      iops: '6,840 IOPS (NVMe)',
      iopsTone: 'cyan',
      cdc: '0 ms (CDC)',
      gate: false,
      actions: ['CONFIG', 'METRICS'],
    },
    {
      host: 'db-ent-029.easternport.cos.internal',
      port: 'Port: 5432 (PgBouncer: 340 conns)',
      tenant: 'Eastern Seaboard Port Auth',
      code: 'eastern_ports',
      ent: '(ENT-3310)',
      archetype: 'r6i.2xlarge',
      archetypeNote: '8 vCPU / 64 GB RAM',
      zone: 'ap-se-1c',
      ha: '● MULTI-AZ',
      standby: 'Standby: ap-se-1a',
      cpu: '38%',
      cpuPercent: 38,
      cpuHigh: false,
      mem: '24.3 GB',
      storage: '142.0 GB / 500 GB',
      iops: '2,100 IOPS (NVMe)',
      iopsTone: 'emerald',
      cdc: '0 ms (CDC)',
      gate: false,
      actions: ['CONFIG', 'METRICS'],
    },
    {
      host: 'db-ent-031.thaiind.cos.internal',
      port: 'Port: 5432 (PgBouncer: 520 conns)',
      tenant: 'Thai Industrial Parks PCL',
      code: 'thai_ind_parks',
      ent: '(ENT-4920)',
      archetype: 'r6i.2xlarge',
      archetypeNote: '8 vCPU / 64 GB RAM',
      zone: 'ap-se-1b',
      ha: '● MULTI-AZ',
      standby: 'Standby: ap-se-1c',
      cpu: '45%',
      cpuPercent: 45,
      cpuHigh: false,
      mem: '28.8 GB',
      storage: '289.4 GB / 800 GB',
      iops: '3,400 IOPS (NVMe)',
      iopsTone: 'emerald',
      cdc: '0 ms (CDC)',
      gate: false,
      actions: ['CONFIG', 'METRICS'],
    },
    {
      host: 'db-ent-041.hsrconsor.cos.internal',
      port: 'Status: Stream Catchup (§34.5)',
      tenant: 'High Speed Rail Joint Venture',
      code: 'hsr_consortium',
      ent: '(ENT-8821)',
      archetype: 'r6i.4xlarge',
      archetypeNote: '16 vCPU / 128 GB RAM',
      zone: 'ap-se-1a',
      ha: 'PROVISIONING',
      standby: 'Standby Syncing',
      cpu: '82%',
      cpuPercent: 82,
      cpuHigh: true,
      mem: '105 GB',
      storage: '612.0 GB / 2 TB',
      iops: 'CDC Stream 8,900 IOPS',
      iopsTone: 'amber',
      cdc: '12 ms (Catchup)',
      gate: true,
      actions: ['GATE §34.5', 'LOGS'],
    },
    {
      host: 'db-ent-012.chaophraya.cos.internal',
      port: 'Port: 5432 (PgBouncer: 280 conns)',
      tenant: 'Chao Phraya Expressway PCL',
      code: 'chao_phraya_exp',
      ent: '(ENT-0912)',
      archetype: 'r6i.2xlarge',
      archetypeNote: '8 vCPU / 64 GB RAM',
      zone: 'ap-se-1c',
      ha: '● MULTI-AZ',
      standby: 'Standby: ap-se-1b',
      cpu: '18%',
      cpuPercent: 18,
      cpuHigh: false,
      mem: '11.5 GB',
      storage: '94.3 GB / 500 GB',
      iops: '980 IOPS (NVMe)',
      iopsTone: 'emerald',
      cdc: '0 ms (CDC)',
      gate: false,
      actions: ['CONFIG', 'METRICS'],
    },
  ],
} as const;

// ── Data Migrations & Approval Gate (b6f080f520bb…) ─────────────────────────────────────────────────────────────────
// No source: no transfer volume, payload, row count, snapshot, replication, checksum, progress, CDC lag or operator is
// recorded for a provisioning run. The runs, their states, the gate, Approve / Abort, the counts and filters are real.

export type MigrationTone = 'amber' | 'cyan' | 'purple' | 'emerald';

export const MIGRATIONS = {
  volume: { value: '418.6 GB', delta: '+12.4%', note: 'Zero row drops, 100% Hash Matched' },
  verification: { value: 'W3C VC Sealed', note: 'Merkle Root Validation Active' },
  enclave: 'AWS-BKK-01',
  /** The run writes no host before approval; as on Mark as Contracted, the drawing's node stands in. */
  targetNode: 'db-ent-042.infra.cos.internal',
  payload: { payload: '48.2 GB', objects: '142 Tables', rows: '18,420,190 Rows' },
  checks: { snapshot: 'S3 AES-256 Vault', replication: '0 ms (CDC Active)' },
  checksum: '0x9f3e...881c',
  encrypted: '(KMS AES-GCM 256)',
  /** The drawing's ledger rows (D17), after the real runs on the last page, never counted. The gate / working /
   *  completed rows also give a real run of that phase its progress, CDC lag and operator (drawnFor). */
  jobs: [
    {
      id: 'MIG-2026-0891',
      code: 'siam_infra_eng',
      name: 'Siam Infrastructure Eng.',
      source: 'shared_pool_02',
      target: 'db-ent-042',
      status: 'WAITING_APPROVAL',
      tone: 'amber',
      progress: '0.0%',
      progressPercent: 0,
      progressNote: null,
      cdc: '0 ms',
      operator: 'SYSADMIN',
      action: 'Review',
      phase: 'gate',
    },
    {
      id: 'MIG-2026-0888',
      code: 'bkk_metro_corp',
      name: 'Bangkok Metro Transit Corp',
      source: 'shared_pool_01',
      target: 'db-ent-039',
      status: 'STREAMING_ROWS',
      tone: 'cyan',
      progress: '74.2%',
      progressPercent: 74,
      progressNote: '13.6M / 18.4M',
      cdc: '12 ms',
      operator: 'SYSADMIN',
      action: 'View',
      phase: 'working',
    },
    {
      id: 'MIG-2026-0885',
      code: 'cpac_precast_group',
      name: 'CPAC Precast Solutions',
      source: 'shared_pool_02',
      target: 'db-ent-041',
      status: 'VERIFYING_HASH',
      tone: 'purple',
      progress: '99.8%',
      progressPercent: 99,
      progressNote: 'Row Hash Match',
      cdc: '0 ms',
      operator: 'SYSADMIN',
      action: 'Audit',
      phase: 'working',
    },
    {
      id: 'MIG-2026-0879',
      code: 'apex_construct_th',
      name: 'Apex Construction Thailand',
      source: 'shared_pool_01',
      target: 'db-ent-036',
      status: 'COMPLETED',
      tone: 'emerald',
      progress: '100% Sealed',
      progressPercent: null,
      progressNote: '11.2M Rows',
      cdc: '0 ms',
      operator: 'SYSADMIN',
      action: 'Receipt',
      phase: 'completed',
    },
    {
      id: 'MIG-2026-0870',
      code: 'sinotech_rail_th',
      name: 'Sino-Tech Rail JV',
      source: 'shared_pool_03',
      target: 'db-ent-031',
      status: 'COMPLETED',
      tone: 'emerald',
      progress: '100% Sealed',
      progressPercent: null,
      progressNote: '34.8M Rows',
      cdc: '0 ms',
      operator: 'SYSADMIN',
      action: 'Receipt',
      phase: 'completed',
    },
  ],
} as const;

// ── Global Audit Log (efb47c60bdad…) ─────────────────────────────────────────────────────────────────────────────────
// No source: audit_logs carries no hash chain, seal, credential, daemon version or enclave. Every row, filter, count,
// export and the paging are real.

export const GLOBAL_AUDIT = {
  daemon: 'v4.19.2',
  enclave: 'AWS-BKK-01',
  sealedLine: 'Cryptographically Sealed (SHA-256)',
  seal: { value: 'W3C DID/VC', chip: 'VALID', did: 'did:web:operator.construction-os.net' },
  rootChain: '0x902c...ea71',
  encrypted: '(KMS AES-GCM 256)',
  validChip: 'VALID',
  /** The INTEGRITY SEAL / HASH column's six drawn digests, repeated over the real rows (drawnFor). */
  hashes: [
    'sha256:8f2a...c014',
    'sha256:4b19...98ee',
    'sha256:77ae...bb31',
    'sha256:32c1...fe88',
    'sha256:10de...442a',
    'sha256:91fc...3301',
  ],
  hashRoot: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  hashRootNote:
    'Immutable Append-Only Ledger Verified via W3C VC Node — Genesis Anchor timestamp: 01/01/2026 00:00:00 UTC',
  merkle: 'MERKLE PROOF VALID',
} as const;

// ── System Settings (630ea9023263…) ──────────────────────────────────────────────────────────────────────────────────
// No source: nothing connects to a gateway, holds a maintenance window open, knows the cluster region, checks fleet
// health or the pooler mode, or audits security state. Every editable value and both live counts are real (ADR-108).

export const SETTINGS = {
  activeFeeds: '2/2 Feeds',
  sharedWindowChip: 'Active Window',
  cluster: 'AP-SOUTHEAST-1 (BANGKOK)',
  fleetHealth: 'All Isolated & Healthy',
  poolMode: 'PgBouncer Transaction Mode',
  auditState: 'Compliant',
  auditLayer: 'W3C DID/VC Layer Active',
  footer: 'Security Protocol Tier-4 Isolation Enforced. Audit Trail Active.',
} as const;
