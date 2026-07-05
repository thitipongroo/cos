// Unit tests for AssetsController — delegation (100% line+branch).

import { AssetsController } from '../assets.controller';
import type { AssetsService } from '../assets.service';

const PROJECT_ID = 'proj-uuid-001';
const ASSET_ID = 'asset-uuid-001';

function makeService(): jest.Mocked<
  Pick<AssetsService, 'create' | 'list' | 'findById' | 'update' | 'remove'>
> {
  return {
    create: jest.fn().mockResolvedValue({ asset_id: ASSET_ID }),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue({ asset_id: ASSET_ID }),
    update: jest.fn().mockResolvedValue({ asset_id: ASSET_ID }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AssetsController', () => {
  it('create() delegates', async () => {
    const svc = makeService();
    await new AssetsController(svc as never).create(PROJECT_ID, { asset_type: 'X' });
    expect(svc.create).toHaveBeenCalledWith(PROJECT_ID, { asset_type: 'X' });
  });
  it('list() delegates', async () => {
    const svc = makeService();
    await new AssetsController(svc as never).list(PROJECT_ID, { limit: 5 });
    expect(svc.list).toHaveBeenCalledWith(PROJECT_ID, { limit: 5 });
  });
  it('findOne() delegates', async () => {
    const svc = makeService();
    await new AssetsController(svc as never).findOne(ASSET_ID);
    expect(svc.findById).toHaveBeenCalledWith(ASSET_ID);
  });
  it('update() delegates', async () => {
    const svc = makeService();
    await new AssetsController(svc as never).update(ASSET_ID, { maintenance_status: 'DUE' });
    expect(svc.update).toHaveBeenCalledWith(ASSET_ID, { maintenance_status: 'DUE' });
  });
  it('remove() delegates', async () => {
    const svc = makeService();
    await new AssetsController(svc as never).remove(ASSET_ID);
    expect(svc.remove).toHaveBeenCalledWith(ASSET_ID);
  });
});
