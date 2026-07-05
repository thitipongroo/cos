// Unit tests for StructuresController — delegation (100% line+branch).

import { StructuresController } from '../structures.controller';
import type { StructuresService } from '../structures.service';
import { StructureType } from '../dto/create-structure.dto';

const BUILDING_ID = 'bldg-uuid-001';
const STRUCTURE_ID = 'strc-uuid-001';

function makeService(): jest.Mocked<
  Pick<StructuresService, 'create' | 'list' | 'findById' | 'update' | 'remove'>
> {
  return {
    create: jest.fn().mockResolvedValue({ structure_id: STRUCTURE_ID }),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue({ structure_id: STRUCTURE_ID }),
    update: jest.fn().mockResolvedValue({ structure_id: STRUCTURE_ID }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

describe('StructuresController', () => {
  it('create() delegates', async () => {
    const svc = makeService();
    await new StructuresController(svc as never).create(BUILDING_ID, {
      structure_type: StructureType.COLUMN,
    });
    expect(svc.create).toHaveBeenCalledWith(BUILDING_ID, { structure_type: 'column' });
  });
  it('list() delegates', async () => {
    const svc = makeService();
    await new StructuresController(svc as never).list(BUILDING_ID, { limit: 5 });
    expect(svc.list).toHaveBeenCalledWith(BUILDING_ID, { limit: 5 });
  });
  it('findOne() delegates', async () => {
    const svc = makeService();
    await new StructuresController(svc as never).findOne(STRUCTURE_ID);
    expect(svc.findById).toHaveBeenCalledWith(STRUCTURE_ID);
  });
  it('update() delegates', async () => {
    const svc = makeService();
    await new StructuresController(svc as never).update(STRUCTURE_ID, { material_type: 'Steel' });
    expect(svc.update).toHaveBeenCalledWith(STRUCTURE_ID, { material_type: 'Steel' });
  });
  it('remove() delegates', async () => {
    const svc = makeService();
    await new StructuresController(svc as never).remove(STRUCTURE_ID);
    expect(svc.remove).toHaveBeenCalledWith(STRUCTURE_ID);
  });
});
