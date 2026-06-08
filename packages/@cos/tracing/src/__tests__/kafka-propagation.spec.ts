const mockInject = jest.fn((ctx: unknown, carrier: Record<string, unknown>) => {
  carrier['traceparent'] = '00-abcd1234abcd1234abcd1234abcd1234-abcd1234abcd1234-01';
});
const mockExtract = jest.fn().mockReturnValue({ _extracted: true });

jest.mock('@opentelemetry/api', () => ({
  context: { active: jest.fn().mockReturnValue({}) },
  propagation: { inject: mockInject, extract: mockExtract },
}));

import { injectKafkaTraceContext, extractKafkaTraceContext } from '../kafka-propagation';

describe('injectKafkaTraceContext', () => {
  it('returns a new object without mutating the original', () => {
    const original = { 'x-custom': 'value' };
    const result = injectKafkaTraceContext(original);
    expect(result).not.toBe(original);
    expect(result['x-custom']).toBe('value');
  });

  it('injects traceparent into the returned headers', () => {
    const result = injectKafkaTraceContext();
    expect(result['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-\d{2}$/);
  });
});

describe('extractKafkaTraceContext', () => {
  it('calls propagation.extract and returns the resulting context', () => {
    const headers = { traceparent: '00-abcd1234abcd1234abcd1234abcd1234-abcd1234abcd1234-01' };
    const ctx = extractKafkaTraceContext(headers);
    expect(mockExtract).toHaveBeenCalled();
    expect(ctx).toEqual({ _extracted: true });
  });

  it('handles Buffer-valued headers', () => {
    const headers = {
      traceparent: Buffer.from('00-aaaa0000aaaa0000aaaa0000aaaa0000-bbbb0000bbbb0000-01'),
    };
    extractKafkaTraceContext(headers);
    expect(mockExtract).toHaveBeenCalled();
  });
});
