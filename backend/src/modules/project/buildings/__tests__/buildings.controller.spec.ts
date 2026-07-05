// Unit tests for BuildingsController — delegation to the service (100% line+branch).

import { BuildingsController } from '../buildings.controller';
import type { BuildingsService } from '../buildings.service';

const PROJECT_ID = 'proj-uuid-001';
const BUILDING_ID = 'bldg-uuid-001';

function makeService(): jest.Mocked<
  Pick<BuildingsService, 'create' | 'list' | 'findById' | 'update' | 'remove'>
> {
  return {
    create: jest.fn().mockResolvedValue({ building_id: BUILDING_ID }),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue({ building_id: BUILDING_ID }),
    update: jest.fn().mockResolvedValue({ building_id: BUILDING_ID }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

describe('BuildingsController', () => {
  it('create() delegates to service.create with the projectId + dto', async () => {
    const svc = makeService();
    const ctrl = new BuildingsController(svc as never);
    await ctrl.create(PROJECT_ID, { building_name: 'Tower A' });
    expect(svc.create).toHaveBeenCalledWith(PROJECT_ID, { building_name: 'Tower A' });
  });

  it('list() delegates to service.list', async () => {
    const svc = makeService();
    const ctrl = new BuildingsController(svc as never);
    await ctrl.list(PROJECT_ID, { limit: 5 });
    expect(svc.list).toHaveBeenCalledWith(PROJECT_ID, { limit: 5 });
  });

  it('findOne() delegates to service.findById', async () => {
    const svc = makeService();
    const ctrl = new BuildingsController(svc as never);
    await ctrl.findOne(BUILDING_ID);
    expect(svc.findById).toHaveBeenCalledWith(BUILDING_ID);
  });

  it('update() delegates to service.update', async () => {
    const svc = makeService();
    const ctrl = new BuildingsController(svc as never);
    await ctrl.update(BUILDING_ID, { building_name: 'Renamed' });
    expect(svc.update).toHaveBeenCalledWith(BUILDING_ID, { building_name: 'Renamed' });
  });

  it('remove() delegates to service.remove', async () => {
    const svc = makeService();
    const ctrl = new BuildingsController(svc as never);
    await ctrl.remove(BUILDING_ID);
    expect(svc.remove).toHaveBeenCalledWith(BUILDING_ID);
  });
});
