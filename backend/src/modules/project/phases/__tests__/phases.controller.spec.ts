// Unit tests for PhasesController — delegation to the service (100% line+branch).

import { PhasesController } from '../phases.controller';
import type { PhasesService } from '../phases.service';

const PROJECT_ID = 'proj-uuid-001';
const PHASE_ID = 'phase-uuid-001';

function makeService(): jest.Mocked<Pick<PhasesService, 'create' | 'list' | 'update'>> {
  return {
    create: jest.fn().mockResolvedValue({ phase_id: PHASE_ID }),
    list: jest.fn().mockResolvedValue([{ phase_id: PHASE_ID }]),
    update: jest.fn().mockResolvedValue({ phase_id: PHASE_ID }),
  };
}

describe('PhasesController', () => {
  it('create() delegates to service.create with the projectId + dto', async () => {
    const svc = makeService();
    const ctrl = new PhasesController(svc as never);
    await ctrl.create(PROJECT_ID, { seq: 2, name: 'Structure' });
    expect(svc.create).toHaveBeenCalledWith(PROJECT_ID, { seq: 2, name: 'Structure' });
  });

  it('list() delegates to service.list', async () => {
    const svc = makeService();
    const ctrl = new PhasesController(svc as never);
    await ctrl.list(PROJECT_ID);
    expect(svc.list).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('update() delegates to service.update', async () => {
    const svc = makeService();
    const ctrl = new PhasesController(svc as never);
    await ctrl.update(PHASE_ID, { status: 'COMPLETED' as never });
    expect(svc.update).toHaveBeenCalledWith(PHASE_ID, { status: 'COMPLETED' });
  });
});
