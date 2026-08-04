import { BadRequestException } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { SyncService } from '../sync.service';
import { PushItemDto } from '../dto/sync.dto';
import { CLS_SYNC_ALLOWED_ENTITY_TYPES } from '../../../shared/context/cls-context';

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

    // Financial records are ONLINE-REQUIRED (spec §17.4) — never offline-writable. The push switch
    // has no case for them, so they fall through to the default rejection: financial data can never
    // enter the sync queue and thus is never auto-merged, auto-overwritten, or silently discarded.
    it('rejects financial entity_types — online-required, never offline-synced (§17.4)', async () => {
      const { svc } = harness();
      for (const financial of ['payment', 'invoice', 'budget', 'po']) {
        await expect(svc.push(push({ entity_type: financial }))).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
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

    // `constructor` / `toString` / `hasOwnProperty` resolve on Object.prototype, so a truthiness
    // check on the registry passed them through and interpolated `undefined` as the table name.
    it('rejects prototype-chain keys as entity types', async () => {
      const { svc, tx } = harness();
      const res = await svc.delta('2026-01-01T00:00:00Z', [
        'constructor',
        'toString',
        'hasOwnProperty',
      ]);
      expect(res.updated).toEqual([]);
      expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('honours the types SyncAuthGuard cleared, dropping the rest', async () => {
      const { svc, tx } = harness();
      tx.$queryRawUnsafe.mockResolvedValue([]);
      const cls = ClsServiceManager.getClsService();
      await cls.run(async () => {
        cls.set(CLS_SYNC_ALLOWED_ENTITY_TYPES, ['task']);
        await svc.delta('2026-01-01T00:00:00Z', ['task', 'safety']);
      });
      // Only the `task` page plus the tombstone query — `safety` never reaches SQL.
      const tables = tx.$queryRawUnsafe.mock.calls.map((c) => String(c[0]));
      expect(tables.some((sql) => sql.includes('projects.tasks'))).toBe(true);
      expect(tables.some((sql) => sql.includes('site_ops.incidents'))).toBe(false);
    });

    it('queries nothing when the guard cleared no types', async () => {
      const { svc, tx } = harness();
      const cls = ClsServiceManager.getClsService();
      await cls.run(async () => {
        cls.set(CLS_SYNC_ALLOWED_ENTITY_TYPES, []);
        const res = await svc.delta('2026-01-01T00:00:00Z', ['task', 'safety']);
        expect(res.updated).toEqual([]);
      });
      expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('bounds every query — the controller defaults `since` to the epoch', async () => {
      const { svc, tx } = harness();
      tx.$queryRawUnsafe.mockResolvedValue([]);

      await svc.delta(new Date(0).toISOString(), ['task']);

      for (const call of tx.$queryRawUnsafe.mock.calls) {
        expect(call[0]).toContain('LIMIT');
        expect(call[0]).toContain('ORDER BY');
      }
    });

    it('reports has_more and resumes from the truncated watermark, not "now"', async () => {
      const { svc, tx } = harness();
      // A full page for `task`, whose last row is dated well before now.
      const lastSeen = new Date('2026-02-01T00:00:00.000Z');
      const page = Array.from({ length: 500 }, (_, i) => ({
        task_id: `t${i}`,
        created_at: i === 499 ? lastSeen : new Date('2026-01-15T00:00:00.000Z'),
      }));
      tx.$queryRawUnsafe.mockResolvedValueOnce(page).mockResolvedValueOnce([]);

      const res = await svc.delta('2026-01-01T00:00:00Z', ['task']);

      expect(res.updated).toHaveLength(500);
      expect(res.has_more).toBe(true);
      // Returning "now" here would silently skip every row that did not fit in the page.
      expect(res.server_timestamp).toBe(lastSeen.toISOString());
    });

    // toIso's string branch. pg returns Date for timestamptz, but $queryRawUnsafe is untyped and a
    // driver/-adapter change (or a text-cast column) hands back a string. Getting this wrong means
    // has_more is true with no usable watermark, and the client re-requests the same page forever.
    it('accepts an ISO string delta column, not just a Date', async () => {
      const { svc, tx } = harness();
      const page = Array.from({ length: 500 }, (_, i) => ({
        task_id: `t${i}`,
        created_at: i === 499 ? '2026-02-01T00:00:00.000Z' : '2026-01-15T00:00:00.000Z',
      }));
      tx.$queryRawUnsafe.mockResolvedValueOnce(page).mockResolvedValueOnce([]);

      const res = await svc.delta('2026-01-01T00:00:00Z', ['task']);
      expect(res.has_more).toBe(true);
      expect(res.server_timestamp).toBe('2026-02-01T00:00:00.000Z');
    });

    it('ignores an unparseable delta column rather than emitting a bad cursor', async () => {
      const { svc, tx } = harness();
      const page = Array.from({ length: 500 }, (_, i) => ({
        task_id: `t${i}`,
        created_at: 'not-a-date',
      }));
      tx.$queryRawUnsafe.mockResolvedValueOnce(page).mockResolvedValueOnce([]);

      const res = await svc.delta('2026-01-01T00:00:00Z', ['task']);
      // No watermark could be derived, so there is nothing to resume from — reporting has_more with
      // a garbage cursor would be worse than reporting the page as complete.
      expect(res.has_more).toBe(false);
    });

    it('ignores a delta column that is neither Date nor string', async () => {
      const { svc, tx } = harness();
      const page = Array.from({ length: 500 }, (_, i) => ({ task_id: `t${i}`, created_at: null }));
      tx.$queryRawUnsafe.mockResolvedValueOnce(page).mockResolvedValueOnce([]);
      expect((await svc.delta('2026-01-01T00:00:00Z', ['task'])).has_more).toBe(false);
    });

    it('reports has_more when the TOMBSTONE page is full, using its own watermark', async () => {
      const { svc, tx } = harness();
      const lastDeleted = new Date('2026-03-01T00:00:00.000Z');
      const tombstones = Array.from({ length: 500 }, (_, i) => ({
        entity_id: `d${i}`,
        deleted_at: i === 499 ? lastDeleted : new Date('2026-02-15T00:00:00.000Z'),
      }));
      // updated page short, tombstone page full — truncation can come from either side.
      tx.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce(tombstones);

      const res = await svc.delta('2026-01-01T00:00:00Z', ['task']);
      expect(res.deleted).toHaveLength(500);
      expect(res.has_more).toBe(true);
      expect(res.server_timestamp).toBe(lastDeleted.toISOString());
    });

    it('ignores an unparseable tombstone watermark', async () => {
      const { svc, tx } = harness();
      const tombstones = Array.from({ length: 500 }, (_, i) => ({
        entity_id: `d${i}`,
        deleted_at: 'not-a-date',
      }));
      tx.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce(tombstones);
      expect((await svc.delta('2026-01-01T00:00:00Z', ['task'])).has_more).toBe(false);
    });

    it('resumes from the LOWEST watermark when two types truncate at different points', async () => {
      const { svc, tx } = harness();
      const mk = (last: string) =>
        Array.from({ length: 500 }, (_, i) => ({
          id: `x${i}`,
          modified_at: i === 499 ? new Date(last) : new Date('2026-01-02T00:00:00.000Z'),
        }));
      tx.$queryRawUnsafe
        .mockResolvedValueOnce(mk('2026-05-01T00:00:00.000Z')) // site_report — later
        .mockResolvedValueOnce(mk('2026-04-01T00:00:00.000Z')) // issue — earlier
        .mockResolvedValueOnce([]); // tombstones

      const res = await svc.delta('2026-01-01T00:00:00Z', ['site_report', 'issue']);
      // Resuming from the later watermark would skip every issue row between the two points.
      expect(res.server_timestamp).toBe('2026-04-01T00:00:00.000Z');
    });

    it('picks the lowest watermark regardless of which type truncated earlier', async () => {
      // Same assertion with the order reversed. The reduce keeps whichever side is smaller, so both
      // orderings have to hold — a `>` typo passes the previous test and fails this one.
      const { svc, tx } = harness();
      const mk = (last: string) =>
        Array.from({ length: 500 }, (_, i) => ({
          id: `x${i}`,
          modified_at: i === 499 ? new Date(last) : new Date('2026-01-02T00:00:00.000Z'),
        }));
      tx.$queryRawUnsafe
        .mockResolvedValueOnce(mk('2026-04-01T00:00:00.000Z')) // site_report — earlier
        .mockResolvedValueOnce(mk('2026-05-01T00:00:00.000Z')) // issue — later
        .mockResolvedValueOnce([]);

      const res = await svc.delta('2026-01-01T00:00:00Z', ['site_report', 'issue']);
      expect(res.server_timestamp).toBe('2026-04-01T00:00:00.000Z');
    });

    it('reports has_more false and a fresh timestamp when everything fit', async () => {
      const { svc, tx } = harness();
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ task_id: 't1', created_at: new Date('2026-01-02T00:00:00Z') }])
        .mockResolvedValueOnce([]);

      const before = Date.now();
      const res = await svc.delta('2026-01-01T00:00:00Z', ['task']);

      expect(res.has_more).toBe(false);
      expect(new Date(res.server_timestamp).getTime()).toBeGreaterThanOrEqual(before);
    });

    // ── Tombstone retention guard ──────────────────────────────────────────
    // TombstonePruneService deletes tombstones past the window, so a cursor older than it cannot
    // receive a complete deletion list. Without this signal those rows survive on the device.

    it('rejects an unparseable `since` cursor with 400, not a Postgres 500', async () => {
      const { svc } = harness();
      await expect(svc.delta('last-tuesday', ['task'])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('flags full_resync_required when the cursor predates the retention window', async () => {
      const { svc, tx } = harness();
      tx.$queryRawUnsafe.mockResolvedValue([]);
      // 200 days back — comfortably past the 90-day default.
      const stale = new Date(Date.now() - 200 * 86_400_000).toISOString();

      const res = await svc.delta(stale, ['task']);

      expect(res.full_resync_required).toBe(true);
      expect(res.retention_days).toBe(90);
    });

    it('still returns the paged rows alongside the flag — first sync must not break', async () => {
      const { svc, tx } = harness();
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ task_id: 't1' }])
        .mockResolvedValueOnce([{ entity_id: 'del-1' }]);

      // The controller's default for a client that never synced.
      const res = await svc.delta(new Date(0).toISOString(), ['task']);

      expect(res.full_resync_required).toBe(true);
      expect(res.updated).toEqual([{ entity_type: 'task', task_id: 't1' }]);
      expect(res.deleted).toEqual(['del-1']);
    });

    it('does not flag a cursor inside the window, and omits retention_days', async () => {
      const { svc, tx } = harness();
      tx.$queryRawUnsafe.mockResolvedValue([]);
      const recent = new Date(Date.now() - 86_400_000).toISOString();

      const res = await svc.delta(recent, ['task']);

      expect(res.full_resync_required).toBe(false);
      expect(res.retention_days).toBeUndefined();
    });

    it('tracks a SYNC_TOMBSTONE_RETENTION_DAYS override — one window, both sides', async () => {
      const original = process.env['SYNC_TOMBSTONE_RETENTION_DAYS'];
      process.env['SYNC_TOMBSTONE_RETENTION_DAYS'] = '7';
      try {
        const { svc, tx } = harness();
        tx.$queryRawUnsafe.mockResolvedValue([]);
        const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();

        const res = await svc.delta(tenDaysAgo, ['task']);

        expect(res.full_resync_required).toBe(true);
        expect(res.retention_days).toBe(7);
      } finally {
        if (original === undefined) delete process.env['SYNC_TOMBSTONE_RETENTION_DAYS'];
        else process.env['SYNC_TOMBSTONE_RETENTION_DAYS'] = original;
      }
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
