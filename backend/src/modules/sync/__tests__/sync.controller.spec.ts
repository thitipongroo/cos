import { SyncController } from '../sync.controller';
import { PushItemDto } from '../dto/sync.dto';

function ctrl() {
  const service = {
    delta: jest.fn().mockResolvedValue({ updated: [], deleted: [], server_timestamp: 't' }),
    push: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }),
  };
  return { controller: new SyncController(service as never), service };
}

const dto: PushItemDto = { entity_type: 'task', entity_id: 'e1', operation: 'UPDATE', payload: {} };

describe('SyncController', () => {
  it('delta parses bracketed entity_types[] array', async () => {
    const { controller, service } = ctrl();
    await controller.delta({ since: '2026-01-01T00:00:00Z', 'entity_types[]': ['task', 'issue'] });
    expect(service.delta).toHaveBeenCalledWith('2026-01-01T00:00:00Z', ['task', 'issue']);
  });

  it('delta parses a single entity_types value and defaults `since`', async () => {
    const { controller, service } = ctrl();
    await controller.delta({ entity_types: 'task' });
    expect(service.delta).toHaveBeenCalledWith(expect.any(String), ['task']);
  });

  it('delta returns empty types when none provided', async () => {
    const { controller, service } = ctrl();
    await controller.delta({ since: 's' });
    expect(service.delta).toHaveBeenCalledWith('s', []);
  });

  it('push delegates to the service', async () => {
    const { controller, service } = ctrl();
    await controller.push(dto);
    expect(service.push).toHaveBeenCalledWith(dto);
  });

  it('resolve delegates to the service push path', async () => {
    const { controller, service } = ctrl();
    await controller.resolve(dto);
    expect(service.push).toHaveBeenCalledWith(dto);
  });
});
