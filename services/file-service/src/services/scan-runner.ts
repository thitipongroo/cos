// scan-runner — shared async antivirus flow, reused by the upload route AND the ZIP
// extraction worker (both need: scan → CLEAN+index | QUARANTINE+event).
// Decoupled from Fastify so the Temporal worker can call it with its own service instances.

import type { AntivirusService } from './antivirus.service';
import type { DbService } from './db.service';
import type { MinioService } from './minio.service';
import type { OpenSearchService } from './opensearch.service';
import type { KafkaService } from './kafka.service';
import { createLogger } from '@cos/logger';

const logger = createLogger('file-service.scan-runner');

export interface ScanServices {
  antivirus: Pick<AntivirusService, 'scan'>;
  db: Pick<DbService, 'updateFileStatus' | 'findFileById' | 'markFileQuarantined'>;
  minio: Pick<MinioService, 'moveToQuarantine'>;
  opensearch: Pick<OpenSearchService, 'indexFile'>;
  kafka: Pick<KafkaService, 'publishFileQuarantined'>;
}

export async function runAntivirusScan(
  services: ScanServices,
  fileId: string,
  storedKey: string,
  tenantId: string,
  actorId: string,
  traceId: string,
): Promise<void> {
  try {
    const result = await services.antivirus.scan(fileId);
    if (result.clean) {
      await services.db.updateFileStatus(fileId, 'CLEAN');
      const file = await services.db.findFileById(fileId, tenantId);
      if (file) {
        await services.opensearch.indexFile(file);
      }
      logger.info({ file_id: fileId, traceId }, 'file.scan.clean');
    } else {
      await services.minio.moveToQuarantine(tenantId, storedKey);
      await services.db.markFileQuarantined(fileId);
      await services.kafka.publishFileQuarantined({
        tenantId,
        actorId,
        traceId,
        payload: { file_id: fileId, tenant_id: tenantId, threat_type: result.threat ?? null },
      });
      logger.warn({ file_id: fileId, threat: result.threat, traceId }, 'file.scan.quarantined');
    }
  } catch (err) {
    logger.error({ err, file_id: fileId, traceId }, 'file.scan.error');
  }
}
