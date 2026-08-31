import { SyncController, SyncExhaustionController } from '../sync.controller';
import { PushItemDto } from '../dto/sync.dto';

function ctrl() {
  const service = {
    delta: jest.fn().mockResolvedValue({ updated: [], deleted: [], server_timestamp: 't' }),
    push: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }),
    reportExhaustion: jest.fn().mockResolvedValue({ item_id: 'item-1' }),
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

  it('exhausted delegates to reportExhaustion, not to push', async () => {
    // §17.2: a report of a mutation the device STOPPED retrying is not another attempt at it.
    // Routing it to push() would re-apply the failing write instead of queueing it for review.
    const { controller, service } = ctrl();
    const report = {
      entity_type: 'safety',
      entity_id: 'e1',
      operation: 'CREATE',
      client_id: 'c1',
      payload: {},
      retry_count: 5,
    };

    await expect(controller.reportExhaustion(report as never)).resolves.toEqual({
      item_id: 'item-1',
    });
    expect(service.reportExhaustion).toHaveBeenCalledWith(report);
    expect(service.push).not.toHaveBeenCalled();
  });
});

// The §17.2 admin review queue. Two routes, both thin — but "thin" is what let the mobile client
// and the server switch drift apart for months, so the delegation is asserted rather than assumed.
describe('SyncExhaustionController', () => {
  function adminCtrl() {
    const service = {
      listExhaustions: jest.fn().mockResolvedValue([]),
      resolveExhaustion: jest.fn().mockResolvedValue({ resolved: true }),
    };
    return { controller: new SyncExhaustionController(service as never), service };
  }

  it('list defaults to PENDING — a resolved row is history, not work', async () => {
    const { controller, service } = adminCtrl();
    await controller.list();
    expect(service.listExhaustions).toHaveBeenCalledWith('PENDING');
  });

  it('list passes RESOLVED through', async () => {
    const { controller, service } = adminCtrl();
    await controller.list('RESOLVED');
    expect(service.listExhaustions).toHaveBeenCalledWith('RESOLVED');
  });

  it('any other status value reads as PENDING, not as an error', async () => {
    // The query string is free text. Anything that is not the one alternative means "the default",
    // which keeps a typo showing the admin their queue instead of an empty list or a 500.
    const { controller, service } = adminCtrl();
    await controller.list('anything-else');
    expect(service.listExhaustions).toHaveBeenCalledWith('PENDING');
  });

  it('resolve passes the id and the body straight through', async () => {
    const { controller, service } = adminCtrl();
    const dto = { resolution: 'IMPORTED', resolution_note: 'entered by hand' };
    await expect(controller.resolveExhaustion('exh-1', dto as never)).resolves.toEqual({
      resolved: true,
    });
    expect(service.resolveExhaustion).toHaveBeenCalledWith('exh-1', dto);
  });
});
