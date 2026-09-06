// Unit tests — Tasks Controller (Phase 6)
import { TasksController } from '../tasks.controller';

const mockSvc = {
  listTasks: jest.fn(),
  createTask: jest.fn(),
  updateTask: jest.fn(),
  getProjectProgress: jest.fn(),
  getPortfolioTaskSummary: jest.fn(),
  getPortfolioCriticalPath: jest.fn(),
  getCriticalPath: jest.fn(),
  listDependencies: jest.fn(),
  addDependency: jest.fn(),
  removeDependency: jest.fn(),
};

describe('TasksController', () => {
  let ctrl: TasksController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new TasksController(mockSvc as never);
  });

  it('listTasks parses params and delegates', () => {
    ctrl.listTasks('proj-1', 'user-1', 'IN_PROGRESS', '2', '50');
    expect(mockSvc.listTasks).toHaveBeenCalledWith({
      project_id: 'proj-1',
      assigned_to: 'user-1',
      status: 'IN_PROGRESS',
      page: 2,
      limit: 50,
    });
  });

  it('listTasks applies defaults on omitted params', () => {
    ctrl.listTasks('proj-1');
    expect(mockSvc.listTasks).toHaveBeenCalledWith({
      project_id: 'proj-1',
      assigned_to: undefined,
      status: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('listTasks falls back to defaults on non-numeric page/limit', () => {
    ctrl.listTasks('proj-1', undefined, undefined, 'x', 'y');
    expect(mockSvc.listTasks).toHaveBeenCalledWith({
      project_id: 'proj-1',
      assigned_to: undefined,
      status: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('createTask delegates to svc.createTask', () => {
    const dto = { task_name: 'Pour slab' };
    ctrl.createTask('proj-1', dto as never);
    expect(mockSvc.createTask).toHaveBeenCalledWith('proj-1', dto);
  });

  it('updateTask delegates to svc.updateTask', () => {
    const dto = { status: 'COMPLETED' };
    ctrl.updateTask('task-1', dto as never);
    expect(mockSvc.updateTask).toHaveBeenCalledWith('task-1', dto);
  });

  it('getProjectProgress delegates to svc.getProjectProgress', () => {
    const progress = { percentComplete: 45, plannedPercent: 50, spi: 0.9, status: 'behind' };
    mockSvc.getProjectProgress.mockReturnValue(progress);

    expect(ctrl.getProjectProgress('proj-1')).toBe(progress);
    expect(mockSvc.getProjectProgress).toHaveBeenCalledWith('proj-1');
  });

  // ── Schedule network (ADR-097) ──────────────────────────────────────────────

  it('portfolioTaskSummary takes no parameter — it spans the tenant, not a project', () => {
    const counts = { overdue_count: 4, due_this_week_count: 9, blocked_count: 2 };
    mockSvc.getPortfolioTaskSummary.mockReturnValue(counts);

    expect(ctrl.portfolioTaskSummary()).toBe(counts);
    expect(mockSvc.getPortfolioTaskSummary).toHaveBeenCalledWith();
  });

  it('portfolioCriticalPath takes no parameter either — it spans the tenant', () => {
    // The reason the route exists: the EXECUTIVE Tasks screen asked ONE project for its critical
    // path while its heading named that project, which read as a portfolio list of one project's
    // work. A parameter here would put that back.
    const path = {
      tasks: [],
      project_count: 3,
      working_day_calendar: false,
      excluded_task_count: 0,
    };
    mockSvc.getPortfolioCriticalPath.mockReturnValue(path);

    expect(ctrl.portfolioCriticalPath()).toBe(path);
    expect(mockSvc.getPortfolioCriticalPath).toHaveBeenCalledWith();
  });

  it('getCriticalPath delegates to svc.getCriticalPath', () => {
    const path = { project_id: 'proj-1', critical_task_ids: ['task-1'] };
    mockSvc.getCriticalPath.mockReturnValue(path);

    expect(ctrl.getCriticalPath('proj-1')).toBe(path);
    expect(mockSvc.getCriticalPath).toHaveBeenCalledWith('proj-1');
  });

  it('listDependencies delegates to svc.listDependencies', () => {
    const edges = [{ dependency_id: 'dep-1' }];
    mockSvc.listDependencies.mockReturnValue(edges);

    expect(ctrl.listDependencies('proj-1')).toBe(edges);
    expect(mockSvc.listDependencies).toHaveBeenCalledWith('proj-1');
  });

  it('addDependency passes the project and the body through', () => {
    const dto = { predecessor_task_id: 'task-1', successor_task_id: 'task-2' };
    ctrl.addDependency('proj-1', dto as never);
    expect(mockSvc.addDependency).toHaveBeenCalledWith('proj-1', dto);
  });

  it('removeDependency awaits the service and returns nothing (204)', async () => {
    mockSvc.removeDependency.mockResolvedValue(undefined);

    await expect(ctrl.removeDependency('dep-1')).resolves.toBeUndefined();
    expect(mockSvc.removeDependency).toHaveBeenCalledWith('dep-1');
  });
});
