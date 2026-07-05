// Unit tests for RoomsController — delegation (100% line+branch).

import { RoomsController } from '../rooms.controller';
import type { RoomsService } from '../rooms.service';

const FLOOR_ID = 'floor-uuid-001';
const ROOM_ID = 'room-uuid-001';

function makeService(): jest.Mocked<
  Pick<RoomsService, 'create' | 'list' | 'findById' | 'update' | 'remove'>
> {
  return {
    create: jest.fn().mockResolvedValue({ room_id: ROOM_ID }),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue({ room_id: ROOM_ID }),
    update: jest.fn().mockResolvedValue({ room_id: ROOM_ID }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

describe('RoomsController', () => {
  it('create() delegates', async () => {
    const svc = makeService();
    await new RoomsController(svc as never).create(FLOOR_ID, { room_number: '1' });
    expect(svc.create).toHaveBeenCalledWith(FLOOR_ID, { room_number: '1' });
  });
  it('list() delegates', async () => {
    const svc = makeService();
    await new RoomsController(svc as never).list(FLOOR_ID, { limit: 5 });
    expect(svc.list).toHaveBeenCalledWith(FLOOR_ID, { limit: 5 });
  });
  it('findOne() delegates', async () => {
    const svc = makeService();
    await new RoomsController(svc as never).findOne(ROOM_ID);
    expect(svc.findById).toHaveBeenCalledWith(ROOM_ID);
  });
  it('update() delegates', async () => {
    const svc = makeService();
    await new RoomsController(svc as never).update(ROOM_ID, { room_number: '2' });
    expect(svc.update).toHaveBeenCalledWith(ROOM_ID, { room_number: '2' });
  });
  it('remove() delegates', async () => {
    const svc = makeService();
    await new RoomsController(svc as never).remove(ROOM_ID);
    expect(svc.remove).toHaveBeenCalledWith(ROOM_ID);
  });
});
