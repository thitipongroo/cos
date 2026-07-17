import { NotFoundException } from '@nestjs/common';
import { AnnotationService } from '../annotation.service';

function harness() {
  const repo = {
    findByFileId: jest.fn(),
    upsert: jest.fn(),
  };
  const svc = new AnnotationService(repo as never);
  return { svc, repo };
}

const row = {
  annotation_id: 'a1',
  file_id: 'f1',
  tenant_id: 't1',
  strokes: [{ tool: 'pen' }],
  version: 3,
  modified_by: 'u1',
  modified_at: new Date('2026-07-17T00:00:00.000Z'),
  created_at: new Date('2026-07-16T00:00:00.000Z'),
};

describe('AnnotationService', () => {
  describe('getByFileId', () => {
    it('returns the annotation as a response DTO', async () => {
      const { svc, repo } = harness();
      repo.findByFileId.mockResolvedValue(row);

      expect(await svc.getByFileId('f1')).toEqual({
        file_id: 'f1',
        strokes: [{ tool: 'pen' }],
        version: 3,
        modified_by: 'u1',
        modified_at: '2026-07-17T00:00:00.000Z',
      });
    });

    it('throws COS-FILE-015 when the photo has no annotation', async () => {
      const { svc, repo } = harness();
      repo.findByFileId.mockResolvedValue(null);

      await expect(svc.getByFileId('f1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('stringifies a non-Date modified_at defensively', async () => {
      const { svc, repo } = harness();
      repo.findByFileId.mockResolvedValue({ ...row, modified_at: '2026-07-17T00:00:00.000Z' });

      const res = await svc.getByFileId('f1');
      expect(res.modified_at).toBe('2026-07-17T00:00:00.000Z');
    });
  });

  describe('applyPush', () => {
    it('persists and returns ACCEPTED when the client is on the current version', async () => {
      const { svc, repo } = harness();
      repo.findByFileId.mockResolvedValue(row); // server version 3
      repo.upsert.mockResolvedValue({ ...row, strokes: [{ tool: 'arrow' }], version: 4 });

      const res = await svc.applyPush('f1', [{ tool: 'arrow' }], 3);

      expect(repo.upsert).toHaveBeenCalledWith({
        fileId: 'f1',
        strokes: [{ tool: 'arrow' }],
        version: 4,
      });
      expect(res.conflict_status).toBe('ACCEPTED');
      expect(res.server_version).toBe(4);
      expect(res.annotation?.version).toBe(4);
    });

    it('accepts the first annotation when none exists yet', async () => {
      const { svc, repo } = harness();
      repo.findByFileId.mockResolvedValue(null);
      repo.upsert.mockResolvedValue({ ...row, version: 1 });

      const res = await svc.applyPush('f1', [{ tool: 'pen' }], 0);

      expect(repo.upsert).toHaveBeenCalledWith({
        fileId: 'f1',
        strokes: [{ tool: 'pen' }],
        version: 1,
      });
      expect(res.conflict_status).toBe('ACCEPTED');
    });

    it('flags without persisting when the client edited a stale version, returning the server row', async () => {
      const { svc, repo } = harness();
      repo.findByFileId.mockResolvedValue(row); // server version 3

      const res = await svc.applyPush('f1', [{ tool: 'text' }], 1); // stale base

      expect(repo.upsert).not.toHaveBeenCalled();
      expect(res.conflict_status).toBe('CONFLICT_FLAGGED');
      expect(res.server_version).toBe(3);
      expect(res.annotation?.file_id).toBe('f1');
    });

    it('accepts a null-server push even with a non-zero base version', async () => {
      // A missing annotation is always a clean first write — the base version is irrelevant.
      const { svc, repo } = harness();
      repo.findByFileId.mockResolvedValue(null);
      repo.upsert.mockResolvedValue({ ...row, version: 1 });

      const res = await svc.applyPush('f1', [], 99);

      expect(res.conflict_status).toBe('ACCEPTED');
      expect(res.server_version).toBe(1);
    });
  });
});
