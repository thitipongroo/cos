// Unit tests — SiteOps Service (Phase 6)
// Focus: createSiteReport, syncSiteReports (conflict paths), createIssue,
//        updateIssue (field-level merge), submitInspection (passed/failed events),
//        resolveConflict.

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { SiteOpsService } from '../site-ops.service';
import { EventOutboxService } from '../../../shared/events/event-outbox.service';
import { makeOutboxDouble } from '../../../shared/events/__tests__/outbox-double';
import { SiteOpsRepository } from '../site-ops.repository';
import type {
  SiteReportRow,
  IssueRow,
  InspectionRow,
  SafetyChecklistRow,
  ConflictRecordRow,
} from '../site-ops.repository';
import { IssueSeverity, IssueType } from '../dto/create-issue.dto';
import { ReportShift, BlockerCategory } from '../dto/create-site-report.dto';
import { IssueStatus } from '../dto/update-issue.dto';
import { InspectionStatus } from '../public/submit-inspection.dto';

// ── Mocks ──────────────────────────────────────────────────────────────────

// §35.13 ESC-13: the service no longer holds a KafkaProducer — it hands the repository an outbox
// envelope (or a builder over the written row) that rides the business transaction. These tests
// therefore assert on what reached the repository, resolving builders exactly as the repo does.

jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue({ body: { hits: { hits: [] } } }),
  })),
}));

jest.mock('@cos/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockRepo = {
  projectExists: jest.fn(),
  createSiteReport: jest.fn(),
  findReportById: jest.fn(),
  findReportsByIds: jest.fn().mockResolvedValue(new Map()),
  findIssuesByIds: jest.fn().mockResolvedValue(new Map()),
  searchSiteReportsText: jest.fn().mockResolvedValue([]),
  searchIssuesText: jest.fn().mockResolvedValue([]),
  findReportsByNaturalKeys: jest.fn().mockResolvedValue(new Map()),
  replaceManpowerLogs: jest.fn(),
  // Default to "no breakdown recorded" — the shape getSiteReport must tolerate on every pre-existing
  // report. Tests that care override it per case.
  listManpowerLogs: jest.fn().mockResolvedValue([]),
  listSiteReports: jest.fn(),
  updateSiteReport: jest.fn(),
  updateReportStatus: jest.fn(),
  createIssue: jest.fn(),
  nextIssueNumber: jest.fn(),
  findIssueById: jest.fn(),
  listIssues: jest.fn(),
  updateIssue: jest.fn(),
  updateIssueStatus: jest.fn(),
  createInspection: jest.fn(),
  findChecklistById: jest.fn(),
  findInspections: jest.fn(),
  findInspectionById: jest.fn(),
  updateInspectionStatus: jest.fn(),
  listChecklists: jest.fn(),
  createConflictRecord: jest.fn(),
  listConflictRecords: jest.fn(),
  resolveConflictRecord: jest.fn(),
  insertMaterialConsumption: jest.fn(),
  findMaterialIdByName: jest.fn(),
  findCarbonFactor: jest.fn(),
  insertCarbonRecord: jest.fn(),
  writeOutboxEvent: jest.fn(),
};

/**
 * Resolves the outbox argument a repository mock received. Where the service passes a builder,
 * this invokes it with `row` exactly as the real repository does — so the builder body is
 * genuinely exercised (QM-1: an uncalled callback is uncovered code).
 */
const outboxArg = (
  fn: jest.Mock,
  argIndex: number,
  row?: unknown,
): { event_type?: string; payload?: Record<string, unknown> } | undefined => {
  const arg = fn.mock.calls[0]?.[argIndex];
  return typeof arg === 'function' ? arg(row) : arg;
};

const MOCK_REQUEST = {
  tenantId: 'tenant-uuid-1',
  tenantCode: 'acme_corp',
  userId: 'user-uuid-1',
  correlationId: 'corr-uuid-1',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function makeReport(overrides?: Partial<SiteReportRow>): SiteReportRow {
  return {
    report_id: 'report-1',
    project_id: 'project-1',
    tenant_id: 'tenant-uuid-1',
    report_date: new Date('2026-06-04'),
    submitted_by: 'user-uuid-1',
    status: 'DRAFT',
    summary: 'daily report',
    weather: 'sunny',
    manpower_count: 10,
    client_submitted_at: new Date('2026-06-04T08:00:00Z'),
    server_received_at: new Date('2026-06-04T08:01:00Z'),
    modified_at: new Date('2026-06-04T08:01:00Z'),
    ...overrides,
  };
}

function makeIssue(overrides?: Partial<IssueRow>): IssueRow {
  return {
    issue_id: 'issue-1',
    issue_number: 'ISS-2026-0001',
    project_id: 'project-1',
    tenant_id: 'tenant-uuid-1',
    report_id: null,
    title: 'Crack in foundation',
    description: null,
    severity: 'HIGH',
    status: 'OPEN',
    assigned_to: null,
    created_by: 'user-uuid-1',
    resolution_note: null,
    client_submitted_at: null,
    modified_at: new Date('2026-06-04T08:00:00Z'),
    created_at: new Date('2026-06-04T08:00:00Z'),
    ...overrides,
  };
}

function makeChecklist(overrides?: Partial<SafetyChecklistRow>): SafetyChecklistRow {
  return {
    checklist_id: 'checklist-1',
    project_id: 'project-1',
    tenant_id: 'tenant-uuid-1',
    checklist_name: 'Daily Safety Check',
    version: 1,
    items: [{ item_id: 'item-1', description: 'Wear helmet', is_required: true }],
    created_at: new Date(),
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

let service: SiteOpsService;

beforeEach(async () => {
  jest.clearAllMocks();
  // Default: the project the DTO names exists. Every site-ops write that carries a project_id checks
  // this first (site_reports / issues / inspections all FK to projects.projects), so the tests that
  // are about something ELSE need it to pass; the not-found tests override it.
  mockRepo.projectExists.mockResolvedValue(true);
  // Default: the sync write lands. Tests that exercise the "row vanished mid-sync" path override it.
  mockRepo.updateSiteReport.mockResolvedValue(makeReport());
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SiteOpsService,
      { provide: EventOutboxService, useValue: makeOutboxDouble().service },
      { provide: SiteOpsRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: MOCK_REQUEST },
    ],
  }).compile();
  service = await module.resolve<SiteOpsService>(SiteOpsService);
});

// ── Constructor fallbacks ─────────────────────────────────────────────────

describe('constructor', () => {
  it('uses empty strings when request has no context (covers ?? fallback branches)', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiteOpsService,
        { provide: EventOutboxService, useValue: makeOutboxDouble().service },
        { provide: SiteOpsRepository, useValue: mockRepo },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    const noCtxService = await module.resolve<SiteOpsService>(SiteOpsService);
    expect(noCtxService).toBeDefined();
    // Lazy getters (ADR-031): invoke them to exercise the `?? ''` fallback branches.
    expect((noCtxService as unknown as { tenantId: string }).tenantId).toBe('');
    expect((noCtxService as unknown as { userId: string }).userId).toBe('');
  });

  it('covers both OPENSEARCH_URL env-defined and default branches (line 59)', async () => {
    const original = process.env['OPENSEARCH_URL'];
    const build = async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SiteOpsService,
          { provide: EventOutboxService, useValue: makeOutboxDouble().service },
          { provide: SiteOpsRepository, useValue: mockRepo },
          { provide: REQUEST, useValue: MOCK_REQUEST },
        ],
      }).compile();
      return module.resolve<SiteOpsService>(SiteOpsService);
    };
    try {
      process.env['OPENSEARCH_URL'] = 'http://opensearch.internal:9200';
      expect(await build()).toBeDefined();
      delete process.env['OPENSEARCH_URL'];
      expect(await build()).toBeDefined();
    } finally {
      if (original === undefined) delete process.env['OPENSEARCH_URL'];
      else process.env['OPENSEARCH_URL'] = original;
    }
  });
});

// ── createSiteReport ──────────────────────────────────────────────────────

describe('createSiteReport', () => {
  it('creates report and returns it', async () => {
    const report = makeReport();
    mockRepo.createSiteReport.mockResolvedValue(report);

    const result = await service.createSiteReport({
      project_id: 'project-1',
      report_date: '2026-06-04',
      summary: 'daily report',
      blockers: 'crane down; concrete delivery late', // spec 11 §474
      weather: 'sunny',
      manpower_count: 10,
    });

    expect(mockRepo.createSiteReport).toHaveBeenCalledTimes(1);
    expect(mockRepo.createSiteReport).toHaveBeenCalledWith(
      expect.objectContaining({ blockers: 'crane down; concrete delivery late' }),
      expect.anything(),
    );
    expect(result.report_id).toBe('report-1');
  });

  // 20260808000001 — shift + blocker_category. Both are optional and must reach the repository as
  // given; the service never substitutes a value for either (NULL means "not recorded", and
  // defaulting shift to DAY would assert a fact nobody entered).
  it('passes shift and blocker_category through to the repository', async () => {
    mockRepo.createSiteReport.mockResolvedValue(makeReport());

    await service.createSiteReport({
      project_id: 'project-1',
      report_date: '2026-06-04',
      shift: ReportShift.NIGHT,
      blockers: 'heavy rain from 14:00',
      blocker_category: BlockerCategory.WEATHER,
    });

    expect(mockRepo.createSiteReport).toHaveBeenCalledWith(
      expect.objectContaining({ shift: 'NIGHT', blocker_category: 'WEATHER' }),
      expect.anything(),
    );
  });

  // The per-trade breakdown is optional, and the branch that writes it had no unit test — the
  // repository method was covered, the service's decision to CALL it was not, so QM-1's 100% branch
  // gate caught it. It is not a formality: the logs are keyed off the row's OWN report_id, because
  // createSiteReport UPSERTs on (project_id, report_date, submitted_by) and a resubmit returns the
  // existing row while the freshly generated UUID is discarded. Keying off the generated id would
  // orphan every line on the second submit of the same day.
  it('writes the per-trade breakdown against the report row, not the generated id', async () => {
    const report = makeReport();
    mockRepo.createSiteReport.mockResolvedValue(report);

    await service.createSiteReport({
      project_id: 'project-1',
      report_date: '2026-06-04',
      manpower_lines: [
        { trade_type: 'CARPENTER', worker_count: 4, hours_worked: 6 },
        // hours_worked omitted — the column is NOT NULL, so a standard shift stands in.
        { trade_type: 'STEELWORKER', worker_count: 2 },
      ],
    } as never);

    expect(mockRepo.replaceManpowerLogs).toHaveBeenCalledWith(report.report_id, [
      { trade_type: 'CARPENTER', worker_count: 4, hours_worked: 6 },
      { trade_type: 'STEELWORKER', worker_count: 2, hours_worked: 8 },
    ]);
  });

  it('writes no breakdown when the caller sends none', async () => {
    // The other side of the branch: absent lines must not produce an empty DELETE-then-insert, which
    // would clear a breakdown a previous submit had recorded for the same day.
    mockRepo.createSiteReport.mockResolvedValue(makeReport());

    await service.createSiteReport({ project_id: 'project-1', report_date: '2026-06-04' });

    expect(mockRepo.replaceManpowerLogs).not.toHaveBeenCalled();
  });

  it('writes site.report.created.v1 to the outbox with the report INSERT', async () => {
    mockRepo.createSiteReport.mockResolvedValue(makeReport());
    await service.createSiteReport({ project_id: 'project-1', report_date: '2026-06-04' });
    // Same repository call as the INSERT ⇒ the event cannot survive a rollback.
    expect(outboxArg(mockRepo.createSiteReport, 1, makeReport())).toEqual(
      expect.objectContaining({
        event_type: 'site.report.created.v1',
        tenant_id: 'tenant-uuid-1',
        actor_id: 'user-uuid-1',
      }),
    );
  });

  // A same-day resubmission upserts onto the existing report, which keeps its own report_id; the
  // UUID the service generated is discarded. The event is built from the written row, so it names
  // the report that exists — the PM's notification shows it and the search indexer loads it.
  it('site.report.created.v1 names the written row, not the generated id (same-day resubmission)', async () => {
    const existing = makeReport({ report_id: 'existing-report' });
    mockRepo.createSiteReport.mockResolvedValue(existing);
    await service.createSiteReport({
      project_id: 'project-1',
      report_date: '2026-06-04',
      summary: 'second version',
    });

    const generated = (mockRepo.createSiteReport.mock.calls[0]![0] as { report_id: string })
      .report_id;
    expect(generated).not.toBe('existing-report');
    const event = outboxArg(mockRepo.createSiteReport, 1, existing);
    expect(event?.payload).toEqual(
      expect.objectContaining({ report_id: 'existing-report', summary: 'second version' }),
    );
  });
});

// ── getSiteReport ─────────────────────────────────────────────────────────

describe('getSiteReport', () => {
  it('returns report when found', async () => {
    mockRepo.findReportById.mockResolvedValue(makeReport());
    const result = await service.getSiteReport('report-1');
    expect(result.report_id).toBe('report-1');
  });

  it('attaches the per-trade manpower breakdown', async () => {
    mockRepo.findReportById.mockResolvedValue(makeReport());
    mockRepo.listManpowerLogs.mockResolvedValueOnce([
      { trade_type: 'STRUCTURAL', worker_count: 16 },
      { trade_type: 'ELECTRICAL', worker_count: 8 },
    ]);

    const result = await service.getSiteReport('report-1');

    expect(result.manpower_lines).toHaveLength(2);
    expect(result.manpower_lines[0]).toEqual(expect.objectContaining({ trade_type: 'STRUCTURAL' }));
  });

  // A report filed before the breakdown existed has none. That is data, not an error.
  it('returns an empty breakdown when none was recorded', async () => {
    mockRepo.findReportById.mockResolvedValue(makeReport());
    const result = await service.getSiteReport('report-1');
    expect(result.manpower_lines).toEqual([]);
  });

  it('throws NotFoundException when not found', async () => {
    mockRepo.findReportById.mockResolvedValue(null);
    await expect(service.getSiteReport('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── syncSiteReports — new report ──────────────────────────────────────────

describe('syncSiteReports', () => {
  it('ACCEPTED for new report (no existing record)', async () => {
    mockRepo.findReportsByIds.mockResolvedValue(new Map());
    mockRepo.createSiteReport.mockResolvedValue(makeReport({ report_id: 'new-id' }));

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'new-id',
          project_id: 'project-1',
          report_date: '2026-06-04',
          client_submitted_at: '2026-06-04T09:00:00Z',
        },
      ],
    });

    expect(results[0]?.conflict_status).toBe('ACCEPTED');
    expect(results[0]?.report_id).toBe('new-id');
  });

  // A second device id for a (project, day, submitter) that already has a report normally takes the
  // edit path (see "natural-key hit" below). When the lookup misses it — the row was written after
  // it, or it failed — the create path upserts onto that report, and site.report.submitted.v1 must
  // still name the row, not client_id.
  it('site.report.submitted.v1 names the written row when a new client_id upserts onto a report', async () => {
    mockRepo.findReportsByIds.mockResolvedValue(new Map());
    const existing = makeReport({ report_id: 'existing-report' });
    mockRepo.createSiteReport.mockResolvedValue(existing);

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'second-device-id',
          project_id: 'project-1',
          report_date: '2026-06-04',
          client_submitted_at: '2026-06-04T09:00:00Z',
        },
      ],
    });

    expect(results[0]?.report_id).toBe('existing-report');
    const event = outboxArg(mockRepo.createSiteReport, 1, existing);
    expect(event?.event_type).toBe('site.report.submitted.v1');
    expect(event?.payload).toEqual(expect.objectContaining({ report_id: 'existing-report' }));
  });

  it('logs a warning when the device clock was ahead, and still accepts the edit', async () => {
    // OQ-28. A clamped timestamp is NOT a conflict — the merge resolved — but the device that
    // produced it will keep producing them and the fix is on the device. Without this log the only
    // trace is a merge outcome that quietly went the other way.
    const existing = makeReport({ report_id: 'existing-id' });
    mockRepo.findReportsByIds.mockResolvedValue(new Map([['existing-id', existing]]));
    mockRepo.updateSiteReport.mockResolvedValue(existing);
    const warn = jest.requireMock('@cos/logger').createLogger().warn as jest.Mock;
    warn.mockClear();

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'existing-id',
          project_id: 'project-1',
          report_date: '2026-06-04',
          summary: 'edited offline',
          // Two days ahead of the server clock — well past the five-minute tolerance.
          client_submitted_at: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
        },
      ],
    });

    expect(results[0]?.conflict_status).not.toBe('CONFLICT_REJECTED');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'sync.clock_skew_clamped',
        entity_type: 'site_reports',
        entity_id: 'existing-id',
      }),
      expect.stringContaining('ahead of the server clock'),
    );
  });

  it('still syncs when the batch pre-fetch fails — every item takes the create path', async () => {
    // The pre-fetch is one set-based lookup replacing a per-item read. If it rejects (a malformed id
    // slipping past the UUID filter would break the ::uuid[] cast for the WHOLE batch), the catch
    // degrades to an empty map, which is exactly what the old per-item `.catch(() => null)` did:
    // a sync push from the field must not fail wholesale because a lookup could not be optimised.
    mockRepo.findReportsByIds.mockRejectedValue(new Error('invalid input syntax for type uuid'));
    mockRepo.createSiteReport.mockResolvedValue(makeReport({ report_id: 'recovered-id' }));

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'recovered-id',
          project_id: 'project-1',
          report_date: '2026-06-04',
          client_submitted_at: '2026-06-04T09:00:00Z',
        },
      ],
    });

    expect(results[0]?.conflict_status).toBe('ACCEPTED');
    expect(mockRepo.createSiteReport).toHaveBeenCalledTimes(1);
  });

  it('ACCEPTED for new report with all optional fields provided (covers ?? null true branches)', async () => {
    mockRepo.findReportsByIds.mockResolvedValue(new Map());
    mockRepo.createSiteReport.mockResolvedValue(makeReport({ report_id: 'new-full-id' }));

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'new-full-id',
          project_id: 'project-1',
          report_date: '2026-06-04',
          client_submitted_at: '2026-06-04T09:00:00Z',
          weather: 'cloudy', // optional field provided
          manpower_count: 15, // optional field provided
          summary: 'full report', // optional field provided
          blockers: 'access road blocked', // optional field provided (spec 11 §474)
        },
      ],
    });

    expect(results[0]?.conflict_status).toBe('ACCEPTED');
  });

  it('ACCEPTED for new report with no optional fields (covers ?? null false branches)', async () => {
    mockRepo.findReportsByIds.mockResolvedValue(new Map());
    mockRepo.createSiteReport.mockResolvedValue(makeReport({ report_id: 'bare-id' }));

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'bare-id',
          project_id: 'project-1',
          report_date: '2026-06-05',
          // no client_submitted_at, weather, manpower_count, summary
        },
      ],
    });

    expect(results[0]?.conflict_status).toBe('ACCEPTED');
  });

  it('ACCEPTED for existing report with no client_submitted_at (covers ?? new Date() branch)', async () => {
    const serverReport = makeReport({ modified_at: new Date('2026-06-04T07:00:00Z') });
    mockRepo.findReportsByIds.mockResolvedValue(new Map([['report-1', serverReport]]));
    mockRepo.createSiteReport.mockResolvedValue(serverReport);

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'report-1',
          project_id: 'project-1',
          report_date: '2026-06-04',
          // no client_submitted_at → ?? new Date().toISOString() branch
          last_known_modified_at: '2026-06-04T10:00:00Z',
        },
      ],
    });
    expect(results[0]).toBeDefined();
  });

  it('CONFLICT_FLAGGED when server modified after client last sync', async () => {
    const serverReport = makeReport({
      modified_at: new Date('2026-06-04T10:00:00Z'),
    });
    mockRepo.findReportsByIds.mockResolvedValue(new Map([['report-1', serverReport]]));
    mockRepo.createConflictRecord.mockResolvedValue({});

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'report-1',
          project_id: 'project-1',
          report_date: '2026-06-04',
          client_submitted_at: '2026-06-04T11:00:00Z',
          last_known_modified_at: '2026-06-04T08:00:00Z', // older than server
        },
      ],
    });

    expect(results[0]?.conflict_status).toBe('CONFLICT_FLAGGED');
    expect(mockRepo.createConflictRecord).toHaveBeenCalledTimes(1);
    // The notification event rides the conflict record's own INSERT.
    expect(outboxArg(mockRepo.createConflictRecord, 1)).toEqual(
      expect.objectContaining({
        event_type: 'site.conflict.flagged.v1',
        payload: expect.objectContaining({
          entity_type: 'site_reports',
          conflict_type: 'FIELD_CONFLICT',
        }),
      }),
    );
  });

  // ── Regression: the edit path must actually write ────────────────────────
  // This branch previously computed a resolution, wrote a conflict record when flagged, and returned
  // ACCEPTED without ever updating the report — so offline edits were acknowledged and dropped.

  it('persists the client fields when syncing an edit to an existing report', async () => {
    mockRepo.findReportsByIds.mockResolvedValue(
      new Map([
        [
          'report-1',
          makeReport({ summary: 'server text', modified_at: new Date('2026-06-04T07:00:00Z') }),
        ],
      ]),
    );

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'report-1',
          project_id: 'project-1',
          report_date: '2026-06-04',
          summary: 'edited offline',
          weather: 'rain',
          manpower_count: 12,
          client_submitted_at: '2026-06-04T09:00:00Z',
        },
      ],
    });

    expect(results[0]?.conflict_status).toBe('ACCEPTED');
    expect(mockRepo.updateSiteReport).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({
        summary: 'edited offline',
        weather: 'rain',
        manpower_count: 12,
        client_submitted_at: '2026-06-04T09:00:00Z',
      }),
      expect.any(Function),
    );
  });

  it('persists a client-wins overwrite even when the result is flagged for review', async () => {
    mockRepo.findReportsByIds.mockResolvedValue(
      new Map([['report-1', makeReport({ modified_at: new Date('2026-06-04T10:00:00Z') })]]),
    );
    mockRepo.createConflictRecord.mockResolvedValue({});

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'report-1',
          project_id: 'project-1',
          report_date: '2026-06-04',
          summary: 'client wins but flagged',
          client_submitted_at: '2026-06-04T11:00:00Z',
          last_known_modified_at: '2026-06-04T08:00:00Z',
        },
      ],
    });

    expect(results[0]?.conflict_status).toBe('CONFLICT_FLAGGED');
    expect(mockRepo.updateSiteReport).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({ summary: 'client wins but flagged' }),
      expect.any(Function),
    );
  });

  it('does NOT write when the server row wins — a no-op write would bump modified_at', async () => {
    mockRepo.findReportsByIds.mockResolvedValue(
      new Map([['report-1', makeReport({ modified_at: new Date('2026-06-04T10:00:00Z') })]]),
    );
    mockRepo.createConflictRecord.mockResolvedValue({});

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'report-1',
          project_id: 'project-1',
          report_date: '2026-06-04',
          summary: 'stale client edit',
          client_submitted_at: '2026-06-04T09:00:00Z', // older than server modified_at
          last_known_modified_at: '2026-06-04T08:00:00Z',
        },
      ],
    });

    expect(results[0]?.conflict_status).toBe('CONFLICT_FLAGGED');
    expect(mockRepo.updateSiteReport).not.toHaveBeenCalled();
  });

  it('reports CONFLICT_REJECTED instead of ACCEPTED when the row vanished mid-sync', async () => {
    mockRepo.findReportsByIds.mockResolvedValue(
      new Map([['report-1', makeReport({ modified_at: new Date('2026-06-04T07:00:00Z') })]]),
    );
    mockRepo.updateSiteReport.mockResolvedValue(null); // deleted between read and write

    const results = await service.syncSiteReports({
      items: [
        {
          client_id: 'report-1',
          project_id: 'project-1',
          report_date: '2026-06-04',
          summary: 'edit that cannot land',
          client_submitted_at: '2026-06-04T09:00:00Z',
        },
      ],
    });

    expect(results[0]?.conflict_status).toBe('CONFLICT_REJECTED');
  });
});

// ── createIssue ───────────────────────────────────────────────────────────

describe('createIssue', () => {
  beforeEach(() => mockRepo.nextIssueNumber.mockResolvedValue('ISS-2026-0001'));

  // Offline idempotency. `client_id` has been accepted since G-M11 for photo linkage, but the write
  // was not idempotent on it: a replayed queue item hit issues_pkey and came back a 500, which the
  // device's outbox reads as a retryable failure - so the issue existed on the server while the
  // person who raised it watched it retry five times and get discarded under 17.2.
  describe('replayed offline create', () => {
    /** Outbox publish mock of the service under test — events are queued now, not published. */
    const publishMock = (): jest.Mock =>
      (service as unknown as { outbox: { publish: jest.Mock } }).outbox.publish;

    it('returns the issue already raised, without re-emitting or re-numbering', async () => {
      const existing = makeIssue({ issue_id: 'client-uuid' });
      mockRepo.findIssueById.mockResolvedValue(existing);
      publishMock().mockClear();

      const result = await service.createIssue({
        client_id: 'client-uuid',
        project_id: 'project-1',
        title: 'Crack in foundation',
        severity: IssueSeverity.HIGH,
      });

      expect(result).toBe(existing);
      expect(mockRepo.createIssue).not.toHaveBeenCalled();
      // No second notification, and no second read of the ISS-<year>-<seq> sequence.
      expect(mockRepo.nextIssueNumber).not.toHaveBeenCalled();
      expect(publishMock()).not.toHaveBeenCalled();
    });

    it('does not look for an existing issue when the caller sent no client_id', async () => {
      mockRepo.findIssueById.mockResolvedValue(null);
      mockRepo.createIssue.mockResolvedValue(makeIssue());

      await service.createIssue({
        project_id: 'project-1',
        title: 'Crack in foundation',
        severity: IssueSeverity.HIGH,
      });

      expect(mockRepo.findIssueById).not.toHaveBeenCalled();
      expect(mockRepo.createIssue).toHaveBeenCalled();
    });

    it('resolves a concurrent replay that won the insert race', async () => {
      // Nothing found by the pre-check, then an empty RETURNING from ON CONFLICT DO NOTHING.
      const existing = makeIssue({ issue_id: 'client-uuid' });
      mockRepo.findIssueById.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
      mockRepo.createIssue.mockResolvedValue(null);
      publishMock().mockClear();

      const result = await service.createIssue({
        client_id: 'client-uuid',
        project_id: 'project-1',
        title: 'Crack in foundation',
        severity: IssueSeverity.HIGH,
      });

      expect(result).toBe(existing);
      expect(publishMock()).not.toHaveBeenCalled();
    });

    it('rejects an id that conflicts but is invisible - it belongs to another tenant', async () => {
      // RLS hides the row while the primary key still rejects the insert. A silent success would
      // report an issue this tenant cannot see and nobody will act on.
      mockRepo.findIssueById.mockResolvedValue(null);
      mockRepo.createIssue.mockResolvedValue(null);

      await expect(
        service.createIssue({
          client_id: 'client-uuid',
          project_id: 'project-1',
          title: 'Crack in foundation',
          severity: IssueSeverity.HIGH,
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  it('creates issue and emits site.issue.created.v1', async () => {
    mockRepo.createIssue.mockResolvedValue(makeIssue());
    const result = await service.createIssue({
      project_id: 'project-1',
      title: 'Crack in foundation',
      severity: IssueSeverity.HIGH,
    });
    expect(result.issue_id).toBe('issue-1');
    expect(outboxArg(mockRepo.createIssue, 1)).toEqual(
      expect.objectContaining({ event_type: 'site.issue.created.v1' }),
    );
  });

  // issue_type — the field app classifies at source; the value must reach the row unchanged.
  it('passes issue_type through to the repository', async () => {
    mockRepo.createIssue.mockResolvedValue(makeIssue());
    await service.createIssue({
      project_id: 'project-1',
      title: 'Rework on column formwork',
      severity: IssueSeverity.MEDIUM,
      issue_type: IssueType.REWORK,
    });
    expect(mockRepo.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ issue_type: 'REWORK' }),
      expect.anything(),
    );
  });

  // Omitted → null, so the COLUMN default ('GENERAL') decides. The service must not substitute a
  // default of its own, or the schema stops being the single place that value is defined.
  it('sends null issue_type when the caller omits it, leaving the column default to apply', async () => {
    mockRepo.createIssue.mockResolvedValue(makeIssue());
    await service.createIssue({
      project_id: 'project-1',
      title: 'Unclassified',
      severity: IssueSeverity.LOW,
    });
    expect(mockRepo.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ issue_type: null }),
      expect.anything(),
    );
  });

  it('uses the client-provided id as issue_id when present (G-M11 offline linkage)', async () => {
    mockRepo.createIssue.mockResolvedValue(makeIssue());
    await service.createIssue({
      project_id: 'project-1',
      title: 'Offline issue',
      severity: IssueSeverity.MEDIUM,
      client_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(mockRepo.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ issue_id: '11111111-1111-1111-1111-111111111111' }),
      expect.anything(),
    );
  });

  it('persists the acting user as created_by, not only in the event payload', async () => {
    // The value was always available here — it just never reached the row, so an issue the raiser
    // was never assigned was unattributable in their own PDPA export (20260804000004). The event
    // stream is a publish queue, not a queryable record of who raised what.
    mockRepo.createIssue.mockResolvedValue(makeIssue());
    await service.createIssue({
      project_id: 'project-1',
      title: 'Crack',
      severity: IssueSeverity.HIGH,
    });
    expect(mockRepo.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: 'user-uuid-1' }),
      expect.anything(),
    );
  });
});

// ── updateIssue — FIELD_LEVEL_MERGE ───────────────────────────────────────

describe('updateIssue', () => {
  it('throws NotFoundException when issue not found', async () => {
    mockRepo.findIssueById.mockResolvedValue(null);
    await expect(service.updateIssue('missing', { description: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('server status wins in a field-level merge once the server has moved', async () => {
    const serverIssue = makeIssue({ status: 'IN_PROGRESS' });
    mockRepo.findIssueById.mockResolvedValue(serverIssue);
    mockRepo.updateIssue.mockResolvedValue({ ...serverIssue, description: 'updated' });

    await service.updateIssue('issue-1', {
      status: IssueStatus.RESOLVED, // client wants RESOLVED
      description: 'updated',
      client_submitted_at: '2026-06-04T09:00:00Z',
      // The client is replaying an edit made against a state older than the server row — master:2591's
      // "while client had offline edit". Without this the call is an ordinary update and the client's
      // status simply applies.
      last_known_modified_at: '2026-06-04T07:00:00Z',
    });

    // updateIssue called with status = server status (IN_PROGRESS) not client (RESOLVED)
    expect(mockRepo.updateIssue).toHaveBeenCalledWith(
      'issue-1',
      expect.objectContaining({ status: 'IN_PROGRESS' }),
      expect.any(Function),
    );
  });

  it('logs the same clock-skew warning on the issue path', async () => {
    const serverIssue = makeIssue({ status: 'OPEN' });
    mockRepo.findIssueById.mockResolvedValue(serverIssue);
    mockRepo.updateIssue.mockResolvedValue({ ...serverIssue, description: 'edited' });
    const warn = jest.requireMock('@cos/logger').createLogger().warn as jest.Mock;
    warn.mockClear();

    await service.updateIssue('issue-1', {
      description: 'edited',
      client_submitted_at: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
    });

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'sync.clock_skew_clamped', entity_type: 'issues' }),
      expect.stringContaining('ahead of the server clock'),
    );
  });

  it('CONFLICT_FLAGGED creates conflict record when status changed server-side', async () => {
    const serverIssue = makeIssue({ status: 'RESOLVED' }); // server changed
    mockRepo.findIssueById.mockResolvedValue(serverIssue);
    mockRepo.updateIssue.mockResolvedValue(serverIssue);
    mockRepo.createConflictRecord.mockResolvedValue({});

    await service.updateIssue('issue-1', {
      status: IssueStatus.OPEN, // client thought it was still OPEN
      description: 'my update',
      client_submitted_at: '2026-06-04T09:00:00Z',
      last_known_modified_at: '2026-06-04T07:00:00Z',
    });

    expect(mockRepo.createConflictRecord).toHaveBeenCalledTimes(1);
    expect(outboxArg(mockRepo.createConflictRecord, 1)).toEqual(
      expect.objectContaining({
        event_type: 'site.conflict.flagged.v1',
        payload: expect.objectContaining({
          entity_type: 'issues',
          conflict_type: 'STATUS_CONFLICT',
        }),
      }),
    );
  });

  it('emits site.issue.status_changed.v1 when status actually changes', async () => {
    const serverIssue = makeIssue({ status: 'OPEN' });
    mockRepo.findIssueById.mockResolvedValue(serverIssue);
    // After merge, server status wins — but we're testing the path where both agree
    mockRepo.updateIssue.mockResolvedValue({ ...serverIssue, status: 'OPEN' });

    await service.updateIssue('issue-1', { status: IssueStatus.OPEN });
    // updateIssue never carries a status event — FIELD_LEVEL_MERGE makes the server status win,
    // so nothing can transition here (§35.13 ESC-21). Transitions go through changeIssueStatus.
    expect(mockRepo.updateIssue).toHaveBeenCalledWith(
      'issue-1',
      expect.any(Object),
      expect.any(Function),
    );
  });
});

// ── changeIssueStatus (§35.13 ESC-21) ──────────────────────────────────────

// Before this endpoint existed, PATCH /site/issues/:id was the only writer of issues.status and it
// applies FIELD_LEVEL_MERGE — the server's status always wins — so an issue could never leave OPEN
// and site.issue.status_changed.v1 was unreachable.
describe('changeIssueStatus', () => {
  it('throws NotFoundException when the issue does not exist', async () => {
    mockRepo.findIssueById.mockResolvedValue(null);
    await expect(
      service.changeIssueStatus('missing', { status: IssueStatus.RESOLVED }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockRepo.updateIssueStatus).not.toHaveBeenCalled();
  });

  it('persists the transition and builds the event from the UPDATEd row', async () => {
    const existing = makeIssue({ status: 'OPEN' });
    const updatedRow = makeIssue({ status: 'RESOLVED', resolution_note: 'fixed on site' });
    mockRepo.findIssueById.mockResolvedValue(existing);
    mockRepo.updateIssueStatus.mockResolvedValue(updatedRow);

    const result = await service.changeIssueStatus('issue-1', {
      status: IssueStatus.RESOLVED,
      resolution_note: 'fixed on site',
    });

    expect(result.status).toBe('RESOLVED');
    expect(mockRepo.updateIssueStatus).toHaveBeenCalledWith(
      'issue-1',
      'RESOLVED',
      'fixed on site',
      expect.any(Function),
    );
    expect(outboxArg(mockRepo.updateIssueStatus, 3, updatedRow)).toEqual(
      expect.objectContaining({
        event_type: 'site.issue.status_changed.v1',
        payload: {
          issue_id: 'issue-1',
          project_id: 'project-1',
          from_status: 'OPEN',
          to_status: 'RESOLVED',
        },
      }),
    );
  });

  it('passes a null resolution_note when none is supplied', async () => {
    mockRepo.findIssueById.mockResolvedValue(makeIssue({ status: 'OPEN' }));
    mockRepo.updateIssueStatus.mockResolvedValue(makeIssue({ status: 'IN_PROGRESS' }));

    await service.changeIssueStatus('issue-1', { status: IssueStatus.IN_PROGRESS });

    expect(mockRepo.updateIssueStatus).toHaveBeenCalledWith(
      'issue-1',
      'IN_PROGRESS',
      null,
      expect.any(Function),
    );
  });

  it('emits nothing when the status is unchanged — a no-op is not a transition', async () => {
    mockRepo.findIssueById.mockResolvedValue(makeIssue({ status: 'OPEN' }));
    mockRepo.updateIssueStatus.mockResolvedValue(makeIssue({ status: 'OPEN' }));

    await service.changeIssueStatus('issue-1', {
      status: IssueStatus.OPEN,
      resolution_note: 'note only',
    });

    // still persists the note, but hands the write no envelope
    expect(mockRepo.updateIssueStatus).toHaveBeenCalledWith(
      'issue-1',
      'OPEN',
      'note only',
      undefined,
    );
  });
});

// ── escalateIssue (G-M12) ──────────────────────────────────────────────────

describe('escalateIssue', () => {
  it('throws NotFoundException when issue not found', async () => {
    mockRepo.findIssueById.mockResolvedValue(null);
    await expect(service.escalateIssue('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('emits site.issue.escalated.v1 to notify the PM', async () => {
    mockRepo.findIssueById.mockResolvedValue(makeIssue({ issue_id: 'i-esc' }));
    const res = await service.escalateIssue('i-esc');
    expect(res).toEqual({ issue_id: 'i-esc', status: 'ESCALATED' });

    // No business write to be atomic with — the outbox is the durable relay (§35.13 ESC-13).
    expect(outboxArg(mockRepo.writeOutboxEvent, 0)).toEqual(
      expect.objectContaining({ event_type: 'site.issue.escalated.v1' }),
    );
  });
});

// ── submitInspection ──────────────────────────────────────────────────────

describe('submitInspection', () => {
  // Signature (migration 20260808000002). The drawn mark is stored as given; absent means unsigned,
  // and the service must not substitute anything — `inspected_by` is the attribution that matters.
  it('stores the drawn signature when one is supplied', async () => {
    mockRepo.findChecklistById.mockResolvedValue(makeChecklist());
    mockRepo.createInspection.mockResolvedValue({
      inspection_id: 'insp-1',
      project_id: 'project-1',
      tenant_id: 'tenant-uuid-1',
      checklist_id: 'checklist-1',
      status: 'PASSED' as const,
      inspected_by: 'user-uuid-1',
      inspected_at: new Date(),
      notes: null,
    });
    const signature = [{ d: 'M0.1,0.5 L0.4,0.3', color: '#F8FAFC', width: 0.01 }];

    await service.submitInspection({
      project_id: 'project-1',
      checklist_id: 'checklist-1',
      status: InspectionStatus.PASSED,
      inspected_at: '2026-08-08T08:00:00Z',
      signature,
    });

    expect(mockRepo.createInspection).toHaveBeenCalledWith(
      expect.objectContaining({ signature }),
      expect.anything(),
    );
  });

  it('records NULL when the checklist is confirmed without signing', async () => {
    mockRepo.findChecklistById.mockResolvedValue(makeChecklist());
    mockRepo.createInspection.mockResolvedValue({
      inspection_id: 'insp-1',
      project_id: 'project-1',
      tenant_id: 'tenant-uuid-1',
      checklist_id: 'checklist-1',
      status: 'PASSED' as const,
      inspected_by: 'user-uuid-1',
      inspected_at: new Date(),
      notes: null,
    });

    await service.submitInspection({
      project_id: 'project-1',
      checklist_id: 'checklist-1',
      status: InspectionStatus.PASSED,
      inspected_at: '2026-08-08T08:00:00Z',
    });

    expect(mockRepo.createInspection).toHaveBeenCalledWith(
      expect.objectContaining({ signature: null }),
      expect.anything(),
    );
  });

  it('throws NotFoundException when checklist not found', async () => {
    mockRepo.findChecklistById.mockResolvedValue(null);
    await expect(
      service.submitInspection({
        project_id: 'project-1',
        checklist_id: 'missing',
        status: InspectionStatus.PASSED,
        inspected_at: '2026-06-04T08:00:00Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('emits site.inspection.passed.v1 when status is PASSED', async () => {
    mockRepo.findChecklistById.mockResolvedValue(makeChecklist());
    mockRepo.createInspection.mockResolvedValue({
      inspection_id: 'insp-1',
      project_id: 'project-1',
      tenant_id: 'tenant-uuid-1',
      checklist_id: 'checklist-1',
      status: 'PASSED',
      inspected_by: 'user-uuid-1',
      inspected_at: new Date(),
      notes: null,
    } satisfies InspectionRow);

    await service.submitInspection({
      project_id: 'project-1',
      checklist_id: 'checklist-1',
      status: InspectionStatus.PASSED,
      inspected_at: '2026-06-04T08:00:00Z',
    });

    expect(outboxArg(mockRepo.createInspection, 1)).toEqual(
      expect.objectContaining({ event_type: 'site.inspection.passed.v1' }),
    );
  });

  it('emits site.inspection.failed.v1 when status is FAILED', async () => {
    mockRepo.findChecklistById.mockResolvedValue(makeChecklist());
    mockRepo.createInspection.mockResolvedValue({
      inspection_id: 'insp-2',
      project_id: 'project-1',
      tenant_id: 'tenant-uuid-1',
      checklist_id: 'checklist-1',
      status: 'FAILED',
      inspected_by: 'user-uuid-1',
      inspected_at: new Date(),
      notes: null,
    } satisfies InspectionRow);

    await service.submitInspection({
      project_id: 'project-1',
      checklist_id: 'checklist-1',
      status: InspectionStatus.FAILED,
      inspected_at: '2026-06-04T08:00:00Z',
      issue_severity: IssueSeverity.HIGH,
    });

    // spec 11 §517 — issue_severity is persisted on a FAILED inspection.
    expect(mockRepo.createInspection).toHaveBeenCalledWith(
      expect.objectContaining({ issue_severity: 'HIGH' }),
      expect.anything(),
    );

    expect(outboxArg(mockRepo.createInspection, 1)).toEqual(
      expect.objectContaining({ event_type: 'site.inspection.failed.v1' }),
    );
  });

  it('a FAILED checklist ALSO raises safety.compliance.failed.v1 (§19.6 / OQ-35)', async () => {
    // `19-notification-architecture` §19.6 names SafetyViolationDetected as one of two notifications
    // a user may not disable — and until 2026-08-22 nothing produced it, so that set had an unknown
    // size. A failed required item on a `site_ops.safety_checklists` row is one of its two sources.
    mockRepo.findChecklistById.mockResolvedValue(makeChecklist());
    mockRepo.createInspection.mockResolvedValue({
      inspection_id: 'insp-9',
      project_id: 'project-1',
      tenant_id: 'tenant-uuid-1',
      checklist_id: 'checklist-1',
      status: 'FAILED',
      inspected_by: 'user-uuid-1',
      inspected_at: new Date(),
      notes: null,
    } satisfies InspectionRow);

    await service.submitInspection({
      project_id: 'project-1',
      checklist_id: 'checklist-1',
      status: InspectionStatus.FAILED,
      inspected_at: '2026-06-04T08:00:00Z',
      issue_severity: IssueSeverity.HIGH,
    });

    // The event is built before the INSERT, so it carries the id the row is ABOUT to get — read it
    // back from the createInspection call rather than from the mock's return value.
    const createdId = (mockRepo.createInspection.mock.calls[0][0] as { inspection_id: string })
      .inspection_id;
    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'safety.compliance.failed.v1',
        payload: expect.objectContaining({
          failure_type: 'CHECKLIST_ITEM_FAILED',
          project_id: 'project-1',
          inspection_id: createdId,
          checklist_id: 'checklist-1',
          detected_by: 'CHECKLIST_SUBMISSION',
        }),
      }),
    );
  });

  it('the violation is a SEPARATE event from inspection.failed, not a replacement', async () => {
    // They must both fire and stay distinct: inspection.failed alerts SITE_ENGINEER + PM and is
    // ordinarily disableable; the violation is in §19.6's critical set and is not. Merging them
    // would make one of those two properties wrong.
    mockRepo.findChecklistById.mockResolvedValue(makeChecklist());
    mockRepo.createInspection.mockResolvedValue({
      inspection_id: 'insp-10',
      project_id: 'project-1',
      tenant_id: 'tenant-uuid-1',
      checklist_id: 'checklist-1',
      status: 'FAILED',
      inspected_by: 'user-uuid-1',
      inspected_at: new Date(),
      notes: null,
    } satisfies InspectionRow);

    await service.submitInspection({
      project_id: 'project-1',
      checklist_id: 'checklist-1',
      status: InspectionStatus.FAILED,
      inspected_at: '2026-06-04T08:00:00Z',
      issue_severity: IssueSeverity.HIGH,
    });

    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    const emitted = instance.publish.mock.calls.map(
      (c) => (c[0] as { event_type: string }).event_type,
    );
    // Different transports, deliberately: inspection.failed has a row to anchor to and rides the
    // INSERT (§35.13 ESC-13), while the compliance event is the second event of the same request and
    // createInspection carries one. Both are durable; both must fire.
    expect(outboxArg(mockRepo.createInspection, 1)).toEqual(
      expect.objectContaining({ event_type: 'site.inspection.failed.v1' }),
    );
    expect(emitted).toContain('safety.compliance.failed.v1');
  });

  it('a PASSED checklist raises no violation', async () => {
    mockRepo.findChecklistById.mockResolvedValue(makeChecklist());
    mockRepo.createInspection.mockResolvedValue({
      inspection_id: 'insp-11',
      project_id: 'project-1',
      tenant_id: 'tenant-uuid-1',
      checklist_id: 'checklist-1',
      status: 'PASSED',
      inspected_by: 'user-uuid-1',
      inspected_at: new Date(),
      notes: null,
    } satisfies InspectionRow);

    await service.submitInspection({
      project_id: 'project-1',
      checklist_id: 'checklist-1',
      status: InspectionStatus.PASSED,
      inspected_at: '2026-06-04T08:00:00Z',
    });

    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    const emitted = instance.publish.mock.calls.map(
      (c) => (c[0] as { event_type: string }).event_type,
    );
    expect(emitted).not.toContain('safety.compliance.failed.v1');
  });

  it('emits neither passed nor failed event when status is REQUIRES_REINSPECTION', async () => {
    // Covers the falsy branch of `else if (dto.status === 'FAILED')` — a third status
    // (REQUIRES_REINSPECTION) matches neither PASSED nor FAILED.
    mockRepo.findChecklistById.mockResolvedValue(makeChecklist());
    mockRepo.createInspection.mockResolvedValue({
      inspection_id: 'insp-3',
      project_id: 'project-1',
      tenant_id: 'tenant-uuid-1',
      checklist_id: 'checklist-1',
      status: 'REQUIRES_REINSPECTION',
      inspected_by: 'user-uuid-1',
      inspected_at: new Date(),
      notes: null,
    } satisfies InspectionRow);

    await service.submitInspection({
      project_id: 'project-1',
      checklist_id: 'checklist-1',
      status: InspectionStatus.REQUIRES_REINSPECTION,
      inspected_at: '2026-06-04T08:00:00Z',
    });

    expect(mockRepo.createInspection).toHaveBeenCalled();
    // Neither outcome matches ⇒ no envelope reaches the INSERT.
    expect(outboxArg(mockRepo.createInspection, 1)).toBeUndefined();
  });
});

// ── resolveConflict ───────────────────────────────────────────────────────

describe('resolveConflict', () => {
  it('returns resolved record', async () => {
    const record: ConflictRecordRow = {
      conflict_id: 'conflict-1',
      tenant_id: 'tenant-uuid-1',
      entity_type: 'issues',
      entity_id: 'issue-1',
      client_payload: {},
      server_payload: {},
      conflict_type: 'STATUS_CONFLICT',
      reviewed_by: 'user-uuid-1',
      reviewed_at: new Date(),
      created_at: new Date(),
    };
    mockRepo.resolveConflictRecord.mockResolvedValue(record);
    const result = await service.resolveConflict('conflict-1');
    expect(result.reviewed_by).toBe('user-uuid-1');
  });

  it('throws UnprocessableEntityException when not found or already resolved', async () => {
    mockRepo.resolveConflictRecord.mockResolvedValue(null);
    await expect(service.resolveConflict('missing')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

// ── Additional coverage: uncovered happy paths & OpenSearch branches ───────

describe('listSiteReports', () => {
  it('returns paginated list without search', async () => {
    mockRepo.listSiteReports.mockResolvedValue({ rows: [makeReport()], total: 1 });
    const result = await service.listSiteReports({ page: 1, limit: 10 });
    expect(result.total).toBe(1);
  });

  it('returns minimal payload when minimal=true (covers toMinimalReport branch)', async () => {
    mockRepo.listSiteReports.mockResolvedValue({ rows: [makeReport()], total: 1 });
    const result = await service.listSiteReports({ page: 1, limit: 10, minimal: true });
    expect(result.items[0]).not.toHaveProperty('summary');
    expect(result.items[0]).toHaveProperty('report_id');
  });

  it('uses OpenSearch when q is provided (covers search branch)', async () => {
    mockRepo.listSiteReports.mockResolvedValue({ rows: [makeReport()], total: 1 });
    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'crack' });
    expect(result).toBeDefined();
  });
});

describe('listIssues', () => {
  it('returns paginated list without search', async () => {
    mockRepo.listIssues.mockResolvedValue({ rows: [makeIssue()], total: 1 });
    const result = await service.listIssues({ page: 1, limit: 10 });
    expect(result.total).toBe(1);
  });

  it('uses OpenSearch when q is provided (covers search branch)', async () => {
    mockRepo.listIssues.mockResolvedValue({ rows: [makeIssue()], total: 1 });
    const result = await service.listIssues({ page: 1, limit: 10, q: 'crack' });
    expect(result).toBeDefined();
  });
});

describe('listConflictRecords', () => {
  it('returns conflict records list', async () => {
    mockRepo.listConflictRecords.mockResolvedValue([]);
    const result = await service.listConflictRecords();
    expect(result).toEqual([]);
  });
});

// Every applied edit announces site.issue.updated.v1 from the updated row (same transaction), so the
// search index follows description / severity edits, which announced nothing before.
describe('updateIssue — site.issue.updated.v1', () => {
  it('builds the event from the updated row', async () => {
    mockRepo.findIssueById.mockResolvedValue(makeIssue());
    mockRepo.updateIssue.mockResolvedValue(makeIssue({ description: 'new text' }));

    await service.updateIssue('issue-1', { description: 'new text' } as never);

    const builder = mockRepo.updateIssue.mock.calls.at(-1)![2] as (r: IssueRow) => {
      event_type: string;
      payload: Record<string, unknown>;
    };
    const event = builder(makeIssue({ issue_id: 'issue-1', project_id: 'project-9' }));
    expect(event.event_type).toBe('site.issue.updated.v1');
    expect(event.payload).toEqual({ issue_id: 'issue-1', project_id: 'project-9' });
  });
});

describe('updateIssue — status_changed event emission', () => {
  it('does NOT emit status_changed when the status did not move', async () => {
    // The client sends the status the server already holds, so resolved === fromStatus and there is
    // nothing to announce. (This used to be true of EVERY update, because the resolver wrote the
    // server's status back unconditionally — which is why the event's branch was marked
    // `istanbul ignore next` rather than tested.)
    const serverIssue = makeIssue({ status: 'OPEN' });
    mockRepo.findIssueById.mockResolvedValue(serverIssue);
    mockRepo.updateIssue.mockResolvedValue({ ...serverIssue, status: 'OPEN' });

    await service.updateIssue('issue-1', { status: IssueStatus.OPEN, description: 'update' });
    expect(mockRepo.updateIssue).toHaveBeenCalledWith(
      'issue-1',
      expect.any(Object),
      expect.any(Function),
    );
  });
});

// §35.13 ESC-13: `emitEvent` used to log `kafka.publish.failed` and return normally, so every
// site event was silently dropped during a broker outage while the row was already committed —
// invisible to offline-sync clients. The outbox write shares the transaction, so its failure must
// propagate and roll the business write back.
describe('outbox write failure', () => {
  it('propagates the failure instead of silently dropping the event', async () => {
    mockRepo.createSiteReport.mockRejectedValueOnce(new Error('outbox insert failed'));
    await expect(
      service.createSiteReport({ project_id: 'project-1', report_date: '2026-06-04' }),
    ).rejects.toThrow('outbox insert failed');
  });
});

describe('updateIssue — an ordinary status change', () => {
  it('applies the client status and announces it (master:2810)', async () => {
    const serverIssue = makeIssue({ status: 'OPEN' });
    mockRepo.findIssueById.mockResolvedValue(serverIssue);
    mockRepo.updateIssue.mockResolvedValue({ ...serverIssue, status: 'IN_PROGRESS' });

    await service.updateIssue('issue-1', { status: IssueStatus.IN_PROGRESS });

    expect(mockRepo.updateIssue).toHaveBeenCalledWith(
      'issue-1',
      expect.objectContaining({ status: 'IN_PROGRESS' }),
      expect.any(Function),
    );
    // No conflict: the caller is editing the state it is looking at.
    expect(mockRepo.createConflictRecord).not.toHaveBeenCalled();

    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'site.issue.status_changed.v1',
        payload: expect.objectContaining({ from_status: 'OPEN', to_status: 'IN_PROGRESS' }),
      }),
    );
  });
});

describe('OpenSearch indexing error handling', () => {
  it('createSiteReport succeeds even if OpenSearch index fails (covers catch branch)', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.index.mockRejectedValueOnce(new Error('OS down'));
    mockRepo.createSiteReport.mockResolvedValue(makeReport());
    await expect(
      service.createSiteReport({ project_id: 'project-1', report_date: '2026-06-04' }),
    ).resolves.toBeDefined();
  });

  it('createIssue succeeds even if OpenSearch index fails (covers catch branch)', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.index.mockRejectedValueOnce(new Error('OS down'));
    mockRepo.createIssue.mockResolvedValue(makeIssue());
    await expect(
      service.createIssue({ project_id: 'project-1', title: 'Test', severity: IssueSeverity.HIGH }),
    ).resolves.toBeDefined();
  });

  it('listSiteReports with project_id filter in OpenSearch query (covers if project_id branch)', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: { hits: { hits: [{ _source: { report_id: 'report-1' } }] } },
    });
    mockRepo.listSiteReports.mockResolvedValue({ rows: [makeReport()], total: 1 });
    const result = await service.listSiteReports({
      page: 1,
      limit: 10,
      q: 'crack',
      project_id: 'project-1',
    });
    expect(result).toBeDefined();
  });

  // The app's report form has no summary or weather; its free text is blockers. Searching only the
  // first two could never find a report filed from the app.
  it('searches site reports over summary, weather and blockers', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    const search = Client.mock.results[0]?.value.search as jest.Mock;
    search.mockClear();
    search.mockResolvedValueOnce({ body: { hits: { hits: [] } } });

    await service.listSiteReports({ page: 1, limit: 10, q: 'cement' });

    const body = (search.mock.calls[0]![0] as { body: { query: { bool: { must: unknown[] } } } })
      .body;
    expect(body.query.bool.must[0]).toEqual({
      multi_match: { query: 'cement', fields: ['summary', 'weather', 'blockers'] },
    });
  });

  it('listSiteReports with minimal=true and OpenSearch results (covers minimal ternary true branch)', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: { hits: { hits: [{ _source: { report_id: 'report-1' } }] } },
    });
    mockRepo.findReportsByIds.mockResolvedValueOnce(new Map([['report-1', makeReport()]]));
    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'crack', minimal: true });
    expect(result.items[0]).not.toHaveProperty('summary');
  });

  it('honours minimal=true on the DB fallback when OpenSearch is down', async () => {
    // `minimal` is the CALLER's contract (master:2797), not a property of the search backend. A
    // client asks for the reduced payload because of the link it is on — handing it the full one
    // because a server-side dependency was unavailable is the opposite of what it asked for, at the
    // moment it can least afford it.
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockRejectedValueOnce(new Error('opensearch unreachable'));
    mockRepo.searchSiteReportsText.mockResolvedValueOnce([makeReport()]);

    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'crack', minimal: true });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('summary');
  });

  it('returns the full payload on the DB fallback when minimal was not asked for', async () => {
    // CONTROL: the reduction above must come from `minimal`, not from the fallback path itself.
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockRejectedValueOnce(new Error('opensearch unreachable'));
    mockRepo.searchSiteReportsText.mockResolvedValueOnce([makeReport()]);

    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'crack' });

    expect(result.items[0]).toHaveProperty('summary');
  });

  it('listIssues with project_id filter in OpenSearch query (covers if project_id branch)', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: { hits: { hits: [{ _source: { issue_id: 'issue-1' } }] } },
    });
    mockRepo.findIssuesByIds.mockResolvedValueOnce(new Map([['issue-1', makeIssue()]]));
    const result = await service.listIssues({
      page: 1,
      limit: 10,
      q: 'crack',
      project_id: 'project-1',
    });
    expect(result.items).toHaveLength(1);
  });

  it('listSiteReports returns empty array when OpenSearch returns no hits (covers ids.length===0 branch)', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: { hits: { hits: [] } }, // empty hits → ids.length === 0 → return []
    });
    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'nothing' });
    expect(result.items).toHaveLength(0);
  });

  it('listIssues returns empty array when OpenSearch returns no hits (covers ids.length===0 branch)', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: { hits: { hits: [] } },
    });
    const result = await service.listIssues({ page: 1, limit: 10, q: 'nothing' });
    expect(result.items).toHaveLength(0);
  });

  it('listSiteReports returns matched rows when OpenSearch returns results', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: { hits: { hits: [{ _source: { report_id: 'report-1' } }] } },
    });
    mockRepo.findReportsByIds.mockResolvedValueOnce(new Map([['report-1', makeReport()]]));
    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'summary' });
    expect(result.items).toHaveLength(1);
  });

  it('listIssues returns matched rows when OpenSearch returns results', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: { hits: { hits: [{ _source: { issue_id: 'issue-1' } }] } },
    });
    mockRepo.findIssuesByIds.mockResolvedValueOnce(new Map([['issue-1', makeIssue()]]));
    const result = await service.listIssues({ page: 1, limit: 10, q: 'crack' });
    expect(result.items).toHaveLength(1);
  });

  // OpenSearch down: search the database, never hand back the plain list as if it were results.
  it('listSiteReports searches the database when OpenSearch fails — not the plain list', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockRejectedValueOnce(new Error('OS down'));
    mockRepo.listSiteReports.mockClear();
    mockRepo.searchSiteReportsText.mockResolvedValueOnce([makeReport()]);
    const result = await service.listSiteReports({
      page: 1,
      limit: 10,
      q: 'ปูน',
      project_id: 'project-1',
    });
    expect(result.items).toHaveLength(1);
    expect(mockRepo.searchSiteReportsText).toHaveBeenCalledWith(
      'ปูน',
      expect.objectContaining({ project_id: 'project-1' }),
      50,
    );
    expect(mockRepo.listSiteReports).not.toHaveBeenCalled();
  });

  it('listIssues searches the database when OpenSearch fails, with the filters', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockRejectedValueOnce(new Error('OS down'));
    mockRepo.listIssues.mockClear();
    mockRepo.searchIssuesText.mockResolvedValueOnce([makeIssue()]);
    const result = await service.listIssues({
      page: 1,
      limit: 10,
      q: 'crack',
      severity: 'HIGH',
      status: 'OPEN',
    });
    expect(result.items).toHaveLength(1);
    expect(mockRepo.searchIssuesText).toHaveBeenCalledWith(
      'crack',
      expect.objectContaining({ severity: 'HIGH', status: 'OPEN' }),
      50,
    );
    expect(mockRepo.listIssues).not.toHaveBeenCalled();
  });

  // The hits themselves, in relevance order — not only those among the 50 newest rows.
  it('listSiteReports returns every hit in OpenSearch order, loaded by id', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: {
        hits: {
          hits: [{ _source: { report_id: 'old-best' } }, { _source: { report_id: 'newer' } }],
        },
      },
    });
    mockRepo.listSiteReports.mockClear();
    mockRepo.findReportsByIds.mockResolvedValueOnce(
      new Map([
        ['newer', makeReport({ report_id: 'newer' })],
        ['old-best', makeReport({ report_id: 'old-best' })],
      ]),
    );
    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'crack' });
    expect(result.items.map((r) => (r as { report_id: string }).report_id)).toEqual([
      'old-best',
      'newer',
    ]);
    expect(mockRepo.findReportsByIds).toHaveBeenCalledWith(['old-best', 'newer']);
    expect(mockRepo.listSiteReports).not.toHaveBeenCalled();
  });

  // The index lags the rows (the consumer catches up after the write; issues indexed before
  // site.issue.updated.v1 existed keep creation-time values until reindex:search), so severity /
  // status are not asked of it — they are applied to the rows, the source of truth.
  it('listIssues filters severity / status on the rows, not in the index query', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    const search = Client.mock.results[0]?.value.search as jest.Mock;
    search.mockClear();
    search.mockResolvedValueOnce({
      body: { hits: { hits: [{ _source: { issue_id: 'a' } }, { _source: { issue_id: 'b' } }] } },
    });
    mockRepo.findIssuesByIds.mockResolvedValueOnce(
      new Map([
        // Indexed as OPEN at creation, RESOLVED since: a term on status.keyword would never find it.
        ['a', makeIssue({ issue_id: 'a', severity: 'HIGH', status: 'RESOLVED' })],
        ['b', makeIssue({ issue_id: 'b', severity: 'HIGH', status: 'OPEN' })],
      ]),
    );
    const result = await service.listIssues({
      page: 1,
      limit: 10,
      q: 'crack',
      severity: 'HIGH',
      status: 'RESOLVED',
    });
    const must = (search.mock.calls[0]![0] as { body: { query: { bool: { must: unknown[] } } } })
      .body.query.bool.must;
    expect(JSON.stringify(must)).not.toMatch(/severity|status/);
    expect(result.items.map((i) => i.issue_id)).toEqual(['a']);
  });

  // `?q=…&from_date=…` used to be honoured through the list it intersected with; it still is.
  it('listSiteReports applies from_date / to_date to the hits and to the database fallback', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: {
        hits: {
          hits: [
            { _source: { report_id: 'may' } },
            { _source: { report_id: 'june' } },
            { _source: { report_id: 'july' } },
          ],
        },
      },
    });
    mockRepo.findReportsByIds.mockResolvedValueOnce(
      new Map([
        ['may', makeReport({ report_id: 'may', report_date: new Date('2026-05-31T00:00:00Z') })],
        ['june', makeReport({ report_id: 'june', report_date: new Date('2026-06-15T00:00:00Z') })],
        ['july', makeReport({ report_id: 'july', report_date: new Date('2026-07-01T00:00:00Z') })],
      ]),
    );
    const result = await service.listSiteReports({
      page: 1,
      limit: 10,
      q: 'crack',
      from_date: '2026-06-01',
      to_date: '2026-06-30',
    });
    expect(result.items.map((r) => (r as { report_id: string }).report_id)).toEqual(['june']);

    Client.mock.results[0]?.value.search.mockRejectedValueOnce(new Error('OS down'));
    mockRepo.searchSiteReportsText.mockResolvedValueOnce([]);
    await service.listSiteReports({
      page: 1,
      limit: 10,
      q: 'crack',
      from_date: '2026-06-01',
      to_date: '2026-06-30',
    });
    expect(mockRepo.searchSiteReportsText).toHaveBeenLastCalledWith(
      'crack',
      expect.objectContaining({ from_date: '2026-06-01', to_date: '2026-06-30' }),
      50,
    );
  });
});

describe('createMaterialConsumption', () => {
  const materialRow = {
    consumption_id: 'cons-uuid-001',
    project_id: 'proj-uuid-001',
    tenant_id: 'tenant-uuid-1',
    report_id: 'report-uuid-001',
    material_name: 'Steel rod',
    material_id: 'mat-uuid-001',
    task_id: null as string | null,
    quantity: '10',
    unit: 'pcs',
    consumed_by: 'user-uuid-1',
    consumed_at: '2026-06-11',
  };

  it('inserts material and emits event (task_id null — covers ?? "" branch)', async () => {
    mockRepo.findReportById.mockResolvedValue(makeReport());
    mockRepo.insertMaterialConsumption.mockResolvedValue(materialRow);
    const dto = {
      material_name: 'Steel rod',
      task_id: undefined,
      quantity: '10',
      unit: 'pcs',
      consumed_at: '2026-06-11',
    };
    const result = await service.createMaterialConsumption('report-uuid-001', dto as never);
    expect(result.consumption_id).toBe('cons-uuid-001');
    expect(mockRepo.insertMaterialConsumption).toHaveBeenCalled();
  });

  it('inserts material and emits event (task_id set — covers ?? "" false branch)', async () => {
    const rowWithTask = { ...materialRow, task_id: 'task-uuid-001' };
    mockRepo.findReportById.mockResolvedValue(makeReport());
    mockRepo.insertMaterialConsumption.mockResolvedValue(rowWithTask);
    const dto = {
      material_name: 'Steel rod',
      task_id: 'task-uuid-001',
      quantity: '10',
      unit: 'pcs',
      consumed_at: '2026-06-11',
    };
    const result = await service.createMaterialConsumption('report-uuid-001', dto as never);
    expect(result.task_id).toBe('task-uuid-001');
  });

  // ── Phase 24 embodied carbon (§33.4) ────────────────────────────────────────────────────────
  describe('embodied carbon', () => {
    const dto = {
      material_name: 'Steel rod',
      task_id: undefined,
      quantity: '10',
      unit: 'pcs',
      consumed_at: '2026-06-11',
    };

    const carbonPublish = () => {
      const producer = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
      return producer.publish.mock.calls.find(
        (c) => (c[0] as { event_type: string }).event_type === 'carbon.record.created.v1',
      );
    };

    beforeEach(() => {
      mockRepo.findReportById.mockResolvedValue(makeReport());
      mockRepo.insertMaterialConsumption.mockResolvedValue(materialRow);
    });

    it('skips carbon when the typed material name is not in the master (mobile free-text)', async () => {
      mockRepo.findMaterialIdByName.mockResolvedValue(null);

      await service.createMaterialConsumption('report-uuid-001', dto as never);

      expect(mockRepo.findCarbonFactor).not.toHaveBeenCalled();
      expect(mockRepo.insertCarbonRecord).not.toHaveBeenCalled();
      expect(carbonPublish()).toBeUndefined();
    });

    it('skips carbon when the tenant has loaded no factor for the material (§33.4 opt-in)', async () => {
      mockRepo.findMaterialIdByName.mockResolvedValue('mat-master-001');
      mockRepo.findCarbonFactor.mockResolvedValue(null);

      await service.createMaterialConsumption('report-uuid-001', dto as never);

      expect(mockRepo.insertCarbonRecord).not.toHaveBeenCalled();
      expect(carbonPublish()).toBeUndefined();
    });

    it('records carbon and emits Scope 3 with the factor source when a factor exists', async () => {
      mockRepo.findMaterialIdByName.mockResolvedValue('mat-master-001');
      mockRepo.findCarbonFactor.mockResolvedValue({
        carbon_factor: '2.500000',
        source: 'EPD-2023-001',
      });
      mockRepo.insertCarbonRecord.mockResolvedValue({
        carbon_record_id: 'carbon-uuid-001',
        tenant_id: 'tenant-uuid-1',
        project_id: 'proj-uuid-001',
        consumption_id: 'cons-uuid-001',
        material_id: 'mat-master-001',
        quantity_consumed: '10.0000',
        unit: 'pcs',
        carbon_factor: '2.500000',
        carbon_factor_source: 'EPD-2023-001',
        carbon_kgco2e: '25.0000',
        recorded_at: '2026-06-11T00:00:00Z',
      });

      await service.createMaterialConsumption('report-uuid-001', dto as never);

      // The consumption carries the resolved master id, not a fresh random one.
      expect(mockRepo.insertMaterialConsumption).toHaveBeenCalledWith(
        expect.objectContaining({ material_id: 'mat-master-001' }),
        expect.anything(),
      );
      const call = carbonPublish();
      expect(call).toBeDefined();
      expect((call![0] as { payload: Record<string, unknown> }).payload).toEqual(
        expect.objectContaining({
          carbon_record_id: 'carbon-uuid-001',
          carbon_kgco2e: '25.0000',
          carbon_factor_source: 'EPD-2023-001',
          ghg_scope: 'SCOPE_3',
        }),
      );
    });

    it('does not re-emit when the record already existed (replayed consumption)', async () => {
      mockRepo.findMaterialIdByName.mockResolvedValue('mat-master-001');
      mockRepo.findCarbonFactor.mockResolvedValue({
        carbon_factor: '2.500000',
        source: 'EPD-2023-001',
      });
      // ON CONFLICT DO NOTHING returned no row — the footprint must not be counted twice.
      mockRepo.insertCarbonRecord.mockResolvedValue(null);

      await service.createMaterialConsumption('report-uuid-001', dto as never);

      expect(carbonPublish()).toBeUndefined();
    });
  });

  it('throws NotFoundException when report not found', async () => {
    mockRepo.findReportById.mockResolvedValue(null);
    const dto = {
      material_name: 'Cement',
      quantity: '5',
      unit: 'bags',
      consumed_at: '2026-06-11',
    };
    await expect(
      service.createMaterialConsumption('missing-report', dto as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── Inspections list/detail/approval (ADR-025) ──────────────────────────────

describe('inspection results & approval', () => {
  const pending = {
    inspection_id: 'insp-1',
    project_id: 'proj-uuid-1',
    checklist_id: 'chk-1',
    status: 'PENDING',
  };

  it('listInspections returns paginated envelope', async () => {
    mockRepo.findInspections.mockResolvedValue({ rows: [pending], total: 1 });
    const r = await service.listInspections({ page: 1, limit: 20 });
    expect(r).toEqual({ items: [pending], total: 1, page: 1, limit: 20 });
  });

  it('getInspection returns row / throws NotFound', async () => {
    mockRepo.findInspectionById.mockResolvedValueOnce(pending);
    expect((await service.getInspection('insp-1')).inspection_id).toBe('insp-1');
    mockRepo.findInspectionById.mockResolvedValueOnce(null);
    await expect(service.getInspection('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateInspectionStatus → PASSED (approve) emits and returns', async () => {
    mockRepo.findInspectionById.mockResolvedValue(pending);
    mockRepo.updateInspectionStatus.mockResolvedValue({ ...pending, status: 'PASSED' });
    const r = await service.updateInspectionStatus('insp-1', { status: 'PASSED' } as never);
    expect(r.status).toBe('PASSED');
    // Builder resolved against the UPDATEd row — project_id comes from the row, not the DTO.
    expect(outboxArg(mockRepo.updateInspectionStatus, 1, { ...pending, status: 'PASSED' })).toEqual(
      expect.objectContaining({
        event_type: 'site.inspection.passed.v1',
        payload: expect.objectContaining({ inspection_id: 'insp-1', project_id: 'proj-uuid-1' }),
      }),
    );
  });

  it('updateInspectionStatus → FAILED emits failed event', async () => {
    mockRepo.findInspectionById.mockResolvedValue(pending);
    mockRepo.updateInspectionStatus.mockResolvedValue({ ...pending, status: 'FAILED' });
    await expect(
      service.updateInspectionStatus('insp-1', { status: 'FAILED' } as never),
    ).resolves.toBeDefined();
    expect(outboxArg(mockRepo.updateInspectionStatus, 1, { ...pending, status: 'FAILED' })).toEqual(
      expect.objectContaining({
        event_type: 'site.inspection.failed.v1',
        payload: expect.objectContaining({ checklist_id: 'chk-1' }),
      }),
    );
  });

  it('updateInspectionStatus → REQUIRES_REINSPECTION (no event branch)', async () => {
    mockRepo.findInspectionById.mockResolvedValue({ ...pending, status: 'FAILED' });
    mockRepo.updateInspectionStatus.mockResolvedValue({
      ...pending,
      status: 'REQUIRES_REINSPECTION',
    });
    await expect(
      service.updateInspectionStatus('insp-1', {
        status: 'REQUIRES_REINSPECTION',
        notes: 'redo',
      } as never),
    ).resolves.toBeDefined();
    // Neither PASSED nor FAILED ⇒ no builder is handed to the UPDATE.
    expect(outboxArg(mockRepo.updateInspectionStatus, 1)).toBeUndefined();
  });

  it('updateInspectionStatus throws when already PASSED (terminal)', async () => {
    mockRepo.findInspectionById.mockResolvedValue({ ...pending, status: 'PASSED' });
    await expect(
      service.updateInspectionStatus('insp-1', { status: 'PASSED' } as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('listChecklists delegates to repo', async () => {
    mockRepo.listChecklists.mockResolvedValue([{ checklist_id: 'chk-1' }]);
    expect(await service.listChecklists('proj-1')).toHaveLength(1);
  });
});

// ── the parent-project guard ──────────────────────────────────────────────
//
// site_reports, issues and inspections all carry a FOREIGN KEY to projects.projects
// (20260822000002_site_ops_foreign_keys). An unknown project_id used to reach PostgreSQL and come
// back as SQLSTATE 23503, which nothing maps — so the client received a bare 500 for a request
// error, while buildings.service already answered a structured 404 for exactly the same mistake.
//
// Each of the three entry points is checked separately rather than through the private helper: they
// are three routes a client can call, and a guard added to one of them is the shape this defect had.

describe('rejects a write whose project does not exist', () => {
  const reportDto = { project_id: 'ghost-project', report_date: '2026-06-04' };
  const issueDto = { project_id: 'ghost-project', title: 'Crack', severity: 'HIGH' };
  const inspectionDto = {
    project_id: 'ghost-project',
    checklist_id: 'chk-1',
    status: 'PASSED',
    inspected_at: '2026-06-04T09:00:00Z',
  };

  beforeEach(() => {
    mockRepo.projectExists.mockResolvedValue(false);
  });

  it('answers 404 for a site report, not 500', async () => {
    await expect(service.createSiteReport(reportDto as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockRepo.createSiteReport).not.toHaveBeenCalled();
  });

  it('answers 404 for an issue', async () => {
    await expect(service.createIssue(issueDto as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockRepo.createIssue).not.toHaveBeenCalled();
  });

  it('answers 404 for an inspection', async () => {
    await expect(service.submitInspection(inspectionDto as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockRepo.createInspection).not.toHaveBeenCalled();
  });

  it('checks the project BEFORE the checklist on an inspection', async () => {
    // Order matters for the message the caller reads: a request naming neither a real project nor a
    // real checklist should name the project, which is the outer of the two.
    mockRepo.findChecklistById.mockResolvedValue(null);

    await expect(service.submitInspection(inspectionDto as never)).rejects.toThrow();

    expect(mockRepo.findChecklistById).not.toHaveBeenCalled();
  });

  it('carries a COS-* code and a trace id, not a bare message', async () => {
    // QM-10: an error the client can act on. A 404 with no code is indistinguishable from a routing
    // miss, and the trace id is what ties the answer to the server log.
    await expect(service.createSiteReport(reportDto as never)).rejects.toMatchObject({
      response: {
        error: expect.objectContaining({
          code: 'COS-SITE-004',
          messageKey: 'siteops.error.projectNotFound',
          traceId: expect.any(String),
        }),
      },
    });
  });

  it('reads as not-found for a project in ANOTHER tenant, never as a permission error', async () => {
    // projectExists is tenant-scoped, so a foreign project resolves false. Answering 403 here would
    // confirm the id exists somewhere, which is a probe.
    await expect(service.createSiteReport(reportDto as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lets the write through once the project exists — the control', async () => {
    mockRepo.projectExists.mockResolvedValue(true);
    mockRepo.createSiteReport.mockResolvedValue(makeReport());

    await expect(service.createSiteReport(reportDto as never)).resolves.toBeDefined();
    expect(mockRepo.createSiteReport).toHaveBeenCalled();
  });
});

// ── syncSiteReports — a new client_id for a day that already has a report ────
//
// A report is unique per (project, day, submitter), and the mobile app generates a new id for every
// save, so a draft and then a submit on one day are two ids for one report. Such an item used to take
// the create path, whose upsert overwrote the row whatever its age, NULLed blocker_category / shift and
// emitted a second site.report.submitted.v1. It is now a plain edit of the submitter's own report:
// newest SAVE wins (client_submitted_at on both sides), only the fields sent are written, ACCEPTED,
// no conflict record (product owner, 2026-11-14).

describe('syncSiteReports — natural-key hit', () => {
  const PROJECT = '11111111-1111-4111-8111-111111111111';
  const DAY = '2026-06-04';
  const serverRow = (overrides: Partial<SiteReportRow> = {}) =>
    makeReport({
      report_id: 'server-report',
      project_id: PROJECT,
      report_date: new Date(`${DAY}T00:00:00.000Z`),
      summary: 'web summary',
      weather: 'sunny',
      client_submitted_at: new Date('2026-06-04T10:00:00Z'),
      modified_at: new Date('2026-06-04T10:00:00Z'),
      ...overrides,
    });
  const item = (
    clientId: string,
    clientSubmittedAt: string,
    extra: Record<string, unknown> = {},
  ) => ({
    client_id: clientId,
    project_id: PROJECT,
    report_date: DAY,
    client_submitted_at: clientSubmittedAt,
    ...extra,
  });
  const lookupReturns = (...rows: SiteReportRow[]) =>
    mockRepo.findReportsByNaturalKeys.mockResolvedValueOnce(
      new Map(rows.map((r) => [`${r.project_id}|${DAY}`, r])),
    );

  beforeEach(() => {
    mockRepo.findReportsByIds.mockResolvedValue(new Map());
  });

  it('a newer save updates the existing row with only the fields it sent — ACCEPTED, unflagged', async () => {
    lookupReturns(serverRow());
    mockRepo.updateSiteReport.mockResolvedValueOnce(serverRow({ manpower_count: 12 }));

    const results = await service.syncSiteReports({
      items: [item('device-id', '2026-06-04T11:00:00Z', { manpower_count: 12, blockers: 'rain' })],
    });

    expect(results[0]).toEqual({
      client_id: 'device-id',
      report_id: 'server-report',
      conflict_status: 'ACCEPTED',
    });
    expect(mockRepo.createSiteReport).not.toHaveBeenCalled();
    expect(mockRepo.createConflictRecord).not.toHaveBeenCalled();
    expect(mockRepo.updateSiteReport).toHaveBeenCalledWith(
      'server-report',
      {
        summary: 'web summary', // not sent → kept
        weather: 'sunny', // not sent → kept
        blockers: 'rain',
        manpower_count: 12,
        client_submitted_at: '2026-06-04T11:00:00.000Z',
        latitude: null,
        longitude: null,
      },
      expect.any(Function),
    );
  });

  it('an older save leaves the row as it is — ACCEPTED, unflagged', async () => {
    lookupReturns(serverRow());

    const results = await service.syncSiteReports({
      items: [item('device-id', '2026-06-04T09:00:00Z', { summary: 'older' })],
    });

    expect(results[0]?.conflict_status).toBe('ACCEPTED');
    expect(results[0]?.report_id).toBe('server-report');
    expect(mockRepo.updateSiteReport).not.toHaveBeenCalled();
    expect(mockRepo.createSiteReport).not.toHaveBeenCalled();
    expect(mockRepo.createConflictRecord).not.toHaveBeenCalled();
  });

  // Draft at 09:00, submit at 17:00, both synced at 18:00: the draft's row has modified_at 18:00. The
  // submit is compared with the draft's SAVE time (client_submitted_at), so it wins.
  it('compares with the stored save time, not with when the row was written', async () => {
    lookupReturns(
      serverRow({
        client_submitted_at: new Date('2026-06-04T09:00:00Z'),
        modified_at: new Date('2026-06-04T18:00:00Z'),
      }),
    );
    mockRepo.updateSiteReport.mockResolvedValueOnce(serverRow());

    await service.syncSiteReports({
      items: [item('submit-id', '2026-06-04T17:00:00Z', { summary: 'submitted' })],
    });

    expect(mockRepo.updateSiteReport).toHaveBeenCalledWith(
      'server-report',
      expect.objectContaining({ summary: 'submitted' }),
      expect.any(Function),
    );
  });

  it('falls back to modified_at when the stored row has no save time', async () => {
    lookupReturns(
      serverRow({ client_submitted_at: null, modified_at: new Date('2026-06-04T12:00:00Z') }),
    );

    await service.syncSiteReports({ items: [item('device-id', '2026-06-04T11:00:00Z')] });

    expect(mockRepo.updateSiteReport).not.toHaveBeenCalled();
  });

  it('looks up only id misses with a UUID project and a YYYY-MM-DD day, for the current user', async () => {
    mockRepo.findReportsByIds.mockResolvedValueOnce(
      new Map([['33333333-3333-4333-8333-333333333333', serverRow()]]),
    );
    mockRepo.createSiteReport.mockResolvedValue(makeReport({ report_id: 'x' }));
    mockRepo.updateSiteReport.mockResolvedValueOnce(serverRow());

    await service.syncSiteReports({
      items: [
        item('33333333-3333-4333-8333-333333333333', '2026-06-04T11:00:00Z'), // id hit
        item('22222222-2222-4222-8222-222222222222', '2026-06-04T11:00:00Z', {
          report_date: '2026-06-05T08:00:00+07:00',
        }), // id miss, full ISO day
        item('44444444-4444-4444-8444-444444444444', '2026-06-04T11:00:00Z', { project_id: 'p' }),
        item('55555555-5555-4555-8555-555555555555', '2026-06-04T11:00:00Z', {
          report_date: '20260606',
        }),
      ],
    });

    expect(mockRepo.findReportsByNaturalKeys).toHaveBeenCalledWith('user-uuid-1', [
      { project_id: PROJECT, report_date: '2026-06-05' },
    ]);
  });

  it('draft then submit in one batch: the first creates, the second edits it (both ACCEPTED)', async () => {
    mockRepo.findReportsByNaturalKeys.mockResolvedValueOnce(new Map());
    // What the database returns for the created draft: written now, saved at 09:00.
    const created = serverRow({
      report_id: 'draft-id',
      summary: 'draft',
      client_submitted_at: new Date('2026-06-04T09:00:00Z'),
      modified_at: new Date(),
    });
    mockRepo.createSiteReport.mockResolvedValueOnce(created);
    mockRepo.updateSiteReport.mockResolvedValueOnce(created);

    const results = await service.syncSiteReports({
      items: [
        item('draft-id', '2026-06-04T09:00:00Z', { summary: 'draft' }),
        item('submit-id', '2026-06-04T17:00:00Z', { summary: 'submitted' }),
      ],
    });

    expect(mockRepo.createSiteReport).toHaveBeenCalledTimes(1);
    expect(results.map((r) => [r.report_id, r.conflict_status])).toEqual([
      ['draft-id', 'ACCEPTED'],
      ['draft-id', 'ACCEPTED'],
    ]);
    expect(mockRepo.updateSiteReport).toHaveBeenCalledWith(
      'draft-id',
      expect.objectContaining({ summary: 'submitted' }),
      expect.any(Function),
    );
    expect(mockRepo.createConflictRecord).not.toHaveBeenCalled();
  });

  it('keys an id-hit edit by the row’s own day, not the item’s', async () => {
    // An unvalidated /sync/push item can name a report by id and carry another day. A later item for
    // that other day must not be routed to this report.
    const row = serverRow({ report_id: '66666666-6666-4666-8666-666666666666' });
    mockRepo.findReportsByIds.mockResolvedValueOnce(new Map([[row.report_id, row]]));
    mockRepo.findReportsByNaturalKeys.mockResolvedValueOnce(new Map());
    mockRepo.updateSiteReport.mockResolvedValueOnce(row);
    mockRepo.createSiteReport.mockResolvedValueOnce(makeReport({ report_id: 'other-day' }));

    await service.syncSiteReports({
      items: [
        item(row.report_id, '2026-06-04T11:00:00Z', { report_date: '2026-06-07' }),
        item('77777777-7777-4777-8777-777777777777', '2026-06-04T11:00:00Z', {
          report_date: '2026-06-07',
        }),
      ],
    });

    expect(mockRepo.createSiteReport).toHaveBeenCalledTimes(1);
  });

  it('a failed natural-key lookup falls back to the create path', async () => {
    mockRepo.findReportsByNaturalKeys.mockRejectedValueOnce(new Error('db down'));
    mockRepo.createSiteReport.mockResolvedValueOnce(makeReport({ report_id: 'device-id' }));

    const results = await service.syncSiteReports({
      items: [item('device-id', '2026-06-04T11:00:00Z')],
    });

    expect(results[0]?.conflict_status).toBe('ACCEPTED');
    expect(mockRepo.createSiteReport).toHaveBeenCalledTimes(1);
  });
});

// ── syncSiteReports — blocker category, shift and per-trade lines ──────────────
//
// The app sends all three with every save (report.tsx); the sync service used to drop them on every
// path. /sync/push does not validate its payload, so a value the DTO would reject is ignored rather
// than failing the write — a failed write is retried and then discards the whole report (§17.2).

describe('syncSiteReports — category, shift and lines', () => {
  const PROJECT = '11111111-1111-4111-8111-111111111111';
  const DAY = '2026-06-04';
  const LINES = [
    { trade_type: 'CIVIL', worker_count: 6 },
    { trade_type: 'ELECTRICAL', worker_count: 2, hours_worked: 4 },
  ];
  const STORED_LINES = [
    { trade_type: 'CIVIL', worker_count: 6, hours_worked: 8 },
    { trade_type: 'ELECTRICAL', worker_count: 2, hours_worked: 4 },
  ];
  const item = (clientId: string, extra: Record<string, unknown> = {}) => ({
    client_id: clientId,
    project_id: PROJECT,
    report_date: DAY,
    client_submitted_at: '2026-06-04T11:00:00Z',
    ...extra,
  });
  const sync = (items: Array<Record<string, unknown>>) =>
    service.syncSiteReports({ items } as never);

  beforeEach(() => {
    mockRepo.findReportsByIds.mockResolvedValue(new Map());
    mockRepo.findReportsByNaturalKeys.mockResolvedValue(new Map());
  });

  it('create: stores the category and shift, and the lines against the written row', async () => {
    mockRepo.createSiteReport.mockResolvedValueOnce(makeReport({ report_id: 'row-id' }));

    await sync([
      item('device-id', { blocker_category: 'WEATHER', shift: 'NIGHT', manpower_lines: LINES }),
    ]);

    expect(mockRepo.createSiteReport).toHaveBeenCalledWith(
      expect.objectContaining({ blocker_category: 'WEATHER', shift: 'NIGHT' }),
      expect.any(Function),
    );
    expect(mockRepo.replaceManpowerLogs).toHaveBeenCalledWith('row-id', STORED_LINES);
  });

  it('create without them: NULL category and shift, no lines written', async () => {
    mockRepo.createSiteReport.mockResolvedValueOnce(makeReport({ report_id: 'row-id' }));

    await sync([item('device-id')]);

    expect(mockRepo.createSiteReport).toHaveBeenCalledWith(
      expect.objectContaining({ blocker_category: null, shift: null }),
      expect.any(Function),
    );
    expect(mockRepo.replaceManpowerLogs).not.toHaveBeenCalled();
  });

  it('create with an empty breakdown: nothing to clear on a new row; clears on an upserted one', async () => {
    mockRepo.createSiteReport.mockResolvedValueOnce(makeReport({ report_id: 'device-id' }));
    await sync([item('device-id', { manpower_lines: [] })]);
    expect(mockRepo.replaceManpowerLogs).not.toHaveBeenCalled();

    // The insert landed on another report (the natural-key lookup missed): its lines are replaced.
    mockRepo.createSiteReport.mockResolvedValueOnce(makeReport({ report_id: 'existing-row' }));
    await sync([item('device-id-2', { manpower_lines: [] })]);
    expect(mockRepo.replaceManpowerLogs).toHaveBeenCalledWith('existing-row', []);
  });

  it.each([
    ['blocker_category', { blocker_category: 'BOGUS' }],
    ['shift', { shift: 'EVENING' }],
    ['manpower_lines (not an array)', { manpower_lines: 'CIVIL:6' }],
    ['manpower_lines (bad count)', { manpower_lines: [{ trade_type: 'CIVIL', worker_count: -1 }] }],
    ['manpower_lines (empty trade)', { manpower_lines: [{ trade_type: ' ', worker_count: 1 }] }],
    [
      'manpower_lines (hours > 24)',
      { manpower_lines: [{ trade_type: 'CIVIL', worker_count: 1, hours_worked: 25 }] },
    ],
    [
      'manpower_lines (21 lines)',
      {
        manpower_lines: Array.from({ length: 21 }, () => ({
          trade_type: 'CIVIL',
          worker_count: 1,
        })),
      },
    ],
  ])('an invalid %s is ignored and the report is still ACCEPTED', async (_name, bad) => {
    mockRepo.createSiteReport.mockResolvedValueOnce(makeReport({ report_id: 'row-id' }));

    const results = await sync([item('device-id', bad)]);

    expect(results[0]?.conflict_status).toBe('ACCEPTED');
    const params = mockRepo.createSiteReport.mock.calls[0]![0] as Record<string, unknown>;
    expect(params['blocker_category']).toBeNull();
    expect(params['shift']).toBeNull();
    expect(mockRepo.replaceManpowerLogs).not.toHaveBeenCalled();
  });

  it('natural-key edit, newer save: writes them; older save: writes nothing', async () => {
    const row = makeReport({
      report_id: 'server-report',
      project_id: PROJECT,
      report_date: new Date(`${DAY}T00:00:00.000Z`),
      client_submitted_at: new Date('2026-06-04T10:00:00Z'),
    });
    mockRepo.findReportsByNaturalKeys.mockResolvedValueOnce(new Map([[`${PROJECT}|${DAY}`, row]]));
    mockRepo.updateSiteReport.mockResolvedValueOnce(row);

    await sync([item('newer', { blocker_category: 'POWER', shift: 'DAY', manpower_lines: LINES })]);

    expect(mockRepo.updateSiteReport).toHaveBeenCalledWith(
      'server-report',
      expect.objectContaining({ blocker_category: 'POWER', shift: 'DAY' }),
      expect.any(Function),
    );
    expect(mockRepo.replaceManpowerLogs).toHaveBeenCalledWith('server-report', STORED_LINES);

    jest.clearAllMocks();
    mockRepo.findReportsByIds.mockResolvedValue(new Map());
    mockRepo.findReportsByNaturalKeys.mockResolvedValueOnce(new Map([[`${PROJECT}|${DAY}`, row]]));
    await sync([
      item('older', {
        client_submitted_at: '2026-06-04T09:00:00Z',
        blocker_category: 'OTHER',
        manpower_lines: LINES,
      }),
    ]);
    expect(mockRepo.updateSiteReport).not.toHaveBeenCalled();
    expect(mockRepo.replaceManpowerLogs).not.toHaveBeenCalled();
  });

  it('natural-key edit that does not send them leaves them alone (undefined → column unchanged)', async () => {
    const row = makeReport({
      report_id: 'server-report',
      project_id: PROJECT,
      report_date: new Date(`${DAY}T00:00:00.000Z`),
      client_submitted_at: new Date('2026-06-04T10:00:00Z'),
    });
    mockRepo.findReportsByNaturalKeys.mockResolvedValueOnce(new Map([[`${PROJECT}|${DAY}`, row]]));
    mockRepo.updateSiteReport.mockResolvedValueOnce(row);

    await sync([item('newer')]);

    const params = mockRepo.updateSiteReport.mock.calls[0]![1] as Record<string, unknown>;
    expect(params['blocker_category']).toBeUndefined();
    expect(params['shift']).toBeUndefined();
    expect(mockRepo.replaceManpowerLogs).not.toHaveBeenCalled();
  });

  it('id-hit edit: writes them when sent, against the edited row', async () => {
    const row = makeReport({ report_id: '88888888-8888-4888-8888-888888888888' });
    mockRepo.findReportsByIds.mockResolvedValueOnce(new Map([[row.report_id, row]]));
    mockRepo.updateSiteReport.mockResolvedValueOnce(row);

    await sync([
      item(row.report_id, { blocker_category: 'MATERIAL', shift: 'NIGHT', manpower_lines: LINES }),
    ]);

    expect(mockRepo.updateSiteReport).toHaveBeenCalledWith(
      row.report_id,
      expect.objectContaining({ blocker_category: 'MATERIAL', shift: 'NIGHT' }),
      expect.any(Function),
    );
    expect(mockRepo.replaceManpowerLogs).toHaveBeenCalledWith(row.report_id, STORED_LINES);
  });
});

// ── syncSiteReports — edits emit site.report.updated.v1 ─────────────────────────
//
// A sync edit wrote the row and emitted nothing, so the search index never followed it. Its own event:
// site.report.created.v1 notifies the project manager and site.report.submitted.v1 is counted once per
// report by the analytics worker.

describe('syncSiteReports — edits emit site.report.updated.v1', () => {
  const PROJECT = '11111111-1111-4111-8111-111111111111';
  const DAY = '2026-06-04';
  const row = (overrides: Partial<SiteReportRow> = {}) =>
    makeReport({
      report_id: 'server-report',
      project_id: PROJECT,
      report_date: new Date(`${DAY}T00:00:00.000Z`),
      submitted_by: 'user-uuid-1',
      client_submitted_at: new Date('2026-06-04T10:00:00Z'),
      ...overrides,
    });
  const builderOf = (call = 0) =>
    mockRepo.updateSiteReport.mock.calls[call]![2] as (r: SiteReportRow) => {
      event_type: string;
      payload: Record<string, unknown>;
    };

  beforeEach(() => {
    mockRepo.findReportsByIds.mockResolvedValue(new Map());
    mockRepo.findReportsByNaturalKeys.mockResolvedValue(new Map());
  });

  it('natural-key edit: the event names the updated row', async () => {
    mockRepo.findReportsByNaturalKeys.mockResolvedValueOnce(
      new Map([[`${PROJECT}|${DAY}`, row()]]),
    );
    mockRepo.updateSiteReport.mockResolvedValueOnce(row());

    await service.syncSiteReports({
      items: [
        {
          client_id: 'device-id',
          project_id: PROJECT,
          report_date: DAY,
          client_submitted_at: '2026-06-04T11:00:00Z',
        },
      ],
    } as never);

    const event = builderOf()(row());
    expect(event.event_type).toBe('site.report.updated.v1');
    expect(event.payload).toEqual({
      report_id: 'server-report',
      project_id: PROJECT,
      report_date: DAY,
      submitted_by: 'user-uuid-1',
    });
    expect(mockRepo.createSiteReport).not.toHaveBeenCalled();
  });

  it('id-hit edit: the event names the updated row', async () => {
    const existing = row({ report_id: '99999999-9999-4999-8999-999999999999' });
    mockRepo.findReportsByIds.mockResolvedValueOnce(new Map([[existing.report_id, existing]]));
    mockRepo.updateSiteReport.mockResolvedValueOnce(existing);

    await service.syncSiteReports({
      items: [
        {
          client_id: existing.report_id,
          project_id: PROJECT,
          report_date: DAY,
          client_submitted_at: '2026-06-04T11:00:00Z',
        },
      ],
    } as never);

    const event = builderOf()(existing);
    expect(event.event_type).toBe('site.report.updated.v1');
    expect(event.payload['report_id']).toBe(existing.report_id);
  });

  it('an older save that loses writes nothing, so emits nothing', async () => {
    mockRepo.findReportsByNaturalKeys.mockResolvedValueOnce(
      new Map([[`${PROJECT}|${DAY}`, row()]]),
    );

    await service.syncSiteReports({
      items: [
        {
          client_id: 'device-id',
          project_id: PROJECT,
          report_date: DAY,
          client_submitted_at: '2026-06-04T09:00:00Z',
        },
      ],
    } as never);

    expect(mockRepo.updateSiteReport).not.toHaveBeenCalled();
  });
});
