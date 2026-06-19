// Unit tests — Tasks Controller (Phase 6)
import { TasksController } from '../tasks.controller';

const mockSvc = {
  listTasks: jest.fn(),
  createTask: jest.fn(),
  updateTask: jest.fn(),
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
});
