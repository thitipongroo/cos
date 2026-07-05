// Unit tests for FloorsController — delegation (100% line+branch).

import { FloorsController } from '../floors.controller';
import type { FloorsService } from '../floors.service';

const BUILDING_ID = 'bldg-uuid-001';
const FLOOR_ID = 'floor-uuid-001';

function makeService(): jest.Mocked<
  Pick<FloorsService, 'create' | 'list' | 'findById' | 'update' | 'remove'>
> {
  return {
    create: jest.fn().mockResolvedValue({ floor_id: FLOOR_ID }),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue({ floor_id: FLOOR_ID }),
    update: jest.fn().mockResolvedValue({ floor_id: FLOOR_ID }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

describe('FloorsController', () => {
  it('create() delegates', async () => {
    const svc = makeService();
    await new FloorsController(svc as never).create(BUILDING_ID, { floor_number: 5 });
    expect(svc.create).toHaveBeenCalledWith(BUILDING_ID, { floor_number: 5 });
  });
  it('list() delegates', async () => {
    const svc = makeService();
    await new FloorsController(svc as never).list(BUILDING_ID, { limit: 5 });
    expect(svc.list).toHaveBeenCalledWith(BUILDING_ID, { limit: 5 });
  });
  it('findOne() delegates', async () => {
    const svc = makeService();
    await new FloorsController(svc as never).findOne(FLOOR_ID);
    expect(svc.findById).toHaveBeenCalledWith(FLOOR_ID);
  });
  it('update() delegates', async () => {
    const svc = makeService();
    await new FloorsController(svc as never).update(FLOOR_ID, { floor_number: 9 });
    expect(svc.update).toHaveBeenCalledWith(FLOOR_ID, { floor_number: 9 });
  });
  it('remove() delegates', async () => {
    const svc = makeService();
    await new FloorsController(svc as never).remove(FLOOR_ID);
    expect(svc.remove).toHaveBeenCalledWith(FLOOR_ID);
  });
});
