// Unit tests for RisksController — delegation to the service (100% line+branch).

import { RisksController } from '../risks.controller';
import type { RisksService } from '../risks.service';

const PROJECT_ID = 'proj-uuid-001';
const RISK_ID = 'risk-uuid-001';

function makeService(): jest.Mocked<
  Pick<RisksService, 'list' | 'create' | 'update' | 'updateStatus'>
> {
  return {
    list: jest.fn().mockResolvedValue([{ risk_id: RISK_ID }]),
    create: jest.fn().mockResolvedValue({ risk_id: RISK_ID }),
    update: jest.fn().mockResolvedValue({ risk_id: RISK_ID }),
    updateStatus: jest.fn().mockResolvedValue({ risk_id: RISK_ID }),
  };
}

describe('RisksController', () => {
  it('list() delegates to service.list with the filters', async () => {
    const svc = makeService();
    const ctrl = new RisksController(svc as never);
    await ctrl.list(PROJECT_ID, { status: 'OPEN' as never });
    expect(svc.list).toHaveBeenCalledWith(PROJECT_ID, { status: 'OPEN' });
  });

  it('create() delegates to service.create with the projectId + dto', async () => {
    const svc = makeService();
    const ctrl = new RisksController(svc as never);
    await ctrl.create(PROJECT_ID, {
      title: 'X',
      category: 'SAFETY' as never,
      likelihood: 3,
      impact: 4,
    });
    expect(svc.create).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ title: 'X' }));
  });

  it('update() delegates to service.update', async () => {
    const svc = makeService();
    const ctrl = new RisksController(svc as never);
    await ctrl.update(RISK_ID, { mitigation: 'm' });
    expect(svc.update).toHaveBeenCalledWith(RISK_ID, { mitigation: 'm' });
  });

  it('updateStatus() delegates to service.updateStatus', async () => {
    const svc = makeService();
    const ctrl = new RisksController(svc as never);
    await ctrl.updateStatus(RISK_ID, { status: 'CLOSED' as never });
    expect(svc.updateStatus).toHaveBeenCalledWith(RISK_ID, { status: 'CLOSED' });
  });
});
