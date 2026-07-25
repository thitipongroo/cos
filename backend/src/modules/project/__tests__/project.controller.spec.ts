// Unit tests for ProjectController — delegates entirely to ProjectService

const mockProjectService = {
  create: jest.fn(),
  list: jest.fn(),
  listMine: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  transition: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
  listMembers: jest.fn(),
  listDocuments: jest.fn(),
};

import { ProjectController } from '../project.controller';

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';

describe('ProjectController', () => {
  let controller: ProjectController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProjectController(mockProjectService as never);
  });

  it('create — delegates to projectService.create', () => {
    const dto = { project_name: 'Test', project_code: 'P001', project_type: 'COMMERCIAL' as never };
    const created = { project_id: PROJECT_ID };
    mockProjectService.create.mockReturnValue(created);
    expect(controller.create(dto)).toBe(created);
    expect(mockProjectService.create).toHaveBeenCalledWith(dto);
  });

  it('list — delegates to projectService.list', () => {
    const dto = { limit: 20 } as never;
    const page = { items: [], nextCursor: null };
    mockProjectService.list.mockReturnValue(page);
    expect(controller.list(dto)).toBe(page);
    expect(mockProjectService.list).toHaveBeenCalledWith(dto);
  });

  it('listMine — delegates to projectService.listMine', () => {
    const page = { items: [{ project_id: PROJECT_ID }] };
    mockProjectService.listMine.mockReturnValue(page);
    expect(controller.listMine()).toBe(page);
    expect(mockProjectService.listMine).toHaveBeenCalledWith();
  });

  it('findOne — delegates to projectService.findById', () => {
    const row = { project_id: PROJECT_ID };
    mockProjectService.findById.mockReturnValue(row);
    expect(controller.findOne(PROJECT_ID)).toBe(row);
    expect(mockProjectService.findById).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('update — delegates to projectService.update', () => {
    const dto = { project_name: 'Updated' };
    const updated = { project_id: PROJECT_ID, project_name: 'Updated' };
    mockProjectService.update.mockReturnValue(updated);
    expect(controller.update(PROJECT_ID, dto as never)).toBe(updated);
    expect(mockProjectService.update).toHaveBeenCalledWith(PROJECT_ID, dto);
  });

  it('transition — delegates to projectService.transition', () => {
    const dto = { to: 'ACTIVE', reason: 'Ready' } as never;
    const after = { project_id: PROJECT_ID, status: 'ACTIVE' };
    mockProjectService.transition.mockReturnValue(after);
    expect(controller.transition(PROJECT_ID, dto)).toBe(after);
    expect(mockProjectService.transition).toHaveBeenCalledWith(PROJECT_ID, dto);
  });

  it('addMember — delegates to projectService.addMember', () => {
    const dto = { user_id: USER_ID, role: 'SITE_ENGINEER' } as never;
    mockProjectService.addMember.mockReturnValue(undefined);
    controller.addMember(PROJECT_ID, dto);
    expect(mockProjectService.addMember).toHaveBeenCalledWith(PROJECT_ID, dto);
  });

  it('removeMember — delegates to projectService.removeMember', () => {
    mockProjectService.removeMember.mockReturnValue(undefined);
    controller.removeMember(PROJECT_ID, USER_ID);
    expect(mockProjectService.removeMember).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
  });

  it('listMembers — delegates to projectService.listMembers', () => {
    const members = [{ user_id: USER_ID }];
    mockProjectService.listMembers.mockReturnValue(members);
    expect(controller.listMembers(PROJECT_ID)).toBe(members);
    expect(mockProjectService.listMembers).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('listDocuments — delegates to projectService.listDocuments', () => {
    const docs = [{ document_id: 'd1' }];
    mockProjectService.listDocuments.mockReturnValue(docs);
    expect(controller.listDocuments(PROJECT_ID)).toBe(docs);
    expect(mockProjectService.listDocuments).toHaveBeenCalledWith(PROJECT_ID);
  });
});
