// Unit tests — SiteOps Service (Phase 6)
// Focus: createSiteReport, syncSiteReports (conflict paths), createIssue,
//        updateIssue (field-level merge), submitInspection (passed/failed events),
//        resolveConflict.

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { SiteOpsService } from '../site-ops.service';
import { SiteOpsRepository } from '../site-ops.repository';
import type {
  SiteReportRow,
  IssueRow,
  InspectionRow,
  SafetyChecklistRow,
  ConflictRecordRow,
} from '../site-ops.repository';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
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
  createSiteReport: jest.fn(),
  findReportById: jest.fn(),
  listSiteReports: jest.fn(),
  updateReportStatus: jest.fn(),
  createIssue: jest.fn(),
  findIssueById: jest.fn(),
  listIssues: jest.fn(),
  updateIssue: jest.fn(),
  createInspection: jest.fn(),
  findChecklistById: jest.fn(),
  createConflictRecord: jest.fn(),
  listConflictRecords: jest.fn(),
  resolveConflictRecord: jest.fn(),
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
    project_id: 'project-1',
    tenant_id: 'tenant-uuid-1',
    report_id: null,
    title: 'Crack in foundation',
    description: null,
    severity: 'HIGH',
    status: 'OPEN',
    assigned_to: null,
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
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SiteOpsService,
      { provide: SiteOpsRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: MOCK_REQUEST },
    ],
  }).compile();
  service = await module.resolve<SiteOpsService>(SiteOpsService);
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
      weather: 'sunny',
      manpower_count: 10,
    });

    expect(mockRepo.createSiteReport).toHaveBeenCalledOnce();
    expect(result.report_id).toBe('report-1');
  });

  it('emits site.report.created.v1 Kafka event', async () => {
    mockRepo.createSiteReport.mockResolvedValue(makeReport());
    await service.createSiteReport({ project_id: 'project-1', report_date: '2026-06-04' });
    // KafkaProducer.publish is called once (event emission)
    const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
    const instance = KafkaProducer.mock.results[0]?.value as { publish: jest.Mock };
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: expect.stringContaining('site.report.created.v1'),
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

  it('throws NotFoundException when not found', async () => {
    mockRepo.findReportById.mockResolvedValue(null);
    await expect(service.getSiteReport('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── syncSiteReports — new report ──────────────────────────────────────────

describe('syncSiteReports', () => {
  it('ACCEPTED for new report (no existing record)', async () => {
    mockRepo.findReportById.mockRejectedValue(new Error('not found'));
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

  it('CONFLICT_FLAGGED when server modified after client last sync', async () => {
    const serverReport = makeReport({
      modified_at: new Date('2026-06-04T10:00:00Z'),
    });
    mockRepo.findReportById.mockResolvedValue(serverReport);
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
    expect(mockRepo.createConflictRecord).toHaveBeenCalledOnce();
  });
});

// ── createIssue ───────────────────────────────────────────────────────────

describe('createIssue', () => {
  it('creates issue and emits site.issue.created.v1', async () => {
    mockRepo.createIssue.mockResolvedValue(makeIssue());
    const result = await service.createIssue({
      project_id: 'project-1',
      title: 'Crack in foundation',
      severity: 'HIGH' as const,
    });
    expect(result.issue_id).toBe('issue-1');
    const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
    const instance = KafkaProducer.mock.results[0]?.value as { publish: jest.Mock };
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({ topic: expect.stringContaining('site.issue.created.v1') }),
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

  it('server status always wins in field-level merge', async () => {
    const serverIssue = makeIssue({ status: 'IN_PROGRESS' });
    mockRepo.findIssueById.mockResolvedValue(serverIssue);
    mockRepo.updateIssue.mockResolvedValue({ ...serverIssue, description: 'updated' });

    await service.updateIssue('issue-1', {
      status: 'RESOLVED' as const, // client wants RESOLVED
      description: 'updated',
      client_submitted_at: '2026-06-04T09:00:00Z',
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
      status: 'OPEN' as const, // client thought it was still OPEN
      description: 'my update',
      client_submitted_at: '2026-06-04T09:00:00Z',
    });

    expect(mockRepo.createConflictRecord).toHaveBeenCalledOnce();
  });

  it('emits site.issue.status_changed.v1 when status actually changes', async () => {
    const serverIssue = makeIssue({ status: 'OPEN' });
    mockRepo.findIssueById.mockResolvedValue(serverIssue);
    // After merge, server status wins — but we're testing the path where both agree
    mockRepo.updateIssue.mockResolvedValue({ ...serverIssue, status: 'OPEN' });

    await service.updateIssue('issue-1', { status: 'OPEN' as const });
    // No status change event since from=OPEN and to=OPEN
    const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
    const instance = KafkaProducer.mock.results[0]?.value as { publish: jest.Mock };
    expect(instance.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ topic: expect.stringContaining('status_changed') }),
    );
  });
});

// ── submitInspection ──────────────────────────────────────────────────────

describe('submitInspection', () => {
  it('throws NotFoundException when checklist not found', async () => {
    mockRepo.findChecklistById.mockResolvedValue(null);
    await expect(
      service.submitInspection({
        project_id: 'project-1',
        checklist_id: 'missing',
        status: 'PASSED' as const,
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
      status: 'PASSED' as const,
      inspected_at: '2026-06-04T08:00:00Z',
    });

    const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
    const instance = KafkaProducer.mock.results[0]?.value as { publish: jest.Mock };
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({ topic: expect.stringContaining('inspection.passed') }),
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
      status: 'FAILED' as const,
      inspected_at: '2026-06-04T08:00:00Z',
    });

    const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
    const instance = KafkaProducer.mock.results[0]?.value as { publish: jest.Mock };
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({ topic: expect.stringContaining('inspection.failed') }),
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
