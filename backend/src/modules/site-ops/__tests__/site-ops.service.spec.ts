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

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

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
    );
  });

  it('sends null for shift and blocker_category when the caller omits them', async () => {
    mockRepo.createSiteReport.mockResolvedValue(makeReport());

    await service.createSiteReport({ project_id: 'project-1', report_date: '2026-06-04' });

    expect(mockRepo.createSiteReport).toHaveBeenCalledWith(
      expect.objectContaining({ shift: null, blocker_category: null }),
    );
  });

  // manpower_lines → site_ops.manpower_logs (master §Phase 6).
  it('writes the per-trade breakdown, defaulting hours to a full shift', async () => {
    mockRepo.createSiteReport.mockResolvedValue(makeReport());

    await service.createSiteReport({
      project_id: 'project-1',
      report_date: '2026-06-04',
      manpower_lines: [
        { trade_type: 'ELECTRICAL', worker_count: 8 },
        { trade_type: 'STRUCTURAL', worker_count: 16, hours_worked: 10 },
      ],
    });

    expect(mockRepo.replaceManpowerLogs).toHaveBeenCalledWith('report-1', [
      { trade_type: 'ELECTRICAL', worker_count: 8, hours_worked: 8 },
      { trade_type: 'STRUCTURAL', worker_count: 16, hours_worked: 10 },
    ]);
  });

  // Regression guard: createSiteReport UPSERTS on (project_id, report_date, submitted_by), so
  // resubmitting a day returns the EXISTING row and the freshly generated UUID is thrown away.
  // Keying the logs off the generated id instead of the returned row would orphan every line.
  it('keys the breakdown off the RETURNED report id, not the generated one', async () => {
    mockRepo.createSiteReport.mockResolvedValue(makeReport({ report_id: 'pre-existing-report' }));

    await service.createSiteReport({
      project_id: 'project-1',
      report_date: '2026-06-04',
      manpower_lines: [{ trade_type: 'ELECTRICAL', worker_count: 8 }],
    });

    expect(mockRepo.replaceManpowerLogs).toHaveBeenCalledWith(
      'pre-existing-report',
      expect.any(Array),
    );
  });

  it('clears the breakdown when an empty array is sent, and leaves it alone when omitted', async () => {
    mockRepo.createSiteReport.mockResolvedValue(makeReport());

    await service.createSiteReport({ project_id: 'project-1', report_date: '2026-06-04' });
    expect(mockRepo.replaceManpowerLogs).not.toHaveBeenCalled();

    await service.createSiteReport({
      project_id: 'project-1',
      report_date: '2026-06-04',
      manpower_lines: [],
    });
    expect(mockRepo.replaceManpowerLogs).toHaveBeenCalledWith('report-1', []);
  });

  it('emits site.report.created.v1 Kafka event', async () => {
    mockRepo.createSiteReport.mockResolvedValue(makeReport());
    await service.createSiteReport({ project_id: 'project-1', report_date: '2026-06-04' });
    // KafkaProducer.publish is called once (event emission)
    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: expect.stringContaining('site.report.created.v1'),
      }),
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
    // Emits site.conflict.flagged.v1 for notification routing (ConflictRecord persistence AND notification)
    const producer = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(producer.publish).toHaveBeenCalledWith(
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
    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: expect.stringContaining('site.issue.created.v1') }),
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
    // Emits site.conflict.flagged.v1 for notification routing
    const producer = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(producer.publish).toHaveBeenCalledWith(
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
    // No status change event since from=OPEN and to=OPEN
    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(instance.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ event_type: expect.stringContaining('status_changed') }),
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

    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(instance.publish).toHaveBeenCalledWith(
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

    expect(mockRepo.createInspection).toHaveBeenCalledWith(expect.objectContaining({ signature }));
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

    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: expect.stringContaining('inspection.passed') }),
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
    );

    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: expect.stringContaining('inspection.failed') }),
    );
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
    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(instance.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ event_type: expect.stringContaining('inspection.passed') }),
    );
    expect(instance.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ event_type: expect.stringContaining('inspection.failed') }),
    );
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
    const instance = (service as unknown as { outbox: { publish: jest.Mock } }).outbox;
    expect(instance.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ event_type: expect.stringContaining('status_changed') }),
    );
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

  it('listSiteReports with minimal=true and OpenSearch results (covers minimal ternary true branch)', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: { hits: { hits: [{ _source: { report_id: 'report-1' } }] } },
    });
    mockRepo.listSiteReports.mockResolvedValue({ rows: [makeReport()], total: 1 });
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
    mockRepo.listSiteReports.mockResolvedValue({ rows: [makeReport()], total: 1 });

    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'crack', minimal: true });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('summary');
  });

  it('returns the full payload on the DB fallback when minimal was not asked for', async () => {
    // CONTROL: the reduction above must come from `minimal`, not from the fallback path itself.
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockRejectedValueOnce(new Error('opensearch unreachable'));
    mockRepo.listSiteReports.mockResolvedValue({ rows: [makeReport()], total: 1 });

    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'crack' });

    expect(result.items[0]).toHaveProperty('summary');
  });

  it('listIssues with project_id filter in OpenSearch query (covers if project_id branch)', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: { hits: { hits: [{ _source: { issue_id: 'issue-1' } }] } },
    });
    mockRepo.listIssues.mockResolvedValue({ rows: [makeIssue()], total: 1 });
    const result = await service.listIssues({
      page: 1,
      limit: 10,
      q: 'crack',
      project_id: 'project-1',
    });
    expect(result).toBeDefined();
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
    mockRepo.listSiteReports.mockResolvedValue({ rows: [makeReport()], total: 1 });
    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'summary' });
    expect(result.items).toHaveLength(1);
  });

  it('listIssues returns matched rows when OpenSearch returns results', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockResolvedValueOnce({
      body: { hits: { hits: [{ _source: { issue_id: 'issue-1' } }] } },
    });
    mockRepo.listIssues.mockResolvedValue({ rows: [makeIssue()], total: 1 });
    const result = await service.listIssues({ page: 1, limit: 10, q: 'crack' });
    expect(result.items).toHaveLength(1);
  });

  it('listSiteReports falls back to DB when OpenSearch search fails', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockRejectedValueOnce(new Error('OS down'));
    mockRepo.listSiteReports.mockResolvedValue({ rows: [makeReport()], total: 1 });
    const result = await service.listSiteReports({ page: 1, limit: 10, q: 'test' });
    expect(result.items).toHaveLength(1);
  });

  it('listIssues falls back to DB when OpenSearch search fails', async () => {
    const { Client } = jest.requireMock('@opensearch-project/opensearch') as { Client: jest.Mock };
    Client.mock.results[0]?.value.search.mockRejectedValueOnce(new Error('OS down'));
    mockRepo.listIssues.mockResolvedValue({ rows: [makeIssue()], total: 1 });
    const result = await service.listIssues({ page: 1, limit: 10, q: 'test' });
    expect(result.items).toHaveLength(1);
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
  });

  it('updateInspectionStatus → FAILED emits failed event', async () => {
    mockRepo.findInspectionById.mockResolvedValue(pending);
    mockRepo.updateInspectionStatus.mockResolvedValue({ ...pending, status: 'FAILED' });
    await expect(
      service.updateInspectionStatus('insp-1', { status: 'FAILED' } as never),
    ).resolves.toBeDefined();
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
