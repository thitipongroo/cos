// The I/O half of the PDPA export job (ADR-078). The workflow itself stays deterministic.
//
// TWO DATABASES, OPENED SEPARATELY. `platform.*` is always the shared platform database; the domain
// schemas follow the tenant, which for an ENTERPRISE tenant is its own RDS instance. See `ExportDb`
// in data-export.collector.ts for why conflating them produces an archive that looks complete and
// answers a §30 request with a lie. For a shared-DB tenant `getDbUrlForTenant` returns the same URL
// and the two handles are the same pooled client.
//
// FAILURES ARE RECORDED, NOT JUST THROWN. A §30 request has a 30-day clock, so an export that dies
// silently is worse than one that dies loudly: the subject sees PENDING forever and re-submits. Every
// terminal path writes a status, and `failureReason` is a sentence for the subject — never a stack
// trace (QM-10), which would leak schema and table names to whoever they forward the mail to.

import { ClsServiceManager } from 'nestjs-cls';
import { ServiceTokenService } from '../../../../shared/auth/service-token.service';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '@cos/logger';

import { withTenantTx } from '../../../procurement/workflows/activity-helpers';
import { createPrismaClient } from '../../../../shared/prisma/create-prisma-client';
import { appDatabaseUrl } from '../../../../shared/prisma/app-database-url';
import { assertSafeTenantId } from '../../../../shared/prisma/assert-safe-tenant-id';
import { FileServiceClient } from '../../../files/file-service-client.service';
import { SendGridAdapter } from '../../../notification/adapters/sendgrid.adapter';
import { CLS_TENANT_ID, CLS_USER_ID, CLS_USER_ROLE } from '../../../../shared/context/cls-context';
import { collect, type ExportCategory, type ExportDb } from '../data-export.collector';
import { buildEnvelope, toCsvFiles, toJson } from '../data-export.serializer';
import { archiveContentType, archiveFilename, zipFiles } from '../data-export.archive';

const logger = createLogger('data-export-activities');

// A Temporal activity runs outside Nest DI, so it builds FileServiceClient by hand and must
// supply its dependency the same way. Module-scoped rather than per call: ServiceTokenService
// caches one token for ~14 minutes, and a fresh instance per export would fetch a new one from
// Keycloak every time (OQ-46).
const serviceToken = new ServiceTokenService();

export interface ExportJobParams {
  export_id: string;
  tenant_id: string;
  user_id: string;
}

/**
 * The platform client, pooled for the worker's lifetime.
 *
 * Deliberately NOT `withTenantTx`: that helper resolves the tenant's own database, which for an
 * ENTERPRISE tenant is the wrong server for anything in the `platform` schema.
 */
let platformClient: PrismaClient | null = null;

function platformDb(): PrismaClient {
  platformClient ??= createPrismaClient(appDatabaseUrl());
  return platformClient;
}

/** Close the platform client. The worker's shutdown path calls this alongside the pooled ones. */
export async function disconnectExportClients(): Promise<void> {
  if (platformClient) {
    await platformClient.$disconnect();
    platformClient = null;
  }
}

/** Run `fn` inside a transaction on the PLATFORM database, tenant-scoped so RLS binds. */
async function withPlatformTx<T>(
  tenantId: string,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  assertSafeTenantId(tenantId);
  return platformDb().$transaction(async (tx) => {
    await (tx as PrismaClient).$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    return fn(tx as PrismaClient);
  });
}

/**
 * PENDING → PROCESSING.
 *
 * Guarded on the current status so a Temporal retry of a partially-completed run cannot drag a
 * finished export back to PROCESSING and strand its file_id.
 */
export async function markProcessingActivity(params: ExportJobParams): Promise<void> {
  await withPlatformTx(params.tenant_id, async (tx) => {
    await tx.$executeRaw`
      UPDATE platform.export_requests
         SET status = 'PROCESSING'::platform."ExportStatus"
       WHERE export_id = ${params.export_id}::uuid
         AND status    = 'PENDING'::platform."ExportStatus"`;
  });
}

/** What the job needs from the request row to do its work. */
interface JobSpec {
  categories: ExportCategory[];
  format: 'JSON' | 'CSV';
  from: Date | null;
  to: Date | null;
}

async function loadJobSpec(params: ExportJobParams): Promise<JobSpec> {
  const rows = await withPlatformTx(
    params.tenant_id,
    (tx) =>
      tx.$queryRaw<
        {
          categories: string[];
          format: 'JSON' | 'CSV';
          from_date: Date | null;
          to_date: Date | null;
        }[]
      >`
      SELECT categories, format::text AS format, from_date, to_date
        FROM platform.export_requests
       WHERE export_id = ${params.export_id}::uuid
         AND user_id   = ${params.user_id}::uuid`,
  );
  const row = rows[0];
  // The row is read rather than passed through the workflow args on purpose: the workflow must not
  // carry the selection, or a replay would re-export whatever the args said even after the row was
  // corrected. Its absence means the request was deleted (a cascading account erasure), which is a
  // reason to stop, not to guess a default selection and export data nobody asked for.
  if (!row) throw new Error(`Export request ${params.export_id} no longer exists`);

  return {
    categories: row.categories as ExportCategory[],
    format: row.format,
    from: row.from_date,
    to: row.to_date,
  };
}

/**
 * Gather, serialise, archive, upload. Returns the File Service id.
 *
 * The upload runs inside a CLS scope because FileServiceClient reads the acting principal from the
 * ambient request context and fails closed without it (ADR-031) — an activity has no HTTP request,
 * so the context is established here from the job's own tenant and subject. The role is fixed to
 * SITE_WORKER: it is the least-privileged value File Service's auth plugin accepts, and the upload
 * needs no more than that.
 */
export async function collectAndUploadActivity(params: ExportJobParams): Promise<string> {
  const spec = await loadJobSpec(params);

  const data = await withTenantTx(params.tenant_id, (tenantTx) =>
    withPlatformTx(params.tenant_id, (platformTx) => {
      const db: ExportDb = { platform: platformTx, tenant: tenantTx };
      return collect(db, params.user_id, spec.categories, { from: spec.from, to: spec.to });
    }),
  );

  const envelope = buildEnvelope({
    userId: params.user_id,
    categories: spec.categories,
    data,
    from: spec.from,
    to: spec.to,
    generatedAt: new Date(),
  });

  const buffer =
    spec.format === 'JSON'
      ? Buffer.from(toJson(envelope), 'utf8')
      : await zipFiles(toCsvFiles(envelope));

  const cls = ClsServiceManager.getClsService();
  const uploaded = await cls.run(async () => {
    cls.set(CLS_TENANT_ID, params.tenant_id);
    cls.set(CLS_USER_ID, params.user_id);
    cls.set(CLS_USER_ROLE, 'SITE_WORKER');
    return new FileServiceClient(serviceToken).upload({
      buffer,
      filename: archiveFilename(params.export_id, spec.format),
      contentType: archiveContentType(spec.format),
      entityType: 'data_export',
      entityId: params.export_id,
    });
  });

  // Size and format only — never a category count, which would say something about the person.
  logger.info(
    { exportId: params.export_id, format: spec.format, bytes: buffer.byteLength },
    'data export archive uploaded',
  );
  return uploaded.file_id;
}

/** PROCESSING → READY, recording the archive reference and the completion time. */
export async function markReadyActivity(
  params: ExportJobParams & { file_id: string },
): Promise<void> {
  await withPlatformTx(params.tenant_id, async (tx) => {
    await tx.$executeRaw`
      UPDATE platform.export_requests
         SET status       = 'READY'::platform."ExportStatus",
             file_id      = ${params.file_id}::uuid,
             completed_at = now()
       WHERE export_id = ${params.export_id}::uuid`;
  });
}

/**
 * → FAILED, with a reason the subject can read.
 *
 * `completed_at` is set too: the request reached a terminal state, and a NULL there would leave the
 * 30-day compliance answer unable to say when it stopped.
 */
export async function markFailedActivity(
  params: ExportJobParams & { reason: string },
): Promise<void> {
  await withPlatformTx(params.tenant_id, async (tx) => {
    await tx.$executeRaw`
      UPDATE platform.export_requests
         SET status         = 'FAILED'::platform."ExportStatus",
             failure_reason = ${params.reason},
             completed_at   = now()
       WHERE export_id = ${params.export_id}::uuid`;
  });
  logger.warn({ exportId: params.export_id }, 'data export failed');
}

/**
 * Tell the subject their export is ready — with a link to an authenticated page, never the archive.
 *
 * The mail carries no signed URL. The page mints a fresh one on click (DataExportService.downloadUrl),
 * so a forwarded or breached mailbox yields a login prompt rather than every coordinate the person
 * was recorded at. This is the whole reason `expires_at` is the REQUEST's validity and not a link TTL.
 *
 * Sent through SendGridAdapter directly rather than NotificationService: the latter's quiet hours and
 * per-user channel preferences (§19.6) could suppress the one message that answers a statutory
 * request, and email is the only channel every account is reachable on (phone_number is nullable).
 */
export async function notifySubjectActivity(
  params: ExportJobParams & { ready: boolean },
): Promise<void> {
  const rows = await withPlatformTx(
    params.tenant_id,
    (tx) =>
      tx.$queryRaw<{ email: string }[]>`
      SELECT email FROM platform.users WHERE user_id = ${params.user_id}::uuid`,
  );
  const email = rows[0]?.email;
  // A missing address is logged, not thrown: the export itself succeeded and the subject can still
  // find it in-app. Failing the workflow here would flip a READY row to FAILED and hide a good archive.
  if (!email) {
    logger.warn({ exportId: params.export_id }, 'data export ready but subject has no email');
    return;
  }

  const appUrl = process.env['APP_BASE_URL'] ?? 'https://app.construction-os.com';
  const link = `${appUrl}/privacy/data-export/${params.export_id}`;

  await new SendGridAdapter().send({
    to: email,
    subject: params.ready
      ? 'Your Construction OS data export is ready'
      : 'Your Construction OS data export could not be completed',
    body: params.ready
      ? `Your data export is ready. Sign in and open ${link} to download it.\n\n` +
        'The link opens a page in the app; the download itself is generated when you click it and ' +
        'is valid for a short time. The export stays available for 7 days.'
      : `We could not complete your data export. Sign in and open ${link} to see why, and to ` +
        'request it again.',
  });
  logger.info({ exportId: params.export_id, ready: params.ready }, 'data export subject notified');
}
