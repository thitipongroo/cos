// LlmGatewayService — the metering + hard-cap guard around provider calls. The provider is a fake here
// (no real OpenAI call); these assert the gateway's own contract: reject at the cap, refuse when no
// provider is wired, and record tokens on success.

import { ServiceUnavailableException } from '@nestjs/common';
import { LlmGatewayService, type LlmProvider } from '../llm-gateway.service';

const mockUsage = {
  isOverHardCap: jest.fn(),
  recordUsage: jest.fn().mockResolvedValue(undefined),
};

function makeGateway(): LlmGatewayService {
  return new LlmGatewayService(mockUsage as never);
}

const req = { model: 'gpt-4o-mini', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('LlmGatewayService.complete', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the tenant is over the hard cap (COST-001) — before any provider call', async () => {
    mockUsage.isOverHardCap.mockResolvedValue(true);
    const gw = makeGateway();
    const provider: LlmProvider = {
      chatCompletion: jest.fn(),
    };
    gw.registerProvider(provider);
    await expect(gw.complete(req)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(provider.chatCompletion).not.toHaveBeenCalled();
    expect(mockUsage.recordUsage).not.toHaveBeenCalled();
  });

  it('throws when no provider is wired (not yet configured)', async () => {
    mockUsage.isOverHardCap.mockResolvedValue(false);
    await expect(makeGateway().complete(req)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('runs the provider and records the reported tokens on success', async () => {
    mockUsage.isOverHardCap.mockResolvedValue(false);
    const gw = makeGateway();
    gw.registerProvider({
      chatCompletion: jest
        .fn()
        .mockResolvedValue({ text: 'ok', usage: { inputTokens: 42, outputTokens: 8 } }),
    });
    const res = await gw.complete(req);
    expect(res.text).toBe('ok');
    expect(mockUsage.recordUsage).toHaveBeenCalledWith('gpt-4o-mini', 42, 8);
  });
});
