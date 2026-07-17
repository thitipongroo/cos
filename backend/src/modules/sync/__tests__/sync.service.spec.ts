import { BadRequestException } from '@nestjs/common';
import { SyncService } from '../sync.service';
import { PushItemDto } from '../dto/sync.dto';

function harness() {
  const tx = { $queryRawUnsafe: jest.fn() };
  const db = { run: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)) };
  const siteOps = {
    syncSiteReports: jest.fn(),
    createIssue: jest.fn(),
    createMaterialConsumption: jest.fn(),
    submitInspection: jest.fn(),
  };
  const safety = { createIncident: jest.fn() };
  const workforce = { recordAttendance: jest.fn() };
  const annotations = { applyPush: jest.fn() };
  const svc = new SyncService(
    db as never,
    siteOps as never,
    safety as never,
    workforce as never,
    annotations as never,
  );
  return { svc, tx, db, siteOps, safety, workforce, annotations };
}

const push = (over: Partial<PushItemDto>): PushItemDto => ({
  entity_type: 'task',
  entity_id: 'e1',
  operation: 'UPDATE',
  payload: {},
  ...over,
});

describe('SyncService', () => {
  describe('push: task (Max-wins, direct SQL)', () => {
    it('applies GREATEST and returns ACCEPTED + server row', async () => {
      const { svc, tx } = harness();
      tx.$queryRawUnsafe.mockResolvedValue([{ task_id: 't1', progress_percent: 70 }]);
      const res = await svc.push(
        push({ entity_type: 'task', entity_id: 't1', payload: { progress_percent: 40 } }),
      );
      expect(res).toEqual({
        status: 'ACCEPTED',
        server_payload: { task_id: 't1', progress_percent: 70 },
      });
      expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('GREATEST'),
        40,
        't1',
      );
    });

    it('clamps out-of-range and defaults non-numeric progress', async () => {
      const { svc, tx } = harness();
      tx.$queryRawUnsafe.mockResolvedValue([]);
      await svc.push(push({ entity_type: 'task', payload: { progress_percent: 150 } }));
      expect(tx.$queryRawUnsafe).toHaveBeenLastCalledWith(expect.any(String), 100, 'e1');
      await svc.push(push({ entity_type: 'task', payload: {} }));
      expect(tx.$queryRawUnsafe).toHaveBeenLastCalledWith(expect.any(String), 0, 'e1');
    });
  });

  describe('push: delegated handlers', () => {
    it('site_report delegates to syncSiteReports and maps conflict_status', async () => {
      const { svc, siteOps } = harness();
      siteOps.syncSiteReports.mockResolvedValue([{ conflict_status: 'CONFLICT_FLAGGED' }]);
      const res = await svc.push(
        push({ entity_type: 'site_report', entity_id: 'r1', payload: { summary: 's' } }),
      );
      expect(res.status).toBe('CONFLICT_FLAGGED');
      expect(siteOps.syncSiteReports).toHaveBeenCalledWith({
        items: [{ summary: 's', client_id: 'r1' }],
      });
    });

    it('site_report defaults to ACCEPTED when results are empty', async () => {
      const { svc, siteOps } = harness();
      siteOps.syncSiteReports.mockResolvedValue([]);
      const res = await svc.push(push({ entity_type: 'site_report', entity_id: 'r1' }));
      expect(res.status).toBe('ACCEPTED');
    });

    it('issue delegates to createIssue', async () => {
      const { svc, siteOps } = harness();
      siteOps.createIssue.mockResolvedValue({ issue_id: 'x1' });
      const res = await svc.push(push({ entity_type: 'issue', payload: { title: 'leak' } }));
      expect(res).toEqual({ status: 'ACCEPTED', server_payload: { issue_id: 'x1' } });
    });

    it('attendance delegates to recordAttendance using payload.worker_id', async () => {
      const { svc, workforce } = harness();
      workforce.recordAttendance.mockResolvedValue({ log_id: 'l1' });
      const res = await svc.push(
        push({ entity_type: 'attendance', payload: { worker_id: 'w1', project_id: 'p1' } }),
      );
      expect(res).toEqual({ status: 'ACCEPTED', server_payload: { log_id: 'l1' } });
      expect(workforce.recordAttendance).toHaveBeenCalledWith('w1', {
        worker_id: 'w1',
        project_id: 'p1',
      });
    });

    it('attendance falls back to entity_id when worker_id is absent', async () => {
      const { svc, workforce } = harness();
      workforce.recordAttendance.mockResolvedValue({ log_id: 'l2' });
      await svc.push(push({ entity_type: 'attendance', entity_id: 'w9', payload: {} }));
      expect(workforce.recordAttendance).toHaveBeenCalledWith('w9', {});
    });

    it('safety delegates to createIncident', async () => {
      const { svc, safety } = harness();
      safety.createIncident.mockResolvedValue({ incident_id: 'i1' });
      const res = await svc.push(
        push({ entity_type: 'safety', payload: { incident_type: 'FALL' } }),
      );
      expect(res).toEqual({ status: 'ACCEPTED', server_payload: { incident_id: 'i1' } });
    });

    it('material delegates to createMaterialConsumption with report_id', async () => {
      const { svc, siteOps } = harness();
      siteOps.createMaterialConsumption.mockResolvedValue({ consumption_id: 'c1' });
      const res = await svc.push(
        push({ entity_type: 'material', payload: { report_id: 'rep1', material_name: 'cement' } }),
      );
      expect(res).toEqual({ status: 'ACCEPTED', server_payload: { consumption_id: 'c1' } });
      expect(siteOps.createMaterialConsumption).toHaveBeenCalledWith('rep1', {
        report_id: 'rep1',
        material_name: 'cement',
      });
    });

    it('inspection delegates to submitInspection (offline path, §17.4)', async () => {
      const { svc, siteOps } = harness();
      siteOps.submitInspection.mockResolvedValue({ inspection_id: 'insp1', status: 'FAILED' });
      const payload = {
        project_id: 'p1',
        checklist_id: 'c1',
        status: 'FAILED',
        inspected_at: '2026-07-07T00:00:00Z',
      };
      const res = await svc.push(push({ entity_type: 'inspection', payload }));
      expect(res).toEqual({
        status: 'ACCEPTED',
        server_payload: { inspection_id: 'insp1', status: 'FAILED' },
      });
      expect(siteOps.submitInspection).toHaveBeenCalledWith(payload);
    });

    it('photo_annotation delegates to AnnotationService and passes conflict_status through', async () => {
      const { svc, annotations } = harness();
      annotations.applyPush.mockResolvedValue({
        conflict_status: 'ACCEPTED',
        server_version: 2,
        annotation: { file_id: 'f1', strokes: [{ tool: 'pen' }], version: 2 },
      });

      const res = await svc.push(
        push({
          entity_type: 'photo_annotation',
          entity_id: 'f1',
          payload: { strokes: [{ tool: 'pen' }], version: 1 },
        }),
      );

      expect(annotations.applyPush).toHaveBeenCalledWith('f1', [{ tool: 'pen' }], 1);
      expect(res).toEqual({
        status: 'ACCEPTED',
        server_payload: { file_id: 'f1', strokes: [{ tool: 'pen' }], version: 2 },
      });
    });

    it('photo_annotation surfaces CONFLICT_FLAGGED and omits server_payload when none', async () => {
      const { svc, annotations } = harness();
      annotations.applyPush.mockResolvedValue({
        conflict_status: 'CONFLICT_FLAGGED',
        server_version: 5,
        annotation: null,
      });

      const res = await svc.push(push({ entity_type: 'photo_annotation', entity_id: 'f1' }));

      // payload defaults: strokes → [], version → 0
      expect(annotations.applyPush).toHaveBeenCalledWith('f1', [], 0);
      expect(res).toEqual({ status: 'CONFLICT_FLAGGED', server_payload: undefined });
    });

    it('rejects an unknown entity_type', async () => {
      const { svc } = harness();
      await expect(svc.push(push({ entity_type: 'nope' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('delta', () => {
    it('returns updated rows tagged with entity_type + tombstone deletes', async () => {
      const { svc, tx } = harness();
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ task_id: 't1', progress_percent: 50 }])
        .mockResolvedValueOnce([{ entity_id: 'del-1' }]);
      const res = await svc.delta('2026-01-01T00:00:00Z', ['task']);
      expect(res.updated).toEqual([{ entity_type: 'task', task_id: 't1', progress_percent: 50 }]);
      expect(res.deleted).toEqual(['del-1']);
      expect(typeof res.server_timestamp).toBe('string');
    });

    it('ignores unknown entity types and skips the tombstone query when none are valid', async () => {
      const { svc, tx } = harness();
      const res = await svc.delta('2026-01-01T00:00:00Z', ['bogus']);
      expect(res.updated).toEqual([]);
      expect(res.deleted).toEqual([]);
      expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('recordTombstone', () => {
    it('inserts a tombstone row', async () => {
      const { svc, tx } = harness();
      tx.$queryRawUnsafe.mockResolvedValue(undefined);
      await svc.recordTombstone('task', 't1');
      expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('sync_tombstones'),
        'task',
        't1',
      );
    });
  });
});
