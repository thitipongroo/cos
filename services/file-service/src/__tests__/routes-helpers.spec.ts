// Direct unit tests for runAntivirusScan — covers all scan result branches
// including quarantine, error, and file-not-found-after-scan paths.

import { runAntivirusScan } from '../routes/files.routes';
import type { FastifyInstance } from 'fastify';

const FILE_ROW = {
  file_id: 'fid-1',
  tenant_id: 'tid-1',
  original_filename: 'photo.jpg',
  stored_key: 'key',
  bucket_name: 'cos-tid-1',
  mime_type: 'image/jpeg',
  file_size_bytes: '1024',
  file_status: 'CLEAN' as const,
  uploaded_by: 'uid-1',
  uploaded_at: new Date(),
  deleted_at: null,
};

function makeApp(overrides?: {
  scan?: jest.Mock;
  updateFileStatus?: jest.Mock;
  findFileById?: jest.Mock;
  indexFile?: jest.Mock;
  publishFileQuarantined?: jest.Mock;
}): FastifyInstance {
  return {
    antivirus: { scan: overrides?.scan ?? jest.fn().mockResolvedValue({ clean: true }) },
    db: {
      updateFileStatus: overrides?.updateFileStatus ?? jest.fn().mockResolvedValue(undefined),
      findFileById: overrides?.findFileById ?? jest.fn().mockResolvedValue(FILE_ROW),
    },
    opensearch: { indexFile: overrides?.indexFile ?? jest.fn().mockResolvedValue(undefined) },
    kafka: {
      publishFileQuarantined:
        overrides?.publishFileQuarantined ?? jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as FastifyInstance;
}

describe('runAntivirusScan', () => {
  it('marks file CLEAN and indexes in OpenSearch when scan is clean', async () => {
    const indexFile = jest.fn().mockResolvedValue(undefined);
    const app = makeApp({ indexFile });
    await runAntivirusScan(app, 'fid-1', 'tid-1', 'uid-1', 'trace-1', Buffer.from('safe'));
    expect(app.db.updateFileStatus as jest.Mock).toHaveBeenCalledWith('fid-1', 'CLEAN');
    expect(indexFile).toHaveBeenCalledWith(FILE_ROW);
  });

  it('skips OpenSearch indexing when findFileById returns null after CLEAN', async () => {
    const indexFile = jest.fn();
    const app = makeApp({
      findFileById: jest.fn().mockResolvedValue(null),
      indexFile,
    });
    await runAntivirusScan(app, 'fid-1', 'tid-1', 'uid-1', 'trace-1', Buffer.from('safe'));
    expect(indexFile).not.toHaveBeenCalled();
  });

  it('marks file QUARANTINED and publishes event when virus detected', async () => {
    const publishFileQuarantined = jest.fn().mockResolvedValue(undefined);
    const app = makeApp({
      scan: jest.fn().mockResolvedValue({ clean: false, threat: 'Eicar' }),
      publishFileQuarantined,
    });
    await runAntivirusScan(app, 'fid-1', 'tid-1', 'uid-1', 'trace-1', Buffer.from('virus'));
    expect(app.db.updateFileStatus as jest.Mock).toHaveBeenCalledWith('fid-1', 'QUARANTINED');
    expect(publishFileQuarantined).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ threat_type: 'Eicar' }) }),
    );
  });

  it('publishes quarantine event with null threat when threat is undefined', async () => {
    const publishFileQuarantined = jest.fn().mockResolvedValue(undefined);
    const app = makeApp({
      scan: jest.fn().mockResolvedValue({ clean: false, threat: undefined }),
      publishFileQuarantined,
    });
    await runAntivirusScan(app, 'fid-1', 'tid-1', 'uid-1', 'trace-1', Buffer.from('virus'));
    expect(publishFileQuarantined).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ threat_type: null }) }),
    );
  });

  it('catches and logs errors without throwing', async () => {
    const app = makeApp({
      scan: jest.fn().mockRejectedValue(new Error('clamav unreachable')),
    });
    // Should not throw even when scan fails
    await expect(
      runAntivirusScan(app, 'fid-1', 'tid-1', 'uid-1', 'trace-1', Buffer.from('data')),
    ).resolves.toBeUndefined();
  });
});
