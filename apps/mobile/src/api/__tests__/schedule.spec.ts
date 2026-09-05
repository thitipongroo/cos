// Unit tests — the schedule API client (ADR-097).
//
// The module is two thin `get()` calls, and what a thin wrapper gets wrong is the PATH. Both of
// these are new surfaces the EXECUTIVE Tasks screen depends on, and one of them is deliberately NOT
// per-project — a portfolio roll-up that quietly became `/projects/{id}/…` would still return
// numbers, just the wrong ones, and no screen test would notice.

jest.mock('../client', () => ({ get: jest.fn() }));

import { getCriticalPath, getPortfolioTaskSummary } from '../schedule';
import { get } from '../client';

const mockGet = get as jest.Mock;

describe('schedule API', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks for the portfolio summary at a TENANT-WIDE path, with no project in it', async () => {
    const counts = {
      overdue_count: 12,
      due_this_week_count: 45,
      blocked_count: 8,
      open_count: 90,
      project_count: 5,
    };
    mockGet.mockResolvedValue(counts);

    await expect(getPortfolioTaskSummary()).resolves.toEqual(counts);
    expect(mockGet).toHaveBeenCalledWith('/tasks/portfolio-summary');
  });

  it('asks for the critical path of the project it was given', async () => {
    const path = {
      project_id: 'p-1',
      project_start: '2026-09-01',
      project_finish: '2026-09-20',
      duration_days: 19,
      working_day_calendar: false,
      tasks: [],
      critical_task_ids: [],
      excluded_task_count: 0,
    };
    mockGet.mockResolvedValue(path);

    await expect(getCriticalPath('p-1')).resolves.toEqual(path);
    expect(mockGet).toHaveBeenCalledWith('/projects/p-1/critical-path');
  });

  it('lets a failure through rather than substituting an empty result', async () => {
    // Both callers decide what offline looks like on screen — em dashes, not zeros. A client that
    // swallowed the error and returned `{}` would make that decision for them, invisibly.
    mockGet.mockRejectedValue(new Error('offline'));
    await expect(getPortfolioTaskSummary()).rejects.toThrow('offline');
  });
});
