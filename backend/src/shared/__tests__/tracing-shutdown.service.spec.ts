// Unit tests for TracingShutdownService — closes the OTel SDK on graceful shutdown.

const mockShutdownTracing = jest.fn().mockResolvedValue(undefined);
jest.mock('@cos/tracing', () => ({
  shutdownTracing: () => mockShutdownTracing(),
}));

import { TracingShutdownService } from '../tracing-shutdown.service';

describe('TracingShutdownService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls shutdownTracing on application shutdown', async () => {
    const service = new TracingShutdownService();
    await service.onApplicationShutdown();
    expect(mockShutdownTracing).toHaveBeenCalledTimes(1);
  });
});
