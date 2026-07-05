// Unit tests for UnitsController — delegation (100% line+branch).

import { UnitsController } from '../units.controller';
import type { UnitsService } from '../units.service';

const BUILDING_ID = 'bldg-uuid-001';
const UNIT_ID = 'unit-uuid-001';

function makeService(): jest.Mocked<
  Pick<UnitsService, 'create' | 'list' | 'findById' | 'update' | 'remove'>
> {
  return {
    create: jest.fn().mockResolvedValue({ unit_id: UNIT_ID }),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue({ unit_id: UNIT_ID }),
    update: jest.fn().mockResolvedValue({ unit_id: UNIT_ID }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

describe('UnitsController', () => {
  it('create() delegates', async () => {
    const svc = makeService();
    await new UnitsController(svc as never).create(BUILDING_ID, { unit_number: 'A-1' });
    expect(svc.create).toHaveBeenCalledWith(BUILDING_ID, { unit_number: 'A-1' });
  });
  it('list() delegates', async () => {
    const svc = makeService();
    await new UnitsController(svc as never).list(BUILDING_ID, { limit: 5 });
    expect(svc.list).toHaveBeenCalledWith(BUILDING_ID, { limit: 5 });
  });
  it('findOne() delegates', async () => {
    const svc = makeService();
    await new UnitsController(svc as never).findOne(UNIT_ID);
    expect(svc.findById).toHaveBeenCalledWith(UNIT_ID);
  });
  it('update() delegates', async () => {
    const svc = makeService();
    await new UnitsController(svc as never).update(UNIT_ID, { status: 'SOLD' });
    expect(svc.update).toHaveBeenCalledWith(UNIT_ID, { status: 'SOLD' });
  });
  it('remove() delegates', async () => {
    const svc = makeService();
    await new UnitsController(svc as never).remove(UNIT_ID);
    expect(svc.remove).toHaveBeenCalledWith(UNIT_ID);
  });
});
